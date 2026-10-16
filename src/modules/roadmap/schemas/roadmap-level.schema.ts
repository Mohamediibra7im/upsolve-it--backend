import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

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

  @Prop({ type: String, enum: ['all', 'specific_users'], default: 'all' })
  visibility!: 'all' | 'specific_users';

  @Prop({ type: [{ type: SchemaTypes.ObjectId, ref: 'User' }], default: [] })
  allowedUserIds!: Types.ObjectId[];

  @Prop({ default: 500 })
  levelBonusXp!: number;
}

export const RoadmapLevelSchema = SchemaFactory.createForClass(RoadmapLevel);
RoadmapLevelSchema.index({ orderIndex: 1 });
