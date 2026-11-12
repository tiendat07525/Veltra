import { Module } from '@nestjs/common';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Conversation,
  ConversationSchema,
} from './schemas/conversation.schema';
import { Message, MessageSchema } from '../messages/schemas/message.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Friend, FriendSchema } from '../friend/schema/friend.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      // Read-only lookups when adding users to a group
      { name: User.name, schema: UserSchema },
      { name: Friend.name, schema: FriendSchema },
    ]),
  ],

  controllers: [ConversationController],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}
