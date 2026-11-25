// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { handlers, service, refreshSilent, api } = vi.hoisted(() => ({
  handlers: new Map<string, (arg?: unknown) => void>(),
  service: { connect: vi.fn(), disconnect: vi.fn(), retryNow: vi.fn(), isConnected: vi.fn(() => false), isGivenUp: vi.fn(() => false) },
  refreshSilent: vi.fn(),
  api: { token: 't' as string | null, listener: (() => undefined) as (token: string | null) => void },
}));
vi.mock('@/services/socket/socket.service', () => ({
  socketService: {
    ...service,
    on: (event: string, handler: (arg?: unknown) => void) => handlers.set(event, handler),
    off: (event: string) => handlers.delete(event),
  },
}));
vi.mock('@/services/api/auth.service', () => ({ authService: { refreshSilent } }));
vi.mock('@/services/api/api', () => ({
  getToken: () => api.token,
  onTokenChange: (listener: (token: string | null) => void) => {
    api.listener = listener;
    return () => undefined;
  },
}));

import { useSocket } from '@/hooks/use-socket/use-socket';

const fire = (event: string, arg?: unknown) => act(() => handlers.get(event)!(arg));
const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  service.isConnected.mockReturnValue(false);
  service.isGivenUp.mockReturnValue(false);
  refreshSilent.mockResolvedValue('ok');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useSocket', () => {
  it('refreshes when the server closed the socket, not when the transport dropped', async () => {
    renderHook(() => useSocket());
    fire('disconnect', 'transport close');
    await tick(60_000);
    expect(refreshSilent).not.toHaveBeenCalled();
    fire('disconnect', 'io server disconnect');
    await tick(0);
    expect(refreshSilent).toHaveBeenCalledTimes(1);
  });

  it('refreshes when the handshake was refused, not while socket.io still retries', async () => {
    renderHook(() => useSocket());
    fire('connect_error', new Error('websocket error'));
    await tick(60_000);
    expect(refreshSilent).not.toHaveBeenCalled();
    service.isGivenUp.mockReturnValue(true);
    fire('connect_error', new Error('Không có quyền truy cập'));
    await tick(1500);
    expect(refreshSilent).toHaveBeenCalledTimes(1);
  });

  it('back online: retries at once, at most every 3 s, never while connected', async () => {
    renderHook(() => useSocket());
    act(() => void window.dispatchEvent(new Event('online')));
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(service.retryNow).toHaveBeenCalledTimes(1);
    await tick(3000);
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(service.retryNow).toHaveBeenCalledTimes(2);
    await tick(3000);
    service.isConnected.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event('online')));
    expect(service.retryNow).toHaveBeenCalledTimes(2);
  });

  it('back online while a refresh is waiting: refreshes instead of reconnecting with the old token', async () => {
    renderHook(() => useSocket());
    refreshSilent.mockResolvedValue('unavailable');
    fire('disconnect', 'io server disconnect');
    await tick(0);
    act(() => void window.dispatchEvent(new Event('online')));
    expect(refreshSilent).toHaveBeenCalledTimes(2);
    expect(service.retryNow).not.toHaveBeenCalled();
  });

  it('logout stops everything', async () => {
    renderHook(() => useSocket());
    refreshSilent.mockResolvedValue('unavailable');
    fire('disconnect', 'io server disconnect');
    await tick(0);
    act(() => api.listener(null));
    expect(service.disconnect).toHaveBeenCalled();
    await tick(120_000);
    expect(refreshSilent).toHaveBeenCalledTimes(1);
  });
});
