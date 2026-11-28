import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Conversation,
  ConversationSchema,
} from '../conversation/schemas/conversation.schema';
import { Friend, FriendSchema } from '../friend/schema/friend.schema';
import { MessageModule } from '../messages/message.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { UsersModule } from '../users/users.module';
import { CallController } from './call.controller';
import { CallGateway } from './call.gateway';
import { CallService } from './call.service';
import { CallStateService } from './call-state.service';
import { TurnService } from './turn.service';

@Module({
  imports: [
    // Read-only: the direct conversation and the friendship a call needs
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Friend.name, schema: FriendSchema },
    ]),
    RealtimeModule,
    // recordCall: the finished call as a message
    MessageModule,
    UsersModule,
  ],
  controllers: [CallController],
  providers: [CallService, CallStateService, TurnService, CallGateway],
})
export class CallModule {}
