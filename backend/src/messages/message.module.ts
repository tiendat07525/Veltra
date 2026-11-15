import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Message } from './schemas/message.schema';
import { MessageSchema } from './schemas/message.schema';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';
import { Conversation } from 'src/conversation/schemas/conversation.schema';
import { ConversationSchema } from 'src/conversation/schemas/conversation.schema';
import { RealtimeModule } from 'src/realtime/realtime.module';
import { AttachmentService } from './attachment.service';
import { ConversationModule } from 'src/conversation/conversation.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    RealtimeModule,
    // findOrCreateDirect when sending to a receiverId
    ConversationModule,
  ],

  controllers: [MessageController],
  providers: [MessageService, AttachmentService],
  exports: [MessageService],
})
export class MessageModule {}
