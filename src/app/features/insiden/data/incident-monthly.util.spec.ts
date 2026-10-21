import { describe, expect, it } from "vitest";

import {
  HISTORY_MONTHS,
  MIN_BAR_PERCENT,
  bucketIncidentsByMonth,
  busiestMonth,
  historyYearSpan,
  monthKeysEndingAt,
  monthLongLabel,
  monthShortLabel,
  monthlyHistorySummary,
  toMonthlyBars,
} from "./incident-monthly.util";
import type { MonthlyHistoryIncident } from "./insiden-history.queries";

function incident(
  id: string,
  startDatetime: string,
  severity: MonthlyHistoryIncident["severity"],
  status: string | null | undefined = "LIVE",
): MonthlyHistoryIncident {
  return { id, startDatetime, severity, status };
}

describe("incident-monthly.util: monthKeysEndingAt", () => {
  it("lists the 12 months ending at the given one, oldest first", () => {
    const keys = monthKeysEndingAt("2026-10");

    expect(keys).toHaveLength(HISTORY_MONTHS);
    expect(keys[0]).toBe("2025-11");
    expect(keys[11]).toBe("2026-10");
    expect(keys).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
  });

  it("starts in the same year when the window ends in December", () => {
    const keys = monthKeysEndingAt("2026-12");

    expect(keys[0]).toBe("2026-01");
    expect(keys[11]).toBe("2026-12");
  });

  it("starts in the previous year when the window ends in January", () => {
    const keys = monthKeysEndingAt("2026-01");

    expect(keys[0]).toBe("2025-02");
    expect(keys[11]).toBe("2026-01");
  });

  it("crosses a year boundary without skipping or repeating a month", () => {
    const keys = monthKeysEndingAt("2024-03");

    expect(new Set(keys).size).toBe(12);
    expect(keys.slice(0, 3)).toEqual(["2023-04", "2023-05", "2023-06"]);
  });

  it("honours a custom length", () => {
    expect(monthKeysEndingAt("2026-03", 3)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("returns an empty window for a malformed key instead of throwing", () => {
    // `/insiden/foo` is a reachable URL; the section must degrade, not break the page.
    expect(monthKeysEndingAt("foo")).toEqual([]);
    expect(monthKeysEndingAt("2026-13")).toEqual([]);
    expect(monthKeysEndingAt("2026-00")).toEqual([]);
    expect(monthKeysEndingAt("")).toEqual([]);
    expect(monthKeysEndingAt("2026-1")).toEqual([]);
  });

  it("depends only on its argument, never on the clock", () => {
    // The hydration rule: server and client must derive identical request variables.
    expect(monthKeysEndingAt("2024-02")).toEqual(monthKeysEndingAt("2024-02"));
  });
});

describe("incident-monthly.util: historyYearSpan", () => {
  it("is the year of the first and last month", () => {
    expect(historyYearSpan(monthKeysEndingAt("2026-03"))).toEqual({
      startYear: 2025,
      endYear: 2026,
    });
  });

  it("collapses to one year when the window ends in December", () => {
    expect(historyYearSpan(monthKeysEndingAt("2026-12"))).toEqual({
      startYear: 2026,
      endYear: 2026,
    });
  });

  it("is null for an empty window", () => {
    expect(historyYearSpan([])).toBeNull();
  });
});

describe("incident-monthly.util: bucketIncidentsByMonth", () => {
  const months = monthKeysEndingAt("2026-03", 3); // 2026-01, 2026-02, 2026-03

  it("counts by the month an incident STARTED in, split by severity", () => {
    const { rows } = bucketIncidentsByMonth(
      [
        incident("1", "2026-01-05T08:00:00", "MAJOR"),
        incident("2", "2026-01-20T08:00:00", "MINOR"),
        incident("3", "2026-01-21T08:00:00", "MINOR"),
        incident("4", "2026-03-02T08:00:00", "MAJOR"),
      ],
      months,
    );

    expect(rows).toEqual([
      { monthKey: "2026-01", major: 1, minor: 2 },
      { monthKey: "2026-02", major: 0, minor: 0 },
      { monthKey: "2026-03", major: 1, minor: 0 },
    ]);
  });

  it("counts an incident once however long it lasted: only its start month", () => {
    // The long-running incident is in the dataset from 2023 to 2024; it must appear in ONE bucket.
    const { rows } = bucketIncidentsByMonth(
      [incident("long", "2026-01-27T08:00:00", "MAJOR")],
      months,
    );

    expect(rows.map((row) => row.major)).toEqual([1, 0, 0]);
  });

  it("counts only LIVE incidents (in either casing)", () => {
    const { rows } = bucketIncidentsByMonth(
      [
        incident("a", "2026-02-01T00:00:00", "MAJOR", "LIVE"),
        incident("b", "2026-02-02T00:00:00", "MAJOR", "live"),
        incident("c", "2026-02-03T00:00:00", "MAJOR", "DRAFT"),
        incident("d", "2026-02-04T00:00:00", "MAJOR", "PENDING_APPROVAL"),
        incident("e", "2026-02-05T00:00:00", "MAJOR", "REJECTED"),
        incident("f", "2026-02-06T00:00:00", "MAJOR", null),
        // A default parameter swallows an explicit `undefined`, so the missing status is spread in.
        { ...incident("g", "2026-02-07T00:00:00", "MAJOR"), status: undefined },
      ],
      months,
    );

    expect(rows[1]).toEqual({ monthKey: "2026-02", major: 2, minor: 0 });
  });

  it("ignores incidents that started outside the window, such as year-read carry-overs", () => {
    const { rows, otherSeverity } = bucketIncidentsByMonth(
      [
        incident("early", "2025-12-31T23:59:59", "MAJOR"),
        incident("late", "2026-04-01T00:00:00", "MINOR"),
      ],
      months,
    );

    expect(rows.every((row) => row.major === 0 && row.minor === 0)).toBe(true);
    expect(otherSeverity).toBe(0);
  });

  it("collapses an incident returned by both year reads into one", () => {
    // An incident overlapping two calendar years is in both `startYearIncidents` and
    // `endYearIncidents`; counting both would double it.
    const dup = incident("dup", "2026-01-10T08:00:00", "MINOR");

    const { rows } = bucketIncidentsByMonth([dup, { ...dup }], months);

    expect(rows[0]?.minor).toBe(1);
  });

  it("reports approved incidents of other severity separately rather than dropping them silently", () => {
    const { rows, otherSeverity } = bucketIncidentsByMonth(
      [
        incident("o1", "2026-01-05T08:00:00", "OTHERS"),
        incident("o2", "2026-02-05T08:00:00", "OTHERS"),
        incident("o3", "2026-02-06T08:00:00", "OTHERS", "DRAFT"),
      ],
      months,
    );

    expect(otherSeverity).toBe(2);
    expect(rows.every((row) => row.major === 0 && row.minor === 0)).toBe(true);
  });

  it("zero-fills every month so the axis never skips one", () => {
    const { rows } = bucketIncidentsByMonth([], months);

    expect(rows.map((row) => row.monthKey)).toEqual(months);
    expect(rows.every((row) => row.major === 0 && row.minor === 0)).toBe(true);
  });

  it("is empty for an empty window", () => {
    expect(bucketIncidentsByMonth([incident("1", "2026-01-01T00:00:00", "MAJOR")], [])).toEqual({
      rows: [],
      otherSeverity: 0,
    });
  });
});

describe("incident-monthly.util: labels", () => {
  it("names a month in full and in short", () => {
    expect(monthLongLabel("2026-03")).toBe("March 2026");
    expect(monthShortLabel("2026-03")).toBe("Mar");
    // en-US keeps September at three letters; en-GB's newer ICU data says "Sept".
    expect(monthShortLabel("2026-09")).toBe("Sep");
  });

  it("labels in UTC so a viewer's own zone cannot shift the month", () => {
    expect(monthLongLabel("2026-01")).toBe("January 2026");
    expect(monthLongLabel("2026-12")).toBe("December 2026");
  });
});

describe("incident-monthly.util: toMonthlyBars", () => {
  it("scales each bar to the busiest month and splits it by severity share", () => {
    const bars = toMonthlyBars([
      { monthKey: "2026-01", major: 2, minor: 6 },
      { monthKey: "2026-02", major: 1, minor: 3 },
      { monthKey: "2026-03", major: 0, minor: 0 },
    ]);

    expect(bars[0]?.heightPct).toBe(100);
    expect(bars[0]?.majorPct).toBeCloseTo(25);
    expect(bars[0]?.minorPct).toBeCloseTo(75);
    expect(bars[1]?.heightPct).toBe(50);
    expect(bars[1]?.majorPct).toBeCloseTo(12.5);
    expect(bars[1]?.minorPct).toBeCloseTo(37.5);
  });

  it("makes an empty month a zero-height bar, never a sliver", () => {
    const bar = toMonthlyBars([
      { monthKey: "2026-01", major: 5, minor: 5 },
      { monthKey: "2026-02", major: 0, minor: 0 },
    ])[1];

    expect(bar?.heightPct).toBe(0);
    expect(bar?.majorPct).toBe(0);
    expect(bar?.minorPct).toBe(0);
  });

  it("floors a tiny month so a single incident is still visible, with segments summing to the bar", () => {
    const bar = toMonthlyBars([
      { monthKey: "2026-01", major: 50, minor: 50 },
      { monthKey: "2026-02", major: 1, minor: 0 },
    ])[1];

    expect(bar?.heightPct).toBe(MIN_BAR_PERCENT);
    expect((bar?.majorPct ?? 0) + (bar?.minorPct ?? 0)).toBeCloseTo(MIN_BAR_PERCENT);
  });

  it("draws every bar at zero when nothing happened at all", () => {
    const bars = toMonthlyBars([
      { monthKey: "2026-01", major: 0, minor: 0 },
      { monthKey: "2026-02", major: 0, minor: 0 },
    ]);

    expect(bars.map((bar) => bar.heightPct)).toEqual([0, 0]);
  });

  it("words each bar's title with the month, the total and the split", () => {
    const bars = toMonthlyBars([
      { monthKey: "2026-01", major: 2, minor: 1 },
      { monthKey: "2026-02", major: 0, minor: 1 },
      { monthKey: "2026-03", major: 0, minor: 0 },
    ]);

    expect(bars[0]?.title).toBe("January 2026 · 3 incidents · Major 2, Minor 1");
    expect(bars[1]?.title).toBe("February 2026 · 1 incident · Major 0, Minor 1");
    expect(bars[2]?.title).toBe("March 2026 · No incidents");
  });

  it("carries the year on the first column and on every January, so the axis names it", () => {
    const bars = toMonthlyBars(
      monthKeysEndingAt("2026-03", 6).map((monthKey) => ({ monthKey, major: 1, minor: 0 })),
    );

    // 2025-10 .. 2026-03
    expect(bars.map((bar) => bar.yearTick)).toEqual(["2025", null, null, "2026", null, null]);
    expect(bars.map((bar) => bar.tick)).toEqual(["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]);
  });
});

describe("incident-monthly.util: busiestMonth and the summary sentence", () => {
  const rows = [
    { monthKey: "2026-01", major: 1, minor: 1 },
    { monthKey: "2026-02", major: 3, minor: 1 },
    { monthKey: "2026-03", major: 2, minor: 2 },
  ];

  it("names the busiest month, the earliest on a tie", () => {
    expect(busiestMonth(rows)?.monthKey).toBe("2026-02");
  });

  it("is null when every month is empty", () => {
    expect(busiestMonth(rows.map((row) => ({ ...row, major: 0, minor: 0 })))).toBeNull();
    expect(busiestMonth([])).toBeNull();
  });

  it("summarises the window, the totals and the peak", () => {
    expect(monthlyHistorySummary(rows)).toBe(
      "Incidents started per month, January 2026 to March 2026: 6 major and 4 minor. Busiest month: February 2026 with 4 incidents",
    );
  });

  it("drops the peak clause when nothing happened", () => {
    expect(monthlyHistorySummary(rows.map((row) => ({ ...row, major: 0, minor: 0 })))).toBe(
      "Incidents started per month, January 2026 to March 2026: 0 major and 0 minor",
    );
  });

  it("copes with an empty window", () => {
    expect(monthlyHistorySummary([])).toBe("Incidents per month: no months in range");
  });
});
