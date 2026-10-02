import { provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LinePulse } from "../data/home.queries";
import { LineStatusSheetService } from "../data/line-status-sheet.service";
import { LinePulseCardComponent } from "./line-pulse-card.component";
import { LinePulseListComponent } from "./line-pulse-list.component";

function makeLine(
  id: string,
  status: LinePulse["status"] = "ACTIVE",
  overrides: Partial<LinePulse> = {},
): LinePulse {
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
    vehicleStatusCounts: [{ status: "IN_SERVICE", count: 1 }],
    passengerStatusCount: 0,
    statusWindowMinutes: 15,
    pulseLinks: [],
    ...overrides,
  };
}

/**
 * The rendered rows' line codes, in DOM order — read off the card's own toggle, which is the
 * stable place the code is rendered.
 */
function codesInOrder(root: HTMLElement): string[] {
  const rows = [...root.querySelectorAll('[data-testid="line-board-row"]')];
  return rows.map(
    (row) =>
      row
        .querySelector('[data-testid="line-card-toggle"]')
        ?.textContent?.replace(/\s+/g, " ")
        .trim()
        .split(" ·")[0] ?? "",
  );
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
    expect(root.querySelectorAll('[data-testid="line-board-row"]').length).toBe(3);
  });

  it("leads with the lines that need attention, worst operational state first", () => {
    fixture.componentRef.setInput("lines", [
      makeLine("healthy-a"),
      makeLine("testing", "TESTING"),
      makeLine("dead", "TOTAL_DISRUPTION"),
      makeLine("partial", "PARTIAL_ACTIVE"),
      makeLine("healthy-b"),
    ]);
    fixture.componentRef.setInput("isLoading", false);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const order = codesInOrder(root);

    expect(order.indexOf("DEAD")).toBeLessThan(order.indexOf("PARTIAL"));
    // TESTING is a settled, un-actionable state, so it ranks below the partial ones rather than
    // merely "being non-ACTIVE" — which is exactly what the old ACTIVE-first partition got wrong.
    expect(order.indexOf("PARTIAL")).toBeLessThan(order.indexOf("TESTING"));
    expect(order.indexOf("TESTING")).toBeLessThan(order.indexOf("HEALTHY-A"));
    expect(order.indexOf("HEALTHY-A")).toBeLessThan(order.indexOf("HEALTHY-B"));
  });

  it("keeps every line visible — nothing folds away behind a disclosure", () => {
    fixture.componentRef.setInput("lines", [
      makeLine("a"),
      makeLine("b", "PARTIAL_DISRUPTION"),
      makeLine("c", "TESTING"),
    ]);
    fixture.componentRef.setInput("isLoading", false);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll("app-line-pulse-card").length).toBe(3);
    expect(root.querySelectorAll("details")).toHaveLength(0);
    expect(codesInOrder(root)).toHaveLength(3);
  });

  it("no longer renders the retired 'Other lines' fold or its summary", () => {
    fixture.componentRef.setInput("lines", [makeLine("a"), makeLine("b", "PARTIAL_DISRUPTION")]);
    fixture.componentRef.setInput("isLoading", false);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="other-lines"]')).toBeNull();
    expect(root.querySelector('[data-testid="other-lines-summary"]')).toBeNull();
  });

  it("counts the attention caption with the hero's own needs-attention rule", () => {
    fixture.componentRef.setInput("lines", [
      makeLine("a"),
      makeLine("b", "PARTIAL_DISRUPTION"),
      makeLine("c", "ACTIVE", { passengerStatus: "DELAYED" }),
      // Crowding describes one carriage, not the service — it must NOT inflate the caption the
      // hero's "Needs attention" tile reports.
      makeLine("d", "ACTIVE", { passengerStatus: "CROWDED" }),
    ]);
    fixture.componentRef.setInput("isLoading", false);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const heading = root.querySelector('[data-testid="line-board-attention-heading"]');
    expect(heading?.textContent?.replace(/\s+/g, " ").trim()).toBe("Needs attention · 2");
  });

  it("draws no attention caption on a healthy network", () => {
    fixture.componentRef.setInput("lines", [makeLine("a"), makeLine("b")]);
    fixture.componentRef.setInput("isLoading", false);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="line-board-attention-heading"]')).toBeNull();
  });

  it("forwards refreshTick to every card", () => {
    fixture.componentRef.setInput("lines", [
      makeLine("a"),
      makeLine("b", "PARTIAL_DISRUPTION"),
      makeLine("c"),
    ]);
    fixture.componentRef.setInput("isLoading", false);
    fixture.componentRef.setInput("refreshTick", 7);
    fixture.detectChanges();

    const cards = fixture.debugElement.queryAll(By.directive(LinePulseCardComponent));
    expect(cards.length).toBe(3);
    for (const card of cards) {
      expect(card.componentInstance.refreshTick()).toBe(7);
    }
  });
});
