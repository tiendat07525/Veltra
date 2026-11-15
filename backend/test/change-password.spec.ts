import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuthService } from '../src/auth/auth.service';
import { SessionService } from '../src/auth/session.service';
import { UsersService } from '../src/users/users.service';
import { RealtimeService } from '../src/realtime/realtime.service';
import { ChangePasswordDto } from '../src/auth/dto/change-password.dto';

describe('AuthService.changePassword / getCurrentSession', () => {
  let service: AuthService;

  const userId = new Types.ObjectId();
  const id = userId.toString();
  const OLD = 'old-secret-1';
  const NEW = 'new-secret-2';
  let oldHash: string;

  const mockUsersService = {
    findByIdWithPassword: jest.fn(),
    setPasswordHash: jest.fn(),
  };
  const mockSessionService = {
    createSession: jest.fn(),
    revokeAllUserSessions: jest.fn(),
    getSession: jest.fn(),
  };
  const mockRealtimeService = { disconnectUser: jest.fn() };
  const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('new-access-token'),
  };

  beforeAll(async () => {
    oldHash = await bcrypt.hash(OLD, 4);
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: SessionService, useValue: mockSessionService },
        { provide: RealtimeService, useValue: mockRealtimeService },
      ],
    }).compile();
    service = module.get(AuthService);
    jest.clearAllMocks();
    mockUsersService.findByIdWithPassword.mockResolvedValue({
      _id: userId,
      username: 'alice',
      email: 'alice@example.test',
      password: oldHash,
    });
  });

  const expectNothingChanged = () => {
    expect(mockUsersService.setPasswordHash).not.toHaveBeenCalled();
    expect(mockSessionService.revokeAllUserSessions).not.toHaveBeenCalled();
    expect(mockRealtimeService.disconnectUser).not.toHaveBeenCalled();
    expect(mockSessionService.createSession).not.toHaveBeenCalled();
  };

  it('wrong current password → 400, nothing stored or revoked', async () => {
    await expect(
      service.changePassword(id, {
        currentPassword: 'wrong',
        newPassword: NEW,
      }),
    ).rejects.toThrow(new BadRequestException('Mật khẩu hiện tại không đúng'));
    expectNothingChanged();
  });

  it('new password equal to the current one → 400, nothing stored', async () => {
    await expect(
      service.changePassword(id, { currentPassword: OLD, newPassword: OLD }),
    ).rejects.toThrow(BadRequestException);
    expectNothingChanged();
  });

  it('missing user → 401', async () => {
    mockUsersService.findByIdWithPassword.mockResolvedValue(null);

    await expect(
      service.changePassword(id, { currentPassword: OLD, newPassword: NEW }),
    ).rejects.toThrow(UnauthorizedException);
    expectNothingChanged();
  });

  it('stores a bcrypt hash of the new password, revokes every session and sockets, then opens a new session', async () => {
    const result = await service.changePassword(
      id,
      { currentPassword: OLD, newPassword: NEW },
      'agent',
      '1.2.3.4',
    );

    const [storedId, storedHash] = mockUsersService.setPasswordHash.mock
      .calls[0] as [string, string];
    expect(storedId).toBe(id);
    expect(storedHash).not.toBe(NEW);
    await expect(bcrypt.compare(NEW, storedHash)).resolves.toBe(true);

    expect(mockSessionService.revokeAllUserSessions).toHaveBeenCalledWith(id);
    expect(mockRealtimeService.disconnectUser).toHaveBeenCalledWith(id);
    // Stored before the old sessions are revoked and the new one is created
    expect(
      mockUsersService.setPasswordHash.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mockSessionService.revokeAllUserSessions.mock.invocationCallOrder[0],
    );
    expect(
      mockSessionService.revokeAllUserSessions.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mockSessionService.createSession.mock.invocationCallOrder[0],
    );

    const [sessionUserId, sessionId, data] = mockSessionService.createSession
      .mock.calls[0] as [string, string, { userAgent?: string }];
    expect(sessionUserId).toBe(id);
    expect(data.userAgent).toBe('agent');
    expect(result).toEqual({
      message: 'Đổi mật khẩu thành công',
      accessToken: 'new-access-token',
      refreshTokenString: expect.stringMatching(
        new RegExp(`^${id}\\.${sessionId}\\.[0-9a-f]{64}$`),
      ),
    });
  });

  describe('getCurrentSession', () => {
    it('returns only createdAt / expiresAt / userAgent (no hashes, no IP)', async () => {
      mockSessionService.getSession.mockResolvedValue({
        userId: id,
        sessionId: 's1',
        refreshTokenHash: 'secret-hash',
        previousRefreshTokenHash: 'old-hash',
        createdAt: '2026-11-16T00:00:00.000Z',
        expiresAt: '2026-11-23T00:00:00.000Z',
        userAgent: 'Mozilla/5.0',
        ipAddress: '1.2.3.4',
      });

      await expect(service.getCurrentSession(id, 's1')).resolves.toEqual({
        createdAt: '2026-11-16T00:00:00.000Z',
        expiresAt: '2026-11-23T00:00:00.000Z',
        userAgent: 'Mozilla/5.0',
      });
      expect(mockSessionService.getSession).toHaveBeenCalledWith(id, 's1');
    });

    it('404 when the session is gone', async () => {
      mockSessionService.getSession.mockResolvedValue(null);

      await expect(service.getCurrentSession(id, 's1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

describe('ChangePasswordDto', () => {
  const errorsFor = (body: unknown) =>
    validate(plainToInstance(ChangePasswordDto, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  it('accepts a valid body', async () => {
    expect(
      await errorsFor({ currentPassword: 'x', newPassword: '123456' }),
    ).toHaveLength(0);
  });

  it.each([
    ['a short new password', { currentPassword: 'x', newPassword: '12345' }],
    ['a missing current password', { newPassword: '123456' }],
    ['a non-string', { currentPassword: 1, newPassword: '123456' }],
    [
      'an extra field',
      { currentPassword: 'x', newPassword: '123456', userId: 'someone' },
    ],
  ])('rejects %s', async (_label, body) => {
    expect((await errorsFor(body)).length).toBeGreaterThan(0);
  });
});
