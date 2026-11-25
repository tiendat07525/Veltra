// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/user';

const { getUsers } = vi.hoisted(() => ({
  getUsers: vi.fn<(params: { search: string; limit: number }) => Promise<User[]>>(),
}));
vi.mock('@/services/api/user.service', () => ({ userService: { getUsers } }));

import { useUserSearch } from '@/hooks/use-user-search';
import { userNameMatches } from '@/lib/user-search';

const user = (id: string): User => ({ _id: id, username: id });
const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};
const render = () => renderHook(({ me }) => useUserSearch(me), { initialProps: { me: 'me' as string | undefined } });

beforeEach(() => {
  vi.useFakeTimers();
  getUsers.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useUserSearch', () => {
  it('asks the server once, 400 ms after the last key, for the most it gives', async () => {
    getUsers.mockResolvedValue([user('an')]);
    const { result } = render();
    act(() => result.current.handleSearchChange('a'));
    await tick(300);
    act(() => result.current.handleSearchChange(' an '));
    expect(result.current).toMatchObject({ searchQuery: ' an ', searchLoading: true });
    await tick(399);
    expect(getUsers).not.toHaveBeenCalled();
    await tick(1);
    expect(getUsers.mock.calls).toEqual([[{ search: 'an', limit: 50 }]]);
    expect(result.current.searchResults).toEqual([user('an')]);
    expect(result.current.searchLoading).toBe(false);
  });

  it('leaves me out, also when my id is known only later', async () => {
    getUsers.mockResolvedValue([user('me'), user('an')]);
    const { result, rerender } = renderHook(({ me }) => useUserSearch(me), {
      initialProps: { me: undefined as string | undefined },
    });
    act(() => result.current.handleSearchChange('x'));
    await tick(400);
    rerender({ me: 'me' });
    expect(result.current.searchResults).toEqual([user('an')]);
  });

  it('ignores a slower answer to an older query, also its error', async () => {
    const slow = deferred<User[]>();
    getUsers.mockReturnValueOnce(slow.promise).mockResolvedValueOnce([user('binh')]);
    const { result } = render();
    act(() => result.current.handleSearchChange('a'));
    await tick(400);
    act(() => result.current.handleSearchChange('b'));
    await tick(400);
    await act(async () => slow.reject(new Error('late')));
    expect(result.current.searchResults).toEqual([user('binh')]);
    expect(result.current.searchError).toBeNull();
  });

  it('a failed search shows an error and no old results; typing again clears it', async () => {
    getUsers.mockResolvedValueOnce([user('an')]).mockRejectedValueOnce(new Error('offline'));
    const { result } = render();
    act(() => result.current.handleSearchChange('a'));
    await tick(400);
    act(() => result.current.handleSearchChange('ab'));
    await tick(400);
    expect(result.current).toMatchObject({ searchResults: [], searchLoading: false });
    expect(result.current.searchError).not.toBeNull();
    act(() => result.current.handleSearchChange('abc'));
    expect(result.current.searchError).toBeNull();
  });

  it('an empty box clears the results and asks nothing', async () => {
    getUsers.mockResolvedValueOnce([user('an')]);
    const { result } = render();
    act(() => result.current.handleSearchChange('a'));
    await tick(400);
    act(() => result.current.handleSearchChange('  '));
    expect(result.current).toMatchObject({ searchResults: [], searchLoading: false });
    await tick(1000);
    expect(getUsers).toHaveBeenCalledTimes(1);
  });

  it('asks nothing after unmount', async () => {
    const { result, unmount } = render();
    act(() => result.current.handleSearchChange('a'));
    unmount();
    await tick(1000);
    expect(getUsers).not.toHaveBeenCalled();
  });
});

describe('userNameMatches', () => {
  it('matches the display name or the username, not across both', () => {
    const an = { displayName: 'Nguyễn An', username: 'an_99' };
    expect(userNameMatches(an, 'nguyễn')).toBe(true);
    expect(userNameMatches(an, '_99')).toBe(true);
    expect(userNameMatches(an, 'an an')).toBe(false);
    expect(userNameMatches({ username: 'binh' }, 'bi')).toBe(true);
    expect(userNameMatches({}, 'x')).toBe(false);
    expect(userNameMatches(an, '')).toBe(true);
  });
});
