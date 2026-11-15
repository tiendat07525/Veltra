import React, { useEffect, useState } from 'react';
import {
  Bell,
  CheckCheck,
  Crown,
  Loader2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { NotificationItem, NotificationType } from '@/types/notification';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { formatDate, formatTime } from '@/lib/utils';
import { useNotifications } from '@/hooks/use-notifications';
import type { BrowserNotificationPermission } from '@/hooks/use-browser-notifications';

// Plain text only (rendered as text nodes, never as HTML)
export function describeNotification(item: NotificationItem): { actorName: string; text: string } {
  const actorName = item.actor?.displayName || item.actor?.username || 'Người dùng';
  const group = item.groupName ? ` «${item.groupName}»` : '';
  switch (item.type) {
    case 'friend_request':
      return { actorName, text: 'đã gửi cho bạn lời mời kết bạn' };
    case 'friend_accepted':
      return { actorName, text: 'đã chấp nhận lời mời kết bạn của bạn' };
    case 'group_added':
      return { actorName, text: `đã thêm bạn vào nhóm${group}` };
    case 'group_removed':
      return { actorName, text: `đã xóa bạn khỏi nhóm${group}` };
    case 'group_owner':
      return { actorName, text: `đã chuyển quyền trưởng nhóm${group} cho bạn` };
    default:
      return { actorName, text: 'có thông báo mới' };
  }
}

const getIcon = (type: NotificationType) => {
  switch (type) {
    case 'friend_request':
      return <UserPlus className="w-3 h-3 text-emerald-500" />;
    case 'friend_accepted':
      return <UserCheck className="w-3 h-3 text-emerald-500" />;
    case 'group_added':
      return <Users className="w-3 h-3 text-sky-500" />;
    case 'group_removed':
      return <UserMinus className="w-3 h-3 text-rose-500" />;
    case 'group_owner':
      return <Crown className="w-3 h-3 text-amber-500" />;
    default:
      return <Bell className="w-3 h-3 text-slate-500" />;
  }
};

interface NotificationsViewProps {
  notifications: ReturnType<typeof useNotifications>;
  // Marks it read (done by the caller) and goes where it points to
  onOpen: (item: NotificationItem) => void;
  onError: (message: string) => void;
  browserPermission: BrowserNotificationPermission;
  // Asks the browser for permission (must run from this click)
  onEnableBrowserNotifications: () => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  notifications,
  onOpen,
  onError,
  browserPermission,
  onEnableBrowserNotifications,
}) => {
  const [filterUnread, setFilterUnread] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const { items, hasMore, loading, loadingMore, error, unreadCount, ensureLoaded, loadMore, refetch } =
    notifications;

  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await notifications.markAllAsRead();
    } catch {
      onError('Không thể đánh dấu đã đọc');
    } finally {
      setMarkingAll(false);
    }
  };

  const filtered = filterUnread ? items.filter((n) => !n.isRead) : items;

  return (
    <div className="flex-1 h-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Header */}
      <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Thông báo</h1>
            {unreadCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-sky-500 text-white text-xs font-bold">
                {unreadCount} mới
              </span>
            )}
          </div>
          {browserPermission === 'denied' && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Trình duyệt đang chặn thông báo của Veltra
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {browserPermission === 'default' && (
            <button
              type="button"
              onClick={onEnableBrowserNotifications}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium transition-colors"
            >
              <Bell className="w-4 h-4" />
              <span>Bật thông báo trình duyệt</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setFilterUnread((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
              filterUnread
                ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-500/40 text-sky-600 dark:text-sky-400'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {filterUnread ? 'Hiển thị tất cả' : 'Chỉ chưa đọc'}
          </button>

          <button
            type="button"
            onClick={handleMarkAll}
            disabled={unreadCount === 0 || markingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors"
          >
            <CheckCheck className="w-4 h-4 text-sky-500" />
            <span>Đánh dấu tất cả đã đọc</span>
          </button>
        </div>
      </header>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-4xl mx-auto w-full space-y-2">
        {loading && items.length === 0 ? (
          <div className="h-64 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
          </div>
        ) : error && items.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center gap-3 text-sm text-slate-500">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium"
            >
              Thử lại
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center text-slate-400 text-sm">
            <Bell className="w-10 h-10 mb-2 opacity-40 text-sky-500" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">
              {filterUnread ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo nào'}
            </p>
            <p className="text-xs text-slate-400 mt-1">Thông báo được giữ trong 30 ngày.</p>
          </div>
        ) : (
          filtered.map((item) => {
            const { actorName, text } = describeNotification(item);
            return (
              <button
                type="button"
                key={item._id}
                onClick={() => onOpen(item)}
                className={`w-full text-left flex items-start gap-3.5 p-4 rounded-2xl cursor-pointer border transition-all ${
                  item.isRead
                    ? 'bg-white dark:bg-slate-900 border-slate-200/70 dark:border-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    : 'bg-sky-50/70 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900/50 text-slate-900 dark:text-white shadow-xs'
                }`}
              >
                {/* Avatar with type badge */}
                <div className="relative shrink-0 mt-0.5">
                  <UserAvatar src={item.actor?.avatarUrl} name={actorName} size="md" />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-xs">
                    {getIcon(item.type)}
                  </div>
                </div>

                {/* Notification Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-relaxed break-words">
                    <span className="font-semibold">{actorName}</span> {text}
                  </p>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {formatDate(item.createdAt)} · {formatTime(item.createdAt)}
                  </span>
                </div>

                {/* Unread indicator dot */}
                {!item.isRead && (
                  <div className="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0 mt-2 self-start" />
                )}
              </button>
            );
          })
        )}

        {hasMore && !filterUnread && items.length > 0 && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 disabled:opacity-50"
            >
              {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Tải thêm
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
