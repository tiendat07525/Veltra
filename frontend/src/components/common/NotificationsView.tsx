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
import { InlineError } from '@/components/ui/InlineError';

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
      return <UserPlus className="w-3 h-3 text-online" />;
    case 'friend_accepted':
      return <UserCheck className="w-3 h-3 text-online" />;
    case 'group_added':
      return <Users className="w-3 h-3 text-accent" />;
    case 'group_removed':
      return <UserMinus className="w-3 h-3 text-danger" />;
    case 'group_owner':
      return <Crown className="w-3 h-3 text-amber-600 dark:text-amber-400" />;
    default:
      return <Bell className="w-3 h-3 text-fg-muted" />;
  }
};

interface NotificationsViewProps {
  notifications: ReturnType<typeof useNotifications>;
  // Marks it read (done by the caller) and goes where it points to
  onOpen: (item: NotificationItem) => void;
  browserPermission: BrowserNotificationPermission;
  // Asks the browser for permission (must run from this click)
  onEnableBrowserNotifications: () => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  notifications,
  onOpen,
  browserPermission,
  onEnableBrowserNotifications,
}) => {
  const [filterUnread, setFilterUnread] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [markAllError, setMarkAllError] = useState<string | null>(null);
  const { items, hasMore, loading, loadingMore, error, unreadCount, ensureLoaded, loadMore, refetch } =
    notifications;

  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

  const handleMarkAll = async () => {
    setMarkingAll(true);
    setMarkAllError(null);
    try {
      await notifications.markAllAsRead();
    } catch {
      setMarkAllError('Không thể đánh dấu tất cả đã đọc. Thử lại sau.');
    } finally {
      setMarkingAll(false);
    }
  };

  const filtered = filterUnread ? items.filter((n) => !n.isRead) : items;

  return (
    <div className="flex-1 h-full flex flex-col bg-app overflow-hidden">
      {/* Header */}
      <header className="px-4 sm:px-6 py-3 sm:py-4 border-b border-line bg-surface shrink-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-fg">Thông báo</h1>
            {unreadCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-primary text-on-primary text-xs font-bold">
                {unreadCount} mới
              </span>
            )}
          </div>
          {browserPermission === 'denied' && (
            <p className="text-[11px] text-fg-muted">
              Trình duyệt đang chặn thông báo của Veltra
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {browserPermission === 'default' && (
            <button
              type="button"
              onClick={onEnableBrowserNotifications}
              className="flex items-center gap-1.5 min-h-9 px-3 rounded-xl bg-primary hover:bg-primary-hover text-on-primary text-xs font-semibold transition-colors"
            >
              <Bell className="w-4 h-4" aria-hidden="true" />
              <span>Bật thông báo trình duyệt</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setFilterUnread((prev) => !prev)}
            aria-pressed={filterUnread}
            className={`min-h-9 px-3 rounded-xl text-xs font-semibold border transition-colors ${
              filterUnread
                ? 'bg-accent-soft border-primary/40 text-accent'
                : 'border-line text-fg hover:bg-surface-2'
            }`}
          >
            {filterUnread ? 'Hiển thị tất cả' : 'Chỉ chưa đọc'}
          </button>

          <button
            type="button"
            onClick={handleMarkAll}
            disabled={unreadCount === 0 || markingAll}
            className="flex items-center gap-1.5 min-h-9 px-3 rounded-xl bg-surface-2 hover:bg-line disabled:opacity-50 disabled:cursor-not-allowed text-fg text-xs font-semibold transition-colors"
          >
            <CheckCheck className="w-4 h-4 text-accent" aria-hidden="true" />
            <span>Đánh dấu tất cả đã đọc</span>
          </button>
        </div>
      </header>

      <InlineError
        message={markAllError}
        onDismiss={() => setMarkAllError(null)}
        className="mx-4 sm:mx-6 mt-3 shrink-0"
      />

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-4xl mx-auto w-full space-y-2">
        {loading && items.length === 0 ? (
          <div className="h-64 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" aria-label="Đang tải thông báo" />
          </div>
        ) : error && items.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center gap-3 text-sm text-danger text-center" role="alert">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="min-h-9 px-3 rounded-xl bg-primary hover:bg-primary-hover text-on-primary text-xs font-semibold"
            >
              Thử lại
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center text-fg-muted text-sm">
            <Bell className="w-10 h-10 mb-2 opacity-60 text-accent" aria-hidden="true" />
            <p className="font-semibold text-fg">
              {filterUnread ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo nào'}
            </p>
            <p className="text-xs mt-1">Thông báo được giữ trong 30 ngày.</p>
          </div>
        ) : (
          filtered.map((item) => {
            const { actorName, text } = describeNotification(item);
            return (
              <button
                type="button"
                key={item._id}
                onClick={() => onOpen(item)}
                className={`w-full text-left flex items-start gap-3 sm:gap-3.5 p-3 sm:p-4 rounded-2xl cursor-pointer border transition-colors ${
                  item.isRead
                    ? 'bg-surface border-line text-fg-muted hover:bg-surface-2'
                    : 'bg-accent-soft border-primary/30 text-fg'
                }`}
              >
                {/* Avatar with type badge */}
                <div className="relative shrink-0 mt-0.5">
                  <UserAvatar src={item.actor?.avatarUrl} name={actorName} size="md" />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-surface border border-line flex items-center justify-center">
                    {getIcon(item.type)}
                  </div>
                </div>

                {/* Notification Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-relaxed break-words">
                    <span className="font-semibold">{actorName}</span> {text}
                  </p>
                  <span className="text-[11px] text-fg-muted font-medium">
                    {formatDate(item.createdAt)} · {formatTime(item.createdAt)}
                  </span>
                </div>

                {/* Unread indicator dot */}
                {!item.isRead && (
                  <div className="w-2.5 h-2.5 rounded-full bg-primary shrink-0 mt-2 self-start">
                    <span className="sr-only">Chưa đọc</span>
                  </div>
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
              className="flex items-center gap-2 min-h-9 px-4 rounded-xl text-xs font-semibold text-accent hover:bg-accent-soft disabled:opacity-50"
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
