import { provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LinePulse } from "../data/home.queries";
import { LineStatusSheetService } from "../data/line-status-sheet.service";
import { LinePulseListComponent } from "./line-pulse-list.component";

function makeLine(id: string): LinePulse {
  return {
    id,
    code: id.toUpperCase(),
    displayName: `Line ${id}`,
    displayColor: "#e11d48",
    status: "ACTIVE",
    inServiceVehicleCount: 1,
    totalVehicleCount: 2,
    passengerStatus: "NORMAL",
    passengerStatusMessage: null,
    statusReportCount: 0,
    pulseLinks: [],
  };
}

describe("LinePulseListComponent", () => {
  let fixture: ComponentFixture<LinePulseListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LinePulseListComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: LineStatusSheetService,
          useValue: {
            isOpen: signal(false),
            lineId: signal<string | null>(null),
            openFor: vi.fn(),
            setOpen: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LinePulseListComponent);
  });

  it("renders skeleton placeholders while loading", () => {
    fixture.componentRef.setInput("lines", []);
    fixture.componentRef.setInput("isLoading", true);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('[data-testid="line-skeleton"]').length).toBeGreaterThan(0);
    expect(root.querySelectorAll("app-line-pulse-card").length).toBe(0);
  });

  it("renders a friendly empty message when there are no lines", () => {
    fixture.componentRef.setInput("lines", []);
    fixture.componentRef.setInput("isLoading", false);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect((root.textContent ?? "").replace(/\s+/g, " ")).toContain("No lines yet");
    expect(root.querySelectorAll("app-line-pulse-card").length).toBe(0);
  });

  it("renders one card per line", () => {
    fixture.componentRef.setInput("lines", [makeLine("a"), makeLine("b"), makeLine("c")]);
    fixture.componentRef.setInput("isLoading", false);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll("app-line-pulse-card").length).toBe(3);
  });
});
