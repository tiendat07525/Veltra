'use client';

import React, { useState } from 'react';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { Conversation, ConversationParticipant } from '@/types/conversation';
import { Message } from '@/types/message';
import { ImageViewerModal } from './ImageViewerModal';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';

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
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  currentUserId: string;
  messagesError: string | null;
  onRefreshMessages: () => void;
  onRevokeMessage?: (id: string) => void;
  // Groups only: opens the group info panel
  onOpenGroupInfo?: () => void;
  // Presence / typing (usePresence)
  onlineIds?: Set<string>;
  typingUserIds?: string[];
  onTyping?: (conversationId: string) => void;
  onStopTyping?: () => void;
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
  onShowToast,
  currentUserId,
  messagesError,
  onRefreshMessages,
  onRevokeMessage,
  onOpenGroupInfo,
  onlineIds,
  typingUserIds,
  onTyping,
  onStopTyping,
}) => {
  const [viewer, setViewer] = useState<{ url: string; name: string } | null>(null);

  // Empty state
  if (!conversation) {
    return (
      <div className="flex-1 h-full flex flex-col bg-slate-50 dark:bg-slate-950">
        <header className="h-16 px-4 md:px-6 border-b border-slate-200/80 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md flex items-center shrink-0 md:hidden">
          <button
            type="button"
            onClick={onBackMobile}
            className="p-2 -ml-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-xl transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="ml-2 font-bold text-slate-800 dark:text-white">Tin nhắn</span>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
          <div className="w-16 h-16 rounded-3xl bg-sky-500/10 text-sky-500 flex items-center justify-center mb-4">
            <MessageSquare className="w-8 h-8 stroke-[1.75]" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-1">
            Chưa chọn cuộc trò chuyện nào
          </h3>
          <p className="text-xs max-w-sm text-slate-500 leading-relaxed">
            Chọn một cuộc trò chuyện từ danh sách hoặc bắt đầu tin nhắn mới.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full flex flex-col min-w-0 bg-white dark:bg-slate-950">
      <ChatHeader
        conversation={conversation}
        conversationName={conversationName}
        partner={partner}
        currentUserId={currentUserId}
        onlineIds={onlineIds}
        onBackMobile={onBackMobile}
        onOpenGroupInfo={onOpenGroupInfo}
      />

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
        onRetryMessage={onRetryMessage}
        onOpenImage={(url, name) => setViewer({ url, name })}
      />

      <ChatInput
        conversation={conversation}
        conversationName={conversationName}
        onSendMessage={onSendMessage}
        onShowToast={onShowToast}
        typingUserIds={typingUserIds}
        onTyping={onTyping}
        onStopTyping={onStopTyping}
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
