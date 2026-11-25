import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from '@/types/user';
import { userService } from '@/services/api/user.service';

// Server maximum (QueryUsersDto)
const USER_SEARCH_LIMIT = 50;
const DEBOUNCE_MS = 400;

/**
 * Debounced user search (GET /users?search=: username / display name, case-insensitive, partial).
 * The current user is left out of the results. `handleSearchChange` is stable.
 */
export function useUserSearch(currentUserId: string | undefined) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Latest query typed; a slower response to an older query must not overwrite newer results
  const latestSearchRef = useRef('');

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    clearTimeout(searchTimeoutRef.current);

    const query = value.trim();
    latestSearchRef.current = query;
    setSearchError(null);
    if (!query) {
      setUsers([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const found = await userService.getUsers({ search: query, limit: USER_SEARCH_LIMIT });
        if (latestSearchRef.current === query) setUsers(found);
      } catch {
        if (latestSearchRef.current === query) {
          setUsers([]);
          setSearchError('Không thể tìm kiếm người dùng. Thử lại sau.');
        }
      } finally {
        if (latestSearchRef.current === query) setSearchLoading(false);
      }
    }, DEBOUNCE_MS);
  }, []);

  // Drop the request that has not been sent yet
  useEffect(() => () => clearTimeout(searchTimeoutRef.current), []);

  const searchResults = useMemo(() => users.filter((u) => u._id !== currentUserId), [users, currentUserId]);

  return { searchQuery, searchResults, searchLoading, searchError, setSearchError, handleSearchChange };
}
