import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { User } from 'src/users/schemas/user.schema';
import { Conversation } from 'src/conversation/schemas/conversation.schema';
import { RealtimeService } from 'src/realtime/realtime.service';
import { SettingsService } from 'src/settings/settings.service';
import { UpdateSettingsDto } from 'src/settings/dto/update-settings.dto';

describe('SettingsService', () => {
  let service: SettingsService;

  const me = new Types.ObjectId();
  const convId = new Types.ObjectId();
  const userId = me.toString();

  const DEFAULTS = {
    notifications: { browser: true, sound: true, doNotDisturb: false },
    chat: { enterToSend: true },
    mutedConversationIds: [] as string[],
  };

  // findById(...).select(...).lean() / findOneAndUpdate(...).select(...).lean()
  const chain = (result: unknown) => ({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(result),
    }),
  });

  const userModel = { findById: jest.fn(), findOneAndUpdate: jest.fn() };
  const conversationModel = { exists: jest.fn() };
  const realtimeService = { emitToUser: jest.fn() };

  const writeCall = () =>
    userModel.findOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, any>,
    ];

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: getModelToken(User.name), useValue: userModel },
        {
          provide: getModelToken(Conversation.name),
          useValue: conversationModel,
        },
        { provide: RealtimeService, useValue: realtimeService },
      ],
    }).compile();
    service = module.get(SettingsService);
  });

  describe('getSettings', () => {
    it('fills the defaults for a user created before settings existed', async () => {
      userModel.findById.mockReturnValue(chain({ _id: me }));

      await expect(service.getSettings(userId)).resolves.toEqual(DEFAULTS);
    });

    it('returns stored values, partial sections merged with defaults, ids as strings', async () => {
      userModel.findById.mockReturnValue(
        chain({
          _id: me,
          settings: {
            notifications: { sound: false },
            mutedConversationIds: [convId],
          },
        }),
      );

      await expect(service.getSettings(userId)).resolves.toEqual({
        ...DEFAULTS,
        notifications: { browser: true, sound: false, doNotDisturb: false },
        mutedConversationIds: [convId.toString()],
      });
    });

    it('404 for a missing user, 400 for a malformed id', async () => {
      userModel.findById.mockReturnValue(chain(null));
      await expect(service.getSettings(userId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getSettings('nope')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('sets only the fields sent, then emits settings:updated to the user', async () => {
      userModel.findOneAndUpdate.mockReturnValue(
        chain({
          settings: { notifications: { doNotDisturb: true }, chat: {} },
        }),
      );

      const result = await service.update(userId, {
        notifications: { doNotDisturb: true },
        chat: { enterToSend: false },
      });

      const [filter, update] = writeCall();
      expect(filter).toEqual({ _id: me });
      expect(update).toEqual({
        $set: {
          'settings.notifications.doNotDisturb': true,
          'settings.chat.enterToSend': false,
        },
      });
      expect(result.notifications.doNotDisturb).toBe(true);
      expect(realtimeService.emitToUser).toHaveBeenCalledWith(
        userId,
        'settings:updated',
        { settings: result },
      );
    });

    it('an empty body writes and emits nothing', async () => {
      userModel.findById.mockReturnValue(chain({ _id: me }));

      await expect(service.update(userId, {})).resolves.toEqual(DEFAULTS);
      expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(realtimeService.emitToUser).not.toHaveBeenCalled();
    });
  });

  describe('mute', () => {
    it('mutes a conversation the user is in ($addToSet, cap checked in the write)', async () => {
      conversationModel.exists.mockResolvedValue({ _id: convId });
      userModel.findOneAndUpdate.mockReturnValue(
        chain({ settings: { mutedConversationIds: [convId] } }),
      );

      const result = await service.mute(userId, convId.toString());

      expect(conversationModel.exists).toHaveBeenCalledWith({
        _id: convId,
        'participants.userId': me,
      });
      const [filter, update] = writeCall();
      expect(filter).toEqual({
        _id: me,
        $or: [
          { 'settings.mutedConversationIds': convId },
          { 'settings.mutedConversationIds.499': { $exists: false } },
        ],
      });
      expect(update).toEqual({
        $addToSet: { 'settings.mutedConversationIds': convId },
      });
      expect(result.mutedConversationIds).toEqual([convId.toString()]);
      expect(realtimeService.emitToUser).toHaveBeenCalledWith(
        userId,
        'settings:updated',
        { settings: result },
      );
    });

    it('404 for a conversation the user is not in, nothing written', async () => {
      conversationModel.exists.mockResolvedValue(null);

      await expect(service.mute(userId, convId.toString())).rejects.toThrow(
        NotFoundException,
      );
      expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(realtimeService.emitToUser).not.toHaveBeenCalled();
    });

    it('400 when 500 conversations are already muted', async () => {
      conversationModel.exists.mockResolvedValue({ _id: convId });
      userModel.findOneAndUpdate.mockReturnValue(chain(null));

      await expect(service.mute(userId, convId.toString())).rejects.toThrow(
        BadRequestException,
      );
      expect(realtimeService.emitToUser).not.toHaveBeenCalled();
    });

    it('400 for a malformed conversation id, no query', async () => {
      await expect(service.mute(userId, 'nope')).rejects.toThrow(
        BadRequestException,
      );
      expect(conversationModel.exists).not.toHaveBeenCalled();
    });
  });

  describe('unmute', () => {
    it('pulls the id without a membership check (a group already left can be unmuted)', async () => {
      userModel.findOneAndUpdate.mockReturnValue(
        chain({ settings: { mutedConversationIds: [] } }),
      );

      const result = await service.unmute(userId, convId.toString());

      expect(conversationModel.exists).not.toHaveBeenCalled();
      expect(writeCall()).toEqual([
        { _id: me },
        { $pull: { 'settings.mutedConversationIds': convId } },
        expect.anything(),
      ]);
      expect(result.mutedConversationIds).toEqual([]);
      expect(realtimeService.emitToUser).toHaveBeenCalledTimes(1);
    });
  });
});

describe('UpdateSettingsDto', () => {
  const errorsFor = async (body: unknown) => {
    const dto = plainToInstance(UpdateSettingsDto, body);
    return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  };

  it('accepts a partial update', async () => {
    expect(await errorsFor({ notifications: { sound: false } })).toHaveLength(
      0,
    );
  });

  it.each([
    ['a non-boolean value', { notifications: { sound: 'false' } }],
    ['an unknown nested field', { notifications: { preview: true } }],
    ['an unknown top-level field', { mutedConversationIds: ['x'] }],
    ['a section that is not an object', { chat: true }],
  ])('rejects %s', async (_label, body) => {
    expect((await errorsFor(body)).length).toBeGreaterThan(0);
  });
});
