import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorageRedisService } from '../src/auth/throttler-storage-redis.service';
import { AppThrottlerGuard } from '../src/auth/app-throttler.guard';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';

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
  });
});
