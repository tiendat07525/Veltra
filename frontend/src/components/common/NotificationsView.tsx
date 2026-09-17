import React, { useState } from 'react';
import {
  Bell,
  MessageSquare,
  AtSign,
  Heart,
  PhoneMissed,
  UserPlus,
  CheckCheck,
  Check,
} from 'lucide-react';
import { MOCK_NOTIFICATIONS } from '@/data/mock/notifications';
import { Notification, NotificationType } from '@/types/notification';
import { UserAvatar } from '@/components/ui/UserAvatar';

interface NotificationsViewProps {
  onOpenConversation: (conversationId: string) => void;
  onNotificationsReadChange?: (count: number) => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  onOpenConversation,
  onNotificationsReadChange,
}) => {
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const [filterUnread, setFilterUnread] = useState(false);

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'message':
      case 'new_message':
        return <MessageSquare className="w-4 h-4 text-sky-500" />;
      case 'mention':
        return <AtSign className="w-4 h-4 text-indigo-500" />;
      case 'reaction':
        return <Heart className="w-4 h-4 text-rose-500" />;
      case 'call':
      case 'call_missed':
        return <PhoneMissed className="w-4 h-4 text-amber-500" />;
      case 'group_invite':
      case 'friend_request':
        return <UserPlus className="w-4 h-4 text-emerald-500" />;
      default:
        return <Bell className="w-4 h-4 text-slate-500" />;
    }
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    onNotificationsReadChange?.(0);
  };

  const markItemAsRead = (id: string) => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, isRead: true } : n));
      const unread = next.filter((n) => !n.isRead).length;
      onNotificationsReadChange?.(unread);
      return next;
    });
  };

  const filtered = filterUnread ? notifications.filter((n) => !n.isRead) : notifications;
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="flex-1 h-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Header */}
      <header className="h-16 px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Notifications</h1>
          {unreadCount > 0 && (
            <span className="px-2.5 py-0.5 rounded-full bg-sky-500 text-white text-xs font-bold">
              {unreadCount} new
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterUnread((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
              filterUnread
                ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-500/40 text-sky-600 dark:text-sky-400'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {filterUnread ? 'Show All' : 'Unread Only'}
          </button>

          <button
            type="button"
            onClick={markAllAsRead}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors"
          >
            <CheckCheck className="w-4 h-4 text-sky-500" />
            <span>Mark all read</span>
          </button>
        </div>
      </header>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-4xl mx-auto w-full space-y-2">
        {filtered.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center text-slate-400 text-sm">
            <Bell className="w-10 h-10 mb-2 opacity-40 text-sky-500" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">All caught up!</p>
            <p className="text-xs text-slate-400 mt-1">You have no unread notifications.</p>
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => {
                markItemAsRead(item.id);
                if (item.conversationId) {
                  onOpenConversation(item.conversationId);
                }
              }}
              className={`flex items-start gap-3.5 p-4 rounded-2xl cursor-pointer border transition-all ${
                item.isRead
                  ? 'bg-white dark:bg-slate-900 border-slate-200/70 dark:border-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  : 'bg-sky-50/70 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900/50 text-slate-900 dark:text-white shadow-xs'
              }`}
            >
              {/* Avatar with type badge */}
              <div className="relative shrink-0 mt-0.5">
                <UserAvatar
                  src={item.senderAvatar || item.avatar}
                  name={item.senderName || item.title}
                  size="md"
                />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-xs">
                  {getIcon(item.type)}
                </div>
              </div>

              {/* Notification Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold truncate">
                    {item.title}
                  </h4>
                  <span className="text-[11px] text-slate-400 shrink-0 font-medium">
                    {item.createdAt || item.time}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  {item.content || item.description}
                </p>
              </div>

              {/* Unread indicator dot */}
              {!item.isRead && (
                <div className="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0 mt-2 self-start" />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
