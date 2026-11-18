import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { TwoFactor, User, UserDocument } from 'src/users/schemas/user.schema';
import { SessionService } from '../session.service';
import { TwoFactorCryptoService } from './two-factor-crypto.service';

export const TOTP_ISSUER = 'Veltra';
// ±1 time step (30 s) for clock drift
export const TOTP_TOLERANCE_SECONDS = 30;
export const PENDING_SETUP_TTL_MS = 10 * 60 * 1000;
export const BACKUP_CODE_COUNT = 10;
export const LOGIN_CHALLENGE_TTL_SECONDS = 5 * 60;
export const LOGIN_CHALLENGE_MAX_ATTEMPTS = 5;

const TOTP_PATTERN = /^\d{6}$/;
// Backup codes: 10 base32 chars, shown as xxxxx-xxxxx
const BACKUP_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const BACKUP_PATTERN = /^[a-z2-7]{10}$/;

const sha256 = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');

// Spaces / hyphens and case do not matter when typing a code
const normalizeCode = (code: string) =>
  code.replace(/[\s-]/g, '').toLowerCase();

type CodeKind = 'totp' | 'backup';

/**
 * TOTP two-step verification: setup, enable, disable, backup codes, and the code check used
 * by the two-step login and the password change. Secrets are encrypted at rest; a TOTP code
 * is accepted at most once (lastUsedStep), a backup code exactly once ($pull).
 */
@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly cryptoService: TwoFactorCryptoService,
    private readonly sessionService: SessionService,
  ) {}

  private async load(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('User ID không hợp lệ');
    }
    const user = await this.userModel
      .findById(userId)
      .select('+password +twoFactor username')
      .lean<{
        _id: Types.ObjectId;
        username: string;
        password: string;
        twoFactor?: TwoFactor;
      }>();
    if (!user) throw new NotFoundException('User không tồn tại');
    return user;
  }

  private async assertPassword(hash: string, password: string) {
    if (!(await bcrypt.compare(password, hash))) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }
  }

  async isEnabled(userId: string | Types.ObjectId): Promise<boolean> {
    return !!(await this.userModel.exists({
      _id: userId,
      'twoFactor.enabled': true,
    }));
  }

  async status(userId: string) {
    const { twoFactor } = await this.load(userId);
    const enabled = !!twoFactor?.enabled;
    return {
      enabled,
      enabledAt: enabled ? (twoFactor?.enabledAt ?? null) : null,
      backupCodesRemaining: enabled ? (twoFactor?.backupCodes?.length ?? 0) : 0,
    };
  }

  // Step 1: a new secret, not active until a code from it is confirmed (enable)
  async setup(userId: string, currentPassword: string) {
    const user = await this.load(userId);
    await this.assertPassword(user.password, currentPassword);
    if (user.twoFactor?.enabled) {
      throw new BadRequestException('Xác thực 2 bước đang bật');
    }
    const secret = generateSecret();
    const pendingSecret = this.cryptoService.encrypt(secret, userId);
    await this.userModel.updateOne(
      { _id: user._id, 'twoFactor.enabled': { $ne: true } },
      {
        $set: {
          'twoFactor.pendingSecret': pendingSecret,
          'twoFactor.pendingCreatedAt': new Date(),
        },
      },
    );
    return {
      secret,
      otpauthUrl: generateURI({
        issuer: TOTP_ISSUER,
        label: user.username,
        secret,
      }),
    };
  }

  // Step 2: the first code proves the app has the secret → enabled, backup codes shown once
  async enable(userId: string, code: string) {
    const user = await this.load(userId);
    const twoFactor = user.twoFactor;
    if (twoFactor?.enabled) {
      throw new BadRequestException('Xác thực 2 bước đang bật');
    }
    if (
      !twoFactor?.pendingSecret ||
      !twoFactor.pendingCreatedAt ||
      Date.now() - new Date(twoFactor.pendingCreatedAt).getTime() >
        PENDING_SETUP_TTL_MS
    ) {
      throw new BadRequestException(
        'Phiên thiết lập đã hết hạn, hãy bắt đầu lại',
      );
    }
    const secret = this.cryptoService.decrypt(twoFactor.pendingSecret, userId);
    const step = this.checkTotp(secret, code);
    if (step === null) {
      throw new BadRequestException('Mã xác thực không đúng');
    }

    const backupCodes = this.generateBackupCodes();
    const { modifiedCount } = await this.userModel.updateOne(
      {
        _id: user._id,
        'twoFactor.enabled': { $ne: true },
        'twoFactor.pendingSecret': twoFactor.pendingSecret,
      },
      {
        $set: {
          twoFactor: {
            enabled: true,
            enabledAt: new Date(),
            secret: this.cryptoService.encrypt(secret, userId),
            backupCodes: backupCodes.map((c) => sha256(normalizeCode(c))),
            lastUsedStep: step,
          },
        },
      },
    );
    if (modifiedCount === 0) {
      throw new BadRequestException(
        'Phiên thiết lập đã thay đổi, hãy bắt đầu lại',
      );
    }
    return { backupCodes };
  }

  async disable(userId: string, currentPassword: string, code: string) {
    const user = await this.load(userId);
    await this.assertPassword(user.password, currentPassword);
    if (!user.twoFactor?.enabled) {
      throw new BadRequestException('Xác thực 2 bước chưa bật');
    }
    if (!(await this.verifyCode(userId, code, ['totp', 'backup']))) {
      throw new BadRequestException('Mã xác thực không đúng');
    }
    await this.userModel.updateOne(
      { _id: user._id },
      { $unset: { twoFactor: '' } },
    );
    return { message: 'Đã tắt xác thực 2 bước' };
  }

  // Replaces every backup code; needs a TOTP code (not a backup code)
  async regenerateBackupCodes(
    userId: string,
    currentPassword: string,
    code: string,
  ) {
    const user = await this.load(userId);
    await this.assertPassword(user.password, currentPassword);
    if (!user.twoFactor?.enabled) {
      throw new BadRequestException('Xác thực 2 bước chưa bật');
    }
    if (!(await this.verifyCode(userId, code, ['totp']))) {
      throw new BadRequestException('Mã xác thực không đúng');
    }
    const backupCodes = this.generateBackupCodes();
    await this.userModel.updateOne(
      { _id: user._id, 'twoFactor.enabled': true },
      {
        $set: {
          'twoFactor.backupCodes': backupCodes.map((c) =>
            sha256(normalizeCode(c)),
          ),
        },
      },
    );
    return { backupCodes };
  }

  /**
   * Checks and consumes a code of an enabled user: a TOTP code (6 digits) whose time step is
   * newer than the last accepted one, or an unused backup code. false for anything else.
   */
  async verifyCode(
    userId: string,
    code: string,
    allowed: CodeKind[] = ['totp', 'backup'],
  ): Promise<boolean> {
    const normalized = normalizeCode(typeof code === 'string' ? code : '');
    const _id = new Types.ObjectId(userId);

    if (allowed.includes('totp') && TOTP_PATTERN.test(normalized)) {
      const user = await this.userModel
        .findOne({ _id, 'twoFactor.enabled': true })
        .select('+twoFactor')
        .lean<{ twoFactor?: TwoFactor }>();
      const stored = user?.twoFactor;
      if (!stored?.secret) return false;
      const secret = this.cryptoService.decrypt(stored.secret, userId);
      const step = this.checkTotp(secret, normalized, stored.lastUsedStep);
      if (step === null) return false;
      // Atomic: two requests with the same code → only one moves lastUsedStep forward
      const { modifiedCount } = await this.userModel.updateOne(
        {
          _id,
          'twoFactor.enabled': true,
          $or: [
            { 'twoFactor.lastUsedStep': { $exists: false } },
            { 'twoFactor.lastUsedStep': { $lt: step } },
          ],
        },
        { $set: { 'twoFactor.lastUsedStep': step } },
      );
      return modifiedCount === 1;
    }

    if (allowed.includes('backup') && BACKUP_PATTERN.test(normalized)) {
      const hash = sha256(normalized);
      const { modifiedCount } = await this.userModel.updateOne(
        { _id, 'twoFactor.enabled': true, 'twoFactor.backupCodes': hash },
        { $pull: { 'twoFactor.backupCodes': hash } },
      );
      if (modifiedCount === 1) {
        this.logger.log(`[2FA] backup code used by ${userId}`);
      }
      return modifiedCount === 1;
    }
    return false;
  }

  // ── Two-step login ─────────────────────────────────────────────────────────

  // After a correct password: a one-time token for POST /auth/login/2fa (5 min, 5 attempts)
  async createLoginChallenge(userId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    await this.sessionService.createTwoFactorChallenge(
      sha256(token),
      userId,
      LOGIN_CHALLENGE_TTL_SECONDS,
    );
    return token;
  }

  // Returns the user id once the code is right; the challenge can be completed only once
  async completeLoginChallenge(token: string, code: string): Promise<string> {
    const expired = new UnauthorizedException(
      'Phiên xác thực đã hết hạn, hãy đăng nhập lại',
    );
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) {
      throw expired;
    }
    const tokenHash = sha256(token);
    const userId =
      await this.sessionService.getTwoFactorChallengeUserId(tokenHash);
    if (!userId) throw expired;

    if (!(await this.verifyCode(userId, code))) {
      const attempts =
        await this.sessionService.recordTwoFactorChallengeFailure(tokenHash);
      if (attempts === 0 || attempts >= LOGIN_CHALLENGE_MAX_ATTEMPTS) {
        await this.sessionService.deleteTwoFactorChallenge(tokenHash);
        throw new UnauthorizedException(
          'Nhập sai quá nhiều lần, hãy đăng nhập lại',
        );
      }
      throw new UnauthorizedException('Mã xác thực không đúng');
    }
    if (!(await this.sessionService.deleteTwoFactorChallenge(tokenHash))) {
      throw expired;
    }
    return userId;
  }

  // Time step of a valid code, or null
  private checkTotp(
    secret: string,
    code: string,
    afterTimeStep?: number,
  ): number | null {
    const normalized = normalizeCode(code ?? '');
    if (!TOTP_PATTERN.test(normalized)) return null;
    const result = verifySync({
      secret,
      token: normalized,
      epochTolerance: TOTP_TOLERANCE_SECONDS,
      ...(afterTimeStep !== undefined ? { afterTimeStep } : {}),
    });
    // verifySync is typed for HOTP and TOTP; a TOTP result carries the time step
    return result.valid && 'timeStep' in result ? result.timeStep : null;
  }

  private generateBackupCodes(): string[] {
    return Array.from({ length: BACKUP_CODE_COUNT }, () => {
      const bytes = crypto.randomBytes(10);
      const chars = Array.from(bytes, (b) => BACKUP_ALPHABET[b & 31]).join('');
      return `${chars.slice(0, 5)}-${chars.slice(5)}`;
    });
  }
}
