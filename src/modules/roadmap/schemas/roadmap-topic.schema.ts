import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

export type RoadmapTopicDocument = HydratedDocument<RoadmapTopic>;

@Schema({ collection: 'roadmap_topics', timestamps: true })
export class RoadmapTopic {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'RoadmapLevel', required: true })
  levelId!: Types.ObjectId;

  @Prop({ required: true, maxlength: 200 })
  title!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ required: true })
  orderIndex!: number;

  @Prop({ type: [String], default: [] })
  subtopics!: string[];

  @Prop({ default: 80 })
  requiredLearningPct!: number;

  @Prop({ default: 60 })
  requiredProblemPct!: number;

  @Prop({ default: 100 })
  topicXpReward!: number;

  @Prop({ default: '' })
  groupLinks!: string;

  @Prop({ default: '' })
  groupNote!: string;
}

export const RoadmapTopicSchema = SchemaFactory.createForClass(RoadmapTopic);
RoadmapTopicSchema.index({ levelId: 1, orderIndex: 1 });
