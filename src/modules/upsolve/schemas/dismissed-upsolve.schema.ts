import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DismissedUpsolveDocument = HydratedDocument<DismissedUpsolve>;

/**
 * Tracks problems that a user has deliberately removed from their upsolve list.
 *
 * Without this record the auto-sync logic (which scans training-session history
 * for unsolved problems) would re-insert deleted problems on every page load,
 * causing the "delete doesn't stick" bug.
 *
 * A unique compound index on { user, contestId, index } prevents duplicates
 * and enables fast look-ups during sync.
 */
@Schema({ timestamps: false })
export class DismissedUpsolve {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user!: Types.ObjectId;

  @Prop({ required: true })
  contestId!: number;

  @Prop({ required: true })
  index!: string;

  @Prop({ default: Date.now })
  dismissedAt!: Date;
}

export const DismissedUpsolveSchema =
  SchemaFactory.createForClass(DismissedUpsolve);

// Ensure each user+problem combo is unique and look-ups are fast
DismissedUpsolveSchema.index(
  { user: 1, contestId: 1, index: 1 },
  { unique: true },
);
