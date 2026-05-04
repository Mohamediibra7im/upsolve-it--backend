/**
 * Canonical 110 training levels (no external JSON). Target ratings interpolate 900→4050
 * then snap to 100-point steps (aligned with admin + ladder UI). Time steps up with level.
 * P1–P4 are derived on the client from performance.
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

const TARGET_BAND = 100;

/** 110 rows: ids 1..110, performance ~900..4050 on 100-point grid. */
export function getDefaultTrainingLevelDocs(): TrainingLevelSeedDoc[] {
  const out: TrainingLevelSeedDoc[] = [];
  for (let id = 1; id <= 110; id++) {
    const linear = Math.round(900 + (4050 - 900) * (id - 1) / 109);
    const performance = Math.max(
      800,
      Math.min(4050, Math.round(linear / TARGET_BAND) * TARGET_BAND),
    );
    out.push({
      seqId: id,
      levelLabel: String(id),
      time: timeForLevelId(id),
      performance,
    });
  }
  return out;
}
