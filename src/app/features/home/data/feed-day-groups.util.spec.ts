import { formatDate } from "@angular/common";
import { describe, expect, it } from "vitest";

import { groupFeedLinksByDay } from "./feed-day-groups.util";
import { FeedLink } from "./home.queries";

function makeLink(id: string, occurredAt: string): FeedLink {
  return {
    id,
    url: `https://example.com/${id}`,
    normalizedUrl: `https://example.com/${id}`,
    title: `Link ${id}`,
    created: "2026-09-30T23:50:00",
    // Day grouping keys on the DISPLAYED instant (occurredAt ?? created); this fixture sets
    // `created` to a deliberately DISAGREEING value so any case that regresses to created-keying
    // fails loudly instead of passing by coincidence. Overrides below set both explicitly.
    occurredAt,
    threadId: null,
    isThreadRoot: true,
    threadSize: 1,
    threadLinks: [],
    status: "LIVE",
    completed: false,
    isAutomated: false,
    voteScore: 0,
    userVote: 0,
    voteBreakdown: { upvotes: 0, downvotes: 0 },
    lines: [],
    user: null,
  };
}

/** One link that did NOT select `occurredAt` — the `occurredAt ?? created` fallback.
 *
 *  `FeedLink.occurredAt` is a REQUIRED `string` (the backend column is NOT NULL), so "a host that
 *  never selected it" is only expressible as a fixture through a cast. The cast is the point of
 *  the case: it pins the runtime shape a partially-selecting host hands the util, which must still
 *  bucket by `created` instead of producing an `Invalid Date` group. */
function withoutOccurredAt(link: FeedLink): FeedLink {
  return { ...link, occurredAt: undefined } as unknown as FeedLink;
}

// Local (no timezone suffix) timestamps — `new Date()` parses these as local time, matching the
// naive Asia/Kuala_Lumpur datetimes the backend sends.
const NOW = new Date(2026, 8, 30, 12, 0, 0); // 2026-09-30 local noon

describe("groupFeedLinksByDay", () => {
  it("returns no groups for an empty list", () => {
    expect(groupFeedLinksByDay([], NOW)).toEqual([]);
  });

  it("labels the current day Today and the day before Yesterday", () => {
    const groups = groupFeedLinksByDay(
      [makeLink("a", "2026-09-30T09:00:00"), makeLink("b", "2026-09-29T22:00:00")],
      NOW,
    );

    expect(groups.map((g) => g.key)).toEqual(["2026-09-30", "2026-09-29"]);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday"]);
  });

  it("formats older days as 'EEE, d MMM'", () => {
    const groups = groupFeedLinksByDay([makeLink("a", "2026-09-25T09:00:00")], NOW);

    expect(groups[0].label).toBe(formatDate(new Date(2026, 8, 25, 9, 0, 0), "EEE, d MMM", "en-US"));
  });

  it("merges non-adjacent same-day links into one group, preserving first-encounter order", () => {
    const groups = groupFeedLinksByDay(
      [
        makeLink("a", "2026-09-30T09:00:00"),
        makeLink("b", "2026-09-29T09:00:00"),
        makeLink("c", "2026-09-30T08:00:00"),
      ],
      NOW,
    );

    expect(groups.map((g) => g.key)).toEqual(["2026-09-30", "2026-09-29"]);
    expect(groups[0].links.map((l) => l.id)).toEqual(["a", "c"]);
    expect(groups[1].links.map((l) => l.id)).toEqual(["b"]);
  });

  it("is deterministic for a pinned now", () => {
    const links = [makeLink("a", "2026-09-30T09:00:00")];
    expect(groupFeedLinksByDay(links, NOW)).toEqual(groupFeedLinksByDay(links, NOW));
    expect(groupFeedLinksByDay(links, NOW)[0].label).toBe("Today");
  });

  it("buckets by occurredAt even when created disagrees and says another day", () => {
    // Every fixture's `created` is 2026-09-30T23:50 (see makeLink), so a regression to
    // created-keying collapses all three links into one "Today" group and fails these keys.
    const groups = groupFeedLinksByDay(
      [
        makeLink("a", "2026-09-29T09:00:00"), // yesterday's disruption, reported this morning
        makeLink("b", "2026-09-30T08:00:00"),
        makeLink("c", "2026-09-25T20:00:00"),
      ],
      NOW,
    );

    expect(groups.map((g) => g.key)).toEqual(["2026-09-29", "2026-09-30", "2026-09-25"]);
    expect(groups.map((g) => g.label)).toEqual([
      "Yesterday",
      "Today",
      formatDate(new Date(2026, 8, 25, 20, 0, 0), "EEE, d MMM", "en-US"),
    ]);
  });

  it("keeps the label tied to the occurredAt day, not the created day", () => {
    // One link, two `created` values, one `occurredAt`: neither the key nor the label may move.
    const early = groupFeedLinksByDay([makeLink("a", "2026-09-29T09:00:00")], NOW)[0];
    const late = groupFeedLinksByDay(
      [{ ...makeLink("a", "2026-09-29T09:00:00"), created: "2026-09-30T23:50:00" }],
      NOW,
    )[0];

    expect(early.key).toBe("2026-09-29");
    expect(late).toEqual(early);
  });

  it("falls back to created when a link carries no occurredAt", () => {
    const groups = groupFeedLinksByDay(
      [
        withoutOccurredAt({
          ...makeLink("a", "2026-09-30T09:00:00"),
          created: "2026-09-30T09:00:00",
        }),
        withoutOccurredAt({
          ...makeLink("b", "2026-09-30T09:00:00"),
          created: "2026-09-28T09:00:00",
        }),
      ],
      NOW,
    );

    expect(groups.map((g) => g.key)).toEqual(["2026-09-30", "2026-09-28"]);
    expect(groups[0].label).toBe("Today");
  });

  it("merges a fallback link into a present one when both say the same day", () => {
    // A mixed page (documents migrating one query at a time) must still collapse into one group,
    // which only holds if the fallback and the primary key resolve to the same calendar day.
    const groups = groupFeedLinksByDay(
      [
        makeLink("a", "2026-09-30T07:00:00"),
        withoutOccurredAt({
          ...makeLink("b", "2026-09-30T07:00:00"),
          created: "2026-09-30T08:00:00",
        }),
      ],
      NOW,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].links.map((l) => l.id)).toEqual(["a", "b"]);
  });
});
