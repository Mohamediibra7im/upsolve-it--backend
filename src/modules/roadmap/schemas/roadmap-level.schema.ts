import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RoadmapLevelDocument = HydratedDocument<RoadmapLevel>;

@Schema({ collection: 'roadmap_levels', timestamps: true })
export class RoadmapLevel {
  @Prop({ required: true, maxlength: 100 })
  title!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ required: true })
  orderIndex!: number;

  @Prop({ default: false })
  isPublished!: boolean;

  @Prop({ default: 80 })
  videoUnlockSheetPct!: number;

  @Prop({ default: 80 })
  sheetUnlockTopicPct!: number;

  @Prop({ default: 80 })
  levelCompletionPct!: number;

  @Prop({ default: 10 })
  xpPerAcceptedProblem!: number;
}

export const RoadmapLevelSchema = SchemaFactory.createForClass(RoadmapLevel);
RoadmapLevelSchema.index({ orderIndex: 1 });
