import React, { useState } from 'react';
import { Download, Smartphone, Apple, Check, Share2, Copy, X, Sparkles, ExternalLink } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'pill' | 'button' | 'card' | 'compact';
  onToast?: (msg: string) => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'compact',
  onToast,
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [activeGuideTab, setActiveGuideTab] = useState<'ios' | 'android'>(isIOS ? 'ios' : 'android');
  const [copied, setCopied] = useState(false);

  // If already running as an installed PWA on the home screen, hide
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isInstallable) {
      const ok = await install();
      if (ok && onToast) {
        onToast('جارٍ تثبيت تطبيق بحرك على هاتفك! 🚀');
      }
    } else {
      setShowGuideModal(true);
    }
  };

  const handleCopyLink = async () => {
    try {
      const url = window.location.origin;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (onToast) onToast('تم نسخ رابط التطبيق! شاركه لفتحه على هاتفك 📲');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
  };

  return (
    <>
      {/* 1. Compact header button variant */}
      {variant === 'compact' && (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-[#1d9aa3]/40 to-[#0b4a5a]/80 hover:from-[#1d9aa3]/70 hover:to-[#0b4a5a] text-[#f2c879] border border-[#f2c879]/40 text-xs font-semibold backdrop-blur-md shadow-sm transition-all active:scale-95 cursor-pointer ${className}`}
          title="تحميل التطبيق على الهاتف"
        >
          <Download className="w-3.5 h-3.5 text-[#f2c879]" />
          <span>تثبيت التطبيق</span>
        </button>
      )}

      {/* 2. Full Pill variant */}
      {variant === 'pill' && (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-[#f2c879] hover:bg-[#e0b86a] text-[#04202b] font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer ${className}`}
        >
          <Smartphone className="w-4 h-4" />
          <span>تثبيت «بحرك» على هاتفك</span>
        </button>
      )}

      {/* 3. Card variant (used in Account Modal / Settings) */}
      {variant === 'card' && (
        <div className={`bg-gradient-to-br from-[#0b4a5a] to-[#04202b] p-4 rounded-2xl border border-[#f2c879]/30 text-right shadow-md ${className}`}>
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-[#04202b] border border-[#f2c879]/40 flex items-center justify-center text-[#f2c879] shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-white text-sm">تطبيق بحرك على الهاتف</h4>
                <p className="text-[11px] text-white/70">تصفح أسرع، بدون متصفح، وشاشة كاملة</p>
              </div>
            </div>
            <span className="bg-[#f2c879]/20 text-[#f2c879] text-[10px] font-bold px-2 py-0.5 rounded-full border border-[#f2c879]/40">
              PWA مجاني
            </span>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-white/10">
            {isInstallable ? (
              <button
                type="button"
                onClick={handleInstallClick}
                className="flex-1 bg-[#ff6b5b] hover:bg-[#ff5542] text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow"
              >
                <Download className="w-4 h-4" />
                <span>تثبيت فوري الآن</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowGuideModal(true)}
                className="flex-1 bg-[#f2c879] hover:bg-[#e0b86a] text-[#04202b] font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow"
              >
                <Download className="w-4 h-4" />
                <span>طريقة التحميل على الهاتف</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyLink}
              className="bg-white/10 hover:bg-white/20 text-white font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1 transition-all cursor-pointer border border-white/10"
              title="نسخ الرابط"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'تم النسخ' : 'نسخ الرابط'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Installation Guide Modal (Supports both iPhone Safari and Android Chrome) */}
      {showGuideModal && (
        <div
          onClick={() => setShowGuideModal(false)}
          className="fixed inset-0 z-50 bg-[#04202b]/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#0b4a5a] border border-[#f2c879]/40 rounded-3xl p-5 shadow-2xl text-right text-[#e8f6f3] flex flex-col space-y-4 max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#f2c879] text-[#04202b] flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">تحميل وتثبيت «بحرك» على هاتفك</h3>
                  <p className="text-[11px] text-white/60">يعمل كتطبيق أصلي سريع بدون متجر</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Platform Selector Tabs */}
            <div className="flex items-center bg-[#04202b] p-1 rounded-2xl border border-white/10">
              <button
                type="button"
                onClick={() => setActiveGuideTab('android')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeGuideTab === 'android'
                    ? 'bg-[#f2c879] text-[#04202b] shadow'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>أندرويد (Android / Chrome)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveGuideTab('ios')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeGuideTab === 'ios'
                    ? 'bg-[#f2c879] text-[#04202b] shadow'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                <Apple className="w-4 h-4" />
                <span>آيفون (iPhone - Safari)</span>
              </button>
            </div>

            {/* Tab 1: Android Instructions */}
            {activeGuideTab === 'android' && (
              <div className="space-y-3 bg-[#04202b]/60 p-4 rounded-2xl border border-white/10">
                {isInstallable && (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await install();
                      if (ok) setShowGuideModal(false);
                    }}
                    className="w-full bg-[#ff6b5b] hover:bg-[#ff5542] text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg mb-2 cursor-pointer transition-all active:scale-95"
                  >
                    <Download className="w-4 h-4" />
                    <span>اضغط هنا لتثبيت التطبيق مباشرة</span>
                  </button>
                )}

                <h4 className="font-bold text-sm text-[#f2c879] flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  <span>خطوات التثبيت على أجهزة أندرويد:</span>
                </h4>

                <ol className="space-y-2.5 text-xs text-white/90 leading-relaxed pr-2 list-decimal list-inside">
                  <li>
                    افتح هذا الرابط في متصفح <strong className="text-white">Google Chrome</strong> على هاتفك.
                  </li>
                  <li>
                    اضغط على أيقونة القائمة <strong className="text-[#f2c879]">الثلاث نقاط (⋮)</strong> في أعلى أو أسفل الشاشة.
                  </li>
                  <li>
                    اختر <strong className="text-[#f2c879]">«تثبيت التطبيق» (Install App)</strong> أو <strong className="text-[#f2c879]">«إضافة إلى الشاشة الرئيسية»</strong>.
                  </li>
                  <li>
                    اضغط <strong className="text-white">تثبيت (Install)</strong>، وسيظهر تطبيق «بحرك» فوراً مع بقية تطبيقاتك على الهاتف!
                  </li>
                </ol>
              </div>
            )}

            {/* Tab 2: iPhone iOS Instructions */}
            {activeGuideTab === 'ios' && (
              <div className="space-y-3 bg-[#04202b]/60 p-4 rounded-2xl border border-white/10">
                <h4 className="font-bold text-sm text-[#f2c879] flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  <span>خطوات التثبيت على أجهزة آيفون وآيباد:</span>
                </h4>

                <ol className="space-y-3 text-xs text-white/90 leading-relaxed pr-2">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#f2c879] text-[#04202b] font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                      ١
                    </span>
                    <span>
                      افتح رابط التطبيق في متصفح <strong className="text-white">Safari</strong> (وليس من داخل متصفح إنستغرام أو متصفحات أخرى).
                    </span>
                  </li>

                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#f2c879] text-[#04202b] font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                      ٢
                    </span>
                    <span>
                      اضغط على زر <strong className="text-[#f2c879]">المشاركة (Share)</strong> في شريط سفاري السفلي (المربع الذي يخرج منه سهم ⬆️).
                    </span>
                  </li>

                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#f2c879] text-[#04202b] font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                      ٣
                    </span>
                    <span>
                      مرر القائمة لأسفل واختر <strong className="text-[#f2c879]">«إضافة إلى الشاشة الرئيسية» (Add to Home Screen)</strong>.
                    </span>
                  </li>

                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#f2c879] text-[#04202b] font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                      ٤
                    </span>
                    <span>
                      اضغط على زر <strong className="text-white">إضافة (Add)</strong> بأعلى الزاوية. سينزل تطبيق «بحرك» على شاشة هاتفك مثل تطبيقات App Store!
                    </span>
                  </li>
                </ol>
              </div>
            )}

            {/* App Link Sharing */}
            <div className="bg-[#04202b] p-3 rounded-2xl border border-white/10 space-y-2">
              <span className="text-[11px] text-white/70 block">
                رابط التطبيق لفتحه على هاتفك:
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={window.location.origin}
                  className="flex-1 bg-[#0b4a5a]/50 text-white/90 text-xs px-3 py-2 rounded-xl border border-white/10 outline-none dir-ltr truncate"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="bg-[#f2c879] hover:bg-[#e0b86a] text-[#04202b] font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1 transition-all cursor-pointer shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'تم النسخ' : 'نسخ'}</span>
                </button>
              </div>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-2.5 rounded-full text-xs transition-colors cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}
    </>
  );
};
