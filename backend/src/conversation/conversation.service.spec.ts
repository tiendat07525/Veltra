import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ConversationService } from './conversation.service';
import { Conversation } from './schemas/conversation.schema';
import { Message } from '../messages/schemas/message.schema';

describe('ConversationService.getMessages (cursor pagination)', () => {
  let service: ConversationService;

  const userId = new Types.ObjectId().toString();
  const conversationId = new Types.ObjectId();

  interface StoredMessage {
    _id: Types.ObjectId;
    conversationId: Types.ObjectId;
    senderId: Types.ObjectId;
    content: string;
    createdAt: Date;
  }
  let store: StoredMessage[] = [];

  const seed = (count: number) => {
    store = Array.from({ length: count }, (_, i) => ({
      _id: new Types.ObjectId(),
      conversationId,
      senderId: new Types.ObjectId(userId),
      content: `m${i}`,
      // 1 second apart so createdAt is unique (tied timestamps are a known limitation)
      createdAt: new Date(Date.UTC(2026, 9, 22, 0, 0, i)),
    }));
  };

  const mockConversationModel = {
    findOne: jest.fn(),
  };

  // Mimics find(query).sort({ createdAt: -1 }).limit(n).lean() over the in-memory store
  const mockMessageModel = {
    find: jest.fn(
      (query: {
        conversationId: Types.ObjectId;
        createdAt?: { $lt: Date };
      }) => {
        const before = query.createdAt?.$lt;
        const rows = store
          .filter((m) => m.conversationId.equals(query.conversationId))
          .filter((m) => !before || m.createdAt < before)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return {
          sort: () => ({
            limit: (n: number) => ({
              lean: () => Promise.resolve(rows.slice(0, n)),
            }),
          }),
        };
      },
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        {
          provide: getModelToken(Conversation.name),
          useValue: mockConversationModel,
        },
        {
          provide: getModelToken(Message.name),
          useValue: mockMessageModel,
        },
      ],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
    jest.clearAllMocks();
    mockConversationModel.findOne.mockResolvedValue({ _id: conversationId });
  });

  const pageThroughAll = async (limit: number) => {
    const contents: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await service.getMessages(
        conversationId.toString(),
        userId,
        limit,
        cursor,
      );
      // Each page is oldest -> newest; older pages are prepended like use-messages.loadMore
      contents.unshift(...page.messages.map((m) => String(m.content)));
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor && pages < 20);
    return { contents, pages };
  };

  it('should return every message exactly once across page boundaries', async () => {
    seed(7);

    const { contents, pages } = await pageThroughAll(3);

    expect(pages).toBe(3);
    expect(contents).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6']);
  });

  it('should set nextCursor to the oldest returned message, not the dropped extra row', async () => {
    seed(5);

    const page = await service.getMessages(
      conversationId.toString(),
      userId,
      2,
    );

    expect(page.messages.map((m) => m.content)).toEqual(['m3', 'm4']);
    expect(page.nextCursor).toBe(store[3].createdAt.toISOString());
  });

  it('should return nextCursor null when no older messages remain', async () => {
    seed(3);

    const page = await service.getMessages(
      conversationId.toString(),
      userId,
      3,
    );

    expect(page.messages).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });

  it('should hide history from non-members with 404', async () => {
    seed(3);
    mockConversationModel.findOne.mockResolvedValue(null);

    await expect(
      service.getMessages(conversationId.toString(), userId, 2),
    ).rejects.toThrow(NotFoundException);
    expect(mockMessageModel.find).not.toHaveBeenCalled();
  });
});
