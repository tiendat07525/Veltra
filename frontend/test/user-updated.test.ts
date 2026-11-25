// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationPage } from '@/types/notification';

const { handlers, friendApi, notificationApi } = vi.hoisted(() => ({
  handlers: new Map<string, (payload?: unknown) => void>(),
  friendApi: { getFriends: vi.fn(), getFriendRequests: vi.fn() },
  notificationApi: { list: vi.fn(), getUnreadCount: vi.fn() },
}));
vi.mock('@/services/api/friend.service', () => ({ friendService: friendApi }));
vi.mock('@/services/api/notification.service', () => ({ notificationService: notificationApi }));
vi.mock('@/services/socket/socket.service', () => ({
  socketService: {
    on: (event: string, handler: (payload?: unknown) => void) => handlers.set(event, handler),
    off: (event: string) => handlers.delete(event),
  },
}));

import { useFriends } from '@/hooks/use-friends';
import { useNotifications } from '@/hooks/use-notifications';
import { withUser } from '@/lib/user-info';

const binh = { _id: 'bi', username: 'binh', displayName: 'Bình', avatarUrl: 'https://x/old.png' };
const cuong = { _id: 'cu', username: 'cuong' };
const updated = { _id: 'bi', username: 'binh', displayName: 'Bình Mới', avatarUrl: '' };
const emitUpdate = () => act(async () => handlers.get('user:updated')!({ user: updated }));

beforeEach(() => {
  vi.resetAllMocks();
  handlers.clear();
});
afterEach(cleanup);

describe('withUser', () => {
  it('replaces name and avatar of that user only, and keeps other fields', () => {
    expect(withUser({ ...binh, joinedAt: 'j' }, updated)).toEqual({ ...updated, joinedAt: 'j' });
    expect(withUser(binh, { _id: 'bi', username: 'binh' })).toEqual({
      _id: 'bi',
      username: 'binh',
      displayName: undefined,
      avatarUrl: undefined,
    });
    expect(withUser(cuong, updated)).toBe(cuong);
    expect(withUser(null, updated)).toBeNull();
    expect(withUser('bi', updated)).toBe('bi');
  });
});

describe('useFriends: user:updated', () => {
  it('shows the new name and avatar in friends and requests', async () => {
    friendApi.getFriends.mockResolvedValue([binh, cuong]);
    friendApi.getFriendRequests.mockResolvedValue({
      sent: [{ _id: 'r1', from: 'me', to: binh, status: 'pending' }],
      received: [
        { _id: 'r2', from: binh, to: 'me', status: 'pending' },
        { _id: 'r3', from: null, to: 'me', status: 'pending' },
      ],
    });
    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await emitUpdate();
    expect(result.current.friends).toEqual([updated, cuong]);
    expect(result.current.sentRequests[0].to).toEqual(updated);
    expect(result.current.receivedRequests.map((r) => r.from)).toEqual([updated, null]);
    expect(friendApi.getFriends).toHaveBeenCalledTimes(1);
  });
});

describe('useNotifications: user:updated', () => {
  it('shows the new name and avatar of the actor', async () => {
    const item = { type: 'friend_accepted' as const, isRead: true, createdAt: '2026-01-01T00:00:00.000Z' };
    notificationApi.getUnreadCount.mockResolvedValue(0);
    notificationApi.list.mockResolvedValue({
      items: [
        { ...item, _id: 'n1', actor: binh },
        { ...item, _id: 'n2', actor: null },
        { ...item, _id: 'n3', actor: cuong },
      ],
      hasMore: false,
    } satisfies NotificationPage);
    const { result } = renderHook(() => useNotifications(true));
    await act(async () => result.current.ensureLoaded());
    await emitUpdate();
    expect(result.current.items.map((i) => i.actor)).toEqual([updated, null, cuong]);
  });
});
