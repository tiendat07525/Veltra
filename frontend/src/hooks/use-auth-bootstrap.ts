import { useCallback, useEffect, useState } from 'react';
import { useRouter } from '@/lib/navigation';
import { getToken } from '@/services/api/api';
import { authService } from '@/services/api/auth.service';

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
    const initAuth = async () => {
      let token = getToken();
      if (!token) {
        try {
          await authService.refreshSilent();
          token = getToken();
        } catch {
          // Silent refresh failed
        }
      }

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

    initAuth();
  }, [pathname, router]);

  // After a successful login in AuthView
  const markAuthenticated = useCallback(() => setIsAuthenticated(true), []);

  const logout = useCallback(async () => {
    await authService.logout();
  }, []);

  return { isInitializing, isAuthenticated, markAuthenticated, logout };
}
