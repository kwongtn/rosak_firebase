import { describe, expect, it } from "vitest";
import {
  canMoveDown,
  canMoveUp,
  chronologyErrors,
  chronologyInputs,
  emptyChronology,
  indicatorDotClass,
  indicatorLabel,
  isBlankChronology,
  moveChronology,
  removeChronology,
  setAllCollapsed,
  toggleCollapsed,
  updateChronology,
  type ChronologyDraft,
} from "./chronology-list.util";

function draft(key: number, content = `c${key}`): ChronologyDraft {
  return { ...emptyChronology(key), content };
}

describe("moveChronology", () => {
  const list = [draft(1), draft(2), draft(3)];

  it("moves an item up by shifting the in-between items down", () => {
    const moved = moveChronology(list, 2, 0);
    expect(moved.map((c) => c.key)).toEqual([3, 1, 2]);
  });

  it("moves an item down by shifting the in-between items up", () => {
    const moved = moveChronology(list, 0, 2);
    expect(moved.map((c) => c.key)).toEqual([2, 3, 1]);
  });

  it("swaps adjacent items when moving by one", () => {
    const moved = moveChronology(list, 1, 0);
    expect(moved.map((c) => c.key)).toEqual([2, 1, 3]);
  });

  it("returns equal contents for a same-index move", () => {
    expect(moveChronology(list, 1, 1).map((c) => c.key)).toEqual([1, 2, 3]);
  });

  it("returns equal contents for out-of-range indices", () => {
    expect(moveChronology(list, -1, 0).map((c) => c.key)).toEqual([1, 2, 3]);
    expect(moveChronology(list, 0, 3).map((c) => c.key)).toEqual([1, 2, 3]);
    expect(moveChronology(list, Number.NaN, 1).map((c) => c.key)).toEqual([1, 2, 3]);
  });

  it("does not mutate the input list", () => {
    moveChronology(list, 0, 2);
    expect(list.map((c) => c.key)).toEqual([1, 2, 3]);
  });
});

describe("canMoveUp/canMoveDown", () => {
  const list = [draft(1), draft(2)];

  it("disables up on the first item and down on the last", () => {
    expect(canMoveUp(list, 0)).toBe(false);
    expect(canMoveDown(list, 0)).toBe(true);
    expect(canMoveUp(list, 1)).toBe(true);
    expect(canMoveDown(list, 1)).toBe(false);
  });
});

describe("toggleCollapsed", () => {
  it("flips only the targeted chronology", () => {
    const list = [draft(1), { ...draft(2), collapsed: true }];
    const next = toggleCollapsed(list, 2);
    expect(next[0].collapsed).toBe(false);
    expect(next[1].collapsed).toBe(false);
  });

  it("leaves other entries untouched when the key is absent", () => {
    const list = [draft(1)];
    expect(toggleCollapsed(list, 99)[0].collapsed).toBe(false);
  });
});

describe("setAllCollapsed", () => {
  it("collapses every entry without mutating the input", () => {
    const list = [draft(1), draft(2), { ...draft(3), collapsed: true }];
    const next = setAllCollapsed(list, true);

    expect(next.map((c) => c.collapsed)).toEqual([true, true, true]);
    expect(next).not.toBe(list);
    expect(next[0]).not.toBe(list[0]);
    expect(list.map((c) => c.collapsed)).toEqual([false, false, true]);
  });

  it("expands every entry", () => {
    const list = [
      { ...draft(1), collapsed: true },
      { ...draft(2), collapsed: true },
    ];
    const next = setAllCollapsed(list, false);

    expect(next.map((c) => c.collapsed)).toEqual([false, false]);
    expect(next[0]).not.toBe(list[0]);
  });

  it("keeps the row object reference for entries whose flag already matches", () => {
    const list = [{ ...draft(1), collapsed: true }, draft(2)];
    const next = setAllCollapsed(list, true);

    expect(next[0]).toBe(list[0]);
    expect(next[1]).not.toBe(list[1]);
  });

  it("returns a new array for an empty list", () => {
    const list: ChronologyDraft[] = [];
    const next = setAllCollapsed(list, true);

    expect(next).toEqual([]);
    expect(next).not.toBe(list);
  });
});

describe("removeChronology", () => {
  it("drops only the targeted chronology", () => {
    const list = [draft(1), draft(2), draft(3)];
    expect(removeChronology(list, 2).map((c) => c.key)).toEqual([1, 3]);
  });

  it("returns the same contents when the key is absent", () => {
    const list = [draft(1)];
    expect(removeChronology(list, 9).length).toBe(1);
  });
});

describe("updateChronology", () => {
  it("patches only the targeted row, as a new list and a new row object", () => {
    const list = [draft(1), draft(2)];
    const next = updateChronology(list, 2, { content: "Trains held", indicator: "RED" });

    expect(next).not.toBe(list);
    expect(next[1]).not.toBe(list[1]);
    expect(next[1]).toMatchObject({ key: 2, content: "Trains held", indicator: "RED" });
    // The other row keeps its identity, and the input is not mutated.
    expect(next[0]).toBe(list[0]);
    expect(list[1].content).toBe("c2");
  });

  it("returns the same contents when the key is absent", () => {
    const list = [draft(1)];
    expect(updateChronology(list, 9, { content: "x" })).toEqual(list);
  });
});

describe("isBlankChronology", () => {
  it("is blank only with no description, time or source", () => {
    expect(isBlankChronology(emptyChronology(1))).toBe(true);
    expect(isBlankChronology({ ...emptyChronology(1), content: "   " })).toBe(true);
    // The indicator alone is not content.
    expect(isBlankChronology({ ...emptyChronology(1), indicator: "RED" })).toBe(true);
    expect(isBlankChronology({ ...emptyChronology(1), datetime: "2026-08-01T08:00" })).toBe(false);
    expect(isBlankChronology({ ...emptyChronology(1), sourceUrl: "https://x.com/a/1" })).toBe(
      false,
    );
    expect(isBlankChronology(draft(1))).toBe(false);
  });
});

describe("chronologyErrors", () => {
  it("names each entry that has a time or source but no description, by its place in the list", () => {
    const list = [
      draft(5),
      emptyChronology(6),
      { ...emptyChronology(7), datetime: "2026-08-01T08:00" },
      { ...emptyChronology(8), sourceUrl: "https://x.com/a/1", content: " " },
    ];

    expect(chronologyErrors(list)).toEqual(
      new Map([
        [7, "Entry 3 has no description. Fill it in or remove it."],
        [8, "Entry 4 has no description. Fill it in or remove it."],
      ]),
    );
  });

  it("has nothing to say about a list of complete or blank entries", () => {
    expect(chronologyErrors([draft(1), emptyChronology(2)]).size).toBe(0);
  });
});

describe("chronologyInputs", () => {
  it("drops blank rows and sends empty optional fields as null", () => {
    const list = [
      emptyChronology(1),
      { ...draft(2, "Trains held"), indicator: "RED" as const },
      emptyChronology(3),
    ];

    expect(chronologyInputs(list)).toEqual([
      { indicator: "RED", datetime: null, sourceUrl: null, content: "Trains held" },
    ]);
  });
});

describe("indicatorLabel", () => {
  it("capitalizes only the first letter of every indicator", () => {
    expect(indicatorLabel("GREEN")).toBe("Green");
    expect(indicatorLabel("RED")).toBe("Red");
    expect(indicatorLabel("BLUE")).toBe("Blue");
    expect(indicatorLabel("GRAY")).toBe("Gray");
  });
});

describe("indicatorDotClass", () => {
  it("maps every indicator to the card's dot palette colors", () => {
    expect(indicatorDotClass("GREEN")).toBe("bg-emerald-500");
    expect(indicatorDotClass("RED")).toBe("bg-red-500");
    expect(indicatorDotClass("BLUE")).toBe("bg-blue-500");
    expect(indicatorDotClass("GRAY")).toBe("bg-neutral-400");
  });
});
