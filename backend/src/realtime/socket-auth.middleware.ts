import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DefaultEventsMap, Socket } from 'socket.io';
import { UsersService } from 'src/users/users.service';
import { SessionService } from 'src/auth/session.service';
import type { JwtPayload } from 'src/auth/jwt.strategy';
import { errorMessage } from 'src/common/error-message';
import { ThrottlerStorageRedisService } from 'src/auth/throttler-storage-redis.service';
import { getSocketClientIp } from 'src/common/client-ip';

const SOCKET_CONNECT_LIMIT = 30;
const SOCKET_CONNECT_WINDOW_MS = 60_000;

// Fields the auth middleware and the gateway store on socket.data
export interface GatewaySocketData {
  user?: { _id: string; id: string; username: string; email: string };
  sessionId?: string;
  jwtExp?: number;
  expTimer?: NodeJS.Timeout;
  // Last accepted typing:start / typing:stop (ms), for the per-socket rate limit
  lastTypingStartAt?: number;
  lastTypingStopAt?: number;
  // presence:sync calls accepted in the current window (per-socket rate limit)
  presenceSyncWindowStart?: number;
  presenceSyncCount?: number;
}

export type GatewaySocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  GatewaySocketData
>;

export interface SocketAuthDeps {
  jwtService: JwtService;
  configService: ConfigService;
  usersService: UsersService;
  sessionService: SessionService;
  connectRateLimiter: ThrottlerStorageRedisService;
  logger: Logger;
}

/**
 * Handshake middleware (server.use): per-IP connect limit, JWT, Redis session, user.
 * On success stores user / sessionId / jwtExp on socket.data; otherwise rejects with
 * a generic error (the reason is only logged server-side).
 */
export const createSocketAuthMiddleware =
  (deps: SocketAuthDeps) =>
  async (socket: GatewaySocket, next: (err?: Error) => void): Promise<void> => {
    const { logger } = deps;
    try {
      // Count every handshake (valid or not) per client IP; fails open if Redis is down
      const ip = getSocketClientIp(
        socket.handshake.headers,
        socket.handshake.address,
      );
      const { isBlocked } = await deps.connectRateLimiter.increment(
        ip,
        SOCKET_CONNECT_WINDOW_MS,
        SOCKET_CONNECT_LIMIT,
        0,
        'socket-connect',
      );
      if (isBlocked) {
        logger.warn('[Socket] Handshake bị từ chối: vượt giới hạn kết nối');
        return next(new Error('Quá nhiều kết nối, vui lòng thử lại sau'));
      }

      const token: unknown =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

      if (!token || typeof token !== 'string') {
        return next(new Error('Không có quyền truy cập'));
      }

      const jwtSecret = deps.configService.getOrThrow<string>('JWT_SECRET');
      const payload = await deps.jwtService.verifyAsync<
        JwtPayload & { exp?: number }
      >(token, {
        secret: jwtSecret,
      });

      if (!payload || !payload.id || !payload.sessionId) {
        return next(new Error('Không có quyền truy cập'));
      }

      // Fail-closed: reject sockets whose Redis session is missing, revoked or expired
      const session = await deps.sessionService.getSession(
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

      const user = await deps.usersService.findOne(payload.id);
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
      logger.warn(`[Socket] Handshake bị từ chối: ${errorMessage(err)}`);
      next(new Error('Không có quyền truy cập'));
    }
  };
