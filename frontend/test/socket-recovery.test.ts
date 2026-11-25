import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backoffMs, createSocketRecovery, type RefreshOutcome } from '@/services/socket/socket-recovery';

const refresh = vi.fn<() => Promise<RefreshOutcome>>();
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5); // no jitter
  refresh.mockReset().mockResolvedValue('ok');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('backoffMs', () => {
  it('doubles up to 30 s, ±25 %', () => {
    expect([0, 1, 2, 3, 4, 5, 20].map((n) => backoffMs(n, () => 0.5))).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    expect([backoffMs(0, () => 0), backoffMs(0, () => 1)]).toEqual([750, 1250]);
  });
});

describe('createSocketRecovery', () => {
  it('refreshes at once when the server closed the socket', async () => {
    createSocketRecovery(refresh).refused(true);
    await tick(0);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('waits longer after each refused handshake, even when every refresh succeeds', async () => {
    const recovery = createSocketRecovery(refresh);
    const at: number[] = [];
    const start = Date.now();
    refresh.mockImplementation(async () => {
      at.push((Date.now() - start) / 1000);
      setTimeout(() => recovery.refused(), 1); // the new token is refused again
      return 'ok';
    });
    recovery.refused();
    await tick(62_000);
    expect(at.map(Math.round)).toEqual([1, 3, 7, 15, 31, 61]);
  });

  it('a connection closed right away does not start over', async () => {
    const recovery = createSocketRecovery(refresh);
    for (let i = 0; i < 20; i++) {
      recovery.refused(true);
      await tick(1000);
      recovery.connected();
    }
    expect(refresh.mock.calls.length).toBeLessThan(5);
  });

  it('a stable connection starts over', async () => {
    const recovery = createSocketRecovery(refresh);
    recovery.refused(true);
    await tick(0);
    recovery.connected();
    await tick(30_000);
    recovery.refused(true);
    await tick(0);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('a dropped transport does not count as stable', async () => {
    const recovery = createSocketRecovery(refresh);
    recovery.refused(true);
    await tick(0);
    recovery.connected();
    recovery.dropped();
    await tick(30_000);
    recovery.refused(true);
    await tick(0);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps trying while the server cannot be reached', async () => {
    refresh.mockResolvedValue('unavailable');
    createSocketRecovery(refresh).refused(true);
    await tick(8000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it.each(['ok', 'rejected'] as const)('does nothing more after %s', async (outcome) => {
    refresh.mockResolvedValue(outcome);
    createSocketRecovery(refresh).refused(true);
    await tick(120_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('retryNow skips the wait; without one it says so', async () => {
    const recovery = createSocketRecovery(refresh);
    expect(recovery.retryNow()).toBe(false);
    recovery.refused();
    expect(recovery.retryNow()).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    await tick(5000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('connecting or stopping cancels the next attempt', async () => {
    const recovery = createSocketRecovery(refresh);
    recovery.refused();
    recovery.connected();
    await tick(5000);
    recovery.refused();
    recovery.stop();
    await tick(60_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('a refresh still running when stopped schedules nothing', async () => {
    let done!: (o: RefreshOutcome) => void;
    refresh.mockReturnValueOnce(new Promise((r) => (done = r)));
    const recovery = createSocketRecovery(refresh);
    recovery.refused(true);
    await tick(0);
    recovery.stop();
    done('unavailable');
    await tick(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
