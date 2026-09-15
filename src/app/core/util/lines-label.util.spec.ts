import { linesLabel, vehicleLinesLabel } from "./lines-label.util";

describe("linesLabel", () => {
  it("returns empty string for an empty array", () => {
    expect(linesLabel([])).toBe("");
  });

  it("returns the single code for one line", () => {
    expect(linesLabel([{ code: "A" }])).toBe("A");
  });

  it("joins multiple codes with a comma and space", () => {
    expect(linesLabel([{ code: "A" }, { code: "B" }])).toBe("A, B");
  });

  it("returns empty string so the || fallback at call sites shows the dash", () => {
    expect(linesLabel([]) || "—").toBe("—");
  });
});

describe("vehicleLinesLabel", () => {
  it("returns empty string for a vehicle with no lines", () => {
    expect(vehicleLinesLabel({ lines: [] })).toBe("");
  });

  it("joins the vehicle's line codes", () => {
    expect(
      vehicleLinesLabel({
        lines: [{ code: "A" }, { code: "B" }],
      }),
    ).toBe("A, B");
  });
});
