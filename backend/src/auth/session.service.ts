import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

type RedisClient = ReturnType<typeof createClient>;

export interface SessionData {
  userId: string;
  sessionId: string;
  refreshTokenHash: string;
  createdAt: string;
  expiresAt: string;
  userAgent?: string;
  ipAddress?: string;
  previousRefreshTokenHash?: string;
  rotatedAt?: string;
}

export type RotationResult = 'rotated' | 'already_rotated' | 'failed';

@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private client!: RedisClient;
  private readonly logger = new Logger(SessionService.name);

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const url =
      this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    this.client = createClient({ url });

    this.client.on('error', (err: unknown) =>
      this.logger.error('Redis Client Error', err),
    );

    await this.client.connect();
    this.logger.log('Connected to Redis');
  }

  async onModuleDestroy() {
    //close redis when finished using a connection
    if (this.client) {
      await this.client.quit();
    }
  }

  // ── Two-step login challenges: 2fa:challenge:<sha256(token)> = hash { userId, attempts } ──

  async createTwoFactorChallenge(
    tokenHash: string,
    userId: string,
    ttlSeconds: number,
  ): Promise<void> {
    const key = `2fa:challenge:${tokenHash}`;
    await this.client
      .multi()
      .hSet(key, { userId, attempts: '0' })
      .expire(key, ttlSeconds)
      .exec();
  }

  async getTwoFactorChallengeUserId(tokenHash: string): Promise<string | null> {
    return (
      (await this.client.hGet(`2fa:challenge:${tokenHash}`, 'userId')) ?? null
    );
  }

  // Returns the failed attempts so far (0 when the challenge no longer exists)
  async recordTwoFactorChallengeFailure(tokenHash: string): Promise<number> {
    const key = `2fa:challenge:${tokenHash}`;
    // HINCRBY would re-create an expired key; only count while it exists
    const attempts = (await this.client.eval(
      "if redis.call('EXISTS', KEYS[1]) == 1 then return redis.call('HINCRBY', KEYS[1], 'attempts', 1) else return 0 end",
      { keys: [key] },
    )) as number;
    return attempts;
  }

  // true only for the caller that actually removed it (single use)
  async deleteTwoFactorChallenge(tokenHash: string): Promise<boolean> {
    return (await this.client.del(`2fa:challenge:${tokenHash}`)) === 1;
  }

  // ── Wrong attempts per account (AttemptLimitService): counter with a fixed window ──

  // 0 = attempt counted on every limit; otherwise nothing is counted and the result is the
  // time (ms) until the last reached limit reopens
  async takeAttempt(
    limits: { key: string; max: number; windowSeconds: number }[],
  ): Promise<number> {
    const luaScript = `
      local wait = 0
      for i = 1, #KEYS do
        local count = tonumber(redis.call('GET', KEYS[i]) or '0')
        if count >= tonumber(ARGV[2 * i - 1]) then
          local pttl = redis.call('PTTL', KEYS[i])
          if pttl < 0 then
            pttl = tonumber(ARGV[2 * i])
            redis.call('PEXPIRE', KEYS[i], pttl)
          end
          wait = math.max(wait, pttl, 1)
        end
      end
      if wait > 0 then return wait end
      for i = 1, #KEYS do
        if redis.call('INCR', KEYS[i]) == 1 then
          redis.call('PEXPIRE', KEYS[i], tonumber(ARGV[2 * i]))
        end
      end
      return 0
    `;
    const wait = await this.client.eval(luaScript, {
      keys: limits.map((l) => l.key),
      arguments: limits.flatMap((l) => [
        l.max.toString(),
        (l.windowSeconds * 1000).toString(),
      ]),
    });
    return Number(wait);
  }

  // The attempt was not a wrong one. Never below 0, never re-creates an expired counter
  async giveBackAttempt(limits: { key: string }[]): Promise<void> {
    const luaScript = `
      for i = 1, #KEYS do
        local count = tonumber(redis.call('GET', KEYS[i]) or '0')
        if count > 0 then redis.call('DECR', KEYS[i]) end
      end
      return 0
    `;
    await this.client.eval(luaScript, { keys: limits.map((l) => l.key) });
  }

  async clearAttempts(key: string): Promise<void> {
    await this.client.del(key);
  }

  // Health check: throws when Redis does not answer (the caller applies a timeout)
  async ping(): Promise<void> {
    if (!this.client?.isOpen) throw new Error('Redis client is not open');
    await this.client.ping();
  }

  async createSession(
    userId: string,
    sessionId: string,
    data: SessionData,
    ttlSeconds: number,
  ): Promise<void> {
    const key = `session:${userId}:${sessionId}`;
    await this.client.set(key, JSON.stringify(data), { EX: ttlSeconds });
  }

  async getSession(
    userId: string,
    sessionId: string,
  ): Promise<SessionData | null> {
    const key = `session:${userId}:${sessionId}`;
    const data = await this.client.get(key);
    if (!data) return null;
    return JSON.parse(data) as SessionData;
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const key = `session:${userId}:${sessionId}`;
    await this.client.del(key);
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    // SCAN walks the keyspace in batches; KEYS blocks Redis while it scans everything
    const keys: string[] = [];
    for await (const batch of this.client.scanIterator({
      MATCH: `session:${userId}:*`,
      COUNT: 100,
    })) {
      keys.push(...batch);
    }
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }

  async rotateSessionToken(
    userId: string,
    sessionId: string,
    oldHash: string,
    newHash: string,
    ttlSeconds: number,
    rotatedAt: string,
  ): Promise<RotationResult> {
    const key = `session:${userId}:${sessionId}`;

    // Lua script for atomic rotation (1 = rotated, 2 = already rotated, 0 = no match)
    const luaScript = `
      local data = redis.call('GET', KEYS[1])
      if not data then
        return 0
      end
      local session = cjson.decode(data)
      if session.refreshTokenHash == ARGV[1] then
        session.previousRefreshTokenHash = session.refreshTokenHash
        session.rotatedAt = ARGV[4]
        session.refreshTokenHash = ARGV[2]
        redis.call('SETEX', KEYS[1], tonumber(ARGV[3]), cjson.encode(session))
        return 1
      elseif session.previousRefreshTokenHash == ARGV[1] then
        -- A concurrent request already rotated this token: do not rotate again
        return 2
      else
        return 0
      end
    `;

    try {
      const result = await this.client.eval(luaScript, {
        keys: [key],
        arguments: [oldHash, newHash, ttlSeconds.toString(), rotatedAt],
      });
      if (result === 1) return 'rotated';
      if (result === 2) return 'already_rotated';
      return 'failed';
    } catch (err) {
      this.logger.error('Error executing lua script for rotation', err);
      return 'failed';
    }
  }
}
