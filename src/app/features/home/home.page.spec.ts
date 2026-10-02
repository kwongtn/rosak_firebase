import {
  CUSTOM_ELEMENTS_SCHEMA,
  provideZonelessChangeDetection,
  signal,
  type WritableSignal,
} from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By, Meta } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
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
import type { FeedLink, FeedLinkPageInfo, FeedLinkSublink, LinePulse } from "./data/home.queries";
import type { FeedDayGroup } from "./data/feed-day-groups.util";
import { HomeStore } from "./data/home.store";
import { LineStatusSheetService } from "./data/line-status-sheet.service";
import { LinkSubmitBoxComponent } from "./feed/link-submit-box.component";
import { HomeHeroComponent } from "./hero/home-hero.component";
import { HomePage } from "./home.page";
import { LinePulseListComponent } from "./line-pulse/line-pulse-list.component";
import { LineStatusSheetComponent } from "./line-status/line-status-sheet.component";

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
    vehicleStatusCounts: [],
    passengerStatusCount: 0,
    statusWindowMinutes: 60,
    pulseLinks: [],
  };
}

interface StoreMock {
  lines: WritableSignal<LinePulse[]>;
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
    store = {
      lines: signal<LinePulse[]>([makeLine("a")]),
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
        provideRouter([]),
        { provide: HomeStore, useValue: store },
        { provide: LineStatusSheetService, useValue: sheet },
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
        remove: { imports: [AppNavComponent, AppFooterComponent] },
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

  it("renders the submit box, then the feed cards, then the line list", () => {
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector("app-link-submit-box")).not.toBeNull();
    expect(root.querySelectorAll("app-link-card").length).toBe(2);
    expect(root.textContent).toContain("Feed link a");
    expect(root.querySelector("app-line-pulse-list")).not.toBeNull();
    expect(root.querySelectorAll("app-line-pulse-card").length).toBe(1);
    expect(root.textContent).toContain("Line a");

    // The composition order the page exists to enforce: submit box → global feed → line list.
    // The box lives inside the feed section (top of the left column) and still precedes the cards.
    const feedSection = root.querySelector('section[aria-label="Community feed"]');
    expect(feedSection?.querySelector("app-link-submit-box")).not.toBeNull();
    const html = root.innerHTML;
    expect(html.indexOf("app-link-submit-box")).toBeLessThan(html.indexOf("app-link-card"));
    expect(html.indexOf("app-link-card")).toBeLessThan(html.indexOf("app-line-pulse-list"));
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

  it("renders every loaded feed link, not a sliced subset", () => {
    store.feedLinks.set(Array.from({ length: 10 }, (_, index) => makeFeedLink(`x${index}`)));
    store.feedTotalCount.set(10);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll("app-link-card").length).toBe(10);
  });

  it("splits the feed and the line statuses into two columns from lg, feed first", () => {
    const root = fixture.nativeElement as HTMLElement;
    const panels = root.querySelector<HTMLElement>('[data-testid="home-panels"]');

    expect(panels).not.toBeNull();
    expect(panels?.className).toContain("flex-col");
    expect(panels?.className).toContain("lg:grid");
    expect(panels?.className).toContain("lg:grid-cols-2");
    expect(panels?.className).toContain("lg:items-start");

    const children = Array.from(panels?.children ?? []);
    expect(children[0]?.getAttribute("aria-label")).toBe("Community feed");
    expect(children[0]?.querySelector("app-link-card")).not.toBeNull();
    expect(children[1]?.getAttribute("aria-label")).toBe("Line status");
    expect(children[1]?.querySelector("app-line-pulse-list")).not.toBeNull();

    // Mobile divider: stacked below lg the line panel follows the feed, so it draws its own rule
    // and the matching top padding. From lg the two are grid COLUMNS side by side, so the rule and
    // the padding are both dropped — a border there would draw a line down the middle of the gap.
    // Pinned as discrete class tokens (not `toContain`, which would let `border-t` match inside
    // `lg:border-t-0`), since jsdom cannot measure layout.
    const lineSectionClasses = (children[1]?.className ?? "").split(/\s+/);
    expect(lineSectionClasses).toContain("border-border");
    expect(lineSectionClasses).toContain("border-t");
    expect(lineSectionClasses).toContain("pt-6");
    expect(lineSectionClasses).toContain("lg:border-t-0");
    expect(lineSectionClasses).toContain("lg:pt-0");
    // The feed section above it must not claim a rule of its own — the line panel draws the seam.
    expect((children[0]?.className ?? "").split(/\s+/)).not.toContain("border-t");

    // The left column owns the submit box, ahead of the feed it feeds.
    const feedSection = children[0];
    expect(feedSection?.querySelector("app-link-submit-box")).not.toBeNull();
    const feedHtml = feedSection?.innerHTML ?? "";
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

  it("sends the hero's report-delay output to the line board rather than to a sheet", () => {
    const board = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="line-board"]',
    ) as HTMLElement;
    expect(board).not.toBeNull();
    // `scroll-mt-24` keeps the sticky nav from covering the first card once the scroll lands.
    expect(board.className.split(/\s+/)).toContain("scroll-mt-24");

    const scrollIntoView = vi.fn();
    // jsdom ships no layout, so `scrollIntoView` does not exist on the element at all.
    board.scrollIntoView = scrollIntoView;

    fixture.debugElement
      .query(By.directive(HomeHeroComponent))
      .componentInstance.reportDelay.emit();
    fixture.detectChanges();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.calls[0][0]).toMatchObject({ block: "start" });
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

  it("mounts one refresh control atop each section, gated by breakpoint classes", () => {
    const root = fixture.nativeElement as HTMLElement;
    const feedSection = root.querySelector<HTMLElement>('section[aria-label="Community feed"]');
    const lineSection = root.querySelector<HTMLElement>('section[aria-label="Line status"]');

    // The beat refreshes BOTH sections, so the control heads the links section on mobile and the
    // line panel on desktop — one component, two instances, CSS-only visibility (no matchMedia
    // placement signal, which would desync SSR from hydration).
    const controls = root.querySelectorAll("app-home-refresh-control");
    expect(controls.length).toBe(2);

    const mobileWrapper = feedSection?.querySelector<HTMLElement>('[class~="lg:hidden"]');
    expect(mobileWrapper).not.toBeNull();
    expect(mobileWrapper?.querySelector("app-home-refresh-control")).not.toBeNull();
    expect(feedSection?.firstElementChild).toBe(mobileWrapper);
    // …ahead of the submit box it sits above.
    const feedHtml = feedSection?.innerHTML ?? "";
    expect(feedHtml.indexOf("app-home-refresh-control")).toBeLessThan(
      feedHtml.indexOf("app-link-submit-box"),
    );

    const desktopWrapper = lineSection?.querySelector<HTMLElement>('[class~="lg:flex"]');
    expect(desktopWrapper).not.toBeNull();
    expect(desktopWrapper?.className).toContain("hidden");
    expect(desktopWrapper?.querySelector("app-home-refresh-control")).not.toBeNull();
    expect(lineSection?.firstElementChild).toBe(desktopWrapper);
    expect(lineSection?.querySelector("app-line-pulse-list")).not.toBeNull();

    // Right-alignment contract: each gate must be a justified flex row. The control shrink-wraps to
    // its own visible content (`:host` is `inline-block`, and the button carries no `w-full`), and a
    // flex item's width is its content's — so `justify-end` in the gate is now the ONLY thing parking
    // it at the right edge, and a plain block wrapper would leave the row flush left. That is why
    // the gate stayed a flex row instead of being simplified away. jsdom cannot measure layout, so
    // pin the classes that produce the alignment instead.
    expect(mobileWrapper?.className).toContain("flex");
    expect(mobileWrapper?.className).toContain("justify-end");
    expect(desktopWrapper?.className).toContain("flex");
    expect(desktopWrapper?.className).toContain("justify-end");

    // Both instances render the same countdown row, and either one drives the store's beat.
    const countdowns = root.querySelectorAll('[data-testid="line-refresh-countdown"]');
    expect(countdowns.length).toBe(2);
    for (const countdown of Array.from(countdowns)) {
      expect((countdown.textContent ?? "").replace(/\s+/g, " ")).toContain("Refreshing in 30s");
    }
    (countdowns[0] as HTMLElement).click();
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

  it("hands the store's lines and refresh tick to the line list", () => {
    store.linesRefreshTick.set(4);
    fixture.detectChanges();

    const list = fixture.debugElement.query(By.directive(LinePulseListComponent));

    expect(list.componentInstance.lines().map((line: LinePulse) => line.id)).toEqual(["a"]);
    expect(list.componentInstance.isLoading()).toBe(false);
    expect(list.componentInstance.refreshTick()).toBe(4);
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

  it("renders the Last Week section collapsed by default", () => {
    const root = fixture.nativeElement as HTMLElement;
    const toggle = root.querySelector('[data-testid="last-week-toggle"]') as HTMLButtonElement;

    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelector('[data-testid="last-week-panel"]')).toBeNull();
  });

  it("shows the last-week count in the collapsed header", () => {
    store.lastWeekTotalCount.set(5);
    fixture.detectChanges();

    const count = fixture.nativeElement.querySelector(
      '[data-testid="last-week-count"]',
    ) as HTMLElement;
    expect(count.textContent?.replace(/\s+/g, " ").trim()).toBe("Last Week (5)");
  });

  it("expands the last-week panel with day groups on toggle", () => {
    const root = fixture.nativeElement as HTMLElement;
    store.lastWeekDayGroups.set([
      { key: "2026-09-30", label: "Today", links: [makeFeedLink("w")] },
    ]);
    fixture.detectChanges();

    const toggle = root.querySelector('[data-testid="last-week-toggle"]') as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const panel = root.querySelector('[data-testid="last-week-panel"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.querySelectorAll('[data-testid="last-week-day-group"]').length).toBe(1);
    expect(panel.textContent).toContain("Today");
    expect(panel.querySelectorAll("app-link-card").length).toBe(1);
  });

  it("delegates the last-week Load More to the store", () => {
    const root = fixture.nativeElement as HTMLElement;
    store.lastWeekDayGroups.set([
      { key: "2026-09-30", label: "Today", links: [makeFeedLink("w")] },
    ]);
    store.lastWeekPageInfo.set({ hasNextPage: true, endCursor: "cursor-w" });
    fixture.detectChanges();

    (root.querySelector('[data-testid="last-week-toggle"]') as HTMLButtonElement).click();
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

  it("renders the last-week day groups through the thread wrapper too", () => {
    const root = fixture.nativeElement as HTMLElement;
    store.lastWeekDayGroups.set([
      { key: "2026-09-30", label: "Today", links: [makeTreeLink("w", ["ws1"])] },
    ]);
    fixture.detectChanges();

    (root.querySelector('[data-testid="last-week-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const panel = root.querySelector('[data-testid="last-week-panel"]') as HTMLElement;
    expect(panel.querySelectorAll("app-link-thread").length).toBe(1);
    expect(panel.querySelector('[data-testid="link-thread-size"]')?.textContent?.trim()).toBe(
      "2 links",
    );
  });
});
