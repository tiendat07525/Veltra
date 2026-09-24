import React, { useState } from 'react';
import {
  User,
  Bell,
  Moon,
  Shield,
  MessageSquare,
  Lock,
  Smartphone,
  Check,
  Radio,
} from 'lucide-react';

interface SettingsViewProps {
  theme: 'dark' | 'light' | 'system';
  onThemeChange: (theme: 'dark' | 'light' | 'system') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  theme,
  onThemeChange,
}) => {
  const [activeSection, setActiveSection] = useState<'appearance' | 'notifications' | 'privacy' | 'chat' | 'security'>('appearance');

  // Toggle states
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [dndEnabled, setDndEnabled] = useState(false);
  const [readReceipts, setReadReceipts] = useState(true);
  const [lastSeenPublic, setLastSeenPublic] = useState(true);
  const [enterToSend, setEnterToSend] = useState(true);
  const [autoDownload, setAutoDownload] = useState(true);
  const [twoFactor, setTwoFactor] = useState(false);

  return (
    <div className="flex-1 h-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Header */}
      <header className="h-16 px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center shrink-0">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Cài đặt & Tùy chọn</h1>
      </header>

      {/* Main Settings Grid */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row max-w-6xl w-full mx-auto p-4 sm:p-6 gap-6">
        {/* Left Section Navigation */}
        <div className="w-full md:w-60 flex md:flex-col gap-1 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveSection('appearance')}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold text-left transition-all ${
              activeSection === 'appearance'
                ? 'bg-sky-500 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900'
            }`}
          >
            <Moon className="w-4 h-4" />
            <span>Giao diện & Chủ đề</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('notifications')}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold text-left transition-all ${
              activeSection === 'notifications'
                ? 'bg-sky-500 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>Thông báo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('privacy')}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold text-left transition-all ${
              activeSection === 'privacy'
                ? 'bg-sky-500 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Quyền riêng tư & Hiển thị</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('chat')}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold text-left transition-all ${
              activeSection === 'chat'
                ? 'bg-sky-500 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Trải nghiệm trò chuyện</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('security')}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold text-left transition-all ${
              activeSection === 'security'
                ? 'bg-sky-500 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Bảo mật & Phiên</span>
          </button>
        </div>

        {/* Right Settings Detail Panel */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs">
          {/* Section: Appearance */}
          {activeSection === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Chủ đề giao diện</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Chọn cách Veltra hiển thị trên thiết bị của bạn.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => onThemeChange('light')}
                  className={`p-4 rounded-2xl border flex flex-col items-center gap-2 text-xs font-medium transition-all ${
                    theme === 'light'
                      ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-950/40 text-sky-600'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center justify-center">
                    ☀️
                  </div>
                  <span>Sáng</span>
                </button>

                <button
                  type="button"
                  onClick={() => onThemeChange('dark')}
                  className={`p-4 rounded-2xl border flex flex-col items-center gap-2 text-xs font-medium transition-all ${
                    theme === 'dark'
                      ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-950/40 text-sky-400'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 shadow-xs flex items-center justify-center text-white">
                    🌙
                  </div>
                  <span>Tối (Mặc định)</span>
                </button>

                <button
                  type="button"
                  onClick={() => onThemeChange('system')}
                  className={`p-4 rounded-2xl border flex flex-col items-center gap-2 text-xs font-medium transition-all ${
                    theme === 'system'
                      ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-950/40 text-sky-500'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 shadow-xs flex items-center justify-center">
                    💻
                  </div>
                  <span>Tự động theo hệ thống</span>
                </button>
              </div>
            </div>
          )}

          {/* Section: Notifications */}
          {activeSection === 'notifications' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Cảnh báo & Âm thanh</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Cấu hình âm thanh thông báo đến và biểu ngữ hệ thống.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Hiệu ứng âm thanh</h4>
                    <p className="text-[11px] text-slate-500">Phát âm thanh dễ chịu cho tin nhắn và cảm xúc mới</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={soundEnabled}
                    onChange={(e) => setSoundEnabled(e.target.checked)}
                    className="w-5 h-5 accent-sky-500 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Xem trước tin nhắn</h4>
                    <p className="text-[11px] text-slate-500">Hiển thị xem trước văn bản tin nhắn trong thông báo pop-up trên máy tính</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={previewEnabled}
                    onChange={(e) => setPreviewEnabled(e.target.checked)}
                    className="w-5 h-5 accent-sky-500 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Không làm phiền</h4>
                    <p className="text-[11px] text-slate-500">Tạm thời tắt tất cả âm thanh thông báo và huy hiệu thông báo</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={dndEnabled}
                    onChange={(e) => setDndEnabled(e.target.checked)}
                    className="w-5 h-5 accent-sky-500 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section: Privacy */}
          {activeSection === 'privacy' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Kiểm soát quyền riêng tư</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Quản lý xác nhận đã đọc và hiển thị trạng thái trực tuyến của bạn.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Gửi thông báo đã đọc</h4>
                    <p className="text-[11px] text-slate-500">Cho phép người khác biết khi bạn đã đọc tin nhắn của họ</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={readReceipts}
                    onChange={(e) => setReadReceipts(e.target.checked)}
                    className="w-5 h-5 accent-sky-500 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Hiển thị thời gian hoạt động gần nhất</h4>
                    <p className="text-[11px] text-slate-500">Chia sẻ thời gian hoạt động gần nhất của bạn với các thành viên trong nhóm</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={lastSeenPublic}
                    onChange={(e) => setLastSeenPublic(e.target.checked)}
                    className="w-5 h-5 accent-sky-500 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section: Chat Experience */}
          {activeSection === 'chat' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Hành vi trò chuyện</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Tinh chỉnh phím tắt và xử lý đa phương tiện.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Nhấn Enter để gửi</h4>
                    <p className="text-[11px] text-slate-500">Nhấn Enter để gửi tin nhắn ngay lập tức; Shift+Enter để tạo dòng mới</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={enterToSend}
                    onChange={(e) => setEnterToSend(e.target.checked)}
                    className="w-5 h-5 accent-sky-500 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Tự động tải ảnh được chia sẻ</h4>
                    <p className="text-[11px] text-slate-500">Tự động lưu trữ phương tiện vào bộ nhớ đệm trên các kết nối nhanh</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoDownload}
                    onChange={(e) => setAutoDownload(e.target.checked)}
                    className="w-5 h-5 accent-sky-500 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section: Security */}
          {activeSection === 'security' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Bảo mật & Thiết bị hoạt động</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Giám sát các máy khách đã đăng nhập và khóa mã hóa đa yếu tố.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Xác thực hai yếu tố (2FA)</h4>
                  <p className="text-[11px] text-slate-500">Yêu cầu mã ứng dụng xác thực khi đăng nhập mới</p>
                </div>
                <input
                  type="checkbox"
                  checked={twoFactor}
                  onChange={(e) => setTwoFactor(e.target.checked)}
                  className="w-5 h-5 accent-sky-500 rounded cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Các phiên hoạt động
                </h4>

                <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-5 h-5 text-sky-500" />
                    <div>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Chrome trên macOS Sonoma (Hiện tại)
                      </p>
                      <span className="text-[10px] text-emerald-500 font-medium">Đang hoạt động • San Francisco, US</span>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 rounded-md font-bold">
                    THIẾT BỊ NÀY
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Bottom App Architecture Information */}
          <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-sky-500" />
              <span>VELTRA Messaging Engine v1.0.0</span>
            </div>
            <span>End-to-End Encryption Protocol v3</span>
          </div>
        </div>
      </div>
    </div>
  );
};
