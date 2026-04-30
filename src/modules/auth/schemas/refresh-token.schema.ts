import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;

@Schema({ timestamps: true })
export class RefreshToken {
  @Prop({ required: true, unique: true, index: true })
  jti!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  token!: string; // hashed refresh token

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop()
  deviceInfo?: string;

  @Prop()
  ipAddress?: string;

  @Prop({ default: false, index: true })
  revoked!: boolean;

  @Prop()
  revokedAt?: Date;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
