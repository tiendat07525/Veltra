import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Reply = { status: number; data?: unknown } | 'network';
type Handler = (config: InternalAxiosRequestConfig) => Reply | Promise<Reply>;

// Answers requests without a network, rejecting like axios does
const adapter = (handler: Handler) =>
  vi.fn<AxiosAdapter>(async (config) => {
    const reply = await handler(config);
    if (reply === 'network') throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config);
    const response: AxiosResponse = {
      data: reply.data ?? {},
      status: reply.status,
      statusText: '',
      headers: {},
      config,
    };
    if (reply.status >= 400) throw new AxiosError('HTTP ' + reply.status, undefined, config, null, response);
    return response;
  });

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

const auth = (config: InternalAxiosRequestConfig) => config.headers.get('Authorization');
// The API accepts only this token
const protectedApi = (valid: string): Handler => (config) =>
  auth(config) === `Bearer ${valid}` ? { status: 200, data: { ok: true } } : { status: 401 };

describe('api', () => {
  let mod: typeof import('@/services/api/api');
  let replace: ReturnType<typeof vi.fn>;

  const use = (apiHandler: Handler, refreshHandler: Handler) => {
    const apiAdapter = adapter(apiHandler);
    const refreshAdapter = adapter(refreshHandler);
    mod.api.defaults.adapter = apiAdapter;
    mod.refreshClient.defaults.adapter = refreshAdapter;
    return { apiAdapter, refreshAdapter };
  };

  beforeEach(async () => {
    // The module holds the token and the refresh in flight: a fresh copy per test
    vi.resetModules();
    replace = vi.fn();
    vi.stubGlobal('window', { location: { pathname: '/chat', replace } });
    mod = await import('@/services/api/api');
  });

  it('sends the token in memory, and none when signed out', async () => {
    const { apiAdapter } = use(() => ({ status: 200 }), () => ({ status: 401 }));
    await mod.api.get('/a');
    mod.setToken('t1');
    await mod.api.get('/b');
    expect(apiAdapter.mock.calls.map(([c]) => auth(c))).toEqual([undefined, 'Bearer t1']);
  });

  it('tells token listeners until they unsubscribe', () => {
    const listener = vi.fn();
    const off = mod.onTokenChange(listener);
    mod.setToken('a');
    off();
    mod.setToken('b');
    expect(listener.mock.calls).toEqual([['a']]);
    expect(mod.getToken()).toBe('b');
  });

  it('refreshes once on 401 and repeats the request with the new token', async () => {
    const { apiAdapter, refreshAdapter } = use(protectedApi('new'), () => ({ status: 200, data: { accessToken: 'new' } }));
    mod.setToken('old');
    const res = await mod.api.post('/x', { a: 1 });
    expect(res.data).toEqual({ ok: true });
    expect(refreshAdapter).toHaveBeenCalledTimes(1);
    expect(apiAdapter).toHaveBeenCalledTimes(2);
    expect(apiAdapter.mock.calls[1][0].data).toBe('{"a":1}');
    expect(replace).not.toHaveBeenCalled();
  });

  it('shares one refresh between requests that fail together', async () => {
    const gate = deferred<Reply>();
    const { refreshAdapter } = use(protectedApi('new'), () => gate.promise);
    mod.setToken('old');
    const all = Promise.all([1, 2, 3].map((n) => mod.api.get(`/x${n}`)));
    await vi.waitFor(() => expect(refreshAdapter).toHaveBeenCalled());
    gate.resolve({ status: 200, data: { accessToken: 'new' } });
    expect((await all).map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshAdapter).toHaveBeenCalledTimes(1);
  });

  it('does not refresh twice for the same request', async () => {
    const { refreshAdapter } = use(() => ({ status: 401 }), () => ({ status: 200, data: { accessToken: 'new' } }));
    await expect(mod.api.get('/x')).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshAdapter).toHaveBeenCalledTimes(1);
  });

  it.each(['/auth/login', '/auth/refresh', '/auth/logout'])('does not refresh for a 401 of %s', async (url) => {
    const { refreshAdapter } = use(() => ({ status: 401 }), () => ({ status: 200 }));
    await expect(mod.api.post(url)).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshAdapter).not.toHaveBeenCalled();
  });

  it.each([400, 403, 404, 429, 500])('does not refresh for %i', async (status) => {
    const { refreshAdapter } = use(() => ({ status }), () => ({ status: 200 }));
    await expect(mod.api.get('/x')).rejects.toMatchObject({ response: { status } });
    expect(refreshAdapter).not.toHaveBeenCalled();
  });

  it('signs out and goes to the login page when the session is gone', async () => {
    use(() => ({ status: 401 }), () => ({ status: 401 }));
    mod.setToken('old');
    await expect(mod.api.get('/x')).rejects.toThrow();
    expect(mod.getToken()).toBeNull();
    expect(replace).toHaveBeenCalledWith('/auth/login');
  });

  it('does not reload the login page', async () => {
    vi.stubGlobal('window', { location: { pathname: '/auth/login', replace } });
    use(() => ({ status: 401 }), () => ({ status: 401 }));
    await expect(mod.api.get('/x')).rejects.toThrow();
    expect(replace).not.toHaveBeenCalled();
  });

  it('can refresh again after a failed refresh', async () => {
    const replies: Reply[] = [{ status: 401 }, { status: 200, data: { accessToken: 'new' } }];
    use(() => ({ status: 200 }), () => replies.shift()!);
    await expect(mod.refreshToken()).rejects.toThrow();
    await expect(mod.refreshToken()).resolves.toBe('new');
    expect(mod.getToken()).toBe('new');
  });

  // Known bugs: `it.fails` turns red once they are fixed (item 2.3), then drop `.fails`
  it.fails('a request that fails while another refresh runs is answered', async () => {
    const gate = deferred<Reply>();
    const { apiAdapter } = use(protectedApi('new'), () => gate.promise);
    mod.setToken('old');
    const refreshing = mod.refreshToken(); // e.g. use-socket after `io server disconnect`
    const request = mod.api.get('/x');
    await vi.waitFor(() => expect(apiAdapter).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));
    gate.resolve({ status: 200, data: { accessToken: 'new' } });
    await refreshing;
    const hung = new Promise((r) => setTimeout(() => r('hung'), 200));
    expect(await Promise.race([request, hung])).not.toBe('hung');
  });

  it.fails.each<Reply>([{ status: 503 }, { status: 429 }, 'network'])('a temporary refresh failure keeps the session: %j', async (reply) => {
    use(() => ({ status: 401 }), () => reply);
    mod.setToken('old');
    await expect(mod.api.get('/x')).rejects.toThrow();
    expect(mod.getToken()).toBe('old');
    expect(replace).not.toHaveBeenCalled();
  });
});
