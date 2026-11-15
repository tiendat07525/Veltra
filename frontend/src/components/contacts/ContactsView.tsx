'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { CurrentUserProfile, UserBasicInfo } from '@/types/user';
import { useFriends } from '@/hooks/use-friends';
import { authService } from '@/services/api/auth.service';
import { Toast } from '@/components/ui/Toast';
import { FriendsTab } from './FriendsTab';
import { FriendRequestsTab } from './FriendRequestsTab';
import { UserSearchTab, useUserSearch } from './UserSearchTab';

interface ContactsViewProps {
  onStartChat: (user: UserBasicInfo) => void;
  onVoiceCall?: (user: UserBasicInfo) => void;
  onVideoCall?: (user: UserBasicInfo) => void;
  // Online friends (usePresence)
  onlineIds?: Set<string>;
}

type TabType = 'friends' | 'requests' | 'search';

export const ContactsView: React.FC<ContactsViewProps> = ({
  onStartChat,
  onlineIds,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('friends');
  const [currentUser, setCurrentUser] = useState<CurrentUserProfile | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [removingFriendId, setRemovingFriendId] = useState<string | null>(null);

  const friendsHook = useFriends();

  useEffect(() => {
    authService.getCurrentUser().then(setCurrentUser).catch(console.error);
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Kept here so the query and results survive tab switches
  const search = useUserSearch(
    currentUser?._id,
    useCallback(() => showToast('Lỗi tìm kiếm người dùng', 'error'), [showToast])
  );

  // Friend actions
  const handleSendRequest = async (userId: string) => {
    try {
      await friendsHook.sendFriendRequest(userId);
      showToast('Đã gửi lời mời kết bạn', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi gửi lời mời';
      showToast(msg, 'error');
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    try {
      await friendsHook.acceptFriendRequest(requestId);
      showToast('Đã chấp nhận lời mời kết bạn', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi chấp nhận';
      showToast(msg, 'error');
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    try {
      await friendsHook.declineFriendRequest(requestId);
      showToast('Đã từ chối lời mời kết bạn', 'info');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi từ chối';
      showToast(msg, 'error');
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    setRemovingFriendId(friendId);
  };

  const confirmRemoveFriend = async () => {
    if (!removingFriendId) return;
    try {
      await friendsHook.removeFriend(removingFriendId);
      showToast('Đã xóa bạn', 'info');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi xóa bạn';
      showToast(msg, 'error');
    } finally {
      setRemovingFriendId(null);
    }
  };

  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: 'friends', label: 'Bạn bè', count: friendsHook.friends.length },
    { id: 'requests', label: 'Lời mời', count: friendsHook.receivedRequests.length },
    { id: 'search', label: 'Tìm bạn' },
  ];

  return (
    <div className="flex-1 h-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Header */}
      <header className="h-16 px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Bạn bè</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {friendsHook.friends.length} bạn bè
            {friendsHook.receivedRequests.length > 0 && (
              <span className="text-sky-500 ml-2">
                • {friendsHook.receivedRequests.length} lời mời
              </span>
            )}
          </p>
        </div>
      </header>

      {/* Tab bar */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-1 border-b border-slate-200/60 dark:border-slate-800/60">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === tab.id
                ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === tab.id
                  ? 'bg-sky-500 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
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
            currentUserId={currentUser?._id}
            getFriendshipStatus={friendsHook.getFriendshipStatus}
            actionLoading={!!friendsHook.actionLoading}
            onSendRequest={handleSendRequest}
            onAcceptRequest={handleAcceptRequest}
            onDeclineRequest={handleDeclineRequest}
          />
        )}

        {activeTab === 'friends' && (
          <FriendsTab
            friends={friendsHook.friends}
            loading={friendsHook.loading}
            error={friendsHook.error}
            onRetry={friendsHook.refetch}
            onlineIds={onlineIds}
            onStartChat={onStartChat}
            onRemoveFriend={handleRemoveFriend}
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
          />
        )}
      </div>

      {/* Remove Friend Confirmation Modal */}
      {removingFriendId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
              Xóa bạn bè
            </h3>
            <p className="text-xs text-slate-500 mb-5">
              Bạn có chắc chắn muốn xóa người này khỏi danh sách bạn bè? Hành động này không thể hoàn tác.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setRemovingFriendId(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={confirmRemoveFriend}
                disabled={!!friendsHook.actionLoading}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 rounded-xl transition-colors"
              >
                {friendsHook.actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Xóa bạn'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50">
          <Toast
            id="contacts-toast"
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        </div>
      )}
    </div>
  );
};
