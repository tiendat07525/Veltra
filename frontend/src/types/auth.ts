// POST /auth/login: a session (2FA off) or a challenge for POST /auth/login/2fa (2FA on)
export type LoginResult =
  | { message: string; accessToken: string; twoFactorRequired?: undefined }
  | { message: string; twoFactorRequired: true; challengeToken: string };

// GET /auth/2fa
export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null; // UTC ISO 8601
  backupCodesRemaining: number;
}

// POST /auth/2fa/setup: shown once, not active until a code from it is confirmed
export interface TwoFactorSetup {
  secret: string; // base32, typed into the authenticator app
  otpauthUrl: string; // otpauth://totp/... (opens the app on a phone)
}

// POST /auth/2fa/enable and /auth/2fa/backup-codes: shown once, each code usable once
export interface BackupCodes {
  backupCodes: string[];
}
