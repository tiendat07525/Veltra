'use client';

import React from 'react';
import { ReactionEmoji } from '@/types/message';
import { REACTION_EMOJIS } from '@/lib/reactions';

interface ReactionPickerProps {
  // My current emoji (highlighted; picking it again removes it)
  selected: ReactionEmoji | null;
  // A change is on the way
  disabled?: boolean;
  onPick: (emoji: ReactionEmoji) => void;
  className?: string;
}

// The row of the five reactions (hover popover on desktop, long-press menu on touch)
export const ReactionPicker: React.FC<ReactionPickerProps> = ({ selected, disabled, onPick, className = '' }) => (
  <div role="group" aria-label="Thả cảm xúc" className={`flex items-center gap-0.5 ${className}`}>
    {REACTION_EMOJIS.map((emoji) => (
      <button
        key={emoji}
        type="button"
        disabled={disabled}
        onClick={() => onPick(emoji)}
        aria-pressed={selected === emoji}
        aria-label={selected === emoji ? `Bỏ cảm xúc ${emoji}` : `Thả cảm xúc ${emoji}`}
        className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xl leading-none transition-transform hover:scale-125 hover:bg-surface-2 disabled:opacity-50 disabled:hover:scale-100 ${
          selected === emoji ? 'bg-accent-soft' : ''
        }`}
      >
        {emoji}
      </button>
    ))}
  </div>
);
