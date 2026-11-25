import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  Conversation,
  ConversationDocument,
  computeSeenBy,
  computeUnreadCounts,
  getDirectKey,
} from './schemas/conversation.schema';
import { Model, Types } from 'mongoose';
import { CreateConversationDto } from './dto/create-conversation.dto';
import {
  Message,
  MessageDocument,
  toAttachmentPayload,
} from '../messages/schemas/message.schema';
import { isDuplicateKeyError } from '../common/mongo-errors';
import { User, UserDocument } from '../users/schemas/user.schema';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationService } from '../notification/notification.service';
import {
  ConversationGroupService,
  MAX_GROUP_MEMBERS,
} from './conversation-group.service';
import {
  conversationUserPopulate,
  formatConversation,
  formatLeanConversation,
} from './conversation.format';

/**
 * Conversations as a whole: create (direct / group), list, history, seen, delete.
 * Changes to an existing group live in ConversationGroupService.
 */
@Injectable()
export class ConversationService {
  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly realtimeService: RealtimeService,
    private readonly groupService: ConversationGroupService,
    private readonly notificationService: NotificationService,
  ) {}

  async create(dto: CreateConversationDto, userId: string) {
    try {
      if (!Types.ObjectId.isValid(userId)) {
        throw new BadRequestException('User ID không hợp lệ');
      }
      const currentUserId = new Types.ObjectId(userId);
      if (dto.type === 'direct') {
        return this.createDirectConversation(currentUserId, dto.participants);
      }

      if (dto.type === 'group') {
        return this.createGroupConversation(
          currentUserId,
          dto.participants,
          dto.groupName!,
        );
      }

      throw new BadRequestException('Không hợp lệ');
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      console.error('Tạo hội thoại thất bại');
      throw new InternalServerErrorException('Lỗi hệ thống');
    }
  }

  /**
   * The one direct conversation between two different users, created if missing.
   * 404 when the other user does not exist. Returns the unpopulated document.
   * Used by POST /conversation and by sending to a receiverId.
   */
  async findOrCreateDirect(userId: Types.ObjectId, otherId: Types.ObjectId) {
    if (!(await this.userModel.exists({ _id: otherId }))) {
      throw new NotFoundException('Người nhận không tồn tại');
    }

    // Canonical key guarantees (A, B) and (B, A) evaluate to identical keys (minId:maxId)
    const directKey = getDirectKey(userId, otherId);
    // Supports both the canonical directKey and legacy conversations without one
    const filter = {
      type: 'direct' as const,
      $or: [
        { directKey },
        {
          participants: {
            $all: [
              { $elemMatch: { userId } },
              { $elemMatch: { userId: otherId } },
            ],
          },
        },
      ],
    };

    const existing = await this.conversationModel
      .findOne(filter)
      .sort({ lastMessageAt: -1, createdAt: -1 });
    if (existing) {
      return existing;
    }

    try {
      return await this.conversationModel.create({
        type: 'direct',
        directKey,
        participants: [
          { userId, joinedAt: new Date() },
          { userId: otherId, joinedAt: new Date() },
        ],
        lastMessageAt: new Date(),
      });
    } catch (createErr: unknown) {
      // Concurrency handling: if a concurrent request created the direct conversation first,
      // MongoDB's unique index raises code 11000. Catch it and return the winning conversation.
      if (isDuplicateKeyError(createErr)) {
        const winner = await this.conversationModel.findOne(filter);
        if (winner) {
          return winner;
        }
      }
      throw createErr;
    }
  }

  private async createDirectConversation(
    userId: Types.ObjectId,
    participants: string[],
  ) {
    if (participants.length !== 1) {
      throw new BadRequestException('Hội thoại trực tiếp cần 2 người');
    }

    if (!participants[0] || !Types.ObjectId.isValid(participants[0])) {
      throw new BadRequestException('User ID không hợp lệ');
    }

    const participantId = new Types.ObjectId(participants[0]);

    if (userId.equals(participantId)) {
      throw new BadRequestException(
        'Không thể tự tạo hội thoại với chính mình',
      );
    }

    const conversation = await this.findOrCreateDirect(userId, participantId);
    await conversation.populate(conversationUserPopulate());
    return formatConversation(conversation);
  }

  private async createGroupConversation(
    userId: Types.ObjectId,
    participants: string[],
    groupName: string,
  ) {
    if (!groupName?.trim()) {
      throw new BadRequestException('Tên Group không được để trống');
    }

    for (const p of participants) {
      if (!p || !Types.ObjectId.isValid(p)) {
        throw new BadRequestException('User ID không hợp lệ');
      }
    }

    // Invited users: duplicates and the creator removed
    const invitedIds = [...new Set(participants)]
      .filter((id) => id !== userId.toString())
      .map((id) => new Types.ObjectId(id));

    if (invitedIds.length + 1 > MAX_GROUP_MEMBERS) {
      throw new BadRequestException(
        `Nhóm tối đa ${MAX_GROUP_MEMBERS} thành viên`,
      );
    }

    await this.groupService.assertCanAddToGroup(userId, invitedIds);

    const conversationParticipants = [userId, ...invitedIds].map((id) => ({
      userId: id,
      joinedAt: new Date(),
    }));

    const conversation = await this.conversationModel.create({
      type: 'group',
      participants: conversationParticipants,
      group: {
        name: groupName.trim(),
        createdBy: userId,
      },

      lastMessageAt: new Date(),
    });

    await conversation.populate(conversationUserPopulate());
    const formatted = formatConversation(conversation);

    // Members see the new group right away (the creator's other tabs too)
    for (const memberId of [userId, ...invitedIds]) {
      this.realtimeService.emitToUser(
        memberId.toString(),
        'conversation:updated',
        { conversation: formatted },
      );
    }
    await this.notificationService.notify(invitedIds, {
      type: 'group_added',
      actorId: userId,
      conversationId: conversation._id,
      groupName: conversation.group?.name,
    });

    return formatted;
  }

  async findAll(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('User ID không hợp lệ');
    }

    const conversations = await this.conversationModel
      .find({ 'participants.userId': new Types.ObjectId(userId) })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .populate(conversationUserPopulate())
      .lean();

    return conversations.map((conversation) =>
      formatLeanConversation(conversation),
    );
  }

  async getMessages(
    conversationId: string,
    userId: string,
    limit = 50,
    beforeSeq?: number,
  ) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new BadRequestException('Conversation ID không hợp lệ');
    }

    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('User ID không hợp lệ');
    }

    const conversation = await this.conversationModel.findOne({
      _id: new Types.ObjectId(conversationId),
      'participants.userId': new Types.ObjectId(userId),
    });

    if (!conversation) {
      throw new NotFoundException(
        'Conversation không tồn tại hoặc bạn không có quyền truy cập',
      );
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

    const query: { conversationId: Types.ObjectId; seq?: { $lt: number } } = {
      conversationId: new Types.ObjectId(conversationId),
    };

    if (beforeSeq !== undefined) {
      if (!Number.isInteger(beforeSeq) || beforeSeq < 1) {
        throw new BadRequestException('beforeSeq không hợp lệ');
      }
      query.seq = { $lt: beforeSeq };
    }

    // Newest first so limit takes the latest page; seq is the only order key
    const rawMessages = await this.messageModel
      .find(query)
      .sort({ seq: -1 })
      .limit(safeLimit + 1)
      .lean();

    const messages = rawMessages.map((msg) => ({
      ...msg,
      _id: msg._id?.toString(),
      conversationId: msg.conversationId?.toString(),
      senderId: msg.senderId?.toString(),
      // publicId / resourceType stay on the server
      attachments: msg.attachments?.length
        ? msg.attachments.map(toAttachmentPayload)
        : undefined,
    }));

    // The extra row only signals that older messages exist; the client pages
    // on with beforeSeq = seq of the oldest returned message
    const hasMore = messages.length > safeLimit;
    if (hasMore) {
      messages.pop();
    }
    messages.reverse();

    return { messages, hasMore };
  }

  async markAsSeen(conversationId: string, userId: string, upToSeq?: number) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new BadRequestException('Conversation ID không hợp lệ');
    }

    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('User ID không hợp lệ');
    }

    const userObjectId = new Types.ObjectId(userId);

    const conversation = await this.conversationModel
      .findOne({
        _id: new Types.ObjectId(conversationId),
        'participants.userId': userObjectId,
      })
      .lean();

    if (!conversation) {
      throw new NotFoundException(
        'Conversation không tồn tại hoặc bạn không có quyền',
      );
    }

    if (upToSeq !== undefined && (!Number.isInteger(upToSeq) || upToSeq < 0)) {
      throw new BadRequestException('upToSeq không hợp lệ');
    }

    const lastMessage = conversation.lastMessage;

    if (!lastMessage) {
      return {
        message: 'Không có tin nhắn cần đánh dấu đã xem',
      };
    }

    if (lastMessage.senderId?.toString() === userId) {
      return {
        message: 'Người gửi không cần đánh dấu đã xem',
      };
    }

    // Read up to what the client has displayed, never past the newest message.
    // Clients that send no upToSeq (loaded before this change) read everything.
    const lastSeq = conversation.lastSeq ?? 0;
    const readTo = Math.min(upToSeq ?? lastSeq, lastSeq);

    const updated = await this.conversationModel.findOneAndUpdate(
      { _id: conversation._id, 'participants.userId': userObjectId },
      {
        // $max: lastReadSeq never goes back (e.g. a stale request arriving late)
        $max: {
          'participants.$.lastReadSeq': readTo,
        },
      },
      {
        new: true,
      },
    );

    const me = updated?.participants.find(
      (p) => p.userId?.toString() === userId,
    );

    return {
      message: 'Đã đánh dấu là đã xem',

      seenBy: updated ? computeSeenBy(updated) : [],

      myUnreadCount: updated ? (computeUnreadCounts(updated)[userId] ?? 0) : 0,

      lastSeq: updated?.lastSeq ?? lastSeq,

      lastReadSeq: me?.lastReadSeq ?? 0,

      lastMessage: updated?.lastMessage || null,
    };
  }

  async remove(conversationId: string, userId: string) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new BadRequestException('Conversation ID không hợp lệ');
    }

    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('User ID không hợp lệ');
    }

    const conversation = await this.conversationModel.findOne({
      _id: new Types.ObjectId(conversationId),
      'participants.userId': new Types.ObjectId(userId),
    });

    if (!conversation) {
      throw new NotFoundException(
        'Conversation không tồn tại hoặc bạn không có quyền',
      );
    }

    if (
      conversation.type === 'group' &&
      conversation.group?.createdBy?.toString() !== userId
    ) {
      throw new ForbiddenException('Chỉ trưởng nhóm mới có quyền xóa nhóm');
    }

    await this.conversationModel.findByIdAndDelete(conversationId);
    await this.messageModel.deleteMany({
      conversationId: new Types.ObjectId(conversationId),
    });

    // Every member drops it from their list (members taken from the stored conversation)
    for (const participant of conversation.participants) {
      const memberId = participant.userId?.toString();
      if (memberId) {
        this.realtimeService.emitToUser(memberId, 'conversation:removed', {
          conversationId: conversation._id.toString(),
        });
      }
    }

    return { message: 'Đã xóa cuộc trò chuyện' };
  }
}
