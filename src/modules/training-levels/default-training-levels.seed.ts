/**
 * Canonical 110 training levels (no external JSON). Target rating is linear 900–4050;
 * session time steps up with level. P1–P4 are derived on the client from performance.
 */
export type TrainingLevelSeedDoc = {
  seqId: number;
  levelLabel: string;
  time: string;
  performance: number;
};

function timeForLevelId(id: number): string {
  if (id >= 100) return '180';
  if (id >= 90) return '150';
  if (id >= 80) return '140';
  if (id >= 64) return '130';
  if (id >= 60) return '125';
  return '120';
}

/** 110 rows: ids 1..110, performance 900..4050 (inclusive endpoints, linear). */
export function getDefaultTrainingLevelDocs(): TrainingLevelSeedDoc[] {
  const out: TrainingLevelSeedDoc[] = [];
  for (let id = 1; id <= 110; id++) {
    const performance = Math.round(900 + (4050 - 900) * (id - 1) / 109);
    out.push({
      seqId: id,
      levelLabel: String(id),
      time: timeForLevelId(id),
      performance,
    });
  }
  return out;
}
