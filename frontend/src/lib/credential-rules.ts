// Same rules as the server (backend/src/auth/dto/credential-rules.ts), only to show the problem
// while typing. Reserved usernames are checked by the server alone.

export const PASSWORD_MIN_LENGTH = 6;
// bcrypt ignores everything after 72 bytes
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_HINT = 'Ít nhất 6 ký tự, có chữ thường, chữ in hoa, số và ký tự đặc biệt.';
export const USERNAME_HINT = '3–30 ký tự: chữ không dấu, số và dấu _.';

export function usernameProblem(value: string): string | null {
  return /^[a-z0-9_]{3,30}$/i.test(value)
    ? null
    : 'Tên đăng nhập dài 3–30 ký tự, chỉ gồm chữ không dấu, số và dấu _';
}

export function passwordProblem(value: string): string | null {
  if (new TextEncoder().encode(value).length > PASSWORD_MAX_BYTES) {
    return `Mật khẩu quá dài (tối đa ${PASSWORD_MAX_BYTES} byte)`;
  }
  const missing: string[] = [];
  if (value.length < PASSWORD_MIN_LENGTH) missing.push(`ít nhất ${PASSWORD_MIN_LENGTH} ký tự`);
  if (!/[a-z]/.test(value)) missing.push('chữ thường (a-z)');
  if (!/[A-Z]/.test(value)) missing.push('chữ in hoa (A-Z)');
  if (!/[0-9]/.test(value)) missing.push('số (0-9)');
  if (!/[\p{P}\p{S}]/u.test(value)) missing.push('ký tự đặc biệt');
  return missing.length > 0 ? `Mật khẩu cần có: ${missing.join(', ')}` : null;
}
