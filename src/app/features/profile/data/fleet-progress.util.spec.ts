import { describe, expect, it } from "vitest";

import { buildFleetProgress, unspottedVehicles } from "./fleet-progress.util";
import type { FleetSpottedVehicle } from "./profile.queries";

type FleetLine = FleetSpottedVehicle["vehicle"]["lines"][number];

const KJL: FleetLine = { id: "4", code: "LRT KJL", totalVehicleCount: 116 };
const AGL: FleetLine = { id: "5", code: "LRT AGL", totalVehicleCount: 50 };

function spotted(id: string, lines: FleetLine[]): FleetSpottedVehicle {
  return { vehicle: { id, lines } };
}

describe("buildFleetProgress", () => {
  it("counts distinct spotted vehicles per line against the line's fleet size", () => {
    const rows = buildFleetProgress([
      spotted("1", [KJL]),
      spotted("2", [KJL]),
      spotted("3", [AGL]),
    ]);

    expect(rows.map(({ code, spotted: n, total }) => ({ code, n, total }))).toEqual([
      { code: "LRT AGL", n: 1, total: 50 },
      { code: "LRT KJL", n: 2, total: 116 },
    ]);
  });

  it("counts a vehicle on several lines toward each of them", () => {
    const rows = buildFleetProgress([spotted("1", [KJL, AGL])]);

    expect(rows.map((row) => [row.lineId, row.spotted])).toEqual([
      ["5", 1],
      ["4", 1],
    ]);
  });

  it("counts a repeated vehicle once", () => {
    const rows = buildFleetProgress([spotted("1", [KJL]), spotted("1", [KJL])]);

    expect(rows[0].spotted).toBe(1);
    expect([...rows[0].spottedIds]).toEqual(["1"]);
  });

  it("ignores a vehicle on no line", () => {
    expect(buildFleetProgress([spotted("9", [])])).toEqual([]);
  });

  it.each([
    ["an empty list", []],
    ["null", null],
    ["undefined", undefined],
  ])("returns no rows for %s", (_, input) => {
    expect(buildFleetProgress(input)).toEqual([]);
  });

  it("derives the percentage from spotted over total, unrounded", () => {
    const [row] = buildFleetProgress([spotted("1", [KJL])]);

    expect(row.percent).toBeCloseTo((1 / 116) * 100, 10);
    expect(row.percent).toBeGreaterThan(0);
  });

  it("reads a fully spotted line as exactly 100%", () => {
    const small: FleetLine = { id: "7", code: "ERL", totalVehicleCount: 2 };

    const [row] = buildFleetProgress([spotted("1", [small]), spotted("2", [small])]);

    expect(row.percent).toBe(100);
    expect(row.spotted).toBe(row.total);
  });

  it("raises the total to the spotted count when the fleet size disagrees, so a bar cannot overflow", () => {
    const stale: FleetLine = { id: "7", code: "ERL", totalVehicleCount: 1 };

    const [row] = buildFleetProgress([spotted("1", [stale]), spotted("2", [stale])]);

    expect(row.total).toBe(2);
    expect(row.percent).toBe(100);
  });

  it("reads a line with no fleet size as complete rather than dividing by zero", () => {
    // The schema says `Int!`, but the response is untyped JSON, so a missing size must not become NaN.
    const unsized = { id: "7", code: "ERL" } as FleetLine;

    const [row] = buildFleetProgress([spotted("1", [unsized])]);

    expect(row.total).toBe(1);
    expect(row.percent).toBe(100);
  });

  it("orders lines by code, digits compared as numbers", () => {
    const l2: FleetLine = { id: "2", code: "L2", totalVehicleCount: 5 };
    const l10: FleetLine = { id: "10", code: "L10", totalVehicleCount: 5 };
    const l1: FleetLine = { id: "1", code: "L1", totalVehicleCount: 5 };

    const rows = buildFleetProgress([spotted("1", [l10, l2, l1])]);

    expect(rows.map((row) => row.code)).toEqual(["L1", "L2", "L10"]);
  });
});

describe("unspottedVehicles", () => {
  const roster = [
    { id: "10", identificationNo: "EMU10" },
    { id: "2", identificationNo: "EMU2" },
    { id: "1", identificationNo: "EMU1" },
    { id: "3", identificationNo: "EMU3" },
  ];

  it("drops the spotted vehicles and orders the rest by number, digits as numbers", () => {
    const missing = unspottedVehicles(roster, new Set(["1"]));

    expect(missing.map((vehicle) => vehicle.identificationNo)).toEqual(["EMU2", "EMU3", "EMU10"]);
  });

  it("returns the whole roster when nothing is spotted", () => {
    expect(unspottedVehicles(roster, new Set())).toHaveLength(4);
  });

  it("returns nothing when every vehicle is spotted", () => {
    expect(unspottedVehicles(roster, new Set(["1", "2", "3", "10"]))).toEqual([]);
  });

  it("does not reorder or mutate the roster it was given", () => {
    const before = roster.map((vehicle) => vehicle.id);

    unspottedVehicles(roster, new Set());

    expect(roster.map((vehicle) => vehicle.id)).toEqual(before);
  });

  it("orders numbers that mix text and a suffix the way a reader counts them", () => {
    const mixed = [
      { id: "1", identificationNo: "07 (Old)" },
      { id: "2", identificationNo: "01 (24 Renum)" },
      { id: "3", identificationNo: "13 (30 Renum)" },
    ];

    expect(unspottedVehicles(mixed, new Set()).map((v) => v.identificationNo)).toEqual([
      "01 (24 Renum)",
      "07 (Old)",
      "13 (30 Renum)",
    ]);
  });
});
