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
    created: "2026-08-01T08:00:00Z",
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
    });
    feedReq.flush({ data: feedData([makeFeedLink("x"), makeFeedLink("y")], false, null) });

    const lastWeekReq = lastWeekRequest();
    expect(lastWeekReq.request.body.variables).toEqual({
      first: LAST_WEEK_PAGE_SIZE,
      status: "LIVE",
      lastWeekOnly: true,
      alignPageToDay: true,
    });
    lastWeekReq.flush({ data: feedData([], false, null) });

    await Promise.resolve();

    expect(store.lines().map((l) => l.id)).toEqual(["a", "b"]);
    expect(store.feedLinks().map((l) => l.id)).toEqual(["x", "y"]);
    expect(store.feedPageInfo()?.hasNextPage).toBe(false);
    expect(store.feedTotalCount()).toBe(2);
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

    expect(requestMock).toHaveBeenCalledWith(
      expect.stringContaining("query Feed"),
      { first: FEED_PAGE_SIZE, status: "LIVE" },
      { "firebase-auth-key": "token" },
    );
    expect(store.userVoteFor("y")).toBe(0);
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
    const dayOne = [makeFeedLink("w1"), makeFeedLink("w2")].map((link) => ({
      ...link,
      created: "2026-09-30T09:00:00",
    }));
    const dayTwo = { ...makeFeedLink("w3"), created: "2026-09-29T09:00:00" };
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
      { first: LAST_WEEK_PAGE_SIZE, status: "LIVE", lastWeekOnly: true, alignPageToDay: true },
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
