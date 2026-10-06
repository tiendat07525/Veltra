import { Body, Controller, Post, Req, Res, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;

    const { message, accessToken, refreshTokenString } = await this.authService.login(
      loginDto,
      userAgent,
      ipAddress,
    );

    this.setRefreshCookie(res, refreshTokenString);

    return { message, accessToken };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshTokenString = req.cookies?.refreshToken;
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;

    const { accessToken, refreshTokenString: newRefreshToken } = await this.authService.refresh(
      refreshTokenString,
      userAgent,
      ipAddress,
    );

    this.setRefreshCookie(res, newRefreshToken);

    return { accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const userId = req.user.id;
    const sessionId = req.user.sessionId;

    if (userId && sessionId) {
      await this.authService.logout(userId, sessionId);
    }

    res.clearCookie('refreshToken', this.getCookieOptions());
    return { message: 'Đăng xuất thành công' };
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie('refreshToken', token, this.getCookieOptions());
  }

  private getCookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    };
  }
}
