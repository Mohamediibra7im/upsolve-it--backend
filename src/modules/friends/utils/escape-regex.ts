/** Escape a string for safe use inside a RegExp source (Mongo $regex). */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
