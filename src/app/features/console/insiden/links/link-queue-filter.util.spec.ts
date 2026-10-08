import { describe, expect, it } from "vitest";
import {
  COMPLETED_LABEL,
  VISIBILITY_LABEL,
  appliedFiltersAreUnfiltered,
  queueQueryVars,
  type AppliedQueueFilters,
} from "./link-queue-filter.util";

function applied(overrides: Partial<AppliedQueueFilters> = {}): AppliedQueueFilters {
  return { categoryId: "", completed: "pending", visibility: "all", ...overrides };
}

describe("link-queue-filter.util", () => {
  it("labels every completed filter", () => {
    expect(COMPLETED_LABEL).toEqual({ any: "All", pending: "Pending", completed: "Completed" });
  });

  it("labels every visibility filter", () => {
    expect(VISIBILITY_LABEL).toEqual({
      all: "All links",
      visible: "Visible only",
      hidden: "Hidden only",
    });
  });

  it("only calls an unfiltered snapshot complete when every axis is clear", () => {
    expect(appliedFiltersAreUnfiltered(applied({ completed: "any" }))).toBe(true);
    expect(appliedFiltersAreUnfiltered(applied({ completed: "pending" }))).toBe(false);
    expect(appliedFiltersAreUnfiltered(applied({ completed: "any", visibility: "visible" }))).toBe(
      false,
    );
    expect(appliedFiltersAreUnfiltered(applied({ completed: "any", visibility: "hidden" }))).toBe(
      false,
    );
    expect(appliedFiltersAreUnfiltered(applied({ completed: "any", search: "lrt" }))).toBe(false);
    expect(appliedFiltersAreUnfiltered(applied({ completed: "any", lineId: "l1" }))).toBe(false);
    expect(appliedFiltersAreUnfiltered(applied({ completed: "any", dateFrom: "2026-01-01" }))).toBe(
      false,
    );
  });

  it("builds vars with unset optional keys omitted", () => {
    const vars = queueQueryVars(applied({ completed: "any" }));
    expect(vars).toEqual({ search: undefined, categoryId: undefined, completed: undefined });
    expect("hidden" in vars).toBe(false);
    expect("lineId" in vars).toBe(false);
    expect("occurredAfter" in vars).toBe(false);
  });

  it("maps the status axis to a boolean completed flag", () => {
    expect(queueQueryVars(applied({ completed: "completed" })).completed).toBe(true);
    expect(queueQueryVars(applied({ completed: "pending" })).completed).toBe(false);
  });

  it("maps the visibility axis: all omits hidden, visible/hidden send the boolean", () => {
    expect("hidden" in queueQueryVars(applied({ visibility: "all" }))).toBe(false);
    expect(queueQueryVars(applied({ visibility: "visible" })).hidden).toBe(false);
    expect(queueQueryVars(applied({ visibility: "hidden" })).hidden).toBe(true);
  });

  it("passes set filter axes through", () => {
    const vars = queueQueryVars(
      applied({
        completed: "any",
        categoryId: "c1",
        lineId: "l1",
        vehicleId: "v1",
        stationId: "s1",
      }),
    );
    expect(vars.categoryId).toBe("c1");
    expect(vars.lineId).toBe("l1");
    expect(vars.vehicleId).toBe("v1");
    expect(vars.stationId).toBe("s1");
  });
});
