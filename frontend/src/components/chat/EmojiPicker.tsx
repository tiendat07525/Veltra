'use client';

import React, { useEffect, useRef, useState } from 'react';
import { EMOJI_CATEGORIES } from '@/lib/emoji';

interface EmojiPickerProps {
  // Called for each pick; the panel stays open for more
  onPick: (emoji: string) => void;
  // Escape (back to typing: refocus true) or a click outside (focus stays where it went: false)
  onClose: (refocus: boolean) => void;
  // The toggle button: a click on it is not "outside"
  anchorRef: React.RefObject<HTMLElement | null>;
}

// Panel above the composer, one tab per category
export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onPick, onClose, anchorRef }) => {
  const [tab, setTab] = useState(EMOJI_CATEGORIES[0].id);
  const panelRef = useRef<HTMLDivElement>(null);

  const category = EMOJI_CATEGORIES.find((c) => c.id === tab) ?? EMOJI_CATEGORIES[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose(true);
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [onClose, anchorRef]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Chọn biểu tượng cảm xúc"
      // A mouse / touch pick leaves the focus (and the caret) in the message box; Tab still reaches the buttons
      onMouseDown={(e) => e.preventDefault()}
      className="absolute bottom-full left-0 right-0 sm:right-auto mb-2 sm:w-80 rounded-2xl border border-line bg-surface shadow-lg z-20 overflow-hidden"
    >
      <div role="tablist" aria-label="Nhóm biểu tượng" className="flex gap-0.5 px-1.5 pt-1.5 border-b border-line overflow-x-auto">
        {EMOJI_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === category.id}
            title={c.label}
            aria-label={c.label}
            onClick={() => setTab(c.id)}
            className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-t-lg text-lg text-fg-muted transition-colors ${
              c.id === category.id ? 'bg-accent-soft text-accent' : 'hover:bg-surface-2'
            }`}
          >
            <span aria-hidden="true">{c.emojis[0]}</span>
          </button>
        ))}
      </div>
      <p className="px-3 pt-2 text-[11px] font-semibold text-fg-muted">
        {category.label}
      </p>
      <div role="tabpanel" className="grid grid-cols-8 gap-0.5 p-2 max-h-56 overflow-y-auto">
        {category.emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={emoji}
            onClick={() => onPick(emoji)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-2xl leading-none hover:bg-surface-2 focus-visible:bg-surface-2"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
};
