import type { CalendarIncidentSeverity } from "./insiden.queries";

/**
 * The "Last 12 months" read: every incident that STARTED in the window, with only the four fields
 * the chart needs, so the payload stays a few bytes per incident (the page's own document drags
 * chronologies, links and photos along).
 *
 * 🔴 **Why this is not `calendarIncidentsBySeverityCount(groupBy: MONTH)`.** The audit (F213) points
 * at that aggregate, and it is the obvious source, but its MONTH grouping is not a per-month count:
 * `get_calendar_incidents_by_severity_count` (rosak_backend `incident/schema/resolvers.py`) filters
 * each bucket with `start year <= Y AND start month <= M` — the month NUMBER compared on its own,
 * across years — plus an end-month condition, so the result is a running total that resets every
 * January and, over a multi-year window, folds every earlier year's January into this one. Against
 * the local data, window 2024-01..2024-12 returns MAJOR 1, 8, 12, 18, 26, 30 for months whose true
 * counts are 1, 7, 4, 6, 8, 4, and a 2023-01..2026-12 window reports 10 MAJOR for January 2024 when
 * one started. The resolver also has no status filter (drafts and pending reports are counted) and
 * no docstring, and its tests cover one month of open incidents only. A bar chart of those numbers
 * would be a plausible-looking lie, so this reads the incidents and counts them here. When the
 * backend resolver is fixed to a true per-month count, swapping this document for the aggregate is
 * a change to this file and `bucketIncidentsByMonth` and nothing else.
 *
 * **Two aliased reads, not one.** `CalendarIncidentFilter.date` has a `range` (capped at 60 days)
 * and a `year` form that is not capped: `year: { exact: Y }` returns every incident overlapping
 * calendar year Y, which always includes each one that STARTED in Y. A 12-month window ends in year
 * Y and begins in Y or Y - 1, so these two aliases cover it; an incident spanning both comes back
 * twice and is de-duplicated by `id`. Status is not filterable server-side, so it is read and
 * filtered on the client.
 */
export const INSIDEN_MONTHLY_HISTORY_QUERY = /* GraphQL */ `
  query InsidenMonthlyHistory(
    $startYear: CalendarIncidentFilter
    $endYear: CalendarIncidentFilter
  ) {
    startYearIncidents: calendarIncidents(filters: $startYear) {
      id
      startDatetime
      severity
      status
    }
    endYearIncidents: calendarIncidents(filters: $endYear) {
      id
      startDatetime
      severity
      status
    }
  }
`;

/** The slice of an incident the monthly chart reads. */
export interface MonthlyHistoryIncident {
  id: string;
  /** Naive Kuala Lumpur wall time, like every incident datetime (backend `USE_TZ = False`). */
  startDatetime: string;
  severity: CalendarIncidentSeverity;
  /** The approval state; only `LIVE` is counted. */
  status?: string | null;
}

export interface InsidenMonthlyHistoryData {
  startYearIncidents: MonthlyHistoryIncident[];
  endYearIncidents: MonthlyHistoryIncident[];
}

/** `CalendarIncidentFilter` for "overlaps calendar year `exact`". */
export interface YearFilter {
  date: { year: { exact: number } };
}

export interface InsidenMonthlyHistoryVars {
  startYear: YearFilter;
  endYear: YearFilter;
}
