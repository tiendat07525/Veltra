import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/auth/authenticated-request';

// Reads only; changes to one's own profile are in ProfileController
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly userService: UsersService) {}

  @Get('profile')
  async getProfile(@Req() req: AuthenticatedRequest) {
    return this.userService.findOne(req.user.id);
  }

  @Get()
  findAll(@Query() query?: QueryUsersDto) {
    return this.userService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findPublicProfile(id);
  }
}
