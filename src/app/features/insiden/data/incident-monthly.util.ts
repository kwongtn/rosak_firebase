import type { InsidenMonthlyHistoryVars, SeverityCountRow } from "./insiden-history.queries";

/**
 * Pure rules for the "Last 12 months" chart: which 12 months, how the backend's per-month counts
 * fill them, and the bar geometry. Angular-free so every rule is testable without a DOM; the
 * component only renders what these return.
 */

/** How many months the section covers, ending at (and including) the month the calendar shows. */
export const HISTORY_MONTHS = 12;

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

const LONG_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const SHORT_MONTH = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

function dateOfMonthKey(monthKey: string): Date {
  return new Date(`${monthKey}-01T00:00:00Z`);
}

/** "March 2026". */
export function monthLongLabel(monthKey: string): string {
  return LONG_LABEL.format(dateOfMonthKey(monthKey));
}

/** "Mar" — the axis tick. */
export function monthShortLabel(monthKey: string): string {
  return SHORT_MONTH.format(dateOfMonthKey(monthKey));
}

/**
 * The `count` month keys (`YYYY-MM`) ending at `endMonth` inclusive, oldest first.
 *
 * `endMonth` is the page's `selectedMonth` — route state, identical on the server and in the browser
 * — and NEVER derived from `new Date()`: a request body that depended on the clock could differ
 * between the server render and hydration, and a month that rolls over in between would otherwise
 * ask two different questions of the same page. A malformed key (a hand-edited `/insiden/foo` URL)
 * yields `[]`, which the caller treats as "nothing to read".
 */
export function monthKeysEndingAt(endMonth: string, count = HISTORY_MONTHS): string[] {
  const match = MONTH_KEY.exec(endMonth);
  if (match === null) {
    return [];
  }
  const endIndex = Number(match[1]) * 12 + (Number(match[2]) - 1);
  const keys: string[] = [];
  for (let offset = count - 1; offset >= 0; offset--) {
    const index = endIndex - offset;
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    keys.push(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`);
  }
  return keys;
}

/**
 * The inclusive bounds of the aggregate read for the window `monthKeys`: 1 January of the first
 * month's year to 31 December of the last month's year, or `null` for an empty window.
 *
 * Whole calendar years, not the 12 months themselves, for two reasons. Both bounds then sit on month
 * edges (the backend counts only the incidents inside the bounds, so a bound inside a month would
 * give that month a partial count). And the result depends on the PAIR of years alone, so paging to
 * another month inside the pair asks the same question and the loaded rows are re-bucketed instead
 * of read again. A month key is `YYYY-MM` with a zero-padded year, which is the year format the
 * backend's `Date` needs, so the year is sliced and never converted to a number.
 */
export function historyDateBounds(monthKeys: readonly string[]): InsidenMonthlyHistoryVars | null {
  const first = monthKeys[0];
  const last = monthKeys[monthKeys.length - 1];
  if (first === undefined || last === undefined) {
    return null;
  }
  return { startDate: `${first.slice(0, 4)}-01-01`, endDate: `${last.slice(0, 4)}-12-31` };
}

/** One month's counts. `OTHERS` is not a column: see {@link MonthlyHistory.otherSeverity}. */
export interface MonthlySeverityRow {
  monthKey: string;
  major: number;
  minor: number;
}

export interface MonthlyHistory {
  /** One row per requested month, in order, zero-filled. */
  rows: MonthlySeverityRow[];
  /** Approved incidents of a severity the chart does not draw, inside the window. */
  otherSeverity: number;
}

/**
 * Places the backend's per-month counts on the axis.
 *
 * The server has already counted: `LIVE` incidents only, each once, in the month it STARTED in. So
 * this only puts each row's `count` on its month and severity. A month with no row is present with
 * zeros (the aggregate omits empty months), so the axis never skips one. A row outside the window
 * is ignored: the read spans whole calendar years, and the match is on the full `YYYY-MM`, so the
 * same month of another year can never land in a bar. `OTHERS`, and any severity this chart does
 * not draw, add up in `otherSeverity` instead of being dropped. Counts are summed, not assigned, so
 * a month and severity that came back twice would still add up.
 */
export function bucketSeverityCountsByMonth(
  counts: readonly SeverityCountRow[],
  monthKeys: readonly string[],
): MonthlyHistory {
  const byMonth = new Map<string, MonthlySeverityRow>(
    monthKeys.map((monthKey) => [monthKey, { monthKey, major: 0, minor: 0 }]),
  );
  let otherSeverity = 0;
  for (const { date, severity, count } of counts) {
    const row = byMonth.get(date.slice(0, 7));
    if (row === undefined) {
      continue;
    }
    if (severity === "MAJOR") {
      row.major += count;
    } else if (severity === "MINOR") {
      row.minor += count;
    } else {
      otherSeverity += count;
    }
  }
  return { rows: [...byMonth.values()], otherSeverity };
}

/** "1 incident" / "9 incidents". */
function incidentsPhrase(count: number): string {
  return `${count} incident${count === 1 ? "" : "s"}`;
}

/** One column of the chart, already measured and worded. */
export interface MonthlyBar {
  monthKey: string;
  /** "March 2026". */
  label: string;
  /** "Mar". */
  tick: string;
  /** "2026" on the first column and on every January, so the axis names the year it crosses into. */
  yearTick: string | null;
  major: number;
  minor: number;
  total: number;
  /** The whole bar's height, as a percentage of the busiest month: exactly total over the busiest
   * total, with no floor (see {@link toMonthlyBars}). */
  heightPct: number;
  /** The major / minor segments' heights; they sum to exactly `heightPct`. */
  majorPct: number;
  minorPct: number;
  /** The `title` / `aria-label` of the bar. */
  title: string;
}

/**
 * The bars for `rows`, scaled to the busiest month.
 *
 * Scaled to the busiest month IN THE WINDOW rather than to a fixed constant, as the home chart does:
 * the chart is a self-relative picture of the shape of the year. Each bar's height is exactly the
 * month's total over the busiest total and the two segments split that height by their share, so
 * they always sum to the bar. There is NO minimum height here: a floor in percent made one incident
 * in a busy window taller than the y axis says it is. A sliver too thin to see is the view's to widen
 * (a 2 px minimum on each drawn segment), a pixel-level courtesy rather than a change to the number.
 * An empty month is a zero-height bar, never a sliver.
 */
export function toMonthlyBars(rows: readonly MonthlySeverityRow[]): MonthlyBar[] {
  const max = rows.reduce((highest, row) => Math.max(highest, row.major + row.minor), 0);
  return rows.map((row, index) => {
    const total = row.major + row.minor;
    const heightPct = max === 0 || total === 0 ? 0 : (total / max) * 100;
    const label = monthLongLabel(row.monthKey);
    const isJanuary = row.monthKey.endsWith("-01");
    return {
      monthKey: row.monthKey,
      label,
      tick: monthShortLabel(row.monthKey),
      yearTick: index === 0 || isJanuary ? row.monthKey.slice(0, 4) : null,
      major: row.major,
      minor: row.minor,
      total,
      heightPct,
      majorPct: total === 0 ? 0 : (heightPct * row.major) / total,
      minorPct: total === 0 ? 0 : (heightPct * row.minor) / total,
      title:
        total === 0
          ? `${label} · No incidents`
          : `${label} · ${incidentsPhrase(total)} · Major ${row.major}, Minor ${row.minor}`,
    };
  });
}

/**
 * The y axis labels, top to bottom: the busiest month's count, its half, and zero.
 *
 * The half is there only when it is a WHOLE number. Gridlines sit at the top, the middle and the
 * bottom of the plot, so an odd maximum (3) has no whole count in the middle, and labelling that line
 * with a rounded one (2) would claim a value the line does not mark. Without it the middle gridline
 * is drawn and left unlabelled, and a maximum of 1 is just `[1, 0]`.
 */
export function yAxisTicks(max: number): number[] {
  return max >= 2 && max % 2 === 0 ? [max, max / 2, 0] : [max, 0];
}

/** The busiest month (earliest wins a tie, so the same data always names the same month), or `null`
 * when every month is empty. */
export function busiestMonth(rows: readonly MonthlySeverityRow[]): MonthlySeverityRow | null {
  let busiest: MonthlySeverityRow | null = null;
  for (const row of rows) {
    const total = row.major + row.minor;
    if (total > 0 && (busiest === null || total > busiest.major + busiest.minor)) {
      busiest = row;
    }
  }
  return busiest;
}

/**
 * One sentence carrying what a sighted reader takes from the bars, for the chart group's accessible
 * name: the window, the totals and the peak. Each bar is its own button named by its month, and the
 * table below the chart is the per-month fallback.
 */
export function monthlyHistorySummary(rows: readonly MonthlySeverityRow[]): string {
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (first === undefined || last === undefined) {
    return "Incidents per month: no months in range";
  }
  const major = rows.reduce((sum, row) => sum + row.major, 0);
  const minor = rows.reduce((sum, row) => sum + row.minor, 0);
  const range = `${monthLongLabel(first.monthKey)} to ${monthLongLabel(last.monthKey)}`;
  const peak = busiestMonth(rows);
  const peakPhrase =
    peak === null
      ? ""
      : `. Busiest month: ${monthLongLabel(peak.monthKey)} with ${incidentsPhrase(peak.major + peak.minor)}`;
  return `Incidents started per month, ${range}: ${major} major and ${minor} minor${peakPhrase}`;
}
