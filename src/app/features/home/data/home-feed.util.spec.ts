import { describe, expect, it } from "vitest";

import type { FeedLink, FeedLinkEdge } from "./home.queries";
import {
  FEED_PAGE_SIZE,
  HOME_FEED_COLLAPSE_VARS,
  LAST_WEEK_PAGE_SIZE,
  OFFICIAL_NOTICES_PAGE_SIZE,
  OFFICIAL_NOTICES_VARS,
  dedupeEdges,
  maxFeedTotalCount,
  mergeFeedPageInfo,
  recordSubtreeVotes,
  resolveUserVote,
} from "./home-feed.util";

function edge(id: string, cursor = `c-${id}`): FeedLinkEdge {
  return { node: { id } as FeedLink, cursor };
}

function feedLink(id: string, userVote = 0): FeedLink {
  return { id, userVote } as FeedLink;
}

describe("home-feed.util: dedupeEdges", () => {
  it("keeps the FIRST occurrence of a repeated node id", () => {
    // First-wins is the contract: page one is refetched ahead of the appended pages, so the
    // refetched copy is the newer one and must survive the overlap.
    const merged = dedupeEdges([edge("a", "1"), edge("b", "2"), edge("a", "3")]);

    expect(merged.map((e) => e.node.id)).toEqual(["a", "b"]);
    expect(merged[0].cursor).toBe("1");
  });

  it("is the same array when nothing repeats, and empty for no input", () => {
    expect(dedupeEdges([edge("a"), edge("b")]).map((e) => e.node.id)).toEqual(["a", "b"]);
    expect(dedupeEdges([])).toEqual([]);
  });
});

describe("home-feed.util: recordSubtreeVotes", () => {
  it("records a non-zero vote at every depth, including past one level", () => {
    // The live bug this walk exists to prevent was stopping at one level: a member below that read
    // as the anonymous zero because the overlay had no entry.
    const overlay: Record<string, number> = {};

    recordSubtreeVotes(
      {
        id: "root",
        userVote: 1,
        sublinks: [{ id: "child", userVote: 2, sublinks: [{ id: "grand", userVote: -1 }] }],
      },
      overlay,
    );

    expect(overlay).toEqual({ root: 1, child: 2, grand: -1 });
  });

  it("skips a zero vote, so the overlay never shadows a genuine anonymous 0", () => {
    const overlay: Record<string, number> = {};

    recordSubtreeVotes({ id: "a", userVote: 0, sublinks: [{ id: "b", userVote: 0 }] }, overlay);

    expect(overlay).toEqual({});
  });

  it("tolerates a missing child list (a hand-built fixture must not throw)", () => {
    const overlay: Record<string, number> = {};

    recordSubtreeVotes({ id: "a", userVote: 3 }, overlay);
    recordSubtreeVotes({ id: "b", userVote: 4, sublinks: null }, overlay);

    expect(overlay).toEqual({ a: 3, b: 4 });
  });
});

describe("home-feed.util: mergeFeedPageInfo", () => {
  const first = { hasNextPage: true, endCursor: "first-cursor" };

  it("is null until the first page has landed", () => {
    expect(mergeFeedPageInfo(null, false, "x")).toBeNull();
  });

  it("lets an appended reading win, including a `false` over a stale first-page `true`", () => {
    expect(mergeFeedPageInfo(first, false, "appended-cursor")).toEqual({
      hasNextPage: false,
      endCursor: "appended-cursor",
    });
  });

  it("falls back to the first page when nothing has been appended", () => {
    expect(mergeFeedPageInfo(first, null, null)).toEqual(first);
  });
});

describe("home-feed.util: maxFeedTotalCount", () => {
  it("never reports a denominator smaller than either source", () => {
    // The failure it prevents is "Showing 40 of 12": a stale first page must not shrink below the
    // appended reading, and a big first page must not be dragged down by a stale appended one.
    expect(maxFeedTotalCount(40, 12)).toBe(40);
    expect(maxFeedTotalCount(12, 40)).toBe(40);
  });

  it("treats a missing reading as zero", () => {
    expect(maxFeedTotalCount(null, null)).toBe(0);
    expect(maxFeedTotalCount(null, 7)).toBe(7);
    expect(maxFeedTotalCount(7, null)).toBe(7);
  });
});

describe("home-feed.util: resolveUserVote", () => {
  it("prefers the overlay, including a recorded zero", () => {
    expect(resolveUserVote({ a: 1 }, [feedLink("a", 5)], "a")).toBe(1);
    expect(resolveUserVote({ a: 0 }, [feedLink("a", 5)], "a")).toBe(0);
  });

  it("falls back to the anonymous feed value, then to zero", () => {
    expect(resolveUserVote({}, [feedLink("a", 5)], "a")).toBe(5);
    expect(resolveUserVote({}, [feedLink("a", 5)], "missing")).toBe(0);
  });
});

describe("home-feed.util: request constants", () => {
  it("pins the page sizes and the collapse flag every feed read shares", () => {
    expect(FEED_PAGE_SIZE).toBe(8);
    expect(LAST_WEEK_PAGE_SIZE).toBe(20);
    expect(OFFICIAL_NOTICES_PAGE_SIZE).toBe(50);
    expect(HOME_FEED_COLLAPSE_VARS).toEqual({ collapseThreads: true });
  });

  it("sends the archive with NO window flag — that is the whole of 'all time'", () => {
    expect(OFFICIAL_NOTICES_VARS).toEqual({
      first: OFFICIAL_NOTICES_PAGE_SIZE,
      status: "LIVE",
      collapseThreads: true,
    });
  });
});
