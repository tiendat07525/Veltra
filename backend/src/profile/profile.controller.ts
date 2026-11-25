import {
  Body,
  Controller,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/auth/authenticated-request';
import { UpdateUserDto } from 'src/users/dto/update-user.dto';
import { ProfileService } from './profile.service';
import { SetAvatarDto, SignAvatarDto } from './dto/avatar.dto';

// Changes to one's own profile (reads are in UsersController)
@Controller('users')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  // Signature for one direct browser → Cloudinary upload (security.md §6)
  @Post('avatar/sign')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  signAvatar(@Req() req: AuthenticatedRequest, @Body() dto: SignAvatarDto) {
    return this.profileService.signAvatar(req.user.id, dto);
  }

  @Put('avatar')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  setAvatar(@Req() req: AuthenticatedRequest, @Body() dto: SetAvatarDto) {
    return this.profileService.setAvatar(req.user.id, dto);
  }

  @Patch('profile')
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateUserDto,
  ) {
    return this.profileService.update(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.profileService.update(id, dto, req.user.id);
  }
}
