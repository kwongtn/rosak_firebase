/**
 * A single value interpolated into methodology copy, plus the sibling spec that owns it.
 * `source` names the spec file so a reader can always trace a number back to its owner —
 * this file never invents one.
 */
export interface MethodologyConstant {
  value: number | string;
  source: string;
}

/**
 * Every value that appears in methodology copy, keyed by its `{{TOKEN}}`.
 *
 * v1 ships exactly one: the page's own "needs review" threshold from
 * `METHODOLOGY_DOCS.md` §2 edge cases. All transit metrics (reliability, episodes,
 * arrivals, staleness windows) are backend-owned and have not landed, so no other
 * constant belongs here yet.
 */
export const METHODOLOGY_CONSTANTS: Record<string, MethodologyConstant> = {
  STALE_REVIEW_MONTHS: { value: 6, source: "METHODOLOGY_DOCS.md" },
};
