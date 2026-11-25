'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { socketService } from '@/services/socket/socket.service';
import { notificationService } from '@/services/api/notification.service';
import {
  NotificationItem,
  NotificationNewEvent,
  NotificationReadEvent,
  NotificationRemovedEvent,
} from '@/types/notification';
import { UserUpdatedEvent } from '@/types/user';
import { withUser } from '@/lib/user-info';

/**
 * Stored notifications. Instantiated once (VeltraClientApp): the unread count feeds the
 * sidebar badge from the start; the list is loaded the first time the tab asks for it.
 * Every socket event carries the server's unread count, which replaces the local one.
 */
export function useNotifications(enabled: boolean) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  // The first page has been requested (list is kept current by socket events from then on)
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadedRef = useRef(false);

  const refreshUnreadCount = useCallback(async () => {
    try {
      setUnreadCount(await notificationService.getUnreadCount());
    } catch {
      // Badge keeps its value; next event or reconnect corrects it
    }
  }, []);

  const loadFirstPage = useCallback(async () => {
    loadedRef.current = true;
    setLoaded(true);
    setLoading(true);
    setError(null);
    try {
      const page = await notificationService.list();
      setItems(page.items);
      setHasMore(page.hasMore);
    } catch {
      setError('Không thể tải thông báo');
    } finally {
      setLoading(false);
    }
  }, []);

  // Called by the notifications tab on mount
  const ensureLoaded = useCallback(() => {
    if (!loadedRef.current) void loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    const oldest = items[items.length - 1];
    if (!oldest || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await notificationService.list(oldest._id);
      setItems((prev) => {
        const known = new Set(prev.map((item) => item._id));
        return [...prev, ...page.items.filter((item) => !known.has(item._id))];
      });
      setHasMore(page.hasMore);
    } catch {
      setError('Không thể tải thêm thông báo');
    } finally {
      setLoadingMore(false);
    }
  }, [items, hasMore, loadingMore]);

  const markAsRead = useCallback(async (notificationId: string) => {
    const count = await notificationService.markAsRead(notificationId);
    setItems((prev) =>
      prev.map((item) => (item._id === notificationId ? { ...item, isRead: true } : item))
    );
    setUnreadCount(count);
  }, []);

  const markAllAsRead = useCallback(async () => {
    const count = await notificationService.markAllAsRead();
    setItems((prev) => prev.map((item) => (item.isRead ? item : { ...item, isRead: true })));
    setUnreadCount(count);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleNew = (event: NotificationNewEvent) => {
      if (!event?.notification) return;
      setUnreadCount(event.unreadCount);
      if (!loadedRef.current) return;
      setItems((prev) =>
        prev.some((item) => item._id === event.notification._id)
          ? prev
          : [event.notification, ...prev]
      );
    };
    const handleRead = (event: NotificationReadEvent) => {
      if (!event) return;
      setUnreadCount(event.unreadCount);
      setItems((prev) =>
        prev.map((item) =>
          !item.isRead && (event.all || item._id === event.notificationId)
            ? { ...item, isRead: true }
            : item
        )
      );
    };
    const handleRemoved = (event: NotificationRemovedEvent) => {
      if (!event?.notificationIds) return;
      setUnreadCount(event.unreadCount);
      const removed = new Set(event.notificationIds);
      setItems((prev) => prev.filter((item) => !removed.has(item._id)));
    };
    const handleUserUpdated = ({ user }: UserUpdatedEvent) =>
      setItems((prev) =>
        prev.map((item) => (item.actor?._id === user._id ? { ...item, actor: withUser(item.actor, user) } : item))
      );
    // Events missed while disconnected: re-read the count, and the first page if shown
    const handleConnect = () => {
      void refreshUnreadCount();
      if (loadedRef.current) void loadFirstPage();
    };

    socketService.on('notification:new', handleNew);
    socketService.on('notification:read', handleRead);
    socketService.on('notification:removed', handleRemoved);
    socketService.on('user:updated', handleUserUpdated);
    socketService.on('connect', handleConnect);
    void Promise.resolve().then(refreshUnreadCount);

    return () => {
      socketService.off('notification:new', handleNew);
      socketService.off('notification:read', handleRead);
      socketService.off('notification:removed', handleRemoved);
      socketService.off('user:updated', handleUserUpdated);
      socketService.off('connect', handleConnect);
    };
  }, [enabled, refreshUnreadCount, loadFirstPage]);

  return {
    items,
    hasMore,
    loaded,
    loading,
    loadingMore,
    error,
    unreadCount,
    ensureLoaded,
    loadMore,
    refetch: loadFirstPage,
    markAsRead,
    markAllAsRead,
  };
}
