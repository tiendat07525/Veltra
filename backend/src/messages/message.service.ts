import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import {
  Attachment,
  Message,
  MessageDocument,
  toMessagePayload,
} from './schemas/message.schema';
import { Connection, Model, Types } from 'mongoose';
import { CreateMessageDto } from './dto/create-message.dto';
import {
  Conversation,
  ConversationDocument,
  computeUnreadCounts,
} from 'src/conversation/schemas/conversation.schema';
import { RealtimeService } from 'src/realtime/realtime.service';
import { ConversationService } from 'src/conversation/conversation.service';
import { isDuplicateKeyError } from '../common/mongo-errors';
import { AttachmentService } from './attachment.service';
import { attachmentPreview } from './attachment.rules';

// What one send stores (content already trimmed, files already checked)
interface NewMessage {
  senderId: Types.ObjectId;
  content?: string;
  attachments: Attachment[];
  clientMsgId?: string;
}

@Injectable()
export class MessageService {
  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    private readonly realtimeService: RealtimeService,
    private readonly conversationService: ConversationService,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly attachmentService: AttachmentService,
  ) {}

  async sendDirectMessage(dto: CreateMessageDto, userId: string) {
    try {
      const { clientMsgId } = dto;
      const content = dto.content?.trim() || undefined;
      const attachmentRefs = dto.attachments ?? [];
      if (!content && attachmentRefs.length === 0) {
        throw new BadRequestException('Tin nhắn không được để trống');
      }
      // Uploads are signed per conversation, so files need an existing one
      if (attachmentRefs.length > 0 && !dto.conversationId) {
        throw new BadRequestException('Cần conversationId để gửi file');
      }
      if (!Types.ObjectId.isValid(userId)) {
        throw new BadRequestException('User ID không hợp lệ');
      }
      const senderId = new Types.ObjectId(userId);

      const conversation = await this.resolveConversation(dto, senderId);

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

      // Network calls to Cloudinary stay outside the transaction
      const attachments = await this.attachmentService.resolve(
        senderId.toString(),
        conversation._id.toString(),
        attachmentRefs,
      );

      let stored: {
        message: MessageDocument;
        conversation: ConversationDocument;
      };
      try {
        stored = await this.persistMessage(conversation._id, {
          senderId,
          content,
          attachments,
          clientMsgId,
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

      // Emitted only after the transaction committed
      this.emitNewMessage(stored.message, stored.conversation);

      return this.toSendResponse(stored.message);
    } catch (error) {
      console.error('Lỗi gửi tin nhắn trực tiếp: ', error);
      throw error;
    }
  }

  // The conversation to send into: the given one (sender must be a member),
  // or the direct conversation with receiverId (created if missing)
  private async resolveConversation(
    dto: CreateMessageDto,
    senderId: Types.ObjectId,
  ) {
    const { conversationId, receiverId } = dto;

    if (conversationId) {
      if (!Types.ObjectId.isValid(conversationId)) {
        throw new BadRequestException('Conversation ID không hợp lệ');
      }
      const conversation = await this.conversationModel.findById(
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
      return conversation;
    }

    if (!receiverId) {
      throw new BadRequestException(
        'Cần cung cấp conversationId hoặc receiverId',
      );
    }

    if (!Types.ObjectId.isValid(receiverId)) {
      throw new BadRequestException('ID người nhận không hợp lệ');
    }

    if (senderId.toString() === receiverId) {
      throw new BadRequestException('Không thể gửi tin nhắn cho chính mình');
    }

    // 404 "Người nhận không tồn tại" when the receiver does not exist
    return this.conversationService.findOrCreateDirect(
      senderId,
      new Types.ObjectId(receiverId),
    );
  }

  /**
   * One transaction: take the next seq, store the message, update the conversation.
   * Any failure (including a duplicate clientMsgId) rolls back the $inc, so seq has no gaps.
   * Concurrent sends conflict on the conversation document and are retried by Mongoose,
   * so lastMessage always ends up as the highest seq.
   */
  private persistMessage(conversationId: Types.ObjectId, input: NewMessage) {
    const { senderId, content, attachments, clientMsgId } = input;

    return this.connection.transaction(async (session) => {
      const counter = await this.conversationModel.findOneAndUpdate(
        // Membership is part of the write: the sender may have been removed since
        // resolveConversation (checking files takes seconds)
        { _id: conversationId, 'participants.userId': senderId },
        { $inc: { lastSeq: 1 } },
        { new: true, session },
      );
      if (!counter) {
        const exists = await this.conversationModel
          .exists({ _id: conversationId })
          .session(session);
        throw exists
          ? new BadRequestException('Bạn không có quyền gửi tin nhắn')
          : new NotFoundException('Không tìm thấy hội thoại');
      }
      const seq = counter.lastSeq;

      const [created] = await this.messageModel.create(
        [
          {
            conversationId,
            senderId,
            ...(content ? { content } : {}),
            ...(attachments.length ? { attachments } : {}),
            seq,
            ...(clientMsgId ? { clientMsgId } : {}),
          },
        ],
        { session },
      );

      const updated = await this.conversationModel.findOneAndUpdate(
        { _id: conversationId },
        {
          $set: {
            seenBy: [],
            lastMessageAt: created.createdAt,
            lastMessage: {
              _id: created._id,
              content: created.content || attachmentPreview(attachments),
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
    });
  }

  // message:new to every member of the stored conversation
  private emitNewMessage(
    message: MessageDocument,
    conversation: ConversationDocument,
  ) {
    const messagePayload = toMessagePayload(message);

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
  }

  private findByClientMsgId(
    conversationId: Types.ObjectId,
    senderId: Types.ObjectId,
    clientMsgId: string,
  ) {
    return this.messageModel.findOne({ conversationId, senderId, clientMsgId });
  }

  private toSendResponse(message: MessageDocument) {
    return {
      success: true,
      message: 'Thành công',
      data: toMessagePayload(message),
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

    if (message.type === 'system') {
      throw new BadRequestException('Không thể thu hồi tin hệ thống');
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

    const removedFiles = (message.attachments ?? []).map((a) => ({
      publicId: a.publicId,
      resourceType: a.resourceType,
    }));
    message.isRevoked = true;
    message.content = 'Tin nhắn đã thu hồi';
    message.attachments = undefined;
    await message.save();
    // Files are deleted only after the revoke is stored
    this.attachmentService.destroy(removedFiles);

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
