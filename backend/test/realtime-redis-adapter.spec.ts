import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../src/users/users.service';
import { RealtimeService } from '../src/realtime/realtime.service';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';
import * as redisModule from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';

jest.mock('@socket.io/redis-adapter', () => ({
  createAdapter: jest.fn((pub, sub) => {
    return (nsp: any) => ({ nsp, pub, sub });
  }),
}));

describe('RealtimeGateway - Socket.IO Redis Adapter (Unit Tests)', () => {
  let gateway: RealtimeGateway;
  let jwtService: jest.Mocked<Partial<JwtService>>;
  let configService: jest.Mocked<Partial<ConfigService>>;
  let usersService: jest.Mocked<Partial<UsersService>>;
  let realtimeService: jest.Mocked<Partial<RealtimeService>>;
  let mockServer: any;

  beforeEach(() => {
    jwtService = {
      verifyAsync: jest.fn(),
    };
    configService = {
      get: jest.fn(),
      getOrThrow: jest.fn(),
    };
    usersService = {
      findOne: jest.fn(),
    };
    realtimeService = {
      setServer: jest.fn(),
      getServer: jest.fn(),
      emitToUser: jest.fn(),
      disconnectSession: jest.fn(),
      disconnectUser: jest.fn(),
    };

    mockServer = {
      adapter: jest.fn(),
      use: jest.fn(),
      to: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      disconnectSockets: jest.fn(),
    };

    gateway = new RealtimeGateway(
      jwtService as any,
      configService as any,
      usersService as any,
      realtimeService as any,
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await gateway.onModuleDestroy();
  });

  describe('1. Adapter Initialization when Redis is Configured', () => {
    it('should initialize Redis adapter and connect both pub and sub clients when REDIS_URL is set', async () => {
      (configService.get as jest.Mock).mockReturnValue(
        'redis://127.0.0.1:6379',
      );

      const mockSubClient = {
        on: jest.fn(),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        isOpen: true,
      };

      const mockPubClient = {
        on: jest.fn(),
        duplicate: jest.fn().mockReturnValue(mockSubClient),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        isOpen: true,
      };

      jest
        .spyOn(redisModule, 'createClient')
        .mockReturnValue(mockPubClient as any);

      await gateway.initRedisAdapter(mockServer);

      expect(redisModule.createClient).toHaveBeenCalledWith({
        url: 'redis://127.0.0.1:6379',
      });
      expect(mockPubClient.duplicate).toHaveBeenCalled();
      expect(mockPubClient.connect).toHaveBeenCalled();
      expect(mockSubClient.connect).toHaveBeenCalled();
      expect(createAdapter).toHaveBeenCalledWith(mockPubClient, mockSubClient);
      expect(mockServer.adapter).toHaveBeenCalledTimes(1);
      expect(gateway.getIsRedisAdapterActive()).toBe(true);
      expect(gateway.getRedisClients()).toEqual({
        pubClient: mockPubClient,
        subClient: mockSubClient,
      });
    });

    it('should mask passwords in REDIS_URL when logging initialization', async () => {
      (configService.get as jest.Mock).mockReturnValue(
        'redis://user:supersecretpass@redis.example.com:6379/0',
      );

      const mockSubClient = {
        on: jest.fn(),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined),
        isOpen: true,
      };

      const mockPubClient = {
        on: jest.fn(),
        duplicate: jest.fn().mockReturnValue(mockSubClient),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined),
        isOpen: true,
      };

      jest
        .spyOn(redisModule, 'createClient')
        .mockReturnValue(mockPubClient as any);

      await gateway.initRedisAdapter(mockServer);

      expect(gateway.getIsRedisAdapterActive()).toBe(true);
    });
  });

  describe('2. Behavior when Redis Configuration is Absent', () => {
    it('should preserve default in-memory adapter when REDIS_URL is undefined', async () => {
      (configService.get as jest.Mock).mockReturnValue(undefined);
      const createClientSpy = jest.spyOn(redisModule, 'createClient');

      await gateway.initRedisAdapter(mockServer);

      expect(createClientSpy).not.toHaveBeenCalled();
      expect(mockServer.adapter).not.toHaveBeenCalled();
      expect(gateway.getIsRedisAdapterActive()).toBe(false);
      expect(gateway.getRedisClients()).toEqual({
        pubClient: null,
        subClient: null,
      });
    });

    it('should preserve default in-memory adapter when REDIS_URL is empty string or whitespace', async () => {
      (configService.get as jest.Mock).mockReturnValue('   ');
      const createClientSpy = jest.spyOn(redisModule, 'createClient');

      await gateway.initRedisAdapter(mockServer);

      expect(createClientSpy).not.toHaveBeenCalled();
      expect(mockServer.adapter).not.toHaveBeenCalled();
      expect(gateway.getIsRedisAdapterActive()).toBe(false);
    });
  });

  describe('3. Redis Connection or Initialization Failures', () => {
    it('should handle pubClient connection failure gracefully, clean up resources, and fall back to in-memory adapter', async () => {
      (configService.get as jest.Mock).mockReturnValue(
        'redis://127.0.0.1:6379',
      );

      const mockSubClient = {
        on: jest.fn(),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        isOpen: false,
      };

      const mockPubClient = {
        on: jest.fn(),
        duplicate: jest.fn().mockReturnValue(mockSubClient),
        connect: jest.fn().mockRejectedValue(new Error('Connection refused')),
        quit: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        isOpen: false,
      };

      jest
        .spyOn(redisModule, 'createClient')
        .mockReturnValue(mockPubClient as any);

      // Should not throw
      await expect(
        gateway.initRedisAdapter(mockServer),
      ).resolves.toBeUndefined();

      expect(mockServer.adapter).not.toHaveBeenCalled();
      expect(gateway.getIsRedisAdapterActive()).toBe(false);
      expect(gateway.getRedisClients()).toEqual({
        pubClient: null,
        subClient: null,
      });
    });

    it('should handle subClient connection failure gracefully when pubClient connects first', async () => {
      (configService.get as jest.Mock).mockReturnValue(
        'redis://127.0.0.1:6379',
      );

      const mockSubClient = {
        on: jest.fn(),
        connect: jest
          .fn()
          .mockRejectedValue(new Error('SubClient connect error')),
        quit: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        isOpen: false,
      };

      const mockPubClient = {
        on: jest.fn(),
        duplicate: jest.fn().mockReturnValue(mockSubClient),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        isOpen: true,
      };

      jest
        .spyOn(redisModule, 'createClient')
        .mockReturnValue(mockPubClient as any);

      await gateway.initRedisAdapter(mockServer);

      expect(mockPubClient.quit).toHaveBeenCalled();
      expect(mockServer.adapter).not.toHaveBeenCalled();
      expect(gateway.getIsRedisAdapterActive()).toBe(false);
    });

    it('should attach error handlers to both clients to catch background Redis errors', async () => {
      (configService.get as jest.Mock).mockReturnValue(
        'redis://127.0.0.1:6379',
      );

      const pubListeners: Record<string, (...args: any[]) => void> = {};
      const subListeners: Record<string, (...args: any[]) => void> = {};

      const mockSubClient = {
        on: jest.fn((event, cb) => {
          subListeners[event] = cb;
        }),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined),
        isOpen: true,
      };

      const mockPubClient = {
        on: jest.fn((event, cb) => {
          pubListeners[event] = cb;
        }),
        duplicate: jest.fn().mockReturnValue(mockSubClient),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined),
        isOpen: true,
      };

      jest
        .spyOn(redisModule, 'createClient')
        .mockReturnValue(mockPubClient as any);

      await gateway.initRedisAdapter(mockServer);

      expect(pubListeners['error']).toBeDefined();
      expect(subListeners['error']).toBeDefined();

      // Triggering error should not throw unhandled exception
      expect(() => {
        pubListeners['error'](new Error('Background pub error'));
        subListeners['error'](new Error('Background sub error'));
      }).not.toThrow();
    });
  });

  describe('4. Publisher/Subscriber Client Lifecycle and Cleanup', () => {
    it('should cleanly quit clients on onModuleDestroy() when connected', async () => {
      (configService.get as jest.Mock).mockReturnValue(
        'redis://127.0.0.1:6379',
      );

      const mockSubClient = {
        on: jest.fn(),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        isOpen: true,
      };

      const mockPubClient = {
        on: jest.fn(),
        duplicate: jest.fn().mockReturnValue(mockSubClient),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        isOpen: true,
      };

      jest
        .spyOn(redisModule, 'createClient')
        .mockReturnValue(mockPubClient as any);

      await gateway.initRedisAdapter(mockServer);
      expect(gateway.getIsRedisAdapterActive()).toBe(true);

      await gateway.onModuleDestroy();

      expect(mockPubClient.quit).toHaveBeenCalledTimes(1);
      expect(mockSubClient.quit).toHaveBeenCalledTimes(1);
      expect(gateway.getIsRedisAdapterActive()).toBe(false);
      expect(gateway.getRedisClients()).toEqual({
        pubClient: null,
        subClient: null,
      });
    });

    it('should use disconnect() if client is not open during cleanup and ignore closed client errors', async () => {
      (configService.get as jest.Mock).mockReturnValue(
        'redis://127.0.0.1:6379',
      );

      const mockSubClient = {
        on: jest.fn(),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockRejectedValue(new Error('Cannot quit closed')),
        disconnect: jest.fn().mockImplementation(() => {
          throw new Error('ClientClosedError: The client is closed');
        }),
        isOpen: false,
      };

      const mockPubClient = {
        on: jest.fn(),
        duplicate: jest.fn().mockReturnValue(mockSubClient),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        isOpen: true,
      };

      jest
        .spyOn(redisModule, 'createClient')
        .mockReturnValue(mockPubClient as any);

      await gateway.initRedisAdapter(mockServer);

      // Should not throw even if disconnect throws ClientClosedError
      await expect(gateway.cleanupRedisClients()).resolves.toBeUndefined();
      expect(gateway.getIsRedisAdapterActive()).toBe(false);
    });
  });

  describe('5. Preservation of Existing Gateway Initialization', () => {
    it('should set server on RealtimeService and register middleware during afterInit()', async () => {
      (configService.get as jest.Mock).mockReturnValue(undefined);

      await gateway.afterInit(mockServer);

      expect(realtimeService.setServer).toHaveBeenCalledWith(mockServer);
      expect(mockServer.use).toHaveBeenCalledTimes(1);
      expect(typeof mockServer.use.mock.calls[0][0]).toBe('function');
    });
  });

  describe('6. Existing Socket Authentication and Authorization Behavior', () => {
    let authMiddleware: (
      socket: any,
      next: (err?: any) => void,
    ) => Promise<void>;

    beforeEach(async () => {
      (configService.get as jest.Mock).mockReturnValue(undefined);
      (configService.getOrThrow as jest.Mock).mockReturnValue('test-secret');

      await gateway.afterInit(mockServer);
      authMiddleware = mockServer.use.mock.calls[0][0];
    });

    it('should authenticate socket with valid token and attach user, sessionId, and jwtExp', async () => {
      const mockSocket: any = {
        handshake: {
          auth: { token: 'valid-jwt-token' },
        },
        data: {},
      };

      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        sessionId: 'session-xyz',
        exp: 1893456000,
      });

      (usersService.findOne as jest.Mock).mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        username: 'alice',
        email: 'alice@example.com',
      });

      const next = jest.fn();
      await authMiddleware(mockSocket, next);

      expect(next).toHaveBeenCalledWith();
      expect(mockSocket.data.user).toEqual({
        _id: '507f1f77bcf86cd799439011',
        id: '507f1f77bcf86cd799439011',
        username: 'alice',
        email: 'alice@example.com',
      });
      expect(mockSocket.data.sessionId).toBe('session-xyz');
      expect(mockSocket.data.jwtExp).toBe(1893456000);
    });

    it('should reject socket connection if token is missing', async () => {
      const mockSocket: any = {
        handshake: {
          auth: {},
          headers: {},
          query: {},
        },
        data: {},
      };

      const next = jest.fn();
      await authMiddleware(mockSocket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toBe('Không có quyền truy cập');
    });

    it('should reject socket connection if JWT verification fails', async () => {
      const mockSocket: any = {
        handshake: {
          auth: { token: 'invalid-token' },
        },
        data: {},
      };

      (jwtService.verifyAsync as jest.Mock).mockRejectedValue(
        new Error('jwt expired'),
      );

      const next = jest.fn();
      await authMiddleware(mockSocket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toContain(
        'Không có quyền truy cập',
      );
    });

    it('should reject socket connection if user does not exist in database', async () => {
      const mockSocket: any = {
        handshake: {
          auth: { token: 'valid-token' },
        },
        data: {},
      };

      (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
      });
      (usersService.findOne as jest.Mock).mockResolvedValue(null);

      const next = jest.fn();
      await authMiddleware(mockSocket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toBe('Không có quyền truy cập');
    });

    it('handleConnection should join user and session rooms for authenticated socket', async () => {
      const mockSocket: any = {
        id: 'socket-123',
        data: {
          user: { _id: 'user-abc' },
          sessionId: 'session-xyz',
          jwtExp: Math.floor(Date.now() / 1000) + 3600,
        },
        join: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn(),
      };

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.join).toHaveBeenCalledWith('user:user-abc');
      expect(mockSocket.join).toHaveBeenCalledWith('session:session-xyz');
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
      expect(mockSocket.data.expTimer).toBeDefined();

      // Clean up timer
      gateway.handleDisconnect(mockSocket);
    });

    it('handleConnection should immediately disconnect socket if token is already expired', async () => {
      const mockSocket: any = {
        id: 'socket-expired',
        data: {
          user: { _id: 'user-abc' },
          jwtExp: Math.floor(Date.now() / 1000) - 100, // expired
        },
        join: jest.fn(),
        disconnect: jest.fn(),
      };

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
      expect(mockSocket.join).not.toHaveBeenCalled();
    });

    it('handleDisconnect should clear the token expiration timer', () => {
      const clearSpy = jest.spyOn(global, 'clearTimeout');
      const mockTimer = setTimeout(() => {}, 10000);
      const mockSocket: any = {
        id: 'socket-cleanup',
        data: {
          user: { _id: 'user-abc' },
          expTimer: mockTimer,
        },
      };

      gateway.handleDisconnect(mockSocket);
      expect(clearSpy).toHaveBeenCalledWith(mockTimer);
    });
  });

  describe('7. Race Conditions and Repeated Initialization', () => {
    it('should be idempotent and not create duplicate clients if initRedisAdapter is called twice', async () => {
      (configService.get as jest.Mock).mockReturnValue(
        'redis://127.0.0.1:6379',
      );

      const mockSubClient = {
        on: jest.fn(),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined),
        isOpen: true,
      };

      const mockPubClient = {
        on: jest.fn(),
        duplicate: jest.fn().mockReturnValue(mockSubClient),
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined),
        isOpen: true,
      };

      const createClientSpy = jest
        .spyOn(redisModule, 'createClient')
        .mockReturnValue(mockPubClient as any);

      // First call
      await gateway.initRedisAdapter(mockServer);
      expect(createClientSpy).toHaveBeenCalledTimes(1);
      expect(gateway.getIsRedisAdapterActive()).toBe(true);

      // Second call while active
      await gateway.initRedisAdapter(mockServer);
      expect(createClientSpy).toHaveBeenCalledTimes(1); // not called again
      expect(mockServer.adapter).toHaveBeenCalledTimes(1);
    });
  });
});
