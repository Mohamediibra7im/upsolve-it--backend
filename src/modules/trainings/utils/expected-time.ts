/** Expected solve time in seconds from problem rating (Upsolve.it rules). */
export function expectedTimeSecondsFromRating(rating: number): number {
  if (rating <= 1200) return 600; // 10 min
  if (rating <= 1600) return 1200; // 20 min (fills 1201-1299 per spec gap)
  if (rating <= 2000) return 1800; // 30 min
  if (rating <= 2400) return 2700; // 45 min
  return 3600; // 60 min
}
