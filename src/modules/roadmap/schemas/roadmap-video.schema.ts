import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RoadmapVideoDocument = HydratedDocument<RoadmapVideo>;

@Schema({ collection: 'roadmap_videos', timestamps: true })
export class RoadmapVideo {
  @Prop({
    type: Types.ObjectId,
    ref: 'RoadmapTopic',
    required: true,
    unique: true,
  })
  topicId!: Types.ObjectId;

  @Prop({ default: '' })
  title!: string;

  @Prop({ required: true })
  youtubeUrl!: string;

  @Prop({ type: Number, default: null })
  durationSec!: number | null;
}

export const RoadmapVideoSchema = SchemaFactory.createForClass(RoadmapVideo);
