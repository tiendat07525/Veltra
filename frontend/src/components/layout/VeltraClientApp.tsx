'use client';

import React, { useState, useEffect } from 'react';
import { useChat } from '@/hooks/use-chat';
import { useTheme } from '@/hooks/use-theme';
import { useMobile } from '@/hooks/use-mobile';
import { useSocket } from '@/hooks/use-socket/use-socket';
import { useRouter, usePathname } from '@/lib/navigation';
import { MainSidebar, NavTab } from '@/components/layout/MainSidebar';
import { ConversationSidebar } from '@/components/conversation/ConversationSidebar';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { ContactsView } from '@/components/contacts/ContactsView';
import { NotificationsView } from '@/components/common/NotificationsView';
import { SettingsView } from '@/components/common/SettingsView';
import { ProfileView } from '@/components/profile/ProfileView';
import { AuthView } from '@/components/common/AuthView';
import { Toast } from '@/components/ui/Toast';
import { UserBasicInfo } from '@/types/user';
import { Loader2 } from 'lucide-react';

export function VeltraClientApp() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggleTheme, setTheme } = useTheme();
  const { isMobile } = useMobile();
  const chat = useChat();

  // Socket.IO infrastructure - tied directly to authentication lifecycle
  useSocket();

  // Determine active tab from pathname
  const getTabFromPath = (path: string): NavTab => {
    if (path.startsWith('/contacts')) return 'contacts';
    if (path.startsWith('/notifications')) return 'notifications';
    if (path.startsWith('/settings')) return 'settings';
    if (path.startsWith('/profile')) return 'profile';
    return 'chat';
  };

  const activeTab = getTabFromPath(pathname);

  // Mobile navigation state
  const [mobileViewChat, setMobileViewChat] = useState<boolean>(false);

  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return !!localStorage.getItem('accessToken');
    }
    return false;
  });

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setIsAuthenticated(false);
    } else {
      setIsAuthenticated(true);
      if (pathname === '/' || pathname.startsWith('/auth') || pathname.startsWith('/register')) {
        router.push('/chat');
      }
    }
  }, [pathname, router]);

  // Toast state
  const [toast, setToast] = useState<{
    id: string;
    message: string;
    type?: 'success' | 'error' | 'info';
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({
      id: String(Date.now()),
      message,
      type,
    });
    setTimeout(() => setToast(null), 3000);
  };

  // Select conversation
  const handleSelectConversation = (id: string) => {
    chat.setActiveConversationId(id);
    if (isMobile) {
      setMobileViewChat(true);
    }
  };

  // Handle starting chat from contact (friend)
  const handleStartChatFromContact = async (contact: UserBasicInfo) => {
    try {
      // Check if a direct conversation already exists with this user
      const existing = chat.allConversations.find(
        (c) =>
          c.type === 'direct' &&
          c.participants.some((p) => p._id === contact._id)
      );

      if (existing) {
        chat.setActiveConversationId(existing._id);
      } else {
        // Create a new direct conversation
        const newConv = await chat.createNewConversation({
          type: 'direct',
          participants: [contact._id],
        });
        chat.setActiveConversationId(newConv._id);
      }

      router.push('/chat');
      if (isMobile) {
        setMobileViewChat(true);
      }
      showToast(`Đã mở cuộc trò chuyện với ${contact.displayName || contact.username}`, 'info');
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Lỗi khi tạo cuộc trò chuyện', 'error');
    }
  };

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    setIsAuthenticated(false);
    router.push('/auth/login');
    showToast('Đã đăng xuất khỏi Veltra', 'info');
  };

  // If not authenticated
  if (!isAuthenticated) {
    return (
      <AuthView
        onLoginSuccess={() => {
          setIsAuthenticated(true);
          router.push('/chat');
          showToast('Chào mừng trở lại Veltra!', 'success');
        }}
      />
    );
  }

  // Loading current user
  if (chat.currentUserLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
          <p className="text-xs text-slate-400">Đang tải...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-slate-950 text-slate-100 overflow-hidden select-none font-sans">
      {/* 1. Global Left Navigation Rail */}
      <MainSidebar
        unreadMessagesCount={chat.totalUnreadCount}
        unreadNotificationsCount={0}
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogout={handleLogout}
      />

      {/* 2. Main Content Area */}
      <main className="flex-1 h-full flex overflow-hidden relative">
        {/* Chat Tab: 3-column layout */}
        {activeTab === 'chat' && (
          <div className="flex-1 h-full flex overflow-hidden">
            {/* Conversation List Sidebar */}
            <div
              className={`h-full shrink-0 md:block ${
                mobileViewChat && isMobile ? 'hidden' : 'w-full md:w-80 lg:w-92'
              }`}
            >
              <ConversationSidebar
                conversations={chat.conversations}
                activeConversationId={chat.activeConversationId}
                onSelectConversation={handleSelectConversation}
                searchQuery={chat.searchQuery}
                onSearchChange={chat.setSearchQuery}
                filter={chat.filter}
                onFilterChange={chat.setFilter}
                currentUserId={chat.currentUser?._id || ''}
                onCreateNewConversation={async (params) => {
                  try {
                    const newConv = await chat.createNewConversation(params);
                    chat.setActiveConversationId(newConv._id);
                    if (isMobile) {
                      setMobileViewChat(true);
                    }
                    showToast('Đã tạo cuộc trò chuyện mới', 'success');
                  } catch (err: any) {
                    showToast(err?.response?.data?.message || 'Lỗi tạo cuộc trò chuyện', 'error');
                  }
                }}
              />
            </div>

            {/* Chat Window */}
            <div
              className={`flex-1 h-full overflow-hidden ${
                !mobileViewChat && isMobile ? 'hidden' : 'flex'
              }`}
            >
              <ChatWindow
                conversation={chat.activeConversation}
                conversationName={chat.activeConversationName}
                partner={chat.conversationPartner}
                messages={chat.messagesHook.messages}
                loadingMessages={chat.messagesHook.loading}
                sendingMessage={chat.messagesHook.sending}
                onSendMessage={chat.messagesHook.sendMessage}
                onBackMobile={() => setMobileViewChat(false)}
                onShowToast={showToast}
                currentUserId={chat.currentUser?._id || ''}
                messagesError={chat.messagesHook.error}
                onRefreshMessages={chat.messagesHook.refetch}
              />
            </div>
          </div>
        )}

        {/* Contacts Tab */}
        {activeTab === 'contacts' && (
          <ContactsView
            onStartChat={handleStartChatFromContact}
          />
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <NotificationsView
            onOpenConversation={(convId) => {
              chat.setActiveConversationId(convId);
              router.push('/chat');
              if (isMobile) setMobileViewChat(true);
            }}
          />
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <SettingsView
            theme={theme}
            onThemeChange={(newTheme) => setTheme(newTheme)}
          />
        )}

        {/* Profile Tab */}
        {activeTab === 'profile' && <ProfileView onShowToast={showToast} />}
      </main>

      {/* Toast Notification Container */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50">
          <Toast
            id={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        </div>
      )}
    </div>
  );
}
