import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../jwt-auth.guard';
import type { AuthenticatedRequest } from '../authenticated-request';
import { TwoFactorService } from './two-factor.service';
import {
  TwoFactorCodeDto,
  TwoFactorPasswordCodeDto,
  TwoFactorPasswordDto,
} from './dto/two-factor.dto';

const SENSITIVE = { default: { limit: 5, ttl: 60000 } };

@Controller('auth/2fa')
@UseGuards(JwtAuthGuard)
export class TwoFactorController {
  constructor(private readonly twoFactorService: TwoFactorService) {}

  @Get()
  status(@Req() req: AuthenticatedRequest) {
    return this.twoFactorService.status(req.user.id);
  }

  @Post('setup')
  @HttpCode(HttpStatus.OK)
  @Throttle(SENSITIVE)
  setup(@Body() dto: TwoFactorPasswordDto, @Req() req: AuthenticatedRequest) {
    return this.twoFactorService.setup(req.user.id, dto.currentPassword);
  }

  @Post('enable')
  @HttpCode(HttpStatus.OK)
  @Throttle(SENSITIVE)
  enable(@Body() dto: TwoFactorCodeDto, @Req() req: AuthenticatedRequest) {
    return this.twoFactorService.enable(req.user.id, dto.code);
  }

  @Post('disable')
  @HttpCode(HttpStatus.OK)
  @Throttle(SENSITIVE)
  disable(
    @Body() dto: TwoFactorPasswordCodeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.twoFactorService.disable(
      req.user.id,
      dto.currentPassword,
      dto.code,
    );
  }

  @Post('backup-codes')
  @HttpCode(HttpStatus.OK)
  @Throttle(SENSITIVE)
  regenerateBackupCodes(
    @Body() dto: TwoFactorPasswordCodeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.twoFactorService.regenerateBackupCodes(
      req.user.id,
      dto.currentPassword,
      dto.code,
    );
  }
}
