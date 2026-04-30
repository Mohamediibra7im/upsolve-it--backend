import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TrainingDocument = HydratedDocument<Training>;

export type TrainingProblem = {
  contestId: number;
  index: string;
  name: string;
  rating: number;
  tags: string[];
  url: string;
  solvedTime?: number | null;
};

@Schema({ timestamps: true })
export class Training {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user!: Types.ObjectId;

  @Prop({ required: true })
  startTime!: number;

  @Prop({ required: true })
  endTime!: number;

  @Prop({
    type: {
      P1: { type: Number, required: true },
      P2: { type: Number, required: true },
      P3: { type: Number, required: true },
      P4: { type: Number, required: true },
    },
    required: true,
  })
  customRatings!: { P1: number; P2: number; P3: number; P4: number };

  @Prop({
    type: [
      {
        contestId: Number,
        index: String,
        name: String,
        rating: Number,
        tags: [String],
        url: String,
        solvedTime: Number,
      },
    ],
    default: [],
  })
  problems!: TrainingProblem[];

  @Prop({ required: true })
  performance!: number;
}

export const TrainingSchema = SchemaFactory.createForClass(Training);
