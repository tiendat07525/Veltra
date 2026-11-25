import { api, setToken, refreshToken } from './api';
import { isSessionRejected } from '@/lib/token-refresh';
import { CurrentUserProfile } from '@/types/user';
import { CurrentSession } from '@/types/settings';
import { BackupCodes, LoginResult, TwoFactorSetup, TwoFactorStatus } from '@/types/auth';

export const authService = {
 
  async getCurrentUser(): Promise<CurrentUserProfile> {
    const res = await api.get('/users/profile');
    return res.data;
  },

  // 2FA on: no token yet, the result carries a challenge for loginTwoFactor
  async login(credentials: { username: string; password: string }): Promise<LoginResult> {
    const res = await api.post('/auth/login', credentials);
    if (res.data.accessToken) {
      setToken(res.data.accessToken);
    }
    return res.data;
  },

  // Second login step: a TOTP code or a backup code
  async loginTwoFactor(challengeToken: string, code: string): Promise<{ message: string }> {
    const res = await api.post('/auth/login/2fa', { challengeToken, code });
    if (res.data.accessToken) {
      setToken(res.data.accessToken);
    }
    return { message: res.data.message };
  },

  async register(data: { username: string; email: string; password: string }): Promise<{ message: string; data: Record<string, unknown> }> {
    const res = await api.post('/auth/register', data);
    return res.data;
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore errors on logout
    } finally {
      setToken(null);
      if (typeof window !== 'undefined') {
        window.location.replace('/auth/login');
      }
    }
  },

  // Signs out every other session; this client gets a new access token (and refresh cookie)
  // code: required when 2FA is on (TOTP or backup code)
  async changePassword(currentPassword: string, newPassword: string, code?: string): Promise<{ message: string }> {
    const res = await api.post('/auth/change-password', {
      currentPassword,
      newPassword,
      ...(code ? { code } : {}),
    });
    if (res.data.accessToken) {
      setToken(res.data.accessToken);
    }
    return { message: res.data.message };
  },

  async getSession(): Promise<CurrentSession> {
    const res = await api.get('/auth/session');
    return res.data;
  },

  async getTwoFactorStatus(): Promise<TwoFactorStatus> {
    const res = await api.get('/auth/2fa');
    return res.data;
  },

  async setupTwoFactor(currentPassword: string): Promise<TwoFactorSetup> {
    const res = await api.post('/auth/2fa/setup', { currentPassword });
    return res.data;
  },

  async enableTwoFactor(code: string): Promise<BackupCodes> {
    const res = await api.post('/auth/2fa/enable', { code });
    return res.data;
  },

  async disableTwoFactor(currentPassword: string, code: string): Promise<{ message: string }> {
    const res = await api.post('/auth/2fa/disable', { currentPassword, code });
    return res.data;
  },

  // Needs a TOTP code from the app (not a backup code); the old backup codes stop working
  async regenerateBackupCodes(currentPassword: string, code: string): Promise<BackupCodes> {
    const res = await api.post('/auth/2fa/backup-codes', { currentPassword, code });
    return res.data;
  },

  // 'unavailable': could not reach the server, the session may still be valid
  async refreshSilent(): Promise<'ok' | 'rejected' | 'unavailable'> {
    try {
      await refreshToken();
      return 'ok';
    } catch (err) {
      return isSessionRejected(err) ? 'rejected' : 'unavailable';
    }
  }
};
