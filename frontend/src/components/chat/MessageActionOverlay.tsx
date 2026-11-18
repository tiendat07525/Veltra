'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface MessageActionOverlayProps {
  // Where the pressed bubble is on screen (getBoundingClientRect)
  anchor: DOMRect;
  // Own messages sit on the right
  alignRight: boolean;
  // Copy of the bubble, shown enlarged above the blur
  bubble: React.ReactNode;
  // Buttons shown under the bubble
  actions: React.ReactNode;
  onClose: () => void;
}

const EDGE = 12; // px kept free at the top / bottom of the screen
const SCALE = 1.04;

/**
 * Touch long-press menu: blurs the page, lifts the pressed bubble slightly and shows its
 * actions underneath. The bubble + actions are moved up when they would go past the bottom
 * of the screen (over the input bar / keyboard), and down when they start above the top.
 */
export const MessageActionOverlay: React.FC<MessageActionOverlayProps> = ({
  anchor,
  alignRight,
  bubble,
  actions,
  onClose,
}) => {
  const groupRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(anchor.top);
  const [entered, setEntered] = useState(false);

  useLayoutEffect(() => {
    const height = groupRef.current?.offsetHeight ?? 0;
    // Room for the scaled bubble growing past its box
    const grow = (height * (SCALE - 1)) / 2;
    const maxTop = window.innerHeight - height - EDGE - grow;
    setTop(Math.max(EDGE + grow, Math.min(anchor.top, maxTop)));
  }, [anchor]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    // The anchor is stale after a resize / rotation
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tùy chọn tin nhắn"
      className="fixed inset-0 z-50 select-none [-webkit-touch-callout:none]"
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-150 ${
          entered ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        ref={groupRef}
        className={`absolute flex flex-col gap-2 ${alignRight ? 'items-end' : 'items-start'}`}
        style={
          alignRight
            ? { top, right: window.innerWidth - anchor.right, maxWidth: anchor.right - EDGE }
            : { top, left: anchor.left, maxWidth: window.innerWidth - anchor.left - EDGE }
        }
      >
        <div
          className={`pointer-events-none flex max-h-[calc(100dvh-7rem)] overflow-hidden transition-transform duration-150 ease-out ${
            alignRight ? 'origin-right justify-end' : 'origin-left'
          }`}
          style={{ width: anchor.width, transform: `scale(${entered ? SCALE : 1})` }}
        >
          {bubble}
        </div>
        <div
          onClick={(e) => e.stopPropagation()}
          className={`min-w-44 overflow-hidden rounded-2xl border border-line bg-surface shadow-xl transition-opacity duration-150 ${
            entered ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {actions}
        </div>
      </div>
    </div>,
    document.body
  );
};
