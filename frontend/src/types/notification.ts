// Stored notifications (backend/src/notification). Text is built on the client from `type`.
export type NotificationType =
  | 'friend_request' // actor sent me a friend request
  | 'friend_accepted' // actor accepted my friend request
  | 'group_added' // actor added me to a group
  | 'group_removed' // actor removed me from a group
  | 'group_owner'; // actor made me the group owner

export interface NotificationActor {
  _id: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface NotificationItem {
  _id: string;
  type: NotificationType;
  // null when the actor's account no longer exists
  actor: NotificationActor | null;
  conversationId?: string;
  // Group name when the notification was created
  groupName?: string;
  isRead: boolean;
  createdAt: string; // UTC ISO 8601
}

export interface NotificationPage {
  items: NotificationItem[];
  hasMore: boolean;
}

// Socket payloads (realtime.md)
export interface NotificationNewEvent {
  notification: NotificationItem;
  unreadCount: number;
}

export interface NotificationReadEvent {
  notificationId?: string;
  all?: boolean;
  unreadCount: number;
}

export interface NotificationRemovedEvent {
  notificationIds: string[];
  unreadCount: number;
}
