import { provideZonelessChangeDetection, signal } from "@angular/core";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportSheetService } from "../../spotting/data/report-sheet.service";
import { LinePulse } from "../data/home.queries";
import { LineStatusSheetService } from "../data/line-status-sheet.service";
import { LinePulseCardComponent } from "./line-pulse-card.component";

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
        provideHttpClientTesting(),
        { provide: LineStatusSheetService, useValue: sheetMock },
        { provide: ReportSheetService, useValue: reportSheetMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LinePulseCardComponent);
  });

  function render(line: LinePulse): HTMLElement {
    fixture.componentRef.setInput("line", line);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  /** The info chips open on tap in jsdom (no `matchMedia` ⇒ no hover capability). */
  function openPopover(root: HTMLElement, triggerTestId: string): void {
    const trigger = root
      .querySelector(`[data-testid="${triggerTestId}"]`)
      ?.closest("[role='button']");
    expect(trigger).not.toBeNull();
    (trigger as HTMLElement).click();
    fixture.detectChanges();
  }

  it("renders the in-service vehicle count as 'X of Y vehicles in service'", () => {
    const root = render(makeLine({ inServiceVehicleCount: 12, totalVehicleCount: 20 }));

    expect(textOf(root, "line-vehicle-count")).toBe("12 of 20 vehicles in service");
  });

  it("shows 'No data' for a line with no passenger status", () => {
    const root = render(makeLine({ passengerStatus: null }));

    expect(textOf(root, "passenger-status")).toBe("No data");
  });

  it("shows the crowded label and the consolidated message inside the status popover", () => {
    const root = render(
      makeLine({
        passengerStatus: "CROWDED",
        passengerStatusMessage: "According to 5 social media entries, this line is Crowded.",
      }),
    );

    expect(textOf(root, "passenger-status")).toBe("Crowded");
    expect(root.querySelector('[data-testid="line-pulse-message"]')).toBeNull();

    openPopover(root, "passenger-status");

    expect(textOf(root, "status-info-message")).toBe(
      "According to 5 social media entries, this line is Crowded.",
    );
    expect(textOf(root, "status-window")).toBe("Last 15 minutes");
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
    expect(textOf(root, "line-vehicle-count")).toBe("12 of 16 vehicles in service");
  });

  it("shows the rolling-window report count next to the crowd status", () => {
    const root = render(
      makeLine({ passengerStatus: "CROWDED", passengerStatusCount: 7, statusWindowMinutes: 15 }),
    );

    const badge = root.querySelector('[data-testid="passenger-status-count"]') as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.textContent?.trim()).toBe("7");
    expect(badge.getAttribute("title")).toBe("7 reports in the last 15 minutes");
    expect(badge.getAttribute("aria-label")).toBe("7 reports in the last 15 minutes");
  });

  it("shows no count badge when the line has no crowd status", () => {
    const root = render(makeLine({ passengerStatus: null, passengerStatusCount: 0 }));

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
});
