import { describe, expect, it } from "vitest";

import { PublicSocialMediaLink } from "../../insiden/data/social-links.queries";
import {
  buildLinkShape,
  compareStoredSequence,
  conversationLabelFor,
  indentClassForDepth,
  ROOT_RUN_KEY,
  reorderedRunIds,
  runOf,
  runOrderIsKnown,
} from "./my-links-tree.util";

/** A row as the query actually returns it; `over` opts a test into distinct parents/positions. */
function link(id: string, over: Partial<PublicSocialMediaLink> = {}): PublicSocialMediaLink {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Link ${id}`,
    created: "2026-08-01T08:00:00Z",
    status: "LIVE",
    completed: true,
    voteScore: 0,
    userVote: 0,
    voteBreakdown: { upvotes: 0, downvotes: 0 },
    lines: [],
    vehicles: [],
    stations: [],
    parentId: null,
    isThreadRoot: true,
    sublinkCount: 0,
    position: 10,
    ...over,
  };
}

function withoutPosition(link: PublicSocialMediaLink): PublicSocialMediaLink {
  const copy = { ...link } as Record<string, unknown>;
  delete copy["position"];
  return copy as unknown as PublicSocialMediaLink;
}

describe("compareStoredSequence", () => {
  it("orders by position ASC, never by arrival order", () => {
    const rows = [
      link("a", { position: 30 }),
      link("b", { position: 10 }),
      link("c", { position: 20 }),
    ];
    expect([...rows].sort(compareStoredSequence).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("breaks a position tie by NUMERIC id, so 10 sorts after 9", () => {
    const rows = [link("10"), link("9"), link("2")];
    expect([...rows].sort(compareStoredSequence).map((r) => r.id)).toEqual(["2", "9", "10"]);
  });

  it("falls back to a code-unit compare for non-decimal ids", () => {
    const rows = [link("beta"), link("alpha")];
    expect([...rows].sort(compareStoredSequence).map((r) => r.id)).toEqual(["alpha", "beta"]);
  });

  it("stays total when position is missing (absent ranks sort last-ish by 0, comparator only)", () => {
    const rows = [link("b", { position: 20 }), withoutPosition(link("a"))];
    // The absent rank is only a tie-break of last resort inside the sort; no decision is
    // ever taken on it (runOrderIsKnown refuses the run).
    expect([...rows].sort(compareStoredSequence).map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("buildLinkShape", () => {
  it("derives depth from the loaded ancestor chain, 0 for a parent that is not loaded", () => {
    const shape = buildLinkShape([
      link("root"),
      link("child", { parentId: "root" }),
      link("grandchild", { parentId: "child" }),
      link("orphan", { parentId: "not-loaded" }),
    ]);
    expect(shape.depthById.get("root")).toBe(0);
    expect(shape.depthById.get("child")).toBe(1);
    expect(shape.depthById.get("grandchild")).toBe(2);
    expect(shape.depthById.get("orphan")).toBe(0);
  });

  it("records the ancestor chain root-first, which is what makes a cycle detectable", () => {
    const shape = buildLinkShape([
      link("root"),
      link("child", { parentId: "root" }),
      link("grandchild", { parentId: "child" }),
    ]);
    expect(shape.ancestorsById.get("grandchild")).toEqual(["root", "child"]);
  });

  it("cannot hang on hand-edited cyclic data", () => {
    const shape = buildLinkShape([link("a", { parentId: "b" }), link("b", { parentId: "a" })]);
    // The walk stops on the repeat rather than looping forever.
    expect(shape.depthById.get("a")).toBe(1);
    expect(shape.depthById.get("b")).toBe(1);
  });

  it("keys roots under ROOT_RUN_KEY and each run in stored position order", () => {
    const shape = buildLinkShape([
      link("r2", { position: 30 }),
      link("r1", { position: 10 }),
      link("m2", { parentId: "p", position: 40 }),
      link("m1", { parentId: "p", position: 20 }),
    ]);
    expect(shape.runs.get(ROOT_RUN_KEY)?.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(shape.runs.get("p")?.map((r) => r.id)).toEqual(["m1", "m2"]);
  });
});

describe("runOf", () => {
  it("returns the row's own run, and the roots run for a root", () => {
    const shape = buildLinkShape([link("root"), link("m", { parentId: "root" })]);
    expect(runOf(shape, link("root", { parentId: null })).map((r) => r.id)).toEqual(["root"]);
    expect(runOf(shape, link("m", { parentId: "root" })).map((r) => r.id)).toEqual(["m"]);
  });

  it("returns an empty run for a parent that has no loaded sibling", () => {
    const shape = buildLinkShape([link("root")]);
    expect(runOf(shape, link("x", { parentId: "ghost" }))).toEqual([]);
  });
});

describe("runOrderIsKnown", () => {
  it("is false as soon as one sibling lacks a stored position", () => {
    expect(runOrderIsKnown([link("a", { position: 10 }), link("b", { position: 20 })])).toBe(true);
    expect(runOrderIsKnown([link("a", { position: 10 }), withoutPosition(link("b"))])).toBe(false);
  });
});

describe("reorderedRunIds", () => {
  it("moves one row down and returns the WHOLE run, not the swapped pair", () => {
    const run = [link("a"), link("b"), link("c")];
    expect(reorderedRunIds(run, 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("moves one row up", () => {
    const run = [link("a"), link("b"), link("c")];
    expect(reorderedRunIds(run, 2, 1)).toEqual(["a", "c", "b"]);
  });

  it("preserves the whole set as a permutation", () => {
    const run = [link("a"), link("b"), link("c"), link("d")];
    expect([...reorderedRunIds(run, 3, 2)].sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("indentClassForDepth", () => {
  it("maps each level to a literal Tailwind step", () => {
    expect(indentClassForDepth(0)).toBe("");
    expect(indentClassForDepth(1)).toBe("pl-8");
    expect(indentClassForDepth(2)).toBe("pl-16");
    expect(indentClassForDepth(3)).toBe("pl-24");
    expect(indentClassForDepth(4)).toBe("pl-32");
  });

  it("clamps past the end of the ladder", () => {
    expect(indentClassForDepth(99)).toBe("pl-32");
  });
});

describe("conversationLabelFor", () => {
  it("passes sublinkCount + 1, so a root with ONE sublink keeps its badge", () => {
    expect(conversationLabelFor(link("r", { sublinkCount: 1 }))).toBe("2 links");
    expect(conversationLabelFor(link("r", { sublinkCount: 2 }))).toBe("3 links");
  });

  it("answers empty for a leaf, so no badge is rendered", () => {
    expect(conversationLabelFor(link("leaf", { sublinkCount: 0 }))).toBe("");
  });
});
