export type NotificationType =
  | 'message'
  | 'new_message'
  | 'reaction'
  | 'friend_request'
  | 'group_invite'
  | 'mention'
  | 'call'
  | 'call_missed';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  time?: string;
  timestamp: string;
  isRead: boolean;
  avatar?: string;
  senderAvatar?: string;
  senderName?: string;
  content?: string;
  createdAt?: string;
  senderId?: string;
  conversationId?: string;
  messageId?: string;
  actionUrl?: string;
}

export type Notification = NotificationItem;
