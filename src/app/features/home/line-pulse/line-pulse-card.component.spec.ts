import { provideZonelessChangeDetection, signal } from "@angular/core";
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

  it("renders the in-service vehicle count as 'X of Y vehicles in service'", () => {
    const root = render(makeLine({ inServiceVehicleCount: 12, totalVehicleCount: 20 }));

    expect(textOf(root, "line-vehicle-count")).toBe("12 of 20 vehicles in service");
  });

  it("shows 'No data' for a line with no passenger status", () => {
    const root = render(makeLine({ passengerStatus: null }));

    expect(textOf(root, "passenger-status")).toBe("No data");
  });

  it("shows the crowded label and the consolidated message", () => {
    const root = render(
      makeLine({
        passengerStatus: "CROWDED",
        passengerStatusMessage: "According to 5 social media entries, this line is Crowded.",
      }),
    );

    expect(textOf(root, "passenger-status")).toBe("Crowded");
    expect(textOf(root, "line-pulse-message")).toBe(
      "According to 5 social media entries, this line is Crowded.",
    );
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
