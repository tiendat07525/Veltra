// Name search inside a list already loaded (friends, conversation members): display name or username,
// case-insensitive, partial, like GET /users?search=. `needle` is already lower-cased and trimmed.
export function userNameMatches(
  user: { displayName?: string; username?: string },
  needle: string
): boolean {
  return [user.displayName, user.username].some((name) => (name || '').toLowerCase().includes(needle));
}
