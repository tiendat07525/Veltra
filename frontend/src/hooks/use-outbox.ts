import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Message } from '@/types/message';
import { messageService } from '@/services/api/message.service';
import { uuidv7 } from '@/lib/utils';
import { isRetryableSendError } from '@/lib/message-list';
import { useAttachmentUploads } from './use-attachment-uploads';

const SEND_MAX_RETRIES = 5;
const SEND_RETRY_BASE_MS = 1000; // waits 1, 2, 4, 8, 16 s between attempts

/**
 * Optimistic messages (`sending` / `failed`) of every conversation, kept until each one is stored:
 * opening another conversation or reloading the history does not lose them (a page reload does).
 * `onStored` gets the stored copy from the send response.
 */
export function useOutbox(onStored: (saved: Message) => void) {
  const [outbox, setOutbox] = useState<Message[]>([]);
  // Same list, readable by the async send steps between renders
  const outboxRef = useRef<Message[]>([]);

  const onStoredRef = useRef(onStored);
  useEffect(() => {
    onStoredRef.current = onStored;
  }, [onStored]);

  const updateOutbox = useCallback((change: (list: Message[]) => Message[]) => {
    outboxRef.current = change(outboxRef.current);
    setOutbox(outboxRef.current);
  }, []);

  // Files of the messages in the outbox
  const uploads = useAttachmentUploads(updateOutbox);

  const remove = useCallback(
    (match: (m: Message) => boolean) => {
      const removed = outboxRef.current.filter(match);
      if (removed.length === 0) return;
      updateOutbox((list) => list.filter((m) => !match(m)));
      removed.forEach((m) => m.clientMsgId && uploads.release(m.clientMsgId));
    },
    [updateOutbox, uploads]
  );

  // These stored messages are on the server: their optimistic copies go away
  const settle = useCallback(
    (stored: Message[]) => {
      const ids = new Set(stored.map((m) => m.clientMsgId).filter(Boolean));
      remove((m) => ids.has(m.clientMsgId));
    },
    [remove]
  );

  // The conversation is gone (left, removed, deleted): nothing can be sent to it any more
  const dropConversation = useCallback(
    (conversationId: string) => remove((m) => m.conversationId === conversationId),
    [remove]
  );

  // The app goes away: stop retrying and free the previews
  useEffect(() => () => remove(() => true), [remove]);

  const isWaiting = useCallback(
    (clientMsgId: string) => outboxRef.current.some((m) => m.clientMsgId === clientMsgId),
    []
  );

  const setStatus = useCallback(
    (clientMsgId: string, status: 'sending' | 'failed') =>
      updateOutbox((list) => list.map((m) => (m.clientMsgId === clientMsgId ? { ...m, status } : m))),
    [updateOutbox]
  );

  // Send one message, retrying with the same clientMsgId so the server stores it once.
  // Stops when the message left the outbox meanwhile (stored copy arrived, or dropped).
  const deliver = useCallback(
    async (pending: Message, clientMsgId: string) => {
      let attachments: Awaited<ReturnType<typeof uploads.uploadAll>>;
      try {
        attachments = await uploads.uploadAll(clientMsgId, pending.conversationId);
      } catch (err: unknown) {
        console.error('Lỗi khi tải file lên:', err);
        setStatus(clientMsgId, 'failed');
        return;
      }

      for (let attempt = 0; isWaiting(clientMsgId); attempt++) {
        try {
          const res = await messageService.sendMessage({
            conversationId: pending.conversationId,
            content: pending.content || undefined,
            clientMsgId,
            ...(attachments.length ? { attachments } : {}),
          });
          remove((m) => m.clientMsgId === clientMsgId);
          if (res.data) onStoredRef.current(res.data);
          return;
        } catch (err: unknown) {
          if (!isRetryableSendError(err) || attempt >= SEND_MAX_RETRIES) {
            console.error('Lỗi khi gửi tin nhắn:', err);
            setStatus(clientMsgId, 'failed');
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, SEND_RETRY_BASE_MS * 2 ** attempt));
        }
      }
    },
    [uploads, isWaiting, remove, setStatus]
  );

  const send = useCallback(
    (conversationId: string, senderId: string, content: string, files: File[] = []) => {
      const text = content.trim();
      const clientMsgId = uuidv7();
      const attachments = uploads.prepare(clientMsgId, files);
      if (!text && attachments.length === 0) return;

      const pending: Message = {
        _id: `pending:${clientMsgId}`,
        clientMsgId,
        conversationId,
        senderId,
        content: text || undefined,
        ...(attachments.length ? { attachments } : {}),
        // Display only (date separator); the list is never sorted by this
        createdAt: new Date().toISOString(),
        status: 'sending',
      };
      updateOutbox((list) => [...list, pending]);
      void deliver(pending, clientMsgId);
    },
    [uploads, updateOutbox, deliver]
  );

  const retry = useCallback(
    (clientMsgId: string) => {
      const failed = outboxRef.current.find((m) => m.clientMsgId === clientMsgId && m.status === 'failed');
      if (!failed) return;
      setStatus(clientMsgId, 'sending');
      void deliver(failed, clientMsgId);
    },
    [setStatus, deliver]
  );

  return useMemo(
    () => ({ outbox, send, retry, settle, dropConversation }),
    [outbox, send, retry, settle, dropConversation]
  );
}
