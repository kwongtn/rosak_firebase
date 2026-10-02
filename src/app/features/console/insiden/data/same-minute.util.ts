/**
 * "Are these two instants the same MINUTE?" — the rule the console links queue's
 * Submitted cell uses to decide whether the event instant needs its own second
 * line.
 *
 * WHY A MINUTE AND NOT AN INSTANT, which is the whole reason this file exists.
 * Both clocks are rendered with `{{ value | date: "MMM d, y HH:mm" }}`, so the
 * DISPLAYED precision of both lines is the minute: seconds are truncated away
 * before the admin ever sees them. An exact-instant test would therefore print a
 * second line that reads `Aug 1, 2026 09:00` directly under `Aug 1, 2026 09:00`
 * — two identical-looking lines, which is worse than either showing one line or
 * showing two genuinely different ones, because the admin cannot tell which
 * mistake they are looking at. A payload can produce this without any bug: two
 * `DateTime` values written microseconds apart, or a value re-serialised through a
 * path that normalised the seconds. "Same minute ⇒ same line" is exactly the
 * user's rule, and it is a rule about RENDERING rather than about the data.
 *
 * ⚠️ TRUNCATION, NOT ROUNDING. `Math.floor(parsed / 60_000)` buckets each instant
 * into the minute it FALLS IN. `09:00:59` is in the 09:00 bucket and `09:01:00`
 * is in the 09:01 bucket, so they are NOT the same minute — a rounding
 * implementation would push `09:00:59` up into `09:01` and then agree with a
 * value that is a whole minute away, which is exactly the boundary this exists to
 * get right. Rounding is also why the constant below is a `60_000` divisor rather
 * than a `% 60` on seconds: bucketing has to happen before the comparison.
 *
 * 🔴 WHY THE EXACT-STRING FAST PATH COMES FIRST, and it is not a micro-optimisation.
 * It is the only branch that can be right about a payload it CANNOT parse. The
 * backend's `USE_TZ = False` columns send naive local wall time — `2026-08-01T09:00:00`
 * with no offset and no `Z` — and `Date.parse` is the one place that turns such a
 * string into an instant, resolving it in the viewer's zone. If BOTH sides are
 * byte-identical the answer is `true` whatever that resolution produced, and a
 * pair of equal strings is also how the backend spells "the submitter stated no
 * event time", which is the overwhelming majority of rows. Comparing first means
 * those rows never depend on the host TZ at all.
 *
 * 🔴 AND WHY EVERYTHING ELSE IS `false` ON A `NaN`, which is the guard that
 * replaces the old exact-string rationale this util grew out of. `strict` and
 * `strictNullChecks` are OFF in this repo, so a hand-built fixture, a stale cached
 * payload or a host that stopped selecting the field can all hand this function
 * something unparseable — and `NaN !== NaN` is TRUE, so a naive
 * `a === b || parse(a) === parse(b)` would report two DIFFERENT instants as the
 * same and the cell would print a second line for every row whose payload was
 * under-specified. Worse, that line would render through the same `date` pipe as
 * `Invalid Date`. Returning `false` on an unparseable side can only ADD a second
 * line, never suppress one, which is the safe direction: an admin who sees a
 * redundant line ignores it, and an admin whose only clock is missing one does not.
 * Note the fast path above is deliberately exempt — two IDENTICAL invalid strings
 * are `true`, because "these are literally the same value" needs no parsing.
 *
 * Both sides are naive local wall time and are parsed in the same zone, so the
 * comparison is zone-independent as long as BOTH strings are of the same kind. A
 * value that arrived with an explicit offset would be resolved in that offset and
 * the two buckets could disagree by the offset delta — which is precisely why the
 * callers are the ones that know their payload (`occurredAt` is documented naive
 * local time on `SocialMediaLinkRow`; read that docstring before reusing this).
 *
 * Pure and total: no Angular import, no `signal`, no clock read, no `any`. A
 * function of its two arguments only, so it is safe in a computed, in a template
 * binding, and in a spec.
 */
export function isSameMinute(a: string | null | undefined, b: string | null | undefined): boolean {
  // Fast path first: identical strings are the same minute BY DEFINITION, and
  // this is the branch that does not need the value to be parseable.
  if (a === b) {
    return true;
  }
  // Not equal, so at least one side is missing or empty. A missing clock is not
  // evidence of sameness — it is absence of evidence, and the cell needs the line.
  if (!a || !b) {
    return false;
  }
  const left = Date.parse(a);
  const right = Date.parse(b);
  // 🔴 Never let `NaN !== NaN` decide it — see the file header. Anything
  // unparseable takes the "show the second line" branch, which is the safe one.
  if (Number.isNaN(left) || Number.isNaN(right)) {
    return false;
  }
  // Same 60_000-wide bucket ⇒ same displayed `MMM d, y HH:mm`.
  return Math.floor(left / 60_000) === Math.floor(right / 60_000);
}
