import React, { useState } from 'react';
import { Check, Copy, Download, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { authService } from '@/services/api/auth.service';
import { TwoFactorSetup, TwoFactorStatus } from '@/types/auth';
import { formatDate } from '@/lib/utils';
import { apiErrorText } from '@/lib/api-error';
import { useCopyFeedback } from '@/hooks/use-copy-feedback';
import { InlineError } from '@/components/ui/InlineError';

interface TwoFactorSectionProps {
  status: TwoFactorStatus | null;
  loadFailed: boolean;
  // Reloads GET /auth/2fa after a change
  onChanged: () => void;
}

type Step =
  | { kind: 'idle' }
  | { kind: 'setup-password' }
  | { kind: 'setup-verify'; setup: TwoFactorSetup }
  | { kind: 'disable' }
  | { kind: 'regenerate' }
  | { kind: 'codes'; codes: string[] };

const inputClass =
  'w-full px-3 py-2 rounded-xl bg-surface border border-line text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20';
const primaryButton =
  'flex items-center justify-center gap-2 min-h-10 px-4 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-on-primary text-xs font-semibold';
const secondaryButton =
  'flex items-center justify-center gap-1.5 min-h-10 px-3 rounded-xl border border-line text-xs font-semibold text-fg hover:bg-surface-2 disabled:opacity-50';

// "ABCD EFGH IJKL ..." is easier to type into an app than one long string
const groupSecret = (secret: string) => secret.match(/.{1,4}/g)?.join(' ') ?? secret;

export const TwoFactorSection: React.FC<TwoFactorSectionProps> = ({ status, loadFailed, onChanged }) => {
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // "Đã sao chép" on the copy buttons for 2 s
  const copied = useCopyFeedback();

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
      setError(apiErrorText(err, fallback));
      setCode('');
    } finally {
      setSubmitting(false);
    }
  };

  const copy = (text: string, key: 'secret' | 'codes') => {
    setError(null);
    navigator.clipboard
      .writeText(text)
      .then(() => copied.flash(key))
      .catch(() => setError('Không thể sao chép, hãy chọn và sao chép thủ công'));
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
      onChanged();
    }, 'Không thể bật xác thực 2 bước');
  };

  const handleDisable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !code.trim()) return setError('Nhập mật khẩu và mã xác thực');
    void run(async () => {
      await authService.disableTwoFactor(password, code.trim());
      goTo({ kind: 'idle' });
      onChanged();
    }, 'Không thể tắt xác thực 2 bước');
  };

  const handleRegenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !/^\d{6}$/.test(code.trim())) return setError('Nhập mật khẩu và mã 6 số trong ứng dụng');
    void run(async () => {
      const { backupCodes } = await authService.regenerateBackupCodes(password, code.trim());
      goTo({ kind: 'codes', codes: backupCodes });
      onChanged();
    }, 'Không thể tạo mã dự phòng');
  };

  const errorLine = <InlineError message={error} onDismiss={() => setError(null)} />;
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
      aria-label="Mật khẩu hiện tại"
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
      aria-label="Mã xác thực"
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
    <div className="space-y-3 py-5">
      <div className="flex items-start gap-3">
        {status?.enabled ? (
          <ShieldCheck className="w-5 h-5 text-online shrink-0 mt-0.5" aria-hidden="true" />
        ) : (
          <ShieldOff className="w-5 h-5 text-fg-muted shrink-0 mt-0.5" aria-hidden="true" />
        )}
        <div>
          <h4 className="text-xs font-semibold text-fg">Xác thực 2 bước</h4>
          <p className="text-[11px] text-fg-muted">
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
                className={`${secondaryButton} text-danger`}
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
          <p className="text-[11px] text-fg-muted">Xác nhận mật khẩu để bắt đầu.</p>
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
          <p className="text-[11px] text-fg-muted">
            1. Trong ứng dụng xác thực, chọn thêm tài khoản bằng khoá thiết lập và nhập khoá dưới đây (loại: theo thời
            gian). Trên điện thoại có thể bấm “Mở trong ứng dụng”.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-surface-2 border border-line font-mono text-xs text-fg break-all select-all">
              {groupSecret(step.setup.secret)}
            </code>
            <button
              type="button"
              onClick={() => copy(step.setup.secret, 'secret')}
              className={secondaryButton}
              aria-label={copied.isFlashed('secret') ? 'Đã sao chép khoá' : 'Sao chép khoá'}
            >
              {copied.isFlashed('secret') ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <a href={step.setup.otpauthUrl} className="inline-block text-xs font-semibold text-accent hover:underline">
            Mở trong ứng dụng
          </a>
          <p className="text-[11px] text-fg-muted">2. Nhập mã 6 số ứng dụng hiển thị (khoá hết hạn sau 10 phút).</p>
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
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            Lưu các mã dự phòng này ở nơi an toàn. Mỗi mã dùng được một lần khi không có ứng dụng xác thực. Chúng chỉ
            hiện một lần.
          </p>
          <ul className="grid grid-cols-2 gap-1.5 font-mono text-xs text-fg">
            {step.codes.map((c) => (
              <li key={c} className="px-2 py-1 rounded-lg bg-surface-2 border border-line text-center select-all">
                {c}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => copy(step.codes.join('\n'), 'codes')} className={secondaryButton}>
              {copied.isFlashed('codes') ? (
                <>
                  <Check className="w-3.5 h-3.5" /> Đã sao chép
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Sao chép
                </>
              )}
            </button>
            <button type="button" onClick={() => downloadCodes(step.codes)} className={secondaryButton}>
              <Download className="w-3.5 h-3.5" /> Tải .txt
            </button>
            <button type="button" onClick={() => goTo({ kind: 'idle' })} className={primaryButton}>
              Tôi đã lưu
            </button>
          </div>
          {errorLine}
        </div>
      )}

      {step.kind === 'disable' && (
        <form onSubmit={handleDisable} className="space-y-3">
          <p className="text-[11px] text-fg-muted">Nhập mật khẩu và mã 6 số trong ứng dụng (hoặc một mã dự phòng).</p>
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
          <p className="text-[11px] text-fg-muted">
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
