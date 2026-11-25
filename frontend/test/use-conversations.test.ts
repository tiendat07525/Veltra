// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation } from '@/types/conversation';

const { getConversations, handlers } = vi.hoisted(() => ({
  getConversations: vi.fn<() => Promise<Conversation[]>>(),
  handlers: new Map<string, (payload?: unknown) => void>(),
}));
vi.mock('@/services/api/conversation.service', () => ({ conversationService: { getConversations } }));
vi.mock('@/services/socket/socket.service', () => ({
  socketService: {
    on: (event: string, handler: (payload?: unknown) => void) => handlers.set(event, handler),
    off: (event: string) => handlers.delete(event),
  },
}));

import { useConversations } from '@/hooks/use-conversations';

const conv = (id: string, lastSeq = 1): Conversation => ({ _id: id, type: 'group', participants: [], lastSeq });
const emit = (event: string, payload?: unknown) => act(async () => handlers.get(event)!(payload));
const ids = (list: Conversation[]) => list.map((c) => c._id);
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
};
const renderLoaded = async (list: Conversation[]) => {
  getConversations.mockResolvedValueOnce(list);
  const hook = renderHook(() => useConversations(true, 'me'));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(cleanup);

describe('useConversations: connect', () => {
  it('reads the list again without a loading state', async () => {
    const { result } = await renderLoaded([conv('a')]);
    const answer = deferred<Conversation[]>();
    getConversations.mockReturnValueOnce(answer.promise);
    await emit('connect');
    expect(result.current.loading).toBe(false);
    await act(async () => answer.resolve([conv('b'), conv('a', 4)]));
    expect(ids(result.current.allConversations)).toEqual(['b', 'a']);
    expect(result.current.allConversations[1].lastSeq).toBe(4);
  });

  it('keeps a message that arrived while the list was read', async () => {
    const { result } = await renderLoaded([conv('a'), conv('b')]);
    const answer = deferred<Conversation[]>();
    getConversations.mockReturnValueOnce(answer.promise);
    await emit('connect');
    await emit('message:new', { message: { _id: 'm', conversationId: 'b', seq: 2, content: 'hi' }, conversation: { lastSeq: 2 } });
    await act(async () => answer.resolve([conv('a'), conv('b')]));
    expect(result.current.allConversations[0]).toMatchObject({ _id: 'b', lastSeq: 2, lastMessage: { content: 'hi' } });
  });

  it('keeps the list when the request fails', async () => {
    const { result } = await renderLoaded([conv('a')]);
    getConversations.mockRejectedValueOnce(new Error('offline'));
    await emit('connect');
    expect(ids(result.current.allConversations)).toEqual(['a']);
  });

  it('runs once more, not in parallel, when asked during a run', async () => {
    const { result } = await renderLoaded([conv('a')]);
    const answer = deferred<Conversation[]>();
    getConversations.mockReturnValueOnce(answer.promise).mockResolvedValueOnce([conv('z')]);
    await emit('connect');
    await emit('connect');
    await emit('message:new', { message: { _id: 'm', conversationId: 'unknown', seq: 1 } });
    expect(getConversations).toHaveBeenCalledTimes(2);
    await act(async () => answer.resolve([conv('a')]));
    expect(getConversations).toHaveBeenCalledTimes(3);
    expect(ids(result.current.allConversations)).toEqual(['z']);
  });
});
