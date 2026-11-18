import React, { useState } from 'react';
import { Copy, Download, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { authService } from '@/services/api/auth.service';
import { TwoFactorSetup, TwoFactorStatus } from '@/types/auth';
import { formatDate } from '@/lib/utils';

interface TwoFactorSectionProps {
  status: TwoFactorStatus | null;
  loadFailed: boolean;
  // Reloads GET /auth/2fa after a change
  onChanged: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type Step =
  | { kind: 'idle' }
  | { kind: 'setup-password' }
  | { kind: 'setup-verify'; setup: TwoFactorSetup }
  | { kind: 'disable' }
  | { kind: 'regenerate' }
  | { kind: 'codes'; codes: string[] };

const inputClass =
  'w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40';
const primaryButton =
  'flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-semibold';
const secondaryButton =
  'flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50';

const errorText = (err: unknown, fallback: string) => {
  const apiErr = err as { response?: { status?: number; data?: { message?: string | string[] } } };
  if (apiErr.response?.status === 429) return 'Thử lại quá nhiều lần, vui lòng đợi một phút';
  const message = apiErr.response?.data?.message;
  return (Array.isArray(message) ? message[0] : message) || fallback;
};

// "ABCD EFGH IJKL ..." is easier to type into an app than one long string
const groupSecret = (secret: string) => secret.match(/.{1,4}/g)?.join(' ') ?? secret;

export const TwoFactorSection: React.FC<TwoFactorSectionProps> = ({ status, loadFailed, onChanged, showToast }) => {
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const goTo = (next: Step) => {
    setStep(next);
    setPassword('');
    setCode('');
    setError(null);
  };

  const run = async (action: () => Promise<void>, fallback: string) => {
    setError(null);
    setSubmitting(true);
    try {
      await action();
    } catch (err: unknown) {
      setError(errorText(err, fallback));
      setCode('');
    } finally {
      setSubmitting(false);
    }
  };

  const copy = (text: string, done: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => showToast(done, 'success'))
      .catch(() => showToast('Không thể sao chép', 'error'));
  };

  const downloadCodes = (codes: string[]) => {
    const blob = new Blob([`Mã dự phòng Veltra (mỗi mã dùng một lần)\n\n${codes.join('\n')}\n`], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'veltra-backup-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSetup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return setError('Nhập mật khẩu hiện tại');
    void run(async () => {
      const setup = await authService.setupTwoFactor(password);
      goTo({ kind: 'setup-verify', setup });
    }, 'Không thể bắt đầu thiết lập');
  };

  const handleEnable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return setError('Nhập mã 6 số trong ứng dụng');
    void run(async () => {
      const { backupCodes } = await authService.enableTwoFactor(code.trim());
      goTo({ kind: 'codes', codes: backupCodes });
      showToast('Đã bật xác thực 2 bước', 'success');
      onChanged();
    }, 'Không thể bật xác thực 2 bước');
  };

  const handleDisable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !code.trim()) return setError('Nhập mật khẩu và mã xác thực');
    void run(async () => {
      const { message } = await authService.disableTwoFactor(password, code.trim());
      goTo({ kind: 'idle' });
      showToast(message || 'Đã tắt xác thực 2 bước', 'success');
      onChanged();
    }, 'Không thể tắt xác thực 2 bước');
  };

  const handleRegenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !/^\d{6}$/.test(code.trim())) return setError('Nhập mật khẩu và mã 6 số trong ứng dụng');
    void run(async () => {
      const { backupCodes } = await authService.regenerateBackupCodes(password, code.trim());
      goTo({ kind: 'codes', codes: backupCodes });
      showToast('Đã tạo mã dự phòng mới', 'success');
      onChanged();
    }, 'Không thể tạo mã dự phòng');
  };

  const errorLine = error && <p className="text-xs text-rose-500">{error}</p>;
  const cancelButton = (
    <button type="button" onClick={() => goTo({ kind: 'idle' })} disabled={submitting} className={secondaryButton}>
      Huỷ
    </button>
  );
  const passwordInput = (
    <input
      type="password"
      autoComplete="current-password"
      placeholder="Mật khẩu hiện tại"
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      className={inputClass}
    />
  );
  const codeInput = (placeholder: string) => (
    <input
      type="text"
      autoComplete="one-time-code"
      spellCheck={false}
      maxLength={20}
      placeholder={placeholder}
      value={code}
      onChange={(e) => setCode(e.target.value)}
      className={inputClass}
    />
  );
  const submitButton = (label: string) => (
    <button type="submit" disabled={submitting} className={primaryButton}>
      {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {label}
    </button>
  );

  return (
    <div className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
      <div className="flex items-start gap-3">
        {status?.enabled ? (
          <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
        ) : (
          <ShieldOff className="w-5 h-5 text-slate-400 shrink-0" />
        )}
        <div>
          <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Xác thực 2 bước</h4>
          <p className="text-[11px] text-slate-500">
            {status === null
              ? loadFailed
                ? 'Không tải được trạng thái, thử mở lại mục này.'
                : 'Đang tải…'
              : status.enabled
                ? `Đang bật${status.enabledAt ? ` từ ${formatDate(status.enabledAt)}` : ''} · còn ${status.backupCodesRemaining} mã dự phòng`
                : 'Khi đăng nhập, cần thêm mã 6 số từ ứng dụng xác thực (Google Authenticator, Authy, …).'}
          </p>
        </div>
      </div>

      {status && step.kind === 'idle' && (
        <div className="flex flex-wrap gap-2">
          {status.enabled ? (
            <>
              <button type="button" onClick={() => goTo({ kind: 'regenerate' })} className={secondaryButton}>
                Tạo lại mã dự phòng
              </button>
              <button
                type="button"
                onClick={() => goTo({ kind: 'disable' })}
                className={`${secondaryButton} text-rose-600 dark:text-rose-400`}
              >
                Tắt xác thực 2 bước
              </button>
            </>
          ) : (
            <button type="button" onClick={() => goTo({ kind: 'setup-password' })} className={primaryButton}>
              Bật xác thực 2 bước
            </button>
          )}
        </div>
      )}

      {step.kind === 'setup-password' && (
        <form onSubmit={handleSetup} className="space-y-3">
          <p className="text-[11px] text-slate-500">Xác nhận mật khẩu để bắt đầu.</p>
          {passwordInput}
          {errorLine}
          <div className="flex gap-2">
            {submitButton('Tiếp tục')}
            {cancelButton}
          </div>
        </form>
      )}

      {step.kind === 'setup-verify' && (
        <form onSubmit={handleEnable} className="space-y-3">
          <p className="text-[11px] text-slate-500">
            1. Trong ứng dụng xác thực, chọn thêm tài khoản bằng khoá thiết lập và nhập khoá dưới đây (loại: theo thời
            gian). Trên điện thoại có thể bấm “Mở trong ứng dụng”.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-900 dark:text-white break-all select-all">
              {groupSecret(step.setup.secret)}
            </code>
            <button
              type="button"
              onClick={() => copy(step.setup.secret, 'Đã sao chép khoá')}
              className={secondaryButton}
              aria-label="Sao chép khoá"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <a href={step.setup.otpauthUrl} className="inline-block text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline">
            Mở trong ứng dụng
          </a>
          <p className="text-[11px] text-slate-500">2. Nhập mã 6 số ứng dụng hiển thị (khoá hết hạn sau 10 phút).</p>
          {codeInput('123456')}
          {errorLine}
          <div className="flex gap-2">
            {submitButton('Bật')}
            {cancelButton}
          </div>
        </form>
      )}

      {step.kind === 'codes' && (
        <div className="space-y-3">
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Lưu các mã dự phòng này ở nơi an toàn. Mỗi mã dùng được một lần khi không có ứng dụng xác thực. Chúng chỉ
            hiện một lần.
          </p>
          <ul className="grid grid-cols-2 gap-1.5 font-mono text-xs text-slate-900 dark:text-white">
            {step.codes.map((c) => (
              <li key={c} className="px-2 py-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-center select-all">
                {c}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => copy(step.codes.join('\n'), 'Đã sao chép mã dự phòng')} className={secondaryButton}>
              <Copy className="w-3.5 h-3.5" /> Sao chép
            </button>
            <button type="button" onClick={() => downloadCodes(step.codes)} className={secondaryButton}>
              <Download className="w-3.5 h-3.5" /> Tải .txt
            </button>
            <button type="button" onClick={() => goTo({ kind: 'idle' })} className={primaryButton}>
              Tôi đã lưu
            </button>
          </div>
        </div>
      )}

      {step.kind === 'disable' && (
        <form onSubmit={handleDisable} className="space-y-3">
          <p className="text-[11px] text-slate-500">Nhập mật khẩu và mã 6 số trong ứng dụng (hoặc một mã dự phòng).</p>
          {passwordInput}
          {codeInput('Mã xác thực')}
          {errorLine}
          <div className="flex gap-2">
            {submitButton('Tắt')}
            {cancelButton}
          </div>
        </form>
      )}

      {step.kind === 'regenerate' && (
        <form onSubmit={handleRegenerate} className="space-y-3">
          <p className="text-[11px] text-slate-500">
            Các mã dự phòng cũ sẽ ngừng hoạt động. Cần mã 6 số trong ứng dụng (không dùng mã dự phòng).
          </p>
          {passwordInput}
          {codeInput('123456')}
          {errorLine}
          <div className="flex gap-2">
            {submitButton('Tạo mã mới')}
            {cancelButton}
          </div>
        </form>
      )}
    </div>
  );
};
