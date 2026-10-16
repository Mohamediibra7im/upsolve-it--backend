import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

export type XpTransactionDocument = HydratedDocument<XpTransaction>;

@Schema({ collection: 'xp_transactions', timestamps: true })
export class XpTransaction {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Number, required: true })
  amount!: number;

  @Prop({ type: String, required: true, maxlength: 200 })
  reason!: string;

  @Prop({ type: String, required: true })
  sourceType!: string;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  sourceId!: Types.ObjectId;

  @Prop({ type: Object })
  reconciliation?: { preservedBalance: number; previousLedgerTotal: number };
}

export const XpTransactionSchema = SchemaFactory.createForClass(XpTransaction);
XpTransactionSchema.index(
  { userId: 1, sourceType: 1, sourceId: 1 },
  { unique: true },
);
XpTransactionSchema.index({ createdAt: -1 });
XpTransactionSchema.index({ userId: 1, createdAt: -1 });
