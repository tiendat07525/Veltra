import { useSyncExternalStore } from 'react';

const subscribe = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
};
const getSnapshot = () => document.visibilityState !== 'hidden';
// Server render: assume visible (the app is client-rendered; this is only the first paint)
const getServerSnapshot = () => true;

// The page is shown (not a background tab, not minimized)
export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
