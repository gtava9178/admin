import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Search,
  Send,
  ArrowRight,
  MessageSquare,
  Mic,
  Trash2,
  StopCircle,
} from 'lucide-react';
import { AudioVoiceMessage } from './AudioVoiceMessage';
import type { DirectMessageItem } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

interface ConversationItem {
  uid: string;
  name: string;
  last: string;
  t: number;
  out: boolean;
  unread: number;
}

interface MessagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  username: string;
  onRequireAuth: () => void;
  onToast: (msg: string) => void;
  activeThreadUser?: { uid: string; name: string } | null;
  onCloseThread?: () => void;
}

export const MessagesModal: React.FC<MessagesModalProps> = ({
  isOpen,
  onClose,
  user,
  username,
  onRequireAuth,
  onToast,
  activeThreadUser: initialThreadUser,
  onCloseThread,
}) => {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeThread, setActiveThread] = useState<{ uid: string; name: string } | null>(
    initialThreadUser || null
  );
  const [threadMessages, setThreadMessages] = useState<DirectMessageItem[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; username: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Sync initial thread user when passed from outside
  useEffect(() => {
    if (initialThreadUser) {
      setActiveThread(initialThreadUser);
    }
  }, [initialThreadUser]);

  // Fetch Inbox Conversations
  const fetchInbox = async () => {
    try {
      const headers: Record<string, string> = {
        'x-user-id': user?.id || 'guest',
        'x-user-name': username || 'أنت',
      };
      const res = await fetch('/api/dm/inbox', { headers });
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch {
      // fallback
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchInbox();
    }
  }, [isOpen, user]);

  // Fetch thread messages
  const fetchThread = async (uid: string) => {
    try {
      const headers: Record<string, string> = {
        'x-user-id': user?.id || 'guest',
        'x-user-name': username || 'أنت',
      };
      const res = await fetch(`/api/dm/thread?uid=${encodeURIComponent(uid)}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setThreadMessages(data);
        // Mark as read
        await fetch('/api/dm/read', {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({ uid }),
        });
      }
    } catch {
      // fallback
    }
  };

  // Poll thread messages when thread is open
  useEffect(() => {
    if (!isOpen || !activeThread) return;
    fetchThread(activeThread.uid);
    const interval = setInterval(() => {
      fetchThread(activeThread.uid);
    }, 3000);
    return () => clearInterval(interval);
  }, [isOpen, activeThread]);

  // Scroll to bottom of chat
  useEffect(() => {
    if (activeThread) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [threadMessages, activeThread]);

  // Clean up recording on unmount or close
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // User search
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const headers: Record<string, string> = {
          'x-user-id': user?.id || 'guest',
          'x-user-name': username || 'أنت',
        };
        const res = await fetch(`/api/dm/users?q=${encodeURIComponent(q)}`, { headers });
        if (res.ok) {
          const list = await res.json();
          setSearchResults(list);
        }
      } catch {
        // ignore
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  if (!isOpen) return null;

  // Send regular text message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = messageInput.trim();
    if (!text || !activeThread || isLoading) return;

    const tempMsg: DirectMessageItem = {
      id: 'temp-' + Date.now(),
      sender_id: user?.id || 'guest',
      sender_name: username || 'أنت',
      recipient_id: activeThread.uid,
      recipient_name: activeThread.name,
      body: text,
      created_at: new Date().toISOString(),
      read: false,
    };

    setThreadMessages((prev) => [...prev, tempMsg]);
    setMessageInput('');

    try {
      setIsLoading(true);
      const headers: Record<string, string> = {
        'x-user-id': user?.id || 'guest',
        'x-user-name': username || 'أنت',
        'content-type': 'application/json',
      };
      const res = await fetch('/api/dm/send', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: activeThread.uid,
          name: activeThread.name,
          body: text,
        }),
      });

      if (!res.ok) throw new Error('فشل إرسال الرسالة');
      fetchThread(activeThread.uid);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذّر الإرسال';
      onToast(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Start Voice Recording
  const startVoiceRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      onToast('متصفحك لا يدعم التسجيل الصوتي');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      onToast('يرجى منح إذن الميكروفون للتسجيل الصوتي');
    }
  };

  // Cancel Voice Recording
  const cancelVoiceRecording = () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    setIsRecording(false);
    setRecordingSeconds(0);
    audioChunksRef.current = [];
    onToast('تم إلغاء التسجيل الصوتي');
  };

  // Stop & Send Voice Note
  const stopAndSendVoiceRecording = () => {
    if (!mediaRecorderRef.current || !activeThread) return;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);

    const duration = recordingSeconds || 1;
    const recorder = mediaRecorderRef.current;

    recorder.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, {
        type: recorder.mimeType || 'audio/webm',
      });

      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      setIsRecording(false);
      setRecordingSeconds(0);

      // Convert blob to DataURL
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = reader.result as string;

        const tempMsg: DirectMessageItem = {
          id: 'temp-voice-' + Date.now(),
          sender_id: user?.id || 'guest',
          sender_name: username || 'أنت',
          recipient_id: activeThread.uid,
          recipient_name: activeThread.name,
          body: '🎙️ رسالة صوتية',
          audio_url: base64Audio,
          audio_duration: duration,
          created_at: new Date().toISOString(),
          read: false,
        };

        setThreadMessages((prev) => [...prev, tempMsg]);

        try {
          setIsLoading(true);
          const headers: Record<string, string> = {
            'x-user-id': user?.id || 'guest',
            'x-user-name': username || 'أنت',
            'content-type': 'application/json',
          };
          const res = await fetch('/api/dm/send', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              to: activeThread.uid,
              name: activeThread.name,
              body: '🎙️ رسالة صوتية',
              audio_url: base64Audio,
              audio_duration: duration,
            }),
          });

          if (!res.ok) throw new Error('فشل إرسال الرسالة الصوتية');
          fetchThread(activeThread.uid);
          onToast('تم إرسال الرسالة الصوتية 🎙️');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'تعذّر إرسال الرسالة الصوتية';
          onToast(msg);
        } finally {
          setIsLoading(false);
        }
      };
    };

    if (recorder.state !== 'inactive') {
      recorder.stop();
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  };

  const formatAgo = (ms: number) => {
    const sec = Math.floor((Date.now() - ms) / 1000);
    if (sec < 60) return 'الآن';
    if (sec < 3600) return `${Math.floor(sec / 60)} د`;
    if (sec < 86400) return `${Math.floor(sec / 3600)} س`;
    return new Date(ms).toLocaleDateString('ar-SA');
  };

  const handleBackToInbox = () => {
    if (isRecording) cancelVoiceRecording();
    setActiveThread(null);
    onCloseThread?.();
    fetchInbox();
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-[#04202b]/85 backdrop-blur-xs flex items-end justify-center animate-fadeIn"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg h-[86vh] bg-[#0b4a5a] border-t border-white/20 rounded-t-3xl p-4 flex flex-col shadow-2xl text-right pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            {activeThread && (
              <button
                type="button"
                onClick={handleBackToInbox}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
                title="الرجوع للرسائل"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            )}
            <MessageSquare className="w-5 h-5 text-[#f2c879]" />
            <h2 className="font-bold text-lg text-white">
              {activeThread ? `@${activeThread.name}` : 'الرسائل الخاصة'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* VIEW 1: Active Chat Thread */}
        {activeThread ? (
          <div className="flex-1 flex flex-col min-h-0 pt-2">
            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto space-y-3 p-2">
              {threadMessages.length === 0 ? (
                <div className="py-16 text-center text-white/60 text-sm leading-relaxed">
                  ابدأ المحادثة مع @{activeThread.name}.<br />
                  يمكنك إرسال رسائل نصية أو تسجيل <b>رسائل صوتية</b> فورية 🎙️.
                </div>
              ) : (
                threadMessages.map((msg) => {
                  const isMe =
                    msg.sender_id === (user?.id || 'guest') || msg.sender_name === username;

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col max-w-[85%] ${
                        isMe ? 'mr-auto items-start' : 'ml-auto items-end'
                      }`}
                    >
                      <div
                        className={`rounded-2xl p-3 text-sm leading-relaxed break-words shadow-md ${
                          isMe
                            ? 'bg-[#ff6b5b] text-white rounded-bl-xs'
                            : 'bg-[#04202b] text-[#e8f6f3] border border-white/10 rounded-br-xs'
                        }`}
                      >
                        {msg.audio_url ? (
                          <div className="flex flex-col gap-1.5">
                            <AudioVoiceMessage
                              audioUrl={msg.audio_url}
                              duration={msg.audio_duration}
                              isMe={isMe}
                            />
                            {msg.body && msg.body !== '🎙️ رسالة صوتية' && (
                              <p className="mt-1 text-xs pt-1 border-t border-white/15">
                                {msg.body}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="whitespace-pre-wrap">{msg.body}</span>
                        )}
                      </div>

                      <span className="text-[10px] text-white/40 mt-1 px-1">
                        {formatTime(msg.created_at)}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar with Voice Recording Controls */}
            {isRecording ? (
              /* Active Voice Recording Bar */
              <div className="pt-2 flex items-center justify-between gap-3 border-t border-white/10 shrink-0 bg-[#04202b]/90 p-2.5 rounded-2xl animate-pulse">
                {/* Cancel Trash Button */}
                <button
                  type="button"
                  onClick={cancelVoiceRecording}
                  className="w-10 h-10 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  title="إلغاء التسجيل"
                >
                  <Trash2 className="w-5 h-5" />
                </button>

                {/* Animated Recording Soundwave & Timer */}
                <div className="flex-1 flex items-center justify-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
                  <span className="text-sm font-mono font-bold text-white tracking-wider">
                    {formatTimer(recordingSeconds)}
                  </span>
                  <span className="text-xs text-white/70 font-semibold">
                    جارٍ تسجيل رسالة صوتية...
                  </span>
                </div>

                {/* Send Voice Note Button */}
                <button
                  type="button"
                  onClick={stopAndSendVoiceRecording}
                  className="bg-[#f2c879] hover:bg-[#e0b86a] text-[#04202b] font-bold px-4 py-2 rounded-full transition-all flex items-center gap-1.5 shadow-md cursor-pointer shrink-0"
                  title="إرسال الرسالة الصوتية"
                >
                  <Send className="w-4 h-4 rotate-180" />
                  <span className="text-xs">إرسال</span>
                </button>
              </div>
            ) : (
              /* Standard Input Bar with Mic button */
              <form
                onSubmit={handleSendMessage}
                className="pt-2 flex items-center gap-2 border-t border-white/10 shrink-0"
              >
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="اكتب رسالة أو سجّل صوتاً..."
                  className="flex-1 bg-[#04202b] text-[#e8f6f3] border border-white/20 focus:border-[#f2c879] rounded-full py-2.5 px-4 text-sm focus:outline-none placeholder-white/40"
                />

                {/* Voice Note Record Trigger Button */}
                <button
                  type="button"
                  onClick={startVoiceRecording}
                  className="w-10 h-10 rounded-full bg-[#04202b] hover:bg-[#04202b]/80 border border-[#f2c879]/40 text-[#f2c879] flex items-center justify-center transition-all cursor-pointer shadow active:scale-95 shrink-0"
                  title="تسجيل رسالة صوتية (مرسلة صوتية)"
                  aria-label="تسجيل صوتي"
                >
                  <Mic className="w-5 h-5" />
                </button>

                {/* Send Text Button */}
                {messageInput.trim() && (
                  <button
                    type="submit"
                    className="bg-[#f2c879] hover:bg-[#e0b86a] text-[#04202b] font-bold p-2.5 rounded-full transition-all cursor-pointer shadow-md shrink-0"
                    title="إرسال"
                  >
                    <Send className="w-5 h-5 rotate-180" />
                  </button>
                )}
              </form>
            )}
          </div>
        ) : (
          /* VIEW 2: Inbox & User Search */
          <div className="flex-1 flex flex-col min-h-0 pt-3 space-y-3">
            {/* Search Input */}
            <div className="relative flex items-center shrink-0">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث عن مستخدم لمراسلته..."
                className="w-full bg-[#04202b] text-[#e8f6f3] border border-white/20 focus:border-[#f2c879] rounded-xl py-2 px-9 text-sm focus:outline-none placeholder-white/40"
              />
              <Search className="w-4 h-4 text-[#f2c879] absolute right-3 pointer-events-none" />
            </div>

            {/* User Search Results */}
            {searchQuery.trim() && (
              <div className="bg-[#04202b]/60 rounded-2xl p-2 border border-white/10 max-h-40 overflow-y-auto shrink-0">
                <span className="text-[11px] text-white/50 px-2 block mb-1">
                  نتائج البحث:
                </span>
                {searchResults.length === 0 ? (
                  <div className="text-center text-xs text-white/50 py-3">
                    لا يوجد مستخدم بهذا الاسم
                  </div>
                ) : (
                  searchResults.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setActiveThread({ uid: u.id, name: u.username });
                        setSearchQuery('');
                      }}
                      className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer text-right"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#f2c879] text-[#04202b] flex items-center justify-center font-bold text-xs">
                          {u.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-semibold text-white">
                          @{u.username}
                        </span>
                      </div>
                      <span className="text-xs text-[#f2c879]">مراسلة</span>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Conversations List */}
            <div className="flex-1 overflow-y-auto space-y-1">
              <span className="text-xs text-white/60 font-semibold px-1 block mb-2">
                المحادثات ({conversations.length})
              </span>

              {conversations.length === 0 ? (
                <div className="py-14 text-center text-white/50 text-sm leading-loose">
                  لا توجد محادثات بعد.<br />
                  ابحث عن مستخدم بالأعلى، أو اضغط «راسل» بجانب اسم أي صانع محتوى في مقاطع الفيديو!
                </div>
              ) : (
                conversations.map((c) => {
                  const isVoice = c.last.includes('🎙️') || c.last.includes('صوتية');

                  return (
                    <button
                      key={c.uid}
                      type="button"
                      onClick={() => setActiveThread({ uid: c.uid, name: c.name })}
                      className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-white/10 transition-all text-right border-b border-white/5 cursor-pointer group"
                    >
                      <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-[#0b4a5a] to-[#1d9aa3] border border-[#f2c879]/40 flex items-center justify-center text-[#f2c879] font-bold text-base shrink-0 shadow">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-white group-hover:text-[#f2c879] transition-colors truncate">
                            @{c.name}
                          </span>
                          <span className="text-[10px] text-white/40">
                            {formatAgo(c.t)}
                          </span>
                        </div>
                        <p className="text-xs text-white/70 truncate mt-0.5 flex items-center gap-1">
                          {c.out && <span className="text-[#f2c879]">أنت: </span>}
                          {isVoice ? (
                            <span className="text-[#f2c879] flex items-center gap-1 font-medium">
                              <Mic className="w-3.5 h-3.5" />
                              رسالة صوتية
                            </span>
                          ) : (
                            c.last
                          )}
                        </p>
                      </div>
                      {c.unread > 0 && (
                        <span className="w-5 h-5 rounded-full bg-[#ff6b5b] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                          {c.unread}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
