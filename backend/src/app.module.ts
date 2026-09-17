import { ConflictException, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { Conversation } from './conversation/schemas/conversation.schema';
import { MessageModule } from './messages/message.module';
import { FriendModule } from './friend/friend.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(process.env.MONGODB_URL!),
    UsersModule,
    AuthModule,
    Conversation,
    MessageModule,
    FriendModule
  ],
  controllers: [AppController],
})
export class AppModule { }
