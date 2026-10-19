import { describe, expect, it } from "vitest";

import type { LinePulse } from "./home-board.queries";
import {
  OTHER_LINE_FAMILY,
  filterByLineFamily,
  lineFamilies,
  lineFamily,
  parseLineFamilyParam,
} from "./line-family.util";

function line(id: string, code: string): LinePulse {
  return {
    id,
    code,
    displayName: id,
    displayColor: "#000000",
    status: "ACTIVE",
    inServiceVehicleCount: 1,
    totalVehicleCount: 1,
    passengerStatus: null,
    statusReportCount: 0,
    vehicleStatusCounts: [],
    passengerStatusCount: 0,
    statusWindowMinutes: 15,
    pulseLinks: [],
  };
}

describe("lineFamily", () => {
  it("takes the leading letter run, upper-cased, so digits and suffixes fall away", () => {
    expect(lineFamily("KTM1")).toBe("KTM");
    expect(lineFamily("k10")).toBe("K");
    expect(lineFamily("KJL")).toBe("KJL");
    expect(lineFamily("  SPL ")).toBe("SPL");
  });

  it("puts a code with no leading letters, or an empty code, in the OTHER bucket", () => {
    expect(lineFamily("1")).toBe(OTHER_LINE_FAMILY);
    expect(lineFamily("")).toBe(OTHER_LINE_FAMILY);
  });
});

describe("lineFamilies", () => {
  it("lists each family once, A to Z, with OTHER always last", () => {
    const lines = [line("a", "KTM1"), line("b", "1"), line("c", "KJL"), line("d", "KTM2")];

    expect(lineFamilies(lines)).toEqual(["KJL", "KTM", OTHER_LINE_FAMILY]);
  });

  it("is empty for no lines", () => {
    expect(lineFamilies([])).toEqual([]);
  });
});

describe("filterByLineFamily", () => {
  const lines = [line("a", "KTM1"), line("b", "KJL"), line("c", "KTM2")];

  it("returns every line, as a copy, when no family is chosen", () => {
    const result = filterByLineFamily(lines, null);

    expect(result.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(result).not.toBe(lines);
  });

  it("keeps only the chosen family, in input order", () => {
    expect(filterByLineFamily(lines, "KTM").map((entry) => entry.id)).toEqual(["a", "c"]);
    expect(filterByLineFamily(lines, "XYZ")).toEqual([]);
  });
});

describe("parseLineFamilyParam", () => {
  it("normalises a well-formed family to upper case", () => {
    expect(parseLineFamilyParam("ktm")).toBe("KTM");
    expect(parseLineFamilyParam(" KJL ")).toBe("KJL");
  });

  it("reads absent, blank and malformed values as no family", () => {
    expect(parseLineFamilyParam(null)).toBeNull();
    expect(parseLineFamilyParam(undefined)).toBeNull();
    expect(parseLineFamilyParam("")).toBeNull();
    expect(parseLineFamilyParam("  ")).toBeNull();
    expect(parseLineFamilyParam("LR-T")).toBeNull();
    expect(parseLineFamilyParam("K10")).toBeNull();
    expect(parseLineFamilyParam("A".repeat(17))).toBeNull();
  });
});
