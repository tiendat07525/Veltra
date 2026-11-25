import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryService } from '../src/storage/cloudinary.service';
import { ProfileService } from '../src/profile/profile.service';
import { SetAvatarDto, SignAvatarDto } from '../src/profile/dto/avatar.dto';
import { AVATAR_PUBLIC_ID_PATTERN } from '../src/profile/avatar.rules';
import { PUBLIC_ID_PATTERN } from '../src/messages/attachment.rules';
import { UserSchema } from '../src/users/schemas/user.schema';

// url() and the signature are the real ones; no network call is made
jest.mock('cloudinary', () => {
  const actual = jest.requireActual<typeof import('cloudinary')>('cloudinary');
  return {
    v2: {
      config: actual.v2.config,
      url: actual.v2.url,
      utils: { api_sign_request: actual.v2.utils.api_sign_request },
      uploader: { explicit: jest.fn(), destroy: jest.fn() },
    },
  };
});

const explicit = cloudinary.uploader.explicit as unknown as jest.Mock;
const destroy = cloudinary.uploader.destroy as unknown as jest.Mock;
const CLOUDINARY_URL = 'cloudinary://123456:test-secret@demo';
const MB = 1024 * 1024;

const me = new Types.ObjectId().toString();
const avatarId = (owner = me) =>
  `veltra/avatars/${owner}/${crypto.randomUUID()}`;
const destroyed = () => destroy.mock.calls.map((c) => c[0] as string);

const makeService = (
  previous: Record<string, unknown> | null = { _id: me },
  url: string | null = CLOUDINARY_URL,
) => {
  const query = () => {
    const chain = {
      select: jest.fn(() => chain),
      lean: jest.fn(() => Promise.resolve(previous)),
    };
    return chain;
  };
  const userModel = {
    findByIdAndUpdate: jest.fn((..._args: unknown[]) => query()),
    findOneAndUpdate: jest.fn((..._args: unknown[]) => query()),
  };
  const usersService = {
    findOne: jest.fn().mockResolvedValue({ _id: me, username: 'an' }),
  };
  const service = new ProfileService(
    userModel as any,
    usersService as any,
    new CloudinaryService({ get: () => url ?? undefined } as any),
  );
  return { service, userModel, usersService };
};
const stored = (publicId: string, over: Record<string, unknown> = {}) =>
  explicit.mockResolvedValue({
    public_id: publicId,
    version: 7,
    resource_type: 'image',
    format: 'png',
    bytes: 2000,
    secure_url: 'https://res.cloudinary.com/demo/x.png',
    ...over,
  });

beforeEach(() => {
  explicit.mockReset();
  destroy.mockReset().mockResolvedValue({ result: 'ok' });
});

describe('ProfileService.signAvatar', () => {
  const sign = (service: ProfileService, file: Partial<SignAvatarDto> = {}) =>
    service.signAvatar(me, {
      fileName: 'me.png',
      mimeType: 'image/png',
      size: 1000,
      ...file,
    });

  it('should answer 503 when CLOUDINARY_URL is missing', () => {
    const { service } = makeService(undefined, null);
    expect(() => sign(service)).toThrow(ServiceUnavailableException);
  });

  it('should sign an id in the folder of the caller, image only, no overwrite', () => {
    const { service } = makeService();
    const { uploadUrl, fields } = sign(service);
    expect(uploadUrl).toBe('https://api.cloudinary.com/v1_1/demo/image/upload');
    expect(AVATAR_PUBLIC_ID_PATTERN.exec(String(fields.public_id))?.[1]).toBe(
      me,
    );
    expect(fields).toMatchObject({
      overwrite: 'false',
      allowed_formats: 'jpg,jpeg,png,webp',
      api_key: '123456',
    });
    expect(JSON.stringify(fields)).not.toContain('test-secret');
    const { signature, api_key, ...signed } = fields;
    expect(api_key).toBeDefined();
    expect(signature).toBe(
      cloudinary.utils.api_sign_request(signed, 'test-secret'),
    );
  });

  it.each([
    ['me.gif', 'image/gif'],
    ['me.svg', 'image/svg+xml'],
    ['me.pdf', 'application/pdf'],
    ['me.png', 'image/jpeg'], // extension and MIME disagree
    ['noextension', 'image/png'],
    ['me.constructor', 'image/png'],
  ])('should answer 400 for %s (%s)', (fileName, mimeType) => {
    const { service } = makeService();
    expect(() => sign(service, { fileName, mimeType })).toThrow(
      'Ảnh phải là file jpg, png hoặc webp',
    );
  });

  it('should accept exactly 5 MB and refuse one byte more', () => {
    const { service } = makeService();
    expect(() => sign(service, { size: 5 * MB })).not.toThrow();
    expect(() => sign(service, { size: 5 * MB + 1 })).toThrow(
      'Ảnh vượt quá 5 MB',
    );
  });
});

describe('ProfileService.setAvatar', () => {
  it('should store a 256 px square URL without EXIF, then remove the previous file', async () => {
    const old = avatarId();
    const publicId = avatarId();
    stored(publicId);
    const { service, userModel } = makeService({
      _id: me,
      avatarPublicId: old,
    });

    await expect(service.setAvatar(me, { publicId })).resolves.toEqual({
      _id: me,
      username: 'an',
    });

    expect(userModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(me) },
      {
        $set: {
          // The SDK appends its own ?_a=… parameter
          avatarUrl: expect.stringContaining(
            `https://res.cloudinary.com/demo/image/upload/c_fill,h_256,w_256/f_auto,q_auto/v7/${publicId}`,
          ),
          avatarPublicId: publicId,
        },
      },
    );
    expect(explicit).toHaveBeenCalledWith(publicId, {
      type: 'upload',
      resource_type: 'image',
    });
    expect(destroy.mock.calls).toEqual([
      [old, { resource_type: 'image', invalidate: true }],
    ]);
  });

  it('should remove nothing for the first avatar, nor when the same one is sent again', async () => {
    const publicId = avatarId();
    stored(publicId);
    await makeService({ _id: me }).service.setAvatar(me, { publicId });
    await makeService({ _id: me, avatarPublicId: publicId }).service.setAvatar(
      me,
      { publicId },
    );
    expect(destroy).not.toHaveBeenCalled();
  });

  it.each([
    ['another user', () => avatarId(new Types.ObjectId().toString())],
    ['a message attachment', () => `veltra/${me}/${me}/${crypto.randomUUID()}`],
    ['another folder', () => `veltra/avatars/${me}/../x`],
  ])('should refuse an id of %s without asking Cloudinary', async (_l, id) => {
    const { service, userModel } = makeService();
    await expect(service.setAvatar(me, { publicId: id() })).rejects.toThrow(
      'Ảnh không hợp lệ',
    );
    expect(explicit).not.toHaveBeenCalled();
    expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('should answer 400 when the file was never uploaded', async () => {
    explicit.mockRejectedValue({ http_code: 404 });
    const { service, userModel } = makeService();
    await expect(
      service.setAvatar(me, { publicId: avatarId() }),
    ).rejects.toThrow('Ảnh chưa được tải lên');
    expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });

  it('should answer 503 and keep the current avatar when Cloudinary fails', async () => {
    explicit.mockRejectedValue({ http_code: 500, message: 'x' });
    const { service, userModel } = makeService();
    await expect(
      service.setAvatar(me, { publicId: avatarId() }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });

  it.each([
    ['a gif', { format: 'gif' }],
    ['no format', { format: undefined }],
    ['more than 5 MB', { bytes: 5 * MB + 1 }],
  ])('should remove and refuse an upload that is %s', async (_l, over) => {
    const publicId = avatarId();
    stored(publicId, over);
    const { service, userModel } = makeService();
    await expect(service.setAvatar(me, { publicId })).rejects.toThrow(
      'Ảnh sai định dạng hoặc quá dung lượng',
    );
    expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(destroyed()).toEqual([publicId]);
  });

  it('should keep the previous file when the write fails', async () => {
    const publicId = avatarId();
    stored(publicId);
    const { service, userModel } = makeService();
    userModel.findOneAndUpdate.mockImplementation(() => {
      throw new Error('mongo down');
    });
    await expect(service.setAvatar(me, { publicId })).rejects.toThrow(
      'mongo down',
    );
    expect(destroy).not.toHaveBeenCalled();
  });

  it('should answer 404 when the user is gone, 503 without CLOUDINARY_URL', async () => {
    const publicId = avatarId();
    stored(publicId);
    await expect(
      makeService(null).service.setAvatar(me, { publicId }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      makeService(undefined, null).service.setAvatar(me, { publicId }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('ProfileService.update', () => {
  it('should refuse to change another account', async () => {
    const { service, userModel } = makeService();
    await expect(
      service.update('targetId', { bio: 'hacked' }, 'attackerId'),
    ).rejects.toThrow(ForbiddenException);
    expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('should leave the avatar alone when only text changes', async () => {
    const { service, userModel, usersService } = makeService({
      _id: me,
      avatarPublicId: avatarId(),
    });
    await expect(service.update(me, { bio: 'Chào' })).resolves.toEqual({
      _id: me,
      username: 'an',
    });
    expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(
      me,
      { $set: { bio: 'Chào' } },
      { runValidators: true },
    );
    expect(usersService.findOne).toHaveBeenCalledWith(me);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("should remove the uploaded file with avatarUrl ''", async () => {
    const old = avatarId();
    const { service, userModel } = makeService({
      _id: me,
      avatarPublicId: old,
    });
    await service.update(me, { avatarUrl: '' }, me);
    expect(userModel.findByIdAndUpdate.mock.calls[0][1]).toEqual({
      $set: { avatarUrl: '' },
      $unset: { avatarPublicId: 1 },
    });
    expect(destroyed()).toEqual([old]);
  });

  it('should remove an external avatar from before uploads (no file)', async () => {
    const { service } = makeService({ _id: me, avatarUrl: 'http://x/a.png' });
    await service.update(me, { avatarUrl: '' });
    expect(destroy).not.toHaveBeenCalled();
  });

  it('should answer 404 when the user is gone', async () => {
    await expect(
      makeService(null).service.update(me, { bio: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('Avatar ids and DTOs', () => {
  it('should never be accepted as a message attachment, and the other way round', () => {
    expect(PUBLIC_ID_PATTERN.test(avatarId())).toBe(false);
    expect(
      AVATAR_PUBLIC_ID_PATTERN.test(
        `veltra/${me}/${me}/${crypto.randomUUID()}`,
      ),
    ).toBe(false);
  });

  it('should keep avatarPublicId out of every query by default', () => {
    expect(UserSchema.path('avatarPublicId').options.select).toBe(false);
  });

  it.each([
    [{ publicId: 'x' }],
    [{ publicId: `${avatarId()}.png` }],
    [{ publicId: { $ne: null } }],
    [{}],
  ])('should reject SetAvatarDto %j', async (body) => {
    expect(await validate(plainToInstance(SetAvatarDto, body))).not.toEqual([]);
  });

  it('should accept a signed id, and check SignAvatarDto', async () => {
    expect(
      await validate(plainToInstance(SetAvatarDto, { publicId: avatarId() })),
    ).toEqual([]);
    const sign = { fileName: 'a.png', mimeType: 'image/png', size: 1 };
    expect(await validate(plainToInstance(SignAvatarDto, sign))).toEqual([]);
    expect(
      await validate(plainToInstance(SignAvatarDto, { ...sign, size: 0 })),
    ).not.toEqual([]);
    expect(
      await validate(
        plainToInstance(SignAvatarDto, { ...sign, fileName: { $gt: '' } }),
      ),
    ).not.toEqual([]);
  });

  it('should use 400 errors for client mistakes', async () => {
    const { service } = makeService();
    await expect(
      service.setAvatar(me, { publicId: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
