import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ContactMessageDocument = HydratedDocument<ContactMessage>;

@Schema({ _id: false })
export class ContactReply {
  @Prop({ required: true })
  message!: string;

  @Prop({ required: true })
  sentAt!: Date;

  @Prop({ required: true })
  from!: string;

  @Prop({ required: true })
  to!: string;

  @Prop({ required: true })
  messageId!: string;
}

const ContactReplySchema = SchemaFactory.createForClass(ContactReply);

@Schema({ timestamps: true })
export class ContactMessage {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  email!: string;

  @Prop({ required: true })
  subject!: string;

  @Prop({ required: true })
  message!: string;

  @Prop({ default: 'general' })
  category!: string;

  @Prop({ default: false })
  read!: boolean;

  @Prop({ type: [ContactReplySchema], default: [] })
  replies!: ContactReply[];
}

export const ContactMessageSchema =
  SchemaFactory.createForClass(ContactMessage);
