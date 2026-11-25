// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserProfile } from '@/types/user';

const { getCurrentUser, handlers } = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<CurrentUserProfile>>(),
  handlers: new Map<string, (payload?: unknown) => void>(),
}));
vi.mock('@/services/api/auth.service', () => ({ authService: { getCurrentUser } }));
vi.mock('@/services/socket/socket.service', () => ({
  socketService: {
    on: (event: string, handler: (payload?: unknown) => void) => handlers.set(event, handler),
    off: (event: string) => handlers.delete(event),
  },
}));

import { useCurrentUser } from '@/hooks/use-current-user';

const me = (displayName: string): CurrentUserProfile => ({ _id: 'me', username: 'an', email: 'a@x.vn', displayName });
const emit = (event: string, payload?: unknown) => act(async () => handlers.get(event)!(payload));
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
const renderLoaded = async () => {
  getCurrentUser.mockResolvedValueOnce(me('An'));
  const hook = renderHook(() => useCurrentUser(true));
  await waitFor(() => expect(hook.result.current.currentUserLoading).toBe(false));
  return hook;
};
// One read still running, as a promise to settle later
const running = () => {
  const answer = deferred<CurrentUserProfile>();
  getCurrentUser.mockReturnValueOnce(answer.promise);
  return answer;
};
const myEvent = { user: { _id: 'me', username: 'an', displayName: 'không dùng' } };

beforeEach(() => {
  vi.resetAllMocks();
  handlers.clear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(cleanup);

describe('useCurrentUser', () => {
  it('reads nothing until enabled', async () => {
    const { result } = renderHook(() => useCurrentUser(false));
    await act(async () => {});
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(handlers.size).toBe(0);
    expect(result.current.currentUserLoading).toBe(true);
  });

  it('reads the whole profile again when I changed it in another tab', async () => {
    const { result } = await renderLoaded();
    getCurrentUser.mockResolvedValueOnce({ ...me('An Mới'), bio: 'Chào' });
    await emit('user:updated', myEvent);
    expect(result.current.currentUser).toEqual({ ...me('An Mới'), bio: 'Chào' });
  });

  it('does nothing when someone else changed theirs', async () => {
    const { result } = await renderLoaded();
    await emit('user:updated', { user: { _id: 'bi', displayName: 'Bình' } });
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    expect(result.current.currentUser).toEqual(me('An'));
  });

  it('reads it again on connect, and keeps the current copy when that fails', async () => {
    const { result } = await renderLoaded();
    getCurrentUser.mockRejectedValueOnce(new Error('offline'));
    await emit('connect');
    expect(result.current.currentUser).toEqual(me('An'));
    getCurrentUser.mockResolvedValueOnce(me('An 2'));
    await emit('connect');
    expect(result.current.currentUser).toEqual(me('An 2'));
  });

  it('drops an answer older than the one shown', async () => {
    const { result } = await renderLoaded();
    const older = running();
    const newer = running();
    await emit('connect');
    await emit('user:updated', myEvent);
    await act(async () => newer.resolve(me('mới')));
    await act(async () => older.resolve(me('cũ')));
    expect(result.current.currentUser?.displayName).toBe('mới');
  });

  it('uses an older answer when the newer read fails', async () => {
    const { result } = await renderLoaded();
    const older = running();
    const newer = running();
    await emit('connect');
    await emit('connect');
    await act(async () => newer.reject(new Error('offline')));
    await act(async () => older.resolve(me('cũ')));
    expect(result.current.currentUser?.displayName).toBe('cũ');
  });

  it('keeps a save that came back while a read was running', async () => {
    const { result } = await renderLoaded();
    const read = running();
    await emit('connect');
    act(() => result.current.updateCurrentUser(me('đã lưu')));
    await act(async () => read.resolve(me('cũ')));
    expect(result.current.currentUser?.displayName).toBe('đã lưu');
    getCurrentUser.mockResolvedValueOnce(me('sau đó'));
    await emit('connect');
    expect(result.current.currentUser?.displayName).toBe('sau đó');
  });

  it('reads again for an event during the first read', async () => {
    const first = running();
    const { result } = renderHook(() => useCurrentUser(true));
    await act(async () => {});
    getCurrentUser.mockResolvedValueOnce(me('mới'));
    await emit('user:updated', myEvent);
    await act(async () => first.resolve(me('cũ')));
    expect(result.current.currentUser?.displayName).toBe('mới');
  });

  it('keeps updateCurrentUser stable (ProfileView reads the profile when it changes)', async () => {
    const { result, rerender } = await renderLoaded();
    const { updateCurrentUser } = result.current;
    act(() => updateCurrentUser(me('x')));
    rerender();
    expect(result.current.updateCurrentUser).toBe(updateCurrentUser);
  });
});
