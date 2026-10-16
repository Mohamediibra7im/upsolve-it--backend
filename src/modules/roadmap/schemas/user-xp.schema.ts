import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

export type UserXpDocument = HydratedDocument<UserXp>;

@Schema({ collection: 'user_xp', timestamps: true })
export class UserXp {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  userId!: Types.ObjectId;

  @Prop({ type: Number, default: 0, index: true })
  totalXp!: number;
}

export const UserXpSchema = SchemaFactory.createForClass(UserXp);

// Compound index for rank-calculation: countDocuments({ totalXp: { $gt: N } })
UserXpSchema.index({ totalXp: -1 });
