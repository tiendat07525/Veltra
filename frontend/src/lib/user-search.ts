import { foldText } from './fold-text';

// Name search inside a list already loaded (friends, conversation members): display name or username,
// partial, ignoring case and accents like GET /users?search=. `needle` is already folded (foldText) and trimmed.
export function userNameMatches(
  user: { displayName?: string; username?: string },
  needle: string
): boolean {
  return [user.displayName, user.username].some((name) => foldText(name || '').includes(needle));
}
