import { describe, expect, it } from "vitest";
import {
  canMoveDown,
  canMoveUp,
  emptyChronology,
  moveChronology,
  removeChronology,
  toggleCollapsed,
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
