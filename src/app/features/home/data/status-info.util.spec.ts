import { describe, expect, it } from "vitest";

import type { LineStatus, PassengerStatus, VehicleStatus } from "./home.queries";
import { PASSENGER_METRIC } from "./line-status-metrics.util";
import {
  LINE_STATUS_INFO,
  PASSENGER_INFO,
  PASSENGER_SCALE,
  VEHICLE_STATUS_LABEL,
  VEHICLE_STATUS_ORDER,
  lineStatusInfo,
  passengerInfo,
  passengerScale,
  vehicleStatusRows,
} from "./status-info.util";

/** The two enums are mirrored from the schema by hand — these lists are the contract. */
const PASSENGER_STATUSES: PassengerStatus[] = [
  "NORMAL",
  "BUSY",
  "CROWDED",
  "EXTREMELY_CROWDED",
  "BACKLOGGED",
  "DELAYED",
  "DISRUPTED",
];

const LINE_STATUSES: LineStatus[] = [
  "TESTING",
  "DEFUNCT",
  "ACTIVE",
  "PARTIAL_ACTIVE",
  "PARTIAL_DISRUPTION",
  "TOTAL_DISRUPTION",
];

const VEHICLE_STATUSES: VehicleStatus[] = [
  "IN_SERVICE",
  "NOT_SPOTTED",
  "OUT_OF_SERVICE",
  "DECOMMISSIONED",
  "MARRIED",
  "TESTING",
  "UNKNOWN",
];

describe("passengerInfo", () => {
  it("has a non-empty title and one-line body for every passenger status", () => {
    for (const status of PASSENGER_STATUSES) {
      expect(PASSENGER_INFO[status].title, status).not.toBe("");
      expect(PASSENGER_INFO[status].body, status).not.toBe("");
      expect(PASSENGER_INFO[status].body, status).not.toContain("\n");
    }
    expect(Object.keys(PASSENGER_INFO).sort()).toEqual([...PASSENGER_STATUSES].sort());
  });

  it("uses the universal observable metric as each body, keeping the short title", () => {
    for (const status of PASSENGER_STATUSES) {
      expect(PASSENGER_INFO[status].body, status).toBe(PASSENGER_METRIC[status]);
    }
    expect(PASSENGER_INFO.CROWDED.title).toBe("Crowded");
    expect(passengerInfo("CROWDED").body).toBe("Standing room only — board after 1–2 trains.");
  });

  it("falls back to a 'No data' explanation for an absent status", () => {
    expect(passengerInfo(null)).toEqual({
      title: "No data",
      body: "No recent community reports for this line.",
    });
    expect(passengerInfo(undefined)).toEqual(passengerInfo(null));
  });

  it("returns the matching entry for a real status", () => {
    expect(passengerInfo("CROWDED")).toEqual(PASSENGER_INFO.CROWDED);
  });
});

describe("PASSENGER_SCALE", () => {
  it("lists all 7 levels in severity order, NORMAL → DISRUPTED", () => {
    expect(PASSENGER_SCALE).toEqual(PASSENGER_STATUSES);
    expect(PASSENGER_SCALE).toHaveLength(7);
  });
});

describe("passengerScale", () => {
  it("marks only the active level and keeps the severity order", () => {
    const entries = passengerScale("DELAYED");

    expect(entries.map((entry) => entry.key)).toEqual(PASSENGER_STATUSES);
    expect(entries.filter((entry) => entry.active).map((entry) => entry.key)).toEqual(["DELAYED"]);
    expect(entries.every((entry) => entry.label !== "" && entry.variant !== undefined)).toBe(true);
  });

  it("marks nothing when the status is absent", () => {
    expect(passengerScale(null).some((entry) => entry.active)).toBe(false);
  });
});

describe("lineStatusInfo", () => {
  it("has a non-empty title and one-line body for every line status", () => {
    for (const status of LINE_STATUSES) {
      expect(LINE_STATUS_INFO[status].title, status).not.toBe("");
      expect(LINE_STATUS_INFO[status].body, status).not.toBe("");
      expect(LINE_STATUS_INFO[status].body, status).not.toContain("\n");
    }
    expect(Object.keys(LINE_STATUS_INFO).sort()).toEqual([...LINE_STATUSES].sort());
  });

  it("returns the matching entry", () => {
    expect(lineStatusInfo("PARTIAL_DISRUPTION")).toEqual(LINE_STATUS_INFO.PARTIAL_DISRUPTION);
  });

  it("keeps titles consistent with the LineStatusBadge labels", () => {
    expect(lineStatusInfo("TESTING").title).toBe("Testing");
    expect(lineStatusInfo("DEFUNCT").title).toBe("Defunct");
    expect(lineStatusInfo("ACTIVE").title).toBe("Active");
    expect(lineStatusInfo("PARTIAL_ACTIVE").title).toBe("Partially Active");
    expect(lineStatusInfo("PARTIAL_DISRUPTION").title).toBe("Partial Disruption");
    expect(lineStatusInfo("TOTAL_DISRUPTION").title).toBe("Total Disruption");
  });
});

describe("VEHICLE_STATUS_LABEL", () => {
  it("has a readable label for every vehicle status and keeps the enum order", () => {
    expect(VEHICLE_STATUS_ORDER).toEqual(VEHICLE_STATUSES);
    for (const status of VEHICLE_STATUSES) {
      expect(VEHICLE_STATUS_LABEL[status], status).toMatch(/^[A-Z]/);
      expect(VEHICLE_STATUS_LABEL[status], status).not.toContain("_");
    }
    expect(VEHICLE_STATUS_LABEL).toEqual({
      IN_SERVICE: "In service",
      NOT_SPOTTED: "Not spotted",
      OUT_OF_SERVICE: "Out of service",
      DECOMMISSIONED: "Decommissioned",
      MARRIED: "Married",
      TESTING: "Testing",
      UNKNOWN: "Unknown",
    });
  });
});

describe("vehicleStatusRows", () => {
  it("drops zero counts and orders the survivors in enum order", () => {
    const rows = vehicleStatusRows([
      { status: "UNKNOWN", count: 0 },
      { status: "DECOMMISSIONED", count: 2 },
      { status: "IN_SERVICE", count: 12 },
      { status: "OUT_OF_SERVICE", count: 0 },
      { status: "NOT_SPOTTED", count: 3 },
      { status: "MARRIED", count: 1 },
      { status: "TESTING", count: 0 },
    ]);

    expect(rows).toEqual([
      { key: "IN_SERVICE", label: "In service", count: 12 },
      { key: "NOT_SPOTTED", label: "Not spotted", count: 3 },
      { key: "DECOMMISSIONED", label: "Decommissioned", count: 2 },
      { key: "MARRIED", label: "Married", count: 1 },
    ]);
  });

  it("returns an empty list when no counts were reported", () => {
    expect(vehicleStatusRows([])).toEqual([]);
    expect(vehicleStatusRows(null)).toEqual([]);
    expect(vehicleStatusRows(undefined)).toEqual([]);
  });

  it("keeps every row when all statuses have a count", () => {
    const rows = vehicleStatusRows(VEHICLE_STATUSES.map((status) => ({ status, count: 1 })));

    expect(rows.map((row) => row.key)).toEqual(VEHICLE_STATUSES);
  });
});
