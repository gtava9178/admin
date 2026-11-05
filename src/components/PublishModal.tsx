import React, { useState, useRef } from 'react';
import { X, UploadCloud, Video, Link2, AlertCircle, Camera, Timer } from 'lucide-react';
import { compressVideo, isCompressionSupported } from '../lib/compress';
import { uploadVideoTus, supabase, PostItem } from '../lib/supabase';
import { CameraRecorder } from './CameraRecorder';
import type { User } from '@supabase/supabase-js';

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  username: string;
  onPostPublished: (newPost: PostItem) => void;
  onRequireAuth: () => void;
  onToast: (msg: string) => void;
}

export const PublishModal: React.FC<PublishModalProps> = ({
  isOpen,
  onClose,
  user,
  username,
  onPostPublished,
  onRequireAuth,
  onToast,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [tiktokLink, setTiktokLink] = useState<string>('');
  const [caption, setCaption] = useState<string>('');
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStage, setUploadStage] = useState<string>('');
  const [uploadPercent, setUploadPercent] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  if (!isOpen) return null;

  const MAX_MB = 50;
  const MAX_BYTES = MAX_MB * 1024 * 1024;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setErrorMessage('');
    if (!file) return;

    if (!file.type.startsWith('video/') && !/\.(mp4|mov|m4v|webm|mkv|3gp)$/i.test(file.name)) {
      setErrorMessage('الملف المختار ليس فيديو. يرجى اختيار ملف فيديو بصيغة MP4 أو MOV أو WebM.');
      return;
    }

    setSelectedFile(file);
    const objUrl = URL.createObjectURL(file);
    setVideoUrl(objUrl);
    setTiktokLink('');
  };

  const handleCameraCapture = (file: File) => {
    setSelectedFile(file);
    const objUrl = URL.createObjectURL(file);
    setVideoUrl(objUrl);
    setTiktokLink('');
    setIsCameraOpen(false);
    onToast('تم تسجيل الفيديو بنجاح! 🎬');
  };

  const handleVideoMetadata = () => {
    if (previewVideoRef.current) {
      setVideoDuration(previewVideoRef.current.duration || 0);
    }
  };

  const handleTagClick = (tag: string) => {
    setCaption((prev) => (prev ? `${prev} ${tag}` : tag));
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsUploading(false);
    setUploadStage('');
    setUploadPercent(0);
    onToast('أُلغي النشر');
  };

  const handlePublish = async () => {
    if (!user) {
      onRequireAuth();
      return;
    }

    if (!selectedFile && !tiktokLink.trim()) {
      onToast('اختر ملف فيديو أو صوّر بالكاميرا أو الصق رابط تيك توك');
      return;
    }

    setErrorMessage('');
    setIsUploading(true);
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    try {
      // CASE 1: TikTok link
      if (tiktokLink.trim() && !selectedFile) {
        setUploadStage('جارٍ جلب معلومات فيديو تيك توك...');
        setUploadPercent(30);

        let link = tiktokLink.trim();
        if (!/^https?:\/\//i.test(link)) link = 'https://' + link;

        const res = await fetch(`/api/tiktok?url=${encodeURIComponent(link)}`, {
          signal: abortCtrl.signal,
        });

        if (!res.ok) {
          throw new Error('تعذّر جلب فيديو تيك توك. تحقق من الرابط.');
        }

        const data = await res.json();
        const postCap =
          caption.trim() ||
          (data.title ? data.title.slice(0, 300) : '') + (data.author ? ` — @${data.author} #تيك_توك` : ' #تيك_توك');

        setUploadStage('جارٍ حفظ الفيديو...');
        setUploadPercent(85);

        const { data: dbPost, error: dbError } = await supabase
          .from('posts')
          .insert({
            user_id: user.id,
            username: username || user.email?.split('@')[0] || 'مستخدم',
            caption: postCap.trim(),
            video_url: data.url || link,
          })
          .select()
          .single();

        if (dbError) throw dbError;

        const newPost: PostItem = {
          id: dbPost?.id || 'post-' + Date.now(),
          uid: user.id,
          user: username || 'أنت',
          cap: postCap.trim(),
          url: data.url || link,
          likes: 0,
          liked: false,
          saved: false,
          cm: [],
          t: Date.now(),
        };

        onPostPublished(newPost);
        onToast('تم نشر الفيديو بنجاح!');
        onClose();
        return;
      }

      // CASE 2: Upload local video file
      if (selectedFile) {
        let fileToUpload = selectedFile;

        // If file > 50MB, check if client compression is supported
        if (selectedFile.size > MAX_BYTES) {
          if (!isCompressionSupported()) {
            throw new Error(`حجم الفيديو (${(selectedFile.size / 1048576).toFixed(1)} ميغابايت) يتجاوز 50 ميغابايت ومتصفحك لا يدعم الضغط. يرجى اختيار فيديو أقصر.`);
          }

          setUploadStage('جارٍ ضغط الفيديو ليناسب الحجم المسموح...');
          fileToUpload = await compressVideo(selectedFile, {
            maxBytes: MAX_BYTES * 0.95,
            onProgress: (p) => {
              setUploadPercent(Math.round(p * 50));
            },
            signal: abortCtrl.signal,
          });
        }

        setUploadStage('جارٍ الرفع إلى السحابة...');
        const publicUrl = await uploadVideoTus(
          fileToUpload,
          user,
          (ratio) => {
            const startPct = selectedFile.size > MAX_BYTES ? 50 : 0;
            const remaining = selectedFile.size > MAX_BYTES ? 50 : 100;
            setUploadPercent(Math.round(startPct + ratio * remaining));
          },
          abortCtrl.signal
        );

        setUploadStage('جارٍ إتمام النشر...');
        const postCap = caption.trim() || 'فيديو جديد';

        const { data: dbPost, error: dbError } = await supabase
          .from('posts')
          .insert({
            user_id: user.id,
            username: username || user.email?.split('@')[0] || 'مستخدم',
            caption: postCap,
            video_url: publicUrl,
          })
          .select()
          .single();

        if (dbError) throw dbError;

        const newPost: PostItem = {
          id: dbPost?.id || 'post-' + Date.now(),
          uid: user.id,
          user: username || 'أنت',
          cap: postCap,
          url: publicUrl,
          likes: 0,
          liked: false,
          saved: false,
          cm: [],
          t: Date.now(),
        };

        onPostPublished(newPost);
        onToast('تم نشر الفيديو بنجاح!');
        onClose();
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء النشر';
      setErrorMessage(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    return (bytes / (1024 * 1024)).toFixed(1) + ' ميغابايت';
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 bg-[#04202b]/85 backdrop-blur-xs flex items-end justify-center animate-fadeIn"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg max-h-[90vh] bg-[#0b4a5a] border-t border-white/20 rounded-t-3xl p-4 flex flex-col shadow-2xl text-right overflow-y-auto pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Video className="w-5 h-5 text-[#ff6b5b]" />
              <h2 className="font-bold text-lg text-white">انشر فيديو جديد</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Upload Options */}
          <div className="py-3 space-y-4">
            {/* Quick Action: Live Camera with 3-Second Countdown */}
            <button
              type="button"
              onClick={() => setIsCameraOpen(true)}
              disabled={isUploading}
              className="w-full bg-gradient-to-r from-[#ff6b5b] to-[#f2c879] hover:opacity-95 text-[#04202b] font-bold p-3.5 rounded-2xl flex items-center justify-between shadow-lg cursor-pointer transition-all active:scale-98"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center text-white">
                  <Camera className="w-6 h-6 text-white" />
                </div>
                <div className="text-right">
                  <span className="block text-sm font-black text-[#04202b]">
                    فتح كاميرا التطبيق
                  </span>
                  <span className="block text-[11px] font-semibold text-[#04202b]/80">
                    تصوير مباشر مع مؤقت تنازلي (3 ثوانٍ)
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-black/15 px-2.5 py-1 rounded-full text-xs font-bold text-white">
                <Timer className="w-3.5 h-3.5" />
                <span>3 ثوانٍ</span>
              </div>
            </button>

            {/* File Picker */}
            <div>
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-white/30 hover:border-[#f2c879] rounded-2xl p-3.5 cursor-pointer transition-all bg-[#04202b]/40">
                <input
                  type="file"
                  accept="video/*,.mp4,.mov,.m4v,.webm,.mkv,.3gp"
                  onChange={handleFileChange}
                  disabled={isUploading}
                  className="hidden"
                />
                <UploadCloud className="w-7 h-7 text-[#f2c879]" />
                <span className="font-semibold text-xs text-[#e8f6f3]">
                  {selectedFile ? 'تغيير ملف الفيديو المختار' : 'أو اختر فيديو جاهز من جهازك'}
                </span>
                <span className="text-[10px] text-white/50">
                  يدعم MP4, MOV, WebM حتى 50 ميغابايت
                </span>
              </label>
            </div>

            {/* OR Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/15" />
              <span className="text-xs text-white/50 font-medium">أو عبر الرابط</span>
              <div className="flex-1 h-px bg-white/15" />
            </div>

            {/* TikTok URL Input */}
            <div>
              <label className="block text-xs font-semibold text-white/80 mb-1">
                رابط فيديو من تيك توك:
              </label>
              <div className="relative flex items-center">
                <input
                  type="url"
                  value={tiktokLink}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTiktokLink(val);
                    if (val) {
                      setSelectedFile(null);
                      // Auto-resolve video for preview if valid TikTok link
                      if (/tiktok\.com/i.test(val)) {
                        fetch(`/api/tiktok?url=${encodeURIComponent(val.trim())}`)
                          .then((r) => r.json())
                          .then((d) => {
                            if (d && d.url && d.url.includes('/api/tiktok/stream')) {
                              setVideoUrl(d.url);
                              if (d.title && !caption) setCaption(d.title);
                            }
                          })
                          .catch(() => {});
                      }
                    }
                  }}
                  disabled={isUploading}
                  placeholder="https://www.tiktok.com/@.../video/..."
                  className="w-full bg-[#04202b] text-[#e8f6f3] border border-white/20 focus:border-[#f2c879] rounded-xl py-2 px-9 text-sm focus:outline-none placeholder-white/40"
                />
                <Link2 className="w-4 h-4 text-[#f2c879] absolute right-3 pointer-events-none" />
              </div>
            </div>

            {/* Video Preview */}
            {videoUrl && (
              <div className="bg-[#04202b] rounded-2xl p-2.5 border border-white/10 space-y-2">
                <video
                  ref={previewVideoRef}
                  src={videoUrl}
                  controls
                  muted
                  playsInline
                  onLoadedMetadata={handleVideoMetadata}
                  className="w-full max-h-48 object-contain rounded-xl bg-black"
                />
                {selectedFile && (
                  <div className="text-xs text-white/70 flex items-center justify-between px-1">
                    <span>{selectedFile.name}</span>
                    <span className="font-mono text-[#f2c879]">
                      {formatFileSize(selectedFile.size)} {videoDuration > 0 && `• ${formatSeconds(videoDuration)}`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Caption Input */}
            <div>
              <label className="block text-xs font-semibold text-white/80 mb-1">
                الوصف والوسوم (#):
              </label>
              <textarea
                rows={3}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                disabled={isUploading}
                placeholder="اكتب وصفاً جذاباً للفيديو مع وسوم مثل #بحر #طبيعة..."
                className="w-full bg-[#04202b] text-[#e8f6f3] border border-white/20 focus:border-[#f2c879] rounded-xl p-3 text-sm focus:outline-none placeholder-white/40 resize-none"
              />
              {/* Quick Hashtag suggestions */}
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <span className="text-[11px] text-white/50">وسوم شائعة:</span>
                {['#بحر', '#اكسبلور', '#فيديوهات', '#سفر', '#إلهام', '#ضحك', '#بحرك'].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleTagClick(tag)}
                    className="text-xs text-[#f2c879] bg-[#04202b] hover:bg-[#04202b]/80 border border-[#f2c879]/30 rounded-full px-2.5 py-0.5 cursor-pointer transition-colors"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Upload Progress Bar */}
            {isUploading && (
              <div className="bg-[#04202b] rounded-2xl p-3 border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-xs text-white">
                  <span>{uploadStage || 'جارٍ المعالجة...'}</span>
                  <span className="font-bold text-[#f2c879]">{uploadPercent}%</span>
                </div>
                <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#f2c879] to-[#ff6b5b] transition-all duration-300"
                    style={{ width: `${uploadPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 bg-[#ff6b5b]/20 border border-[#ff6b5b] rounded-xl text-xs text-white flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-[#ff6b5b] shrink-0 mt-0.5" />
                <div className="whitespace-pre-line leading-relaxed">{errorMessage}</div>
              </div>
            )}

            {/* Buttons */}
            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={handlePublish}
                disabled={isUploading || (!selectedFile && !tiktokLink.trim())}
                className="w-full bg-[#ff6b5b] hover:bg-[#ff5542] disabled:opacity-50 text-white font-bold py-3 rounded-full transition-all shadow-lg active:scale-98 cursor-pointer text-base"
              >
                {isUploading ? 'جارٍ النشر...' : 'انشر الآن'}
              </button>

              {isUploading && (
                <button
                  type="button"
                  onClick={handleCancelUpload}
                  className="w-full bg-transparent hover:bg-white/10 text-white/70 py-2 rounded-full border border-white/20 text-xs transition-colors cursor-pointer"
                >
                  إلغاء العملية
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* In-App Live Camera with 3-Second Countdown */}
      <CameraRecorder
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onVideoCaptured={handleCameraCapture}
        onToast={onToast}
      />
    </>
  );
};
