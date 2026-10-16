import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import * as crypto from 'crypto';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  /**
   * Generates a privacy-conscious, secret-free tracker for distributed rate limiting.
   * - For general endpoints: client IP
   * - For /auth/refresh: incorporates a truncated SHA-256 hash of the sessionId or malformed token
   *   Raw tokens, cookies, and authentication secrets are NEVER used as keys or logged.
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const rawIp = req.ips?.length ? req.ips[0] : req.ip || '127.0.0.1';
    // Clean and normalize IP
    const ip = typeof rawIp === 'string' ? rawIp.trim() : '127.0.0.1';

    const url = req.originalUrl || req.url || '';
    if (url.includes('/auth/refresh')) {
      const refreshToken = req.cookies?.refreshToken;
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
          return `${ip}:sess_${sessionHash}`;
        } else {
          // Malformed or invalid refresh token:
          // Hash the entire malformed value to throttle repeated abusive payload attempts
          // without storing the actual raw value as a key
          const invalidPayloadHash = crypto
            .createHash('sha256')
            .update(refreshToken, 'utf8')
            .digest('hex')
            .slice(0, 16);
          return `${ip}:invalid_${invalidPayloadHash}`;
        }
      }
    }

    return ip;
  }
}
