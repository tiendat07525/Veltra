import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from 'src/users/users.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { SessionService } from './session.service';
import { RealtimeService } from 'src/realtime/realtime.service';
import { forwardRef, Inject } from '@nestjs/common';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly sessionService: SessionService,
    @Inject(forwardRef(() => RealtimeService))
    private readonly realtimeService: RealtimeService,
  ) { }

  async register(registerDto: RegisterDto) {
    const existedUser = await this.usersService.findByEmail(registerDto.email);
    if (existedUser) {
      throw new ConflictException('Email đã tồn tại');
    }

    const existedPhone = await this.usersService.findByUsername(
      registerDto.username,
    );
    if (existedPhone) {
      throw new ConflictException('Username đã tồn tại');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    const result = await this.usersService.create({
      ...registerDto,
      password: hashedPassword,
    });

    return result;
  }

  async login(loginDto: LoginDto, userAgent?: string, ipAddress?: string) {
    const user = await this.usersService.findByUsername(loginDto.username);
    if (!user) {
      throw new UnauthorizedException('Username hoặc mật khẩu không chính xác');
    }

    const isMatch = await bcrypt.compare(loginDto.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Username hoặc mật khẩu không chính xác');
    }

    return this.createSessionAndTokens(user, userAgent, ipAddress);
  }

  async refresh(refreshTokenString: string, userAgent?: string, ipAddress?: string) {
    if (!refreshTokenString) {
      throw new UnauthorizedException('Token không hợp lệ');
    }

    const parts = refreshTokenString.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Token không hợp lệ');
    }
    const [userId, sessionId, rawToken] = parts;

    const session = await this.sessionService.getSession(userId, sessionId);
    if (!session) {
      throw new UnauthorizedException('Phiên đăng nhập không tồn tại hoặc đã hết hạn');
    }

    const isMatch = await bcrypt.compare(rawToken, session.refreshTokenHash);
    let isPreviousMatch = false;

    if (!isMatch && session.previousRefreshTokenHash && session.rotatedAt) {
      const rotatedAtTime = new Date(session.rotatedAt).getTime();
      const now = Date.now();
      if (now - rotatedAtTime <= 15000) { // 15 seconds grace period
        isPreviousMatch = await bcrypt.compare(rawToken, session.previousRefreshTokenHash);
      }
    }

    if (!isMatch && !isPreviousMatch) {
      // Token theft detected! Revoke all sessions for this user.
      await this.sessionService.revokeAllUserSessions(userId);
      throw new UnauthorizedException('Phát hiện đánh cắp token, tất cả phiên bị hủy');
    }

    const matchedHash = isMatch ? session.refreshTokenHash : session.previousRefreshTokenHash;

    // Generate new token for rotation
    const newRawToken = crypto.randomBytes(32).toString('hex');
    const newRefreshTokenHash = await bcrypt.hash(newRawToken, 10);
    const newRefreshTokenString = `${userId}.${sessionId}.${newRawToken}`;

    const rotated = await this.sessionService.rotateSessionToken(
      userId,
      sessionId,
      matchedHash as string,
      newRefreshTokenHash,
      7 * 24 * 60 * 60, // 7 days
      new Date().toISOString(),
    );

    if (!rotated) {
      throw new UnauthorizedException('Xung đột refresh token');
    }

    let user;
    try {
      user = await this.usersService.findOne(userId);
    } catch (e) {
      throw new UnauthorizedException('Người dùng không tồn tại');
    }

    const payload = {
      id: user._id.toString(),
      email: user.email,
      username: user.username,
      phone: user.phone,
      sessionId,
    };

    const newAccessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken: newAccessToken,
      refreshTokenString: newRefreshTokenString,
    };
  }

  async logout(userId: string, sessionId: string) {
    await this.sessionService.revokeSession(userId, sessionId);
    this.realtimeService.disconnectSession(sessionId);
  }

  private async createSessionAndTokens(user: any, userAgent?: string, ipAddress?: string) {
    const userId = user._id.toString();
    
    // ENFORCE SINGLE ACTIVE SESSION: Revoke all existing sessions for this user
    await this.sessionService.revokeAllUserSessions(userId);
    this.realtimeService.disconnectUser(userId);

    const sessionId = crypto.randomUUID();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = await bcrypt.hash(rawToken, 10);

    const refreshTokenString = `${userId}.${sessionId}.${rawToken}`;

    const payload = {
      id: userId,
      email: user.email,
      username: user.username,
      phone: user.phone,
      sessionId,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    await this.sessionService.createSession(
      user._id.toString(),
      sessionId,
      {
        userId: user._id.toString(),
        sessionId,
        refreshTokenHash,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        userAgent,
        ipAddress,
      },
      7 * 24 * 60 * 60, // 7 days in seconds
    );

    return {
      message: 'Đăng nhập thành công',
      accessToken,
      refreshTokenString,
    };
  }
}
