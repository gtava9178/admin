import React from 'react';
import { Compass, Users, Plus, Bookmark, MessageSquare, User as UserIcon } from 'lucide-react';

export type TabType = 'all' | 'fol' | 'sav';

interface BottomNavProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  onOpenPublish: () => void;
  onOpenMessages: () => void;
  onOpenAccount: () => void;
  unreadCount: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onTabChange,
  onOpenPublish,
  onOpenMessages,
  onOpenAccount,
  unreadCount,
}) => {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-[#04202b]/95 backdrop-blur-md border-t border-white/10 flex items-center justify-around py-1.5 px-2 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
      {/* 1. For You / All */}
      <button
        type="button"
        onClick={() => onTabChange('all')}
        className={`flex flex-col items-center justify-center gap-1 min-w-[50px] py-1 cursor-pointer transition-colors ${
          currentTab === 'all' ? 'text-[#f2c879] opacity-100 font-bold' : 'text-[#e8f6f3] opacity-60 hover:opacity-90'
        }`}
      >
        <Compass className="w-5 h-5" />
        <span className="text-[11px]">لك</span>
      </button>

      {/* 2. Following */}
      <button
        type="button"
        onClick={() => onTabChange('fol')}
        className={`flex flex-col items-center justify-center gap-1 min-w-[50px] py-1 cursor-pointer transition-colors ${
          currentTab === 'fol' ? 'text-[#f2c879] opacity-100 font-bold' : 'text-[#e8f6f3] opacity-60 hover:opacity-90'
        }`}
      >
        <Users className="w-5 h-5" />
        <span className="text-[11px]">المتابَعون</span>
      </button>

      {/* 3. Center Upload Video Button */}
      <button
        type="button"
        onClick={onOpenPublish}
        className="mx-1 bg-[#ff6b5b] hover:bg-[#ff5542] text-white rounded-2xl w-14 h-9 flex items-center justify-center shadow-lg active:scale-95 transition-all cursor-pointer border border-white/20"
        aria-label="انشر فيديو"
      >
        <Plus className="w-6 h-6 stroke-[2.5]" />
      </button>

      {/* 4. Bookmarks / Saved */}
      <button
        type="button"
        onClick={() => onTabChange('sav')}
        className={`flex flex-col items-center justify-center gap-1 min-w-[50px] py-1 cursor-pointer transition-colors ${
          currentTab === 'sav' ? 'text-[#f2c879] opacity-100 font-bold' : 'text-[#e8f6f3] opacity-60 hover:opacity-90'
        }`}
      >
        <Bookmark className="w-5 h-5" />
        <span className="text-[11px]">المحفوظات</span>
      </button>

      {/* 5. Messages */}
      <button
        type="button"
        onClick={onOpenMessages}
        className="relative flex flex-col items-center justify-center gap-1 min-w-[50px] py-1 text-[#e8f6f3] opacity-60 hover:opacity-90 transition-colors cursor-pointer"
      >
        <MessageSquare className="w-5 h-5" />
        <span className="text-[11px]">الرسائل</span>
        {unreadCount > 0 && (
          <span className="absolute top-0 right-2 min-w-[18px] h-[18px] rounded-full bg-[#ff6b5b] text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-md">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* 6. Account */}
      <button
        type="button"
        onClick={onOpenAccount}
        className="flex flex-col items-center justify-center gap-1 min-w-[50px] py-1 text-[#e8f6f3] opacity-60 hover:opacity-90 transition-colors cursor-pointer"
      >
        <UserIcon className="w-5 h-5" />
        <span className="text-[11px]">حسابي</span>
      </button>
    </nav>
  );
};
