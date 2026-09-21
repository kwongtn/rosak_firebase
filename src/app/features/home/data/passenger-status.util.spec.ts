import { PassengerStatus } from "./home.queries";
import {
  PASSENGER_LABEL,
  PASSENGER_VARIANT,
  passengerLabel,
  passengerVariant,
} from "./passenger-status.util";

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
});
