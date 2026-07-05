export function makeProblemId(contestId: number, index: string): string {
  return `${contestId}_${index}`;
}

export function ensureProblemIds<
  T extends { contestId: number; index: string; problemId?: string },
>(problems: T[] | undefined): T[] {
  return (problems ?? []).map((p) => ({
    ...p,
    problemId: p.problemId || makeProblemId(p.contestId, p.index),
  }));
}
