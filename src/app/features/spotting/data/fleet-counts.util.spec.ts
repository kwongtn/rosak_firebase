import { fleetCountChips } from "./fleet-counts.util";
import { VehicleType } from "./spotting.queries";
import { describe, expect, it } from "vitest";

function makeVehicleType(overrides: Partial<VehicleType>): VehicleType {
  return {
    id: "1",
    internalName: "T1",
    displayName: "Type 1",
    vehicleStatusInServiceCount: 0,
    vehicleStatusNotSpottedCount: 0,
    vehicleStatusOutOfServiceCount: 0,
    vehicleStatusDecommissionedCount: 0,
    vehicleStatusMarriedCount: 0,
    vehicleStatusTestingCount: 0,
    vehicleStatusUnknownCount: 0,
    vehicleTotalCount: 0,
    vehicles: [],
    ...overrides,
  };
}

describe("fleetCountChips", () => {
  it("creates total first with percent 100 and in-service chips", () => {
    const chips = fleetCountChips([
      makeVehicleType({
        vehicleTotalCount: 16,
        vehicleStatusInServiceCount: 16,
      }),
    ]);
    expect(chips[0]).toEqual({
      key: null,
      label: "Total",
      count: 16,
      percent: "100",
    });
    expect(chips[1]).toEqual({
      key: "IN_SERVICE",
      label: "In Service",
      count: 16,
      percent: expect.any(String),
    });
    const inService = chips.find((c) => c.key === "IN_SERVICE");
    expect(inService?.percent).toBe("100");
  });

  it("computes percentages to precision 3", () => {
    const chips = fleetCountChips([
      makeVehicleType({
        vehicleTotalCount: 3,
        vehicleStatusInServiceCount: 1,
        vehicleStatusNotSpottedCount: 2,
      }),
    ]);
    const inService = chips.find((c) => c.key === "IN_SERVICE");
    const notSpotted = chips.find((c) => c.key === "NOT_SPOTTED");
    expect(inService?.percent).toBe("33.3");
    expect(notSpotted?.percent).toBe("66.7");
  });

  it("returns only non-zero status chips after total", () => {
    const chips = fleetCountChips([
      makeVehicleType({
        vehicleTotalCount: 5,
        vehicleStatusInServiceCount: 5,
        vehicleStatusOutOfServiceCount: 0,
      }),
    ]);
    expect(chips.filter((c) => c.key !== null)).toHaveLength(1);
    expect(chips[1].key).toBe("IN_SERVICE");
  });
});
