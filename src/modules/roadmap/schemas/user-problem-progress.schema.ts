import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserProblemProgressDocument = HydratedDocument<UserProblemProgress>;

@Schema({ collection: 'user_problem_progress', timestamps: true })
export class UserProblemProgress {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'RoadmapProblem', required: true })
  problemId!: Types.ObjectId;

  @Prop({ type: Boolean, default: false })
  isSolved!: boolean;

  @Prop({ type: Date, default: null })
  solvedAt!: Date | null;

  @Prop({ type: Boolean, default: false })
  xpAwarded!: boolean;
}

export const UserProblemProgressSchema =
  SchemaFactory.createForClass(UserProblemProgress);
UserProblemProgressSchema.index({ userId: 1, problemId: 1 }, { unique: true });
UserProblemProgressSchema.index({ userId: 1, isSolved: 1 });
UserProblemProgressSchema.index({ userId: 1, isSolved: 1, solvedAt: 1 });
