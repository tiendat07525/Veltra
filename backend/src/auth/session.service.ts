import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

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

@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private client: any;
  private readonly logger = new Logger(SessionService.name);

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const url = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    this.client = createClient({ url });

    this.client.on('error', (err: any) => this.logger.error('Redis Client Error', err));
    
    await this.client.connect();
    this.logger.log('Connected to Redis');
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  async createSession(userId: string, sessionId: string, data: SessionData, ttlSeconds: number): Promise<void> {
    const key = `session:${userId}:${sessionId}`;
    await this.client.set(key, JSON.stringify(data), { EX: ttlSeconds });
  }

  async getSession(userId: string, sessionId: string): Promise<SessionData | null> {
    const key = `session:${userId}:${sessionId}`;
    const data = await this.client.get(key);
    if (!data) return null;
    return JSON.parse(data);
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const key = `session:${userId}:${sessionId}`;
    await this.client.del(key);
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    const keys = await this.client.keys(`session:${userId}:*`);
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
  ): Promise<boolean> {
    const key = `session:${userId}:${sessionId}`;
    
    // Lua script for atomic rotation
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
        session.rotatedAt = ARGV[4]
        session.refreshTokenHash = ARGV[2]
        redis.call('SETEX', KEYS[1], tonumber(ARGV[3]), cjson.encode(session))
        return 1
      else
        return 0
      end
    `;

    try {
      const result = await this.client.eval(luaScript, {
        keys: [key],
        arguments: [oldHash, newHash, ttlSeconds.toString(), rotatedAt],
      });
      return result === 1;
    } catch (err) {
      this.logger.error('Error executing lua script for rotation', err);
      return false;
    }
  }
}
