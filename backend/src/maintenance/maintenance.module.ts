import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { Message, MessageSchema } from 'src/messages/schemas/message.schema';
import { User, UserSchema } from 'src/users/schemas/user.schema';
import { CloudinaryService } from 'src/storage/cloudinary.service';
import {
  CLOUDINARY_ADMIN,
  CloudinaryAdmin,
  CloudinaryAsset,
  LIST_PAGE_SIZE,
  OrphanUploadsService,
} from './orphan-uploads.service';

/**
 * Small application context for maintenance commands (src/maintenance/cleanup-uploads.ts):
 * config, MongoDB and Cloudinary only. No Redis, no HTTP server, no socket gateway.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URL'),
        // Indexes belong to the app; a maintenance run never builds them
        autoIndex: false,
      }),
    }),
    MongooseModule.forFeature([
      { name: Message.name, schema: MessageSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [
    OrphanUploadsService,
    {
      provide: CLOUDINARY_ADMIN,
      inject: [ConfigService],
      useFactory: (config: ConfigService): CloudinaryAdmin => {
        const credentials = CloudinaryService.parseUrl(
          config.get<string>('CLOUDINARY_URL'),
        );
        if (!credentials) {
          throw new Error('CLOUDINARY_URL chưa được cấu hình');
        }
        cloudinary.config({
          cloud_name: credentials.cloudName,
          api_key: credentials.apiKey,
          api_secret: credentials.apiSecret,
          secure: true,
        });
        return {
          listResources: async (resourceType, prefix, nextCursor) =>
            (await cloudinary.api.resources({
              type: 'upload',
              resource_type: resourceType,
              prefix,
              max_results: LIST_PAGE_SIZE,
              ...(nextCursor ? { next_cursor: nextCursor } : {}),
            })) as { resources: CloudinaryAsset[]; next_cursor?: string },
          deleteResources: async (publicIds, resourceType) =>
            (await cloudinary.api.delete_resources(publicIds, {
              type: 'upload',
              resource_type: resourceType,
              invalidate: true,
            })) as { deleted: Record<string, string> },
        };
      },
    },
  ],
})
export class MaintenanceModule {}
