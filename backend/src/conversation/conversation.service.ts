import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import {
  Conversation,
  ConversationDocument,
  computeUnreadCounts,
  getDirectKey,
} from './schemas/conversation.schema';
import { Connection, Model, Types } from 'mongoose';
import { CreateConversationDto } from './dto/create-conversation.dto';
import {
  Message,
  MessageDocument,
  SystemAction,
  toMessagePayload,
} from '../messages/schemas/message.schema';
import { AddParticipantDto, TransferOwnerDto } from './dto/add-participant.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { isDuplicateKeyError } from '../common/mongo-errors';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Friend, FriendDocument } from '../friend/schema/friend.schema';
import { RealtimeService } from '../realtime/realtime.service';

// Group size cap, including the creator
export const MAX_GROUP_MEMBERS = 100;

// "An, Bình, Chi" or "An, Bình, Chi và 4 người khác"
const formatNameList = (names: string[]) =>
  names.length <= 3
    ? names.join(', ')
    : `${names.slice(0, 3).join(', ')} và ${names.length - 3} người khác`;

// One membership / group change, applied together with its system message
interface GroupChange {
  actorId: Types.ObjectId;
  // Conditions the group must still meet when written (guards against concurrent changes)
  filter: Record<string, unknown>;
  // The change itself ($pull / $push / $set)
  update: Record<string, unknown>;
  action: SystemAction;
  targetIds: Types.ObjectId[];
  content: string;
  // Members who lose access with this change: told with conversation:removed
  removedIds?: Types.ObjectId[];
  // New members: start at lastReadSeq = seq − 1, so only this system message is unread
  addedIds?: Types.ObjectId[];
}

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
    private readonly realtimeService: RealtimeService,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  // Group the user belongs to; 404 for a direct conversation, a missing group or a non-member
  private async findGroupForMember(conversationId: string, userId: string) {
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
    return conversation;
  }

  // The owner is group.createdBy (changed by transferOwnership)
  private isOwner(conversation: ConversationDocument, userId: string) {
    return conversation.group?.createdBy?.toString() === userId;
  }

  private isMember(conversation: ConversationDocument, userId: string) {
    return conversation.participants.some(
      (participant) => participant.userId?.toString() === userId,
    );
  }

  // Display name snapshot used in system message text (users who left are no longer resolvable)
  private async displayNames(ids: Types.ObjectId[]) {
    const users = await this.userModel
      .find({ _id: { $in: ids } }, 'username displayName')
      .lean();
    const names = new Map(
      users.map((user) => [
        user._id.toString(),
        user.displayName || user.username,
      ]),
    );
    return (id: Types.ObjectId) => names.get(id.toString()) || 'Người dùng';
  }

  /**
   * Applies a group change and records it as a system message in one transaction:
   * conditional update + $inc lastSeq → system message with that seq → lastMessage.
   * Emits only after the commit: conversation:updated and message:new to the members
   * of the stored conversation, conversation:removed to members who lost access.
   */
  private async applyGroupChange(
    conversationId: Types.ObjectId,
    change: GroupChange,
  ) {
    const { conversation, message } = await this.connection.transaction(
      async (session) => {
        const counter = await this.conversationModel.findOneAndUpdate(
          { _id: conversationId, type: 'group', ...change.filter },
          { ...change.update, $inc: { lastSeq: 1 } },
          { new: true, session },
        );
        if (!counter) {
          // Checked just before; another request changed the group in between
          throw new ConflictException('Nhóm vừa thay đổi, hãy thử lại');
        }
        const seq = counter.lastSeq;

        const [created] = await this.messageModel.create(
          [
            {
              conversationId,
              senderId: change.actorId,
              type: 'system',
              system: { action: change.action, targetIds: change.targetIds },
              content: change.content,
              seq,
            },
          ],
          { session },
        );

        // The actor has seen the change (no-op when the actor just left)
        const $max: Record<string, number> = {
          'participants.$[me].lastReadSeq': seq,
        };
        const arrayFilters: Record<string, unknown>[] = [
          { 'me.userId': change.actorId },
        ];
        if (change.addedIds?.length) {
          $max['participants.$[added].lastReadSeq'] = seq - 1;
          arrayFilters.push({ 'added.userId': { $in: change.addedIds } });
        }

        const updated = await this.conversationModel.findOneAndUpdate(
          { _id: conversationId },
          {
            $set: {
              seenBy: [],
              lastMessageAt: created.createdAt,
              lastMessage: {
                _id: created._id,
                content: created.content,
                senderId: change.actorId,
                createdAt: created.createdAt,
                seq,
              },
            },
            $max,
          },
          { new: true, session, arrayFilters },
        );
        if (!updated) {
          throw new Error('Không thể cập nhật conversation');
        }
        return { conversation: updated, message: created };
      },
    );

    // Built before populate, so ids stay ids (same shape as a normal send)
    const conversationPayload = {
      _id: conversation._id.toString(),
      lastMessage: conversation.toObject().lastMessage,
      lastMessageAt: conversation.lastMessageAt,
      lastSeq: conversation.lastSeq,
      unreadCounts: computeUnreadCounts(conversation),
    };
    const messagePayload = toMessagePayload(message);
    const memberIds = conversation.participants
      .map((participant) => participant.userId?.toString())
      .filter((id): id is string => !!id);

    await conversation.populate(conversationUserPopulate());
    const formatted = this.formatConversation(conversation);

    for (const memberId of memberIds) {
      this.realtimeService.emitToUser(memberId, 'conversation:updated', {
        conversation: formatted,
      });
      this.realtimeService.emitToUser(memberId, 'message:new', {
        message: messagePayload,
        conversation: conversationPayload,
      });
    }
    for (const removedId of change.removedIds ?? []) {
      this.realtimeService.emitToUser(
        removedId.toString(),
        'conversation:removed',
        { conversationId: conversation._id.toString() },
      );
    }

    return formatted;
  }

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
    const conversation = await this.findGroupForMember(conversationId, userId);

    if (!this.isOwner(conversation, userId)) {
      throw new ForbiddenException('Chỉ trưởng nhóm mới có quyền đổi tên nhóm');
    }

    const name = dto.groupName.trim();
    if (conversation.group?.name === name) {
      // Nothing changed: no system message, no event
      await conversation.populate(conversationUserPopulate());
      return this.formatConversation(conversation);
    }

    const actorId = new Types.ObjectId(userId);
    const nameOf = await this.displayNames([actorId]);

    return this.applyGroupChange(conversation._id, {
      actorId,
      filter: { 'group.createdBy': actorId },
      update: { $set: { 'group.name': name } },
      action: 'group_renamed',
      targetIds: [],
      content: `${nameOf(actorId)} đã đổi tên nhóm thành "${name}"`,
    });
  }

  async addParticipants(
    conversationId: string,
    dto: AddParticipantDto,
    userId: string,
  ) {
    if (
      !dto?.userIds ||
      !Array.isArray(dto.userIds) ||
      dto.userIds.length === 0 ||
      dto.userIds.some((id) => !id || !Types.ObjectId.isValid(id))
    ) {
      throw new BadRequestException('User ID không hợp lệ');
    }

    const conversation = await this.findGroupForMember(conversationId, userId);

    if (!this.isOwner(conversation, userId)) {
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

    const actorId = new Types.ObjectId(userId);
    const addedIds = newIds.map((id) => new Types.ObjectId(id));

    await this.assertCanAddToGroup(actorId, addedIds);

    if (addedIds.length === 0) {
      // Everyone is already a member: no system message, no event
      await conversation.populate(conversationUserPopulate());
      return this.formatConversation(conversation);
    }

    const nameOf = await this.displayNames([actorId, ...addedIds]);
    const joinedAt = new Date();

    return this.applyGroupChange(conversation._id, {
      actorId,
      filter: {
        'group.createdBy': actorId,
        // None of them joined in the meantime
        'participants.userId': { $nin: addedIds },
        // Size cap checked in the write itself: no element at index MAX − added
        [`participants.${MAX_GROUP_MEMBERS - addedIds.length}`]: {
          $exists: false,
        },
      },
      update: {
        $push: {
          participants: {
            $each: addedIds.map((id) => ({
              userId: id,
              joinedAt,
              lastReadSeq: 0,
            })),
          },
        },
      },
      action: 'members_added',
      targetIds: addedIds,
      content: `${nameOf(actorId)} đã thêm ${formatNameList(addedIds.map(nameOf))} vào nhóm`,
      addedIds,
    });
  }

  async leaveGroup(conversationId: string, userId: string) {
    const conversation = await this.findGroupForMember(conversationId, userId);
    const actorId = new Types.ObjectId(userId);

    if (this.isOwner(conversation, userId)) {
      if (conversation.participants.length > 1) {
        throw new BadRequestException(
          'Hãy chuyển quyền trưởng nhóm cho thành viên khác trước khi rời nhóm',
        );
      }

      // The owner is the last member: leaving deletes the group
      const { deletedCount } = await this.conversationModel.deleteOne({
        _id: conversation._id,
        'group.createdBy': actorId,
        participants: { $size: 1 },
      });
      if (deletedCount !== 1) {
        throw new ConflictException('Nhóm vừa thay đổi, hãy thử lại');
      }
      await this.messageModel.deleteMany({ conversationId: conversation._id });
      this.realtimeService.emitToUser(userId, 'conversation:removed', {
        conversationId: conversation._id.toString(),
      });
      return {
        message: 'Đã rời nhóm',
        conversationId: conversation._id.toString(),
      };
    }

    const nameOf = await this.displayNames([actorId]);

    await this.applyGroupChange(conversation._id, {
      actorId,
      filter: {
        'participants.userId': actorId,
        // Became owner in the meantime: must transfer first
        'group.createdBy': { $ne: actorId },
      },
      update: { $pull: { participants: { userId: actorId }, seenBy: actorId } },
      action: 'member_left',
      targetIds: [],
      content: `${nameOf(actorId)} đã rời nhóm`,
      removedIds: [actorId],
    });

    return {
      message: 'Đã rời nhóm',
      conversationId: conversation._id.toString(),
    };
  }

  async removeParticipant(
    conversationId: string,
    targetUserId: string,
    userId: string,
  ) {
    if (!Types.ObjectId.isValid(targetUserId)) {
      throw new BadRequestException('User ID không hợp lệ');
    }

    const conversation = await this.findGroupForMember(conversationId, userId);

    if (!this.isOwner(conversation, userId)) {
      throw new ForbiddenException(
        'Chỉ trưởng nhóm mới có quyền xóa thành viên',
      );
    }

    if (targetUserId === userId) {
      throw new BadRequestException(
        'Trưởng nhóm không thể tự xóa mình, hãy dùng chức năng rời nhóm',
      );
    }

    if (!this.isMember(conversation, targetUserId)) {
      throw new NotFoundException('Người này không còn trong nhóm');
    }

    const actorId = new Types.ObjectId(userId);
    const targetId = new Types.ObjectId(targetUserId);
    const nameOf = await this.displayNames([actorId, targetId]);

    return this.applyGroupChange(conversation._id, {
      actorId,
      filter: { 'group.createdBy': actorId, 'participants.userId': targetId },
      update: {
        $pull: { participants: { userId: targetId }, seenBy: targetId },
      },
      action: 'member_removed',
      targetIds: [targetId],
      content: `${nameOf(actorId)} đã xóa ${nameOf(targetId)} khỏi nhóm`,
      removedIds: [targetId],
    });
  }

  async transferOwnership(
    conversationId: string,
    dto: TransferOwnerDto,
    userId: string,
  ) {
    if (!Types.ObjectId.isValid(dto?.userId)) {
      throw new BadRequestException('User ID không hợp lệ');
    }

    const conversation = await this.findGroupForMember(conversationId, userId);

    if (!this.isOwner(conversation, userId)) {
      throw new ForbiddenException(
        'Chỉ trưởng nhóm mới có quyền chuyển quyền trưởng nhóm',
      );
    }

    if (dto.userId === userId) {
      throw new BadRequestException('Bạn đã là trưởng nhóm');
    }

    if (!this.isMember(conversation, dto.userId)) {
      throw new BadRequestException(
        'Người nhận quyền phải là thành viên của nhóm',
      );
    }

    const actorId = new Types.ObjectId(userId);
    const targetId = new Types.ObjectId(dto.userId);
    const nameOf = await this.displayNames([actorId, targetId]);

    return this.applyGroupChange(conversation._id, {
      actorId,
      filter: { 'group.createdBy': actorId, 'participants.userId': targetId },
      update: { $set: { 'group.createdBy': targetId } },
      action: 'owner_transferred',
      targetIds: [targetId],
      content: `${nameOf(actorId)} đã chuyển quyền trưởng nhóm cho ${nameOf(targetId)}`,
    });
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
