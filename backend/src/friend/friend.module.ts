import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/users/schemas/user.schema';

import { Friend, FriendSchema } from './schema/friend.schema';
import { FriendRequest, FriendRequestSchema } from './schema/friend-request.schema';
import { FriendController } from './friend.controller';
import { FriendService } from './friend.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Friend.name,
        schema: FriendSchema,
      },
      {
        name: FriendRequest.name,
        schema: FriendRequestSchema,
      },

      {
        name: User.name,
        schema: UserSchema
      }
    ]),
  ],
  controllers: [FriendController],
  providers: [FriendService],
  exports: [FriendService],
})
export class FriendModule { }