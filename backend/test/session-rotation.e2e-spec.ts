import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { createClient } from 'redis';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../src/auth/auth.service';
import { SessionService } from '../src/auth/session.service';
import { AttemptLimitService } from '../src/auth/attempt-limit.service';

/**
 * A2: Refresh Token Rotation race against a real Redis instance.
 * Two tabs refreshing with the same cookie must not desync the cookie from Redis
 * (which previously triggered false-positive theft detection and logged the user out).
 */
describe('Refresh Token Rotation Concurrency (Real Redis E2E)', () => {
  const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  let isRedisAvailable = false;

  let sessionService: SessionService;
  let authService: AuthService;
  let userId: string;

  const mockRealtimeService = {
    disconnectUser: jest.fn(),
    disconnectSession: jest.fn(),
  };

  beforeAll(async () => {
    const probeClient = createClient({
      url: REDIS_URL,
      socket: { connectTimeout: 1000, reconnectStrategy: false },
    });
    probeClient.on('error', () => {});

    try {
      await probeClient.connect();
      isRedisAvailable = (await probeClient.ping()) === 'PONG';
      await probeClient.quit();
    } catch {
      isRedisAvailable = false;
    }

    // Skipped when Redis is missing on a developer machine, never on CI
    if (!isRedisAvailable && process.env.CI) {
      throw new Error(`Redis is not available at ${REDIS_URL}`);
    }
  }, 10000);

  beforeEach(async () => {
    if (!isRedisAvailable) {
      return;
    }

    // Unique, throwaway user id so real session keys never collide
    userId = `e2e-rotation-${crypto.randomUUID()}`;
    const passwordHash = await bcrypt.hash('password123', 4);

    const mockConfigService = {
      get: jest.fn((key: string) =>
        key === 'REDIS_URL' ? REDIS_URL : undefined,
      ),
    };
    const mockUsersService = {
      findByUsernameWithPassword: jest.fn().mockResolvedValue({
        _id: userId,
        username: 'rotation-user',
        email: 'rotation@example.com',
        password: passwordHash,
      }),
      findOne: jest.fn().mockResolvedValue({
        _id: userId,
        username: 'rotation-user',
        email: 'rotation@example.com',
      }),
    };
    const mockJwtService = {
      signAsync: jest.fn().mockResolvedValue('mock-access-token'),
    };

    sessionService = new SessionService(
      mockConfigService as unknown as ConfigService,
    );
    await sessionService.onModuleInit();

    authService = new AuthService(
      mockUsersService as any,
      mockJwtService as any,
      sessionService,
      mockRealtimeService as any,
      // 2FA off: login opens the session directly
      { isEnabled: () => Promise.resolve(false) } as any,
      new AttemptLimitService(sessionService),
    );
  });

  afterEach(async () => {
    if (!isRedisAvailable) {
      return;
    }
    await sessionService.revokeAllUserSessions(userId);
    await sessionService.onModuleDestroy();
  });

  const login = async () => {
    const result = await authService.login({
      username: 'rotation-user',
      password: 'password123',
    });
    if (!('refreshTokenString' in result)) {
      throw new Error('expected a session, got a 2FA challenge');
    }
    const { refreshTokenString } = result;
    // Login itself disconnects prior sockets (single-session policy); ignore that call
    mockRealtimeService.disconnectUser.mockClear();
    return refreshTokenString;
  };

  it('should keep cookie and Redis in sync when two tabs refresh concurrently', async () => {
    if (!isRedisAvailable) {
      return;
    }

    const t0 = await login();
    const sessionId = t0.split('.')[1];

    const results = await Promise.all([
      authService.refresh(t0),
      authService.refresh(t0),
    ]);

    // Exactly one request rotates; the other only receives an access token
    const rotatedTokens = results
      .map((r) => r.refreshTokenString)
      .filter((t): t is string => t !== null);
    expect(rotatedTokens).toHaveLength(1);
    results.forEach((r) => expect(r.accessToken).toBe('mock-access-token'));

    // The browser cookie now holds T1; it must still match Redis
    const t1 = rotatedTokens[0];
    const session = await sessionService.getSession(userId, sessionId);
    expect(session?.refreshTokenHash).toBe(
      authService.hashRefreshToken(t1.split('.')[2]),
    );

    // Next refresh with T1 succeeds and is not treated as theft
    const next = await authService.refresh(t1);
    expect(next.refreshTokenString).not.toBeNull();
    expect(mockRealtimeService.disconnectUser).not.toHaveBeenCalled();
    expect(await sessionService.getSession(userId, sessionId)).not.toBeNull();
  });

  it('should still detect theft when the previous token is replayed after the grace period', async () => {
    if (!isRedisAvailable) {
      return;
    }

    const t0 = await login();
    const sessionId = t0.split('.')[1];

    const first = await authService.refresh(t0);
    expect(first.refreshTokenString).not.toBeNull();

    // Move rotatedAt outside the 15s grace window
    const session = await sessionService.getSession(userId, sessionId);
    await sessionService.createSession(
      userId,
      sessionId,
      {
        ...session!,
        rotatedAt: new Date(Date.now() - 60_000).toISOString(),
      },
      60,
    );

    await expect(authService.refresh(t0)).rejects.toThrow(
      'Phát hiện đánh cắp token, tất cả phiên bị hủy',
    );
    expect(await sessionService.getSession(userId, sessionId)).toBeNull();
    expect(mockRealtimeService.disconnectUser).toHaveBeenCalledWith(userId);
  });

  it('should not extend the Redis TTL past expiresAt, and reject refresh once expired', async () => {
    if (!isRedisAvailable) {
      return;
    }

    const t0 = await login();
    const sessionId = t0.split('.')[1];

    // 30s left on the session but a longer Redis TTL (state left by the old sliding rotation)
    const session = await sessionService.getSession(userId, sessionId);
    await sessionService.createSession(
      userId,
      sessionId,
      { ...session!, expiresAt: new Date(Date.now() + 30_000).toISOString() },
      600,
    );

    const rotated = await authService.refresh(t0);
    expect(rotated.refreshTokenString).not.toBeNull();

    const probe = createClient({ url: REDIS_URL });
    await probe.connect();
    try {
      const ttl = await probe.ttl(`session:${userId}:${sessionId}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(30);
    } finally {
      await probe.quit();
    }

    // Past expiresAt: refresh is rejected and the session removed, not treated as theft
    const current = await sessionService.getSession(userId, sessionId);
    await sessionService.createSession(
      userId,
      sessionId,
      { ...current!, expiresAt: new Date(Date.now() - 1000).toISOString() },
      600,
    );
    await expect(
      authService.refresh(rotated.refreshTokenString!),
    ).rejects.toThrow('Phiên đăng nhập đã hết hạn');
    expect(await sessionService.getSession(userId, sessionId)).toBeNull();
    expect(mockRealtimeService.disconnectUser).not.toHaveBeenCalled();
  });

  describe('wrong attempt counters (Lua)', () => {
    const limitFor = (max: number, windowSeconds: number) => ({
      key: `attempts:e2e:${crypto.randomUUID()}`,
      max,
      windowSeconds,
    });

    it('should refuse after max, report the wait and not count refused attempts', async () => {
      if (!isRedisAvailable) {
        return;
      }
      const low = limitFor(2, 30);
      const high = limitFor(10, 60);
      const take = () => sessionService.takeAttempt([low, high]);
      const probe = createClient({ url: REDIS_URL });
      await probe.connect();
      try {
        expect(await take()).toBe(0);
        expect(await take()).toBe(0);
        const wait = await take();
        expect(wait).toBeGreaterThan(25_000);
        expect(wait).toBeLessThanOrEqual(30_000);
        // Refused: neither counter moved, and each kept its own window
        expect(await probe.get(low.key)).toBe('2');
        expect(await probe.get(high.key)).toBe('2');
        expect(await probe.ttl(low.key)).toBeLessThanOrEqual(30);
        expect(await probe.ttl(high.key)).toBeGreaterThan(30);

        await sessionService.giveBackAttempt([low, high]);
        expect(await take()).toBe(0);

        await sessionService.clearAttempts(low.key);
        expect(await probe.exists(low.key)).toBe(0);

        // Giving back never creates a counter or goes below 0
        await sessionService.giveBackAttempt([low]);
        expect(await probe.exists(low.key)).toBe(0);
      } finally {
        await probe.del([low.key, high.key]);
        await probe.quit();
      }
    });

    it('should let exactly max concurrent attempts through', async () => {
      if (!isRedisAvailable) {
        return;
      }
      const limit = limitFor(5, 30);
      const waits = await Promise.all(
        Array.from({ length: 30 }, () => sessionService.takeAttempt([limit])),
      );
      expect(waits.filter((w) => w === 0)).toHaveLength(5);
      await sessionService.clearAttempts(limit.key);
    });

    it('should reopen when the window ends', async () => {
      if (!isRedisAvailable) {
        return;
      }
      const limit = limitFor(1, 1);
      expect(await sessionService.takeAttempt([limit])).toBe(0);
      expect(await sessionService.takeAttempt([limit])).toBeGreaterThan(0);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(await sessionService.takeAttempt([limit])).toBe(0);
      await sessionService.clearAttempts(limit.key);
    });

    it('should refuse the 6th login after 5 wrong passwords from one address', async () => {
      if (!isRedisAvailable) {
        return;
      }
      const username = `e2e_${crypto.randomUUID().slice(0, 8)}`;
      const tryLogin = (password: string, ip: string) =>
        authService.login({ username, password }, 'agent', ip);
      try {
        for (let i = 0; i < 5; i++) {
          await expect(tryLogin('wrong-pass', '203.0.113.5')).rejects.toThrow(
            'Username hoặc mật khẩu không chính xác',
          );
        }
        await expect(tryLogin('password123', '203.0.113.5')).rejects.toThrow(
          'hãy thử lại sau 15 phút',
        );
        await expect(
          tryLogin('password123', '198.51.100.5'),
        ).resolves.toMatchObject({ message: 'Đăng nhập thành công' });
      } finally {
        const limits = new AttemptLimitService(sessionService);
        await limits.clear(limits.login(username));
        await limits.clear(limits.loginFromIp(username, '203.0.113.5'));
      }
    });
  });
});
