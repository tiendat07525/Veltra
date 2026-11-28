'use client';

import React, { useMemo, useState } from 'react';
import { useChat } from '@/hooks/use-chat';
import { useTheme } from '@/hooks/use-theme';
import { useMobile } from '@/hooks/use-mobile';
import { usePageVisible } from '@/hooks/use-page-visible';
import { useSocket } from '@/hooks/use-socket/use-socket';
import { useRouter, usePathname, useSearchParams } from '@/lib/navigation';
import { MainSidebar, NavTab } from '@/components/layout/MainSidebar';
import { ChatTab } from '@/components/layout/ChatTab';
import { ConnectionBanner } from '@/components/layout/ConnectionBanner';
import { ContactsView, ContactsTab } from '@/components/contacts/ContactsView';
import { NotificationsView } from '@/components/common/NotificationsView';
import { SettingsView } from '@/components/common/SettingsView';
import { ProfileView } from '@/components/profile/ProfileView';
import { AuthView } from '@/components/common/AuthView';
import { UserBasicInfo } from '@/types/user';
import { Loader2 } from 'lucide-react';
import { useAuthBootstrap } from '@/hooks/use-auth-bootstrap';
import { useNotifications } from '@/hooks/use-notifications';
import { useBrowserNotifications } from '@/hooks/use-browser-notifications';
import { useSettings } from '@/hooks/use-settings';
import { NotificationItem } from '@/types/notification';

export function VeltraClientApp() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { theme, resolvedTheme, toggleTheme, setTheme } = useTheme();
  const { isMobile } = useMobile();
  // Socket.IO infrastructure - tied directly to authentication lifecycle
  const { isConnected } = useSocket();

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

  // Authentication state (silent refresh + redirects)
  const { isInitializing, isAuthenticated, markAuthenticated, logout } = useAuthBootstrap(pathname);

  const authReady = !isInitializing && isAuthenticated;
  const settingsHook = useSettings(authReady);
  const { mutedConversationIds: mutedList } = settingsHook.settings;
  const mutedConversationIds = useMemo(() => new Set(mutedList), [mutedList]);
  // The open conversation is on screen: chat tab, page visible, and on phones the chat (not the list)
  const pageVisible = usePageVisible();
  const viewingChat = activeTab === 'chat' && pageVisible && (!isMobile || mobileViewChat);
  const chat = useChat(authReady, undefined, mutedConversationIds, viewingChat);
  const notifications = useNotifications(authReady);

  // ChatTab shows a failure under the chat header
  const setConversationMuted = (conversationId: string, muted: boolean) =>
    settingsHook.setMuted(conversationId, muted).catch((err: unknown) => {
      const apiErr = err as { response?: { data?: { message?: string } } };
      throw new Error(apiErr?.response?.data?.message || 'Không thể thay đổi thông báo của cuộc trò chuyện');
    });

  // Start / open a chat from the friend list; ContactsView shows a failure under the row
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
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } } };
      throw new Error(apiErr?.response?.data?.message || 'Không thể mở cuộc trò chuyện');
    }
  };

  const openConversation = (conversationId: string) => {
    chat.setActiveConversationId(conversationId);
    router.push('/chat');
    if (isMobile) setMobileViewChat(true);
  };

  // Opening a notification marks it read and goes where it points to
  const handleOpenNotification = (item: NotificationItem) => {
    if (!item.isRead) {
      notifications.markAsRead(item._id).catch(() => {
        // Stays unread; the user can retry
      });
    }
    switch (item.type) {
      case 'friend_request':
        router.push('/contacts?tab=requests');
        break;
      case 'friend_accepted':
        router.push('/contacts?tab=friends');
        break;
      case 'group_added':
      case 'group_owner':
        if (item.conversationId) openConversation(item.conversationId);
        break;
      default:
        // group_removed: nothing to open
        break;
    }
  };

  // System notifications while the tab is hidden + "(N)" in the tab title
  const browserNotifications = useBrowserNotifications({
    enabled: authReady,
    currentUserId: chat.currentUser?._id ?? null,
    conversations: chat.allConversations,
    // A conversation counts as "open" only while the chat tab shows it
    activeConversationId: activeTab === 'chat' ? chat.activeConversationId : null,
    settings: settingsHook.settings,
    mutedConversationIds,
    unreadTotal: authReady ? chat.totalUnreadCount + notifications.unreadCount : 0,
    onOpenConversation: openConversation,
    onOpenNotification: handleOpenNotification,
  });

  // Contacts sub-tab from the URL (?tab=requests), e.g. opened from a notification
  const contactsTabParam = searchParams.get('tab');
  const contactsTab: ContactsTab | undefined =
    contactsTabParam === 'friends' || contactsTabParam === 'requests' || contactsTabParam === 'search'
      ? contactsTabParam
      : undefined;

  // Initializing state (hydration safe)
  if (isInitializing) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-app">
        <div className="flex flex-col items-center gap-3" role="status">
          <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />
          <p className="text-xs text-fg-muted">Đang khởi tạo...</p>
        </div>
      </div>
    );
  }

  // If not authenticated
  if (!isAuthenticated) {
    return (
      <AuthView
        initialMode={pathname === '/auth/register' ? 'register' : 'login'}
        onLoginSuccess={() => {
          markAuthenticated();
          router.replace('/chat');
        }}
      />
    );
  }

  // Loading current user
  if (chat.currentUserLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-app">
        <div className="flex flex-col items-center gap-3" role="status">
          <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />
          <p className="text-xs text-fg-muted">Đang tải...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-full w-full bg-app text-fg overflow-hidden select-none font-sans">
      {/* Navigation: left rail on desktop, bottom bar on mobile (hidden while a conversation is open) */}
      <MainSidebar
        currentUser={chat.currentUser}
        unreadMessagesCount={chat.totalUnreadCount}
        unreadNotificationsCount={notifications.unreadCount}
        resolvedTheme={resolvedTheme}
        onToggleTheme={toggleTheme}
        onLogout={logout}
        hideMobileNav={isMobile && activeTab === 'chat' && mobileViewChat}
      />

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 md:h-full flex overflow-hidden relative">
        <ConnectionBanner isConnected={isConnected} />

        {/* Chat Tab: 3-column layout */}
        {activeTab === 'chat' && (
          <ChatTab
            chat={chat}
            isMobile={isMobile}
            mobileViewChat={mobileViewChat}
            setMobileViewChat={setMobileViewChat}
            enterToSend={settingsHook.settings.chat.enterToSend}
            mutedConversationIds={mutedConversationIds}
            onSetMuted={setConversationMuted}
          />
        )}

        {/* Contacts Tab */}
        {activeTab === 'contacts' && (
          <ContactsView
            currentUserId={chat.currentUser?._id}
            initialTab={contactsTab}
            onStartChat={handleStartChatFromContact}
            onlineIds={chat.presence.onlineIds}
          />
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <NotificationsView
            notifications={notifications}
            onOpen={handleOpenNotification}
            browserPermission={browserNotifications.permission}
            onEnableBrowserNotifications={browserNotifications.requestPermission}
          />
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <SettingsView
            theme={theme}
            onThemeChange={(newTheme) => setTheme(newTheme)}
            settingsHook={settingsHook}
            browserPermission={browserNotifications.permission}
            onRequestBrowserPermission={browserNotifications.requestPermission}
            onLogout={logout}
          />
        )}

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <ProfileView currentUser={chat.currentUser} onProfile={chat.updateCurrentUser} />
        )}
      </main>
    </div>
  );
}
