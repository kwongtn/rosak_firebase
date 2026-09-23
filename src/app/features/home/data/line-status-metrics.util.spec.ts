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
});
