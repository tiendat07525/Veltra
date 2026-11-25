import React, { useRef } from 'react';
import { Camera, Check, Loader2, User, Mail, Phone } from 'lucide-react';
import { CurrentUserProfile } from '@/types/user';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { InlineError } from '@/components/ui/InlineError';
import { useCopyFeedback } from '@/hooks/use-copy-feedback';
import { AVATAR_ACCEPT } from '@/services/api/avatar.service';
import { useProfileForm } from '@/hooks/use-profile-form';

interface ProfileViewProps {
  currentUser: CurrentUserProfile | null;
  // The profile read when the view opens, and after each save
  onProfile: (profile: CurrentUserProfile) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ currentUser, onProfile }) => {
  const form = useProfileForm(currentUser, onProfile);
  // "Đã lưu" on the save button for 2 s
  const saved = useCopyFeedback();

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const uploading = form.avatarProgress !== null;
  const busy = form.saving || uploading || !currentUser;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await form.save()) saved.flash();
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-app overflow-hidden">
      <header className="h-16 px-4 sm:px-6 border-b border-line bg-surface flex items-center shrink-0">
        <h1 className="text-xl font-bold text-fg">Hồ sơ tài khoản</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-3 sm:p-6">
        <div className="max-w-2xl mx-auto bg-surface border border-line rounded-3xl p-4 sm:p-8">
          {/* Avatar Section */}
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 pb-6 border-b border-line">
            <UserAvatar
              src={form.avatarUrl}
              name={form.displayName}
              size="xl"
              className="w-24 h-24 rounded-2xl ring-4 ring-primary/25"
            />

            <div className="text-center sm:text-left min-w-0">
              <h2 className="text-lg font-bold text-fg break-words">{form.displayName}</h2>
              <p className="text-xs text-accent font-medium">@{currentUser?.username ?? ''}</p>
              <div className="mt-2.5 flex flex-wrap justify-center sm:justify-start gap-2">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept={AVATAR_ACCEPT}
                  className="hidden"
                  aria-label="Chọn ảnh đại diện"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    // The same file can be picked again after an error
                    e.target.value = '';
                    if (file) void form.changeAvatar(file);
                  }}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => avatarInputRef.current?.click()}
                  className="flex items-center gap-1.5 min-h-9 px-3 rounded-xl border border-line text-xs font-semibold text-fg hover:bg-surface-2 disabled:opacity-60 transition-colors"
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Camera className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span aria-live="polite">
                    {uploading ? `Đang tải ${Math.round((form.avatarProgress ?? 0) * 100)}%` : 'Đổi ảnh'}
                  </span>
                </button>
                {form.avatarUrl && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => form.setField('avatarUrl', '')}
                    className="min-h-9 px-3 rounded-xl border border-line text-xs font-semibold text-fg hover:bg-surface-2 disabled:opacity-60 transition-colors"
                  >
                    Xoá ảnh
                  </button>
                )}
              </div>
              <InlineError message={form.avatarError} onDismiss={form.clearAvatarError} className="mt-2" />
            </div>
          </div>

          <InlineError message={form.loadError} onDismiss={form.clearLoadError} className="mt-4" />

          {/* Form */}
          <form onSubmit={handleSave} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="profile-display-name" className="block text-xs font-semibold text-fg mb-1.5">
                  Tên hiển thị
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    id="profile-display-name"
                    type="text"
                    value={form.displayName}
                    onChange={(e) => form.setField('displayName', e.target.value)}
                    className="w-full min-h-10 pl-9 pr-3 py-2 bg-surface rounded-xl text-xs text-fg border border-line focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary aria-[invalid=true]:border-danger"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="profile-username" className="block text-xs font-semibold text-fg mb-1.5">
                  Tên người dùng
                </label>
                <div className="relative">
                  <span className="text-xs text-fg-muted absolute left-3 top-1/2 -translate-y-1/2 font-semibold" aria-hidden="true">@</span>
                  <input
                    id="profile-username"
                    type="text"
                    value={currentUser?.username ?? ''}
                    readOnly
                    aria-describedby="username-locked"
                    className="w-full pl-8 pr-3 py-2 min-h-10 bg-surface-2 rounded-xl text-xs text-fg-muted border border-line cursor-not-allowed focus:outline-hidden"
                  />
                </div>
                <p id="username-locked" className="mt-1 text-[11px] text-fg-muted">
                  Không thể thay đổi tên người dùng
                </p>
              </div>
            </div>

            <div>
              <label htmlFor="profile-bio" className="block text-xs font-semibold text-fg mb-1.5">
                Tiểu sử & Trạng thái
              </label>
              <textarea
                id="profile-bio"
                rows={3}
                value={form.bio}
                onChange={(e) => form.setField('bio', e.target.value)}
                className="w-full p-3 bg-surface rounded-xl text-xs text-fg border border-line focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="profile-email" className="block text-xs font-semibold text-fg mb-1.5">
                  Địa chỉ email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    id="profile-email"
                    type="email"
                    value={currentUser?.email ?? ''}
                    readOnly
                    aria-describedby="email-locked"
                    className="w-full pl-9 pr-3 py-2 min-h-10 bg-surface-2 rounded-xl text-xs text-fg-muted border border-line cursor-not-allowed focus:outline-hidden"
                  />
                </div>
                <p id="email-locked" className="mt-1 text-[11px] text-fg-muted">
                  Không thể thay đổi email
                </p>
              </div>

              <div>
                <label htmlFor="profile-phone" className="block text-xs font-semibold text-fg mb-1.5">
                  Số điện thoại
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    id="profile-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(e) => form.setField('phone', e.target.value)}
                    className="w-full min-h-10 pl-9 pr-3 py-2 bg-surface rounded-xl text-xs text-fg border border-line focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary aria-[invalid=true]:border-danger"
                    aria-invalid={!!form.phoneError}
                  />
                </div>
                <InlineError message={form.phoneError} onDismiss={form.clearPhoneError} className="mt-1.5" />
              </div>
            </div>

            <InlineError message={form.saveError} onDismiss={form.clearSaveError} />

            <div className="pt-2 sm:pt-4 flex justify-end">
              <button
                type="submit"
                disabled={busy}
                className="w-full sm:w-auto flex items-center justify-center gap-2 min-h-10 px-6 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-60 text-on-primary text-xs font-semibold transition-colors"
              >
                {form.saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
                <span>{saved.isFlashed() ? 'Đã lưu' : 'Lưu hồ sơ'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
