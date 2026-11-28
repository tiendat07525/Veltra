'use client';

import React, { useState } from 'react';
import { useChat } from '@/hooks/use-chat';
import { ConversationSidebar } from '@/components/conversation/ConversationSidebar';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { GroupInfoPanel } from '@/components/conversation/GroupInfoPanel';
import type { CallMedia, CallPeerInfo } from '@/types/call';

interface ChatTabProps {
  chat: ReturnType<typeof useChat>;
  isMobile: boolean;
  // Mobile: chat window shown instead of the list (also set by other tabs before opening /chat)
  mobileViewChat: boolean;
  setMobileViewChat: (value: boolean) => void;
  enterToSend: boolean;
  mutedConversationIds: Set<string>;
  // Rejects with an Error shown under the chat header
  onSetMuted: (conversationId: string, muted: boolean) => Promise<void>;
  // 1-1 calls (useCall)
  onStartCall: (conversationId: string, peer: CallPeerInfo, media: CallMedia) => void;
  callBusy: boolean;
}

// The chat tab: conversation list, the open conversation and its group info panel
export const ChatTab: React.FC<ChatTabProps> = ({
  chat,
  isMobile,
  mobileViewChat,
  setMobileViewChat,
  enterToSend,
  mutedConversationIds,
  onSetMuted,
  onStartCall,
  callBusy,
}) => {
  // Group info panel: open for one conversation id, so it hides by itself when that
  // conversation is no longer the open one (switched, left, removed, deleted)
  const [groupInfoFor, setGroupInfoFor] = useState<string | null>(null);
  const groupInfoConversation =
    chat.activeConversation?.type === 'group' && chat.activeConversation._id === groupInfoFor
      ? chat.activeConversation
      : null;
  // Calls: only in a direct conversation, with its other member
  const callTarget =
    chat.activeConversation?.type === 'direct' && chat.conversationPartner
      ? { conversationId: chat.activeConversation._id, partner: chat.conversationPartner }
      : null;
  const [muteError, setMuteError] = useState<{ conversationId: string; message: string } | null>(null);

  // Runs a group change; a failure becomes an Error with the server's message, shown by the panel
  const runGroupAction = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } } };
      throw new Error(apiErr?.response?.data?.message || 'Không thể cập nhật nhóm');
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
          mutedConversationIds={mutedConversationIds}
          failedConversationIds={chat.messagesHook.failedConversationIds}
          onCreateNewConversation={async (params) => {
            try {
              const newConv = await chat.createNewConversation(params);
              chat.setActiveConversationId(newConv._id);
              if (isMobile) {
                setMobileViewChat(true);
              }
            } catch (err: unknown) {
              // Shown in the "new conversation" modal, which stays open
              const apiErr = err as { response?: { data?: { message?: string } } };
              throw new Error(apiErr?.response?.data?.message || 'Không thể tạo cuộc trò chuyện');
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
            } catch (err: unknown) {
              // Shown under the conversation in the list
              const apiErr = err as { response?: { data?: { message?: string } } };
              throw new Error(apiErr?.response?.data?.message || 'Không thể xóa cuộc trò chuyện');
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
          currentUserId={chat.currentUser?._id || ''}
          messagesError={chat.messagesHook.error}
          onRefreshMessages={chat.messagesHook.refetch}
          onRevokeMessage={(id) =>
            chat.messagesHook.revokeMessage(id).catch((err: unknown) => {
              // Shown under the message
              const apiErr = err as { response?: { data?: { message?: string } } };
              throw new Error(apiErr?.response?.data?.message || 'Không thể thu hồi tin nhắn');
            })
          }
          onReactMessage={(id, emoji) =>
            chat.messagesHook.reactToMessage(id, emoji).catch((err: unknown) => {
              // Shown under the message
              const apiErr = err as { response?: { data?: { message?: string } } };
              throw new Error(apiErr?.response?.data?.message || 'Không thể thả cảm xúc');
            })
          }
          onOpenGroupInfo={() => setGroupInfoFor(chat.activeConversationId)}
          onlineIds={chat.presence.onlineIds}
          typingUserIds={
            chat.activeConversationId
              ? chat.presence.typingByConversation[chat.activeConversationId]
              : undefined
          }
          onTyping={chat.presence.notifyTyping}
          onStopTyping={chat.presence.stopTyping}
          enterToSend={enterToSend}
          isMuted={!!chat.activeConversationId && mutedConversationIds.has(chat.activeConversationId)}
          onToggleMute={() => {
            const id = chat.activeConversationId;
            if (!id) return;
            setMuteError(null);
            onSetMuted(id, !mutedConversationIds.has(id)).catch((err: unknown) => {
              setMuteError({
                conversationId: id,
                message: err instanceof Error && err.message ? err.message : 'Không thể thay đổi thông báo của cuộc trò chuyện',
              });
            });
          }}
          muteError={muteError?.conversationId === chat.activeConversationId ? muteError.message : null}
          onDismissMuteError={() => setMuteError(null)}
          onStartCall={
            callTarget
              ? (media) =>
                  onStartCall(
                    callTarget.conversationId,
                    {
                      _id: callTarget.partner._id,
                      username: callTarget.partner.username ?? '',
                      displayName: callTarget.partner.displayName,
                      avatarUrl: callTarget.partner.avatarUrl,
                    },
                    media
                  )
              : undefined
          }
          callBusy={callBusy}
        />
      </div>

      {groupInfoConversation && (
        <GroupInfoPanel
          conversation={groupInfoConversation}
          currentUserId={chat.currentUser?._id || ''}
          onlineIds={chat.presence.onlineIds}
          onClose={() => setGroupInfoFor(null)}
          onRename={(name) =>
            runGroupAction(() => chat.renameGroup(groupInfoConversation._id, name))
          }
          onAddMembers={(userIds) =>
            runGroupAction(() => chat.addMembers(groupInfoConversation._id, userIds))
          }
          onRemoveMember={(userId) =>
            runGroupAction(() => chat.removeMember(groupInfoConversation._id, userId))
          }
          onTransferOwner={(userId) =>
            runGroupAction(() => chat.transferOwner(groupInfoConversation._id, userId))
          }
          onLeave={() =>
            runGroupAction(async () => {
              await chat.leaveGroup(groupInfoConversation._id);
              setGroupInfoFor(null);
              if (isMobile) setMobileViewChat(false);
            })
          }
        />
      )}
    </div>
  );
};
