// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message, MessagesResponse, ReactionUpdate } from '@/types/message';

type SendResult = { success: boolean; message: string; data?: Message };

const { getMessages, sendMessage, revokeMessage, setReaction, removeReaction, markAsSeen, upload, classifyFile, handlers } = vi.hoisted(() => ({
  getMessages: vi.fn<(id: string, limit?: number, beforeSeq?: number) => Promise<MessagesResponse>>(),
  sendMessage: vi.fn<(p: { clientMsgId: string; content?: string; conversationId?: string }) => Promise<SendResult>>(),
  revokeMessage: vi.fn<(id: string) => Promise<unknown>>(),
  setReaction: vi.fn<(id: string, emoji: string) => Promise<ReactionUpdate>>(),
  removeReaction: vi.fn<(id: string) => Promise<ReactionUpdate>>(),
  markAsSeen: vi.fn<(id: string, upToSeq?: number) => Promise<unknown>>(),
  upload: vi.fn<() => Promise<{ publicId: string }>>(),
  classifyFile: vi.fn<() => { ok: boolean; kind?: string }>(() => ({ ok: false })),
  handlers: new Map<string, (payload: unknown) => void>(),
}));
vi.mock('@/services/api/message.service', () => ({
  messageService: { getMessages, sendMessage, revokeMessage, setReaction, removeReaction },
}));
vi.mock('@/services/api/conversation.service', () => ({ conversationService: { markAsSeen } }));
vi.mock('@/services/api/attachment.service', () => ({ attachmentService: { upload }, classifyFile }));
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

describe('useMessages: failed sends in the conversation list', () => {
  const failed = (result: { current: { failedConversationIds: Set<string> } }) => [...result.current.failedConversationIds];

  it('marks a conversation that failed while another one is open, until the retry is stored', async () => {
    const { result, rerender } = await renderLoaded(page([msg({ seq: 1 })]));
    const reply = deferred<SendResult>();
    sendMessage.mockReturnValueOnce(reply.promise);
    act(() => result.current.sendMessage('a'));
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    // Still sending: no mark
    expect(failed(result)).toEqual([]);

    getMessages.mockResolvedValueOnce(page([msg({ seq: 7, conversationId: 'c2' })]));
    rerender({ conv: 'c2' });
    await waitFor(() => expect(ids(result.current.messages)).toEqual(['id-7']));
    await act(async () => reply.reject(httpError(403)));
    expect(failed(result)).toEqual(['c1']);

    // Retry: sending again → no mark; stored → none either
    const { clientMsgId } = sendMessage.mock.calls[0][0];
    const retried = deferred<SendResult>();
    sendMessage.mockReturnValueOnce(retried.promise);
    act(() => result.current.retryMessage(clientMsgId));
    expect(failed(result)).toEqual([]);
    await act(async () => retried.resolve({ success: true, message: '', data: msg({ seq: 2, clientMsgId }) }));
    expect(failed(result)).toEqual([]);
  });

  it('comes back when the retry fails too, and goes when the conversation is removed', async () => {
    const { result } = await renderLoaded(page([msg({ seq: 1 })]));
    sendMessage.mockRejectedValueOnce(httpError(403));
    act(() => result.current.sendMessage('a'));
    await waitFor(() => expect(failed(result)).toEqual(['c1']));

    const { clientMsgId } = sendMessage.mock.calls[0][0];
    sendMessage.mockRejectedValueOnce(httpError(403));
    act(() => result.current.retryMessage(clientMsgId));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(failed(result)).toEqual(['c1']));

    emit('conversation:removed', { conversationId: 'c1' });
    expect(failed(result)).toEqual([]);
  });

  it('keeps the same set between renders when nothing changed', async () => {
    const { result, rerender } = await renderLoaded(page([msg({ seq: 1 })]));
    const before = result.current.failedConversationIds;
    rerender({ conv: 'c1' });
    expect(result.current.failedConversationIds).toBe(before);
  });
});

describe('useMessages: switching conversation', () => {
  it('ignores the history of the previous conversation when it arrives late', async () => {
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

  it('does not show the previous conversation while the next one loads', async () => {
    const { result, rerender } = await renderLoaded(page([msg({ seq: 1 })]));
    getMessages.mockReturnValueOnce(new Promise(() => undefined));
    rerender({ conv: 'c2' });
    await waitFor(() => expect(getMessages).toHaveBeenCalledTimes(2));
    expect(result.current.messages).toEqual([]);
  });

  it('keeps a message that failed while another conversation was open', async () => {
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

  it('A, B, then A again: only the last request for A counts', async () => {
    const first = deferred<MessagesResponse>();
    getMessages.mockReturnValueOnce(first.promise);
    const { result, rerender } = render('c1');
    await waitFor(() => expect(getMessages).toHaveBeenCalledTimes(1));
    getMessages.mockReturnValueOnce(new Promise(() => undefined));
    rerender({ conv: 'c2' });
    await waitFor(() => expect(getMessages).toHaveBeenCalledTimes(2));
    const last = deferred<MessagesResponse>();
    getMessages.mockReturnValueOnce(last.promise);
    rerender({ conv: 'c1' });
    await waitFor(() => expect(getMessages).toHaveBeenCalledTimes(3));
    await act(async () => first.reject(httpError(500)));
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(true);
    await act(async () => last.resolve(page([msg({ seq: 5 })])));
    expect(ids(result.current.messages)).toEqual(['id-5']);
    expect(result.current.loading).toBe(false);
  });

  it('counts as loading from the first render of the new conversation', async () => {
    const { result, rerender } = await renderLoaded(page([msg({ seq: 1 })], true));
    getMessages.mockReturnValueOnce(new Promise(() => undefined));
    rerender({ conv: 'c2' });
    expect(result.current).toMatchObject({ loading: true, hasMore: false, messages: [] });
    await act(async () => undefined);
  });

  it('drops the load error of the previous conversation', async () => {
    getMessages.mockRejectedValueOnce(httpError(500));
    const { result, rerender } = render('c1');
    await waitFor(() => expect(result.current.error).not.toBeNull());
    rerender({ conv: null });
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.loading).toBe(false);
  });

  it('older messages of the previous conversation neither appear nor block the next one', async () => {
    const { result, rerender } = await renderLoaded(page([msg({ seq: 4 })], true));
    const older = deferred<MessagesResponse>();
    getMessages.mockReturnValueOnce(older.promise);
    act(() => void result.current.loadMore());
    expect(result.current.loadingMore).toBe(true);
    getMessages.mockResolvedValueOnce(page([msg({ seq: 9, conversationId: 'c2' })], true));
    rerender({ conv: 'c2' });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.loadingMore).toBe(false);
    getMessages.mockResolvedValueOnce(page([msg({ seq: 8, conversationId: 'c2' })]));
    await act(() => result.current.loadMore());
    expect(getMessages).toHaveBeenLastCalledWith('c2', 50, 9);
    await act(async () => older.resolve(page([msg({ seq: 3 })])));
    expect(ids(result.current.messages)).toEqual(['id-8', 'id-9']);
  });

  it('a message stored while another conversation is open leaves nothing pending', async () => {
    const { result, rerender } = await renderLoaded(page([msg({ seq: 1 })]));
    const reply = deferred<SendResult>();
    sendMessage.mockReturnValueOnce(reply.promise);
    act(() => result.current.sendMessage('a'));
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    const { clientMsgId } = sendMessage.mock.calls[0][0];
    getMessages.mockResolvedValueOnce(page([msg({ seq: 7, conversationId: 'c2' })]));
    rerender({ conv: 'c2' });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    const saved = msg({ seq: 2, clientMsgId, senderId: 'me' });
    await act(async () => reply.resolve({ success: true, message: '', data: saved }));
    expect(ids(result.current.messages)).toEqual(['id-7']);
    getMessages.mockResolvedValueOnce(page([msg({ seq: 1 })]));
    rerender({ conv: 'c1' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(ids(result.current.messages)).toEqual(['id-1']);
  });

  it('retries a failed message after coming back, with the same clientMsgId', async () => {
    const { result, rerender } = await renderLoaded(page([msg({ seq: 1 })]));
    sendMessage.mockRejectedValueOnce(httpError(403));
    act(() => result.current.sendMessage('a'));
    await waitFor(() => expect(result.current.messages[1].status).toBe('failed'));
    const { clientMsgId } = sendMessage.mock.calls[0][0];
    getMessages.mockResolvedValue(page([msg({ seq: 1 })]));
    rerender({ conv: 'c2' });
    await act(async () => undefined);
    rerender({ conv: 'c1' });
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    sendMessage.mockResolvedValueOnce({ success: true, message: '', data: msg({ seq: 2, clientMsgId }) });
    act(() => {
      result.current.retryMessage(clientMsgId);
      result.current.retryMessage(clientMsgId);
    });
    await waitFor(() => expect(ids(result.current.messages)).toEqual(['id-1', 'id-2']));
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[1][0]).toMatchObject({ clientMsgId, conversationId: 'c1' });
    getMessages.mockReset();
  });
});

describe('useMessages: while the history loads', () => {
  const renderLoading = async () => {
    const first = deferred<MessagesResponse>();
    getMessages.mockReturnValueOnce(first.promise);
    const hook = render();
    await waitFor(() => expect(getMessages).toHaveBeenCalledTimes(1));
    return { ...hook, first };
  };

  it('keeps a message that arrived meanwhile, and marks it seen only once shown', async () => {
    const { result, first } = await renderLoading();
    emit('message:new', { message: msg({ seq: 3 }) });
    expect(onSeen).not.toHaveBeenCalled();
    await act(async () => first.resolve(page([msg({ seq: 1 }), msg({ seq: 2 })])));
    expect(ids(result.current.messages)).toEqual(['id-1', 'id-2', 'id-3']);
    expect(onSeen.mock.calls).toEqual([['c1', 3]]);
  });

  it('does not bring back a message revoked meanwhile', async () => {
    const { result, first } = await renderLoading();
    emit('message:revoked', { messageId: 'id-1', conversationId: 'c1', content: 'Đã thu hồi', isRevoked: true });
    await act(async () => first.resolve(page([msg({ seq: 1, content: 'bí mật' })])));
    expect(result.current.messages[0]).toMatchObject({ isRevoked: true, content: 'Đã thu hồi' });
  });

  it('shows a message sent meanwhile after the first page', async () => {
    const { result, first } = await renderLoading();
    sendMessage.mockReturnValueOnce(new Promise(() => undefined));
    act(() => result.current.sendMessage('a'));
    expect(result.current.messages).toEqual([]);
    await act(async () => first.resolve(page([msg({ seq: 1 })])));
    expect(result.current.messages.map((m) => m.status)).toEqual([undefined, 'sending']);
  });

  it('does not mark anything seen while the history could not be loaded', async () => {
    const { result, first } = await renderLoading();
    await act(async () => first.reject(httpError(500)));
    emit('message:new', { message: msg({ seq: 3 }) });
    expect(onSeen).not.toHaveBeenCalled();
    expect(result.current.error).not.toBeNull();
  });

  it('a reload keeps unsent messages, drops the ones the server has', async () => {
    const { result } = await renderLoaded(page([msg({ seq: 1 })]));
    sendMessage.mockRejectedValue(httpError(403));
    act(() => result.current.sendMessage('a'));
    act(() => result.current.sendMessage('b'));
    await waitFor(() => expect(result.current.messages.map((m) => m.status)).toEqual([undefined, 'failed', 'failed']));
    const { clientMsgId } = sendMessage.mock.calls[0][0];
    getMessages.mockResolvedValueOnce(page([msg({ seq: 1 }), msg({ seq: 2, clientMsgId })]));
    await act(() => result.current.refetch());
    expect(result.current.messages.map((m) => m.seq ?? m.content)).toEqual([1, 2, 'b']);
    sendMessage.mockReset();
  });
});

describe('useMessages: outbox', () => {
  it('a late send response does not bring back a revoked message', async () => {
    const { result } = await renderLoaded(page([msg({ seq: 1 })]));
    const reply = deferred<SendResult>();
    sendMessage.mockReturnValueOnce(reply.promise);
    act(() => result.current.sendMessage('a'));
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    const { clientMsgId } = sendMessage.mock.calls[0][0];
    const saved = msg({ seq: 2, clientMsgId, senderId: 'me', content: 'a' });
    emit('message:new', { message: saved });
    emit('message:revoked', { messageId: 'id-2', conversationId: 'c1', content: 'Đã thu hồi', isRevoked: true });
    await act(async () => reply.resolve({ success: true, message: '', data: saved }));
    expect(result.current.messages[1]).toMatchObject({ isRevoked: true, content: 'Đã thu hồi' });
  });

  it('a removed conversation drops its unsent messages and stops the retries', async () => {
    const { result } = await renderLoaded(page([msg({ seq: 1 })]));
    vi.useFakeTimers();
    sendMessage.mockRejectedValueOnce(httpError(500));
    act(() => result.current.sendMessage('a'));
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(result.current.messages).toHaveLength(2);
    emit('conversation:removed', { conversationId: 'c1' });
    expect(ids(result.current.messages)).toEqual(['id-1']);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('keeps the previews of an unsent message and frees them once it is stored', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:1');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const { result, rerender } = await renderLoaded(page([msg({ seq: 1 })]));
    classifyFile.mockReturnValueOnce({ ok: true, kind: 'image' });
    upload.mockResolvedValueOnce({ publicId: 'p1' });
    const reply = deferred<SendResult>();
    sendMessage.mockReturnValueOnce(reply.promise);
    act(() => result.current.sendMessage('', [new File(['x'], 'a.png')]));
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    const { clientMsgId } = sendMessage.mock.calls[0][0];
    getMessages.mockResolvedValue(page([msg({ seq: 1 })]));
    rerender({ conv: 'c2' });
    await act(async () => undefined);
    rerender({ conv: 'c1' });
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages[1].attachments).toMatchObject([{ url: 'blob:1', progress: 1 }]);
    expect(revoke).not.toHaveBeenCalled();
    await act(async () => reply.resolve({ success: true, message: '', data: msg({ seq: 2, clientMsgId }) }));
    expect(ids(result.current.messages)).toEqual(['id-1', 'id-2']);
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:1');
    getMessages.mockReset();
    create.mockRestore();
    revoke.mockRestore();
  });
});

describe('useMessages: resync', () => {
  const range = (from: number, to: number, over: Partial<Message> = {}) =>
    Array.from({ length: to - from + 1 }, (_, i) => msg({ seq: from + i, ...over }));
  const seqs = (list: Message[]) => list.map((m) => m.seq);
  const reconnect = () => act(async () => handlers.get('connect')!(undefined));

  it('adds the missed messages without a loading state and marks them seen', async () => {
    const { result } = await renderLoaded(page(range(1, 3)));
    const answer = deferred<MessagesResponse>();
    getMessages.mockReturnValueOnce(answer.promise);
    await reconnect();
    expect(result.current.loading).toBe(false);
    expect(result.current.messages).toHaveLength(3);
    await act(async () => answer.resolve(page(range(1, 5))));
    expect(seqs(result.current.messages)).toEqual([1, 2, 3, 4, 5]);
    expect(onSeen).toHaveBeenLastCalledWith('c1', 5);
  });

  it('changes nothing and marks nothing when nothing was missed', async () => {
    const { result } = await renderLoaded(page(range(1, 3)));
    onSeen.mockClear();
    getMessages.mockResolvedValueOnce(page(range(1, 3)));
    await reconnect();
    expect(seqs(result.current.messages)).toEqual([1, 2, 3]);
    expect(onSeen).not.toHaveBeenCalled();
  });

  it('shows a revoke that was missed', async () => {
    const { result } = await renderLoaded(page(range(1, 2)));
    getMessages.mockResolvedValueOnce(page([msg({ seq: 1, isRevoked: true, content: 'Đã thu hồi' }), msg({ seq: 2 })]));
    await reconnect();
    expect(result.current.messages[0]).toMatchObject({ isRevoked: true, content: 'Đã thu hồi' });
  });

  it('reads pages back until it covers what is held, and keeps the older page state', async () => {
    const { result } = await renderLoaded(page(range(51, 100), true));
    getMessages
      .mockResolvedValueOnce(page(range(131, 180), true))
      .mockResolvedValueOnce(page(range(81, 130), true))
      .mockResolvedValueOnce(page(range(31, 80), true));
    getMessages.mockClear();
    await reconnect();
    expect(getMessages.mock.calls.map((c) => c[2])).toEqual([undefined, 131, 81]);
    expect(seqs(result.current.messages)).toEqual(seqs(range(31, 180)));
    expect(result.current.hasMore).toBe(true);
  });

  it('too far behind: keeps the newest pages only, and an older page on the way is dropped', async () => {
    const { result } = await renderLoaded(page(range(51, 100), true));
    const older = deferred<MessagesResponse>();
    getMessages.mockReturnValueOnce(older.promise);
    act(() => void result.current.loadMore());
    for (let to = 1000; to > 800; to -= 50) getMessages.mockResolvedValueOnce(page(range(to - 49, to), true));
    await reconnect();
    expect(seqs(result.current.messages)).toEqual(seqs(range(801, 1000)));
    expect(result.current).toMatchObject({ hasMore: true, loadingMore: false });
    await act(async () => older.resolve(page(range(1, 50))));
    expect(result.current.messages[0].seq).toBe(801);
    expect(result.current.hasMore).toBe(true);
  });

  it('keeps a message and a revoke that arrive while it runs', async () => {
    const { result } = await renderLoaded(page(range(1, 2)));
    const answer = deferred<MessagesResponse>();
    getMessages.mockReturnValueOnce(answer.promise);
    await reconnect();
    emit('message:new', { message: msg({ seq: 4 }) });
    emit('message:revoked', { messageId: 'id-1', conversationId: 'c1', content: 'Đã thu hồi', isRevoked: true });
    await act(async () => answer.resolve(page(range(1, 3))));
    expect(seqs(result.current.messages)).toEqual([1, 2, 3, 4]);
    expect(result.current.messages[0].isRevoked).toBe(true);
  });

  it('keeps unsent messages', async () => {
    const { result } = await renderLoaded(page(range(1, 1)));
    sendMessage.mockRejectedValueOnce(httpError(403));
    act(() => result.current.sendMessage('a'));
    await waitFor(() => expect(result.current.messages[1].status).toBe('failed'));
    getMessages.mockResolvedValueOnce(page(range(1, 2)));
    await reconnect();
    expect(result.current.messages.map((m) => m.seq ?? m.status)).toEqual([1, 2, 'failed']);
  });

  it('keeps the list when it fails', async () => {
    const { result } = await renderLoaded(page(range(1, 2)));
    getMessages.mockRejectedValueOnce(httpError(500));
    await reconnect();
    expect(seqs(result.current.messages)).toEqual([1, 2]);
    expect(result.current.error).toBeNull();
  });

  it('loads a history that could not be loaded before', async () => {
    getMessages.mockRejectedValueOnce(httpError(500));
    const { result } = render();
    await waitFor(() => expect(result.current.error).not.toBeNull());
    getMessages.mockResolvedValueOnce(page(range(1, 2)));
    await reconnect();
    expect(seqs(result.current.messages)).toEqual([1, 2]);
    expect(result.current.error).toBeNull();
  });

  it('waits for the first page, then reads again', async () => {
    const first = deferred<MessagesResponse>();
    getMessages.mockReturnValueOnce(first.promise).mockResolvedValueOnce(page(range(1, 3)));
    const { result } = render();
    await waitFor(() => expect(getMessages).toHaveBeenCalledTimes(1));
    await reconnect();
    expect(getMessages).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve(page(range(1, 2))));
    expect(seqs(result.current.messages)).toEqual([1, 2, 3]);
  });

  it('a run for the previous conversation does not touch or block the next one', async () => {
    const { result, rerender } = await renderLoaded(page(range(1, 2)));
    const late = deferred<MessagesResponse>();
    getMessages.mockReturnValueOnce(late.promise);
    await reconnect();
    getMessages.mockResolvedValueOnce(page(range(1, 1, { conversationId: 'c2' })));
    rerender({ conv: 'c2' });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    await reconnect(); // asked while the old run is still going
    getMessages.mockResolvedValueOnce(page(range(1, 2, { conversationId: 'c2' })));
    await act(async () => late.resolve(page(range(1, 9))));
    expect(seqs(result.current.messages)).toEqual([1, 2]);
  });

  describe('gap', () => {
    it('asks for a message that never came, once', async () => {
      const { result } = await renderLoaded(page(range(1, 2)));
      vi.useFakeTimers();
      getMessages.mockClear();
      getMessages.mockResolvedValueOnce(page(range(1, 5)));
      emit('message:new', { message: msg({ seq: 5 }) });
      await act(() => vi.advanceTimersByTimeAsync(400));
      expect(getMessages).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(200));
      expect(seqs(result.current.messages)).toEqual([1, 2, 3, 4, 5]);
      expect(getMessages).toHaveBeenCalledTimes(1);
    });

    it('does not ask when the missing one comes by itself', async () => {
      await renderLoaded(page(range(1, 2)));
      vi.useFakeTimers();
      getMessages.mockClear();
      emit('message:new', { message: msg({ seq: 4 }) });
      await act(() => vi.advanceTimersByTimeAsync(300));
      emit('message:new', { message: msg({ seq: 3 }) });
      await act(() => vi.advanceTimersByTimeAsync(5000));
      expect(getMessages).not.toHaveBeenCalled();
    });

    it('does not ask again and again for one the server does not have', async () => {
      await renderLoaded(page(range(1, 2)));
      vi.useFakeTimers();
      getMessages.mockClear();
      getMessages.mockResolvedValue(page([...range(1, 2), msg({ seq: 4 })]));
      emit('message:new', { message: msg({ seq: 4 }) });
      await act(() => vi.advanceTimersByTimeAsync(5000));
      emit('message:new', { message: msg({ seq: 5 }) });
      await act(() => vi.advanceTimersByTimeAsync(5000));
      expect(getMessages).toHaveBeenCalledTimes(1);
      getMessages.mockReset();
    });
  });
});

describe('useMessages: reactions', () => {
  const update = (version: number, reactions: ReactionUpdate['reactions'], messageId = 'id-1'): ReactionUpdate => ({
    messageId,
    conversationId: 'c1',
    reactions,
    reactionsVersion: version,
  });
  const reactionsOf = (list: Message[], id = 'id-1') => list.find((m) => m._id === id)?.reactions;

  it('shows the newest version and ignores an older event that arrives later', async () => {
    const { result } = await renderLoaded(page([msg({ seq: 1 })]));
    emit('message:reaction', update(2, [{ userId: 'a', emoji: '👍' }, { userId: 'b', emoji: '❤️' }]));
    emit('message:reaction', update(1, [{ userId: 'a', emoji: '👍' }]));
    expect(reactionsOf(result.current.messages)).toEqual([
      { userId: 'a', emoji: '👍' },
      { userId: 'b', emoji: '❤️' },
    ]);
    emit('message:reaction', update(3, []));
    expect(reactionsOf(result.current.messages)).toBeUndefined();
  });

  it('a history page read before a newer reaction does not bring the old reactions back', async () => {
    const { result } = await renderLoaded(page([msg({ seq: 1 })]));
    emit('message:reaction', update(4, [{ userId: 'a', emoji: '😮' }]));
    getMessages.mockResolvedValueOnce(
      page([msg({ seq: 1, reactions: [{ userId: 'a', emoji: '👍' }], reactionsVersion: 3 })])
    );
    emit('connect', undefined);
    await waitFor(() => expect(getMessages).toHaveBeenCalledTimes(2));
    await act(async () => undefined);
    expect(reactionsOf(result.current.messages)).toEqual([{ userId: 'a', emoji: '😮' }]);
  });

  it('a newer history page wins over an older event', async () => {
    const { result } = await renderLoaded(page([msg({ seq: 1 })]));
    emit('message:reaction', update(1, [{ userId: 'a', emoji: '😮' }]));
    getMessages.mockResolvedValueOnce(page([msg({ seq: 1, reactionsVersion: 2 })]));
    emit('connect', undefined);
    await waitFor(() => expect(getMessages).toHaveBeenCalledTimes(2));
    await act(async () => undefined);
    expect(reactionsOf(result.current.messages)).toBeUndefined();
  });

  it('a reaction for a message not loaded yet is applied when its page arrives', async () => {
    const first = deferred<MessagesResponse>();
    getMessages.mockReturnValueOnce(first.promise);
    const { result } = render();
    await waitFor(() => expect(getMessages).toHaveBeenCalled());
    emit('message:reaction', update(1, [{ userId: 'a', emoji: '😂' }]));
    await act(async () => first.resolve(page([msg({ seq: 1 })])));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(reactionsOf(result.current.messages)).toEqual([{ userId: 'a', emoji: '😂' }]);
  });

  it('a revoke clears the reactions, and a late reaction event does not bring them back', async () => {
    const { result } = await renderLoaded(page([msg({ seq: 1, reactions: [{ userId: 'a', emoji: '👍' }], reactionsVersion: 1 })]));
    emit('message:revoked', { messageId: 'id-1', conversationId: 'c1', content: 'Tin nhắn đã thu hồi', isRevoked: true });
    expect(reactionsOf(result.current.messages)).toBeUndefined();
    emit('message:reaction', update(2, [{ userId: 'b', emoji: '❤️' }]));
    expect(reactionsOf(result.current.messages)).toBeUndefined();
    expect(result.current.messages[0].isRevoked).toBe(true);
  });

  it('reactToMessage: PUT / DELETE, shown from the response (not optimistic); errors are passed on', async () => {
    const { result } = await renderLoaded(page([msg({ seq: 1 })]));
    const put = deferred<ReactionUpdate>();
    setReaction.mockReturnValueOnce(put.promise);
    let done!: Promise<void>;
    act(() => {
      done = result.current.reactToMessage('id-1', '❤️');
    });
    expect(setReaction).toHaveBeenCalledWith('id-1', '❤️');
    expect(reactionsOf(result.current.messages)).toBeUndefined();
    await act(async () => {
      put.resolve(update(1, [{ userId: 'me', emoji: '❤️' }]));
      await done;
    });
    expect(reactionsOf(result.current.messages)).toEqual([{ userId: 'me', emoji: '❤️' }]);
    // The event for the same change arrives too: nothing changes
    emit('message:reaction', update(1, [{ userId: 'me', emoji: '❤️' }]));
    expect(reactionsOf(result.current.messages)).toEqual([{ userId: 'me', emoji: '❤️' }]);

    removeReaction.mockResolvedValueOnce(update(2, []));
    await act(() => result.current.reactToMessage('id-1', null));
    expect(removeReaction).toHaveBeenCalledWith('id-1');
    expect(reactionsOf(result.current.messages)).toBeUndefined();

    setReaction.mockRejectedValueOnce(httpError(400));
    await expect(act(() => result.current.reactToMessage('id-1', '👍'))).rejects.toThrow('HTTP 400');
    expect(reactionsOf(result.current.messages)).toBeUndefined();
  });

  it('listens for message:reaction and stops on unmount', async () => {
    const { unmount } = await renderLoaded(page([msg({ seq: 1 })]));
    expect(handlers.has('message:reaction')).toBe(true);
    unmount();
    expect(handlers.has('message:reaction')).toBe(false);
  });
});

describe('useMessages: marked seen only while viewing', () => {
  const renderViewing = async (viewing: boolean, first: MessagesResponse) => {
    getMessages.mockResolvedValueOnce(first);
    const hook = renderHook(({ conv, view }) => useMessages(conv, onSeen, true, 'me', view), {
      initialProps: { conv: 'c1' as string | null, view: viewing },
    });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return hook;
  };

  it('a hidden tab marks nothing; back in view marks once, up to the newest message', async () => {
    const { rerender } = await renderViewing(false, page([msg({ seq: 1 }), msg({ seq: 2 })]));
    emit('message:new', { message: msg({ seq: 3 }) });
    emit('message:new', { message: msg({ seq: 4 }) });
    expect(onSeen).not.toHaveBeenCalled();

    rerender({ conv: 'c1', view: true });
    expect(onSeen.mock.calls).toEqual([['c1', 4]]);
    // Nothing new: looking again sends nothing more
    rerender({ conv: 'c1', view: false });
    rerender({ conv: 'c1', view: true });
    expect(onSeen).toHaveBeenCalledTimes(1);
  });

  it('while viewing, every new message is marked as before', async () => {
    await renderViewing(true, page([msg({ seq: 1 })]));
    expect(onSeen.mock.calls).toEqual([['c1', 1]]);
    emit('message:new', { message: msg({ seq: 2 }) });
    expect(onSeen.mock.calls).toEqual([
      ['c1', 1],
      ['c1', 2],
    ]);
  });

  it('what was not seen in another conversation is not marked after switching', async () => {
    const { result, rerender } = await renderViewing(false, page([msg({ seq: 1 })]));
    emit('message:new', { message: msg({ seq: 2 }) });
    getMessages.mockResolvedValueOnce(page([msg({ seq: 7, conversationId: 'c2' })]));
    rerender({ conv: 'c2', view: true });
    await waitFor(() => expect(ids(result.current.messages)).toEqual(['id-7']));
    expect(onSeen.mock.calls).toEqual([['c2', 7]]);
  });
});
