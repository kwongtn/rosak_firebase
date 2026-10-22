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
 *
 * `CONFIRMED_MIN_REPORTS` is the other such frontend rule, added with the network board's confidence
 * chip (`features/home/data/status-confidence.util.ts`, published as `status-confidence.confirmed`):
 * how many rider reports inside one rolling window make a reported status "Confirmed" rather than
 * "Unconfirmed". It counts reports the BACKEND already scopes per line, so it is a pure
 * corroboration threshold — the smallest number that means "several people, independently" — and
 * not a measurement of anything.
 *
 * The three history constants came with the service-day history surfaces (`features/home/data/
 * status-history-display.util.ts`, published as `network.activity-sparkline`, `network.heat-strip`
 * and `network.line-reports-summary`). All three MIRROR backend values rather than invent thresholds:
 * the service day starts at hour `SERVICE_DAY_START_HOUR` and the backend zero-fills
 * `SERVICE_DAY_HOURS` buckets from there, and the heat grid's opacity ladder has
 * `HEAT_INTENSITY_STEPS` steps. They are here so a widget's label and its `/methodology` sentence
 * cannot drift from the shape the backend actually returns — and `status-history-display.util.spec.ts`
 * pins each of them against the code that uses it, so a backend change that is not mirrored here
 * fails a test instead of quietly mislabelling a chart.
 *
 * `REPORT_RANKING_TOP_LINES` is a display cap rather than a measurement — how many lines the Pro
 * worst-lines ranking shows (`features/home/pro/pro-report-ranking.component.ts`, published as
 * `network.report-ranking`). It is here for one reason: the ranking's own methodology sentence names
 * the cap, and a cap written in two places is a cap that drifts. The widget's spec pins this value
 * against the constant the widget actually slices with.
 *
 * `REPORT_OUTBOX_FALLBACK_WINDOW_MINUTES` is a frontend FALLBACK, not a copy of a backend value.
 * A line status report queued while offline waits at most its own line's `statusWindowMinutes`,
 * which the board fetches from the backend and the outbox records with the report
 * (`core/offline/report-outbox.service.ts`, published as `line-status.queued-report-expiry`). This
 * number applies only when the page that queued the report did not know that window. The service's
 * spec pins this value against the constant the outbox falls back to.
 *
 * `PLANNED_WORKS_WINDOW_DAYS` and `LINE_NOTICE_MAX_CHIPS` came with the board's Notice / Planned works
 * chips (`features/home/line-pulse/line-notices.component.ts`, published as `incidents.line-notices`).
 * The first is the `upcomingWithinDays` the planned-works read sends (the BACKEND counts the days, so
 * it is a window this client names rather than measures); the second is the display cap per line. Both
 * are pinned by the specs next to the code that uses them (`home.queries.spec.ts`,
 * `incident-notices.util.spec.ts`), so the popover cannot promise a window or a cap the board does not
 * apply.
 */
export const METHODOLOGY_CONSTANTS: Record<string, MethodologyConstant> = {
  STALE_REVIEW_MONTHS: { value: 6, source: "METHODOLOGY_DOCS.md" },
  NEEDS_ATTENTION_PASSENGER_RANK: { value: 5, source: "LINE_STATUS_DERIVE.md" },
  CONFIRMED_MIN_REPORTS: { value: 3, source: "LINE_STATUS_DERIVE.md" },
  SERVICE_DAY_START_HOUR: { value: 3, source: "LINE_STATUS_DERIVE.md" },
  SERVICE_DAY_HOURS: { value: 24, source: "LINE_STATUS_DERIVE.md" },
  HEAT_INTENSITY_STEPS: { value: 5, source: "LINE_STATUS_DERIVE.md" },
  REPORT_RANKING_TOP_LINES: { value: 5, source: "LINE_STATUS_DERIVE.md" },
  REPORT_OUTBOX_FALLBACK_WINDOW_MINUTES: { value: 15, source: "LINE_STATUS_DERIVE.md" },
  PLANNED_WORKS_WINDOW_DAYS: { value: 7, source: "INCIDENT_EPISODES.md" },
  LINE_NOTICE_MAX_CHIPS: { value: 2, source: "INCIDENT_EPISODES.md" },
};
