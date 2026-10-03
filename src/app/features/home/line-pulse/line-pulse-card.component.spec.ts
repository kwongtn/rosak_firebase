import { provideZonelessChangeDetection, signal } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReportSheetService } from "../../spotting/data/report-sheet.service";
import { PreferencesService } from "../../../core/preferences/preferences.service";
import {
  metricDoc,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import { LinePulse } from "../data/home.queries";
import { LineStatusSheetService } from "../data/line-status-sheet.service";
import { LinePulseCardComponent } from "./line-pulse-card.component";
import { LineStatusChartComponent } from "./line-status-chart.component";
import { LineStatusReportsComponent } from "./line-status-reports.component";

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
    statusReportCount: 3,
    vehicleStatusCounts: [
      { status: "IN_SERVICE", count: 12 },
      { status: "NOT_SPOTTED", count: 3 },
      { status: "OUT_OF_SERVICE", count: 1 },
      { status: "DECOMMISSIONED", count: 0 },
      { status: "MARRIED", count: 0 },
      { status: "TESTING", count: 0 },
      { status: "UNKNOWN", count: 0 },
    ],
    passengerStatusCount: 5,
    passengerStatusCounts: [
      { status: "NORMAL", count: 3 },
      { status: "BUSY", count: 2 },
    ],
    statusWindowMinutes: 15,
    pulseLinks: [],
    ...overrides,
  };
}

function textOf(root: HTMLElement, testId: string): string {
  const el = root.querySelector(`[data-testid="${testId}"]`);
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("LinePulseCardComponent", () => {
  let fixture: ComponentFixture<LinePulseCardComponent>;
  let httpMock: HttpTestingController;
  let preferences: PreferencesService;
  let sheetMock: {
    isOpen: ReturnType<typeof signal<boolean>>;
    lineId: ReturnType<typeof signal<string | null>>;
    openFor: ReturnType<typeof vi.fn>;
    setOpen: ReturnType<typeof vi.fn>;
  };
  let reportSheetMock: {
    isOpen: ReturnType<typeof signal<boolean>>;
    lineId: ReturnType<typeof signal<string | null>>;
    openFor: ReturnType<typeof vi.fn>;
    setOpen: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    sheetMock = {
      isOpen: signal(false),
      lineId: signal<string | null>(null),
      openFor: vi.fn(),
      setOpen: vi.fn(),
    };
    reportSheetMock = {
      isOpen: signal(false),
      lineId: signal<string | null>(null),
      openFor: vi.fn(),
      setOpen: vi.fn(),
    };
    // The pin is real state that outlives one fixture, so each test starts from a clean store
    // rather than inheriting whatever the previous card pinned.
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [LinePulseCardComponent],
      providers: [
        provideZonelessChangeDetection(),
        // The card's menu links OUT to the spotting feature, so the router must resolve
        // `/spotting/:lineId` and its `details` child — with an empty route table the click in the
        // "closes on choosing a link" spec rejects with NG04002 instead of navigating.
        provideRouter([
          { path: "spotting/:lineId", children: [{ path: "details", children: [] }] },
        ]),
        provideHttpClientTesting(),
        { provide: LineStatusSheetService, useValue: sheetMock },
        { provide: ReportSheetService, useValue: reportSheetMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LinePulseCardComponent);
    httpMock = TestBed.inject(HttpTestingController);
    preferences = TestBed.inject(PreferencesService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function render(line: LinePulse): HTMLElement {
    fixture.componentRef.setInput("line", line);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  /** The info chips open on tap in jsdom (no `matchMedia` ⇒ no hover capability). */
  function openPopover(root: HTMLElement, triggerTestId: string): void {
    const trigger = root.querySelector(`[data-testid="${triggerTestId}"]`)?.closest("button");
    expect(trigger).not.toBeNull();
    (trigger as HTMLElement).click();
    fixture.detectChanges();
  }

  function flushPendingRequests(): void {
    for (const request of httpMock.match(() => true)) {
      request.flush({ data: {} });
    }
  }

  it("renders the in-service vehicle count as the last badge pill in the status row", () => {
    const root = render(makeLine({ inServiceVehicleCount: 12, totalVehicleCount: 20 }));

    const badge = root.querySelector<HTMLElement>('[data-testid="line-vehicle-count"]');
    expect(badge?.textContent?.replace(/\s+/g, " ").trim()).toBe("12/20 in service");
    expect(badge?.getAttribute("aria-label")).toBe("12 of 20 vehicles in service");
    expect(badge?.getAttribute("data-slot")).toBe("badge");
    expect(badge?.className).toContain("bg-secondary");

    const chip = badge?.closest("app-status-info-chip");
    const row = chip?.parentElement;
    expect(row?.lastElementChild).toBe(chip);
    expect(row?.querySelector('[data-testid="passenger-status"]')).not.toBeNull();
  });

  it("shows 'No data' for a line with no passenger status", () => {
    const root = render(makeLine({ passengerStatus: null }));

    expect(textOf(root, "passenger-status")).toBe("No data");
  });

  it("shows the crowded label and no consolidated message inside the status popover", () => {
    const root = render(
      makeLine({
        passengerStatus: "CROWDED",
        passengerStatusMessage: "According to 5 social media entries, this line is Crowded.",
      }),
    );

    expect(textOf(root, "passenger-status")).toBe("Crowded");
    expect(root.querySelector('[data-testid="line-pulse-message"]')).toBeNull();

    openPopover(root, "passenger-status");

    expect(root.querySelector('[data-testid="status-info-message"]')).toBeNull();
    expect(textOf(root, "status-window")).toBe("Last 15 minutes");
  });

  it("hides the Active pill for an active line but keeps the status pill for other statuses", () => {
    const root = render(makeLine({ status: "ACTIVE" }));

    expect(root.querySelector("line-status-badge")).toBeNull();

    fixture.componentRef.setInput("line", makeLine({ status: "PARTIAL_DISRUPTION" }));
    fixture.detectChanges();

    const pill = root.querySelector("line-status-badge");
    expect(pill).not.toBeNull();
    expect(pill?.textContent?.trim()).toBe("Partial Disruption");
  });

  it("sizes both actions with the compact button variant and never stretches them", () => {
    const root = render(makeLine());

    for (const testId of ["submit-line-status", "add-spotting-entry"]) {
      const button = root.querySelector(`[data-testid="${testId}"]`) as HTMLElement;
      expect(button.className).toContain("h-7");
      expect(button.className).toContain("px-2.5");
      expect(button.className).toContain("w-full");
      expect(button.className).toContain("sm:w-auto");
      expect(button.className).not.toContain("h-11");
      expect(button.className).not.toContain("text-base");
    }

    const actions = root.querySelector('[data-testid="submit-line-status"]')
      ?.parentElement as HTMLElement;
    expect(actions.className).not.toContain("items-stretch");
    expect(actions.className).toContain("items-start");
  });

  it("names the two actions as the reader's intent, not as internal nouns", () => {
    const root = render(makeLine());

    expect(textOf(root, "submit-line-status")).toBe("Report status");
    expect(textOf(root, "add-spotting-entry")).toBe("Log spotting");
  });

  it("draws the line's own colour as a leading accent rail", () => {
    const root = render(makeLine({ displayColor: "#00af91" }));

    const rail = [...root.querySelectorAll<HTMLElement>("section > span")].find(
      (span) => span.getAttribute("aria-hidden") === "true" && span.style.backgroundColor !== "",
    );
    expect(rail).toBeDefined();
    // A backend hex rather than a themed token, so identification survives dark mode without a
    // second, dark-only colour table.
    expect(rail?.style.backgroundColor).toBe("rgb(0, 175, 145)");
  });

  it("lists the non-zero vehicle counts by status when the vehicle count is hovered", () => {
    const root = render(makeLine());

    openPopover(root, "line-vehicle-count");

    const rows = [...root.querySelectorAll('[data-testid="status-breakdown-row"]')].map((el) =>
      [...el.querySelectorAll("span")].map((span) => (span.textContent ?? "").trim()).join(" "),
    );
    expect(rows).toEqual(["In service 12", "Not spotted 3", "Out of service 1", "Total 16"]);
    expect(textOf(root, "line-vehicle-count")).toBe("12/16 in service");

    const definition = root
      .querySelector('[data-testid="status-info-popover"]')
      ?.querySelectorAll("p")[1];
    expect(definition?.textContent?.trim()).toBe(
      renderMethodologyCopy(metricDoc("line-pulse.vehicle-count").definition),
    );
  });

  it("deep-links each status chip to the methodology section owning its metric", () => {
    const root = render(makeLine({ passengerStatus: "CROWDED" }));

    openPopover(root, "passenger-status");
    const passengerChip = root
      .querySelector('[data-testid="passenger-status"]')
      ?.closest("app-status-info-chip");
    expect(
      passengerChip?.querySelector('[data-testid="status-info-popover"] a')?.getAttribute("href"),
    ).toBe("/methodology#sightings");

    openPopover(root, "line-vehicle-count");
    const vehicleChip = root
      .querySelector('[data-testid="line-vehicle-count"]')
      ?.closest("app-status-info-chip");
    expect(
      vehicleChip?.querySelector('[data-testid="status-info-popover"] a')?.getAttribute("href"),
    ).toBe("/methodology#line-status");
  });

  it("renders every status chip as a text pill with no 'i' glyph", () => {
    const root = render(makeLine({ status: "PARTIAL_DISRUPTION" }));

    const statusTrigger = root.querySelector("line-status-badge")?.closest("button");
    expect(statusTrigger).not.toBeNull();
    expect(statusTrigger?.querySelector('span[aria-hidden="true"]')).toBeNull();

    for (const testId of ["passenger-status", "line-vehicle-count"]) {
      const trigger = root.querySelector(`[data-testid="${testId}"]`)?.closest("button");
      expect(trigger, testId).not.toBeNull();
      expect(trigger?.querySelector('span[aria-hidden="true"]'), testId).toBeNull();
    }
  });

  it("drops the methodology link for the line-status chip but keeps it on the passenger chip", () => {
    const root = render(makeLine({ status: "PARTIAL_DISRUPTION", passengerStatus: "CROWDED" }));

    const passengerChip = root
      .querySelector('[data-testid="passenger-status"]')
      ?.closest("app-status-info-chip") as HTMLElement;
    const lineStatusChip = root
      .querySelector("line-status-badge")
      ?.closest("app-status-info-chip") as HTMLElement;

    openPopover(root, "passenger-status");
    expect(passengerChip.querySelector('[data-testid="status-info-popover"] a')).not.toBeNull();

    (lineStatusChip.querySelector("button") as HTMLButtonElement).click();
    fixture.detectChanges();

    const lineStatusPanel = lineStatusChip.querySelector('[data-testid="status-info-popover"]');
    expect(lineStatusPanel).not.toBeNull();
    expect(lineStatusPanel?.querySelector("a")).toBeNull();
    expect(lineStatusPanel?.getAttribute("role")).toBe("tooltip");
  });

  it("folds the per-status report counts into the passenger legend rows", () => {
    const root = render(
      makeLine({
        passengerStatus: "CROWDED",
        passengerStatusCounts: [
          { status: "BUSY", count: 2 },
          { status: "CROWDED", count: 0 },
          { status: "NORMAL", count: 1 },
        ],
      }),
    );

    openPopover(root, "passenger-status");

    const rows = [...root.querySelectorAll('[data-testid="status-scale-entry"]')];
    expect(rows).toHaveLength(7);

    const countOf = (label: string): string =>
      rows
        .find((row) => row.textContent?.includes(label))
        ?.querySelector('[data-testid="status-scale-count"]')
        ?.textContent?.trim() ?? "";

    expect(countOf("Normal")).toBe("(1)");
    expect(countOf("Busy")).toBe("(2)");
    expect(countOf("Crowded")).toBe("");
    expect(root.querySelectorAll('[data-testid="status-count-pill"]')).toHaveLength(0);
  });

  it("shows no legend counts when the line reported no passenger counts", () => {
    const root = render(makeLine({ passengerStatus: null, passengerStatusCounts: [] }));

    openPopover(root, "passenger-status");

    expect(root.querySelectorAll('[data-testid="status-scale-entry"]')).toHaveLength(7);
    expect(root.querySelectorAll('[data-testid="status-scale-count"]')).toHaveLength(0);
  });

  it("no longer renders the rolling-window count badge next to the crowd status", () => {
    const root = render(makeLine({ passengerStatus: "CROWDED", passengerStatusCount: 7 }));

    expect(root.querySelector('[data-testid="passenger-status-count"]')).toBeNull();
  });

  it("opens the status sheet for this line when the submit button is clicked", () => {
    const root = render(makeLine({ id: "line-42" }));

    const button = root.querySelector<HTMLButtonElement>('[data-testid="submit-line-status"]');
    expect(button).not.toBeNull();
    button?.click();

    expect(sheetMock.openFor).toHaveBeenCalledWith("line-42");
  });

  it("opens the spotting sheet seeded with this line from the add-entry button", () => {
    const root = render(makeLine({ id: "line-42" }));

    const button = root.querySelector<HTMLButtonElement>('[data-testid="add-spotting-entry"]');
    expect(button).not.toBeNull();
    button?.click();

    expect(reportSheetMock.openFor).toHaveBeenCalledWith("line-42");
  });

  it("expands and collapses from the title-row toggle without reacting to the actions", () => {
    const root = render(makeLine());
    const toggle = root.querySelector<HTMLElement>('[data-testid="line-card-toggle"]');

    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelector('[data-testid="line-card-expanded"]')).toBeNull();

    toggle?.click();
    fixture.detectChanges();
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(root.querySelector('[data-testid="line-card-expanded"]')).not.toBeNull();
    flushPendingRequests();

    root.querySelector<HTMLButtonElement>('[data-testid="submit-line-status"]')?.click();
    fixture.detectChanges();
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");

    toggle?.click();
    fixture.detectChanges();
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelector('[data-testid="line-card-expanded"]')).toBeNull();
  });

  it("points the toggle's aria-controls at this line's OWN panel id", () => {
    const root = render(makeLine({ id: "line-42" }));
    const toggle = root.querySelector<HTMLElement>('[data-testid="line-card-toggle"]');

    // Scoped to the line, because the board mounts one card per attention line: a bare id would put
    // the same attribute on every panel and every toggle would resolve to the first one on the page.
    expect(toggle?.getAttribute("aria-controls")).toBe("line-card-expanded-line-42");

    toggle?.click();
    fixture.detectChanges();
    const panel = root.querySelector<HTMLElement>('[data-testid="line-card-expanded"]');
    expect(panel?.id).toBe("line-card-expanded-line-42");
    expect(panel?.id).toBe(toggle?.getAttribute("aria-controls"));
    flushPendingRequests();
  });

  it("fetches nothing until expanded, then loads the hourly chart and the report list", async () => {
    const root = render(makeLine({ id: "line-7" }));

    expect(httpMock.match(() => true)).toHaveLength(0);

    root.querySelector<HTMLElement>('[data-testid="line-card-toggle"]')?.click();
    fixture.detectChanges();

    const historyRequest = httpMock.expectOne((r) => r.body.query.includes("LineStatusHistory"));
    expect(historyRequest.request.body.variables).toEqual({
      lineId: "line-7",
      dayStartHour: 3,
    });
    historyRequest.flush({
      data: {
        lineStatusHistory: [
          {
            hourStart: "2026-09-21T19:00:00+00:00",
            hourEnd: "2026-09-21T20:00:00+00:00",
            count: 4,
            dominantStatus: "CROWDED",
            statusCounts: [
              { status: "BUSY", count: 1 },
              { status: "CROWDED", count: 3 },
            ],
          },
        ],
      },
    });

    const reportsRequest = httpMock.expectOne((r) => r.body.query.includes("LineStatusReports"));
    expect(reportsRequest.request.body.variables).toEqual({ lineId: "line-7", first: 10 });
    reportsRequest.flush({
      data: {
        lineStatusReports: {
          edges: [
            {
              node: {
                id: "r1",
                status: "CROWDED",
                delayMinutes: 12,
                notes: "Packed at KLCC.",
                stations: [],
                created: new Date().toISOString(),
                user: null,
              },
              cursor: "c1",
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('[data-testid="line-status-chart"]')).not.toBeNull();
    expect(root.querySelectorAll('[data-testid="line-status-bar"]')).toHaveLength(1);
    expect(root.querySelectorAll('[data-testid="line-status-report"]')).toHaveLength(1);
  });

  describe("the kebab menu", () => {
    function openMenu(root: HTMLElement): void {
      const trigger = root.querySelector<HTMLButtonElement>('[data-testid="line-card-menu"]');
      expect(trigger).not.toBeNull();
      trigger?.click();
      fixture.detectChanges();
    }

    it("keeps pin and the two Line HQ links behind a collapsed, labelled menu", () => {
      const root = render(makeLine({ id: "line-42" }));

      const trigger = root.querySelector('[data-testid="line-card-menu"]');
      expect(trigger?.getAttribute("aria-expanded")).toBe("false");
      expect(trigger?.getAttribute("aria-haspopup")).toBe("menu");
      expect(trigger?.getAttribute("aria-label")).toBe("More actions for KJL");
      expect(root.querySelector('[data-testid="line-card-menu-panel"]')).toBeNull();
      // The two reporting actions are the only visible buttons on a collapsed card.
      expect(root.querySelectorAll("button[data-testid]").length).toBeGreaterThan(0);
      expect(root.querySelector('[data-testid="line-card-pin"]')).toBeNull();
      expect(root.querySelector('[data-testid="line-card-hq"]')).toBeNull();
      expect(root.querySelector('[data-testid="line-card-hq-details"]')).toBeNull();

      openMenu(root);

      expect(trigger?.getAttribute("aria-expanded")).toBe("true");
      const panel = root.querySelector('[data-testid="line-card-menu-panel"]');
      expect(panel?.getAttribute("role")).toBe("menu");
      expect(panel?.querySelectorAll('[role="menuitem"]').length).toBe(3);
    });

    it("links out to this line's Line HQ and details pages", () => {
      const root = render(makeLine({ id: "line-42" }));
      openMenu(root);

      expect(root.querySelector('[data-testid="line-card-hq"]')?.getAttribute("href")).toBe(
        "/spotting/line-42",
      );
      expect(root.querySelector('[data-testid="line-card-hq-details"]')?.getAttribute("href")).toBe(
        "/spotting/line-42/details",
      );
    });

    it("pins through PreferencesService and closes", () => {
      const root = render(makeLine({ id: "line-42" }));
      expect(preferences.isPinned("line-42")).toBe(false);

      openMenu(root);
      expect(textOf(root, "line-card-pin")).toBe("Pin this line");
      root.querySelector<HTMLButtonElement>('[data-testid="line-card-pin"]')?.click();
      fixture.detectChanges();

      expect(preferences.isPinned("line-42")).toBe(true);
      expect(root.querySelector('[data-testid="line-card-menu-panel"]')).toBeNull();

      openMenu(root);
      expect(textOf(root, "line-card-pin")).toBe("Unpin this line");
    });

    it("closes on Escape, on an outside click, and on choosing a link", () => {
      const root = render(makeLine());

      openMenu(root);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      fixture.detectChanges();
      expect(root.querySelector('[data-testid="line-card-menu-panel"]')).toBeNull();

      openMenu(root);
      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      fixture.detectChanges();
      expect(root.querySelector('[data-testid="line-card-menu-panel"]')).toBeNull();

      openMenu(root);
      root.querySelector<HTMLAnchorElement>('[data-testid="line-card-hq"]')?.click();
      fixture.detectChanges();
      expect(root.querySelector('[data-testid="line-card-menu-panel"]')).toBeNull();
    });
  });

  it("forwards refreshTick to the expanded chart and reports", () => {
    const root = render(makeLine({ id: "line-7" }));

    root.querySelector<HTMLElement>('[data-testid="line-card-toggle"]')?.click();
    fixture.detectChanges();
    flushPendingRequests();

    fixture.componentRef.setInput("refreshTick", 5);
    fixture.detectChanges();

    const chart = fixture.debugElement.query(By.directive(LineStatusChartComponent));
    const reports = fixture.debugElement.query(By.directive(LineStatusReportsComponent));
    expect(chart).not.toBeNull();
    expect(reports).not.toBeNull();
    expect(chart.componentInstance.refreshTick()).toBe(5);
    expect(reports.componentInstance.refreshTick()).toBe(5);

    // The forwarded tick re-issues the children's own reads, so settle them before teardown.
    flushPendingRequests();
  });

  describe("the confidence chip", () => {
    /** One `pulseLinks` entry; `isAutomated` is what makes a post operator-sourced. */
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

    it("says so plainly when a line has no reports at all", () => {
      const root = render(makeLine({ statusReportCount: 0 }));

      // The baseline fixture carries NORMAL and no reports, so the chip must NOT claim confidence it
      // does not have — "we know nothing" is its own state, not an optimistic "Confirmed".
      expect(textOf(root, "line-card-confidence")).toBe("No recent reports");
    });

    it("prints the report count in the unconfirmed label", () => {
      const root = render(makeLine({ status: "PARTIAL_DISRUPTION", statusReportCount: 1 }));
      expect(textOf(root, "line-card-confidence")).toBe("Unconfirmed (1 reports)");
    });

    it("confirms once enough riders corroborate", () => {
      const root = render(makeLine({ passengerStatus: "DELAYED", statusReportCount: 3 }));
      expect(textOf(root, "line-card-confidence")).toBe("Confirmed");
    });

    it("prefers an operator-sourced post over any rider tally", () => {
      const root = render(
        makeLine({
          status: "TOTAL_DISRUPTION",
          statusReportCount: 40,
          pulseLinks: [pulseLink({ isAutomated: false, id: "rider" }), pulseLink()],
        }),
      );

      expect(textOf(root, "line-card-confidence")).toBe("Official update");
    });

    it("sits immediately after the operational pill, so the two read as one sentence", () => {
      const root = render(makeLine({ status: "PARTIAL_DISRUPTION", statusReportCount: 1 }));

      const statusChip = root.querySelector("line-status-badge")?.closest("app-status-info-chip");
      const confidenceChip = root
        .querySelector('[data-testid="line-card-confidence"]')
        ?.closest("app-status-info-chip");
      expect(statusChip).not.toBeNull();
      expect(confidenceChip).not.toBeNull();
      // It also precedes the passenger chip: "Partial Disruption · Unconfirmed (1 report) · Crowded"
      // is the reading order a rider scans.
      const passengerChip = root
        .querySelector('[data-testid="passenger-status"]')
        ?.closest("app-status-info-chip");
      expect((statusChip as HTMLElement).compareDocumentPosition(confidenceChip as Node)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect((confidenceChip as HTMLElement).compareDocumentPosition(passengerChip as Node)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    it("explains its own level from the methodology registry, and deep-links to it", () => {
      const root = render(makeLine({ passengerStatus: "DELAYED", statusReportCount: 4 }));

      const chip = root
        .querySelector('[data-testid="line-card-confidence"]')
        ?.closest("app-status-info-chip") as HTMLElement;
      (chip.querySelector("button") as HTMLButtonElement).click();
      fixture.detectChanges();

      const panel = chip.querySelector('[data-testid="status-info-popover"]');
      // The panel names the level ON SCREEN — a confirmed tally is explained differently from an
      // operator post — so the metric id travels with the resolved level.
      expect(panel?.querySelectorAll("p")[1]?.textContent?.trim()).toBe(
        renderMethodologyCopy(metricDoc("status-confidence.confirmed").definition),
      );
      expect(panel?.querySelector("a")?.getAttribute("href")).toBe("/methodology#line-status");
    });
  });
});
