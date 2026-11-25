import { BadRequestException, ValidationPipe } from '@nestjs/common';
import * as frontendRules from '../../frontend/src/lib/credential-rules';
import { ChangePasswordDto } from '../src/auth/dto/change-password.dto';
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  passwordProblem,
  usernameProblem,
} from '../src/auth/dto/credential-rules';
import { LoginDto } from '../src/auth/dto/login.dto';
import { RegisterDto } from '../src/auth/dto/register.dto';

const GOOD = 'Abc12!';

// Same options as main.ts
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const messagesFor = async (
  metatype: new () => object,
  body: unknown,
): Promise<string[]> => {
  try {
    await pipe.transform(body, { type: 'body', metatype });
    return [];
  } catch (error: unknown) {
    if (!(error instanceof BadRequestException)) throw error;
    return (error.getResponse() as { message: string[] }).message;
  }
};
const register = (overrides: Record<string, unknown>) =>
  messagesFor(RegisterDto, {
    username: 'alice_01',
    email: 'alice@example.test',
    password: GOOD,
    ...overrides,
  });

const GOOD_USERNAMES = ['abc', 'a_1', 'Alice_01', '___', 'a'.repeat(30)];
const BAD_USERNAMES: unknown[] = [
  '',
  'ab',
  'a'.repeat(31),
  'a b c',
  '  a',
  '   ',
  'alice\n',
  'nguyễn',
  'аlice', // Cyrillic "а"
  'al​ice', // zero-width space
  'alice😀',
  'a.b.c',
  'a-b-c',
  'KKelvin', // Kelvin sign: folds to "k" with the u flag
  undefined,
  null,
  123,
  ['alice'],
  { $ne: null },
];
const GOOD_PASSWORDS = [GOOD, 'aA1 _x', 'Mật khẩu 1?', 'aA1!' + 'x'.repeat(68)];
const BAD_PASSWORDS: [string, string][] = [
  ['', 'ít nhất 6 ký tự'],
  ['Ab1!x', 'ít nhất 6 ký tự'],
  ['ABC12!', 'chữ thường (a-z)'],
  ['abc12!', 'chữ in hoa (A-Z)'],
  ['Abcde!', 'số (0-9)'],
  ['Abc123', 'ký tự đặc biệt'],
  ['Abc 123', 'ký tự đặc biệt'], // a space is not one
  ['Abcă123', 'ký tự đặc biệt'], // neither is a letter with a mark
  ['aA1!' + 'x'.repeat(69), 'quá dài'],
  ['aA1!' + 'ă'.repeat(35), 'quá dài'], // 39 characters, 74 bytes
];

describe('RegisterDto', () => {
  it.each(GOOD_USERNAMES)('accepts the username %p', async (username) => {
    expect(await register({ username })).toEqual([]);
  });

  it.each(BAD_USERNAMES)('rejects the username %p', async (username) => {
    expect(await register({ username })).toEqual([
      'Tên đăng nhập dài 3–30 ký tự, chỉ gồm chữ không dấu, số và dấu _',
    ]);
  });

  it.each(['admin', 'Admin', 'ADMIN', 'ad_min', '_root_', 'Veltra_Support'])(
    'rejects the reserved username %p',
    async (username) => {
      expect(await register({ username })).toEqual([
        'Tên đăng nhập này không được sử dụng',
      ]);
    },
  );

  it.each(['administrators', 'admin1', 'my_admin', 'rooty'])(
    'accepts %p, which only contains a reserved word',
    async (username) => {
      expect(await register({ username })).toEqual([]);
    },
  );

  it.each(GOOD_PASSWORDS)('accepts the password %p', async (password) => {
    expect(await register({ password })).toEqual([]);
  });

  it.each(BAD_PASSWORDS)(
    'rejects the password %p with "%s"',
    async (password, text) => {
      const messages = await register({ password });
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain(text);
    },
  );

  it('lists everything the password lacks in one message', async () => {
    expect(await register({ password: 'x' })).toEqual([
      'Mật khẩu cần có: ít nhất 6 ký tự, chữ in hoa (A-Z), số (0-9), ký tự đặc biệt',
    ]);
  });

  it.each([undefined, null, 123456, ['Abc12!'], { length: 10 }])(
    'rejects the non-string password %p',
    async (password) => {
      expect(await register({ password })).toEqual(['Mật khẩu không hợp lệ']);
    },
  );
});

describe('ChangePasswordDto', () => {
  it('applies the same rule to the new password', async () => {
    expect(
      await messagesFor(ChangePasswordDto, {
        currentPassword: 'x',
        newPassword: '123456',
      }),
    ).toEqual([
      'Mật khẩu cần có: chữ thường (a-z), chữ in hoa (A-Z), ký tự đặc biệt',
    ]);
  });

  it('does not apply it to the current password', async () => {
    expect(
      await messagesFor(ChangePasswordDto, {
        currentPassword: '123456',
        newPassword: GOOD,
      }),
    ).toEqual([]);
  });
});

describe('LoginDto', () => {
  it.each([
    ['tên cũ', '123456'],
    ['admin', 'x'.repeat(100)],
  ])('still accepts an existing account (%p)', async (username, password) => {
    expect(await messagesFor(LoginDto, { username, password })).toEqual([]);
  });
});

describe('Frontend rules', () => {
  it('match the server', () => {
    expect(frontendRules.PASSWORD_MIN_LENGTH).toBe(PASSWORD_MIN_LENGTH);
    expect(frontendRules.PASSWORD_MAX_BYTES).toBe(PASSWORD_MAX_BYTES);
    for (const password of [
      ...GOOD_PASSWORDS,
      ...BAD_PASSWORDS.map(([value]) => value),
    ]) {
      expect(frontendRules.passwordProblem(password)).toBe(
        passwordProblem(password),
      );
    }
    for (const username of [...GOOD_USERNAMES, ...BAD_USERNAMES]) {
      if (typeof username !== 'string') continue;
      expect(frontendRules.usernameProblem(username)).toBe(
        usernameProblem(username),
      );
    }
  });
});
