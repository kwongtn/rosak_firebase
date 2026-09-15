import { describe, expect, it } from "vitest";
import { computeJustifiedRows, JustifiedItem } from "./justified-layout.util";

interface MockPhoto extends JustifiedItem {
  id: string;
}

describe("computeJustifiedRows", () => {
  it("should return empty array for empty items array", () => {
    expect(computeJustifiedRows([], 1000, 200, 10)).toEqual([]);
  });

  it("should return empty array when containerWidth is zero", () => {
    const items: MockPhoto[] = [{ id: "1", width: 400, height: 300 }];
    expect(computeJustifiedRows(items, 0, 200, 10)).toEqual([]);
  });

  it("should return empty array when containerWidth is negative", () => {
    const items: MockPhoto[] = [{ id: "1", width: 400, height: 300 }];
    expect(computeJustifiedRows(items, -500, 200, 10)).toEqual([]);
  });

  it("should leave an incomplete single row at targetRowHeight without stretching", () => {
    const items: MockPhoto[] = [
      { id: "1", width: 200, height: 200 },
      { id: "2", width: 200, height: 200 },
    ];
    const rows = computeJustifiedRows(items, 1000, 200, 10);

    expect(rows).toHaveLength(1);
    expect(rows[0].height).toBe(200);
    expect(rows[0].cells).toEqual([
      { item: items[0], width: 200 },
      { item: items[1], width: 200 },
    ]);
  });

  it("should pack and scale a single row when items reach or exceed containerWidth", () => {
    const items: MockPhoto[] = [
      { id: "1", width: 400, height: 200 },
      { id: "2", width: 600, height: 200 },
    ];
    const rows = computeJustifiedRows(items, 1000, 200, 10);

    expect(rows).toHaveLength(1);
    expect(rows[0].height).toBeCloseTo(198);
    expect(rows[0].cells).toHaveLength(2);
    expect(rows[0].cells[0].width).toBeCloseTo(396);
    expect(rows[0].cells[1].width).toBeCloseTo(594);
    expect(rows[0].cells[0].item).toBe(items[0]);
    expect(rows[0].cells[1].item).toBe(items[1]);

    const totalWidthWithGap = rows[0].cells[0].width + rows[0].cells[1].width + 10;
    expect(totalWidthWithGap).toBeCloseTo(1000);
  });

  it("should handle multi-row layout and leave final incomplete row at targetRowHeight", () => {
    const items: MockPhoto[] = [
      { id: "1", width: 200, height: 200 },
      { id: "2", width: 200, height: 200 },
      { id: "3", width: 200, height: 200 },
      { id: "4", width: 200, height: 200 },
      { id: "5", width: 200, height: 200 },
    ];
    const rows = computeJustifiedRows(items, 600, 200, 10);

    expect(rows).toHaveLength(2);

    expect(rows[0].height).toBeCloseTo(580 / 3);
    expect(rows[0].cells).toHaveLength(3);
    const row1Total = rows[0].cells.reduce((sum, c) => sum + c.width, 0) + 2 * 10;
    expect(row1Total).toBeCloseTo(600);

    expect(rows[1].height).toBe(200);
    expect(rows[1].cells).toHaveLength(2);
    expect(rows[1].cells[0].width).toBe(200);
    expect(rows[1].cells[1].width).toBe(200);
  });

  it("should preserve aspect ratios for all items in scaled and unscaled rows", () => {
    const items: MockPhoto[] = [
      { id: "portrait", width: 150, height: 300 },
      { id: "landscape", width: 600, height: 200 },
      { id: "square", width: 250, height: 250 },
    ];
    const rowsIncomplete = computeJustifiedRows(items, 500, 100, 0);
    expect(rowsIncomplete[0].cells[0].width / rowsIncomplete[0].height).toBeCloseTo(0.5);
    expect(rowsIncomplete[0].cells[1].width / rowsIncomplete[0].height).toBeCloseTo(3.0);
    expect(rowsIncomplete[0].cells[2].width / rowsIncomplete[0].height).toBeCloseTo(1.0);

    const rowsScaled = computeJustifiedRows(items, 400, 100, 0);
    expect(rowsScaled[0].cells[0].width / rowsScaled[0].height).toBeCloseTo(0.5);
    expect(rowsScaled[0].cells[1].width / rowsScaled[0].height).toBeCloseTo(3.0);
    expect(rowsScaled[0].cells[2].width / rowsScaled[0].height).toBeCloseTo(1.0);
  });

  it("should fallback aspect to 1 when width/height is 0 or NaN", () => {
    const items: MockPhoto[] = [
      { id: "zero-width", width: 0, height: 100 },
      { id: "nan", width: 0, height: 0 },
    ];
    const rows = computeJustifiedRows(items, 1000, 100, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].cells[0].width).toBe(100);
    expect(rows[0].cells[1].width).toBe(100);
  });

  it("should handle gap = 0 correctly", () => {
    const items: MockPhoto[] = [
      { id: "1", width: 200, height: 200 },
      { id: "2", width: 200, height: 200 },
    ];
    const rows = computeJustifiedRows(items, 400, 200, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0].height).toBe(200);
    expect(rows[0].cells[0].width).toBe(200);
    expect(rows[0].cells[1].width).toBe(200);
  });
});
