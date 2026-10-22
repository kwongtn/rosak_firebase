import { describe, expect, it } from "vitest";
import type { InsidenReferenceQueryData } from "../../../insiden/data/insiden.queries";
import {
  filterStationOptionsOf,
  filterVehicleOptionsOf,
  indexLinesById,
  vehicleParentCodesOf,
} from "./link-reference.util";

const data: InsidenReferenceQueryData = {
  lines: [
    {
      id: "l1",
      code: "KJL",
      displayName: "Kelana Jaya Line",
      vehicleTypes: [
        {
          id: "vt1",
          displayName: "Type A",
          vehicles: [{ id: "v1", identificationNo: "V-100" }],
        },
      ],
    },
    {
      id: "l2",
      code: "MRL",
      displayName: "Putrajaya Line",
      vehicleTypes: [
        {
          id: "vt2",
          displayName: "Type B",
          vehicles: [{ id: "v1", identificationNo: "V-100" }],
        },
      ],
    },
  ],
  stations: [
    { id: "s1", displayName: "KL Sentral", lines: [{ id: "l1", code: "KJL" }] },
    { id: "s2", displayName: "Subang Jaya", lines: [{ id: "l2", code: "MRL" }] },
  ],
  calendarIncidentCategories: [{ id: "c1", name: "Disruption" }],
};

describe("link-reference.util", () => {
  it("tolerates the pre-load undefined data", () => {
    expect(indexLinesById(undefined).size).toBe(0);
    expect(filterStationOptionsOf(undefined, "")).toEqual([]);
    expect(vehicleParentCodesOf(undefined).size).toBe(0);
  });

  it("aggregates a vehicle's parent codes across every line", () => {
    const codes = vehicleParentCodesOf(data);
    expect(codes.get("v1")).toEqual(["KJL", "MRL"]);
  });

  it("lists every vehicle once when no filter line is set", () => {
    const linesById = indexLinesById(data);
    const parentCodes = vehicleParentCodesOf(data);
    expect(filterVehicleOptionsOf(data, "", linesById, parentCodes)).toEqual([
      { id: "v1", label: "V-100", parentCodes: ["KJL", "MRL"] },
    ]);
  });

  it("filters vehicles and stations by the filter line", () => {
    const linesById = indexLinesById(data);
    const parentCodes = vehicleParentCodesOf(data);
    expect(filterVehicleOptionsOf(data, "l1", linesById, parentCodes)).toHaveLength(1);
    expect(filterStationOptionsOf(data, "l1")).toEqual([
      { id: "s1", label: "KL Sentral", parentCodes: ["KJL"] },
    ]);
    expect(filterStationOptionsOf(data, "")).toHaveLength(2);
  });
});
