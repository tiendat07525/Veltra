import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { normalizeIp } from '@nestjs/throttler';
import * as crypto from 'crypto';
import { SessionService } from './session.service';

export interface AttemptLimit {
  key: string;
  // Wrong attempts allowed inside the window (counted from the first one)
  max: number;
  windowSeconds: number;
}

const SHORT = { max: 5, windowSeconds: 15 * 60 };
// High enough that blocking someone else's account needs many addresses
const PER_ACCOUNT = { max: 50, windowSeconds: 60 * 60 };

// Usernames and addresses are never stored in clear in Redis
const hash = (value: string) =>
  crypto.createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 32);

// Same normalization as the schema (trim, lowercase): every spelling shares one counter
const accountHash = (username: string) => hash(username.trim().toLowerCase());

/**
 * Wrong passwords / codes per account, in Redis. Unlike the per-IP throttler it also stops
 * guesses coming from many addresses. Only new sign-ins and sensitive settings are refused:
 * open sessions and refresh are never affected.
 */
@Injectable()
export class AttemptLimitService {
  constructor(private readonly sessionService: SessionService) {}

  // Sign-in from one address (IPv6: its /64). Counted for unknown usernames too
  loginFromIp(username: string, ip?: string): AttemptLimit {
    const address = hash(normalizeIp(ip ?? 'unknown'));
    return {
      key: `attempts:login:${accountHash(username)}:${address}`,
      ...SHORT,
    };
  }

  // Sign-in to the account from anywhere
  login(username: string): AttemptLimit {
    return { key: `attempts:login:${accountHash(username)}`, ...PER_ACCOUNT };
  }

  // Code of the second sign-in step (the password is already right there)
  loginCode(userId: string): AttemptLimit {
    return { key: `attempts:login-code:${userId}`, ...SHORT };
  }

  // Current password typed by a signed-in user (change password, 2FA settings)
  currentPassword(userId: string): AttemptLimit {
    return { key: `attempts:password:${userId}`, ...SHORT };
  }

  // Code typed by a signed-in user. Not shared with loginCode: someone who only knows the
  // password must not be able to block the owner from changing it
  settingsCode(userId: string): AttemptLimit {
    return { key: `attempts:code:${userId}`, ...SHORT };
  }

  /**
   * Runs verify() unless a limit is reached (429, verify not called). The attempt is taken
   * before verify() so concurrent guesses cannot pass together, and given back when the
   * answer is right or verify() throws (an outage is not a wrong guess).
   */
  async check(
    limits: AttemptLimit[],
    verify: () => Promise<boolean>,
  ): Promise<boolean> {
    const waitMs = await this.sessionService.takeAttempt(limits);
    if (waitMs > 0) {
      const minutes = Math.ceil(waitMs / 60_000);
      throw new HttpException(
        `Bạn đã nhập sai quá nhiều lần, hãy thử lại sau ${minutes} phút`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    let wrong = false;
    try {
      wrong = !(await verify());
      return !wrong;
    } finally {
      if (!wrong) await this.sessionService.giveBackAttempt(limits);
    }
  }

  // After a complete sign-in
  async clear(limit: AttemptLimit): Promise<void> {
    await this.sessionService.clearAttempts(limit.key);
  }
}
