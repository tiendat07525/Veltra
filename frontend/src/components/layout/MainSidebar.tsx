'use client';

import React, { useState, useEffect } from 'react';
import { Link, usePathname } from '@/lib/navigation';
import {
  MessageSquare,
  Users,
  Bell,
  Settings,
  User,
  Sun,
  Moon,
  LogOut,
  Radio,
} from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { CurrentUserProfile } from '@/types/user';
import { authService } from '@/services/api/auth.service';

export type NavTab = 'chat' | 'contacts' | 'notifications' | 'settings' | 'profile';

interface MainSidebarProps {
  unreadMessagesCount: number;
  unreadNotificationsCount: number;
  theme: 'dark' | 'light' | 'system';
  onToggleTheme: () => void;
  onLogout: () => void;
}

export const MainSidebar: React.FC<MainSidebarProps> = ({
  unreadMessagesCount,
  unreadNotificationsCount,
  theme,
  onToggleTheme,
  onLogout,
}) => {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUserProfile | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    authService
      .getCurrentUser()
      .then((user) => setCurrentUser(user))
      .catch((err) => console.error('Lỗi khi lấy thông tin user:', err));
  }, []);

  const navItems: { id: NavTab; label: string; icon: any; badge?: number }[] = [
    { id: 'chat', label: 'Tin nhắn', icon: MessageSquare, badge: unreadMessagesCount },
    { id: 'contacts', label: 'Bạn bè', icon: Users },
    { id: 'notifications', label: 'Thông báo', icon: Bell, badge: unreadNotificationsCount },
    { id: 'settings', label: 'Cài đặt', icon: Settings },
    { id: 'profile', label: 'Trang cá nhân', icon: User },
  ];

  return (
    <aside className="w-16 sm:w-18 h-full bg-slate-900 border-r border-slate-800 flex flex-col items-center justify-between py-4 shrink-0 z-30 select-none">
      {/* Top: Brand Logo */}
      <div className="flex flex-col items-center gap-6">
        <Link
          href="/chat"
          className="group flex flex-col items-center focus:outline-hidden"
          title="Veltra Realtime Messaging"
        >
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-sky-500/25 transition-transform group-hover:scale-105 group-active:scale-95">
            <Radio className="w-5 h-5 text-white stroke-[2.5]" />
          </div>
          <span className="text-[10px] font-extrabold tracking-widest text-sky-400 uppercase mt-1">
            VELTRA
          </span>
        </Link>

        {/* Primary Navigation Icons */}
        <nav className="flex flex-col items-center gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname.startsWith(`/${item.id}`) || (pathname === '/' && item.id === 'chat') || (pathname === '/chat' && item.id === 'chat');
            return (
              <Link
                key={item.id}
                href={`/${item.id}`}
                className={`relative p-3 rounded-2xl transition-all duration-200 group focus:outline-hidden ${
                  isActive
                    ? 'bg-sky-500/15 text-sky-400 shadow-xs'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/80'
                }`}
                title={item.label}
              >
                <Icon className="w-5 h-5 transition-transform group-hover:scale-110" />

                {/* Badge Indicator */}
                {!!item.badge && item.badge > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-[1.125rem] h-4.5 px-1 rounded-full bg-sky-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-slate-900">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}

                {/* Active Indicator bar */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-sky-400 rounded-r-full" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Controls: Theme + User Avatar */}
      <div className="flex flex-col items-center gap-3 relative">
        {/* Dark/Light mode toggle */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="p-2.5 rounded-2xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title={`Chuyển sang chế độ ${theme === 'dark' ? 'Sáng' : 'Tối'}`}
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5 text-amber-400" />
          ) : (
            <Moon className="w-5 h-5 text-sky-400" />
          )}
        </button>

        {/* User Avatar with quick menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowStatusMenu((prev) => !prev)}
            className="focus:outline-hidden"
            title={currentUser?.displayName || currentUser?.username || ''}
          >
            <UserAvatar
              src={currentUser?.avatarUrl || ''}
              name={currentUser?.displayName || currentUser?.username || ''}
              size="sm"
            />
          </button>

          {/* Quick menu dropdown */}
          {showStatusMenu && (
            <div className="absolute bottom-full mb-2 left-0 w-44 p-1.5 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-xl z-50 text-xs text-slate-200 flex flex-col gap-1">
              <div className="px-2.5 py-1.5 border-b border-slate-800">
                <p className="font-semibold text-white truncate">
                  {currentUser?.displayName || currentUser?.username || ''}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  @{currentUser?.username || ''}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowStatusMenu(false);
                  onLogout();
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-rose-950/40 text-rose-400 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Đăng xuất</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
