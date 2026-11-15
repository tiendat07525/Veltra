'use client';

import React from 'react';
import { Conversation } from '@/types/conversation';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { formatTime } from '@/lib/utils';
import { BellOff, Trash2 } from 'lucide-react';

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  currentUserId: string;
  onSelect: () => void;
  onDelete?: () => void;
  isOnline?: boolean;
  // Other members typing in this conversation (from the `typing` event)
  typingUserIds?: string[];
  // Muted in settings: grey unread count, not counted in the badges
  isMuted?: boolean;
}

export const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation,
  isActive,
  currentUserId,
  onSelect,
  onDelete,
  isOnline = false,
  typingUserIds,
  isMuted = false,
}) => {
  const isGroup = conversation.type === 'group';

  // Determine display name
  const displayName = isGroup
    ? conversation.group?.name || 'Nhóm'
    : (() => {
        const other = conversation.participants.find((p) => p._id !== currentUserId);
        return other?.displayName || other?.username || 'Người dùng';
      })();

  // Avatar
  const avatarUrl = isGroup
    ? undefined
    : conversation.participants.find((p) => p._id !== currentUserId)?.avatarUrl;

  // Unread count for current user
  const unreadCount = conversation.unreadCounts?.[currentUserId] || 0;
  const hasUnread = unreadCount > 0;

  // Last message content; replaced by the typing line while someone types
  const typingLabel = (() => {
    if (!typingUserIds?.length) return null;
    if (!isGroup) return 'Đang nhập…';
    const first = conversation.participants.find((p) => p._id === typingUserIds[0]);
    const name = first?.displayName || first?.username || 'Ai đó';
    return typingUserIds.length > 1
      ? `${name} và ${typingUserIds.length - 1} người khác đang nhập…`
      : `${name} đang nhập…`;
  })();
  const lastContent = conversation.lastMessage?.content || 'Chưa có tin nhắn';
  const lastTime = conversation.lastMessage?.createdAt
    ? formatTime(conversation.lastMessage.createdAt)
    : '';

  return (
    <div
      id={`conv-item-${conversation._id}`}
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
          src={avatarUrl}
          name={displayName}
          size="md"
          status={isOnline ? 'online' : 'offline'}
          showStatus={isOnline}
        />
      </div>

      {/* Name + Last Message */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-1 min-w-0">
            <h4
              className={`text-sm truncate ${
                hasUnread ? 'font-bold text-slate-950 dark:text-white' : 'font-medium'
              }`}
            >
              {displayName}
            </h4>
            {isMuted && (
              <BellOff
                className="w-3 h-3 shrink-0 text-slate-400 dark:text-slate-500"
                aria-label="Đã tắt thông báo"
              />
            )}
          </div>

          <span
            className={`text-[11px] shrink-0 ${
              hasUnread && !isMuted
                ? 'font-bold text-sky-600 dark:text-sky-400'
                : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            {lastTime}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p
            className={`text-xs truncate ${
              typingLabel
                ? 'italic text-sky-600 dark:text-sky-400'
                : hasUnread
                  ? 'font-semibold text-slate-900 dark:text-slate-100'
                  : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {typingLabel ?? lastContent}
          </p>

          {hasUnread && (
            <span
              className={`shrink-0 flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-[11px] font-bold rounded-full text-white shadow-xs ${
                isMuted ? 'bg-slate-400 dark:bg-slate-600' : 'bg-sky-500'
              }`}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </div>

      {/* Delete Button */}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 opacity-0 group-hover:opacity-100 transition-all"
          title="Xóa cuộc trò chuyện"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
