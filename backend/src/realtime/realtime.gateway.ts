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
    implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
  {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly realtimeService: RealtimeService,
  ) {}

  afterInit(server: Server) {
    this.realtimeService.setServer(server);

    // Socket.IO pre-connection middleware for strict JWT authentication
    server.use(async (socket: Socket, next) => {
      try {
        const token =
          socket.handshake.auth?.token ||
          socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '') ||
          socket.handshake.query?.token;

        if (!token || typeof token !== 'string') {
          return next(new Error('Authentication failed: No auth token provided'));
        }

        const jwtSecret = this.configService.getOrThrow<string>('JWT_SECRET');
        const payload = await this.jwtService.verifyAsync(token, {
          secret: jwtSecret,
        });

        if (!payload || !payload.id) {
          return next(new Error('Authentication failed: Invalid token payload'));
        }

        const user = await this.usersService.findOne(payload.id);
        if (!user) {
          return next(new Error('Authentication failed: User not found'));
        }

        const userId = user._id.toString();
        socket.data.user = {
          _id: userId,
          id: userId,
          username: user.username,
          email: user.email,
        };

        next();
      } catch (err: any) {
        next(new Error(`Authentication failed: ${err.message}`));
      }
    });

    this.logger.log('Socket.IO Gateway initialized with auth middleware');
  }

  async handleConnection(client: Socket) {
    try {
      const user = client.data.user;
      if (!user?._id) {
        client.disconnect(true);
        return;
      }

      const userId = user._id;
      const userRoom = `user:${userId}`;
      await client.join(userRoom);

      this.logger.log(`[Socket] Client connected: socketId=${client.id}`);
      this.logger.log(`[Socket] User authenticated: userId=${userId}`);
      this.logger.log(`[Socket] User joined room: ${userRoom}`);
    } catch (err: any) {
      this.logger.warn(`[Socket] Error joining user room: ${err.message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.user?._id;
    this.logger.log(
      `[Socket] Client disconnected: socketId=${client.id}${userId ? ` (userId: ${userId})` : ''}`,
    );
  }
}
