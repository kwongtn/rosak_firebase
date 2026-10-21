import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { klDateKey } from "../../../core/time/kl-date";
import {
  groupLinksByDay,
  linkDateKey,
  linkDayLabel,
  linkDisplayInstant,
} from "./link-day-group.util";

// The F007 bugs (a naive wall time read in the viewer's zone, a date-only key shifted by the "UTC"
// pipe) show in one zone or the other, so the zone-sensitive specs run in both: UTC is the SSR
// server's zone, Kuala Lumpur the browser's.
const ZONES = ["UTC", "Asia/Kuala_Lumpur"];

describe("linkDisplayInstant", () => {
  it("prefers the event time and falls back to the submission time", () => {
    expect(
      linkDisplayInstant({ created: "2026-08-01T10:00:00Z", occurredAt: "2026-07-30T23:00:00Z" }),
    ).toBe("2026-07-30T23:00:00Z");
    // Absent (a document that never selected it) and explicitly null must both fall back.
    expect(linkDisplayInstant({ created: "2026-08-01T10:00:00Z" })).toBe("2026-08-01T10:00:00Z");
    expect(linkDisplayInstant({ created: "2026-08-01T10:00:00Z", occurredAt: undefined })).toBe(
      "2026-08-01T10:00:00Z",
    );
    expect(linkDisplayInstant({ created: "2026-08-01T10:00:00Z", occurredAt: null })).toBe(
      "2026-08-01T10:00:00Z",
    );
  });
});

describe.each(ZONES)("linkDateKey in %s", (tz) => {
  beforeEach(() => vi.stubEnv("TZ", tz));
  afterEach(() => vi.unstubAllEnvs());

  // The key must not depend on where the code runs, or SSR (UTC) and a Malaysian browser disagree.

  it("keys a naive Kuala Lumpur wall time by its own date", () => {
    // The backend sends naive MYT (`USE_TZ = False`). 03:00 MYT is still the previous day in UTC,
    // so a `new Date()` + UTC-getter parse lands this on 2026-09-27 in a Malaysian browser.
    expect(linkDateKey("2026-09-28T03:00:00")).toBe("2026-09-28");
    expect(linkDateKey("2026-09-28T00:00:00")).toBe("2026-09-28");
    expect(linkDateKey("2026-09-28T23:59:59.999999")).toBe("2026-09-28");
    expect(linkDateKey("2026-09-24T07:56:00")).toBe("2026-09-24");
  });

  it("treats a date-only string as that date (its trailing -dd is not an offset)", () => {
    expect(linkDateKey("2026-09-28")).toBe("2026-09-28");
  });

  it("shifts an offset-bearing instant to Kuala Lumpur before taking its date", () => {
    expect(linkDateKey("2026-07-30T23:00:00Z")).toBe("2026-07-31"); // 07:00 MYT
    expect(linkDateKey("2026-07-31T15:59:59Z")).toBe("2026-07-31"); // 23:59:59 MYT
    expect(linkDateKey("2026-07-31T16:00:00Z")).toBe("2026-08-01"); // 00:00 MYT
    expect(linkDateKey("2026-07-31T10:00:00+00:00")).toBe("2026-07-31");
    expect(linkDateKey("2026-07-31T07:30:00+08:00")).toBe("2026-07-31");
    expect(linkDateKey("2026-07-31T00:30:00-0500")).toBe("2026-07-31"); // 13:30 MYT
    expect(linkDateKey("2026-09-28T15:46:46.123456+08:00")).toBe("2026-09-28");
  });

  it("parses a non-ISO timestamp instead of slicing its first ten characters", () => {
    // Date.parse accepts this, but "Sep 28, 20" is not a key: the header DatePipe would throw on it.
    expect(linkDateKey("Sep 28, 2026 15:46")).toBe("2026-09-28");
  });

  it("returns '' for an unparseable timestamp", () => {
    expect(linkDateKey("not-a-date")).toBe("");
    expect(linkDateKey("")).toBe("");
    expect(linkDateKey("2026-13-45T00:00:00")).toBe("");
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

  it("finds yesterday across month and year boundaries", () => {
    expect(linkDayLabel("2026-09-30", "2026-10-01")).toBe("Yesterday");
    expect(linkDayLabel("2025-12-31", "2026-01-01")).toBe("Yesterday");
    expect(linkDayLabel("2028-02-29", "2028-03-01")).toBe("Yesterday");
  });

  it("labels by the Kuala Lumpur day: at 03:30 MYT the 21st is Today and the 20th Yesterday", () => {
    // 2026-10-20T19:30:00Z is still the 20th in UTC.
    const todayKey = klDateKey(Date.parse("2026-10-20T19:30:00Z"));
    expect(linkDayLabel("2026-10-21", todayKey)).toBe("Today");
    expect(linkDayLabel("2026-10-20", todayKey)).toBe("Yesterday");
  });
});

describe.each(ZONES)("groupLinksByDay in %s", (tz) => {
  beforeEach(() => vi.stubEnv("TZ", tz));
  afterEach(() => vi.unstubAllEnvs());

  it("collapses consecutive same-day links into one group, preserving order", () => {
    const links = [
      { id: "a", created: "2026-08-01T10:00:00" },
      { id: "b", created: "2026-08-01T09:00:00" },
      { id: "c", created: "2026-07-31T23:00:00" },
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

  it("buckets on the event time, not the submission time", () => {
    // A back-dated report: submitted on 08-01, about something that happened on 07-31. The
    // backend orders this feed by -occurred_at, -id, so the header must follow the event day.
    const links = [
      { id: "a", created: "2026-08-01T10:00:00", occurredAt: "2026-07-31T23:00:00" },
      { id: "b", created: "2026-08-01T09:00:00", occurredAt: "2026-08-01T08:00:00" },
    ];
    const groups = groupLinksByDay(links, "2026-08-01");
    // Keying on `created` would collapse both rows into ONE "Today" group with no 07-31 header.
    expect(groups.map((group) => group.key)).toEqual(["2026-07-31", "2026-08-01"]);
    expect(groups.map((group) => group.label)).toEqual(["Yesterday", "Today"]);
    expect(groups[0].items.map((link) => link.id)).toEqual(["a"]);
    expect(groups[1].items.map((link) => link.id)).toEqual(["b"]);
  });

  it("groups a link whose host did not select occurredAt, on its created day", () => {
    // The fallback is load-bearing (occurredAt is selected per document): without it both rows
    // would fall into the headerless "" bucket instead of the Today group.
    const links = [
      { id: "a", created: "2026-08-01T10:00:00", occurredAt: undefined },
      { id: "b", created: "2026-08-01T09:00:00" },
    ];
    const groups = groupLinksByDay(links, "2026-08-01");
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("2026-08-01");
    expect(groups[0].label).toBe("Today");
    expect(groups[0].items.map((link) => link.id)).toEqual(["a", "b"]);
  });

  it("keeps the early-morning hours on their own Kuala Lumpur day", () => {
    // 00:00-07:59 MYT is the previous UTC day: the bug put these rows under the day before.
    const links = [
      { id: "a", created: "2026-10-21T07:56:00" },
      { id: "b", created: "2026-10-21T00:05:00" },
      { id: "c", created: "2026-10-20T23:55:00" },
    ];
    const groups = groupLinksByDay(links, "2026-10-21");
    expect(groups.map((group) => group.key)).toEqual(["2026-10-21", "2026-10-20"]);
    expect(groups.map((group) => group.label)).toEqual(["Today", "Yesterday"]);
    expect(groups[0].items.map((link) => link.id)).toEqual(["a", "b"]);
  });

  it("puts a naive time and an offset-bearing instant of one Kuala Lumpur day together", () => {
    const links = [
      { id: "a", created: "2026-08-01T07:30:00+08:00" },
      { id: "b", created: "2026-07-31T23:30:00Z" }, // 07:30 MYT on 08-01
      { id: "c", created: "2026-08-01T01:00:00" },
    ];
    const groups = groupLinksByDay(links, "2026-08-01");
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("2026-08-01");
    expect(groups[0].items.map((link) => link.id)).toEqual(["a", "b", "c"]);
  });

  it("surfaces unparseable dates in a headerless group", () => {
    const links = [
      // Garbage on the fallback field (host never selected occurredAt)…
      { id: "x", created: "garbage" },
      // …and garbage on the preferred field.
      { id: "y", created: "2026-08-01T10:00:00", occurredAt: "also-garbage" },
    ];
    const groups = groupLinksByDay(links, "2026-08-01");
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("");
    expect(groups[0].label).toBe("");
    expect(groups[0].items.map((link) => link.id)).toEqual(["x", "y"]);
  });
});
