import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { User, UserDocument } from 'src/users/schemas/user.schema';
import { UpdateUserDto } from 'src/users/dto/update-user.dto';
import { UsersService } from 'src/users/users.service';
import { CloudinaryService } from 'src/storage/cloudinary.service';
import { PresenceService } from 'src/realtime/presence.service';
import { RealtimeService } from 'src/realtime/realtime.service';
import { errorMessage } from 'src/common/error-message';
import { MB, extensionOf } from 'src/messages/attachment.rules';
import {
  AVATAR_FOLDER,
  AVATAR_FORMATS,
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  AVATAR_PUBLIC_ID_PATTERN,
  AVATAR_SIZE_PX,
} from './avatar.rules';
import type { SetAvatarDto, SignAvatarDto } from './dto/avatar.dto';

// What other users are shown
type ShownFields = Partial<Pick<User, 'displayName' | 'avatarUrl'>>;

/**
 * Changes a user makes to their own profile: text fields and avatar. The avatar is uploaded by the
 * browser straight to Cloudinary with a server signature; the stored asset is checked before it is used.
 * Every stored change is pushed with user:updated.
 */
@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly usersService: UsersService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly presenceService: PresenceService,
    private readonly realtimeService: RealtimeService,
  ) {}

  async update(id: string, dto: UpdateUserDto, currentUserId?: string) {
    if (currentUserId && id !== currentUserId) {
      throw new ForbiddenException(
        'Bạn không có quyền chỉnh sửa tài khoản này',
      );
    }

    // avatarUrl is only ever '' here (UpdateUserDto): the uploaded file goes away too
    const removesAvatar = dto.avatarUrl !== undefined;
    const previous = await this.userModel
      .findByIdAndUpdate(
        id,
        {
          $set: dto,
          ...(removesAvatar ? { $unset: { avatarPublicId: 1 } } : {}),
        },
        { runValidators: true },
      )
      .select('+avatarPublicId')
      .lean();
    if (!previous) {
      throw new NotFoundException(`User không tồn tại`);
    }
    if (removesAvatar) this.destroyAvatar(previous.avatarPublicId);
    return this.announce(id, previous, dto);
  }

  signAvatar(userId: string, dto: SignAvatarDto) {
    this.cloudinaryService.requireCredentials();
    const ext = extensionOf(dto.fileName);
    if (!AVATAR_MIME_TYPES[ext]?.includes(dto.mimeType.toLowerCase())) {
      throw new BadRequestException('Ảnh phải là file jpg, png hoặc webp');
    }
    if (dto.size > AVATAR_MAX_BYTES) {
      throw new BadRequestException(`Ảnh vượt quá ${AVATAR_MAX_BYTES / MB} MB`);
    }
    return this.cloudinaryService.signUpload(
      'image',
      `${AVATAR_FOLDER}/${userId}/${randomUUID()}`,
      AVATAR_FORMATS,
    );
  }

  // The uploaded asset becomes the avatar; the previous one is removed once the new one is stored
  async setAvatar(userId: string, { publicId }: SetAvatarDto) {
    this.cloudinaryService.requireCredentials();
    if (AVATAR_PUBLIC_ID_PATTERN.exec(publicId)?.[1] !== userId) {
      throw new BadRequestException('Ảnh không hợp lệ');
    }

    const resource = await this.cloudinaryService.fetchResource(
      publicId,
      'image',
    );
    if (!resource) {
      throw new BadRequestException('Ảnh chưa được tải lên');
    }
    const format = (resource.format ?? '').toLowerCase();
    if (!AVATAR_FORMATS.includes(format) || resource.bytes > AVATAR_MAX_BYTES) {
      this.logger.warn(
        `[Avatar] Từ chối ${publicId} (${format}, ${resource.bytes} bytes)`,
      );
      this.destroyAvatar(publicId);
      throw new BadRequestException('Ảnh sai định dạng hoặc quá dung lượng');
    }

    const avatarUrl = this.cloudinaryService.imageUrl(resource, [
      { width: AVATAR_SIZE_PX, height: AVATAR_SIZE_PX, crop: 'fill' },
    ]);
    // Returns the document before the change, so concurrent changes each remove the one they replaced
    const previous = await this.userModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(userId) },
        { $set: { avatarUrl, avatarPublicId: publicId } },
      )
      .select('+avatarPublicId')
      .lean();
    if (!previous) {
      throw new NotFoundException(`User không tồn tại`);
    }
    if (previous.avatarPublicId !== publicId) {
      this.destroyAvatar(previous.avatarPublicId);
    }
    return this.announce(userId, previous, { avatarUrl });
  }

  /**
   * After the write: user:updated to the own tabs, and to the presence audience (friends + co-members)
   * when the name or avatar changed. Returns the own profile. A failed push never fails the request.
   */
  private async announce(
    userId: string,
    previous: ShownFields,
    { displayName, avatarUrl }: ShownFields,
  ) {
    // Never set and '' are shown the same
    const changed = (next?: string, before?: string) =>
      next !== undefined && next !== (before ?? '');
    const shownChanged =
      changed(displayName, previous.displayName) ||
      changed(avatarUrl, previous.avatarUrl);

    let audience: string[] = [];
    try {
      if (shownChanged) {
        audience = await this.presenceService.audienceOf(userId);
      }
    } catch (err: unknown) {
      this.logger.warn(
        `[Profile] Không thể báo user:updated: ${errorMessage(err)}`,
      );
    }

    // Read last, right before emitting: what is sent is the newest stored profile
    const profile = await this.usersService.findOne(userId);
    const user = {
      _id: userId,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    };
    for (const recipient of [userId, ...audience]) {
      this.realtimeService.emitToUser(recipient, 'user:updated', { user });
    }
    return profile;
  }

  private destroyAvatar(publicId?: string) {
    if (!publicId) return;
    this.cloudinaryService.destroy([{ publicId, resourceType: 'image' }]);
  }
}
