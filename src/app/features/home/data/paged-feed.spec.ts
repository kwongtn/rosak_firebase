import { signal } from "@angular/core";
import { describe, expect, it, vi } from "vitest";

import type { FeedQueryData, FeedQueryVars } from "./home-feed.queries";
import type { FeedLink } from "./home-feed-items";
import { PagedFeed } from "./paged-feed";

function page(
  ids: string[],
  hasNextPage: boolean,
  endCursor: string | null,
  totalCount = ids.length,
): FeedQueryData {
  return {
    publicSocialMediaLinks: {
      edges: ids.map((id) => ({ node: { id } as FeedLink, cursor: `c-${id}` })),
      pageInfo: { hasNextPage, endCursor },
      totalCount,
    },
  };
}

/** A feed over a settable first page and a stubbed request, so no TestBed or HTTP is needed. */
function setup(first: FeedQueryData | undefined, vars: FeedQueryVars = { first: 2 }) {
  const firstPage = signal<FeedQueryData | undefined>(first);
  const variables = signal<FeedQueryVars>(vars);
  const request = vi.fn<(variables: FeedQueryVars) => Promise<FeedQueryData>>();
  const feed = new PagedFeed(firstPage, variables, request);
  return { feed, firstPage, variables, request };
}

describe("PagedFeed", () => {
  it("is empty until the first page lands", () => {
    const { feed, firstPage } = setup(undefined);

    expect(feed.links()).toEqual([]);
    expect(feed.pageInfo()).toBeNull();
    expect(feed.totalCount()).toBe(0);

    firstPage.set(page(["a", "b"], true, "c-b", 5));

    expect(feed.links().map((l) => l.id)).toEqual(["a", "b"]);
    expect(feed.pageInfo()).toEqual({ hasNextPage: true, endCursor: "c-b" });
    expect(feed.totalCount()).toBe(5);
  });

  it("loadMore sends the window's variables plus the cursor and appends the page", async () => {
    const { feed, request } = setup(page(["a", "b"], true, "c-b", 4), { first: 2, lineId: "L1" });
    request.mockResolvedValue(page(["c", "d"], false, "c-d", 4));

    await feed.loadMore();

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({ first: 2, lineId: "L1", after: "c-b" });
    expect(feed.links().map((l) => l.id)).toEqual(["a", "b", "c", "d"]);
    expect(feed.pageInfo()).toEqual({ hasNextPage: false, endCursor: "c-d" });
    expect(feed.totalCount()).toBe(4);
    expect(feed.isLoadingMore()).toBe(false);
  });

  it("reads the variables at call time, so a changed filter reaches the continuation", async () => {
    const { feed, variables, request } = setup(page(["a"], true, "c-a"));
    request.mockResolvedValue(page(["b"], false, "c-b"));

    variables.set({ first: 2, lineId: "L2" });
    await feed.loadMore();

    expect(request).toHaveBeenCalledWith({ first: 2, lineId: "L2", after: "c-a" });
  });

  it("keeps one copy of a row a refreshed first page and an appended page both hold", async () => {
    const { feed, firstPage, request } = setup(page(["a", "b"], true, "c-b"));
    request.mockResolvedValue(page(["c", "d"], false, "c-d"));
    await feed.loadMore();

    // The beat re-reads page one and "c" moved into it: the first page wins, no duplicate id.
    firstPage.set(page(["c", "a", "b"], true, "c-b"));

    expect(feed.links().map((l) => l.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("takes the larger of the first-page and appended totals", async () => {
    const { feed, firstPage, request } = setup(page(["a"], true, "c-a", 3));
    request.mockResolvedValue(page(["b"], false, "c-b", 9));
    await feed.loadMore();

    expect(feed.totalCount()).toBe(9);

    firstPage.set(page(["a"], true, "c-a", 12));

    expect(feed.totalCount()).toBe(12);
  });

  it("is a no-op with no next page, with no cursor, and without a first page", async () => {
    const done = setup(page(["a"], false, "c-a"));
    const noCursor = setup(page(["a"], true, null));
    const empty = setup(undefined);

    await done.feed.loadMore();
    await noCursor.feed.loadMore();
    await empty.feed.loadMore();

    expect(done.request).not.toHaveBeenCalled();
    expect(noCursor.request).not.toHaveBeenCalled();
    expect(empty.request).not.toHaveBeenCalled();
  });

  it("coalesces a second loadMore while one is in flight", async () => {
    const { feed, request } = setup(page(["a"], true, "c-a"));
    let resolve: (data: FeedQueryData) => void = () => undefined;
    request.mockReturnValue(
      new Promise<FeedQueryData>((r) => {
        resolve = r;
      }),
    );

    const first = feed.loadMore();
    const second = feed.loadMore();

    expect(feed.isLoadingMore()).toBe(true);
    resolve(page(["b"], false, "c-b"));
    await Promise.all([first, second]);

    expect(request).toHaveBeenCalledTimes(1);
    expect(feed.isLoadingMore()).toBe(false);
  });

  it("clears the in-flight flag and rethrows when the request fails", async () => {
    const { feed, request } = setup(page(["a"], true, "c-a"));
    request.mockRejectedValue(new Error("boom"));

    await expect(feed.loadMore()).rejects.toThrow("boom");

    expect(feed.isLoadingMore()).toBe(false);
    expect(feed.links().map((l) => l.id)).toEqual(["a"]);
  });

  it("reset drops the appended pages and the cursor, so the next page starts from page one", async () => {
    const { feed, request } = setup(page(["a"], true, "c-a", 2));
    request.mockResolvedValueOnce(page(["b"], false, "c-b", 2));
    await feed.loadMore();

    feed.reset();

    expect(feed.links().map((l) => l.id)).toEqual(["a"]);
    expect(feed.pageInfo()).toEqual({ hasNextPage: true, endCursor: "c-a" });

    request.mockResolvedValueOnce(page(["b"], false, "c-b", 2));
    await feed.loadMore();

    expect(request).toHaveBeenLastCalledWith({ first: 2, after: "c-a" });
  });
});
