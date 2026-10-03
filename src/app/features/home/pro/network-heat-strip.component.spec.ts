import { provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  let requestHistoryReads: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    lines = signal<LinePulse[]>([makeLine({ id: "a", code: "KJL" })]);
    historyByLine = new Map();
    failed = signal(false);
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
            requestHistoryReads,
            linesHistoryFor: (lineId: string) => historyByLine.get(lineId) ?? [],
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NetworkHeatStripComponent);
  });

  function render(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
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
    expect(root.querySelectorAll('[data-testid="heat-cell"]')).toHaveLength(48);
  });

  it("scales EVERY row to the busiest cell on screen, so the lines can be compared", () => {
    lines.set([makeLine({ id: "a", code: "KJL" }), makeLine({ id: "b", code: "SPL" })]);
    historyByLine.set("a", day([1]));
    historyByLine.set("b", day([9]));
    const root = render();

    const cells = [...root.querySelectorAll<HTMLElement>('[data-testid="heat-cell"]')];
    const kjl = cells[0];
    const spl = cells[24];
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

    const cells = [...root.querySelectorAll<HTMLElement>('[data-testid="heat-cell"]')];
    // 03:00 is quiet, 04:00 was disrupted with four reports.
    expect(cells[0]?.className).toContain("bg-muted");
    expect(cells[0]?.className).not.toContain("opacity-");
    expect(cells[1]?.className).toContain("bg-rose-600");
    expect(cells[1]?.className).toContain("opacity-100");
    expect(cells[1]?.getAttribute("title")).toBe("KJL · 04:00–05:00 · 4 reports · Disrupted 4");
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
    expect(
      root
        .querySelector('[data-testid="network-heat-strip"] > div[role="group"]')
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
    // a layout fault rather than as a quiet service day.
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
