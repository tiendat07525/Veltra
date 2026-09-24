import { ConflictException, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ConversationModule } from './conversation/conversation.module';
import { MessageModule } from './messages/message.module';
import { FriendModule } from './friend/friend.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(process.env.MONGODB_URL!),
    UsersModule,
    AuthModule,
    ConversationModule,
    MessageModule,
    FriendModule,
    RealtimeModule
  ],
  controllers: [AppController],
})
export class AppModule { }
