import React from 'react';
import { Volume2, VolumeX, Search, X, Waves, Camera } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface TopNavProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  showSoundHint: boolean;
  onDismissSoundHint: () => void;
  onOpenCamera?: () => void;
  onToast?: (msg: string) => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  searchQuery,
  onSearchChange,
  isMuted,
  onToggleMute,
  showSoundHint,
  onDismissSoundHint,
  onOpenCamera,
  onToast,
}) => {
  return (
    <header className="absolute top-0 inset-x-0 z-30 flex items-center justify-between gap-2.5 px-4 py-3 bg-gradient-to-b from-[#04202b]/95 via-[#04202b]/70 to-transparent">
      {/* Brand Logo */}
      <div className="flex items-center gap-2 cursor-pointer select-none">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#0b4a5a] to-[#1d9aa3] flex items-center justify-center shadow-md border border-[#f2c879]/40">
          <Waves className="w-5 h-5 text-[#f2c879]" />
        </div>
        <span className="font-extrabold text-2xl tracking-wide text-[#f2c879] drop-shadow-[0_2px_8px_rgba(242,200,121,0.3)] hidden sm:inline">
          بحرك
        </span>
      </div>

      {/* Search Input */}
      <div className="flex-1 max-w-sm relative">
        <div className="relative flex items-center">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ابحث عن فيديو أو #وسم..."
            className="w-full bg-[#04202b]/80 border border-white/20 focus:border-[#f2c879] rounded-full py-2 pr-9 pl-8 text-sm text-[#e8f6f3] placeholder-[#e8f6f3]/50 focus:outline-none transition-all shadow-inner backdrop-blur-sm"
          />
          <Search className="w-4 h-4 text-[#e8f6f3]/60 absolute right-3 pointer-events-none" />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute left-3 text-white/50 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Actions (PWA Install Button + Camera Quick Launch + Sound Toggle) */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <PWAInstallButton variant="compact" onToast={onToast} />

        {onOpenCamera && (
          <button
            type="button"
            onClick={onOpenCamera}
            className="w-9 h-9 rounded-full bg-[#ff6b5b]/20 hover:bg-[#ff6b5b]/30 text-[#ff6b5b] border border-[#ff6b5b]/50 flex items-center justify-center transition-all cursor-pointer backdrop-blur-md shadow-sm active:scale-95"
            title="كاميرا بحرك (مؤقت 3 ثوانٍ)"
            aria-label="كاميرا التطبيق"
          >
            <Camera className="w-5 h-5" />
          </button>
        )}

        {/* Sound Toggle */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              onToggleMute();
              if (showSoundHint) onDismissSoundHint();
            }}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer backdrop-blur-md border ${
              isMuted
                ? 'bg-[#04202b]/70 border-white/20 text-[#e8f6f3]/80 hover:text-white'
                : 'bg-[#f2c879] border-[#f2c879] text-[#04202b] shadow-md'
            }`}
            aria-label={isMuted ? 'تشغيل الصوت' : 'كتم الصوت'}
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>

          {showSoundHint && (
            <div
              onClick={onDismissSoundHint}
              className="absolute top-12 left-0 whitespace-nowrap bg-[#0b4a5a] text-[#f2c879] text-xs font-semibold px-3 py-1.5 rounded-full border border-[#f2c879]/50 shadow-xl animate-bounce cursor-pointer z-40"
            >
              اضغط لتفعيل الصوت 🔊
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
