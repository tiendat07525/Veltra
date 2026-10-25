import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { createClient } from 'redis';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../src/auth/auth.service';
import { SessionService } from '../src/auth/session.service';

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
      findByUsername: jest.fn().mockResolvedValue({
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
    const { refreshTokenString } = await authService.login({
      username: 'rotation-user',
      password: 'password123',
    });
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
});
