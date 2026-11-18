'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Check, Clock, Loader2, Search, UserPlus, X } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { User } from '@/types/user';
import { FriendshipStatus } from '@/types/friend';
import { userService } from '@/services/api/user.service';
import { InlineError } from '@/components/ui/InlineError';

/**
 * Debounced user search (400 ms). Called by ContactsView, so the query and results stay
 * when the user switches to another tab and back.
 */
export function useUserSearch(currentUserId: string | undefined) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
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
      setSearchError(null);
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
          if (latestSearchRef.current === query) setSearchError('Không thể tìm kiếm người dùng. Thử lại sau.');
        } finally {
          if (latestSearchRef.current === query) setSearchLoading(false);
        }
      }, 400);
    },
    [currentUserId]
  );

  return { searchQuery, searchResults, searchLoading, searchError, setSearchError, handleSearchChange };
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
  // Action errors by user id or request id (ContactsView)
  rowErrors: Record<string, string>;
  onDismissError: (id: string) => void;
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
  rowErrors,
  onDismissError,
}) => {
  const { searchQuery, searchResults, searchLoading, searchError, setSearchError, handleSearchChange } = search;

  // Render friendship action button for search results
  const renderFriendshipAction = (user: User) => {
    if (!currentUserId) return null;
    const { status, requestId } = getFriendshipStatus(user._id, currentUserId);

    switch (status) {
      case 'self':
        return <span className="text-[11px] text-fg-muted italic px-2">Bạn</span>;
      case 'friends':
        return (
          <span className="flex items-center gap-1 text-[11px] text-accent font-semibold px-2">
            <Check className="w-3.5 h-3.5" aria-hidden="true" /> Bạn bè
          </span>
        );
      case 'request_sent':
        return (
          <span className="flex items-center gap-1 text-[11px] text-fg-muted font-medium px-2">
            <Clock className="w-3.5 h-3.5" aria-hidden="true" /> Đã gửi
          </span>
        );
      case 'request_received':
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={() => requestId && onAcceptRequest(requestId)}
              disabled={actionLoading}
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary hover:bg-primary-hover text-on-primary disabled:opacity-50 transition-colors"
              title="Chấp nhận"
              aria-label="Chấp nhận lời mời"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => requestId && onDeclineRequest(requestId)}
              disabled={actionLoading}
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-surface-2 hover:bg-line text-fg disabled:opacity-50 transition-colors"
              title="Từ chối"
              aria-label="Từ chối lời mời"
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
            className="flex items-center gap-1 min-h-9 px-2.5 rounded-lg bg-primary hover:bg-primary-hover text-on-primary text-[11px] font-semibold disabled:opacity-50 transition-colors"
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
        <Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
        <input
          type="text"
          placeholder="Tìm theo tên, username, email..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          aria-label="Tìm người dùng"
          className="w-full pl-9 pr-4 py-2.5 bg-surface border border-line rounded-xl text-xs text-fg placeholder:text-fg-muted focus:outline-hidden focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          autoFocus
        />
      </div>

      <InlineError message={searchError} onDismiss={() => setSearchError(null)} />

      {searchLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
          <span className="ml-2 text-xs text-fg-muted">Đang tìm kiếm...</span>
        </div>
      )}

      {!searchLoading && !searchError && searchQuery.trim() && searchResults.length === 0 && (
        <div className="text-center py-8 text-fg-muted text-xs">Không tìm thấy người dùng nào phù hợp</div>
      )}

      {!searchLoading && searchResults.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-fg-muted px-1 mb-2">{searchResults.length} kết quả</p>
          {searchResults.map((user) => {
            // Accept / decline from here are keyed by the request id
            const requestId = currentUserId ? getFriendshipStatus(user._id, currentUserId).requestId : undefined;
            const errorKey = rowErrors[user._id] ? user._id : requestId && rowErrors[requestId] ? requestId : null;
            return (
              <div key={user._id}>
                <div
                  className="flex items-center justify-between gap-2 p-3 rounded-xl bg-surface border border-line hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar src={user.avatarUrl} name={user.displayName || user.username} size="md" />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm text-fg truncate">
                        {user.displayName || user.username}
                      </h3>
                      <p className="text-xs text-fg-muted truncate">@{user.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">{renderFriendshipAction(user)}</div>
                </div>
                {errorKey && (
                  <InlineError message={rowErrors[errorKey]} onDismiss={() => onDismissError(errorKey)} className="mt-1" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {!searchQuery.trim() && !searchLoading && (
        <div className="text-center py-12 text-fg-muted">
          <Search className="w-8 h-8 mx-auto mb-3 opacity-50" aria-hidden="true" />
          <p className="text-sm font-medium text-fg">Tìm kiếm người dùng</p>
          <p className="text-xs mt-1">Nhập tên, username hoặc email để tìm bạn bè mới</p>
        </div>
      )}
    </div>
  );
};
