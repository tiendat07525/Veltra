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
import { errorMessage } from '../common/error-message';

type RedisClient = ReturnType<typeof createClient>;

@Injectable()
export class ThrottlerStorageRedisService
  implements ThrottlerStorage, OnModuleInit, OnModuleDestroy
{
  private client?: RedisClient;
  private readonly logger = new Logger(ThrottlerStorageRedisService.name);
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  async ensureConnected() {
    if (!this.client) {
      const url =
        this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
      this.client = createClient({ url });

      this.client.on('error', (err: unknown) => {
        this.isConnected = false;
        this.logger.error('Throttler Redis Client Error', errorMessage(err));
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
      } catch (err: unknown) {
        this.isConnected = false;
        this.logger.error(
          'Failed to connect Throttler to Redis; will fail-open until reconnected',
          errorMessage(err),
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
      } catch (err: unknown) {
        this.logger.warn(
          'Error closing throttler redis client',
          errorMessage(err),
        );
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
      // Falls into the fail-open catch below, as a missing client always has
      if (!this.client) {
        throw new Error('Throttler Redis client is not initialized');
      }
      const result = (await this.client.eval(luaScript, {
        keys: [redisKey],
        arguments: [ttl.toString()],
      })) as [number, number];

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
    } catch (err: unknown) {
      // Documented policy: Fail-open on Redis errors to prevent cascading denial-of-service
      this.logger.warn(
        `Redis rate-limiter unavailable for key "${key}". Failing open to preserve availability. Error: ${errorMessage(err)}`,
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
