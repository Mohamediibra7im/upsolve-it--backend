import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

export type FriendshipDocument = HydratedDocument<Friendship>;

@Schema({ timestamps: true })
export class Friendship {
  /** Lexicographically smaller user ObjectId hex among the pair */
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userLower!: Types.ObjectId;

  /** Lexicographically larger user ObjectId hex among the pair */
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userHigher!: Types.ObjectId;
}

export const FriendshipSchema = SchemaFactory.createForClass(Friendship);

FriendshipSchema.index({ userLower: 1, userHigher: 1 }, { unique: true });
