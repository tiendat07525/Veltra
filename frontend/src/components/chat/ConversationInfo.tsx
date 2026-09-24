import React, { useState } from 'react';
import {
  X,
  Bell,
  BellOff,
  Pin,
  Image as ImageIcon,
  FileText,
  Link2,
  Users,
  Search,
  LogOut,
  Shield,
  Download,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { Conversation } from '@/types/conversation';
import { User } from '@/types/user';
import { Message } from '@/types/message';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { OnlineStatusDot } from '@/components/ui/OnlineStatusDot';

interface ConversationInfoProps {
  conversation: Conversation;
  partner?: User | null;
  participantsMap: Map<string, User>;
  messages: Message[];
  onClose: () => void;
  onToggleMute: () => void;
  onToggleSearch: () => void;
  onOpenImage: (url: string, caption?: string) => void;
}

export const ConversationInfo: React.FC<ConversationInfoProps> = ({
  conversation,
  partner,
  participantsMap,
  messages,
  onClose,
  onToggleMute,
  onToggleSearch,
  onOpenImage,
}) => {
  const [activeTab, setActiveTab] = useState<'media' | 'files' | 'links' | 'members'>('media');

  const isGroup = conversation.type === 'group';

  // Extract shared media
  const sharedMedia = messages.filter(
    (m) => m.type === 'image' && !m.isDeleted && (m.mediaUrl || m.content?.startsWith('http'))
  );

  // Extract shared files
  const sharedFiles = messages.filter((m) => m.type === 'file' && !m.isDeleted);

  // Extract pinned
  const pinnedMessages = messages.filter((m) => m.isPinned && !m.isDeleted);

  // TODO: Backend chưa hỗ trợ chức năng lấy link
  const sharedLinks: { title: string; url: string; date: string }[] = [];

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200/80 dark:border-slate-800 w-full sm:w-80 lg:w-88 shrink-0 overflow-y-auto">
      {/* Top Header */}
      <div className="h-16 px-4 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between shrink-0">
        <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
          {isGroup ? 'Chi tiết nhóm' : 'Chi tiết liên hệ'}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Đóng"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Profile Info Header */}
      <div className="p-6 flex flex-col items-center text-center border-b border-slate-200/60 dark:border-slate-800/80">
        <div className="relative mb-3">
          <UserAvatar
            src={conversation.avatar}
            name={conversation.name || 'Hội thoại'}
            size="xl"
            status={partner?.status}
            showStatus={!isGroup}
          />
        </div>

        <h4 className="text-base font-bold text-slate-900 dark:text-white mb-0.5">
          {conversation.name}
        </h4>

        {isGroup ? (
          <span className="text-xs text-sky-500 font-medium">
            {conversation.participants.length} thành viên
          </span>
        ) : (
          <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 justify-center">
            <OnlineStatusDot status={partner?.status || 'offline'} size="sm" />
            {partner?.status === 'online' ? 'Trực tuyến' : partner?.lastSeen || 'Ngoại tuyến'}
          </span>
        )}

        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 px-2 leading-relaxed">
          {conversation.description || partner?.bio || 'Kênh trò chuyện bảo mật bởi Veltra.'}
        </p>

        {/* Action Quick Buttons */}
        <div className="grid grid-cols-2 gap-2 w-full mt-4">
          <button
            type="button"
            onClick={onToggleMute}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-medium border transition-colors ${
              conversation.isMuted
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-600 dark:text-amber-400'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
            }`}
          >
            {conversation.isMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
            <span>{conversation.isMuted ? 'Bật thông báo' : 'Tắt thông báo'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleSearch}
            className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition-colors"
          >
            <Search className="w-4 h-4" />
            <span>Tìm kiếm</span>
          </button>
        </div>
      </div>

      {/* Tabs for Media / Files / Links / Members */}
      <div className="p-3 border-b border-slate-200/60 dark:border-slate-800/80">
        <div className="grid grid-cols-4 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400">
          <button
            type="button"
            onClick={() => setActiveTab('media')}
            className={`py-1.5 rounded-lg transition-all ${
              activeTab === 'media' ? 'bg-white dark:bg-slate-900 text-sky-500 shadow-xs' : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Ảnh/Video
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className={`py-1.5 rounded-lg transition-all ${
              activeTab === 'files' ? 'bg-white dark:bg-slate-900 text-sky-500 shadow-xs' : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Tệp tin
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('links')}
            className={`py-1.5 rounded-lg transition-all ${
              activeTab === 'links' ? 'bg-white dark:bg-slate-900 text-sky-500 shadow-xs' : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Liên kết
          </button>
          {isGroup ? (
            <button
              type="button"
              onClick={() => setActiveTab('members')}
              className={`py-1.5 rounded-lg transition-all ${
                activeTab === 'members' ? 'bg-white dark:bg-slate-900 text-sky-500 shadow-xs' : 'hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Thành viên
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveTab('members')}
              className={`py-1.5 rounded-lg transition-all ${
                activeTab === 'members' ? 'bg-white dark:bg-slate-900 text-sky-500 shadow-xs' : 'hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Thông tin
            </button>
          )}
        </div>
      </div>

      {/* Tab Contents */}
      <div className="p-4 flex-1">
        {/* Media Tab */}
        {activeTab === 'media' && (
          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Ảnh/Video đã chia sẻ ({sharedMedia.length})
            </span>
            {sharedMedia.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">Chưa có ảnh nào được chia sẻ.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {sharedMedia.map((msg) => (
                  <div
                    key={msg.id || msg._id}
                    onClick={() => onOpenImage(msg.mediaUrl || msg.content || '', 'Photo')}
                    className="aspect-square rounded-xl overflow-hidden cursor-pointer group relative bg-slate-100 dark:bg-slate-800"
                  >
                    <img
                      src={msg.mediaUrl || msg.content}
                      alt="Media"
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Files Tab */}
        {activeTab === 'files' && (
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Tài liệu đã chia sẻ ({sharedFiles.length})
            </span>
            {sharedFiles.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">Chưa có tệp tin nào được chia sẻ.</p>
            ) : (
              sharedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-500 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <p className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {file.fileName || file.content}
                      </p>
                      <span className="text-[10px] text-slate-400">{file.fileSize || '3.2 MB'} • {file.createdAt}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled
                    className="p-1.5 text-slate-400 hover:text-sky-500 rounded-lg hover:bg-white dark:hover:bg-slate-700 opacity-50 cursor-not-allowed"
                    title="Download (TODO: Backend)"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Links Tab */}
        {activeTab === 'links' && (
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Liên kết đã chia sẻ ({sharedLinks.length})
            </span>
            {sharedLinks.map((link, idx) => (
              <a
                key={idx}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 hover:border-sky-500/40 text-xs transition-colors group"
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-500 flex items-center justify-center shrink-0">
                    <Link2 className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <p className="font-medium text-slate-800 dark:text-slate-200 truncate group-hover:text-sky-500">
                      {link.title}
                    </p>
                    <span className="text-[10px] text-slate-400 truncate block">{link.url}</span>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-sky-500 shrink-0" />
              </a>
            ))}
          </div>
        )}

        {/* Members or About Tab */}
        {activeTab === 'members' && (
          <div className="space-y-3">
            {isGroup ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Thành viên ({conversation.participants.length})
                  </span>
                </div>
                <div className="space-y-2">
                  {conversation.participants.map((p) => {
                    const memberId = typeof p === 'string' ? p : p._id;
                    const member = participantsMap.get(memberId) || (typeof p === 'object' ? (p as unknown as User) : undefined);
                    if (!member) return null;
                    const isAdmin = conversation.group?.createdBy === memberId;
                    return (
                      <div
                        key={memberId}
                        className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <UserAvatar
                            src={member.avatarUrl || member.avatar}
                            name={member.displayName || member.username || 'Thành viên'}
                            size="sm"
                            status={member.status}
                            showStatus
                          />
                          <div>
                            <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                              {member.displayName}
                            </p>
                            <span className="text-[10px] text-slate-400">{member.role || 'Thành viên'}</span>
                          </div>
                        </div>

                        {isAdmin && (
                          <span className="px-2 py-0.5 rounded-md bg-sky-100 dark:bg-sky-950/60 text-[10px] font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1">
                            <Shield className="w-3 h-3" /> Quản trị viên
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="space-y-3 text-xs">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Hồ sơ người dùng
                </span>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-2">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase">Tên đăng nhập</span>
                    <p className="font-medium text-slate-800 dark:text-slate-200">@{partner?.username}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase">Email</span>
                    <p className="font-medium text-slate-800 dark:text-slate-200">{partner?.email}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase">Vị trí</span>
                    <p className="font-medium text-slate-800 dark:text-slate-200">{partner?.location || 'San Francisco, CA'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase">Thành viên từ</span>
                    <p className="font-medium text-slate-800 dark:text-slate-200">
                      {partner?.createdAt ? new Date(partner.createdAt).getFullYear() : '2024'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Danger Zone: Leave Group / Block */}
      <div className="p-4 border-t border-slate-200/60 dark:border-slate-800/80">
        <button
          type="button"
          disabled
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold text-rose-600/50 dark:text-rose-600/50 bg-rose-50/50 dark:bg-rose-950/20 cursor-not-allowed transition-colors"
          title="TODO: Cần backend hỗ trợ"
        >
          <LogOut className="w-4 h-4" />
          <span>{isGroup ? 'Rời nhóm' : 'Chặn liên hệ'}</span>
        </button>
      </div>
    </div>
  );
};
