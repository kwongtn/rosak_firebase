import { describe, expect, it } from "vitest";

import {
  areAllSelected,
  canGroup,
  selectedWithin,
  threadLabel,
  toggleSelection,
} from "./link-thread-selection.util";

describe("toggleSelection", () => {
  it("appends an id that is not selected yet", () => {
    expect(toggleSelection(["1"], "2")).toEqual(["1", "2"]);
  });

  it("appends to an empty selection", () => {
    expect(toggleSelection([], "1")).toEqual(["1"]);
  });

  it("removes an id that is already selected", () => {
    expect(toggleSelection(["1", "2", "3"], "2")).toEqual(["1", "3"]);
  });

  it("toggles back to empty when the last id is removed", () => {
    expect(toggleSelection(["1"], "1")).toEqual([]);
  });

  it("returns a NEW array and leaves the input untouched", () => {
    // Signals compare by reference: an in-place push/splice would hand the signal back the SAME
    // array, change detection would not fire, and the checkbox would freeze. Both directions are
    // asserted because the add path is the one that "feels" harmless.
    const original = ["1", "2"];
    const snapshot = [...original];

    const added = toggleSelection(original, "3");
    expect(added).not.toBe(original);
    expect(original).toEqual(snapshot);
    expect(added).toHaveLength(3);

    const removed = toggleSelection(original, "1");
    expect(removed).not.toBe(original);
    expect(original).toEqual(snapshot);
    expect(removed).toHaveLength(1);
  });

  it("removes EVERY copy of a duplicated id, not just the first", () => {
    // toggleSelection cannot produce a duplicate, but a host that concatenated two pages'
    // selections can. A splice-at-first-match removal would leave a ghost selection behind and the
    // row would render permanently half-checked.
    expect(toggleSelection(["1", "1", "2"], "1")).toEqual(["2"]);
  });

  it("treats a duplicated id as present, so toggling removes rather than adds a third copy", () => {
    expect(toggleSelection(["7", "7"], "7")).toEqual([]);
  });

  it("round-trips: toggle on then off returns an equivalent selection", () => {
    const start = ["1"];
    const on = toggleSelection(start, "2");
    const off = toggleSelection(on, "2");
    expect(off).toEqual(start);
    expect(off).not.toBe(start);
  });
});

describe("areAllSelected", () => {
  it("is true only when every visible id is selected", () => {
    expect(areAllSelected(["1", "2", "9"], ["1", "2"])).toBe(true);
  });

  it("is false when one visible id is missing", () => {
    expect(areAllSelected(["1"], ["1", "2"])).toBe(false);
  });

  it("is false over ZERO ids — a Select-all checkbox must never render as checked", () => {
    // `[].every(...)` is vacuously true, so the naive expression lies here. Shown separately
    // because it is the one branch a reviewer would assume is unreachable: empty queue, exhausted
    // last page, or a search that matched nothing all land on it.
    expect(areAllSelected([], [])).toBe(false);
    expect(areAllSelected(["1"], [])).toBe(false);
  });

  it("is false for an empty selection with a non-empty page", () => {
    expect(areAllSelected([], ["1", "2"])).toBe(false);
  });

  it("only asks about membership, not about order or about extra selected ids", () => {
    expect(areAllSelected(["2", "1", "3"], ["1", "2"])).toBe(true);
  });

  it("survives a duplicated id on either side", () => {
    expect(areAllSelected(["1", "1"], ["1", "1"])).toBe(true);
    expect(areAllSelected(["1"], ["1", "2", "2"])).toBe(false);
  });
});

describe("canGroup", () => {
  it("is false for an empty selection", () => {
    expect(canGroup([])).toBe(false);
  });

  it("is false for exactly ONE link — the whole point of the function", () => {
    // A one-link thread is a no-op that renders as a thread: the row grows an inert root, and the
    // backend's root election would pick that single link as its own root.
    expect(canGroup(["1"])).toBe(false);
  });

  it("is true at exactly two links", () => {
    expect(canGroup(["1", "2"])).toBe(true);
  });

  it("is true for larger selections", () => {
    expect(canGroup(["1", "2", "3", "4"])).toBe(true);
  });

  it("counts DISTINCT ids, so a duplicated selection is not groupable", () => {
    // The backend rejects a repeated id outright ("The selected social media links repeat an
    // id."), and the call is all-or-nothing — so `["1", "1"]` is not two links, it is a rejection.
    expect(canGroup(["1", "1"])).toBe(false);
    expect(canGroup(["1", "1", "2"])).toBe(true);
  });
});

describe("selectedWithin", () => {
  it("keeps only the selected ids that are visible", () => {
    expect(selectedWithin(["3", "1", "9"], ["1", "2", "3"])).toEqual(["3", "1"]);
  });

  it("preserves the selection's order, not the page's", () => {
    // The result feeds `[ID!]!` and is what the user saw themselves pick, in that order.
    expect(selectedWithin(["b", "a"], ["a", "b"])).toEqual(["b", "a"]);
  });

  it("returns everything when the whole page is selected", () => {
    expect(selectedWithin(["1", "2"], ["1", "2"])).toEqual(["1", "2"]);
  });

  it("returns an empty array when nothing overlaps", () => {
    expect(selectedWithin(["9", "8"], ["1", "2"])).toEqual([]);
  });

  it("returns an empty array when the page is empty", () => {
    expect(selectedWithin(["1", "2"], [])).toEqual([]);
  });

  it("deduplicates a repeated visible id — the result feeds a non-null-element list", () => {
    // A row rendered twice by a join, or an optimistic row plus its refetched twin, would otherwise
    // put the same id in `[ID!]!` twice, which the backend rejects as a whole.
    expect(selectedWithin(["1"], ["1", "1"])).toEqual(["1"]);
  });

  it("returns a NEW array and never mutates either argument", () => {
    const selected = ["1", "9"];
    const ids = ["1", "2"];
    const result = selectedWithin(selected, ids);
    expect(result).not.toBe(selected);
    expect(selected).toEqual(["1", "9"]);
    expect(ids).toEqual(["1", "2"]);
  });
});

describe("threadLabel", () => {
  it("returns '' when the host did not select threadSize", () => {
    expect(threadLabel(undefined)).toBe("");
  });

  it("returns '' for an explicit null", () => {
    expect(threadLabel(null)).toBe("");
  });

  it("returns '' for 0", () => {
    // Not a real backend value (threadSize is 1 + visible members), but a host that computed a
    // filtered count can produce it, and "0 links" must never reach a screen.
    expect(threadLabel(0)).toBe("");
  });

  it("returns '' for 1 — every unthreaded link is already a one-member thread root", () => {
    // The single most important branch: this is what makes an ordinary row show no chip at all.
    expect(threadLabel(1)).toBe("");
  });

  it("returns '' for a negative size", () => {
    expect(threadLabel(-3)).toBe("");
  });

  it("returns '' for a non-finite size rather than rendering 'NaN links'", () => {
    expect(threadLabel(Number.NaN)).toBe("");
    expect(threadLabel(Number.POSITIVE_INFINITY)).toBe("");
  });

  it("pluralises from 2 upward", () => {
    expect(threadLabel(2)).toBe("2 links");
    expect(threadLabel(3)).toBe("3 links");
    expect(threadLabel(42)).toBe("42 links");
  });

  it("is the single source of the plural — one count, one string, and the plural differs from the singular", () => {
    // Both surfaces call this one function, so the console chip and the card badge cannot disagree.
    // The load-bearing half of that claim is the DIFFERENCE: `threadLabel(1)` is "" (nothing to say
    // about a link that is only itself) while `threadLabel(2)` is the plural, so a consumer that
    // switches on "is there a label" and a consumer that renders it can never both fire on the same
    // row. A self-comparison (`threadLabel(2) === threadLabel(2)`) asserted nothing at all.
    expect(threadLabel(2)).toBe("2 links");
    expect(threadLabel(1)).toBe("");
    expect(threadLabel(2)).not.toBe(threadLabel(1));
    expect(threadLabel(7)).toBe("7 links");
  });
});
