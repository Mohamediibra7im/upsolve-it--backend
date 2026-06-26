import type { SpeedStatus } from './speed-status';

export function buildInsightAndRecommendation(input: {
  isSolved: boolean;
  speedStatus: SpeedStatus;
  problemRating: number;
  userRating: number;
  attempts: number;
}): { insightMessage: string; recommendation: string } {
  const { isSolved, speedStatus, problemRating, userRating, attempts } = input;

  if (isSolved && speedStatus === 'fast') {
    return {
      insightMessage:
        'You solved this faster than expected. This rating may be comfortable for you.',
      recommendation:
        'Keep pushing with slightly harder problems in this range.',
    };
  }

  if (isSolved && speedStatus === 'slow') {
    return {
      insightMessage:
        'You solved this, but it took longer than expected. Train speed on this rating range.',
      recommendation: 'Try timed practice on similar-rated problems.',
    };
  }

  if (!isSolved && problemRating <= userRating) {
    return {
      insightMessage:
        'This problem was within your current range. Add it to focused upsolving.',
      recommendation: 'Upsolve in a dedicated block and re-submit until AC.',
    };
  }

  if (!isSolved && problemRating > userRating) {
    return {
      insightMessage:
        'This problem was above your current level. Review the idea and try it again later.',
      recommendation: 'Read editorial, then revisit in a week.',
    };
  }

  if (isSolved && problemRating <= userRating - 300) {
    return {
      insightMessage: 'This problem was probably too easy for you.',
      recommendation: 'Bias the next session toward higher-rated problems.',
    };
  }

  if (!isSolved && attempts >= 3) {
    return {
      insightMessage:
        'Multiple failed attempts. Review the topic before retrying.',
      recommendation: 'Study the tag on a tutorial problem, then return.',
    };
  }

  if (isSolved) {
    return {
      insightMessage: 'Solid solve at a reasonable pace.',
      recommendation: 'Mix this rating with one step harder problems.',
    };
  }

  return {
    insightMessage: 'Keep pushing; every attempt builds pattern recognition.',
    recommendation: 'Add to upsolve and track progress on the queue.',
  };
}
