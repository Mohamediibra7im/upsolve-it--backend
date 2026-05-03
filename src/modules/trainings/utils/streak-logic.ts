import { addUtcDays, toUtcDayKey } from './date-key';

export type StreakMutationInput = {
  currentStreak: number;
  bestStreak: number;
  lastActivityDayKey: string | null | undefined;
};

/**
 * When user completes an activity today (first completion today).
 * Rules: same UTC day does not increase twice; gap > 1 day resets to 1.
 */
export function applyActivityToStreak(
  input: StreakMutationInput,
  nowMs: number,
): { streak: number; best: number; lastDayKey: string } {
  const todayKey = toUtcDayKey(nowMs);
  const last = input.lastActivityDayKey;

  if (!last || last === '') {
    const streak = 1;
    return {
      streak,
      best: Math.max(input.bestStreak, streak),
      lastDayKey: todayKey,
    };
  }

  if (last === todayKey) {
    return {
      streak: input.currentStreak,
      best: Math.max(input.bestStreak, input.currentStreak),
      lastDayKey: todayKey,
    };
  }

  const yesterdayKey = addUtcDays(todayKey, -1);
  let next: number;
  if (last === yesterdayKey) {
    next = input.currentStreak + 1;
  } else {
    next = 1;
  }

  return {
    streak: next,
    best: Math.max(input.bestStreak, next),
    lastDayKey: todayKey,
  };
}
