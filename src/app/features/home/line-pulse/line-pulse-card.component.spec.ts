import { provideZonelessChangeDetection, signal } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReportSheetService } from "../../spotting/data/report-sheet.service";
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

    await TestBed.configureTestingModule({
      imports: [LinePulseCardComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClientTesting(),
        { provide: LineStatusSheetService, useValue: sheetMock },
        { provide: ReportSheetService, useValue: reportSheetMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LinePulseCardComponent);
    httpMock = TestBed.inject(HttpTestingController);
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

  it("lists the non-zero vehicle counts by status when the vehicle count is hovered", () => {
    const root = render(makeLine());

    openPopover(root, "line-vehicle-count");

    const rows = [...root.querySelectorAll('[data-testid="status-breakdown-row"]')].map((el) =>
      [...el.querySelectorAll("span")].map((span) => (span.textContent ?? "").trim()).join(" "),
    );
    expect(rows).toEqual(["In service 12", "Not spotted 3", "Out of service 1", "Total 16"]);
    expect(textOf(root, "line-vehicle-count")).toBe("12/16 in service");
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
});
