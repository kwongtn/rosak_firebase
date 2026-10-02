import { METHODOLOGY_CONSTANTS } from "../../../core/methodology/methodology.constants";
import {
  metricDoc,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import type { LineStatusHourBucket } from "./home.queries";
import {
  HEAT_INTENSITY_CLASSES,
  HEAT_INTENSITY_STEPS,
  HISTORY_BUCKETS_PER_DAY,
  MIN_HISTORY_BAR_PERCENT,
  SERVICE_DAY_START_HOUR,
  heatCellClass,
  heatCellTitle,
  heatIntensityClass,
  heatIntensityStep,
  heatLegendEntries,
  historyActiveHours,
  historyBarClass,
  historyBarHeightPct,
  historyBarTitle,
  historyBreakdownPhrase,
  historySummaryLabel,
  historyTotal,
  busiestBucket,
  reportsPhrase,
  serviceHourLabel,
  serviceHourRangeLabel,
} from "./status-history-display.util";
import { PASSENGER_SCALE } from "./status-info.util";

/**
 * 03:00 MYT, the service day's first bucket. Written as UTC +8 rather than a local string so the
 * fixture is the same instant whatever timezone the suite runs in — the formatter under test pins
 * Asia/Kuala_Lumpur explicitly, and a local-time fixture would quietly test the wrong hour.
 */
const HOUR_03 = "2026-09-21T19:00:00+00:00";
const HOUR_04 = "2026-09-21T20:00:00+00:00";
const HOUR_05 = "2026-09-21T21:00:00+00:00";

function bucket(
  count: number,
  overrides: Partial<LineStatusHourBucket> = {},
): LineStatusHourBucket {
  return {
    hourStart: HOUR_03,
    hourEnd: HOUR_04,
    count,
    dominantStatus: count > 0 ? "NORMAL" : null,
    statusCounts: count > 0 ? [{ status: "NORMAL", count }] : [],
    ...overrides,
  };
}

describe("status-history-display.util: hour labels", () => {
  it("labels an hour in Malaysia time, not the viewer's own zone", () => {
    // 19:00 UTC IS 03:00 the next day in MYT. A viewer in, say, UTC+0 must still line the bar up with
    // the hour the backend bucketed it into, which is why the formatter pins the zone rather than
    // reading the runtime's.
    expect(serviceHourLabel(HOUR_03)).toBe("03");
    expect(serviceHourLabel(HOUR_05)).toBe("05");
  });

  it("renders a bucket as the range a reader reads it as", () => {
    expect(serviceHourRangeLabel(HOUR_03, HOUR_04)).toBe("03:00–04:00");
    // The range's END label comes from the next bucket's start, so the service day's last bucket
    // reads "01:00–02:00" rather than rolling over into a "24" the reader has never seen.
    expect(serviceHourRangeLabel("2026-09-21T17:00:00+00:00", "2026-09-21T18:00:00+00:00")).toBe(
      "01:00–02:00",
    );
  });

  it("pluralises the one phrase every history surface shares", () => {
    expect(reportsPhrase(0)).toBe("0 reports");
    expect(reportsPhrase(1)).toBe("1 report");
    expect(reportsPhrase(2)).toBe("2 reports");
  });
});

describe("status-history-display.util: bar height", () => {
  it("scales to the busiest hour in the SAME series and never to a constant", () => {
    // A self-relative scale is what lets a quiet network render as a quiet network; an absolute one
    // would flatten every widget to hairlines the moment a busy hour leaves the window.
    expect(historyBarHeightPct(10, 10)).toBe(100);
    expect(historyBarHeightPct(5, 10)).toBe(50);
    expect(historyBarHeightPct(1, 10)).toBe(10);
  });

  it("gives a lone report a visible stub instead of a hairline", () => {
    // Without the floor, one report against a hundred renders sub-pixel and reads as "nothing".
    // The floor owns everything up to it, including a true 6%: 6% of the bar and "the floor" are the
    // same height, so the visible difference starts above it.
    expect(historyBarHeightPct(1, 100)).toBe(MIN_HISTORY_BAR_PERCENT);
    expect(historyBarHeightPct(5, 100)).toBe(MIN_HISTORY_BAR_PERCENT);
    expect(historyBarHeightPct(10, 100)).toBe(10);
    expect(historyBarHeightPct(20, 100)).toBe(20);
  });

  it("draws an empty hour at zero, because 'nobody reported' is not a sliver of activity", () => {
    expect(historyBarHeightPct(0, 10)).toBe(0);
    expect(historyBarHeightPct(0, 0)).toBe(0);
    // A division by zero must not be what decides whether the page renders.
    expect(Number.isNaN(historyBarHeightPct(5, 0))).toBe(false);
    expect(historyBarHeightPct(5, 0)).toBe(0);
  });
});

describe("status-history-display.util: one bucket's label", () => {
  it("carries the range, the total and the per-status tally in one string", () => {
    const title = historyBarTitle(
      bucket(4, {
        dominantStatus: "BUSY",
        statusCounts: [
          { status: "BUSY", count: 1 },
          { status: "CROWDED", count: 3 },
        ],
      }),
    );

    expect(title).toBe("03:00–04:00 · 4 reports · Busy 1, Crowded 3");
  });

  it("singularises a single report in the label", () => {
    expect(historyBarTitle(bucket(1))).toBe("03:00–04:00 · 1 report · Normal 1");
  });

  it("omits the tally for an hour nobody reported, rather than inventing one", () => {
    expect(historyBarTitle(bucket(0))).toBe("03:00–04:00 · 0 reports");
    expect(historyBreakdownPhrase(bucket(0))).toBe("");
  });

  it("falls back to the dominant status when the tallies somehow sum to nothing", () => {
    // Defensive: `statusCounts: []` with a non-zero `count` should not happen, but if it does the
    // hour's tooltip must still say what it was rather than lose its only description.
    expect(historyBreakdownPhrase(bucket(2, { dominantStatus: "DELAYED", statusCounts: [] }))).toBe(
      "Delayed 2",
    );
  });

  it("drops zero tallies the way the backend already does", () => {
    expect(
      historyBreakdownPhrase(
        bucket(3, {
          statusCounts: [
            { status: "NORMAL", count: 0 },
            { status: "DELAYED", count: 3 },
          ],
        }),
      ),
    ).toBe("Delayed 3");
  });

  it("colours an hour by its dominant status and an unreported hour as no data", () => {
    expect(historyBarClass(bucket(2, { dominantStatus: "DISRUPTED" }))).toBe("bg-rose-600");
    expect(historyBarClass(bucket(0))).toBe("bg-muted");
  });
});

describe("status-history-display.util: series totals", () => {
  const day = [
    bucket(4, { hourStart: HOUR_03, hourEnd: HOUR_04 }),
    bucket(0, { hourStart: HOUR_04, hourEnd: HOUR_05 }),
    bucket(2, { hourStart: HOUR_05, hourEnd: "2026-09-21T22:00:00+00:00" }),
  ];

  it("sums the day's reports and counts only the hours that had any", () => {
    expect(historyTotal(day)).toBe(6);
    expect(historyActiveHours(day)).toBe(2);
    expect(historyTotal([])).toBe(0);
    expect(historyActiveHours([])).toBe(0);
  });

  it("names the earliest hour when two hours tie for the peak", () => {
    // The answer a human gives to "when was it busiest today" is the first such hour, and picking
    // the last one would make the same service day report a different peak depending on the tie.
    const tied = [
      bucket(5, { hourStart: HOUR_03, hourEnd: HOUR_04 }),
      bucket(5, { hourStart: HOUR_05, hourEnd: "2026-09-21T22:00:00+00:00" }),
    ];
    expect(busiestBucket(tied)?.hourStart).toBe(HOUR_03);
    expect(busiestBucket(day)?.hourStart).toBe(HOUR_03);
  });

  it("reports no peak at all for a day with nothing in it", () => {
    expect(busiestBucket([])).toBeNull();
    expect(busiestBucket([bucket(0), bucket(0)])).toBeNull();
  });

  it("summarises a series as one sentence a screen reader can use", () => {
    const label = historySummaryLabel(day, "Rider reports for this line");

    // What, which window, how much, and when the peak was — the four facts the bars and the
    // tooltips convey between them. A screen reader must not be handed 24 disconnected hours.
    expect(label).toContain("Rider reports for this line");
    expect(label).toContain("service day 03:00 to 02:00");
    expect(label).toContain("6 reports in 2 of 24 hours");
    expect(label).toContain("Busiest hour 03:00–04:00");
  });

  it("gives an empty day its own sentence instead of '0 reports in 0 hours'", () => {
    // "0 reports in 0 hours" reads as a measurement; the honest answer is that there is nothing yet.
    expect(historySummaryLabel([], "Rider reports for this line")).toBe(
      "No rider reports in this service day yet.",
    );
  });

  it("lets a caller own the empty sentence, so two scopes cannot read identically", () => {
    expect(historySummaryLabel([], "Rider reports for this line", "Nothing reported yet.")).toBe(
      "Nothing reported yet.",
    );
  });
});

describe("status-history-display.util: the heat grid's two dimensions", () => {
  it("gives a zero cell the muted track and no opacity at all", () => {
    // "No reports" and "one report" must never look the same, so the empty cell is not a faint tint.
    expect(heatCellClass(0, 10, "DISRUPTED")).toBe("bg-muted");
    expect(heatCellClass(0, 10, "DISRUPTED")).not.toContain("opacity-");
  });

  it("colours a populated cell by its dominant status and scales its strength to the grid's peak", () => {
    expect(heatCellClass(10, 10, "DISRUPTED")).toBe("bg-rose-600 opacity-100");
    expect(heatCellClass(1, 10, "BUSY")).toContain("bg-blue-500");
    expect(heatCellClass(1, 10, "BUSY")).toContain("opacity-");
    // Never darker than the peak, whatever a malformed count claims.
    expect(heatCellClass(99, 10, "BUSY")).toBe(heatCellClass(10, 10, "BUSY"));
  });

  it("walks the ladder monotonically, so more reports never render fainter", () => {
    const steps = [1, 2, 4, 6, 10].map((count) => heatIntensityClass(heatIntensityStep(count, 10)));
    const indexes = [1, 2, 4, 6, 10].map((count) => heatIntensityStep(count, 10));

    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    expect(new Set(steps).size).toBeGreaterThan(1);
    expect(steps[steps.length - 1]).toBe(HEAT_INTENSITY_CLASSES[HEAT_INTENSITY_CLASSES.length - 1]);
  });

  it("survives a zero peak without dividing by it", () => {
    expect(Number.isNaN(heatIntensityStep(3, 0))).toBe(false);
    expect(heatIntensityStep(3, 0)).toBe(0);
    expect(heatIntensityClass(0)).toBe("");
  });

  it("names a cell with its line, its hour, its total and its tally", () => {
    expect(
      heatCellTitle(
        "KJL",
        bucket(2, {
          dominantStatus: "DELAYED",
          statusCounts: [{ status: "DELAYED", count: 2 }],
        }),
      ),
    ).toBe("KJL · 03:00–04:00 · 2 reports · Delayed 2");
  });

  it("lists the legend in the backend's own severity order", () => {
    expect(heatLegendEntries().map((entry) => entry.status)).toEqual(PASSENGER_SCALE);
  });
});

describe("status-history-display.util: the published constants", () => {
  it("mirrors the service-day shape the backend buckets into", () => {
    // The registry numbers are what a widget's LABEL says; these are what the backend actually
    // returns. A drift here means a chart that quietly lies about its own window.
    expect(SERVICE_DAY_START_HOUR).toBe(METHODOLOGY_CONSTANTS["SERVICE_DAY_START_HOUR"].value);
    expect(HISTORY_BUCKETS_PER_DAY).toBe(METHODOLOGY_CONSTANTS["SERVICE_DAY_HOURS"].value);
    expect(HEAT_INTENSITY_STEPS).toBe(METHODOLOGY_CONSTANTS["HEAT_INTENSITY_STEPS"].value);
  });

  it("publishes the ladder the heat grid draws", () => {
    expect(HEAT_INTENSITY_CLASSES).toHaveLength(HEAT_INTENSITY_STEPS);
    // Tailwind v4 compiles what it finds as literal text, so an interpolated class would never be
    // emitted. Every rung must therefore be a real, spelled-out utility.
    for (const utility of HEAT_INTENSITY_CLASSES) {
      expect(utility).toMatch(/^opacity-\d+$/);
    }
  });

  it("resolves the service-day tokens inside the history definitions", () => {
    // The rendered sentences must name the SAME window the code labels — the sparkline's copy
    // states both endpoints of it, the row strip's reuses the sparkline's rather than restating the
    // start hour a second time.
    const sparkline = renderMethodologyCopy(metricDoc("network.activity-sparkline").definition);
    expect(sparkline).not.toContain("{{");
    expect(sparkline).toContain(`${SERVICE_DAY_START_HOUR}:00`);
    expect(sparkline).toContain(String(HISTORY_BUCKETS_PER_DAY));

    const strip = renderMethodologyCopy(metricDoc("network.line-history-strip").definition);
    expect(strip).not.toContain("{{");
    expect(strip).toContain(String(HISTORY_BUCKETS_PER_DAY));
  });

  it("resolves the intensity-ladder token in the heat grid's own definition", () => {
    const rendered = renderMethodologyCopy(metricDoc("network.heat-strip").definition);
    expect(rendered).not.toContain("{{");
    expect(rendered).toContain(`${HEAT_INTENSITY_STEPS} steps`);
  });
});
