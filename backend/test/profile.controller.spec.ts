import { Test } from '@nestjs/testing';
import { ProfileController } from '../src/profile/profile.controller';
import { ProfileService } from '../src/profile/profile.service';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '../src/auth/authenticated-request';

// Controllers only read req.user; the rest of the Express request is irrelevant here
const asReq = (user: Partial<AuthenticatedUser>) =>
  ({ user }) as unknown as AuthenticatedRequest;

describe('ProfileController (identity comes from req.user only)', () => {
  const service = {
    update: jest.fn(),
    signAvatar: jest.fn(),
    setAvatar: jest.fn(),
  };
  let controller: ProfileController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [{ provide: ProfileService, useValue: service }],
    }).compile();
    controller = module.get(ProfileController);
  });

  it('should update the own profile', async () => {
    service.update.mockResolvedValue({ _id: 'user1', bio: 'Mới' });
    const result = await controller.updateProfile(asReq({ id: 'user1' }), {
      bio: 'Mới',
    });
    expect(result).toEqual({ _id: 'user1', bio: 'Mới' });
    expect(service.update).toHaveBeenCalledWith('user1', { bio: 'Mới' });
  });

  it('should pass the caller id along for PATCH /users/:id', async () => {
    await controller.update(
      'target',
      { displayName: 'X' },
      asReq({ id: 'user1' }),
    );
    expect(service.update).toHaveBeenCalledWith(
      'target',
      { displayName: 'X' },
      'user1',
    );
  });

  it('should sign and set the avatar of the caller', () => {
    const sign = { fileName: 'a.png', mimeType: 'image/png', size: 1 };
    controller.signAvatar(asReq({ id: 'user1' }), sign);
    void controller.setAvatar(asReq({ id: 'user1' }), { publicId: 'p' });
    expect(service.signAvatar).toHaveBeenCalledWith('user1', sign);
    expect(service.setAvatar).toHaveBeenCalledWith('user1', { publicId: 'p' });
  });
});
