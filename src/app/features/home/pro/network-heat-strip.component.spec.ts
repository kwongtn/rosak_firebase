import { PLATFORM_ID, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  metricDoc,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import type { LineStatusHourBucket } from "../data/home.queries";
import type { LinePulse } from "../data/home.queries";
import { HomeStore } from "../data/home.store";
import { HEAT_INTENSITY_CLASSES } from "../data/status-history-display.util";
import { NetworkHeatStripComponent } from "./network-heat-strip.component";

/** 03:00 MYT — the service day's first bucket. UTC+8 so the fixture is the same instant everywhere. */
const HOUR_03 = "2026-09-21T19:00:00+00:00";

/** An instant INSIDE bucket 0 (03:30 MYT on the fixture's day) — the "now" the fake clock is set to. */
const NOW_IN_HOUR_3 = new Date(new Date(HOUR_03).getTime() + 30 * 60_000);

function hour(
  count: number,
  index = 0,
  overrides: Partial<LineStatusHourBucket> = {},
): LineStatusHourBucket {
  const base = new Date(HOUR_03).getTime();
  return {
    hourStart: new Date(base + index * 3600_000).toISOString(),
    hourEnd: new Date(base + (index + 1) * 3600_000).toISOString(),
    count,
    dominantStatus: count > 0 ? "NORMAL" : null,
    statusCounts: count > 0 ? [{ status: "NORMAL", count }] : [],
    ...overrides,
  };
}

/** A full 24-hour day; `counts` is one entry per hour. */
function day(counts: number[]): LineStatusHourBucket[] {
  return Array.from({ length: 24 }, (_unused, index) =>
    hour(counts[index] ?? 0, index, {
      dominantStatus: (counts[index] ?? 0) > 0 ? "NORMAL" : null,
      statusCounts:
        (counts[index] ?? 0) > 0 ? [{ status: "NORMAL", count: counts[index] ?? 0 }] : [],
    }),
  );
}

function makeLine(overrides: Partial<LinePulse> = {}): LinePulse {
  return {
    id: "line-1",
    code: "KJL",
    displayName: "Kelana Jaya Line",
    displayColor: "#e11d48",
    status: "ACTIVE",
    inServiceVehicleCount: 12,
    totalVehicleCount: 16,
    passengerStatus: "NORMAL",
    passengerStatusMessage: null,
    statusReportCount: 0,
    vehicleStatusCounts: [],
    passengerStatusCount: 0,
    statusWindowMinutes: 15,
    pulseLinks: [],
    ...overrides,
  };
}

function textOf(root: HTMLElement, testId: string): string {
  return (root.querySelector(`[data-testid="${testId}"]`)?.textContent ?? "").trim();
}

describe("NetworkHeatStripComponent", () => {
  let fixture: ComponentFixture<NetworkHeatStripComponent>;
  let lines: ReturnType<typeof signal<LinePulse[]>>;
  let historyByLine: Map<string, LineStatusHourBucket[]>;
  let failed: ReturnType<typeof signal<boolean>>;
  let refreshTick: ReturnType<typeof signal<number>>;
  let requestHistoryReads: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    lines = signal<LinePulse[]>([makeLine({ id: "a", code: "KJL" })]);
    historyByLine = new Map();
    failed = signal(false);
    refreshTick = signal(0);
    requestHistoryReads = vi.fn();

    await TestBed.configureTestingModule({
      imports: [NetworkHeatStripComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: HomeStore,
          useValue: {
            lines,
            // The grid reads `visibleLines` so it is always the SAME set of lines the board beside it
            // draws — under the Pro filters too. A mock offering only `lines` would pass every
            // assertion here while the real component threw on the first compute.
            visibleLines: lines,
            linesHistoryFailed: failed,
            // The current-hour glow's refresh effect reads this signal, so a mock without it throws on
            // the first effect run rather than failing one narrow assertion.
            linesRefreshTick: refreshTick,
            requestHistoryReads,
            linesHistoryFor: (lineId: string) => historyByLine.get(lineId) ?? [],
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NetworkHeatStripComponent);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function render(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  /**
   * `afterNextRender` seeds the clock, and the popover's placement runs in an effect that needs the
   * panel in the DOM first — so this is detect → settle → detect, the `home-refresh-control` spec's
   * own `render()`.
   */
  async function renderSettled(): Promise<HTMLElement> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function cells(root: HTMLElement): HTMLElement[] {
    return [...root.querySelectorAll<HTMLElement>('[data-testid="heat-cell"]')];
  }

  it("asks the store for the per-line read it shares with the row strips", () => {
    render();
    expect(requestHistoryReads).toHaveBeenCalledTimes(1);
  });

  it("draws one row per line and 24 cells per row", () => {
    lines.set([makeLine({ id: "a", code: "KJL" }), makeLine({ id: "b", code: "SPL" })]);
    historyByLine.set("a", day([3, 0, 1]));
    historyByLine.set("b", day([0, 0, 5]));
    const root = render();

    const rows = root.querySelectorAll('[data-testid="heat-row"]');
    expect(rows).toHaveLength(2);
    expect(
      [...root.querySelectorAll('[data-testid="heat-row-code"]')].map((n) => n.textContent?.trim()),
    ).toEqual(["KJL", "SPL"]);
    // 24 columns for EVERY line: the whole point is the hour axis lining up down the grid.
    expect(cells(root)).toHaveLength(48);
  });

  it("gives a line with NO buckets its own 24 grey no-data cells, not a blank strip", () => {
    // 🔴 The bug this pins: cells were mapped off each line's OWN buckets, so a line the backend
    // returned `buckets: []` for ("nothing reported about this line today") rendered no cells at all —
    // a blank strip that reads as a rendering fault and silently breaks the column alignment every
    // other row depends on. The columns now come from a template line, so a missing hour is a cell.
    lines.set([
      makeLine({ id: "a", code: "KJL" }),
      makeLine({ id: "b", code: "SPL" }),
      makeLine({ id: "c", code: "KEL" }),
    ]);
    historyByLine.set("a", day([3, 0, 1]));
    historyByLine.set("b", []);
    historyByLine.set("c", day([0, 2]));
    const root = render();

    const rows = [...root.querySelectorAll('[data-testid="heat-row"]')];
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.querySelectorAll('[data-testid="heat-cell"]').length)).toEqual([
      24, 24, 24,
    ]);

    const emptyRow = cells(root).slice(24, 48);
    // Every one is flagged, and every one is the muted no-data track.
    expect(emptyRow.every((cell) => cell.getAttribute("data-empty") === "")).toBe(true);
    expect(emptyRow.every((cell) => cell.className.includes("bg-muted"))).toBe(true);
    // …and the lines that DID report are not flagged: "no data" and "nobody reported in this hour"
    // are different facts, and only the former may claim the grey box means nothing was returned.
    expect(
      cells(root)
        .slice(0, 24)
        .some((cell) => cell.hasAttribute("data-empty")),
    ).toBe(false);
    // The gutter's own tally still reads 0 for a line with nothing, and the grid keeps its scale.
    expect(textOf(root, "heat-scale")).toBe("3 peak");
  });

  it("scales EVERY row to the busiest cell on screen, so the lines can be compared", () => {
    lines.set([makeLine({ id: "a", code: "KJL" }), makeLine({ id: "b", code: "SPL" })]);
    historyByLine.set("a", day([1]));
    historyByLine.set("b", day([9]));
    const root = render();

    const all = cells(root);
    const kjl = all[0];
    const spl = all[24];
    expect(kjl?.className).toContain("bg-emerald-500");
    expect(spl?.className).toContain("opacity-100");
    // The load-bearing assertion: a per-row scale would give both cells the SAME strength, and the
    // comparison between lines — the entire reason this widget exists — would be impossible.
    expect(kjl?.className).not.toBe(spl?.className);
    expect(kjl?.className).not.toContain("opacity-100");
  });

  it("carries two readings per cell: the status colour and the count", () => {
    lines.set([makeLine({ id: "a", code: "KJL" })]);
    // Hand-built rather than derived, so the ONE disrupted hour in this day is unambiguous.
    historyByLine.set(
      "a",
      Array.from({ length: 24 }, (_unused, index) =>
        index === 1
          ? hour(4, 1, {
              dominantStatus: "DISRUPTED",
              statusCounts: [{ status: "DISRUPTED", count: 4 }],
            })
          : hour(0, index),
      ),
    );
    const root = render();

    const all = cells(root);
    // 03:00 is quiet, 04:00 was disrupted with four reports.
    expect(all[0]?.className).toContain("bg-muted");
    expect(all[0]?.className).not.toContain("opacity-");
    expect(all[1]?.className).toContain("bg-rose-600");
    expect(all[1]?.className).toContain("opacity-100");
    // 🔴 No native title any more: a browser-default tooltip cannot carry a per-status breakdown, and
    // 24 of them per row each blocking on hover is not a detail path. The popover replaces it.
    expect(all[1]?.hasAttribute("title")).toBe(false);
  });

  it("shows each line's code whole, and names it on hover", () => {
    lines.set([makeLine({ id: "a", code: "KJL", displayName: "Kelana Jaya Line" })]);
    historyByLine.set("a", day([1]));
    const root = render();

    const code = root.querySelector<HTMLElement>('[data-testid="heat-row-code"]');
    const classes = code?.className.split(/\s+/);
    expect(classes).toContain("w-20");
    // `truncate` at this width cut long codes into an unreadable stub ("AMP…"), and the code is what
    // identifies the row — the full name is on hover instead, where there is room for it.
    expect(classes).not.toContain("truncate");
    expect(code?.textContent?.trim()).toBe("KJL");
    expect(code?.getAttribute("title")).toBe("Kelana Jaya Line");
  });

  it("labels every OTHER hour on the axis, aligned with the same gutters as the rows", () => {
    lines.set([makeLine({ id: "a", code: "KJL" })]);
    historyByLine.set("a", day([2]));
    const root = render();

    const axis = root.querySelector('[data-testid="heat-axis"]');
    expect(axis?.getAttribute("aria-hidden")).toBe("true");
    const ticks = [...(axis?.querySelectorAll("span.flex-1") ?? [])];
    // 24 columns, labelled on alternate ones only — a label per column collides at this cell width,
    // and a collided axis is worse than a sparse one.
    expect(ticks).toHaveLength(24);
    expect(ticks.filter((tick) => (tick.textContent ?? "").trim() !== "")).toHaveLength(12);
    expect(ticks[0]?.textContent?.trim()).toBe("03");
    expect(ticks[1]?.textContent?.trim()).toBe("");
    expect(ticks[2]?.textContent?.trim()).toBe("05");
    expect(ticks[2]?.className).toContain("tabular-nums");
    // The gutter has to be the ROW's, or the axis describes columns that sit nowhere.
    expect(axis?.querySelector("span.w-20")).not.toBeNull();
    expect(axis?.querySelector("span.w-7")).not.toBeNull();
    expect(root.querySelector('[data-testid="heat-row-code"]')?.className).toContain("w-20");
  });

  it("opens ONE popover on hover with the hour and its breakdown, and closes it on leave", async () => {
    lines.set([makeLine({ id: "a", code: "KJL", displayName: "Kelana Jaya Line" })]);
    historyByLine.set(
      "a",
      Array.from({ length: 24 }, (_unused, index) =>
        index === 1
          ? hour(4, 1, {
              dominantStatus: "CROWDED",
              statusCounts: [
                { status: "BUSY", count: 1 },
                { status: "CROWDED", count: 3 },
              ],
            })
          : hour(0, index),
      ),
    );
    const root = await renderSettled();

    expect(root.querySelectorAll('[data-testid="heat-popover"]')).toHaveLength(0);

    cells(root)[1].dispatchEvent(new MouseEvent("mouseenter"));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // 🔴 Exactly one panel for the whole grid — 24 native titles per row replaced by one, never more.
    const panels = root.querySelectorAll<HTMLElement>('[data-testid="heat-popover"]');
    expect(panels).toHaveLength(1);
    const panel = panels[0];
    const text = panel.textContent?.replace(/\s+/g, " ").trim() ?? "";
    expect(text).toContain("Kelana Jaya Line (KJL)");
    expect(text).toContain("04:00–05:00");
    expect(text).toContain("4 reports");
    expect(text).toContain("Crowded 3");
    expect(text).toContain("Busy 1");
    // The status dots are the legend's own colours, so a cell and its breakdown cannot disagree.
    expect(panel.querySelectorAll("span.size-2.rounded-full")).toHaveLength(2);
    expect(panel.querySelectorAll("span.size-2.rounded-full")[0]?.className).toContain(
      "bg-blue-500",
    );
    expect(panel.querySelectorAll("span.size-2.rounded-full")[1]?.className).toContain(
      "bg-amber-500",
    );
    // `aria-hidden` + `pointer-events-none`: the row's own `role="img"` sentence remains the only
    // accessible reading, and the panel can never swallow the pointer that opened it.
    expect(panel.getAttribute("aria-hidden")).toBe("true");
    expect(panel.className).toContain("pointer-events-none");
    // Measured placement, not a guessed percentage: `left`/`top` are written in pixels from
    // `getBoundingClientRect` against the grid wrapper. jsdom reports every rect as zero, so the
    // assertion is that the placement PASS RAN (the panel became visible) rather than the numbers.
    expect(panel.style.visibility).toBe("");
    expect(panel.getAttribute("style")).toContain("left:");
    expect(panel.getAttribute("style")).toContain("top:");
    // A reported hour shows its tally, not the empty-breakdown line.
    expect(text).not.toContain("No reports");

    // The pointer leaving the grid container clears it. On the container rather than on the cell,
    // so crossing BETWEEN cells does not blink the panel away.
    root
      .querySelector<HTMLElement>('[data-testid="heat-grid"]')
      ?.dispatchEvent(new MouseEvent("mouseleave"));
    fixture.detectChanges();
    expect(root.querySelectorAll('[data-testid="heat-popover"]')).toHaveLength(0);
  });

  it("says 'No reports' for an hour nobody reported in", async () => {
    lines.set([makeLine({ id: "a", code: "KJL" })]);
    historyByLine.set("a", day([0]));
    const root = await renderSettled();

    cells(root)[0].dispatchEvent(new MouseEvent("mouseenter"));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = root
      .querySelector('[data-testid="heat-popover"]')
      ?.textContent?.replace(/\s+/g, " ")
      .trim();
    expect(text).toContain("03:00–04:00");
    expect(text).toContain("0 reports");
    expect(text).toContain("No reports");
    expect(text).not.toContain("Normal");
  });

  it("names each row to assistive tech in ONE sentence, with the cells hidden", () => {
    lines.set([makeLine({ id: "a", code: "KJL" })]);
    historyByLine.set("a", day([2, 0, 5]));
    const root = render();

    const row = root.querySelector('[data-testid="heat-row"]');
    // Per row rather than one summary for the grid: the comparison BETWEEN lines is what this widget
    // is for, and a single sentence would hide exactly that.
    expect(row?.getAttribute("role")).toBe("img");
    const label = row?.getAttribute("aria-label") ?? "";
    expect(label).toContain("Line KJL");
    expect(label).toContain("7 reports in 2 of 24 hours");
    expect(label).toContain("Busiest hour 05:00–06:00");

    for (const cell of root.querySelectorAll('[data-testid="heat-cell"]')) {
      expect(cell.getAttribute("aria-hidden")).toBe("true");
    }
    expect(
      root.querySelector('[data-testid="network-heat-strip"]')?.getAttribute("role"),
    ).toBeNull();
    // Inside the positioning wrapper (the hover panel's context), not a direct child of the section.
    expect(
      root
        .querySelector('[data-testid="heat-grid"] > div[role="group"]')
        ?.getAttribute("aria-label"),
    ).toContain("Reports by line and hour");
  });

  it("shows the row's own tally beside its code", () => {
    lines.set([makeLine({ id: "a", code: "KJL" }), makeLine({ id: "b", code: "SPL" })]);
    historyByLine.set("a", day([1, 2]));
    historyByLine.set("b", day([0]));
    const root = render();

    expect(
      [...root.querySelectorAll('[data-testid="heat-row-total"]')].map((n) =>
        n.textContent?.trim(),
      ),
    ).toEqual(["3", "0"]);
    // The peak is the busiest SINGLE CELL on screen (the grid's shared scale), not the busiest row's
    // total — which is exactly the number the intensity ramp is measured against.
    expect(textOf(root, "heat-scale")).toBe("2 peak");
  });

  it("publishes a legend naming every status, plus the intensity ramp", () => {
    lines.set([makeLine({ id: "a", code: "KJL" })]);
    historyByLine.set("a", day([2]));
    const root = render();

    const legend = root.querySelector('[data-testid="heat-legend"]');
    // A reader can NAME a cell rather than guess: the key is the backend's severity order.
    expect(legend?.textContent).toContain("Normal");
    expect(legend?.textContent).toContain("Extremely Crowded");
    expect(legend?.textContent).toContain("Disrupted");
    expect(legend?.textContent).toContain("0 to 2 reports");
    // The ramp is spelled out, because Tailwind v4 compiles only literal class names it can see.
    for (const utility of HEAT_INTENSITY_CLASSES) {
      expect(legend?.querySelector(`.${utility}`)).not.toBeNull();
    }
  });

  it("publishes its definition from the methodology registry, never a literal", () => {
    lines.set([makeLine({ id: "a", code: "KJL" })]);
    historyByLine.set("a", day([2]));
    const root = render();

    const trigger = root
      .querySelector('[data-testid="network-heat-strip"]')
      ?.querySelector("button");
    trigger?.click();
    fixture.detectChanges();

    const panel = root.querySelector('[data-testid="network-heat-strip-popover"]');
    expect(panel?.querySelectorAll("p")[1]?.textContent?.trim()).toBe(
      renderMethodologyCopy(metricDoc("network.heat-strip").definition),
    );
    // No methodology link: this popover is the legend, and the row's own strip already links to the
    // section that owns these definitions.
    expect(panel?.querySelector("a")).toBeNull();
  });

  it("hides the GRID when no line has any history, and says so in one labelled line", () => {
    lines.set([makeLine({ id: "a", code: "KJL" })]);
    historyByLine = new Map();
    const root = render();

    // A grid of empty rows would claim the network is quiet, which is a different statement from "we
    // have nothing to show" — so the grid stays gone. But the CELL is a core Pro surface: a successful
    // read that found nothing is an ANSWER, and rendering nothing left a blank bordered card that read as
    // a layout fault rather than as a quiet service day. The per-line no-data cells are a DIFFERENT case:
    // one line reported nothing while others did, and the axis itself is still the answerable thing.
    expect(root.querySelector('[data-testid="network-heat-strip"]')).toBeNull();
    const empty = root.querySelector('[data-testid="heat-empty"]');
    expect(empty?.textContent?.trim()).toBe("No rider reports in this service day yet.");
    expect(root.querySelectorAll('[data-testid="heat-row"]').length).toBe(0);
  });

  it("hides itself on a FAILED read, without asking the page to raise an error", () => {
    lines.set([makeLine({ id: "a", code: "KJL" })]);
    historyByLine.set("a", day([2]));
    failed.set(true);
    const root = render();

    // 🔴 Widget-level failure isolation: the store keeps `linesHistoryFailed` out of `hasError`, so
    // this branch is the whole of the failure handling and the board behind it keeps working.
    expect(root.querySelector('[data-testid="network-heat-strip"]')).toBeNull();
    expect(root.textContent?.trim()).toBe("");
    // 🔴 …and the failure is NOT dressed up as a quiet day. "We could not load it" and "nobody reported
    // anything" are different facts, so a failed read says nothing at all — including not printing the
    // empty-state sentence.
    expect(root.querySelector('[data-testid="heat-empty"]')).toBeNull();
  });
});

/**
 * The current-hour marker, in its own describe because it needs a fake clock installed BEFORE the
 * first render — `afterNextRender` reads `new Date()` once, and the point of the whole feature is
 * that read being client-only.
 */
describe("NetworkHeatStripComponent: the current hour", () => {
  let fixture: ComponentFixture<NetworkHeatStripComponent>;
  let lines: ReturnType<typeof signal<LinePulse[]>>;
  let historyByLine: Map<string, LineStatusHourBucket[]>;
  let refreshTick: ReturnType<typeof signal<number>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_IN_HOUR_3);

    lines = signal<LinePulse[]>([makeLine({ id: "a", code: "KJL" })]);
    historyByLine = new Map([["a", day([1])]]);
    refreshTick = signal(0);

    await TestBed.configureTestingModule({
      imports: [NetworkHeatStripComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: HomeStore,
          useValue: {
            lines,
            visibleLines: lines,
            linesHistoryFailed: signal(false),
            linesRefreshTick: refreshTick,
            requestHistoryReads: vi.fn(),
            linesHistoryFor: (lineId: string) => historyByLine.get(lineId) ?? [],
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NetworkHeatStripComponent);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function cells(): HTMLElement[] {
    return [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
        '[data-testid="heat-cell"]',
      ),
    ];
  }

  it("glows the hour it is in, without recolouring the cell's data", async () => {
    fixture.detectChanges();
    // `afterNextRender` has already seeded the clock by here, which is why the marker-free case is
    // asserted as a SERVER render below rather than as a "first frame" here.
    await fixture.whenStable();
    fixture.detectChanges();

    const current = cells().filter((cell) => cell.hasAttribute("data-current-hour"));
    expect(current).toHaveLength(1);
    // 03:30 is inside the FIRST bucket, i.e. column 0 — and `currentServiceBucketIndex` is
    // half-open, so an instant on a seam belongs to the later hour.
    expect(current[0]?.getAttribute("data-hour")).toBe("03");
    // The cell's own data survives: the marker is an overlay, not a wash over the status colour.
    expect(current[0]?.className).toContain("bg-emerald-500");
    const glow = current[0]?.querySelector('[data-testid="heat-cell-glow"]');
    expect(glow?.className).toContain("pointer-events-none");
    expect(glow?.className).toContain("ring-amber-400/80");
    expect(glow?.className).toContain("shadow-[0_0_8px_2px_rgba(251,191,36,0.5)]");
    // Reduced motion keeps a STATIC glow — the hour still has to be findable.
    expect(glow?.className).toContain("motion-safe:animate-pulse");
    expect(glow?.getAttribute("aria-hidden")).toBe("true");
    // Every OTHER cell is unmarked, including the ones in the second row's slice of the grid.
    expect(cells().filter((cell) => cell.hasAttribute("data-current-hour"))).toHaveLength(1);
  });

  it("moves the marker with the poll beat, so a grid left open does not glow a past hour", async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      cells()
        .find((cell) => cell.hasAttribute("data-current-hour"))
        ?.getAttribute("data-hour"),
    ).toBe("03");

    // 06:20 MYT — three buckets on. 🔴 The tick is what moves the clock: a Pro tab left open across an
    // hour boundary would otherwise keep glowing an hour that has passed, and an hourly grid with a
    // stale marker is worse than no marker.
    vi.setSystemTime(new Date(new Date(HOUR_03).getTime() + 3 * 3600_000 + 20 * 60_000));
    refreshTick.set(1);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const current = cells().filter((cell) => cell.hasAttribute("data-current-hour"));
    expect(current).toHaveLength(1);
    expect(current[0]?.getAttribute("data-hour")).toBe("06");
  });

  it("draws no marker when the reader is outside this service day", async () => {
    // A clock past the last bucket (02:00 tomorrow) has no hour to mark, and guessing one would
    // glow a column that is not the one being read.
    vi.setSystemTime(new Date(new Date(HOUR_03).getTime() + 40 * 3600_000));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(cells().filter((cell) => cell.hasAttribute("data-current-hour"))).toHaveLength(0);
  });

  it("renders NO marker at all on the server, so the first client paint cannot disagree", async () => {
    // 🔴 The load-bearing SSR assertion. `afterNextRender` never runs on the server, so the server's
    // HTML carries no `data-current-hour` at all — which is what makes the CLIENT's first paint the
    // same markup (NG0500). A field initialiser reading `new Date()` would light a column in the
    // server HTML from the SERVER's clock and light a different one (or none) in the browser.
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [NetworkHeatStripComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: "server" },
        {
          provide: HomeStore,
          useValue: {
            lines,
            visibleLines: lines,
            linesHistoryFailed: signal(false),
            linesRefreshTick: refreshTick,
            requestHistoryReads: vi.fn(),
            linesHistoryFor: (lineId: string) => historyByLine.get(lineId) ?? [],
          },
        },
      ],
    }).compileComponents();

    const serverFixture = TestBed.createComponent(NetworkHeatStripComponent);
    serverFixture.detectChanges();
    await serverFixture.whenStable();
    serverFixture.detectChanges();

    const serverRoot = serverFixture.nativeElement as HTMLElement;
    expect(serverRoot.querySelectorAll("[data-current-hour]")).toHaveLength(0);
    expect(serverRoot.querySelectorAll('[data-testid="heat-cell-glow"]')).toHaveLength(0);
    // …and it is still a full grid: the marker is absent, not the grid.
    expect(serverRoot.querySelectorAll('[data-testid="heat-cell"]')).toHaveLength(24);
    expect(serverRoot.querySelectorAll('[data-testid="heat-popover"]')).toHaveLength(0);
  });
});
