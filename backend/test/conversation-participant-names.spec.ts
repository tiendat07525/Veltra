import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { ConversationService } from '../src/conversation/conversation.service';
import { Conversation } from '../src/conversation/schemas/conversation.schema';
import { Message } from '../src/messages/schemas/message.schema';
import { groupLookupProviders } from './helpers/group-lookup-mocks';

interface PopulatedUser {
  _id: Types.ObjectId;
  username: string;
  avatarUrl?: string;
}

interface Participant {
  userId: Types.ObjectId | PopulatedUser;
  joinedAt: Date;
}

interface FormattedParticipant {
  _id: Types.ObjectId;
  username?: string;
  avatarUrl?: string | null;
}

describe('ConversationService participant user fields', () => {
  let service: ConversationService;

  const ownerId = new Types.ObjectId();
  const memberId = new Types.ObjectId();
  const conversationId = new Types.ObjectId();

  // A user who never set displayName: the client must fall back to username
  const populatedMember: PopulatedUser = {
    _id: memberId,
    username: 'no_display_name',
    avatarUrl: 'https://example.com/a.png',
  };

  const expectedSelects = [
    { path: 'participants.userId', select: 'username displayName avatarUrl' },
    { path: 'seenBy', select: 'username displayName avatarUrl' },
    {
      path: 'lastMessage.senderId',
      select: 'username displayName avatarUrl',
    },
  ];

  const mockConversationModel = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  // Mongoose group document: participants hold raw ObjectIds until populate() runs
  const makeGroupDocument = () => {
    const doc = {
      _id: conversationId,
      type: 'group',
      group: { name: 'Old name', createdBy: ownerId },
      participants: [
        { userId: memberId, joinedAt: new Date() },
      ] as Participant[],
      unreadCounts: {},
      save: jest.fn().mockResolvedValue(undefined),
      populate: jest.fn(),
      toObject: () => ({ _id: conversationId, type: 'group' }),
    };
    doc.populate.mockImplementation(() => {
      doc.participants = doc.participants.map((participant) => {
        const id = participant.userId as Types.ObjectId;
        return {
          ...participant,
          userId: id.equals(memberId)
            ? populatedMember
            : { _id: id, username: 'added_user' },
        };
      });
      return Promise.resolve(doc);
    });
    return doc;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        {
          provide: getModelToken(Conversation.name),
          useValue: mockConversationModel,
        },
        { provide: getModelToken(Message.name), useValue: {} },
        ...groupLookupProviders(),
      ],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
    jest.clearAllMocks();
  });

  it('findAll returns username and populates every user path with it', async () => {
    const populate = jest.fn().mockReturnValue({
      lean: () =>
        Promise.resolve([
          {
            _id: conversationId,
            type: 'direct',
            participants: [{ userId: populatedMember, joinedAt: new Date() }],
          },
        ]),
    });
    mockConversationModel.find.mockReturnValue({
      sort: () => ({ populate }),
    });

    const [conversation] = (await service.findAll(ownerId.toString())) as {
      participants: FormattedParticipant[];
    }[];

    expect(populate).toHaveBeenCalledWith(expectedSelects);
    expect(conversation.participants[0]).toMatchObject({
      _id: memberId,
      username: 'no_display_name',
      avatarUrl: 'https://example.com/a.png',
    });
  });

  it('update populates participants after renaming the group', async () => {
    const doc = makeGroupDocument();
    mockConversationModel.findOne.mockResolvedValue(doc);

    const result = await service.update(
      conversationId.toString(),
      { groupName: 'New name' },
      ownerId.toString(),
    );

    expect(doc.save).toHaveBeenCalled();
    expect(doc.populate).toHaveBeenCalledWith(expectedSelects);
    expect(result.participants[0]).toMatchObject({
      _id: memberId,
      username: 'no_display_name',
    });
  });

  it('addParticipants populates every member, including the new ones', async () => {
    const doc = makeGroupDocument();
    mockConversationModel.findOne.mockResolvedValue(doc);
    const newUserId = new Types.ObjectId();

    const result = await service.addParticipants(
      conversationId.toString(),
      { userIds: [newUserId.toString()] },
      ownerId.toString(),
    );

    expect(doc.populate).toHaveBeenCalledWith(expectedSelects);
    const participants = result.participants as FormattedParticipant[];
    expect(participants.map((p) => p.username)).toEqual([
      'no_display_name',
      'added_user',
    ]);
  });
});
