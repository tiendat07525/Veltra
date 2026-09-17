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
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Settings & Preferences</h1>
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
            <span>Appearance & Theme</span>
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
            <span>Notifications</span>
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
            <span>Privacy & Visibility</span>
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
            <span>Chat Experience</span>
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
            <span>Security & Sessions</span>
          </button>
        </div>

        {/* Right Settings Detail Panel */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs">
          {/* Section: Appearance */}
          {activeSection === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Interface Theme</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Select how Veltra looks on your device.
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
                  <span>Light</span>
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
                  <span>Dark (Default)</span>
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
                  <span>System Auto</span>
                </button>
              </div>
            </div>
          )}

          {/* Section: Notifications */}
          {activeSection === 'notifications' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Alerts & Sounds</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Configure incoming audio chimes and system banners.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Sound Effects</h4>
                    <p className="text-[11px] text-slate-500">Play pleasant sound for incoming messages and reactions</p>
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
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Message Previews</h4>
                    <p className="text-[11px] text-slate-500">Show message text preview in desktop notification popups</p>
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
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Do Not Disturb</h4>
                    <p className="text-[11px] text-slate-500">Mute all alert sounds and notification badges temporarily</p>
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
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Privacy Controls</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Manage read receipts and your online status visibility.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Send Read Receipts</h4>
                    <p className="text-[11px] text-slate-500">Allow others to see when you have read their messages</p>
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
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Display Last Seen Timestamp</h4>
                    <p className="text-[11px] text-slate-500">Share your last active timestamp with team members</p>
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
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Chat Behavior</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Tune keyboard shortcuts and media handling.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Press Enter to Send</h4>
                    <p className="text-[11px] text-slate-500">Pressing Enter immediately sends message; Shift+Enter creates newline</p>
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
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Auto-download Shared Photos</h4>
                    <p className="text-[11px] text-slate-500">Automatically cache media on fast connections</p>
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
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Security & Active Devices</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Monitor signed-in clients and multi-factor encryption keys.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Two-Factor Authentication (2FA)</h4>
                  <p className="text-[11px] text-slate-500">Require an authenticator app code on new logins</p>
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
                  Active Sessions
                </h4>

                <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-5 h-5 text-sky-500" />
                    <div>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Chrome on macOS Sonoma (Current)
                      </p>
                      <span className="text-[10px] text-emerald-500 font-medium">Active now • San Francisco, US</span>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 rounded-md font-bold">
                    THIS DEVICE
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
