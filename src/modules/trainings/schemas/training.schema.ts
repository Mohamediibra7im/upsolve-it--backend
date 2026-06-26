import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TrainingDocument = HydratedDocument<Training>;

export type TrainingMode =
  | 'ladder'
  | 'weakness'
  | 'speed'
  | 'contest'
  | 'endurance';

export type TrainingStatus = 'active' | 'completed' | 'abandoned';

export type TrainingProblemStored = {
  problemId: string;
  contestId: number;
  index: string;
  name: string;
  rating: number;
  tags: string[];
  url: string;
  startedAt?: number | null;
  solvedAt?: number | null;
  timeSpentSeconds?: number | null;
  expectedTimeSeconds?: number | null;
  speedStatus?: 'fast' | 'normal' | 'slow' | 'unsolved';
  attempts?: number;
  isSolved?: boolean;
  insightMessage?: string;
  recommendation?: string;
  /** Legacy field: AC timestamp ms */
  solvedTime?: number | null;
};

const ProblemShape = {
  problemId: { type: String, required: true },
  contestId: { type: Number, required: true },
  index: { type: String, required: true },
  name: { type: String, required: true },
  rating: { type: Number, required: true },
  tags: { type: [String], default: [] },
  url: { type: String, required: true },
  startedAt: { type: Number, default: null },
  solvedAt: { type: Number, default: null },
  timeSpentSeconds: { type: Number, default: null },
  expectedTimeSeconds: { type: Number, default: null },
  speedStatus: {
    type: String,
    enum: ['fast', 'normal', 'slow', 'unsolved'],
    default: 'unsolved',
  },
  attempts: { type: Number, default: 0 },
  isSolved: { type: Boolean, default: false },
  insightMessage: { type: String, default: '' },
  recommendation: { type: String, default: '' },
  solvedTime: { type: Number, default: null },
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
      P1: { type: Number, required: false },
      P2: { type: Number, required: false },
      P3: { type: Number, required: false },
      P4: { type: Number, required: false },
      P5: { type: Number, required: false },
      P6: { type: Number, required: false },
      P7: { type: Number, required: false },
      P8: { type: Number, required: false },
    },
    required: false,
    _id: false,
  })
  customRatings?: {
    P1?: number;
    P2?: number;
    P3?: number;
    P4?: number;
    P5?: number;
    P6?: number;
    P7?: number;
    P8?: number;
  };

  @Prop({ type: [ProblemShape], default: [] })
  problems!: TrainingProblemStored[];

  @Prop({ required: true })
  performance!: number;

  @Prop({
    type: String,
    enum: ['ladder', 'weakness', 'speed', 'contest', 'endurance'],
    default: 'ladder',
  })
  trainingMode!: TrainingMode;

  @Prop({ type: String, default: '' })
  level!: string;

  @Prop({ type: Number, default: 120 })
  durationMinutes!: number;

  @Prop({
    type: String,
    enum: ['active', 'completed', 'abandoned'],
    default: 'completed',
  })
  status!: TrainingStatus;

  @Prop({ type: Number, default: 0 })
  solvedCount!: number;

  @Prop({ type: Boolean, default: false })
  reviewGenerated!: boolean;

  @Prop({ type: Boolean, default: true })
  showRatings!: boolean;

  @Prop({ type: [String], default: [] })
  tagsFilter!: string[];

  @Prop({ type: Boolean, default: false })
  weaknessFallback!: boolean;
}

export const TrainingSchema = SchemaFactory.createForClass(Training);
