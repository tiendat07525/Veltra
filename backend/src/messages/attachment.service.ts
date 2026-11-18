import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import {
  Conversation,
  ConversationDocument,
} from 'src/conversation/schemas/conversation.schema';
import { errorMessage } from 'src/common/error-message';
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

interface CloudinaryResource {
  public_id: string;
  version?: number;
  resource_type: string;
  format?: string;
  bytes: number;
  secure_url: string;
  width?: number;
  height?: number;
  duration?: number;
}

/**
 * Server-signed direct uploads to Cloudinary. The browser uploads with a signature for a
 * public_id the server chose (veltra/{conversationId}/{uploaderId}/{uuid}); when the message
 * is sent the server reads the stored asset back (`explicit`) and checks its real format / size.
 */
@Injectable()
export class AttachmentService {
  private readonly logger = new Logger(AttachmentService.name);
  private readonly credentials: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
  } | null;

  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    configService: ConfigService,
  ) {
    this.credentials = AttachmentService.parseUrl(
      configService.get<string>('CLOUDINARY_URL'),
    );
    if (this.credentials) {
      cloudinary.config({
        cloud_name: this.credentials.cloudName,
        api_key: this.credentials.apiKey,
        api_secret: this.credentials.apiSecret,
        secure: true,
      });
    } else {
      this.logger.warn(
        'CLOUDINARY_URL chưa được cấu hình: tắt chức năng đính kèm',
      );
    }
  }

  // cloudinary://<api_key>:<api_secret>@<cloud_name> (also used by the orphan-upload cleanup)
  static parseUrl(value?: string) {
    if (!value) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== 'cloudinary:') return null;
      const apiKey = decodeURIComponent(url.username);
      const apiSecret = decodeURIComponent(url.password);
      const cloudName = url.hostname;
      return apiKey && apiSecret && cloudName
        ? { cloudName, apiKey, apiSecret }
        : null;
    } catch {
      return null;
    }
  }

  private requireCredentials() {
    if (!this.credentials) {
      throw new ServiceUnavailableException('Chưa cấu hình lưu trữ file');
    }
    return this.credentials;
  }

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
    const credentials = this.requireCredentials();
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

    // Every key here must be posted unchanged by the client (it is what the signature covers)
    const params: Record<string, string | number> = {
      public_id: publicId,
      timestamp: Math.floor(Date.now() / 1000),
      overwrite: 'false',
      ...(rule.resourceType === 'raw'
        ? {}
        : { allowed_formats: rule.formats.join(',') }),
    };
    const signature = cloudinary.utils.api_sign_request(
      params,
      credentials.apiSecret,
    );

    return {
      kind: detected.kind,
      maxBytes: rule.maxBytes,
      uploadUrl: `https://api.cloudinary.com/v1_1/${credentials.cloudName}/${rule.resourceType}/upload`,
      // Posted as-is by the browser together with the file
      fields: {
        ...params,
        api_key: credentials.apiKey,
        signature,
      } as Record<string, string | number>,
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
    this.requireCredentials();
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
      refs.map((ref) => this.fetchResource(ref)),
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
        url: this.deliveryUrl(ref.kind, resource),
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

  // Asset as stored by Cloudinary; null when it does not exist
  private async fetchResource(
    ref: AttachmentRefDto,
  ): Promise<CloudinaryResource | null> {
    const resourceType = ATTACHMENT_RULES[ref.kind].resourceType;
    try {
      return (await cloudinary.uploader.explicit(ref.publicId, {
        type: 'upload',
        resource_type: resourceType,
      })) as CloudinaryResource;
    } catch (err: unknown) {
      const status =
        (err as { http_code?: number; error?: { http_code?: number } })
          ?.http_code ??
        (err as { error?: { http_code?: number } })?.error?.http_code;
      if (status === 404) return null;
      this.logger.error(
        `[Attachment] Cloudinary explicit lỗi: ${errorMessage(err)}`,
      );
      throw new ServiceUnavailableException(
        'Không thể kiểm tra file đính kèm, hãy thử lại',
      );
    }
  }

  // Images are delivered through f_auto,q_auto: a transformed copy, which drops EXIF metadata
  private deliveryUrl(kind: AttachmentKind, resource: CloudinaryResource) {
    if (kind !== 'image') return resource.secure_url;
    return cloudinary.url(resource.public_id, {
      resource_type: 'image',
      type: 'upload',
      secure: true,
      ...(resource.version ? { version: resource.version } : {}),
      transformation: [{ fetch_format: 'auto', quality: 'auto' }],
    });
  }

  // Fire-and-forget removal (after revoke is stored, or of rejected uploads). Errors are logged.
  destroy(items: { publicId: string; resourceType: string }[]): void {
    if (!this.credentials) return;
    for (const item of items) {
      cloudinary.uploader
        .destroy(item.publicId, {
          resource_type: item.resourceType,
          invalidate: true,
        })
        .catch((err: unknown) =>
          this.logger.warn(
            `[Attachment] Không thể xóa ${item.publicId}: ${errorMessage(err)}`,
          ),
        );
    }
  }
}
