'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Check, Clock, Loader2, Search, UserPlus, X } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { User } from '@/types/user';
import { FriendshipStatus } from '@/types/friend';
import { userService } from '@/services/api/user.service';

/**
 * Debounced user search (400 ms). Called by ContactsView, so the query and results stay
 * when the user switches to another tab and back.
 */
export function useUserSearch(currentUserId: string | undefined, onError: () => void) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest query sent; a slower response to an older query must not overwrite newer results
  const latestSearchRef = useRef('');

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

      const query = value.trim();
      latestSearchRef.current = query;
      if (!query) {
        setSearchResults([]);
        setSearchLoading(false);
        return;
      }

      setSearchLoading(true);
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          // Server matches username / displayName (case-insensitive, partial)
          const users = await userService.getUsers({ search: query });
          if (latestSearchRef.current !== query) return;
          setSearchResults(users.filter((u) => u._id !== currentUserId));
        } catch {
          onError();
        } finally {
          if (latestSearchRef.current === query) setSearchLoading(false);
        }
      }, 400);
    },
    [currentUserId, onError]
  );

  return { searchQuery, searchResults, searchLoading, handleSearchChange };
}

interface UserSearchTabProps {
  search: ReturnType<typeof useUserSearch>;
  // null until the current user is loaded (no actions shown before that)
  currentUserId: string | undefined;
  getFriendshipStatus: (
    targetUserId: string,
    currentUserId: string
  ) => { status: FriendshipStatus; requestId?: string };
  actionLoading: boolean;
  onSendRequest: (userId: string) => void;
  onAcceptRequest: (requestId: string) => void;
  onDeclineRequest: (requestId: string) => void;
}

// Search box, results and the friendship action of each result
export const UserSearchTab: React.FC<UserSearchTabProps> = ({
  search,
  currentUserId,
  getFriendshipStatus,
  actionLoading,
  onSendRequest,
  onAcceptRequest,
  onDeclineRequest,
}) => {
  const { searchQuery, searchResults, searchLoading, handleSearchChange } = search;

  // Render friendship action button for search results
  const renderFriendshipAction = (user: User) => {
    if (!currentUserId) return null;
    const { status, requestId } = getFriendshipStatus(user._id, currentUserId);

    switch (status) {
      case 'self':
        return <span className="text-[11px] text-slate-500 italic px-2">Bạn</span>;
      case 'friends':
        return (
          <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium px-2">
            <Check className="w-3.5 h-3.5" /> Bạn bè
          </span>
        );
      case 'request_sent':
        return (
          <span className="flex items-center gap-1 text-[11px] text-amber-400 font-medium px-2">
            <Clock className="w-3.5 h-3.5" /> Đã gửi
          </span>
        );
      case 'request_received':
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={() => requestId && onAcceptRequest(requestId)}
              disabled={actionLoading}
              className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
              title="Chấp nhận"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => requestId && onDeclineRequest(requestId)}
              disabled={actionLoading}
              className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-50 transition-colors"
              title="Từ chối"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      case 'none':
      default:
        return (
          <button
            onClick={() => onSendRequest(user._id)}
            disabled={actionLoading}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-medium disabled:opacity-50 transition-colors"
          >
            {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            <span>Thêm bạn</span>
          </button>
        );
    }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Tìm theo tên, username, email..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-sky-500/30"
          autoFocus
        />
      </div>

      {searchLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-sky-500" />
          <span className="ml-2 text-xs text-slate-400">Đang tìm kiếm...</span>
        </div>
      )}

      {!searchLoading && searchQuery.trim() && searchResults.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-xs">Không tìm thấy người dùng nào phù hợp</div>
      )}

      {!searchLoading && searchResults.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-slate-500 px-1 mb-2">{searchResults.length} kết quả</p>
          {searchResults.map((user) => (
            <div
              key={user._id}
              className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-sky-500/40 transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <UserAvatar src={user.avatarUrl} name={user.displayName || user.username} size="md" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                    {user.displayName || user.username}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">@{user.username}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">{renderFriendshipAction(user)}</div>
            </div>
          ))}
        </div>
      )}

      {!searchQuery.trim() && !searchLoading && (
        <div className="text-center py-12 text-slate-400">
          <Search className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Tìm kiếm người dùng</p>
          <p className="text-xs mt-1">Nhập tên, username hoặc email để tìm bạn bè mới</p>
        </div>
      )}
    </div>
  );
};
