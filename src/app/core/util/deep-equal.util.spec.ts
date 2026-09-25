import { deepEqual } from "./deep-equal.util";

describe("deep-equal", () => {
  it("uses Object.is semantics for identical values and primitives", () => {
    const object = { id: "1" };
    const symbol = Symbol("id");

    expect(deepEqual(object, object)).toBe(true);
    expect(deepEqual("value", "value")).toBe(true);
    expect(deepEqual(NaN, NaN)).toBe(true);
    expect(deepEqual(0, -0)).toBe(false);
    expect(deepEqual(symbol, symbol)).toBe(true);
    expect(deepEqual(symbol, Symbol("id"))).toBe(false);
  });

  it("compares nested arrays and plain objects by value", () => {
    expect(
      deepEqual(
        { lines: [{ id: "1", tags: ["active", "visible"] }], count: 1 },
        { count: 1, lines: [{ tags: ["active", "visible"], id: "1" }] },
      ),
    ).toBe(true);
  });

  it("supports null-prototype plain objects", () => {
    const first = Object.assign(Object.create(null) as Record<string, unknown>, { id: "1" });
    const second = Object.assign(Object.create(null) as Record<string, unknown>, { id: "1" });

    expect(deepEqual(first, second)).toBe(true);
  });

  it("rejects arrays with different lengths, elements, or object partners", () => {
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual([1, 2], [1, 3])).toBe(false);
    expect(deepEqual([1], { "0": 1 })).toBe(false);
    expect(deepEqual({ "0": 1 }, [1])).toBe(false);
  });

  it("rejects plain objects with different keys or values", () => {
    expect(deepEqual({ id: "1" }, { id: "1", name: "Line" })).toBe(false);
    expect(deepEqual({ id: "1" }, { code: "1" })).toBe(false);
    expect(deepEqual({ id: "1" }, { id: "2" })).toBe(false);
  });

  it("does not structurally compare host objects or class instances", () => {
    class PayloadRecord {
      constructor(readonly id: string) {}
    }

    const date = new Date("2026-09-25T00:00:00.000Z");
    const map = new Map([["id", "1"]]);
    const set = new Set(["1"]);
    const instance = new PayloadRecord("1");

    expect(deepEqual(date, new Date(date))).toBe(false);
    expect(deepEqual(map, new Map(map))).toBe(false);
    expect(deepEqual(set, new Set(set))).toBe(false);
    expect(deepEqual(instance, new PayloadRecord("1"))).toBe(false);
    expect(deepEqual(instance, instance)).toBe(true);
  });
});
