import { describe, expect, it } from "vitest";

import {
  HISTORY_MONTHS,
  bucketSeverityCountsByMonth,
  busiestMonth,
  historyDateBounds,
  monthKeysEndingAt,
  monthLongLabel,
  monthShortLabel,
  monthlyHistorySummary,
  toMonthlyBars,
  yAxisTicks,
} from "./incident-monthly.util";
import type { SeverityCountRow } from "./insiden-history.queries";

/** One row of `calendarIncidentsBySeverityCount(groupBy: MONTH)`: `date` is the first of the month. */
function countRow(severity: string, date: string, count: number): SeverityCountRow {
  return { severity, date, count };
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

describe("incident-monthly.util: historyDateBounds", () => {
  it("runs from 1 January of the first month's year to 31 December of the last month's", () => {
    // 2025-04 .. 2026-03 touches two calendar years, so the read spans both of them whole.
    expect(historyDateBounds(monthKeysEndingAt("2026-03"))).toEqual({
      startDate: "2025-01-01",
      endDate: "2026-12-31",
    });
  });

  it("is one calendar year when the window ends in December", () => {
    expect(historyDateBounds(monthKeysEndingAt("2026-12"))).toEqual({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
  });

  it("starts in the previous year when the window ends in January", () => {
    // 2025-02 .. 2026-01.
    expect(historyDateBounds(monthKeysEndingAt("2026-01"))).toEqual({
      startDate: "2025-01-01",
      endDate: "2026-12-31",
    });
  });

  it("asks the same question for every month of one pair of years, which is what lets paging re-bucket", () => {
    // January to November 2026 all begin in 2025 and end in 2026; December 2026 is a different pair.
    const pair = historyDateBounds(monthKeysEndingAt("2026-01"));
    for (let month = 2; month <= 11; month++) {
      const endMonth = `2026-${String(month).padStart(2, "0")}`;
      expect(historyDateBounds(monthKeysEndingAt(endMonth))).toEqual(pair);
    }
    expect(historyDateBounds(monthKeysEndingAt("2026-12"))).not.toEqual(pair);
  });

  it("keeps a year below 1000 four digits wide, as the backend's Date needs", () => {
    expect(historyDateBounds(monthKeysEndingAt("0999-12"))).toEqual({
      startDate: "0999-01-01",
      endDate: "0999-12-31",
    });
  });

  it("is null for an empty window", () => {
    expect(historyDateBounds([])).toBeNull();
  });
});

describe("incident-monthly.util: bucketSeverityCountsByMonth", () => {
  const months = monthKeysEndingAt("2026-03", 3); // 2026-01, 2026-02, 2026-03

  it("puts each row's count on its month, split by severity", () => {
    const { rows, otherSeverity } = bucketSeverityCountsByMonth(
      [
        countRow("MAJOR", "2026-01-01", 1),
        countRow("MINOR", "2026-01-01", 2),
        countRow("MAJOR", "2026-03-01", 4),
      ],
      months,
    );

    expect(rows).toEqual([
      { monthKey: "2026-01", major: 1, minor: 2 },
      { monthKey: "2026-02", major: 0, minor: 0 },
      { monthKey: "2026-03", major: 4, minor: 0 },
    ]);
    expect(otherSeverity).toBe(0);
  });

  it("zero-fills a month that has no row, because the aggregate leaves empty months out", () => {
    const { rows } = bucketSeverityCountsByMonth(
      [countRow("MINOR", "2026-01-01", 3), countRow("MAJOR", "2026-03-01", 1)],
      months,
    );

    expect(rows[1]).toEqual({ monthKey: "2026-02", major: 0, minor: 0 });
  });

  it("gives every month of the axis a row even when the server answers with none", () => {
    const { rows, otherSeverity } = bucketSeverityCountsByMonth([], months);

    expect(rows.map((row) => row.monthKey)).toEqual(months);
    expect(rows.every((row) => row.major === 0 && row.minor === 0)).toBe(true);
    expect(otherSeverity).toBe(0);
  });

  it("takes each month's own count, never an accumulation of the months before it", () => {
    // The shape of the old backend defect: a running total would read 4, 5, 7.
    const { rows } = bucketSeverityCountsByMonth(
      [
        countRow("MAJOR", "2026-01-01", 4),
        countRow("MAJOR", "2026-02-01", 1),
        countRow("MAJOR", "2026-03-01", 2),
      ],
      months,
    );

    expect(rows.map((row) => row.major)).toEqual([4, 1, 2]);
  });

  it("fills a window across two calendar years, each January on its own count", () => {
    const sixMonths = monthKeysEndingAt("2026-03", 6); // 2025-10 .. 2026-03
    const { rows } = bucketSeverityCountsByMonth(
      [
        countRow("MAJOR", "2025-10-01", 3),
        countRow("MINOR", "2025-12-01", 2),
        countRow("MAJOR", "2026-01-01", 1),
        countRow("MINOR", "2026-01-01", 1),
        countRow("MAJOR", "2026-03-01", 5),
      ],
      sixMonths,
    );

    expect(rows).toEqual([
      { monthKey: "2025-10", major: 3, minor: 0 },
      { monthKey: "2025-11", major: 0, minor: 0 },
      { monthKey: "2025-12", major: 0, minor: 2 },
      { monthKey: "2026-01", major: 1, minor: 1 },
      { monthKey: "2026-02", major: 0, minor: 0 },
      { monthKey: "2026-03", major: 5, minor: 0 },
    ]);
  });

  it("ignores a row outside the window, even the same month of another year", () => {
    // The read spans whole calendar years, so rows from the months either side of the window come
    // back. February 2025 shares a month NUMBER with February 2026 and must not land in its bar.
    const { rows, otherSeverity } = bucketSeverityCountsByMonth(
      [
        countRow("MAJOR", "2025-02-01", 9),
        countRow("MAJOR", "2025-12-01", 9),
        countRow("MINOR", "2026-04-01", 9),
        countRow("OTHERS", "2025-01-01", 9),
      ],
      months,
    );

    expect(rows.every((row) => row.major === 0 && row.minor === 0)).toBe(true);
    expect(otherSeverity).toBe(0);
  });

  it("sums rows that repeat a month and severity instead of keeping the last", () => {
    const { rows } = bucketSeverityCountsByMonth(
      [countRow("MAJOR", "2026-02-01", 2), countRow("MAJOR", "2026-02-01", 3)],
      months,
    );

    expect(rows[1]?.major).toBe(5);
  });

  it("reports OTHERS and any unrecognised severity as other severity, inside the window only", () => {
    const { rows, otherSeverity } = bucketSeverityCountsByMonth(
      [
        countRow("OTHERS", "2026-01-01", 2),
        countRow("SEVERE", "2026-02-01", 1),
        countRow("OTHERS", "2025-06-01", 4),
      ],
      months,
    );

    expect(otherSeverity).toBe(3);
    expect(rows.every((row) => row.major === 0 && row.minor === 0)).toBe(true);
  });

  it("is empty for an empty window", () => {
    expect(bucketSeverityCountsByMonth([countRow("MAJOR", "2026-01-01", 1)], [])).toEqual({
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

  it("never lifts a small month above its share: one incident against a hundred is one percent", () => {
    // A percentage floor would have drawn this at 6 %, taller than the y axis says it is. A sliver
    // too thin to see is the view's to widen in pixels, not the number's.
    const bar = toMonthlyBars([
      { monthKey: "2026-01", major: 50, minor: 50 },
      { monthKey: "2026-02", major: 1, minor: 0 },
    ])[1];

    expect(bar?.heightPct).toBeCloseTo(1);
    expect(bar?.majorPct).toBeCloseTo(1);
    expect(bar?.minorPct).toBe(0);
  });

  it("keeps the segments summing to exactly the bar", () => {
    const bar = toMonthlyBars([
      { monthKey: "2026-01", major: 7, minor: 5 },
      { monthKey: "2026-02", major: 1, minor: 2 },
    ])[1];

    expect((bar?.majorPct ?? 0) + (bar?.minorPct ?? 0)).toBeCloseTo(bar?.heightPct ?? -1);
    expect(bar?.heightPct).toBeCloseTo(25);
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

describe("incident-monthly.util: yAxisTicks", () => {
  it("labels the top, the middle and zero when the busiest count has a whole half", () => {
    expect(yAxisTicks(2)).toEqual([2, 1, 0]);
    expect(yAxisTicks(8)).toEqual([8, 4, 0]);
    expect(yAxisTicks(40)).toEqual([40, 20, 0]);
  });

  it("leaves the middle unlabelled for an odd count rather than rounding it into a lie", () => {
    // The middle gridline of a count of 3 is at 1.5; "2" would claim a value that line is not at.
    expect(yAxisTicks(3)).toEqual([3, 0]);
    expect(yAxisTicks(7)).toEqual([7, 0]);
  });

  it("is just the count and zero for a single incident", () => {
    expect(yAxisTicks(1)).toEqual([1, 0]);
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
