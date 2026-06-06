import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RoadmapProblemDocument = HydratedDocument<RoadmapProblem>;

@Schema({ collection: 'roadmap_problems', timestamps: true })
export class RoadmapProblem {
  @Prop({ type: Types.ObjectId, ref: 'RoadmapTopic', required: true })
  topicId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  url!: string;

  @Prop({ required: true })
  orderIndex!: number;

  @Prop({ required: true })
  xpReward!: number;

  @Prop({ default: '' })
  cfProblemId!: string;
}

export const RoadmapProblemSchema =
  SchemaFactory.createForClass(RoadmapProblem);
RoadmapProblemSchema.index({ topicId: 1, orderIndex: 1 });
RoadmapProblemSchema.index({ topicId: 1, cfProblemId: 1 });
