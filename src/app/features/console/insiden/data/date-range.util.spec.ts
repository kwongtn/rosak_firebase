import { describe, expect, it } from "vitest";
import { dateInputToIsoEnd, dateInputToIsoStart } from "./date-range.util";

/** Local TZ is whatever the runner runs in — compute expectations from the
 * same local-time parsing the util uses so the assertions are TZ-proof. */
function localStart(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}

function localEnd(day: string): string {
  return new Date(`${day}T23:59:59.999`).toISOString();
}

describe("date-range.util", () => {
  it("converts a picked date to the ISO instant at local midnight for createdAfter", () => {
    expect(dateInputToIsoStart("2026-08-01")).toBe(localStart("2026-08-01"));
  });

  it("converts a picked date to the ISO instant at local end-of-day for createdBefore", () => {
    expect(dateInputToIsoEnd("2026-08-03")).toBe(localEnd("2026-08-03"));
  });

  it("treats an empty value as an unbounded bound", () => {
    expect(dateInputToIsoStart("")).toBeUndefined();
    expect(dateInputToIsoEnd("")).toBeUndefined();
  });

  it("returns undefined for malformed values instead of NaN dates", () => {
    expect(dateInputToIsoStart("not-a-date")).toBeUndefined();
    expect(dateInputToIsoEnd("2026-13-99")).toBeUndefined();
  });
});
