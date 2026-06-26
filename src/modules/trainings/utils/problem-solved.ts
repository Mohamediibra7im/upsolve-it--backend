import type { TrainingProblemStored } from '../schemas/training.schema';

function coerceMs(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : null;
  }
  if (typeof v === 'object' && v !== null && 'toNumber' in v) {
    const n = (v as { toNumber: () => number }).toNumber();
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
  }
  if (v instanceof Date) return v.getTime();
  return null;
}

/** Plain object for reads from Mongoose subdocuments / lean docs. */
export function toPlainProblem(
  p: TrainingProblemStored | Record<string, unknown>,
): Record<string, unknown> {
  const raw = p as { toObject?: () => Record<string, unknown> };
  if (typeof raw.toObject === 'function') return raw.toObject();
  return { ...raw };
}

/**
 * Whether a problem counts as solved for summaries, review UI, and stats.
 * Avoids JS pitfalls: `Boolean(0)` is false but `solvedTime != null` is true for 0.
 * Normalizes Mongoose subdocs and BSON Long timestamps.
 */
export function isProblemMarkedSolved(
  p: TrainingProblemStored | Record<string, unknown>,
): boolean {
  const plain = toPlainProblem(p);
  if (plain.isSolved === true) return true;
  const t = coerceMs(plain.solvedAt) ?? coerceMs(plain.solvedTime);
  if (t == null) return false;
  return t > 0;
}
