import { provideZonelessChangeDetection, signal } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import {
  FeedLink,
  FeedLinkSublink,
  FeedQueryData,
  FrontPageLinesQueryData,
  LinePulse,
} from "./home.queries";
import { PreferencesService } from "../../../core/preferences/preferences.service";
import { FEED_PAGE_SIZE, HomeStore, LAST_WEEK_PAGE_SIZE } from "./home.store";

/** The preferences service's own storage key, restated so a rename breaks this spec loudly rather
 * than silently seeding a payload nothing reads. */
const STORAGE_KEY = "rosak:preferences:v1";

function makeLine(id: string): FrontPageLinesQueryData["lines"][number] {
  return {
    id,
    code: id.toUpperCase(),
    displayName: `Line ${id}`,
    displayColor: "#ff0000",
    status: "ACTIVE",
    inServiceVehicleCount: 3,
    totalVehicleCount: 5,
    passengerStatus: "NORMAL",
    passengerStatusMessage: null,
    statusReportCount: 1,
    vehicleStatusCounts: [],
    passengerStatusCount: 0,
    statusWindowMinutes: 60,
    pulseLinks: [],
  };
}

function makeFeedLink(id: string, userVote = 0): FeedLink {
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
    voteScore: 2,
    userVote,
    voteBreakdown: { upvotes: 2, downvotes: 0 },
    lines: [],
    user: { shortId: "abc123", nickname: "Tester" },
    // The three EDIT ROUND-TRIP relations `FEED_QUERY` selects at every level. The overlay walk
    // ignores them; they are here so a fixture stays a row the backend can actually return.
    vehicles: [],
    stations: [],
    categories: [],
  };
}

/**
 * One node of `FEED_QUERY`'s nested `sublinks` selection: the root's selection minus
 * `normalizedUrl` (which the document deliberately does not request at any level below the root),
 * plus that node's OWN tree scalars and its own children — because a level-1 sublink is itself the
 * head of a nested conversation.
 *
 * Typed as the shallowest level on purpose. The four levels are four distinct types that differ
 * only in how deep their `sublinks` go, and a fixture that grows its tree uniformly (or stops one
 * level early) is exactly the shape the overlay walk has to survive, so there is nothing to gain
 * from making the helper level-accurate and a cast to maintain.
 */
function makeSublink(
  id: string,
  userVote = 0,
  sublinks: FeedLinkSublink[] = [],
  parentId: string | null = null,
): FeedLinkSublink {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Link ${id}`,
    created: "2026-08-01T08:00:00",
    occurredAt: "2026-08-01T08:00:00",
    parentId,
    isThreadRoot: parentId === null,
    // This node's OWN descendant count, never the conversation's — the root of a 3-node tree
    // reports 2 and each of its children reports its own, which is what the badge reads.
    sublinkCount: sublinks.length,
    sublinks,
    status: "LIVE",
    completed: false,
    isAutomated: false,
    voteScore: 2,
    userVote,
    voteBreakdown: { upvotes: 2, downvotes: 0 },
    lines: [],
    user: { shortId: "abc123", nickname: "Tester" },
    // Same three relations as the root above — the document selects them at every level because
    // a sublink is editable from the feed too, and its tags must survive that round trip.
    vehicles: [],
    stations: [],
    categories: [],
  };
}

function feedData(
  nodes: FeedLink[],
  hasNextPage: boolean,
  endCursor: string | null,
): FeedQueryData {
  return {
    publicSocialMediaLinks: {
      edges: nodes.map((node, index) => ({ node, cursor: endCursor ?? `cursor-${index}` })),
      pageInfo: { hasNextPage, endCursor },
      totalCount: nodes.length,
    },
  };
}

describe("HomeStore", () => {
  let httpMock: HttpTestingController;
  let requestMock: ReturnType<typeof vi.fn>;
  let isLoggedIn: ReturnType<typeof signal<boolean>>;

  function createStore(): HomeStore {
    const store = TestBed.inject(HomeStore);
    TestBed.tick();
    return store;
  }

  function linesRequest() {
    return httpMock.expectOne(
      (r) => r.method === "POST" && r.body.query.includes("FrontPageLines"),
    );
  }

  function feedRequest() {
    return httpMock.expectOne(
      (r) =>
        r.method === "POST" &&
        r.body.query.includes("query Feed") &&
        r.body.variables?.lastWeekOnly !== true,
    );
  }

  function lastWeekRequest() {
    return httpMock.expectOne(
      (r) =>
        r.method === "POST" &&
        r.body.query.includes("query Feed") &&
        r.body.variables?.lastWeekOnly === true,
    );
  }

  function flushInitial(
    lines: FrontPageLinesQueryData["lines"],
    feed: FeedQueryData,
    lastWeek: FeedQueryData = feedData([], false, null),
  ): void {
    linesRequest().flush({ data: { lines } });
    feedRequest().flush({ data: feed });
    lastWeekRequest().flush({ data: lastWeek });
  }

  beforeEach(() => {
    requestMock = vi
      .fn()
      .mockResolvedValue({ publicSocialMediaLinks: { edges: [], pageInfo: {} } });
    isLoggedIn = signal(false);

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClientTesting(),
        HomeStore,
        {
          provide: AuthService,
          useValue: {
            isLoggedIn,
            isAdmin: () => false,
            idToken: async () => "token",
            whenReady: Promise.resolve(),
          },
        },
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("projects lines and feedLinks from the flushed resources", async () => {
    const store = createStore();

    const linesReq = linesRequest();
    expect(linesReq.request.body.query).toContain("query FrontPageLines");
    linesReq.flush({ data: { lines: [makeLine("a"), makeLine("b")] } });

    const feedReq = feedRequest();
    expect(feedReq.request.body.variables).toEqual({
      first: FEED_PAGE_SIZE,
      status: "LIVE",
      currentServiceDayOnly: true,
      collapseThreads: true,
    });
    feedReq.flush({ data: feedData([makeFeedLink("x"), makeFeedLink("y")], false, null) });

    const lastWeekReq = lastWeekRequest();
    expect(lastWeekReq.request.body.variables).toEqual({
      first: LAST_WEEK_PAGE_SIZE,
      status: "LIVE",
      lastWeekOnly: true,
      alignPageToDay: true,
      collapseThreads: true,
    });
    lastWeekReq.flush({ data: feedData([], false, null) });

    await Promise.resolve();

    expect(store.lines().map((l) => l.id)).toEqual(["a", "b"]);
    expect(store.feedLinks().map((l) => l.id)).toEqual(["x", "y"]);
    expect(store.feedPageInfo()?.hasNextPage).toBe(false);
    expect(store.feedTotalCount()).toBe(2);
  });

  it("asks BOTH feed resources to collapse threads, not just the today feed", async () => {
    // The requirement, not a nicety: `publicSocialMediaLinks` orders by `occurredAt DESC, id DESC`,
    // so a thread's members are not adjacent — client-side grouping of a flat page cannot work
    // (a sublink's root may be on another page entirely). Only a collapsed read nests the subtree
    // under `sublinks`, and only then does `totalCount` count what the page renders.
    const store = createStore();

    // `expectOne` DEQUEUES, so both reads are captured before either is flushed.
    const feedReq = feedRequest();
    const lastWeekReq = lastWeekRequest();
    expect(feedReq.request.body.variables.collapseThreads).toBe(true);
    expect(lastWeekReq.request.body.variables.collapseThreads).toBe(true);

    linesRequest().flush({ data: { lines: [] } });
    feedReq.flush({ data: feedData([], false, null) });
    lastWeekReq.flush({ data: feedData([], false, null) });
    await Promise.resolve();

    expect(store.feedLinks()).toEqual([]);
    expect(store.lastWeekLinks()).toEqual([]);
  });

  it("keeps collapseThreads on both continuation pages so page 2 matches page 1", async () => {
    const store = createStore();
    flushInitial(
      [],
      feedData([makeFeedLink("x")], true, "cursor-x"),
      feedData([makeFeedLink("w1")], true, "cursor-w"),
    );
    await Promise.resolve();

    requestMock.mockResolvedValueOnce(feedData([makeFeedLink("y")], false, "cursor-y"));
    requestMock.mockResolvedValueOnce(feedData([makeFeedLink("w2")], false, "cursor-w2"));
    await store.loadMore();
    await store.loadMoreLastWeek();

    // An uncollapsed continuation appended to a collapsed first page would re-list every root and
    // render members as loose rows — so the flag is not optional here either.
    expect(requestMock).toHaveBeenNthCalledWith(1, expect.stringContaining("query Feed"), {
      first: FEED_PAGE_SIZE,
      after: "cursor-x",
      status: "LIVE",
      currentServiceDayOnly: true,
      collapseThreads: true,
    });
    expect(requestMock).toHaveBeenNthCalledWith(2, expect.stringContaining("query Feed"), {
      first: LAST_WEEK_PAGE_SIZE,
      after: "cursor-w",
      status: "LIVE",
      lastWeekOnly: true,
      alignPageToDay: true,
      collapseThreads: true,
    });
  });

  it("renders a collapsed root with its subtree nested and counts the root once", async () => {
    const store = createStore();
    const child = makeSublink("x2", 0, [], "x");
    const root = {
      ...makeFeedLink("x"),
      sublinkCount: 1,
      sublinks: [child],
    } as FeedLink;
    // The backend's count while collapsing is the number of ROOTS, which is what the page's
    // "Showing N of M" reports — so a 2-link conversation contributes 1, not 2.
    flushInitial([], feedData([root], false, null));
    await Promise.resolve();

    expect(store.feedLinks()).toHaveLength(1);
    expect(store.feedLinks()[0].sublinks.map((l) => l.id)).toEqual(["x2"]);
    // `sublinkCount` is the root's OWN descendant count (1 child), not a conversation size of 2 —
    // the count is what the "N links" chip derives from, via `threadLabel(sublinkCount + 1)`.
    expect(store.feedLinks()[0].sublinkCount).toBe(1);
    expect(store.feedTotalCount()).toBe(1);
  });

  it("exposes the vote overlay as a per-id map for the thread wrapper", async () => {
    isLoggedIn.set(true);
    // A collapsed render still has to vote on a MEMBER, whose id only exists nested. The overlay
    // read is collapsed for the same reason the page is, and the loop walks the nesting — this
    // pins that the resulting map is keyed per id (root and member alike) and is exactly what the
    // page binds.
    // A nested child is the root's selection minus `normalizedUrl` (see `FeedLinkSublink`), and it
    // carries its OWN tree scalars, so the fixture builds it through `makeSublink`.
    requestMock.mockResolvedValueOnce(
      feedData(
        [
          {
            ...makeFeedLink("x", 1),
            sublinkCount: 1,
            sublinks: [makeSublink("x2", -1, [], "x")],
          } as FeedLink,
        ],
        false,
        null,
      ),
    );
    requestMock.mockResolvedValueOnce(feedData([], false, null));
    const store = createStore();
    flushInitial([], feedData([makeFeedLink("x", 0)], false, null));
    await vi.waitFor(() => expect(store.userVotes()).toEqual({ x: 1, x2: -1 }));

    // A child is NOT in `feedLinks` (it is nested under the root), so the map is the only channel
    // that can carry its vote — and `userVoteFor` reaches it through the overlay, not the feed.
    expect(store.userVotes()["x2"]).toBe(-1);
    expect(store.userVoteFor("x2")).toBe(-1);
    expect(store.feedLinks().map((l) => l.id)).toEqual(["x"]);
    // The overlay reads MUST collapse, exactly like the two resources: an uncollapsed read is the
    // `first` newest FLAT rows, which is a different id set from the rendered one and drops the
    // sublinks of every conversation that does not fit in the window.
    expect(requestMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ collapseThreads: true }),
      expect.anything(),
    );

    store.setUserVote("x2", 1);
    expect(store.userVotes()).toEqual({ x: 1, x2: 1 });
    expect(store.userVoteFor("x")).toBe(1);
  });

  it("records the votes of NESTED children the flat window would have dropped", async () => {
    // The regression this pins: the rendered feed is 2 roots carrying 2 children each (3 votable
    // ids per root, 6 in total), while the uncollapsed top-8 would return `r1,c1,r2,c2,r3,c3,...`
    // — several of those ids are children of a LATER root and simply are not in it. The thread
    // wrapper's `voteFor` falls back to `link.userVote ?? 0` for a missing id, so those children
    // would render as the ANONYMOUS zero on an expanded conversation: a rider's upvote, silently
    // un-pressed, with no error anywhere.
    isLoggedIn.set(true);
    requestMock.mockResolvedValueOnce(
      feedData(
        [
          {
            ...makeFeedLink("r1", 1),
            sublinkCount: 2,
            sublinks: [makeSublink("c1", 1, [], "r1"), makeSublink("c2", -1, [], "r1")],
          } as FeedLink,
          {
            ...makeFeedLink("r2", 1),
            sublinkCount: 2,
            sublinks: [makeSublink("c3", 1, [], "r2"), makeSublink("c4", 1, [], "r2")],
          } as FeedLink,
        ],
        false,
        null,
      ),
    );
    requestMock.mockResolvedValueOnce(feedData([], false, null));
    const store = createStore();
    flushInitial([], feedData([], false, null));

    // Every id the page can actually draw — both roots and all four children.
    await vi.waitFor(() =>
      expect(Object.keys(store.userVotes()).sort()).toEqual(["c1", "c2", "c3", "c4", "r1", "r2"]),
    );
    expect(store.userVoteFor("c4")).toBe(1);
    // An id the caller has no opinion on stays ABSENT rather than being recorded as 0, so the map
    // can never shadow a real value the anonymous read might one day supply.
    expect(Object.prototype.hasOwnProperty.call(store.userVotes(), "c5")).toBe(false);
  });

  it("records the votes of a 3-LEVEL tree's leaves, whose ids appear nowhere in edges", async () => {
    // The regression this pins, one level deeper than the case above, and the reason the walk is
    // recursive rather than a loop over the roots and their direct children. The shipped bug read
    // the roots' DIRECT children and stopped there: the reads were correctly collapsed and
    // correctly
    // window-matched, and yet every node BELOW a direct child still fell through to the anonymous
    // `0`, because `LinkThreadComponent.voteFor` answers `voteValues[id] ?? link.userVote ?? 0`
    // and `graphqlResource` data always carries the anonymous zero. The rider's own upvote then
    // renders un-pressed on a card they did press, with no error and no failed request anywhere.
    //
    // The fixture is built so the failure cannot be a coincidence: `edges` carries exactly ONE
    // node, and `g1` — the id whose vote the walk has to reach — is two `sublinks` hops below it
    // and appears nowhere else in the payload. `sublinkCount` is set honestly per node (2 at the
    // root, 1 at the child, 0 at the leaf) so the counts cannot be what carries the assertion.
    isLoggedIn.set(true);
    const leaf = makeSublink("g1", 1, [], "c1");
    const child = makeSublink("c1", -1, [leaf], "r1");
    const root = {
      ...makeFeedLink("r1", 1),
      sublinkCount: 2,
      sublinks: [child],
    } as FeedLink;
    requestMock.mockResolvedValueOnce(feedData([root], false, null));
    requestMock.mockResolvedValueOnce(feedData([], false, null));
    const store = createStore();
    flushInitial([], feedData([root], false, null));

    // All three levels, so a walk that stops one level short is red on the grandchild alone.
    await vi.waitFor(() => expect(store.userVotes()).toEqual({ r1: 1, c1: -1, g1: 1 }));
    // Stated as the INVARIANT rather than as a value: the overlay's id set EQUALS the rendered id
    // set, and the grandchild is rendered (nested two levels under the one root `edges` holds).
    expect(store.userVoteFor("g1")).toBe(1);
    // The rendered set is exactly those three ids — the overlay must not invent or lose any.
    expect(Object.keys(store.userVotes()).sort()).toEqual(["c1", "g1", "r1"]);
  });

  it("falls back to the feed value when the vote overlay is empty", async () => {
    const store = createStore();
    flushInitial([], feedData([makeFeedLink("x", 1)], false, null));
    await Promise.resolve();

    expect(store.userVoteFor("x")).toBe(1);
    expect(store.userVoteFor("missing")).toBe(0);
  });

  it("does not issue the authenticated overlay request when logged out", async () => {
    createStore();
    flushInitial([], feedData([], false, null));
    await Promise.resolve();

    expect(requestMock).not.toHaveBeenCalled();
  });

  it("populates the vote overlay from an authenticated request when logged in", async () => {
    isLoggedIn.set(true);
    requestMock.mockResolvedValueOnce(
      feedData([makeFeedLink("x", 1), makeFeedLink("y", 0)], false, null),
    );
    const store = createStore();
    flushInitial([], feedData([makeFeedLink("x", 0), makeFeedLink("y", 0)], false, null));
    await vi.waitFor(() => expect(store.userVoteFor("x")).toBe(1));

    // The variables are the feed resource's, verbatim — see the mirror test below for why the
    // window flags are load-bearing. The ONLY thing the authenticated read adds is the header.
    expect(requestMock).toHaveBeenCalledWith(
      expect.stringContaining("query Feed"),
      {
        first: FEED_PAGE_SIZE,
        status: "LIVE",
        currentServiceDayOnly: true,
        collapseThreads: true,
      },
      { "firebase-auth-key": "token" },
    );
    expect(store.userVoteFor("y")).toBe(0);
  });

  it("sends each overlay read the SAME variables as the resource it mirrors", async () => {
    // The overlay is complete only if its read is the SAME READ the page renders: same window, same
    // collapse, same page size, with the auth header the only addition. The failure mode of getting
    // this wrong is silent — `LinkThreadComponent.voteFor` falls back to `link.userVote ?? 0`, and
    // `graphqlResource` data always carries the ANONYMOUS 0, so a rider's own upvote renders
    // un-pressed with no error anywhere. Two ways to lose rows, both read as tidy-ups:
    //   SHAPE  — drop `collapseThreads` (the read returns the `first` newest FLAT rows, a different
    //            id set from the collapsed render) or walk `edges` without recursing `sublinks`.
    //   WINDOW — drop `currentServiceDayOnly` (the newest 8 rows OVERALL instead of the newest 8
    //            WITHIN THE SERVICE DAY). This test is the one that catches the second: it compares
    //            the two objects structurally, so any single added or removed key is red.
    isLoggedIn.set(true);
    requestMock.mockResolvedValue(feedData([], false, null));
    const store = createStore();

    // `expectOne` DEQUEUES, so the two resource requests are captured before either is flushed, and
    // their variables are the reference the overlay reads are compared against.
    const feedReq = feedRequest();
    const lastWeekReq = lastWeekRequest();
    const todayVars = feedReq.request.body.variables;
    const lastWeekVars = lastWeekReq.request.body.variables;

    linesRequest().flush({ data: { lines: [] } });
    feedReq.flush({ data: feedData([], false, null) });
    lastWeekReq.flush({ data: feedData([], false, null) });

    await vi.waitFor(() => expect(requestMock).toHaveBeenCalledTimes(2));
    expect(requestMock).toHaveBeenNthCalledWith(1, expect.any(String), todayVars, {
      "firebase-auth-key": "token",
    });
    expect(requestMock).toHaveBeenNthCalledWith(2, expect.any(String), lastWeekVars, {
      "firebase-auth-key": "token",
    });
    // Stated explicitly too, because a reader should not have to know that the equality above
    // happens to include it: the today overlay read is inside the service day, the last-week one is
    // inside the aligned 7-day window.
    expect(todayVars).toMatchObject({ currentServiceDayOnly: true, collapseThreads: true });
    expect(lastWeekVars).toMatchObject({
      lastWeekOnly: true,
      alignPageToDay: true,
      collapseThreads: true,
    });
    expect(store.userVotes()).toEqual({});
  });

  it("appends the second page and stops when hasNextPage is false", async () => {
    const store = createStore();
    flushInitial([], feedData([makeFeedLink("x")], true, "cursor-x"));
    await Promise.resolve();

    requestMock.mockResolvedValueOnce(feedData([makeFeedLink("y")], false, "cursor-y"));
    await store.loadMore();

    expect(requestMock).toHaveBeenCalledWith(expect.stringContaining("query Feed"), {
      first: FEED_PAGE_SIZE,
      after: "cursor-x",
      status: "LIVE",
      currentServiceDayOnly: true,
      collapseThreads: true,
    });
    expect(store.feedLinks().map((l) => l.id)).toEqual(["x", "y"]);

    // hasNextPage is now false — a further loadMore is a no-op (no request).
    requestMock.mockClear();
    await store.loadMore();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("reports the filtered total and prefers a continuation page's LARGER totalCount", async () => {
    const store = createStore();
    expect(store.feedTotalCount()).toBe(0);

    flushInitial([], feedData([makeFeedLink("x")], true, "cursor-x"));
    await Promise.resolve();
    expect(store.feedTotalCount()).toBe(1);

    requestMock.mockResolvedValueOnce({
      publicSocialMediaLinks: {
        edges: [{ node: makeFeedLink("y"), cursor: "cursor-y" }],
        pageInfo: { hasNextPage: false, endCursor: "cursor-y" },
        totalCount: 7,
      },
    });
    await store.loadMore();

    expect(store.feedTotalCount()).toBe(7);
  });

  it("takes the larger of the live first-page total and the beat-frozen appended total", async () => {
    // `Math.max`, not a `??` chain: the beat refreshes page one while `appendedTotalCount` stays
    // frozen, so the two sources disagree in BOTH directions and neither is authoritative alone.
    const store = createStore();
    flushInitial(
      [],
      feedData([makeFeedLink("x")], true, "cursor-x"),
      feedData([makeFeedLink("w1")], true, "cursor-w"),
    );
    await Promise.resolve();
    // A section with no continuation page yet falls back to its live first-page total, not to 0.
    expect(store.lastWeekTotalCount()).toBe(1);

    requestMock.mockResolvedValueOnce({
      publicSocialMediaLinks: {
        edges: [{ node: makeFeedLink("y"), cursor: "cursor-y" }],
        pageInfo: { hasNextPage: false, endCursor: "cursor-y" },
        totalCount: 7,
      },
    });
    await store.loadMore();
    // Direction one: the appended total outranks page one (7 vs 1).
    expect(store.feedTotalCount()).toBe(7);

    store.reloadFirstPages();
    TestBed.tick();
    linesRequest().flush({ data: { lines: [] } });
    // Page one now carries 12 roots, while `appendedTotalCount` is still frozen at 7 because the
    // beat leaves every appended signal alone.
    feedRequest().flush({
      data: {
        publicSocialMediaLinks: {
          edges: [makeFeedLink("x")].map((node) => ({ node, cursor: "c" })),
          pageInfo: { hasNextPage: true, endCursor: "cursor-x" },
          totalCount: 12,
        },
      },
    });
    lastWeekRequest().flush({ data: feedData([makeFeedLink("w1")], true, "cursor-w") });
    await Promise.resolve();

    // Direction two: the LIVE page one outranks the frozen appended total (12 vs 7). Between the two
    // directions the rule is "never smaller than either source" — a denominator that shrinks under a
    // reader who has already loaded more pages than the stale count knew about ("Showing 40 of 12")
    // is the one visibly wrong reading, and `appendedTotalCount() ?? first` produced exactly that.
    expect(store.feedTotalCount()).toBe(12);
  });

  it("exposes isLoadingMore only while a continuation page is in flight", async () => {
    const store = createStore();
    flushInitial([], feedData([makeFeedLink("x")], true, "cursor-x"));
    await Promise.resolve();
    expect(store.isLoadingMore()).toBe(false);

    requestMock.mockResolvedValueOnce(feedData([makeFeedLink("y")], false, "cursor-y"));
    const pending = store.loadMore();
    expect(store.isLoadingMore()).toBe(true);
    await pending;
    expect(store.isLoadingMore()).toBe(false);
  });

  it("setUserVote updates the overlay so userVoteFor prefers it", async () => {
    const store = createStore();
    flushInitial([], feedData([makeFeedLink("x", 0)], false, null));
    await Promise.resolve();

    store.setUserVote("x", 1);
    expect(store.userVoteFor("x")).toBe(1);
  });

  it("resumes the beat and revalidates the first pages when started after a stop", async () => {
    // The route's injector outlives the page component, so HomePage's constructor calls start()
    // on a store whose beat ngOnDestroy previously paused. A start() that re-applied that paused
    // `null` left the countdown gone for good and no refresh ever scheduled again — the re-entry
    // regression this test pins.
    const store = createStore();
    flushInitial([makeLine("a")], feedData([makeFeedLink("x")], false, null));
    await Promise.resolve();
    expect(store.polling.secondsRemaining()).toBe(30);

    store.stop();
    expect(store.polling.intervalMs()).toBeNull();
    expect(store.polling.secondsRemaining()).toBe(0);

    store.start();
    TestBed.tick();
    await Promise.resolve();

    expect(store.polling.intervalMs()).toBe(30000);
    expect(store.polling.secondsRemaining()).toBe(30);

    // Re-entry revalidates page one of all three resources through the same beat.
    const linesReq = linesRequest();
    const feedReq = feedRequest();
    const lastWeekReq = lastWeekRequest();
    linesReq.flush({ data: { lines: [makeLine("b")] } });
    feedReq.flush({ data: feedData([makeFeedLink("y")], false, null) });
    lastWeekReq.flush({ data: feedData([], false, null) });
    await Promise.resolve();

    expect(store.lines().map((l) => l.id)).toEqual(["b"]);
    expect(store.feedLinks().map((l) => l.id)).toEqual(["y"]);
  });

  it("does not refetch on a first start — the constructor reads are the initial load", () => {
    const store = createStore();

    store.start();
    TestBed.tick();

    // Exactly one batch of the three reads; an unconditional reload in start() would leave a
    // second pending batch behind and afterEach's httpMock.verify() would fail.
    flushInitial([makeLine("a")], feedData([makeFeedLink("x")], false, null));
  });

  it("refreshes every section's first page on the poll beat, keeping the appended pages", async () => {
    // The user-facing promise is "Refreshing in 12s" for the WHOLE page, so the beat must re-read
    // page one of all three resources — but it must NOT drop the appended Load More pages, or the
    // reader's place in a long feed would be wiped every 30 seconds. Hence `reloadFirstPages()`
    // (append-only signals untouched) rather than `reloadAll()`.
    const store = createStore();
    flushInitial(
      [makeLine("a")],
      feedData([makeFeedLink("x")], true, "cursor-x"),
      feedData([makeFeedLink("w1")], true, "cursor-w"),
    );
    await Promise.resolve();

    requestMock.mockResolvedValueOnce(feedData([makeFeedLink("y")], false, "cursor-y"));
    await store.loadMore();
    requestMock.mockResolvedValueOnce(feedData([makeFeedLink("w2")], false, "cursor-w2"));
    await store.loadMoreLastWeek();
    expect(store.feedLinks().map((l) => l.id)).toEqual(["x", "y"]);
    expect(store.lastWeekLinks().map((l) => l.id)).toEqual(["w1", "w2"]);
    expect(store.linesRefreshTick()).toBe(0);

    store.polling.refreshNow();
    TestBed.tick();

    // The beat is observable as in-flight state, which `isLoading` (pristine-first-fetch-only) can
    // never report for a reload — this is what a refresh confirmation actually watches.
    expect(store.isRefreshing()).toBe(true);

    // All three are requested. `expectOne` DEQUEUES, so capture both feed reads before flushing —
    // FEED_QUERY serves the today feed AND the last-week section, split by the window variable.
    const linesReq = linesRequest();
    const feedReq = feedRequest();
    const lastWeekReq = lastWeekRequest();
    linesReq.flush({ data: { lines: [makeLine("a"), makeLine("b")] } });
    feedReq.flush({ data: feedData([makeFeedLink("x")], true, "cursor-x") });
    lastWeekReq.flush({ data: feedData([makeFeedLink("w1")], true, "cursor-w") });
    await Promise.resolve();

    expect(store.isRefreshing()).toBe(false);
    expect(store.linesRefreshTick()).toBe(1);
    expect(store.lines().map((l) => l.id)).toEqual(["a", "b"]);
    // The appended pages survive the beat — the whole point of not resetting them.
    expect(store.feedLinks().map((l) => l.id)).toEqual(["x", "y"]);
    expect(store.lastWeekLinks().map((l) => l.id)).toEqual(["w1", "w2"]);
    expect(store.feedPageInfo()?.endCursor).toBe("cursor-y");
    expect(store.lastWeekPageInfo()?.endCursor).toBe("cursor-w2");
  });

  it("drops a row the refetched first page and an appended page now both carry", async () => {
    // The dedup guard `reloadFirstPages()` requires. An admin edit between the two reads moves a
    // row, so a row an appended page already holds comes back INTO page one and the same id lands
    // in both. A duplicate id is fatal, not cosmetic: the page renders
    // `@for (link of store.feedLinks(); track link.id)` and a repeated track key throws.
    const store = createStore();
    flushInitial(
      [makeLine("a")],
      feedData([makeFeedLink("x")], true, "cursor-x"),
      feedData([makeFeedLink("w1")], true, "cursor-w"),
    );
    await Promise.resolve();

    requestMock.mockResolvedValueOnce(feedData([makeFeedLink("y")], false, "cursor-y"));
    await store.loadMore();
    requestMock.mockResolvedValueOnce(feedData([makeFeedLink("w2")], false, "cursor-w2"));
    await store.loadMoreLastWeek();

    // The refetched copies are made DISTINGUISHABLE from the appended duplicates (same id, a marker
    // title). Without that the `["x","y"]` id assertion passes under BOTH first-wins and last-wins,
    // so the declared rule would be unpinned — this is what actually holds the merge to first-wins.
    const yFromPageOne = { ...makeFeedLink("y"), title: "from page one" };
    const w2FromPageOne = { ...makeFeedLink("w2"), title: "from page one" };

    store.reloadFirstPages();
    TestBed.tick();

    const linesReq = linesRequest();
    const feedReq = feedRequest();
    const lastWeekReq = lastWeekRequest();
    linesReq.flush({ data: { lines: [makeLine("a")] } });
    // Page one now reaches into what used to be page two for both lists.
    feedReq.flush({
      data: {
        publicSocialMediaLinks: {
          edges: [makeFeedLink("x"), yFromPageOne].map((node) => ({ node, cursor: "c" })),
          pageInfo: { hasNextPage: true, endCursor: "cursor-x" },
          totalCount: 2,
        },
      },
    });
    lastWeekReq.flush({
      data: {
        publicSocialMediaLinks: {
          edges: [makeFeedLink("w1"), w2FromPageOne].map((node) => ({ node, cursor: "c" })),
          pageInfo: { hasNextPage: true, endCursor: "cursor-w" },
          totalCount: 2,
        },
      },
    });
    await Promise.resolve();

    // First occurrence wins, so the REFETCHED copy survives for a row that is in both — backend
    // order preserved, no repeated track key for either surface, and no stale appended copy left to
    // win the next beat. The id list alone could not tell those two rules apart.
    expect(store.feedLinks().map((l) => l.id)).toEqual(["x", "y"]);
    expect(store.feedLinks()[1]?.title).toBe("from page one");
    expect(store.lastWeekLinks().map((l) => l.id)).toEqual(["w1", "w2"]);
    expect(store.lastWeekLinks()[1]?.title).toBe("from page one");
  });

  it("keeps feedLinks duplicate-free when a loadMore lands after a beat's page one", async () => {
    // The race `dedupeEdges` also has to survive: a continuation page in flight when the beat fires
    // resolves AFTER the refetched page one, appending a row the refresh already put on screen. The
    // merge is a computed over both signals, so ordering cannot save it — dedupe is what does.
    const store = createStore();
    flushInitial(
      [makeLine("a")],
      feedData([makeFeedLink("x")], true, "cursor-x"),
      feedData([], false, null),
    );
    await Promise.resolve();

    let resolveRequest: (value: FeedQueryData) => void = () => undefined;
    requestMock.mockImplementationOnce(
      () =>
        new Promise<FeedQueryData>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const pending = store.loadMore();

    store.reloadFirstPages();
    TestBed.tick();
    linesRequest().flush({ data: { lines: [makeLine("a")] } });
    // The refetched page one has already grown into the page the continuation is about to return.
    feedRequest().flush({
      data: feedData([makeFeedLink("x"), makeFeedLink("y")], true, "cursor-x"),
    });
    lastWeekRequest().flush({ data: feedData([], false, null) });
    await Promise.resolve();

    resolveRequest(feedData([makeFeedLink("y")], false, "cursor-y"));
    await pending;

    const ids = store.feedLinks().map((l) => l.id);
    expect(ids).toEqual(["x", "y"]);
    // Stated as the invariant rather than as the list above: one row per id, which is what keeps
    // `@for (link of store.feedLinks(); track link.id)` from throwing on the next render.
    expect(new Set(ids).size).toBe(store.feedLinks().length);
  });

  it("reports isRefreshing for the first load and for every later reload", async () => {
    // Built on each resource's raw `isFetching`, not `isLoading` — `isLoading` is
    // pristine-first-fetch-only, so a refresh confirmation can never observe it. Three assertions
    // in order: the pristine fetch is in flight, it settles, a reload is observable again.
    const store = createStore();
    expect(store.isRefreshing()).toBe(true);

    flushInitial([], feedData([makeFeedLink("x")], false, null));
    await Promise.resolve();
    expect(store.isRefreshing()).toBe(false);

    store.reloadAll();
    TestBed.tick();
    expect(store.isRefreshing()).toBe(true);

    linesRequest().flush({ data: { lines: [] } });
    feedRequest().flush({ data: feedData([makeFeedLink("z")], false, null) });
    lastWeekRequest().flush({ data: feedData([], false, null) });
    await Promise.resolve();

    expect(store.isRefreshing()).toBe(false);
  });

  it("keeps reloadAll resetting the appended feed pages without bumping the tick", async () => {
    const store = createStore();
    flushInitial([makeLine("a")], feedData([makeFeedLink("x")], true, "cursor-x"));
    await Promise.resolve();

    requestMock.mockResolvedValueOnce(feedData([makeFeedLink("y")], false, "cursor-y"));
    await store.loadMore();

    store.reloadAll();
    TestBed.tick();

    linesRequest().flush({ data: { lines: [] } });
    feedRequest().flush({ data: feedData([makeFeedLink("z")], false, null) });
    lastWeekRequest().flush({ data: feedData([], false, null) });
    await Promise.resolve();

    expect(store.feedLinks().map((l) => l.id)).toEqual(["z"]);
    expect(store.linesRefreshTick()).toBe(0);
  });

  it("projects lastWeekLinks from the last-week resource", async () => {
    const store = createStore();
    flushInitial(
      [],
      feedData([makeFeedLink("t")], false, null),
      feedData([makeFeedLink("w1"), makeFeedLink("w2")], true, "cursor-w"),
    );
    await Promise.resolve();

    expect(store.lastWeekLinks().map((l) => l.id)).toEqual(["w1", "w2"]);
    expect(store.lastWeekTotalCount()).toBe(2);
    expect(store.lastWeekPageInfo()?.endCursor).toBe("cursor-w");
  });

  it("appends a second last-week page through the GraphQL client", async () => {
    const store = createStore();
    flushInitial([], feedData([], false, null), feedData([makeFeedLink("w1")], true, "cursor-w"));
    await Promise.resolve();

    requestMock.mockResolvedValueOnce(feedData([makeFeedLink("w2")], false, "cursor-w2"));
    await store.loadMoreLastWeek();

    expect(requestMock).toHaveBeenCalledWith(expect.stringContaining("query Feed"), {
      first: LAST_WEEK_PAGE_SIZE,
      after: "cursor-w",
      status: "LIVE",
      lastWeekOnly: true,
      alignPageToDay: true,
      collapseThreads: true,
    });
    expect(store.lastWeekLinks().map((l) => l.id)).toEqual(["w1", "w2"]);

    requestMock.mockClear();
    await store.loadMoreLastWeek();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("clears appended last-week pages and re-requests both on reloadAll", async () => {
    const store = createStore();
    flushInitial([], feedData([], false, null), feedData([makeFeedLink("w1")], true, "cursor-w"));
    await Promise.resolve();

    requestMock.mockResolvedValueOnce(feedData([makeFeedLink("w2")], false, "cursor-w2"));
    await store.loadMoreLastWeek();
    expect(store.lastWeekLinks().map((l) => l.id)).toEqual(["w1", "w2"]);

    store.reloadAll();
    TestBed.tick();

    linesRequest().flush({ data: { lines: [] } });
    feedRequest().flush({ data: feedData([], false, null) });
    lastWeekRequest().flush({ data: feedData([makeFeedLink("w3")], false, null) });
    await Promise.resolve();

    expect(store.lastWeekLinks().map((l) => l.id)).toEqual(["w3"]);
  });

  it("groups lastWeekLinks into local calendar days", async () => {
    const store = createStore();
    // Day grouping keys on the DISPLAYED instant, so these fixtures move `occurredAt` (what the
    // backend orders by) — and leave `created` on the fixture's own value, which would otherwise
    // put every link in a 2026-08-01 group if the util regressed to created-keying.
    const dayOne = [makeFeedLink("w1"), makeFeedLink("w2")].map((link) => ({
      ...link,
      occurredAt: "2026-09-30T09:00:00",
    }));
    const dayTwo = { ...makeFeedLink("w3"), occurredAt: "2026-09-29T09:00:00" };
    flushInitial([], feedData([], false, null), feedData([...dayOne, dayTwo], false, "cursor-w"));
    await Promise.resolve();

    const groups = store.lastWeekDayGroups();
    expect(groups.map((g) => g.key)).toEqual(["2026-09-30", "2026-09-29"]);
    expect(groups[0].links.map((l) => l.id)).toEqual(["w1", "w2"]);
  });

  it("issues two authenticated overlay reads and merges their votes", async () => {
    isLoggedIn.set(true);
    requestMock.mockResolvedValueOnce(feedData([makeFeedLink("x", 1)], false, null));
    requestMock.mockResolvedValueOnce(
      feedData([makeFeedLink("w", 1), makeFeedLink("y", 0)], false, null),
    );
    const store = createStore();
    flushInitial([], feedData([makeFeedLink("x", 0)], false, null));
    await vi.waitFor(() => expect(store.userVoteFor("w")).toBe(1));

    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(requestMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("query Feed"),
      {
        first: LAST_WEEK_PAGE_SIZE,
        status: "LIVE",
        lastWeekOnly: true,
        alignPageToDay: true,
        collapseThreads: true,
      },
      { "firebase-auth-key": "token" },
    );
  });

  it("keeps the last-week votes when the today overlay read rejects", async () => {
    isLoggedIn.set(true);
    requestMock.mockRejectedValueOnce(new Error("today overlay failed"));
    requestMock.mockResolvedValueOnce(feedData([makeFeedLink("w", 1)], false, null));
    const store = createStore();
    flushInitial([], feedData([makeFeedLink("x", 0)], false, null));

    await vi.waitFor(() => expect(store.userVoteFor("w")).toBe(1));
    expect(store.userVoteFor("w")).toBe(1);
  });

  it("reports a last-week-only failure through hasError while the today feed keeps its data", async () => {
    const store = createStore();
    linesRequest().flush({ data: { lines: [] } });
    feedRequest().flush({ data: feedData([makeFeedLink("x")], false, null) });
    lastWeekRequest().flush({ message: "boom" }, { status: 500, statusText: "Server Error" });
    await Promise.resolve();
    TestBed.tick();
    await Promise.resolve();

    expect(store.hasError()).toBe(true);
    expect(store.feedLinks().map((l) => l.id)).toEqual(["x"]);
  });

  it("coalesces concurrent loadMoreLastWeek calls into one request", async () => {
    const store = createStore();
    flushInitial([], feedData([], false, null), feedData([makeFeedLink("w1")], true, "cursor-w"));
    await Promise.resolve();

    requestMock.mockClear();
    let resolveRequest: (value: FeedQueryData) => void = () => undefined;
    requestMock.mockImplementationOnce(
      () =>
        new Promise<FeedQueryData>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const first = store.loadMoreLastWeek();
    const second = store.loadMoreLastWeek();
    resolveRequest(feedData([makeFeedLink("w2")], false, "cursor-w2"));
    await Promise.all([first, second]);

    expect(requestMock).toHaveBeenCalledTimes(1);
  });
});

/* ---------------------------------------------------------------------- *
 * The network board's derived views (Phase 1)
 *
 * These live on the STORE rather than in the board component on purpose: the partition is a rule,
 * not a rendering, and a rule that only exists inside a template cannot be tested without a DOM or
 * reasoned about by a reader of the markup. `network-board.component.spec.ts` then checks the same
 * views reach the screen in the right groups.
 * ---------------------------------------------------------------------- */

describe("HomeStore: the board partition", () => {
  let httpMock: HttpTestingController;
  let preferences: PreferencesService;

  /** A line fixture with the two axes the partition reads: `status` and `passengerStatus`. */
  function boardLine(id: string, overrides: Partial<LinePulse> = {}): LinePulse {
    return { ...makeLine(id), code: id.toUpperCase(), ...overrides };
  }

  /** Creates a store whose three reads have settled on `lines` and nothing else. */
  async function withLines(lines: LinePulse[]): Promise<HomeStore> {
    const store = TestBed.inject(HomeStore);
    TestBed.tick();
    httpMock
      .expectOne((r) => r.method === "POST" && r.body.query.includes("FrontPageLines"))
      .flush({ data: { lines } });
    httpMock
      .expectOne(
        (r) =>
          r.method === "POST" &&
          r.body.query.includes("query Feed") &&
          r.body.variables?.lastWeekOnly !== true,
      )
      .flush({ data: feedData([], false, null) });
    httpMock
      .expectOne(
        (r) =>
          r.method === "POST" &&
          r.body.query.includes("query Feed") &&
          r.body.variables?.lastWeekOnly === true,
      )
      .flush({ data: feedData([], false, null) });
    await Promise.resolve();
    return store;
  }

  /**
   * Seeds the reader's PINS the way a previous session left them, in the service's own storage key.
   *
   * Poking `togglePin()` directly would be a lie: `PreferencesService` hydrates inside
   * `afterNextRender`, and the `TestBed.tick()` inside `withLines()` is what runs that pass — so a
   * pin set before it is read straight back out of an EMPTY `localStorage` and wiped. Seeding the
   * payload means the store reads the pins through the same hydration the page does.
   */
  function storedPins(...ids: string[]): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        pinnedLineIds: ids,
        viewMode: "rider",
        density: "comfortable",
        lastReportedLineId: null,
        recentLineIds: [],
      }),
    );
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClientTesting(),
        HomeStore,
        {
          provide: AuthService,
          useValue: {
            isLoggedIn: signal(false),
            isAdmin: () => false,
            idToken: async () => "token",
            whenReady: Promise.resolve(),
          },
        },
        { provide: GraphQLClient, useValue: { request: vi.fn() } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    preferences = TestBed.inject(PreferencesService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it("puts every line needing attention in the attention group, worst first", async () => {
    const store = await withLines([
      boardLine("healthy"),
      boardLine("testing", { status: "TESTING" }),
      boardLine("dead", { status: "TOTAL_DISRUPTION" }),
      boardLine("partial", { status: "PARTIAL_ACTIVE" }),
      boardLine("late", { passengerStatus: "DELAYED" }),
    ]);

    // The reader's FIRST question is what is broken; the partition must answer it in the same order
    // the hero's callout uses, or the two disagree about which line is worst.
    expect(store.attentionLines().map((l) => l.id)).toEqual(["dead", "partial", "testing", "late"]);
    expect(store.myLines()).toEqual([]);
    expect(store.allLines().map((l) => l.id)).toEqual(["healthy"]);
  });

  it("counts the attention group with the hero's own needs-attention rule", async () => {
    const store = await withLines([
      boardLine("ok"),
      boardLine("broken", { status: "PARTIAL_DISRUPTION" }),
      boardLine("late", { passengerStatus: "DELAYED" }),
      // Crowding describes one carriage, not the service — it must NOT inflate the group.
      boardLine("busy", { passengerStatus: "CROWDED" }),
    ]);

    expect(store.networkSummary().needsAttentionCount).toBe(2);
    expect(store.attentionLines().map((l) => l.id)).toEqual(["broken", "late"]);
  });

  it("collects pinned lines that no higher group claimed into myLines", async () => {
    storedPins("pinned-a", "pinned-b");

    const store = await withLines([
      boardLine("pinned-a"),
      boardLine("pinned-b"),
      boardLine("plain"),
      boardLine("broken", { status: "PARTIAL_DISRUPTION" }),
    ]);

    expect(store.myLines().map((l) => l.id)).toEqual(["pinned-a", "pinned-b"]);
    expect(store.attentionLines().map((l) => l.id)).toEqual(["broken"]);
    expect(store.allLines().map((l) => l.id)).toEqual(["plain"]);
  });

  it("keeps a pinned-but-broken line in ATTENTION only, so it never renders twice", async () => {
    storedPins("dead");

    const store = await withLines([
      boardLine("dead", { status: "TOTAL_DISRUPTION" }),
      boardLine("ok"),
    ]);

    // Attention membership always wins. Pinning says "I care about this line"; it is not a licence
    // to print a dead line twice on one page, and the group it gives up is the compact one.
    expect(store.attentionLines().map((l) => l.id)).toEqual(["dead"]);
    expect(store.myLines()).toEqual([]);
    expect(store.allLines().map((l) => l.id)).toEqual(["ok"]);
  });

  it("moves a pinned line out of myLines the moment it starts needing attention", async () => {
    storedPins("kjl");

    const store = await withLines([boardLine("kjl"), boardLine("ok")]);
    expect(store.myLines().map((l) => l.id)).toEqual(["kjl"]);

    store.reloadFirstPages();
    TestBed.tick();
    httpMock
      .expectOne((r) => r.method === "POST" && r.body.query.includes("FrontPageLines"))
      .flush({
        data: { lines: [boardLine("kjl", { passengerStatus: "DISRUPTED" }), boardLine("ok")] },
      });
    httpMock
      .expectOne(
        (r) =>
          r.method === "POST" &&
          r.body.query.includes("query Feed") &&
          r.body.variables?.lastWeekOnly !== true,
      )
      .flush({ data: feedData([], false, null) });
    httpMock
      .expectOne(
        (r) =>
          r.method === "POST" &&
          r.body.query.includes("query Feed") &&
          r.body.variables?.lastWeekOnly === true,
      )
      .flush({ data: feedData([], false, null) });
    await Promise.resolve();

    // The partition recomputes off the SAME read, so no group can keep a stale membership.
    expect(store.attentionLines().map((l) => l.id)).toEqual(["kjl"]);
    expect(store.myLines()).toEqual([]);
  });

  it.each([
    ["an empty read", []],
    ["all healthy", ["a", "b", "c"]],
    ["all broken", ["a", "b", "c"]],
    ["a mix", ["a", "b", "c"]],
  ])("renders every line in EXACTLY one group — %s", async (_label, ids) => {
    storedPins("b");
    const lineIds = ids as string[];

    const store = await withLines(
      lineIds.map((id, index) =>
        // Every other line is degraded, so both directions of the partition are exercised at once.
        boardLine(id, { status: index % 2 === 0 ? "PARTIAL_DISRUPTION" : "ACTIVE" }),
      ),
    );

    const grouped = [
      ...store.attentionLines().map((l) => l.id),
      ...store.myLines().map((l) => l.id),
      ...store.allLines().map((l) => l.id),
    ];

    expect(grouped).toHaveLength(lineIds.length);
    expect(new Set(grouped).size).toBe(lineIds.length);
    expect([...grouped].sort()).toEqual([...lineIds].sort());
  });

  it("ignores a pin for a line this read does not contain", async () => {
    // The stored pin list outlives any single read, so an id for a line that was retired (or simply
    // not in this payload) must simply not appear anywhere — never as a phantom row.
    storedPins("retired-line");

    const store = await withLines([boardLine("a"), boardLine("b")]);

    expect(store.myLines()).toEqual([]);
    expect([...store.attentionLines(), ...store.allLines()].map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("never re-orders the reader's own line list", async () => {
    const lines = [boardLine("b"), boardLine("a", { status: "TOTAL_DISRUPTION" })];
    const store = await withLines(lines);

    store.setBoardSort("name");

    // `sortLinesBySeverity` copies before sorting. `lines()` is what the hero's ribbon reads, and
    // re-ordering it under the hero would make the colours jump on every sort toggle.
    expect(store.lines().map((l) => l.id)).toEqual(["b", "a"]);
    expect(lines.map((l) => l.id)).toEqual(["b", "a"]);
  });

  describe("the sort", () => {
    /**
     * Four lines that are ALL below the needs-attention threshold, whose severity order and code
     * order disagree — so the sort is observable on a group nothing is competing with.
     *
     * DELAYED would not do here: it is at the needs-attention rank, so such a line would be claimed
     * by the attention group and this group would lose it before the sort could be read.
     */
    function sortedLines(): LinePulse[] {
      return [
        boardLine("spl", { passengerStatus: "CROWDED" }),
        boardLine("kjl"),
        boardLine("bdr", { passengerStatus: "BACKLOGGED" }),
        boardLine("xtr", { passengerStatus: "EXTREMELY_CROWDED" }),
      ];
    }

    it("defaults to severity, so the board agrees with the hero about what is worst", async () => {
      const store = await withLines(sortedLines());

      expect(store.boardSort()).toBe("severity");
      // BACKLOGGED above EXTREMELY_CROWDED above CROWDED above unreported, by passenger severity.
      expect(store.allLines().map((l) => l.id)).toEqual(["bdr", "xtr", "spl", "kjl"]);
    });

    it("switches the remaining group to a code compare when asked for Name", async () => {
      const store = await withLines(sortedLines());

      store.setBoardSort("name");

      expect(store.allLines().map((l) => l.id)).toEqual(["bdr", "kjl", "spl", "xtr"]);
    });

    it("ignores an unrecognised sort instead of throwing or blanking the group", async () => {
      const store = await withLines(sortedLines());

      store.setBoardSort("colour" as never);

      expect(store.boardSort()).toBe("severity");
      expect(store.allLines()).toHaveLength(4);
    });

    it("leaves the attention and my-lines groups on severity order whatever the sort", async () => {
      storedPins("spl");
      const store = await withLines([
        ...sortedLines(),
        boardLine("kel", { status: "PARTIAL_DISRUPTION" }),
      ]);

      store.setBoardSort("name");

      // Only the "All lines" group is re-orderable. The other two are short and are the reason the
      // reader is on the page, so putting a dead line under a healthy one alphabetically would cost
      // more than the alphabetical reading is worth.
      expect(store.attentionLines().map((l) => l.id)).toEqual(["kel"]);
      expect(store.myLines().map((l) => l.id)).toEqual(["spl"]);
      expect(store.allLines().map((l) => l.id)).toEqual(["bdr", "kjl", "xtr"]);
    });
  });
});
