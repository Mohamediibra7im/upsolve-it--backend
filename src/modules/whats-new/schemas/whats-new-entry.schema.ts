import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WhatsNewEntryDocument = HydratedDocument<WhatsNewEntry>;

@Schema({ collection: 'whats_new_entries', timestamps: true })
export class WhatsNewEntry {
  @Prop({ required: true, maxlength: 200 })
  title!: string;

  @Prop({ required: true })
  content!: string;

  @Prop({ default: '' })
  version!: string;

  @Prop({ default: false })
  isPublished!: boolean;

  @Prop({ type: Date, default: null })
  publishedAt!: Date | null;
}

export const WhatsNewEntrySchema = SchemaFactory.createForClass(WhatsNewEntry);

WhatsNewEntrySchema.index({ isPublished: 1, publishedAt: -1 });
