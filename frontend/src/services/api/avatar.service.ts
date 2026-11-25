import api from './api';
import { CurrentUserProfile } from '@/types/user';
import { SignedUpload, uploadSigned } from './cloudinary-upload';

// Mirrors the server rules (backend/src/profile/avatar.rules.ts).
// These checks only give fast feedback: the server re-checks the stored file.
const MB = 1024 * 1024;
const MAX_BYTES = 5 * MB;
const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

// For <input type="file" accept>
export const AVATAR_ACCEPT = Object.keys(MIME_TYPES)
  .map((ext) => `.${ext}`)
  .join(',');

const expectedMime = (file: File) => {
  const ext = /\.([A-Za-z0-9]{1,5})$/.exec(file.name)?.[1].toLowerCase() ?? '';
  return MIME_TYPES[ext];
};

// Why a file cannot be the avatar; null when it can
export function avatarFileError(file: File): string | null {
  const mime = expectedMime(file);
  // Some browsers leave File.type empty
  if (!mime || (file.type && file.type.toLowerCase() !== mime)) return 'Ảnh phải là file jpg, png hoặc webp';
  if (file.size > MAX_BYTES) return `Ảnh vượt quá ${MAX_BYTES / MB} MB`;
  if (file.size === 0) return 'File ảnh rỗng';
  return null;
}

export const avatarService = {
  // Signs, uploads straight to Cloudinary, then makes it the avatar. Returns the stored profile.
  async upload(file: File, onProgress?: (fraction: number) => void): Promise<CurrentUserProfile> {
    const { data: signed } = await api.post<SignedUpload>('/users/avatar/sign', {
      fileName: file.name,
      mimeType: file.type || expectedMime(file),
      size: file.size,
    });
    const publicId = await uploadSigned(signed, file, onProgress);
    const res = await api.put<CurrentUserProfile>('/users/avatar', { publicId });
    return res.data;
  },
};
