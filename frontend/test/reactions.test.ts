import { describe, expect, it } from 'vitest';
import type { Message } from '@/types/message';
import { applyReactions, groupReactions, myReaction, REACTION_EMOJIS, rememberReactions } from '@/lib/reactions';
import { applyRevokes } from '@/lib/message-list';

const msg = (over: Partial<Message> = {}): Message => ({
  _id: 'm1',
  conversationId: 'c1',
  senderId: 'a',
  content: 'x',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('reactions', () => {
  it('the same five emoji as the server', () => {
    expect(REACTION_EMOJIS).toEqual(['👍', '❤️', '😂', '😮', '😢']);
  });

  it('groups by emoji in the fixed order, counts, and marks mine', () => {
    const groups = groupReactions(
      [
        { userId: 'b', emoji: '😂' },
        { userId: 'me', emoji: '👍' },
        { userId: 'c', emoji: '😂' },
      ],
      'me'
    );
    expect(groups).toEqual([
      { emoji: '👍', count: 1, mine: true, userIds: ['me'] },
      { emoji: '😂', count: 2, mine: false, userIds: ['b', 'c'] },
    ]);
    expect(groupReactions(undefined, 'me')).toEqual([]);
    expect(myReaction([{ userId: 'me', emoji: '😢' }], 'me')).toBe('😢');
    expect(myReaction([{ userId: 'b', emoji: '😢' }], 'me')).toBeNull();
  });

  it('remembers only a newer version', () => {
    const v2 = rememberReactions(new Map(), {
      messageId: 'm1',
      conversationId: 'c1',
      reactions: [{ userId: 'a', emoji: '👍' }],
      reactionsVersion: 2,
    });
    const same = rememberReactions(v2, { messageId: 'm1', conversationId: 'c1', reactions: [], reactionsVersion: 2 });
    expect(same).toBe(v2);
    const older = rememberReactions(v2, { messageId: 'm1', conversationId: 'c1', reactions: [], reactionsVersion: 1 });
    expect(older.get('m1')?.reactions).toEqual([{ userId: 'a', emoji: '👍' }]);
  });

  it('applies known reactions only over older message versions, never on revoked messages', () => {
    const known = new Map([['m1', { reactions: [{ userId: 'a', emoji: '❤️' as const }], version: 3 }]]);
    expect(applyReactions([msg({ reactionsVersion: 2 })], known)[0]).toMatchObject({
      reactions: [{ userId: 'a', emoji: '❤️' }],
      reactionsVersion: 3,
    });
    const newer = msg({ reactions: [], reactionsVersion: 4 });
    expect(applyReactions([newer], known)[0]).toBe(newer);
    const revoked = msg({ isRevoked: true });
    expect(applyReactions([revoked], known)[0]).toBe(revoked);
    expect(applyReactions([msg()], new Map([['m1', { reactions: [], version: 1 }]]))[0].reactions).toBeUndefined();
  });

  it('a revoke drops the reactions', () => {
    const [m] = applyRevokes([msg({ reactions: [{ userId: 'a', emoji: '👍' }] })], new Map([['m1', 'Đã thu hồi']]));
    expect(m.reactions).toBeUndefined();
    expect(m.isRevoked).toBe(true);
  });
});
