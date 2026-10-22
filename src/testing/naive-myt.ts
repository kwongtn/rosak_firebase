/**
 * Spec fixtures for the timestamps the API really sends (`USE_TZ = False`,
 * `TIME_ZONE = Asia/Kuala_Lumpur`): wall time with no `Z` and no offset. A `Z` fixture passes in
 * every zone and hides the 8-hour bugs a naive string shows, so date specs build theirs here.
 */

/** `naiveMyt("2026-10-01", "05:23:15", 833490)` is `2026-10-01T05:23:15.833490`; the time defaults
 * to midnight and the microseconds are only written when given, as the API does. */
export function naiveMyt(day: string, time = "00:00:00", micros?: number): string {
  return `${day}T${time}${micros === undefined ? "" : `.${String(micros).padStart(6, "0")}`}`;
}

/** The instant a naive Kuala Lumpur wall time names (fixed UTC+8, no DST), for `vi.setSystemTime`. */
export function mytInstant(day: string, time = "00:00:00"): Date {
  return new Date(`${naiveMyt(day, time)}+08:00`);
}

/** The zones a date spec runs in: UTC is the SSR server's, Kuala Lumpur the riders' browsers'. */
export const SPEC_ZONES = ["UTC", "Asia/Kuala_Lumpur"] as const;
