/**
 * Shared learning-progress calculation used by both the unlock gate
 * (RoadmapProgressService.calculateLearningProgress) and the display value
 * (RoadmapPublicService.getTopicDetail). Keeping it in one place guarantees the
 * number the UI shows equals the number the gate enforces.
 *
 * Progress is normalized by the topic's TOTAL weight, so full completion always
 * equals 100% regardless of the absolute weight values an admin configured.
 * When no weights were set (all 0), resources are treated as equal-weight — this
 * is what repairs topics whose resources were created with the schema default
 * weight of 0 (which previously made learningPct a permanent 0 → never unlocked).
 */
export type LearningResource = { type: string; weight: number };
export type ResProgress = { watchPct?: number; isCompleted?: boolean };

export function computeLearningPct(
  resources: LearningResource[],
  progressFor: (index: number) => ResProgress | undefined,
): number {
  if (resources.length === 0) return 100; // no resources → instantly unlocked

  // Equal-weight fallback when weights were never configured (all 0/missing).
  const totalStored = resources.reduce((sum, r) => sum + (r.weight || 0), 0);
  const effWeight = (r: LearningResource) =>
    totalStored > 0 ? r.weight || 0 : 1;

  const totalWeight = resources.reduce((sum, r) => sum + effWeight(r), 0);
  if (totalWeight <= 0) return 100;

  let contribution = 0;
  resources.forEach((r, i) => {
    const prog = progressFor(i);
    if (!prog) return;
    const w = effWeight(r);
    if (r.type === 'Video') {
      contribution += w * ((prog.watchPct ?? 0) / 100);
    } else if (prog.isCompleted) {
      contribution += w;
    }
  });

  return Math.min(100, Math.round((contribution / totalWeight) * 100));
}
