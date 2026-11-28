import { CallEndReason, CallMedia, CallRecord } from '@/types/call';

// m:ss, or h:mm:ss from one hour (same format as the server's call record text)
export function formatCallDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const pad = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

// When the call timer starts: the server's acceptedAt (same on every tab, so a reload or the other
// side shows the same time), never later than `now` (client clock behind the server), else `now`
export function callStartedAt(acceptedAt: string | undefined, now: number): number {
  const at = acceptedAt ? Date.parse(acceptedAt) : NaN;
  return Number.isFinite(at) ? Math.min(at, now) : now;
}

export const mediaLabel = (media: CallMedia) => (media === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại');

/**
 * A call record bubble, seen by the caller (`isOwn`) or the callee: title, the line under it,
 * and whether it is a missed call for me (shown in red).
 */
export function describeCallRecord(record: CallRecord, isOwn: boolean) {
  const label = mediaLabel(record.media);
  switch (record.status) {
    case 'completed':
      return { title: label, detail: formatCallDuration(record.durationSec ?? 0), missed: false };
    case 'declined':
      return { title: isOwn ? 'Cuộc gọi bị từ chối' : 'Bạn đã từ chối', detail: label, missed: false };
    default:
      return { title: isOwn ? 'Cuộc gọi không được trả lời' : 'Cuộc gọi nhỡ', detail: label, missed: !isOwn };
  }
}

// The line shown when a call ends on screen
export function describeCallEnd(reason: CallEndReason | undefined, isCaller: boolean): string {
  switch (reason) {
    case 'missed':
      return isCaller ? 'Không có người trả lời' : 'Cuộc gọi nhỡ';
    case 'declined':
      return isCaller ? 'Người nhận đã từ chối' : 'Đã từ chối';
    case 'canceled':
      return isCaller ? 'Đã hủy cuộc gọi' : 'Người gọi đã hủy';
    case 'dropped':
      return 'Mất kết nối, cuộc gọi đã kết thúc';
    default:
      return 'Cuộc gọi đã kết thúc';
  }
}
