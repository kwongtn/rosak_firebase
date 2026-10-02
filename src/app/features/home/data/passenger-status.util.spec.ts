import { PassengerStatus } from "./home.queries";
import {
  PASSENGER_LABEL,
  PASSENGER_SEVERITY_RANK,
  PASSENGER_VARIANT,
  passengerLabel,
  passengerSeverityRank,
  passengerVariant,
} from "./passenger-status.util";
import { PASSENGER_SCALE } from "./status-info.util";

const ALL_STATUSES: PassengerStatus[] = [
  "NORMAL",
  "BUSY",
  "CROWDED",
  "EXTREMELY_CROWDED",
  "BACKLOGGED",
  "DELAYED",
  "DISRUPTED",
];

describe("passenger-status.util", () => {
  it("maps every enum member to a non-empty label", () => {
    for (const status of ALL_STATUSES) {
      expect(PASSENGER_LABEL[status]).toBeTruthy();
      expect(passengerLabel(status)).toBe(PASSENGER_LABEL[status]);
    }
  });

  it("maps every enum member to a non-empty badge variant", () => {
    for (const status of ALL_STATUSES) {
      expect(PASSENGER_VARIANT[status]).toBeTruthy();
      expect(passengerVariant(status)).toBe(PASSENGER_VARIANT[status]);
    }
  });

  it("uses the expected human labels", () => {
    expect(passengerLabel("NORMAL")).toBe("Normal");
    expect(passengerLabel("EXTREMELY_CROWDED")).toBe("Extremely Crowded");
  });

  it("falls back to 'No data' for null and undefined", () => {
    expect(passengerLabel(null)).toBe("No data");
    expect(passengerLabel(undefined)).toBe("No data");
  });

  it("falls back to the neutral variant for null and undefined", () => {
    expect(passengerVariant(null)).toBe("neutral");
    expect(passengerVariant(undefined)).toBe("neutral");
  });

  it("ranks the statuses in the backend enum's own declaration order", () => {
    // Not an editorial order: the GraphQL schema exposes the enum in declaration order, so a
    // higher rank IS a more severe status. Reordering the numbers here would silently disagree
    // with the server AND with every threshold derived from this table.
    expect(Object.keys(PASSENGER_SEVERITY_RANK)).toEqual(ALL_STATUSES);
    ALL_STATUSES.forEach((status, index) => {
      expect(PASSENGER_SEVERITY_RANK[status], status).toBe(index);
      expect(passengerSeverityRank(status), status).toBe(index);
    });
  });

  it("ranks an absent status at zero, the same as NORMAL", () => {
    // "Nobody has reported a crowding level for this line" is not evidence of a problem. Giving
    // absence a rank of its own would let an unreported line outrank one somebody reported BUSY.
    expect(passengerSeverityRank(null)).toBe(PASSENGER_SEVERITY_RANK["NORMAL"]);
    expect(passengerSeverityRank(undefined)).toBe(PASSENGER_SEVERITY_RANK["NORMAL"]);
  });

  it("agrees with the legend's display order in status-info.util", () => {
    expect(Object.keys(PASSENGER_SEVERITY_RANK)).toEqual(PASSENGER_SCALE);
  });
});
