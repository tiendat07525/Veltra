import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { DefaultEventsMap, Server, Socket } from 'socket.io';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { UsersService } from 'src/users/users.service';
import { RealtimeService } from './realtime.service';
import { SessionService } from 'src/auth/session.service';
import type { JwtPayload } from 'src/auth/jwt.strategy';
import { errorMessage } from 'src/common/error-message';
import { isAllowedOrigin } from 'src/common/allowed-origins';

type RedisClient = ReturnType<typeof createClient>;

// Fields the auth middleware and handleConnection store on socket.data
interface GatewaySocketData {
  user?: { _id: string; id: string; username: string; email: string };
  sessionId?: string;
  jwtExp?: number;
  expTimer?: NodeJS.Timeout;
}
type GatewaySocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  GatewaySocketData
>;

@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`WebSocket CORS blocked for origin: ${origin}`));
      }
    },
    credentials: true,
  },
})
export class RealtimeGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private pubClient: RedisClient | null = null;
  private subClient: RedisClient | null = null;
  private isRedisAdapterActive = false;
  private isInitializingAdapter = false;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly realtimeService: RealtimeService,
    private readonly sessionService: SessionService,
  ) {}

  async afterInit(server: Server) {
    this.server = server;
    this.realtimeService.setServer(server);

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    server.use(async (socket: GatewaySocket, next) => {
      try {
        const token: unknown =
          socket.handshake.auth?.token ||
          socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '') ||
          socket.handshake.query?.token;

        if (!token || typeof token !== 'string') {
          return next(new Error('Không có quyền truy cập'));
        }

        const jwtSecret = this.configService.getOrThrow<string>('JWT_SECRET');
        const payload = await this.jwtService.verifyAsync<
          JwtPayload & { exp?: number }
        >(token, {
          secret: jwtSecret,
        });

        if (!payload || !payload.id || !payload.sessionId) {
          return next(new Error('Không có quyền truy cập'));
        }

        // Fail-closed: reject sockets whose Redis session is missing, revoked or expired
        const session = await this.sessionService.getSession(
          payload.id,
          payload.sessionId,
        );
        if (
          !session ||
          (session.expiresAt &&
            new Date(session.expiresAt).getTime() <= Date.now())
        ) {
          return next(new Error('Không có quyền truy cập'));
        }

        const user = await this.usersService.findOne(payload.id);
        if (!user) {
          return next(new Error('Không có quyền truy cập'));
        }

        const userId = user._id.toString();
        socket.data.user = {
          _id: userId,
          id: userId,
          username: user.username,
          email: user.email,
        };
        socket.data.sessionId = payload.sessionId;
        socket.data.jwtExp = payload.exp;

        next();
      } catch (err: unknown) {
        // Keep the reason server-side; clients only learn that access was denied
        this.logger.warn(`[Socket] Handshake bị từ chối: ${errorMessage(err)}`);
        next(new Error('Không có quyền truy cập'));
      }
    });

    await this.initRedisAdapter(server);

    this.logger.log('Socket.IO Gateway đã được khởi tạo');
  }

  async initRedisAdapter(server: Server): Promise<void> {
    if (this.isRedisAdapterActive || this.isInitializingAdapter) {
      this.logger.warn(
        'Socket.IO Redis adapter đã được khởi tạo hoặc đang trong quá trình khởi tạo',
      );
      return;
    }

    const redisUrl = this.configService.get<string>('REDIS_URL')?.trim();
    if (!redisUrl) {
      this.isRedisAdapterActive = false;
      this.logger.log(
        'REDIS_URL không được cấu hình; duy trì bộ điều hợp in-memory mặc định cho Socket.IO',
      );
      return;
    }

    this.isInitializingAdapter = true;
    try {
      const maskedUrl = this.maskRedisUrl(redisUrl);
      this.logger.log(
        `Đang khởi tạo Socket.IO Redis adapter với URL: ${maskedUrl}`,
      );

      const pubClient: RedisClient = createClient({ url: redisUrl });
      const subClient: RedisClient = pubClient.duplicate();

      pubClient.on('error', (err: unknown) => {
        this.logger.error(
          `Socket.IO Redis PubClient Error: ${errorMessage(err)}`,
        );
      });
      subClient.on('error', (err: unknown) => {
        this.logger.error(
          `Socket.IO Redis SubClient Error: ${errorMessage(err)}`,
        );
      });

      this.pubClient = pubClient;
      this.subClient = subClient;

      await Promise.all([pubClient.connect(), subClient.connect()]);

      server.adapter(createAdapter(pubClient, subClient));
      this.isRedisAdapterActive = true;
      this.logger.log(
        'Socket.IO Redis adapter đã được khởi tạo và kết nối thành công',
      );
    } catch (err: unknown) {
      this.isRedisAdapterActive = false;
      this.logger.error(
        `Không thể khởi tạo Socket.IO Redis adapter; chuyển về bộ điều hợp in-memory. Lỗi: ${errorMessage(err)}`,
      );
      await this.cleanupRedisClients();
    } finally {
      this.isInitializingAdapter = false;
    }
  }

  private maskRedisUrl(redisUrl: string): string {
    try {
      const parsed = new URL(redisUrl);
      if (parsed.password) {
        parsed.password = '***';
      }
      return parsed.toString();
    } catch {
      return 'redis://[hidden]';
    }
  }

  async onModuleDestroy() {
    await this.cleanupRedisClients();
  }

  async cleanupRedisClients(): Promise<void> {
    const clients = [this.pubClient, this.subClient];
    this.pubClient = null;
    this.subClient = null;
    this.isRedisAdapterActive = false;

    for (const client of clients) {
      if (client) {
        try {
          if (client.isOpen) {
            await client.quit();
          } else {
            try {
              await client.disconnect();
            } catch {
              // Client is already closed or destroyed
            }
          }
        } catch (err: unknown) {
          this.logger.warn(
            `Lỗi khi đóng Socket.IO Redis client: ${errorMessage(err)}`,
          );
        }
      }
    }
  }

  getIsRedisAdapterActive(): boolean {
    return this.isRedisAdapterActive;
  }

  getRedisClients(): {
    pubClient: RedisClient | null;
    subClient: RedisClient | null;
  } {
    return {
      pubClient: this.pubClient,
      subClient: this.subClient,
    };
  }

  async handleConnection(client: GatewaySocket) {
    try {
      const user = client.data.user;
      if (!user?._id) {
        client.disconnect(true);
        return;
      }

      const userId = user._id;
      const sessionId = client.data.sessionId;
      const jwtExp = client.data.jwtExp;

      const delay = (jwtExp ?? 0) * 1000 - Date.now();
      if (delay <= 0) {
        this.logger.warn(
          `[Socket] Token đã hết hạn khi kết nối: socketId=${client.id}`,
        );
        client.disconnect(true);
        return;
      }

      // Schedule disconnect on token expiration
      const expTimer = setTimeout(() => {
        this.logger.log(
          `[Socket] Ngắt kết nối do token hết hạn: socketId=${client.id}`,
        );
        client.disconnect(true);
      }, delay);
      if (typeof expTimer.unref === 'function') {
        expTimer.unref();
      }
      client.data.expTimer = expTimer;

      const userRoom = `user:${userId}`;
      await client.join(userRoom);

      if (sessionId) {
        const sessionRoom = `session:${sessionId}`;
        await client.join(sessionRoom);
        this.logger.log(`[Socket] User đã vào phòng session: ${sessionRoom}`);
      }

      this.logger.log(`[Socket] Client đã kết nối: socketId=${client.id}`);
      this.logger.log(`[Socket] User đã xác thực: userId=${userId}`);
      this.logger.log(`[Socket] User đã vào phòng: ${userRoom}`);
    } catch (err: unknown) {
      this.logger.warn(`[Socket] Có lỗi khi vào phòng: ${errorMessage(err)}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: GatewaySocket) {
    if (client.data?.expTimer) {
      clearTimeout(client.data.expTimer);
    }
    const userId = client.data?.user?._id;
    this.logger.log(
      `[Socket] Client đã ngắt kết nối: socketId=${client.id}${userId ? ` (userId: ${userId})` : ''}`,
    );
  }
}
