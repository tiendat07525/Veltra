import { useCallback, useEffect, useRef, useState } from 'react';
import { CurrentUserProfile } from '@/types/user';
import { authService } from '@/services/api/auth.service';
import { userService } from '@/services/api/user.service';

type EditableField = 'displayName' | 'bio' | 'phone' | 'avatarUrl';

/**
 * Profile form: shows `currentUser` with the fields edited here on top, and sends only the
 * fields that changed, so it never writes back an old copy of the others.
 * `onProfile` gets the profile re-read when the form opens and the one returned by a save.
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
  // A save started: the copy read when the form opened may be older than it
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
    if (!currentUser || saving) return false;
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
        const apiErr = err as { response?: { data?: { message?: string | string[] } } };
        const message = apiErr?.response?.data?.message;
        setSaveError(
          (Array.isArray(message) ? message[0] : message) ||
            'Lưu cài đặt hồ sơ thất bại. Vui lòng kiểm tra lại thông tin.'
        );
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

  return {
    displayName: valueOf('displayName'),
    bio: valueOf('bio'),
    phone: valueOf('phone'),
    avatarUrl: valueOf('avatarUrl'),
    setField,
    save,
    saving,
    loadError,
    phoneError,
    saveError,
    clearPhoneError: () => setPhoneError(null),
    clearSaveError: () => setSaveError(null),
    clearLoadError: () => setLoadError(null),
  };
}
