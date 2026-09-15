import { describe, expect, it } from "vitest";

import { groupLinksByDay, linkDateKey, linkDayLabel } from "./link-day-group.util";

describe("linkDateKey", () => {
  it("derives a local YYYY-MM-DD key", () => {
    expect(linkDateKey("2026-08-01T08:00:00Z")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns '' for an unparseable timestamp", () => {
    expect(linkDateKey("not-a-date")).toBe("");
  });
});

describe("linkDayLabel", () => {
  it("labels the matching key Today", () => {
    expect(linkDayLabel("2026-08-01", "2026-08-01")).toBe("Today");
  });

  it("labels the key one day before todayKey Yesterday", () => {
    expect(linkDayLabel("2026-07-31", "2026-08-01")).toBe("Yesterday");
  });

  it("leaves older days with an empty label (DatePipe formats those)", () => {
    expect(linkDayLabel("2026-06-01", "2026-08-01")).toBe("");
  });
});

describe("groupLinksByDay", () => {
  it("collapses consecutive same-day links into one group, preserving order", () => {
    const links = [
      { id: "a", created: "2026-08-01T10:00:00Z" },
      { id: "b", created: "2026-08-01T09:00:00Z" },
      { id: "c", created: "2026-07-31T23:00:00Z" },
    ];
    const groups = groupLinksByDay(links, "2026-08-01");
    expect(groups).toHaveLength(2);
    expect(groups[0].key).toBe(linkDateKey(links[0].created));
    expect(groups[0].label).toBe("Today");
    expect(groups[0].items.map((l) => l.id)).toEqual(["a", "b"]);
    expect(groups[1].label).toBe("Yesterday");
    expect(groups[1].items.map((l) => l.id)).toEqual(["c"]);
  });

  it("never emits an empty group", () => {
    expect(groupLinksByDay([], "2026-08-01")).toEqual([]);
  });

  it("surfaces unparseable dates in a headerless group", () => {
    const links = [{ id: "x", created: "garbage" }];
    const groups = groupLinksByDay(links, "2026-08-01");
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("");
    expect(groups[0].label).toBe("");
  });
});
