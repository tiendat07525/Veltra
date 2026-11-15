'use client';

import React, { useState } from 'react';
import { useChat } from '@/hooks/use-chat';
import { ConversationSidebar } from '@/components/conversation/ConversationSidebar';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { GroupInfoPanel } from '@/components/conversation/GroupInfoPanel';

interface ChatTabProps {
  chat: ReturnType<typeof useChat>;
  isMobile: boolean;
  // Mobile: chat window shown instead of the list (also set by other tabs before opening /chat)
  mobileViewChat: boolean;
  setMobileViewChat: (value: boolean) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

// The chat tab: conversation list, the open conversation and its group info panel
export const ChatTab: React.FC<ChatTabProps> = ({
  chat,
  isMobile,
  mobileViewChat,
  setMobileViewChat,
  showToast,
}) => {
  // Group info panel: open for one conversation id, so it hides by itself when that
  // conversation is no longer the open one (switched, left, removed, deleted)
  const [groupInfoFor, setGroupInfoFor] = useState<string | null>(null);
  const groupInfoConversation =
    chat.activeConversation?.type === 'group' && chat.activeConversation._id === groupInfoFor
      ? chat.activeConversation
      : null;

  // Runs a group change and reports it; never throws (the panel only tracks busy state)
  const runGroupAction = async (action: () => Promise<void>, success: string) => {
    try {
      await action();
      showToast(success, 'success');
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } } };
      showToast(apiErr?.response?.data?.message || 'Không thể cập nhật nhóm', 'error');
    }
  };

  // Select conversation
  const handleSelectConversation = (id: string) => {
    chat.setActiveConversationId(id);
    if (isMobile) {
      setMobileViewChat(true);
    }
  };

  return (
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
          onlineIds={chat.presence.onlineIds}
          typingByConversation={chat.presence.typingByConversation}
          onCreateNewConversation={async (params) => {
            try {
              const newConv = await chat.createNewConversation(params);
              chat.setActiveConversationId(newConv._id);
              if (isMobile) {
                setMobileViewChat(true);
              }
              showToast('Đã tạo/mở cuộc trò chuyện', 'success');
            } catch (err: unknown) {
              const apiErr = err as { response?: { data?: { message?: string } } };
              showToast(apiErr?.response?.data?.message || 'Lỗi tạo cuộc trò chuyện', 'error');
            }
          }}
          onDeleteConversation={async (convId) => {
            try {
              await chat.deleteConversation(convId);
              if (chat.activeConversationId === convId) {
                chat.setActiveConversationId(null);
                if (isMobile) {
                  setMobileViewChat(false);
                }
              }
              showToast('Đã xóa cuộc trò chuyện', 'success');
            } catch (err: unknown) {
              const apiErr = err as { response?: { data?: { message?: string } } };
              showToast(apiErr?.response?.data?.message || 'Lỗi khi xóa', 'error');
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
          hasMoreMessages={chat.messagesHook.hasMore}
          loadingMore={chat.messagesHook.loadingMore}
          onLoadMore={chat.messagesHook.loadMore}
          onSendMessage={chat.messagesHook.sendMessage}
          onRetryMessage={chat.messagesHook.retryMessage}
          onBackMobile={() => setMobileViewChat(false)}
          onShowToast={showToast}
          currentUserId={chat.currentUser?._id || ''}
          messagesError={chat.messagesHook.error}
          onRefreshMessages={chat.messagesHook.refetch}
          onRevokeMessage={(id) => chat.messagesHook.revokeMessage(id).catch(err => showToast(err?.response?.data?.message || 'Lỗi thu hồi tin nhắn', 'error'))}
          onOpenGroupInfo={() => setGroupInfoFor(chat.activeConversationId)}
          onlineIds={chat.presence.onlineIds}
          typingUserIds={
            chat.activeConversationId
              ? chat.presence.typingByConversation[chat.activeConversationId]
              : undefined
          }
          onTyping={chat.presence.notifyTyping}
          onStopTyping={chat.presence.stopTyping}
        />
      </div>

      {groupInfoConversation && (
        <GroupInfoPanel
          conversation={groupInfoConversation}
          currentUserId={chat.currentUser?._id || ''}
          onlineIds={chat.presence.onlineIds}
          onClose={() => setGroupInfoFor(null)}
          onRename={(name) =>
            runGroupAction(() => chat.renameGroup(groupInfoConversation._id, name), 'Đã đổi tên nhóm')
          }
          onAddMembers={(userIds) =>
            runGroupAction(() => chat.addMembers(groupInfoConversation._id, userIds), 'Đã thêm thành viên')
          }
          onRemoveMember={(userId) =>
            runGroupAction(() => chat.removeMember(groupInfoConversation._id, userId), 'Đã xóa thành viên khỏi nhóm')
          }
          onTransferOwner={(userId) =>
            runGroupAction(() => chat.transferOwner(groupInfoConversation._id, userId), 'Đã chuyển quyền trưởng nhóm')
          }
          onLeave={() =>
            runGroupAction(async () => {
              await chat.leaveGroup(groupInfoConversation._id);
              setGroupInfoFor(null);
              if (isMobile) setMobileViewChat(false);
            }, 'Đã rời nhóm')
          }
        />
      )}
    </div>
  );
};
