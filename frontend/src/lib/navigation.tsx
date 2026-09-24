'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface AppRouterInstance {
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
  forward: () => void;
  prefetch: (href: string) => void;
}

interface NavigationContextType {
  pathname: string;
  searchParams: URLSearchParams;
  router: AppRouterInstance;
  navigate: (path: string) => void;
}

const NavigationContext = createContext<NavigationContextType | null>(null);

export const NavigationProvider: React.FC<{
  children: React.ReactNode;
  initialPath?: string;
}> = ({ children, initialPath = '/chat' }) => {
  const [pathname, setPathname] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.location.pathname && window.location.pathname !== '/') {
      return window.location.pathname;
    }
    return initialPath;
  });

  const [searchParamsString, setSearchParamsString] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.location.search;
    }
    return '';
  });

  const navigate = useCallback((path: string) => {
    const [pathPart, queryPart] = path.split('?');
    setPathname(pathPart || '/');
    setSearchParamsString(queryPart ? `?${queryPart}` : '');
    if (typeof window !== 'undefined' && window.history) {
      window.history.pushState({}, '', path);
    }
  }, []);

  const replace = useCallback((path: string) => {
    const [pathPart, queryPart] = path.split('?');
    setPathname(pathPart || '/');
    setSearchParamsString(queryPart ? `?${queryPart}` : '');
    if (typeof window !== 'undefined' && window.history) {
      window.history.replaceState({}, '', path);
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      if (typeof window !== 'undefined') {
        setPathname(window.location.pathname || '/chat');
        setSearchParamsString(window.location.search || '');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const router: AppRouterInstance = {
    push: navigate,
    replace: replace,
    back: () => {
      if (typeof window !== 'undefined') window.history.back();
    },
    forward: () => {
      if (typeof window !== 'undefined') window.history.forward();
    },
    prefetch: () => {},
  };

  const searchParams = new URLSearchParams(searchParamsString);

  return (
    <NavigationContext.Provider value={{ pathname, searchParams, router, navigate }}>
      {children}
    </NavigationContext.Provider>
  );
};

export function useRouter(): AppRouterInstance {
  const context = useContext(NavigationContext);
  if (!context) {
    return {
      push: (path: string) => {
        if (typeof window !== 'undefined') window.location.href = path;
      },
      replace: (path: string) => {
        if (typeof window !== 'undefined') window.location.replace(path);
      },
      back: () => window.history.back(),
      forward: () => window.history.forward(),
      prefetch: () => {},
    };
  }
  return context.router;
}

export function usePathname(): string {
  const context = useContext(NavigationContext);
  return context ? context.pathname : '/chat';
}

export function useSearchParams(): URLSearchParams {
  const context = useContext(NavigationContext);
  return context ? context.searchParams : new URLSearchParams();
}

export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: React.ReactNode;
}

export const Link: React.FC<LinkProps> = ({ href, children, onClick, ...props }) => {
  const router = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) onClick(e);
    if (!e.defaultPrevented && !props.target && e.button === 0 && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      router.push(href);
    }
  };

  return (
    <a href={href} onClick={handleClick} {...props}>
      {children}
    </a>
  );
};
