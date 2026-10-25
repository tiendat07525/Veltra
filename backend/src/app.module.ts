import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ConversationModule } from './conversation/conversation.module';
import { MessageModule } from './messages/message.module';
import { FriendModule } from './friend/friend.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ThrottlerStorageRedisService } from './auth/throttler-storage-redis.service';
import { AppThrottlerGuard } from './auth/app-throttler.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: 60000,
            limit: 100, // 100 requests per minute default
          },
        ],
        storage: new ThrottlerStorageRedisService(config),
      }),
    }),
    MongooseModule.forRoot(process.env.MONGODB_URL!),
    UsersModule,
    AuthModule,
    ConversationModule,
    MessageModule,
    FriendModule,
    RealtimeModule,
  ],
  controllers: [AppController],
  providers: [
    ThrottlerStorageRedisService,
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
  ],
})
export class AppModule {}
