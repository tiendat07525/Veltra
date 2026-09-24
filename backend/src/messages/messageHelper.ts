
export const updateConversationAfterCreateMessage = (
    conversation,
    message,
    senderId,
) => {
    conversation.set({
        seenBy: [],
        lastMessageAt: message.createdAt,
        lastMessage: {
            _id: message._id,
            content: message.content,
            senderId,
            createdAt: message.createdAt,
        },
    });

    if (!conversation.unreadCounts) {
        conversation.unreadCounts = new Map();
    }

    const participants = conversation.participants || [];
    participants.forEach((p) => {
        const memberId = p.userId?.toString();
        if (!memberId) return;
        const isSender = memberId === senderId?.toString();
        const prevCount = conversation.unreadCounts?.get ? (conversation.unreadCounts.get(memberId) || 0) : 0;

        if (conversation.unreadCounts?.set) {
            conversation.unreadCounts.set(memberId, isSender ? 0 : prevCount + 1);
        }
    });
}

export const emitNewMessage = (io, conversation, message)=>{
    io.to(conversation._id.toString()).emit('new-message', {
        message,
        conversation: {
            _id: conversation._id,
            lastMessage: conversation.lastMessage,
            lastMessageAt: conversation.lastMessageAt,
        },

        unreadCounts: conversation.unreadCounts,
    });
}