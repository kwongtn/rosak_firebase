import { describe, expect, it } from "vitest";

import { moveBlockedReason, nestBlockedReason } from "./my-links-reasons.util";

/** A move gate in the "available" state: browser, idle, complete run, readable order, middle row. */
const openMove = {
  isBrowser: true,
  isThreading: false,
  hasMore: false,
  runOrderKnown: true,
  index: 1,
  runLength: 3,
};

describe("moveBlockedReason", () => {
  it("is null (available) for a middle row in a readable, complete run", () => {
    expect(moveBlockedReason({ ...openMove, direction: "up" })).toBeNull();
    expect(moveBlockedReason({ ...openMove, direction: "down" })).toBeNull();
  });

  it("needs a browser session first", () => {
    expect(moveBlockedReason({ ...openMove, isBrowser: false, direction: "up" })).toBe(
      "Ordering your links needs a browser session.",
    );
  });

  it("refuses while another structural write is on the wire", () => {
    expect(moveBlockedReason({ ...openMove, isThreading: true, direction: "up" })).toBe(
      "Saving another change…",
    );
  });

  it("refuses while the list is still paging, checked before the ends", () => {
    // index 0 in a run of 3 would otherwise be "Already first"; paging wins.
    expect(moveBlockedReason({ ...openMove, hasMore: true, index: 0, direction: "up" })).toContain(
      "still loading",
    );
  });

  it("refuses an unreadable stored order, likewise before the ends", () => {
    expect(moveBlockedReason({ ...openMove, runOrderKnown: false, direction: "up" })).toContain(
      "stored order",
    );
  });

  it("refuses a row that is no longer on the page", () => {
    expect(moveBlockedReason({ ...openMove, index: -1, direction: "up" })).toBe(
      "This row is no longer on the page.",
    );
  });

  it("names the ends on the stored run", () => {
    expect(moveBlockedReason({ ...openMove, index: 0, direction: "up" })).toBe(
      "Already first among the links that share its parent.",
    );
    expect(moveBlockedReason({ ...openMove, index: 2, direction: "down" })).toBe(
      "Already last among the links that share its parent.",
    );
    // The first row can still move down, and the last can still move up.
    expect(moveBlockedReason({ ...openMove, index: 0, direction: "down" })).toBeNull();
    expect(moveBlockedReason({ ...openMove, index: 2, direction: "up" })).toBeNull();
  });
});

/** A nest gate in the "available" state: a foreign, shallow target with one ticked row. */
const openNest = {
  targetId: "target",
  isBrowser: true,
  isThreading: false,
  canNestSelection: true,
  targetSelected: false,
  hasSelectedAncestor: false,
  depth: 0,
};

describe("nestBlockedReason", () => {
  it("is null (available) for a foreign, shallow target with a ticked row", () => {
    expect(nestBlockedReason(openNest)).toBeNull();
  });

  it("answers null for a missing target before any other gate", () => {
    expect(
      nestBlockedReason({ ...openNest, targetId: "", isBrowser: false, canNestSelection: false }),
    ).toBeNull();
  });

  it("needs a browser session", () => {
    expect(nestBlockedReason({ ...openNest, isBrowser: false })).toBe(
      "Nesting needs a browser session.",
    );
  });

  it("refuses while another structural write is on the wire", () => {
    expect(nestBlockedReason({ ...openNest, isThreading: true })).toBe("Saving another change…");
  });

  it("asks for at least one ticked row", () => {
    expect(nestBlockedReason({ ...openNest, canNestSelection: false })).toBe(
      "Tick one of your own links first — it becomes a direct child of this one.",
    );
  });

  it("refuses a ticked target (self-nesting)", () => {
    expect(nestBlockedReason({ ...openNest, targetSelected: true })).toContain("ticked too");
  });

  it("refuses a target under a ticked link (a cycle)", () => {
    expect(nestBlockedReason({ ...openNest, hasSelectedAncestor: true })).toContain("cyclic");
  });

  it("refuses a target already at the deepest level", () => {
    expect(nestBlockedReason({ ...openNest, depth: 3 })).toContain("deepest level");
    // One above the cap still accepts the write.
    expect(nestBlockedReason({ ...openNest, depth: 2 })).toBeNull();
  });
});
