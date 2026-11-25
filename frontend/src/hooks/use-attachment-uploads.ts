import { useCallback, useMemo, useRef } from 'react';
import { AttachmentKind, Message, MessageAttachment } from '@/types/message';
import { attachmentService, classifyFile } from '@/services/api/attachment.service';

const UPLOAD_CONCURRENCY = 3;

// A file of an optimistic message. publicId is set once its upload finished, so a retry
// uploads only the files that are still missing (and keeps the same clientMsgId).
interface PendingUpload {
  file: File;
  kind: AttachmentKind;
  publicId?: string;
  previewUrl?: string;
  lastProgress: number;
}

// Runs the tasks with at most `limit` in flight; rejects with the first error
async function runLimited(tasks: (() => Promise<void>)[], limit: number) {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      await task();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

/**
 * Files of optimistic messages, keyed by clientMsgId and kept until the message is stored:
 * local previews, signed uploads straight to Cloudinary (3 at a time) and upload progress
 * on the optimistic message, through `updateOutbox` (must be stable).
 */
export function useAttachmentUploads(updateOutbox: (change: (list: Message[]) => Message[]) => void) {
  // clientMsgId -> files of that optimistic message
  const uploadsRef = useRef(new Map<string, PendingUpload[]>());

  // `files` were checked by the composer (classifyFile); unsupported ones are skipped here too.
  // Returns the attachments to show on the optimistic message (empty when there are no files).
  const prepare = useCallback((clientMsgId: string, files: File[]): MessageAttachment[] => {
    const uploads: PendingUpload[] = [];
    for (const file of files) {
      const checked = classifyFile(file);
      if (!checked.ok) continue;
      uploads.push({
        file,
        kind: checked.kind,
        lastProgress: 0,
        // Local preview while uploading (documents show a file card, no preview)
        previewUrl: checked.kind === 'file' ? undefined : URL.createObjectURL(file),
      });
    }
    if (uploads.length) uploadsRef.current.set(clientMsgId, uploads);
    return uploads.map((u) => ({
      kind: u.kind,
      url: u.previewUrl ?? '',
      name: u.file.name,
      bytes: u.file.size,
      progress: 0,
    }));
  }, []);

  const setUploadProgress = useCallback(
    (clientMsgId: string, index: number, progress: number) => {
      updateOutbox((prev) =>
        prev.map((m) =>
          m.clientMsgId === clientMsgId && m.attachments
            ? { ...m, attachments: m.attachments.map((a, i) => (i === index ? { ...a, progress } : a)) }
            : m
        )
      );
    },
    [updateOutbox]
  );

  // Uploads the files of this message that are not uploaded yet (signed by the server,
  // straight to Cloudinary). Resolves to the references to send with the message.
  const uploadAll = useCallback(
    async (clientMsgId: string, conversationId: string) => {
      const uploads = uploadsRef.current.get(clientMsgId) ?? [];
      await runLimited(
        uploads.map((upload, index) => async () => {
          if (upload.publicId) return;
          const ref = await attachmentService.upload(conversationId, upload.file, (fraction) => {
            // ~20 renders per file at most
            if (fraction - upload.lastProgress >= 0.05 || fraction === 1) {
              upload.lastProgress = fraction;
              setUploadProgress(clientMsgId, index, fraction);
            }
          });
          upload.publicId = ref.publicId;
          setUploadProgress(clientMsgId, index, 1);
        }),
        UPLOAD_CONCURRENCY
      );
      return uploads.map((u) => ({
        publicId: u.publicId as string,
        kind: u.kind,
        name: u.file.name,
      }));
    },
    [setUploadProgress]
  );

  // The message left the outbox (stored or dropped): the local previews are no longer shown
  const release = useCallback((clientMsgId: string) => {
    uploadsRef.current.get(clientMsgId)?.forEach((u) => u.previewUrl && URL.revokeObjectURL(u.previewUrl));
    uploadsRef.current.delete(clientMsgId);
  }, []);

  return useMemo(() => ({ prepare, uploadAll, release }), [prepare, uploadAll, release]);
}
