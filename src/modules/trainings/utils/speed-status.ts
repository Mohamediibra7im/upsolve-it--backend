export type SpeedStatus = 'fast' | 'normal' | 'slow' | 'unsolved';

export function computeSpeedStatus(
  isSolved: boolean,
  timeSpentSeconds: number | null | undefined,
  expectedTimeSeconds: number,
): SpeedStatus {
  if (!isSolved) return 'unsolved';
  const t = timeSpentSeconds ?? 0;
  if (t <= 0) return 'normal';
  if (t > expectedTimeSeconds * 1.5) return 'slow';
  if (t < expectedTimeSeconds * 0.6) return 'fast';
  return 'normal';
}
