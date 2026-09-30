import { formatDate } from "@angular/common";
import { describe, expect, it } from "vitest";

import { groupFeedLinksByDay } from "./feed-day-groups.util";
import { FeedLink } from "./home.queries";

function makeLink(id: string, created: string): FeedLink {
  return {
    id,
    url: `https://example.com/${id}`,
    normalizedUrl: `https://example.com/${id}`,
    title: `Link ${id}`,
    created,
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
});
