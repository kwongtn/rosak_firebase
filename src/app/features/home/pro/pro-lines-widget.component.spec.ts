import { Component, PLATFORM_ID, provideZonelessChangeDetection, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { Router, provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LinePulse, LineStatusHourBucket } from "../data/home.queries";
import { HomeStore } from "../data/home.store";
import { HomeViewModeService } from "../data/home-view-mode.service";
import { LineStatusSheetService } from "../data/line-status-sheet.service";
import { NetworkBoardComponent } from "../line-pulse/network-board.component";
import { ProLinesWidgetComponent } from "./pro-lines-widget.component";

@Component({ selector: "app-hq-host-stub", template: "" })
class HqHostStub {}

function makeLine(id: string, overrides: Partial<LinePulse> = {}): LinePulse {
  return {
    id,
    code: id.toUpperCase(),
    displayName: `Line ${id}`,
    displayColor: "#e11d48",
    status: "ACTIVE",
    inServiceVehicleCount: 12,
    totalVehicleCount: 16,
    passengerStatus: "NORMAL",
    passengerStatusMessage: null,
    statusReportCount: 2,
    vehicleStatusCounts: [],
    passengerStatusCount: 0,
    statusWindowMinutes: 15,
    pulseLinks: [],
    ...overrides,
  };
}

/** One service-day bucket, in the shape `linesStatusHistory` answers. */
function bucket(overrides: Partial<LineStatusHourBucket> = {}): LineStatusHourBucket {
  return {
    hourStart: "2026-10-03T08:00:00",
    hourEnd: "2026-10-03T09:00:00",
    count: 0,
    dominantStatus: null,
    statusCounts: [],
    ...overrides,
  };
}

function makeStore(lines: LinePulse[], history: Map<string, LineStatusHourBucket[]> = new Map()) {
  const store = {
    lines: signal(lines),
    visibleLines: signal(lines),
    attentionLines: signal<LinePulse[]>([]),
    myLines: signal<LinePulse[]>([]),
    allLines: signal(lines),
    othersLines: signal<LinePulse[]>([]),
    boardSort: signal<"severity" | "name">("severity"),
    setBoardSort: vi.fn(),
    isLoading: signal(false),
    linesRefreshTick: signal(0),
    highlightedLineId: signal<string | null>(null),
    linesHistoryFailed: signal(false),
    requestHistoryReads: vi.fn(),
    linesHistoryFor: (lineId: string) => history.get(lineId) ?? [],
    proStatusFilter: signal<string | null>(null),
    setProStatusFilter: vi.fn(),
    proPassengerFilter: signal<string | null>(null),
    setProPassengerFilter: vi.fn(),
    proOnlyWithData: signal(false),
    setProOnlyWithData: vi.fn(),
  };
  store.setProStatusFilter = vi.fn((value: string | null) => store.proStatusFilter.set(value));
  store.setProPassengerFilter = vi.fn((value: string | null) =>
    store.proPassengerFilter.set(value),
  );
  store.setProOnlyWithData = vi.fn((value: boolean) => store.proOnlyWithData.set(value));
  return store;
}

type StoreMock = ReturnType<typeof makeStore>;

describe("pro-lines-widget.component: ProLinesWidgetComponent", () => {
  let history: Map<string, LineStatusHourBucket[]>;
  let storeMock: StoreMock;
  let fixture: import("@angular/core/testing").ComponentFixture<ProLinesWidgetComponent>;
  /** The blob handed to each `createObjectURL` call, in call order — the CSV travels through it. */
  let blobs: Blob[];
  let clicked: HTMLAnchorElement[];
  let revoked: string[];

  beforeEach(() => {
    history = new Map();
    clicked = [];
    blobs = [];
    // 🔴 Spied on the two STATICS rather than `vi.stubGlobal("URL", ...)`: replacing the whole
    // `URL` binding with a plain object makes it a non-constructor, and Angular's own HTTP/router
    // plumbing calls `new URL(...)` — which fails every test in the file for a reason that has nothing
    // to do with the export.
    blobs = [];
    revoked = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob | MediaSource) => {
      blobs.push(blob as Blob);
      return "blob:fake";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation((url: string) => {
      revoked.push(url);
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: {
      getAttribute(name: string): string | null;
    }) {
      clicked.push(this as unknown as HTMLAnchorElement);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function widget(lines: LinePulse[], platform?: string): Promise<HTMLElement> {
    storeMock = makeStore(lines, history);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProLinesWidgetComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          {
            path: "",
            component: HqHostStub,
            children: [{ path: "spotting/:lineId", children: [{ path: "details", children: [] }] }],
          },
        ]),
        { provide: HomeStore, useValue: storeMock },
        // The REAL view service, which the app's route provides: the board reads its `view()` and its
        // toggle writes through it, so a stub would let a second copy of that answer into this tree.
        HomeViewModeService,
        { provide: LineStatusSheetService, useValue: { openFor: vi.fn() } },
        ...(platform ? [{ provide: PLATFORM_ID, useValue: platform }] : []),
      ],
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(ProLinesWidgetComponent);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it("reuses the network board rather than reimplementing it", async () => {
    const root = await widget([makeLine("a")]);

    // One board, one partition, one confidence chip. A Pro-specific copy of the board would be a
    // second answer to "which lines need attention".
    expect(root.querySelectorAll("app-network-board")).toHaveLength(1);
    expect(root.querySelector('[data-testid="network-board"]')).not.toBeNull();
  });

  it("turns the board's own heat grid OFF, so the dashboard can place it in its own cell", async () => {
    await widget([makeLine("a")]);

    const board = fixture.debugElement.query(By.directive(NetworkBoardComponent));
    // Two copies would mean two `network-heat-strip` testids and the same grid drawn twice. Asserted
    // on the INPUT, not on the absence of the grid's markup: the grid also hides itself on an empty or
    // failed read, so its absence proves nothing about the input.
    expect((board.componentInstance as NetworkBoardComponent).embedHeatStrip()).toBe(false);
  });

  it("offers three filters, each with a default that says itself", async () => {
    const root = await widget([makeLine("a")]);

    expect(root.querySelector('[data-testid="pro-filter-status"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="pro-filter-passenger"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="pro-filter-only-with-data"]')).not.toBeNull();
    // A blank option a reader has to guess at is worse than one that names itself.
    expect(root.textContent).toContain("Any status");
    expect(root.textContent).toContain("Any crowding");
  });

  it("gives the status filter the SAME words the board's badge shows", async () => {
    const root = await widget([makeLine("a")]);

    const select = root.querySelector('[data-testid="pro-filter-status"]') as HTMLSelectElement;
    const labels = [...select.options].map((option) => option.textContent?.trim());
    // A second hand-written label table is how a filter ends up saying "Partial disruption" where the
    // row says "Partial Disruption".
    expect(labels).toContain("Total Disruption");
    expect(labels).toContain("Partial Disruption");
  });

  it("pushes a status selection into the store, and an empty selection clears it", async () => {
    const root = await widget([makeLine("a")]);
    const select = root.querySelector('[data-testid="pro-filter-status"]') as HTMLSelectElement;

    select.value = "TOTAL_DISRUPTION";
    select.dispatchEvent(new Event("change"));
    fixture.detectChanges();

    expect(storeMock.setProStatusFilter).toHaveBeenCalledWith("TOTAL_DISRUPTION");
    expect(storeMock.proStatusFilter()).toBe("TOTAL_DISRUPTION");

    select.value = "";
    select.dispatchEvent(new Event("change"));
    fixture.detectChanges();

    expect(storeMock.setProStatusFilter).toHaveBeenLastCalledWith(null);
  });

  it("pushes the passenger floor and the has-data toggle the same way", async () => {
    const root = await widget([makeLine("a")]);

    const passenger = root.querySelector(
      '[data-testid="pro-filter-passenger"]',
    ) as HTMLSelectElement;
    passenger.value = "DELAYED";
    passenger.dispatchEvent(new Event("change"));
    fixture.detectChanges();

    const checkbox = root.querySelector<HTMLElement>('[data-testid="pro-filter-only-with-data"]');
    const input = checkbox?.querySelector("button[role=checkbox]") ?? checkbox;
    (input as HTMLElement)?.click();
    fixture.detectChanges();

    expect(storeMock.setProPassengerFilter).toHaveBeenCalledWith("DELAYED");
    expect(storeMock.setProOnlyWithData).toHaveBeenCalledWith(true);
  });

  it("offers a Clear filters escape only while a filter is narrowing", async () => {
    const root = await widget([makeLine("a")]);
    expect(root.querySelector('[data-testid="pro-filter-clear"]')).toBeNull();

    storeMock.proStatusFilter.set("ACTIVE");
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();

    const clear = root.querySelector<HTMLElement>('[data-testid="pro-filter-clear"]');
    expect(clear).not.toBeNull();
    clear?.click();
    fixture.detectChanges();

    expect(storeMock.setProStatusFilter).toHaveBeenLastCalledWith(null);
    expect(storeMock.setProPassengerFilter).toHaveBeenLastCalledWith(null);
    expect(storeMock.setProOnlyWithData).toHaveBeenLastCalledWith(false);
  });

  it("exports the VISIBLE lines' service-day history as a CSV with a header row", async () => {
    // Acceptance rule for the export.
    history.set("a", [
      bucket({
        count: 4,
        dominantStatus: "DELAYED",
        statusCounts: [
          { status: "DELAYED", count: 3 },
          { status: "NORMAL", count: 1 },
        ],
      }),
      bucket({
        hourStart: "2026-10-03T09:00:00",
        hourEnd: "2026-10-03T10:00:00",
        count: 1,
        dominantStatus: "NORMAL",
        statusCounts: [{ status: "NORMAL", count: 1 }],
      }),
    ]);
    const root = await widget([makeLine("a")]);

    root.querySelector<HTMLElement>('[data-testid="pro-lines-export"]')?.click();

    expect(blobs).toHaveLength(1);
    const csv = (await blobs[0].text()).replace(/\r\n/g, "\n");
    const rows = csv.split("\n").filter((line) => line !== "");

    // The header comes first and always: a headerless file is indistinguishable from a broken one.
    expect(rows[0]).toBe("lineCode,lineName,hourStart,hourEnd,count,dominantStatus,statusCounts");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toBe(
      "A,Line a,2026-10-03T08:00:00,2026-10-03T09:00:00,4,DELAYED,DELAYED:3 NORMAL:1",
    );
    expect(clicked.map((anchor) => anchor.download)).toEqual([
      "mlptf-line-service-day-history.csv",
    ]);
  });

  it("keeps statusCounts in the BACKEND's order, so two exports of one dataset diff cleanly", async () => {
    // A CSV that reordered its own columns between two exports of identical data cannot be diffed,
    // and a reader comparing the files would read a change that is not one.
    history.set("a", [
      bucket({
        count: 5,
        dominantStatus: "DISRUPTED",
        statusCounts: [
          { status: "NORMAL", count: 1 },
          { status: "CROWDED", count: 1 },
          { status: "DISRUPTED", count: 3 },
        ],
      }),
    ]);
    const root = await widget([makeLine("a")]);

    root.querySelector<HTMLElement>('[data-testid="pro-lines-export"]')?.click();

    const csv = (await blobs[0].text()).replace(/\r\n/g, "\n");
    // Deliberately NOT sorted by magnitude: the backend emits `PassengerStatus` declaration order.
    expect(csv).toContain("NORMAL:1 CROWDED:1 DISRUPTED:3");
  });

  it("exports only the lines the board is showing, never a filtered-out one", async () => {
    history.set("a", [bucket({ count: 1, dominantStatus: "NORMAL" })]);
    history.set("b", [bucket({ count: 1, dominantStatus: "NORMAL" })]);
    const root = await widget([makeLine("a"), makeLine("b")]);

    storeMock.visibleLines.set([makeLine("a")]);
    fixture.detectChanges();
    root.querySelector<HTMLElement>('[data-testid="pro-lines-export"]')?.click();

    const csv = (await blobs[0].text()).replace(/\r\n/g, "\n");
    // A hidden line appearing in the CSV would be a file describing a network the reader is not
    // looking at.
    expect(csv).toContain("A,Line a");
    expect(csv).not.toContain("B,Line b");
  });

  it("produces a HEADER-ONLY csv when the visible lines reported nothing this service day", async () => {
    const root = await widget([makeLine("a")]);

    root.querySelector<HTMLElement>('[data-testid="pro-lines-export"]')?.click();

    const csv = (await blobs[0].text()).replace(/\r\n/g, "\n");
    // "No rows" must be visible as a header with no data, never as an empty document.
    expect(csv).toBe("lineCode,lineName,hourStart,hourEnd,count,dominantStatus,statusCounts\n");
  });

  it("writes no dominantStatus cell as empty rather than as the word null", async () => {
    history.set("a", [bucket({ count: 0 })]);
    const root = await widget([makeLine("a")]);

    root.querySelector<HTMLElement>('[data-testid="pro-lines-export"]')?.click();

    const csv = (await blobs[0].text()).replace(/\r\n/g, "\n");
    const row = csv.split("\n")[1];
    expect(row.endsWith(",0,,")).toBe(true);
    expect(row).not.toContain("null");
  });

  it("never touches the DOM on the server, where there is nothing to click", async () => {
    const root = await widget([makeLine("a")], "server");

    root.querySelector<HTMLElement>('[data-testid="pro-lines-export"]')?.click();

    // An SSR render that built a Blob would produce a document no browser will ever download from.
    expect(blobs).toHaveLength(0);
    expect(clicked).toHaveLength(0);
  });
});
