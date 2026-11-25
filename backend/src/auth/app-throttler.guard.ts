import { Injectable } from '@nestjs/common';
import {
  normalizeIp,
  ThrottlerGuard,
  ThrottlerRequest,
} from '@nestjs/throttler';
import * as crypto from 'crypto';
import type { Request } from 'express';

const REFRESH_PATH = '/auth/refresh';

// /auth/refresh is limited per session (the cookie is chosen by the client), so all the
// refresh calls of one address together have a cap too
export const REFRESH_IP_LIMIT = 60;
export const REFRESH_IP_WINDOW_MS = 60_000;

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  // The address cap is checked first: once over it, no per-session bucket is created
  protected async handleRequest(props: ThrottlerRequest): Promise<boolean> {
    const { req } = this.getRequestResponse(props.context);
    const request = req as Request;
    if (this.isRefresh(request)) {
      await super.handleRequest({
        ...props,
        limit: REFRESH_IP_LIMIT,
        ttl: REFRESH_IP_WINDOW_MS,
        blockDuration: REFRESH_IP_WINDOW_MS,
        getTracker: () => Promise.resolve(`${this.clientIp(request)}:refresh`),
      });
    }
    return super.handleRequest(props);
  }

  /**
   * Generates a privacy-conscious, secret-free tracker for distributed rate limiting.
   * - For general endpoints: client IP (IPv6: its /64, one client usually owns all of it)
   * - For /auth/refresh: incorporates a truncated SHA-256 hash of the sessionId or malformed token
   *   Raw tokens, cookies, and authentication secrets are NEVER used as keys or logged.
   */
  protected getTracker(req: Record<string, any>): Promise<string> {
    // ThrottlerGuard passes the Express request under a loose type
    const request = req as Request;
    const ip = this.clientIp(request);

    if (this.isRefresh(request)) {
      const refreshToken: unknown = request.cookies?.refreshToken;
      if (typeof refreshToken === 'string' && refreshToken.length > 0) {
        const parts = refreshToken.split('.');
        if (parts.length === 3 && parts[1]) {
          // Valid format: userId.sessionId.rawToken
          // Hash the sessionId (UUID) to anonymize it, never use the rawToken secret!
          const sessionHash = crypto
            .createHash('sha256')
            .update(parts[1], 'utf8')
            .digest('hex')
            .slice(0, 16);
          return Promise.resolve(`${ip}:sess_${sessionHash}`);
        } else {
          // Malformed or invalid refresh token:
          // Hash the entire malformed value to throttle repeated abusive payload attempts
          // without storing the actual raw value as a key
          const invalidPayloadHash = crypto
            .createHash('sha256')
            .update(refreshToken, 'utf8')
            .digest('hex')
            .slice(0, 16);
          return Promise.resolve(`${ip}:invalid_${invalidPayloadHash}`);
        }
      }
    }

    return Promise.resolve(ip);
  }

  private clientIp(request: Request): string {
    const rawIp = request.ips?.length
      ? request.ips[0]
      : request.ip || '127.0.0.1';
    // Clean and normalize IP
    return normalizeIp(typeof rawIp === 'string' ? rawIp.trim() : '127.0.0.1');
  }

  // Exact path, without the query string: the client controls the query, so
  // "/auth/login?x=/auth/refresh" must not get the cookie-based bucket
  private isRefresh(request: Request): boolean {
    const path = (request.originalUrl || request.url || '').split('?', 1)[0];
    return path === REFRESH_PATH;
  }
}
