import { describe, expect, it } from "vitest";
import type { InsidenReferenceQueryData } from "../../../insiden/data/insiden.queries";
import {
  categoryOptionsOf,
  filterStationOptionsOf,
  filterVehicleOptionsOf,
  indexLinesById,
  lineOptionsOf,
  stationOptionsOf,
  vehicleOptionsOf,
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
    expect(lineOptionsOf(undefined)).toEqual([]);
    expect(stationOptionsOf(undefined)).toEqual([]);
    expect(categoryOptionsOf(undefined)).toEqual([]);
    expect(vehicleParentCodesOf(undefined).size).toBe(0);
  });

  it("builds line/station/category options with their labels", () => {
    expect(lineOptionsOf(data)).toEqual([
      { id: "l1", label: "KJL — Kelana Jaya Line" },
      { id: "l2", label: "MRL — Putrajaya Line" },
    ]);
    expect(stationOptionsOf(data)).toEqual([
      { id: "s1", label: "KL Sentral", parentCodes: ["KJL"] },
      { id: "s2", label: "Subang Jaya", parentCodes: ["MRL"] },
    ]);
    expect(categoryOptionsOf(data)).toEqual([{ id: "c1", label: "Disruption" }]);
  });

  it("aggregates a vehicle's parent codes across every line", () => {
    const codes = vehicleParentCodesOf(data);
    expect(codes.get("v1")).toEqual(["KJL", "MRL"]);
  });

  it("narrows vehicle options to the selected lines and de-duplicates", () => {
    const linesById = indexLinesById(data);
    const parentCodes = vehicleParentCodesOf(data);
    const all = vehicleOptionsOf(data, [], linesById, parentCodes);
    expect(all).toEqual([{ id: "v1", label: "V-100", parentCodes: ["KJL", "MRL"] }]);
    const narrowed = vehicleOptionsOf(data, ["l1"], linesById, parentCodes);
    expect(narrowed).toHaveLength(1);
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
