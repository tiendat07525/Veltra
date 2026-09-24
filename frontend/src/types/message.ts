export type MessageType = 'text' | 'image' | 'file' | 'audio' | 'video' | 'system' | 'call';
export type ReactionEmoji = '👍' | '❤️' | '😂' | '😮' | '😢' | '🔥' | '😡' | '🙏';

export interface MessageReaction {
  emoji: ReactionEmoji | string;
  userId?: string;
  users?: string[];
  count?: number;
}

export interface ReplyPreviewData {
  messageId: string;
  senderName: string;
  content: string;
  type?: MessageType;
}

// Matches backend Message schema with UI compatibility
export interface Message {
  _id: string;
  id?: string;
  conversationId: string;
  senderId: string;
  content?: string;
  imgUrl?: string;
  mediaUrl?: string;
  fileName?: string;
  fileSize?: string;
  duration?: number;
  type?: MessageType;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  callStatus?: 'missed' | 'completed' | 'declined';
  replyTo?: {
    messageId?: string;
    senderName?: string;
    content?: string;
  };
  reactions?: MessageReaction[];
  isPinned?: boolean;
  isDeleted?: boolean;
  isEdited?: boolean;
  createdAt: string;
  updatedAt?: string;
}

// Response from GET /conversation/:id/messages
export interface MessagesResponse {
  messages: Message[];
  nextCursor: string | null;
}
