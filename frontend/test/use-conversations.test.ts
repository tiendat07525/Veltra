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

describe('useConversations: user:updated', () => {
  const withMembers = (id: string, displayName: string): Conversation => ({
    ...conv(id),
    participants: [
      { _id: 'bi', username: 'binh', displayName, avatarUrl: 'https://x/old.png' },
      { _id: 'me', username: 'me' },
    ],
  });
  const updated = { user: { _id: 'bi', username: 'binh', displayName: 'Bình Mới' } };

  it('shows the new name and avatar of a member', async () => {
    const { result } = await renderLoaded([withMembers('a', 'Bình'), conv('b')]);
    const untouched = result.current.allConversations[1];
    await emit('user:updated', updated);
    expect(result.current.allConversations[0].participants).toEqual([
      { _id: 'bi', username: 'binh', displayName: 'Bình Mới', avatarUrl: undefined },
      { _id: 'me', username: 'me' },
    ]);
    expect(result.current.allConversations[1]).toBe(untouched);
  });

  it('is not undone by a list read before it, but by a later read', async () => {
    const { result } = await renderLoaded([withMembers('a', 'Bình')]);
    const name = () => result.current.allConversations[0].participants[0].displayName;
    const answer = deferred<Conversation[]>();
    getConversations.mockReturnValueOnce(answer.promise);
    await emit('connect');
    await emit('user:updated', updated);
    await act(async () => answer.resolve([withMembers('a', 'Bình')]));
    expect(name()).toBe('Bình Mới');

    getConversations.mockResolvedValueOnce([withMembers('a', 'Bình Sau')]);
    await emit('connect');
    expect(name()).toBe('Bình Sau');
  });

  it('ignores an event without a user', async () => {
    const { result } = await renderLoaded([withMembers('a', 'Bình')]);
    const before = result.current.allConversations;
    await emit('user:updated', undefined);
    expect(result.current.allConversations).toBe(before);
  });
});

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

describe('useConversations: search', () => {
  const person = (id: string, username: string, displayName?: string) => ({ _id: id, username, displayName });
  const list: Conversation[] = [
    { ...conv('with-an'), type: 'direct', participants: [person('me', 'myself', 'Tôi Đây'), person('u1', 'an_nguyen')] },
    { ...conv('with-binh'), type: 'direct', participants: [person('me', 'myself', 'Tôi Đây'), person('u2', 'b2', 'Bình')] },
    { ...conv('group'), group: { name: 'Lớp học' }, participants: [person('me', 'myself', 'Tôi Đây')], lastMessage: { content: 'Xin chào' } },
  ];
  const search = async (query: string) => {
    const { result } = await renderLoaded(list);
    act(() => result.current.setSearchQuery(query));
    return ids(result.current.conversations);
  };

  it('finds a user without a display name by username', async () => {
    expect(await search('AN_NG')).toEqual(['with-an']);
  });

  it('finds by display name, group name and last message', async () => {
    expect(await search(' bình ')).toEqual(['with-binh']);
    cleanup();
    expect(await search('lớp')).toEqual(['group']);
    cleanup();
    expect(await search('xin chào')).toEqual(['group']);
  });

  it('ignores accents in the query and in the texts', async () => {
    expect(await search('binh')).toEqual(['with-binh']);
    cleanup();
    expect(await search('lop hoc')).toEqual(['group']);
    cleanup();
    expect(await search('xin chao')).toEqual(['group']);
    cleanup();
    expect(await search('ẢN')).toEqual(['with-an']);
  });

  it('my own name does not match every conversation', async () => {
    expect(await search('tôi đây')).toEqual([]);
    cleanup();
    expect(await search('myself')).toEqual([]);
  });
});
