import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from 'src/users/users.service';
import { RealtimeService } from './realtime.service';
import { SessionService } from 'src/auth/session.service';
import { errorMessage } from 'src/common/error-message';
import { ThrottlerStorageRedisService } from 'src/auth/throttler-storage-redis.service';
import { PresenceService } from './presence.service';
import { createSocketAuthMiddleware } from './socket-auth.middleware';
import type { GatewaySocket } from './socket-auth.middleware';
import { SocketRedisAdapter } from './socket-redis-adapter';
import { GATEWAY_OPTIONS } from './gateway-options';
import type { RedisClient } from './socket-redis-adapter';

// typing:start / typing:stop: at most one of each per socket per second
export const TYPING_MIN_INTERVAL_MS = 1_000;

// presence:sync (2 reads + fetchSockets each): at most this many per socket per window
export const PRESENCE_SYNC_LIMIT = 10;
export const PRESENCE_SYNC_WINDOW_MS = 10_000;

export type SocketAck<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: { code: string; message: string } };

export const ackError = (code: string, message: string) =>
  ({ ok: false, error: { code, message } }) as const;

@WebSocketGateway(GATEWAY_OPTIONS)
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
  private readonly redisAdapter = new SocketRedisAdapter(this.logger);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly realtimeService: RealtimeService,
    private readonly sessionService: SessionService,
    private readonly connectRateLimiter: ThrottlerStorageRedisService,
    private readonly presenceService: PresenceService,
  ) {}

  async afterInit(server: Server) {
    this.server = server;
    this.realtimeService.setServer(server);

    // Handshake auth: connect limit, JWT, Redis session, user (socket-auth.middleware.ts)
    server.use(
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      createSocketAuthMiddleware({
        jwtService: this.jwtService,
        configService: this.configService,
        usersService: this.usersService,
        sessionService: this.sessionService,
        connectRateLimiter: this.connectRateLimiter,
        logger: this.logger,
      }),
    );

    await this.initRedisAdapter(server);

    this.logger.log('Socket.IO Gateway đã được khởi tạo');
  }

  // Redis adapter (socket-redis-adapter.ts); in-memory adapter when REDIS_URL is unset
  initRedisAdapter(server: Server): Promise<void> {
    return this.redisAdapter.init(
      server,
      this.configService.get<string>('REDIS_URL'),
    );
  }

  async onModuleDestroy() {
    await this.cleanupRedisClients();
  }

  cleanupRedisClients(): Promise<void> {
    return this.redisAdapter.cleanup();
  }

  getIsRedisAdapterActive(): boolean {
    return this.redisAdapter.isActive();
  }

  getRedisClients(): {
    pubClient: RedisClient | null;
    subClient: RedisClient | null;
  } {
    return this.redisAdapter.clients();
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

      // Announces "online" to friends / co-members when this is the user's first socket
      void this.presenceService.handleConnected(userId);
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
    if (userId) {
      // "offline" after the grace window if no socket of the user is back
      this.presenceService.handleDisconnected(userId);
    }
  }

  // Online users among the caller's friends / co-members (sent on every (re)connect)
  @SubscribeMessage('presence:sync')
  async handlePresenceSync(
    @ConnectedSocket() client: GatewaySocket,
  ): Promise<SocketAck<{ online: string[] }>> {
    const userId = client.data?.user?._id;
    if (!userId) return ackError('UNAUTHORIZED', 'Chưa xác thực');

    const now = Date.now();
    const windowStart = client.data.presenceSyncWindowStart;
    if (
      windowStart === undefined ||
      now - windowStart >= PRESENCE_SYNC_WINDOW_MS
    ) {
      client.data.presenceSyncWindowStart = now;
      client.data.presenceSyncCount = 0;
    }
    const count = client.data.presenceSyncCount ?? 0;
    if (count >= PRESENCE_SYNC_LIMIT) {
      return ackError('RATE_LIMITED', 'Gửi quá nhanh');
    }
    client.data.presenceSyncCount = count + 1;

    try {
      const online = await this.presenceService.onlineAudience(userId);
      return { ok: true, data: { online } };
    } catch (err: unknown) {
      this.logger.warn(`[Presence] sync lỗi: ${errorMessage(err)}`);
      return ackError('INTERNAL', 'Không thể lấy trạng thái hoạt động');
    }
  }

  @SubscribeMessage('typing:start')
  handleTypingStart(
    @ConnectedSocket() client: GatewaySocket,
    @MessageBody() body: unknown,
  ): Promise<SocketAck> {
    return this.relayTyping(client, body, true);
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() client: GatewaySocket,
    @MessageBody() body: unknown,
  ): Promise<SocketAck> {
    return this.relayTyping(client, body, false);
  }

  // Typing is ephemeral (never stored); sent only to the other members of the conversation
  private async relayTyping(
    client: GatewaySocket,
    body: unknown,
    isTyping: boolean,
  ): Promise<SocketAck> {
    const userId = client.data?.user?._id;
    if (!userId) return ackError('UNAUTHORIZED', 'Chưa xác thực');

    const conversationId =
      body && typeof body === 'object'
        ? (body as { conversationId?: unknown }).conversationId
        : undefined;
    if (typeof conversationId !== 'string') {
      return ackError('BAD_REQUEST', 'conversationId không hợp lệ');
    }

    const now = Date.now();
    const lastAt = isTyping
      ? client.data.lastTypingStartAt
      : client.data.lastTypingStopAt;
    if (lastAt !== undefined && now - lastAt < TYPING_MIN_INTERVAL_MS) {
      return ackError('RATE_LIMITED', 'Gửi quá nhanh');
    }
    if (isTyping) client.data.lastTypingStartAt = now;
    else client.data.lastTypingStopAt = now;

    try {
      const recipients = await this.presenceService.typingRecipients(
        conversationId,
        userId,
      );
      if (!recipients) {
        return ackError('NOT_FOUND', 'Không tìm thấy cuộc trò chuyện');
      }
      for (const memberId of recipients) {
        this.realtimeService.emitToUser(memberId, 'typing', {
          conversationId,
          userId,
          isTyping,
        });
      }
      return { ok: true };
    } catch (err: unknown) {
      this.logger.warn(`[Typing] lỗi: ${errorMessage(err)}`);
      return ackError('INTERNAL', 'Không thể gửi trạng thái đang nhập');
    }
  }
}
