import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  provideZonelessChangeDetection,
  signal,
  type WritableSignal,
} from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By, Meta } from "@angular/platform-browser";
import { Router, provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../core/auth/auth.service";
import { GraphQLClient } from "../../core/graphql/graphql-client";
import { ImageUploadService } from "../../core/upload/image-upload.service";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { RetryBannerComponent } from "../../ui/retry-banner/retry-banner.component";
import { ToastService } from "../../ui/toast/toast.service";
import { LinkSheetService } from "../insiden/data/link-sheet.service";
import { LinkCardComponent } from "../insiden/link-card/link-card.component";
import { LinkThreadComponent } from "../insiden/link-thread/link-thread.component";
import { ReportSheetService } from "../spotting/data/report-sheet.service";
import { SpottingLinesStore } from "../spotting/data/spotting-lines.store";
import { ReportFormComponent } from "../spotting/report-form/report-form.component";
import type {
  FeedLink,
  FeedLinkPageInfo,
  FeedLinkSublink,
  LinePulse,
  LineStatusHourBucket,
} from "./data/home.queries";
import type { FeedDayGroup } from "./data/feed-day-groups.util";
import type { NetworkSummary } from "./data/network-summary.util";
import { summarizeNetwork } from "./data/network-summary.util";
import type { BoardSort } from "./data/board-lines.util";
import { HomeStore } from "./data/home.store";
import { HomeViewModeService } from "./data/home-view-mode.service";
import { LineStatusSheetService } from "./data/line-status-sheet.service";
import { LinkSubmitBoxComponent } from "./feed/link-submit-box.component";
import { HomeHeroComponent } from "./hero/home-hero.component";
import { HomePage } from "./home.page";
import { NetworkBoardComponent } from "./line-pulse/network-board.component";
import { ProDashboardComponent } from "./pro/pro-dashboard.component";
import { LineStatusSheetComponent } from "./line-status/line-status-sheet.component";
import { ReportChooserService } from "./report/report-chooser.service";

// LineStatusSheetComponent reads window.matchMedia in its constructor; the test DOM doesn't provide it.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

/** A lone, ungrouped link — a root of its own conversation. This is the shape `FEED_QUERY` returns
 *  for the overwhelming majority of rows, and it is the case the affordance gate has to keep
 *  quiet: `parentId` null, `isThreadRoot` true (a ROOT MARKER, not "has sublinks"), and
 *  `sublinkCount` **0** because a childless link has no descendants.
 *
 *  ⚠️ `0`, not `1`. `sublinkCount` is a DESCENDANT count, so the old flat fixture's
 *  `threadSize: 1` ("a conversation of one, counting itself") became `sublinkCount: 0`. Writing
 *  `1` here would put a "2 links" chip on every ordinary row in the feed — the exact regression
 *  the card's gate note warns about. */
function makeFeedLink(id: string): FeedLink {
  return {
    id,
    url: `https://example.com/${id}`,
    normalizedUrl: `https://example.com/${id}`,
    title: `Feed link ${id}`,
    created: "2026-08-01T08:00:00",
    occurredAt: "2026-08-01T08:00:00",
    parentId: null,
    isThreadRoot: true,
    sublinkCount: 0,
    sublinks: [],
    status: "LIVE",
    completed: false,
    isAutomated: false,
    voteScore: 3,
    userVote: 0,
    voteBreakdown: { upvotes: 3, downvotes: 0 },
    lines: [{ id: "L1", code: "KJL", displayName: "Kajang Line" }],
    user: { shortId: "abc12345", nickname: "Ali" },
    // The three EDIT ROUND-TRIP relations, which `FEED_QUERY` selects at EVERY level
    // precisely because the edit sheet replaces them server-side. A fixture that omitted
    // them would describe a row the server can never return, and would hand the edit
    // sheet a form that looks untagged and saves as one.
    vehicles: [],
    stations: [],
    categories: [{ id: "C1", name: "Just Reporting" }],
  };
}

/** The recursion {@link descendantCount} needs, and the minimum a node must carry for a fixture to
 *  be counted: a node plus its own children. Every `FeedLinkSublink` level is structurally a
 *  `SublinkNode` (each deeper level adds nothing but another `sublinks` array), so the counter
 *  accepts the real query types without a cast. */
interface SublinkNode {
  sublinkCount: number;
  sublinks?: SublinkNode[];
}

/** How many descendants a list of sublinks holds, at EVERY depth — the value the backend's
 *  `sublinkCount` carries for the node they hang under.
 *
 *  🔴 This is the rule a fixture that hand-writes the count gets wrong: a root with two children
 *  where one of those has a child of its own is `3`, not `2` and not `1 + children.length`. The old
 *  flat `threadSize` could be summed as `members.length + 1` because depth was 1 by model
 *  invariant; the tree has no such invariant, so a fixture that assumes "children + 1" passes the
 *  chip assertion for the wrong reason. Deriving the number from the tree the fixture actually
 *  built makes that mistake unrepresentable. */
function descendantCount(sublinks: readonly SublinkNode[]): number {
  return sublinks.reduce((total, node) => total + 1 + descendantCount(node.sublinks ?? []), 0);
}

/** One SUBLINK, at any depth: a child of `parentId` that may itself carry sublinks. Unlike the old
 *  "thread member" factory it keeps every tree field — a sublink can be the head of a nested
 *  conversation of its own, which the depth-1 model made impossible — and it derives
 *  `sublinkCount` from the children it is given rather than being handed one, so a node can never
 *  claim a count its own subtree contradicts.
 *
 *  🔴 `isThreadRoot: false`, which the old factory could not express: `isThreadRoot` is defined as
 *  `parentId == null`, so a sublink is never a root even when it is the only conversation of one. */
function makeSublink(
  id: string,
  parentId: string,
  sublinks: FeedLinkSublink[] = [],
): FeedLinkSublink {
  return {
    ...makeFeedLink(id),
    parentId,
    isThreadRoot: false,
    sublinkCount: descendantCount(sublinks),
    sublinks,
  };
}

/** A collapsed root with one level of sublinks, as the backend returns it for a two-level
 *  conversation: children nested under `sublinks`, and the root's own descendant count. The chip
 *  then reads `count + 1` (the conversation size `threadLabel` is defined on), so two children read
 *  "3 links". */
function makeTreeLink(id: string, sublinkIds: string[]): FeedLink {
  const sublinks = sublinkIds.map((sublinkId) => makeSublink(sublinkId, id));
  return { ...makeFeedLink(id), sublinkCount: descendantCount(sublinks), sublinks };
}

/** A THREE-LEVEL conversation — root -> [c1, c2], where c1 carries a grandchild of its own. It
 *  exists to pin the one thing the two-level fixture cannot: that the root's count spans ALL depths.
 *  The subtree holds 3 nodes below the root, so the root's `sublinkCount` is 3 (a descendant count,
 *  NOT the conversation size) and the chip must read "4 links".
 *
 *  If the count were "children + 1" the assertion would read "3 links", and a component that
 *  mis-summed only one level would still pass every other test in this file. */
function makeNestedTreeLink(id: string): FeedLink {
  const grandchild = makeSublink(`${id}-c1-gc`, `${id}-c1`);
  const c1 = makeSublink(`${id}-c1`, id, [grandchild]);
  const c2 = makeSublink(`${id}-c2`, id);
  const sublinks = [c1, c2];
  return { ...makeFeedLink(id), sublinkCount: descendantCount(sublinks), sublinks };
}

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
    vehicleStatusCounts: [],
    passengerStatusCount: 0,
    statusWindowMinutes: 60,
    pulseLinks: [],
  };
}

interface StoreMock {
  lines: WritableSignal<LinePulse[]>;
  /** What the BOARD draws and its three groups partition. Equal to `lines` until a Pro filter narrows
   *  it, and a Rider page can never narrow it — so aliasing the one signal keeps the mock honest about
   *  that default instead of inventing a second source the real store does not have. */
  visibleLines: WritableSignal<LinePulse[]>;
  networkSummary: ReturnType<typeof signal<NetworkSummary>>;
  attentionLines: WritableSignal<LinePulse[]>;
  myLines: WritableSignal<LinePulse[]>;
  allLines: WritableSignal<LinePulse[]>;
  othersLines: WritableSignal<LinePulse[]>;
  boardSort: WritableSignal<BoardSort>;
  setBoardSort: ReturnType<typeof vi.fn>;
  feedLinks: WritableSignal<FeedLink[]>;
  feedPageInfo: WritableSignal<FeedLinkPageInfo | null>;
  feedTotalCount: WritableSignal<number>;
  lastWeekLinks: WritableSignal<FeedLink[]>;
  lastWeekDayGroups: WritableSignal<FeedDayGroup[]>;
  lastWeekPageInfo: WritableSignal<FeedLinkPageInfo | null>;
  lastWeekTotalCount: WritableSignal<number>;
  isLoading: WritableSignal<boolean>;
  isLoadingMore: WritableSignal<boolean>;
  isLoadingLastWeek: WritableSignal<boolean>;
  isLoadingMoreLastWeek: WritableSignal<boolean>;
  isRefreshing: WritableSignal<boolean>;
  hasError: WritableSignal<boolean>;
  linesRefreshTick: WritableSignal<number>;
  highlightedLineId: WritableSignal<string | null>;
  highlightLine: ReturnType<typeof vi.fn>;
  // The two service-day history reads, opted in by the widgets that draw them.
  networkHistory: WritableSignal<LineStatusHourBucket[]>;
  networkHistoryFailed: WritableSignal<boolean>;
  linesHistoryFor: (lineId: string) => LineStatusHourBucket[];
  linesHistoryFailed: WritableSignal<boolean>;
  requestHistoryReads: ReturnType<typeof vi.fn>;
  polling: {
    intervalMs: WritableSignal<number | null>;
    secondsRemaining: WritableSignal<number>;
    refreshNow: ReturnType<typeof vi.fn>;
  };
  userVoteFor: ReturnType<typeof vi.fn>;
  userVotes: WritableSignal<Record<string, number>>;
  setUserVote: ReturnType<typeof vi.fn>;
  reloadAll: ReturnType<typeof vi.fn>;
  loadMore: ReturnType<typeof vi.fn>;
  loadMoreLastWeek: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

/**
 * A rendered testid's text with its whitespace collapsed. Read through this rather than off
 * `element.textContent` so a Prettier re-wrap (which decides whether an interpolation gets its
 * own text node) can never fail an assertion. Takes the fixture's root as an argument because the
 * helper is declared before the `fixture` binding exists.
 */
function textOf(root: HTMLElement, testId: string): string {
  return (
    root.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, " ").trim() ?? ""
  );
}

/**
 * An inert host for the router's route table, so a real navigation can put a real `?view=pro` in the
 * URL. `provideRouter([])` leaves nothing to activate, and the view service reads
 * `ActivatedRoute.queryParamMap` — a stubbed route would not be a route.
 */
@Component({ selector: "app-page-host-stub", template: "" })
class PageHostStub {}

describe("HomePage", () => {
  let store: StoreMock;
  let auth: {
    isLoggedIn: WritableSignal<boolean>;
    isAdmin: WritableSignal<boolean>;
    user: WritableSignal<{ uid: string } | null>;
  };
  let sheet: {
    isOpen: WritableSignal<boolean>;
    lineId: WritableSignal<string | null>;
    openFor: ReturnType<typeof vi.fn>;
    setOpen: ReturnType<typeof vi.fn>;
  };
  let fixture: ComponentFixture<HomePage>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    // 🔴 The view-mode branch specs below navigate to `?view=pro`, and the view service's deep-link
    // effect then PERSISTS that into `localStorage`. Without clearing it, the next spec would boot a
    // Pro reader and every rider assertion here would fail on a stale preference — a leak between
    // tests that reads exactly like a real bug and is not one.
    localStorage.clear();
    // The store's partition is REAL here rather than three hand-written arrays, so the composition
    // spec exercises the same grouping the board's own spec asserts on — a hand-written mock could
    // agree with a broken rule.
    const seededLines = [makeLine("a")];
    store = {
      lines: signal<LinePulse[]>(seededLines),
      visibleLines: signal<LinePulse[]>(seededLines),
      networkSummary: signal<NetworkSummary>(summarizeNetwork(seededLines)),
      attentionLines: signal<LinePulse[]>([]),
      myLines: signal<LinePulse[]>([]),
      allLines: signal<LinePulse[]>(seededLines),
      othersLines: signal<LinePulse[]>([]),
      boardSort: signal<BoardSort>("severity"),
      setBoardSort: vi.fn(),
      feedLinks: signal<FeedLink[]>([makeFeedLink("a"), makeFeedLink("b")]),
      feedPageInfo: signal<FeedLinkPageInfo | null>({ hasNextPage: true, endCursor: "cursor-a" }),
      feedTotalCount: signal(2),
      lastWeekLinks: signal<FeedLink[]>([]),
      lastWeekDayGroups: signal<FeedDayGroup[]>([]),
      lastWeekPageInfo: signal<FeedLinkPageInfo | null>(null),
      lastWeekTotalCount: signal(0),
      isLoading: signal(false),
      isLoadingMore: signal(false),
      isLoadingLastWeek: signal(false),
      isLoadingMoreLastWeek: signal(false),
      isRefreshing: signal(false),
      hasError: signal(false),
      linesRefreshTick: signal(0),
      highlightedLineId: signal<string | null>(null),
      // The two service-day history reads, owned by the store but OPTED IN by the widgets that draw
      // them (the hero's sparkline and each board row's strip). Empty here so this spec's page renders
      // without them; `network-sparkline.component.spec.ts` and the row's spec cover what they draw.
      networkHistory: signal([]),
      networkHistoryFailed: signal(false),
      linesHistoryFor: () => [],
      linesHistoryFailed: signal(false),
      requestHistoryReads: vi.fn(),
      // The REAL rule (set the signal, then let the board's effect scroll the anchor) rather than a
      // spy that records the call — a spy would pass even if the board never drew the ring.
      highlightLine: vi.fn((lineId: string) => {
        store.highlightedLineId.set(lineId);
      }),
      polling: {
        intervalMs: signal<number | null>(30000),
        secondsRemaining: signal(30),
        refreshNow: vi.fn(),
      },
      userVoteFor: vi.fn((linkId: string) => (linkId === "a" ? 1 : 0)),
      userVotes: signal<Record<string, number>>({}),
      setUserVote: vi.fn(),
      reloadAll: vi.fn(),
      loadMore: vi.fn(async () => undefined),
      loadMoreLastWeek: vi.fn(async () => undefined),
      start: vi.fn(),
      stop: vi.fn(),
    };
    auth = {
      isLoggedIn: signal(false),
      isAdmin: signal(false),
      user: signal<{ uid: string } | null>(null),
    };
    sheet = {
      isOpen: signal(false),
      lineId: signal<string | null>(null),
      openFor: vi.fn(),
      setOpen: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClientTesting(),
        // The hero's "Live map" is a RouterLink to /tracker, so a router must be present for the
        // page to compose at all. An empty route table is enough — nothing navigates in these specs.
        // A real (if tiny) route table, not an empty one: the rider/pro branch below navigates to
        // `?view=pro` and asserts the LAYOUT the page picked, which needs a route whose query params
        // the view service can actually read.
        provideRouter([{ path: "", component: PageHostStub }]),
        { provide: HomeStore, useValue: store },
        { provide: LineStatusSheetService, useValue: sheet },
        // The page branches on the view through the service, exactly as the app's route provides it.
        // The REAL service (not a stub) is deliberate: the rider/pro branch specs below navigate a real
        // router and assert the URL, and a stubbed view would let the page keep a private copy of the
        // answer and every one of those assertions would pass for the wrong reason.
        HomeViewModeService,
        // Hosted spotting form injects this route-scoped store; its lines+vehicles POST is
        // flushed below.
        { provide: SpottingLinesStore, useValue: { lines: signal([]) } },
        { provide: ImageUploadService, useValue: { addToQueue: vi.fn() } },
        {
          provide: AuthService,
          useValue: {
            ...auth,
            firstName: signal(null),
            login: vi.fn(),
            idToken: vi.fn(async () => null),
            whenReady: Promise.resolve(),
          },
        },
        { provide: GraphQLClient, useValue: { request: vi.fn() } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
    })
      // The shell (nav/footer) drags in ResizeObserver + Firestore-shaped deps that this
      // composition test doesn't care about — drop them and allow the tags as inert elements.
      .overrideComponent(HomePage, {
        // The shell drags in ResizeObserver + Firestore-shaped deps this composition test does not
        // care about, and the Pro dashboard drags in five widgets (a router-link grid to
        // /spotting/:id, a lazy incidents read, the board, the feed surface). Both are stripped so
        // THIS file stays about the page's own composition and the branch it takes; the dashboard's
        // internals are covered by pro-dashboard.component.spec.ts and each widget's own spec.
        remove: { imports: [AppNavComponent, AppFooterComponent, ProDashboardComponent] },
        add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] },
      })
      .compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();

    // The sheets' projected forms are created with the page (Angular builds projected content
    // eagerly; HlmSheet only gates the panel's own DOM), so their reads are already in flight
    // here even though both sheets are closed. A pending httpResource keeps the app unstable, so
    // tick + flush them before awaiting stability.
    TestBed.tick();
    httpMock
      .match((r) => r.method === "POST" && r.body.query.includes("LinesAndVehicles"))
      .forEach((request) => request.flush({ data: { lines: [] } }));
    httpMock
      .match((r) => r.method === "POST" && r.body.query.includes("InsidenReferenceData"))
      .forEach((request) =>
        request.flush({
          data: { lines: [], stations: [], calendarIncidentCategories: [] },
        }),
      );
    await fixture.whenStable();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("renders the network board first, then the submit box and the feed cards", () => {
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector("app-network-board")).not.toBeNull();
    expect(root.textContent).toContain("Line a");
    expect(root.querySelector("app-link-submit-box")).not.toBeNull();
    expect(root.querySelectorAll("app-link-card").length).toBe(2);
    expect(root.textContent).toContain("Feed link a");

    // 🔴 The composition order the page exists to enforce: network board FIRST, then the global
    // feed. The live network is why a reader opens this page, so it has to lead in the DOM and not
    // only in a CSS order value — mobile stacking follows document order too.
    const html = root.innerHTML;
    expect(html.indexOf("app-network-board")).toBeLessThan(html.indexOf("app-link-submit-box"));
    // …and the box still heads the feed section, ahead of the rows it feeds.
    const feedSection = root.querySelector('section[aria-label="Community feed"]');
    expect(feedSection?.querySelector("app-link-submit-box")).not.toBeNull();
    const feedHtml = feedSection?.innerHTML ?? "";
    expect(feedHtml.indexOf("app-link-submit-box")).toBeLessThan(feedHtml.indexOf("app-link-card"));
    // The retired one-list component is gone, not merely unrendered.
    expect(root.querySelector("app-line-pulse-list")).toBeNull();
  });

  it("passes the store's per-link vote into each feed card", () => {
    const cards = fixture.debugElement.queryAll(By.directive(LinkCardComponent));

    expect(cards.length).toBe(2);
    expect(cards[0].componentInstance.userVote()).toBe(1);
    expect(cards[1].componentInstance.userVote()).toBe(0);
  });

  it("shows no Pending pill on a LIVE feed card even though completed is false", () => {
    const card = fixture.debugElement.queryAll(By.directive(LinkCardComponent))[0];

    expect(card.componentInstance.link().status).toBe("LIVE");
    expect(card.componentInstance.link().completed).toBe(false);
    expect(card.nativeElement.querySelector('[data-testid="link-pending"]')).toBeNull();
  });

  it("reloads the store when the submit box emits submitted", () => {
    const box = fixture.debugElement.query(By.directive(LinkSubmitBoxComponent));
    expect(box).not.toBeNull();

    box.componentInstance.submitted.emit();

    expect(store.reloadAll).toHaveBeenCalledTimes(1);
  });

  it("records a feed card's vote through the store", () => {
    const cards = fixture.debugElement.queryAll(By.directive(LinkCardComponent));

    cards[1].componentInstance.voteChanged.emit({ value: -1 });

    expect(store.setUserVote).toHaveBeenCalledWith("b", -1);
  });

  it("opens the shared link sheet for a feed card the signed-in author may edit", () => {
    auth.isLoggedIn.set(true);
    auth.user.set({ uid: "abc12345zzz" });
    fixture.detectChanges();

    const card = fixture.debugElement.queryAll(By.directive(LinkCardComponent))[0];
    expect(card.componentInstance.editable()).toBe(true);

    const editButton = card.nativeElement.querySelector(
      '[data-testid="link-edit"]',
    ) as HTMLButtonElement;
    editButton.click();

    const linkSheet = TestBed.inject(LinkSheetService);
    expect(linkSheet.isOpen()).toBe(true);
    expect(linkSheet.editTarget()?.id).toBe("a");
  });

  it("leaves the edit pencil off the feed cards for anonymous visitors", () => {
    const card = fixture.debugElement.queryAll(By.directive(LinkCardComponent))[0];

    expect(card.componentInstance.editable()).toBe(false);
    expect(card.nativeElement.querySelector('[data-testid="link-edit"]')).toBeNull();
  });

  it("reloads the feed when the link sheet closes after an edit", () => {
    const linkSheet = TestBed.inject(LinkSheetService);
    linkSheet.openEdit({ id: "a", url: "https://example.com/a", title: "Feed link a", lines: [] });
    fixture.detectChanges();
    expect(store.reloadAll).not.toHaveBeenCalled();

    linkSheet.close();
    fixture.detectChanges();

    expect(store.reloadAll).toHaveBeenCalledTimes(1);
  });

  it("starts the polling beat on construction and stops it on destroy", () => {
    expect(store.start).toHaveBeenCalledTimes(1);

    fixture.destroy();

    expect(store.stop).toHaveBeenCalledTimes(1);
  });

  it("shows the retry banner on error and retries through the store", () => {
    store.hasError.set(true);
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.directive(RetryBannerComponent));
    expect(banner).not.toBeNull();

    banner.componentInstance.resource().retryNow();

    expect(store.reloadAll).toHaveBeenCalledTimes(1);
  });

  it("feeds the status sheet the line targeted by the sheet service and reloads on submit", () => {
    const sheetComponent = fixture.debugElement.query(By.directive(LineStatusSheetComponent));
    expect(sheetComponent).not.toBeNull();

    sheet.lineId.set("a");
    fixture.detectChanges();
    expect(sheetComponent.componentInstance.line()?.id).toBe("a");

    sheet.lineId.set("missing");
    fixture.detectChanges();
    expect(sheetComponent.componentInstance.line()).toBeNull();

    sheetComponent.componentInstance.submitted.emit();
    expect(store.reloadAll).toHaveBeenCalledTimes(1);
  });

  /* ---- Phase 2: success feedback + the mobile bar ---------------------------------------- */

  it("rings the line a status report was filed against, from the sheet's surviving id", () => {
    const sheetComponent = fixture.debugElement.query(By.directive(LineStatusSheetComponent));
    // The service keeps `lineId` AFTER the close (deliberately), which is why the page needs no
    // payload on the output to know which line to return to.
    sheet.lineId.set("a");

    sheetComponent.componentInstance.submitted.emit();
    fixture.detectChanges();

    expect(store.reloadAll).toHaveBeenCalledTimes(1);
    expect(store.highlightedLineId()).toBe("a");
    // And the board drew it: the anchor exists and the ring landed on THAT row.
    const row = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[id="line-a"]');
    expect(row).not.toBeNull();
    expect(row?.hasAttribute("data-highlighted")).toBe(true);
    expect(row?.classList.contains("ring-2")).toBe(true);
  });

  it("rings nothing when a status report has no line to return to", () => {
    sheet.lineId.set(null);
    fixture.debugElement
      .query(By.directive(LineStatusSheetComponent))
      .componentInstance.submitted.emit();

    expect(store.reloadAll).toHaveBeenCalledTimes(1);
    expect(store.highlightedLineId()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector("[data-highlighted]")).toBeNull();
  });

  it("rings the reported line from a SPOTTING submit, whose payload carries it", async () => {
    const reportSheet = TestBed.inject(ReportSheetService);
    reportSheet.openFor("a");
    // HlmSheet mounts no panel DOM until it has been open once, and that flag is set in its own
    // effect — so opening the sheet needs a tick before the projected form exists to query.
    await fixture.whenStable();
    fixture.detectChanges();
    const form = fixture.debugElement.query(By.directive(ReportFormComponent));
    expect(form).not.toBeNull();

    form.componentInstance.submitted.emit("a");
    fixture.detectChanges();

    expect(reportSheet.isOpen()).toBe(false);
    expect(store.reloadAll).toHaveBeenCalledTimes(1);
    // The form consumes its own one-shot line seed, so `reportSheet.lineId` is already null by now —
    // the payload is the only honest source, and it is what makes the return-to-the-line real.
    expect(reportSheet.lineId()).toBeNull();
    expect(store.highlightedLineId()).toBe("a");
  });

  it("gives every board line an anchor the highlight can be scrolled to", () => {
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="line-board-row"]',
    );
    expect(rows.length).toBe(1);
    expect(rows[0]?.getAttribute("id")).toBe("line-a");
    // No highlight yet → no ring, and the marker attribute is absent rather than empty.
    expect(rows[0]?.hasAttribute("data-highlighted")).toBe(false);
    expect(rows[0]?.classList.contains("ring-2")).toBe(false);
  });

  it("hosts a mobile action bar with Report, Refresh and Live map, gated to below lg", () => {
    const root = fixture.nativeElement as HTMLElement;
    const bar = root.querySelector<HTMLElement>('[data-testid="home-mobile-bar"]');
    expect(bar).not.toBeNull();

    // Mobile-only: from lg up the hero's intent row and its refresh control are above the fold, so a
    // second bar would duplicate both. CSS-only, like every other breakpoint gate on this page.
    const classes = bar?.className.split(/\s+/);
    expect(classes).toContain("lg:hidden");
    expect(classes).toContain("fixed");
    expect(classes).toContain("bottom-0");
    // Safe-area padded so the buttons clear the iOS home indicator.
    expect(classes).toContain("pb-[env(safe-area-inset-bottom)]");

    expect(root.querySelector('[data-testid="home-mobile-report"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="home-mobile-refresh"]')).not.toBeNull();
    const map = root.querySelector<HTMLAnchorElement>('[data-testid="home-mobile-map"]');
    expect(map?.tagName).toBe("A");
    expect(map?.getAttribute("href")).toBe("/tracker");
    // The live map stays ONE tap away on a phone: the hero row's fourth CTA must not be the one
    // thing mobile loses.
    expect(map?.getAttribute("aria-label")).toBe("Live train map");

    // …and main is padded to match, or the bar would cover the last feed row.
    const main = root.querySelector("main") as HTMLElement;
    expect(main.className.split(/\s+/)).toContain("pb-24");
    expect(main.className.split(/\s+/)).toContain("lg:pb-6");
  });

  it("opens the chooser from the bar's Report, and drives the shared beat from its Refresh", () => {
    const root = fixture.nativeElement as HTMLElement;
    const chooser = TestBed.inject(ReportChooserService);

    (root.querySelector('[data-testid="home-mobile-report"]') as HTMLButtonElement).click();
    expect(chooser.isOpen()).toBe(true);

    (root.querySelector('[data-testid="home-mobile-refresh"]') as HTMLButtonElement).click();
    // ONE beat: the bar's button calls the same `polling.refreshNow()` the countdown's click does,
    // so the two can never disagree about what "refreshing" means.
    expect(store.polling.refreshNow).toHaveBeenCalledTimes(1);
  });

  it("renders every loaded feed link, not a sliced subset", () => {
    store.feedLinks.set(Array.from({ length: 10 }, (_, index) => makeFeedLink(`x${index}`)));
    store.feedTotalCount.set(10);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll("app-link-card").length).toBe(10);
  });

  it("splits the network board and the feed into two columns from lg, board first", () => {
    const root = fixture.nativeElement as HTMLElement;
    const panels = root.querySelector<HTMLElement>('[data-testid="home-panels"]');

    expect(panels).not.toBeNull();
    expect(panels?.className).toContain("flex-col");
    expect(panels?.className).toContain("lg:grid");
    expect(panels?.className).toContain("lg:grid-cols-2");
    expect(panels?.className).toContain("lg:items-start");

    const children = Array.from(panels?.children ?? []);
    // 🔴 BOARD FIRST, in DOM order. `lg:grid-cols-2` fills its columns in document order and the
    // stacked mobile layout follows the same order, so this ONE assertion pins both layouts.
    expect(children[0]?.getAttribute("aria-label")).toBe("Line status");
    expect(children[0]?.getAttribute("data-testid")).toBe("line-board");
    expect(children[0]?.querySelector("app-network-board")).not.toBeNull();
    expect(children[1]?.getAttribute("aria-label")).toBe("Community feed");
    expect(children[1]?.querySelector("app-link-card")).not.toBeNull();

    // No CSS `order` token anywhere in the grid. An order value would reorder the desktop columns
    // while leaving mobile stacked exactly the other way round — the layout this change exists to fix.
    const orderTokens = Array.from(panels?.querySelectorAll("*") ?? []).flatMap((element) =>
      (element.getAttribute("class") ?? "")
        .split(/\s+/)
        .filter((token) => token.startsWith("order-")),
    );
    expect(orderTokens).toEqual([]);

    // Mobile divider: stacked below lg the FEED follows the board, so it draws the seam itself
    // (border-t plus the matching pt-6), and the board above it must not claim one of its own. From
    // lg the two are grid COLUMNS side by side, so the rule and the padding are both dropped — a
    // border there would draw a line down the middle of the gap. Pinned as discrete class tokens
    // (not `toContain`, which would let `border-t` match inside `lg:border-t-0`), since jsdom cannot
    // measure layout.
    const feedSectionClasses = (children[1]?.className ?? "").split(/\s+/);
    expect(feedSectionClasses).toContain("border-border");
    expect(feedSectionClasses).toContain("border-t");
    expect(feedSectionClasses).toContain("pt-6");
    expect(feedSectionClasses).toContain("lg:border-t-0");
    expect(feedSectionClasses).toContain("lg:pt-0");
    const boardSectionClasses = (children[0]?.className ?? "").split(/\s+/);
    expect(boardSectionClasses).not.toContain("border-t");
    // The anchor scroll offset stays with the board — every #line-<id> lives inside it.
    expect(boardSectionClasses).toContain("scroll-mt-24");

    // The feed column still owns the submit box, and it heads the tab set and the rows below it.
    const feedSection = children[1];
    expect(feedSection?.querySelector("app-link-submit-box")).not.toBeNull();
    const feedHtml = feedSection?.innerHTML ?? "";
    expect(feedHtml.indexOf("app-link-submit-box")).toBeLessThan(
      feedHtml.indexOf('role="tablist"'),
    );
    expect(feedHtml.indexOf("app-link-submit-box")).toBeLessThan(feedHtml.indexOf("app-link-card"));
  });

  it("places the hero full width above the two-column split, fed by reads the page already had", () => {
    const main = (fixture.nativeElement as HTMLElement).querySelector("main") as HTMLElement;
    const hero = main.querySelector("app-home-hero") as HTMLElement;
    const panels = main.querySelector('[data-testid="home-panels"]') as HTMLElement;

    expect(hero).not.toBeNull();
    expect(hero.querySelector('[data-testid="home-hero"]')).not.toBeNull();
    // Full width ABOVE the grid, not in one of its columns: the headline and the four tiles
    // describe both columns, so a single-column hero would make half the summary lie.
    expect(hero.compareDocumentPosition(panels) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Bound straight to the store's own signals — the hero adds NO read of its own.
    const heroComponent = fixture.debugElement.query(By.directive(HomeHeroComponent));
    expect(heroComponent.componentInstance.lines()).toBe(store.lines());
    expect(heroComponent.componentInstance.linksToday()).toBe(2);

    store.feedTotalCount.set(9);
    fixture.detectChanges();
    expect(heroComponent.componentInstance.linksToday()).toBe(9);
  });

  it("opens the report chooser from the hero's Report a delay, not a scroll to the board", () => {
    const board = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="line-board"]',
    ) as HTMLElement;
    expect(board).not.toBeNull();

    // The CTA used to scroll here, which answered a question nobody asked: a reader on a platform
    // cannot name a line id. The chooser asks "which line?" instead, and the board is still the
    // scroll target for the post-submit highlight (see the #line-<id> anchors it renders).
    const scrollIntoView = vi.fn();
    // jsdom ships no layout, so `scrollIntoView` does not exist on the element at all.
    board.scrollIntoView = scrollIntoView;

    const chooser = TestBed.inject(ReportChooserService);
    const hero = fixture.debugElement.query(By.directive(HomeHeroComponent));
    (hero.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="hero-report-delay"]')
      ?.click();
    fixture.detectChanges();

    expect(chooser.isOpen()).toBe(true);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("hosts the report chooser BEFORE every other sheet, so its close releases the scroll lock", () => {
    // 🔴 ORDER, NOT COSMETICS. HlmSheet locks page scroll from an effect on its own `open()`, and
    // Angular flushes effects in creation order — the chooser OPENS the line-status sheet, so its
    // close (unlock) must be created before that sheet's open (lock). Reversed, a freshly-opened
    // sheet would sit on a page that can still scroll behind it.
    const html = (fixture.nativeElement as HTMLElement).innerHTML;
    expect(html.indexOf("app-report-chooser")).toBeGreaterThan(-1);
    expect(html.indexOf("app-report-chooser")).toBeLessThan(html.indexOf("app-line-status-sheet"));
    expect(html.indexOf("app-report-chooser")).toBeLessThan(html.indexOf("app-link-sheet"));
    expect(html.indexOf("app-report-chooser")).toBeLessThan(
      html.indexOf('data-testid="spotting-entry-sheet"'),
    );
  });

  it("publishes a description meta tag for crawlers and link previews", () => {
    // Written through `Meta.updateTag`, so the tag lands in the SSR HTML rather than only appearing
    // after hydration.
    const description = TestBed.inject(Meta).getTag('name="description"');
    expect(description?.content).toContain("live network board");
    expect(description?.content).not.toMatch(/\d/);
  });

  it("renders the feed in an uncapped container owned by the page scroll", () => {
    const container = fixture.nativeElement.querySelector(
      '[data-testid="feed-scroll"]',
    ) as HTMLElement;

    expect(container).not.toBeNull();
    expect(container.classList.contains("overflow-y-auto")).toBe(false);
    expect(container.className).not.toContain("max-h-");
    expect(container.querySelectorAll("app-link-card").length).toBe(2);
    // Load More sits at the foot of the feed panel, outside the links container.
    expect(container.querySelector('[data-testid="feed-load-more"]')).toBeNull();
  });

  it("shows the muted empty state once a settled feed has no links", () => {
    store.feedLinks.set([]);
    store.isLoading.set(false);
    fixture.detectChanges();

    const empty = fixture.nativeElement.querySelector('[data-testid="feed-empty"]') as HTMLElement;
    expect(empty).not.toBeNull();
    expect(textOf(fixture.nativeElement as HTMLElement, "feed-empty-copy")).toBe(
      "No links yet today — be the first",
    );
    // The same dashed/muted shell as the sibling line-list empty state, so the columns read alike.
    expect(empty.className).toContain("text-muted-foreground");
    expect(empty.className).toContain("border-dashed");
  });

  it("invites the first link from the empty state instead of only stating a fact", () => {
    store.feedLinks.set([]);
    store.isLoading.set(false);
    fixture.detectChanges();

    // An empty feed is an INVITATION: the CTA opens the same shared sheet the hero's "Share a
    // link" does, so the page keeps exactly one link-submission surface.
    const cta = fixture.nativeElement.querySelector(
      '[data-testid="feed-empty-cta"]',
    ) as HTMLButtonElement;
    expect(cta).not.toBeNull();
    expect(cta.textContent?.replace(/\s+/g, " ").trim()).toBe("Share a link");

    const sheet = TestBed.inject(LinkSheetService);
    // Stubbed rather than spy-through: a real open() flips the sheet signal, and the sheet's projected
    // form would then read reference data this composition spec has not stubbed.
    const open = vi.spyOn(sheet, "open").mockImplementation(() => {});
    cta.click();

    expect(open).toHaveBeenCalledTimes(1);
  });

  it("shows the feed skeleton, not the empty state, while the first page loads", () => {
    store.feedLinks.set([]);
    store.isLoading.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="feed-skeleton"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="feed-empty"]')).toBeNull();
  });

  it("keeps the empty state off a feed that has links", () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="feed-empty"]')).toBeNull();
  });

  it("leaves the empty state to the retry banner when the feed errored", () => {
    store.feedLinks.set([]);
    store.hasError.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="feed-empty"]')).toBeNull();
    expect(fixture.debugElement.query(By.directive(RetryBannerComponent))).not.toBeNull();
  });

  it("mounts ONE refresh control in the hero, and the mobile bar owns the phone's refresh", () => {
    const root = fixture.nativeElement as HTMLElement;
    const feedSection = root.querySelector<HTMLElement>('section[aria-label="Community feed"]');
    const lineSection = root.querySelector<HTMLElement>('section[aria-label="Line status"]');
    const hero = root.querySelector<HTMLElement>('[data-testid="home-hero"]');

    // ONE countdown instance on the whole page. The mobile feed-column copy is gone: the sticky bar
    // below carries a Refresh button on the SAME store beat at exactly the widths the old `lg:hidden`
    // gate covered, so two controls on one phone was one too many — and the bar is the only place a
    // reader scrolled to the bottom of the feed could reach Report at all.
    const controls = root.querySelectorAll("app-home-refresh-control");
    expect(controls.length).toBe(1);
    expect(hero?.querySelector("app-home-refresh-control")).not.toBeNull();
    expect(lineSection?.querySelector("app-home-refresh-control")).toBeNull();
    expect(feedSection?.querySelector("app-home-refresh-control")).toBeNull();
    expect(lineSection?.querySelector("app-network-board")).not.toBeNull();

    // 🔴 WHERE it lives is part of the same claim, not styling: the control sits on the hero's
    // HEADLINE row — sentence left, countdown right — at every width, because "Refreshing in 12s"
    // qualifies the sentence above it. It was a desktop-only bottom-right corner before, which hid
    // it entirely below `lg`, the widths that had no other freshness signal.
    const slot = hero?.querySelector<HTMLElement>('[data-testid="hero-refresh-slot"]');
    const slotClasses = slot?.className.split(/\s+/) ?? [];
    expect(slot).not.toBeNull();
    expect(slotClasses).toContain("shrink-0");
    expect(slotClasses).not.toContain("hidden");
    expect(slot?.querySelector("app-home-refresh-control")).not.toBeNull();

    // The row is CSS-only placement (never a matchMedia signal, which would desync SSR from
    // hydration), and `justify-between` is what puts the countdown at the right edge — the control
    // shrink-wraps to its own visible content, so it cannot park itself.
    const rowClasses = slot?.parentElement?.className.split(/\s+/) ?? [];
    expect(rowClasses).toContain("flex");
    expect(rowClasses).toContain("items-start");
    expect(rowClasses).toContain("justify-between");
    expect(rowClasses).toContain("gap-3");

    // …and the submit box heads the feed column, since nothing else does. The visually-hidden h2 now
    // precedes it (Phase 5B gave the column a real heading), so this asserts the submit box is still
    // the first INTERACTIVE thing rather than the first node.
    const feedChildren = [...(feedSection?.children ?? [])].map((child) =>
      child.tagName.toLowerCase(),
    );
    expect(feedChildren[0]).toBe("h2");
    expect(feedChildren[1]).toBe("app-link-submit-box");

    const countdown = root.querySelector('[data-testid="line-refresh-countdown"]');
    expect((countdown?.textContent ?? "").replace(/\s+/g, " ")).toContain("Refreshing in 30s");
    (countdown as HTMLElement).click();
    fixture.detectChanges();
    expect(store.polling.refreshNow).toHaveBeenCalledTimes(1);

    // The old separate button stays gone.
    expect(root.querySelector('[data-testid="line-refresh-now"]')).toBeNull();
  });

  it("loads the next feed page from Load More only while a next page exists", () => {
    const button = fixture.nativeElement.querySelector(
      '[data-testid="feed-load-more"]',
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();

    button.click();
    expect(store.loadMore).toHaveBeenCalledTimes(1);

    store.feedPageInfo.set({ hasNextPage: false, endCursor: "cursor-a" });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="feed-load-more"]')).toBeNull();
  });

  it("shows the visible count and the filtered total in the feed footer", () => {
    const footer = fixture.nativeElement.querySelector(
      '[data-testid="feed-footer"]',
    ) as HTMLElement;
    expect(footer).not.toBeNull();

    const count = footer.querySelector('[data-testid="feed-count"]') as HTMLElement;
    const button = footer.querySelector('[data-testid="feed-load-more"]') as HTMLElement;
    expect(count.textContent?.replace(/\s+/g, " ").trim()).toBe("Showing 2 of 2");
    expect(button).not.toBeNull();
    // The button sits after the count in the bottom-right footer.
    expect(count.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the count visible once every link is loaded and hides Load More", () => {
    store.feedPageInfo.set({ hasNextPage: false, endCursor: "cursor-a" });
    fixture.detectChanges();

    const count = fixture.nativeElement.querySelector('[data-testid="feed-count"]') as HTMLElement;
    expect(count.textContent?.replace(/\s+/g, " ").trim()).toBe("Showing 2 of 2");
    expect(fixture.nativeElement.querySelector('[data-testid="feed-load-more"]')).toBeNull();
  });

  it("hides Load More while a page is in flight", () => {
    store.isLoading.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="feed-load-more"]')).toBeNull();

    store.isLoading.set(false);
    store.isLoadingMore.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="feed-load-more"]')).toBeNull();
  });

  it("keeps every loaded link rendered while Load More fetches the next page", () => {
    store.feedLinks.set(Array.from({ length: 10 }, (_, index) => makeFeedLink(`x${index}`)));
    store.feedTotalCount.set(18);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll("app-link-card").length).toBe(10);

    (
      fixture.nativeElement.querySelector('[data-testid="feed-load-more"]') as HTMLButtonElement
    ).click();

    expect(store.loadMore).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelectorAll("app-link-card").length).toBe(10);
  });

  it("hands the store's refresh tick to the network board, which owns the line rows", () => {
    store.linesRefreshTick.set(4);
    fixture.detectChanges();

    const board = fixture.debugElement.query(By.directive(NetworkBoardComponent));

    expect(board).not.toBeNull();
    expect(board.componentInstance).toBeTruthy();
    // The board reads the store itself (like the refresh control reads its beat), so the page's only
    // job is to mount it — the tick travels board → card/row → the open accordion's chart/reports.
    const root = fixture.nativeElement as HTMLElement;
    const rows = root.querySelectorAll('[data-testid="line-board-row"]');
    expect(rows.length).toBe(1);
    expect((rows[0]?.textContent ?? "").replace(/\s+/g, " ")).toContain("Line a");
  });

  it("renders each line in exactly one board group, whatever the backend order", () => {
    // Acceptance spec (c) at the page level: the partition is what keeps the board honest, and the
    // page is where the board is mounted. Deliberately awkward input — a dead line FIRST (as the
    // backend is free to return it), two healthy ones, and a trial line that belongs to Others.
    const lines = [
      makeLine("dead", "TOTAL_DISRUPTION"),
      makeLine("healthy-a"),
      makeLine("healthy-b"),
      makeLine("trial", "TESTING"),
    ];
    store.lines.set(lines);
    store.attentionLines.set([lines[0]]);
    store.myLines.set([lines[1]]);
    store.allLines.set([lines[2]]);
    store.othersLines.set([lines[3]]);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const groupOf = (lineId: string): string => {
      for (const group of ["attention", "mine", "all", "others"]) {
        const section = root.querySelector<HTMLElement>(`[data-testid="line-board-${group}"]`);
        if (section?.textContent?.includes(`Line ${lineId}`)) {
          return group;
        }
      }
      return "none";
    };

    expect(groupOf("dead")).toBe("attention");
    expect(groupOf("healthy-a")).toBe("mine");
    expect(groupOf("healthy-b")).toBe("all");
    expect(groupOf("trial")).toBe("others");
    // And exactly once: one row per line, no duplicates across the four sections.
    expect(root.querySelectorAll('[data-testid="line-board-row"]').length).toBe(4);
  });

  it("hosts the spotting entry sheet and closes it + reloads the store on submit", async () => {
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="spotting-entry-sheet"]')).not.toBeNull();

    const reportSheet = TestBed.inject(ReportSheetService);
    reportSheet.openFor("a");
    await fixture.whenStable();
    fixture.detectChanges();

    const form = fixture.debugElement.query(By.directive(ReportFormComponent));
    expect(form).not.toBeNull();
    expect(root.querySelector('[data-testid="submit-spotting-entry"]')).not.toBeNull();

    form.componentInstance.submitted.emit();
    fixture.detectChanges();

    expect(reportSheet.isOpen()).toBe(false);
    expect(store.reloadAll).toHaveBeenCalledTimes(1);
  });

  /* ---- the Today / Last Week tab set (replaces the collapsed Last Week disclosure) ------------- */

  it("opens on the Today tab, with the Last Week panel present but hidden", () => {
    const root = fixture.nativeElement as HTMLElement;
    const today = root.querySelector('[data-testid="feed-tab-today"]') as HTMLButtonElement;
    const lastWeek = root.querySelector('[data-testid="feed-tab-lastweek"]') as HTMLButtonElement;

    // 🔴 A real tab SET, not two stacked sections: the tablist owns both tabs, and the reader's
    // focus order inside it is the entire mechanism — which is why it has to be one tablist rather
    // than a disclosure button stacked above a panel.
    const tablist = today.parentElement;
    expect(tablist?.getAttribute("role")).toBe("tablist");
    expect(tablist?.getAttribute("aria-label")).toBe("Feed period");
    expect(lastWeek.parentElement).toBe(tablist);
    expect(today.getAttribute("role")).toBe("tab");
    expect(lastWeek.getAttribute("role")).toBe("tab");

    // Selected state and the roving tabindex: exactly ONE tab is in the page tab order, so Tab
    // enters the set once and leaves it again instead of walking both.
    expect(today.getAttribute("aria-selected")).toBe("true");
    expect(lastWeek.getAttribute("aria-selected")).toBe("false");
    expect(today.getAttribute("tabindex")).toBe("0");
    expect(lastWeek.getAttribute("tabindex")).toBe("-1");

    // Each tab points at a panel that EXISTS, and each panel is labelled by its own tab — the two
    // halves of the association, both directions.
    expect(today.getAttribute("aria-controls")).toBe("feed-panel-today");
    expect(lastWeek.getAttribute("aria-controls")).toBe("feed-panel-lastweek");
    const todayPanel = root.querySelector("#feed-panel-today") as HTMLElement;
    const lastWeekPanel = root.querySelector('[data-testid="last-week-panel"]') as HTMLElement;
    expect(todayPanel.getAttribute("role")).toBe("tabpanel");
    expect(todayPanel.getAttribute("aria-labelledby")).toBe("feed-tab-today");
    expect(lastWeekPanel.getAttribute("role")).toBe("tabpanel");
    expect(lastWeekPanel.getAttribute("aria-labelledby")).toBe("feed-tab-lastweek");
    expect(lastWeekPanel.getAttribute("id")).toBe("feed-panel-lastweek");

    // Out of the way via the hidden ATTRIBUTE rather than an unmount, so the panel every tab
    // controls is always there for a screen reader to resolve.
    expect(todayPanel.hasAttribute("hidden")).toBe(false);
    expect(lastWeekPanel.hasAttribute("hidden")).toBe(true);

    // The retired disclosure button is gone, not merely unrendered.
    expect(root.querySelector('[data-testid="last-week-toggle"]')).toBeNull();
  });

  it("keeps the last-week count on the tab, where the collapsed header used to carry it", () => {
    store.lastWeekTotalCount.set(5);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const count = root.querySelector('[data-testid="last-week-count"]') as HTMLElement;
    expect(count.textContent?.replace(/\s+/g, " ").trim()).toBe("Last Week (5)");
    // It is the tab's own label, and it stays readable while the TODAY panel is the one on screen:
    // a count that only appeared after switching would be one tap too late to decide with.
    expect(root.querySelector('[data-testid="feed-tab-lastweek"]')?.contains(count)).toBe(true);
    expect(root.querySelector("#feed-panel-today")?.hasAttribute("hidden")).toBe(false);
  });

  it("switches to the Last Week panel on a click, and back again", () => {
    const root = fixture.nativeElement as HTMLElement;
    store.lastWeekDayGroups.set([
      { key: "2026-09-30", label: "Yesterday", links: [makeFeedLink("w")] },
    ]);
    fixture.detectChanges();

    const todayPanel = root.querySelector("#feed-panel-today") as HTMLElement;
    const lastWeekPanel = root.querySelector('[data-testid="last-week-panel"]') as HTMLElement;

    const lastWeekTab = root.querySelector(
      '[data-testid="feed-tab-lastweek"]',
    ) as HTMLButtonElement;
    lastWeekTab.click();
    fixture.detectChanges();

    expect(lastWeekTab.getAttribute("aria-selected")).toBe("true");
    expect(lastWeekTab.getAttribute("tabindex")).toBe("0");
    expect(todayPanel.hasAttribute("hidden")).toBe(true);
    expect(lastWeekPanel.hasAttribute("hidden")).toBe(false);
    expect(lastWeekPanel.querySelectorAll('[data-testid="last-week-day-group"]').length).toBe(1);
    expect(lastWeekPanel.textContent).toContain("Yesterday");
    expect(lastWeekPanel.querySelectorAll("app-link-card").length).toBe(1);

    (root.querySelector('[data-testid="feed-tab-today"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(todayPanel.hasAttribute("hidden")).toBe(false);
    expect(lastWeekPanel.hasAttribute("hidden")).toBe(true);
    // Selection only HIDES a panel: the day group is still in the DOM afterwards, so switching
    // neither refetches nor remounts and the two store resources are untouched by a switch.
    expect(root.querySelectorAll('[data-testid="last-week-day-group"]').length).toBe(1);
    // And the Today panel still holds its own loaded rows.
    expect(todayPanel.querySelectorAll("app-link-card").length).toBe(2);
  });

  it("moves between the tabs with the arrow keys and Home/End, wrapping at the ends", () => {
    const root = fixture.nativeElement as HTMLElement;
    const today = root.querySelector('[data-testid="feed-tab-today"]') as HTMLButtonElement;
    const lastWeek = root.querySelector('[data-testid="feed-tab-lastweek"]') as HTMLButtonElement;

    const press = (tab: HTMLButtonElement, key: string): void => {
      tab.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      fixture.detectChanges();
    };

    today.focus();
    // An arrow key selects AND focuses: this is the automatic-activation pattern, and with two
    // instant panels the alternative (move focus, await Enter) would make the reader press a key to
    // see the list they just asked for.
    press(today, "ArrowRight");
    expect(lastWeek.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(lastWeek);

    // …and it WRAPS, so neither end of the set is a dead stop.
    press(lastWeek, "ArrowRight");
    expect(today.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(today);
    press(today, "ArrowLeft");
    expect(lastWeek.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(lastWeek);

    press(lastWeek, "Home");
    expect(today.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(today);
    press(today, "End");
    expect(lastWeek.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(lastWeek);

    // The panels and the roving tabindex both follow the selection.
    expect(root.querySelector("#feed-panel-today")?.hasAttribute("hidden")).toBe(true);
    expect(root.querySelector('[data-testid="last-week-panel"]')?.hasAttribute("hidden")).toBe(
      false,
    );
    expect(today.getAttribute("tabindex")).toBe("-1");
    expect(lastWeek.getAttribute("tabindex")).toBe("0");
  });

  it("leaves an unhandled key on the tablist alone, so Tab can still leave the set", () => {
    const root = fixture.nativeElement as HTMLElement;
    const today = root.querySelector('[data-testid="feed-tab-today"]') as HTMLButtonElement;

    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    today.dispatchEvent(event);
    fixture.detectChanges();

    // preventDefault on a key the handler does not own would swallow Tab — the one key that must
    // still move focus OFF the tablist — so the selection is left untouched and unconsumed.
    expect(event.defaultPrevented).toBe(false);
    expect(today.getAttribute("aria-selected")).toBe("true");
    expect(root.querySelector("#feed-panel-today")?.hasAttribute("hidden")).toBe(false);
  });

  it("delegates the last-week Load More to the store", () => {
    const root = fixture.nativeElement as HTMLElement;
    store.lastWeekDayGroups.set([
      { key: "2026-09-30", label: "Yesterday", links: [makeFeedLink("w")] },
    ]);
    store.lastWeekPageInfo.set({ hasNextPage: true, endCursor: "cursor-w" });
    fixture.detectChanges();

    (root.querySelector('[data-testid="feed-tab-lastweek"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const button = root.querySelector('[data-testid="last-week-load-more"]') as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.click();

    expect(store.loadMoreLastWeek).toHaveBeenCalledTimes(1);
  });

  /* ---- conversation rendering (plan F5: the home feed collapses + renders app-link-thread) ---- */

  it("renders every feed row through the thread wrapper, not a bare card", () => {
    const root = fixture.nativeElement as HTMLElement;

    // The wrapper renders the root itself, so `app-link-card` still appears exactly twice — but
    // only INSIDE a wrapper, which is what keeps the "first link looks like any other link" rule
    // while giving a conversation somewhere to hang its indicator.
    expect(root.querySelectorAll("app-link-thread").length).toBe(2);
    expect(root.querySelectorAll("app-link-thread app-link-card").length).toBe(2);
    expect(root.querySelectorAll("app-link-card").length).toBe(2);
  });

  it("gives a collapsed root the 'N links' indicator and reveals its sublinks on expand", () => {
    store.feedLinks.set([makeTreeLink("a", ["s1", "s2"])]);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const thread = root.querySelector('[data-testid="link-thread"]') as HTMLElement;

    // Collapsed by default: the root alone, exactly as a single link renders. Two children means
    // a descendant count of 2, and the chip prints the CONVERSATION SIZE (count + 1) — "3 links".
    expect(thread.querySelectorAll("app-link-card").length).toBe(1);
    expect(thread.querySelector('[data-testid="link-thread-size"]')?.textContent?.trim()).toBe(
      "3 links",
    );
    expect(thread.querySelector('[data-testid="link-thread-members"]')).toBeNull();

    (thread.querySelector('[data-testid="link-thread-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(thread.querySelectorAll("app-link-card").length).toBe(3);
    const titles = Array.from(
      thread.querySelectorAll("app-link-card") as NodeListOf<HTMLElement>,
    ).map((card) => card.textContent ?? "");
    expect(titles[0]).toContain("Feed link a");
    expect(titles[1]).toContain("Feed link s1");
    expect(titles[2]).toContain("Feed link s2");
  });

  it("counts a nested conversation at every depth, and nests the revealed cards", () => {
    // root -> [c1, c2], c1 -> [c1-gc]. The gate is `sublinkCount > 0` and the label is
    // `sublinkCount + 1`, so the chip MUST read "4 links": the root holds THREE descendants (two
    // children plus one grandchild), not two. A "children + 1" count would render "3 links" here
    // and pass every two-level test in this file while being wrong.
    store.feedLinks.set([makeNestedTreeLink("a")]);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const thread = root.querySelector('[data-testid="link-thread"]') as HTMLElement;
    expect(thread.querySelector('[data-testid="link-thread-size"]')?.textContent?.trim()).toBe(
      "4 links",
    );
    // The grandchild sits two levels down, so it is not revealed by the root's own expand.
    expect(thread.querySelectorAll("app-link-card").length).toBe(1);

    (thread.querySelector('[data-testid="link-thread-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    // Root + 2 children. The child that is itself a conversation carries its OWN chip, labelled
    // from its own count (1 descendant + 1 = "2 links"), not the root's.
    const chips = Array.from(
      thread.querySelectorAll('[data-testid="link-thread-size"]') as NodeListOf<HTMLElement>,
    ).map((chip) => chip.textContent?.trim());
    expect(chips).toEqual(["4 links", "2 links"]);
    expect(thread.querySelectorAll("app-link-card").length).toBe(3);

    // Expanding the middle child reveals the grandchild, one nesting level deeper: the wrapper
    // recurses, and the deepest card has no chip of its own (a leaf's count is 0).
    const members = thread.querySelector('[data-testid="link-thread-members"]') as HTMLElement;
    const nestedToggles = members.querySelectorAll(
      '[data-testid="link-thread-toggle"]',
    ) as NodeListOf<HTMLButtonElement>;
    expect(nestedToggles.length).toBe(1);
    nestedToggles[0].click();
    fixture.detectChanges();

    expect(thread.querySelectorAll("app-link-card").length).toBe(4);
    // The grandchild sits INSIDE c1's own members container, and c2 stays a sibling of c1 — the
    // stronger statement than a document-order index, since it is the nesting that must hold.
    const c1Members = members.querySelector('[data-testid="link-thread-members"]') as HTMLElement;
    expect(c1Members.textContent).toContain("Feed link a-c1-gc");
    expect(c1Members.textContent).not.toContain("Feed link a-c2");

    // The deepest card is a leaf, so it carries no chip of its own: `sublinkCount` is 0 for a node
    // with nothing under it, and the gate is `> 0`. Reached through c1's container rather than by
    // index into the whole subtree, which would be sensitive to document order.
    const leafThread = c1Members.querySelectorAll('[data-testid="link-thread"]')[0] as HTMLElement;
    expect(leafThread.textContent).toContain("Feed link a-c1-gc");
    expect(leafThread.querySelector('[data-testid="link-thread-size"]')).toBeNull();
    expect(leafThread.querySelector('[data-testid="link-thread-toggle"]')).toBeNull();
  });

  it("renders a plain ungrouped link as ONE card and no indicator", () => {
    // `isThreadRoot` is true for an ungrouped link (parentId == null IS the definition of a root),
    // so a wrapper gated on it would sprout a "1 links" badge on every row in the feed. The gate is
    // `sublinkCount > 0`, and this fixture's count is 0.
    const root = fixture.nativeElement as HTMLElement;
    const thread = root.querySelector('[data-testid="link-thread"]') as HTMLElement;

    expect(root.querySelectorAll("app-link-thread").length).toBe(2);
    expect(thread.querySelectorAll("app-link-card").length).toBe(1);
    expect(thread.querySelector('[data-testid="link-thread-size"]')).toBeNull();
    expect(thread.querySelector('[data-testid="link-thread-toggle"]')).toBeNull();
  });

  it("hands the wrapper the store's whole vote map, not a per-row number", () => {
    store.userVotes.set({ a: -1, s1: 1 });
    fixture.detectChanges();

    const threads = fixture.debugElement.queryAll(By.directive(LinkThreadComponent));

    // One map for every row: the overlay stays in the store, and the wrapper forwards it to each
    // card (root and sublinks) by id, which is the only way a sublink can render the caller's vote.
    expect(threads).toHaveLength(2);
    for (const thread of threads) {
      expect(thread.componentInstance.voteValues()).toEqual({ a: -1, s1: 1 });
    }
    // The root's scalar input stays wired for the no-overlay case (anonymous feed value).
    expect(threads[0].componentInstance.userVote()).toBe(1);
  });

  it("records a sublink's vote through the store under the SUBLINK's id", () => {
    store.feedLinks.set([makeTreeLink("a", ["s1"])]);
    fixture.detectChanges();

    const thread = fixture.nativeElement.querySelector(
      '[data-testid="link-thread"]',
    ) as HTMLElement;
    (thread.querySelector('[data-testid="link-thread-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    // The wrapper re-emits with the VOTED card's id, so the optimistic overlay is filed against the
    // sublink — hard-coding the root's id (all the old flat loop knew) would attribute it to `a`.
    const wrapper = fixture.debugElement.queryAll(By.directive(LinkThreadComponent))[0];
    wrapper.componentInstance.voteChanged.emit({ id: "s1", value: 1 });
    wrapper.componentInstance.voteChanged.emit({ id: "a", value: -1 });

    expect(store.setUserVote).toHaveBeenNthCalledWith(1, "s1", 1);
    expect(store.setUserVote).toHaveBeenNthCalledWith(2, "a", -1);
  });

  it("opens the edit sheet from a conversation's edit pencil", () => {
    auth.isLoggedIn.set(true);
    auth.user.set({ uid: "abc12345zzz" });
    store.feedLinks.set([makeTreeLink("a", ["s1"])]);
    fixture.detectChanges();

    const thread = fixture.nativeElement.querySelector(
      '[data-testid="link-thread"]',
    ) as HTMLElement;
    (thread.querySelector('[data-testid="link-edit"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const linkSheet = TestBed.inject(LinkSheetService);
    expect(linkSheet.isOpen()).toBe(true);
    expect(linkSheet.editTarget()?.id).toBe("a");
  });

  it("hands the edit sheet a CONVERSATION MEMBER's own tags, not the root's", () => {
    // The wave made every descendant editable from the front page, and a sublink is the row
    // MOST likely to carry a vehicle/station tag — so this is the row whose tags a replace-
    // not-patch save would blank. The root deliberately carries none, so a target that
    // resolved to the root cannot pass by accident.
    auth.isLoggedIn.set(true);
    auth.user.set({ uid: "abc12345zzz" });
    const taggedSublink: FeedLinkSublink = {
      ...makeSublink("a-s1", "a"),
      vehicles: [{ id: "V1", identificationNo: "TR-1" }],
      stations: [{ id: "S1", displayName: "KL Sentral" }],
      categories: [{ id: "C9", name: "Signal" }],
    };
    store.feedLinks.set([{ ...makeFeedLink("a"), sublinkCount: 1, sublinks: [taggedSublink] }]);
    fixture.detectChanges();

    const thread = fixture.nativeElement.querySelector(
      '[data-testid="link-thread"]',
    ) as HTMLElement;
    (thread.querySelector('[data-testid="link-thread-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    // Root's pencil first, then the revealed member's.
    const pencils = thread.querySelectorAll(
      '[data-testid="link-edit"]',
    ) as NodeListOf<HTMLButtonElement>;
    expect(pencils.length).toBe(2);
    pencils[1].click();
    fixture.detectChanges();

    const linkSheet = TestBed.inject(LinkSheetService);
    const target = linkSheet.editTarget();
    expect(target?.id).toBe("a-s1");
    // Asserted as ids, which is all the form hydrates (`target.vehicles.map(v => v.id)`) — and
    // all the update payload sends. Before `FEED_QUERY` selected these relations, the server
    // sent none of them and this target carried nothing, so the save below would have posted
    // empty lists and deleted the tags.
    expect(target?.vehicles?.map((vehicle) => vehicle.id)).toEqual(["V1"]);
    expect(target?.stations?.map((station) => station.id)).toEqual(["S1"]);
    expect(target?.categories?.map((category) => category.id)).toEqual(["C9"]);
  });

  /* ---- the rider / Pro branch ------------------------------------------------------- */

  it("renders the rider panels by default and no Pro dashboard", () => {
    const root = fixture.nativeElement as HTMLElement;

    // `?view=` absent: the default is the rider layout, so an ordinary page load carries no parameter.
    expect(root.querySelector('[data-testid="home-panels"]')).not.toBeNull();
    expect(root.querySelector("app-pro-dashboard")).toBeNull();
  });

  it("swaps to the Pro dashboard for ?view=pro, dropping the rider panels entirely", async () => {
    await TestBed.inject(Router).navigateByUrl("/?view=pro");
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector("app-pro-dashboard")).not.toBeNull();
    // Not "both": two layouts at once would double every read the page makes.
    expect(root.querySelector('[data-testid="home-panels"]')).toBeNull();
  });

  it("keeps the hero, the sheets and the mobile bar OUTSIDE the branch — one submission path", async () => {
    const riderRoot = fixture.nativeElement as HTMLElement;
    expect(riderRoot.querySelector("app-home-hero")).not.toBeNull();
    expect(riderRoot.querySelector("app-report-chooser")).not.toBeNull();
    expect(riderRoot.querySelector('[data-testid="home-mobile-bar"]')).not.toBeNull();

    await TestBed.inject(Router).navigateByUrl("/?view=pro");
    fixture.detectChanges();

    const proRoot = fixture.nativeElement as HTMLElement;
    // A "mode" that quietly grew its own report / link / spotting path is the one thing this branch
    // must not do: both views submit through the same chooser, sheet and store.
    expect(proRoot.querySelector("app-home-hero")).not.toBeNull();
    expect(proRoot.querySelector("app-report-chooser")).not.toBeNull();
    expect(proRoot.querySelector('[data-testid="home-mobile-bar"]')).not.toBeNull();
    expect(proRoot.querySelector("app-line-status-sheet")).not.toBeNull();
    expect(proRoot.querySelector('[data-testid="spotting-entry-sheet"]')).not.toBeNull();
  });

  /* ---- Phase 5B: heading structure, the skip link and focus order ------------------------- */

  it("gives the page ONE h1 — the hero headline — and puts it above the board", () => {
    const root = fixture.nativeElement as HTMLElement;
    const headings = root.querySelectorAll("h1");

    // 🔴 Exactly one. Two h1s split the page's top-level identity in half; zero leaves the page
    // with no name at all in a screen reader's heading list. And it is the HERO's, not the board's:
    // the hero describes the whole page (both columns), so its headline is the page's.
    expect(headings.length).toBe(1);
    const h1 = headings[0] as HTMLElement;
    expect(root.querySelector("app-home-hero")?.contains(h1)).toBe(true);
    expect(h1.textContent?.replace(/\s+/g, " ").trim()).not.toBe("");
    // It precedes the board, so "skip past the headings" cannot skip past the page's name.
    expect(
      h1.compareDocumentPosition(root.querySelector("#line-board")!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps a real heading level under the h1: the feed column is an h2, its days are h3", () => {
    const root = fixture.nativeElement as HTMLElement;
    const feedSection = root.querySelector<HTMLElement>('section[aria-label="Community feed"]');
    const heading = feedSection?.querySelector("h2") as HTMLElement;

    // The landmark label is not enough on its own: `aria-label` only appears in the landmark list,
    // so a heading list could not say "community feed" without it.
    expect(heading.textContent?.trim()).toBe("Community feed");
    // Visually hidden, not visually absent — the tablist already names the column on screen.
    expect(heading.className.split(/\s+/)).toContain("sr-only");
    // …and it is the column's FIRST child, so the document order a screen reader walks starts here.
    expect(feedSection?.firstElementChild).toBe(heading);

    // A day is a SUBSECTION of the feed, not a peer of it: the day label steps down to h3 rather
    // than sitting at the same level as the column heading above it.
    store.lastWeekDayGroups.set([
      { key: "2026-09-30", label: "Yesterday", links: [makeFeedLink("w")] },
    ]);
    fixture.detectChanges();

    const group = root.querySelector<HTMLElement>('[data-testid="last-week-day-group"]');
    expect(group?.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim()).toBe("Yesterday");
    expect(group?.querySelector("h2")).toBeNull();
  });

  it("puts a hidden-until-focused skip link first inside main, aimed at the board", () => {
    const main = (fixture.nativeElement as HTMLElement).querySelector("main") as HTMLElement;
    const link = main.querySelector<HTMLAnchorElement>('[data-testid="home-skip-link"]');

    // FIRST, not last: the whole point is that it is the first Tab stop on the page.
    expect(main.firstElementChild).toBe(link);
    expect(link?.tagName).toBe("A");
    expect(link?.textContent?.replace(/\s+/g, " ").trim()).toBe("Skip to line status");
    // A real fragment link (a handler-only skip would be invisible to a middle-click or to a
    // reader scanning the link list), pointing at the panel that OWNS the board.
    expect(link?.getAttribute("href")).toBe("#line-board");
    expect(main.querySelector(link?.getAttribute("href") ?? "#nope")).not.toBeNull();

    // sr-only until focused, then a real button: `focus:fixed` so revealing it does not push the
    // hero down the page it is meant to let you skip past.
    const classes = link?.className.split(/\s+/) ?? [];
    expect(classes).toContain("sr-only");
    expect(classes).toContain("focus:not-sr-only");
    expect(classes).toContain("focus:fixed");
  });

  it("makes the rider layout's #line-board a real focus target, not just an anchor", () => {
    const board = (fixture.nativeElement as HTMLElement).querySelector(
      "#line-board",
    ) as HTMLElement;

    expect(board.getAttribute("data-testid")).toBe("line-board");
    // 🔴 tabindex="-1" is what makes the skip work: an anchor to an element without it scrolls the
    // page but leaves the caret at the top, so the reader lands on the board visually and nowhere
    // else — the classic half-working skip link.
    expect(board.getAttribute("tabindex")).toBe("-1");
    // Exactly one element answers to the id in this layout, so the fragment is unambiguous.
    expect((fixture.nativeElement as HTMLElement).querySelectorAll("#line-board").length).toBe(1);
  });

  it("carries the same #line-board target on the Pro dashboard, so both layouts resolve the skip", async () => {
    await TestBed.inject(Router).navigateByUrl("/?view=pro");
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const targets = root.querySelectorAll("#line-board");

    // The two branches are mutually exclusive, so the id is on exactly one element in either
    // layout — never duplicated, which would make the fragment resolve to the first and silently
    // skip the Pro grid.
    expect(targets.length).toBe(1);
    expect(targets[0]?.tagName.toLowerCase()).toBe("app-pro-dashboard");
    expect(targets[0]?.getAttribute("tabindex")).toBe("-1");
  });

  it("draws a focus ring on both feed tabs, which nothing else does for them", () => {
    const root = fixture.nativeElement as HTMLElement;
    const tabs = ["feed-tab-today", "feed-tab-lastweek"].map(
      (id) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`) as HTMLElement,
    );

    for (const tab of tabs) {
      const classes = tab.className.split(/\s+/);
      // outline-none alone would leave the focused tab with NO visible focus indication at all —
      // these are plain buttons under a border, not hlmBtn, so nothing supplies a ring.
      expect(classes).toContain("outline-none");
      expect(classes).toContain("focus-visible:ring-2");
      expect(classes).toContain("focus-visible:ring-ring/50");
    }
  });

  it("renders the last-week day groups through the thread wrapper too", () => {
    const root = fixture.nativeElement as HTMLElement;
    store.lastWeekDayGroups.set([
      { key: "2026-09-30", label: "Yesterday", links: [makeTreeLink("w", ["ws1"])] },
    ]);
    fixture.detectChanges();

    (root.querySelector('[data-testid="feed-tab-lastweek"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const panel = root.querySelector('[data-testid="last-week-panel"]') as HTMLElement;
    expect(panel.querySelectorAll("app-link-thread").length).toBe(1);
    expect(panel.querySelector('[data-testid="link-thread-size"]')?.textContent?.trim()).toBe(
      "2 links",
    );
  });
});
