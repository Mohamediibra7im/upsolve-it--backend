import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserVideoProgressDocument = HydratedDocument<UserVideoProgress>;

@Schema({ collection: 'user_video_progress', timestamps: true })
export class UserVideoProgress {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'RoadmapVideo', required: true })
  videoId!: Types.ObjectId;

  @Prop({ type: Number, default: 0 })
  watchPct!: number;

  @Prop({ type: Boolean, default: false })
  isThresholdMet!: boolean;

  @Prop({ type: Boolean, default: false })
  xpAwarded!: boolean;

  @Prop({ type: Number, default: 0 })
  lastPositionSec!: number;
}

export const UserVideoProgressSchema =
  SchemaFactory.createForClass(UserVideoProgress);
UserVideoProgressSchema.index({ userId: 1, videoId: 1 }, { unique: true });
