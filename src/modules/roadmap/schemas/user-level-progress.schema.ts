import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

export type UserLevelProgressDocument = HydratedDocument<UserLevelProgress>;

@Schema({ collection: 'user_level_progress', timestamps: true })
export class UserLevelProgress {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'RoadmapLevel', required: true })
  levelId!: Types.ObjectId;

  @Prop({ type: Number, default: 0 })
  topicsCompletePct!: number;

  @Prop({ type: Boolean, default: false })
  isLevelComplete!: boolean;

  @Prop({ type: Date, default: null })
  unlockedAt!: Date | null;

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  @Prop({ type: Boolean, default: false })
  levelBonusAwarded!: boolean;
}

export const UserLevelProgressSchema =
  SchemaFactory.createForClass(UserLevelProgress);
UserLevelProgressSchema.index({ userId: 1, levelId: 1 }, { unique: true });
