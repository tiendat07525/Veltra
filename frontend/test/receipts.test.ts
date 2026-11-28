import { describe, expect, it } from 'vitest';
import { applyReceipt, computeReceipts, keepReadPositions, withReadSeq } from '@/lib/receipts';
import type { Conversation, ConversationParticipant } from '@/types/conversation';
import type { Message } from '@/types/message';

const member = (id: string, lastReadSeq?: number): ConversationParticipant => ({ _id: id, username: id, lastReadSeq });
const conv = (type: 'direct' | 'group', participants: ConversationParticipant[], over: Partial<Conversation> = {}): Conversation => ({
  _id: 'c1',
  type,
  participants,
  lastSeq: 10,
  ...over,
});
const msg = (seq: number | undefined, senderId: string, over: Partial<Message> = {}): Message => ({
  _id: seq === undefined ? `pending:${senderId}` : `m${seq}`,
  conversationId: 'c1',
  senderId,
  content: 'x',
  seq,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});
const readerIds = (readers: Record<string, ConversationParticipant[]>) =>
  Object.fromEntries(Object.entries(readers).map(([id, list]) => [id, list.map((p) => p._id)]));

describe('withReadSeq / keepReadPositions', () => {
  const c = conv('group', [member('me', 3), member('an', 5)]);

  it('only raises a position; a lower or equal one returns the same object', () => {
    expect(withReadSeq(c, 'an', 7).participants[1].lastReadSeq).toBe(7);
    expect(withReadSeq(c, 'an', 5)).toBe(c);
    expect(withReadSeq(c, 'an', 2)).toBe(c);
    expect(withReadSeq(c, 'nobody', 9)).toBe(c);
  });

  it('a fresh copy keeps the higher positions already held', () => {
    const incoming = conv('group', [member('me', 4), member('an', 2)], { lastSeq: 11 });
    const kept = keepReadPositions(c, incoming);
    expect(kept.participants.map((p) => p.lastReadSeq)).toEqual([4, 5]);
    expect(kept.lastSeq).toBe(11);
    expect(keepReadPositions(undefined, incoming)).toBe(incoming);
  });
});

describe('applyReceipt', () => {
  const list = [conv('group', [member('me', 3), member('an', 5)], { unreadCounts: { me: 7 } }), conv('group', [], { _id: 'c2' })];

  it("raises the member's position in that conversation only", () => {
    const next = applyReceipt(list, { conversationId: 'c1', userId: 'an', readSeq: 9 }, 'me');
    expect(next[0].participants[1].lastReadSeq).toBe(9);
    expect(next[0].unreadCounts).toEqual({ me: 7 });
    expect(next[1]).toBe(list[1]);
  });

  it('my own receipt (another tab) lowers my unread count, never raises it', () => {
    const read = applyReceipt(list, { conversationId: 'c1', userId: 'me', readSeq: 8 }, 'me');
    expect(read[0].unreadCounts).toEqual({ me: 2 });
    expect(read[0].participants[0].lastReadSeq).toBe(8);
    // Held count already lower (a later mark): kept
    const lower = [{ ...list[0], unreadCounts: { me: 1 } }];
    expect(applyReceipt(lower, { conversationId: 'c1', userId: 'me', readSeq: 8 }, 'me')[0].unreadCounts).toEqual({ me: 1 });
  });

  it('an old receipt changes nothing', () => {
    const next = applyReceipt(list, { conversationId: 'c1', userId: 'an', readSeq: 4 }, 'me');
    expect(next[0]).toBe(list[0]);
  });
});

describe('computeReceipts: direct', () => {
  const seenUpTo = (partnerRead: number) => conv('direct', [member('me', 10), member('an', partnerRead)]);

  it('"Đã gửi" under my newest message, "Đã xem" once the partner read it', () => {
    const messages = [msg(9, 'an'), msg(10, 'me')];
    expect(computeReceipts(messages, seenUpTo(9), 'me').direct).toEqual({ messageId: 'm10', seen: false });
    expect(computeReceipts(messages, seenUpTo(10), 'me').direct).toEqual({ messageId: 'm10', seen: true });
  });

  it('nothing when the partner wrote after me, or my newest is still sending, or it is a system message', () => {
    expect(computeReceipts([msg(9, 'me'), msg(10, 'an')], seenUpTo(10), 'me').direct).toBeNull();
    expect(computeReceipts([msg(10, 'me'), msg(undefined, 'me', { status: 'sending' })], seenUpTo(10), 'me').direct).toBeNull();
    expect(computeReceipts([msg(10, 'me', { type: 'system' })], seenUpTo(10), 'me').direct).toBeNull();
    expect(computeReceipts([], seenUpTo(10), 'me').direct).toBeNull();
  });

  it('a partner without a position yet counts as not seen', () => {
    expect(computeReceipts([msg(1, 'me')], conv('direct', [member('me'), member('an')]), 'me').direct).toEqual({
      messageId: 'm1',
      seen: false,
    });
  });
});

describe('computeReceipts: group', () => {
  const messages = [msg(4, 'an'), msg(5, 'me'), msg(6, 'binh', { type: 'system' }), msg(7, 'me'), msg(undefined, 'me')];

  it('puts each other member under the newest non-system message they read', () => {
    const c = conv('group', [member('me', 7), member('an', 7), member('binh', 6), member('chau', 5), member('dung', 4)]);
    expect(readerIds(computeReceipts(messages, c, 'me').readers)).toEqual({
      m7: ['an'],
      // binh read the system message 6: shown under 5
      m5: ['binh', 'chau'],
      m4: ['dung'],
    });
    expect(computeReceipts(messages, c, 'me').direct).toBeNull();
  });

  it('leaves out me, members who read nothing, and positions older than the loaded history', () => {
    const c = conv('group', [member('me', 7), member('an', 0), member('binh'), member('chau', 3)]);
    expect(computeReceipts(messages, c, 'me').readers).toEqual({});
  });

  it('keeps every reader; the component shows at most 5 and "+N"', () => {
    const many = Array.from({ length: 8 }, (_, i) => member(`u${i}`, 7));
    const c = conv('group', [member('me', 7), ...many]);
    expect(computeReceipts(messages, c, 'me').readers.m7).toHaveLength(8);
  });
});
