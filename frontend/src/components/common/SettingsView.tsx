import React, { useEffect, useState } from 'react';
import { Bell, Moon, MessageSquare, Lock, Smartphone, Volume2 } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';
import type { BrowserNotificationPermission } from '@/hooks/use-browser-notifications';
import { authService } from '@/services/api/auth.service';
import { CurrentSession, UserSettingsPatch } from '@/types/settings';
import { formatDate, formatTime } from '@/lib/utils';
import { playNotificationSound } from '@/lib/notification-sound';
import { ChangePasswordForm } from './ChangePasswordForm';

type Section = 'appearance' | 'notifications' | 'chat' | 'security';

interface SettingsViewProps {
  theme: 'dark' | 'light' | 'system';
  onThemeChange: (theme: 'dark' | 'light' | 'system') => void;
  settingsHook: ReturnType<typeof useSettings>;
  browserPermission: BrowserNotificationPermission;
  onRequestBrowserPermission: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const SECTIONS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: 'appearance', label: 'Giao diện', icon: Moon },
  { id: 'notifications', label: 'Thông báo', icon: Bell },
  { id: 'chat', label: 'Trò chuyện', icon: MessageSquare },
  { id: 'security', label: 'Bảo mật', icon: Lock },
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

interface ToggleRowProps {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  children?: React.ReactNode;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ title, description, checked, disabled, onChange, children }) => (
  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 space-y-2">
    <label className="flex items-center justify-between gap-4 cursor-pointer">
      <div>
        <h4 className="text-xs font-semibold text-slate-900 dark:text-white">{title}</h4>
        <p className="text-[11px] text-slate-500">{description}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="w-5 h-5 shrink-0 accent-sky-500 rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
    {children}
  </div>
);

export const SettingsView: React.FC<SettingsViewProps> = ({
  theme,
  onThemeChange,
  settingsHook,
  browserPermission,
  onRequestBrowserPermission,
  showToast,
}) => {
  const [activeSection, setActiveSection] = useState<Section>('appearance');
  const [session, setSession] = useState<CurrentSession | null>(null);
  const { settings, loaded } = settingsHook;

  useEffect(() => {
    if (activeSection !== 'security') return;
    authService
      .getSession()
      .then(setSession)
      .catch(() => setSession(null));
  }, [activeSection]);

  const save = (patch: UserSettingsPatch) => {
    settingsHook.update(patch).catch(() => showToast('Không thể lưu cài đặt', 'error'));
  };

  const themeOption = (value: 'light' | 'dark' | 'system', icon: string, label: string) => (
    <button
      type="button"
      onClick={() => onThemeChange(value)}
      className={`p-4 rounded-2xl border flex flex-col items-center gap-2 text-xs font-medium transition-all ${
        theme === value
          ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-950/40 text-sky-500'
          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
      }`}
    >
      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-center">
        {icon}
      </div>
      <span>{label}</span>
    </button>
  );

  return (
    <div className="flex-1 h-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Header */}
      <header className="h-16 px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center shrink-0">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Cài đặt</h1>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row max-w-6xl w-full mx-auto p-4 sm:p-6 gap-6">
        {/* Section navigation */}
        <div className="w-full md:w-60 flex md:flex-col gap-1 overflow-x-auto shrink-0">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveSection(id)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold text-left transition-all shrink-0 ${
                activeSection === id
                  ? 'bg-sky-500 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Section detail */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs">
          {activeSection === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Chủ đề giao diện</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Chọn cách Veltra hiển thị trên thiết bị này.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {themeOption('light', '☀️', 'Sáng')}
                {themeOption('dark', '🌙', 'Tối (Mặc định)')}
                {themeOption('system', '💻', 'Theo hệ thống')}
              </div>
            </div>
          )}

          {activeSection === 'notifications' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Thông báo & Âm thanh</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Áp dụng cho mọi thiết bị bạn đăng nhập. Hội thoại đã tắt thông báo không phát âm thanh hay
                  hiện thông báo.
                </p>
              </div>

              <div className="space-y-3">
                <ToggleRow
                  title="Thông báo trình duyệt"
                  description="Hiện thông báo hệ thống khi Veltra đang ở tab ẩn (không kèm nội dung tin nhắn)"
                  checked={settings.notifications.browser}
                  disabled={!loaded}
                  onChange={(browser) => save({ notifications: { browser } })}
                >
                  {settings.notifications.browser && browserPermission === 'default' && (
                    <button
                      type="button"
                      onClick={onRequestBrowserPermission}
                      className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-[11px] font-medium"
                    >
                      Cho phép trên trình duyệt này
                    </button>
                  )}
                  {settings.notifications.browser && browserPermission === 'denied' && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      Trình duyệt đang chặn thông báo của Veltra; hãy cho phép trong cài đặt trang của trình duyệt.
                    </p>
                  )}
                  {settings.notifications.browser && browserPermission === 'unsupported' && (
                    <p className="text-[11px] text-slate-500">Trình duyệt này không hỗ trợ thông báo.</p>
                  )}
                </ToggleRow>

                <ToggleRow
                  title="Âm thanh tin nhắn mới"
                  description="Khi tab bị ẩn hoặc tin nhắn thuộc hội thoại khác hội thoại đang mở"
                  checked={settings.notifications.sound}
                  disabled={!loaded}
                  onChange={(sound) => save({ notifications: { sound } })}
                >
                  <button
                    type="button"
                    onClick={playNotificationSound}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-[11px] font-medium"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    Nghe thử
                  </button>
                </ToggleRow>

                <ToggleRow
                  title="Không làm phiền"
                  description="Tắt mọi âm thanh và thông báo trình duyệt; số chưa đọc vẫn hiển thị"
                  checked={settings.notifications.doNotDisturb}
                  disabled={!loaded}
                  onChange={(doNotDisturb) => save({ notifications: { doNotDisturb } })}
                />
              </div>
            </div>
          )}

          {activeSection === 'chat' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Trò chuyện</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Cách gõ và gửi tin nhắn.</p>
              </div>
              <ToggleRow
                title="Nhấn Enter để gửi"
                description={
                  settings.chat.enterToSend
                    ? 'Enter gửi tin nhắn, Shift+Enter xuống dòng'
                    : 'Ctrl+Enter (⌘+Enter trên Mac) gửi tin nhắn, Enter xuống dòng'
                }
                checked={settings.chat.enterToSend}
                disabled={!loaded}
                onChange={(enterToSend) => save({ chat: { enterToSend } })}
              />
            </div>
          )}

          {activeSection === 'security' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Bảo mật</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Mỗi tài khoản chỉ có một phiên đăng nhập: đăng nhập ở nơi khác sẽ đăng xuất phiên này.
                </p>
              </div>

              <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-sky-500 shrink-0" />
                {session ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {describeUserAgent(session.userAgent)} (phiên hiện tại)
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Đăng nhập {formatDateTime(session.createdAt)} · Hết hạn {formatDateTime(session.expiresAt)}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Đang tải thông tin phiên…</p>
                )}
              </div>

              <ChangePasswordForm
                onSuccess={(message) => {
                  showToast(message, 'success');
                  // The session was replaced: show the new one
                  authService.getSession().then(setSession).catch(() => {});
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
