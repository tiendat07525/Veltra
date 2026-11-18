import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light' | 'system';

// Keep in sync with THEME_INIT_SCRIPT in app/layout.tsx (same key, same default)
const STORAGE_KEY = 'veltra-theme';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light' || saved === 'system') return saved;
    } catch {
      // SSR or blocked storage
    }
    return 'system';
  });
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  // "Theo hệ thống" follows OS changes while the app is open
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme: 'dark' | 'light' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.style.colorScheme = resolvedTheme;

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme, resolvedTheme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  // Quick toggle flips what is on screen, also when the choice is "system"
  const toggleTheme = () => {
    setThemeState(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return { theme, resolvedTheme, setTheme, toggleTheme, isDarkMode: resolvedTheme === 'dark' };
}
