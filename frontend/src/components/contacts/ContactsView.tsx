'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, UserPlus, MessageCircle, UserMinus, Check, X, Clock, Loader2, Users } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { User, CurrentUserProfile, UserBasicInfo } from '@/types/user';
import { FriendshipStatus } from '@/types/friend';
import { useFriends } from '@/hooks/use-friends';
import { authService } from '@/services/api/auth.service';
import { userService } from '@/services/api/user.service';
import { Toast } from '@/components/ui/Toast';

interface ContactsViewProps {
  onStartChat: (user: UserBasicInfo) => void;
  onVoiceCall?: (user: UserBasicInfo) => void;
  onVideoCall?: (user: UserBasicInfo) => void;
}

type TabType = 'friends' | 'requests' | 'search';

export const ContactsView: React.FC<ContactsViewProps> = ({
  onStartChat,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUserProfile | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [removingFriendId, setRemovingFriendId] = useState<string | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const friendsHook = useFriends();

  useEffect(() => {
    authService.getCurrentUser().then(setCurrentUser).catch(console.error);
  }, []);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!value.trim()) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const users = await userService.getUsers();
        const query = value.toLowerCase().trim();
        const filtered = users.filter(
          (u) =>
            u._id !== currentUser?._id &&
            (u.username?.toLowerCase().includes(query) ||
              u.displayName?.toLowerCase().includes(query) ||
              u.email?.toLowerCase().includes(query))
        );
        setSearchResults(filtered);
      } catch {
        showToast('Lỗi tìm kiếm người dùng', 'error');
      } finally {
        setSearchLoading(false);
      }
    }, 400);
  }, [currentUser]);

  // Friend actions
  const handleSendRequest = async (userId: string) => {
    try {
      await friendsHook.sendFriendRequest(userId);
      showToast('Đã gửi lời mời kết bạn', 'success');
    } catch (err: any) {
      showToast(err.message || 'Lỗi gửi lời mời', 'error');
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    try {
      await friendsHook.acceptFriendRequest(requestId);
      showToast('Đã chấp nhận lời mời kết bạn', 'success');
    } catch (err: any) {
      showToast(err.message || 'Lỗi chấp nhận', 'error');
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    try {
      await friendsHook.declineFriendRequest(requestId);
      showToast('Đã từ chối lời mời kết bạn', 'info');
    } catch (err: any) {
      showToast(err.message || 'Lỗi từ chối', 'error');
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
    } catch (err: any) {
      showToast(err.message || 'Lỗi xóa bạn', 'error');
    } finally {
      setRemovingFriendId(null);
    }
  };

  // Render friendship action button for search results
  const renderFriendshipAction = (user: User) => {
    if (!currentUser) return null;
    const { status, requestId } = friendsHook.getFriendshipStatus(user._id, currentUser._id);
    const isActionLoading = !!friendsHook.actionLoading;

    switch (status) {
      case 'self':
        return (
          <span className="text-[11px] text-slate-500 italic px-2">Bạn</span>
        );
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
              onClick={() => requestId && handleAcceptRequest(requestId)}
              disabled={isActionLoading}
              className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
              title="Chấp nhận"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => requestId && handleDeclineRequest(requestId)}
              disabled={isActionLoading}
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
            onClick={() => handleSendRequest(user._id)}
            disabled={isActionLoading}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-medium disabled:opacity-50 transition-colors"
          >
            {isActionLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <UserPlus className="w-3.5 h-3.5" />
            )}
            <span>Thêm bạn</span>
          </button>
        );
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
        {/* === SEARCH TAB === */}
        {activeTab === 'search' && (
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
              <div className="text-center py-8 text-slate-400 text-xs">
                Không tìm thấy người dùng nào phù hợp
              </div>
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
                      <UserAvatar
                        src={user.avatarUrl}
                        name={user.displayName || user.username}
                        size="md"
                      />
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                          {user.displayName || user.username}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          @{user.username}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {renderFriendshipAction(user)}
                    </div>
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
        )}

        {/* === FRIENDS TAB === */}
        {activeTab === 'friends' && (
          <div className="p-4 space-y-2">
            {friendsHook.loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-sky-500" />
                <span className="ml-2 text-xs text-slate-400">Đang tải...</span>
              </div>
            ) : friendsHook.error ? (
              <div className="text-center py-12 text-rose-400 text-xs">
                <p>{friendsHook.error}</p>
                <button
                  onClick={friendsHook.refetch}
                  className="mt-2 text-sky-400 hover:underline"
                >
                  Thử lại
                </button>
              </div>
            ) : friendsHook.friends.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Users className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium text-slate-500">Chưa có bạn bè nào</p>
                <p className="text-xs mt-1">Hãy tìm và kết bạn với người dùng khác</p>
                <button
                  onClick={() => setActiveTab('search')}
                  className="mt-3 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors"
                >
                  Tìm bạn bè
                </button>
              </div>
            ) : (
              friendsHook.friends.map((friend) => (
                <div
                  key={friend._id}
                  className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-sky-500/40 transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar
                      src={friend.avatarUrl}
                      name={friend.displayName || friend.username || ''}
                      size="md"
                    />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                        {friend.displayName || friend.username}
                      </h3>
                      {friend.username && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          @{friend.username}
                        </p>
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
                      onClick={() => handleRemoveFriend(friend._id)}
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
        )}

        {/* === REQUESTS TAB === */}
        {activeTab === 'requests' && (
          <div className="p-4 space-y-4">
            {/* Received Requests */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1 mb-2">
                Lời mời nhận được ({friendsHook.receivedRequests.length})
              </h3>
              {friendsHook.receivedRequests.length === 0 ? (
                <p className="text-xs text-slate-400 px-1">Không có lời mời nào</p>
              ) : (
                <div className="space-y-1">
                  {friendsHook.receivedRequests.map((req) => {
                    const sender = typeof req.from === 'object' ? req.from : null;
                    return (
                      <div
                        key={req._id}
                        className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar
                            src={sender?.avatarUrl}
                            name={sender?.displayName || sender?.username || ''}
                            size="md"
                          />
                          <div className="min-w-0">
                            <h4 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                              {sender?.displayName || sender?.username || 'Người dùng'}
                            </h4>
                            {req.message && (
                              <p className="text-xs text-slate-400 truncate italic">
                                &ldquo;{req.message}&rdquo;
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleAcceptRequest(req._id)}
                            disabled={!!friendsHook.actionLoading}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium disabled:opacity-50 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" /> Chấp nhận
                          </button>
                          <button
                            onClick={() => handleDeclineRequest(req._id)}
                            disabled={!!friendsHook.actionLoading}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-[11px] font-medium disabled:opacity-50 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" /> Từ chối
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sent Requests */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1 mb-2">
                Lời mời đã gửi ({friendsHook.sentRequests.length})
              </h3>
              {friendsHook.sentRequests.length === 0 ? (
                <p className="text-xs text-slate-400 px-1">Không có lời mời nào</p>
              ) : (
                <div className="space-y-1">
                  {friendsHook.sentRequests.map((req) => {
                    const receiver = typeof req.to === 'object' ? req.to : null;
                    return (
                      <div
                        key={req._id}
                        className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar
                            src={receiver?.avatarUrl}
                            name={receiver?.displayName || receiver?.username || ''}
                            size="md"
                          />
                          <div className="min-w-0">
                            <h4 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                              {receiver?.displayName || receiver?.username || 'Người dùng'}
                            </h4>
                          </div>
                        </div>
                        <span className="flex items-center gap-1 text-[11px] text-amber-400 font-medium shrink-0">
                          <Clock className="w-3.5 h-3.5" /> Đang chờ
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
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
