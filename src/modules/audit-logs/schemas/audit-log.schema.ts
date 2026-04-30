import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'audit_logs'
})
export class AuditLog {
  @Prop({ required: true, index: true })
  action!: string; // e.g., 'User', 'Notification', 'Training'

  @Prop({ required: true, index: true })
  entity!: string; // e.g., 'User', 'Notification', 'Training'

  @Prop({ type: MongooseSchema.Types.ObjectId, refPath: 'entity', required: false })
  entityId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  performedBy!: Types.ObjectId;

  @Prop({ index: true })
  performedByHandle!: string;

  @Prop({ type: Object })
  details!: Record<string, any>;

  @Prop({ index: true })
  createdAt!: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Add compound index for common queries
AuditLogSchema.index({ entity: 1, action: 1 });
AuditLogSchema.index({ createdAt: -1 });
