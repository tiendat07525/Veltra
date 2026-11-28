import { describe, expect, it } from 'vitest';
import {
  applyRevokes,
  failedConversationIds,
  isRetryableSendError,
  mergeNewestPage,
  prependOlderPage,
  upsertMessage,
  withOutbox,
} from '@/lib/message-list';
import type { Message } from '@/types/message';

const msg = (over: Partial<Message>): Message => ({
  _id: `id-${over.seq ?? over.clientMsgId}`,
  conversationId: 'c1',
  senderId: 'u1',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});
const ids = (list: Message[]) => list.map((m) => m._id);

describe('upsertMessage', () => {
  const list = [msg({ seq: 1 }), msg({ seq: 3 })];

  it('places a stored message by seq, not by arrival or createdAt', () => {
    expect(ids(upsertMessage(list, msg({ seq: 2, createdAt: '2030-01-01T00:00:00.000Z' })))).toEqual(['id-1', 'id-2', 'id-3']);
    expect(ids(upsertMessage(list, msg({ seq: 4, createdAt: '2000-01-01T00:00:00.000Z' })))).toEqual(['id-1', 'id-3', 'id-4']);
    expect(ids(upsertMessage([], msg({ seq: 1 })))).toEqual(['id-1']);
  });

  it('keeps optimistic messages after the stored ones', () => {
    const pending = msg({ _id: 'p', clientMsgId: 'x', status: 'sending' });
    expect(ids(upsertMessage([...list, pending], msg({ seq: 4 })))).toEqual(['id-1', 'id-3', 'id-4', 'p']);
  });

  it('replaces the optimistic copy by clientMsgId; a second copy changes nothing', () => {
    const pending = msg({ _id: 'p', clientMsgId: 'x', status: 'sending' });
    const saved = msg({ seq: 4, clientMsgId: 'x' });
    const once = upsertMessage([...list, pending], saved);
    expect(ids(once)).toEqual(['id-1', 'id-3', 'id-4']);
    expect(upsertMessage(once, saved)).toEqual(once);
  });

  it('does not treat two messages without clientMsgId as the same one', () => {
    expect(ids(upsertMessage([msg({ seq: 1 })], msg({ seq: 2 })))).toEqual(['id-1', 'id-2']);
  });

  it('replaces an optimistic message in place and appends a new one', () => {
    const pending = msg({ _id: 'p', clientMsgId: 'x', status: 'failed' });
    const next = upsertMessage([pending, msg({ _id: 'q', clientMsgId: 'y' })], { ...pending, status: 'sending' });
    expect(next.map((m) => [m._id, m.status])).toEqual([['p', 'sending'], ['q', undefined]]);
    expect(ids(upsertMessage(list, pending))).toEqual(['id-1', 'id-3', 'p']);
  });

  it('does not change the input list', () => {
    const before = structuredClone(list);
    upsertMessage(list, msg({ seq: 2 }));
    expect(list).toEqual(before);
  });
});

describe('mergeNewestPage', () => {
  const page = [msg({ seq: 2 }), msg({ seq: 3 })];

  it('keeps only held messages newer than the page', () => {
    const held = [msg({ seq: 1 }), msg({ seq: 3 }), msg({ seq: 4 }), msg({ seq: 5 })];
    expect(ids(mergeNewestPage(held, page))).toEqual(['id-2', 'id-3', 'id-4', 'id-5']);
  });

  it('takes the copy of the page for a message both have', () => {
    const merged = mergeNewestPage([msg({ seq: 3, content: 'old' })], [msg({ seq: 3, content: 'new' })]);
    expect(merged.map((m) => m.content)).toEqual(['new']);
  });

  it('keeps everything held when the page is empty', () => {
    expect(ids(mergeNewestPage([msg({ seq: 1 })], []))).toEqual(['id-1']);
  });
});

describe('prependOlderPage', () => {
  it('puts the page in front without the messages already held', () => {
    const merged = prependOlderPage([msg({ seq: 3 }), msg({ seq: 4 })], [msg({ seq: 2 }), msg({ seq: 3 })]);
    expect(ids(merged)).toEqual(['id-2', 'id-3', 'id-4']);
  });
});

describe('applyRevokes', () => {
  const attachments = [{ kind: 'image' as const, url: 'u', name: 'n', bytes: 1 }];

  it('empties the revoked message only', () => {
    const list = [msg({ seq: 1, content: 'a', attachments }), msg({ seq: 2, content: 'b' })];
    const next = applyRevokes(list, new Map([['id-1', 'gone']]));
    expect(next[0]).toMatchObject({ isRevoked: true, content: 'gone' });
    expect(next[0].attachments).toBeUndefined();
    expect(next[1]).toBe(list[1]);
    expect(list[0].content).toBe('a');
  });

  it('returns the same list when nothing was revoked', () => {
    const list = [msg({ seq: 1 })];
    expect(applyRevokes(list, new Map())).toBe(list);
  });
});

describe('withOutbox', () => {
  const unsent = msg({ _id: 'p', clientMsgId: 'x', status: 'failed' });

  it('adds the unsent messages of this conversation at the end', () => {
    const other = msg({ _id: 'q', clientMsgId: 'y', conversationId: 'c2' });
    expect(ids(withOutbox([msg({ seq: 1 })], [other, unsent], 'c1'))).toEqual(['id-1', 'p']);
  });

  it('leaves out a message that is already stored', () => {
    expect(ids(withOutbox([msg({ seq: 1, clientMsgId: 'x' })], [unsent], 'c1'))).toEqual(['id-1']);
  });

  it('returns the same list when nothing is unsent here', () => {
    const stored = [msg({ seq: 1 })];
    expect(withOutbox(stored, [unsent], 'c2')).toBe(stored);
  });
});

describe('isRetryableSendError', () => {
  it.each([
    [new Error('network'), true],
    [undefined, true],
    [{ response: { status: 500 } }, true],
    [{ response: { status: 503 } }, true],
    [{ response: { status: 400 } }, false],
    [{ response: { status: 403 } }, false],
    [{ response: { status: 429 } }, false],
  ])('%j -> %s', (err, expected) => {
    expect(isRetryableSendError(err)).toBe(expected);
  });
});

describe('failedConversationIds', () => {
  it('lists the conversations with a failed message, once each; sending ones do not count', () => {
    const outbox = [
      msg({ clientMsgId: 'a', conversationId: 'c1', status: 'failed' }),
      msg({ clientMsgId: 'b', conversationId: 'c1', status: 'failed' }),
      msg({ clientMsgId: 'c', conversationId: 'c2', status: 'sending' }),
      msg({ clientMsgId: 'd', conversationId: 'c3', status: 'failed' }),
    ];
    expect([...failedConversationIds(outbox)].sort()).toEqual(['c1', 'c3']);
    expect(failedConversationIds([]).size).toBe(0);
  });
});
