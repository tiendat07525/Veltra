import React, { useState } from 'react';
import { Search, Smile, Heart, ThumbsUp, Flame } from 'lucide-react';

interface EmojiPickerPopoverProps {
  onSelectEmoji: (emoji: string) => void;
  onClose: () => void;
}

const EMOJI_CATEGORIES = [
  {
    name: 'Smileys',
    icon: Smile,
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🥹', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😋', '😛', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😮', '😯', '😲', '😳', '🤯', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🫣', '🤭', '🫢', '🫡', '🤫', '🫠', '🤐', '🤨'],
  },
  {
    name: 'Gestures',
    icon: ThumbsUp,
    emojis: ['👍', '👎', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '🫳', '🫴', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄'],
  },
  {
    name: 'Hearts & Symbols',
    icon: Heart,
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️'],
  },
  {
    name: 'Vibe & Objects',
    icon: Flame,
    emojis: ['🔥', '✨', '⚡', '💥', '💯', '💢', '💨', '💫', '🎉', '🎊', '🎈', '🎂', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🚀', '🛸', '🛰️', '💡', '💻', '🖥️', '📱', '⌚', '📸', '🎧', '🎙️', '☕', '🍕', '🍔', '🍟', '🍣', '🍦', '🍩', '🍪', '🍫', '🍻', '🥂', '🍷', '🍹', '🪴', '🌸', '🌺', '🍀', '🌟', '🌙', '☀️', '🌈'],
  },
];

export const EmojiPickerPopover: React.FC<EmojiPickerPopoverProps> = ({
  onSelectEmoji,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(0);

  const allEmojis = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
  const displayedEmojis = search.trim()
    ? allEmojis.filter((e) => e.includes(search))
    : EMOJI_CATEGORIES[activeCategory].emojis;

  return (
    <div
      className="w-72 sm:w-80 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-3 animate-in fade-in zoom-in-95 z-40"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Search Input */}
      <div className="relative mb-2">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search emojis..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-1.5 focus:ring-sky-500"
          autoFocus
        />
      </div>

      {/* Category Tabs */}
      {!search && (
        <div className="flex items-center gap-1 pb-2 border-b border-slate-100 dark:border-slate-800 mb-2">
          {EMOJI_CATEGORIES.map((cat, idx) => {
            const Icon = cat.icon;
            const isActive = activeCategory === idx;
            return (
              <button
                key={cat.name}
                type="button"
                onClick={() => setActiveCategory(idx)}
                className={`p-1.5 rounded-lg text-xs flex items-center justify-center transition-colors ${
                  isActive
                    ? 'bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                }`}
                title={cat.name}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>
      )}

      {/* Emoji Grid */}
      <div className="grid grid-cols-7 gap-1 max-h-48 overflow-y-auto pr-1">
        {displayedEmojis.map((emoji, idx) => (
          <button
            key={`${emoji}-${idx}`}
            type="button"
            onClick={() => onSelectEmoji(emoji)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-slate-100 dark:hover:bg-slate-800 hover:scale-120 transition-all focus:outline-hidden"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
};
