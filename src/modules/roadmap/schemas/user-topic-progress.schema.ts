import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

export type UserTopicProgressDocument = HydratedDocument<UserTopicProgress>;

@Schema({ collection: 'user_topic_progress', timestamps: true })
export class UserTopicProgress {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'RoadmapTopic', required: true })
  topicId!: Types.ObjectId;

  @Prop({ type: Number, default: 0 })
  learningPct!: number;

  @Prop({ type: Number, default: 0 })
  problemPct!: number;

  @Prop({ type: Boolean, default: false })
  isTopicComplete!: boolean;

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  @Prop({ type: Boolean, default: false })
  topicBonusAwarded!: boolean;
}

export const UserTopicProgressSchema =
  SchemaFactory.createForClass(UserTopicProgress);
UserTopicProgressSchema.index({ userId: 1, topicId: 1 }, { unique: true });
