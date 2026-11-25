import { UserBasicInfo } from '@/types/user';

// `ref` with the new name / avatar when it is that user, else `ref` itself.
// All three keys are set, so a field the event leaves out is cleared.
export function withUser<T extends string | UserBasicInfo | null>(ref: T, user: UserBasicInfo): T {
  if (!ref || typeof ref !== 'object' || ref._id !== user._id) return ref;
  const { username, displayName, avatarUrl } = user;
  return { ...ref, username, displayName, avatarUrl };
}
