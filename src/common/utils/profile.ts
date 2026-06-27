export function shouldSyncProfile(lastSyncTime?: number): boolean {
  if (!lastSyncTime) return true;
  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  return now - lastSyncTime >= twentyFourHours;
}
