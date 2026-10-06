import { provideZonelessChangeDetection, signal } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  beforeEach(async () => {
    sheetMock = {
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
        // The card's visible Details button links OUT to the spotting feature, so the router must
        // resolve `/spotting/:lineId/details` — with an empty route table the href would not
        // resolve to a real route.
        provideRouter([
          { path: "spotting/:lineId", children: [{ path: "details", children: [] }] },
        ]),
        provideHttpClientTesting(),
        { provide: LineStatusSheetService, useValue: sheetMock },
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

  it("sizes the labelled actions with the compact button variant and never stretches them", () => {
    const root = render(makeLine());

    for (const testId of ["line-card-details", "submit-line-status"]) {
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
    // The pin is the icon-only member of the same cluster — it must not stretch with the labels.
    const pin = root.querySelector('[data-testid="line-card-pin"]') as HTMLElement;
    expect(pin.className).toContain("size-7");
    expect(pin.className).not.toContain("w-full");
  });

  it("names the actions as the reader's intent, not as internal nouns", () => {
    const root = render(makeLine());

    expect(textOf(root, "submit-line-status")).toBe("Report");
    expect(textOf(root, "line-card-details")).toBe("Details");
    // "Log spotting" left the card with the unification: the board's per-line set is pin/Details/
    // Report, and spotting lives on its own surfaces.
    expect(root.querySelector('[data-testid="add-spotting-entry"]')).toBeNull();
  });

  it("shows a visible Details link out to this line's details page, left of Report", () => {
    const root = render(makeLine({ id: "line-42" }));

    const details = root.querySelector<HTMLAnchorElement>('[data-testid="line-card-details"]');
    expect(details).not.toBeNull();
    expect(details?.tagName).toBe("A");
    expect(textOf(root, "line-card-details")).toBe("Details");
    expect(details?.getAttribute("href")).toBe("/spotting/line-42/details");
    // hlmBtn on an anchor, so it is a real button-looking control rather than a bare text link.
    expect(details?.getAttribute("data-slot")).toBe("button");
    expect(details?.className).toContain("h-7");

    const report = root.querySelector('[data-testid="submit-line-status"]');
    expect(report).not.toBeNull();
    expect((details as HTMLElement).compareDocumentPosition(report as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    // Same cluster as the pin and the report button, so mobile still stacks them full-width — and
    // the reading order is exactly pin, Details, Report. The pin is wrapped in its tooltip popover,
    // so the cluster item is the popover HOST, not the button itself.
    const pin = root.querySelector<HTMLElement>('[data-testid="line-card-pin"]');
    const pinClusterItem = pin?.closest("app-info-popover");
    expect(details?.parentElement).toBe(report?.parentElement);
    expect(pinClusterItem?.parentElement).toBe(details?.parentElement);
    expect((pinClusterItem as HTMLElement).compareDocumentPosition(details as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
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
    // The status badge and the confidence/passenger chips never coexist on one line now: a
    // non-Active line draws the badge, an Active one draws the confidence and passenger chips.
    const root = render(makeLine({ status: "PARTIAL_DISRUPTION" }));

    const statusTrigger = root.querySelector("line-status-badge")?.closest("button");
    expect(statusTrigger).not.toBeNull();
    expect(statusTrigger?.querySelector('span[aria-hidden="true"]')).toBeNull();

    fixture.componentRef.setInput("line", makeLine());
    fixture.detectChanges();

    for (const testId of ["line-card-confidence", "passenger-status", "line-vehicle-count"]) {
      const trigger = root.querySelector(`[data-testid="${testId}"]`)?.closest("button");
      expect(trigger, testId).not.toBeNull();
      expect(trigger?.querySelector('span[aria-hidden="true"]'), testId).toBeNull();
    }
  });

  it("drops the methodology link for the line-status chip but keeps it on the passenger chip", () => {
    const root = render(makeLine({ status: "PARTIAL_DISRUPTION" }));

    const lineStatusChip = root
      .querySelector("line-status-badge")
      ?.closest("app-status-info-chip") as HTMLElement;

    (lineStatusChip.querySelector("button") as HTMLButtonElement).click();
    fixture.detectChanges();

    const lineStatusPanel = lineStatusChip.querySelector('[data-testid="status-info-popover"]');
    expect(lineStatusPanel).not.toBeNull();
    expect(lineStatusPanel?.querySelector("a")).toBeNull();
    expect(lineStatusPanel?.getAttribute("role")).toBe("tooltip");

    // The passenger chip only exists on an Active line, so pivot the fixture to one.
    fixture.componentRef.setInput("line", makeLine({ passengerStatus: "CROWDED" }));
    fixture.detectChanges();

    const passengerChip = root
      .querySelector('[data-testid="passenger-status"]')
      ?.closest("app-status-info-chip") as HTMLElement;
    openPopover(root, "passenger-status");
    expect(passengerChip.querySelector('[data-testid="status-info-popover"] a')).not.toBeNull();
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

  it("pins inline through PreferencesService, with the glyph filling like the row's", () => {
    const root = render(makeLine({ id: "line-42" }));
    const pin = root.querySelector<HTMLButtonElement>('[data-testid="line-card-pin"]');
    expect(pin).not.toBeNull();
    expect(pin?.className).toContain("size-7");
    expect(pin?.getAttribute("aria-pressed")).toBe("false");
    expect(pin?.getAttribute("aria-label")).toBe("Pin KJL");

    // The pin is wrapped in the shared tooltip primitive in BARE mode: the pin button IS the
    // trigger, so there is no wrapping button to nest it inside — `closest("button")` is itself.
    expect(pin?.closest("button")).toBe(pin);
    const trigger = pin?.parentElement as HTMLElement;
    trigger.click();
    fixture.detectChanges();
    const panel = () => root.querySelector('[data-testid="line-card-pin-popover"]');
    expect(panel()?.querySelectorAll("p")[0]?.textContent?.trim()).toBe("Click to pin");
    expect(panel()?.querySelectorAll("p")[1]?.textContent?.trim()).toBe(
      "Pin this line to keep it in My lines at the top of the board.",
    );

    expect(preferences.isPinned("line-42")).toBe(false);
    pin?.click();
    fixture.detectChanges();

    // `aria-pressed` says it to a screen reader; the filled glyph says it to everyone else.
    expect(preferences.isPinned("line-42")).toBe(true);
    expect(pin?.getAttribute("aria-pressed")).toBe("true");
    expect(pin?.getAttribute("aria-label")).toBe("Unpin KJL");
    expect(pin?.querySelector("ng-icon")?.getAttribute("class")).toContain("fill-current");

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
      const root = render(makeLine({ statusReportCount: 1 }));
      expect(textOf(root, "line-card-confidence")).toBe("Unconfirmed (1 reports)");
    });

    it("confirms once enough riders corroborate", () => {
      const root = render(makeLine({ passengerStatus: "DELAYED", statusReportCount: 3 }));
      expect(textOf(root, "line-card-confidence")).toBe("Confirmed");
    });

    it("prefers an operator-sourced post over any rider tally", () => {
      const root = render(
        makeLine({
          statusReportCount: 40,
          pulseLinks: [pulseLink({ isAutomated: false, id: "rider" }), pulseLink()],
        }),
      );

      expect(textOf(root, "line-card-confidence")).toBe("Official update");
    });

    it("shows both the confidence and the passenger chip for an Active line, and neither otherwise", () => {
      const root = render(makeLine());

      expect(root.querySelector('[data-testid="line-card-confidence"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="passenger-status"]')).not.toBeNull();

      // A non-Active badge already tells the story: the confidence question ("how sure are we?")
      // and the crowd reading are noise beside it, so both chips step aside.
      fixture.componentRef.setInput("line", makeLine({ status: "PARTIAL_DISRUPTION" }));
      fixture.detectChanges();

      expect(root.querySelector("line-status-badge")).not.toBeNull();
      expect(root.querySelector('[data-testid="line-card-confidence"]')).toBeNull();
      expect(root.querySelector('[data-testid="passenger-status"]')).toBeNull();
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
