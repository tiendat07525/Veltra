import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { createClient } from 'redis';

@Injectable()
export class ThrottlerStorageRedisService
  implements ThrottlerStorage, OnModuleInit, OnModuleDestroy
{
  private client: any;
  private readonly logger = new Logger(ThrottlerStorageRedisService.name);
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  async ensureConnected() {
    if (!this.client) {
      const url =
        this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
      this.client = createClient({ url });

      this.client.on('error', (err: any) => {
        this.isConnected = false;
        this.logger.error('Throttler Redis Client Error', err?.message || err);
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log('Connected Throttler to Redis');
      });
    }

    if (!this.isConnected) {
      try {
        await this.client.connect();
        this.isConnected = true;
      } catch (err: any) {
        this.isConnected = false;
        this.logger.error(
          'Failed to connect Throttler to Redis; will fail-open until reconnected',
          err?.message || err,
        );
      }
    }
  }

  async onModuleInit() {
    await this.ensureConnected();
  }

  async onModuleDestroy() {
    if (this.client && this.isConnected) {
      try {
        await this.client.quit();
      } catch (err: any) {
        this.logger.warn('Error closing throttler redis client', err?.message);
      }
    }
  }

  /**
   * Atomic increment across distributed backend instances using Redis Lua script.
   * Defined behavior on Redis error: Fail-open to preserve API availability,
   * while downstream session validation fails closed.
   */
  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (!this.isConnected) {
      await this.ensureConnected();
    }
    const redisKey = `rl:${throttlerName}:${key}`;

    // Redis Lua Script: atomic INCR + PEXPIRE
    const luaScript = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))
      else
        local pttl = redis.call('PTTL', KEYS[1])
        if pttl == -1 then
          redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))
        end
      end
      local pttl = redis.call('PTTL', KEYS[1])
      return {current, pttl}
    `;

    try {
      const result: any = await this.client.eval(luaScript, {
        keys: [redisKey],
        arguments: [ttl.toString()],
      });

      const totalHits = Number(result[0]);
      const pttl = Number(result[1]);
      const timeToExpire = Math.max(0, Math.ceil(pttl / 1000));
      const isBlocked = totalHits > limit;
      const timeToBlockExpire = isBlocked ? timeToExpire : 0;

      return {
        totalHits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire,
      };
    } catch (err: any) {
      // Documented policy: Fail-open on Redis errors to prevent cascading denial-of-service
      this.logger.warn(
        `Redis rate-limiter unavailable for key "${key}". Failing open to preserve availability. Error: ${err?.message || err}`,
      );
      return {
        totalHits: 0,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
