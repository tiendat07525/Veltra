import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateUserDto } from '../src/users/dto/update-user.dto';

describe("UpdateUserDto.avatarUrl (only '' removes the avatar)", () => {
  const constraintsFor = async (avatarUrl?: unknown) => {
    const dto = plainToInstance(
      UpdateUserDto,
      avatarUrl === undefined ? {} : { avatarUrl },
    );
    const errors = await validate(dto);
    return errors.find((e) => e.property === 'avatarUrl')?.constraints;
  };

  it('should accept an empty string to clear the avatar', async () => {
    expect(await constraintsFor('')).toBeUndefined();
  });

  it('should accept a payload without avatarUrl', async () => {
    expect(await constraintsFor(undefined)).toBeUndefined();
  });

  it.each([
    ['https URL', 'https://images.unsplash.com/photo-1'],
    ['http URL', 'http://example.com/a.png'],
    ['javascript: URL', 'javascript:alert(1)'],
    ['data: URL', 'data:image/png;base64,AAAA'],
    ['spaces', ' '],
    ['an object', { $ne: null }],
  ])('should reject %s', async (_label, value) => {
    expect(await constraintsFor(value)).toHaveProperty('isIn');
  });
});

describe('UpdateUserDto.phone (digits only)', () => {
  const constraintsFor = async (body: Record<string, unknown>) => {
    const errors = await validate(plainToInstance(UpdateUserDto, body));
    return errors.find((e) => e.property === 'phone')?.constraints;
  };

  it.each([
    ['digits', { phone: '0123456789' }],
    ['an empty string (clears the number)', { phone: '' }],
    ['a payload without phone', {}],
  ])('should accept %s', async (_label, body) => {
    expect(await constraintsFor(body)).toBeUndefined();
  });

  it.each([
    ['letters', '09abc', 'matches'],
    ['only spaces', '   ', 'matches'],
    ['more than 11 digits', '012345678901', 'maxLength'],
    ['a number', 912345678, 'isString'],
    ['an object', { $ne: null }, 'isString'],
  ])('should reject %s', async (_label, phone, constraint) => {
    expect(await constraintsFor({ phone })).toHaveProperty(constraint);
  });
});

describe('UpdateUserDto: account fields cannot be changed here', () => {
  // Same options as main.ts
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const transform = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: UpdateUserDto });

  it.each(['email', 'username', 'password'])(
    'should reject a body with %s (400)',
    async (field) => {
      await expect(
        transform({ displayName: 'Alice', [field]: 'new@example.com' }),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it('should accept the fields the profile page sends', async () => {
    const body = {
      displayName: 'Alice',
      bio: '',
      phone: '0123456789',
      avatarUrl: '',
    };
    await expect(transform(body)).resolves.toEqual(body);
  });
});
