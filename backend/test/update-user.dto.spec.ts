import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateUserDto } from '../src/users/dto/update-user.dto';

describe('UpdateUserDto.avatarUrl (https only)', () => {
  const constraintsFor = async (avatarUrl?: unknown) => {
    const dto = plainToInstance(
      UpdateUserDto,
      avatarUrl === undefined ? {} : { avatarUrl },
    );
    const errors = await validate(dto);
    return errors.find((e) => e.property === 'avatarUrl')?.constraints;
  };

  it('should accept the https URL produced by the random avatar button', async () => {
    expect(
      await constraintsFor(
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80&sig=42',
      ),
    ).toBeUndefined();
  });

  it('should accept an empty string to clear the avatar', async () => {
    expect(await constraintsFor('')).toBeUndefined();
  });

  it('should accept a payload without avatarUrl', async () => {
    expect(await constraintsFor(undefined)).toBeUndefined();
  });

  it.each([
    ['http URL', 'http://example.com/a.png'],
    ['javascript: URL', 'javascript:alert(1)'],
    ['data: URL', 'data:image/png;base64,AAAA'],
    ['URL without protocol', 'images.unsplash.com/a.png'],
  ])('should reject %s', async (_label, value) => {
    expect(await constraintsFor(value)).toHaveProperty('isUrl');
  });

  it('should reject URLs longer than 2048 characters', async () => {
    const longUrl = `https://example.com/${'a'.repeat(2100)}`;
    expect(await constraintsFor(longUrl)).toHaveProperty('maxLength');
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
