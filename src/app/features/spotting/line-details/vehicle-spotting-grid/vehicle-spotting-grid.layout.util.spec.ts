import { describe, expect, it } from "vitest";

import { GridColumn, MonthGroup } from "./vehicle-spotting-grid.data.util";
import {
  dayCellClass,
  dayHeaderClass,
  MOBILE_TYPE_LABEL_CLASS,
  monthLabelShift,
} from "./vehicle-spotting-grid.layout.util";

/** 31 columns starting at index 30 — month span 840..1708 (COL_W = 28), label 80px wide. */
const GROUP: MonthGroup = {
  key: "test-month",
  label: "",
  startIndex: 30,
  columns: new Array(31).fill(null) as unknown as GridColumn[],
};
/** monthWidth (868) − labelSpace (80 + the 4px breathing room). */
const MONTH_MAX_SHIFT = 784;
const BODY_SCROLL_WIDTH = 400;
/** viewRight 1000 → 1000 − labelSpace − monthStart. */
const LABEL_WIDTH = 80;

function shift(headerScrollLeft: number, labelWidth: number | undefined = LABEL_WIDTH): number {
  return monthLabelShift(GROUP, {
    labelWidth,
    headerScrollLeft,
    bodyScrollWidth: BODY_SCROLL_WIDTH,
  });
}

describe("monthLabelShift", () => {
  it("rides the month's leading edge while entering from the right", () => {
    // Only 40px of the month visible at the right edge — used to pin to the viewport edge
    // (shift −44) and get clipped by the <th> instead of sliding in with the month.
    expect(shift(480)).toBe(0);
  });

  it("rides the month's leading edge while exiting to the right (pushed away, not covered)", () => {
    // Only 20px of the month left at the right edge — used to go negative (shift −64).
    expect(shift(460)).toBe(0);
  });

  it("pins flush to the right viewport edge once the visible slice fits the label", () => {
    expect(shift(600)).toBe(76);
  });

  it("rides the month's trailing edge while exiting to the left (unchanged reference)", () => {
    expect(shift(1668)).toBe(MONTH_MAX_SHIFT);
  });

  it("pins flush to the left viewport edge while the month is on its way out", () => {
    expect(shift(1600)).toBe(760);
  });

  it("rests centered in the month when neither edge is near", () => {
    expect(shift(1100)).toBe(394);
  });

  it("falls back to the fixed reserve when the label has not been measured yet", () => {
    // labelWidth 84 (COL_W * 3) instead of 80.
    expect(
      monthLabelShift(GROUP, {
        labelWidth: undefined,
        headerScrollLeft: 1100,
        bodyScrollWidth: BODY_SCROLL_WIDTH,
      }),
    ).toBe(392);
  });

  it("never lets the label leave its own month box across the whole scroll range", () => {
    for (let scrollLeft = -500; scrollLeft <= 2208; scrollLeft += 50) {
      const value = shift(scrollLeft);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(MONTH_MAX_SHIFT);
    }
  });
});

describe("dayHeaderClass", () => {
  const base = { dateKey: "2026-07-01", dayOfMonth: 1, isWeekend: false, isMonthStart: false };

  function col(overrides: Partial<GridColumn>): GridColumn {
    return { ...base, isToday: false, ...overrides };
  }

  it("renders the neutral header cell", () => {
    expect(dayHeaderClass(col({}))).toBe("border-b p-1 text-center font-normal whitespace-nowrap");
  });

  it("adds the month divider and weekend shade", () => {
    expect(dayHeaderClass(col({ isMonthStart: true }))).toContain("border-l");
    expect(dayHeaderClass(col({ isWeekend: true }))).toContain("bg-muted");
  });

  it("highlights today with a static (non-pulsing) ring", () => {
    const classes = dayHeaderClass(col({ isToday: true }));
    expect(classes).toContain("ring-2");
    expect(classes).not.toContain("animate-pulse");
  });
});

describe("dayCellClass", () => {
  it("adds the month divider only on month starts", () => {
    const start = dayCellClass({
      dateKey: "2026-07-01",
      dayOfMonth: 1,
      isWeekend: false,
      isMonthStart: true,
      isToday: false,
    });
    const mid = dayCellClass({
      dateKey: "2026-07-02",
      dayOfMonth: 2,
      isWeekend: false,
      isMonthStart: false,
      isToday: false,
    });

    expect(start).toBe("relative border-b p-0 align-middle border-l");
    expect(mid).toBe("relative border-b p-0 align-middle");
  });
});

describe("MOBILE_TYPE_LABEL_CLASS", () => {
  it("is a single shared look for both mobile label copies", () => {
    expect(MOBILE_TYPE_LABEL_CLASS).toContain("text-xs");
    expect(MOBILE_TYPE_LABEL_CLASS).toContain("text-muted-foreground");
    expect(MOBILE_TYPE_LABEL_CLASS).toContain("bg-muted");
  });
});
