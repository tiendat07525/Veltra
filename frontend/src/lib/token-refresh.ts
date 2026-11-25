// 401 = the server refused the refresh cookie: the session is over.
// Any other failure (offline, 429, 5xx) says nothing about the session.
export const isSessionRejected = (err: unknown): boolean =>
  (err as { response?: { status?: number } } | null)?.response?.status === 401;

interface TokenRefresherDeps {
  requestRefresh: () => Promise<string>;
  getToken: () => string | null;
  setToken: (token: string | null) => void;
}

// One refresh at a time, shared by every caller
export function createTokenRefresher({ requestRefresh, getToken, setToken }: TokenRefresherDeps) {
  let inFlight: Promise<string> | null = null;

  const run = async (): Promise<string> => {
    const before = getToken();
    try {
      const token = await requestRefresh();
      setToken(token);
      return token;
    } catch (err) {
      // Login / change password stored a newer token meanwhile: keep it
      const current = getToken();
      if (current && current !== before) return current;
      if (isSessionRejected(err)) setToken(null);
      throw err;
    }
  };

  return (): Promise<string> => {
    inFlight ??= run().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
