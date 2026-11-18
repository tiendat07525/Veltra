import React, { useEffect, useState } from 'react';
import { Bell, Moon, Sun, Monitor, MessageSquare, Lock, Smartphone, Volume2, UserCircle, LogOut } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';
import type { BrowserNotificationPermission } from '@/hooks/use-browser-notifications';
import { authService } from '@/services/api/auth.service';
import { CurrentSession, UserSettingsPatch } from '@/types/settings';
import { formatDate, formatTime } from '@/lib/utils';
import { playNotificationSound } from '@/lib/notification-sound';
import { ChangePasswordForm } from './ChangePasswordForm';
import { TwoFactorSection } from './TwoFactorSection';
import { TwoFactorStatus } from '@/types/auth';
import { InlineError } from '@/components/ui/InlineError';

type Section = 'appearance' | 'notifications' | 'chat' | 'security' | 'account';

interface SettingsViewProps {
  theme: 'dark' | 'light' | 'system';
  onThemeChange: (theme: 'dark' | 'light' | 'system') => void;
  settingsHook: ReturnType<typeof useSettings>;
  browserPermission: BrowserNotificationPermission;
  onRequestBrowserPermission: () => void;
  // Sign out of this device (the only sign-out entry on mobile, where there is no left rail)
  onLogout: () => void;
}

const SECTIONS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: 'appearance', label: 'Giao diện', icon: Moon },
  { id: 'notifications', label: 'Thông báo', icon: Bell },
  { id: 'chat', label: 'Trò chuyện', icon: MessageSquare },
  { id: 'security', label: 'Bảo mật', icon: Lock },
  { id: 'account', label: 'Tài khoản', icon: UserCircle },
];

// "Chrome trên Windows" from a user agent string (display only)
function describeUserAgent(ua: string | null): string {
  if (!ua) return 'Trình duyệt không xác định';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Trình duyệt';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'hệ điều hành khác';
  return `${browser} trên ${os}`;
}

const formatDateTime = (iso: string) => `${formatDate(iso)} · ${formatTime(iso)}`;

type SettingKey = 'browser' | 'sound' | 'doNotDisturb' | 'enterToSend';

interface ToggleRowProps {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  children?: React.ReactNode;
  // Save failed for this toggle (it is switched back by useSettings)
  error?: string | null;
  onDismissError?: () => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({
  title,
  description,
  checked,
  disabled,
  onChange,
  children,
  error,
  onDismissError,
}) => (
  <div className="py-4 first:pt-0 last:pb-0 space-y-2">
    <label className="flex items-center justify-between gap-4 cursor-pointer">
      <div>
        <h4 className="text-xs font-semibold text-fg">{title}</h4>
        <p className="text-[11px] text-fg-muted">{description}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="w-5 h-5 shrink-0 accent-primary rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
    {children}
    <InlineError message={error} onDismiss={onDismissError} />
  </div>
);

export const SettingsView: React.FC<SettingsViewProps> = ({
  theme,
  onThemeChange,
  settingsHook,
  browserPermission,
  onRequestBrowserPermission,
  onLogout,
}) => {
  const [activeSection, setActiveSection] = useState<Section>('appearance');
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [twoFactor, setTwoFactor] = useState<TwoFactorStatus | null>(null);
  const [twoFactorLoadFailed, setTwoFactorLoadFailed] = useState(false);
  const { settings, loaded } = settingsHook;

  useEffect(() => {
    if (activeSection !== 'security') return;
    authService
      .getSession()
      .then(setSession)
      .catch(() => setSession(null));
    loadTwoFactor();
  }, [activeSection]);

  function loadTwoFactor() {
    authService
      .getTwoFactorStatus()
      .then((status) => {
        setTwoFactor(status);
        setTwoFactorLoadFailed(false);
      })
      .catch(() => setTwoFactorLoadFailed(true));
  }

  const [saveError, setSaveError] = useState<SettingKey | null>(null);
  const save = (key: SettingKey, patch: UserSettingsPatch) => {
    setSaveError(null);
    settingsHook.update(patch).catch(() => setSaveError(key));
  };
  const toggleErrorProps = (key: SettingKey) => ({
    error: saveError === key ? 'Không thể lưu cài đặt. Thử lại sau.' : null,
    onDismissError: () => setSaveError(null),
  });

  const themeOption = (
    value: 'light' | 'dark' | 'system',
    Icon: React.ElementType,
    label: string,
    note?: string
  ) => (
    <button
      type="button"
      role="radio"
      aria-checked={theme === value}
      onClick={() => onThemeChange(value)}
      className={`p-3 sm:p-4 rounded-2xl border flex flex-col items-center gap-2 text-xs font-semibold text-center transition-colors ${
        theme === value
          ? 'border-primary bg-accent-soft text-accent'
          : 'border-line text-fg hover:bg-surface-2'
      }`}
    >
      <span
        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          theme === value ? 'bg-surface text-accent' : 'bg-surface-2 text-fg-muted'
        }`}
      >
        <Icon className="w-5 h-5" aria-hidden="true" />
      </span>
      <span>{label}</span>
      {note && <span className="-mt-1.5 text-[10px] font-medium text-fg-muted">{note}</span>}
    </button>
  );
  const sectionTitle = (title: string, description: string) => (
    <div>
      <h3 className="text-base font-bold text-fg">{title}</h3>
      <p className="text-xs text-fg-muted mt-0.5">{description}</p>
    </div>
  );

  return (
    <div className="flex-1 h-full flex flex-col bg-app overflow-hidden">
      {/* Header */}
      <header className="h-16 px-4 sm:px-6 border-b border-line bg-surface flex items-center shrink-0">
        <h1 className="text-xl font-bold text-fg">Cài đặt</h1>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row max-w-6xl w-full mx-auto p-3 sm:p-6 gap-3 md:gap-6">
        {/* Section navigation */}
        {/* Mobile: 5 equal cells (icon above label), no sideways scrolling. Desktop: vertical list. */}
        <div
          className="w-full md:w-60 grid grid-cols-5 md:flex md:flex-col gap-1 shrink-0"
          role="tablist"
          aria-label="Mục cài đặt"
        >
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeSection === id}
              onClick={() => setActiveSection(id)}
              className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 px-1 md:px-4 py-2 md:py-2.5 rounded-xl text-[10px] md:text-xs font-semibold md:text-left transition-colors ${
                activeSection === id ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:text-fg hover:bg-surface-2'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="leading-tight text-center md:text-left">{label}</span>
            </button>
          ))}
        </div>

        {/* Section detail */}
        <div className="flex-1 overflow-y-auto bg-surface border border-line rounded-3xl p-4 sm:p-6">
          {activeSection === 'appearance' && (
            <div className="space-y-6">
              {sectionTitle('Chủ đề giao diện', 'Chọn cách Veltra hiển thị trên thiết bị này.')}
              <div className="grid grid-cols-3 gap-2 sm:gap-3" role="radiogroup" aria-label="Chủ đề giao diện">
                {themeOption('light', Sun, 'Sáng')}
                {themeOption('dark', Moon, 'Tối')}
                {themeOption('system', Monitor, 'Theo hệ thống', 'Mặc định')}
              </div>
            </div>
          )}

          {activeSection === 'notifications' && (
            <div className="space-y-5">
              {sectionTitle(
                'Thông báo & Âm thanh',
                'Áp dụng cho mọi thiết bị bạn đăng nhập. Hội thoại đã tắt thông báo không phát âm thanh hay hiện thông báo.'
              )}

              <div className="divide-y divide-line">
                <ToggleRow
                  title="Thông báo trình duyệt"
                  description="Hiện thông báo hệ thống khi Veltra đang ở tab ẩn (không kèm nội dung tin nhắn)"
                  checked={settings.notifications.browser}
                  disabled={!loaded}
                  onChange={(browser) => save('browser', { notifications: { browser } })}
                  {...toggleErrorProps('browser')}
                >
                  {settings.notifications.browser && browserPermission === 'default' && (
                    <button
                      type="button"
                      onClick={onRequestBrowserPermission}
                      className="min-h-9 px-3 rounded-xl bg-primary hover:bg-primary-hover text-on-primary text-[11px] font-semibold"
                    >
                      Cho phép trên trình duyệt này
                    </button>
                  )}
                  {settings.notifications.browser && browserPermission === 'denied' && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      Trình duyệt đang chặn thông báo của Veltra; hãy cho phép trong cài đặt trang của trình duyệt.
                    </p>
                  )}
                  {settings.notifications.browser && browserPermission === 'unsupported' && (
                    <p className="text-[11px] text-fg-muted">Trình duyệt này không hỗ trợ thông báo.</p>
                  )}
                </ToggleRow>

                <ToggleRow
                  title="Âm thanh tin nhắn mới"
                  description="Khi tab bị ẩn hoặc tin nhắn thuộc hội thoại khác hội thoại đang mở"
                  checked={settings.notifications.sound}
                  disabled={!loaded}
                  onChange={(sound) => save('sound', { notifications: { sound } })}
                  {...toggleErrorProps('sound')}
                >
                  <button
                    type="button"
                    onClick={playNotificationSound}
                    className="flex items-center gap-1.5 min-h-9 px-3 rounded-xl bg-surface-2 hover:bg-line text-fg text-[11px] font-semibold"
                  >
                    <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Nghe thử
                  </button>
                </ToggleRow>

                <ToggleRow
                  title="Không làm phiền"
                  description="Tắt mọi âm thanh và thông báo trình duyệt; số chưa đọc vẫn hiển thị"
                  checked={settings.notifications.doNotDisturb}
                  disabled={!loaded}
                  onChange={(doNotDisturb) => save('doNotDisturb', { notifications: { doNotDisturb } })}
                  {...toggleErrorProps('doNotDisturb')}
                />
              </div>
            </div>
          )}

          {activeSection === 'chat' && (
            <div className="space-y-5">
              {sectionTitle('Trò chuyện', 'Cách gõ và gửi tin nhắn.')}
              <ToggleRow
                title="Nhấn Enter để gửi"
                description={
                  settings.chat.enterToSend
                    ? 'Enter gửi tin nhắn, Shift+Enter xuống dòng'
                    : 'Ctrl+Enter (⌘+Enter trên Mac) gửi tin nhắn, Enter xuống dòng'
                }
                checked={settings.chat.enterToSend}
                disabled={!loaded}
                onChange={(enterToSend) => save('enterToSend', { chat: { enterToSend } })}
                {...toggleErrorProps('enterToSend')}
              />
            </div>
          )}

          {activeSection === 'security' && (
            <div className="space-y-5">
              {sectionTitle(
                'Bảo mật',
                'Mỗi tài khoản chỉ có một phiên đăng nhập: đăng nhập ở nơi khác sẽ đăng xuất phiên này.'
              )}

              {/* Sub-sections separated by lines, no boxes inside the card */}
              <div className="divide-y divide-line">
                <div className="pb-5 flex items-start gap-3">
                  <Smartphone className="w-5 h-5 text-accent shrink-0 mt-0.5" aria-hidden="true" />
                  {session ? (
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-fg">
                        {describeUserAgent(session.userAgent)} (phiên hiện tại)
                      </p>
                      <p className="text-[11px] text-fg-muted">
                        Đăng nhập {formatDateTime(session.createdAt)} · Hết hạn {formatDateTime(session.expiresAt)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-fg-muted">Đang tải thông tin phiên…</p>
                  )}
                </div>

                <TwoFactorSection
                  status={twoFactor}
                  loadFailed={twoFactorLoadFailed}
                  onChanged={loadTwoFactor}
                />

                <ChangePasswordForm
                  twoFactorEnabled={!!twoFactor?.enabled}
                  onSuccess={() => {
                    // The session was replaced: show the new one
                    authService.getSession().then(setSession).catch(() => {});
                    // A backup code may have been used
                    loadTwoFactor();
                  }}
                />
              </div>
            </div>
          )}

          {activeSection === 'account' && (
            <div className="space-y-5">
              {sectionTitle('Tài khoản', 'Đăng xuất khỏi Veltra trên thiết bị này.')}
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-2 min-h-10 px-4 rounded-xl border border-line text-xs font-semibold text-danger hover:bg-danger-soft transition-colors"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
