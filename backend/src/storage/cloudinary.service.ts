import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { errorMessage } from 'src/common/error-message';

export type ResourceType = 'image' | 'video' | 'raw';

// An asset as Cloudinary stored it
export interface CloudinaryResource {
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
 * Server side of the signed direct uploads (message attachments, avatars): signs the parameters
 * the browser posts, reads the stored asset back, builds delivery URLs and removes assets.
 * Which ids, formats and sizes are allowed is decided by the callers.
 */
@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly credentials: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
  } | null;

  constructor(configService: ConfigService) {
    this.credentials = CloudinaryService.parseUrl(
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
        'CLOUDINARY_URL chưa được cấu hình: tắt chức năng đính kèm và ảnh đại diện',
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

  // 503 without CLOUDINARY_URL
  requireCredentials() {
    if (!this.credentials) {
      throw new ServiceUnavailableException('Chưa cấu hình lưu trữ file');
    }
    return this.credentials;
  }

  /**
   * Signature for one direct browser → Cloudinary upload of `publicId`.
   * `allowedFormats`: Cloudinary rejects a file whose real format is not listed (not for raw).
   */
  signUpload(
    resourceType: ResourceType,
    publicId: string,
    allowedFormats?: string[],
  ) {
    const credentials = this.requireCredentials();
    // Every key here must be posted unchanged by the client (it is what the signature covers)
    const params: Record<string, string | number> = {
      public_id: publicId,
      timestamp: Math.floor(Date.now() / 1000),
      overwrite: 'false',
      ...(allowedFormats ? { allowed_formats: allowedFormats.join(',') } : {}),
    };
    const signature = cloudinary.utils.api_sign_request(
      params,
      credentials.apiSecret,
    );
    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${credentials.cloudName}/${resourceType}/upload`,
      // Posted as-is by the browser together with the file
      fields: {
        ...params,
        api_key: credentials.apiKey,
        signature,
      } as Record<string, string | number>,
    };
  }

  // Asset as stored by Cloudinary; null when it does not exist
  async fetchResource(
    publicId: string,
    resourceType: ResourceType,
  ): Promise<CloudinaryResource | null> {
    try {
      return (await cloudinary.uploader.explicit(publicId, {
        type: 'upload',
        resource_type: resourceType,
      })) as CloudinaryResource;
    } catch (err: unknown) {
      const status =
        (err as { http_code?: number; error?: { http_code?: number } })
          ?.http_code ??
        (err as { error?: { http_code?: number } })?.error?.http_code;
      if (status === 404) return null;
      this.logger.error(`[Cloudinary] explicit lỗi: ${errorMessage(err)}`);
      throw new ServiceUnavailableException(
        'Không thể kiểm tra file đã tải lên, hãy thử lại',
      );
    }
  }

  // Delivery URL of an image through transformations: a transformed copy, which drops EXIF metadata
  imageUrl(
    resource: CloudinaryResource,
    transformation: Record<string, string | number>[] = [],
  ): string {
    return cloudinary.url(resource.public_id, {
      resource_type: 'image',
      type: 'upload',
      secure: true,
      ...(resource.version ? { version: resource.version } : {}),
      transformation: [
        ...transformation,
        { fetch_format: 'auto', quality: 'auto' },
      ],
    });
  }

  // Fire-and-forget removal (after the change is stored, or of rejected uploads). Errors are logged.
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
            `[Cloudinary] Không thể xóa ${item.publicId}: ${errorMessage(err)}`,
          ),
        );
    }
  }
}
