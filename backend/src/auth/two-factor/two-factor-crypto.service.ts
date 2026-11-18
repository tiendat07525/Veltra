import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const VERSION = 'v1';
const IV_BYTES = 12;

/**
 * AES-256-GCM for TOTP secrets at rest. Key: TWO_FACTOR_ENCRYPTION_KEY (64 hex chars).
 * The user id is the additional authenticated data, so a ciphertext copied to another
 * user does not decrypt. Stored form: v1:<iv b64>:<tag b64>:<ciphertext b64>.
 */
@Injectable()
export class TwoFactorCryptoService {
  private readonly logger = new Logger(TwoFactorCryptoService.name);
  private readonly key: Buffer | null;

  constructor(configService: ConfigService) {
    const raw = configService.get<string>('TWO_FACTOR_ENCRYPTION_KEY')?.trim();
    this.key =
      raw && /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : null;
    if (!this.key) {
      this.logger.warn(
        raw
          ? 'TWO_FACTOR_ENCRYPTION_KEY không hợp lệ (cần 64 ký tự hex): tắt xác thực 2 bước'
          : 'TWO_FACTOR_ENCRYPTION_KEY chưa được cấu hình: tắt xác thực 2 bước',
      );
    }
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new ServiceUnavailableException('Chưa cấu hình xác thực 2 bước');
    }
    return this.key;
  }

  encrypt(plain: string, userId: string): string {
    const key = this.requireKey();
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(userId, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    return [
      VERSION,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  // Throws on a wrong key, another user's ciphertext or any modification
  decrypt(stored: string, userId: string): string {
    const key = this.requireKey();
    const [version, iv, tag, ciphertext] = stored.split(':');
    if (version !== VERSION || !iv || !tag || !ciphertext) {
      throw new Error('Unknown two-factor secret format');
    }
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(iv, 'base64'),
    );
    decipher.setAAD(Buffer.from(userId, 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
