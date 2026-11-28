'use client';

import type { CallMedia } from '@/types/call';
import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { AlertCircle, Loader2, MessageSquare, RefreshCw } from 'lucide-react';
import { Conversation } from '@/types/conversation';
import { Message, ReactionEmoji } from '@/types/message';
import { formatDate } from '@/lib/utils';
import { computeReceipts } from '@/lib/receipts';
import { MessageBubble } from './MessageBubble';
import { DirectReceipt, GroupReaders } from './ReadReceipt';

interface MessageListProps {
  conversation: Conversation;
  messages: Message[];
  currentUserId: string;
  loadingMessages: boolean;
  messagesError: string | null;
  onRefreshMessages: () => void;
  hasMoreMessages: boolean;
  loadingMore: boolean;
  onLoadMore?: () => void;
  onRevokeMessage?: (id: string) => Promise<void>;
  onReactMessage?: (id: string, emoji: ReactionEmoji | null) => Promise<void>;
  onRetryMessage?: (clientMsgId: string) => void;
  onOpenImage: (url: string, name: string) => void;
  // Direct conversations: "Gọi lại" on call records
  onCallAgain?: (media: CallMedia) => void;
}

/**
 * Scrollable history: loading / error / empty states, older pages when scrolled to the top
 * (keeping the same message in view), date separators, and scrolling to the newest message.
 * The list arrives ordered by seq (useMessages); it is never re-sorted here.
 */
export const MessageList: React.FC<MessageListProps> = ({
  conversation,
  messages,
  currentUserId,
  loadingMessages,
  messagesError,
  onRefreshMessages,
  hasMoreMessages,
  loadingMore,
  onLoadMore,
  onRevokeMessage,
  onReactMessage,
  onRetryMessage,
  onOpenImage,
  onCallAgain,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Distance from the bottom when older messages were requested. Prepending keeps it constant,
  // so restoring it is correct whether or not the browser's scroll anchoring already moved us.
  const restoreFromBottomRef = useRef<number | null>(null);
  const firstKeyRef = useRef<string | undefined>(undefined);
  const lastKeyRef = useRef<string | undefined>(undefined);

  const requestOlder = () => {
    const el = scrollRef.current;
    if (!el || !onLoadMore || !hasMoreMessages || loadingMore || loadingMessages) return;
    restoreFromBottomRef.current = el.scrollHeight - el.scrollTop;
    onLoadMore();
  };

  const handleScroll = () => {
    if ((scrollRef.current?.scrollTop ?? Infinity) <= 80) requestOlder();
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;

    // Older messages were prepended (or the request ended): keep the same message in view
    if (restoreFromBottomRef.current !== null && !loadingMore) {
      if (el) el.scrollTop = el.scrollHeight - restoreFromBottomRef.current;
      restoreFromBottomRef.current = null;
    }

    // Scroll to the bottom only when the newest message changes, not on prepend or revoke
    const keyOf = (m?: Message) => (m ? m.clientMsgId || m._id : undefined);
    const firstKey = keyOf(messages[0]);
    const lastKey = keyOf(messages[messages.length - 1]);
    if (lastKey !== lastKeyRef.current) {
      // Whole list replaced (opened / switched conversation): jump, so a smooth scroll
      // passing the top does not trigger loading older messages
      const replaced = firstKey !== firstKeyRef.current;
      messagesEndRef.current?.scrollIntoView({ behavior: replaced ? 'auto' : 'smooth' });
    }
    firstKeyRef.current = firstKey;
    lastKeyRef.current = lastKey;
  }, [messages, loadingMore]);

  // "Đã gửi" / "Đã xem" (direct) or reader avatars (group) under the messages
  const receipts = useMemo(
    () => computeReceipts(messages, conversation, currentUserId),
    [messages, conversation, currentUserId]
  );
  // A receipt appearing under the newest message: stay at the bottom if the user was there
  const receiptsKey = `${receipts.direct?.messageId}:${receipts.direct?.seen}:${Object.entries(receipts.readers)
    .map(([id, list]) => `${id}=${list.length}`)
    .join(',')}`;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  }, [receiptsKey]);

  // History shorter than the viewport has no scrollbar to pull: keep loading while it fits
  useEffect(() => {
    const el = scrollRef.current;
    if (el && messages.length > 0 && el.scrollHeight <= el.clientHeight) requestOlder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, hasMoreMessages, loadingMore, loadingMessages]);

  // Group messages by date for display
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  let currentDate = '';
  messages.forEach((msg) => {
    const msgDate = formatDate(msg.createdAt);
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      groupedMessages.push({ date: msgDate, messages: [msg] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  });

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-3">
      {loadingMessages ? (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-6 h-6 animate-spin text-primary" aria-hidden="true" />
          <span className="ml-2 text-xs text-fg-muted">Đang tải tin nhắn...</span>
        </div>
      ) : messagesError ? (
        <div className="flex flex-col items-center justify-center h-full text-center" role="alert">
          <AlertCircle className="w-8 h-8 text-danger mb-2" aria-hidden="true" />
          <p className="text-xs text-danger mb-2">{messagesError}</p>
          <button
            onClick={onRefreshMessages}
            className="flex items-center gap-1 min-h-9 px-3 rounded-xl text-xs font-semibold text-accent hover:bg-accent-soft"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Thử lại
          </button>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center text-fg-muted">
          <MessageSquare className="w-8 h-8 opacity-50 mb-2" aria-hidden="true" />
          <p className="text-xs">Chưa có tin nhắn nào. Hãy gửi tin nhắn đầu tiên!</p>
        </div>
      ) : (
        <>
          {loadingMore ? (
            <div className="flex items-center justify-center py-2 text-xs text-fg-muted">
              <Loader2 className="w-4 h-4 animate-spin text-primary" aria-hidden="true" />
              <span className="ml-2">Đang tải tin cũ…</span>
            </div>
          ) : !hasMoreMessages ? (
            <p className="py-2 text-center text-[11px] text-fg-muted select-none">Đầu cuộc trò chuyện</p>
          ) : null}
          {groupedMessages.map((group) => (
            <div key={group.date}>
              {/* Date separator */}
              <div className="flex items-center justify-center my-4">
                <span className="px-3 py-1 rounded-full bg-surface-2 text-[11px] font-medium text-fg-muted">
                  {group.date}
                </span>
              </div>

              {group.messages.map((msg) => (
                // clientMsgId keeps the bubble mounted when the stored copy replaces the optimistic one
                <React.Fragment key={msg.type === 'system' ? msg._id : msg.clientMsgId || msg._id || msg.id}>
                  <MessageBubble
                    msg={msg}
                    conversation={conversation}
                    currentUserId={currentUserId}
                    onRevokeMessage={onRevokeMessage}
                    onReactMessage={onReactMessage}
                    onRetryMessage={onRetryMessage}
                    onOpenImage={onOpenImage}
                    onCallAgain={conversation.type === 'direct' ? onCallAgain : undefined}
                  />
                  {receipts.direct?.messageId === msg._id && <DirectReceipt seen={receipts.direct.seen} />}
                  {receipts.readers[msg._id] && <GroupReaders readers={receipts.readers[msg._id]} />}
                </React.Fragment>
              ))}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </>
      )}
    </div>
  );
};
