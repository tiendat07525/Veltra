import { describe, expect, it } from 'vitest';
import { mergeConversationList, updateParticipant } from '@/lib/conversation-list';
import type { Conversation } from '@/types/conversation';

const conv = (id: string, lastSeq = 1, unread = 0, name = id): Conversation => ({
  _id: id,
  type: 'group',
  participants: [],
  group: { name },
  lastSeq,
  unreadCounts: { me: unread, other: 9 },
});
const ids = (list: Conversation[]) => list.map((c) => c._id);
const merge = (before: Conversation[], current: Conversation[], incoming: Conversation[]) =>
  mergeConversationList(before, current, incoming, 'me');

describe('mergeConversationList', () => {
  it('takes the server list: new, changed and removed conversations', () => {
    const held = [conv('a', 1), conv('b', 1)];
    const merged = merge(held, held, [conv('c', 1), conv('a', 3, 2, 'A mới')]);
    expect(ids(merged)).toEqual(['c', 'a']);
    expect(merged[1]).toMatchObject({ lastSeq: 3, unreadCounts: { me: 2 }, group: { name: 'A mới' } });
  });

  it('keeps a copy that is newer than the answer, on top', () => {
    const before = [conv('a', 1), conv('b', 1)];
    const merged = merge(before, [conv('b', 5, 4), conv('a', 1)], [conv('a', 1), conv('b', 4, 3)]);
    expect(ids(merged)).toEqual(['b', 'a']);
    expect(merged[0]).toMatchObject({ lastSeq: 5, unreadCounts: { me: 4 } });
  });

  it('keeps a conversation that appeared while the request ran', () => {
    expect(ids(merge([conv('a')], [conv('n'), conv('a')], [conv('a')]))).toEqual(['n', 'a']);
  });

  it('does not bring back a conversation removed while the request ran', () => {
    expect(ids(merge([conv('a'), conv('b')], [conv('a')], [conv('a'), conv('b')]))).toEqual(['a']);
  });

  it('keeps what I read while the request ran, only for the same newest message', () => {
    const before = [conv('a', 5, 3)];
    expect(merge(before, [conv('a', 5, 0)], [conv('a', 5, 3)])[0].unreadCounts).toEqual({ me: 0, other: 9 });
    expect(merge(before, [conv('a', 5, 0)], [conv('a', 6, 1)])[0].unreadCounts?.me).toBe(1);
    expect(merge(before, [conv('a', 5, 3)], [conv('a', 5, 0)])[0].unreadCounts?.me).toBe(0);
  });
});

describe('updateParticipant', () => {
  it('replaces the name and avatar of that user only, and keeps the rest of the entry', () => {
    const other = { _id: 'other', username: 'other' };
    const a: Conversation = {
      ...conv('a', 4, 2),
      participants: [other, { _id: 'me', username: 'me', displayName: 'Cũ', avatarUrl: 'https://x/a.png', joinedAt: 'j' }],
    };
    const b: Conversation = { ...conv('b'), participants: [other] };
    const next = updateParticipant([a, b], { _id: 'me', username: 'me', displayName: 'Mới', avatarUrl: '' });
    expect(next[0]).toEqual({
      ...a,
      participants: [other, { _id: 'me', username: 'me', displayName: 'Mới', avatarUrl: '', joinedAt: 'j' }],
    });
    expect(next[1]).toBe(b);
  });
});
