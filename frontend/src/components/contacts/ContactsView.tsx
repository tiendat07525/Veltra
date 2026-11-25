'use client';

import React, { useState, useCallback } from 'react';
import { UserBasicInfo } from '@/types/user';
import { useFriends } from '@/hooks/use-friends';
import { useUserSearch } from '@/hooks/use-user-search';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FriendsTab } from './FriendsTab';
import { FriendRequestsTab } from './FriendRequestsTab';
import { UserSearchTab } from './UserSearchTab';

export type ContactsTab = 'friends' | 'requests' | 'search';

interface ContactsViewProps {
  currentUserId: string | undefined;
  // Tab shown when the view opens (e.g. /contacts?tab=requests from a notification)
  initialTab?: ContactsTab;
  // Rejects with an Error whose message is shown under the friend's row
  onStartChat: (user: UserBasicInfo) => Promise<void>;
  onVoiceCall?: (user: UserBasicInfo) => void;
  onVideoCall?: (user: UserBasicInfo) => void;
  // Online friends (usePresence)
  onlineIds?: Set<string>;
}

export const ContactsView: React.FC<ContactsViewProps> = ({
  currentUserId,
  initialTab,
  onStartChat,
  onlineIds,
}) => {
  const [activeTab, setActiveTab] = useState<ContactsTab>(initialTab ?? 'friends');
  const [removingFriendId, setRemovingFriendId] = useState<string | null>(null);

  const friendsHook = useFriends();

  // Kept here so the query and results survive tab switches
  const search = useUserSearch(currentUserId);

  // Action errors shown under the row they belong to, keyed by the id the action used
  // (user id, friend id or request id). Success needs no message: the list updates.
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const setRowError = useCallback((id: string, message: string | null) => {
    setRowErrors((prev) => {
      const next = { ...prev };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }, []);

  const runRowAction = async (id: string, action: () => Promise<unknown>, fallback: string) => {
    setRowError(id, null);
    try {
      await action();
    } catch (err: unknown) {
      setRowError(id, err instanceof Error && err.message ? err.message : fallback);
    }
  };

  // Friend actions
  const handleSendRequest = (userId: string) =>
    runRowAction(userId, () => friendsHook.sendFriendRequest(userId), 'Không thể gửi lời mời kết bạn');

  const handleAcceptRequest = (requestId: string) =>
    runRowAction(requestId, () => friendsHook.acceptFriendRequest(requestId), 'Không thể chấp nhận lời mời');

  const handleDeclineRequest = (requestId: string) =>
    runRowAction(requestId, () => friendsHook.declineFriendRequest(requestId), 'Không thể từ chối lời mời');

  const handleStartChat = (user: UserBasicInfo) =>
    runRowAction(user._id, () => onStartChat(user), 'Không thể mở cuộc trò chuyện');

  const handleRemoveFriend = (friendId: string) => setRemovingFriendId(friendId);
  const removingFriend = friendsHook.friends.find((f) => f._id === removingFriendId);
  const removingName = removingFriend?.displayName || removingFriend?.username || 'người này';

  const tabs: { id: ContactsTab; label: string; count?: number }[] = [
    { id: 'friends', label: 'Bạn bè', count: friendsHook.friends.length },
    { id: 'requests', label: 'Lời mời', count: friendsHook.receivedRequests.length },
    { id: 'search', label: 'Tìm bạn' },
  ];

  return (
    <div className="flex-1 h-full flex flex-col bg-app overflow-hidden">
      {/* Header */}
      <header className="h-16 px-4 sm:px-6 border-b border-line bg-surface flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-fg">Bạn bè</h1>
          <p className="text-xs text-fg-muted">
            {friendsHook.friends.length} bạn bè
            {friendsHook.receivedRequests.length > 0 && (
              <span className="text-accent ml-2">
                • {friendsHook.receivedRequests.length} lời mời
              </span>
            )}
          </p>
        </div>
      </header>

      {/* Tab bar */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-1 border-b border-line bg-surface" role="tablist" aria-label="Danh mục bạn bè">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 min-h-9 px-3.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === tab.id ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:text-fg hover:bg-surface-2'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === tab.id ? 'bg-primary text-on-primary' : 'bg-surface-2 text-fg-muted'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'search' && (
          <UserSearchTab
            search={search}
            currentUserId={currentUserId}
            getFriendshipStatus={friendsHook.getFriendshipStatus}
            actionLoading={!!friendsHook.actionLoading}
            onSendRequest={handleSendRequest}
            onAcceptRequest={handleAcceptRequest}
            onDeclineRequest={handleDeclineRequest}
            rowErrors={rowErrors}
            onDismissError={(id) => setRowError(id, null)}
          />
        )}

        {activeTab === 'friends' && (
          <FriendsTab
            friends={friendsHook.friends}
            loading={friendsHook.loading}
            error={friendsHook.error}
            onRetry={friendsHook.refetch}
            onlineIds={onlineIds}
            onStartChat={handleStartChat}
            onRemoveFriend={handleRemoveFriend}
            rowErrors={rowErrors}
            onDismissError={(id) => setRowError(id, null)}
            onFindFriends={() => setActiveTab('search')}
          />
        )}

        {activeTab === 'requests' && (
          <FriendRequestsTab
            receivedRequests={friendsHook.receivedRequests}
            sentRequests={friendsHook.sentRequests}
            actionLoading={!!friendsHook.actionLoading}
            onAcceptRequest={handleAcceptRequest}
            onDeclineRequest={handleDeclineRequest}
            rowErrors={rowErrors}
            onDismissError={(id) => setRowError(id, null)}
          />
        )}
      </div>

      {/* Remove friend confirmation; a failure is shown inside it */}
      <ConfirmDialog
        open={!!removingFriendId}
        title="Xóa bạn bè?"
        description={`${removingName} sẽ bị xóa khỏi danh sách bạn bè. Không thể hoàn tác.`}
        confirmLabel="Xóa bạn"
        onConfirm={() => (removingFriendId ? friendsHook.removeFriend(removingFriendId) : Promise.resolve())}
        onClose={() => setRemovingFriendId(null)}
      />
    </div>
  );
};
