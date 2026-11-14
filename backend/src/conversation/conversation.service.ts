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
  computeUnreadCounts,
  getDirectKey,
  Participant,
} from './schemas/conversation.schema';
import { Model, Types } from 'mongoose';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { Message, MessageDocument } from '../messages/schemas/message.schema';
import { AddParticipantDto } from './dto/add-participant.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { isDuplicateKeyError } from '../common/mongo-errors';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Friend, FriendDocument } from '../friend/schema/friend.schema';

// Group size cap, including the creator
export const MAX_GROUP_MEMBERS = 100;

// Public fields of other users embedded in conversation responses (data_model.md §1)
const CONVERSATION_USER_FIELDS = 'username displayName avatarUrl';
const conversationUserPopulate = () => [
  { path: 'participants.userId', select: CONVERSATION_USER_FIELDS },
  { path: 'seenBy', select: CONVERSATION_USER_FIELDS },
  { path: 'lastMessage.senderId', select: CONVERSATION_USER_FIELDS },
];

// participants[].userId after populate(conversationUserPopulate())
interface PopulatedParticipant {
  userId?: {
    _id?: Types.ObjectId;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
  } | null;
  joinedAt?: Date;
}

const formatParticipant = (participant: PopulatedParticipant) => ({
  _id: participant.userId?._id,
  username: participant.userId?.username,
  displayName: participant.userId?.displayName,
  avatarUrl: participant.userId?.avatarUrl ?? null,
  joinedAt: participant.joinedAt,
});

@Injectable()
export class ConversationService {
  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Friend.name)
    private readonly friendModel: Model<FriendDocument>,
  ) {}

  // Every user added to a group must exist and be a friend of the person adding them
  private async assertCanAddToGroup(
    actorId: Types.ObjectId,
    userIds: Types.ObjectId[],
  ) {
    if (userIds.length === 0) return;

    const existing = await this.userModel.countDocuments({
      _id: { $in: userIds },
    });
    if (existing !== userIds.length) {
      throw new BadRequestException('Người dùng không tồn tại');
    }

    // Friend pairs are stored normalized (smaller id in `user`)
    const pairs = userIds.map((id) =>
      actorId.toString() < id.toString()
        ? { user: actorId, friend: id }
        : { user: id, friend: actorId },
    );
    const friends = await this.friendModel.countDocuments({ $or: pairs });
    if (friends !== userIds.length) {
      throw new BadRequestException('Chỉ có thể thêm bạn bè vào nhóm');
    }
  }

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

    // Canonical key guarantees (A, B) and (B, A) evaluate to identical keys (minId:maxId)
    const directKey = getDirectKey(userId, participantId);

    // Query for existing direct conversation (supporting both canonical directKey and legacy participant arrays)
    let conversation = await this.conversationModel
      .findOne({
        type: 'direct',
        $or: [
          { directKey },
          {
            participants: {
              $all: [
                { $elemMatch: { userId } },
                { $elemMatch: { userId: participantId } },
              ],
            },
          },
        ],
      })
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .populate(conversationUserPopulate());

    if (!conversation) {
      try {
        conversation = await this.conversationModel.create({
          type: 'direct',
          directKey,
          participants: [
            {
              userId,
              joinedAt: new Date(),
            },
            {
              userId: participantId,
              joinedAt: new Date(),
            },
          ],

          lastMessageAt: new Date(),
        });

        await conversation.populate(conversationUserPopulate());
      } catch (createErr: unknown) {
        // Concurrency handling: if a concurrent request created the direct conversation first,
        // MongoDB's unique index raises code 11000. Catch it and return the created conversation.
        if (isDuplicateKeyError(createErr)) {
          conversation = await this.conversationModel
            .findOne({
              type: 'direct',
              $or: [
                { directKey },
                {
                  participants: {
                    $all: [
                      { $elemMatch: { userId } },
                      { $elemMatch: { userId: participantId } },
                    ],
                  },
                },
              ],
            })
            .populate(conversationUserPopulate());

          if (!conversation) {
            throw createErr;
          }
        } else {
          throw createErr;
        }
      }
    }
    return this.formatConversation(conversation);
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

    await this.assertCanAddToGroup(userId, invitedIds);

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

    return this.formatConversation(conversation);
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
      this.formatLeanConversation(conversation),
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
        $addToSet: {
          seenBy: userObjectId,
        },
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

      seenBy: updated?.seenBy || [],

      myUnreadCount: updated ? (computeUnreadCounts(updated)[userId] ?? 0) : 0,

      lastSeq: updated?.lastSeq ?? lastSeq,

      lastReadSeq: me?.lastReadSeq ?? 0,

      lastMessage: updated?.lastMessage || null,
    };
  }

  async update(
    conversationId: string,
    dto: UpdateConversationDto,
    userId: string,
  ) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new BadRequestException('Conversation ID không hợp lệ');
    }

    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('User ID không hợp lệ');
    }

    const conversation = await this.conversationModel.findOne({
      _id: new Types.ObjectId(conversationId),
      type: 'group',
      'participants.userId': new Types.ObjectId(userId),
    });

    if (!conversation) {
      throw new NotFoundException(
        'Group không tồn tại hoặc bạn không có quyền',
      );
    }

    if (conversation.group?.createdBy?.toString() !== userId) {
      throw new ForbiddenException('Chỉ trưởng nhóm mới có quyền đổi tên nhóm');
    }

    conversation.group.name = dto.groupName.trim();

    await conversation.save();
    await conversation.populate(conversationUserPopulate());

    return this.formatConversation(conversation);
  }

  async addParticipants(
    conversationId: string,
    dto: AddParticipantDto,
    userId: string,
  ) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new BadRequestException('Conversation ID không hợp lệ');
    }

    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('User ID không hợp lệ');
    }

    if (
      !dto?.userIds ||
      !Array.isArray(dto.userIds) ||
      dto.userIds.length === 0 ||
      dto.userIds.some((id) => !id || !Types.ObjectId.isValid(id))
    ) {
      throw new BadRequestException('User ID không hợp lệ');
    }

    const conversation = await this.conversationModel.findOne({
      _id: new Types.ObjectId(conversationId),
      type: 'group',
      'participants.userId': new Types.ObjectId(userId),
    });

    if (!conversation) {
      throw new NotFoundException(
        'Group không tồn tại hoặc bạn không có quyền',
      );
    }

    if (conversation.group?.createdBy?.toString() !== userId) {
      throw new ForbiddenException(
        'Chỉ trưởng nhóm mới có quyền thêm thành viên',
      );
    }

    const existingIds = conversation.participants.map((participant) =>
      participant.userId.toString(),
    );

    // Only users not already in the group are checked and added
    const newIds = [...new Set(dto.userIds)].filter(
      (id) => !existingIds.includes(id),
    );

    if (existingIds.length + newIds.length > MAX_GROUP_MEMBERS) {
      throw new BadRequestException(
        `Nhóm tối đa ${MAX_GROUP_MEMBERS} thành viên`,
      );
    }

    await this.assertCanAddToGroup(
      new Types.ObjectId(userId),
      newIds.map((id) => new Types.ObjectId(id)),
    );

    for (const id of newIds) {
      conversation.participants.push({
        userId: new Types.ObjectId(id),
        joinedAt: new Date(),
        // Messages from before joining do not count as unread
        lastReadSeq: conversation.lastSeq ?? 0,
      } as Participant);
    }

    await conversation.save();
    await conversation.populate(conversationUserPopulate());

    return this.formatConversation(conversation);
  }

  async getUserConversationsForSocketIO(userId: string): Promise<string[]> {
    if (!Types.ObjectId.isValid(userId)) {
      return [];
    }

    const conversations = await this.conversationModel.find(
      {
        'participants.userId': new Types.ObjectId(userId),
      },
      {
        _id: 1,
      },
    );

    return conversations.map((conversation) => conversation._id.toString());
  }

  private formatConversation(conversation: ConversationDocument) {
    const object = conversation.toObject();

    const participants = (conversation.participants || []).map((participant) =>
      formatParticipant(participant as unknown as PopulatedParticipant),
    );

    return {
      ...object,
      participants,
      unreadCounts: computeUnreadCounts(conversation),
    };
  }

  private formatLeanConversation<
    T extends {
      participants?: unknown[];
      unreadCounts?: unknown;
      lastSeq?: number;
    },
  >(conversation: T) {
    const participants = (conversation.participants || []).map((participant) =>
      formatParticipant(participant as PopulatedParticipant),
    );

    return {
      ...conversation,
      participants,
      unreadCounts: computeUnreadCounts(
        conversation as Parameters<typeof computeUnreadCounts>[0],
      ),
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

    return { message: 'Đã xóa cuộc trò chuyện' };
  }
}
