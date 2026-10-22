import { Component, PLATFORM_ID, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { Router, provideRouter } from "@angular/router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PreferencesService } from "../../../core/preferences/preferences.service";
import type { LinePulse } from "../data/home-board.queries";
import type { HomeIncidentItem } from "../data/home-incidents.queries";
import { partitionBoardLines } from "../data/board-lines.util";
import type { BoardSort } from "../data/board-lines.util";
import { HomeStore } from "../data/home.store";
import { HomeViewModeService } from "../data/home-view-mode.service";
import { filterByLineFamily } from "../data/line-family.util";
import { LineStatusSheetService } from "../data/line-status-sheet.service";
import { LinePulseRowComponent } from "./line-pulse-row.component";
import { NetworkBoardComponent } from "./network-board.component";

/** The preferences service's own storage key — restated so a rename breaks this spec loudly. */
const STORAGE_KEY = "rosak:preferences:v1";

/**
 * An inert host for the router's route table.
 *
 * The board reads its view state out of the REAL URL, so the specs navigate a real router rather
 * than stubbing `ActivatedRoute`: a stubbed `queryParamMap` would let `RouterLink` (inside the rows'
 * pro block and the popovers) resolve against a route snapshot that is not a route at all, and the
 * deep-link specs would pass against a query-param stream the app never actually has.
 */
@Component({ selector: "app-board-host-stub", template: "" })
class BoardHostStub {}

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
    statusReportCount: 0,
    vehicleStatusCounts: [],
    passengerStatusCount: 0,
    statusWindowMinutes: 15,
    pulseLinks: [],
    ...overrides,
  };
}

function textOf(root: HTMLElement, testId: string): string {
  return (root.querySelector(`[data-testid="${testId}"]`)?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The line codes rendered inside one group, in DOM order.
 *
 * Read per ROW rather than per group, and from whichever row element the group uses: the attention
 * group renders the full `LinePulseCardComponent` (whose code lives in `line-card-toggle`) while the
 * other two render the compact `LinePulseRowComponent` (`line-row-title`). Reading one and assuming
 * the other would make the partition specs pass for the wrong reason on exactly the group that
 * matters most.
 */
function codesIn(root: HTMLElement, group: "attention" | "mine" | "all" | "others"): string[] {
  const section = root.querySelector<HTMLElement>(`[data-testid="line-board-${group}"]`);
  const rows = [
    ...(section?.querySelectorAll<HTMLElement>('[data-testid="line-board-row"]') ?? []),
  ];
  return rows.map((row) => {
    const rowTitle = row.querySelector('[data-testid="line-row-title"]');
    if (rowTitle) {
      return rowTitle.textContent?.trim() ?? "";
    }
    const cardToggle = row.querySelector('[data-testid="line-card-toggle"]');
    return (cardToggle?.textContent ?? "").replace(/\s+/g, " ").trim().split(" ·")[0] ?? "";
  });
}

/**
 * The board reads the store's own derived views rather than filtering the lines itself, so the mock
 * has to provide the SAME shapes the real store does — and it computes them with the REAL pure rules
 * (`lineNeedsAttention` / `sortLinesBySeverity` from `network-summary.util`), never a hand-rolled
 * comparator. That is the whole point: a mock with its own idea of "worst" could agree with a broken
 * partition, and then every group spec below would pass for the wrong reason — which is the one thing
 * a composition spec must never be.
 */
function makeBoardStore(
  lines: LinePulse[],
  pinned: string[] = [],
  sort: BoardSort = "severity",
  quietExpanded = false,
) {
  // The groups come from the REAL `partitionBoardLines` over the REAL family filter, recomputed
  // whenever the sort or the family changes — the same two inputs the store's own derived views read.
  const apply = (family: string | null, boardSort: BoardSort): void => {
    const visible = filterByLineFamily(lines, family);
    const groups = partitionBoardLines(visible, pinned, boardSort);
    store.visibleLines.set(visible);
    store.attentionLines.set(groups.attention);
    store.myLines.set(groups.mine);
    store.allLines.set(groups.all);
    store.othersLines.set(groups.others);
  };

  const store = {
    lines: signal(lines),
    // `visibleLines` is what the board draws and what the groups partition — it equals `lines`
    // until a Pro filter or the operator family narrows it, and a rider board can never narrow it
    // through a Pro filter.
    visibleLines: signal<LinePulse[]>(lines),
    attentionLines: signal<LinePulse[]>([]),
    myLines: signal<LinePulse[]>([]),
    allLines: signal<LinePulse[]>([]),
    othersLines: signal<LinePulse[]>([]),
    boardSort: signal<BoardSort>(sort),
    setBoardSort: vi.fn((next: BoardSort) => {
      store.boardSort.set(next);
      apply(store.lineFamily(), next);
    }),
    lineFamily: signal<string | null>(null),
    setLineFamily: vi.fn((family: string | null) => {
      store.lineFamily.set(family);
      apply(family, store.boardSort());
    }),
    isLoading: signal(false),
    linesRefreshTick: signal(0),
    // The quiet-lines summary's expanded state. Store-owned in the real store, so the mock mirrors
    // that: a plain signal the board reads and its toggle writes.
    quietLinesExpanded: signal(quietExpanded),
    setQuietLinesExpanded: vi.fn((expanded: boolean) => {
      store.quietLinesExpanded.set(expanded);
    }),
    // The post-submit highlight. A real `signal` (not a literal) because the board reacts to its
    // CHANGES — the mock has to be able to ring a line the way `HomeStore.highlightLine()` does.
    highlightedLineId: signal<string | null>(null),
    // The Pro heat grid reads the store's per-line service-day history. Empty here so the rider-view
    // specs are not about it; the grid's own spec covers its rendering, and the two Pro assertions
    // below cover the gate.
    linesHistoryFor: () => [],
    linesHistoryFailed: signal(false),
    requestHistoryReads: vi.fn(),
    // The incident chips. The board OPTS THE TWO READS IN (the two spies) and its rows read the two
    // lookups; both lookups read a signal inside the call, as the store's do, so a spec can let an
    // answer land after the first paint. `[]` is the store's answer for "not asked / in flight / failed".
    requestIncidentsRead: vi.fn(),
    requestPlannedWorksRead: vi.fn(),
    notices: signal<Record<string, HomeIncidentItem[]>>({}),
    planned: signal<Record<string, HomeIncidentItem[]>>({}),
    noticesFor: (lineId: string): HomeIncidentItem[] => store.notices()[lineId] ?? [],
    plannedWorksFor: (lineId: string): HomeIncidentItem[] => store.planned()[lineId] ?? [],
  };
  apply(null, sort);
  return store;
}

type BoardStoreMock = ReturnType<typeof makeBoardStore>;

interface BoardOptions {
  pinned?: string[];
  sort?: BoardSort;
  url?: string;
  platform?: string;
  /**
   * The quiet-lines summary's starting state. Defaults OPEN here, not to the store's collapsed
   * default: most specs below are about which GROUP a line lands in, and a collapsed summary would
   * hide the rows they count. The collapsed default has its own specs in the quiet-lines block.
   */
  quietExpanded?: boolean;
  /** The host's `foldQuiet` input. Unset leaves the component's own default (fold). */
  foldQuiet?: boolean;
}

describe("NetworkBoardComponent", () => {
  let fixture: ComponentFixture<NetworkBoardComponent>;
  let preferences: PreferencesService;
  let navigate: ReturnType<typeof vi.fn>;
  let storeMock: BoardStoreMock;
  let lineStatusSheet: { openFor: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    navigate = vi.fn().mockResolvedValue(true);
    lineStatusSheet = { openFor: vi.fn() };
  });

  /**
   * Boots a board against the given lines, pins and URL.
   *
   * A full TestBed per call rather than one shared fixture, because the URL state IS part of what is
   * under test: the board reads `route.queryParamMap`, and only a real navigation puts a real value
   * there. `navigate` is stubbed BEFORE the component is created so the board's own write half can
   * be asserted without the router actually re-activating anything.
   */
  async function board(lines: LinePulse[], options: BoardOptions = {}): Promise<HTMLElement> {
    storeMock = makeBoardStore(
      lines,
      options.pinned ?? [],
      options.sort ?? "severity",
      options.quietExpanded ?? true,
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [NetworkBoardComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: "", component: BoardHostStub },
          { path: "insiden", children: [{ path: ":date", children: [] }] },
        ]),
        { provide: HomeStore, useValue: storeMock },
        // The board no longer owns ?view=: `HomeViewModeService` does, and the board reads its
        // `view()` and its toggle calls `setView()`. The REAL service is provided rather than a stub
        // because the specs below are about exactly that wiring — a mock would let the board keep a
        // second copy of the answer and every one of these assertions would still pass.
        HomeViewModeService,
        // Both row elements route their report button through the route-scoped status-sheet service,
        // which the page (not the board) provides in the app's route table.
        { provide: LineStatusSheetService, useValue: lineStatusSheet },
        ...(options.platform ? [{ provide: PLATFORM_ID, useValue: options.platform }] : []),
      ],
    });
    await TestBed.compileComponents();
    preferences = TestBed.inject(PreferencesService);
    // Spied THROUGH the real router rather than replaced: `RouterLink` (the rows' Line HQ links and
    // every popover's methodology link) needs the genuine `Router`, and only `navigate` — the one
    // method the board's write half calls — has to be inert so an asserted write cannot re-activate
    // the route table mid-test.
    navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);

    fixture = TestBed.createComponent(NetworkBoardComponent);
    if (options.foldQuiet !== undefined) {
      fixture.componentRef.setInput("foldQuiet", options.foldQuiet);
    }
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  /** Navigates the REAL router so the board's next read sees the new query params. */
  async function gotoUrl(url: string): Promise<void> {
    navigate.mockClear();
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
  }

  it("renders skeleton placeholders while the first read is in flight", async () => {
    const root = await board([]);
    storeMock.isLoading.set(true);
    fixture.detectChanges();

    expect(root.querySelectorAll('[data-testid="line-skeleton"]').length).toBeGreaterThan(0);
    expect(root.querySelector("app-line-pulse-card")).toBeNull();
  });

  it("prefers real rows over skeletons once there is anything to show", async () => {
    // A later reload must never blank the board: dropping every row for a fraction of a second
    // every 30 seconds would be worse than stale data.
    const root = await board([makeLine("a")]);
    storeMock.isLoading.set(true);
    fixture.detectChanges();

    expect(root.querySelector('[data-testid="line-skeleton"]')).toBeNull();
    expect(codesIn(root, "all")).toEqual(["A"]);
  });

  it("renders a friendly empty state when the read settles with no lines", async () => {
    const root = await board([]);

    expect(textOf(root, "line-board-empty")).toBe("No lines yet.");
    expect(root.querySelector('[data-testid="board-controls"]')).toBeNull();
    expect(root.querySelector('[data-testid="line-board-row"]')).toBeNull();
  });

  /* ---- the partition, on screen ---------------------------------------------------- */

  it("puts a disrupted or degraded line ABOVE an active one whatever the backend order", async () => {
    // Acceptance spec (a). The backend returns the lines in whatever order its query produces, and
    // that order is not a severity one — so reading it straight through is the whole defect this
    // board exists to fix.
    const root = await board([
      makeLine("ok1"),
      makeLine("ok2"),
      makeLine("dead", { status: "TOTAL_DISRUPTION" }),
      makeLine("late", { passengerStatus: "DELAYED" }),
      makeLine("partial", { status: "PARTIAL_ACTIVE" }),
      makeLine("ok3"),
    ]);

    const attention = codesIn(root, "attention");
    // Operational severity first (TOTAL_DISRUPTION > PARTIAL_ACTIVE), and only then the rider axis —
    // a line that will not run outranks one that merely runs badly.
    expect(attention).toEqual(["DEAD", "PARTIAL", "LATE"]);
    // …and the healthy lines are all BELOW the attention group on the page, not interleaved with it.
    const all = codesIn(root, "all");
    expect(all).toEqual(["OK1", "OK2", "OK3"]);
    expect(
      root
        .querySelector('[data-testid="line-board-attention"]')
        ?.compareDocumentPosition(root.querySelector('[data-testid="line-board-all"]') as Node),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(textOf(root, "line-board-attention-heading")).toBe("Needs attention · 3");
  });

  it("renders every line in EXACTLY one group, so none duplicates and none disappears", async () => {
    // Acceptance spec (c). The partition has an invisible failure mode — a pinned-but-broken line
    // printed twice, or a line quietly vanishing because two independently-written filters each
    // claimed it — and the only assertion that catches both is counting.
    const root = await board(
      [
        makeLine("dead", { status: "TOTAL_DISRUPTION" }),
        makeLine("pinned-ok"),
        makeLine("broken-pinned", { status: "PARTIAL_DISRUPTION" }),
        makeLine("plain-a"),
        makeLine("plain-b"),
        makeLine("crowded", { passengerStatus: "CROWDED" }),
        makeLine("trial", { status: "TESTING" }),
      ],
      { pinned: ["pinned-ok", "broken-pinned", "ghost-line"] },
    );

    expect(codesIn(root, "attention")).toEqual(["DEAD", "BROKEN-PINNED"]);
    expect(codesIn(root, "mine")).toEqual(["PINNED-OK"]);
    expect(codesIn(root, "all")).toEqual(["CROWDED", "PLAIN-A", "PLAIN-B"]);
    expect(codesIn(root, "others")).toEqual(["TRIAL"]);

    // Counted across the WHOLE board, from the row wrappers rather than one group, so a line that
    // landed in two groups cannot hide behind the other group's element type.
    const titles = [
      ...codesIn(root, "attention"),
      ...codesIn(root, "mine"),
      ...codesIn(root, "all"),
      ...codesIn(root, "others"),
    ];
    expect(titles).toHaveLength(7);
    expect(new Set(titles).size).toBe(7);
    expect(root.querySelectorAll('[data-testid="line-board-row"]')).toHaveLength(7);
    // A pin for a line this read does not contain must never invent a row.
    expect(root.textContent).not.toContain("GHOST-LINE");
  });

  it("shows the full card for a line needing attention and the compact row for the rest", async () => {
    const root = await board(
      [makeLine("dead", { status: "TOTAL_DISRUPTION" }), makeLine("plain")],
      {
        pinned: ["plain"],
      },
    );

    const attention = root.querySelector('[data-testid="line-board-attention"]');
    const mine = root.querySelector('[data-testid="line-board-mine"]');
    // A broken line earns the whole card; the healthy ones stop being chrome and become rows.
    expect(attention?.querySelector("app-line-pulse-card")).not.toBeNull();
    expect(attention?.querySelector("app-line-pulse-row")).toBeNull();
    expect(mine?.querySelector("app-line-pulse-row")).not.toBeNull();
    expect(mine?.querySelector("app-line-pulse-card")).toBeNull();
  });

  it("hides the attention group entirely when nothing needs attention", async () => {
    // A reader with nothing broken must not scroll past a "Needs attention · 0" heading to learn
    // there is nothing.
    const root = await board([makeLine("a"), makeLine("b")]);

    expect(root.querySelector('[data-testid="line-board-attention"]')).toBeNull();
    expect(codesIn(root, "all")).toEqual(["A", "B"]);
  });

  it("does not draw the My lines group at all when nothing is pinned", async () => {
    // An empty pin list is a gap, not an invitation: the group disappears rather than showing an
    // empty heading a reader has to read to learn there is nothing to read.
    const root = await board([makeLine("a")]);

    expect(root.querySelector('[data-testid="line-board-mine"]')).toBeNull();
    expect(root.querySelector('[data-testid="line-board-mine-heading"]')).toBeNull();
    // The healthy line is still on screen under All lines — the board is not blank, only the group.
    expect(codesIn(root, "all")).toEqual(["A"]);
  });

  it("hides the All lines group only when it has nothing left to say", async () => {
    const root = await board([makeLine("a")]);
    expect(root.querySelector('[data-testid="line-board-all"]')).not.toBeNull();

    // Every line claimed by a higher group → the group disappears and the board still stands.
    storeMock.myLines.set([makeLine("a")]);
    storeMock.allLines.set([]);
    fixture.detectChanges();

    expect(root.querySelector('[data-testid="line-board-all"]')).toBeNull();
    expect(codesIn(root, "mine")).toEqual(["A"]);
  });

  it("renders Others LAST and only for unpinned out-of-service lines", async () => {
    const root = await board(
      [
        makeLine("ok"),
        makeLine("sal", { status: "TESTING" }),
        makeLine("sky", { status: "DEFUNCT" }),
        makeLine("pinned-sal", { status: "TESTING" }),
      ],
      { pinned: ["pinned-sal"] },
    );

    // Out-of-service lines are inventory, not service: never attention, and the pinned one is the
    // reader's own choice ("pin wins"), so only the unpinned rest lands in the last group. Inside
    // the group the order is severity order — DEFUNCT outranks TESTING.
    expect(codesIn(root, "attention")).toEqual([]);
    expect(codesIn(root, "mine")).toEqual(["PINNED-SAL"]);
    expect(codesIn(root, "others")).toEqual(["SKY", "SAL"]);
    expect(
      root
        .querySelector('[data-testid="line-board-all"]')
        ?.compareDocumentPosition(root.querySelector('[data-testid="line-board-others"]') as Node),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(textOf(root, "line-board-others-heading")).toBe("Others");
  });

  it("hides the Others group entirely when no line is out of service", async () => {
    const root = await board([makeLine("a")]);

    expect(root.querySelector('[data-testid="line-board-others"]')).toBeNull();
  });

  it("draws a divider before a group only when another group precedes it", async () => {
    // Without a divider a group heading reads as a caption of the cards ABOVE it, and the reader
    // loses track of where one group ends and the next begins. But the FIRST visible group sits
    // directly under the controls row's own bottom border, so a divider there would double the line.
    // These boards walk the appear/disappear cases the conditional dividers have to get right.

    // 1) No attention, one pinned line: My lines is the first — and only — visible group, so it
    //    inherits the controls row's border and draws none of its own.
    const soloMine = await board([makeLine("a")], { pinned: ["a"] });
    const mineOnly = soloMine.querySelector<HTMLElement>('[data-testid="line-board-mine"]');
    expect(mineOnly?.classList.contains("border-t")).toBe(false);
    expect(mineOnly?.className.split(/\s+/)).not.toContain("pt-4");

    // 2) Attention + pinned + unpinned: every group now follows another, so each group after the
    //    first earns both the divider and its spacing.
    const allThree = await board(
      [makeLine("dead", { status: "TOTAL_DISRUPTION" }), makeLine("a"), makeLine("b")],
      { pinned: ["a"] },
    );
    const attention = allThree.querySelector<HTMLElement>('[data-testid="line-board-attention"]');
    expect(attention?.classList.contains("border-t")).toBe(false);
    expect(attention?.className.split(/\s+/)).not.toContain("pt-4");
    for (const testId of ["line-board-mine", "line-board-all"]) {
      const section = allThree.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
      expect(section?.classList.contains("border-t")).toBe(true);
      expect(section?.className.split(/\s+/)).toContain("pt-4");
    }

    // 3) No pinned line, but attention above All lines: with My lines absent, All lines is still the
    //    second visible group and must keep its divider.
    const noMine = await board([makeLine("dead", { status: "TOTAL_DISRUPTION" }), makeLine("b")]);
    expect(noMine.querySelector('[data-testid="line-board-mine"]')).toBeNull();
    const allAfterAttention = noMine.querySelector<HTMLElement>('[data-testid="line-board-all"]');
    expect(allAfterAttention?.classList.contains("border-t")).toBe(true);
    expect(allAfterAttention?.className.split(/\s+/)).toContain("pt-4");

    // 4) No attention and no pins: All lines leads with no divider, and Others — following it — keeps
    //    its own.
    const inventory = await board([makeLine("ok"), makeLine("trial", { status: "TESTING" })]);
    const allLeading = inventory.querySelector<HTMLElement>('[data-testid="line-board-all"]');
    expect(allLeading?.classList.contains("border-t")).toBe(false);
    expect(allLeading?.className.split(/\s+/)).not.toContain("pt-4");
    const others = inventory.querySelector<HTMLElement>('[data-testid="line-board-others"]');
    expect(others?.classList.contains("border-t")).toBe(true);
    expect(others?.className.split(/\s+/)).toContain("pt-4");
  });

  /* ---- the incident chips ----------------------------------------------------------- */

  /** One incident row, as the store hands it to a row. */
  function incident(id: string, overrides: Partial<HomeIncidentItem> = {}): HomeIncidentItem {
    return {
      id,
      startDatetime: "2026-10-22T08:00:00",
      endDatetime: null,
      severity: "MINOR",
      title: `Incident ${id}`,
      brief: "",
      lines: [],
      ...overrides,
    };
  }

  /** The chips of one kind inside one group's section. */
  function chipsIn(
    root: HTMLElement,
    group: "attention" | "mine" | "all" | "others",
    kind: "line-notice" | "line-planned",
  ): number {
    return (
      root
        .querySelector(`[data-testid="line-board-${group}"]`)
        ?.querySelectorAll(`[data-testid="${kind}"]`).length ?? 0
    );
  }

  it("opts the ongoing-incidents read in as it mounts, and leaves the planned-works read alone", async () => {
    await board([makeLine("a"), makeLine("b")]);

    // One call from the board itself, not one per row. Nothing is pinned, so nothing draws Planned
    // works and that second read is never sent.
    expect(storeMock.requestIncidentsRead).toHaveBeenCalledTimes(1);
    expect(storeMock.requestPlannedWorksRead).not.toHaveBeenCalled();
  });

  it("opts the planned-works read in once the My lines group has a row", async () => {
    await board([makeLine("a"), makeLine("b")], { pinned: ["a"] });

    expect(storeMock.requestPlannedWorksRead).toHaveBeenCalled();
  });

  it("opts the planned-works read in when a pin appears after the first paint", async () => {
    // Pins are client state: the server render never has one, and the first client paint is the
    // server's. The read starts when the group first has a row, not before.
    await board([makeLine("a")]);
    expect(storeMock.requestPlannedWorksRead).not.toHaveBeenCalled();

    storeMock.myLines.set([makeLine("a")]);
    storeMock.allLines.set([]);
    TestBed.tick();
    fixture.detectChanges();

    expect(storeMock.requestPlannedWorksRead).toHaveBeenCalled();
  });

  it("does not send the planned-works read for a pinned line that is a Needs attention card", async () => {
    // "Pin says I care; it does not hide a broken line further down" — such a line is a card, the
    // card draws no Planned works, so there is nothing for the second read to feed.
    const root = await board([makeLine("dead", { status: "TOTAL_DISRUPTION" }), makeLine("b")], {
      pinned: ["dead"],
    });

    expect(codesIn(root, "attention")).toEqual(["DEAD"]);
    expect(codesIn(root, "mine")).toEqual([]);
    expect(storeMock.requestPlannedWorksRead).not.toHaveBeenCalled();
  });

  it("draws no incident markup at all while the incidents read has no answer", async () => {
    const root = await board([
      makeLine("dead", { status: "TOTAL_DISRUPTION" }),
      makeLine("a"),
      makeLine("b"),
    ]);

    // The store answers `[]` for loading: no chip, no strip, no skeleton on a row. The only skeleton
    // the board owns is the LINES read's, and it is not showing.
    expect(root.querySelector('[data-testid="line-notices"]')).toBeNull();
    expect(root.querySelector('[data-testid="line-notice"]')).toBeNull();
    expect(root.querySelector('[data-testid="line-skeleton"]')).toBeNull();
    expect(root.querySelectorAll('[data-testid="line-board-row"]')).toHaveLength(3);
  });

  it("draws a Notice on the line it belongs to, in every group and on an attention card", async () => {
    const root = await board(
      [
        makeLine("dead", { status: "TOTAL_DISRUPTION" }),
        makeLine("mine"),
        makeLine("plain"),
        makeLine("trial", { status: "TESTING" }),
      ],
      { pinned: ["mine"] },
    );
    storeMock.notices.set({
      dead: [incident("1", { title: "Signal fault" })],
      mine: [incident("2")],
      plain: [incident("3")],
      trial: [incident("4")],
    });
    TestBed.tick();
    fixture.detectChanges();

    for (const group of ["attention", "mine", "all", "others"] as const) {
      expect(chipsIn(root, group, "line-notice"), group).toBe(1);
    }
    // And on the card it is the card's own line: the chip is inside the row wrapper of its line.
    const deadRow = root.querySelector('[id="line-dead"]');
    expect(deadRow?.querySelector('[data-testid="line-notice"]')?.getAttribute("aria-label")).toBe(
      "Notice: Signal fault",
    );
  });

  it("draws Planned works for the pinned lines of My lines only", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pinnedLineIds: ["mine"] }));
    const root = await board(
      [makeLine("dead", { status: "TOTAL_DISRUPTION" }), makeLine("mine"), makeLine("plain")],
      {
        pinned: ["mine"],
      },
    );
    const works = (id: string) => incident(id, { startDatetime: "2026-10-24T22:00:00" });
    storeMock.planned.set({ dead: [works("1")], mine: [works("2")], plain: [works("3")] });
    TestBed.tick();
    fixture.detectChanges();

    expect(preferences.isPinned("mine")).toBe(true);
    // The same works are on three lines; only the pinned line's My lines row draws them.
    expect(chipsIn(root, "mine", "line-planned")).toBe(1);
    expect(chipsIn(root, "attention", "line-planned")).toBe(0);
    expect(chipsIn(root, "all", "line-planned")).toBe(0);
    expect(root.querySelectorAll('[data-testid="line-planned"]')).toHaveLength(1);
  });

  it("caps a row at two chips with a +N link, whichever group it is in", async () => {
    const root = await board([makeLine("plain")]);
    storeMock.notices.set({
      plain: [incident("1"), incident("2"), incident("3")],
    });
    TestBed.tick();
    fixture.detectChanges();

    expect(chipsIn(root, "all", "line-notice")).toBe(2);
    const more = root.querySelector('[data-testid="line-notices-more"]');
    expect(more?.textContent?.trim()).toBe("+1");
    expect(more?.getAttribute("href")).toBe("/insiden");
  });

  it("keeps every id on the board unique with chips in every group", async () => {
    // The Notice link points `aria-describedby` at its severity word by id, so the ids are
    // per line AND incident; two groups drawing the same incident for two lines must not collide.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pinnedLineIds: ["mine"] }));
    const root = await board(
      [
        makeLine("dead", { status: "TOTAL_DISRUPTION" }),
        makeLine("mine"),
        makeLine("plain"),
        makeLine("trial", { status: "TESTING" }),
      ],
      { pinned: ["mine"] },
    );
    const shared = incident("shared", {
      lines: [
        { id: "dead", code: "DEAD" },
        { id: "mine", code: "MINE" },
        { id: "plain", code: "PLAIN" },
        { id: "trial", code: "TRIAL" },
      ],
    });
    storeMock.notices.set({ dead: [shared], mine: [shared], plain: [shared], trial: [shared] });
    storeMock.planned.set({ mine: [incident("p")] });
    TestBed.tick();
    fixture.detectChanges();

    const ids = [...root.querySelectorAll("[id]")].map((element) => element.id);
    expect(ids.filter((id) => id.startsWith("line-notice-severity-"))).toHaveLength(4);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /* ---- the controls ---------------------------------------------------------------- */

  it("marks the active sort with aria-pressed, and toggles it through the store", async () => {
    const root = await board([makeLine("a")]);

    const severity = root.querySelector<HTMLElement>('[data-testid="board-sort-severity"]');
    const name = root.querySelector<HTMLElement>('[data-testid="board-sort-name"]');
    expect(severity?.getAttribute("aria-pressed")).toBe("true");
    expect(name?.getAttribute("aria-pressed")).toBe("false");

    name?.click();
    fixture.detectChanges();

    expect(storeMock.setBoardSort).toHaveBeenCalledWith("name");
    expect(name?.getAttribute("aria-pressed")).toBe("true");
    expect(severity?.getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps the sort switch and the view switch in labelled groups", async () => {
    const root = await board([makeLine("a")]);

    const groups = [...root.querySelectorAll('[data-testid="board-controls"] [role="group"]')];
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
      "Sort lines",
      "Board view",
    ]);
    expect(textOf(root, "board-sort-severity")).toBe("Severity");
    expect(textOf(root, "board-sort-name")).toBe("Name");
    expect(textOf(root, "board-view-rider")).toBe("Rider");
    expect(textOf(root, "board-view-pro")).toBe("Pro");
  });

  it("draws every control in the row with a visible focus ring", async () => {
    const root = await board([makeLine("a")]);

    // These four are plain buttons under a shared track, not hlmBtn — the primitive's focus-visible
    // ring does not come with them, so the board has to bring its own. A control a keyboard reader
    // cannot see is not reachable in any sense that matters.
    const controls = [
      ...root.querySelectorAll<HTMLElement>('[data-testid="board-controls"] button'),
    ];
    expect(controls.length).toBeGreaterThanOrEqual(4);
    for (const control of controls) {
      expect(control.className).toContain("focus-visible:ring-2");
      expect(control.className).toContain("outline-none");
    }
  });

  it("marks the attention group with a dot that pulses only under motion-safe", async () => {
    const root = await board([makeLine("dead", { status: "TOTAL_DISRUPTION" }), makeLine("plain")]);

    const dot = root.querySelector<HTMLElement>('[data-testid="line-board-attention-dot"]');
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain("motion-safe:animate-breathe");
    // Decorative: the count beside it is the information, and a pulsing dot that is announced on
    // every one of the board's poll beats would be noise.
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
    // Still inside the heading, so the heading's accessible name is unchanged.
    expect(textOf(root, "line-board-attention-heading")).toBe("Needs attention · 1");
  });

  it("writes both the preference and the URL when the view is toggled", async () => {
    const root = await board([makeLine("a")]);

    root.querySelector<HTMLElement>('[data-testid="board-view-pro"]')?.click();
    fixture.detectChanges();

    // The preference makes it survive a reload; the URL makes it shareable. A toggle that wrote only
    // one of the two would give away one of those promises.
    expect(preferences.viewMode()).toBe("pro");
    expect(navigate).toHaveBeenCalled();
    const patch = navigate.mock.calls.at(-1)?.[1]?.queryParams as Record<string, unknown>;
    expect(patch["view"]).toBe("pro");
    // The default sort is never spelled out in the URL — "no param" and "severity" are one state.
    // Since ?view= is the service's param, this patch carries `view` ALONE: the board's sort write is
    // guarded on the URL already agreeing, and it does (the default needs no param).
    expect(Object.keys(patch)).toEqual(["view"]);
  });

  it("leaves ?view= entirely to the view service — the board's own write half never touches it", async () => {
    // The board used to write `?sort=` and `?view=` in ONE patch, which is what made ?view= look like
    // the board's param. The Pro dashboard has to choose between two layouts from the same fact, so it
    // reads the service; if the board still wrote the param itself, the two halves of one fact could
    // disagree for a render. One writer, asserted from the board's own side.
    await board([makeLine("a")]);

    const viewPatches = navigate.mock.calls.filter(
      (call) => "view" in ((call[1]?.queryParams as Record<string, unknown>) ?? {}),
    );
    for (const call of viewPatches) {
      const params = call[1]?.queryParams as Record<string, unknown>;
      // Any write carrying ?view= is the service's, which is created BEFORE the board's effects and
      // therefore writes `view` alone. A board patch would carry `sort` in the same object.
      expect(Object.keys(params)).not.toContain("sort");
    }
    // And the sort patch alone never carries the view, which is the other half of the same guarantee.
    for (const call of navigate.mock.calls) {
      const params = call[1]?.queryParams as Record<string, unknown>;
      if ("sort" in params) {
        expect(Object.keys(params)).toEqual(["sort"]);
      }
    }
  });

  it("forwards the view to the compact rows it renders", async () => {
    const root = await board([makeLine("a")], { pinned: ["a"] });

    root.querySelector<HTMLElement>('[data-testid="board-view-pro"]')?.click();
    fixture.detectChanges();

    const rows = fixture.debugElement.queryAll(By.directive(LinePulseRowComponent));
    expect(rows).toHaveLength(1);
    expect((rows[0].componentInstance as LinePulseRowComponent).viewMode()).toBe("pro");
    expect(root.querySelector('[data-testid="line-row-pro"]')).not.toBeNull();
  });

  it("mounts the heat grid for a PRO board only, never for a rider", async () => {
    // The grid is the one widget here that compares lines against EACH OTHER and it costs a screen of
    // width, so it is behind the same effective-view gate the controls row writes: a rider must not
    // pay for it, and a Pro reader arriving on ?view=pro must get it.
    const riderRoot = await board([makeLine("a")]);
    expect(riderRoot.querySelector('[data-testid="network-heat-strip"]')).toBeNull();
    // One read has already been asked for in a rider view — by the compact ROW's own history strip,
    // which is a rider-facing widget. The grid adds no second read, because both read the same one.
    expect(storeMock.requestHistoryReads).toHaveBeenCalledTimes(1);

    riderRoot.querySelector<HTMLElement>('[data-testid="board-view-pro"]')?.click();
    fixture.detectChanges();

    // Pro with no history data: the grid is mounted but draws nothing, because "no data" is its own
    // hidden state rather than an empty grid of quiet lines.
    expect(riderRoot.querySelector('[data-testid="network-heat-strip"]')).toBeNull();
    // Two widgets have now asked (the row's strip and the grid), and they still share ONE store read:
    // the second opt-in is a `signal.set` with an equal value, which does not notify, so no second
    // request goes out. The spy counts constructions, not reads — which is the property being pinned.
    expect(storeMock.requestHistoryReads).toHaveBeenCalledTimes(2);
  });

  /* ---- URL state -------------------------------------------------------------------- */

  it("reads ?sort= and ?view= from the URL over the stored defaults", async () => {
    const root = await board([makeLine("a"), makeLine("b")]);
    await gotoUrl("/?sort=name&view=pro");

    expect(
      root.querySelector('[data-testid="board-sort-name"]')?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(root.querySelector('[data-testid="board-view-pro"]')?.getAttribute("aria-pressed")).toBe(
      "true",
    );
    // The URL wins for the whole row, not just the pressed button…
    expect(root.querySelector('[data-testid="line-row-pro"]')).not.toBeNull();
  });

  it("falls back to the stored preference when the URL carries no view", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pinnedLineIds: [], viewMode: "pro" }));
    const root = await board([makeLine("a")]);
    fixture.detectChanges();

    expect(preferences.viewMode()).toBe("pro");
    expect(root.querySelector('[data-testid="board-view-pro"]')?.getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("mirrors a stored pro view into the URL, so the address bar is always shareable", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pinnedLineIds: [], viewMode: "pro" }));
    await board([makeLine("a")]);

    const patch = navigate.mock.calls.at(-1)?.[1]?.queryParams as Record<string, unknown>;
    expect(patch["view"]).toBe("pro");
    expect(patch["sort"]).toBeUndefined();
  });

  it("writes nothing when the URL already says what the board shows", async () => {
    // The guard that stops a back/forward from immediately re-navigating onto the params it left —
    // without it every browser back on this page would bounce.
    await board([makeLine("a")], { sort: "name" });
    navigate.mockClear();
    await gotoUrl("/?sort=name");

    expect(navigate).not.toHaveBeenCalled();
  });

  it("degrades an unrecognised URL value to the shared default rather than the preference", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pinnedLineIds: [], viewMode: "pro" }));
    const root = await board([makeLine("a")]);
    await gotoUrl("/?view=wizard");

    // A URL is user input. An unknown value must resolve to a view the UI actually offers rather
    // than silently becoming "whatever this reader last chose".
    expect(
      root.querySelector('[data-testid="board-view-rider"]')?.getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("never navigates on the server, where a reactive navigate() hangs the render", async () => {
    // The board's write half is browser-gated. `?view=pro` in a server-rendered URL must still
    // render (the read half is pure param parsing) but must not ask the server's router for
    // anything.
    const root = await board([makeLine("a")], { platform: "server" });
    await gotoUrl("/?view=pro");

    expect(root.querySelector('[data-testid="board-view-pro"]')?.getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("propagates a deep-linked sort into the store, so it survives losing the URL", async () => {
    await board([makeLine("a"), makeLine("b")]);
    await gotoUrl("/?sort=name");

    // Otherwise the board would render alphabetically from a link and revert to severity the moment
    // the reader edited the URL away — the store is the durable half of the sort.
    expect(storeMock.setBoardSort).toHaveBeenCalledWith("name");
    expect(storeMock.boardSort()).toBe("name");
  });

  /* ---- the store's beat -------------------------------------------------------------- */

  it("forwards the store's poll tick to every row so an open accordion re-reads", async () => {
    await board([makeLine("a"), makeLine("b")]);
    storeMock.linesRefreshTick.set(9);
    fixture.detectChanges();

    const rows = fixture.debugElement.queryAll(By.directive(LinePulseRowComponent));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect((row.componentInstance as LinePulseRowComponent).refreshTick()).toBe(9);
    }
  });

  it("recomputes the whole board off the same read when the lines change", async () => {
    const root = await board([makeLine("a"), makeLine("b")]);
    expect(codesIn(root, "all")).toEqual(["A", "B"]);

    // A real `reloadFirstPages` swaps the resource's data; every group follows in the same tick.
    storeMock.attentionLines.set([makeLine("b", { status: "TOTAL_DISRUPTION" })]);
    storeMock.allLines.set([makeLine("a")]);
    fixture.detectChanges();

    expect(codesIn(root, "attention")).toEqual(["B"]);
    expect(codesIn(root, "all")).toEqual(["A"]);
  });

  /* ---- post-submit anchors + highlight -------------------------------------------------- */

  it("gives EVERY line a stable #line-<id> anchor, in all four groups", async () => {
    const root = await board(
      [
        makeLine("dead", { status: "TOTAL_DISRUPTION" }),
        makeLine("mine"),
        makeLine("plain"),
        makeLine("trial", { status: "TESTING" }),
      ],
      { pinned: ["mine"] },
    );

    // Four groups, two row elements, one anchor contract: a report can be about ANY line, so an
    // anchor that only existed on the compact rows would silently break "return the reader to the
    // line they just reported about" for exactly the lines that need attention most. The Others
    // group carries anchors too — a line that has closed is still a line the reader can be sent to.
    for (const id of ["dead", "mine", "plain", "trial"]) {
      const anchor = root.querySelector<HTMLElement>(`[id="line-${id}"]`);
      expect(anchor).not.toBeNull();
      expect(anchor?.getAttribute("data-testid")).toBe("line-board-row");
    }
    expect(root.querySelectorAll("#line-dead, #line-mine, #line-plain, #line-trial")).toHaveLength(
      4,
    );
  });

  it("rings only the highlighted line, and clears when the store does", async () => {
    const root = await board([makeLine("a"), makeLine("b")]);
    const rowFor = (id: string): HTMLElement =>
      root.querySelector<HTMLElement>(`[id="line-${id}"]`) as HTMLElement;

    expect(rowFor("a").hasAttribute("data-highlighted")).toBe(false);
    expect(rowFor("a").classList.contains("ring-2")).toBe(false);

    storeMock.highlightedLineId.set("b");
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();

    expect(rowFor("b").hasAttribute("data-highlighted")).toBe(true);
    // The ring is brand-coloured and offset against the page, so it reads on a white row AND in dark
    // mode — `ring-offset-background` rather than the default white offset colour.
    expect(rowFor("b").classList.contains("ring-2")).toBe(true);
    expect(rowFor("b").classList.contains("ring-brand")).toBe(true);
    expect(rowFor("b").classList.contains("ring-offset-2")).toBe(true);
    expect(rowFor("b").classList.contains("ring-offset-background")).toBe(true);
    // And crucially: the OTHER line is untouched, so the ring never reads as "the network".
    expect(rowFor("a").hasAttribute("data-highlighted")).toBe(false);

    storeMock.highlightedLineId.set(null);
    fixture.detectChanges();

    expect(rowFor("b").hasAttribute("data-highlighted")).toBe(false);
    expect(rowFor("b").classList.contains("ring-2")).toBe(false);
  });

  it("keeps the ring visible under reduced motion and transitions nothing", async () => {
    const root = await board([makeLine("a")]);
    storeMock.highlightedLineId.set("a");
    fixture.detectChanges();

    const row = root.querySelector<HTMLElement>('[id="line-a"]') as HTMLElement;
    // `motion-reduce:transition-none` drops the ANIMATION and keeps the ring: a reader who asked for
    // less motion still has to be told which line they just reported about, and dropping the ring
    // would lose the information, not just the flourish.
    expect(row.className.split(/\s+/)).toContain("motion-reduce:transition-none");
    expect(row.className.split(/\s+/)).toContain("duration-1000");
    expect(row.classList.contains("ring-2")).toBe(true);
  });

  it("scrolls the highlighted line's own anchor into view", async () => {
    const root = await board([makeLine("a")]);
    // jsdom ships no layout, so `scrollIntoView` does not exist on the element at all.
    const scrollIntoView = vi.fn();
    (root.querySelector<HTMLElement>('[id="line-a"]') as HTMLElement).scrollIntoView =
      scrollIntoView;

    storeMock.highlightedLineId.set("a");
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    // `block: "center"` because the target is a ROW inside a list, not a section top.
    expect(scrollIntoView.mock.calls[0][0]).toMatchObject({ block: "center" });
  });

  it("never scrolls on the server, where scrollIntoView does not exist", async () => {
    const root = await board([makeLine("a")], { platform: "server" });
    const scrollIntoView = vi.fn();
    (root.querySelector<HTMLElement>('[id="line-a"]') as HTMLElement).scrollIntoView =
      scrollIntoView;

    storeMock.highlightedLineId.set("a");
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();

    expect(scrollIntoView).not.toHaveBeenCalled();
    // …and the ring is still drawn, because it is a CSS class and not an animation.
    expect(root.querySelector<HTMLElement>('[id="line-a"]')?.classList.contains("ring-2")).toBe(
      true,
    );
  });

  /* ---- quiet lines: one summary row, rows on demand ------------------------------- */

  /** The quiet summary's toggle, the one control that owns the folded rows. */
  function quietToggle(root: HTMLElement): HTMLButtonElement {
    return root.querySelector<HTMLButtonElement>(
      '[data-testid="line-board-quiet-toggle"]',
    ) as HTMLButtonElement;
  }

  it("folds quiet lines into one collapsed summary row, and keeps the lines with reports in full", async () => {
    const root = await board(
      [makeLine("a"), makeLine("b"), makeLine("busy", { statusReportCount: 3 })],
      { quietExpanded: false },
    );

    expect(codesIn(root, "all")).toEqual(["BUSY"]);
    expect(quietToggle(root).textContent?.trim()).toBe("2 other lines running normally");
    expect(quietToggle(root).getAttribute("aria-expanded")).toBe("false");
    // The toggle names a panel that is always in the DOM, so aria-controls always resolves.
    const panelId = quietToggle(root).getAttribute("aria-controls");
    expect(panelId).toBe("line-board-quiet-panel");
    expect(
      root.querySelector(`[id="${panelId}"]`)?.querySelectorAll('[data-testid="line-board-row"]'),
    ).toHaveLength(0);
  });

  it("takes a Normal line out of the fold when an approved incident is running on it", async () => {
    // The headline case of the Notice chip: the line READS Normal, so the fold would tuck it away
    // with its chip. A line with a Notice has something to say.
    const root = await board([makeLine("a"), makeLine("b"), makeLine("c")], {
      quietExpanded: false,
    });
    expect(codesIn(root, "all")).toEqual([]);
    expect(quietToggle(root).textContent?.trim()).toBe("3 lines running normally");

    storeMock.notices.set({ b: [incident("1", { title: "Signal fault" })] });
    TestBed.tick();
    fixture.detectChanges();

    expect(codesIn(root, "all")).toEqual(["B"]);
    expect(quietToggle(root).textContent?.trim()).toBe("2 other lines running normally");
    expect(
      root
        .querySelector('[id="line-b"]')
        ?.querySelector('[data-testid="line-notice"]')
        ?.getAttribute("aria-label"),
    ).toBe("Notice: Signal fault");
  });

  it("puts the line back into the fold when its Notice goes away", async () => {
    const root = await board([makeLine("a"), makeLine("b")], { quietExpanded: false });
    storeMock.notices.set({ b: [incident("1")] });
    TestBed.tick();
    fixture.detectChanges();
    expect(codesIn(root, "all")).toEqual(["B"]);

    storeMock.notices.set({});
    TestBed.tick();
    fixture.detectChanges();

    expect(codesIn(root, "all")).toEqual([]);
    expect(quietToggle(root).textContent?.trim()).toBe("2 lines running normally");
  });

  it("leaves the Pro board alone: with the fold off every line is a row, Notice or not", async () => {
    const root = await board([makeLine("a"), makeLine("b")], {
      quietExpanded: false,
      foldQuiet: false,
    });
    storeMock.notices.set({ b: [incident("1")] });
    TestBed.tick();
    fixture.detectChanges();

    expect(root.querySelector('[data-testid="line-board-quiet"]')).toBeNull();
    expect(codesIn(root, "all")).toEqual(["A", "B"]);
    expect(root.querySelectorAll('[data-testid="line-notice"]')).toHaveLength(1);
  });

  it("renders every quiet row once the summary is expanded, and folds them again on collapse", async () => {
    const root = await board(
      [makeLine("a"), makeLine("b"), makeLine("busy", { statusReportCount: 3 })],
      { quietExpanded: false },
    );

    quietToggle(root).click();
    fixture.detectChanges();

    expect(storeMock.setQuietLinesExpanded).toHaveBeenLastCalledWith(true);
    expect(quietToggle(root).getAttribute("aria-expanded")).toBe("true");
    expect(codesIn(root, "all")).toEqual(["BUSY", "A", "B"]);

    quietToggle(root).click();
    fixture.detectChanges();

    expect(storeMock.setQuietLinesExpanded).toHaveBeenLastCalledWith(false);
    expect(codesIn(root, "all")).toEqual(["BUSY"]);
  });

  it("keeps the summary, and the pinned lines above it, when every line is quiet", async () => {
    const root = await board([makeLine("a"), makeLine("b"), makeLine("p")], {
      pinned: ["p"],
      quietExpanded: false,
    });

    expect(root.querySelector('[data-testid="line-board-attention"]')).toBeNull();
    expect(codesIn(root, "mine")).toEqual(["P"]);
    // The pinned line is shown above the summary, so the quiet ones are "other" lines.
    expect(quietToggle(root).textContent?.trim()).toBe("2 other lines running normally");
  });

  it("drops the word other when nothing is shown above the summary", async () => {
    const root = await board([makeLine("a"), makeLine("b")], { quietExpanded: false });

    expect(quietToggle(root).textContent?.trim()).toBe("2 lines running normally");
  });

  it("uses the singular for a single quiet line", async () => {
    const root = await board([makeLine("a", { statusReportCount: 1 }), makeLine("b")], {
      quietExpanded: false,
    });

    expect(quietToggle(root).textContent?.trim()).toBe("1 other line running normally");
  });

  it("never folds a pinned quiet line — it stays fully rendered in My lines", async () => {
    const root = await board([makeLine("a"), makeLine("p")], {
      pinned: ["p"],
      quietExpanded: false,
    });

    expect(codesIn(root, "mine")).toEqual(["P"]);
    expect(codesIn(root, "all")).toEqual([]);
    expect(quietToggle(root).textContent?.trim()).toBe("1 other line running normally");
  });

  it("does not draw the summary at all when no line is quiet", async () => {
    const root = await board([makeLine("busy", { statusReportCount: 2 })], {
      quietExpanded: false,
    });

    expect(root.querySelector('[data-testid="line-board-quiet"]')).toBeNull();
    expect(codesIn(root, "all")).toEqual(["BUSY"]);
  });

  it("shows the one-time pin hint in the collapsed summary, and dismissing it sticks", async () => {
    const root = await board([makeLine("a"), makeLine("b")], { quietExpanded: false });

    expect(textOf(root, "line-board-pin-hint")).toContain("Pin your lines to see them first");

    (
      root.querySelector('[data-testid="line-board-pin-hint-dismiss"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(root.querySelector('[data-testid="line-board-pin-hint"]')).toBeNull();
    expect(preferences.pinHintDismissed()).toBe(true);
  });

  it("hides the pin hint while the summary is expanded, and once any line is pinned", async () => {
    const expanded = await board([makeLine("a")], { quietExpanded: true });
    expect(expanded.querySelector('[data-testid="line-board-pin-hint"]')).toBeNull();

    localStorage.setItem("rosak:preferences:v1", JSON.stringify({ pinnedLineIds: ["p"] }));
    const pinned = await board([makeLine("a"), makeLine("p")], {
      pinned: ["p"],
      quietExpanded: false,
    });
    expect(pinned.querySelector('[data-testid="line-board-pin-hint"]')).toBeNull();
  });

  it("opens the summary when the highlighted line is folded inside it", async () => {
    const root = await board([makeLine("a"), makeLine("b")], { quietExpanded: false });
    expect(codesIn(root, "all")).toEqual([]);

    storeMock.highlightedLineId.set("b");
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();

    expect(storeMock.setQuietLinesExpanded).toHaveBeenCalledWith(true);
    expect(root.querySelector('[id="line-b"]')).not.toBeNull();
  });

  it("does not show the pin hint to a reader who already dismissed it", async () => {
    localStorage.setItem("rosak:preferences:v1", JSON.stringify({ pinHintDismissed: true }));

    const root = await board([makeLine("a"), makeLine("b")], { quietExpanded: false });

    expect(root.querySelector('[data-testid="line-board-quiet-toggle"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="line-board-pin-hint"]')).toBeNull();
  });
  /* ---- the Pro fold switch and the operator family ------------------------------------ */

  it("shows every quiet line in full, with no summary row, when the host turns folding off", async () => {
    const root = await board(
      [makeLine("a"), makeLine("b"), makeLine("busy", { statusReportCount: 3 })],
      { foldQuiet: false, quietExpanded: false },
    );

    expect(codesIn(root, "all").sort()).toEqual(["A", "B", "BUSY"]);
    expect(root.querySelector('[data-testid="line-board-quiet"]')).toBeNull();
  });

  it("still folds the quiet lines by default, so the Rider board is unchanged", async () => {
    const root = await board([makeLine("a"), makeLine("b")], { quietExpanded: false });

    expect(root.querySelector('[data-testid="line-board-quiet"]')).not.toBeNull();
    expect(codesIn(root, "all")).toEqual([]);
  });

  it("draws one chip per operator family plus All, and hides the chips when there is only one family", async () => {
    const root = await board([makeLine("ktm1"), makeLine("kjl1"), makeLine("ktm2")]);

    const filter = root.querySelector('[data-testid="board-family-filter"]');
    expect(filter?.textContent?.replace(/\s+/g, " ").trim()).toBe("All KJL KTM");

    const single = await board([makeLine("ktm1"), makeLine("ktm2")]);
    expect(single.querySelector('[data-testid="board-family-filter"]')).toBeNull();
  });

  it("narrows every group to the family in ?op=, attention and pinned lines included", async () => {
    const root = await board(
      [
        makeLine("ktm1"),
        makeLine("ktm2", { status: "TOTAL_DISRUPTION" }),
        makeLine("kjl1", { status: "TOTAL_DISRUPTION" }),
        makeLine("kjl2"),
      ],
      { pinned: ["kjl2"] },
    );
    await gotoUrl("/?op=ktm");

    expect(codesIn(root, "attention")).toEqual(["KTM2"]);
    expect(codesIn(root, "all")).toEqual(["KTM1"]);
    expect(root.querySelector('[data-testid="line-board-mine"]')).toBeNull();
    expect(
      root.querySelector('[data-testid="board-family-KTM"]')?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(storeMock.setLineFamily).toHaveBeenLastCalledWith("KTM");
  });

  it("reads a malformed or unknown ?op= as All, and leaves the link as it was", async () => {
    const root = await board([makeLine("ktm1"), makeLine("kjl1")]);
    await gotoUrl("/?op=zzz");

    expect(
      root.querySelector('[data-testid="board-family-all"]')?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(codesIn(root, "all").sort()).toEqual(["KJL1", "KTM1"]);
    expect(storeMock.setLineFamily).toHaveBeenLastCalledWith(null);
  });

  it("writes ?op= through the router when a chip is chosen, and removes it for All", async () => {
    const root = await board([makeLine("ktm1"), makeLine("kjl1")]);

    (root.querySelector('[data-testid="board-family-KJL"]') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({ queryParams: { op: "KJL" } }),
    );

    (root.querySelector('[data-testid="board-family-all"]') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({ queryParams: { op: null } }),
    );
  });
});
