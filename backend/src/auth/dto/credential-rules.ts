import { registerDecorator, ValidationOptions } from 'class-validator';

// Rules for NEW usernames and passwords only (register, change password). Login and
// current-password checks stay as they were, so existing accounts keep working.
// frontend/src/lib/credential-rules.ts repeats them for the forms: change both together.

export const PASSWORD_MIN_LENGTH = 6;
// bcrypt ignores everything after 72 bytes (not characters: "ă" is 2 bytes, an emoji 4)
export const PASSWORD_MAX_BYTES = 72;

const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/i;

// Names that could pass for the people running the app; underscores are ignored
const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'helpdesk',
  'mod',
  'moderator',
  'official',
  'owner',
  'root',
  'security',
  'staff',
  'superuser',
  'support',
  'sysadmin',
  'system',
  'veltra',
  'veltraadmin',
  'veltraofficial',
  'veltrasupport',
  'veltrateam',
]);

// The first rule a new username breaks, or null
export const usernameProblem = (value: unknown): string | null => {
  if (typeof value !== 'string' || !USERNAME_PATTERN.test(value)) {
    return 'Tên đăng nhập dài 3–30 ký tự, chỉ gồm chữ không dấu, số và dấu _';
  }
  if (RESERVED_USERNAMES.has(value.toLowerCase().replace(/_/g, ''))) {
    return 'Tên đăng nhập này không được sử dụng';
  }
  return null;
};

// What a new password lacks, or null
export const passwordProblem = (value: unknown): string | null => {
  if (typeof value !== 'string') return 'Mật khẩu không hợp lệ';
  if (Buffer.byteLength(value, 'utf8') > PASSWORD_MAX_BYTES) {
    return `Mật khẩu quá dài (tối đa ${PASSWORD_MAX_BYTES} byte)`;
  }
  const missing: string[] = [];
  if (value.length < PASSWORD_MIN_LENGTH) {
    missing.push(`ít nhất ${PASSWORD_MIN_LENGTH} ký tự`);
  }
  if (!/[a-z]/.test(value)) missing.push('chữ thường (a-z)');
  if (!/[A-Z]/.test(value)) missing.push('chữ in hoa (A-Z)');
  if (!/[0-9]/.test(value)) missing.push('số (0-9)');
  if (!/[\p{P}\p{S}]/u.test(value)) missing.push('ký tự đặc biệt');
  return missing.length > 0 ? `Mật khẩu cần có: ${missing.join(', ')}` : null;
};

const rule =
  (name: string, problem: (value: unknown) => string | null) =>
  (options?: ValidationOptions): PropertyDecorator =>
  (target, propertyName) =>
    registerDecorator({
      name,
      target: target.constructor,
      propertyName: propertyName as string,
      options,
      validator: {
        validate: (value: unknown) => problem(value) === null,
        defaultMessage: (args) => problem(args?.value) ?? '',
      },
    });

export const IsNewUsername = rule('isNewUsername', usernameProblem);
export const IsNewPassword = rule('isNewPassword', passwordProblem);
