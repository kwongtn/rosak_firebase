import { describe, expect, it, vi } from "vitest";

import { metricDoc } from "../../../core/methodology/methodology-render.util";
import { PassengerStatus } from "./home.queries";
import { PASSENGER_METRIC, passengerMetric } from "./line-status-metrics.util";

const ALL_STATUSES: PassengerStatus[] = [
  "NORMAL",
  "BUSY",
  "CROWDED",
  "EXTREMELY_CROWDED",
  "BACKLOGGED",
  "DELAYED",
  "DISRUPTED",
];

describe("line-status-metrics.util", () => {
  it("maps every enum member to a non-empty metric", () => {
    for (const status of ALL_STATUSES) {
      expect(PASSENGER_METRIC[status]).toBeTruthy();
      expect(passengerMetric(status)).toBe(PASSENGER_METRIC[status]);
    }
  });

  it("declares exactly the 7 passenger status keys", () => {
    expect(Object.keys(PASSENGER_METRIC).sort()).toEqual([...ALL_STATUSES].sort());
  });

  it("falls back to 'No recent reports for this line.' for null and undefined", () => {
    expect(passengerMetric(null)).toBe("No recent reports for this line.");
    expect(passengerMetric(undefined)).toBe("No recent reports for this line.");
  });

  it("returns the expected copy for representative statuses", () => {
    expect(passengerMetric("NORMAL")).toBe("Seats available — you can sit.");
    expect(passengerMetric("EXTREMELY_CROWDED")).toBe("Unable to board — board after 3+ trains.");
    expect(passengerMetric("DISRUPTED")).toBe("Service suspended — use an alternative route.");
  });

  it("sources every metric from the methodology registry", () => {
    for (const status of ALL_STATUSES) {
      expect(PASSENGER_METRIC[status], status).toBe(
        metricDoc(`passenger.${status.toLowerCase()}`).definition,
      );
    }
  });

  it("reads the copy from the registry at module load, not from a private literal", async () => {
    vi.resetModules();
    const { METRIC_DOCS } = await import("../../../core/methodology/methodology.content");
    const doc = METRIC_DOCS.find((entry) => entry.id === "passenger.crowded");
    if (!doc) {
      throw new Error("passenger.crowded is missing from the methodology registry");
    }
    doc.definition = "sentinel: registry-sourced";

    const { PASSENGER_METRIC: sourced } = await import("./line-status-metrics.util");

    expect(sourced.CROWDED).toBe("sentinel: registry-sourced");
  });
});
