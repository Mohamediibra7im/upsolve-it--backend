import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

export type PasswordResetChallengeDocument =
  HydratedDocument<PasswordResetChallenge>;

@Schema({ collection: 'password_reset_challenges', timestamps: true })
export class PasswordResetChallenge {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  authVersion!: number;

  @Prop({ required: true })
  codeHash!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  resetExpiresAt!: Date | null;

  @Prop({ type: Date, default: null })
  consumedAt!: Date | null;

  @Prop({ required: true })
  cleanupAt!: Date;
}

export const PasswordResetChallengeSchema = SchemaFactory.createForClass(
  PasswordResetChallenge,
);
PasswordResetChallengeSchema.index({ cleanupAt: 1 }, { expireAfterSeconds: 0 });
