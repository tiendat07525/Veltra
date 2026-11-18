import React, { useState, useEffect } from 'react';
import { Camera, Check, Loader2, User, Mail, Phone } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { authService } from '@/services/api/auth.service';
import { userService } from '@/services/api/user.service';
import { InlineError } from '@/components/ui/InlineError';
import { useCopyFeedback } from '@/hooks/use-copy-feedback';

export const ProfileView: React.FC = () => {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [avatar, setAvatar] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // "Đã lưu" on the save button for 2 s
  const saved = useCopyFeedback();

  useEffect(() => {
    authService.getCurrentUser().then((u) => {
      if (u) {
        setDisplayName(u.displayName || '');
        setUsername(u.username || '');
        setBio(u.bio || '');
        setEmail(u.email || '');
        setPhoneNumber(u.phone || '');
        setAvatar(u.avatarUrl || '');
      }
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // Normalize phone number: remove all non-digit characters
    const normalizedPhone = phoneNumber.replace(/\D/g, '');

    setPhoneError(null);
    setSaveError(null);
    if (normalizedPhone && normalizedPhone.length > 11) {
      setPhoneError('Số điện thoại không hợp lệ (tối đa 11 số)');
      return;
    }

    setSaving(true);
    try {
      await userService.updateProfile({
        displayName,
        bio,
        phone: normalizedPhone,
        avatarUrl: avatar,
      });
      saved.flash();
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string | string[] } } };
      const errorMsg = apiErr?.response?.data?.message;
      let uiMessage = 'Lưu cài đặt hồ sơ thất bại. Vui lòng kiểm tra lại thông tin.';

      if (Array.isArray(errorMsg) && errorMsg.length > 0) {
        uiMessage = errorMsg[0];
      } else if (typeof errorMsg === 'string') {
        uiMessage = errorMsg;
      }

      setSaveError(uiMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleRandomAvatar = () => {
    const randomSeed = Math.floor(Math.random() * 1000);
    const newAvatar = `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80&sig=${randomSeed}`;
    setAvatar(newAvatar);
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
            <div className="relative group">
              <UserAvatar
                src={avatar}
                name={displayName}
                size="xl"
                className="w-24 h-24 rounded-2xl ring-4 ring-primary/25"
              />
              <button
                type="button"
                onClick={handleRandomAvatar}
                className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                title="Thay đổi ảnh đại diện"
                aria-label="Thay đổi ảnh đại diện"
              >
                <Camera className="w-6 h-6" aria-hidden="true" />
              </button>
            </div>

            <div className="text-center sm:text-left min-w-0">
              <h2 className="text-lg font-bold text-fg break-words">{displayName}</h2>
              <p className="text-xs text-accent font-medium">@{username}</p>
              <button
                type="button"
                onClick={handleRandomAvatar}
                className="mt-2.5 min-h-9 px-3 rounded-xl border border-line text-xs font-semibold text-fg hover:bg-surface-2 transition-colors"
              >
                Thay đổi ảnh đại diện
              </button>
            </div>
          </div>

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
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
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
                    value={username}
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
                value={bio}
                onChange={(e) => setBio(e.target.value)}
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
                    value={email}
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
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full min-h-10 pl-9 pr-3 py-2 bg-surface rounded-xl text-xs text-fg border border-line focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary aria-[invalid=true]:border-danger"
                    aria-invalid={!!phoneError}
                  />
                </div>
                <InlineError message={phoneError} onDismiss={() => setPhoneError(null)} className="mt-1.5" />
              </div>
            </div>

            <InlineError message={saveError} onDismiss={() => setSaveError(null)} />

            <div className="pt-2 sm:pt-4 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto flex items-center justify-center gap-2 min-h-10 px-6 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-60 text-on-primary text-xs font-semibold transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
                <span>{saved.isFlashed() ? 'Đã lưu' : 'Lưu hồ sơ'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
