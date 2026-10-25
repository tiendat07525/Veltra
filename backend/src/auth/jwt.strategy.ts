import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { UsersService } from 'src/users/users.service';
import { SessionService } from './session.service';

export interface JwtPayload {
  id: string;
  sessionId: string;
  email?: string;
  username?: string;
  phone?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly sessionService: SessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload || !payload.id || !payload.sessionId) {
      throw new UnauthorizedException('Token payload không hợp lệ');
    }

    // Verify session existence in Redis (Fail-closed on Redis outage / missing session)
    try {
      const session = await this.sessionService.getSession(
        payload.id,
        payload.sessionId,
      );
      if (!session) {
        throw new UnauthorizedException(
          'Phiên đăng nhập không tồn tại hoặc đã bị thu hồi',
        );
      }

      if (
        session.expiresAt &&
        new Date(session.expiresAt).getTime() <= Date.now()
      ) {
        throw new UnauthorizedException('Phiên đăng nhập đã hết hạn');
      }
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(
        `Không thể xác thực phiên đăng nhập cho user ${payload.id}: ${error?.message || error}`,
      );
      // Fail closed: reject request if session validity cannot be established
      throw new UnauthorizedException('Không thể xác thực phiên đăng nhập');
    }

    const user = await this.usersService.findOne(payload.id);
    if (!user) {
      throw new UnauthorizedException('Người dùng không tồn tại');
    }
    return {
      id: user._id.toString(),
      _id: user._id.toString(),
      email: user.email,
      username: user.username,
      phone: user.phone,
      sessionId: payload.sessionId,
    };
  }
}
