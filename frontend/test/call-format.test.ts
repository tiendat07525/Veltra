import { describe, expect, it } from 'vitest';
import { callStartedAt, describeCallEnd, describeCallRecord, formatCallDuration } from '@/lib/call-format';

describe('call format', () => {
  it('formats durations like the server', () => {
    expect(formatCallDuration(0)).toBe('0:00');
    expect(formatCallDuration(65.9)).toBe('1:05');
    expect(formatCallDuration(3725)).toBe('1:02:05');
    expect(formatCallDuration(-3)).toBe('0:00');
  });

  it('describes a call record for the caller and the callee', () => {
    expect(describeCallRecord({ media: 'video', status: 'completed', durationSec: 65 }, true)).toEqual({
      title: 'Cuộc gọi video',
      detail: '1:05',
      missed: false,
    });
    expect(describeCallRecord({ media: 'audio', status: 'missed' }, false)).toEqual({
      title: 'Cuộc gọi nhỡ',
      detail: 'Cuộc gọi thoại',
      missed: true,
    });
    expect(describeCallRecord({ media: 'audio', status: 'missed' }, true)).toMatchObject({
      title: 'Cuộc gọi không được trả lời',
      missed: false,
    });
    expect(describeCallRecord({ media: 'audio', status: 'declined' }, true).title).toBe('Cuộc gọi bị từ chối');
    expect(describeCallRecord({ media: 'audio', status: 'declined' }, false).title).toBe('Bạn đã từ chối');
  });

  it('describes why a call ended, from each side', () => {
    expect(describeCallEnd('missed', true)).toBe('Không có người trả lời');
    expect(describeCallEnd('missed', false)).toBe('Cuộc gọi nhỡ');
    expect(describeCallEnd('declined', true)).toBe('Người nhận đã từ chối');
    expect(describeCallEnd('canceled', false)).toBe('Người gọi đã hủy');
    expect(describeCallEnd('dropped', true)).toBe('Mất kết nối, cuộc gọi đã kết thúc');
    expect(describeCallEnd(undefined, true)).toBe('Cuộc gọi đã kết thúc');
  });

  it('starts the call timer at the server acceptedAt, never in the future', () => {
    const now = Date.parse('2026-11-28T15:00:30.000Z');
    expect(callStartedAt('2026-11-28T15:00:00.000Z', now)).toBe(Date.parse('2026-11-28T15:00:00.000Z'));
    // Client clock behind the server: start now, not at a future time (no negative timer)
    expect(callStartedAt('2026-11-28T15:01:00.000Z', now)).toBe(now);
    expect(callStartedAt(undefined, now)).toBe(now);
    expect(callStartedAt('not a date', now)).toBe(now);
  });
});
