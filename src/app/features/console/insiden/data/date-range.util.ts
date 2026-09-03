/**
 * Conversion helpers for the console links queue date-range filters.
 *
 * The controls are native `<input type="date">` (value `YYYY-MM-DD`, the same
 * "Created between" pattern as the spotting console), but the backend
 * `socialMediaLinks` resolver takes `createdAfter`/`createdBefore` as
 * `${DateTime}` — full ISO instants. Parsing the bare date string with an
 * explicit local day-boundary time keeps the user's calendar day meaningful
 * (a link posted 23:00 local still counts as "that day" in the user's
 * timezone); `.toISOString()` then converts it to the UTC instant the server
 * compares against `created` (stored as UTC).
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
