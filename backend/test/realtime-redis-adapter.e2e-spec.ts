import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createClient } from 'redis';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../src/users/users.service';
import { RealtimeService } from '../src/realtime/realtime.service';

describe('Realtime Redis Adapter Multi-Instance E2E Integration', () => {
  const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  let isRedisAvailable = false;

  let httpServer1: http.Server;
  let httpServer2: http.Server;
  let ioServer1: SocketIOServer;
  let ioServer2: SocketIOServer;
  let gateway1: RealtimeGateway;
  let gateway2: RealtimeGateway;
  let realtimeService1: RealtimeService;
  let realtimeService2: RealtimeService;

  let ioClientConstructor: any = null;

  beforeAll(async () => {
    // 1. Check if Redis server is available
    const probeClient = createClient({
      url: REDIS_URL,
      socket: { connectTimeout: 1000, reconnectStrategy: false },
    });
    probeClient.on('error', () => {});

    try {
      await probeClient.connect();
      const pingRes = await probeClient.ping();
      if (pingRes === 'PONG') {
        isRedisAvailable = true;
      }
      await probeClient.quit();
    } catch {
      isRedisAvailable = false;
    }

    // 2. Load socket.io-client if present
    try {
      const clientPath = '../../frontend/node_modules/socket.io-client';
      const clientPkg = (await import(clientPath)) as Record<string, any>;
      ioClientConstructor = clientPkg.io || clientPkg.default || clientPkg;
    } catch {
      ioClientConstructor = null;
    }
  }, 10000);

  afterEach(async () => {
    if (gateway1) {
      await gateway1.onModuleDestroy();
    }
    if (gateway2) {
      await gateway2.onModuleDestroy();
    }
    if (ioServer1) {
      await new Promise<void>((resolve) => {
        void ioServer1.close(() => {
          resolve();
        });
      });
    }
    if (ioServer2) {
      await new Promise<void>((resolve) => {
        void ioServer2.close(() => {
          resolve();
        });
      });
    }
    if (httpServer1 && httpServer1.listening) {
      await new Promise<void>((resolve) => {
        httpServer1.close(() => {
          resolve();
        });
      });
    }
    if (httpServer2 && httpServer2.listening) {
      await new Promise<void>((resolve) => {
        httpServer2.close(() => {
          resolve();
        });
      });
    }
  });

  it('should verify whether Redis is available for cross-instance integration testing', () => {
    if (isRedisAvailable) {
      expect(isRedisAvailable).toBe(true);
    } else {
      console.warn(
        `Redis is not available at ${REDIS_URL}. Multi-instance integration tests will be skipped.`,
      );
    }
  });

  it('should initialize two distinct RealtimeGateway instances connected to real Redis and enable cluster adapter', async () => {
    if (!isRedisAvailable) {
      return;
    }

    const mockJwtService: Partial<JwtService> = {
      verifyAsync: jest.fn(),
    };
    const mockConfigService: Partial<ConfigService> = {
      get: jest.fn((key: string) => {
        if (key === 'REDIS_URL') return REDIS_URL;
        return undefined;
      }),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'test-jwt-secret';
        return undefined;
      }),
    };
    const mockUsersService: Partial<UsersService> = {
      findOne: jest.fn(),
    };

    realtimeService1 = new RealtimeService();
    realtimeService2 = new RealtimeService();

    gateway1 = new RealtimeGateway(
      mockJwtService as any,
      mockConfigService as any,
      mockUsersService as any,
      realtimeService1,
    );
    gateway2 = new RealtimeGateway(
      mockJwtService as any,
      mockConfigService as any,
      mockUsersService as any,
      realtimeService2,
    );

    httpServer1 = http.createServer();
    httpServer2 = http.createServer();

    ioServer1 = new SocketIOServer(httpServer1);
    ioServer2 = new SocketIOServer(httpServer2);

    await gateway1.afterInit(ioServer1);
    await gateway2.afterInit(ioServer2);

    expect(gateway1.getIsRedisAdapterActive()).toBe(true);
    expect(gateway2.getIsRedisAdapterActive()).toBe(true);

    const clients1 = gateway1.getRedisClients();
    const clients2 = gateway2.getRedisClients();

    expect(clients1.pubClient).toBeDefined();
    expect(clients1.subClient).toBeDefined();
    expect(clients2.pubClient).toBeDefined();
    expect(clients2.subClient).toBeDefined();

    // Pub/sub clients should be distinct across gateway instances
    expect(clients1.pubClient).not.toBe(clients2.pubClient);
    expect(clients1.subClient).not.toBe(clients2.subClient);
  });

  it('should deliver realtime events across backend instances via Redis pub/sub', async () => {
    if (!isRedisAvailable || !ioClientConstructor) {
      return;
    }

    const targetUserId = 'target-user-456';
    const targetSessionId = 'target-session-456';

    const mockJwtService: Partial<JwtService> = {
      verifyAsync: jest.fn().mockResolvedValue({
        id: targetUserId,
        sessionId: targetSessionId,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    };
    const mockConfigService: Partial<ConfigService> = {
      get: jest.fn((key: string) =>
        key === 'REDIS_URL' ? REDIS_URL : undefined,
      ),
      getOrThrow: jest.fn((key: string) =>
        key === 'JWT_SECRET' ? 'test-secret' : undefined,
      ),
    };
    const mockUsersService: Partial<UsersService> = {
      findOne: jest.fn().mockResolvedValue({
        _id: targetUserId,
        username: 'targetuser',
        email: 'target@example.com',
      }),
    };

    realtimeService1 = new RealtimeService();
    realtimeService2 = new RealtimeService();

    gateway1 = new RealtimeGateway(
      mockJwtService as any,
      mockConfigService as any,
      mockUsersService as any,
      realtimeService1,
    );
    gateway2 = new RealtimeGateway(
      mockJwtService as any,
      mockConfigService as any,
      mockUsersService as any,
      realtimeService2,
    );

    httpServer1 = http.createServer();
    httpServer2 = http.createServer();

    ioServer1 = new SocketIOServer(httpServer1);
    ioServer2 = new SocketIOServer(httpServer2);

    await gateway1.afterInit(ioServer1);
    await gateway2.afterInit(ioServer2);

    await new Promise<void>((resolve) =>
      httpServer1.listen(0, () => resolve()),
    );
    await new Promise<void>((resolve) =>
      httpServer2.listen(0, () => resolve()),
    );

    const port2 = (httpServer2.address() as any).port;

    // Node 2 accepts connection and executes handleConnection (which joins user & session rooms)
    const node2ConnectedPromise = new Promise<void>((resolve) => {
      ioServer2.on('connection', async (socket) => {
        await gateway2.handleConnection(socket);
        socket.on('disconnect', () => {
          gateway2.handleDisconnect(socket);
        });
        resolve();
      });
    });

    const clientOnNode2 = ioClientConstructor(`http://127.0.0.1:${port2}`, {
      transports: ['websocket'],
      reconnection: false,
      auth: { token: 'mock-valid-jwt-token' },
    });

    await node2ConnectedPromise;

    // Listen for event on Client connected to Node 2
    const messagePromise = new Promise<{
      conversationId: string;
      content: string;
    }>((resolve) => {
      clientOnNode2.on('message:new', (payload: any) => {
        resolve(payload);
      });
    });

    // Node 1 emits message to target user room via RealtimeService
    realtimeService1.emitToUser(targetUserId, 'message:new', {
      conversationId: '60d5ec49f1b2c8b1f8e4e1a1',
      content: 'Realtime cross-instance message from Node 1',
    });

    const receivedPayload = await messagePromise;

    expect(receivedPayload).toEqual({
      conversationId: '60d5ec49f1b2c8b1f8e4e1a1',
      content: 'Realtime cross-instance message from Node 1',
    });

    clientOnNode2.disconnect();
  }, 15000);

  it('should disconnect sockets across backend instances via Redis pub/sub request channels', async () => {
    if (!isRedisAvailable || !ioClientConstructor) {
      return;
    }

    const targetUserId = 'target-user-789';
    const targetSessionId = 'session-to-revoke-789';

    const mockJwtService: Partial<JwtService> = {
      verifyAsync: jest.fn().mockResolvedValue({
        id: targetUserId,
        sessionId: targetSessionId,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    };
    const mockConfigService: Partial<ConfigService> = {
      get: jest.fn((key: string) =>
        key === 'REDIS_URL' ? REDIS_URL : undefined,
      ),
      getOrThrow: jest.fn((key: string) =>
        key === 'JWT_SECRET' ? 'test-secret' : undefined,
      ),
    };
    const mockUsersService: Partial<UsersService> = {
      findOne: jest.fn().mockResolvedValue({
        _id: targetUserId,
        username: 'revokeuser',
        email: 'revoke@example.com',
      }),
    };

    realtimeService1 = new RealtimeService();
    realtimeService2 = new RealtimeService();

    gateway1 = new RealtimeGateway(
      mockJwtService as any,
      mockConfigService as any,
      mockUsersService as any,
      realtimeService1,
    );
    gateway2 = new RealtimeGateway(
      mockJwtService as any,
      mockConfigService as any,
      mockUsersService as any,
      realtimeService2,
    );

    httpServer1 = http.createServer();
    httpServer2 = http.createServer();

    ioServer1 = new SocketIOServer(httpServer1);
    ioServer2 = new SocketIOServer(httpServer2);

    await gateway1.afterInit(ioServer1);
    await gateway2.afterInit(ioServer2);

    await new Promise<void>((resolve) =>
      httpServer1.listen(0, () => resolve()),
    );
    await new Promise<void>((resolve) =>
      httpServer2.listen(0, () => resolve()),
    );

    const port2 = (httpServer2.address() as any).port;

    // Node 2 accepts connection and executes handleConnection (which joins session room)
    const node2ConnectedPromise = new Promise<void>((resolve) => {
      ioServer2.on('connection', async (socket) => {
        await gateway2.handleConnection(socket);
        socket.on('disconnect', () => {
          gateway2.handleDisconnect(socket);
        });
        resolve();
      });
    });

    const clientOnNode2 = ioClientConstructor(`http://127.0.0.1:${port2}`, {
      transports: ['websocket'],
      reconnection: false,
      auth: { token: 'mock-valid-jwt-token' },
    });

    await node2ConnectedPromise;

    const disconnectPromise = new Promise<string>((resolve) => {
      clientOnNode2.on('disconnect', (reason: string) => {
        resolve(reason);
      });
    });

    // Node 1 triggers disconnectSession across the cluster via RealtimeService
    realtimeService1.disconnectSession(targetSessionId);

    const disconnectReason = await disconnectPromise;
    expect(disconnectReason).toBeDefined();

    clientOnNode2.disconnect();
  }, 15000);
});
