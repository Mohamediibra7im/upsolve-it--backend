/** UTC calendar day key for streak / consistency logic (YYYY-MM-DD). */
export function toUtcDayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function utcDayKeyToStartMs(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 0, 0, 0, 0);
}

export function addUtcDays(key: string, delta: number): string {
  const ms = utcDayKeyToStartMs(key) + delta * 86_400_000;
  return toUtcDayKey(ms);
}

/** Difference in whole UTC days between two timestamps (non-negative). */
export function utcDaysBetweenEarlierLater(
  earlierMs: number,
  laterMs: number,
): number {
  const a = toUtcDayKey(earlierMs);
  const b = toUtcDayKey(laterMs);
  const diff = (utcDayKeyToStartMs(b) - utcDayKeyToStartMs(a)) / 86_400_000;
  return Math.max(0, Math.round(diff));
}
