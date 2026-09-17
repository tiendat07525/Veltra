import { HydratedDocument, Types } from "mongoose";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

export type FriendDocument = HydratedDocument<Friend>;

@Schema({timestamps: true})

export class Friend {
    @Prop({
        type: Types.ObjectId,
        ref: 'User',
        required: true,
    })
    user: Types.ObjectId;
    
    @Prop({
        type: Types.ObjectId,
        ref: 'User',
        required: true,
    })
    friend: Types.ObjectId;
}

export const FriendSchema = SchemaFactory.createForClass(Friend);

FriendSchema.pre('save', function(){
    const user = this.user.toString();
    const friend = this.friend.toString();
    if(user > friend){
        this.user = new Types.ObjectId(friend);
        this.friend = new Types.ObjectId(user);
    }
});
FriendSchema.index({user: 1, friend: 1}, {unique: true})