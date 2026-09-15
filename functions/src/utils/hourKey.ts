/**
 * Rate-limit hour bucket key, per spec: `YYYY-MM-DD-HH` (UTC).
 * e.g. 2026-09-03T14:30:00Z -> "2026-09-03-14"
 */
export function formatHourKey(date: Date): string {
  return date.toISOString().slice(0, 13).replace("T", "-");
}
