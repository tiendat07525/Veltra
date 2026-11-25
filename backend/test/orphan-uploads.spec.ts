import type { Model } from 'mongoose';
import type { MessageDocument } from 'src/messages/schemas/message.schema';
import type { ResourceType } from 'src/storage/cloudinary.service';
import type { UserDocument } from 'src/users/schemas/user.schema';
import {
  CloudinaryAdmin,
  CloudinaryAsset,
  DELETE_BATCH_SIZE,
  MAX_DELETES_PER_RUN,
  ORPHAN_MIN_AGE_MS,
  OrphanUploadsService,
} from 'src/maintenance/orphan-uploads.service';

const NOW = new Date('2026-11-16T12:00:00.000Z');
const OLD = new Date(NOW.getTime() - ORPHAN_MIN_AGE_MS - 60_000).toISOString();
const RECENT = new Date(NOW.getTime() - 60_000).toISOString();
const CONV = 'a'.repeat(24);
const USER = 'b'.repeat(24);
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const id = (n: number, ext = '') => `veltra/${CONV}/${USER}/${uuid(n)}${ext}`;
const asset = (
  publicId: string,
  resourceType: ResourceType,
  createdAt = OLD,
): CloudinaryAsset => ({
  public_id: publicId,
  resource_type: resourceType,
  created_at: createdAt,
  bytes: 1000,
});

describe('OrphanUploadsService', () => {
  let stored: Record<ResourceType, CloudinaryAsset[]>;
  let referencedIds: string[];
  let listResources: jest.MockedFunction<CloudinaryAdmin['listResources']>;
  let deleteResources: jest.MockedFunction<CloudinaryAdmin['deleteResources']>;
  let find: jest.Mock;
  let avatarIds: string[];
  let findUsers: jest.Mock;
  let service: OrphanUploadsService;
  const pageSize = 2;

  beforeEach(() => {
    stored = { image: [], video: [], raw: [] };
    referencedIds = [];
    avatarIds = [];
    // Pages of `pageSize`, cursor = next index
    listResources = jest.fn(
      (resourceType: ResourceType, prefix: string, cursor?: string) => {
        const start = cursor ? Number(cursor) : 0;
        const all = stored[resourceType].filter((a) =>
          a.public_id.startsWith(prefix),
        );
        const end = start + pageSize;
        return Promise.resolve({
          resources: all.slice(start, end),
          ...(end < all.length ? { next_cursor: String(end) } : {}),
        });
      },
    );
    deleteResources = jest.fn(
      (publicIds: string[], _resourceType: ResourceType) =>
        Promise.resolve({
          deleted: Object.fromEntries(publicIds.map((p) => [p, 'deleted'])),
        }),
    );
    find = jest.fn((filter: { 'attachments.publicId': { $in: string[] } }) => ({
      lean: () =>
        Promise.resolve(
          filter['attachments.publicId'].$in
            .filter((p) => referencedIds.includes(p))
            .map((p) => ({
              attachments: [{ publicId: p }, { publicId: 'other' }],
            })),
        ),
    }));
    findUsers = jest.fn((filter: { avatarPublicId: { $in: string[] } }) => ({
      lean: () =>
        Promise.resolve(
          filter.avatarPublicId.$in
            .filter((p) => avatarIds.includes(p))
            .map((p) => ({ avatarPublicId: p })),
        ),
    }));
    service = new OrphanUploadsService(
      { find } as unknown as Model<MessageDocument>,
      { find: findUsers } as unknown as Model<UserDocument>,
      { listResources, deleteResources },
    );
  });

  it('should list every resource type under veltra/ and follow next_cursor', async () => {
    stored.image = [1, 2, 3, 4, 5].map((n) => asset(id(n), 'image', RECENT));
    stored.raw = [asset(id(6, '.pdf'), 'raw', RECENT)];
    const report = await service.run({ apply: false, now: NOW });
    expect(report.scanned).toBe(6);
    expect(listResources.mock.calls.map((c) => [c[0], c[1], c[2]])).toEqual([
      ['image', 'veltra/', undefined],
      ['image', 'veltra/', '2'],
      ['image', 'veltra/', '4'],
      ['video', 'veltra/', undefined],
      ['raw', 'veltra/', undefined],
    ]);
  });

  it('should keep referenced and recent assets and ignore ids the server never signs', async () => {
    stored.image = [
      asset(id(1), 'image'), // orphan
      asset(id(2), 'image'), // referenced
      asset(id(3), 'image', RECENT), // too recent
      asset('veltra/sample', 'image'), // not our id pattern
      asset(`veltra/${CONV}/${USER}/not-a-uuid`, 'image'),
    ];
    stored.raw = [asset(id(4, '.pdf'), 'raw')]; // orphan, raw keeps its extension
    referencedIds = [id(2)];

    const report = await service.run({ apply: true, now: NOW });

    expect(report).toMatchObject({
      applied: true,
      scanned: 6,
      ignored: 2,
      recent: 1,
      referenced: 1,
      deferred: 0,
      deleted: 2,
      notFound: 0,
      failed: [],
    });
    expect(report.orphans.map((o) => o.publicId)).toEqual([
      id(1),
      id(4, '.pdf'),
    ]);
    expect(deleteResources.mock.calls).toEqual([
      [[id(1)], 'image'],
      [[id(4, '.pdf')], 'raw'],
    ]);
  });

  it('should keep avatars in use and delete the ones no user has', async () => {
    const avatar = (n: number) => `veltra/avatars/${USER}/${uuid(n)}`;
    stored.image = [
      asset(avatar(1), 'image'), // in use
      asset(avatar(2), 'image'), // uploaded, never set
      asset(avatar(3), 'image', RECENT),
      asset(`veltra/avatars/${USER}/not-a-uuid`, 'image'),
      asset(id(4), 'image'), // attachment in use
    ];
    avatarIds = [avatar(1)];
    referencedIds = [id(4)];

    const report = await service.run({ apply: true, now: NOW });

    expect(report).toMatchObject({ ignored: 1, recent: 1, referenced: 2 });
    expect(deleteResources.mock.calls).toEqual([[[avatar(2)], 'image']]);
    expect(findUsers).toHaveBeenCalledWith(
      { avatarPublicId: { $in: [avatar(1), avatar(2)] } },
      { avatarPublicId: 1 },
    );
    // Attachment ids only
    expect(find.mock.calls[0][0]).toEqual({
      'attachments.publicId': { $in: [id(4)] },
    });
  });

  it('should treat an asset exactly at the age limit as orphaned and one second younger as recent', async () => {
    const atLimit = new Date(NOW.getTime() - ORPHAN_MIN_AGE_MS).toISOString();
    const younger = new Date(
      NOW.getTime() - ORPHAN_MIN_AGE_MS + 1000,
    ).toISOString();
    stored.video = [
      asset(id(1), 'video', atLimit),
      asset(id(2), 'video', younger),
    ];
    const report = await service.run({ apply: false, now: NOW });
    expect(report.orphans.map((o) => o.publicId)).toEqual([id(1)]);
    expect(report.recent).toBe(1);
  });

  it('should delete nothing in a dry run', async () => {
    stored.image = [asset(id(1), 'image')];
    const report = await service.run({ apply: false, now: NOW });
    expect(report.orphans).toHaveLength(1);
    expect(report.deleted).toBe(0);
    expect(deleteResources).not.toHaveBeenCalled();
  });

  it('should not query MongoDB when there is no candidate', async () => {
    stored.image = [asset(id(1), 'image', RECENT)];
    await service.run({ apply: true, now: NOW });
    expect(find).not.toHaveBeenCalled();
    expect(deleteResources).not.toHaveBeenCalled();
  });

  it('should delete in batches of 100, oldest first, at most MAX_DELETES_PER_RUN per run', async () => {
    const total = MAX_DELETES_PER_RUN + 30;
    // Newest first in the listing; the oldest must be deleted first
    stored.image = Array.from({ length: total }, (_, i) =>
      asset(
        id(i),
        'image',
        new Date(
          NOW.getTime() - ORPHAN_MIN_AGE_MS - (total - i) * 1000,
        ).toISOString(),
      ),
    ).reverse();

    const report = await service.run({ apply: true, now: NOW });

    expect(report.orphans).toHaveLength(MAX_DELETES_PER_RUN);
    expect(report.deferred).toBe(30);
    expect(report.deleted).toBe(MAX_DELETES_PER_RUN);
    expect(deleteResources).toHaveBeenCalledTimes(
      MAX_DELETES_PER_RUN / DELETE_BATCH_SIZE,
    );
    for (const [ids] of deleteResources.mock.calls) {
      expect(ids.length).toBeLessThanOrEqual(DELETE_BATCH_SIZE);
    }
    expect(report.orphans[0].publicId).toBe(id(0));
    expect(report.orphans.map((o) => o.publicId)).not.toContain(id(total - 1));
  });

  it('should count not_found, record ids Cloudinary did not delete, and keep going after a failed call', async () => {
    stored.image = [
      asset(id(1), 'image'),
      asset(id(2), 'image'),
      asset(id(3), 'image'),
    ];
    stored.video = [asset(id(4), 'video')];
    deleteResources
      .mockResolvedValueOnce({
        deleted: { [id(1)]: 'deleted', [id(2)]: 'not_found', [id(3)]: 'error' },
      })
      .mockRejectedValueOnce(new Error('rate limited'));
    const logger = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);

    const report = await service.run({ apply: true, now: NOW });

    expect(report).toMatchObject({ deleted: 1, notFound: 1 });
    expect(report.failed).toEqual([id(3), id(4)]);
    expect(logger).toHaveBeenCalledTimes(1);
  });

  it('should look references up only for candidates, in $in batches', async () => {
    stored.image = Array.from({ length: 600 }, (_, i) => asset(id(i), 'image'));
    referencedIds = [id(0), id(599)];
    const report = await service.run({ apply: false, now: NOW });
    expect(find).toHaveBeenCalledTimes(2);
    const firstFilter = find.mock.calls[0][0] as {
      'attachments.publicId': { $in: string[] };
    };
    expect(firstFilter['attachments.publicId'].$in).toHaveLength(500);
    expect(report.referenced).toBe(2);
    expect(report.orphans).toHaveLength(MAX_DELETES_PER_RUN);
    expect(report.deferred).toBe(598 - MAX_DELETES_PER_RUN);
  });
});
