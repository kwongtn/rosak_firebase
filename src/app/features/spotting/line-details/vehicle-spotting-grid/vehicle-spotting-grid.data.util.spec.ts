import { describe, expect, it } from "vitest";

import { VehicleRow, VehicleType } from "../../data/spotting.queries";
import {
  aggregateSpottingsFor,
  buildCountsByKey,
  buildGridSections,
  buildMonthGroups,
  MOBILE_PINNED_H,
  ROW_H,
  spottingCountFor,
} from "./vehicle-spotting-grid.data.util";

function makeVehicle(
  id: string,
  identificationNo: string,
  status: VehicleRow["status"],
): VehicleRow {
  return {
    id,
    identificationNo,
    status,
    nickname: null,
    lastSpottingDate: null,
    inServiceSince: null,
    spottingCount: 0,
    notes: null,
    incidentCount: 0,
    wheelStatus: null,
  };
}

function makeVehicleType(id: string, displayName: string, vehicles: VehicleRow[]): VehicleType {
  return {
    id,
    internalName: id,
    displayName,
    vehicleStatusInServiceCount: vehicles.length,
    vehicleStatusNotSpottedCount: 0,
    vehicleStatusOutOfServiceCount: 0,
    vehicleStatusDecommissionedCount: 0,
    vehicleStatusMarriedCount: 0,
    vehicleStatusTestingCount: 0,
    vehicleStatusUnknownCount: 0,
    vehicleTotalCount: vehicles.length,
    vehicles,
  };
}

describe("buildGridSections", () => {
  it("sorts types by display name and vehicles numeric-aware by identification number", () => {
    const types = [
      makeVehicleType("b", "Beta", [makeVehicle("v2", "10", "IN_SERVICE")]),
      makeVehicleType("a", "Alpha", [
        makeVehicle("v1", "2", "IN_SERVICE"),
        makeVehicle("v3", "10", "IN_SERVICE"),
      ]),
    ];

    const sections = buildGridSections(types, null);

    expect(sections.map((s) => s.typeId)).toEqual(["a", "b"]);
    expect(sections[0].rows.map((r) => r.identificationNo)).toEqual(["2", "10"]);
    expect(sections[0].rows[0]).toEqual({
      vehicleId: "v1",
      identificationNo: "2",
      status: "IN_SERVICE",
    });
  });

  it("filters vehicles by status and drops sections left empty", () => {
    const types = [
      makeVehicleType("a", "Alpha", [
        makeVehicle("v1", "1", "IN_SERVICE"),
        makeVehicle("v2", "2", "OUT_OF_SERVICE"),
      ]),
      makeVehicleType("b", "Beta", [makeVehicle("v3", "3", "OUT_OF_SERVICE")]),
    ];

    const sections = buildGridSections(types, "IN_SERVICE");

    expect(sections).toHaveLength(1);
    expect(sections[0].typeId).toBe("a");
    expect(sections[0].rows.map((r) => r.vehicleId)).toEqual(["v1"]);
  });
});

describe("buildMonthGroups", () => {
  it("expands each month into its days and accumulates flattened start indexes", () => {
    const groups = buildMonthGroups(
      [new Date(Date.UTC(2026, 6, 1)), new Date(Date.UTC(2026, 7, 1))],
      "2026-07-15",
    );

    expect(groups).toHaveLength(2);
    expect(groups[0].key).toBe("2026-6");
    expect(groups[0].label).toBe("Jul 2026");
    expect(groups[0].startIndex).toBe(0);
    expect(groups[0].columns).toHaveLength(31);
    expect(groups[1].key).toBe("2026-7");
    expect(groups[1].label).toBe("Aug 2026");
    expect(groups[1].startIndex).toBe(31);
    expect(groups[1].columns).toHaveLength(31);
  });

  it("marks month starts, weekends, and today", () => {
    const [july] = buildMonthGroups([new Date(Date.UTC(2026, 6, 1))], "2026-07-15");

    expect(july.columns[0].isMonthStart).toBe(true);
    expect(july.columns[1].isMonthStart).toBe(false);
    // 2026-07-04 is a Saturday, 2026-07-05 a Sunday, 2026-07-06 a Monday.
    expect(july.columns[3].isWeekend).toBe(true);
    expect(july.columns[4].isWeekend).toBe(true);
    expect(july.columns[5].isWeekend).toBe(false);
    expect(july.columns[14].isToday).toBe(true);
    expect(july.columns[13].isToday).toBe(false);
  });
});

describe("buildCountsByKey / spottingCountFor / aggregateSpottingsFor", () => {
  const counts = buildCountsByKey([
    { dateKey: "2026-08-10", count: 2, vehicle: { id: "v1" } },
    { dateKey: "2026-08-10", count: 3, vehicle: { id: "v2" } },
  ]);

  it("keys counts by vehicle|date and defaults missing cells to zero", () => {
    expect(spottingCountFor(counts, "v1", "2026-08-10")).toBe(2);
    expect(spottingCountFor(counts, "v1", "2026-08-11")).toBe(0);
  });

  it("sums every row in a section for one date", () => {
    const section = {
      typeId: "a",
      typeName: "Alpha",
      rows: [
        { vehicleId: "v1", identificationNo: "1", status: "IN_SERVICE" as const },
        { vehicleId: "v2", identificationNo: "2", status: "IN_SERVICE" as const },
      ],
    };
    expect(aggregateSpottingsFor(section, "2026-08-10", counts)).toBe(5);
    expect(aggregateSpottingsFor(section, "2026-08-11", counts)).toBe(0);
  });
});

describe("grid constants", () => {
  it("derives the mobile pinned band from two rows", () => {
    expect(ROW_H).toBe(32);
    expect(MOBILE_PINNED_H).toBe(ROW_H * 2);
  });
});
