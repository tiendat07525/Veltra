import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Delete,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/auth/authenticated-request';

import { ConversationService } from './conversation.service';

import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { AddParticipantDto } from './dto/add-participant.dto';

@Controller('conversation')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(private readonly conversationsService: ConversationService) {}

  @Post()
  async create(
    @Body() dto: CreateConversationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user._id.toString();

    const conversation = await this.conversationsService.create(dto, userId);

    return {
      conversation,
    };
  }

  @Get()
  async findAll(@Req() req: AuthenticatedRequest) {
    const userId = req.user._id.toString();

    const conversations = await this.conversationsService.findAll(userId);

    return {
      conversations,
    };
  }

  @Get(':conversationId/messages')
  async getMessages(
    @Param('conversationId') conversationId: string,
    @Query('limit') limit: string | undefined,
    // Non-integer values are rejected with 400 by the pipe
    @Query('beforeSeq', new ParseIntPipe({ optional: true }))
    beforeSeq: number | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user._id.toString();

    return this.conversationsService.getMessages(
      conversationId,
      userId,
      Number(limit) || 50,
      beforeSeq,
    );
  }

  @Patch(':conversationId/seen')
  async markAsSeen(
    @Param('conversationId') conversationId: string,
    // Highest seq the client has displayed; optional for clients loaded before seq existed
    @Body('upToSeq', new ParseIntPipe({ optional: true }))
    upToSeq: number | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user._id.toString();

    return this.conversationsService.markAsSeen(
      conversationId,
      userId,
      upToSeq,
    );
  }

  @Patch(':conversationId')
  async update(
    @Param('conversationId') conversationId: string,
    @Body() dto: UpdateConversationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user._id.toString();

    return this.conversationsService.update(conversationId, dto, userId);
  }

  @Post(':conversationId/participants')
  async addParticipants(
    @Param('conversationId') conversationId: string,
    @Body() dto: AddParticipantDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user._id.toString();

    return this.conversationsService.addParticipants(
      conversationId,
      dto,
      userId,
    );
  }

  @Delete(':conversationId')
  async remove(
    @Param('conversationId') conversationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user._id.toString();

    return this.conversationsService.remove(conversationId, userId);
  }
}
