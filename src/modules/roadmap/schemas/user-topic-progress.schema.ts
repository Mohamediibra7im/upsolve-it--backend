import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserTopicProgressDocument = HydratedDocument<UserTopicProgress>;

@Schema({ collection: 'user_topic_progress', timestamps: true })
export class UserTopicProgress {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'RoadmapTopic', required: true })
  topicId!: Types.ObjectId;

  @Prop({ type: Number, default: 0 })
  videoPct!: number;

  @Prop({ type: Boolean, default: false })
  videoUnlockedSheet!: boolean;

  @Prop({ type: Number, default: 0 })
  sheetPct!: number;

  @Prop({ type: Boolean, default: false })
  sheetUnlockedNext!: boolean;

  @Prop({ type: Boolean, default: false })
  isTopicComplete!: boolean;

  @Prop({ type: Boolean, default: false })
  topicBonusAwarded!: boolean;
}

export const UserTopicProgressSchema =
  SchemaFactory.createForClass(UserTopicProgress);
UserTopicProgressSchema.index({ userId: 1, topicId: 1 }, { unique: true });
