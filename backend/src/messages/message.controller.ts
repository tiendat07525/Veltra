import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  Patch,
  Param,
} from '@nestjs/common';
import { MessageService } from './message.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/auth/authenticated-request';

@Controller('message')
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post('direct')
  async sendDirectMessage(
    @Body() dto: CreateMessageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.messageService.sendDirectMessage(dto, req.user._id);
  }

  @Patch(':messageId/revoke')
  async revokeMessage(
    @Param('messageId') messageId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.messageService.revokeMessage(
      messageId,
      req.user._id.toString(),
    );
  }
}
