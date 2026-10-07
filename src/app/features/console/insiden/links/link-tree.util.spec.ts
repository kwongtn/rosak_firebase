import { describe, expect, it } from "vitest";
import type { SocialMediaLinkRow } from "../data/insiden-console.queries";
import {
  canMoveDown,
  canMoveUp,
  canNestUnder,
  childCountOf,
  compareStoredSequence,
  computeDepths,
  depthRailsFor,
  groupRunsByParentId,
  moveBlockedReason,
  nestBlockedReason,
  renderedLinksOf,
  runOrderIsKnown,
  siblingIndexOf,
  siblingsOf,
} from "./link-tree.util";

function makeRow(overrides: Partial<SocialMediaLinkRow> = {}): SocialMediaLinkRow {
  return {
    id: "link-1",
    url: "https://x.com/prasarana/status/1",
    title: "Service alert",
    created: "2026-08-01T09:00:00",
    occurredAt: "2026-08-01T08:30:00",
    parentId: null,
    isThreadRoot: true,
    sublinkCount: 0,
    position: 10,
    completed: false,
    completedAt: null,
    completedBy: null,
    status: "PENDING_APPROVAL",
    isAutomated: false,
    user: null,
    lines: [],
    vehicles: [],
    stations: [],
    categories: [],
    ...overrides,
  };
}

function withoutPosition(row: SocialMediaLinkRow): SocialMediaLinkRow {
  const copy = { ...row } as Record<string, unknown>;
  delete copy["position"];
  return copy as unknown as SocialMediaLinkRow;
}

describe("link-tree.util", () => {
  describe("compareStoredSequence", () => {
    it("orders by position ASC", () => {
      const a = makeRow({ id: "a", position: 20 });
      const b = makeRow({ id: "b", position: 10 });
      expect(compareStoredSequence(a, b)).toBeGreaterThan(0);
    });

    it("breaks a position tie by numeric id, not lexicographically", () => {
      const nine = makeRow({ id: "9", position: 10 });
      const ten = makeRow({ id: "10", position: 10 });
      expect(compareStoredSequence(nine, ten)).toBeLessThan(0);
    });

    it("falls back to a code-unit compare for non-decimal ids", () => {
      const a = makeRow({ id: "abc", position: 10 });
      const b = makeRow({ id: "abd", position: 10 });
      expect(compareStoredSequence(a, b)).toBeLessThan(0);
    });
  });

  describe("groupRunsByParentId", () => {
    it("groups roots under the null key and sorts each run in stored order", () => {
      const rows = [
        makeRow({ id: "b", position: 20 }),
        makeRow({ id: "a", position: 10 }),
        makeRow({ id: "c", position: 15, parentId: "a" }),
      ];
      const runs = groupRunsByParentId(rows);
      expect(runs.get(null)?.map((row) => row.id)).toEqual(["a", "b"]);
      expect(runs.get("a")?.map((row) => row.id)).toEqual(["c"]);
    });

    it("does not mutate the input array", () => {
      const rows = [makeRow({ id: "b", position: 20 }), makeRow({ id: "a", position: 10 })];
      groupRunsByParentId(rows);
      expect(rows.map((row) => row.id)).toEqual(["b", "a"]);
    });

    it("treats an absent parentId as the root run", () => {
      const copy = { ...makeRow({ id: "x" }) } as Record<string, unknown>;
      delete copy["parentId"];
      const runs = groupRunsByParentId([copy as unknown as SocialMediaLinkRow]);
      expect(runs.get(null)?.length).toBe(1);
    });
  });

  describe("computeDepths", () => {
    it("walks the loaded parent chain", () => {
      const rows = [
        makeRow({ id: "root", parentId: null }),
        makeRow({ id: "child", parentId: "root" }),
        makeRow({ id: "grand", parentId: "child" }),
      ];
      const depths = computeDepths(rows);
      expect(depths.get("root")).toBe(0);
      expect(depths.get("child")).toBe(1);
      expect(depths.get("grand")).toBe(2);
    });

    it("treats a row whose parent is not loaded as a root", () => {
      const depths = computeDepths([makeRow({ id: "orphan", parentId: "absent" })]);
      expect(depths.get("orphan")).toBe(0);
    });

    it("terminates and treats a cycle member as depth 0 for the start row", () => {
      const rows = [makeRow({ id: "a", parentId: "b" }), makeRow({ id: "b", parentId: "a" })];
      const depths = computeDepths(rows);
      expect(depths.get("a")).toBe(1);
      expect(depths.get("b")).toBe(1);
    });
  });

  it("depthRailsFor returns one entry per level", () => {
    expect(depthRailsFor(0)).toEqual([]);
    expect(depthRailsFor(3)).toHaveLength(3);
  });

  describe("sibling run helpers", () => {
    const rows = [
      makeRow({ id: "a", position: 10 }),
      makeRow({ id: "b", position: 20 }),
      makeRow({ id: "c", position: 30 }),
    ];
    const runs = groupRunsByParentId(rows);

    it("childCountOf counts loaded children only", () => {
      const withChild = groupRunsByParentId([...rows, makeRow({ id: "d", parentId: "a" })]);
      expect(childCountOf(withChild, rows[0])).toBe(1);
      expect(childCountOf(runs, rows[0])).toBe(0);
    });

    it("siblingIndexOf uses the stored run order", () => {
      expect(siblingIndexOf(runs, rows[2])).toBe(2);
      expect(siblingIndexOf(runs, makeRow({ id: "absent" }))).toBe(-1);
    });

    it("runOrderIsKnown is false when any sibling lacks position", () => {
      const broken = groupRunsByParentId([rows[0], withoutPosition(rows[1])]);
      expect(runOrderIsKnown(broken, rows[0])).toBe(false);
    });

    it("canMoveUp/canMoveDown respect the run ends and the queue gate", () => {
      expect(canMoveUp(runs, rows[0], true)).toBe(false);
      expect(canMoveUp(runs, rows[1], true)).toBe(true);
      expect(canMoveDown(runs, rows[1], true)).toBe(true);
      expect(canMoveDown(runs, rows[2], true)).toBe(false);
      expect(canMoveUp(runs, rows[1], false)).toBe(false);
      expect(canMoveDown(runs, rows[1], false)).toBe(false);
    });

    it("moveBlockedReason returns the reason or null when available", () => {
      expect(moveBlockedReason(runs, rows[1], "up", true)).toBeNull();
      expect(moveBlockedReason(runs, rows[0], "up", true)).toContain("Already first");
      expect(moveBlockedReason(runs, rows[2], "down", true)).toContain("Already last");
      expect(moveBlockedReason(runs, rows[1], "up", false)).toContain("Show all links");
      const broken = groupRunsByParentId([rows[0], withoutPosition(rows[1])]);
      expect(moveBlockedReason(broken, rows[1], "up", true)).toContain("stored order");
    });
  });

  describe("nest helpers", () => {
    it("canNestUnder needs one tick and refuses the target itself", () => {
      const link = makeRow({ id: "target" });
      expect(canNestUnder([], link)).toBe(false);
      expect(canNestUnder(["a"], link)).toBe(true);
      expect(canNestUnder(["target"], link)).toBe(false);
    });

    it("nestBlockedReason names the cycle then the empty tick", () => {
      const link = makeRow({ id: "target" });
      expect(nestBlockedReason(["target"], link)).toContain("tick");
      expect(nestBlockedReason([], link)).toContain("Tick a link first");
      expect(nestBlockedReason(["a"], link)).toBeNull();
    });
  });

  describe("renderedLinksOf", () => {
    const rows = [
      makeRow({ id: "root", parentId: null }),
      makeRow({ id: "child", parentId: "root", position: 20 }),
      makeRow({ id: "child2", parentId: "root", position: 10 }),
    ];
    const runs = groupRunsByParentId(rows);

    it("collapses children by default", () => {
      expect(renderedLinksOf(rows, new Set(), runs).map((row) => row.id)).toEqual(["root"]);
    });

    it("emits an expanded row's children directly beneath it in stored order", () => {
      const rendered = renderedLinksOf(rows, new Set(["root"]), runs);
      expect(rendered.map((row) => row.id)).toEqual(["root", "child2", "child"]);
    });

    it("appends unreachable cyclic rows after the walk", () => {
      const cyclic = [makeRow({ id: "a", parentId: "b" }), makeRow({ id: "b", parentId: "a" })];
      const rendered = renderedLinksOf(cyclic, new Set(), groupRunsByParentId(cyclic));
      expect(rendered.map((row) => row.id)).toEqual(["a", "b"]);
    });

    it("does not append a child hidden only by a collapsed ancestor", () => {
      const rendered = renderedLinksOf(rows, new Set(), runs);
      expect(rendered.map((row) => row.id)).toEqual(["root"]);
    });
  });
});
