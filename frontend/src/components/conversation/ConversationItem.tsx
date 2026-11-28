'use client';

import React from 'react';
import { Conversation } from '@/types/conversation';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { formatListTime } from '@/lib/utils';
import { AlertCircle, BellOff, Trash2 } from 'lucide-react';
import { useLongPress } from '@/hooks/use-long-press';

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
  // A message of mine here failed to send (outbox): "Gửi lỗi" replaces the last message until it is sent
  hasFailedSend?: boolean;
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
  hasFailedSend = false,
}) => {
  const isGroup = conversation.type === 'group';
  // Touch screens: long press asks to delete (the hover trash button is hidden there)
  const longPress = useLongPress(() => onDelete?.(), { enabled: !!onDelete });

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
    ? formatListTime(conversation.lastMessage.createdAt)
    : '';

  return (
    <div
      id={`conv-item-${conversation._id}`}
      onClick={onSelect}
      {...longPress}
      className={`group relative flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all duration-150 select-none [-webkit-touch-callout:none] ${
        isActive
          ? 'bg-accent-soft text-fg border-l-4 border-primary'
          : 'text-fg hover:bg-surface-2'
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

      {/* Name + Last Message; leaves room for the hover trash button so it never covers the time / count */}
      <div
        className={`flex-1 min-w-0 transition-[padding] duration-150 ${
          onDelete ? 'pointer-fine:group-hover:pr-8 group-focus-within:pr-8' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-1 min-w-0">
            <h4
              className={`text-sm truncate ${
                hasUnread ? 'font-bold' : 'font-medium'
              }`}
            >
              {displayName}
            </h4>
            {isMuted && (
              <BellOff
                className="w-3 h-3 shrink-0 text-fg-muted"
                aria-label="Đã tắt thông báo"
              />
            )}
          </div>

          <span
            className={`text-[11px] shrink-0 ${
              hasUnread && !isMuted ? 'font-bold text-accent' : 'text-fg-muted'
            }`}
          >
            {lastTime}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          {/* Typing first, then a failed send, then the last message */}
          {!typingLabel && hasFailedSend ? (
            <p className="flex items-center gap-1 min-w-0 text-xs font-semibold text-danger">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Gửi lỗi</span>
            </p>
          ) : (
            <p
              className={`text-xs truncate ${
                typingLabel ? 'italic text-accent' : hasUnread ? 'font-semibold text-fg' : 'text-fg-muted'
              }`}
            >
              {typingLabel ?? lastContent}
            </p>
          )}

          {hasUnread && (
            <span
              className={`shrink-0 flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-[11px] font-bold rounded-full ${
                isMuted ? 'bg-fg-muted text-surface' : 'bg-primary text-on-primary'
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
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-fg-muted hover:text-danger hover:bg-danger-soft opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:hidden transition-all"
          title="Xóa cuộc trò chuyện"
          aria-label="Xóa cuộc trò chuyện"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
