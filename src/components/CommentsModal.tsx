import React, { useState, useRef, useEffect } from 'react';
import { X, Send, MessageCircle, Mic, Trash2 } from 'lucide-react';
import { AudioVoiceMessage } from './AudioVoiceMessage';
import type { PostItem } from '../lib/supabase';

interface CommentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: PostItem | null;
  onAddComment: (postId: string, text: string) => Promise<void>;
  currentUser?: string;
}

export const CommentsModal: React.FC<CommentsModalProps> = ({
  isOpen,
  onClose,
  post,
  onAddComment,
  currentUser = 'أنت',
}) => {
  const [commentText, setCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

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

  if (!isOpen || !post) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = commentText.trim();
    if (!text || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onAddComment(post.id, text);
      setCommentText('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startVoiceComment = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('متصفحك لا يدعم التسجيل الصوتي');
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
    } catch {
      alert('يرجى السماح بصلاحية الميكروفون للتسجيل الصوتي');
    }
  };

  const cancelVoiceComment = () => {
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
  };

  const sendVoiceComment = () => {
    if (!mediaRecorderRef.current) return;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);

    const recorder = mediaRecorderRef.current;
    const duration = recordingSeconds || 1;

    recorder.onstop = () => {
      const audioBlob = new Blob(audioChunksRef.current, {
        type: recorder.mimeType || 'audio/webm',
      });

      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      setIsRecording(false);
      setRecordingSeconds(0);

      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = reader.result as string;
        try {
          setIsSubmitting(true);
          await onAddComment(post.id, `AUDIO:${duration}:${base64Audio}`);
        } finally {
          setIsSubmitting(false);
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

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-[#04202b]/80 backdrop-blur-xs flex items-end justify-center animate-fadeIn"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[80vh] bg-[#0b4a5a] border-t border-white/20 rounded-t-3xl p-4 flex flex-col shadow-2xl text-right pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-[#f2c879]" />
            <h2 className="font-bold text-lg text-white">
              التعليقات ({post.cm.length})
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

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3 min-h-[160px] max-h-[50vh]">
          {post.cm.length === 0 ? (
            <div className="py-12 text-center text-white/60 text-sm">
              لا توجد تعليقات بعد.<br />كن أول من يترك تعليقاً نصياً أو صوتياً!
            </div>
          ) : (
            post.cm.map((comment, index) => {
              const isVoice = comment.t.startsWith('AUDIO:');
              let audioData = '';
              let audioDur = 0;
              if (isVoice) {
                const parts = comment.t.split(':');
                audioDur = parseFloat(parts[1]) || 0;
                audioData = parts.slice(2).join(':');
              }

              return (
                <div
                  key={comment.id || index}
                  className="p-3 rounded-2xl bg-[#04202b]/50 border border-white/5 flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-[#f2c879]">
                      @{comment.u}
                    </span>
                    {comment.u === currentUser && (
                      <span className="text-[10px] text-white/40">أنت</span>
                    )}
                  </div>
                  {isVoice ? (
                    <div className="pt-1">
                      <AudioVoiceMessage
                        audioUrl={audioData}
                        duration={audioDur}
                        isMe={comment.u === currentUser}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-[#e8f6f3] leading-relaxed break-words whitespace-pre-wrap">
                      {comment.t}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Input Bar or Voice Recording Bar */}
        {isRecording ? (
          <div className="pt-2 flex items-center justify-between gap-3 border-t border-white/10 shrink-0 bg-[#04202b]/90 p-2.5 rounded-2xl animate-pulse">
            <button
              type="button"
              onClick={cancelVoiceComment}
              className="w-9 h-9 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="flex-1 flex items-center justify-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
              <span className="text-xs font-mono font-bold text-white">
                {formatTimer(recordingSeconds)}
              </span>
              <span className="text-xs text-white/70">تسجيل تعليق صوتي...</span>
            </div>
            <button
              type="button"
              onClick={sendVoiceComment}
              className="bg-[#f2c879] hover:bg-[#e0b86a] text-[#04202b] font-bold px-3 py-1.5 rounded-full transition-all flex items-center gap-1 shadow-md cursor-pointer shrink-0 text-xs"
            >
              <Send className="w-3.5 h-3.5 rotate-180" />
              <span>إرسال</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="pt-2 flex items-center gap-2 border-t border-white/10">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="اكتب تعليقاً أو سجّل صوتاً..."
              className="flex-1 bg-[#04202b] text-[#e8f6f3] border border-white/20 focus:border-[#f2c879] rounded-full py-2.5 px-4 text-sm focus:outline-none placeholder-white/40"
            />
            <button
              type="button"
              onClick={startVoiceComment}
              className="w-10 h-10 rounded-full bg-[#04202b] hover:bg-[#04202b]/80 border border-[#f2c879]/40 text-[#f2c879] flex items-center justify-center transition-all cursor-pointer shadow active:scale-95 shrink-0"
              title="تسجيل تعليق صوتي"
            >
              <Mic className="w-5 h-5" />
            </button>
            {commentText.trim() && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-[#f2c879] hover:bg-[#e0b86a] text-[#04202b] font-bold px-4 py-2.5 rounded-full flex items-center gap-1.5 transition-all text-sm cursor-pointer shadow-md shrink-0"
              >
                <Send className="w-4 h-4 rotate-180" />
                <span>أرسل</span>
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
