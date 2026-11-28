import { Conversation, ConversationParticipant, ReceiptUpdate } from '@/types/conversation';
import { Message } from '@/types/message';

// Group: at most this many reader avatars under one message, the rest as "+N"
export const MAX_READER_AVATARS = 5;

// A member's read position only goes up: `conversation` with it raised to readSeq, or the same object
export function withReadSeq(conversation: Conversation, userId: string, readSeq: number): Conversation {
  let changed = false;
  const participants = conversation.participants.map((p) => {
    if (p._id !== userId || (p.lastReadSeq ?? 0) >= readSeq) return p;
    changed = true;
    return { ...p, lastReadSeq: readSeq };
  });
  return changed ? { ...conversation, participants } : conversation;
}

// `incoming` (a fresh copy from the server) keeping any higher read position `held` already knows:
// a receipt may arrive while the copy is built
export function keepReadPositions(held: Conversation | undefined, incoming: Conversation): Conversation {
  if (!held) return incoming;
  return held.participants.reduce(
    (conv, p) => (p.lastReadSeq ? withReadSeq(conv, p._id, p.lastReadSeq) : conv),
    incoming
  );
}

// `receipt:updated`: raise the member's position. My own (another tab read it) also lowers my unread
// count, never raising it: a newer message may be counted already.
export function applyReceipt(list: Conversation[], receipt: ReceiptUpdate, currentUserId: string | null): Conversation[] {
  return list.map((c) => {
    if (c._id !== String(receipt.conversationId)) return c;
    let next = withReadSeq(c, String(receipt.userId), receipt.readSeq);
    if (currentUserId && String(receipt.userId) === currentUserId && c.lastSeq !== undefined) {
      const held = c.unreadCounts?.[currentUserId];
      const left = Math.max(0, c.lastSeq - receipt.readSeq);
      if (held === undefined || left < held) {
        next = { ...next, unreadCounts: { ...next.unreadCounts, [currentUserId]: left } };
      }
    }
    return next;
  });
}

export interface Receipts {
  // Direct: my message that is the newest one of the conversation, and whether the partner read it
  direct: { messageId: string; seen: boolean } | null;
  // Group: message _id → the other members whose newest read message it is
  readers: Record<string, ConversationParticipant[]>;
}

const NONE: Receipts = { direct: null, readers: {} };

/**
 * What to show under the messages on screen (stored messages carry `seq`; optimistic ones show their
 * own sending / failed state). A member whose position is older than the loaded history shows nothing.
 */
export function computeReceipts(messages: Message[], conversation: Conversation, currentUserId: string): Receipts {
  const others = conversation.participants.filter((p) => p._id !== currentUserId);
  if (messages.length === 0 || others.length === 0) return NONE;

  if (conversation.type === 'direct') {
    const last = messages[messages.length - 1];
    if (last.seq === undefined || last.type === 'system' || String(last.senderId) !== currentUserId) return NONE;
    const partner = others[0];
    return { direct: { messageId: last._id, seen: (partner.lastReadSeq ?? 0) >= last.seq }, readers: {} };
  }

  // Stored, non-system messages from the newest down: each reader goes under the first one they reached
  const stored = messages.filter((m) => m.seq !== undefined && m.type !== 'system');
  const readers: Record<string, ConversationParticipant[]> = {};
  for (const member of others) {
    const readSeq = member.lastReadSeq ?? 0;
    if (readSeq <= 0) continue;
    for (let i = stored.length - 1; i >= 0; i--) {
      if (stored[i].seq! <= readSeq) {
        (readers[stored[i]._id] ??= []).push(member);
        break;
      }
    }
  }
  return { direct: null, readers };
}
