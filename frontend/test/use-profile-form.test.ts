// @vitest-environment happy-dom
import { useState } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserProfile } from '@/types/user';

type Profile = CurrentUserProfile;
const { getCurrentUser, updateProfile, upload } = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<CurrentUserProfile>>(),
  updateProfile: vi.fn<(updates: Partial<CurrentUserProfile>) => Promise<CurrentUserProfile>>(),
  upload: vi.fn<(file: File, onProgress?: (fraction: number) => void) => Promise<CurrentUserProfile>>(),
}));
vi.mock('@/services/api/auth.service', () => ({ authService: { getCurrentUser } }));
vi.mock('@/services/api/user.service', () => ({ userService: { updateProfile } }));
vi.mock('@/services/api/avatar.service', async (original) => ({
  ...(await original<typeof import('@/services/api/avatar.service')>()),
  avatarService: { upload },
}));

import { useProfileForm } from '@/hooks/use-profile-form';

const me: Profile = { _id: 'me', username: 'an', email: 'an@x.vn', displayName: 'An', bio: 'Chào' };
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
// The profile is owned outside the form (useChat)
const render = (initial: Profile | null = me) =>
  renderHook(() => {
    const [user, setUser] = useState(initial);
    return { user, form: useProfileForm(user, setUser) };
  });
const open = async (initial: Profile | null = me) => {
  const view = render(initial);
  await act(async () => {});
  return view;
};
type View = Awaited<ReturnType<typeof open>>;
const edit = (view: View, field: Parameters<View['result']['current']['form']['setField']>[0], value: string) =>
  act(() => view.result.current.form.setField(field, value));
const save = async (view: View) => {
  let ok = false;
  await act(async () => {
    ok = await view.result.current.form.save();
  });
  return ok;
};

beforeEach(() => {
  getCurrentUser.mockReset().mockResolvedValue(me);
  upload.mockReset();
  updateProfile.mockReset().mockImplementation(async (updates) => ({ ...me, ...updates }));
});
afterEach(cleanup);

describe('useProfileForm', () => {
  it('sends only the field that changed: no empty phone, no avatarUrl', async () => {
    const view = await open();
    edit(view, 'displayName', 'An Mới');
    expect(await save(view)).toBe(true);
    expect(updateProfile.mock.calls).toEqual([[{ displayName: 'An Mới' }]]);
    expect(view.result.current.user?.displayName).toBe('An Mới');
  });

  it('sends nothing when nothing changed', async () => {
    const view = await open();
    edit(view, 'bio', 'x');
    edit(view, 'bio', 'Chào');
    expect(await save(view)).toBe(true);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('shows the newer profile read on opening, and keeps what is being typed', async () => {
    const read = deferred<Profile>();
    getCurrentUser.mockReturnValue(read.promise);
    const view = await open();
    edit(view, 'displayName', 'Đang gõ');
    await act(async () => read.resolve({ ...me, displayName: 'Máy khác', bio: 'Bio mới' }));
    expect(view.result.current.form).toMatchObject({ displayName: 'Đang gõ', bio: 'Bio mới' });
    await save(view);
    expect(updateProfile.mock.calls).toEqual([[{ displayName: 'Đang gõ' }]]);
  });

  it('does not go back to the profile read on opening when a save came first', async () => {
    const read = deferred<Profile>();
    getCurrentUser.mockReturnValue(read.promise);
    const view = await open();
    edit(view, 'bio', 'Đã lưu');
    await save(view);
    await act(async () => read.resolve(me));
    expect(view.result.current.form.bio).toBe('Đã lưu');
  });

  it('sends the phone as digits, and an empty one only to clear a stored number', async () => {
    const view = await open();
    edit(view, 'phone', ' 0912 345-678 ');
    await save(view);
    edit(view, 'phone', '');
    await save(view);
    expect(updateProfile.mock.calls).toEqual([[{ phone: '0912345678' }], [{ phone: '' }]]);
  });

  it.each(['abc', '+', '0123456789012'])('refuses the phone "%s" without a request', async (phone) => {
    const view = await open({ ...me, phone: '0912345678' });
    edit(view, 'phone', phone);
    expect(await save(view)).toBe(false);
    expect(view.result.current.form.phoneError).toBe('Số điện thoại không hợp lệ (tối đa 11 số)');
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('removes the avatar', async () => {
    const stored = { ...me, avatarUrl: 'http://old.example/a.png' };
    getCurrentUser.mockResolvedValue(stored);
    const view = await open(stored);
    edit(view, 'avatarUrl', '');
    expect(view.result.current.form.avatarUrl).toBe('');
    await save(view);
    expect(updateProfile.mock.calls).toEqual([[{ avatarUrl: '' }]]);
  });

  it('keeps the edits and shows the server message when a save fails', async () => {
    updateProfile.mockRejectedValue({ response: { data: { message: ['Tên quá dài'] } } });
    const view = await open();
    edit(view, 'displayName', 'X');
    expect(await save(view)).toBe(false);
    expect(view.result.current.form).toMatchObject({ displayName: 'X', saveError: 'Tên quá dài', saving: false });
    expect(view.result.current.user).toBe(me);
  });

  it('keeps what is typed while a save runs', async () => {
    const stored = deferred<Profile>();
    updateProfile.mockReturnValue(stored.promise);
    const view = await open();
    edit(view, 'bio', 'Một');
    let done!: Promise<boolean>;
    act(() => {
      done = view.result.current.form.save();
    });
    edit(view, 'bio', 'Một hai');
    await act(async () => {
      stored.resolve({ ...me, bio: 'Một' });
      await done;
    });
    expect(view.result.current.form.bio).toBe('Một hai');
    expect(view.result.current.user?.bio).toBe('Một');
  });

  it('reports a failed read; without any profile nothing is saved', async () => {
    getCurrentUser.mockRejectedValue(new Error('offline'));
    const view = await open(null);
    expect(view.result.current.form.loadError).toBe('Không thể tải hồ sơ mới nhất. Thử lại sau.');
    edit(view, 'bio', 'x');
    expect(await save(view)).toBe(false);
    expect(updateProfile).not.toHaveBeenCalled();
  });
});

describe('useProfileForm: avatar', () => {
  const photo = new File(['x'], 'me.png', { type: 'image/png' });
  const uploaded = { ...me, avatarUrl: 'https://res.cloudinary.com/demo/me' };
  const change = (view: View, file: File) =>
    act(async () => {
      void view.result.current.form.changeAvatar(file);
    });

  it('stores the uploaded avatar at once and keeps the other edits', async () => {
    const done = deferred<Profile>();
    upload.mockReturnValue(done.promise);
    const view = await open();
    edit(view, 'bio', 'Đang gõ');
    await change(view, photo);
    act(() => upload.mock.calls[0][1]?.(0.5));
    expect(view.result.current.form.avatarProgress).toBe(0.5);
    await act(async () => done.resolve(uploaded));
    expect(view.result.current.form).toMatchObject({
      avatarUrl: uploaded.avatarUrl,
      bio: 'Đang gõ',
      avatarProgress: null,
      avatarError: null,
    });
    expect(view.result.current.user?.avatarUrl).toBe(uploaded.avatarUrl);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('forgets a removal that was not saved', async () => {
    upload.mockResolvedValue(uploaded);
    const view = await open({ ...me, avatarUrl: 'https://old.example/a.png' });
    edit(view, 'avatarUrl', '');
    await change(view, photo);
    expect(view.result.current.form.avatarUrl).toBe(uploaded.avatarUrl);
    await save(view);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('keeps the current avatar and a pending removal when the upload fails', async () => {
    upload.mockRejectedValue({ response: { data: { message: 'Ảnh sai định dạng hoặc quá dung lượng' } } });
    const stored = { ...me, avatarUrl: 'https://old.example/a.png' };
    getCurrentUser.mockResolvedValue(stored);
    const view = await open(stored);
    await change(view, photo);
    expect(view.result.current.form).toMatchObject({
      avatarUrl: stored.avatarUrl,
      avatarError: 'Ảnh sai định dạng hoặc quá dung lượng',
      avatarProgress: null,
    });
    edit(view, 'avatarUrl', '');
    await change(view, photo);
    expect(view.result.current.form.avatarUrl).toBe('');
  });

  it.each([
    [new File(['x'], 'me.gif', { type: 'image/gif' }), 'Ảnh phải là file jpg, png hoặc webp'],
    [new File(['x'], 'me.png', { type: 'text/html' }), 'Ảnh phải là file jpg, png hoặc webp'],
    [new File([], 'me.png', { type: 'image/png' }), 'File ảnh rỗng'],
    [new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'me.png', { type: 'image/png' }), 'Ảnh vượt quá 5 MB'],
  ])('refuses a bad file without a request (%#)', async (file, message) => {
    const view = await open();
    await change(view, file);
    expect(view.result.current.form.avatarError).toBe(message);
    expect(upload).not.toHaveBeenCalled();
  });

  it('runs one request at a time: no save during an upload, no upload during a save', async () => {
    const done = deferred<Profile>();
    upload.mockReturnValue(done.promise);
    const view = await open();
    await change(view, photo);
    await change(view, photo);
    expect(upload).toHaveBeenCalledTimes(1);
    edit(view, 'bio', 'x');
    expect(await save(view)).toBe(false);
    expect(updateProfile).not.toHaveBeenCalled();
    await act(async () => done.resolve(uploaded));

    const stored = deferred<Profile>();
    updateProfile.mockReturnValue(stored.promise);
    act(() => void view.result.current.form.save());
    await change(view, photo);
    expect(upload).toHaveBeenCalledTimes(1);
    await act(async () => stored.resolve({ ...uploaded, bio: 'x' }));
  });

  it('does not go back to the profile read on opening when an upload came first', async () => {
    const read = deferred<Profile>();
    getCurrentUser.mockReturnValue(read.promise);
    upload.mockResolvedValue(uploaded);
    const view = await open();
    await change(view, photo);
    await act(async () => read.resolve(me));
    expect(view.result.current.form.avatarUrl).toBe(uploaded.avatarUrl);
  });
});
