import { useCallback, useEffect, useRef, useState } from 'react';
import { CurrentUserProfile } from '@/types/user';
import { authService } from '@/services/api/auth.service';
import { avatarFileError, avatarService } from '@/services/api/avatar.service';
import { userService } from '@/services/api/user.service';

// Server message (a string, or a list from the DTO check), else the Vietnamese fallback
const serverMessage = (err: unknown, fallback: string) => {
  const message = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return (Array.isArray(message) ? message[0] : message) || fallback;
};

type EditableField = 'displayName' | 'bio' | 'phone' | 'avatarUrl';

/**
 * Profile form: shows `currentUser` with the fields edited here on top, and sends only the
 * fields that changed, so it never writes back an old copy of the others.
 * A new avatar is uploaded and stored at once, without the save button.
 * `onProfile` gets the profile re-read when the form opens and the one returned by a save or an upload.
 */
export function useProfileForm(
  currentUser: CurrentUserProfile | null,
  onProfile: (profile: CurrentUserProfile) => void
) {
  const [draft, setDraft] = useState<Partial<Record<EditableField, string>>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  // 0..1 while an avatar is uploading
  const [avatarProgress, setAvatarProgress] = useState<number | null>(null);
  // A save or an avatar upload started: the copy read when the form opened may be older than it
  const saveStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    authService
      .getCurrentUser()
      .then((profile) => {
        if (!cancelled && !saveStarted.current) onProfile(profile);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Không thể tải hồ sơ mới nhất. Thử lại sau.');
      });
    return () => {
      cancelled = true;
    };
  }, [onProfile]);

  const valueOf = (field: EditableField) => draft[field] ?? currentUser?.[field] ?? '';

  const setField = useCallback((field: EditableField, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Resolves to true once the profile is stored (also when nothing changed)
  const save = async (): Promise<boolean> => {
    if (!currentUser || saving || avatarProgress !== null) return false;
    setPhoneError(null);
    setSaveError(null);

    const phoneText = valueOf('phone').trim();
    const phone = phoneText.replace(/\D/g, '');
    // Text without any digit must not clear the stored number
    if (phone.length > 11 || (phoneText && !phone)) {
      setPhoneError('Số điện thoại không hợp lệ (tối đa 11 số)');
      return false;
    }

    const values = {
      displayName: valueOf('displayName'),
      bio: valueOf('bio'),
      phone,
      avatarUrl: valueOf('avatarUrl'),
    };
    const updates: Partial<CurrentUserProfile> = {};
    for (const field of Object.keys(values) as EditableField[]) {
      if (draft[field] !== undefined && values[field] !== (currentUser[field] ?? '')) {
        updates[field] = values[field];
      }
    }

    if (Object.keys(updates).length > 0) {
      setSaving(true);
      saveStarted.current = true;
      try {
        onProfile(await userService.updateProfile(updates));
      } catch (err: unknown) {
        setSaveError(serverMessage(err, 'Lưu cài đặt hồ sơ thất bại. Vui lòng kiểm tra lại thông tin.'));
        return false;
      } finally {
        setSaving(false);
      }
    }

    // Keep what was typed while the request ran
    setDraft((prev) => {
      const next = { ...prev };
      for (const field of Object.keys(draft) as EditableField[]) {
        if (next[field] === draft[field]) delete next[field];
      }
      return next;
    });
    return true;
  };

  // One request at a time: a save and an upload would each answer with a profile that misses the other's change
  const changeAvatar = async (file: File): Promise<void> => {
    if (!currentUser || saving || avatarProgress !== null) return;
    const fileError = avatarFileError(file);
    setAvatarError(fileError);
    if (fileError) return;

    setAvatarProgress(0);
    saveStarted.current = true;
    try {
      const profile = await avatarService.upload(file, setAvatarProgress);
      // A removal picked before but not saved no longer applies
      setDraft((prev) => {
        const next = { ...prev };
        delete next.avatarUrl;
        return next;
      });
      onProfile(profile);
    } catch (err: unknown) {
      setAvatarError(serverMessage(err, 'Không thể tải ảnh lên. Thử lại sau.'));
    } finally {
      setAvatarProgress(null);
    }
  };

  return {
    displayName: valueOf('displayName'),
    bio: valueOf('bio'),
    phone: valueOf('phone'),
    avatarUrl: valueOf('avatarUrl'),
    setField,
    save,
    changeAvatar,
    avatarProgress,
    avatarError,
    clearAvatarError: () => setAvatarError(null),
    saving,
    loadError,
    phoneError,
    saveError,
    clearPhoneError: () => setPhoneError(null),
    clearSaveError: () => setSaveError(null),
    clearLoadError: () => setLoadError(null),
  };
}
