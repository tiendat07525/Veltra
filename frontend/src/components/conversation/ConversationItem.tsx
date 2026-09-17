import React from 'react';
import { Pin, BellOff, Check, CheckCheck } from 'lucide-react';
import { Conversation } from '@/types/conversation';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { UserStatus } from '@/types/user';

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  status?: UserStatus;
  onSelect: () => void;
  onTogglePin?: (e: React.MouseEvent) => void;
  onToggleMute?: (e: React.MouseEvent) => void;
}

export const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation,
  isActive,
  status,
  onSelect,
  onTogglePin,
  onToggleMute,
}) => {
  const isGroup = conversation.type === 'group';
  const hasUnread = conversation.unreadCount > 0;

  return (
    <div
      id={`conv-item-${conversation.id}`}
      onClick={onSelect}
      className={`group relative flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all duration-150 select-none ${
        isActive
          ? 'bg-sky-50 dark:bg-sky-950/40 text-slate-900 dark:text-white border-l-4 border-sky-500 shadow-xs'
          : 'hover:bg-slate-100/80 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-200'
      }`}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <UserAvatar
          src={conversation.avatar}
          name={conversation.name}
          size="md"
          status={status}
          showStatus={!isGroup}
        />
      </div>

      {/* Name + Last Message */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5 truncate">
            <h4
              className={`text-sm truncate ${
                hasUnread ? 'font-bold text-slate-950 dark:text-white' : 'font-medium'
              }`}
            >
              {conversation.name}
            </h4>
            {conversation.isPinned && (
              <Pin className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
            )}
            {conversation.isMuted && (
              <BellOff className="w-3 h-3 text-slate-400 shrink-0" />
            )}
          </div>

          <span
            className={`text-[11px] shrink-0 ${
              hasUnread
                ? 'font-bold text-sky-600 dark:text-sky-400'
                : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            {conversation.lastMessage?.createdAt || ''}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p
            className={`text-xs truncate ${
              hasUnread
                ? 'font-semibold text-slate-900 dark:text-slate-100'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {conversation.lastMessage?.content || 'No messages yet'}
          </p>

          {/* Unread badge */}
          {hasUnread && (
            <span className="shrink-0 flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-[11px] font-bold rounded-full bg-sky-500 text-white shadow-xs">
              {conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
