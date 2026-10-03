import { provideZonelessChangeDetection, signal } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  metricDoc,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import { PreferencesService } from "../../../core/preferences/preferences.service";
import { ReportSheetService } from "../../spotting/data/report-sheet.service";
import type { LinePulse, LineStatusHourBucket } from "../data/home.queries";
import { LineStatusSheetService } from "../data/line-status-sheet.service";
import { HomeStore } from "../data/home.store";
import { LinePulseRowComponent } from "./line-pulse-row.component";
import { LineStatusChartComponent } from "./line-status-chart.component";
import { LineStatusReportsComponent } from "./line-status-reports.component";

/** The preferences service's own storage key — restated so a rename breaks this spec loudly. */
const STORAGE_KEY = "rosak:preferences:v1";

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

function pulseLink(overrides: Partial<LinePulse["pulseLinks"][number]> = {}) {
  return {
    id: "pl-1",
    url: "https://operator.example/post/1",
    normalizedUrl: "https://operator.example/post/1",
    title: "Signal fault at Angkasapuri",
    created: "2026-10-03T08:00:00",
    occurredAt: "2026-10-03T08:00:00",
    isAutomated: true,
    voteScore: 0,
    userVote: 0,
    voteBreakdown: { upvotes: 0, downvotes: 0 },
    lines: [],
    user: null,
    ...overrides,
  };
}

function textOf(root: HTMLElement, testId: string): string {
  return (root.querySelector(`[data-testid="${testId}"]`)?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("LinePulseRowComponent", () => {
  let fixture: ComponentFixture<LinePulseRowComponent>;
  let httpMock: HttpTestingController;
  let preferences: PreferencesService;
  let sheetMock: {
    isOpen: ReturnType<typeof signal<boolean>>;
    lineId: ReturnType<typeof signal<string | null>>;
    openFor: ReturnType<typeof vi.fn>;
    setOpen: ReturnType<typeof vi.fn>;
  };
  let reportSheetMock: { openFor: ReturnType<typeof vi.fn> };
  /** The store's per-line history, keyed by line id — the strip's ONLY input. */
  let historyByLine: Map<string, LineStatusHourBucket[]>;
  let historyFailed: ReturnType<typeof signal<boolean>>;
  let requestHistoryReads: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    sheetMock = {
      isOpen: signal(false),
      lineId: signal<string | null>(null),
      openFor: vi.fn(),
      setOpen: vi.fn(),
    };
    reportSheetMock = { openFor: vi.fn() };
    // The row now hosts `app-line-history-strip`, which reads the store's single service-day read for
    // this line. A MOCK, not the real store: the read's own variables and gating belong to
    // `home.store.spec.ts`, and this spec is about what the row draws from the answer.
    historyByLine = new Map();
    historyFailed = signal(false);
    requestHistoryReads = vi.fn();
    // The pin is real state that outlives one fixture, so each test starts from a clean store.
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [LinePulseRowComponent],
      providers: [
        provideZonelessChangeDetection(),
        // The row's pro block links OUT to the spotting feature, so the router must resolve
        // `/spotting/:lineId` and its `details` child or the href never resolves (NG04002).
        provideRouter([
          { path: "spotting/:lineId", children: [{ path: "details", children: [] }] },
        ]),
        provideHttpClientTesting(),
        { provide: LineStatusSheetService, useValue: sheetMock },
        { provide: ReportSheetService, useValue: reportSheetMock },
        {
          provide: HomeStore,
          useValue: {
            linesHistoryFor: (lineId: string) => historyByLine.get(lineId) ?? [],
            linesHistoryFailed: historyFailed,
            requestHistoryReads,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LinePulseRowComponent);
    httpMock = TestBed.inject(HttpTestingController);
    preferences = TestBed.inject(PreferencesService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  function render(line: LinePulse, inputs: Record<string, unknown> = {}): HTMLElement {
    fixture.componentRef.setInput("line", line);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function flushPendingRequests(): void {
    for (const request of httpMock.match(() => true)) {
      request.flush({ data: {} });
    }
  }

  it("renders the line's code, name, colour rail and compact operational facts", () => {
    const root = render(makeLine({ displayColor: "#00af91" }));

    expect(textOf(root, "line-row-title")).toBe("KJL");
    // The name shares the title row, so the row's identity reads as one string.
    expect(
      (root.querySelector('[data-testid="line-row"]')?.textContent ?? "").replace(/\s+/g, " "),
    ).toContain("Kelana Jaya Line");

    const rail = [...root.querySelectorAll<HTMLElement>('[data-testid="line-row"] > span')].find(
      (span) => span.getAttribute("aria-hidden") === "true" && span.style.backgroundColor !== "",
    );
    expect(rail?.style.backgroundColor).toBe("rgb(0, 175, 145)");

    // The Active line gets NO operational pill — "Active" is the unremarkable default, and a pill
    // that is on every healthy row is a pill nobody reads.
    expect(root.querySelector('[data-testid="line-row-status"]')).toBeNull();
    expect(textOf(root, "line-row-passenger")).toBe("Normal");
    expect(textOf(root, "line-row-vehicles")).toBe("12/16 in service");
    expect(textOf(root, "line-row-reports")).toBe("0 reports");
  });

  it("names the passenger status in plain language when there is no data at all", () => {
    const root = render(makeLine({ passengerStatus: null }));
    expect(textOf(root, "line-row-passenger")).toBe("No data");
  });

  it("keeps the fleet count and the report count as ONE fragment, and drops the count on a phone", () => {
    const root = render(makeLine({ status: "PARTIAL_DISRUPTION", statusReportCount: 1 }));

    // 🔴 What the QA pass caught at 390px: the status pill, the confidence chip ("Unconfirmed (1 reports)"),
    // the passenger badge, the fleet count and the report count could not share one line, so the count
    // alone wrapped onto a line of its own on EVERY row and read as a layout fault. They are now one
    // fragment on their own strip, so the two wrap together and the count steps aside below `sm` — where
    // the confidence chip beside it already says the same thing.
    const meta = root.querySelector('[data-testid="line-row-meta"]');
    expect(meta).not.toBeNull();
    expect(meta?.querySelector('[data-testid="line-row-vehicles"]')).not.toBeNull();
    const reports = meta?.querySelector('[data-testid="line-row-reports"]');
    expect(reports?.textContent?.trim()).toBe("1 reports");
    expect(reports?.className).toContain("hidden");
    expect(reports?.className).toContain("sm:inline");
    // Neither fragment is a sibling of the badge row any more, so neither can be pushed off it alone.
    expect(
      root
        .querySelector('[data-testid="line-row-chips"]')
        ?.querySelector("[data-testid='line-row-reports']"),
    ).toBeNull();
  });

  it("shows the operational pill for a degraded line only", () => {
    const root = render(makeLine({ status: "PARTIAL_DISRUPTION" }));
    expect(textOf(root, "line-row-status")).toBe("Partial Disruption");
  });

  it("shows a confidence chip, and its popover copy comes from the methodology registry", () => {
    const root = render(makeLine({ status: "PARTIAL_DISRUPTION", statusReportCount: 1 }));

    expect(textOf(root, "line-row-confidence")).toBe("Unconfirmed (1 reports)");
    // The chip qualifies the status, so it must sit immediately after it in the same chip row.
    const row = root.querySelector('[data-testid="line-row-chips"]');
    const statusChip = root
      .querySelector('[data-testid="line-row-status"]')
      ?.closest("app-status-info-chip");
    const confidenceChip = root
      .querySelector('[data-testid="line-row-confidence"]')
      ?.closest("app-status-info-chip");
    expect(row?.contains(statusChip as Node)).toBe(true);
    expect((statusChip as HTMLElement).compareDocumentPosition(confidenceChip as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    (confidenceChip?.querySelector("button") as HTMLButtonElement).click();
    fixture.detectChanges();
    const panel = confidenceChip?.querySelector('[data-testid="status-info-popover"]');
    expect(panel?.querySelectorAll("p")[1]?.textContent?.trim()).toBe(
      renderMethodologyCopy(metricDoc("status-confidence.unconfirmed").definition),
    );
    expect(panel?.querySelector("a")?.getAttribute("href")).toBe("/methodology#line-status");
  });

  it("reads official from an operator-sourced pulse link rather than from the report tally", () => {
    const root = render(
      makeLine({ status: "TOTAL_DISRUPTION", statusReportCount: 40, pulseLinks: [pulseLink()] }),
    );

    // The load-bearing assertion of the ordering: a big rider tally must not outrank the operator.
    expect(textOf(root, "line-row-confidence")).toBe("Official update");
  });

  it("says so when there is nothing to be confident about", () => {
    const root = render(makeLine());
    expect(textOf(root, "line-row-confidence")).toBe("No recent reports");
  });

  it("toggles the pin with an aria-pressed state", () => {
    const root = render(makeLine({ id: "line-42" }));
    const pin = root.querySelector<HTMLButtonElement>('[data-testid="line-row-pin"]');

    expect(preferences.isPinned("line-42")).toBe(false);
    expect(pin?.getAttribute("aria-pressed")).toBe("false");
    expect(pin?.getAttribute("aria-label")).toBe("Pin KJL");

    pin?.click();
    fixture.detectChanges();

    expect(preferences.isPinned("line-42")).toBe(true);
    expect(pin?.getAttribute("aria-pressed")).toBe("true");
    expect(pin?.getAttribute("aria-label")).toBe("Unpin KJL");

    pin?.click();
    fixture.detectChanges();
    expect(preferences.isPinned("line-42")).toBe(false);
  });

  it("opens the line-status report sheet for THIS line, and nothing else", () => {
    // The full "which line?" chooser is a later phase. Until it lands the row's report action is
    // exactly as honest as the card's: it reports on the line the reader is looking at.
    const root = render(makeLine({ id: "line-42" }));

    root.querySelector<HTMLButtonElement>('[data-testid="line-row-report"]')?.click();

    expect(sheetMock.openFor).toHaveBeenCalledWith("line-42");
    expect(reportSheetMock.openFor).not.toHaveBeenCalled();
  });

  it("fetches nothing until expanded, then loads the chart and the report list", () => {
    const root = render(makeLine({ id: "line-7" }));

    expect(httpMock.match(() => true)).toHaveLength(0);
    expect(root.querySelector('[data-testid="line-row-expanded"]')).toBeNull();

    const toggle = root.querySelector<HTMLElement>('[data-testid="line-row-toggle"]');
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    toggle?.click();
    fixture.detectChanges();

    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(httpMock.match((r) => r.body.query.includes("LineStatusHistory"))).toHaveLength(1);
    expect(httpMock.match((r) => r.body.query.includes("LineStatusReports"))).toHaveLength(1);

    flushPendingRequests();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="line-row-expanded"]')).not.toBeNull();
  });

  it("points the toggle's aria-controls at this line's OWN panel id", () => {
    const root = render(makeLine({ id: "line-7" }));
    const toggle = root.querySelector<HTMLElement>('[data-testid="line-row-toggle"]');

    // Scoped to the line, because "My lines" and "All lines" can hold the SAME pinned line at once —
    // a bare id would collide and both toggles would resolve to whichever copy came first.
    expect(toggle?.getAttribute("aria-controls")).toBe("line-row-expanded-line-7");

    toggle?.click();
    fixture.detectChanges();
    flushPendingRequests();
    const panel = root.querySelector<HTMLElement>('[data-testid="line-row-expanded"]');
    expect(panel?.id).toBe("line-row-expanded-line-7");
    expect(panel?.id).toBe(toggle?.getAttribute("aria-controls"));
  });

  it("records the line as recently viewed on the OPEN edge only", () => {
    const root = render(makeLine({ id: "line-7" }));
    const toggle = root.querySelector<HTMLElement>('[data-testid="line-row-toggle"]');

    toggle?.click();
    fixture.detectChanges();
    // Settled while still open: collapsing cancels the lazy reads, and a cancelled request cannot be
    // flushed.
    flushPendingRequests();
    expect(preferences.recentLineIds()).toEqual(["line-7"]);

    // Collapsing must not push a line nobody is looking at any further up the recents list.
    toggle?.click();
    fixture.detectChanges();
    expect(preferences.recentLineIds()).toEqual(["line-7"]);
  });

  it("forwards refreshTick to the expanded chart and reports", () => {
    const root = render(makeLine({ id: "line-7" }));
    root.querySelector<HTMLElement>('[data-testid="line-row-toggle"]')?.click();
    fixture.detectChanges();
    flushPendingRequests();

    fixture.componentRef.setInput("refreshTick", 5);
    fixture.detectChanges();

    const chart = fixture.debugElement.query(By.directive(LineStatusChartComponent));
    const reports = fixture.debugElement.query(By.directive(LineStatusReportsComponent));
    expect(chart.componentInstance.refreshTick()).toBe(5);
    expect(reports.componentInstance.refreshTick()).toBe(5);
    flushPendingRequests();
  });

  describe("the service-day history strip", () => {
    /** A full 24-hour service day with reports only in the first two hours. */
    function serviceDay(): LineStatusHourBucket[] {
      return Array.from({ length: 24 }, (_unused, index) => ({
        hourStart: new Date(
          new Date("2026-09-21T19:00:00+00:00").getTime() + index * 3600_000,
        ).toISOString(),
        hourEnd: new Date(
          new Date("2026-09-21T19:00:00+00:00").getTime() + (index + 1) * 3600_000,
        ).toISOString(),
        count: index === 0 ? 2 : index === 1 ? 5 : 0,
        dominantStatus: index < 2 ? "NORMAL" : null,
        statusCounts:
          index === 1
            ? [{ status: "NORMAL", count: 5 }]
            : index === 0
              ? [{ status: "NORMAL", count: 2 }]
              : [],
      }));
    }

    it("draws nothing at all for a line with no reports this service day", () => {
      const root = render(makeLine({ id: "line-9" }));

      // Twenty-four empty cells would be noise on an already-dense compact row, and "no data" as a
      // chip would be a claim the row has no room to qualify. Silence is drawn as silence.
      expect(root.querySelector('[data-testid="row-history-strip"]')).toBeNull();
      // …and the rest of the row is untouched.
      expect(root.querySelector('[data-testid="line-row-title"]')).not.toBeNull();
      expect(requestHistoryReads).toHaveBeenCalledTimes(1);
    });

    it("draws one cell per service-day hour for a line that reported", () => {
      historyByLine.set("line-9", serviceDay());
      const root = render(makeLine({ id: "line-9" }));

      const strip = root.querySelector('[data-testid="row-history-strip"]');
      expect(strip).not.toBeNull();
      expect(strip?.querySelectorAll('[data-testid="row-history-cell"]')).toHaveLength(24);
      // Scaled to THIS line's busiest hour, so a quiet line next to a busy one still looks quiet.
      const cells = [
        ...(strip?.querySelectorAll<HTMLElement>('[data-testid="row-history-cell"]') ?? []),
      ];
      expect(cells[1]?.style.height).toBe("100%");
      expect(cells[0]?.style.height).toBe("40%");
      expect(cells[2]?.style.height).toBe("0%");
      expect(cells[1]?.getAttribute("title")).toBe("04:00–05:00 · 5 reports · Normal 5");
    });

    it("is aria-hidden with ONE text alternative, so 24 rectangles are not announced", () => {
      historyByLine.set("line-9", serviceDay());
      const root = render(makeLine({ id: "line-9" }));

      // The cells carry nothing a screen reader can use, so the strip is hidden and the host carries
      // a sentence instead — which is what keeps a decorative grid from being an inaccessible one.
      const cells = root
        .querySelector('[data-testid="row-history-strip"]')
        ?.querySelector('[aria-hidden="true"]');
      expect(cells).not.toBeNull();
      const label = textOf(root, "row-history-label");
      expect(label).toContain("7 reports in 2 of 24 hours");
      expect(label).toContain("service day 03:00 to 02:00");
    });

    it("reads only ITS line's history, so two rows never show the same strip", () => {
      historyByLine.set("line-9", serviceDay());
      historyByLine.set("line-8", []);
      const root = render(makeLine({ id: "line-9" }));
      expect(root.querySelector('[data-testid="row-history-strip"]')).not.toBeNull();

      fixture.componentRef.setInput("line", makeLine({ id: "line-8" }));
      fixture.detectChanges();
      expect(root.querySelector('[data-testid="row-history-strip"]')).toBeNull();
    });

    it("hides the strip when the per-line read failed, leaving the row working", () => {
      historyByLine.set("line-9", serviceDay());
      historyFailed.set(true);
      const root = render(makeLine({ id: "line-9" }));

      // Widget-level failure isolation: the store keeps `linesHistoryFailed` out of `hasError`, so the
      // row just loses the strip — it does not lose its status, its chips or its actions.
      expect(root.querySelector('[data-testid="row-history-strip"]')).toBeNull();
      expect(textOf(root, "line-row-confidence")).toBe("No recent reports");
      expect(root.querySelector('[data-testid="line-row-report"]')).not.toBeNull();
    });
  });

  it("keeps the pro detail and the Line HQ links off a rider row", () => {
    const root = render(makeLine({ id: "line-7" }));

    // A rider has no use for a density or a Line HQ link; drawing them greyed would be noise.
    expect(root.querySelector('[data-testid="line-row-pro"]')).toBeNull();
    expect(root.querySelector('[data-testid="line-row-hq"]')).toBeNull();
  });

  it("adds the report window and both Line HQ links in pro view", () => {
    const root = render(makeLine({ id: "line-7", statusReportCount: 4, statusWindowMinutes: 15 }), {
      viewMode: "pro",
    });

    // The count WITH the span it covers: a bare number is what a pro reader is most likely to
    // over-read, and the window is what makes "4 reports" interpretable.
    expect(textOf(root, "line-row-report-window")).toBe("4 reports · 15 min window");
    expect(root.querySelector('[data-testid="line-row-hq"]')?.getAttribute("href")).toBe(
      "/spotting/line-7",
    );
    expect(root.querySelector('[data-testid="line-row-hq-details"]')?.getAttribute("href")).toBe(
      "/spotting/line-7/details",
    );
  });

  it("changes only the row's padding with the density, never what it shows", () => {
    const comfortable = render(makeLine(), { density: "comfortable", viewMode: "pro" });
    const comfortableRow = comfortable.querySelector<HTMLElement>('[data-testid="line-row"]');
    const comfortableHtml = comfortableRow?.innerHTML ?? "";
    expect(comfortableRow?.className.split(/\s+/)).toContain("p-3");

    fixture.componentRef.setInput("density", "compact");
    fixture.detectChanges();
    const compactRoot = fixture.nativeElement as HTMLElement;
    const compactRow = compactRoot.querySelector<HTMLElement>('[data-testid="line-row"]');

    expect(compactRow?.className.split(/\s+/)).toContain("py-2");
    expect(compactRow?.className.split(/\s+/)).not.toContain("p-3");
    // Presentation ONLY: every fact and every action is still there.
    expect(compactRow?.querySelector('[data-testid="line-row-confidence"]')).not.toBeNull();
    expect(compactRow?.querySelector('[data-testid="line-row-report"]')).not.toBeNull();
    expect(compactRow?.querySelector('[data-testid="line-row-pro"]')).not.toBeNull();
    expect(compactRow?.innerHTML.length).toBeGreaterThan(comfortableHtml.length / 2);
  });

  it("reads a stored pin only after the browser hydration pass, so SSR and first paint agree", () => {
    // Acceptance spec (b), half 2 — the hydration half. `PreferencesService` hydrates inside
    // `afterNextRender`, which does NOT run on the server: a reader who had pinned a line gets the
    // server's DEFAULT row (pin unpressed) and then the client's hydrated row (pin pressed). If a
    // constructor read were ever added back, the two paints would disagree and Angular would throw
    // an NG0500 hydration mismatch for every rider who had ever pinned anything. So this pins the
    // ORDER: defaults first, stored values only after the tick.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pinnedLineIds: ["line-42"] }));
    fixture.componentRef.setInput("line", makeLine({ id: "line-42" }));

    // Before the render pass: the DEFAULT reading, which is exactly what the server rendered —
    // `afterNextRender` does not run there, so nothing has read storage yet.
    expect(preferences.hydrated()).toBe(false);
    expect(preferences.isPinned("line-42")).toBe(false);

    // The browser-only hydration pass, then the stored pin repaints the toggle.
    fixture.detectChanges();
    expect(preferences.hydrated()).toBe(true);
    expect(preferences.isPinned("line-42")).toBe(true);
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('[data-testid="line-row-pin"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
  });
});
