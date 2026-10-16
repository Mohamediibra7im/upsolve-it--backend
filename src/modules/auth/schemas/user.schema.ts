import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  codeforcesHandle!: string;

  @Prop({ required: true })
  password!: string;

  @Prop({ default: 0 })
  rating!: number;

  @Prop({ required: true })
  avatar!: string;

  @Prop({ default: 'Unrated' })
  rank!: string;

  @Prop({ default: 0 })
  maxRating!: number;

  @Prop({ default: 'Unrated' })
  maxRank!: string;

  @Prop()
  organization?: string;

  @Prop({ default: 0 })
  lastSyncTime!: number;

  @Prop({ enum: ['user', 'admin'], default: 'user' })
  role!: 'user' | 'admin';

  @Prop({ default: false })
  isVerified!: boolean;

  @Prop({ type: String, default: null })
  verificationCode!: string | null;

  @Prop({ type: Number, default: null })
  verificationCodeExpiry!: number | null;

  @Prop({ default: false })
  locked!: boolean;

  @Prop({ default: 0 })
  authVersion!: number;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Enforce case-insensitive uniqueness on codeforcesHandle
UserSchema.index(
  { codeforcesHandle: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);
