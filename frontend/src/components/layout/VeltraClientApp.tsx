'use client';

import React, { useState, useEffect } from 'react';
import { useChat } from '@/hooks/use-chat';
import { useTheme } from '@/hooks/use-theme';
import { useMobile } from '@/hooks/use-mobile';
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
import { CallModal } from '@/components/chat/CallModal';
import { User } from '@/types/user';
import { Message } from '@/types/message';

export function VeltraClientApp() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggleTheme, setTheme } = useTheme();
  const isMobile = useMobile();
  const chat = useChat();

  // Determine active tab from pathname
  const getTabFromPath = (path: string): NavTab => {
    if (path.startsWith('/contacts')) return 'contacts';
    if (path.startsWith('/notifications')) return 'notifications';
    if (path.startsWith('/settings')) return 'settings';
    if (path.startsWith('/profile')) return 'profile';
    return 'chat';
  };

  const [activeTab, setActiveTab] = useState<NavTab>(() => getTabFromPath(pathname));

  useEffect(() => {
    setActiveTab(getTabFromPath(pathname));
  }, [pathname]);

  // Mobile navigation state
  const [mobileViewChat, setMobileViewChat] = useState<boolean>(false);

  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !pathname.startsWith('/auth') && !pathname.startsWith('/register');
  });

  useEffect(() => {
    if (pathname.startsWith('/auth') || pathname.startsWith('/register')) {
      setIsAuthenticated(false);
    }
  }, [pathname]);

  // Toast state
  const [toast, setToast] = useState<{
    id: string;
    message: string;
    type?: 'success' | 'error' | 'info';
  } | null>(null);

  // Global Call State
  const [activeCall, setActiveCall] = useState<{
    type: 'voice' | 'video';
    contactName: string;
    contactAvatar: string;
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({
      id: String(Date.now()),
      message,
      type,
    });
  };

  // Navigation tab handler
  const handleTabChange = (tab: NavTab) => {
    setActiveTab(tab);
    if (tab === 'chat') {
      setMobileViewChat(false);
      router.push('/chat');
    } else {
      router.push(`/${tab}`);
    }
  };

  // Select conversation
  const handleSelectConversation = (id: string) => {
    chat.setActiveConversationId(id);
    if (isMobile) {
      setMobileViewChat(true);
    }
  };

  // Handle starting chat from contact
  const handleStartChatFromContact = async (contact: User) => {
    const existing = chat.allConversations.find(
      (c) => c.type === 'direct' && c.participants.includes(contact.id)
    );

    if (existing) {
      chat.setActiveConversationId(existing.id);
    } else {
      const newConv = await chat.createNewConversation({
        type: 'direct',
        name: contact.displayName,
        participants: [chat.currentUser.id, contact.id],
        avatar: contact.avatar,
      });
      chat.setActiveConversationId(newConv.id);
    }

    setActiveTab('chat');
    router.push('/chat');
    if (isMobile) {
      setMobileViewChat(true);
    }
    showToast(`Opened chat with ${contact.displayName}`, 'info');
  };

  // Handle forward message
  const handleForwardMessage = async (targetConvId: string, message: Message) => {
    await chat.messagesHook.sendMessage({
      content: message.content,
      type: message.type,
      mediaUrl: message.mediaUrl,
      fileName: message.fileName,
      fileSize: message.fileSize,
      fileType: message.fileType,
      duration: message.duration,
    });
    chat.setActiveConversationId(targetConvId);
    showToast('Message forwarded', 'success');
  };

  // If on login/register view
  if (!isAuthenticated) {
    return (
      <AuthView
        onLoginSuccess={() => {
          setIsAuthenticated(true);
          router.push('/chat');
          showToast('Welcome back to Veltra', 'success');
        }}
      />
    );
  }

  return (
    <div className="flex h-full w-full bg-slate-950 text-slate-100 overflow-hidden select-none font-sans">
      {/* 1. Global Left Navigation Rail */}
      <MainSidebar
        activeTab={activeTab}
        onNavigate={handleTabChange}
        unreadMessagesCount={chat.totalUnreadCount}
        unreadNotificationsCount={3}
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogout={() => {
          setIsAuthenticated(false);
          router.push('/auth/login');
          showToast('Logged out of Veltra workspace', 'info');
        }}
      />

      {/* 2. Main Content Area */}
      <main className="flex-1 h-full flex overflow-hidden relative">
        {/* Chat Tab: 3-column layout */}
        {activeTab === 'chat' && (
          <div className="flex-1 h-full flex overflow-hidden">
            {/* Conversation List Sidebar (Hidden on mobile when chat is active) */}
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
                participantsMap={chat.participantsMap}
                onTogglePin={chat.togglePin}
                onToggleMute={chat.toggleMute}
                onCreateNewConversation={async (params) => {
                  const newConv = await chat.createNewConversation(params);
                  chat.setActiveConversationId(newConv.id);
                  if (isMobile) {
                    setMobileViewChat(true);
                  }
                  showToast(`Conversation "${params.name}" created`, 'success');
                }}
              />
            </div>

            {/* Chat Window (Hidden on mobile when list is active) */}
            <div
              className={`flex-1 h-full overflow-hidden ${
                !mobileViewChat && isMobile ? 'hidden' : 'flex'
              }`}
            >
              <ChatWindow
                conversation={chat.activeConversation}
                allConversations={chat.allConversations}
                partner={chat.conversationPartner}
                participantsMap={chat.participantsMap}
                messages={chat.messagesHook.messages}
                loadingMessages={chat.messagesHook.loading}
                isTyping={chat.messagesHook.isTyping}
                typingUser={chat.messagesHook.typingUser}
                onSendMessage={chat.messagesHook.sendMessage}
                onReact={chat.messagesHook.toggleReaction}
                onEditMessage={chat.messagesHook.sendMessage}
                onDeleteMessage={chat.messagesHook.deleteMessage}
                onTogglePinMessage={chat.messagesHook.togglePinMessage}
                onForwardMessage={handleForwardMessage}
                onBackMobile={() => setMobileViewChat(false)}
                onToggleMuteConversation={chat.toggleMute}
                onShowToast={showToast}
              />
            </div>
          </div>
        )}

        {/* Contacts Tab */}
        {activeTab === 'contacts' && (
          <ContactsView
            onStartChat={handleStartChatFromContact}
            onVoiceCall={(user) =>
              setActiveCall({
                type: 'voice',
                contactName: user.displayName,
                contactAvatar: user.avatar,
              })
            }
            onVideoCall={(user) =>
              setActiveCall({
                type: 'video',
                contactName: user.displayName,
                contactAvatar: user.avatar,
              })
            }
          />
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <NotificationsView
            onOpenConversation={(convId) => {
              chat.setActiveConversationId(convId);
              setActiveTab('chat');
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

      {/* Global Call Modal if triggered */}
      {activeCall && (
        <CallModal
          isOpen={true}
          type={activeCall.type}
          contactName={activeCall.contactName}
          contactAvatar={activeCall.contactAvatar}
          onEndCall={() => {
            setActiveCall(null);
            showToast('Call ended', 'info');
          }}
        />
      )}

      {/* Toast Notification Container */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 animate-in slide-in-from-bottom-5">
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
