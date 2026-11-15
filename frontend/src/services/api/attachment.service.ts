import axios from 'axios';
import api from './api';
import { AttachmentKind } from '@/types/message';

// Mirrors the server rules (backend/src/messages/attachment.rules.ts, security.md §6).
// These checks only give fast feedback: the server re-checks the stored file at send.
const MB = 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

const RULES: Record<string, { kind: AttachmentKind; mimeTypes: string[]; maxBytes: number }> = {
  jpg: { kind: 'image', mimeTypes: ['image/jpeg'], maxBytes: 10 * MB },
  jpeg: { kind: 'image', mimeTypes: ['image/jpeg'], maxBytes: 10 * MB },
  png: { kind: 'image', mimeTypes: ['image/png'], maxBytes: 10 * MB },
  webp: { kind: 'image', mimeTypes: ['image/webp'], maxBytes: 10 * MB },
  gif: { kind: 'image', mimeTypes: ['image/gif'], maxBytes: 10 * MB },
  mp4: { kind: 'video', mimeTypes: ['video/mp4'], maxBytes: 25 * MB },
  webm: { kind: 'video', mimeTypes: ['video/webm'], maxBytes: 25 * MB },
  mov: { kind: 'video', mimeTypes: ['video/quicktime'], maxBytes: 25 * MB },
  mp3: { kind: 'audio', mimeTypes: ['audio/mpeg', 'audio/mp3'], maxBytes: 25 * MB },
  m4a: { kind: 'audio', mimeTypes: ['audio/mp4', 'audio/x-m4a', 'audio/m4a'], maxBytes: 25 * MB },
  ogg: { kind: 'audio', mimeTypes: ['audio/ogg'], maxBytes: 25 * MB },
  wav: { kind: 'audio', mimeTypes: ['audio/wav', 'audio/x-wav', 'audio/wave'], maxBytes: 25 * MB },
  pdf: { kind: 'file', mimeTypes: ['application/pdf'], maxBytes: 10 * MB },
  docx: {
    kind: 'file',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    maxBytes: 10 * MB,
  },
  xlsx: {
    kind: 'file',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    maxBytes: 10 * MB,
  },
  pptx: {
    kind: 'file',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    maxBytes: 10 * MB,
  },
  txt: { kind: 'file', mimeTypes: ['text/plain'], maxBytes: 10 * MB },
  zip: { kind: 'file', mimeTypes: ['application/zip', 'application/x-zip-compressed'], maxBytes: 10 * MB },
};

// For <input type="file" accept>
export const ATTACHMENT_ACCEPT = Object.keys(RULES)
  .map((ext) => `.${ext}`)
  .join(',');

const extensionOf = (name: string) => /\.([A-Za-z0-9]{1,5})$/.exec(name)?.[1].toLowerCase() ?? '';

// Some browsers leave File.type empty (e.g. docx on Linux): use the extension's MIME type then
const mimeTypeOf = (file: File) => {
  const rule = RULES[extensionOf(file.name)];
  return file.type || rule?.mimeTypes[0] || '';
};

export type ClassifiedFile = { ok: true; kind: AttachmentKind } | { ok: false; error: string };

export function classifyFile(file: File): ClassifiedFile {
  const rule = RULES[extensionOf(file.name)];
  if (!rule || !rule.mimeTypes.includes(mimeTypeOf(file).toLowerCase())) {
    return { ok: false, error: `${file.name}: loại file không được hỗ trợ` };
  }
  if (file.size > rule.maxBytes) {
    return { ok: false, error: `${file.name}: vượt quá ${rule.maxBytes / MB} MB` };
  }
  if (file.size === 0) {
    return { ok: false, error: `${file.name}: file rỗng` };
  }
  return { ok: true, kind: rule.kind };
}

interface SignedUpload {
  kind: AttachmentKind;
  maxBytes: number;
  uploadUrl: string;
  fields: Record<string, string | number>;
}

// Separate client: Cloudinary must never receive our Authorization header or cookies
const uploadClient = axios.create({ withCredentials: false });

export const attachmentService = {
  async sign(conversationId: string, file: File): Promise<SignedUpload> {
    const res = await api.post('/message/attachments/sign', {
      conversationId,
      fileName: file.name,
      mimeType: mimeTypeOf(file),
      size: file.size,
    });
    return res.data;
  },

  // Signs, then uploads straight to Cloudinary. Returns the reference to send with the message.
  async upload(
    conversationId: string,
    file: File,
    onProgress?: (fraction: number) => void
  ): Promise<{ publicId: string; kind: AttachmentKind }> {
    const signed = await attachmentService.sign(conversationId, file);
    const form = new FormData();
    // Exactly the signed fields (any change invalidates the signature), then the file
    Object.entries(signed.fields).forEach(([key, value]) => form.append(key, String(value)));
    form.append('file', file);
    await uploadClient.post(signed.uploadUrl, form, {
      onUploadProgress: (event) => {
        if (event.total) onProgress?.(Math.min(event.loaded / event.total, 1));
      },
    });
    return { publicId: String(signed.fields.public_id), kind: signed.kind };
  },
};
