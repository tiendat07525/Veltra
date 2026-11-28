'use client';

import React, { useState } from 'react';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { Conversation, ConversationParticipant } from '@/types/conversation';
import { Message, ReactionEmoji } from '@/types/message';
import { ImageViewerModal } from './ImageViewerModal';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { InlineError } from '@/components/ui/InlineError';

interface ChatWindowProps {
  conversation: Conversation | null;
  conversationName: string;
  partner: ConversationParticipant | null;
  messages: Message[];
  loadingMessages: boolean;
  hasMoreMessages?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  // files: already checked with classifyFile
  onSendMessage: (content: string, files: File[]) => void;
  onRetryMessage?: (clientMsgId: string) => void;
  onBackMobile: () => void;
  currentUserId: string;
  messagesError: string | null;
  onRefreshMessages: () => void;
  // Rejects with an Error shown under the message
  onRevokeMessage?: (id: string) => Promise<void>;
  // Set (emoji) / remove (null) my reaction; rejects with an Error shown under the message
  onReactMessage?: (id: string, emoji: ReactionEmoji | null) => Promise<void>;
  // Groups only: opens the group info panel
  onOpenGroupInfo?: () => void;
  // Presence / typing (usePresence)
  onlineIds?: Set<string>;
  typingUserIds?: string[];
  onTyping?: (conversationId: string) => void;
  onStopTyping?: () => void;
  enterToSend?: boolean;
  isMuted?: boolean;
  onToggleMute?: () => void;
  // Failed mute / unmute of this conversation, shown under the header
  muteError?: string | null;
  onDismissMuteError?: () => void;
}

// The open conversation: header, history, composer, and the image viewer they share
export const ChatWindow: React.FC<ChatWindowProps> = ({
  conversation,
  conversationName,
  partner,
  messages,
  loadingMessages,
  hasMoreMessages = false,
  loadingMore = false,
  onLoadMore,
  onSendMessage,
  onRetryMessage,
  onBackMobile,
  currentUserId,
  messagesError,
  onRefreshMessages,
  onRevokeMessage,
  onReactMessage,
  onOpenGroupInfo,
  onlineIds,
  typingUserIds,
  onTyping,
  onStopTyping,
  enterToSend,
  isMuted,
  onToggleMute,
  muteError,
  onDismissMuteError,
}) => {
  const [viewer, setViewer] = useState<{ url: string; name: string } | null>(null);

  // Empty state
  if (!conversation) {
    return (
      <div className="flex-1 h-full flex flex-col bg-app">
        <header className="h-16 px-2 border-b border-line bg-surface flex items-center shrink-0 md:hidden">
          <button
            type="button"
            onClick={onBackMobile}
            className="p-2.5 text-fg-muted hover:text-fg hover:bg-surface-2 rounded-xl transition-colors"
            aria-label="Quay lại danh sách"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="ml-1 font-bold text-fg">Tin nhắn</span>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-16 h-16 rounded-3xl bg-accent-soft text-accent flex items-center justify-center mb-4">
            <MessageSquare className="w-8 h-8 stroke-[1.75]" aria-hidden="true" />
          </div>
          <h3 className="text-lg font-bold text-fg mb-1">
            Chưa chọn cuộc trò chuyện nào
          </h3>
          <p className="text-xs max-w-sm text-fg-muted leading-relaxed">
            Chọn một cuộc trò chuyện từ danh sách hoặc bắt đầu tin nhắn mới.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full flex flex-col min-w-0 bg-surface">
      <ChatHeader
        conversation={conversation}
        conversationName={conversationName}
        partner={partner}
        currentUserId={currentUserId}
        onlineIds={onlineIds}
        onBackMobile={onBackMobile}
        onOpenGroupInfo={onOpenGroupInfo}
        isMuted={isMuted}
        onToggleMute={onToggleMute}
      />
      <InlineError message={muteError} onDismiss={onDismissMuteError} className="mx-4 mt-2 shrink-0" />

      <MessageList
        conversation={conversation}
        messages={messages}
        currentUserId={currentUserId}
        loadingMessages={loadingMessages}
        messagesError={messagesError}
        onRefreshMessages={onRefreshMessages}
        hasMoreMessages={hasMoreMessages}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        onRevokeMessage={onRevokeMessage}
        onReactMessage={onReactMessage}
        onRetryMessage={onRetryMessage}
        onOpenImage={(url, name) => setViewer({ url, name })}
      />

      <ChatInput
        conversation={conversation}
        conversationName={conversationName}
        onSendMessage={onSendMessage}
        typingUserIds={typingUserIds}
        onTyping={onTyping}
        onStopTyping={onStopTyping}
        enterToSend={enterToSend}
      />

      <ImageViewerModal
        isOpen={!!viewer}
        imageUrl={viewer?.url ?? null}
        caption={viewer?.name}
        onClose={() => setViewer(null)}
      />
    </div>
  );
};
