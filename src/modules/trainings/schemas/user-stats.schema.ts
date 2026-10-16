import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

export type UserStatsDocument = HydratedDocument<UserStats>;

@Schema({ timestamps: true })
export class UserStats {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  })
  user!: Types.ObjectId;

  @Prop({ default: 0 })
  trainingStreak!: number;

  @Prop({ default: 0 })
  upsolveStreak!: number;

  @Prop({ default: 0 })
  bestTrainingStreak!: number;

  @Prop({ default: 0 })
  bestUpsolveStreak!: number;

  @Prop({ default: 0 })
  consistencyScore!: number;

  @Prop({ type: String, default: null })
  lastTrainingActivityDate!: string | null;

  @Prop({ type: String, default: null })
  lastUpsolveActivityDate!: string | null;

  /** UTC day keys (YYYY-MM-DD) for recent activity; trimmed server-side */
  @Prop({ type: [String], default: [] })
  activeDays!: string[];
}

export const UserStatsSchema = SchemaFactory.createForClass(UserStats);
