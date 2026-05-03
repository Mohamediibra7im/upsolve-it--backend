/**
 * Codeforces handles: 3–24 chars, Latin letters, digits, period, underscore.
 * @see https://codeforces.com/ profile URLs and registration rules.
 */
const CF_HANDLE_PATTERN = /^[a-zA-Z0-9._]{3,24}$/;

/**
 * Normalize user input to a candidate handle: trim, strip leading @,
 * extract handle from a Codeforces profile URL if pasted.
 */
export function normalizeCodeforcesHandleInput(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('@')) {
    s = s.slice(1).trim();
  }
  const profileMatch = s.match(/codeforces\.com\/profile\/([^/?#\s]+)/i);
  if (profileMatch) {
    try {
      s = decodeURIComponent(profileMatch[1]);
    } catch {
      s = profileMatch[1];
    }
  }
  return s.trim();
}

export function isValidCodeforcesHandleFormat(handle: string): boolean {
  return CF_HANDLE_PATTERN.test(handle);
}
