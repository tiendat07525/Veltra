import * as dotenv from 'dotenv';
dotenv.config();
import mongoose, { Connection, Model, Types } from 'mongoose';
import {
  Conversation,
  ConversationSchema,
  getDirectKey,
} from '../src/conversation/schemas/conversation.schema';

describe('Direct Conversation Database Integration & Concurrency (Real MongoDB)', () => {
  let connection: Connection;
  let conversationModel: Model<Conversation>;
  const baseUri = process.env.MONGODB_URL;

  beforeAll(async () => {
    if (!baseUri) {
      throw new Error('MONGODB_URL is not defined in environment');
    }

    // Connect strictly to an isolated temporary test database to preserve production data
    const u = new URL(baseUri);
    u.pathname = '/test_veltra_integration_p31';
    connection = await mongoose.createConnection(u.toString()).asPromise();

    conversationModel = connection.model<Conversation>(
      'Conversation',
      ConversationSchema,
    );

    // Synchronize schema indexes onto the real MongoDB database
    await conversationModel.syncIndexes();
  }, 30000);

  afterAll(async () => {
    if (connection) {
      try {
        await connection.dropDatabase();
      } catch (err) {
        console.error('Error dropping test database:', err);
      }
      await connection.close();
    }
  }, 30000);

  it('should physically verify that the partial unique index exists on MongoDB', async () => {
    const indexes = await conversationModel.collection.indexes();
    const directKeyIndex = indexes.find((idx) => idx.name === 'directKey_1');

    expect(directKeyIndex).toBeDefined();
    expect(directKeyIndex?.unique).toBe(true);
    expect(directKeyIndex?.partialFilterExpression).toEqual({
      directKey: { $type: 'string' },
    });
  });

  it('should enforce uniqueness at the database engine level during concurrent inserts', async () => {
    const userA = new Types.ObjectId();
    const userB = new Types.ObjectId();
    const key = getDirectKey(userA, userB);

    // Fire 10 concurrent creates directly against MongoDB alternating participant order
    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }).map((_, idx) =>
        conversationModel.create({
          type: 'direct',
          directKey: key,
          participants: [
            { userId: idx % 2 === 0 ? userA : userB, joinedAt: new Date() },
            { userId: idx % 2 === 0 ? userB : userA, joinedAt: new Date() },
          ],
          lastMessageAt: new Date(),
        }),
      ),
    );

    const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
    const rejected = attempts.filter(
      (a) => a.status === 'rejected',
    ) as PromiseRejectedResult[];

    // Exactly 1 insert must succeed; all 9 others must be rejected by MongoDB
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(9);

    // Verify all rejections are MongoDB error code 11000 (duplicate key)
    const rejectCodes = rejected.map((r) => r.reason.code);
    expect(rejectCodes.every((code) => code === 11000)).toBe(true);

    // Verify exactly 1 document exists in the real MongoDB collection
    const count = await conversationModel.countDocuments({ directKey: key });
    expect(count).toBe(1);
  });

  it('should resolve concurrent requests to the identical conversation via E11000 recovery', async () => {
    const userA = new Types.ObjectId();
    const userB = new Types.ObjectId();
    const directKey = getDirectKey(userA, userB);

    // Simulation of ConversationService / MessageService find-or-create logic
    const createWithRecovery = async (callerA: Types.ObjectId, callerB: Types.ObjectId) => {
      let conversation = await conversationModel.findOne({
        type: 'direct',
        $or: [
          { directKey },
          {
            participants: {
              $all: [
                { $elemMatch: { userId: callerA } },
                { $elemMatch: { userId: callerB } },
              ],
            },
          },
        ],
      });

      if (!conversation) {
        try {
          conversation = await conversationModel.create({
            type: 'direct',
            directKey,
            participants: [
              { userId: callerA, joinedAt: new Date() },
              { userId: callerB, joinedAt: new Date() },
            ],
            lastMessageAt: new Date(),
          });
        } catch (err: any) {
          if (err.code === 11000 || err.message?.includes('E11000')) {
            conversation = await conversationModel.findOne({
              type: 'direct',
              $or: [
                { directKey },
                {
                  participants: {
                    $all: [
                      { $elemMatch: { userId: callerA } },
                      { $elemMatch: { userId: callerB } },
                    ],
                  },
                },
              ],
            });
            if (!conversation) throw err;
          } else {
            throw err;
          }
        }
      }
      return conversation;
    };

    // 10 concurrent requests alternating caller order
    const results = await Promise.all(
      Array.from({ length: 10 }).map((_, idx) =>
        createWithRecovery(
          idx % 2 === 0 ? userA : userB,
          idx % 2 === 0 ? userB : userA,
        ),
      ),
    );

    const firstId = results[0]._id.toString();
    expect(results.every((r) => r._id.toString() === firstId)).toBe(true);

    const count = await conversationModel.countDocuments({ directKey });
    expect(count).toBe(1);
  });

  it('should permit multiple group conversations without directKey without collisions', async () => {
    const userA = new Types.ObjectId();
    const userB = new Types.ObjectId();
    const userC = new Types.ObjectId();

    const group1 = await conversationModel.create({
      type: 'group',
      participants: [
        { userId: userA, joinedAt: new Date() },
        { userId: userB, joinedAt: new Date() },
        { userId: userC, joinedAt: new Date() },
      ],
      lastMessageAt: new Date(),
    });

    const group2 = await conversationModel.create({
      type: 'group',
      participants: [
        { userId: userA, joinedAt: new Date() },
        { userId: userB, joinedAt: new Date() },
        { userId: userC, joinedAt: new Date() },
      ],
      lastMessageAt: new Date(),
    });

    expect(group1._id).not.toEqual(group2._id);
    expect(group1.directKey).toBeUndefined();
    expect(group2.directKey).toBeUndefined();
  });
});
