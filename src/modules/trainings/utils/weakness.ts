export type TagAgg = { unsolvedCount: number; slowSolvedCount: number };

export function weakScore(agg: TagAgg): number {
  return agg.unsolvedCount * 2 + agg.slowSolvedCount;
}

export function topWeakTags(
  byTag: Map<string, TagAgg>,
  limit: number,
): { tag: string; score: number; unsolvedCount: number; slowSolvedCount: number }[] {
  return Array.from(byTag.entries())
    .map(([tag, v]) => ({
      tag,
      score: weakScore(v),
      unsolvedCount: v.unsolvedCount,
      slowSolvedCount: v.slowSolvedCount,
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
