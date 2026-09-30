import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type FriendRequestDocument = HydratedDocument<FriendRequest>;

@Schema({ timestamps: true })
export class FriendRequest {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  from: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  to: Types.ObjectId;

  @Prop({
    type: String,
    maxLength: 300,
    trim: true,
  })
  message?: string;

  @Prop({
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending',
  })
  status: 'pending' | 'accepted' | 'rejected';

  @Prop({
    type: String,
    required: true,
  })
  pairKey: string;
}

export const FriendRequestSchema = SchemaFactory.createForClass(FriendRequest);

FriendRequestSchema.pre('validate', function (next: any) {
  if (this.from && this.to) {
    const fromStr = this.from.toString();
    const toStr = this.to.toString();
    this.pairKey =
      fromStr < toStr ? `${fromStr}_${toStr}` : `${toStr}_${fromStr}`;
  }
  next();
});

FriendRequestSchema.index({ pairKey: 1 }, { unique: true });
FriendRequestSchema.index({ from: 1, to: 1 }, { unique: true });
FriendRequestSchema.index({ to: 1 });
FriendRequestSchema.index({ from: 1 });
