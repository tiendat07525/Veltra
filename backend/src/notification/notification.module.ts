import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RealtimeModule } from 'src/realtime/realtime.module';
import { User, UserSchema } from 'src/users/schemas/user.schema';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({
  imports: [
    // notification:new / notification:read / notification:removed to the recipient
    RealtimeModule,
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      // Read-only: actor name / avatar in the payload
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
