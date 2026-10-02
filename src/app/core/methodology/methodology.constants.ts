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
 * v1 shipped exactly one — the page's own "needs review" threshold from
 * `METHODOLOGY_DOCS.md` §2 edge cases. All transit metrics (reliability, episodes,
 * arrivals, staleness windows) are backend-owned and have not landed, so no other
 * constant belongs here.
 *
 * `NEEDS_ATTENTION_PASSENGER_RANK` is the exception, and it is not a transit measurement: it is the
 * frontend's own rule for when a rider-reported passenger status counts as a *service* problem
 * (`features/home/data/network-summary.util.ts`, published as the `network.needs-attention`
 * metric). Its value is the backend `PassengerStatus` enum position of `DELAYED`, so it mirrors a
 * backend ORDERING rather than inventing a threshold — the source names the spec that owns the enum
 * order and the feature code owns the comparison.
 */
export const METHODOLOGY_CONSTANTS: Record<string, MethodologyConstant> = {
  STALE_REVIEW_MONTHS: { value: 6, source: "METHODOLOGY_DOCS.md" },
  NEEDS_ATTENTION_PASSENGER_RANK: { value: 5, source: "LINE_STATUS_DERIVE.md" },
};
