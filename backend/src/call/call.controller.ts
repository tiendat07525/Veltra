import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { CallService } from './call.service';
import { StartCallDto } from './dto/start-call.dto';

@Controller('call')
@UseGuards(JwtAuthGuard)
export class CallController {
  constructor(private readonly callService: CallService) {}

  // Ring the other member of a direct conversation (friends only)
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  start(@Body() dto: StartCallDto, @Req() req: AuthenticatedRequest) {
    return this.callService.start(req.user._id.toString(), dto);
  }

  @Get('active')
  getActive(@Req() req: AuthenticatedRequest) {
    return this.callService.getActive(req.user._id.toString());
  }

  @Post(':callId/accept')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  accept(@Param('callId') callId: string, @Req() req: AuthenticatedRequest) {
    return this.callService.accept(req.user._id.toString(), callId);
  }

  @Post(':callId/decline')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  decline(@Param('callId') callId: string, @Req() req: AuthenticatedRequest) {
    return this.callService.decline(req.user._id.toString(), callId);
  }

  @Post(':callId/end')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  end(@Param('callId') callId: string, @Req() req: AuthenticatedRequest) {
    return this.callService.end(req.user._id.toString(), callId);
  }
}
