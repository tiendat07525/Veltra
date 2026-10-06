import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from 'src/users/users.service';
import { RealtimeService } from './realtime.service';

const allowedOrigins = [
  'http://localhost:3000',
  'https://tiendat75.id.vn',
  'http://tiendat75.id.vn',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`WebSocket CORS blocked for origin: ${origin}`));
      }
    },
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly realtimeService: RealtimeService,
  ) { }

  afterInit(server: Server) {
    this.realtimeService.setServer(server);

    server.use(async (socket: Socket, next) => {
      try {
        const token =
          socket.handshake.auth?.token ||
          socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '') ||
          socket.handshake.query?.token;

        if (!token || typeof token !== 'string') {
          return next(new Error('Không có quyền truy cập'));
        }

        const jwtSecret = this.configService.getOrThrow<string>('JWT_SECRET');
        const payload = await this.jwtService.verifyAsync(token, {
          secret: jwtSecret,
        });

        if (!payload || !payload.id) {
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
      } catch (err: any) {
        next(new Error(`Không có quyền truy cập: ${err.message}`));
      }
    });

    this.logger.log('Socket.IO Gateway đã được khởi tạo');
  }

  async handleConnection(client: Socket) {
    try {
      const user = client.data.user;
      if (!user?._id) {
        client.disconnect(true);
        return;
      }

      const userId = user._id;
      const sessionId = client.data.sessionId;
      const jwtExp = client.data.jwtExp;

      const delay = jwtExp * 1000 - Date.now();
      if (delay <= 0) {
        this.logger.warn(`[Socket] Token đã hết hạn khi kết nối: socketId=${client.id}`);
        client.disconnect(true);
        return;
      }

      // Schedule disconnect on token expiration
      client.data.expTimer = setTimeout(() => {
        this.logger.log(`[Socket] Ngắt kết nối do token hết hạn: socketId=${client.id}`);
        client.disconnect(true);
      }, delay);

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
    } catch (err: any) {
      this.logger.warn(`[Socket] Có lỗi khi vào phòng: ${err.message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    if (client.data?.expTimer) {
      clearTimeout(client.data.expTimer);
    }
    const userId = client.data?.user?._id;
    this.logger.log(
      `[Socket] Client đã ngắt kết nối: socketId=${client.id}${userId ? ` (userId: ${userId})` : ''}`,
    );
  }
}
