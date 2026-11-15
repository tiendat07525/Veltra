import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { AuthModule } from 'src/auth/auth.module';
import { forwardRef } from '@nestjs/common';
import { UsersModule } from 'src/users/users.module';
import { ThrottlerStorageRedisService } from 'src/auth/throttler-storage-redis.service';
import { MongooseModule } from '@nestjs/mongoose';
import { PresenceService } from './presence.service';
import { Friend, FriendSchema } from 'src/friend/schema/friend.schema';
import {
  Conversation,
  ConversationSchema,
} from 'src/conversation/schemas/conversation.schema';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    UsersModule,
    // Read-only: presence audience (friends + co-members) and typing membership checks
    MongooseModule.forFeature([
      { name: Friend.name, schema: FriendSchema },
      { name: Conversation.name, schema: ConversationSchema },
    ]),
  ],
  providers: [
    RealtimeGateway,
    RealtimeService,
    ThrottlerStorageRedisService,
    PresenceService,
  ],
  exports: [RealtimeService],
})
export class RealtimeModule {}
