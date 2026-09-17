export type MessageType =
  | 'text'
  | 'image'
  | 'file'
  | 'audio'
  | 'video'
  | 'system'
  | 'call';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export type ReactionEmoji = '❤️' | '👍' | '😂' | '😮' | '😢' | '😡' | '🙏';

export interface MessageReaction {
  emoji: ReactionEmoji;
  count: number;
  users: string[]; // user IDs who reacted
}

export interface ReplyPreviewData {
  id: string;
  senderName: string;
  content: string;
  type: MessageType;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: MessageType;
  createdAt: string;
  status: MessageStatus;
  reactions: MessageReaction[];
  replyTo?: ReplyPreviewData;
  isEdited?: boolean;
  isDeleted?: boolean;
  isPinned?: boolean;
  mediaUrl?: string;
  thumbnailUrl?: string;
  fileName?: string;
  fileSize?: string;
  fileType?: string;
  duration?: number; // seconds for audio or call
  callStatus?: 'missed' | 'completed' | 'declined';
}
