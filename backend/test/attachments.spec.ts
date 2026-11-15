import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { AttachmentService } from '../src/messages/attachment.service';
import {
  attachmentPreview,
  PUBLIC_ID_PATTERN,
  sanitizeFileName,
} from '../src/messages/attachment.rules';
import { MessageService } from '../src/messages/message.service';
import { CreateMessageDto } from '../src/messages/dto/create-message.dto';
import type { Attachment } from '../src/messages/schemas/message.schema';

jest.mock('cloudinary', () => {
  const actual = jest.requireActual<typeof import('cloudinary')>('cloudinary');
  return {
    v2: {
      config: jest.fn(),
      url: jest.fn(
        (id: string) =>
          `https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/${id}`,
      ),
      utils: { api_sign_request: actual.v2.utils.api_sign_request },
      uploader: { explicit: jest.fn(), destroy: jest.fn() },
    },
  };
});

const explicit = cloudinary.uploader.explicit as unknown as jest.Mock;
const destroy = cloudinary.uploader.destroy as unknown as jest.Mock;
const SECRET = 'test-secret';
const CLOUDINARY_URL = `cloudinary://123456:${SECRET}@demo`;

const oid = () => new Types.ObjectId().toString();
const uuid = () => crypto.randomUUID();

const makeService = (url: string | null = CLOUDINARY_URL) => {
  const conversationModel = { exists: jest.fn().mockResolvedValue(true) };
  const config = { get: jest.fn(() => url ?? undefined) };
  return {
    service: new AttachmentService(conversationModel as any, config as any),
    conversationModel,
  };
};

beforeEach(() => {
  explicit.mockReset();
  destroy.mockReset().mockResolvedValue({ result: 'ok' });
});

describe('AttachmentService.sign', () => {
  const me = oid();
  const conversationId = oid();
  const sign = (
    service: AttachmentService,
    file: Partial<{ fileName: string; mimeType: string; size: number }> = {},
  ) =>
    service.sign(me, {
      conversationId,
      fileName: 'photo.png',
      mimeType: 'image/png',
      size: 1000,
      ...file,
    });

  it('503 when CLOUDINARY_URL is missing', async () => {
    const { service, conversationModel } = makeService(null);
    await expect(sign(service)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(conversationModel.exists).not.toHaveBeenCalled();
  });

  it('404 for a non-member (membership query uses me + conversation)', async () => {
    const { service, conversationModel } = makeService();
    conversationModel.exists.mockResolvedValueOnce(null);
    await expect(sign(service)).rejects.toBeInstanceOf(NotFoundException);
    expect(conversationModel.exists).toHaveBeenCalledWith({
      _id: new Types.ObjectId(conversationId),
      'participants.userId': new Types.ObjectId(me),
    });
  });

  it.each([
    ['page.html', 'text/html'],
    ['icon.svg', 'image/svg+xml'],
    ['run.exe', 'application/octet-stream'],
    ['photo.png', 'application/pdf'], // extension and MIME disagree
    ['noextension', 'image/png'],
  ])('400 for unsupported %s (%s)', async (fileName, mimeType) => {
    const { service } = makeService();
    await expect(sign(service, { fileName, mimeType })).rejects.toThrow(
      'Loại file không được hỗ trợ',
    );
  });

  it.each([
    ['photo.jpg', 'image/jpeg', 10],
    ['clip.mp4', 'video/mp4', 25],
    ['voice.m4a', 'audio/mp4', 25],
    ['report.pdf', 'application/pdf', 10],
  ])('400 when %s is over %i MB', async (fileName, mimeType, mb) => {
    const { service } = makeService();
    const limit = mb * 1024 * 1024;
    await expect(
      sign(service, { fileName, mimeType, size: limit }),
    ).resolves.toBeDefined();
    await expect(
      sign(service, { fileName, mimeType, size: limit + 1 }),
    ).rejects.toThrow(`File vượt quá ${mb} MB`);
  });

  it('image: random public_id in veltra/{conversation}/{me}/, signed fields with allowed_formats', async () => {
    const { service } = makeService();
    const res = await sign(service, { fileName: 'Photo.PNG' });
    expect(res.kind).toBe('image');
    expect(res.uploadUrl).toBe(
      'https://api.cloudinary.com/v1_1/demo/image/upload',
    );
    const { signature, api_key, ...signed } = res.fields;
    expect(api_key).toBe('123456');
    expect(signed.public_id).toMatch(
      new RegExp(`^veltra/${conversationId}/${me}/[0-9a-f-]{36}$`),
    );
    expect(signed).toMatchObject({
      overwrite: 'false',
      allowed_formats: 'jpg,jpeg,png,webp,gif',
    });
    expect(signature).toBe(
      cloudinary.utils.api_sign_request(signed as any, SECRET),
    );
    // two signatures never share an id
    const other = await sign(service);
    expect(other.fields.public_id).not.toBe(signed.public_id);
  });

  it('audio uploads as resource_type video; files as raw with the extension in the id', async () => {
    const { service } = makeService();
    const audio = await sign(service, {
      fileName: 'a.mp3',
      mimeType: 'audio/mpeg',
    });
    expect(audio.kind).toBe('audio');
    expect(audio.uploadUrl).toMatch(/\/video\/upload$/);
    expect(audio.fields.allowed_formats).toBe('mp3,m4a,ogg,wav');

    const file = await sign(service, {
      fileName: 'Báo cáo.DOCX',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(file.kind).toBe('file');
    expect(file.uploadUrl).toMatch(/\/raw\/upload$/);
    expect(file.fields.public_id).toMatch(/\.docx$/);
    expect(file.fields).not.toHaveProperty('allowed_formats');
  });
});

describe('AttachmentService.resolve', () => {
  const me = oid();
  const conversationId = oid();
  const imageId = () => `veltra/${conversationId}/${me}/${uuid()}`;
  const imageResource = (publicId: string, extra: object = {}) => ({
    public_id: publicId,
    version: 1700000000,
    resource_type: 'image',
    format: 'png',
    bytes: 2048,
    secure_url: `https://res.cloudinary.com/demo/image/upload/v1/${publicId}.png`,
    width: 64,
    height: 48,
    ...extra,
  });

  it('builds attachments from the stored assets (not the client data)', async () => {
    const { service } = makeService();
    const img = imageId();
    const pdf = `veltra/${conversationId}/${me}/${uuid()}.pdf`;
    explicit.mockImplementation((id: string) =>
      Promise.resolve(
        id === img
          ? imageResource(img)
          : {
              public_id: pdf,
              resource_type: 'raw',
              bytes: 5000,
              secure_url: `https://res.cloudinary.com/demo/raw/upload/v1/${pdf}`,
            },
      ),
    );

    const result = await service.resolve(me, conversationId, [
      { publicId: img, kind: 'image', name: 'a.png' },
      { publicId: pdf, kind: 'file', name: '../../etc/Báo cáo.pdf' },
    ]);

    expect(explicit).toHaveBeenCalledWith(img, {
      type: 'upload',
      resource_type: 'image',
    });
    expect(explicit).toHaveBeenCalledWith(pdf, {
      type: 'upload',
      resource_type: 'raw',
    });
    expect(result).toEqual([
      {
        kind: 'image',
        url: expect.stringContaining('f_auto,q_auto'),
        publicId: img,
        resourceType: 'image',
        format: 'png',
        bytes: 2048,
        name: 'a.png',
        width: 64,
        height: 48,
      },
      {
        kind: 'file',
        url: `https://res.cloudinary.com/demo/raw/upload/v1/${pdf}`,
        publicId: pdf,
        resourceType: 'raw',
        format: 'pdf',
        bytes: 5000,
        name: '....etcBáo cáo.pdf',
      },
    ]);
  });

  it.each([
    ['another conversation', () => `veltra/${oid()}/${me}/${uuid()}`],
    ['another uploader', () => `veltra/${conversationId}/${oid()}/${uuid()}`],
    ['outside veltra/', () => `other/${conversationId}/${me}/${uuid()}`],
  ])('400 for an upload of %s, without calling Cloudinary', async (_, id) => {
    const { service } = makeService();
    await expect(
      service.resolve(me, conversationId, [
        { publicId: id(), kind: 'image', name: 'x.png' },
      ]),
    ).rejects.toThrow('File đính kèm không hợp lệ');
    expect(explicit).not.toHaveBeenCalled();
  });

  it('400 when the kind does not match the id (raw needs an extension, others none)', async () => {
    const { service } = makeService();
    await expect(
      service.resolve(me, conversationId, [
        { publicId: imageId(), kind: 'file', name: 'x.pdf' },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.resolve(me, conversationId, [
        { publicId: `${imageId()}.pdf`, kind: 'image', name: 'x.png' },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(explicit).not.toHaveBeenCalled();
  });

  it('400 for more than 10 files or duplicates', async () => {
    const { service } = makeService();
    const many = Array.from({ length: 11 }, () => ({
      publicId: imageId(),
      kind: 'image' as const,
      name: 'x.png',
    }));
    await expect(service.resolve(me, conversationId, many)).rejects.toThrow(
      'Tối đa 10 file mỗi tin nhắn',
    );
    const id = imageId();
    await expect(
      service.resolve(me, conversationId, [
        { publicId: id, kind: 'image', name: 'a' },
        { publicId: id, kind: 'image', name: 'b' },
      ]),
    ).rejects.toThrow('File đính kèm bị trùng');
  });

  it('400 when the upload does not exist (nothing destroyed)', async () => {
    const { service } = makeService();
    explicit.mockRejectedValue({
      message: 'Resource not found',
      http_code: 404,
    });
    await expect(
      service.resolve(me, conversationId, [
        { publicId: imageId(), kind: 'image', name: 'x.png' },
      ]),
    ).rejects.toThrow('File đính kèm chưa được tải lên');
    expect(destroy).not.toHaveBeenCalled();
  });

  it.each([
    ['real format not allowed', { format: 'svg' }],
    ['real size over the limit', { bytes: 10 * 1024 * 1024 + 1 }],
  ])('400 and destroys the asset: %s', async (_, override) => {
    const { service } = makeService();
    const id = imageId();
    explicit.mockResolvedValue(imageResource(id, override));
    await expect(
      service.resolve(me, conversationId, [
        { publicId: id, kind: 'image', name: 'x.png' },
      ]),
    ).rejects.toThrow('File đính kèm sai định dạng hoặc quá dung lượng');
    expect(destroy).toHaveBeenCalledWith(id, {
      resource_type: 'image',
      invalidate: true,
    });
  });

  it('503 when Cloudinary fails (not a 404)', async () => {
    const { service } = makeService();
    explicit.mockRejectedValue({ message: 'boom', http_code: 500 });
    await expect(
      service.resolve(me, conversationId, [
        { publicId: imageId(), kind: 'image', name: 'x.png' },
      ]),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('no refs → no Cloudinary call, even without credentials', async () => {
    const { service } = makeService(null);
    await expect(service.resolve(me, conversationId, [])).resolves.toEqual([]);
  });
});

describe('helpers', () => {
  it('preview text for lastMessage', () => {
    const a = (kind: Attachment['kind'], name = 'x') => ({ kind, name });
    expect(attachmentPreview([a('image')])).toBe('[Ảnh]');
    expect(attachmentPreview([a('video')])).toBe('[Video]');
    expect(attachmentPreview([a('audio')])).toBe('[Âm thanh]');
    expect(attachmentPreview([a('file', 'Báo cáo.pdf')])).toBe(
      '[Tệp] Báo cáo.pdf',
    );
    expect(attachmentPreview([a('image'), a('image'), a('image')])).toBe(
      '[3 ảnh]',
    );
    expect(attachmentPreview([a('image'), a('file')])).toBe('[2 tệp đính kèm]');
  });

  it('file names are display-only: no separators or control chars, ≤ 200 chars', () => {
    expect(sanitizeFileName('a/b\\c\u0000d\n.pdf')).toBe('abcd.pdf');
    expect(sanitizeFileName('   ')).toBe('tep');
    expect(sanitizeFileName('x'.repeat(300))).toHaveLength(200);
  });

  it('public id pattern', () => {
    const c = oid();
    const u = oid();
    expect(PUBLIC_ID_PATTERN.test(`veltra/${c}/${u}/${uuid()}`)).toBe(true);
    expect(PUBLIC_ID_PATTERN.test(`veltra/${c}/${u}/${uuid()}.pdf`)).toBe(true);
    expect(PUBLIC_ID_PATTERN.test(`veltra/${c}/${u}/../${uuid()}`)).toBe(false);
  });
});

describe('CreateMessageDto with attachments', () => {
  const ref = () => ({
    publicId: `veltra/${oid()}/${oid()}/${uuid()}`,
    kind: 'image',
    name: 'a.png',
  });
  const errorsOf = async (body: object) =>
    (await validate(plainToInstance(CreateMessageDto, body))).map(
      (e) => e.property,
    );

  it('content is optional only when there are attachments', async () => {
    expect(
      await errorsOf({ conversationId: oid(), attachments: [ref()] }),
    ).toEqual([]);
    expect(await errorsOf({ conversationId: oid() })).toContain('content');
    expect(
      await errorsOf({ conversationId: oid(), attachments: [] }),
    ).toContain('content');
    expect(
      await errorsOf({
        conversationId: oid(),
        content: 'x'.repeat(501),
        attachments: [ref()],
      }),
    ).toContain('content');
  });

  it('rejects bad refs and more than 10', async () => {
    expect(
      await errorsOf({
        conversationId: oid(),
        attachments: [{ ...ref(), publicId: 'veltra/../../x' }],
      }),
    ).toContain('attachments');
    expect(
      await errorsOf({
        conversationId: oid(),
        attachments: [{ ...ref(), kind: 'exe' }],
      }),
    ).toContain('attachments');
    expect(
      await errorsOf({
        conversationId: oid(),
        attachments: Array.from({ length: 11 }, ref),
      }),
    ).toContain('attachments');
  });
});

describe('MessageService with attachments', () => {
  const me = new Types.ObjectId();
  const other = new Types.ObjectId();
  const conversationId = new Types.ObjectId();

  const storedAttachment: Attachment = {
    kind: 'image',
    url: 'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/x',
    publicId: `veltra/${conversationId.toString()}/${me.toString()}/${uuid()}`,
    resourceType: 'image',
    format: 'png',
    bytes: 2048,
    name: 'a.png',
    width: 64,
    height: 48,
  };

  let messageModel: {
    findOne: jest.Mock;
    create: jest.Mock;
    findById: jest.Mock;
  };
  let conversationModel: {
    findById: jest.Mock;
    findOneAndUpdate: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };
  let realtime: { emitToUser: jest.Mock };
  let attachments: { resolve: jest.Mock; destroy: jest.Mock };
  let service: MessageService;

  const conversationDoc = () => ({
    _id: conversationId,
    participants: [{ userId: me }, { userId: other }],
    lastSeq: 1,
    lastMessage: null as unknown,
  });

  beforeEach(() => {
    messageModel = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn(([doc]: [Record<string, unknown>]) =>
        Promise.resolve([
          {
            ...doc,
            _id: new Types.ObjectId(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      ),
      findById: jest.fn(),
    };
    conversationModel = {
      findById: jest.fn().mockResolvedValue(conversationDoc()),
      findOneAndUpdate: jest
        .fn()
        .mockResolvedValueOnce({ lastSeq: 1 })
        .mockImplementationOnce((_f: unknown, update: { $set: object }) =>
          Promise.resolve({ ...conversationDoc(), ...update.$set }),
        ),
      findByIdAndUpdate: jest.fn(),
    };
    realtime = { emitToUser: jest.fn() };
    attachments = {
      resolve: jest.fn().mockResolvedValue([storedAttachment]),
      destroy: jest.fn(),
    };
    service = new MessageService(
      messageModel as any,
      conversationModel as any,
      realtime as any,
      {} as any,
      { transaction: (fn: (s: object) => unknown) => fn({}) } as any,
      attachments as any,
    );
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  const ref = {
    publicId: storedAttachment.publicId,
    kind: 'image' as const,
    name: 'a.png',
  };

  it('400 for no text and no files; whitespace counts as empty', async () => {
    for (const content of [undefined, '', '   ']) {
      await expect(
        service.sendDirectMessage(
          { conversationId: conversationId.toString(), content },
          me.toString(),
        ),
      ).rejects.toThrow('Tin nhắn không được để trống');
    }
    expect(conversationModel.findById).not.toHaveBeenCalled();
  });

  it('400 for files without conversationId (receiverId only)', async () => {
    await expect(
      service.sendDirectMessage(
        { receiverId: other.toString(), attachments: [ref] },
        me.toString(),
      ),
    ).rejects.toThrow('Cần conversationId để gửi file');
  });

  it('files-only message: stored without content, preview in lastMessage, payload without publicId', async () => {
    const res = await service.sendDirectMessage(
      {
        conversationId: conversationId.toString(),
        attachments: [ref],
        clientMsgId: uuid(),
      },
      me.toString(),
    );

    expect(attachments.resolve).toHaveBeenCalledWith(
      me.toString(),
      conversationId.toString(),
      [ref],
    );
    const [[[stored]]] = messageModel.create.mock.calls as [
      [Record<string, unknown>],
    ][];
    expect(stored).not.toHaveProperty('content');
    expect(stored.attachments).toEqual([storedAttachment]);

    const lastMessageUpdate = conversationModel.findOneAndUpdate.mock
      .calls[1][1] as {
      $set: { lastMessage: { content: string } };
    };
    expect(lastMessageUpdate.$set.lastMessage.content).toBe('[Ảnh]');

    expect(res.data.attachments).toEqual([
      {
        kind: 'image',
        url: storedAttachment.url,
        name: 'a.png',
        format: 'png',
        bytes: 2048,
        width: 64,
        height: 48,
      },
    ]);
    const emitted = realtime.emitToUser.mock.calls[0][2] as {
      message: Record<string, unknown>;
    };
    expect(JSON.stringify(emitted)).not.toContain('publicId');
    expect(realtime.emitToUser).toHaveBeenCalledTimes(2);
  });

  it('a caption is kept as content (trimmed) next to the files', async () => {
    await service.sendDirectMessage(
      {
        conversationId: conversationId.toString(),
        content: '  hi  ',
        attachments: [ref],
      },
      me.toString(),
    );
    const [[[stored]]] = messageModel.create.mock.calls as [
      [Record<string, unknown>],
    ][];
    expect(stored.content).toBe('hi');
    const lastMessageUpdate = conversationModel.findOneAndUpdate.mock
      .calls[1][1] as {
      $set: { lastMessage: { content: string } };
    };
    expect(lastMessageUpdate.$set.lastMessage.content).toBe('hi');
  });

  it('a retried send returns the stored message without checking files again', async () => {
    const clientMsgId = uuid();
    messageModel.findOne.mockResolvedValueOnce({
      _id: new Types.ObjectId(),
      conversationId,
      senderId: me,
      clientMsgId,
      seq: 1,
      attachments: [storedAttachment],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const res = await service.sendDirectMessage(
      {
        conversationId: conversationId.toString(),
        attachments: [ref],
        clientMsgId,
      },
      me.toString(),
    );
    expect(attachments.resolve).not.toHaveBeenCalled();
    expect(messageModel.create).not.toHaveBeenCalled();
    expect(res.data.attachments).toHaveLength(1);
  });

  it('a rejected file stops the send before the transaction', async () => {
    attachments.resolve.mockRejectedValueOnce(new BadRequestException('x'));
    await expect(
      service.sendDirectMessage(
        { conversationId: conversationId.toString(), attachments: [ref] },
        me.toString(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(conversationModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });

  it('revoke clears attachments and deletes the files only after saving', async () => {
    const order: string[] = [];
    const message = {
      _id: new Types.ObjectId(),
      conversationId,
      senderId: me,
      isRevoked: false,
      content: undefined as string | undefined,
      attachments: [storedAttachment] as Attachment[] | undefined,
      save: jest.fn(() => {
        order.push('save');
        return Promise.resolve();
      }),
    };
    messageModel.findById.mockResolvedValue(message);
    attachments.destroy.mockImplementation(() => order.push('destroy'));

    await service.revokeMessage(message._id.toString(), me.toString());

    expect(message.attachments).toBeUndefined();
    expect(message.isRevoked).toBe(true);
    expect(attachments.destroy).toHaveBeenCalledWith([
      { publicId: storedAttachment.publicId, resourceType: 'image' },
    ]);
    expect(order).toEqual(['save', 'destroy']);
  });
});
