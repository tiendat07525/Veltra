import { Connection, Model } from 'mongoose';
import { User, UserSchema } from '../src/users/schemas/user.schema';
import { UsersService } from '../src/users/users.service';
import { connectTestDatabase } from './helpers/mongo-e2e';

/**
 * The accent-insensitive search pattern in MongoDB's own regex engine (PCRE, not the JS one).
 */
describe('User search (Real MongoDB)', () => {
  let connection: Connection;
  let userModel: Model<User>;
  let service: UsersService;

  beforeAll(async () => {
    connection = await connectTestDatabase('test_veltra_user_search');
    userModel = connection.model<User>(User.name, UserSchema);
    await userModel.init();
    service = new UsersService(userModel as any);
    await userModel.create(
      [
        ['anh1', 'Nguyễn Đức Ánh'],
        ['anh2', 'NGUYỄN ĐỨC ÁNH'],
        ['anh3', 'nguyen duc anh'],
        ['anh4', 'Nguyễn Đức Ánh'.normalize('NFD')],
        ['phuoc', 'Đặng Hữu Phước'],
        ['mul', 'Müller'],
        ['ios', 'Йосиф'],
        ['dots', 'a.c (x)'],
        ['noname', undefined],
        ['longa', 'á'.repeat(100)],
      ].map(([username, displayName]) => ({
        username,
        displayName,
        email: `${username}@secret.example`,
        password: 'x',
      })),
    );
  }, 30000);

  afterAll(async () => {
    if (!connection) return;
    await connection.dropDatabase();
    await connection.close();
  }, 30000);

  const search = async (query: string) => {
    const { data, total } = await service.findAll({ search: query, limit: 50 });
    expect(total).toBe(data.length);
    return data.map((user) => user.username).sort();
  };

  const allAnh = ['anh1', 'anh2', 'anh3', 'anh4'];
  it.each([
    'duc anh',
    'Đức Ánh',
    'ĐỨC ÁNH',
    'đức ảnh',
    'Đức Ánh'.normalize('NFD'),
    ' guyen duc ',
  ])('should find every form of the name with "%s"', async (query) => {
    expect(await search(query)).toEqual(allAnh);
  });

  it.each([
    ['dang huu', ['phuoc']],
    ['ĐẶNG', ['phuoc']],
    ['MULLER', ['mul']],
    ['müller', ['mul']],
    ['йос', ['ios']],
    ['noNAME', ['noname']],
    ['a.c (', ['dots']],
    ['.*', []],
    ['secret', []], // never the email
    ['khong co ai', []],
  ])('should find with "%s": %j', async (query, usernames) => {
    expect(await search(query)).toEqual(usernames);
  });

  it('should take the longest query (100 characters)', async () => {
    expect(await search('a'.repeat(100))).toEqual(['longa']);
    expect(await search('ẫ'.repeat(99) + 'b')).toEqual([]);
  });
});
