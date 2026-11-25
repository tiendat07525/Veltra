// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message, MessagesResponse } from '@/types/message';

type SendResult = { success: boolean; message: string; data?: Message };

const { getMessages, sendMessage, revokeMessage, markAsSeen, handlers } = vi.hoisted(() => ({
  getMessages: vi.fn<(id: string, limit?: number, beforeSeq?: number) => Promise<MessagesResponse>>(),
  sendMessage: vi.fn<(p: { clientMsgId: string; content?: string; conversationId?: string }) => Promise<SendResult>>(),
  revokeMessage: vi.fn<(id: string) => Promise<unknown>>(),
  markAsSeen: vi.fn<(id: string, upToSeq?: number) => Promise<unknown>>(),
  handlers: new Map<string, (payload: unknown) => void>(),
}));
vi.mock('@/services/api/message.service', () => ({
  messageService: { getMessages, sendMessage, revokeMessage },
}));
vi.mock('@/services/api/conversation.service', () => ({ conversationService: { markAsSeen } }));
vi.mock('@/services/api/attachment.service', () => ({
  attachmentService: { upload: vi.fn() },
  classifyFile: () => ({ ok: false }),
}));
vi.mock('@/services/socket/socket.service', () => ({
  socketService: {
    on: (event: string, handler: (payload: unknown) => void) => handlers.set(event, handler),
    off: (event: string) => handlers.delete(event),
  },
}));

import { useMessages } from '@/hooks/use-messages';

const msg = (over: Partial<Message>): Message => ({
  _id: `id-${over.seq}`,
  conversationId: 'c1',
  senderId: 'other',
  content: 'x',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});
const page = (messages: Message[], hasMore = false): MessagesResponse => ({ messages, hasMore });
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};
const emit = (event: string, payload: unknown) => act(() => handlers.get(event)!(payload));
const ids = (list: Message[]) => list.map((m) => m._id);

const onSeen = vi.fn();
const render = (id: string | null = 'c1') =>
  renderHook(({ conv }) => useMessages(conv, onSeen, true, 'me'), { initialProps: { conv: id } });
const renderLoaded = async (first: MessagesResponse) => {
  getMessages.mockResolvedValueOnce(first);
  const hook = render();
  await waitFor(() => expect(hook.result.current.messages).toHaveLength(first.messages.length));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useMessages: history', () => {
  it('loads the newest page and marks it as seen up to its last seq', async () => {
    const { result } = await renderLoaded(page([msg({ seq: 4 }), msg({ seq: 5 })], true));
    expect(getMessages).toHaveBeenCalledWith('c1');
    expect(result.current.hasMore).toBe(true);
    expect(onSeen).toHaveBeenCalledWith('c1', 5);
  });

  it('asks for nothing without a conversation', async () => {
    const { result } = render(null);
    await act(async () => undefined);
    expect(getMessages).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
  });

  it('shows the server error', async () => {
    getMessages.mockRejectedValueOnce({ response: { data: { message: 'Không tìm thấy' } } });
    const { result } = render();
    await waitFor(() => expect(result.current.error).toBe('Không tìm thấy'));
    expect(result.current.loading).toBe(false);
  });

  it('loads older messages before the oldest seq, without duplicates', async () => {
    const { result } = await renderLoaded(page([msg({ seq: 4 }), msg({ seq: 5 })], true));
    getMessages.mockResolvedValueOnce(page([msg({ seq: 3 }), msg({ seq: 4 })]));
    await act(() => result.current.loadMore());
    expect(getMessages).toHaveBeenLastCalledWith('c1', 50, 4);
    expect(ids(result.current.messages)).toEqual(['id-3', 'id-4', 'id-5']);
    expect(result.current.hasMore).toBe(false);

    await act(() => result.current.loadMore());
    expect(getMessages).toHaveBeenCalledTimes(2);
  });
});

describe('useMessages: socket events', () => {
  it('adds a message of the open conversation and marks it as seen', async () => {
    const { result } = await renderLoaded(page([msg({ seq: 1 })]));
    emit('message:new', { message: msg({ seq: 2 }) });
    expect(ids(result.current.messages)).toEqual(['id-1', 'id-2']);
    expect(onSeen).toHaveBeenLastCalledWith('c1', 2);
  });

  it('ignores a message of another conversation', async () => {
    const { result } = await renderLoaded(page([msg({ seq: 1 })]));
    onSeen.mockClear();
    emit('message:new', { message: msg({ seq: 9, conversationId: 'c2' }) });
    expect(ids(result.current.messages)).toEqual(['id-1']);
    expect(onSeen).not.toHaveBeenCalled();
  });

  it('empties a revoked message', async () => {
    const attachments = [{ kind: 'image' as const, url: 'u', name: 'n', bytes: 1 }];
    const { result } = await renderLoaded(page([msg({ seq: 1, attachments })]));
    emit('message:revoked', { messageId: 'id-1', conversationId: 'c1', content: 'Tin nhắn đã thu hồi', isRevoked: true });
    expect(result.current.messages[0]).toMatchObject({ isRevoked: true, content: 'Tin nhắn đã thu hồi' });
    expect(result.current.messages[0].attachments).toBeUndefined();
  });

  it('removes its listeners on unmount', async () => {
    const { unmount } = await renderLoaded(page([msg({ seq: 1 })]));
    unmount();
    expect(handlers.size).toBe(0);
  });
});

describe('useMessages: sending', () => {
  it('shows the message at once, then swaps in the stored copy', async () => {
    const { result } = await renderLoaded(page([msg({ seq: 1 })]));
    const reply = deferred<SendResult>();
    sendMessage.mockReturnValueOnce(reply.promise);
    act(() => result.current.sendMessage('  chào  '));

    const pending = result.current.messages[1];
    expect(pending).toMatchObject({ content: 'chào', senderId: 'me', status: 'sending' });
    expect(pending.seq).toBeUndefined();
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    const { clientMsgId } = sendMessage.mock.calls[0][0];
    expect(clientMsgId).toBe(pending.clientMsgId);

    const saved = msg({ seq: 2, clientMsgId, senderId: 'me', content: 'chào' });
    // the event and the response carry the same message, in either order
    emit('message:new', { message: saved });
    await act(async () => reply.resolve({ success: true, message: '', data: saved }));
    expect(ids(result.current.messages)).toEqual(['id-1', 'id-2']);
  });

  it('sends nothing for blank text', async () => {
    const { result } = await renderLoaded(page([msg({ seq: 1 })]));
    act(() => result.current.sendMessage('   '));
    expect(result.current.messages).toHaveLength(1);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('retries a server error with the same clientMsgId', async () => {
    const { result } = await renderLoaded(page([msg({ seq: 1 })]));
    vi.useFakeTimers();
    sendMessage
      .mockRejectedValueOnce(httpError(503))
      .mockRejectedValueOnce(new Error('network'))
      .mockImplementationOnce(async ({ clientMsgId }) => ({
        success: true,
        message: '',
        data: msg({ seq: 2, clientMsgId, senderId: 'me' }),
      }));
    act(() => result.current.sendMessage('a'));
    await act(() => vi.advanceTimersByTimeAsync(999));
    expect(sendMessage).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1 + 2000));
    expect(sendMessage).toHaveBeenCalledTimes(3);
    expect(new Set(sendMessage.mock.calls.map(([p]) => p.clientMsgId)).size).toBe(1);
    expect(ids(result.current.messages)).toEqual(['id-1', 'id-2']);
  });

  it('gives up after 5 retries', async () => {
    const { result } = await renderLoaded(page([msg({ seq: 1 })]));
    vi.useFakeTimers();
    sendMessage.mockRejectedValue(httpError(500));
    act(() => result.current.sendMessage('a'));
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(sendMessage).toHaveBeenCalledTimes(6);
    expect(result.current.messages[1].status).toBe('failed');
  });

  it('fails at once on a 4xx; retry keeps the clientMsgId', async () => {
    const { result } = await renderLoaded(page([msg({ seq: 1 })]));
    sendMessage.mockRejectedValueOnce(httpError(403));
    act(() => result.current.sendMessage('a'));
    await waitFor(() => expect(result.current.messages[1].status).toBe('failed'));
    expect(sendMessage).toHaveBeenCalledTimes(1);

    const { clientMsgId } = sendMessage.mock.calls[0][0];
    sendMessage.mockResolvedValueOnce({ success: true, message: '', data: msg({ seq: 2, clientMsgId }) });
    act(() => result.current.retryMessage(clientMsgId));
    await waitFor(() => expect(ids(result.current.messages)).toEqual(['id-1', 'id-2']));
    expect(sendMessage.mock.calls[1][0].clientMsgId).toBe(clientMsgId);
  });

  it('does not mark a message as failed once its stored copy arrived', async () => {
    const { result } = await renderLoaded(page([msg({ seq: 1 })]));
    const reply = deferred<SendResult>();
    sendMessage.mockReturnValueOnce(reply.promise);
    act(() => result.current.sendMessage('a'));
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    const { clientMsgId } = sendMessage.mock.calls[0][0];
    emit('message:new', { message: msg({ seq: 2, clientMsgId }) });
    await act(async () => reply.reject(httpError(400)));
    expect(result.current.messages.map((m) => m.status)).toEqual([undefined, undefined]);
  });

  it('revoking empties the message; an error is passed on and changes nothing', async () => {
    const { result } = await renderLoaded(page([msg({ seq: 1 }), msg({ seq: 2 })]));
    revokeMessage.mockResolvedValueOnce({});
    await act(() => result.current.revokeMessage('id-1'));
    expect(result.current.messages[0].isRevoked).toBe(true);
    revokeMessage.mockRejectedValueOnce(httpError(403));
    await expect(result.current.revokeMessage('id-2')).rejects.toThrow('HTTP 403');
    expect(result.current.messages[1].isRevoked).toBeUndefined();
  });
});

// Known bugs: `it.fails` turns red once they are fixed (item 2.4), then drop `.fails`
describe('useMessages: switching conversation', () => {
  it.fails('ignores the history of the previous conversation when it arrives late', async () => {
    const slow = deferred<MessagesResponse>();
    getMessages.mockReturnValueOnce(slow.promise);
    const { result, rerender } = render('c1');
    await waitFor(() => expect(getMessages).toHaveBeenCalledTimes(1));
    getMessages.mockResolvedValueOnce(page([msg({ seq: 7, conversationId: 'c2' })]));
    rerender({ conv: 'c2' });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    await act(async () => slow.resolve(page([msg({ seq: 1 }), msg({ seq: 2 })])));
    expect(ids(result.current.messages)).toEqual(['id-7']);
    expect(onSeen).not.toHaveBeenCalledWith('c1', 2);
  });

  it.fails('does not show the previous conversation while the next one loads', async () => {
    const { result, rerender } = await renderLoaded(page([msg({ seq: 1 })]));
    getMessages.mockReturnValueOnce(new Promise(() => undefined));
    rerender({ conv: 'c2' });
    await waitFor(() => expect(getMessages).toHaveBeenCalledTimes(2));
    expect(result.current.messages).toEqual([]);
  });

  it.fails('keeps a message that failed while another conversation was open', async () => {
    const { result, rerender } = await renderLoaded(page([msg({ seq: 1 })]));
    const reply = deferred<SendResult>();
    sendMessage.mockReturnValueOnce(reply.promise);
    act(() => result.current.sendMessage('a'));
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    getMessages.mockResolvedValueOnce(page([msg({ seq: 7, conversationId: 'c2' })]));
    rerender({ conv: 'c2' });
    await waitFor(() => expect(ids(result.current.messages)).toEqual(['id-7']));
    await act(async () => reply.reject(httpError(403)));
    getMessages.mockResolvedValueOnce(page([msg({ seq: 1 })]));
    rerender({ conv: 'c1' });
    await waitFor(() => expect(result.current.messages[0]?._id).toBe('id-1'));
    await act(async () => undefined);
    expect(result.current.messages.map((m) => m.status)).toEqual([undefined, 'failed']);
  });
});
