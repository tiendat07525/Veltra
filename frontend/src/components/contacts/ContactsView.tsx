import React, { useState } from 'react';
import { Search, UserPlus, MessageCircle, Phone, Video, MoreHorizontal, Filter } from 'lucide-react';
import { MOCK_USERS, CURRENT_USER } from '@/data/mock/users';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { OnlineStatusDot } from '@/components/ui/OnlineStatusDot';
import { User } from '@/types/user';

interface ContactsViewProps {
  onStartChat: (user: User) => void;
  onVoiceCall: (user: User) => void;
  onVideoCall: (user: User) => void;
}

export const ContactsView: React.FC<ContactsViewProps> = ({
  onStartChat,
  onVoiceCall,
  onVideoCall,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const allContacts = MOCK_USERS.filter((u) => u.id !== CURRENT_USER.id);

  const filtered = allContacts.filter((user) => {
    const matchesSearch =
      user.displayName.toLowerCase().includes(search.toLowerCase().trim()) ||
      user.username.toLowerCase().includes(search.toLowerCase().trim()) ||
      (user.role && user.role.toLowerCase().includes(search.toLowerCase().trim()));

    if (!matchesSearch) return false;
    if (statusFilter === 'online') return user.status === 'online';
    if (statusFilter === 'offline') return user.status === 'offline';
    return true;
  });

  // Group by first letter
  const groupedContacts: { [letter: string]: User[] } = {};
  filtered.forEach((u) => {
    const firstChar = u.displayName.charAt(0).toUpperCase();
    if (!groupedContacts[firstChar]) {
      groupedContacts[firstChar] = [];
    }
    groupedContacts[firstChar].push(u);
  });

  const sortedLetters = Object.keys(groupedContacts).sort();

  return (
    <div className="flex-1 h-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Header */}
      <header className="h-16 px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Directory & Contacts</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {filtered.length} colleague{filtered.length > 1 ? 's' : ''} available
          </p>
        </div>

        <button
          type="button"
          onClick={() => alert('Add contact prompt: Enter email to invite colleague.')}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-xs transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Contact</span>
        </button>
      </header>

      {/* Filter and Search Toolbar */}
      <div className="p-4 sm:p-6 pb-2 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search contacts by name, role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-sky-500/30"
          />
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-xl text-xs font-medium self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              statusFilter === 'all' ? 'bg-white dark:bg-slate-800 text-sky-500 shadow-xs' : 'text-slate-500'
            }`}
          >
            All ({allContacts.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('online')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              statusFilter === 'online' ? 'bg-white dark:bg-slate-800 text-sky-500 shadow-xs' : 'text-slate-500'
            }`}
          >
            Online ({allContacts.filter((u) => u.status === 'online').length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('offline')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              statusFilter === 'offline' ? 'bg-white dark:bg-slate-800 text-sky-500 shadow-xs' : 'text-slate-500'
            }`}
          >
            Offline
          </button>
        </div>
      </div>

      {/* Main Contacts Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {sortedLetters.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center text-slate-400 text-sm">
            <p className="font-semibold text-slate-700 dark:text-slate-300">No contacts found</p>
            <p className="text-xs text-slate-400 mt-1">Try clearing your filters or search keywords.</p>
          </div>
        ) : (
          sortedLetters.map((letter) => (
            <div key={letter} className="space-y-2">
              <div className="text-xs font-bold text-sky-500 uppercase tracking-wider px-2">
                {letter}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {groupedContacts[letter].map((user) => (
                  <div
                    key={user.id}
                    className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-sky-500/40 shadow-xs hover:shadow-md transition-all flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <UserAvatar
                        src={user.avatar}
                        name={user.displayName}
                        size="md"
                        status={user.status}
                        showStatus
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                            {user.displayName}
                          </h3>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {user.role || `@${user.username}`}
                        </p>
                        <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <OnlineStatusDot status={user.status} size="sm" />
                          {user.status === 'online' ? 'Available now' : user.lastSeen || 'Offline'}
                        </span>
                      </div>
                    </div>

                    {/* Quick Communication Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onStartChat(user)}
                        title="Send Message"
                        className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 hover:bg-sky-600 hover:text-white transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onVoiceCall(user)}
                        title="Voice Call"
                        className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                      >
                        <Phone className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onVideoCall(user)}
                        title="Video Call"
                        className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                      >
                        <Video className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
