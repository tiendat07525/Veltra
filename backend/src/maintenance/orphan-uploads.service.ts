import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message, MessageDocument } from 'src/messages/schemas/message.schema';
import {
  PUBLIC_ID_PATTERN,
  ResourceType,
  ROOT_FOLDER,
} from 'src/messages/attachment.rules';

// An asset is "orphaned" when nobody sent it within this time (sign → upload → send takes seconds)
export const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;
// Safety cap per run; the rest waits for the next run
export const MAX_DELETES_PER_RUN = 500;
// Cloudinary limits: 500 per listing page, 100 ids per delete call
export const LIST_PAGE_SIZE = 500;
export const DELETE_BATCH_SIZE = 100;
const REFERENCE_QUERY_BATCH = 500;
const RESOURCE_TYPES: ResourceType[] = ['image', 'video', 'raw'];

export interface CloudinaryAsset {
  public_id: string;
  resource_type: string;
  created_at: string; // ISO UTC
  bytes?: number;
}

// The two Admin API calls the cleanup needs (cloudinary.v2.api in production, a fake in tests)
export interface CloudinaryAdmin {
  listResources(
    resourceType: ResourceType,
    prefix: string,
    nextCursor?: string,
  ): Promise<{ resources: CloudinaryAsset[]; next_cursor?: string }>;
  deleteResources(
    publicIds: string[],
    resourceType: ResourceType,
  ): Promise<{ deleted: Record<string, string> }>;
}
export const CLOUDINARY_ADMIN = Symbol('CLOUDINARY_ADMIN');

export interface OrphanAsset {
  publicId: string;
  resourceType: ResourceType;
  createdAt: string;
  bytes: number;
}

export interface OrphanUploadsReport {
  applied: boolean;
  scanned: number; // assets listed under veltra/
  ignored: number; // under veltra/ but not an id the server signs (never touched)
  recent: number; // younger than ORPHAN_MIN_AGE_MS
  referenced: number; // used by a stored message
  orphans: OrphanAsset[]; // to delete this run (oldest first, at most MAX_DELETES_PER_RUN)
  deferred: number; // orphans beyond the cap, left for the next run
  deleted: number;
  notFound: number;
  failed: string[]; // public ids Cloudinary did not delete
}

/**
 * Deletes Cloudinary uploads that no message references: files uploaded with a signature
 * from POST /message/attachments/sign but never sent (tab closed, send failed for good).
 * Only ids matching PUBLIC_ID_PATTERN and older than ORPHAN_MIN_AGE_MS are considered.
 * Dry run unless `apply` is set.
 */
@Injectable()
export class OrphanUploadsService {
  private readonly logger = new Logger(OrphanUploadsService.name);

  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @Inject(CLOUDINARY_ADMIN) private readonly admin: CloudinaryAdmin,
  ) {}

  async run(options: {
    apply: boolean;
    now?: Date;
  }): Promise<OrphanUploadsReport> {
    const cutoff = (options.now ?? new Date()).getTime() - ORPHAN_MIN_AGE_MS;
    const report: OrphanUploadsReport = {
      applied: options.apply,
      scanned: 0,
      ignored: 0,
      recent: 0,
      referenced: 0,
      orphans: [],
      deferred: 0,
      deleted: 0,
      notFound: 0,
      failed: [],
    };

    // 1. Old enough assets with an id the server signs (Cloudinary is listed before MongoDB is
    //    read, so a message stored in between can only reference a newer, skipped asset)
    const candidates: OrphanAsset[] = [];
    for (const resourceType of RESOURCE_TYPES) {
      let cursor: string | undefined;
      do {
        const page = await this.admin.listResources(
          resourceType,
          `${ROOT_FOLDER}/`,
          cursor,
        );
        for (const asset of page.resources) {
          report.scanned += 1;
          const createdAt = Date.parse(asset.created_at);
          if (
            !PUBLIC_ID_PATTERN.test(asset.public_id) ||
            Number.isNaN(createdAt)
          ) {
            report.ignored += 1;
          } else if (createdAt > cutoff) {
            report.recent += 1;
          } else {
            candidates.push({
              publicId: asset.public_id,
              resourceType,
              createdAt: asset.created_at,
              bytes: asset.bytes ?? 0,
            });
          }
        }
        cursor = page.next_cursor || undefined;
      } while (cursor);
    }

    // 2. Drop those a stored message references
    const referenced = await this.findReferenced(
      candidates.map((c) => c.publicId),
    );
    report.referenced = referenced.size;
    const orphans = candidates
      .filter((c) => !referenced.has(c.publicId))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    report.orphans = orphans.slice(0, MAX_DELETES_PER_RUN);
    report.deferred = orphans.length - report.orphans.length;

    if (!options.apply) return report;

    // 3. Delete, per resource type, 100 ids per call
    for (const resourceType of RESOURCE_TYPES) {
      const ids = report.orphans
        .filter((o) => o.resourceType === resourceType)
        .map((o) => o.publicId);
      for (let i = 0; i < ids.length; i += DELETE_BATCH_SIZE) {
        const batch = ids.slice(i, i + DELETE_BATCH_SIZE);
        try {
          const { deleted } = await this.admin.deleteResources(
            batch,
            resourceType,
          );
          for (const id of batch) {
            if (deleted?.[id] === 'deleted') report.deleted += 1;
            else if (deleted?.[id] === 'not_found') report.notFound += 1;
            else report.failed.push(id);
          }
        } catch (err: unknown) {
          this.logger.error(
            `[OrphanUploads] delete ${resourceType} failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          report.failed.push(...batch);
        }
      }
    }
    return report;
  }

  private async findReferenced(publicIds: string[]): Promise<Set<string>> {
    const wanted = new Set(publicIds);
    const found = new Set<string>();
    for (let i = 0; i < publicIds.length; i += REFERENCE_QUERY_BATCH) {
      const batch = publicIds.slice(i, i + REFERENCE_QUERY_BATCH);
      const messages = await this.messageModel
        .find(
          { 'attachments.publicId': { $in: batch } },
          { 'attachments.publicId': 1 },
        )
        .lean<{ attachments?: { publicId: string }[] }[]>();
      for (const message of messages) {
        for (const attachment of message.attachments ?? []) {
          if (wanted.has(attachment.publicId)) found.add(attachment.publicId);
        }
      }
    }
    return found;
  }
}
