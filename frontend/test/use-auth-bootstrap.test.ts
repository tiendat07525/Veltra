// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { state, refreshSilent, replace } = vi.hoisted(() => ({
  state: { token: null as string | null },
  refreshSilent: vi.fn<() => Promise<'ok' | 'rejected' | 'unavailable'>>(),
  replace: vi.fn<(path: string) => void>(),
}));
vi.mock('@/services/api/api', () => ({ getToken: () => state.token }));
vi.mock('@/services/api/auth.service', () => ({ authService: { refreshSilent, logout: vi.fn() } }));
vi.mock('@/lib/navigation', () => {
  const router = { replace };
  return { useRouter: () => router };
});

import { useAuthBootstrap } from '@/hooks/use-auth-bootstrap';

const render = (path: string) =>
  renderHook(({ pathname }) => useAuthBootstrap(pathname), { initialProps: { pathname: path } });
const pass = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const ok = async () => {
  state.token = 't';
  return 'ok' as const;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  refreshSilent.mockReset();
  state.token = null;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useAuthBootstrap', () => {
  it('opens the app with a refreshed session', async () => {
    refreshSilent.mockImplementation(ok);
    const { result } = render('/auth/login');
    expect(result.current.isInitializing).toBe(true);
    await pass(0);
    expect(result.current).toMatchObject({ isInitializing: false, isAuthenticated: true });
    expect(replace).toHaveBeenCalledWith('/chat');
  });

  it('does not refresh when a token is in memory', async () => {
    state.token = 't';
    const { result } = render('/settings');
    await pass(0);
    expect(refreshSilent).not.toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(true);
    expect(replace).not.toHaveBeenCalled();
  });

  it('goes to login at once when the session is rejected', async () => {
    refreshSilent.mockResolvedValue('rejected');
    const { result } = render('/chat');
    await pass(0);
    expect(refreshSilent).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ isInitializing: false, isAuthenticated: false });
    expect(replace).toHaveBeenCalledWith('/auth/login');
  });

  it('stays on the register page without a session', async () => {
    refreshSilent.mockResolvedValue('rejected');
    render('/auth/register');
    await pass(0);
    expect(replace).not.toHaveBeenCalled();
  });

  it('waits for a server that comes back', async () => {
    refreshSilent.mockResolvedValueOnce('unavailable').mockResolvedValueOnce('unavailable').mockImplementationOnce(ok);
    const { result } = render('/chat');
    await pass(2999);
    expect(result.current.isInitializing).toBe(true);
    expect(refreshSilent).toHaveBeenCalledTimes(2);
    await pass(1);
    expect(result.current).toMatchObject({ isInitializing: false, isAuthenticated: true });
    expect(replace).not.toHaveBeenCalled();
  });

  it('gives up after 1 + 2 + 4 s', async () => {
    refreshSilent.mockResolvedValue('unavailable');
    const { result } = render('/chat');
    await pass(6999);
    expect(result.current.isInitializing).toBe(true);
    await pass(1);
    expect(refreshSilent).toHaveBeenCalledTimes(4);
    expect(result.current).toMatchObject({ isInitializing: false, isAuthenticated: false });
    expect(replace).toHaveBeenCalledWith('/auth/login');
  });

  it('stops waiting after a manual login', async () => {
    refreshSilent.mockResolvedValue('unavailable');
    const { result } = render('/auth/login');
    await pass(500);
    state.token = 'from-login';
    await pass(500);
    expect(refreshSilent).toHaveBeenCalledTimes(1);
    expect(result.current.isAuthenticated).toBe(true);
    expect(replace).toHaveBeenCalledWith('/chat');
  });

  it('does nothing more after unmount', async () => {
    refreshSilent.mockResolvedValue('unavailable');
    const { unmount } = render('/chat');
    await pass(0);
    unmount();
    await pass(10_000);
    expect(refreshSilent).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });
});
