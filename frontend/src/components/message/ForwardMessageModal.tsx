import React, { useState } from 'react';
import { X, Search, Check, Send } from 'lucide-react';
import { Conversation } from '@/types/conversation';
import { UserAvatar } from '@/components/ui/UserAvatar';

interface ForwardMessageModalProps {
  isOpen: boolean;
  conversations: Conversation[];
  onClose: () => void;
  onForward: (targetConversationId: string) => void;
}

export const ForwardMessageModal: React.FC<ForwardMessageModalProps> = ({
  isOpen,
  conversations,
  onClose,
  onForward,
}) => {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const filtered = conversations.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase().trim())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Forward message
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="relative my-3">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-sky-500 focus:outline-hidden text-slate-800 dark:text-slate-100 placeholder-slate-400"
          />
        </div>

        {/* Conversations list */}
        <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
          {filtered.map((conv) => {
            const isSelected = selectedId === conv.id;
            return (
              <div
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-sky-50 dark:bg-sky-950/40 border border-sky-500/30'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <UserAvatar src={conv.avatar} name={conv.name} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {conv.name}
                    </p>
                    <p className="text-xs text-slate-400 capitalize">{conv.type}</p>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center border transition-colors ${
                    isSelected
                      ? 'bg-sky-500 border-sky-500 text-white'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Action button */}
        <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedId}
            onClick={() => {
              if (selectedId) {
                onForward(selectedId);
                onClose();
              }
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs"
          >
            <Send className="w-3.5 h-3.5" />
            Forward
          </button>
        </div>
      </div>
    </div>
  );
};
