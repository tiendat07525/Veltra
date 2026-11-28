'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { socketService } from '@/services/socket/socket.service';
import { Conversation } from '@/types/conversation';
import { Message } from '@/types/message';
import { NotificationItem, NotificationNewEvent } from '@/types/notification';
import { describeNotification } from '@/components/common/NotificationsView';
import { UserSettings } from '@/types/settings';
import { playNotificationSound } from '@/lib/notification-sound';

export type BrowserNotificationPermission = NotificationPermission | 'unsupported';

const BASE_TITLE = 'Veltra – Ứng dụng chat realtime';

const isSupported = () => typeof window !== 'undefined' && 'Notification' in window;

// At most one sound per this interval, however many messages arrive
const SOUND_INTERVAL_MS = 2000;

interface Options {
  enabled: boolean;
  currentUserId: string | null;
  conversations: Conversation[];
  // Conversation on screen (null when the chat tab is not shown)
  activeConversationId: string | null;
  settings: UserSettings;
  mutedConversationIds: Set<string>;
  // Unread messages + unread notifications, shown as "(N)" in the tab title
  unreadTotal: number;
  onOpenConversation: (conversationId: string) => void;
  onOpenNotification: (item: NotificationItem) => void;
}

/**
 * System notifications while the tab is hidden: new messages ("Tin nhắn mới từ X", never the
 * content) and stored notifications. Also keeps the unread total in the tab title.
 * Settings: `browser` off or Do Not Disturb → no system notifications; muted conversations
 * never notify. New messages play a sound (`sound` on, not DND, not muted) when the tab is
 * hidden or the message is not in the conversation on screen, at most once per 2 s.
 */
export function useBrowserNotifications({
  enabled,
  currentUserId,
  conversations,
  activeConversationId,
  settings,
  mutedConversationIds,
  unreadTotal,
  onOpenConversation,
  onOpenNotification,
}: Options) {
  const [permission, setPermission] = useState<BrowserNotificationPermission>('unsupported');

  // Latest values for the socket handlers, without re-subscribing on every change
  const latest = useRef({
    currentUserId,
    conversations,
    activeConversationId,
    settings,
    mutedConversationIds,
    onOpenConversation,
    onOpenNotification,
  });
  useEffect(() => {
    latest.current = {
      currentUserId,
      conversations,
      activeConversationId,
      settings,
      mutedConversationIds,
      onOpenConversation,
      onOpenNotification,
    };
  });
  const lastSoundAt = useRef(0);

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
    if (!enabled) return;

    const show = (body: string, tag: string, onClick: () => void) => {
      const { notifications } = latest.current.settings;
      if (!document.hidden || permission !== 'granted') return;
      if (!notifications.browser || notifications.doNotDisturb) return;
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
      const {
        currentUserId: me,
        conversations: list,
        activeConversationId: openId,
        settings: { notifications },
        mutedConversationIds: muted,
        onOpenConversation: open,
      } = latest.current;
      // Call records: the call itself already rang / notified
      if (!message || message.type === 'system' || message.type === 'call' || message.senderId === me) return;
      if (muted.has(message.conversationId)) return;

      const now = Date.now();
      if (
        notifications.sound &&
        !notifications.doNotDisturb &&
        (document.hidden || message.conversationId !== openId) &&
        now - lastSoundAt.current >= SOUND_INTERVAL_MS
      ) {
        lastSoundAt.current = now;
        playNotificationSound();
      }

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
