import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SuggestionDocument = HydratedDocument<Suggestion>;

@Schema({ collection: 'suggestions', timestamps: true })
export class Suggestion {
  @Prop({ required: true, maxlength: 200 })
  title!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ required: true })
  url!: string;

  @Prop({ default: '' })
  category!: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ default: 0 })
  order!: number;
}

export const SuggestionSchema = SchemaFactory.createForClass(Suggestion);

SuggestionSchema.index({ isActive: 1, order: 1 });
