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

// Group change recorded as a system message; the actor is senderId
export type SystemAction =
  | 'member_left'
  | 'member_removed'
  | 'owner_transferred'
  | 'members_added'
  | 'group_renamed';

export interface Message {
  _id: string;
  id?: string;
  // Client-generated UUIDv7; links an optimistic message to its stored copy. Absent on legacy messages
  clientMsgId?: string;
  // Server-assigned order within the conversation; absent only on optimistic (unsent) messages
  seq?: number;
  conversationId: string;
  senderId: string;
  content?: string;
  imgUrl?: string;
  mediaUrl?: string;
  fileName?: string;
  fileSize?: string;
  duration?: number;
  // Absent = text. 'system' messages are rendered as a centered note from `content` (server-built text)
  type?: MessageType;
  system?: { action: SystemAction; targetIds: string[] };
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
  isRevoked?: boolean;
  isEdited?: boolean;
  createdAt: string;
  updatedAt?: string;
}

// Response from GET /conversation/:id/messages
export interface MessagesResponse {
  // Oldest -> newest (ascending seq)
  messages: Message[];
  // Older messages exist; fetch them with beforeSeq = seq of the oldest message held
  hasMore: boolean;
}
