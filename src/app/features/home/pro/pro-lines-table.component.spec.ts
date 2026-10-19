import { Component, PLATFORM_ID, provideZonelessChangeDetection, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PreferencesService } from "../../../core/preferences/preferences.service";
import type { LinePulse } from "../data/home-board.queries";
import type { LineStatusHourBucket } from "../data/home-history.queries";
import { HomeStore } from "../data/home.store";
import { ProLinesTableComponent } from "./pro-lines-table.component";

@Component({ selector: "app-pro-table-host-stub", template: "" })
class ProTableHostStub {}

function makeLine(id: string, overrides: Partial<LinePulse> = {}): LinePulse {
  return {
    id,
    code: id.toUpperCase(),
    displayName: `Line ${id}`,
    displayColor: "#e11d48",
    status: "ACTIVE",
    inServiceVehicleCount: 5,
    totalVehicleCount: 10,
    passengerStatus: "NORMAL",
    statusReportCount: 0,
    vehicleStatusCounts: [],
    passengerStatusCount: 0,
    statusWindowMinutes: 15,
    pulseLinks: [],
    ...overrides,
  };
}

function reportedHour(hourStart: string, count = 1): LineStatusHourBucket {
  return {
    hourStart,
    hourEnd: hourStart,
    count,
    dominantStatus: "NORMAL",
    statusCounts: [{ status: "NORMAL", count }],
  };
}

describe("ProLinesTableComponent", () => {
  let history: Map<string, LineStatusHourBucket[]>;
  let visible: ReturnType<typeof signal<LinePulse[]>>;
  let requestHistoryReads: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    history = new Map();
    requestHistoryReads = vi.fn();
    visible = signal<LinePulse[]>([]);
  });

  async function table(lines: LinePulse[]): Promise<HTMLElement> {
    visible.set(lines);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProLinesTableComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: PLATFORM_ID, useValue: "browser" },
        {
          provide: HomeStore,
          useValue: {
            visibleLines: visible,
            linesHistoryFor: (lineId: string) => history.get(lineId) ?? [],
            requestHistoryReads,
          },
        },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ProLinesTableComponent);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function rowCodes(root: HTMLElement): string[] {
    return [...root.querySelectorAll('[data-testid="pro-lines-row"]')].map(
      (row) => row.querySelector(".font-medium")?.textContent?.trim() ?? "",
    );
  }

  function sortButton(root: HTMLElement, column: string): HTMLButtonElement {
    const button = root.querySelector<HTMLButtonElement>(
      `[data-testid="pro-lines-sort-${column}"]`,
    );
    if (!button) {
      throw new Error(`no sort button for ${column}`);
    }
    return button;
  }

  function ariaSort(root: HTMLElement, column: string): string | null {
    return sortButton(root, column).closest("th")?.getAttribute("aria-sort") ?? null;
  }

  it("draws one row per visible line, sorted by line code by default", async () => {
    const root = await table([makeLine("ktm1"), makeLine("kjl1")]);

    expect(rowCodes(root)).toEqual(["KJL1", "KTM1"]);
    expect(ariaSort(root, "line")).toBe("ascending");
    expect(ariaSort(root, "status")).toBe("none");
  });

  it("makes every header a native button, so the keyboard reaches each sort without a handler", async () => {
    const root = await table([makeLine("a")]);

    for (const column of ["line", "status", "reports", "inService", "lastReport"]) {
      expect(sortButton(root, column).tagName).toBe("BUTTON");
      expect(sortButton(root, column).type).toBe("button");
    }
  });

  it("sorts by a column on the first press, and flips its direction on the next", async () => {
    const root = await table([
      makeLine("a", { statusReportCount: 1 }),
      makeLine("b", { statusReportCount: 7 }),
      makeLine("c", { statusReportCount: 3 }),
    ]);

    sortButton(root, "reports").click();
    TestBed.tick();
    expect(ariaSort(root, "reports")).toBe("ascending");
    expect(ariaSort(root, "line")).toBe("none");
    expect(rowCodes(root)).toEqual(["A", "C", "B"]);

    sortButton(root, "reports").click();
    TestBed.tick();
    expect(ariaSort(root, "reports")).toBe("descending");
    expect(rowCodes(root)).toEqual(["B", "C", "A"]);
  });

  it("stores the sort in the preferences, so the order survives a reload", async () => {
    const root = await table([makeLine("a"), makeLine("b")]);

    sortButton(root, "inService").click();
    TestBed.tick();

    expect(TestBed.inject(PreferencesService).proLinesSort()).toEqual({
      column: "inService",
      direction: "asc",
    });
  });

  it("shows the in-service count as x/y, and the status label", async () => {
    const root = await table([makeLine("a", { status: "PARTIAL_DISRUPTION" })]);
    const cells = root.querySelectorAll("tbody tr td");

    expect(root.querySelector('[data-testid="pro-lines-in-service"]')?.textContent?.trim()).toBe(
      "5/10",
    );
    expect(cells[1]?.textContent?.trim()).toBe("Partial Disruption");
  });

  it("shows a dash for the last report until the history read has a report to show", async () => {
    history.set("b", [reportedHour("2026-10-19T08:00:00")]);
    const root = await table([makeLine("a"), makeLine("b")]);

    const cells = [...root.querySelectorAll('[data-testid="pro-lines-last-report"]')].map((cell) =>
      cell.textContent?.trim(),
    );
    expect(cells[0]).toBe("—");
    expect(cells[1]).not.toBe("—");
  });

  it("asks for the history reads it needs, once it is drawn", async () => {
    await table([makeLine("a")]);

    expect(requestHistoryReads).toHaveBeenCalled();
  });

  it("says so when the visible lines are empty", async () => {
    const root = await table([]);

    expect(root.querySelector("tbody")?.textContent).toContain(
      "No lines match the current filters.",
    );
  });
});
