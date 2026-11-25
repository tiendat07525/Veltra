import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTokenRefresher, isSessionRejected } from '@/lib/token-refresh';

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });

describe('isSessionRejected', () => {
  it.each([
    [httpError(401), true],
    [httpError(403), false],
    [httpError(429), false],
    [httpError(500), false],
    [new Error('Network Error'), false],
    [undefined, false],
    [null, false],
  ])('%s -> %s', (err, expected) => {
    expect(isSessionRejected(err)).toBe(expected);
  });
});

describe('createTokenRefresher', () => {
  let token: string | null;
  const requestRefresh = vi.fn<() => Promise<string>>();
  const setToken = vi.fn((next: string | null) => {
    token = next;
  });
  const create = () => createTokenRefresher({ requestRefresh, getToken: () => token, setToken });

  beforeEach(() => {
    token = 'old';
    requestRefresh.mockReset();
    setToken.mockClear();
  });

  it('stores and returns the new token', async () => {
    requestRefresh.mockResolvedValue('new');
    await expect(create()()).resolves.toBe('new');
    expect(token).toBe('new');
  });

  it('runs one request for callers that overlap, and a new one afterwards', async () => {
    requestRefresh.mockResolvedValue('new');
    const refresh = create();
    await Promise.all([refresh(), refresh(), refresh()]);
    expect(requestRefresh).toHaveBeenCalledTimes(1);
    await refresh();
    expect(requestRefresh).toHaveBeenCalledTimes(2);
  });

  it('ends the session only on 401', async () => {
    requestRefresh.mockRejectedValue(httpError(401));
    await expect(create()()).rejects.toThrow('HTTP 401');
    expect(token).toBeNull();
  });

  it.each([httpError(429), httpError(500), httpError(503), new Error('Network Error')])(
    'keeps the session on %s',
    async (err) => {
      requestRefresh.mockRejectedValue(err);
      await expect(create()()).rejects.toBe(err);
      expect(setToken).not.toHaveBeenCalled();
    }
  );

  it.each([httpError(401), new Error('Network Error')])(
    'uses a token stored meanwhile (login, change password) when the refresh fails with %s',
    async (err) => {
      requestRefresh.mockImplementation(async () => {
        token = 'newer';
        throw err;
      });
      await expect(create()()).resolves.toBe('newer');
      expect(token).toBe('newer');
    }
  );

  it('does not bring back a token cleared meanwhile (logout)', async () => {
    requestRefresh.mockImplementation(async () => {
      token = null;
      throw httpError(401);
    });
    await expect(create()()).rejects.toThrow('HTTP 401');
    expect(token).toBeNull();
  });

  it('can refresh again after a failure', async () => {
    requestRefresh.mockRejectedValueOnce(new Error('Network Error')).mockResolvedValueOnce('new');
    const refresh = create();
    await expect(refresh()).rejects.toThrow();
    await expect(refresh()).resolves.toBe('new');
  });
});
