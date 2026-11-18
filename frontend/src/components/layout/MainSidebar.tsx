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
  // Theme actually shown (system resolved to light / dark)
  resolvedTheme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLogout: () => void;
  // Mobile: hide the bottom bar (an open conversation takes the full screen)
  hideMobileNav?: boolean;
}

type NavItem = { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number };

const badgeText = (n: number) => (n > 99 ? '99+' : String(n));

/**
 * App navigation. Desktop (≥ 768px): left rail with theme toggle and account menu.
 * Mobile: bottom tab bar with the same 5 tabs; theme and sign-out live in Settings there.
 */
export const MainSidebar: React.FC<MainSidebarProps> = ({
  unreadMessagesCount,
  unreadNotificationsCount,
  resolvedTheme,
  onToggleTheme,
  onLogout,
  hideMobileNav = false,
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

  const navItems: NavItem[] = [
    { id: 'chat', label: 'Tin nhắn', icon: MessageSquare, badge: unreadMessagesCount },
    { id: 'contacts', label: 'Bạn bè', icon: Users },
    { id: 'notifications', label: 'Thông báo', icon: Bell, badge: unreadNotificationsCount },
    { id: 'settings', label: 'Cài đặt', icon: Settings },
    { id: 'profile', label: 'Hồ sơ', icon: User },
  ];

  const isActive = (id: NavTab) => pathname.startsWith(`/${id}`) || (pathname === '/' && id === 'chat');
  const userName = currentUser?.displayName || currentUser?.username || '';

  return (
    <>
      {/* Desktop: left rail */}
      <aside className="hidden md:flex order-first w-18 h-full bg-surface border-r border-line flex-col items-center justify-between py-4 shrink-0 z-30 select-none">
        <div className="flex flex-col items-center gap-6">
          <Link href="/chat" className="group flex flex-col items-center rounded-2xl" title="Veltra">
            <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center transition-transform group-hover:scale-105 group-active:scale-95">
              <Radio className="w-5 h-5 text-on-primary stroke-[2.5]" aria-hidden="true" />
            </div>
            <span className="text-[10px] font-extrabold tracking-widest text-accent uppercase mt-1">Veltra</span>
          </Link>

          <nav aria-label="Điều hướng chính" className="flex flex-col items-center gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.id);
              return (
                <Link
                  key={item.id}
                  href={`/${item.id}`}
                  aria-current={active ? 'page' : undefined}
                  aria-label={item.badge ? `${item.label} (${item.badge} mới)` : item.label}
                  className={`relative p-3 rounded-2xl transition-colors duration-200 group ${
                    active ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:text-fg hover:bg-surface-2'
                  }`}
                  title={item.label}
                >
                  <Icon className="w-5 h-5 transition-transform group-hover:scale-110" />
                  {!!item.badge && item.badge > 0 && (
                    <span className="absolute top-1.5 right-1.5 min-w-[1.125rem] h-4.5 px-1 rounded-full bg-primary text-on-primary text-[10px] font-bold flex items-center justify-center ring-2 ring-surface">
                      {badgeText(item.badge)}
                    </span>
                  )}
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col items-center gap-3 relative">
          <button
            type="button"
            onClick={onToggleTheme}
            className="p-2.5 rounded-2xl text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
            title={`Chuyển sang chế độ ${resolvedTheme === 'dark' ? 'Sáng' : 'Tối'}`}
            aria-label={`Chuyển sang chế độ ${resolvedTheme === 'dark' ? 'Sáng' : 'Tối'}`}
          >
            {resolvedTheme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowStatusMenu((prev) => !prev)}
              className="rounded-full"
              title={userName}
              aria-label="Tài khoản"
              aria-expanded={showStatusMenu}
            >
              <UserAvatar src={currentUser?.avatarUrl || ''} name={userName} size="sm" />
            </button>

            {showStatusMenu && (
              <div className="absolute bottom-full mb-2 left-0 w-48 p-1.5 bg-surface border border-line rounded-2xl shadow-xl z-50 text-xs text-fg flex flex-col gap-1">
                <div className="px-2.5 py-1.5 border-b border-line">
                  <p className="font-semibold truncate">{userName}</p>
                  <p className="text-[11px] text-fg-muted truncate">@{currentUser?.username || ''}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowStatusMenu(false);
                    onLogout();
                  }}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-danger hover:bg-danger-soft transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile: bottom tab bar */}
      {!hideMobileNav && (
        <nav
          aria-label="Điều hướng chính"
          className="md:hidden order-last shrink-0 z-30 bg-surface border-t border-line pb-[env(safe-area-inset-bottom)] select-none"
        >
          <ul className="grid grid-cols-5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.id);
              return (
                <li key={item.id}>
                  <Link
                    href={`/${item.id}`}
                    aria-current={active ? 'page' : undefined}
                    aria-label={item.badge ? `${item.label} (${item.badge} mới)` : item.label}
                    className={`relative flex flex-col items-center justify-center gap-0.5 h-14 text-[10px] font-semibold transition-colors ${
                      active ? 'text-accent' : 'text-fg-muted active:text-fg'
                    }`}
                  >
                    <span
                      className={`relative flex items-center justify-center w-12 h-7 rounded-full transition-colors ${
                        active ? 'bg-accent-soft' : ''
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      {!!item.badge && item.badge > 0 && (
                        <span className="absolute -top-1 right-0.5 min-w-[1.125rem] h-4.5 px-1 rounded-full bg-primary text-on-primary text-[10px] font-bold flex items-center justify-center ring-2 ring-surface">
                          {badgeText(item.badge)}
                        </span>
                      )}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </>
  );
};
