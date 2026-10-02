/**
 * Conversion between a social-media link's `occurredAt` instant and the value a
 * `<input type="datetime-local">` control holds.
 *
 * ## Why this module exists at all
 *
 * `<input type="datetime-local">` deals in *naive local wall time* (`YYYY-MM-DDTHH:mm`, no
 * offset, no zone) — that is a property of the control, not of the backend. The backend also
 * stores naive local wall time: `rosak_backend` runs `USE_TZ = False` with
 * `TIME_ZONE = Asia/Kuala_Lumpur`, so every `DateTimeField` is a naive local value and
 * Strawberry serialises it with **no offset** (see MISTAKES.md, the 2026-09-30
 * `insiden/link-occurred-at` entry — the naive wall-time trap; cite the heading, not a
 * line number, because entries move as the file grows). So on this particular field the
 * control's wall time and the server's wall time are the same clock, and the correct
 * conversion is a pure string reformat.
 *
 * ## The one rule that decides everything here
 *
 * NEVER round-trip through `new Date(iso).toISOString()` (or `.getTime()`, or `Date.parse` +
 * a UTC formatter). That converts to UTC and shifts the value by 8 hours (Asia/Kuala_Lumpur is
 * UTC+8, no DST), which is the classic way this feature ships a "why is every timestamp 8 hours
 * off" bug. Both functions below parse and format by hand; `Date` is used only to *read* the
 * viewer's own clock (see `isoToOccurredAtInput`), never to *write* an instant.
 *
 * ## How the reading half gets the timezone right without any shifting
 *
 * `isoToOccurredAtInput` deliberately uses `new Date(iso)` plus the **local** getters. That is
 * correct for both shapes the API can produce, and correct for the wrong reason in one of them:
 *
 *   - Naive ISO (`"2026-09-30T14:05:00"`, what the backend sends): ES2015+ date-time forms
 *     without an offset are parsed as LOCAL time, and the local getters read back the same
 *     fields — so the wall time passes through UNCHANGED. That is the point: the server's wall
 *     time is preserved, not converted.
 *   - Offset ISO (`"2026-09-30T14:05:00+00:00"`, a legacy row or any other producer): the
 *     offset is real information, so the instant is resolved and rendered in the viewer's zone —
 *     which is the only correct thing to show someone whose clock is not UTC.
 *
 * The mirror-image function `occurredAtInputToIso` is intentionally offset-free: it emits the
 * wall time the user typed, verbatim, because that is the value the backend's naive column
 * stores. Adding `Z` or converting to UTC here is the same 8-hour bug from the other direction.
 *
 * ## Where it sits
 *
 * Mirrors the established incident-form precedent
 * (`features/insiden/incident-form/extract-data.util.ts` → `isoToDateTimeLocal`, consumed by
 * `incident-to-form.util.ts`), but lives in its own module rather than importing across
 * features: links are hydrated by the link form, the console edit panel and (later) My Links,
 * and none of those should have to reach into the incident form to format a timestamp.
 * Angular-free on purpose (mirrors the sibling utils) so it is unit-testable in isolation —
 * see link-occurred-at.util.spec.ts.
 */

/**
 * API `occurredAt` string → the value a `datetime-local` input shows.
 *
 * `""` for anything unusable (null/undefined, or an unparseable string) so a form hydrating from
 * it keeps a usable control rather than showing `Invalid Date`. An empty datetime-local input is
 * also the documented "unset" state, which `occurredAtInputToIso` maps to `null`.
 *
 * Seconds and sub-second precision are DROPPED, because the control cannot represent them: a
 * row stored at `14:05:59` hydrates as `14:05` and, if saved back unchanged, moves by 59
 * seconds. That is why the specs pin midnight and hour boundaries explicitly — the rounding is
 * only ever sub-minute and never crosses an hour or a day for values a person could have typed.
 */
export function isoToOccurredAtInput(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * A `datetime-local` input value → the `occurredAt` string to send, or `null` for "unset".
 *
 * `null` is the documented wire meaning of "no value here" and it is NOT a no-op:
 *
 *   - submit (`submitSocialMediaLink` / `submitFeedLink`): `null`/omitted both mean "stamp the
 *     submission instant now", so an empty field is exactly what you want for a brand-new link.
 *   - update (`updateSocialMediaLink`): `null` means "RESET to the row's submission time" — the
 *     deliberate escape hatch for a link whose event time was guessed. See
 *     `link-status-input.util.ts` for why an editor must never produce this spelling by
 *     accident.
 *
 * The output is normalised to full `YYYY-MM-DDTHH:mm:ss` (no offset, no `Z`, no fraction) so the
 * payload is unambiguous to Strawberry's `DateTime` scalar and so the pair round-trips:
 * `isoToOccurredAtInput(occurredAtInputToIso(v)) === v` for any value the control can hold.
 *
 * A value that does not match the `datetime-local` shape is passed through UNCHANGED rather than
 * mapped to `null`: `null` resets a timestamp, so guessing here would turn a typo into silent
 * data loss. Returning it verbatim lets the `DateTime` scalar reject it loudly instead.
 *
 * The parameter accepts `null`/`undefined` even though a live control always hands back a string:
 * `strictNullChecks` is OFF repo-wide, so the compiler will not stop a caller passing an
 * uninitialised form field, and `value.trim()` on a null would throw inside a submit handler.
 * Guarding mirrors `isoToDateTimeLocal` in the incident form, which guards for the same reason.
 */
export function occurredAtInputToIso(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return null;
  }
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!match) {
    return trimmed;
  }
  return `${match[1]}T${match[2]}:${match[3] ?? "00"}`;
}
