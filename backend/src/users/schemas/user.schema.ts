import { Schema, Prop, SchemaFactory } from "@nestjs/mongoose";
import { trace } from "console";
import { HydratedDocument } from "mongoose";

export type UserDocument = HydratedDocument<User>;

@Schema({
    timestamps: true
})

export class User {
    @Prop({
        require: true,
        unique: true,
        trim: true,
        lowercase: true
    })
    username: string

    @Prop({
        required: true,
        unique: true,
        trim: true
    })
    password: string

    @Prop({
        require: true,
        unique: true,
        trim: true,
        lowercase: true
    })
    email: string

    @Prop({
        trim: true
    })
    displayName: string

    avatarUrl: string
    avatarId: string
    bio: string

    @Prop({
        trim: true,
        sparse: true
    })
    phone: string
}

export const UserSchema = SchemaFactory.createForClass(User);