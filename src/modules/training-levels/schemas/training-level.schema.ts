import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'training_levels', timestamps: true })
export class TrainingLevel {
  /** Stable level index (matches seed row id, 1…110). */
  @Prop({ required: true, unique: true })
  seqId!: number;

  @Prop({ required: true })
  levelLabel!: string;

  @Prop({ required: true })
  time!: string;

  /** Target rating for ladder distribution (P1–P4 are derived on the client). */
  @Prop({ required: true })
  performance!: number;
}

export type TrainingLevelDocument = HydratedDocument<TrainingLevel>;
export const TrainingLevelSchema = SchemaFactory.createForClass(TrainingLevel);
// Note: seqId index is already created by the `unique: true` property decorator.
// A manual `.index({ seqId: 1 })` call was removed to fix a duplicate-index warning.

