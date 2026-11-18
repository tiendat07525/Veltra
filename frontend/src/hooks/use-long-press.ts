import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';

interface LongPressOptions {
  // Hold time before the callback runs
  delay?: number;
  // Finger movement (px) that counts as a scroll and cancels the press
  moveTolerance?: number;
  enabled?: boolean;
}

/**
 * Long press for touch screens only (mouse and pen are ignored, desktop keeps hover buttons).
 * Spread the returned handlers on the element. After a long press, the click that follows
 * the release and the system context menu (text selection / image menu) are suppressed.
 */
export function useLongPress(
  onLongPress: () => void,
  { delay = 450, moveTolerance = 10, enabled = true }: LongPressOptions = {}
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const callback = useRef(onLongPress);

  useEffect(() => {
    callback.current = onLongPress;
  });

  const cancelTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const reset = useCallback(() => {
    cancelTimer();
    start.current = null;
  }, [cancelTimer]);

  useEffect(() => cancelTimer, [cancelTimer]);

  if (!enabled) return {};

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      cancelTimer();
      timer.current = setTimeout(() => {
        timer.current = null;
        fired.current = true;
        navigator.vibrate?.(10);
        callback.current();
      }, delay);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!start.current || !timer.current) return;
      if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > moveTolerance) reset();
    },
    // pointercancel also fires when the browser takes the touch over for scrolling
    onPointerUp: reset,
    onPointerCancel: reset,
    onContextMenu: (e: React.MouseEvent) => {
      if (start.current || fired.current) e.preventDefault();
    },
    // Capture phase: also stops clicks on children (e.g. opening an image)
    onClickCapture: (e: React.MouseEvent) => {
      if (!fired.current) return;
      fired.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}
