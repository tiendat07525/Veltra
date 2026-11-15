'use client';

import React from 'react';
import { FileText, Download, Loader2 } from 'lucide-react';
import { MessageAttachment } from '@/types/message';

interface MessageAttachmentsProps {
  attachments: MessageAttachment[];
  isOwn: boolean;
  onOpenImage: (url: string, name: string) => void;
}

// Only server-built Cloudinary URLs, or the sender's own local preview while uploading
const isSafeUrl = (url: string) => url.startsWith('https://res.cloudinary.com/') || url.startsWith('blob:');

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const UploadBar: React.FC<{ progress?: number }> = ({ progress }) =>
  progress !== undefined && progress < 1 ? (
    <div className="absolute inset-x-2 bottom-2 h-1 rounded-full bg-black/30 overflow-hidden">
      <div className="h-full bg-white transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
    </div>
  ) : null;

/**
 * Files of one message: images in a grid (click to open the viewer), native video / audio
 * players, and documents as download cards. Names are rendered as text only.
 */
export const MessageAttachments: React.FC<MessageAttachmentsProps> = ({ attachments, isOwn, onOpenImage }) => {
  const images = attachments.filter((a) => a.kind === 'image');
  const others = attachments.filter((a) => a.kind !== 'image');

  return (
    <div className="flex flex-col gap-1.5">
      {images.length > 0 && (
        <div className={`grid gap-1 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {images.map((image, i) => {
            const usable = isSafeUrl(image.url);
            return (
              <button
                key={`${image.url}-${i}`}
                type="button"
                disabled={!usable || image.url.startsWith('blob:')}
                onClick={() => onOpenImage(image.url, image.name)}
                className={`relative overflow-hidden rounded-xl bg-slate-300/40 dark:bg-slate-700/40 ${
                  images.length === 1 ? 'max-w-[260px]' : 'aspect-square w-full'
                }`}
                title={image.name}
              >
                {usable ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image.url}
                    alt={image.name}
                    loading="lazy"
                    width={image.width}
                    height={image.height}
                    className={`block ${images.length === 1 ? 'max-h-72 w-auto' : 'h-full w-full object-cover'}`}
                  />
                ) : (
                  <span className="block p-4 text-xs">{image.name}</span>
                )}
                <UploadBar progress={image.progress} />
              </button>
            );
          })}
        </div>
      )}

      {others.map((item, i) => {
        const usable = isSafeUrl(item.url);
        const uploading = item.progress !== undefined && item.progress < 1;

        if (item.kind === 'video' && usable) {
          return (
            <div key={`${item.url}-${i}`} className="relative max-w-[320px]">
              <video src={item.url} controls preload="metadata" className="w-full max-h-72 rounded-xl bg-black" />
              <UploadBar progress={item.progress} />
            </div>
          );
        }

        if (item.kind === 'audio' && usable) {
          return (
            <div key={`${item.url}-${i}`} className="relative">
              <audio src={item.url} controls preload="none" className="w-64 max-w-full" />
              <UploadBar progress={item.progress} />
            </div>
          );
        }

        // Documents (and anything without a playable URL yet): a card; downloadable once stored
        const href = usable && !item.url.startsWith('blob:') ? item.url : undefined;
        return (
          <a
            key={`${item.name}-${i}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`relative flex items-center gap-2.5 min-w-[200px] max-w-[280px] px-3 py-2.5 rounded-xl border ${
              isOwn
                ? 'border-white/25 bg-white/10 hover:bg-white/15'
                : 'border-slate-300/70 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 hover:bg-white/90 dark:hover:bg-slate-900/70'
            } ${href ? '' : 'pointer-events-none'}`}
            title={item.name}
          >
            <FileText className="w-8 h-8 shrink-0 opacity-80" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-semibold">{item.name}</span>
              <span className="block text-[10px] opacity-75">
                {uploading ? `Đang tải lên ${Math.round((item.progress ?? 0) * 100)}%` : formatBytes(item.bytes)}
              </span>
            </span>
            {uploading ? (
              <Loader2 className="w-4 h-4 shrink-0 animate-spin opacity-80" />
            ) : href ? (
              <Download className="w-4 h-4 shrink-0 opacity-80" />
            ) : null}
          </a>
        );
      })}
    </div>
  );
};
