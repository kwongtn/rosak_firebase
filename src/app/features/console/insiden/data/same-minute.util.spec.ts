import { describe, expect, it } from "vitest";
import { isSameMinute } from "./same-minute.util";

/**
 * The function is minute-precision over two naive local wall-time strings, and
 * both fixtures below are built as `YYYY-MM-DDTHH:mm:ss` with NO offset — the
 * shape the backend's `USE_TZ = False` columns actually send. That matters: the
 * expected buckets are computed from the SAME local-time parsing the util uses, so
 * every assertion is TZ-proof and none of them depends on the runner's zone.
 */

/** The 60_000-wide bucket an instant falls in — truncation, not rounding. */
function bucket(value: string): number {
  return Math.floor(Date.parse(value) / 60_000);
}

describe("same-minute.util", () => {
  it("treats byte-identical strings as the same minute", () => {
    expect(isSameMinute("2026-08-01T09:00:00", "2026-08-01T09:00:00")).toBe(true);
  });

  it("treats the same minute with different seconds as the same minute, in both orders", () => {
    // 🔴 THE REASON THIS FILE EXISTS. The cell renders `MMM d, y HH:mm`, so these
    // two print as the identical line "Aug 1, 2026 09:00" — printing a second line
    // for them would put two indistinguishable values under each other.
    expect(isSameMinute("2026-08-01T09:00:00", "2026-08-01T09:00:45")).toBe(true);
    expect(isSameMinute("2026-08-01T09:00:45", "2026-08-01T09:00:00")).toBe(true);
  });

  it("does NOT round across the minute boundary", () => {
    // 09:00:59 is IN the 09:00 bucket and 09:01:00 is in 09:01. A `Math.round`
    // implementation would push the first up into the second and call them equal,
    // which is a whole-minute disagreement reported as agreement.
    expect(bucket("2026-08-01T09:00:59")).toBe(bucket("2026-08-01T09:00:00"));
    expect(bucket("2026-08-01T09:00:59")).not.toBe(bucket("2026-08-01T09:01:00"));
    expect(isSameMinute("2026-08-01T09:00:59", "2026-08-01T09:01:00")).toBe(false);
  });

  it("reports different minutes, hours and days as different", () => {
    expect(isSameMinute("2026-08-01T09:00:00", "2026-08-01T09:01:00")).toBe(false);
    expect(isSameMinute("2026-08-01T09:00:00", "2026-08-01T10:00:00")).toBe(false);
    expect(isSameMinute("2026-08-01T23:59:59", "2026-08-02T00:00:00")).toBe(false);
    // …and the order is irrelevant, since "different" is a symmetric answer.
    expect(isSameMinute("2026-08-01T10:00:00", "2026-08-01T09:00:00")).toBe(false);
  });

  it("never lets an unparseable side count as the same minute", () => {
    // 🔴 THE GUARD THAT REPLACED THE OLD EXACT-STRING RULE. `NaN !== NaN`, so a
    // naive `parse(a) === parse(b)` would call these EQUAL and the cell would print
    // "Occurred Invalid Date" on every row whose payload was under-specified.
    expect(Number.isNaN(Date.parse("not-a-date"))).toBe(true);
    expect(isSameMinute("not-a-date", "2026-08-01T09:00:00")).toBe(false);
    expect(isSameMinute("2026-08-01T09:00:00", "not-a-date")).toBe(false);
    expect(isSameMinute("not-a-date", "still-not-a-date")).toBe(false);
  });

  it("treats TWO IDENTICAL unparseable strings as the same value", () => {
    // The exact-string fast path is deliberately exempt from the NaN guard: "these
    // are literally the same value" needs no parsing, and a row whose payload
    // under-specified BOTH clocks still has no second fact to show.
    expect(isSameMinute("not-a-date", "not-a-date")).toBe(true);
  });

  it("treats a missing side as different rather than as equal", () => {
    // Absence of evidence is not evidence of sameness: an unknown clock must still
    // earn the second line, which is the safe direction to fail in.
    expect(isSameMinute(null, "2026-08-01T09:00:00")).toBe(false);
    expect(isSameMinute("2026-08-01T09:00:00", null)).toBe(false);
    expect(isSameMinute(undefined, "2026-08-01T09:00:00")).toBe(false);
    expect(isSameMinute("", "2026-08-01T09:00:00")).toBe(false);
  });

  it("treats two missing sides as the same value only when they ARE the same value", () => {
    // The fast path is `===`, so it agrees with `null`/`undefined` exactly as the
    // language does: two `undefined`s are one absent value, and `null` vs
    // `undefined` are two DIFFERENT values — one missing clock and one empty
    // clock are not evidence that the other side's clock agrees with them.
    expect(isSameMinute(undefined, undefined)).toBe(true);
    expect(isSameMinute(null, null)).toBe(true);
    expect(isSameMinute(null, undefined)).toBe(false);
    expect(isSameMinute(undefined, null)).toBe(false);
  });

  it("agrees with its own bucket rule on every pair of a fixture grid", () => {
    // A property check over the values the queue actually carries, so a refactor of
    // the bucketing cannot quietly pass the hand-picked cases above.
    const values = [
      "2026-08-01T09:00:00",
      "2026-08-01T09:00:01",
      "2026-08-01T09:00:59",
      "2026-08-01T09:01:00",
      "2026-08-01T09:01:30",
      "2026-08-01T10:00:00",
      "2026-07-28T21:15:00",
    ];
    for (const left of values) {
      for (const right of values) {
        expect(isSameMinute(left, right)).toBe(bucket(left) === bucket(right));
      }
    }
  });
});
