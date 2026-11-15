import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { authService } from '@/services/api/auth.service';

interface ChangePasswordFormProps {
  onSuccess: (message: string) => void;
}

const inputClass =
  'w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40';

// Same rule as the server (ChangePasswordDto): 6–100 characters, different from the current one
export const ChangePasswordForm: React.FC<ChangePasswordFormProps> = ({ onSuccess }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validate = (): string | null => {
    if (!currentPassword) return 'Nhập mật khẩu hiện tại';
    if (newPassword.length < 6 || newPassword.length > 100) return 'Mật khẩu mới phải có 6–100 ký tự';
    if (newPassword !== confirmPassword) return 'Mật khẩu nhập lại không khớp';
    if (newPassword === currentPassword) return 'Mật khẩu mới phải khác mật khẩu hiện tại';
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
      const { message } = await authService.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onSuccess(message || 'Đổi mật khẩu thành công');
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
    <form onSubmit={handleSubmit} className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
      <div>
        <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Đổi mật khẩu</h4>
        <p className="text-[11px] text-slate-500">
          Sau khi đổi, mọi thiết bị khác sẽ bị đăng xuất; thiết bị này vẫn giữ đăng nhập.
        </p>
      </div>

      <input
        type="password"
        autoComplete="current-password"
        placeholder="Mật khẩu hiện tại"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        className={inputClass}
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder="Mật khẩu mới (6–100 ký tự)"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        className={inputClass}
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder="Nhập lại mật khẩu mới"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        className={inputClass}
      />

      {error && <p className="text-xs text-rose-500">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-semibold"
      >
        {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Đổi mật khẩu
      </button>
    </form>
  );
};
