import { describe, expect, it } from "vitest";
import { toggleCheckedRange, useBulkActions } from "./use-bulk-actions";

const IDS = ["a", "b", "c", "d", "e"];

describe("toggleCheckedRange (pure)", () => {
  it("checks the inclusive range downwards from the anchor", () => {
    const next = toggleCheckedRange(new Set(), IDS, "a", "c", true);
    expect([...next]).toEqual(["a", "b", "c"]);
  });

  it("checks the inclusive range upwards from the anchor", () => {
    const next = toggleCheckedRange(new Set(), IDS, "c", "a", true);
    expect([...next]).toEqual(["a", "b", "c"]);
  });

  it("includes both endpoints, not just the rows strictly between them", () => {
    const next = toggleCheckedRange(new Set(["b"]), IDS, "b", "b", true);
    expect([...next]).toEqual(["b"]);
  });

  it("unchecks the whole range when the target row was checked", () => {
    const next = toggleCheckedRange(new Set(["a", "b", "c", "z"]), IDS, "a", "c", false);
    expect([...next]).toEqual(["z"]);
  });

  it("keeps selection outside the range untouched", () => {
    const next = toggleCheckedRange(new Set(["a", "e"]), IDS, "b", "d", true);
    expect([...next].sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("toggles only the target row when there is no anchor", () => {
    const next = toggleCheckedRange(new Set(["a"]), IDS, null, "c", true);
    expect([...next].sort()).toEqual(["a", "c"]);
  });

  it("toggles only the target row when the anchor is no longer in the list", () => {
    const next = toggleCheckedRange(new Set(["b"]), IDS, "gone", "d", true);
    expect([...next].sort()).toEqual(["b", "d"]);
  });

  it("toggles only the target row when the target is not in the list", () => {
    const next = toggleCheckedRange(new Set(["a"]), IDS, "a", "gone", true);
    expect([...next]).toEqual(["a"]);
  });

  it("never mutates the set it is given", () => {
    const checked = new Set(["a"]);
    toggleCheckedRange(checked, IDS, "a", "d", true);
    expect([...checked]).toEqual(["a"]);
  });

  it("returns a new set instance every call", () => {
    const checked = new Set(["a"]);
    expect(toggleCheckedRange(checked, IDS, "a", "b", true)).not.toBe(checked);
  });
});

describe("useBulkActions", () => {
  it("starts empty with no anchor", () => {
    const bulk = useBulkActions();
    expect(bulk.checkedIds()).toEqual(new Set());
    expect(bulk.checkedCount()).toBe(0);
    expect(bulk.anchorId()).toBeNull();
  });

  it("toggleChecked adds then removes an id and tracks the count", () => {
    const bulk = useBulkActions();
    bulk.toggleChecked("a");
    expect(bulk.checkedIds()).toEqual(new Set(["a"]));
    expect(bulk.checkedCount()).toBe(1);
    bulk.toggleChecked("a");
    expect(bulk.checkedIds()).toEqual(new Set());
  });

  it("toggleChecked makes the clicked row the new anchor", () => {
    const bulk = useBulkActions();
    bulk.toggleChecked("a");
    expect(bulk.anchorId()).toBe("a");
    bulk.toggleChecked("c");
    expect(bulk.anchorId()).toBe("c");
  });

  it("clears the anchor once the selection is emptied", () => {
    const bulk = useBulkActions();
    bulk.toggleChecked("a");
    bulk.toggleChecked("a");
    expect(bulk.anchorId()).toBeNull();
  });

  it("keeps the anchor across a range so the range can be retargeted", () => {
    const bulk = useBulkActions();
    bulk.toggleChecked("b");
    bulk.toggleCheckedInRange(IDS, "d", true);
    expect([...bulk.checkedIds()]).toEqual(["b", "c", "d"]);
    expect(bulk.anchorId()).toBe("b");
    // Second shift-click un-checks the same range.
    bulk.toggleCheckedInRange(IDS, "d", false);
    expect(bulk.checkedIds()).toEqual(new Set());
    expect(bulk.anchorId()).toBeNull();
  });

  it("clears both the selection and the anchor on clearSelection", () => {
    const bulk = useBulkActions();
    bulk.toggleChecked("a");
    bulk.clearSelection();
    expect(bulk.checkedIds()).toEqual(new Set());
    expect(bulk.anchorId()).toBeNull();
  });

  it("resetAnchor drops the anchor but keeps the selection", () => {
    const bulk = useBulkActions();
    bulk.toggleChecked("a");
    bulk.resetAnchor();
    expect(bulk.anchorId()).toBeNull();
    expect(bulk.checkedIds()).toEqual(new Set(["a"]));
  });

  it("a shift-range after resetAnchor only touches the clicked row", () => {
    const bulk = useBulkActions();
    bulk.toggleChecked("a");
    bulk.resetAnchor();
    bulk.toggleCheckedInRange(IDS, "d", true);
    expect([...bulk.checkedIds()].sort()).toEqual(["a", "d"]);
  });

  it("does not mutate the previous set instance", () => {
    const bulk = useBulkActions();
    bulk.toggleChecked("a");
    const first = bulk.checkedIds();
    bulk.toggleChecked("b");
    expect([...first]).toEqual(["a"]);
    expect(bulk.checkedIds()).not.toBe(first);
  });
});
