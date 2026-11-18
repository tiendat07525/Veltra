'use client';

import React from 'react';
import { Loader2, MessageCircle, UserMinus, Users } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { UserBasicInfo } from '@/types/user';
import { InlineError } from '@/components/ui/InlineError';

interface FriendsTabProps {
  friends: UserBasicInfo[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  // Online friends (usePresence)
  onlineIds?: Set<string>;
  onStartChat: (user: UserBasicInfo) => void;
  // Asks for confirmation (ContactsView); nothing is removed here
  onRemoveFriend: (friendId: string) => void;
  onFindFriends: () => void;
  // Action errors by friend id (ContactsView)
  rowErrors: Record<string, string>;
  onDismissError: (id: string) => void;
}

// Friend list with online dot, "Nhắn tin" and "Xóa bạn"
export const FriendsTab: React.FC<FriendsTabProps> = ({
  friends,
  loading,
  error,
  onRetry,
  onlineIds,
  onStartChat,
  onRemoveFriend,
  onFindFriends,
  rowErrors,
  onDismissError,
}) => (
  <div className="p-4 space-y-2">
    {loading ? (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
        <span className="ml-2 text-xs text-fg-muted">Đang tải...</span>
      </div>
    ) : error ? (
      <div className="text-center py-12 text-danger text-xs" role="alert">
        <p>{error}</p>
        <button onClick={onRetry} className="mt-2 min-h-9 px-3 rounded-xl font-semibold text-accent hover:bg-accent-soft">
          Thử lại
        </button>
      </div>
    ) : friends.length === 0 ? (
      <div className="text-center py-12 text-fg-muted">
        <Users className="w-8 h-8 mx-auto mb-3 opacity-50" aria-hidden="true" />
        <p className="text-sm font-medium text-fg">Chưa có bạn bè nào</p>
        <p className="text-xs mt-1">Hãy tìm và kết bạn với người dùng khác</p>
        <button
          onClick={onFindFriends}
          className="mt-3 min-h-10 px-4 rounded-xl bg-primary hover:bg-primary-hover text-on-primary text-xs font-semibold transition-colors"
        >
          Tìm bạn bè
        </button>
      </div>
    ) : (
      friends.map((friend) => (
        <div key={friend._id}>
          <div
            className="flex items-center justify-between gap-2 p-3 rounded-xl bg-surface border border-line hover:border-primary/40 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <UserAvatar
                src={friend.avatarUrl}
                name={friend.displayName || friend.username || ''}
                size="md"
                status="online"
                showStatus={!!onlineIds?.has(friend._id)}
              />
              <div className="min-w-0">
                <h3 className="font-semibold text-sm text-fg truncate">
                  {friend.displayName || friend.username}
                </h3>
                {friend.username && (
                  <p className="text-xs text-fg-muted truncate">@{friend.username}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onStartChat(friend)}
                title="Nhắn tin"
                aria-label={`Nhắn tin với ${friend.displayName || friend.username}`}
                className="p-2.5 rounded-xl bg-accent-soft text-accent hover:bg-primary hover:text-on-primary transition-colors"
              >
                <MessageCircle className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onRemoveFriend(friend._id)}
                title="Xóa bạn"
                aria-label={`Xóa ${friend.displayName || friend.username} khỏi bạn bè`}
                className="p-2.5 rounded-xl text-fg-muted hover:text-danger hover:bg-danger-soft transition-colors"
              >
                <UserMinus className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        <InlineError
          message={rowErrors[friend._id]}
          onDismiss={() => onDismissError(friend._id)}
          className="mt-1"
        />
        </div>
      ))
    )}
  </div>
);
