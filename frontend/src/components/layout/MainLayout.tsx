'use client';

import React from 'react';
import { MainSidebar } from './MainSidebar';
import { ActiveTab } from '@/types/chat';

interface MainLayoutProps {
  children: React.ReactNode;
  activeTab: ActiveTab;
  onNavigate: (tab: ActiveTab) => void;
  unreadMessagesCount: number;
  unreadNotificationsCount: number;
  theme: 'dark' | 'light' | 'system';
  onToggleTheme: () => void;
  onLogout: () => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  children,
  activeTab,
  onNavigate,
  unreadMessagesCount,
  unreadNotificationsCount,
  theme,
  onToggleTheme,
  onLogout,
}) => {
  return (
    <div className="flex h-full w-full bg-slate-950 text-slate-100 overflow-hidden select-none font-sans">
      <MainSidebar
        activeTab={activeTab}
        onNavigate={onNavigate}
        unreadMessagesCount={unreadMessagesCount}
        unreadNotificationsCount={unreadNotificationsCount}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onLogout={onLogout}
      />
      <main className="flex-1 h-full flex overflow-hidden relative">
        {children}
      </main>
    </div>
  );
};
