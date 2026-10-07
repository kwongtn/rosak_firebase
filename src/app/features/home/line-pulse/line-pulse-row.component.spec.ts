import { provideZonelessChangeDetection, signal } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  metricDoc,
  metricTooltip,
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
  /** The store's per-line service-day history, keyed by line id — the report label's ONLY input. */
  let historyByLine: Map<string, LineStatusHourBucket[]>;
  let historyFailed: ReturnType<typeof signal<boolean>>;
  let requestHistoryReads: ReturnType<typeof vi.fn>;

  /** The first hour of the fixture service day (2026-09-21T19:00Z), for the clock tests. */
  const SERVICE_DAY_START = new Date("2026-09-21T19:00:00+00:00").getTime();

  beforeEach(async () => {
    sheetMock = {
      isOpen: signal(false),
      lineId: signal<string | null>(null),
      openFor: vi.fn(),
      setOpen: vi.fn(),
    };
    reportSheetMock = { openFor: vi.fn() };
    // The row's report label reads the store's single service-day read for this line directly. A
    // MOCK, not the real store: the read's own variables and gating belong to `home.store.spec.ts`,
    // and this spec is about what the row draws from the answer.
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
    // Fake timers are only installed by the clock tests; a leaked one would hang the next poll beat.
    vi.useRealTimers();
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

  /**
   * Renders, then flushes the browser-only `afterNextRender` that seeds the row's clock.
   *
   * `whenStable` is the wait `afterNextRender` needs — the same sequence the refresh-control spec
   * uses for its own render hook — so the clock has a value by the time the label is read.
   */
  async function renderWithClock(
    line: LinePulse,
    inputs: Record<string, unknown> = {},
  ): Promise<HTMLElement> {
    const root = render(line, inputs);
    await fixture.whenStable();
    fixture.detectChanges();
    return root;
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
    // No history has landed yet for this line, so the row keeps its plain rolling count.
    expect(textOf(root, "line-row-reports")).toBe("0 reports");
  });

  it("names the passenger status in plain language when there is no data at all", () => {
    const root = render(makeLine({ passengerStatus: null }));
    expect(textOf(root, "line-row-passenger")).toBe("No data");
  });

  it("wraps the fleet count in the card's breakdown chip, with the same definition and total", () => {
    const root = render(
      makeLine({
        vehicleStatusCounts: [
          { status: "IN_SERVICE", count: 12 },
          { status: "NOT_SPOTTED", count: 3 },
          { status: "OUT_OF_SERVICE", count: 1 },
        ],
      }),
    );

    const badge = root.querySelector<HTMLElement>('[data-testid="line-row-vehicles"]');
    expect(badge?.textContent?.replace(/\s+/g, " ").trim()).toBe("12/16 in service");
    expect(badge?.getAttribute("aria-label")).toBe("12 of 16 vehicles in service");

    const chip = badge?.closest("app-status-info-chip");
    expect(chip).not.toBeNull();

    // The row's pill is the SAME chip the card uses: same registry definition, same breakdown, and
    // the total that closes it.
    (chip?.querySelector("button") as HTMLButtonElement).click();
    fixture.detectChanges();

    const rows = [...(chip?.querySelectorAll('[data-testid="status-breakdown-row"]') ?? [])].map(
      (el) =>
        [...el.querySelectorAll("span")].map((span) => (span.textContent ?? "").trim()).join(" "),
    );
    expect(rows).toEqual(["In service 12", "Not spotted 3", "Out of service 1", "Total 16"]);

    const definition = chip?.querySelectorAll('[data-testid="status-info-popover"] p')[1];
    expect(definition?.textContent?.trim()).toBe(
      renderMethodologyCopy(metricDoc("line-pulse.vehicle-count").definition),
    );
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
    // Either branch of the count renders it here — the enriched one wraps the text in a popover, so
    // the assertion is on the TEXT element rather than on a wrapper that only exists sometimes.
    expect(meta?.contains(reports as Node)).toBe(true);
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
    const root = render(makeLine({ statusReportCount: 1 }));

    expect(textOf(root, "line-row-confidence")).toBe("Unconfirmed (1 reports)");
    // The chip qualifies the operational state, so it sits in the same chip row as the status it
    // would qualify — for an Active line, where no status badge carries that state.
    const row = root.querySelector('[data-testid="line-row-chips"]');
    const confidenceChip = root
      .querySelector('[data-testid="line-row-confidence"]')
      ?.closest("app-status-info-chip");
    expect(row?.contains(confidenceChip as Node)).toBe(true);

    (confidenceChip?.querySelector("button") as HTMLButtonElement).click();
    fixture.detectChanges();
    const panel = confidenceChip?.querySelector('[data-testid="status-info-popover"]');
    expect(panel?.querySelectorAll("p")[1]?.textContent?.trim()).toBe(
      renderMethodologyCopy(metricDoc("status-confidence.unconfirmed").definition),
    );
    expect(panel?.querySelector("a")?.getAttribute("href")).toBe("/methodology#line-status");
  });

  it("hides both the confidence and the passenger chip on a non-Active line", () => {
    const root = render(makeLine({ status: "PARTIAL_DISRUPTION", statusReportCount: 1 }));

    // The non-Active badge already tells the story, so the confidence and crowd chips step aside.
    expect(root.querySelector('[data-testid="line-row-status"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="line-row-confidence"]')).toBeNull();
    expect(root.querySelector('[data-testid="line-row-passenger"]')).toBeNull();

    // The Active line is the one that draws them.
    fixture.componentRef.setInput("line", makeLine());
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="line-row-confidence"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="line-row-passenger"]')).not.toBeNull();
  });

  it("reads official from an operator-sourced pulse link rather than from the report tally", () => {
    const root = render(makeLine({ statusReportCount: 40, pulseLinks: [pulseLink()] }));

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

    // The pin is wrapped in the shared tooltip primitive in BARE mode: the pin button IS the
    // trigger, so there is no wrapping button to nest it inside — `closest("button")` is itself.
    expect(pin?.closest("button")).toBe(pin);
    const trigger = pin?.parentElement as HTMLElement;
    trigger.click();
    fixture.detectChanges();
    const panel = () => root.querySelector('[data-testid="line-row-pin-popover"]');
    expect(panel()?.querySelectorAll("p")[0]?.textContent?.trim()).toBe("Click to pin");
    expect(panel()?.querySelectorAll("p")[1]?.textContent?.trim()).toBe(
      "Pin this line to keep it in My lines at the top of the board.",
    );

    pin?.click();
    fixture.detectChanges();

    expect(preferences.isPinned("line-42")).toBe(true);
    expect(pin?.getAttribute("aria-pressed")).toBe("true");
    expect(pin?.getAttribute("aria-label")).toBe("Unpin KJL");

    // The tooltip flips with the state — re-open it, because the wrapped pin's own tap closed it.
    trigger.click();
    fixture.detectChanges();
    expect(panel()?.querySelectorAll("p")[0]?.textContent?.trim()).toBe("Click to unpin");
    expect(panel()?.querySelectorAll("p")[1]?.textContent?.trim()).toBe(
      "Unpin this line to return it to its regular group on the board.",
    );

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

  it("fetches nothing of its own until expanded, then loads the chart and the report list", () => {
    const root = render(makeLine({ id: "line-7" }));

    // The row's only outbound request is the expanded panel's, fed by the MOCK store here — the real
    // service-day read is opened by `requestHistoryReads()` above, not by an http call in the row.
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

  describe("the service-day report label", () => {
    /**
     * A full 24-hour service day: 3 reports in the first hour, 2 in the second, nothing after. The
     * total is therefore 5, and "now" landing in hour 2 is what makes the bracket say 2 — a fixture
     * whose busy hour is also its current hour could not tell the two numbers apart.
     */
    function serviceDay(): LineStatusHourBucket[] {
      return Array.from({ length: 24 }, (_unused, index) => ({
        hourStart: new Date(SERVICE_DAY_START + index * 3600_000).toISOString(),
        hourEnd: new Date(SERVICE_DAY_START + (index + 1) * 3600_000).toISOString(),
        count: index === 0 ? 3 : index === 1 ? 2 : 0,
        dominantStatus: index < 2 ? "NORMAL" : null,
        statusCounts:
          index === 0
            ? [{ status: "NORMAL", count: 3 }]
            : index === 1
              ? [{ status: "BUSY", count: 2 }]
              : [],
      }));
    }

    it("opts the store's single service-day read in, once per row", () => {
      render(makeLine({ id: "line-9" }));

      // The row reads the buckets ITSELF now the strip is gone, so it is the widget that must open
      // the gate. Sixteen rows mounting is still one request — the store owns the resource.
      expect(requestHistoryReads).toHaveBeenCalledTimes(1);
    });

    it("reads the service-day total and the current hour against a fixed clock", async () => {
      vi.useFakeTimers();
      // 20:30Z is inside hour 2 of the fixture day, which carries 2 reports of the day's 5.
      vi.setSystemTime(new Date(SERVICE_DAY_START + 1.5 * 3600_000));
      historyByLine.set("line-9", serviceDay());

      const root = await renderWithClock(makeLine({ id: "line-9", statusReportCount: 0 }));

      // The bracket is the point: "5 reports" alone cannot be read, and neither can "(2 this hour)"
      // without the day it belongs to. The two numbers answer different questions.
      expect(textOf(root, "line-row-reports")).toBe("5 reports (2 this hour)");
      // 🔴 The phone hiding rides on the WRAPPER, not on the projected span (InfoPopover's "i" glyph
      // sits outside the projection, so a lone glyph would be left on a row with no number) and not
      // on the popover host either (the host already carries `inline-flex`, and .inline-flex is
      // emitted after .hidden, so it wins the tie and `hidden` would do nothing). jsdom computes no
      // media query, so the classes ARE the assertion.
      const wrapper = root.querySelector('[data-testid="line-row-reports-wrap"]');
      expect(wrapper?.className).toContain("hidden");
      expect(wrapper?.className).toContain("sm:inline");
      // The wrapper is what hides, so neither inner node may claim the tokens too.
      expect(root.querySelector('[data-testid="line-row-reports"]')?.className).not.toContain(
        "hidden",
      );
      // The REPORTS popover's host, not just the first popover in the meta strip — the vehicle chip
      // now carries one there too.
      expect(wrapper?.querySelector("app-info-popover")?.className).not.toContain("hidden");
    });

    it("explains the enriched label from the methodology registry, in a popover", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(SERVICE_DAY_START + 1.5 * 3600_000));
      historyByLine.set("line-9", serviceDay());
      const root = await renderWithClock(makeLine({ id: "line-9" }));

      // A service-day claim is a metric, so it is published and surfaced — never a literal in the
      // template. Scoped to the reports span, because the meta strip also carries the vehicle chip's
      // popover now.
      const trigger = root
        .querySelector('[data-testid="line-row-reports"]')
        ?.closest("app-info-popover")
        ?.querySelector("button") as HTMLButtonElement;
      expect(trigger).not.toBeNull();
      trigger?.click();
      fixture.detectChanges();

      const panel = root.querySelector('[data-testid="line-row-reports-popover"]');
      expect(panel?.querySelectorAll("p")[1]?.textContent?.trim()).toBe(
        metricTooltip("network.line-reports-summary"),
      );
      // No /methodology link: `showMethodologyLink: false` demotes the panel to a tooltip, so it is
      // not a dialog and carries no link to a section that does not exist.
      expect(panel?.querySelector("a")).toBeNull();
    });

    it("falls back to the rolling count when the line reported nothing this service day", () => {
      const root = render(makeLine({ id: "line-9", statusReportCount: 1 }));

      // `buckets: []` is the backend's "this line reported nothing", not an error, and a row with
      // nothing to say about the day must not claim a day total of zero it never measured.
      expect(textOf(root, "line-row-reports")).toBe("1 reports");
      // The PLAIN count has no popover: the fallback renders no wrapper, and the count span itself
      // has no popover ancestor. The vehicle chip's popover in the same strip is why the assertion
      // is scoped to the reports element rather than to the meta row.
      expect(root.querySelector('[data-testid="line-row-reports-wrap"]')).toBeNull();
      expect(
        root.querySelector('[data-testid="line-row-reports"]')?.closest("app-info-popover"),
      ).toBeNull();
    });

    it("falls back to the rolling count when the per-line read failed", () => {
      historyByLine.set("line-9", serviceDay());
      historyFailed.set(true);
      const root = render(makeLine({ id: "line-9", statusReportCount: 2 }));

      // Failure isolation: the store keeps `linesHistoryFailed` out of `hasError`, so the row loses
      // the enriched label — not its status, its chips or its actions. The confidence chip is the
      // proof it is still reading the LINE: the failure flag is the history read's, not the line's.
      expect(textOf(root, "line-row-reports")).toBe("2 reports");
      // Scoped to the reports element: the vehicle chip's popover is in the same strip now, and the
      // plain rolling count must still have none of its own.
      expect(root.querySelector('[data-testid="line-row-reports-wrap"]')).toBeNull();
      expect(
        root.querySelector('[data-testid="line-row-reports"]')?.closest("app-info-popover"),
      ).toBeNull();
      expect(textOf(root, "line-row-confidence")).toBe("Unconfirmed (2 reports)");
      expect(root.querySelector('[data-testid="line-row-report"]')).not.toBeNull();
    });

    it("reads only ITS line's history, so two rows never show the same total", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(SERVICE_DAY_START + 1.5 * 3600_000));
      // The board mounts one row per line, and "My lines" and "All lines" can hold the SAME pinned
      // line at once — so a lookup that missed the line id would show one row's day on another.
      historyByLine.set("line-9", serviceDay());
      historyByLine.set("line-8", []);
      const root = await renderWithClock(makeLine({ id: "line-8", statusReportCount: 3 }));

      expect(textOf(root, "line-row-reports")).toBe("3 reports");

      fixture.componentRef.setInput("line", makeLine({ id: "line-9", statusReportCount: 3 }));
      fixture.detectChanges();
      expect(textOf(root, "line-row-reports")).toBe("5 reports (2 this hour)");
    });

    it("moves the bracket to the next hour on the next poll beat, never leaves it stale", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(SERVICE_DAY_START + 1.5 * 3600_000));
      historyByLine.set("line-9", serviceDay());
      const root = await renderWithClock(makeLine({ id: "line-9" }));
      expect(textOf(root, "line-row-reports")).toBe("5 reports (2 this hour)");

      // 21:30Z is hour 3, which nobody reported in: the day total is unchanged and the bracket drops
      // to zero. A label frozen at mount would still claim 2 reports "this hour" an hour later.
      vi.setSystemTime(new Date(SERVICE_DAY_START + 2.5 * 3600_000));
      fixture.componentRef.setInput("refreshTick", 1);
      fixture.detectChanges();

      expect(textOf(root, "line-row-reports")).toBe("5 reports (0 this hour)");
    });
  });

  it("fills the pin icon only while the row is pinned", () => {
    const root = render(makeLine({ id: "line-42" }));
    const icon = () => root.querySelector('[data-testid="line-row-pin"]')?.querySelector("ng-icon");
    const pin = root.querySelector<HTMLButtonElement>('[data-testid="line-row-pin"]');

    // `aria-pressed` says it to a screen reader; the filled glyph says it to everyone else. An
    // outline pin about a pinned line is the one misreading this affordance cannot afford.
    expect(icon()?.getAttribute("class")).not.toContain("fill-current");

    pin?.click();
    fixture.detectChanges();

    const filled = icon()?.getAttribute("class") ?? "";
    expect(filled).toContain("fill-current");
    expect(filled).toContain("size-4");

    pin?.click();
    fixture.detectChanges();
    expect(icon()?.getAttribute("class")).not.toContain("fill-current");
  });

  it("keeps the pro detail off a rider row, and draws no Line HQ link in any view", () => {
    const rider = render(makeLine({ id: "line-7" }));
    expect(rider.querySelector('[data-testid="line-row-pro"]')).toBeNull();

    const pro = render(makeLine({ id: "line-7" }), { viewMode: "pro" });
    expect(pro.querySelector('[data-testid="line-row-pro"]')).not.toBeNull();
    // "Line HQ" is gone from every row surface: Details is the same destination without the second
    // way in, and two links to one place was a choice with no reason behind it.
    expect(pro.querySelector('[data-testid="line-row-hq"]')).toBeNull();
  });

  it("shows the unified pin / Details / Report set in both views, in that order", () => {
    // The board's whole point since the unification: whichever group a line lands in, the row reads
    // as ONE control set. Details is no longer a pro-only text link.
    for (const viewMode of ["rider", "pro"] as const) {
      const root = render(makeLine({ id: "line-7" }), { viewMode });
      // The pin is wrapped in its tooltip popover, so the cluster item is the popover host.
      const actions = root
        .querySelector('[data-testid="line-row-pin"]')
        ?.closest("app-info-popover")?.parentElement as HTMLElement;
      const ids = [...actions.querySelectorAll<HTMLElement>("[data-testid]")].map((el) =>
        el.getAttribute("data-testid"),
      );
      expect(ids, viewMode).toEqual(["line-row-pin", "line-row-details", "line-row-report"]);
      expect(root.querySelector('[data-testid="line-row-details"]')?.getAttribute("href")).toBe(
        "/spotting/line-7/details",
      );
    }
  });

  it("adds ONLY the report window in pro view — Details is part of the unified action set", () => {
    const root = render(makeLine({ id: "line-7", statusReportCount: 4, statusWindowMinutes: 15 }), {
      viewMode: "pro",
    });

    // The count WITH the span it covers: a bare number is what a pro reader is most likely to
    // over-read, and the window is what makes "4 reports" interpretable.
    expect(textOf(root, "line-row-report-window")).toBe("4 reports · 15 min window");
    // The old pro-only text link is gone: the unified Details button sits in the title row in every
    // view, so a second link to the same destination was pure duplication.
    expect(root.querySelector('[data-testid="line-row-hq-details"]')).toBeNull();
    expect(root.querySelector('[data-testid="line-row-details"]')?.getAttribute("href")).toBe(
      "/spotting/line-7/details",
    );
  });

  it("pads the row comfortably at every viewport, with no density input to change it", () => {
    const root = render(makeLine({ id: "line-7" }), { viewMode: "pro" });
    const row = root.querySelector<HTMLElement>('[data-testid="line-row"]');
    const classes = row?.className.split(/\s+/) ?? [];

    // The density control is gone with it: one padding for every device, and `pl-4` over `p-3`
    // because the accent rail owns the left edge.
    expect(classes).toContain("p-3");
    expect(classes).toContain("pl-4");
    expect(classes).not.toContain("py-2");
    expect(classes).not.toContain("pl-3.5");
    // …and it cost the row nothing: every fact and every action is still there.
    expect(row?.querySelector('[data-testid="line-row-confidence"]')).not.toBeNull();
    expect(row?.querySelector('[data-testid="line-row-details"]')).not.toBeNull();
    expect(row?.querySelector('[data-testid="line-row-report"]')).not.toBeNull();
    expect(row?.querySelector('[data-testid="line-row-pro"]')).not.toBeNull();
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
