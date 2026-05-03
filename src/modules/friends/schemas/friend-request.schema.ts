import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type FriendRequestDocument = HydratedDocument<FriendRequest>;

@Schema({ timestamps: true })
export class FriendRequest {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  fromUser!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  toUser!: Types.ObjectId;

  @Prop({ enum: ['pending', 'accepted', 'declined'], default: 'pending' })
  status!: 'pending' | 'accepted' | 'declined';
}

export const FriendRequestSchema = SchemaFactory.createForClass(FriendRequest);

FriendRequestSchema.index({ fromUser: 1, toUser: 1 }, { unique: true });
FriendRequestSchema.index({ toUser: 1, status: 1 });
FriendRequestSchema.index({ fromUser: 1, status: 1 });
