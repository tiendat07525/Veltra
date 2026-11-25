import { AttemptLimitService } from '../../src/auth/attempt-limit.service';
import { SessionService } from '../../src/auth/session.service';

/**
 * In-memory stand-in for SessionService's attempt counters (the real ones are Lua, tested
 * against Redis in session-rotation.e2e-spec.ts).
 */
export class FakeAttemptStore {
  now = 0;
  readonly counters = new Map<string, { count: number; expiresAt: number }>();

  private read(key: string) {
    const counter = this.counters.get(key);
    if (counter && counter.expiresAt <= this.now) this.counters.delete(key);
    return this.counters.get(key);
  }

  takeAttempt(limits: { key: string; max: number; windowSeconds: number }[]) {
    const waits = limits.map(({ key, max }) => {
      const counter = this.read(key);
      return counter && counter.count >= max ? counter.expiresAt - this.now : 0;
    });
    const wait = Math.max(0, ...waits);
    if (wait > 0) return Promise.resolve(wait);
    for (const { key, windowSeconds } of limits) {
      const counter = this.read(key) ?? {
        count: 0,
        expiresAt: this.now + windowSeconds * 1000,
      };
      counter.count += 1;
      this.counters.set(key, counter);
    }
    return Promise.resolve(0);
  }

  giveBackAttempt(limits: { key: string }[]) {
    for (const { key } of limits) {
      const counter = this.read(key);
      if (counter && counter.count > 0) counter.count -= 1;
    }
    return Promise.resolve();
  }

  clearAttempts(key: string) {
    this.counters.delete(key);
    return Promise.resolve();
  }
}

export const fakeAttemptLimit = (store = new FakeAttemptStore()) =>
  new AttemptLimitService(store as unknown as SessionService);
