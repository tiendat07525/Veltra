'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { socketService } from '@/services/socket/socket.service';
import { Conversation } from '@/types/conversation';
import { Message } from '@/types/message';
import { NotificationItem, NotificationNewEvent } from '@/types/notification';
import { describeNotification } from '@/components/common/NotificationsView';

export type BrowserNotificationPermission = NotificationPermission | 'unsupported';

const BASE_TITLE = 'Veltra – Ứng dụng chat realtime';

const isSupported = () => typeof window !== 'undefined' && 'Notification' in window;

interface Options {
  enabled: boolean;
  currentUserId: string | null;
  conversations: Conversation[];
  // Unread messages + unread notifications, shown as "(N)" in the tab title
  unreadTotal: number;
  onOpenConversation: (conversationId: string) => void;
  onOpenNotification: (item: NotificationItem) => void;
}

/**
 * System notifications while the tab is hidden: new messages ("Tin nhắn mới từ X", never the
 * content) and stored notifications. Also keeps the unread total in the tab title.
 */
export function useBrowserNotifications({
  enabled,
  currentUserId,
  conversations,
  unreadTotal,
  onOpenConversation,
  onOpenNotification,
}: Options) {
  const [permission, setPermission] = useState<BrowserNotificationPermission>('unsupported');

  // Latest values for the socket handlers, without re-subscribing on every change
  const latest = useRef({ currentUserId, conversations, onOpenConversation, onOpenNotification });
  useEffect(() => {
    latest.current = { currentUserId, conversations, onOpenConversation, onOpenNotification };
  });

  useEffect(() => {
    if (!isSupported()) return;
    void Promise.resolve().then(() => setPermission(Notification.permission));
  }, []);

  // Must be called from a user gesture (button click)
  const requestPermission = useCallback(async () => {
    if (!isSupported()) return;
    try {
      setPermission(await Notification.requestPermission());
    } catch {
      setPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (!enabled || permission !== 'granted') return;

    const show = (body: string, tag: string, onClick: () => void) => {
      if (!document.hidden) return;
      try {
        const notification = new Notification('Veltra', { body, tag });
        notification.onclick = () => {
          window.focus();
          onClick();
          notification.close();
        };
      } catch {
        // Some browsers only allow notifications from a service worker
      }
    };

    const handleMessage = (payload: { message?: Message }) => {
      const message = payload?.message;
      const { currentUserId: me, conversations: list, onOpenConversation: open } = latest.current;
      if (!message || message.type === 'system' || message.senderId === me) return;

      const conversation = list.find((c) => c._id === message.conversationId);
      const sender = conversation?.participants.find((p) => p._id === message.senderId);
      const senderName = sender?.displayName || sender?.username || 'Người dùng';
      const body =
        conversation?.type === 'group'
          ? `Tin nhắn mới từ ${senderName} trong ${conversation.group?.name || 'nhóm'}`
          : `Tin nhắn mới từ ${senderName}`;

      const conversationId = message.conversationId;
      show(body, `conv:${conversationId}`, () => open(conversationId));
    };

    const handleNotification = (event: NotificationNewEvent) => {
      const item = event?.notification;
      if (!item) return;
      const { actorName, text } = describeNotification(item);
      show(`${actorName} ${text}`, `notif:${item._id}`, () =>
        latest.current.onOpenNotification(item)
      );
    };

    socketService.on('message:new', handleMessage);
    socketService.on('notification:new', handleNotification);
    return () => {
      socketService.off('message:new', handleMessage);
      socketService.off('notification:new', handleNotification);
    };
  }, [enabled, permission]);

  useEffect(() => {
    document.title = unreadTotal > 0 ? `(${unreadTotal}) ${BASE_TITLE}` : BASE_TITLE;
  }, [unreadTotal]);

  return { permission, requestPermission };
}
