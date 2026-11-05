import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase, ls, INITIAL_DEMO_POSTS, PostItem } from './lib/supabase';
import { FeedItem } from './components/FeedItem';
import { TopNav } from './components/TopNav';
import { BottomNav, TabType } from './components/BottomNav';
import { CommentsModal } from './components/CommentsModal';
import { PublishModal } from './components/PublishModal';
import { AccountModal } from './components/AccountModal';
import { MessagesModal } from './components/MessagesModal';
import { ArrowUp, RefreshCw } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

export default function App() {
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(() => ls.get('muted', false));
  const [showSoundHint, setShowSoundHint] = useState<boolean>(false);
  const [followingUsers, setFollowingUsers] = useState<string[]>(() => ls.get('following_users', []));
  const [savedPostIds, setSavedPostIds] = useState<string[]>(() => ls.get('saved_post_ids', []));

  // User Auth State
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string>('');

  // Modals
  const [isCommentsOpen, setIsCommentsOpen] = useState<boolean>(false);
  const [commentPost, setCommentPost] = useState<PostItem | null>(null);

  const [isPublishOpen, setIsPublishOpen] = useState<boolean>(false);
  const [isAccountOpen, setIsAccountOpen] = useState<boolean>(false);
  const [isMessagesOpen, setIsMessagesOpen] = useState<boolean>(false);
  const [activeDMUser, setActiveDMUser] = useState<{ uid: string; name: string } | null>(null);

  // New Posts Pill
  const [newPostsCount, setNewPostsCount] = useState<number>(0);

  // Toast
  const [toastMessage, setToastMessage] = useState<string>('');
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage('');
    }, 2500);
  }, []);

  // Feed scroll ref
  const feedContainerRef = useRef<HTMLDivElement | null>(null);

  // Check Supabase Auth on load
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setUser(data.session.user);
        const uname =
          data.session.user.user_metadata?.username ||
          data.session.user.email?.split('@')[0] ||
          'مستخدم';
        setUsername(uname);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        const uname =
          session.user.user_metadata?.username ||
          session.user.email?.split('@')[0] ||
          'مستخدم';
        setUsername(uname);
      } else {
        setUser(null);
        setUsername('');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Fetch posts from Supabase or fallback to Demos
  const loadPosts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          id,
          user_id,
          username,
          caption,
          video_url,
          created_at,
          comments (id, username, body, created_at),
          likes (user_id)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      const savedSet = new Set(ls.get<string[]>('saved_post_ids', []));

      if (!error && data && data.length > 0) {
        const mapped: PostItem[] = data.map((r: any) => ({
          id: r.id,
          uid: r.user_id,
          user: r.username || 'مستخدم',
          cap: r.caption || '',
          url: r.video_url,
          likes: r.likes?.length || 0,
          liked: user ? !!r.likes?.some((l: any) => l.user_id === user.id) : false,
          saved: savedSet.has(r.id),
          cm: (r.comments || [])
            .sort((a: any, b: any) => (a.created_at < b.created_at ? -1 : 1))
            .map((c: any) => ({
              id: c.id,
              u: c.username || 'مستخدم',
              t: c.body,
            })),
          t: new Date(r.created_at).getTime(),
          fc: 12,
        }));

        const existingIds = new Set(mapped.map((p: PostItem) => p.id));
        const combined = [
          ...mapped,
          ...INITIAL_DEMO_POSTS.filter((p) => !existingIds.has(p.id)).map((p) => ({
            ...p,
            saved: savedSet.has(p.id),
          })),
        ];

        setPosts(combined);
      } else {
        // Fallback to initial demo posts
        const localSaved = ls.get<string[]>('saved_post_ids', []);
        const seeded = INITIAL_DEMO_POSTS.map((p) => ({
          ...p,
          saved: localSaved.includes(p.id),
        }));
        setPosts(seeded);
      }
    } catch {
      setPosts(INITIAL_DEMO_POSTS);
    }
  }, [user]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // Real-time Supabase subscription for new posts, likes, comments
  useEffect(() => {
    const channel = supabase
      .channel('feed-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        (payload) => {
          const newPost = payload.new as any;
          setNewPostsCount((prev) => prev + 1);
          // If at the very top, optionally prepend or show pill
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments' },
        (payload) => {
          const newComment = payload.new as any;
          setPosts((prev) =>
            prev.map((p) => {
              if (p.id === newComment.post_id) {
                if (p.cm.some((c) => c.id === newComment.id)) return p;
                return {
                  ...p,
                  cm: [...p.cm, { id: newComment.id, u: newComment.username, t: newComment.body }],
                };
              }
              return p;
            })
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'likes' },
        (payload) => {
          const newLike = payload.new as any;
          setPosts((prev) =>
            prev.map((p) => {
              if (p.id === newLike.post_id) {
                return { ...p, likes: p.likes + 1 };
              }
              return p;
            })
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'likes' },
        (payload) => {
          const delLike = payload.old as any;
          setPosts((prev) =>
            prev.map((p) => {
              if (p.id === delLike.post_id) {
                return { ...p, likes: Math.max(0, p.likes - 1) };
              }
              return p;
            })
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Filter posts based on activeTab and searchQuery
  const filteredPosts = useMemo(() => {
    let result = [...posts];

    // Tab filter
    if (activeTab === 'fol') {
      result = result.filter(
        (p) => followingUsers.includes(p.user) || (user && p.uid === user.id) || p.user === 'أنت'
      );
    } else if (activeTab === 'sav') {
      result = result.filter((p) => savedPostIds.includes(p.id) || p.saved);
    }

    // Search query filter
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (p) =>
          p.cap.toLowerCase().includes(q) ||
          p.user.toLowerCase().includes(q) ||
          (p.user && `@${p.user.toLowerCase()}`.includes(q))
      );
    }

    return result;
  }, [posts, activeTab, followingUsers, savedPostIds, searchQuery, user]);

  // Handle active video index on scroll
  const handleScroll = () => {
    const el = feedContainerRef.current;
    if (!el) return;
    const itemHeight = el.clientHeight;
    if (itemHeight <= 0) return;
    const index = Math.round(el.scrollTop / itemHeight);
    if (index !== activeIndex && index >= 0 && index < filteredPosts.length) {
      setActiveIndex(index);
    }
  };

  // Scroll to top
  const scrollToTop = () => {
    feedContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setActiveIndex(0);
    setNewPostsCount(0);
  };

  // Like action
  const handleLike = async (post: PostItem) => {
    const isNowLiked = !post.liked;
    const newLikesCount = isNowLiked ? post.likes + 1 : Math.max(0, post.likes - 1);

    setPosts((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, liked: isNowLiked, likes: newLikesCount } : p))
    );

    if (user) {
      try {
        if (isNowLiked) {
          await supabase.from('likes').insert({ post_id: post.id, user_id: user.id });
        } else {
          await supabase.from('likes').delete().match({ post_id: post.id, user_id: user.id });
        }
      } catch {
        // silently fallback
      }
    }
  };

  // Bookmark / Save action
  const handleBookmark = async (post: PostItem) => {
    const isSaved = !post.saved;
    let updatedSaved = [...savedPostIds];

    if (isSaved) {
      if (!updatedSaved.includes(post.id)) updatedSaved.push(post.id);
      showToast('تمت الإضافة إلى المحفوظات 🔖');
    } else {
      updatedSaved = updatedSaved.filter((id) => id !== post.id);
      showToast('أُزيل من المحفوظات');
    }

    setSavedPostIds(updatedSaved);
    ls.set('saved_post_ids', updatedSaved);

    setPosts((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, saved: isSaved } : p))
    );
  };

  // Follow / Unfollow toggle
  const handleFollowToggle = async (post: PostItem) => {
    const targetUser = post.user;
    const isCurrentlyFollowing = followingUsers.includes(targetUser) || post.isFol;
    let updated: string[];

    if (isCurrentlyFollowing) {
      updated = followingUsers.filter((u) => u !== targetUser);
      showToast(`ألغيت متابعة @${targetUser}`);
    } else {
      updated = [...followingUsers, targetUser];
      showToast(`بدأت بمتابعة @${targetUser}`);
    }

    setFollowingUsers(updated);
    ls.set('following_users', updated);

    setPosts((prev) =>
      prev.map((p) => (p.user === targetUser ? { ...p, isFol: !isCurrentlyFollowing } : p))
    );

    if (user && post.uid) {
      try {
        if (isCurrentlyFollowing) {
          await supabase.from('follows').delete().match({ follower_id: user.id, followed_id: post.uid });
        } else {
          await supabase.from('follows').insert({ follower_id: user.id, followed_id: post.uid });
        }
      } catch {
        // fallback
      }
    }
  };

  // Comments
  const handleOpenComments = (post: PostItem) => {
    setCommentPost(post);
    setIsCommentsOpen(true);
  };

  const handleAddComment = async (postId: string, text: string) => {
    const authorName = username || 'أنت';
    const newCommentItem = {
      id: 'c-' + Date.now(),
      u: authorName,
      t: text,
    };

    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, cm: [...p.cm, newCommentItem] } : p))
    );

    if (commentPost && commentPost.id === postId) {
      setCommentPost((prev) => (prev ? { ...prev, cm: [...prev.cm, newCommentItem] } : null));
    }

    if (user) {
      try {
        await supabase.from('comments').insert({
          post_id: postId,
          user_id: user.id,
          username: authorName,
          body: text,
        });
      } catch {
        // fallback
      }
    }
    showToast('تمت إضافة تعليقك');
  };

  // Open Direct Message
  const handleOpenDM = (uid: string, targetName: string) => {
    setActiveDMUser({ uid, name: targetName });
    setIsMessagesOpen(true);
  };

  // Share
  const handleShare = async (post: PostItem) => {
    const shareUrl = post.url || window.location.href;
    const shareData = {
      title: 'بحرك - مقطع فيديو رائع',
      text: post.cap,
      url: shareUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // ignore share cancellation
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('تم نسخ الرابط للحافظة 📋');
      } catch {
        showToast('تعذّر نسخ الرابط');
      }
    }
  };

  // Hashtag click
  const handleHashtagClick = (tag: string) => {
    setSearchQuery(tag);
    showToast(`تصفية حسب: ${tag}`);
    feedContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Sound Mute Toggle
  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    ls.set('muted', next);
    setShowSoundHint(false);
    showToast(next ? 'تم كتم الصوت 🔇' : 'تم تشغيل الصوت 🔊');
  };

  // New Post published
  const handlePostPublished = (newPost: PostItem) => {
    setPosts((prev) => [newPost, ...prev]);
    setActiveTab('all');
    setSearchQuery('');
    scrollToTop();
  };

  return (
    <div className="fixed inset-0 w-full h-full bg-[#04202b] text-[#e8f6f3] flex flex-col overflow-hidden select-none font-['Readex_Pro',sans-serif]">
      {/* Top Header */}
      <TopNav
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isMuted={isMuted}
        onToggleMute={toggleMute}
        showSoundHint={showSoundHint}
        onDismissSoundHint={() => setShowSoundHint(false)}
        onOpenCamera={() => {
          if (!user) {
            setIsAccountOpen(true);
            showToast('سجّل الدخول أولاً لتتمكن من تصوير فيديو بالكاميرا');
          } else {
            setIsPublishOpen(true);
          }
        }}
        onToast={showToast}
      />

      {/* Floating New Posts Pill */}
      {newPostsCount > 0 && (
        <button
          type="button"
          onClick={scrollToTop}
          className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-[#ff6b5b] hover:bg-[#ff5542] text-white font-bold text-xs px-4 py-2 rounded-full shadow-2xl flex items-center gap-1.5 transition-all animate-bounce cursor-pointer border border-white/20"
        >
          <ArrowUp className="w-3.5 h-3.5" />
          <span>
            {newPostsCount === 1 ? 'مقطع جديد وصل!' : `${newPostsCount} مقاطع جديدة`}
          </span>
        </button>
      )}

      {/* Main Snap Feed Area */}
      <main
        ref={feedContainerRef}
        onScroll={handleScroll}
        className="flex-1 w-full h-full overflow-y-auto feed-container"
      >
        {filteredPosts.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center text-[#e8f6f3]/70 space-y-4">
            <div className="w-16 h-16 rounded-full bg-[#0b4a5a] border border-[#f2c879]/30 flex items-center justify-center text-[#f2c879]">
              <RefreshCw className="w-8 h-8" />
            </div>
            <p className="text-base font-semibold leading-relaxed max-w-xs">
              {searchQuery
                ? `لا توجد نتائج بحث عن "${searchQuery}". جرّب كلمة أو وسماً آخر.`
                : activeTab === 'fol'
                ? 'لا توجد مقاطع من الحسابات التي تتابعها بعد. تابع بعض صناع المحتوى من تبويب «لك»!'
                : activeTab === 'sav'
                ? 'لم تحفظ أي مقطع بعد. اضغط على أيقونة الإشارة المرجعية لحفظ مقاطعك المفضلة!'
                : 'لا توجد مقاطع في هذه القائمة بعد. كن أول من ينشر!'}
            </p>
            {activeTab !== 'all' || searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('all');
                  setSearchQuery('');
                }}
                className="bg-[#f2c879] text-[#04202b] font-bold px-5 py-2.5 rounded-full text-sm hover:bg-[#e0b86a] transition-all cursor-pointer shadow-md"
              >
                العودة لكل المقاطع
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsPublishOpen(true)}
                className="bg-[#ff6b5b] text-white font-bold px-5 py-2.5 rounded-full text-sm hover:bg-[#ff5542] transition-all cursor-pointer shadow-md"
              >
                انشر أول فيديو
              </button>
            )}
          </div>
        ) : (
          filteredPosts.map((post, idx) => (
            <div key={post.id} className="w-full h-full">
              <FeedItem
                post={post}
                isActive={idx === activeIndex}
                isMuted={isMuted}
                onLike={handleLike}
                onBookmark={handleBookmark}
                onOpenComments={handleOpenComments}
                onOpenDM={handleOpenDM}
                onFollowToggle={handleFollowToggle}
                onHashtagClick={handleHashtagClick}
                onShare={handleShare}
                currentUserId={user?.id}
                isFollowing={followingUsers.includes(post.user) || post.isFol}
              />
            </div>
          ))
        )}
      </main>

      {/* Bottom Navigation */}
      <BottomNav
        currentTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setSearchQuery('');
          scrollToTop();
        }}
        onOpenPublish={() => {
          if (!user) {
            setIsAccountOpen(true);
            showToast('سجّل الدخول أولاً لتتمكن من نشر فيديو');
          } else {
            setIsPublishOpen(true);
          }
        }}
        onOpenMessages={() => setIsMessagesOpen(true)}
        onOpenAccount={() => setIsAccountOpen(true)}
        unreadCount={0}
      />

      {/* Comments Sheet Modal */}
      <CommentsModal
        isOpen={isCommentsOpen}
        onClose={() => setIsCommentsOpen(false)}
        post={commentPost}
        onAddComment={handleAddComment}
        currentUser={username || 'أنت'}
      />

      {/* Publish Video Sheet Modal */}
      <PublishModal
        isOpen={isPublishOpen}
        onClose={() => setIsPublishOpen(false)}
        user={user}
        username={username}
        onPostPublished={handlePostPublished}
        onRequireAuth={() => {
          setIsPublishOpen(false);
          setIsAccountOpen(true);
          showToast('يرجى تسجيل الدخول أو إنشاء حساب للنشر');
        }}
        onToast={showToast}
      />

      {/* Account / Profile Sheet Modal */}
      <AccountModal
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
        user={user}
        username={username}
        onUserChange={(newUser, newUsername) => {
          setUser(newUser);
          setUsername(newUsername);
          loadPosts();
        }}
        onToast={showToast}
        userPosts={posts.filter((p) => (user && p.uid ? p.uid === user.id : p.user === username || p.user === 'أنت'))}
      />

      {/* Messages / DMs Sheet Modal */}
      <MessagesModal
        isOpen={isMessagesOpen}
        onClose={() => {
          setIsMessagesOpen(false);
          setActiveDMUser(null);
        }}
        user={user}
        username={username}
        onRequireAuth={() => {
          setIsMessagesOpen(false);
          setIsAccountOpen(true);
          showToast('سجّل الدخول لاستخدام الرسائل');
        }}
        onToast={showToast}
        activeThreadUser={activeDMUser}
        onCloseThread={() => setActiveDMUser(null)}
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[#f2c879] text-[#04202b] font-bold text-xs md:text-sm px-5 py-2.5 rounded-full shadow-2xl transition-all animate-bounce border border-white/20 select-none pointer-events-none">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
