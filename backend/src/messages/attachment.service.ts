import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  Conversation,
  ConversationDocument,
} from 'src/conversation/schemas/conversation.schema';
import { CloudinaryService } from 'src/storage/cloudinary.service';
import type { AttachmentKind, Attachment } from './schemas/message.schema';
import {
  ATTACHMENT_RULES,
  KindRule,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MB,
  PUBLIC_ID_PATTERN,
  ROOT_FOLDER,
  extensionOf,
  sanitizeFileName,
} from './attachment.rules';
import type {
  AttachmentRefDto,
  SignAttachmentDto,
} from './dto/create-message.dto';

/**
 * Server-signed direct uploads to Cloudinary. The browser uploads with a signature for a
 * public_id the server chose (veltra/{conversationId}/{uploaderId}/{uuid}); when the message
 * is sent the server reads the stored asset back (`explicit`) and checks its real format / size.
 */
@Injectable()
export class AttachmentService {
  private readonly logger = new Logger(AttachmentService.name);

  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // Kind from the extension; the client MIME type must agree (pre-check only)
  private kindOf(fileName: string, mimeType: string) {
    const ext = extensionOf(fileName);
    const mime = mimeType.toLowerCase();
    for (const [kind, rule] of Object.entries(ATTACHMENT_RULES) as [
      AttachmentKind,
      KindRule,
    ][]) {
      if (rule.mimeTypes[ext]?.includes(mime)) return { kind, ext };
    }
    return null;
  }

  async sign(userId: string, dto: SignAttachmentDto) {
    this.cloudinaryService.requireCredentials();
    if (
      !Types.ObjectId.isValid(userId) ||
      !Types.ObjectId.isValid(dto.conversationId)
    ) {
      throw new BadRequestException('ID không hợp lệ');
    }

    const isMember = await this.conversationModel.exists({
      _id: new Types.ObjectId(dto.conversationId),
      'participants.userId': new Types.ObjectId(userId),
    });
    if (!isMember) {
      throw new NotFoundException('Không tìm thấy hội thoại');
    }

    const detected = this.kindOf(dto.fileName, dto.mimeType);
    if (!detected) {
      throw new BadRequestException('Loại file không được hỗ trợ');
    }
    const rule = ATTACHMENT_RULES[detected.kind];
    if (dto.size > rule.maxBytes) {
      throw new BadRequestException(`File vượt quá ${rule.maxBytes / MB} MB`);
    }

    const base = `${ROOT_FOLDER}/${dto.conversationId}/${userId}/${randomUUID()}`;
    // Raw assets have no format of their own: the extension in the id is their format
    const publicId =
      rule.resourceType === 'raw' ? `${base}.${detected.ext}` : base;

    return {
      kind: detected.kind,
      maxBytes: rule.maxBytes,
      ...this.cloudinaryService.signUpload(
        rule.resourceType,
        publicId,
        rule.resourceType === 'raw' ? undefined : rule.formats,
      ),
    };
  }

  /**
   * Turns the client's references into stored attachments. Every reference must point to an
   * upload made for this conversation by this sender; the real asset is read back from
   * Cloudinary and checked. A rejected asset is destroyed.
   */
  async resolve(
    senderId: string,
    conversationId: string,
    refs: AttachmentRefDto[],
  ): Promise<Attachment[]> {
    if (refs.length === 0) return [];
    this.cloudinaryService.requireCredentials();
    if (refs.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      throw new BadRequestException(
        `Tối đa ${MAX_ATTACHMENTS_PER_MESSAGE} file mỗi tin nhắn`,
      );
    }
    if (new Set(refs.map((r) => r.publicId)).size !== refs.length) {
      throw new BadRequestException('File đính kèm bị trùng');
    }
    for (const ref of refs) {
      const match = PUBLIC_ID_PATTERN.exec(ref.publicId);
      if (!match || match[1] !== conversationId || match[2] !== senderId) {
        throw new BadRequestException('File đính kèm không hợp lệ');
      }
      const isRaw = ATTACHMENT_RULES[ref.kind].resourceType === 'raw';
      if (isRaw !== !!match[3]) {
        throw new BadRequestException('File đính kèm không hợp lệ');
      }
    }

    const resources = await Promise.all(
      refs.map((ref) =>
        this.cloudinaryService.fetchResource(
          ref.publicId,
          ATTACHMENT_RULES[ref.kind].resourceType,
        ),
      ),
    );

    const attachments: Attachment[] = [];
    const rejected: { ref: AttachmentRefDto; reason: string }[] = [];
    refs.forEach((ref, i) => {
      const resource = resources[i];
      const rule = ATTACHMENT_RULES[ref.kind];
      if (!resource) {
        rejected.push({ ref, reason: 'missing' });
        return;
      }
      const format = (
        rule.resourceType === 'raw'
          ? extensionOf(resource.public_id)
          : (resource.format ?? '')
      ).toLowerCase();
      if (!rule.formats.includes(format)) {
        rejected.push({ ref, reason: `format ${format}` });
        return;
      }
      if (resource.bytes > rule.maxBytes) {
        rejected.push({ ref, reason: `size ${resource.bytes}` });
        return;
      }
      attachments.push({
        kind: ref.kind,
        // Images: a transformed copy, which drops EXIF metadata
        url:
          ref.kind === 'image'
            ? this.cloudinaryService.imageUrl(resource)
            : resource.secure_url,
        publicId: resource.public_id,
        resourceType: rule.resourceType,
        format,
        bytes: resource.bytes,
        name: sanitizeFileName(ref.name),
        ...(resource.width ? { width: resource.width } : {}),
        ...(resource.height ? { height: resource.height } : {}),
        ...(resource.duration ? { duration: resource.duration } : {}),
      });
    });

    if (rejected.length) {
      this.logger.warn(
        `[Attachment] Từ chối ${rejected.map((r) => `${r.ref.publicId} (${r.reason})`).join(', ')}`,
      );
      // Invalid uploads are removed; the valid ones stay so a corrected retry can reuse them
      this.destroy(
        rejected
          .filter((r) => r.reason !== 'missing')
          .map((r) => ({
            publicId: r.ref.publicId,
            resourceType: ATTACHMENT_RULES[r.ref.kind].resourceType,
          })),
      );
      const missing = rejected.some((r) => r.reason === 'missing');
      throw new BadRequestException(
        missing
          ? 'File đính kèm chưa được tải lên'
          : 'File đính kèm sai định dạng hoặc quá dung lượng',
      );
    }
    return attachments;
  }

  // Removes files of a revoked message or of a rejected send (fire-and-forget)
  destroy(items: { publicId: string; resourceType: string }[]): void {
    this.cloudinaryService.destroy(items);
  }
}
