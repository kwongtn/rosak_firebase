/**
 * GraphQL documents + hand-written types for the line-status history and report surfaces:
 * the per-line hourly buckets, the per-line typical week, the network / multi-line service-day
 * history, the per-line keyset-paginated report list and its submit mutation. Field names are
 * copied verbatim from the deployed Strawberry schema. Split out of the former monolithic
 * `home.queries.ts`.
 */

import type { PassengerStatus } from "./home.queries";

/* ---------------------------------------------------------------------- *
 * lineStatusHistory — hourly report buckets for one line
 * ---------------------------------------------------------------------- */

export const LINE_STATUS_HISTORY_QUERY = /* GraphQL */ `
  query LineStatusHistory($lineId: ID!, $dayStartHour: Int) {
    lineStatusHistory(lineId: $lineId, dayStartHour: $dayStartHour) {
      hourStart
      hourEnd
      count
      dominantStatus
      statusCounts {
        status
        count
      }
    }
  }
`;

export interface LineStatusHistoryQueryVars {
  lineId: string;
  dayStartHour?: number | null;
}

export interface LineStatusHistoryQueryData {
  lineStatusHistory: LineStatusHourBucket[];
}

/** One hourly bucket of community reports. `dominantStatus` is null for an empty hour. */
export interface LineStatusHourBucket {
  hourStart: string;
  hourEnd: string;
  count: number;
  dominantStatus: PassengerStatus | null;
  /** The hour's per-status tallies in `PassengerStatus` declaration order, zero counts omitted
   * (an empty hour returns `[]`). Always sums to `count`. */
  statusCounts: Array<{ status: PassengerStatus; count: number }>;
}

/* ---------------------------------------------------------------------- *
 * lineStatusWeekProfile — the typical week of one line
 * ---------------------------------------------------------------------- */

/**
 * One line's reports tallied by weekday and hour over a rolling window of `weeks` weeks ending now:
 * "is this line usually bad, and when?".
 *
 * Unlike the hourly documents above, BOTH arguments are sent, as the literals the caller names
 * (`WEEK_PROFILE_WEEKS`, `SERVICE_DAY_START_HOUR`), because the grid is laid out from them: it starts
 * its columns at `dayStartHour`, and a backend default that moved would silently shift every column
 * against its label. They are constants, never clock-derived, so the variables stay equal between the
 * server render and the client (the rule the hourly documents give for omitting them).
 *
 * The backend answers `[]` for a line with no report in the window, and otherwise ALL 168 slots
 * (empty ones carry `count: 0`), Monday first and, inside a weekday, in service-day hour order. The
 * display util does not rely on that order.
 */
export const LINE_STATUS_WEEK_PROFILE_QUERY = /* GraphQL */ `
  query LineStatusWeekProfile($lineId: ID!, $weeks: Int, $dayStartHour: Int) {
    lineStatusWeekProfile(lineId: $lineId, weeks: $weeks, dayStartHour: $dayStartHour) {
      weekday
      hour
      count
      dominantStatus
      statusCounts {
        status
        count
      }
    }
  }
`;

export interface LineStatusWeekProfileQueryVars {
  lineId: string;
  /** 1 to 12 on the backend (default 6). */
  weeks?: number | null;
  /** 0 to 23 on the backend (default 3). */
  dayStartHour?: number | null;
}

export interface LineStatusWeekProfileQueryData {
  lineStatusWeekProfile: LineStatusWeekBucket[];
}

/**
 * One weekday-hour slot of a typical week. `weekday` is 0 (Monday) to 6 (Sunday) of the SERVICE day
 * the report belongs to, so with the default 03:00 start a 01:30 Tuesday report is Monday, hour 1.
 * `hour` is the local clock hour, 0 to 23. `count` is a raw total over the window's weeks, not an
 * average, so a slot holds `weeks` or `weeks + 1` occurrences of its hour. `dominantStatus` and
 * `statusCounts` follow the hourly buckets' rules (null and `[]` for an empty slot).
 */
export interface LineStatusWeekBucket {
  weekday: number;
  hour: number;
  count: number;
  dominantStatus: PassengerStatus | null;
  statusCounts: Array<{ status: PassengerStatus; count: number }>;
}

/* ---------------------------------------------------------------------- *
 * networkStatusHistory / linesStatusHistory — the SERVICE-DAY hour buckets
 *
 * Three documents share one `LineStatusHourBucket` selection and one shape, and they differ only
 * in scope: `lineStatusHistory` (above) is ONE line, `networkStatusHistory` is every line combined
 * into one hour-by-hour tally, and `linesStatusHistory` is up to 64 lines answered in ONE request
 * (so every board row's report label and the heat grid are fed by one per-line read instead of
 * sixteen).
 *
 * 🔴 `networkStatusHistory` is a NETWORK AGGREGATE, not a per-line series: an hour's `count`,
 * `dominantStatus` and `statusCounts` tally EVERY line's reports in that hour. Drawing it under one
 * line's name would silently attribute other lines' reports to it — which is why the hero's
 * sparkline is labelled a NETWORK read and the per-line readings behind the board rows and the heat
 * grid come from `linesStatusHistory` instead.
 * ---------------------------------------------------------------------- */

/**
 * `dayStartHour` is DECLARED AND PASSED but deliberately OMITTED from every variables object this
 * side builds, so the backend's own default (3 — the community service day runs 03:00 → 02:00)
 * applies.
 *
 * The document has to declare it: a GraphQL variable declared and never used is a validation error,
 * so the alternative is a variable nobody can set. The call sites then send `{}` / `{ lineIds }`,
 * which is the same rule the last-week window follows (`lastWeekOnly` is computed backend-side for
 * exactly this reason) — a `new Date()` or a client clock baked into query variables would make the
 * server render and the client hydration compute different variables, and `retainDataIfEqual` /
 * TransferState would then refetch instead of reusing the server payload.
 */
export const NETWORK_STATUS_HISTORY_QUERY = /* GraphQL */ `
  query NetworkStatusHistory($dayStartHour: Int) {
    networkStatusHistory(dayStartHour: $dayStartHour) {
      hourStart
      hourEnd
      count
      dominantStatus
      statusCounts {
        status
        count
      }
    }
  }
`;

export interface NetworkStatusHistoryQueryVars {
  /** Deliberately never sent — see the document's own note. `number | null`, never a date. */
  dayStartHour?: number | null;
}

export interface NetworkStatusHistoryQueryData {
  networkStatusHistory: LineStatusHourBucket[];
}

/**
 * Every line's reports for the current service day in ONE request, keyed back to the line id.
 *
 * The id list is sent SORTED, never in board order and never in the order the server would return:
 * the variables object is compared structurally between the server render and the client hydration
 * (SSR TransferState reuse), and a list whose order follows a reactive view would reorder whenever
 * the board's sort changed — re-firing a read that asked for exactly the same lines. 64 ids is the
 * backend cap, above which it answers with a typed GraphQL error rather than a silent truncation.
 */
export const LINES_STATUS_HISTORY_QUERY = /* GraphQL */ `
  query LinesStatusHistory($lineIds: [ID!]!) {
    linesStatusHistory(lineIds: $lineIds) {
      lineId
      buckets {
        hourStart
        hourEnd
        count
        dominantStatus
        statusCounts {
          status
          count
        }
      }
    }
  }
`;

export interface LinesStatusHistoryQueryVars {
  lineIds: string[];
  /** Deliberately never sent — see `NETWORK_STATUS_HISTORY_QUERY`. */
  dayStartHour?: number | null;
}

export interface LinesStatusHistoryQueryData {
  linesStatusHistory: LineStatusHistory[];
}

/** One line's hourly buckets. `buckets: []` is this line's "nothing reported this service day" —
 *  the absence of data, NOT an error and never a reason to zero-fill the widget. */
export interface LineStatusHistory {
  lineId: string;
  buckets: LineStatusHourBucket[];
}

/* ---------------------------------------------------------------------- *
 * lineStatusReports — the per-line report list (keyset paginated)
 * ---------------------------------------------------------------------- */

export const LINE_STATUS_REPORTS_QUERY = /* GraphQL */ `
  query LineStatusReports($lineId: ID!, $first: Int!, $after: String) {
    lineStatusReports(lineId: $lineId, first: $first, after: $after) {
      edges {
        node {
          id
          status
          delayMinutes
          notes
          created
          stations {
            id
            displayName
          }
          user {
            shortId
            nickname
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export interface LineStatusReportsQueryVars {
  lineId: string;
  first: number;
  after?: string | null;
}

export interface LineStatusReportsQueryData {
  lineStatusReports: LineStatusReportConnection;
}

/** One community status report — the selected LineStatusReportScalar subset. */
export interface LineStatusReportItem {
  id: string;
  status: PassengerStatus;
  delayMinutes: number | null;
  notes: string;
  created: string;
  stations: Array<{ id: string; displayName: string }>;
  user: { shortId: string; nickname: string } | null;
}

interface LineStatusReportEdge {
  node: LineStatusReportItem;
  cursor: string;
}

interface LineStatusReportPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface LineStatusReportConnection {
  edges: LineStatusReportEdge[];
  pageInfo: LineStatusReportPageInfo;
}

export const SUBMIT_LINE_STATUS_REPORT_MUTATION = /* GraphQL */ `
  mutation SubmitLineStatusReport($input: LineStatusReportInput!) {
    submitLineStatusReport(input: $input) {
      ok
      id
    }
  }
`;

export interface LineStatusReportInput {
  lineId: string;
  status: PassengerStatus;
  stationIds?: string[];
  delayMinutes?: number | null;
  notes?: string | null;
}

export interface SubmitLineStatusReportVars {
  input: LineStatusReportInput;
}

export interface SubmitLineStatusReportData {
  submitLineStatusReport: { ok: boolean; id: number | null };
}
