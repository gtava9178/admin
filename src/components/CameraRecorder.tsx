import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Camera,
  RefreshCw,
  Timer,
  Check,
  RotateCcw,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

interface CameraRecorderProps {
  isOpen: boolean;
  onClose: () => void;
  onVideoCaptured: (file: File) => void;
  onToast: (msg: string) => void;
}

export const CameraRecorder: React.FC<CameraRecorderProps> = ({
  isOpen,
  onClose,
  onVideoCaptured,
  onToast,
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string>('');

  // 3-second countdown state
  const [useCountdown, setUseCountdown] = useState<boolean>(true); // Active by default
  const [countdownValue, setCountdownValue] = useState<number | null>(null);

  // Recording state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');

  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Sound beep synthesis for countdown
  const playBeep = useCallback((freq = 800, duration = 0.15) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // ignore
    }
  }, []);

  // Start Camera
  const startCamera = useCallback(async () => {
    setCameraError('');
    try {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1080 },
          height: { ideal: 1920 },
        },
        audio: true,
      });

      setStream(newStream);
      setIsCameraActive(true);

      if (videoElementRef.current) {
        videoElementRef.current.srcObject = newStream;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذّر تشغيل الكاميرا';
      setCameraError('يرجى السماح بالوصول إلى الكاميرا والميكروفون لتسجيل الفيديو.');
      setIsCameraActive(false);
    }
  }, [facingMode]);

  // Handle camera mount/unmount
  useEffect(() => {
    if (isOpen) {
      setRecordedBlob(null);
      setPreviewUrl('');
      startCamera();
    } else {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      setStream(null);
      setIsCameraActive(false);
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [isOpen, startCamera]);

  // Actual recording execution
  const executeStartRecording = useCallback(() => {
    if (!stream) return;

    try {
      const mimeType = MediaRecorder.isTypeSupported('video/mp4')
        ? 'video/mp4'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'video/mp4' });
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setIsRecording(false);
      };

      recorder.start(500);
      setIsRecording(true);
      setRecordingSeconds(0);

      // Record timer (up to 60s)
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 60) {
            stopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      onToast('تعذّر بدء تسجيل الفيديو');
    }
  }, [stream, onToast]);

  // Pressing Record Button: Handles 3-Second Countdown!
  const handleRecordButtonClick = () => {
    if (isRecording) {
      stopRecording();
      return;
    }

    if (useCountdown) {
      // Start 3-second countdown
      let count = 3;
      setCountdownValue(count);
      playBeep(700, 0.15);

      countdownIntervalRef.current = setInterval(() => {
        count -= 1;
        if (count > 0) {
          setCountdownValue(count);
          playBeep(700, 0.15);
        } else if (count === 0) {
          setCountdownValue(0);
          playBeep(1100, 0.25); // Higher pitch for start!
        } else {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          setCountdownValue(null);
          executeStartRecording();
        }
      }, 1000);
    } else {
      executeStartRecording();
    }
  };

  // Cancel Countdown
  const cancelCountdown = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setCountdownValue(null);
    onToast('تم إلغاء المؤقت');
  };

  // Stop Recording
  const stopRecording = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  // Switch Camera
  const toggleFacingMode = () => {
    if (isRecording || countdownValue !== null) return;
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  // Retake video
  const handleRetake = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setRecordedBlob(null);
    setPreviewUrl('');
    setRecordingSeconds(0);
    startCamera();
  };

  // Confirm and use recorded video
  const handleConfirmVideo = () => {
    if (!recordedBlob) return;
    const ext = recordedBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const file = new File([recordedBlob], `camera-video-${Date.now()}.${ext}`, {
      type: recordedBlob.type || 'video/mp4',
    });
    onVideoCaptured(file);
    onClose();
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-between overflow-hidden animate-fadeIn select-none">
      {/* Viewfinder or Recorded Video Preview */}
      <div className="relative w-full h-full flex items-center justify-center bg-black">
        {previewUrl ? (
          /* Preview Recorded Video */
          <video
            src={previewUrl}
            controls
            autoPlay
            loop
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          /* Live Camera Stream */
          <video
            ref={videoElementRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
          />
        )}

        {/* Top Control Bar */}
        <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent pt-[max(1rem,env(safe-area-inset-top))]">
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/60 transition-colors cursor-pointer border border-white/10"
            aria-label="إغلاق الكاميرا"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Recording Timer Header */}
          {isRecording && (
            <div className="flex items-center gap-2 bg-red-600/90 text-white font-mono text-sm font-bold px-3.5 py-1.5 rounded-full shadow-lg border border-red-400 animate-pulse">
              <span className="w-2.5 h-2.5 rounded-full bg-white" />
              <span>{formatTimer(recordingSeconds)} / 01:00</span>
            </div>
          )}

          {/* Tools Controls (Flip & 3s Timer Toggle) */}
          {!previewUrl && !isRecording && (
            <div className="flex items-center gap-2.5">
              {/* 3s Countdown Button */}
              <button
                type="button"
                onClick={() => {
                  setUseCountdown(!useCountdown);
                  onToast(!useCountdown ? 'تم تفعيل مؤقت 3 ثوانٍ ⏱️' : 'تم إيقاف المؤقت');
                }}
                className={`h-10 px-3 rounded-full flex items-center gap-1.5 backdrop-blur-md text-xs font-bold transition-all cursor-pointer border ${
                  useCountdown
                    ? 'bg-[#f2c879] text-[#04202b] border-[#f2c879] shadow-lg'
                    : 'bg-black/40 text-white/80 border-white/20 hover:text-white'
                }`}
                title="مؤقت تنازلي (3 ثوانٍ)"
              >
                <Timer className="w-4 h-4" />
                <span>3 ثوانٍ</span>
              </button>

              {/* Flip Camera button */}
              <button
                type="button"
                onClick={toggleFacingMode}
                className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/60 transition-colors cursor-pointer border border-white/10"
                title="تبديل الكاميرا"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Dramatic Countdown Overlay (3... 2... 1... ابدأ!) */}
        {countdownValue !== null && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs animate-fadeIn">
            <div className="relative flex items-center justify-center">
              {/* Pulsing ring */}
              <div className="absolute w-44 h-44 rounded-full border-4 border-[#f2c879] animate-ping opacity-75" />
              <div className="w-36 h-36 rounded-full bg-gradient-to-tr from-[#0b4a5a] to-[#1d9aa3] border-4 border-[#f2c879] flex items-center justify-center shadow-[0_0_50px_rgba(242,200,121,0.6)]">
                <span className="text-6xl font-black text-[#f2c879] drop-shadow-lg scale-110 transition-transform">
                  {countdownValue === 0 ? 'ابدأ!' : countdownValue}
                </span>
              </div>
            </div>

            <p className="mt-8 text-lg font-bold text-white drop-shadow">
              استعد! سيبدأ التسجيل تلقائياً...
            </p>

            <button
              type="button"
              onClick={cancelCountdown}
              className="mt-6 px-5 py-2 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs font-semibold backdrop-blur-md transition-colors cursor-pointer border border-white/20"
            >
              إلغاء المؤقت
            </button>
          </div>
        )}

        {/* Camera Error Message */}
        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-20 bg-black/80">
            <AlertCircle className="w-12 h-12 text-[#ff6b5b] mb-3" />
            <p className="text-white font-bold mb-4">{cameraError}</p>
            <button
              type="button"
              onClick={startCamera}
              className="bg-[#f2c879] text-[#04202b] font-bold px-5 py-2.5 rounded-full text-sm hover:bg-[#e0b86a] transition-all cursor-pointer"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* Bottom Actions Bar */}
        <div className="absolute bottom-0 inset-x-0 z-20 flex items-center justify-center p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {previewUrl ? (
            /* Post-Recording Action Buttons */
            <div className="flex items-center gap-6">
              {/* Retake Button */}
              <button
                type="button"
                onClick={handleRetake}
                className="flex flex-col items-center gap-1.5 text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
                  <RotateCcw className="w-6 h-6 text-white" />
                </div>
                <span className="text-xs font-semibold">إعادة</span>
              </button>

              {/* Confirm / Use Video Button */}
              <button
                type="button"
                onClick={handleConfirmVideo}
                className="flex flex-col items-center gap-1.5 text-[#f2c879] hover:text-[#e0b86a] transition-colors cursor-pointer"
              >
                <div className="w-16 h-16 rounded-full bg-[#f2c879] text-[#04202b] flex items-center justify-center shadow-[0_4px_20px_rgba(242,200,121,0.5)] active:scale-95 transition-transform">
                  <Check className="w-8 h-8 stroke-[3]" />
                </div>
                <span className="text-xs font-bold text-white">استخدم الفيديو</span>
              </button>
            </div>
          ) : (
            /* Main Record Trigger Button */
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={handleRecordButtonClick}
                disabled={!isCameraActive || countdownValue !== null}
                className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer border-4 ${
                  isRecording
                    ? 'border-red-500 bg-red-600/30'
                    : 'border-white bg-transparent hover:border-[#f2c879]'
                }`}
                aria-label={isRecording ? 'إيقاف التسجيل' : 'بدء التسجيل'}
              >
                <div
                  className={`transition-all duration-200 ${
                    isRecording
                      ? 'w-7 h-7 rounded-md bg-red-600 shadow-md'
                      : 'w-16 h-16 rounded-full bg-[#ff6b5b] shadow-[0_4px_16px_rgba(255,107,91,0.6)]'
                  }`}
                />
              </button>

              <span className="text-[11px] text-white/70 font-semibold drop-shadow">
                {isRecording
                  ? 'اضغط للإيقاف'
                  : useCountdown
                  ? 'تسجيل بمؤقت (3 ثوانٍ)'
                  : 'اضغط لبدء التسجيل'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
