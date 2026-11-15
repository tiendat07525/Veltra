import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

// Per-user preferences (settings module). Read only through SettingsService:
// the whole object is `select: false`, so profiles and populates never include it.
@Schema({ _id: false })
export class NotificationSettings {
  // System notifications while the tab is hidden (the browser permission is separate)
  @Prop({ type: Boolean, default: true })
  browser: boolean;

  // Sound for new messages
  @Prop({ type: Boolean, default: true })
  sound: boolean;

  // No sound and no browser notifications at all (badges stay)
  @Prop({ type: Boolean, default: false })
  doNotDisturb: boolean;
}

export const NotificationSettingsSchema =
  SchemaFactory.createForClass(NotificationSettings);

@Schema({ _id: false })
export class ChatSettings {
  // Enter sends (Shift+Enter new line); false: Ctrl/Cmd+Enter sends, Enter new line
  @Prop({ type: Boolean, default: true })
  enterToSend: boolean;
}

export const ChatSettingsSchema = SchemaFactory.createForClass(ChatSettings);

export const MAX_MUTED_CONVERSATIONS = 500;

@Schema({ _id: false })
export class UserSettings {
  @Prop({ type: NotificationSettingsSchema, default: () => ({}) })
  notifications: NotificationSettings;

  @Prop({ type: ChatSettingsSchema, default: () => ({}) })
  chat: ChatSettings;

  // Conversations without sound / browser notifications, not counted in the badges.
  // Private to the user; ids of conversations they left may remain (harmless).
  @Prop({ type: [Types.ObjectId], ref: 'Conversation', default: [] })
  mutedConversationIds: Types.ObjectId[];
}

export const UserSettingsSchema = SchemaFactory.createForClass(UserSettings);

@Schema({
  timestamps: true,
})
export class User {
  @Prop({
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  })
  username: string;

  @Prop({
    required: true,
    trim: true,
    // Excluded from every query by default; only login selects it with '+password'
    select: false,
  })
  password: string;

  @Prop({
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  })
  email: string;

  @Prop({
    trim: true,
  })
  displayName: string;

  @Prop({
    trim: true,
  })
  avatarUrl: string;
  avatarId: string;

  @Prop({
    trim: true,
  })
  bio: string;

  @Prop({
    trim: true,
    sparse: true,
  })
  phone: string;

  @Prop({
    default: 'Offline',
    enum: ['Online', 'Offline', 'Unvailable'],
  })
  onlineStatus: string;

  lastSeen: Date;

  // Absent on users created before feature/user-settings: defaults are filled in when read
  @Prop({ type: UserSettingsSchema, default: () => ({}), select: false })
  settings?: UserSettings;
}

export const UserSchema = SchemaFactory.createForClass(User);
