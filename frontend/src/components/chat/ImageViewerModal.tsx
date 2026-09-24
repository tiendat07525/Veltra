import React from 'react';
import { X, Download, ZoomIn, ZoomOut, Share2 } from 'lucide-react';

interface ImageViewerModalProps {
  isOpen: boolean;
  imageUrl: string | null;
  caption?: string;
  onClose: () => void;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  isOpen,
  imageUrl,
  caption,
  onClose,
}) => {
  const [scale, setScale] = React.useState(1);

  if (!isOpen || !imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 transition-all duration-200"
      onClick={onClose}
    >
      {/* Top Toolbar */}
      <div
        className="absolute top-4 inset-x-4 flex items-center justify-between z-10 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm font-medium text-slate-300 truncate max-w-md">
          {caption || 'Xem trước hình ảnh'}
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(s + 0.25, 2.5))}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Phóng to"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(s - 0.25, 0.5))}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Thu nhỏ"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <a
            href={imageUrl}
            target="_blank"
            rel="noreferrer"
            download="veltra-media.jpg"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Tải hình ảnh"
          >
            <Download className="w-5 h-5" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-rose-500/80 text-white transition-colors ml-2"
            title="Đóng (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image Container */}
      <div
        className="relative max-w-4xl max-h-[80vh] flex items-center justify-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={imageUrl}
          alt={caption || 'Xem trước'}
          style={{ transform: `scale(${scale})` }}
          className="rounded-2xl object-contain max-h-[75vh] w-auto shadow-2xl transition-transform duration-150 cursor-grab"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
};
