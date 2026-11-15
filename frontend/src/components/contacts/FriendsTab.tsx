'use client';

import React from 'react';
import { Loader2, MessageCircle, UserMinus, Users } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { UserBasicInfo } from '@/types/user';

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
}) => (
  <div className="p-4 space-y-2">
    {loading ? (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-sky-500" />
        <span className="ml-2 text-xs text-slate-400">Đang tải...</span>
      </div>
    ) : error ? (
      <div className="text-center py-12 text-rose-400 text-xs">
        <p>{error}</p>
        <button onClick={onRetry} className="mt-2 text-sky-400 hover:underline">
          Thử lại
        </button>
      </div>
    ) : friends.length === 0 ? (
      <div className="text-center py-12 text-slate-400">
        <Users className="w-8 h-8 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium text-slate-500">Chưa có bạn bè nào</p>
        <p className="text-xs mt-1">Hãy tìm và kết bạn với người dùng khác</p>
        <button
          onClick={onFindFriends}
          className="mt-3 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors"
        >
          Tìm bạn bè
        </button>
      </div>
    ) : (
      friends.map((friend) => (
        <div
          key={friend._id}
          className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-sky-500/40 transition-all"
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
              <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                {friend.displayName || friend.username}
              </h3>
              {friend.username && (
                <p className="text-xs text-slate-500 dark:text-slate-400">@{friend.username}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onStartChat(friend)}
              title="Nhắn tin"
              className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 hover:bg-sky-600 hover:text-white transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onRemoveFriend(friend._id)}
              title="Xóa bạn"
              className="p-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-500 transition-colors"
            >
              <UserMinus className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))
    )}
  </div>
);
