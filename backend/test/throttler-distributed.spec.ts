import { Controller, HttpCode, Post } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { ThrottlerStorageRedisService } from '../src/auth/throttler-storage-redis.service';
import {
  AppThrottlerGuard,
  REFRESH_IP_LIMIT,
} from '../src/auth/app-throttler.guard';
import * as crypto from 'crypto';

// Same limits as AuthController, without its services
@Controller('auth')
class LimitedAuthController {
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  login() {
    return { ok: true };
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  refresh() {
    return { ok: true };
  }
}

describe('Distributed Rate Limiting (FULLAUDIT-008)', () => {
  describe('ThrottlerStorageRedisService', () => {
    let service: ThrottlerStorageRedisService;
    let mockClient: any;

    beforeEach(async () => {
      mockClient = {
        eval: jest.fn(),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
      };

      const mockConfigService = {
        get: jest.fn().mockReturnValue('redis://localhost:6379'),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ThrottlerStorageRedisService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      service = module.get<ThrottlerStorageRedisService>(
        ThrottlerStorageRedisService,
      );
      // Inject mock client for unit testing
      (service as any).client = mockClient;
      (service as any).isConnected = true;
    });

    it('should increment hit count and allow requests within limit', async () => {
      // Mock Lua script returning [currentHits, pttlMs]
      mockClient.eval.mockResolvedValue([5, 54000]);

      const result = await service.increment(
        '127.0.0.1:sess_123',
        60000,
        15,
        0,
        'default',
      );

      expect(mockClient.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call'),
        {
          keys: ['rl:default:127.0.0.1:sess_123'],
          arguments: ['60000'],
        },
      );
      expect(result.totalHits).toBe(5);
      expect(result.isBlocked).toBe(false);
      expect(result.timeToExpire).toBe(54);
      expect(result.timeToBlockExpire).toBe(0);
    });

    it('should block requests when hit count exceeds the limit', async () => {
      mockClient.eval.mockResolvedValue([16, 45000]);

      const result = await service.increment(
        '127.0.0.1:sess_123',
        60000,
        15,
        0,
        'default',
      );

      expect(result.totalHits).toBe(16);
      expect(result.isBlocked).toBe(true);
      expect(result.timeToExpire).toBe(45);
      expect(result.timeToBlockExpire).toBe(45);
    });

    it('should fail-open when Redis client encounters an error', async () => {
      mockClient.eval.mockRejectedValue(new Error('Redis connection timeout'));

      const result = await service.increment(
        '127.0.0.1:sess_123',
        60000,
        15,
        0,
        'default',
      );

      // Fail-open: totalHits = 0, isBlocked = false
      expect(result.isBlocked).toBe(false);
      expect(result.totalHits).toBe(0);
      expect(result.timeToExpire).toBe(60);
    });

    it('should share rate limits across multiple instances communicating with same Redis', async () => {
      // Simulate Instance A making request 1
      mockClient.eval.mockResolvedValueOnce([1, 60000]);
      const resA = await service.increment(
        'shared_key',
        60000,
        2,
        0,
        'default',
      );
      expect(resA.totalHits).toBe(1);
      expect(resA.isBlocked).toBe(false);

      // Simulate Instance B making request 2 against same shared key
      mockClient.eval.mockResolvedValueOnce([2, 59000]);
      const resB = await service.increment(
        'shared_key',
        60000,
        2,
        0,
        'default',
      );
      expect(resB.totalHits).toBe(2);
      expect(resB.isBlocked).toBe(false);

      // Simulate Instance A or B making request 3 (exceeded)
      mockClient.eval.mockResolvedValueOnce([3, 58000]);
      const resC = await service.increment(
        'shared_key',
        60000,
        2,
        0,
        'default',
      );
      expect(resC.totalHits).toBe(3);
      expect(resC.isBlocked).toBe(true);
    });
  });

  describe('AppThrottlerGuard (Tracker & Privacy Keying Strategy)', () => {
    let guard: AppThrottlerGuard;

    beforeEach(() => {
      guard = new AppThrottlerGuard(
        { throttlers: [{ limit: 15, ttl: 60000 }] },
        { increment: jest.fn() },
        new Reflector(),
      );
    });

    it('should return client IP for standard endpoints', async () => {
      const mockReq = {
        originalUrl: '/users',
        ip: '192.168.1.50',
      };

      const tracker = await (guard as any).getTracker(mockReq);
      expect(tracker).toBe('192.168.1.50');
    });

    it('should use X-Forwarded-For IP if present', async () => {
      const mockReq = {
        originalUrl: '/users',
        ips: ['203.0.113.195', '10.0.0.1'],
        ip: '10.0.0.1',
      };

      const tracker = await (guard as any).getTracker(mockReq);
      expect(tracker).toBe('203.0.113.195');
    });

    it.each([
      ['2001:db8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
      ['2001:db8:1:2::9', '2001:db8:1:2::/64'],
      ['2001:db8:1:3::9', '2001:db8:1:3::/64'],
      ['::ffff:203.0.113.7', '203.0.113.7'],
      ['::1', '::1'],
    ])('should group IPv6 clients by /64: %s → %s', async (ip, expected) => {
      const tracker = await (guard as any).getTracker({
        originalUrl: '/auth/login',
        ip,
      });
      expect(tracker).toBe(expected);
    });

    it('should extract anonymized sessionId hash for valid /auth/refresh request without exposing raw token', async () => {
      const rawSecretToken = 'superSecretCryptographicRawTokenValue987654321';
      const sessionId = 'session-uuid-1234-abcd';
      const userId = 'user_99';
      const cookie = `${userId}.${sessionId}.${rawSecretToken}`;

      const mockReq = {
        originalUrl: '/auth/refresh',
        ip: '1.2.3.4',
        cookies: {
          refreshToken: cookie,
        },
      };

      const tracker = await (guard as any).getTracker(mockReq);

      const expectedSessionHash = crypto
        .createHash('sha256')
        .update(sessionId, 'utf8')
        .digest('hex')
        .slice(0, 16);

      expect(tracker).toBe(`1.2.3.4:sess_${expectedSessionHash}`);

      // Crucial: The raw token secret must NEVER appear anywhere in the tracker string
      expect(tracker).not.toContain(rawSecretToken);
      expect(tracker).not.toContain(cookie);
    });

    it('should extract hashed invalid payload for malformed /auth/refresh token without exposing raw content', async () => {
      const malformedPayload = 'not-a-valid-token-format-with-possible-secret';

      const mockReq = {
        originalUrl: '/auth/refresh',
        ip: '1.2.3.4',
        cookies: {
          refreshToken: malformedPayload,
        },
      };

      const tracker = await (guard as any).getTracker(mockReq);

      const expectedInvalidHash = crypto
        .createHash('sha256')
        .update(malformedPayload, 'utf8')
        .digest('hex')
        .slice(0, 16);

      expect(tracker).toBe(`1.2.3.4:invalid_${expectedInvalidHash}`);
      expect(tracker).not.toContain(malformedPayload);
    });

    it('should fall back to IP for /auth/refresh when cookie is missing', async () => {
      const mockReq = {
        originalUrl: '/auth/refresh',
        ip: '1.2.3.4',
        cookies: {},
      };

      const tracker = await (guard as any).getTracker(mockReq);
      expect(tracker).toBe('1.2.3.4');
    });

    it.each([
      '/auth/login?x=/auth/refresh',
      '/auth/login/2fa?/auth/refresh',
      '/users?search=/auth/refresh',
      '/auth/login#/auth/refresh',
      '/auth/refresh/other',
    ])(
      'should ignore the refresh cookie when the path is not /auth/refresh: %s',
      async (originalUrl) => {
        const tracker = await (guard as any).getTracker({
          originalUrl,
          ip: '1.2.3.4',
          cookies: { refreshToken: 'user.session.token' },
        });
        expect(tracker).toBe('1.2.3.4');
      },
    );

    it('should keep the session tracker for /auth/refresh with a query string', async () => {
      const tracker = await (guard as any).getTracker({
        originalUrl: '/auth/refresh?x=1',
        ip: '1.2.3.4',
        cookies: { refreshToken: 'user.session.token' },
      });
      expect(tracker).toMatch(/^1\.2\.3\.4:sess_[0-9a-f]{16}$/);
    });
  });

  describe('AppThrottlerGuard over HTTP', () => {
    let app: NestExpressApplication;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        // In-memory storage: no Redis needed
        imports: [
          ThrottlerModule.forRoot({
            throttlers: [{ ttl: 60000, limit: 100 }],
          }),
        ],
        controllers: [LimitedAuthController],
        providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
      }).compile();
      app = module.createNestApplication<NestExpressApplication>();
      app.set('trust proxy', 1);
      app.use(cookieParser());
      await app.init();
    });

    afterEach(() => app.close());

    const post = (path: string, cookie: string, ip = '203.0.113.7') =>
      request(app.getHttpServer())
        .post(path)
        .set('X-Forwarded-For', ip)
        .set('Cookie', `refreshToken=${cookie}`);

    it('should limit login by IP even with ?x=/auth/refresh and a new cookie each time', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 8; i++) {
        const res = await post(
          '/auth/login?x=/auth/refresh',
          `user.session-${i}.token`,
        );
        statuses.push(res.status);
      }
      expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429, 429]);
    });

    it('should still limit /auth/refresh per session (15 / 60 s)', async () => {
      for (let i = 0; i < 15; i++) {
        expect((await post('/auth/refresh', 'user.s1.token')).status).toBe(200);
      }
      expect((await post('/auth/refresh', 'user.s1.token')).status).toBe(429);
      expect((await post('/auth/refresh', 'user.s2.token')).status).toBe(200);
    });

    it('should cap /auth/refresh per IP even with a new cookie each time', async () => {
      // well-formed and malformed cookies share the cap
      for (let i = 0; i < REFRESH_IP_LIMIT; i++) {
        const cookie = i % 2 ? `user.session-${i}.token` : `junk-${i}`;
        expect((await post('/auth/refresh', cookie)).status).toBe(200);
      }
      const blocked = await post('/auth/refresh', 'user.session-new.token');
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

      // a query string does not get a new budget
      expect((await post('/auth/refresh?x=1', 'user.s-q.token')).status).toBe(
        429,
      );
      // another address and other routes are not affected
      expect(
        (await post('/auth/refresh', 'user.session-new.token', '203.0.113.8'))
          .status,
      ).toBe(200);
      expect((await post('/auth/login', 'user.s1.token')).status).toBe(200);
    });

    it('should count one IPv6 /64 as one address for the refresh cap', async () => {
      for (let i = 0; i < REFRESH_IP_LIMIT; i++) {
        const ip = `2001:db8:1:2::${(i + 1).toString(16)}`;
        expect(
          (await post('/auth/refresh', `user.session-${i}.token`, ip)).status,
        ).toBe(200);
      }
      expect(
        (await post('/auth/refresh', 'user.s-new.token', '2001:db8:1:2::ffff'))
          .status,
      ).toBe(429);
      expect(
        (await post('/auth/refresh', 'user.s-new.token', '2001:db8:1:3::1'))
          .status,
      ).toBe(200);
    });
  });
});
