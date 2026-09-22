import { describe, expect, it } from "vitest";

import type { LineStatus, PassengerStatus } from "./home.queries";
import {
  LINE_STATUS_INFO,
  PASSENGER_INFO,
  PASSENGER_SCALE,
  lineStatusInfo,
  passengerInfo,
  passengerScale,
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

describe("passengerInfo", () => {
  it("has a non-empty title and one-line body for every passenger status", () => {
    for (const status of PASSENGER_STATUSES) {
      expect(PASSENGER_INFO[status].title, status).not.toBe("");
      expect(PASSENGER_INFO[status].body, status).not.toBe("");
      expect(PASSENGER_INFO[status].body, status).not.toContain("\n");
    }
    expect(Object.keys(PASSENGER_INFO).sort()).toEqual([...PASSENGER_STATUSES].sort());
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
