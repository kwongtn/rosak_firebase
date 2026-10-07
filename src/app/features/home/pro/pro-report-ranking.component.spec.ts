import { Component, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { METHODOLOGY_CONSTANTS } from "../../../core/methodology/methodology.constants";
import type { LinePulse, LineStatusHourBucket } from "../data/home.queries";
import { HomeStore } from "../data/home.store";
import {
  ProReportRankingComponent,
  REPORT_RANKING_TOP_LINES,
} from "./pro-report-ranking.component";

/** One hour bucket with `count` reports. `hourStart` is irrelevant here beyond uniqueness. */
function hour(count: number, hourStart = "2026-10-03T19:00:00+00:00"): LineStatusHourBucket {
  return {
    hourStart,
    hourEnd: hourStart,
    count,
    dominantStatus: count > 0 ? "CROWDED" : null,
    statusCounts: count > 0 ? [{ status: "CROWDED", count }] : [],
  };
}

function makeLine(id: string): LinePulse {
  return {
    id,
    code: id.toUpperCase(),
    displayName: `Line ${id}`,
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
  };
}

/** `totalReports` per line id — the buckets the widget sums. */
function makeStore(
  lines: LinePulse[] = [],
  totals: Record<string, number> = {},
  overrides: { linesHistoryFailed?: boolean } = {},
) {
  const buckets = signal(
    new Map<string, LineStatusHourBucket[]>(
      Object.entries(totals).map(([id, count]) => [
        id,
        // Two buckets so the widget is demonstrably SUMMING them rather than reading a scalar.
        [
          hour(Math.floor(count / 2)),
          hour(count - Math.floor(count / 2), "2026-10-03T20:00:00+00:00"),
        ],
      ]),
    ),
  );
  return {
    visibleLines: signal(lines),
    linesHistoryFor: vi.fn((lineId: string) => buckets().get(lineId) ?? []),
    linesHistoryFailed: signal(overrides.linesHistoryFailed ?? false),
    requestHistoryReads: vi.fn(),
  };
}

type StoreMock = ReturnType<typeof makeStore>;

describe("pro-report-ranking.component: ProReportRankingComponent", () => {
  let storeMock: StoreMock;
  let fixture: ComponentFixture<ProReportRankingComponent>;

  beforeEach(() => {
    localStorage.clear();
  });

  async function ranking(
    lines: LinePulse[] = [],
    totals: Record<string, number> = {},
    overrides: { linesHistoryFailed?: boolean } = {},
  ): Promise<HTMLElement> {
    storeMock = makeStore(lines, totals, overrides);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProReportRankingComponent],
      providers: [
        provideZonelessChangeDetection(),
        // The popover renders a `routerLink` into `/methodology`, so a real Router has to resolve or
        // the link throws NG04002 the moment the panel is opened.
        provideRouter([]),
        { provide: HomeStore, useValue: storeMock },
      ],
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(ProReportRankingComponent);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it("opts into the SHARED per-line history read — the same one the heat grid asks for", async () => {
    await ranking([makeLine("a")], { a: 4 });

    // One call, from the surface that draws the answer. A store-constructed resource would fire for
    // every Rider visit, and this widget needs nothing of its own beyond these buckets.
    expect(storeMock.requestHistoryReads).toHaveBeenCalledTimes(1);
  });

  it("ranks lines by their service-day report total, busiest first", async () => {
    const root = await ranking([makeLine("a"), makeLine("b"), makeLine("c")], {
      a: 3,
      b: 41,
      c: 12,
    });

    const codes = [...root.querySelectorAll('[data-testid="ranking-row-code"]')].map((node) =>
      node.textContent?.trim(),
    );
    expect(codes).toEqual(["B", "C", "A"]);
    // The total is the SUM of the line's buckets — 41 arrives as 20 + 21, so reading one scalar would
    // rank this line as 21.
    const counts = [...root.querySelectorAll('[data-testid="ranking-row-count"]')].map((node) =>
      node.textContent?.trim(),
    );
    expect(counts).toEqual(["41 reports", "12 reports", "3 reports"]);
  });

  it("breaks a tie on the line code, so the list cannot reshuffle between renders", async () => {
    const root = await ranking([makeLine("b"), makeLine("a")], { a: 7, b: 7 });

    const codes = [...root.querySelectorAll('[data-testid="ranking-row-code"]')].map((node) =>
      node.textContent?.trim(),
    );
    expect(codes).toEqual(["A", "B"]);
  });

  it("caps the list at the registry's own number of lines", async () => {
    const lines = Array.from({ length: 9 }, (_, index) => makeLine(`l${index}`));
    const totals = Object.fromEntries(lines.map((line, index) => [line.id, index + 1]));
    const root = await ranking(lines, totals);

    expect(root.querySelectorAll('[data-testid="ranking-row"]')).toHaveLength(
      REPORT_RANKING_TOP_LINES,
    );
    // The cap is published as a methodology constant because the ranking's own definition names it;
    // if these two ever drift, the panel and `/methodology` disagree about how many lines are shown.
    expect(METHODOLOGY_CONSTANTS["REPORT_RANKING_TOP_LINES"].value).toBe(REPORT_RANKING_TOP_LINES);
  });

  it("scales each bar to the LEADER, so a quiet network looks quiet", async () => {
    const root = await ranking([makeLine("a"), makeLine("b")], { a: 100, b: 50 });

    const bars = root.querySelectorAll<HTMLElement>('[data-testid="ranking-bar"]');
    // The busiest line is always full and the runner-up is exactly half — the comparison BETWEEN rows
    // is the whole point, so a fixed absolute scale would read as nothing at all.
    expect(bars[0].style.width).toBe("100%");
    expect(bars[1].style.width).toBe("50%");
  });

  it("hides itself when NOBODY reported anything, rather than ranking five zeroes", async () => {
    const root = await ranking([makeLine("a"), makeLine("b")], {});

    // An all-zero service day is an absence of measurement, not a measurement of absence: the same
    // "no rider reports in this service day yet" sentence the sparkline gives.
    expect(root.querySelector('[data-testid="pro-report-ranking"]')).toBeNull();
  });

  it("skips lines with zero reports while ranking the ones that have some", async () => {
    const root = await ranking([makeLine("a"), makeLine("quiet")], { a: 5 });

    const codes = [...root.querySelectorAll('[data-testid="ranking-row-code"]')].map((node) =>
      node.textContent?.trim(),
    );
    expect(codes).toEqual(["A"]);
  });

  it("hides itself on a FAILED history read and leaves the page's own state alone", async () => {
    const root = await ranking([makeLine("a")], { a: 9 });
    expect(root.querySelector('[data-testid="pro-report-ranking"]')).not.toBeNull();

    storeMock.linesHistoryFailed.set(true);
    TestBed.tick();
    fixture.detectChanges();

    // Its own read's flag, never `HomeStore.hasError()` — the ranking is a decoration on data the
    // board itself needs, so it must not be the reason a working board gets a retry banner.
    expect(root.querySelector('[data-testid="pro-report-ranking"]')).toBeNull();
  });

  it("follows the store's Pro filters — it ranks the lines the board is DRAWING", async () => {
    const root = await ranking([makeLine("a"), makeLine("b")], { a: 30, b: 2 });

    storeMock.visibleLines.set([makeLine("b")]);
    TestBed.tick();
    fixture.detectChanges();

    // A ranking over lines the board had filtered out would put the reader's most-reported line at
    // the top of a widget about a line that is not on the page.
    const codes = [...root.querySelectorAll('[data-testid="ranking-row-code"]')].map((node) =>
      node.textContent?.trim(),
    );
    expect(codes).toEqual(["B"]);
  });
});
