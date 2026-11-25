import {
  ATTACHMENT_RULES,
  MB,
  ROOT_FOLDER,
  UUID,
} from 'src/messages/attachment.rules';

// The frontend mirrors these limits in frontend/src/services/api/avatar.service.ts.
export const AVATAR_MAX_BYTES = 5 * MB;
// What the browser receives (largest place it is shown: 96 CSS px)
export const AVATAR_SIZE_PX = 256;
// No gif: avatars do not move
export const AVATAR_FORMATS = ['jpg', 'jpeg', 'png', 'webp'];

// extension -> accepted client MIME types (pre-check only; the stored format is checked afterwards)
export const AVATAR_MIME_TYPES = Object.fromEntries(
  AVATAR_FORMATS.map((ext) => [ext, ATTACHMENT_RULES.image.mimeTypes[ext]]),
);

export const AVATAR_FOLDER = `${ROOT_FOLDER}/avatars`;
// veltra/avatars/{userId}/{uuid}: "avatars" is not an object id, so it never matches PUBLIC_ID_PATTERN
export const AVATAR_PUBLIC_ID_PATTERN = new RegExp(
  `^${AVATAR_FOLDER}/([0-9a-f]{24})/${UUID}$`,
);
