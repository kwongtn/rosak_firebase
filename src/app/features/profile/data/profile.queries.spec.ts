import { describe, expect, it } from "vitest";

import {
  GET_MY_EVENTS_QUERY,
  GET_PUBLIC_USER_QUERY,
  GET_USER_DATA_QUERY,
  LINE_FLEET_QUERY,
} from "./profile.queries";

/** A selection set's text with every run of whitespace collapsed, so a spec reads a query like a sentence. */
function flat(query: string): string {
  return query.replace(/\s+/g, " ");
}

describe("profile queries", () => {
  describe("favouriteVehicles", () => {
    it("is requested with no count on a public profile, whatever else changes", () => {
      // 🔴 The resolver ignores spottingDataPublic. A count above the default here would publish every
      // vehicle an opted-out user has spotted (see the Public Profiles & Privacy section of profile.md).
      const query = flat(GET_PUBLIC_USER_QUERY);

      expect(query).toMatch(/favouriteVehicles \{/);
      expect(query).not.toMatch(/favouriteVehicles\s*\(/);
    });

    it("is requested in full on the owner's own query, with each line's fleet size", () => {
      const query = flat(GET_USER_DATA_QUERY);

      expect(query).toContain("favouriteVehicles(count: 1000)");
      expect(query).toMatch(/lines \{ id code totalVehicleCount \}/);
    });

    it("selects the vehicle id and its lines' ids on both, which the vehicle links need", () => {
      for (const query of [GET_USER_DATA_QUERY, GET_PUBLIC_USER_QUERY]) {
        expect(flat(query)).toMatch(
          /favouriteVehicles(\(count: 1000\))? \{ vehicle \{ id identificationNo lines \{ id code/,
        );
      }
    });
  });

  it("selects the vehicle id and its lines' ids on every history row, public and own", () => {
    const row =
      /vehicle \{ id status identificationNo vehicleType \{ internalName \} lines \{ id code/;

    expect(flat(GET_MY_EVENTS_QUERY)).toMatch(row);
    expect(flat(GET_PUBLIC_USER_QUERY)).toMatch(row);
  });

  it("selects the origin and destination stations the export writes, on the owner's history only", () => {
    expect(flat(GET_MY_EVENTS_QUERY)).toMatch(/originStation \{ displayName \}/);
    expect(flat(GET_MY_EVENTS_QUERY)).toMatch(/destinationStation \{ displayName \}/);
    expect(GET_PUBLIC_USER_QUERY).not.toContain("originStation");
  });

  it("reads a line's roster by line id", () => {
    expect(flat(LINE_FLEET_QUERY)).toContain(
      "lines(filters: { id: $lineId }) { id vehicles { id identificationNo } }",
    );
  });
});
