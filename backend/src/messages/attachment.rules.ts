import type { ResourceType } from 'src/storage/cloudinary.service';
import type { AttachmentKind, Attachment } from './schemas/message.schema';

// Attachment rules and pure helpers shared by AttachmentService and MessageService.
// The frontend mirrors these limits in frontend/src/services/api/attachment.service.ts.

export const MAX_ATTACHMENTS_PER_MESSAGE = 10;
export const MB = 1024 * 1024;

export interface KindRule {
  resourceType: ResourceType;
  formats: string[];
  // extension -> accepted client MIME types (pre-check only; the stored format is checked at send)
  mimeTypes: Record<string, string[]>;
  maxBytes: number;
}

// Limits and formats: security.md §6. Never add svg / html / executables.
export const ATTACHMENT_RULES: Record<AttachmentKind, KindRule> = {
  image: {
    resourceType: 'image',
    formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    mimeTypes: {
      jpg: ['image/jpeg'],
      jpeg: ['image/jpeg'],
      png: ['image/png'],
      webp: ['image/webp'],
      gif: ['image/gif'],
    },
    maxBytes: 10 * MB,
  },
  video: {
    resourceType: 'video',
    formats: ['mp4', 'webm', 'mov'],
    mimeTypes: {
      mp4: ['video/mp4'],
      webm: ['video/webm'],
      mov: ['video/quicktime'],
    },
    maxBytes: 25 * MB,
  },
  // Cloudinary stores audio as resource_type "video"
  audio: {
    resourceType: 'video',
    formats: ['mp3', 'm4a', 'ogg', 'wav'],
    mimeTypes: {
      mp3: ['audio/mpeg', 'audio/mp3'],
      m4a: ['audio/mp4', 'audio/x-m4a', 'audio/m4a'],
      ogg: ['audio/ogg'],
      wav: ['audio/wav', 'audio/x-wav', 'audio/wave'],
    },
    maxBytes: 25 * MB,
  },
  file: {
    resourceType: 'raw',
    formats: ['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'zip'],
    mimeTypes: {
      pdf: ['application/pdf'],
      docx: [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      xlsx: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
      pptx: [
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ],
      txt: ['text/plain'],
      zip: ['application/zip', 'application/x-zip-compressed'],
    },
    maxBytes: 10 * MB,
  },
};

export const ROOT_FOLDER = 'veltra';
export const UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// veltra/{conversationId}/{uploaderId}/{uuid}[.ext]  (raw files keep their extension)
export const PUBLIC_ID_PATTERN = new RegExp(
  `^${ROOT_FOLDER}/([0-9a-f]{24})/([0-9a-f]{24})/${UUID}(?:\\.([a-z0-9]{2,4}))?$`,
);

export const extensionOf = (fileName: string) => {
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(fileName.trim());
  return match ? match[1].toLowerCase() : '';
};

// Display name only (never used as a path): no separators / control chars, ≤ 200 chars
export const sanitizeFileName = (name: string) =>
  name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f/\\]/g, '')
    .trim()
    .slice(0, 200) || 'tep';

// lastMessage text for a message without a caption: [Ảnh] / [3 ảnh] / [Video] / [Tệp] a.pdf …
export function attachmentPreview(
  attachments: Pick<Attachment, 'kind' | 'name'>[],
) {
  if (!attachments.length) return '';
  const labels: Record<AttachmentKind, string> = {
    image: 'ảnh',
    video: 'video',
    audio: 'âm thanh',
    file: 'tệp',
  };
  const kinds = new Set(attachments.map((a) => a.kind));
  if (attachments.length === 1) {
    const [only] = attachments;
    return only.kind === 'file'
      ? `[Tệp] ${only.name}`
      : `[${labels[only.kind][0].toUpperCase()}${labels[only.kind].slice(1)}]`;
  }
  if (kinds.size === 1) {
    return `[${attachments.length} ${labels[attachments[0].kind]}]`;
  }
  return `[${attachments.length} tệp đính kèm]`;
}
