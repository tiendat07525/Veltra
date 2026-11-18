import React, { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { authService } from '@/services/api/auth.service';
import { useCopyFeedback } from '@/hooks/use-copy-feedback';
import { InlineError } from '@/components/ui/InlineError';

interface ChangePasswordFormProps {
  // Called after the password changed (the button shows "Đã đổi" for 2 s)
  onSuccess: () => void;
  // 2FA on: the server also needs a TOTP or backup code
  twoFactorEnabled: boolean;
}

const inputClass =
  'w-full px-3 py-2 rounded-xl bg-surface border border-line text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20';

// Same rule as the server (ChangePasswordDto): 6–100 characters, different from the current one
export const ChangePasswordForm: React.FC<ChangePasswordFormProps> = ({ onSuccess, twoFactorEnabled }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const done = useCopyFeedback();
  const [submitting, setSubmitting] = useState(false);

  const validate = (): string | null => {
    if (!currentPassword) return 'Nhập mật khẩu hiện tại';
    if (newPassword.length < 6 || newPassword.length > 100) return 'Mật khẩu mới phải có 6–100 ký tự';
    if (newPassword !== confirmPassword) return 'Mật khẩu nhập lại không khớp';
    if (newPassword === currentPassword) return 'Mật khẩu mới phải khác mật khẩu hiện tại';
    if (twoFactorEnabled && !code.trim()) return 'Nhập mã xác thực 2 bước';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await authService.changePassword(
        currentPassword,
        newPassword,
        twoFactorEnabled ? code.trim() : undefined
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setCode('');
      done.flash();
      onSuccess();
    } catch (err: unknown) {
      const apiErr = err as { response?: { status?: number; data?: { message?: string | string[] } } };
      const message = apiErr.response?.data?.message;
      setError(
        apiErr.response?.status === 429
          ? 'Thử lại quá nhiều lần, vui lòng đợi một phút'
          : (Array.isArray(message) ? message[0] : message) || 'Không thể đổi mật khẩu'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-5">
      <div>
        <h4 className="text-xs font-semibold text-fg">Đổi mật khẩu</h4>
        <p className="text-[11px] text-fg-muted">
          Sau khi đổi, mọi thiết bị khác sẽ bị đăng xuất; thiết bị này vẫn giữ đăng nhập.
        </p>
      </div>

      <input
        type="password"
        autoComplete="current-password"
        placeholder="Mật khẩu hiện tại"
        aria-label="Mật khẩu hiện tại"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        className={inputClass}
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder="Mật khẩu mới (6–100 ký tự)"
        aria-label="Mật khẩu mới"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        className={inputClass}
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder="Nhập lại mật khẩu mới"
        aria-label="Nhập lại mật khẩu mới"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        className={inputClass}
      />
      {twoFactorEnabled && (
        <input
          type="text"
          autoComplete="one-time-code"
          spellCheck={false}
          maxLength={20}
          placeholder="Mã xác thực 2 bước (6 số hoặc mã dự phòng)"
          aria-label="Mã xác thực 2 bước"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className={inputClass}
        />
      )}

      <InlineError message={error} onDismiss={() => setError(null)} />

      <button
        type="submit"
        disabled={submitting}
        className="flex items-center justify-center gap-2 min-h-10 px-4 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-on-primary text-xs font-semibold"
      >
        {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {!submitting && done.isFlashed() && <Check className="w-3.5 h-3.5" />}
        {done.isFlashed() ? 'Đã đổi' : 'Đổi mật khẩu'}
      </button>
    </form>
  );
};
