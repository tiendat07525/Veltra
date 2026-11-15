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
import { CreateMessageDto, SignAttachmentDto } from './dto/create-message.dto';
import { Throttle } from '@nestjs/throttler';
import { AttachmentService } from './attachment.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/auth/authenticated-request';

@Controller('message')
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(
    private readonly messageService: MessageService,
    private readonly attachmentService: AttachmentService,
  ) {}

  // Signature for one direct browser → Cloudinary upload (security.md §6)
  @Post('attachments/sign')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async signAttachment(
    @Body() dto: SignAttachmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.attachmentService.sign(req.user._id.toString(), dto);
  }

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
