import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Message, MessageDocument } from './schemas/message.schema';
import { Connection, Model, Types } from 'mongoose';
import { CreateMessageDto } from './dto/create-message.dto';
import {
  Conversation,
  ConversationDocument,
  computeUnreadCounts,
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
    @InjectConnection()
    private readonly connection: Connection,
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

      const conversationObjectId = conversation._id;
      let message: MessageDocument;
      let updatedConversation: ConversationDocument;
      try {
        // One transaction: take the next seq, store the message, update the conversation.
        // Any failure (including a duplicate clientMsgId) rolls back the $inc, so seq has no gaps.
        // Concurrent sends conflict on the conversation document and are retried by Mongoose,
        // so lastMessage always ends up as the highest seq.
        ({ message, conversation: updatedConversation } =
          await this.connection.transaction(async (session) => {
            const counter = await this.conversationModel.findOneAndUpdate(
              { _id: conversationObjectId },
              { $inc: { lastSeq: 1 } },
              { new: true, session },
            );
            if (!counter) {
              throw new NotFoundException('Không tìm thấy hội thoại');
            }
            const seq = counter.lastSeq;

            const [created] = await this.messageModel.create(
              [
                {
                  conversationId: conversationObjectId,
                  senderId,
                  content,
                  seq,
                  ...(clientMsgId ? { clientMsgId } : {}),
                },
              ],
              { session },
            );

            const updated = await this.conversationModel.findOneAndUpdate(
              { _id: conversationObjectId },
              {
                $set: {
                  seenBy: [],
                  lastMessageAt: created.createdAt,
                  lastMessage: {
                    _id: created._id,
                    content: created.content,
                    senderId,
                    createdAt: created.createdAt,
                    seq,
                  },
                },
                // The sender has read their own message
                $max: { 'participants.$[me].lastReadSeq': seq },
              },
              {
                new: true,
                session,
                arrayFilters: [{ 'me.userId': senderId }],
              },
            );
            if (!updated) {
              throw new Error('Không thể cập nhật conversation');
            }
            return { message: created, conversation: updated };
          }));
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
      conversation = updatedConversation;

      // Emitted only after the transaction committed
      const messagePayload = this.toMessagePayload(message);

      const conversationPayload = {
        _id: conversation._id.toString(),
        lastMessage: conversation.lastMessage,
        lastMessageAt: conversation.lastMessageAt,
        lastSeq: conversation.lastSeq,
        unreadCounts: computeUnreadCounts(conversation),
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
      seq: raw.seq,
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
