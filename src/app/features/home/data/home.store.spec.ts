import { provideZonelessChangeDetection, signal } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import { FeedLink, FeedQueryData, FrontPageLinesQueryData } from "./home.queries";
import { FEED_PAGE_SIZE, HomeStore, LAST_WEEK_PAGE_SIZE } from "./home.store";

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
    threadId: null,
    isThreadRoot: true,
    threadSize: 1,
    threadLinks: [],
    status: "LIVE",
    completed: false,
    isAutomated: false,
    voteScore: 2,
    userVote,
    voteBreakdown: { upvotes: 2, downvotes: 0 },
    lines: [],
    user: { shortId: "abc123", nickname: "Tester" },
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
    // (a member's root may be on another page entirely). Only a collapsed read nests members under
    // `threadLinks`, and only then does `totalCount` count what the page renders.
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

  it("renders a collapsed root with its members nested and counts the root once", async () => {
    const store = createStore();
    const member = makeFeedLink("x2");
    const root = {
      ...makeFeedLink("x"),
      threadLinks: [member],
      threadSize: 2,
    };
    // The backend's count while collapsing is the number of ROOTS, which is what the page's
    // "Showing N of M" reports — so a 2-link thread contributes 1, not 2.
    flushInitial([], feedData([root], false, null));
    await Promise.resolve();

    expect(store.feedLinks()).toHaveLength(1);
    expect(store.feedLinks()[0].threadLinks.map((l) => l.id)).toEqual(["x2"]);
    expect(store.feedLinks()[0].threadSize).toBe(2);
    expect(store.feedTotalCount()).toBe(1);
  });

  it("exposes the vote overlay as a per-id map for the thread wrapper", async () => {
    isLoggedIn.set(true);
    // A collapsed render still has to vote on a MEMBER, whose id only exists nested. The overlay
    // read is collapsed for the same reason the page is, and the loop walks the nesting — this
    // pins that the resulting map is keyed per id (root and member alike) and is exactly what the
    // page binds.
    // A nested member is the root's selection minus the four thread fields (see
    // `FeedLinkThreadMember`), so the fixture cannot carry a `threadId` either.
    requestMock.mockResolvedValueOnce(
      feedData(
        [
          {
            ...makeFeedLink("x", 1),
            threadSize: 2,
            threadLinks: [makeFeedLink("x2", -1)],
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

    // A member is NOT in `feedLinks` (it is nested under the root), so the map is the only channel
    // that can carry its vote — and `userVoteFor` reaches it through the overlay, not the feed.
    expect(store.userVotes()["x2"]).toBe(-1);
    expect(store.userVoteFor("x2")).toBe(-1);
    expect(store.feedLinks().map((l) => l.id)).toEqual(["x"]);
    // The overlay reads MUST collapse, exactly like the two resources: an uncollapsed read is the
    // `first` newest FLAT rows, which is a different id set from the rendered one and drops the
    // members of every thread that does not fit in the window.
    expect(requestMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ collapseThreads: true }),
      expect.anything(),
    );

    store.setUserVote("x2", 1);
    expect(store.userVotes()).toEqual({ x: 1, x2: 1 });
    expect(store.userVoteFor("x")).toBe(1);
  });

  it("records the votes of NESTED members the flat window would have dropped", async () => {
    // The regression this pins: the rendered feed is 2 roots carrying 2 members each (4 votable
    // ids per root, 8 in total), while the uncollapsed top-8 would return `r1,m1,r2,m2,r3,m3,r4,m4`
    // — four of those eight ids are members of the SECOND and FOURTH roots and simply are not in
    // it. `LinkThreadComponent.voteFor` falls back to `link.userVote ?? 0` for a missing id, so
    // those members would render as the ANONYMOUS zero on an expanded thread: a rider's upvote,
    // silently un-pressed, with no error anywhere.
    isLoggedIn.set(true);
    requestMock.mockResolvedValueOnce(
      feedData(
        [
          {
            ...makeFeedLink("r1", 1),
            threadSize: 3,
            threadLinks: [makeFeedLink("m1", 1), makeFeedLink("m2", -1)],
          } as FeedLink,
          {
            ...makeFeedLink("r2", 1),
            threadSize: 3,
            threadLinks: [makeFeedLink("m3", 1), makeFeedLink("m4", 1)],
          } as FeedLink,
        ],
        false,
        null,
      ),
    );
    requestMock.mockResolvedValueOnce(feedData([], false, null));
    const store = createStore();
    flushInitial([], feedData([], false, null));

    // Every id the page can actually draw — both roots and all four members.
    await vi.waitFor(() =>
      expect(Object.keys(store.userVotes()).sort()).toEqual(["m1", "m2", "m3", "m4", "r1", "r2"]),
    );
    expect(store.userVoteFor("m4")).toBe(1);
    // An id the caller has no opinion on stays ABSENT rather than being recorded as 0, so the map
    // can never shadow a real value the anonymous read might one day supply.
    expect(Object.prototype.hasOwnProperty.call(store.userVotes(), "m5")).toBe(false);
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
    //            id set from the collapsed render) or walk `edges` without `threadLinks`.
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

  it("reports the filtered total and lets a continuation page's totalCount win", async () => {
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

  it("refreshes only the lines on the poll beat, keeping the appended feed pages", async () => {
    const store = createStore();
    flushInitial([makeLine("a")], feedData([makeFeedLink("x")], true, "cursor-x"));
    await Promise.resolve();

    requestMock.mockResolvedValueOnce(feedData([makeFeedLink("y")], false, "cursor-y"));
    await store.loadMore();
    expect(store.feedLinks().map((l) => l.id)).toEqual(["x", "y"]);
    expect(store.linesRefreshTick()).toBe(0);

    store.polling.refreshNow();
    TestBed.tick();

    const reload = linesRequest();
    reload.flush({ data: { lines: [makeLine("a"), makeLine("b")] } });
    await Promise.resolve();

    expect(store.linesRefreshTick()).toBe(1);
    expect(store.lines().map((l) => l.id)).toEqual(["a", "b"]);
    httpMock.expectNone((r) => r.method === "POST" && r.body.query.includes("query Feed"));
    expect(store.feedLinks().map((l) => l.id)).toEqual(["x", "y"]);
    expect(store.feedPageInfo()?.endCursor).toBe("cursor-y");
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
