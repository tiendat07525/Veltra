import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RealtimeModule } from 'src/realtime/realtime.module';
import { User, UserSchema } from 'src/users/schemas/user.schema';
import {
  Conversation,
  ConversationSchema,
} from 'src/conversation/schemas/conversation.schema';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [
    // settings:updated to the user's other tabs / devices
    RealtimeModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      // Read-only: membership check before muting a conversation
      { name: Conversation.name, schema: ConversationSchema },
    ]),
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
