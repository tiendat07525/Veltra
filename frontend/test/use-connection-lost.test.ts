// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnectionLost } from '@/hooks/use-connection-lost';

const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const render = (isConnected: boolean) =>
  renderHook(({ up }) => useConnectionLost(up), { initialProps: { up: isConnected } });

beforeEach(() => void vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useConnectionLost', () => {
  it('is true only after 3 s without a connection, until it is back', async () => {
    const { result, rerender } = render(false);
    await tick(2999);
    expect(result.current).toBe(false);
    await tick(1);
    expect(result.current).toBe(true);
    rerender({ up: true });
    expect(result.current).toBe(false);
  });

  it('a short drop shows nothing', async () => {
    const { result, rerender } = render(true);
    rerender({ up: false });
    await tick(2000);
    rerender({ up: true });
    await tick(5000);
    expect(result.current).toBe(false);
  });

  it('waits again after every reconnect', async () => {
    const { result, rerender } = render(false);
    await tick(3000);
    rerender({ up: true });
    rerender({ up: false });
    expect(result.current).toBe(false);
    await tick(3000);
    expect(result.current).toBe(true);
  });
});
