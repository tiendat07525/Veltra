import { Body, Controller, Get, Param, Patch, Post, Query, Req} from '@nestjs/common';

import { ConversationService } from './conversation.service';

import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { AddParticipantDto } from './dto/add.participant.dto';

@Controller('conversation')
export class ConversationController {
  constructor(
    private readonly conversationsService: ConversationService,
  ) {}

  @Post()
  async create( @Body() dto: CreateConversationDto, @Req() req: any,) {
    const userId = req.user._id.toString();

    const conversation = await this.conversationsService.create(
        dto,
        userId,
      );

    return {
      conversation,
    };
  }

  @Get()
  async findAll(@Req() req: any) {
    const userId = req.user._id.toString();

    const conversations = await this.conversationsService.findAll(userId);

    return {
      conversations,
    };
  }

  @Get(':conversationId/messages')
  async getMessages(
    @Param('conversationId')
    conversationId: string,

    @Query('limit')
    limit?: string,

    @Query('cursor')
    cursor?: string,

    @Req() req?: any,
  ) {
    const userId = req.user._id.toString();

    return this.conversationsService.getMessages(
      conversationId,
      userId,
      Number(limit) || 50,
      cursor,
    );
  }

  @Patch(':conversationId/seen')
  async markAsSeen(
    @Param('conversationId')
    conversationId: string,

    @Req() req: any,
  ) {
    const userId = req.user._id.toString();

    return this.conversationsService.markAsSeen(conversationId, userId);
  }

  @Patch(':conversationId')
  async update(
    @Param('conversationId')
    conversationId: string,

    @Body() dto: UpdateConversationDto,

    @Req() req: any,
  ) {
    const userId = req.user._id.toString();

    return this.conversationsService.update(
      conversationId,
      dto,
      userId,
    );
  }

  @Post(':conversationId/participants')
  async addParticipants(
    @Param('conversationId')
    conversationId: string,

    @Body() dto: AddParticipantDto,

    @Req() req: any,
  ) {
    const userId = req.user._id.toString();

    return this.conversationsService.addParticipants(
      conversationId,
      dto,
      userId,
    );
  }
}