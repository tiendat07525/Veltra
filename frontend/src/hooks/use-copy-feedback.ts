import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Short "done" state for a button ("Đã sao chép", "Đã lưu", …) instead of a toast.
 * flash(key) marks that button done for `durationMs`; isFlashed(key) reads it.
 */
export function useCopyFeedback(durationMs = 2000) {
  const [flashed, setFlashed] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback(
    (key = 'default') => {
      if (timer.current) clearTimeout(timer.current);
      setFlashed(key);
      timer.current = setTimeout(() => setFlashed(null), durationMs);
    },
    [durationMs]
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const isFlashed = useCallback((key = 'default') => flashed === key, [flashed]);

  return { flash, isFlashed };
}
