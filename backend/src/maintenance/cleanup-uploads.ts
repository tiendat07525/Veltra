/**
 * Deletes Cloudinary uploads no message references (see OrphanUploadsService).
 *
 *   npm run cleanup:uploads              # dry run: lists what would be deleted
 *   npm run cleanup:uploads -- --apply   # deletes (veltra-cleanup-uploads.timer on the VM)
 *
 * Reads MONGODB_URL and CLOUDINARY_URL from backend/.env. Exit code 1 on error or when a
 * delete failed. Never prints credentials.
 */
import { NestFactory } from '@nestjs/core';
import { MaintenanceModule } from './maintenance.module';
import { OrphanUploadsService } from './orphan-uploads.service';

const MB = 1024 * 1024;

async function main() {
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(MaintenanceModule, {
    logger: ['error', 'warn'],
  });
  try {
    const report = await app.get(OrphanUploadsService).run({ apply });
    const bytes = report.orphans.reduce((sum, o) => sum + o.bytes, 0);
    for (const orphan of report.orphans) {
      console.log(
        `${apply ? 'delete' : 'would delete'} ${orphan.resourceType} ${orphan.publicId} (${orphan.createdAt})`,
      );
    }
    console.log(
      [
        `mode=${apply ? 'apply' : 'dry-run'}`,
        `scanned=${report.scanned}`,
        `ignored=${report.ignored}`,
        `recent=${report.recent}`,
        `referenced=${report.referenced}`,
        `orphans=${report.orphans.length} (${(bytes / MB).toFixed(1)} MB)`,
        `deferred=${report.deferred}`,
        ...(apply
          ? [
              `deleted=${report.deleted}`,
              `notFound=${report.notFound}`,
              `failed=${report.failed.length}`,
            ]
          : []),
      ].join(' '),
    );
    for (const id of report.failed) console.error(`failed ${id}`);
    if (report.failed.length > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  console.error(
    `cleanup-uploads: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exitCode = 1;
});
