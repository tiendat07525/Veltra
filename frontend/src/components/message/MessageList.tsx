import React, { useRef, useEffect, useState } from 'react';
import { Message, ReactionEmoji } from '@/types/message';
import { User } from '@/types/user';
import { MessageBubble } from './MessageBubble';
import { Pin, ArrowDown, Sparkles } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface MessageListProps {
  messages: Message[];
  loading: boolean;
  isTyping: boolean;
  typingUser: string;
  currentUserId: string;
  isGroup: boolean;
  participantsMap: Map<string, User>;
  searchQuery: string;
  onReact: (messageId: string, emoji: ReactionEmoji) => void;
  onReply: (msg: Message, senderName: string) => void;
  onCopy: (content: string) => void;
  onEdit: (msg: Message) => void;
  onDelete: (msgId: string) => void;
  onForward: (msg: Message) => void;
  onTogglePin: (msgId: string) => void;
  onOpenImage: (url: string, caption?: string) => void;
  onMarkUnread?: (msgId: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  loading,
  isTyping,
  typingUser,
  currentUserId,
  isGroup,
  participantsMap,
  searchQuery,
  onReact,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  onForward,
  onTogglePin,
  onOpenImage,
  onMarkUnread,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [showPinnedExpanded, setShowPinnedExpanded] = useState(false);

  // Auto-scroll on new message or initial load
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isTyping]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 200);
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Filter messages if search query exists
  const filteredMessages = messages.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      Boolean(m.content?.toLowerCase().includes(q)) ||
      Boolean(m.fileName && m.fileName.toLowerCase().includes(q))
    );
  });

  const pinnedMessages = messages.filter((m) => m.isPinned && !m.isDeleted);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-slate-400">
        <div className="w-8 h-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
        <span className="text-xs font-medium tracking-wide">Decrypting conversation...</span>
      </div>
    );
  }

  return (
    <div className="relative flex-1 flex flex-col min-h-0 bg-slate-50/50 dark:bg-slate-950/40">
      {/* Pinned Messages Header Strip */}
      {pinnedMessages.length > 0 && (
        <div className="shrink-0 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between z-10">
          <div
            className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 font-medium cursor-pointer truncate mr-2"
            onClick={() => setShowPinnedExpanded((prev) => !prev)}
          >
            <Pin className="w-3.5 h-3.5 fill-amber-500 shrink-0" />
            <span className="font-semibold">{pinnedMessages.length} Pinned Message{pinnedMessages.length > 1 ? 's' : ''}:</span>
            <span className="truncate opacity-90">{pinnedMessages[0].content}</span>
          </div>
          <button
            type="button"
            onClick={() => setShowPinnedExpanded((prev) => !prev)}
            className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold hover:underline shrink-0"
          >
            {showPinnedExpanded ? 'Collapse' : 'View All'}
          </button>
        </div>
      )}

      {/* Expanded Pinned Messages Dropdown */}
      {showPinnedExpanded && pinnedMessages.length > 0 && (
        <div className="absolute top-10 inset-x-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xl z-30 max-h-60 overflow-y-auto space-y-2 animate-in slide-in-from-top-2">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Pinned Messages in this chat
            </h4>
            <button
              onClick={() => setShowPinnedExpanded(false)}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-white"
            >
              Close
            </button>
          </div>
          {pinnedMessages.map((msg) => {
            const msgId = msg._id || msg.id || '';
            return (
              <div
                key={msgId}
                className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs flex items-center justify-between gap-2"
              >
                <div className="truncate">
                  <span className="font-semibold text-sky-500 mr-1.5">
                    {participantsMap.get(msg.senderId)?.displayName || 'Member'}:
                  </span>
                  <span className="text-slate-700 dark:text-slate-200">{msg.content}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onTogglePin(msgId)}
                  className="text-slate-400 hover:text-rose-500 shrink-0"
                  title="Unpin"
                >
                  Unpin
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Messages Scroll Area */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto py-4 space-y-1"
      >
        {/* Empty state when no messages */}
        {filteredMessages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <div className="w-14 h-14 rounded-2xl bg-sky-500/10 text-sky-500 flex items-center justify-center mb-3">
              <Sparkles className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1">
              {searchQuery ? 'No messages found' : 'No messages yet'}
            </h3>
            <p className="text-xs max-w-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {searchQuery
                ? `No messages match "${searchQuery}". Try a different keyword.`
                : 'Send your first encrypted message, photo, or voice note to begin chatting.'}
            </p>
          </div>
        )}

        {/* Message Items with Smart Grouping & Avatar Placement */}
        {filteredMessages.map((msg, index) => {
          const isCurrentUser = msg.senderId === currentUserId;
          const sender = participantsMap.get(msg.senderId);
          const nextMsg = filteredMessages[index + 1];
          const isLastInCluster = !nextMsg || nextMsg.senderId !== msg.senderId;
          const msgId = msg._id || msg.id || String(index);

          return (
            <MessageBubble
              key={msgId}
              message={msg}
              sender={sender}
              isCurrentUser={isCurrentUser}
              isGroup={isGroup}
              showAvatar={isLastInCluster}
              currentUserId={currentUserId}
              onReact={(emoji) => onReact(msgId, emoji)}
              onReply={() => onReply(msg, sender?.displayName || 'Member')}
              onCopy={() => onCopy(msg.content || '')}
              onEdit={isCurrentUser ? () => onEdit(msg) : undefined}
              onDelete={isCurrentUser ? () => onDelete(msgId) : undefined}
              onForward={() => onForward(msg)}
              onTogglePin={() => onTogglePin(msgId)}
              onOpenImage={onOpenImage}
              onMarkUnread={onMarkUnread ? () => onMarkUnread(msgId) : undefined}
            />
          );
        })}

        {/* Realtime Typing Indicator */}
        {isTyping && (
          <div className="flex items-center gap-2 px-4 py-2 animate-in fade-in slide-in-from-bottom-2">
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-xs font-semibold text-slate-500">
              {typingUser.slice(0, 2)}
            </div>
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-xs">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {typingUser} is typing
              </span>
              <span className="flex items-center gap-1 ml-1">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} className="h-2" />
      </div>

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 z-20 p-2.5 rounded-full bg-sky-500 hover:bg-sky-600 text-white shadow-lg transition-all animate-in fade-in zoom-in"
          title="Scroll to latest message"
        >
          <ArrowDown className="w-4 h-4 stroke-[2.5]" />
        </button>
      )}
    </div>
  );
};
