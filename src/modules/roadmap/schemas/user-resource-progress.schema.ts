import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

export type UserResourceProgressDocument =
  HydratedDocument<UserResourceProgress>;

@Schema({ collection: 'user_resource_progress', timestamps: true })
export class UserResourceProgress {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'RoadmapResource', required: true })
  resourceId!: Types.ObjectId;

  @Prop({ type: Boolean, default: false })
  isCompleted!: boolean;

  @Prop({ type: Number, default: 0 })
  watchPct!: number;

  @Prop({ type: Number, default: 0 })
  lastPositionSec!: number;

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  @Prop({ type: Boolean, default: false })
  xpAwarded!: boolean;
}

export const UserResourceProgressSchema =
  SchemaFactory.createForClass(UserResourceProgress);
UserResourceProgressSchema.index(
  { userId: 1, resourceId: 1 },
  { unique: true },
);
