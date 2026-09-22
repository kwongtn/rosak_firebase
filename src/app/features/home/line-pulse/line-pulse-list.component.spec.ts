import { provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LinePulse } from "../data/home.queries";
import { LineStatusSheetService } from "../data/line-status-sheet.service";
import { LinePulseListComponent } from "./line-pulse-list.component";

function makeLine(id: string, status: LinePulse["status"] = "ACTIVE"): LinePulse {
  return {
    id,
    code: id.toUpperCase(),
    displayName: `Line ${id}`,
    displayColor: "#e11d48",
    status,
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

  it("folds non-ACTIVE lines into a collapsed Other lines section", () => {
    fixture.componentRef.setInput("lines", [
      makeLine("a"),
      makeLine("b", "PARTIAL_DISRUPTION"),
      makeLine("c"),
    ]);
    fixture.componentRef.setInput("isLoading", false);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const details = root.querySelector<HTMLDetailsElement>('[data-testid="other-lines"]');

    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(details?.querySelectorAll("app-line-pulse-card").length).toBe(1);

    const summary = details?.querySelector('[data-testid="other-lines-summary"]');
    expect((summary?.textContent ?? "").replace(/\s+/g, " ").trim()).toBe("Other lines 1");

    const cards = [...root.querySelectorAll("app-line-pulse-card")];
    expect(cards.length).toBe(3);
    expect(cards[0]?.textContent).toContain("Line a");
    expect(cards[1]?.textContent).toContain("Line c");
    expect(cards[2]?.textContent).toContain("Line b");
    expect(details?.contains(cards[2] ?? null)).toBe(true);
  });

  it("renders no Other lines section when every line is ACTIVE", () => {
    fixture.componentRef.setInput("lines", [makeLine("a"), makeLine("b")]);
    fixture.componentRef.setInput("isLoading", false);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="other-lines"]')).toBeNull();
    expect(root.querySelectorAll("app-line-pulse-card").length).toBe(2);
  });
});
