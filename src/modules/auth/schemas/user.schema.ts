import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, index: true })
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
}

export const UserSchema = SchemaFactory.createForClass(User);
