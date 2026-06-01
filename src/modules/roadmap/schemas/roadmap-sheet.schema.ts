import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RoadmapSheetDocument = HydratedDocument<RoadmapSheet>;

@Schema({ collection: 'roadmap_sheets', timestamps: true })
export class RoadmapSheet {
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
  cfGroupUrl!: string;

  @Prop({ default: '' })
  groupNote!: string;
}

export const RoadmapSheetSchema = SchemaFactory.createForClass(RoadmapSheet);
