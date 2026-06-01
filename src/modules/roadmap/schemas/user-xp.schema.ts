import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserXpDocument = HydratedDocument<UserXp>;

@Schema({ collection: 'user_xp', timestamps: true })
export class UserXp {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId!: Types.ObjectId;

  @Prop({ type: Number, default: 0 })
  totalXp!: number;
}

export const UserXpSchema = SchemaFactory.createForClass(UserXp);
