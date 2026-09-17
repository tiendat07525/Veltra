import React, { useState } from 'react';
import { Conversation } from '@/types/conversation';
import { User } from '@/types/user';
import { Message, ReactionEmoji } from '@/types/message';
import { ChatHeader } from './ChatHeader';
import { MessageList } from '@/components/message/MessageList';
import { MessageComposer } from './MessageComposer';
import { ConversationInfo } from './ConversationInfo';
import { ImageViewerModal } from './ImageViewerModal';
import { DeleteMessageModal } from '@/components/message/DeleteMessageModal';
import { ForwardMessageModal } from '@/components/message/ForwardMessageModal';
import { CallModal } from './CallModal';
import { CURRENT_USER } from '@/data/mock/users';
import { MessageSquare, Sparkles } from 'lucide-react';

interface ChatWindowProps {
  conversation: Conversation | null;
  allConversations: Conversation[];
  partner: User | null;
  participantsMap: Map<string, User>;
  messages: Message[];
  loadingMessages: boolean;
  isTyping: boolean;
  typingUser: string;
  onSendMessage: (params: {
    content: string;
    type?: 'text' | 'image' | 'file' | 'audio';
    mediaUrl?: string;
    fileName?: string;
    fileSize?: string;
    fileType?: string;
    duration?: number;
  }) => void;
  onReact: (messageId: string, emoji: ReactionEmoji) => void;
  onEditMessage: (messageId: string, newContent: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onTogglePinMessage: (messageId: string) => void;
  onForwardMessage: (targetConversationId: string, message: Message) => void;
  onBackMobile: () => void;
  onToggleMuteConversation: (convId: string) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  conversation,
  allConversations,
  partner,
  participantsMap,
  messages,
  loadingMessages,
  isTyping,
  typingUser,
  onSendMessage,
  onReact,
  onEditMessage,
  onDeleteMessage,
  onTogglePinMessage,
  onForwardMessage,
  onBackMobile,
  onToggleMuteConversation,
  onShowToast,
}) => {
  // Local state for interactive tools
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [inChatSearch, setInChatSearch] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);

  // Modals state
  const [activeImage, setActiveImage] = useState<{ url: string; caption?: string } | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [forwardTargetMessage, setForwardTargetMessage] = useState<Message | null>(null);
  const [activeCall, setActiveCall] = useState<{ type: 'voice' | 'video'; contactName: string; contactAvatar: string } | null>(null);

  // Replying & Editing
  const [replyingTo, setReplyingTo] = useState<{ id: string; senderName: string; content: string } | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);

  if (!conversation) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-8 text-center text-slate-400">
        <div className="w-16 h-16 rounded-3xl bg-sky-500/10 text-sky-500 flex items-center justify-center mb-4">
          <MessageSquare className="w-8 h-8 stroke-[1.75]" />
        </div>
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-1">
          No conversation selected
        </h3>
        <p className="text-xs max-w-sm text-slate-500 leading-relaxed">
          Choose a conversation from the sidebar or start a new direct message to start realtime encrypted communication.
        </p>
      </div>
    );
  }

  const isGroup = conversation.type === 'group';

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    onShowToast('Message copied to clipboard', 'info');
  };

  const handleStartVoiceCall = () => {
    setActiveCall({
      type: 'voice',
      contactName: conversation.name,
      contactAvatar: conversation.avatar,
    });
  };

  const handleStartVideoCall = () => {
    setActiveCall({
      type: 'video',
      contactName: conversation.name,
      contactAvatar: conversation.avatar,
    });
  };

  return (
    <div className="flex-1 h-full flex overflow-hidden relative">
      {/* Main Chat Area */}
      <div className="flex-1 h-full flex flex-col min-w-0 bg-white dark:bg-slate-950">
        <ChatHeader
          conversation={conversation}
          partner={partner}
          onBackMobile={onBackMobile}
          onToggleInfo={() => setShowInfoPanel((prev) => !prev)}
          onStartVoiceCall={handleStartVoiceCall}
          onStartVideoCall={handleStartVideoCall}
          searchQuery={inChatSearch}
          onSearchChange={setInChatSearch}
          showSearchInput={showSearchInput}
          onToggleSearchInput={() => {
            setShowSearchInput((prev) => !prev);
            if (showSearchInput) setInChatSearch('');
          }}
          isInfoOpen={showInfoPanel}
        />

        <MessageList
          messages={messages}
          loading={loadingMessages}
          isTyping={isTyping}
          typingUser={typingUser}
          currentUserId={CURRENT_USER.id}
          isGroup={isGroup}
          participantsMap={participantsMap}
          searchQuery={inChatSearch}
          onReact={onReact}
          onReply={(msg, senderName) => {
            setReplyingTo({
              id: msg.id,
              senderName,
              content: msg.content,
            });
            setEditingMessage(null);
          }}
          onCopy={handleCopyMessage}
          onEdit={(msg) => {
            setEditingMessage(msg);
            setReplyingTo(null);
          }}
          onDelete={(msgId) => setDeleteTargetId(msgId)}
          onForward={(msg) => setForwardTargetMessage(msg)}
          onTogglePin={onTogglePinMessage}
          onOpenImage={(url, caption) => setActiveImage({ url, caption })}
        />

        <MessageComposer
          onSendMessage={(params) => {
            if (editingMessage) {
              onEditMessage(editingMessage.id, params.content);
              setEditingMessage(null);
              onShowToast('Message edited', 'info');
            } else {
              onSendMessage(params);
            }
          }}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          editingMessage={editingMessage}
          onCancelEdit={() => setEditingMessage(null)}
          isGroup={isGroup}
        />
      </div>

      {/* Right Information Panel (Desktop inline or Mobile Drawer) */}
      {showInfoPanel && (
        <div className="absolute inset-y-0 right-0 z-30 sm:static sm:z-auto shadow-2xl sm:shadow-none animate-in slide-in-from-right-2">
          <ConversationInfo
            conversation={conversation}
            partner={partner}
            participantsMap={participantsMap}
            messages={messages}
            onClose={() => setShowInfoPanel(false)}
            onToggleMute={() => onToggleMuteConversation(conversation.id)}
            onToggleSearch={() => {
              setShowSearchInput(true);
              setShowInfoPanel(false);
            }}
            onOpenImage={(url, caption) => setActiveImage({ url, caption })}
          />
        </div>
      )}

      {/* Media Viewer Modal */}
      <ImageViewerModal
        isOpen={!!activeImage}
        imageUrl={activeImage?.url || null}
        caption={activeImage?.caption}
        onClose={() => setActiveImage(null)}
      />

      {/* Delete Confirmation Modal */}
      <DeleteMessageModal
        isOpen={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={() => {
          if (deleteTargetId) {
            onDeleteMessage(deleteTargetId);
            onShowToast('Message deleted', 'info');
          }
        }}
      />

      {/* Forward Message Modal */}
      <ForwardMessageModal
        isOpen={!!forwardTargetMessage}
        conversations={allConversations}
        onClose={() => setForwardTargetMessage(null)}
        onForward={(targetId) => {
          if (forwardTargetMessage) {
            onForwardMessage(targetId, forwardTargetMessage);
            onShowToast('Message forwarded successfully', 'success');
          }
        }}
      />

      {/* Call Modal */}
      {activeCall && (
        <CallModal
          isOpen={true}
          type={activeCall.type}
          contactName={activeCall.contactName}
          contactAvatar={activeCall.contactAvatar}
          onEndCall={() => {
            setActiveCall(null);
            onShowToast('Call ended', 'info');
          }}
        />
      )}
    </div>
  );
};
