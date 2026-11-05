import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

interface AudioVoiceMessageProps {
  audioUrl: string;
  duration?: number;
  isMe?: boolean;
}

export const AudioVoiceMessage: React.FC<AudioVoiceMessageProps> = ({
  audioUrl,
  duration: initialDuration,
  isMe = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(initialDuration || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const onLoadedMetadata = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setTotalDuration(audio.duration);
      }
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audioRef.current = null;
    };
  }, [audioUrl]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.playbackRate = playbackRate;
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const speeds = [1, 1.5, 2];
    const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const nextRate = speeds[nextIdx];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const formatSeconds = (sec: number) => {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Generate 18 visual waveform bar heights
  const bars = [25, 45, 75, 55, 90, 65, 40, 80, 100, 70, 50, 85, 60, 40, 75, 95, 60, 30];
  const progressRatio = totalDuration > 0 ? currentTime / totalDuration : 0;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="flex flex-col gap-1.5 w-60 sm:w-64 select-none"
    >
      <div className="flex items-center gap-2.5">
        {/* Play/Pause Circle Button */}
        <button
          type="button"
          onClick={togglePlay}
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-md transition-all active:scale-90 cursor-pointer ${
            isMe
              ? 'bg-white text-[#ff6b5b] hover:bg-white/90'
              : 'bg-[#f2c879] text-[#04202b] hover:bg-[#e0b86a]'
          }`}
          aria-label={isPlaying ? 'إيقاف مؤقت' : 'تشغيل التسجيل الصوتي'}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>

        {/* Audio Waveform visualization */}
        <div className="flex-1 flex items-center gap-0.5 h-7 px-1 relative">
          {bars.map((height, i) => {
            const barRatio = i / bars.length;
            const isPassed = barRatio <= progressRatio;

            return (
              <div
                key={i}
                className="flex-1 rounded-full transition-all duration-150"
                style={{
                  height: `${height}%`,
                  backgroundColor: isPassed
                    ? isMe
                      ? '#ffffff'
                      : '#f2c879'
                    : isMe
                    ? 'rgba(255,255,255,0.35)'
                    : 'rgba(232,246,243,0.35)',
                }}
              />
            );
          })}

          {/* Invisible overlay slider for accurate scrubbing */}
          <input
            type="range"
            min={0}
            max={totalDuration || 1}
            step={0.05}
            value={currentTime}
            onChange={handleSeek}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            aria-label="تمرير الصوت"
          />
        </div>

        {/* Speed button */}
        <button
          type="button"
          onClick={cycleSpeed}
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 transition-colors cursor-pointer ${
            isMe
              ? 'border-white/40 text-white hover:bg-white/15'
              : 'border-[#f2c879]/50 text-[#f2c879] hover:bg-[#f2c879]/15'
          }`}
          title="تغيير سرعة الصوت"
        >
          {playbackRate}×
        </button>
      </div>

      {/* Time display */}
      <div className="flex items-center justify-between text-[10px] opacity-75 font-mono px-1">
        <span>{formatSeconds(currentTime)}</span>
        <span>{formatSeconds(totalDuration)}</span>
      </div>
    </div>
  );
};
