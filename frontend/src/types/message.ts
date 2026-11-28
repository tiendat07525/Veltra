import type { CallRecord } from './call';

export type MessageType = 'text' | 'image' | 'file' | 'audio' | 'video' | 'system' | 'call';
// The fixed set the server accepts (lib/reactions.ts REACTION_EMOJIS)
export type ReactionEmoji = '👍' | '❤️' | '😂' | '😮' | '😢';

// One user's reaction; a user has at most one per message
export interface MessageReaction {
  userId: string;
  emoji: ReactionEmoji;
}

// `message:reaction` event and the PUT / DELETE /message/:id/reaction response
export interface ReactionUpdate {
  messageId: string;
  conversationId: string;
  // In reaction order; [] = none
  reactions: MessageReaction[];
  // +1 per change on the server: the highest one is the current state
  reactionsVersion: number;
}

// Group change recorded as a system message; the actor is senderId
export type SystemAction =
  | 'member_left'
  | 'member_removed'
  | 'owner_transferred'
  | 'members_added'
  | 'group_renamed';

export type AttachmentKind = 'image' | 'video' | 'audio' | 'file';

// A file on a message (stored in Cloudinary). The server never sends its storage id.
export interface MessageAttachment {
  kind: AttachmentKind;
  // https://res.cloudinary.com/… for stored files; blob: preview (or '') while an optimistic upload runs
  url: string;
  name: string;
  bytes: number;
  format?: string;
  width?: number;
  height?: number;
  duration?: number;
  // Client-only, optimistic messages: upload progress 0..1
  progress?: number;
}

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
  // Absent = text. 'system' messages are rendered as a centered note from `content` (server-built text),
  // 'call' messages as a call card from `call`
  type?: MessageType;
  system?: { action: SystemAction; targetIds: string[] };
  // Absent = no files. Cleared when the message is revoked (the files are deleted)
  attachments?: MessageAttachment[];
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  // Only on type 'call': a finished call (content holds the server's text for old clients)
  call?: CallRecord;
  replyTo?: {
    messageId?: string;
    senderName?: string;
    content?: string;
  };
  // Absent = none (also on revoked messages)
  reactions?: MessageReaction[];
  reactionsVersion?: number;
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
