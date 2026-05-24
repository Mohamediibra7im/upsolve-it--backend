import type { TrainingProblemStored } from '../schemas/training.schema';
import { isProblemMarkedSolved } from './problem-solved';

const RATING_KEYS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'] as const;

function getExpectedSolveProb(
  userRating: number,
  problemRating: number,
): number {
  const ratingDiff = problemRating - userRating;
  return 1 / (1 + Math.pow(10, ratingDiff / 400));
}

function getTimeFactor(solveTime: number, contestDuration: number): number {
  if (solveTime <= 0) return 1;
  const timeRatio = solveTime / contestDuration;
  if (timeRatio <= 0.1) return 1.03;
  if (timeRatio <= 0.4) return 1.01;
  if (timeRatio <= 0.8) return 1.0;
  return 0.97;
}

function solvePerformanceToRating(
  problemRating: number,
  expectedProb: number,
  actualSolved: boolean,
  timeFactor: number,
): number {
  if (actualSolved) {
    const difficultyBonus = Math.max(0, (1 - expectedProb) * 100);
    return (problemRating + difficultyBonus) * timeFactor;
  }
  const difficultyPenalty = expectedProb * 100;
  return (problemRating - difficultyPenalty) * timeFactor;
}

type CustomR = {
  P1?: number;
  P2?: number;
  P3?: number;
  P4?: number;
  P5?: number;
  P6?: number;
  P7?: number;
  P8?: number;
};

function problemRatingAt(
  p: TrainingProblemStored,
  index: number,
  customRatings: CustomR | undefined,
): number {
  if (p.rating != null && p.rating > 0) return p.rating;
  const k = RATING_KEYS[index];
  if (k && customRatings && customRatings[k] != null) return customRatings[k];
  return 1500;
}

function isSolved(p: TrainingProblemStored): boolean {
  return isProblemMarkedSolved(p);
}

function solveTimeMinutes(
  p: TrainingProblemStored,
  startTime: number,
): number | null {
  if (!isSolved(p)) return null;
  const t = p.solvedAt ?? p.solvedTime;
  if (t == null) return null;
  return (t - startTime) / 60000;
}

export function computeSessionPerformance(
  input: {
    startTime: number;
    endTime: number;
    customRatings?: CustomR;
    problems: TrainingProblemStored[];
  },
  userRating: number,
): number {
  const contestDuration = Math.max(
    1,
    (input.endTime - input.startTime) / 60000,
  );

  let total = 0;
  let count = 0;
  const problems = input.problems ?? [];

  for (let i = 0; i < problems.length; i++) {
    const p = problems[i];
    const rating = problemRatingAt(p, i, input.customRatings);
    const solved = isSolved(p);
    const st = solveTimeMinutes(p, input.startTime);
    const expectedProb = getExpectedSolveProb(userRating, rating);
    const timeFactor =
      solved && st != null ? getTimeFactor(st, contestDuration) : 1;
    total += solvePerformanceToRating(rating, expectedProb, solved, timeFactor);
    count++;
  }

  const averagePerformance = count > 0 ? total / count : userRating;
  const solvedCount = problems.filter((p) => isSolved(p)).length;
  const solveRatio = count > 0 ? solvedCount / count : 1;
  let finalPerformance = averagePerformance;
  if (solveRatio < 1.0) {
    finalPerformance = averagePerformance - (1 - solveRatio) * 150;
  }
  finalPerformance = Math.max(600, Math.min(3500, finalPerformance));
  return Math.round(finalPerformance);
}

/**
 * Mean effective problem rating per slot (same sources as computeSessionPerformance).
 * Use when sessions omit customRatings but problems have rating populated.
 */
export function averageEffectiveProblemRatingForSession(
  customRatings: CustomR | undefined,
  problems: TrainingProblemStored[],
): number {
  const list = problems ?? [];
  if (list.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < list.length; i++) {
    sum += problemRatingAt(list[i], i, customRatings);
  }
  return sum / list.length;
}
