import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Message } from './schemas/message.schema';
import { MessageSchema } from './schemas/message.schema';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';
import { Conversation } from 'src/conversation/schemas/conversation.schema';
import { ConversationSchema } from 'src/conversation/schemas/conversation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema }
    ])
  ],

  controllers: [MessageController],
  providers: [MessageService],
  exports: [MessageService]
})
export class MessageModule { }
