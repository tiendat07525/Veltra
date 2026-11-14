import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Message, MessageDocument } from './schemas/message.schema';
import { Model, Types } from 'mongoose';
import { CreateMessageDto } from './dto/create-message.dto';
import {
  Conversation,
  ConversationDocument,
  getDirectKey,
} from 'src/conversation/schemas/conversation.schema';
import { RealtimeService } from 'src/realtime/realtime.service';
import { UsersService } from 'src/users/users.service';
import { isDuplicateKeyError } from '../common/mongo-errors';

@Injectable()
export class MessageService {
  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    private readonly realtimeService: RealtimeService,
    private readonly usersService: UsersService,
  ) {}

  async sendDirectMessage(dto: CreateMessageDto, userId: string) {
    try {
      const { conversationId, receiverId, content, clientMsgId } = dto;
      if (!Types.ObjectId.isValid(userId)) {
        throw new BadRequestException('User ID không hợp lệ');
      }
      const senderId = new Types.ObjectId(userId);

      let conversation: ConversationDocument | null = null;

      if (conversationId) {
        if (!Types.ObjectId.isValid(conversationId)) {
          throw new BadRequestException('Conversation ID không hợp lệ');
        }
        conversation = await this.conversationModel.findById(
          new Types.ObjectId(conversationId),
        );

        if (!conversation) {
          throw new NotFoundException('Không tìm thấy hội thoại');
        }

        const isParticipant = conversation.participants.some(
          (p) => p.userId?.toString() === senderId.toString(),
        );

        if (!isParticipant) {
          throw new BadRequestException('Bạn không có quyền gửi tin nhắn');
        }
      }

      if (!conversation) {
        if (!receiverId) {
          throw new BadRequestException(
            'Cần cung cấp conversationId hoặc receiverId',
          );
        }

        if (!Types.ObjectId.isValid(receiverId)) {
          throw new BadRequestException('ID người nhận không hợp lệ');
        }

        if (senderId.toString() === receiverId) {
          throw new BadRequestException(
            'Không thể gửi tin nhắn cho chính mình',
          );
        }

        const receiverExists = await this.usersService.findOne(receiverId);
        if (!receiverExists) {
          throw new NotFoundException('Người nhận không tồn tại');
        }

        const receiverObjectId = new Types.ObjectId(receiverId);
        const directKey = getDirectKey(senderId, receiverObjectId);

        // Find existing direct conversation (supporting both canonical directKey and legacy participant arrays)
        conversation = await this.conversationModel
          .findOne({
            type: 'direct',
            $or: [
              { directKey },
              {
                participants: {
                  $all: [
                    { $elemMatch: { userId: senderId } },
                    { $elemMatch: { userId: receiverObjectId } },
                  ],
                },
              },
            ],
          })
          .sort({ lastMessageAt: -1, createdAt: -1 });

        if (!conversation) {
          try {
            conversation = await this.conversationModel.create({
              type: 'direct',
              directKey,
              participants: [
                { userId: senderId, joinedAt: new Date() },
                { userId: receiverObjectId, joinedAt: new Date() },
              ],
              lastMessageAt: new Date(),
              unreadCounts: new Map(),
            });
          } catch (createErr: unknown) {
            // Concurrency handling: if a concurrent request created the direct conversation first,
            // MongoDB's unique index raises code 11000. Catch it and reuse the winning conversation.
            if (isDuplicateKeyError(createErr)) {
              conversation = await this.conversationModel.findOne({
                type: 'direct',
                $or: [
                  { directKey },
                  {
                    participants: {
                      $all: [
                        { $elemMatch: { userId: senderId } },
                        { $elemMatch: { userId: receiverObjectId } },
                      ],
                    },
                  },
                ],
              });

              if (!conversation) {
                throw createErr;
              }
            } else {
              throw createErr;
            }
          }
        }
      }

      // A retry of a send that was already stored returns the stored message:
      // no second message, no unread increment, no second emit
      if (clientMsgId) {
        const existing = await this.findByClientMsgId(
          conversation._id,
          senderId,
          clientMsgId,
        );
        if (existing) {
          return this.toSendResponse(existing);
        }
      }

      let message: MessageDocument;
      try {
        message = await this.messageModel.create({
          conversationId: conversation._id,
          senderId,
          content,
          ...(clientMsgId ? { clientMsgId } : {}),
        });
      } catch (createErr: unknown) {
        // Two copies of the same send passed the lookup together; the unique index let one in
        if (clientMsgId && isDuplicateKeyError(createErr)) {
          const winner = await this.findByClientMsgId(
            conversation._id,
            senderId,
            clientMsgId,
          );
          if (winner) {
            return this.toSendResponse(winner);
          }
        }
        throw createErr;
      }
      const updateInc: Record<string, number> = {};
      conversation.participants.forEach((p) => {
        const memberId = p.userId?.toString();
        if (memberId && memberId !== senderId.toString()) {
          updateInc[`unreadCounts.${memberId}`] = 1;
        }
      });

      const updatedConversation =
        await this.conversationModel.findByIdAndUpdate(
          conversation._id,
          {
            $set: {
              seenBy: [],
              lastMessageAt: message.createdAt,
              lastMessage: {
                _id: message._id,
                content: message.content,
                senderId: senderId,
                createdAt: message.createdAt,
              },
              [`unreadCounts.${senderId.toString()}`]: 0,
            },
            ...(Object.keys(updateInc).length > 0 ? { $inc: updateInc } : {}),
          },
          { new: true },
        );

      if (!updatedConversation) {
        throw new Error('Không thể cập nhật conversation');
      }
      conversation = updatedConversation;

      const messagePayload = this.toMessagePayload(message);

      const conversationPayload = {
        _id: conversation._id.toString(),
        lastMessage: conversation.lastMessage,
        lastMessageAt: conversation.lastMessageAt,
        unreadCounts: conversation.unreadCounts || {},
      };

      conversation.participants?.forEach((p) => {
        const memberId = p.userId?.toString();
        if (memberId) {
          this.realtimeService.emitToUser(memberId, 'message:new', {
            message: messagePayload,
            conversation: conversationPayload,
          });
        }
      });

      return this.toSendResponse(message);
    } catch (error) {
      console.error('Lỗi gửi tin nhắn trực tiếp: ', error);
      throw error;
    }
  }

  private findByClientMsgId(
    conversationId: Types.ObjectId,
    senderId: Types.ObjectId,
    clientMsgId: string,
  ) {
    return this.messageModel.findOne({ conversationId, senderId, clientMsgId });
  }

  // Shape shared by the REST response and the `message:new` event
  private toMessagePayload(message: MessageDocument) {
    const raw = message.toObject ? message.toObject() : message;
    return {
      _id: raw._id.toString(),
      conversationId: raw.conversationId.toString(),
      senderId: raw.senderId.toString(),
      content: raw.content,
      ...(raw.clientMsgId ? { clientMsgId: raw.clientMsgId } : {}),
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  private toSendResponse(message: MessageDocument) {
    return {
      success: true,
      message: 'Thành công',
      data: this.toMessagePayload(message),
    };
  }

  async revokeMessage(messageId: string, userId: string) {
    if (!Types.ObjectId.isValid(messageId)) {
      throw new BadRequestException('Message ID không hợp lệ');
    }

    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('User ID không hợp lệ');
    }

    const message = await this.messageModel.findById(
      new Types.ObjectId(messageId),
    );
    if (!message) {
      throw new NotFoundException('Tin nhắn không tồn tại');
    }

    if (message.senderId.toString() !== userId) {
      throw new BadRequestException('Bạn không có quyền thu hồi tin nhắn này');
    }

    if (message.isRevoked) {
      throw new BadRequestException('Tin nhắn này đã bị thu hồi');
    }

    const conversation = await this.conversationModel.findById(
      message.conversationId,
    );
    if (!conversation) {
      throw new NotFoundException('Hội thoại không tồn tại');
    }

    message.isRevoked = true;
    message.content = 'Tin nhắn đã thu hồi';
    await message.save();

    if (
      conversation.lastMessage &&
      conversation.lastMessage._id?.toString() === messageId
    ) {
      await this.conversationModel.findByIdAndUpdate(conversation._id, {
        $set: { 'lastMessage.content': 'Tin nhắn đã thu hồi' },
      });
    }

    const payload = {
      messageId: message._id.toString(),
      conversationId: conversation._id.toString(),
      content: message.content,
      isRevoked: true,
    };
    conversation.participants?.forEach((p) => {
      const memberId = p.userId?.toString();
      if (memberId) {
        this.realtimeService.emitToUser(memberId, 'message:revoked', payload);
      }
    });

    return { success: true, message: 'Thu hồi thành công', data: payload };
  }
}
