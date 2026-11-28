// @vitest-environment happy-dom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageBubble } from '@/components/chat/MessageBubble';
import type { Conversation } from '@/types/conversation';
import type { Message } from '@/types/message';

const conversation: Conversation = {
  _id: 'c1',
  type: 'direct',
  participants: [
    { _id: 'me', username: 'me' },
    { _id: 'bob', username: 'bob' },
  ],
};
const record = (over: Partial<Message>): Message => ({
  _id: 'm1',
  conversationId: 'c1',
  senderId: 'bob',
  content: 'Cuộc gọi nhỡ',
  seq: 1,
  type: 'call',
  call: { media: 'video', status: 'missed' },
  createdAt: '2026-11-28T00:00:00.000Z',
  ...over,
});
const show = (msg: Message, onCallAgain?: (m: 'audio' | 'video') => void) =>
  render(
    React.createElement(MessageBubble, {
      msg,
      conversation,
      currentUserId: 'me',
      onRevokeMessage: vi.fn(),
      onReactMessage: vi.fn(),
      onOpenImage: vi.fn(),
      onCallAgain,
    })
  );

afterEach(cleanup);

describe('call record bubble', () => {
  it('a missed call for me: title, media, "Gọi lại" with the same media; never revocable', () => {
    const again = vi.fn();
    show(record({}), again);
    expect(screen.getByText('Cuộc gọi nhỡ')).toBeTruthy();
    expect(screen.getByText('Cuộc gọi video')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gọi lại' }));
    expect(again).toHaveBeenCalledWith('video');
    expect(screen.queryByLabelText('Thu hồi tin nhắn')).toBeNull();
    // Reactions stay available
    expect(screen.getByLabelText('Thả cảm xúc')).toBeTruthy();
  });

  it('my completed call shows its duration; no "Gọi lại" without a handler', () => {
    show(record({ senderId: 'me', content: 'Cuộc gọi thoại · 1:05', call: { media: 'audio', status: 'completed', durationSec: 65 } }));
    expect(screen.getByText('Cuộc gọi thoại')).toBeTruthy();
    expect(screen.getByText('1:05')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Gọi lại' })).toBeNull();
    expect(screen.queryByLabelText('Thu hồi tin nhắn')).toBeNull();
  });

  it('a revoked or plain message keeps its text', () => {
    show(record({ type: undefined, call: undefined, content: 'xin chào', senderId: 'me' }));
    expect(screen.getByText('xin chào')).toBeTruthy();
    expect(screen.getByLabelText('Thu hồi tin nhắn')).toBeTruthy();
  });
});
