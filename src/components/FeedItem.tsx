import React, { useRef, useState, useEffect } from 'react';
import { Heart, MessageCircle, Bookmark, Share2, Sparkles } from 'lucide-react';
import type { PostItem } from '../lib/supabase';

interface FeedItemProps {
  post: PostItem;
  isActive: boolean;
  isMuted: boolean;
  onLike: (post: PostItem) => void;
  onBookmark: (post: PostItem) => void;
  onOpenComments: (post: PostItem) => void;
  onOpenDM: (uid: string, username: string) => void;
  onFollowToggle: (post: PostItem) => void;
  onHashtagClick: (tag: string) => void;
  onShare: (post: PostItem) => void;
  currentUserId?: string;
  isFollowing?: boolean;
}

// Global cache for resolved TikTok direct MP4 streams
const globalResolvedCache = new Map<string, string>();

export const FeedItem: React.FC<FeedItemProps> = ({
  post,
  isActive,
  isMuted,
  onLike,
  onBookmark,
  onOpenComments,
  onOpenDM,
  onFollowToggle,
  onHashtagClick,
  onShare,
  currentUserId,
  isFollowing,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [showHeartPop, setShowHeartPop] = useState<boolean>(false);
  const [resolvedMp4Url, setResolvedMp4Url] = useState<string>(() => {
    if (post.url && globalResolvedCache.has(post.url)) {
      return globalResolvedCache.get(post.url)!;
    }
    // If post.url is already a direct stream or MP4
    if (post.url && (post.url.includes('/api/tiktok/stream') || post.url.endsWith('.mp4') || post.url.includes('/videos/'))) {
      return post.url;
    }
    return '';
  });
  const [isLoadingStream, setIsLoadingStream] = useState<boolean>(false);
  const lastTapRef = useRef<number>(0);

  const isTikTokUrl = post.url && /tiktok\.com/i.test(post.url) && !post.url.includes('/api/tiktok/stream');

  // Resolve TikTok direct MP4 stream on demand
  useEffect(() => {
    if (!isTikTokUrl || resolvedMp4Url || !post.url) return;

    if (globalResolvedCache.has(post.url)) {
      setResolvedMp4Url(globalResolvedCache.get(post.url)!);
      return;
    }

    let isMounted = true;
    setIsLoadingStream(true);

    fetch(`/api/tiktok/resolve?url=${encodeURIComponent(post.url)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!isMounted) return;
        if (data && data.direct_mp4) {
          globalResolvedCache.set(post.url!, data.direct_mp4);
          setResolvedMp4Url(data.direct_mp4);
        }
      })
      .catch(() => {
        // fallback
      })
      .finally(() => {
        if (isMounted) setIsLoadingStream(false);
      });

    return () => {
      isMounted = false;
    };
  }, [post.url, isTikTokUrl, resolvedMp4Url]);

  // Determine actual video source (Direct MP4, Blob, or resolved stream)
  const videoSrc = resolvedMp4Url || (post.blob ? URL.createObjectURL(post.blob) : post.url || '');
  const hasVideo = !!videoSrc && (!isTikTokUrl || !!resolvedMp4Url);

  // Video Autoplay/Pause based on scroll visibility
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    if (isActive) {
      v.muted = isMuted;
      const playPromise = v.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch(() => {
            // Browser prevented unmuted playback, mute and retry
            v.muted = true;
            v.play()
              .then(() => setIsPlaying(true))
              .catch(() => setIsPlaying(false));
          });
      }
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }, [isActive, isMuted, videoSrc]);

  // Sync mute state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const handleContainerClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, a')) return;

    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double tap -> Heart
      if (!post.liked) {
        onLike(post);
      }
      setShowHeartPop(true);
      setTimeout(() => setShowHeartPop(false), 700);
    } else {
      // Single tap -> Toggle Play/Pause natively
      if (videoRef.current) {
        if (videoRef.current.paused) {
          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        } else {
          videoRef.current.pause();
          setIsPlaying(false);
        }
      }
    }
    lastTapRef.current = now;
  };

  const handleTimeUpdate = () => {
    if (!isScrubbing && videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      setDuration(videoRef.current.duration || 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (videoRef.current && duration > 0) {
      videoRef.current.currentTime = val;
    }
  };

  const cyclePlaybackRate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    const rates = [1, 1.25, 1.5, 2];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIdx];
    videoRef.current.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  };

  const formatSeconds = (sec: number) => {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatCount = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'م';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'ألف';
    return n.toString();
  };

  const isMyPost = currentUserId && post.uid ? currentUserId === post.uid : post.user === 'أنت';

  return (
    <section
      onClick={handleContainerClick}
      className="relative w-full h-full feed-item flex items-center justify-center bg-[#04202b] overflow-hidden select-none"
    >
      {/* Native Direct Vertical Video Player */}
      {hasVideo ? (
        <video
          ref={videoRef}
          src={videoSrc}
          loop
          playsInline
          muted={isMuted}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        /* Gradient Ocean Card for Demo / Audio / Loading Post */
        <div
          className={`absolute inset-0 w-full h-full anim-drift g${post.g ?? 0} flex items-center justify-center p-8`}
        >
          {isLoadingStream ? (
            <div className="flex flex-col items-center gap-3 text-white">
              <div className="w-10 h-10 border-4 border-[#f2c879] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-semibold">جارٍ تشغيل الفيديو تلقائياً...</span>
            </div>
          ) : (
            <div className="text-center font-bold text-2xl md:text-3xl leading-relaxed text-[#e8f6f3] drop-shadow-[0_2px_16px_rgba(4,32,43,0.8)] max-w-lg">
              {post.cap.replace(/#\S+/g, '').trim()}
            </div>
          )}
        </div>
      )}

      {/* Pop Heart Animation on Double Click */}
      {showHeartPop && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
          <Heart className="w-28 h-28 text-[#ff6b5b] fill-[#ff6b5b] anim-pop drop-shadow-[0_4px_20px_rgba(255,107,91,0.6)]" />
        </div>
      )}

      {/* Gradient Bottom Shade for readability */}
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-[#04202b]/95 via-[#04202b]/60 to-transparent pointer-events-none z-10" />

      {/* Top Gradient Shade */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#04202b]/80 via-[#04202b]/40 to-transparent pointer-events-none z-10" />

      {/* Left Info Panel (Arabic RTL: Starts at Right) */}
      <div className="absolute bottom-14 right-4 left-20 z-10 text-right pointer-events-auto">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-bold text-lg text-white drop-shadow flex items-center gap-1.5">
            @{post.user}
          </span>

          {post.fc !== undefined && (
            <span className="text-xs text-[#e8f6f3]/80 font-normal bg-[#04202b]/60 px-2 py-0.5 rounded-full border border-white/10">
              {formatCount(post.fc)} متابع
            </span>
          )}

          {!isMyPost && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFollowToggle(post);
                }}
                className={`text-xs font-semibold px-3 py-1 rounded-full border transition-all cursor-pointer ${
                  isFollowing || post.isFol
                    ? 'bg-[#f2c879] text-[#04202b] border-[#f2c879]'
                    : 'bg-transparent text-[#f2c879] border-[#f2c879] hover:bg-[#f2c879]/15'
                }`}
              >
                {isFollowing || post.isFol ? 'تتابعه' : 'تابع'}
              </button>

              {post.uid && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDM(post.uid!, post.user);
                  }}
                  className="text-xs font-medium px-2.5 py-1 rounded-full border border-white/40 text-[#e8f6f3] bg-[#04202b]/50 hover:bg-white/20 transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#f2c879]" />
                  راسل
                </button>
              )}
            </>
          )}
        </div>

        {/* Caption with interactive #hashtags */}
        <p className="mt-2 text-sm md:text-base leading-relaxed text-[#e8f6f3]/95 drop-shadow">
          {post.cap.split(/(#[\p{L}\p{N}_]+)/u).map((chunk, idx) => {
            if (chunk.startsWith('#')) {
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onHashtagClick(chunk);
                  }}
                  className="text-[#f2c879] hover:underline font-semibold mx-1 cursor-pointer transition-colors"
                >
                  {chunk}
                </button>
              );
            }
            return <span key={idx}>{chunk}</span>;
          })}
        </p>

        {/* Stream Source Tag */}
        {isTikTokUrl && (
          <div className="mt-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-black/40 text-white/80 border border-white/10 px-2.5 py-0.5 rounded-full">
              ⚡ تشغيل مباشر بدقة عالية
            </span>
          </div>
        )}
      </div>

      {/* Right Action Rail (Vertical Buttons) */}
      <div className="absolute bottom-14 left-3 z-10 flex flex-col items-center gap-4 pointer-events-auto">
        {/* Like Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onLike(post);
          }}
          className="flex flex-col items-center gap-1 group cursor-pointer focus:outline-none"
          aria-label="إعجاب"
        >
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md transition-transform active:scale-80 shadow-lg ${
              post.liked
                ? 'bg-[#ff6b5b]/30 text-[#ff6b5b]'
                : 'bg-[#04202b]/60 text-white hover:bg-[#04202b]/80'
            }`}
          >
            <Heart
              className={`w-7 h-7 transition-all ${
                post.liked ? 'fill-[#ff6b5b] text-[#ff6b5b] scale-110' : 'text-white'
              }`}
            />
          </div>
          <span className="text-xs font-semibold text-white drop-shadow">
            {formatCount(post.likes)}
          </span>
        </button>

        {/* Comments Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenComments(post);
          }}
          className="flex flex-col items-center gap-1 group cursor-pointer focus:outline-none"
          aria-label="التعليقات"
        >
          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-[#04202b]/60 hover:bg-[#04202b]/80 backdrop-blur-md text-white transition-transform active:scale-80 shadow-lg">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <span className="text-xs font-semibold text-white drop-shadow">
            {formatCount(post.cm.length)}
          </span>
        </button>

        {/* Bookmark / Save Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onBookmark(post);
          }}
          className="flex flex-col items-center gap-1 group cursor-pointer focus:outline-none"
          aria-label="حفظ"
        >
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md transition-transform active:scale-80 shadow-lg ${
              post.saved
                ? 'bg-[#f2c879]/30 text-[#f2c879]'
                : 'bg-[#04202b]/60 text-white hover:bg-[#04202b]/80'
            }`}
          >
            <Bookmark
              className={`w-6 h-6 ${
                post.saved ? 'fill-[#f2c879] text-[#f2c879]' : 'text-white'
              }`}
            />
          </div>
          <span className="text-xs font-semibold text-white drop-shadow">
            {post.saved ? 'محفوظ' : 'حفظ'}
          </span>
        </button>

        {/* Share Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onShare(post);
          }}
          className="flex flex-col items-center gap-1 group cursor-pointer focus:outline-none"
          aria-label="مشاركة"
        >
          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-[#04202b]/60 hover:bg-[#04202b]/80 backdrop-blur-md text-white transition-transform active:scale-80 shadow-lg">
            <Share2 className="w-6 h-6 text-white" />
          </div>
          <span className="text-xs font-semibold text-white drop-shadow">مشاركة</span>
        </button>

        {/* Playback Speed (Available for all native vertical videos) */}
        {hasVideo && (
          <button
            type="button"
            onClick={cyclePlaybackRate}
            className="flex flex-col items-center gap-1 group cursor-pointer focus:outline-none"
            aria-label="سرعة التشغيل"
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-[#04202b]/60 hover:bg-[#04202b]/80 backdrop-blur-md text-[#f2c879] transition-transform active:scale-80 shadow-lg border border-[#f2c879]/30">
              <span className="text-xs font-bold">{playbackRate}×</span>
            </div>
            <span className="text-[10px] text-white/80 font-medium">سرعة</span>
          </button>
        )}
      </div>

      {/* Bottom Video Progress Scrubbing Bar */}
      {hasVideo && duration > 0 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-0 inset-x-0 z-20 flex items-center gap-3 px-4 py-2 bg-gradient-to-t from-black/80 to-transparent direction-ltr"
        >
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            onMouseDown={() => setIsScrubbing(true)}
            onMouseUp={() => setIsScrubbing(false)}
            onTouchStart={() => setIsScrubbing(true)}
            onTouchEnd={() => setIsScrubbing(false)}
            className="flex-1 h-1.5 bg-white/30 rounded-lg cursor-pointer"
            aria-label="مؤقت الفيديو"
          />
          <span className="text-[11px] font-mono text-white/90 min-w-[70px] text-center drop-shadow select-none">
            {formatSeconds(currentTime)} / {formatSeconds(duration)}
          </span>
        </div>
      )}
    </section>
  );
};
