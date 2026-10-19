import type {
  ProLinesSort,
  ProLinesSortColumn,
} from "../../../core/preferences/preferences.service";
import type { LinePulse } from "../data/home-board.queries";
import type { LineStatusHourBucket } from "../data/home-history.queries";
import { LINE_STATUS_SEVERITY_RANK } from "../data/network-summary.util";

/**
 * The start of the most recent service hour that carries at least one report, or `null` when no
 * hour in the read has one.
 *
 * 🔴 The history is hourly, so this is the HOUR of the last report, not its minute. The table says so
 * in its header; a reader who needs the exact time has the line's report sheet.
 */
export function lastReportHour(buckets: readonly LineStatusHourBucket[]): string | null {
  let latest: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const bucket of buckets) {
    const ms = Date.parse(bucket.hourStart);
    if (bucket.count > 0 && Number.isFinite(ms) && ms > latestMs) {
      latest = bucket.hourStart;
      latestMs = ms;
    }
  }
  return latest;
}

/**
 * Compares two last-report hours. A line with no report sorts LAST in BOTH directions: "never
 * reported" is not the oldest report, and flipping it to the top on a descending sort would bury
 * the lines a reader actually wants to see first.
 */
function compareLastReport(a: string | null, b: string | null, direction: 1 | -1): number {
  if (a === null || b === null) {
    if (a === b) {
      return 0;
    }
    return a === null ? 1 : -1;
  }
  return (Date.parse(a) - Date.parse(b)) * direction;
}

/**
 * The sort key's comparison for one column, ascending. The caller applies the direction, except for
 * the last-report column whose nulls must stay last under either direction.
 */
function compareByColumn(
  column: Exclude<ProLinesSortColumn, "lastReport">,
  a: LinePulse,
  b: LinePulse,
): number {
  switch (column) {
    case "line":
      return a.code.localeCompare(b.code);
    case "status":
      return LINE_STATUS_SEVERITY_RANK[a.status] - LINE_STATUS_SEVERITY_RANK[b.status];
    case "reports":
      return a.statusReportCount - b.statusReportCount;
    case "inService":
      return (
        a.inServiceVehicleCount - b.inServiceVehicleCount ||
        a.totalVehicleCount - b.totalVehicleCount
      );
  }
}

/**
 * The lines in the table's order: the chosen column in the chosen direction, with the line code as a
 * fixed last tie-break so two sorts over the same data always draw the same rows in the same order.
 * Copies the input first, so the store's own arrays are never re-ordered under it.
 *
 * "In service" sorts by the in-service vehicle count, then by the fleet total. That is the number a
 * reader reads first in `N/M`; the share would reorder a 1/2 line above a 9/16 one, which is not what
 * the column is saying.
 */
export function sortProLines(
  lines: readonly LinePulse[],
  sort: ProLinesSort,
  lastReportOf: (line: LinePulse) => string | null,
): LinePulse[] {
  const direction = sort.direction === "desc" ? -1 : 1;
  return [...lines].sort((a, b) => {
    const primary =
      sort.column === "lastReport"
        ? compareLastReport(lastReportOf(a), lastReportOf(b), direction)
        : compareByColumn(sort.column, a, b) * direction;
    return primary || a.code.localeCompare(b.code);
  });
}
