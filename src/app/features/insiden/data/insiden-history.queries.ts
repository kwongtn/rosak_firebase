/**
 * The "Last 12 months" read: the backend's own per-month count,
 * `calendarIncidentsBySeverityCount(startDate, endDate, groupBy: MONTH)`.
 *
 * It answers with one row per (calendar month, severity) that has an incident: `date` is the first
 * of the month and `count` is the number of `LIVE` incidents of that severity whose start falls in
 * that month. Each incident is counted once, in its start month, however long it lasted, and drafts,
 * pending and rejected reports never count (`get_calendar_incidents_by_severity_count`,
 * rosak_backend `incident/schema/resolvers.py`; `docs/components/incident.md` -> Aggregation). So
 * the page neither downloads the incidents nor filters on `status`, and the payload is at most a
 * few dozen rows however many incidents there are. A month with no `LIVE` incident has NO row: the
 * bucketing (`bucketSeverityCountsByMonth`) zero-fills the axis.
 *
 * 🔴 **Needs rosak_backend `9832a3d`.** Before it, the MONTH grouping compared the month NUMBER on
 * its own across years (`start year <= Y AND start month <= M`), so every row was a running total
 * that reset each January, drafts included, and this document would draw plausible, wrong bars. The
 * backend deploys first.
 *
 * **The window.** The variables come from the page's route-derived month only, never the clock
 * (the hydration rule): `monthKeysEndingAt(selectedMonth)` gives the 12 months shown and
 * `historyDateBounds` turns them into 1 January of the first month's year and 31 December of the
 * last month's year: the calendar years those two months fall in, read whole. Both bounds sit on
 * month edges, which matters because the bounds are exact dates and a bound inside a month would
 * give that month a partial count (only the incidents that started inside the window). The request
 * depends on the pair of years alone, so paging to another month inside the pair asks the same
 * question and re-buckets what is loaded; the months of the pair outside the 12 shown come back
 * too (up to 24 months of rows) and are ignored by the bucketing.
 */
export const INSIDEN_MONTHLY_HISTORY_QUERY = /* GraphQL */ `
  query InsidenMonthlyHistory($startDate: Date!, $endDate: Date!) {
    calendarIncidentsBySeverityCount(startDate: $startDate, endDate: $endDate, groupBy: MONTH) {
      severity
      date
      count
    }
  }
`;

/** One row of the aggregate: the `LIVE` incidents of one severity that started in one month. */
export interface SeverityCountRow {
  /**
   * A plain `String` in the schema, not an enum: `MAJOR`, `MINOR` or `OTHERS` today. Anything else
   * is counted as other severity rather than dropped.
   */
  severity: string;
  /** The first day of the month, `YYYY-MM-01` (the schema's `Date`: no time, no zone). */
  date: string;
  count: number;
}

export interface InsidenMonthlyHistoryData {
  calendarIncidentsBySeverityCount: SeverityCountRow[];
}

/** The window of the read: inclusive `YYYY-MM-DD` dates, both required by the resolver. */
export interface InsidenMonthlyHistoryVars {
  startDate: string;
  endDate: string;
}
