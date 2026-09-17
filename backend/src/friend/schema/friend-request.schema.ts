import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type FriendRequestDocument = HydratedDocument<FriendRequest>

@Schema({timestamps: true})

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
        enum: ["pending", "accepted", "rejected"],
        default: "pending",
    })
    status: "pending" | "accepted" | "rejected";
}

export const FriendRequestSchema = SchemaFactory.createForClass(FriendRequest)

FriendRequestSchema.index({from: 1, to: 1}, {unique: true})
FriendRequestSchema.index({to: 1})
FriendRequestSchema.index({from: 1})
