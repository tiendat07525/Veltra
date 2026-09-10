import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { Model, Types } from 'mongoose';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { Message, MessageDocument } from '../messages/schemas/message.schema';
import { AddParticipantDto } from './dto/add.participant.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';


@Injectable()
export class ConversationService {
    constructor(
        @InjectModel(Conversation.name)
        private readonly conversationModel: Model<ConversationDocument>,
        @InjectModel(Message.name)
        private readonly messageModel: Model<MessageDocument>,
    ) { }

    async create(dto: CreateConversationDto, userId: string) {
        try {
            const currentUserId = new Types.ObjectId(userId);
            if(dto.type === 'direct'){
                return this.createDirectConversation(currentUserId, dto.participants)
            }

            if(dto.type === 'group'){
                return this.createGroupConversation(currentUserId, dto.participants, dto.groupName!)
            }

            throw new BadRequestException('Không hợp lệ')

        } catch (error) {
            if(error instanceof BadRequestException || error instanceof NotFoundException){
                throw error;
            }
            console.error('Tạo hội thoại thất bại')
            throw new InternalServerErrorException('Lỗi hệ thống')
        }
    }

    private async createDirectConversation(userId: Types.ObjectId,participants: string[]){
        if(participants.length !== 1){
            throw new BadRequestException('Hội thoại trực tiếp cần 2 người')
        }

        const participantId = new Types.ObjectId(participants[0])

        if(userId.equals(participantId)){
            throw new BadRequestException('Không thể tự tạo hội thoại với chính mình')
        }

        let conversation = await this.conversationModel.findOne({
            type: 'direct',
            participants: {
                $all: [
                    {elemMatch: {userId}},
                    {elemMatch: {userId: participantId}}
                ]
            }
        }).populate([
            {
                path: 'participants.userId',
                select: 'displayName avatar'
            },
            {
                path: 'seenBy',
                select: 'displayName avatar'
            },
            {
                path: 'lastMessage.senderId',
                select: 'displayName avatar'
            }
        ])

        if(!conversation){
            conversation = await this.conversationModel.create({
                type: 'direct',
                participants: [
                    {
                        userId,
                        joinedAt: new Date()
                    },
                    {
                        userId: participantId,
                        joinedAt: new Date()
                    }
                ],

                lastMessageAt: new Date()
            });

            await conversation.populate([
                {
                    path: 'participants.userId',
                    select: 'displayName avatar'
                },
                {
                    path: 'seenBy',
                    select: 'displayName avatar'
                },
                {
                    path: 'lastMessage.senderId',
                    select: 'displayName avatar'
                }
            ])
        }
        return this.formatConversation(conversation)
    }

    private async createGroupConversation(userId: Types.ObjectId,participants: string[], groupName: string){
        if(!groupName?.trim()){
            throw new BadRequestException('Tên Group không được để trống')
        }

        const participantIds = [userId.toString(), ...participants];

        const uniqueParticipantIds = [...new Set(participantIds)]

        const conversationParticipants = uniqueParticipantIds.map((id) => ({
            userId: new Types.ObjectId(id),
            joinedAt: new Date(),
        }));

        let conversation = await this.conversationModel.create({
            type: 'group',
            participants: conversationParticipants,
            group: {
                name: groupName.trim(),
                createdBy: userId,
            },

            lastMessageAt: new Date()
        })

        await conversation.populate([
            {
                path: 'participants.userId',
                select: 'displayName avatar'
            },
            {
                path: 'seenBy',
                select: 'displayName avatar'
            },
            {
                path: 'lastMessage.senderId',
                select: 'displayName avatar'
            }
        ])

        return this.formatConversation(conversation)
    }

    async findAll(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('User ID không hợp lệ');
    }

    const conversations = await this.conversationModel.find({'participants.userId': new Types.ObjectId(userId)})
        .sort({lastMessageAt: -1, updatedAt: -1})
        .populate({
          path: 'participants.userId',
          select: 'displayName avatarUrl',
        })
        .populate({
          path: 'lastMessage.senderId',
          select: 'displayName avatarUrl',
        })
        .populate({
          path: 'seenBy',
          select: 'displayName avatarUrl',
        }).lean();

    return conversations.map((conversation) => this.formatLeanConversation(conversation));
  }

    async getMessages(
        conversationId: string,
        userId: string,
        limit = 50,
        cursor?: string,
    ) {
        if (!Types.ObjectId.isValid(conversationId)) {
        throw new BadRequestException('Conversation ID không hợp lệ');
        }

        const conversation =
        await this.conversationModel.findOne({
            _id: new Types.ObjectId(conversationId),
            'participants.userId':
            new Types.ObjectId(userId),
        });

        if (!conversation) {
        throw new NotFoundException('Conversation không tồn tại hoặc bạn không có quyền truy cập');
        }

        const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

        const query: any = { conversationId: new Types.ObjectId(conversationId) };

        if (cursor) {
        const cursorDate = new Date(cursor);

        if (isNaN(cursorDate.getTime())) {
            throw new BadRequestException('Cursor không hợp lệ');
        }

        query.createdAt = { $lt: cursorDate };
        }

        let messages = await this.messageModel.find(query).sort({createdAt: -1}).limit(safeLimit + 1).lean();

        let nextCursor: string | null = null;

        if (messages.length > safeLimit) {
            const nextMessage = messages[messages.length - 1];
            nextCursor = nextMessage.createdAt.toISOString();
            messages.pop();
        }
        messages.reverse();

        return { messages, nextCursor };
    };

    async markAsSeen(conversationId: string, userId: string) {
        if (!Types.ObjectId.isValid(conversationId)) {
            throw new BadRequestException('Conversation ID không hợp lệ');
        }

        const userObjectId = new Types.ObjectId(userId);

        const conversation = await this.conversationModel
            .findOne({
                _id: new Types.ObjectId(conversationId),
                'participants.userId': userObjectId,
            })
            .lean();

        if (!conversation) {
            throw new NotFoundException('Conversation không tồn tại hoặc bạn không có quyền');
        }

        const lastMessage = conversation.lastMessage;

        if (!lastMessage) {
            return {
                message:'Không có tin nhắn cần đánh dấu đã xem',
            };
        }

        if (lastMessage.senderId?.toString() === userId) {
            return {
                message:'Người gửi không cần đánh dấu đã xem'
            };
        }

        const updated = await this.conversationModel.findByIdAndUpdate(
            conversationId,
            {
            $addToSet: {
                seenBy: userObjectId,
            },

            $set: {
                [`unreadCounts.${userId}`]: 0,
            },
            },
            {
            new: true,
            },
        );

        return {
        message: 'Đã đánh dấu là đã xem',

        seenBy: updated?.seenBy || [],

        myUnreadCount:
            updated?.unreadCounts?.get(userId) || 0,

        lastMessage:
            updated?.lastMessage || null,
        };
    }

    async update(
        conversationId: string,
        dto: UpdateConversationDto,
        userId: string,
    ) {
        const conversation =
        await this.conversationModel.findOne({
            _id: conversationId,
            type: 'group',
            'participants.userId':
            new Types.ObjectId(userId),
        });

        if (!conversation) {
        throw new NotFoundException(
            'Group không tồn tại hoặc bạn không có quyền',
        );
        }

        conversation.group!.name =
        dto.groupName.trim();

        await conversation.save();

        return this.formatConversation(
        conversation,
        );
    }

    async addParticipants(
        conversationId: string,
        dto: AddParticipantDto,
        userId: string,
    ) {
        const conversation =
        await this.conversationModel.findOne({
            _id: conversationId,
            type: 'group',
            'participants.userId':
            new Types.ObjectId(userId),
        });

        if (!conversation) {
        throw new NotFoundException(
            'Group không tồn tại hoặc bạn không có quyền',
        );
        }

        const existingIds =
        conversation.participants.map(
            (participant) =>
            participant.userId.toString(),
        );

        for (const id of dto.userIds) {
        if (!existingIds.includes(id)) {
            conversation.participants.push({
            userId: new Types.ObjectId(id),
            joinedAt: new Date(),
            } as any);
        }
        }

        await conversation.save();

        return this.formatConversation(
        conversation,
        );
    }

    async getUserConversationsForSocketIO(
        userId: string,
    ): Promise<string[]> {
        if (!Types.ObjectId.isValid(userId)) {
        return [];
        }

        const conversations =
        await this.conversationModel.find(
            {
            'participants.userId':
                new Types.ObjectId(userId),
            },
            {
            _id: 1,
            },
        );

        return conversations.map((conversation) =>
        conversation._id.toString(),
        );
    }

    private formatConversation(conversation: ConversationDocument) {

        const object = conversation.toObject();

        const participants = (conversation.participants || []).map(
            (participant: any) => ({
                _id: participant.userId?._id,
                displayName:participant.userId?.displayName,
                avatarUrl:participant.userId?.avatarUrl ?? null,
                joinedAt:participant.joinedAt,
            }),
        );

        return {
            ...object,
            participants,
            unreadCounts:conversation.unreadCounts || {},
        };
    }

    private formatLeanConversation(conversation: any,) {
        const participants = (conversation.participants || []).map(
            (participant: any) => ({
                _id: participant.userId?._id,
                displayName:participant.userId?.displayName,
                avatarUrl:participant.userId?.avatarUrl ?? null,
                joinedAt:participant.joinedAt,
            }),
        );

        return {
            ...conversation,
            participants,
            unreadCounts:conversation.unreadCounts || {},
        };
    }
}
