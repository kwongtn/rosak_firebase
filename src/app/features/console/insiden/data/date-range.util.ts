/**
 * Conversion helpers for the console links queue date-range filters.
 *
 * The controls are native `<input type="date">` (value `YYYY-MM-DD`, the same
 * "Occurred between" pattern as the spotting console), but the backend
 * `socialMediaLinks` resolver takes `occurredAfter`/`occurredBefore` as
 * `${DateTime}` — full ISO instants. Parsing the bare date string with an
 * explicit local day-boundary time keeps the user's calendar day meaningful
 * (a link that occurred at 23:00 local still counts as "that day" in the user's
 * timezone); `.toISOString()` then emits that instant unambiguously.
 *
 * ⚠️ `.toISOString()` is safe HERE and unsafe in
 * features/insiden/data/link-occurred-at.util.ts, and the difference is the INPUT, not the
 * function. Here `new Date("<date>T00:00:00")` is an AWARE `Date` the browser has already
 * resolved in the viewer's zone, so `.toISOString()` is the lossless `DateTime` spelling of an
 * instant that exists — there is no local wall-time value being re-expressed, so nothing can be
 * shifted by the 8 hours between Asia/Kuala_Lumpur and UTC. The link form starts from the
 * opposite end: a NAIVE string the backend's `USE_TZ = False` column stores verbatim, where the
 * same call would move the stored value by 8 hours.
 *
 * Note what the server does NOT do: `get_social_media_links` is a bare
 * `queryset.filter(occurred_at__gte=…)` with no conversion of its own, so what leaves this file
 * is exactly what the ORM receives. Do not "fix" the value here to compensate for a conversion
 * nobody performs — convert once, in the browser, where the viewer's zone is known.
 */
export function dateInputToIsoStart(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

/** End of the picked local day (23:59:59.999) so a `to` date is inclusive. */
export function dateInputToIsoEnd(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(`${value}T23:59:59.999`);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}
