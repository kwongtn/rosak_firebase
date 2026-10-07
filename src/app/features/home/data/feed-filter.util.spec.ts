import { describe, expect, it } from "vitest";

import type { FeedLink, FeedLinkSublink } from "./home-feed-items";
import { FEED_LINK_STATUS_FILTERS, filterFeedLinks } from "./feed-filter.util";

/** A lone link — a root of its own conversation, the shape the feed returns for most rows. */
function makeLink(id: string, overrides: Partial<FeedLink> = {}): FeedLink {
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
    ...overrides,
  };
}

/** A member of a conversation, at any depth. */
function makeSublink(id: string, overrides: Partial<FeedLinkSublink> = {}): FeedLinkSublink {
  return {
    ...makeLink(id),
    parentId: "root",
    isThreadRoot: false,
    sublinks: [],
    ...overrides,
  } as FeedLinkSublink;
}

describe("feed-filter.util: filterFeedLinks", () => {
  const plain = makeLink("a");
  const delayed = makeLink("b", {
    title: "T-train delayed at Kajang",
    lines: [{ id: "L2", code: "SBK", displayName: "Seri Kembangan" }],
  });
  const official = makeLink("c", { isAutomated: true, title: "LRT service update" });

  it("returns every root unchanged when no axis is supplied", () => {
    const links = [plain, delayed, official];

    expect(filterFeedLinks(links, {})).toEqual(links);
    // The SAME objects, not copies: the thread wrapper renders each survivor whole.
    expect(filterFeedLinks(links, {})[0]).toBe(plain);
    expect(filterFeedLinks(links)).toEqual(links);
  });

  it("treats a blank query and a blank line id as no filter at all", () => {
    // An emptied search box and a missing `?q=` are ONE state — otherwise clearing the box would
    // silently hide the entire feed while the box reads empty.
    const links = [plain, delayed];

    expect(filterFeedLinks(links, { query: "   " })).toEqual(links);
    expect(filterFeedLinks(links, { lineId: "" })).toEqual(links);
    expect(filterFeedLinks(links, { query: null, lineId: null, status: null })).toEqual(links);
  });

  /* ---- the line axis ------------------------------------------------------------------ */

  it("keeps a root tagged with the line", () => {
    expect(filterFeedLinks([plain, delayed], { lineId: "L2" })).toEqual([delayed]);
  });

  it("keeps a conversation whose ONLY mention of the line is on a member", () => {
    // The point of treating the tree as one unit: dropping the row because the ROOT is untagged
    // would remove the very sentence that matched.
    const reply = makeSublink("a-1", { lines: [{ id: "L9", code: "PSD", displayName: "Putra" }] });
    const root = makeLink("a", { sublinks: [reply], sublinkCount: 1 });

    expect(filterFeedLinks([root], { lineId: "L9" })).toEqual([root]);
  });

  it("finds a line at ANY depth, not just the direct members", () => {
    // The vote overlay shipped this exact bug: a walk that stopped at one level. A text or line
    // filter with the same hole would hide a three-level conversation's deepest reply.
    const grandchild = makeSublink("a-1-gc", {
      lines: [{ id: "L9", code: "PSD", displayName: "Putra" }],
    });
    const member = makeSublink("a-1", { sublinks: [grandchild], sublinkCount: 1 });
    const root = makeLink("a", { sublinks: [member], sublinkCount: 2 });

    expect(filterFeedLinks([root], { lineId: "L9" })).toEqual([root]);
  });

  /* ---- the status (provenance) axis ---------------------------------------------------- */

  it("offers exactly three status values, with `all` first as the default", () => {
    // `all` first because it is the value the control starts on, matching how every other filter
    // row in this app puts its absence first.
    expect([...FEED_LINK_STATUS_FILTERS]).toEqual(["all", "official", "community"]);
  });

  it("splits official from community on the whole conversation", () => {
    const links = [plain, official];

    expect(filterFeedLinks(links, { status: "official" })).toEqual([official]);
    expect(filterFeedLinks(links, { status: "community" })).toEqual([plain]);
    expect(filterFeedLinks(links, { status: "all" })).toEqual(links);
  });

  it("treats a conversation as official when ANY member is operator-sourced", () => {
    const reply = makeSublink("a-1", { isAutomated: true });
    const root = makeLink("a", { sublinks: [reply], sublinkCount: 1 });

    expect(filterFeedLinks([root], { status: "official" })).toEqual([root]);
    expect(filterFeedLinks([root], { status: "community" })).toEqual([]);
  });

  it("does NOT treat an absent `isAutomated` as official", () => {
    // `=== true`, never truthiness — an unselected field must not claim provenance nobody sent.
    const bare = { ...makeLink("a"), isAutomated: undefined } as unknown as FeedLink;

    expect(filterFeedLinks([bare], { status: "official" })).toEqual([]);
    expect(filterFeedLinks([bare], { status: "community" })).toEqual([bare]);
  });

  /* ---- the text axis ------------------------------------------------------------------ */

  it("matches the title case-insensitively", () => {
    expect(filterFeedLinks([plain, delayed], { query: "DELAYED" })).toEqual([delayed]);
  });

  it("matches the url, the submitter's names and the line tags", () => {
    const byUrl = makeLink("u", { title: "nothing here", url: "https://twitter.com/x/status/1" });
    const byNickname = makeLink("n", {
      title: "nothing",
      user: { shortId: "zz", nickname: "Ali" },
    });
    const byShortId = makeLink("s", { title: "nothing", user: { shortId: "KILU", nickname: "" } });
    const byCode = makeLink("c", {
      title: "nothing",
      lines: [{ id: "L2", code: "SBK", displayName: "x" }],
    });

    expect(filterFeedLinks([byUrl], { query: "twitter.com" })).toEqual([byUrl]);
    expect(filterFeedLinks([byNickname], { query: "ali" })).toEqual([byNickname]);
    expect(filterFeedLinks([byShortId], { query: "kilu" })).toEqual([byShortId]);
    expect(filterFeedLinks([byCode], { query: "sbk" })).toEqual([byCode]);
  });

  it("keeps a conversation whose ONLY match is on a member", () => {
    const reply = makeSublink("a-1", { title: "Kajang line is suspended" });
    const root = makeLink("a", { sublinks: [reply], sublinkCount: 1 });

    expect(filterFeedLinks([root], { query: "suspended" })).toEqual([root]);
  });

  it("NEVER removes a nested sublink from a root it keeps", () => {
    // Acceptance rule: the root's own "N links" chip counts the whole subtree, so filtering members
    // out of a kept row would make the chip lie and expanding it would show nothing.
    const reply = makeSublink("a-1", { title: "unrelated chatter" });
    const root = makeLink("a", { title: "Kajang", sublinks: [reply], sublinkCount: 1 });

    const kept = filterFeedLinks([root], { query: "kajang" });

    expect(kept).toHaveLength(1);
    expect(kept[0].sublinks).toHaveLength(1);
    expect(kept[0].sublinks[0].id).toBe("a-1");
  });

  /* ---- combination + robustness -------------------------------------------------------- */

  it("ANDs the axes and keeps the backend's order", () => {
    const links = [plain, delayed, official];

    expect(filterFeedLinks(links, { status: "community", query: "delayed" })).toEqual([delayed]);
    expect(filterFeedLinks(links, { lineId: "L1", status: "official" })).toEqual([official]);
    expect(filterFeedLinks(links, { query: "lrt" })).toEqual([official]);
  });

  it("returns an empty list rather than throwing when nothing matches", () => {
    expect(filterFeedLinks([plain, delayed], { query: "nothing at all" })).toEqual([]);
  });

  it("survives a root with no user, no lines and no sublinks", () => {
    // `strictNullChecks` is OFF, so a hand-built fixture must not throw inside a filter.
    const bare = {
      id: "bare",
      title: null,
      url: null,
      user: null,
      lines: null,
      sublinks: null,
    } as unknown as FeedLink;

    expect(filterFeedLinks([bare], { query: "x" })).toEqual([]);
    expect(filterFeedLinks([bare], {})).toEqual([bare]);
    expect(filterFeedLinks([bare], { status: "community" })).toEqual([bare]);
  });

  it("returns an empty list for an empty input", () => {
    expect(filterFeedLinks([], { query: "anything" })).toEqual([]);
  });
});
