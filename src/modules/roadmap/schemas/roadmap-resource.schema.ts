import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

export type RoadmapResourceDocument = HydratedDocument<RoadmapResource>;

@Schema({ collection: 'roadmap_resources', timestamps: true })
export class RoadmapResource {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'RoadmapTopic', required: true })
  topicId!: Types.ObjectId;

  @Prop({ required: true, maxlength: 200 })
  title!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ required: true, enum: ['Arabic', 'English'] })
  language!: 'Arabic' | 'English';

  @Prop({
    required: true,
    enum: [
      'Video',
      'Article',
      'Documentation',
      'Tutorial',
      'Course',
      'PDF',
      'Website',
    ],
  })
  type!:
    | 'Video'
    | 'Article'
    | 'Documentation'
    | 'Tutorial'
    | 'Course'
    | 'PDF'
    | 'Website';

  @Prop({ required: true })
  url!: string;

  @Prop({ type: Number, default: 0 })
  weight!: number;

  @Prop({ type: Number, default: 10 })
  xpReward!: number;

  @Prop({ type: Number, default: 80 })
  videoCompletionThresholdPct!: number;

  @Prop({ type: Number, required: true })
  orderIndex!: number;
}

export const RoadmapResourceSchema =
  SchemaFactory.createForClass(RoadmapResource);
RoadmapResourceSchema.index({ topicId: 1, orderIndex: 1 });
