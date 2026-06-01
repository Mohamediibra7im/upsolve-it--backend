import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RoadmapProblemDocument = HydratedDocument<RoadmapProblem>;

@Schema({ collection: 'roadmap_problems', timestamps: true })
export class RoadmapProblem {
  @Prop({ type: Types.ObjectId, ref: 'RoadmapSheet', required: true })
  sheetId!: Types.ObjectId;

  @Prop({ required: true })
  cfProblemId!: string;

  @Prop({ default: '' })
  title!: string;

  @Prop({ default: '' })
  difficulty!: string;

  @Prop({ required: true })
  orderIndex!: number;

  @Prop({ default: 10 })
  xpReward!: number;
}

export const RoadmapProblemSchema =
  SchemaFactory.createForClass(RoadmapProblem);
RoadmapProblemSchema.index({ sheetId: 1, orderIndex: 1 });
RoadmapProblemSchema.index({ sheetId: 1, cfProblemId: 1 }, { unique: true });
