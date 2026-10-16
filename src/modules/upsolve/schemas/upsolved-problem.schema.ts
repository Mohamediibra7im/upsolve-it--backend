import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

export type UpsolvedProblemDocument = HydratedDocument<UpsolvedProblem>;

@Schema({ timestamps: false })
export class UpsolvedProblem {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  user!: Types.ObjectId;

  @Prop({ required: true })
  contestId!: number;

  @Prop({ required: true })
  index!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  rating!: number;

  @Prop({ type: [String], required: true })
  tags!: string[];

  @Prop({ required: true })
  url!: string;

  @Prop({ type: Number, default: null })
  solvedTime!: number | null;

  @Prop({ default: Date.now })
  createdAt!: Date;
}

export const UpsolvedProblemSchema =
  SchemaFactory.createForClass(UpsolvedProblem);
UpsolvedProblemSchema.index(
  { user: 1, contestId: 1, index: 1 },
  { unique: true },
);
