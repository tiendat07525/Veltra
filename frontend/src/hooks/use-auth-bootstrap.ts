import { useCallback, useEffect, useState } from 'react';
import { useRouter } from '@/lib/navigation';
import { getToken } from '@/services/api/api';
import { authService } from '@/services/api/auth.service';

const BOOT_RETRIES = 3;

/**
 * Session at app start: uses the in-memory access token, or a silent refresh with the
 * HttpOnly refresh cookie. Redirects to /auth/login without a session, and away from the
 * auth pages (and /) with one.
 */
export function useAuthBootstrap(pathname: string) {
  const router = useRouter();
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    const initAuth = async () => {
      let token = getToken();
      // Server unreachable: retry after 1, 2, 4 s before giving up (the session may be fine)
      for (let attempt = 0; !token; attempt++) {
        const result = await authService.refreshSilent();
        token = getToken();
        if (token || result !== 'unavailable' || attempt >= BOOT_RETRIES) break;
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
        if (cancelled) return;
        token = getToken();
      }
      if (cancelled) return;

      if (!token) {
        setIsAuthenticated(false);
        if (pathname !== '/auth/login' && pathname !== '/auth/register') {
          router.replace('/auth/login');
        }
      } else {
        setIsAuthenticated(true);
        if (pathname === '/' || pathname.startsWith('/auth') || pathname.startsWith('/register')) {
          router.replace('/chat');
        }
      }
      setIsInitializing(false);
    };

    void initAuth();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  // After a successful login in AuthView
  const markAuthenticated = useCallback(() => setIsAuthenticated(true), []);

  const logout = useCallback(async () => {
    await authService.logout();
  }, []);

  return { isInitializing, isAuthenticated, markAuthenticated, logout };
}
