import {Body,Controller, Post, Req, UseGuards,} from '@nestjs/common';
import { MessageService } from './message.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('message')
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(
    private readonly messageService: MessageService,
  ) {}

  @Post('direct')
  async sendDirectMessage(@Body() dto: CreateMessageDto, @Req() req: any) {
    return this.messageService.sendDirectMessage(dto, req.user._id);
  }
}