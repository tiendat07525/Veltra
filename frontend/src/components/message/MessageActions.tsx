import React, { useState, useRef, useEffect } from 'react';
import {
  Smile,
  Reply,
  MoreHorizontal,
  Copy,
  Edit2,
  Trash2,
  Share2,
  Pin,
  Mail,
  Flag,
} from 'lucide-react';
import { MessageReactionPicker } from './MessageReactionPicker';
import { ReactionEmoji } from '@/types/message';

interface MessageActionsProps {
  isCurrentUser: boolean;
  isPinned?: boolean;
  onReact: (emoji: ReactionEmoji) => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onForward: () => void;
  onTogglePin: () => void;
  onMarkUnread?: () => void;
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  isCurrentUser,
  isPinned,
  onReact,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  onForward,
  onTogglePin,
  onMarkUnread,
}) => {
  const [showReactions, setShowReactions] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
        setShowReactions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div
      ref={moreMenuRef}
      className="relative flex items-center gap-0.5 p-1 bg-white/95 dark:bg-slate-800/95 border border-slate-200/80 dark:border-slate-700/80 rounded-full shadow-md backdrop-blur-md transition-opacity duration-150"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Quick Reaction Button */}
      <button
        type="button"
        onClick={() => {
          setShowReactions((prev) => !prev);
          setShowMoreMenu(false);
        }}
        title="React with emoji"
        className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-sky-500 transition-colors"
        aria-label="React with emoji"
      >
        <Smile className="w-4 h-4" />
      </button>

      {/* Reply Button */}
      <button
        type="button"
        onClick={onReply}
        title="Reply"
        className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-sky-500 transition-colors"
        aria-label="Reply to message"
      >
        <Reply className="w-4 h-4" />
      </button>

      {/* More Actions Menu Trigger */}
      <button
        type="button"
        onClick={() => {
          setShowMoreMenu((prev) => !prev);
          setShowReactions(false);
        }}
        title="More actions"
        className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-sky-500 transition-colors"
        aria-label="More options"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {/* Emoji Picker Floating Popup */}
      {showReactions && (
        <div className="absolute bottom-full mb-1.5 left-0 z-30">
          <MessageReactionPicker
            onSelectReaction={(emoji) => {
              onReact(emoji);
              setShowReactions(false);
            }}
            onClose={() => setShowReactions(false)}
          />
        </div>
      )}

      {/* More Dropdown Menu */}
      {showMoreMenu && (
        <div className="absolute bottom-full mb-1.5 right-0 z-30 w-48 p-1.5 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 text-xs text-slate-700 dark:text-slate-200 font-medium flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => {
              onCopy();
              setShowMoreMenu(false);
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-left transition-colors"
          >
            <Copy className="w-3.5 h-3.5 text-slate-500" />
            Copy message
          </button>

          <button
            type="button"
            onClick={() => {
              onForward();
              setShowMoreMenu(false);
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-left transition-colors"
          >
            <Share2 className="w-3.5 h-3.5 text-slate-500" />
            Forward
          </button>

          <button
            type="button"
            onClick={() => {
              onTogglePin();
              setShowMoreMenu(false);
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-left transition-colors"
          >
            <Pin className="w-3.5 h-3.5 text-slate-500" />
            {isPinned ? 'Unpin message' : 'Pin message'}
          </button>

          {onMarkUnread && (
            <button
              type="button"
              onClick={() => {
                onMarkUnread();
                setShowMoreMenu(false);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-left transition-colors"
            >
              <Mail className="w-3.5 h-3.5 text-slate-500" />
              Mark as unread
            </button>
          )}

          {isCurrentUser ? (
            <>
              {onEdit && (
                <button
                  type="button"
                  onClick={() => {
                    onEdit();
                    setShowMoreMenu(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-left transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                  Edit message
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    onDelete();
                    setShowMoreMenu(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-left transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  Delete message
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setShowMoreMenu(false);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 text-left transition-colors"
            >
              <Flag className="w-3.5 h-3.5" />
              Report message
            </button>
          )}
        </div>
      )}
    </div>
  );
};
