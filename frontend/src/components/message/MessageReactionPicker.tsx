import React from 'react';
import { ReactionEmoji } from '@/types/message';

interface MessageReactionPickerProps {
  onSelectReaction: (emoji: ReactionEmoji) => void;
  className?: string;
  onClose?: () => void;
}

const REACTION_EMOJIS: ReactionEmoji[] = ['❤️', '👍', '😂', '😮', '😢', '😡', '🙏'];

export const MessageReactionPicker: React.FC<MessageReactionPickerProps> = ({
  onSelectReaction,
  className = '',
  onClose,
}) => {
  return (
    <div
      className={`flex items-center gap-1.5 p-1.5 bg-white/95 dark:bg-slate-900/95 border border-slate-200/80 dark:border-slate-800/90 rounded-full shadow-lg backdrop-blur-md transition-all duration-150 animate-in fade-in zoom-in-90 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => {
            onSelectReaction(emoji);
            if (onClose) onClose();
          }}
          className="w-8 h-8 flex items-center justify-center text-lg rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-transform duration-100 hover:scale-125 focus:outline-hidden"
          aria-label={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
};
