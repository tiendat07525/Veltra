// Reconnecting after the server closed or refused the socket. Transport drops (offline, server down)
// are retried by socket.io itself; these two cases are not, and they may mean the access token is no
// longer accepted, so every attempt refreshes it first (a new token reconnects the socket by itself).

const BASE_MS = 1000;
const MAX_MS = 30_000;
// Connected for this long: the next failure starts from the first wait again. Shorter connections
// (accepted, then closed at once) keep the backoff, so they cannot turn into a fast refresh loop.
const STABLE_MS = 30_000;

export type RefreshOutcome = 'ok' | 'rejected' | 'unavailable';

// 1, 2, 4, … 30 s, each ±25 % so many clients do not come back at the same moment
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const wait = Math.min(MAX_MS, BASE_MS * 2 ** attempt);
  return Math.round(wait * (0.75 + random() * 0.5));
}

export function createSocketRecovery(refresh: () => Promise<RefreshOutcome>) {
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stableTimer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  // Grows with stop(): a refresh still on the way must not schedule anything afterwards
  let generation = 0;

  const clearTimers = () => {
    clearTimeout(timer);
    clearTimeout(stableTimer);
    timer = undefined;
  };

  const schedule = (delay: number) => {
    if (timer !== undefined || running) return;
    timer = setTimeout(() => void run(), delay);
  };

  const run = async () => {
    timer = undefined;
    running = true;
    const started = generation;
    const outcome = await refresh();
    running = false;
    if (started !== generation) return;
    // 'ok': the new token connects the socket; a new refusal calls refused() again.
    // 'rejected': the session is over.
    if (outcome === 'unavailable') schedule(backoffMs(attempts++));
  };

  return {
    // The server closed the socket, or refused the handshake
    refused(immediately = false) {
      clearTimeout(stableTimer);
      schedule(immediately && attempts === 0 ? 0 : backoffMs(attempts));
      attempts++;
    },
    connected() {
      clearTimers();
      stableTimer = setTimeout(() => (attempts = 0), STABLE_MS);
    },
    // The transport dropped: not a refusal, but not a stable connection either
    dropped() {
      clearTimeout(stableTimer);
    },
    // Back online / tab shown: do not sit out a long wait. False = nothing is waiting here.
    retryNow(): boolean {
      if (running) return true;
      if (timer === undefined) return false;
      clearTimeout(timer);
      void run();
      return true;
    },
    stop() {
      clearTimers();
      attempts = 0;
      generation++;
    },
  };
}
