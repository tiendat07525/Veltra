import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  MAX_MUTED_CONVERSATIONS,
  User,
  UserDocument,
  UserSettings,
} from 'src/users/schemas/user.schema';
import {
  Conversation,
  ConversationDocument,
} from 'src/conversation/schemas/conversation.schema';
import { RealtimeService } from 'src/realtime/realtime.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

type StoredSettings = Partial<{
  notifications: Partial<UserSettings['notifications']>;
  chat: Partial<UserSettings['chat']>;
  mutedConversationIds: Types.ObjectId[];
}>;

// API / socket shape, with the defaults filled in (users created before the field existed)
export function toSettingsPayload(stored?: StoredSettings | null) {
  return {
    notifications: {
      browser: stored?.notifications?.browser ?? true,
      sound: stored?.notifications?.sound ?? true,
      doNotDisturb: stored?.notifications?.doNotDisturb ?? false,
    },
    chat: {
      enterToSend: stored?.chat?.enterToSend ?? true,
    },
    mutedConversationIds: (stored?.mutedConversationIds ?? []).map((id) =>
      id.toString(),
    ),
  };
}

export type SettingsPayload = ReturnType<typeof toSettingsPayload>;

/**
 * The signed-in user's preferences (users.settings). Every change is pushed to the
 * user's other tabs / devices with settings:updated.
 */
@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    private readonly realtimeService: RealtimeService,
  ) {}

  async getSettings(userId: string) {
    const user = await this.userModel
      .findById(this.toObjectId(userId, 'User ID không hợp lệ'))
      .select('settings')
      .lean<{ settings?: StoredSettings }>();
    if (!user) {
      throw new NotFoundException('User không tồn tại');
    }
    return toSettingsPayload(user.settings);
  }

  async update(userId: string, dto: UpdateSettingsDto) {
    // Only the fields sent are written (one $set path each)
    const $set: Record<string, boolean> = {};
    for (const [section, values] of [
      ['notifications', dto.notifications],
      ['chat', dto.chat],
    ] as const) {
      for (const [key, value] of Object.entries(values ?? {})) {
        if (typeof value === 'boolean') {
          $set[`settings.${section}.${key}`] = value;
        }
      }
    }
    if (Object.keys($set).length === 0) {
      return this.getSettings(userId);
    }

    return this.write(userId, { _id: this.toObjectId(userId) }, { $set });
  }

  // Mute a conversation the user is a member of
  async mute(userId: string, conversationId: string) {
    const me = this.toObjectId(userId);
    const convId = this.toObjectId(
      conversationId,
      'Conversation ID không hợp lệ',
    );

    const isMember = await this.conversationModel.exists({
      _id: convId,
      'participants.userId': me,
    });
    if (!isMember) {
      throw new NotFoundException(
        'Conversation không tồn tại hoặc bạn không có quyền truy cập',
      );
    }

    const settings = await this.write(
      userId,
      {
        _id: me,
        // Already muted, or still room for one more (cap checked in the write itself)
        $or: [
          { 'settings.mutedConversationIds': convId },
          {
            [`settings.mutedConversationIds.${MAX_MUTED_CONVERSATIONS - 1}`]: {
              $exists: false,
            },
          },
        ],
      },
      { $addToSet: { 'settings.mutedConversationIds': convId } },
    );
    return settings;
  }

  // Unmute; no membership check, so ids of conversations already left can be removed
  async unmute(userId: string, conversationId: string) {
    const convId = this.toObjectId(
      conversationId,
      'Conversation ID không hợp lệ',
    );
    return this.write(
      userId,
      { _id: this.toObjectId(userId) },
      { $pull: { 'settings.mutedConversationIds': convId } },
    );
  }

  private async write(
    userId: string,
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ) {
    const user = await this.userModel
      .findOneAndUpdate(filter, update, { new: true, runValidators: true })
      .select('settings')
      .lean<{ settings?: StoredSettings }>();
    if (!user) {
      // Only the mute filter can fail for an existing user: the cap
      if ('$or' in filter) {
        throw new BadRequestException(
          `Chỉ có thể tắt thông báo tối đa ${MAX_MUTED_CONVERSATIONS} cuộc trò chuyện`,
        );
      }
      throw new NotFoundException('User không tồn tại');
    }

    const settings = toSettingsPayload(user.settings);
    this.realtimeService.emitToUser(userId, 'settings:updated', { settings });
    return settings;
  }

  private toObjectId(id: string, message = 'User ID không hợp lệ') {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(message);
    }
    return new Types.ObjectId(id);
  }
}
