/**
 * Determines whether two commit hashes refer to the same commit,
 * handling short (7-char) vs full (40-char) representations.
 * Returns true if strings are identical or one is a prefix of the other.
 */
export function isSameCommit(a: string, b: string): boolean {
  return a === b || a.startsWith(b) || b.startsWith(a);
}
