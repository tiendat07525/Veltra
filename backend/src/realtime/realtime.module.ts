import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { AuthModule } from 'src/auth/auth.module';
import { forwardRef } from '@nestjs/common';
import { UsersModule } from 'src/users/users.module';
import { ThrottlerStorageRedisService } from 'src/auth/throttler-storage-redis.service';

@Module({
  imports: [forwardRef(() => AuthModule), UsersModule],
  providers: [RealtimeGateway, RealtimeService, ThrottlerStorageRedisService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
