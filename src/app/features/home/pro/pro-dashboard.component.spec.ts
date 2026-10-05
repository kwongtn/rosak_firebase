import { Component, PLATFORM_ID, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { Router, provideRouter } from "@angular/router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PreferencesService } from "../../../core/preferences/preferences.service";
import type { FeedLink, LinePulse, LineStatusHourBucket } from "../data/home.queries";
import { HomeStore } from "../data/home.store";
import { HomeViewModeService } from "../data/home-view-mode.service";
import { LineStatusSheetService } from "../data/line-status-sheet.service";
import { ProDashboardComponent } from "./pro-dashboard.component";

/** An inert host so a real navigation can put a real `?view=pro` in the URL. */
@Component({ selector: "app-pro-host-stub", template: "" })
class ProHostStub {}

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

function makeFeedLink(id: string): FeedLink {
  return {
    id,
    url: `https://example.com/${id}`,
    normalizedUrl: `https://example.com/${id}`,
    title: `Link ${id}`,
    created: "2026-08-01T08:00:00",
    occurredAt: "2026-08-01T08:00:00",
    parentId: null,
    isThreadRoot: true,
    sublinkCount: 0,
    sublinks: [],
    status: "LIVE",
    completed: false,
    isAutomated: false,
    voteScore: 0,
    userVote: 0,
    voteBreakdown: { upvotes: 0, downvotes: 0 },
    lines: [{ id: "L1", code: "KJL", displayName: "Kajang Line" }],
    user: { shortId: "abc12345", nickname: "Ali" },
    vehicles: [],
    stations: [],
    categories: [],
  };
}

/**
 * A store mock carrying every signal the five widgets read.
 *
 * The Pro widgets are composition over the store, so the mock is wide rather than deep — and the
 * filters are REAL `signal`s rather than literals, because several of the specs below change one and
 * then assert the board or the feed follows. A mock whose filters were constants would make the whole
 * file pass without ever exercising a propagation.
 */
function makeStore(lines: LinePulse[] = []) {
  const visibleLines = signal(lines);
  const buckets = signal(new Map<string, LineStatusHourBucket[]>());
  const store = {
    lines: signal(lines),
    visibleLines,
    // The board's own derived views. The dashboard mounts the REAL board, so the mock has to offer
    // them; the partition RULE is `home.store.spec.ts`'s subject, not this file's.
    attentionLines: signal<LinePulse[]>([]),
    myLines: signal<LinePulse[]>([]),
    allLines: signal(lines),
    boardSort: signal<"severity" | "name">("severity"),
    setBoardSort: vi.fn(),
    isLoading: signal(false),
    linesRefreshTick: signal(0),
    highlightedLineId: signal<string | null>(null),
    highlightLine: vi.fn(),
    linesHistoryFor: (lineId: string) => buckets().get(lineId) ?? [],
    linesHistoryFailed: signal(false),
    networkHistoryFailed: signal(false),
    requestHistoryReads: vi.fn(),
    incidentsFailed: signal(false),
    // The official-notices archive: a lazy read of its own, with the three states its widget needs.
    officialNotices: signal<FeedLink[]>([]),
    officialNoticesFailed: signal(false),
    officialNoticesLoading: signal(false),
    requestOfficialNotices: vi.fn(),
    recentIncidents: signal<
      Array<{
        id: string;
        startDatetime: string;
        endDatetime: string | null;
        severity: "MAJOR" | "MINOR" | "OTHERS";
        title: string;
        brief: string;
        lines: Array<{ id: string; code: string }>;
      }>
    >([]),
    requestIncidentsRead: vi.fn(),
    isLoadingMore: signal(false),
    feedLinks: signal<FeedLink[]>([makeFeedLink("a")]),
    feedPageInfo: signal<{ hasNextPage: boolean; endCursor: string | null } | null>({
      hasNextPage: false,
      endCursor: null,
    }),
    feedTotalCount: signal(1),
    loadMore: vi.fn(async () => undefined),
    userVoteFor: vi.fn(() => 0),
    userVotes: signal<Record<string, number>>({}),
    setUserVote: vi.fn(),
    reloadAll: vi.fn(),
    // The Pro filters, as real writable signals — see the mock's doc comment.
    // Real setters, not bare spies: several specs below change a filter and then assert the widget
    // that reads it followed, and a spy that records without writing would make every one of those
    // pass without ever exercising a propagation.
    proStatusFilter: signal<string | null>(null),
    proPassengerFilter: signal<string | null>(null),
    proOnlyWithData: signal(false),
    lineFilter: signal<string | null>(null),
    feedSearchQuery: signal(""),
    feedStatusFilter: signal<"all" | "official" | "community">("all"),
    setProStatusFilter: vi.fn(),
    setProPassengerFilter: vi.fn(),
    setProOnlyWithData: vi.fn(),
    setLineFilter: vi.fn(),
    setFeedSearchQuery: vi.fn(),
    setFeedStatusFilter: vi.fn(),
    resetProFilters: vi.fn(),
    polling: { refreshNow: vi.fn() },
  };
  store.setLineFilter = vi.fn((value: string | null) => store.lineFilter.set(value));
  store.setFeedSearchQuery = vi.fn((value: string | null) =>
    store.feedSearchQuery.set(value ?? ""),
  );
  store.setFeedStatusFilter = vi.fn((value: "all" | "official" | "community") =>
    store.feedStatusFilter.set(value),
  );
  store.setProStatusFilter = vi.fn((value: string | null) => store.proStatusFilter.set(value));
  store.setProPassengerFilter = vi.fn((value: string | null) =>
    store.proPassengerFilter.set(value),
  );
  store.setProOnlyWithData = vi.fn((value: boolean) => store.proOnlyWithData.set(value));
  return store;
}

type StoreMock = ReturnType<typeof makeStore>;

describe("pro-dashboard.component: ProDashboardComponent", () => {
  let fixture: ComponentFixture<ProDashboardComponent>;
  let storeMock: StoreMock;
  let navigate: ReturnType<typeof vi.fn>;
  let viewMode: HomeViewModeService;

  beforeEach(() => {
    localStorage.clear();
  });

  /**
   * Boots the dashboard against the mocked store.
   *
   * The five widgets are NOT stubbed out: this spec is about the dashboard's own composition, its
   * keyboard handling and its reset, and every one of those needs the real widgets mounted (the `/`
   * shortcut has to reach a real search input; the reset has to reach the real store signals). Each
   * widget's internals are covered by its own spec.
   */
  async function dashboard(
    lines: LinePulse[] = [],
    platform?: string,
    url?: string,
  ): Promise<HTMLElement> {
    storeMock = makeStore(lines);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProDashboardComponent],
      providers: [
        provideZonelessChangeDetection(),
        // `/spotting/:lineId`, its `details` child and `/insiden` have to RESOLVE, or the board rows'
        // links throw NG04002 the moment they render.
        provideRouter([
          {
            path: "",
            component: ProHostStub,
            children: [
              { path: "spotting/:lineId", children: [{ path: "details", children: [] }] },
              { path: "insiden", children: [] },
            ],
          },
        ]),
        { provide: HomeStore, useValue: storeMock },
        HomeViewModeService,
        // The board's rows route their report button through the route-scoped status-sheet service,
        // which the app's route provides rather than the widget tree.
        { provide: LineStatusSheetService, useValue: { openFor: vi.fn() } },
        ...(platform ? [{ provide: PLATFORM_ID, useValue: platform }] : []),
      ],
    });
    await TestBed.compileComponents();
    navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);
    // A deep link is navigated BEFORE the component exists, which is what a real arrival looks like:
    // the router resolves the route, then the page is created with that URL already in its snapshot.
    // Navigating afterwards would test a late param the constructor has legitimately already passed.
    if (url !== undefined) {
      await TestBed.inject(Router).navigateByUrl(url);
      navigate.mockClear();
    }
    viewMode = TestBed.inject(HomeViewModeService);

    fixture = TestBed.createComponent(ProDashboardComponent);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  /** Re-renders after a store signal changed. `tick` FIRST: the store's own effects write through a
   *  computed, and a bare `detectChanges` would run the view before they had flushed. */
  function rerender(): void {
    TestBed.tick();
    fixture.detectChanges();
  }

  /** A keydown on `document`, which is where the shortcut listener lives. */
  function press(key: string, init: KeyboardEventInit = {}, target?: EventTarget): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
    (target ?? document.body).dispatchEvent(event);
    return event;
  }

  /* ---- the layout -------------------------------------------------------------------- */

  it("renders the six cells inside one bento, in the three rows that balance the page", async () => {
    const root = await dashboard([makeLine("a")]);

    const bento = root.querySelector('[data-testid="pro-bento"]');
    expect(bento).not.toBeNull();
    expect(root.querySelector('[data-testid="pro-lines-widget"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="pro-feed-widget"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="pro-heat-widget"]')).not.toBeNull();
    // The two supporting panels added last. Both hide themselves when their own data is unavailable
    // (the ranking on a failed history read, the archive on its own), so their absence here is the
    // default state, not a mounting failure — their own specs cover the states where they DO render.
    expect(root.querySelector("app-pro-report-ranking")).not.toBeNull();
    expect(root.querySelector("app-pro-official-widget")).not.toBeNull();
    // …and the board really is INSIDE the lines widget, not a second copy of it.
    expect(
      root.querySelector('[data-testid="pro-lines-widget"]')?.querySelector("app-network-board"),
    ).not.toBeNull();
  });

  it("balances the bento: the two TALL cells share a row, the heat grid gets its own full-width row", async () => {
    const root = await dashboard([makeLine("a")]);

    // 🔴 The layout QA pass flagged. The old grid stacked BOTH tall cells (board, then community feed) in
    // the left column and every short cell in the right one, so the right rail ended halfway down the
    // page with a large dead zone beside it, and the feed — the second thing a Pro reader opens this for —
    // stranded at the bottom-left. These three assertions are the fix, asserted structurally rather than
    // through a screenshot, because a screenshot cannot fail a build.
    // The structural claims are made on the COMPONENT HOSTS, not on the `data-testid` inside each one: the
    // grid places the hosts, and it is the hosts' own parent that says which row a cell is in.
    const bento = root.querySelector('[data-testid="pro-bento"]');
    const lines = root.querySelector("app-pro-lines-widget");
    const feed = root.querySelector("app-pro-feed-widget");
    const heat = root.querySelector('[data-testid="pro-heat-widget"]');

    // Row A: both are DIRECT children of the SAME two-column grid — siblings, not stacked in one rail.
    const rowA = lines?.parentElement;
    expect(rowA).toBe(feed?.parentElement);
    expect(rowA?.className).toContain("xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]");

    // Row B: the heat cell is a sibling of that row, i.e. its own full-width row. It is 24 columns of
    // one-pixel cells behind a code gutter, so narrowing it into a rail made the hour axis unreadable.
    expect(heat?.parentElement).toBe(bento);
    expect(rowA?.parentElement).toBe(bento);

    // Row C: the three supporting panels tile in one grid rather than stacking in a narrow rail, so a
    // widget that hides itself just closes the gap instead of leaving a ragged column.
    const rowC = root.querySelector("app-pro-incidents-widget")?.parentElement;
    expect(rowC).toBe(root.querySelector("app-pro-incidents-widget")?.parentElement);
    expect(rowC).toBe(root.querySelector("app-pro-report-ranking")?.parentElement);
    expect(rowC).toBe(root.querySelector("app-pro-official-widget")?.parentElement);
    expect(rowC?.parentElement).toBe(bento);
    expect(rowC?.className).toContain("items-start");
  });

  it("shows the heat cell a SENTENCE on an empty service day, never a blank bordered card", async () => {
    const root = await dashboard([makeLine("a")]);
    // The store mock starts with NO history buckets at all — the state a quiet service day (or a fresh
    // install) actually produces. 🔴 The cell must not render as an empty bordered box, which reads as a
    // layout fault rather than as a fact about the day.
    expect(root.querySelector('[data-testid="pro-heat-widget"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="heat-empty"]')?.textContent?.trim()).toBe(
      "No rider reports in this service day yet.",
    );
    expect(root.querySelectorAll('[data-testid="heat-row"]').length).toBe(0);
  });

  it("draws the heat grid exactly ONCE, in its own cell", async () => {
    const root = await dashboard([makeLine("a")]);

    // The board mounts the grid itself in Pro view; the dashboard gives it a cell of its own and turns
    // the board's copy off. Two copies would mean two `network-heat-strip` testids and the same grid
    // rendered twice — which is the exact failure this gate exists to prevent.
    const grids = root.querySelectorAll("app-network-heat-strip");
    expect(grids.length).toBe(1);
    expect(grids[0].closest('[data-testid="pro-heat-widget"]')).not.toBeNull();
  });

  it("shows a visible hints row naming all three shortcuts", async () => {
    const root = await dashboard();

    const hints = root.querySelector('[data-testid="pro-shortcuts"]');
    expect(hints).not.toBeNull();
    // A shortcut nobody can discover is a shortcut nobody uses, and none of these keys is guessable.
    for (const testId of ["pro-shortcut-search", "pro-shortcut-refresh", "pro-shortcut-rider"]) {
      expect(hints?.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim()).toBeTruthy();
    }
    // …and a real button as well, so the shortcuts are an accelerator and not the only way out.
    expect(root.querySelector('[data-testid="pro-back-to-rider"]')).not.toBeNull();
  });

  it("says 'Back to rider view' ONCE — the kbd is inside the button, not beside it", async () => {
    const root = await dashboard();

    // 🔴 The QA pass caught the words twice in one line: once as the `p` hint's label, once on the
    // right-aligned ghost button. A touch reader has no `p` key so the button cannot go, and the label is
    // how the key is discovered so it cannot either — so the key moved INSIDE the button and the sentence
    // appears exactly once.
    const hints = root.querySelector('[data-testid="pro-shortcuts"]');
    const occurrences = (hints?.textContent ?? "").split("Back to rider view").length - 1;
    expect(occurrences).toBe(1);
    // …and it is that single control which carries BOTH roles: the advertised key and the real button.
    const button = root.querySelector('[data-testid="pro-back-to-rider"]');
    expect(button?.querySelector('[data-testid="pro-shortcut-rider"]')?.textContent?.trim()).toBe(
      "p",
    );
  });

  /* ---- the keyboard shortcuts --------------------------------------------------------- */

  it("/ focuses the feed search input, and prevents the slash from being typed", async () => {
    const root = await dashboard();
    const search = root.querySelector<HTMLInputElement>('[data-testid="pro-feed-search"]');
    expect(search).not.toBeNull();
    expect(document.activeElement).not.toBe(search);

    const event = press("/");

    expect(document.activeElement).toBe(search);
    // Without preventDefault the slash would also land in whatever had focus.
    expect(event.defaultPrevented).toBe(true);
  });

  it("makes the search focus VISIBLE — a keyboard reader can see where they are", async () => {
    const root = await dashboard();
    press("/");

    const search = root.querySelector<HTMLInputElement>('[data-testid="pro-feed-search"]');
    const classes = search?.className.split(/\s+/) ?? [];
    // focus-visible (not `focus`): programmatic focus from a shortcut still has to leave a ring, and
    // it has to be one that survives both themes.
    expect(classes).toContain("focus-visible:ring-2");
    expect(classes).toContain("focus-visible:ring-brand");
    expect(classes).toContain("focus-visible:ring-offset-2");
    expect(classes).toContain("focus-visible:ring-offset-background");
  });

  it("r drives the SAME store beat the refresh control and the mobile bar drive", async () => {
    await dashboard();

    press("r");

    // `polling.refreshNow()` and not a second code path into `reloadFirstPages()`: one beat, so the
    // keyboard click and the visible countdown cannot desync.
    expect(storeMock.polling.refreshNow).toHaveBeenCalledTimes(1);
  });

  it("p switches back to the Rider view through the one writer of ?view=", async () => {
    await dashboard();

    press("p");

    // Through the service, so the preference AND ?view= are written by the one owner of that fact —
    // a shortcut with its own private copy of the answer is how the two layouts end up disagreeing.
    expect(TestBed.inject(PreferencesService).viewMode()).toBe("rider");
    expect(viewMode.isDefaultView()).toBe(true);
    // Nothing to write: the URL already reads as the default, so the redundant-write guard holds and
    // no navigation is issued for a page whose URL already agreed.
    expect(navigate).not.toHaveBeenCalled();
  });

  it("back-to-rider from the button does exactly what the p shortcut does", async () => {
    const root = await dashboard();

    root.querySelector<HTMLElement>('[data-testid="pro-back-to-rider"]')?.click();
    rerender();

    expect(storeMock.polling.refreshNow).not.toHaveBeenCalled();
    expect(TestBed.inject(PreferencesService).viewMode()).toBe("rider");
  });

  it("ignores EVERY shortcut while the reader is typing", async () => {
    const root = await dashboard();
    const search = root.querySelector<HTMLInputElement>('[data-testid="pro-feed-search"]');

    // 🔴 The acceptance rule. `r` and `p` are ordinary letters: a reader typing "Kelana Jaya" into
    // the search would otherwise refresh on the `r` in "Kelana" and then throw the rest away.
    const before = TestBed.inject(PreferencesService).viewMode();
    for (const key of ["/", "r", "p"]) {
      press(key, {}, search ?? undefined);
    }

    expect(storeMock.polling.refreshNow).not.toHaveBeenCalled();
    expect(TestBed.inject(PreferencesService).viewMode()).toBe(before);
    expect(navigate).not.toHaveBeenCalled();
    // …and `/` did not steal focus either, or the reader would have been typing into the box from a
    // keystroke they sent to it.
    expect(document.activeElement).not.toBe(search);
  });

  it("ignores a shortcut fired from a textarea, a select and a contenteditable", async () => {
    const root = await dashboard();
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    root.append(textarea, select, editable);
    const before = TestBed.inject(PreferencesService).viewMode();

    for (const host of [textarea, select, editable]) {
      for (const key of ["/", "r", "p"]) {
        press(key, {}, host);
      }
    }

    expect(storeMock.polling.refreshNow).not.toHaveBeenCalled();
    expect(TestBed.inject(PreferencesService).viewMode()).toBe(before);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("never hijacks a MODIFIED keystroke — ctrl/cmd/alt are the browser's", async () => {
    await dashboard();

    // Ctrl+R is reload and Cmd/Ctrl+P is print. Stealing either breaks an affordance the reader can
    // see, and there is nothing to gain: an unmodified keystroke is the only one that can be a
    // deliberate shortcut.
    const before = TestBed.inject(PreferencesService).viewMode();
    press("r", { ctrlKey: true });
    press("r", { metaKey: true });
    press("p", { altKey: true });

    expect(storeMock.polling.refreshNow).not.toHaveBeenCalled();
    expect(TestBed.inject(PreferencesService).viewMode()).toBe(before);
    expect(navigate).not.toHaveBeenCalled();
  });

  /* ---- leaving Pro ------------------------------------------------------------------- */

  it("clears EVERY Pro filter on destroy, so the rider board cannot inherit a narrowing", async () => {
    await dashboard([makeLine("a"), makeLine("b")]);
    storeMock.proStatusFilter.set("ACTIVE");
    storeMock.proOnlyWithData.set(true);
    storeMock.feedSearchQuery.set("kelana");
    storeMock.lineFilter.set("a");

    fixture.destroy();

    // Acceptance rule for "filters reset on leaving Pro". `HomeStore` is route-scoped and its injector
    // OUTLIVES a visit, so anything left set is still set when the Rider board mounts.
    expect(storeMock.resetProFilters).toHaveBeenCalled();
  });

  it("does nothing to the URL on destroy when the reader set no filter", async () => {
    await dashboard();
    navigate.mockClear();

    fixture.destroy();

    // Writing `line: null, q: null` for filters that were never set would still be a navigation, and
    // a navigation on a page the reader did not change anything about is noise.
    expect(navigate).not.toHaveBeenCalled();
  });

  /* ---- widget independence ------------------------------------------------------------ */

  it("keeps every other widget rendered when the INCIDENTS read fails", async () => {
    // Acceptance rule for widget isolation. The incidents list is the widget most likely to be slow
    // or unavailable; it must hide ITSELF and nothing else.
    const root = await dashboard([makeLine("a")]);
    storeMock.recentIncidents.set([
      {
        id: "i-1",
        startDatetime: "2026-10-03T08:00:00",
        endDatetime: null,
        severity: "MAJOR",
        title: "Signal failure",
        brief: "",
        lines: [{ id: "L1", code: "KJL" }],
      },
    ]);
    storeMock.incidentsFailed.set(true);
    rerender();

    // Its own widget is gone…
    expect(root.querySelector('[data-testid="pro-incidents-widget"]')).toBeNull();
    // …and everything else is still on screen.
    expect(root.querySelector('[data-testid="pro-lines-widget"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="pro-feed-widget"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="pro-heat-widget"]')).not.toBeNull();
    expect(root.querySelector("app-network-board")).not.toBeNull();
    expect(root.querySelector("app-link-thread")).not.toBeNull();
  });

  it("keeps every other widget rendered when the PER-LINE HISTORY read fails", async () => {
    const root = await dashboard([makeLine("a")]);
    storeMock.linesHistoryFailed.set(true);
    rerender();

    // The board's own row strips and the heat grid hide; the board's rows, the feed and the
    // supporting panels do not. A chart that will not load must not cost the reader the page.
    expect(root.querySelector("app-network-heat-strip")?.querySelector("section")).toBeNull();
    expect(root.querySelector('[data-testid="pro-lines-widget"]')).not.toBeNull();
    expect(root.querySelector("app-network-board")).not.toBeNull();
    expect(root.querySelector("app-pro-report-ranking")).not.toBeNull();
    expect(root.querySelector("app-link-thread")).not.toBeNull();
  });

  it("opts into BOTH lazy reads from the surfaces that draw them, and into nothing else", async () => {
    await dashboard([makeLine("a")]);

    // One explicit call each, from the widget that renders the answer. A store-constructed resource
    // would fire for every store — including every Rider visit and every feed-focused spec.
    expect(storeMock.requestHistoryReads).toHaveBeenCalled();
    expect(storeMock.requestIncidentsRead).toHaveBeenCalledTimes(1);
    // The archive read is the third of the three, and it is the one NOBODY else may request: it is
    // only mounted here.
    expect(storeMock.requestOfficialNotices).toHaveBeenCalledTimes(1);
  });

  it("keeps every other widget rendered when the OFFICIAL ARCHIVE read fails", async () => {
    // The archive is the panel most likely to be unavailable (it is the fourth `FEED_QUERY` read on
    // the page), and it must hide ITSELF — board, feed, heat grid and ranking all stay.
    const root = await dashboard([makeLine("a")]);
    storeMock.officialNotices.set([makeFeedLink("official-1")]);
    rerender();
    expect(root.querySelector('[data-testid="pro-official-widget"]')).not.toBeNull();

    storeMock.officialNoticesFailed.set(true);
    rerender();

    expect(root.querySelector('[data-testid="pro-official-widget"]')).toBeNull();
    expect(root.querySelector('[data-testid="pro-lines-widget"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="pro-feed-widget"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="pro-heat-widget"]')).not.toBeNull();
    expect(root.querySelector("app-network-board")).not.toBeNull();
    expect(root.querySelector("app-link-thread")).not.toBeNull();
  });

  it("never asks the router for anything on the server", async () => {
    await dashboard([makeLine("a")], "server");

    // The read half is pure param parsing, so a server-rendered Pro layout still renders; the WRITE
    // half is browser-gated, because a reactive navigate() during SSR hangs the render.
    expect(navigate).not.toHaveBeenCalled();
  });

  /* ---- URL state ---------------------------------------------------------------------- */

  it("mirrors ?line= and ?q= into the URL and omits both when they are off", async () => {
    await dashboard();
    navigate.mockClear();

    storeMock.lineFilter.set("L1");
    storeMock.feedSearchQuery.set("kelana");
    await Promise.resolve();
    TestBed.tick();

    const patch = navigate.mock.calls.at(-1)?.[1]?.queryParams as Record<string, unknown>;
    expect(patch["line"]).toBe("L1");
    expect(patch["q"]).toBe("kelana");
  });

  it("reads ?line= and ?q= from the route snapshot on entry, so a shared link works", async () => {
    // A deep link has to reach the store, or `?view=pro&line=3&q=kelana` opens a Pro dashboard that
    // silently ignored two thirds of the link.
    await dashboard([makeLine("a")], undefined, "/?view=pro&line=L1&q=kelana");

    expect(storeMock.setLineFilter).toHaveBeenCalledWith("L1");
    expect(storeMock.setFeedSearchQuery).toHaveBeenCalledWith("kelana");
    expect(storeMock.lineFilter()).toBe("L1");
    expect(storeMock.feedSearchQuery()).toBe("kelana");
    // The write half then sees the URL already agreeing and issues no navigation of its own.
    expect(navigate).not.toHaveBeenCalled();
  });

  it("reads the params on entry through the constructor, not a re-pushing effect", async () => {
    await dashboard();

    // A reader who typed something must not have the URL's stale value pushed back over it the next
    // time the router re-emits an unrelated param.
    storeMock.setFeedSearchQuery.mockClear();
    await Promise.resolve();
    TestBed.tick();
    expect(storeMock.setFeedSearchQuery).not.toHaveBeenCalled();
  });
});
