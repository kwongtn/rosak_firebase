import { describe, expect, it } from "vitest";

import {
  FLEET_FAVOURITES_COUNT,
  GET_FLEET_PROGRESS_QUERY,
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

    it("keeps the default count on the owner's blocking query too, so the first paint never waits for the whole list", () => {
      // The whole list resolves Vehicle.lines once per vehicle (about 1.3 s for a 406-vehicle spotter),
      // and the Fleet progress card that needs it sits below the fold, so it has its own request.
      const query = flat(GET_USER_DATA_QUERY);

      expect(query).toMatch(/favouriteVehicles \{/);
      expect(query).not.toMatch(/favouriteVehicles\s*\(/);
      expect(query).not.toContain("totalVehicleCount");
    });

    it("is requested in full by the fleet-progress read, with each line's fleet size", () => {
      const query = flat(GET_FLEET_PROGRESS_QUERY);

      expect(query).toContain(`favouriteVehicles(count: ${FLEET_FAVOURITES_COUNT})`);
      expect(query).toMatch(/vehicle \{ id lines \{ id code totalVehicleCount \} \}/);
    });

    it("is read from the caller's own `user` in the fleet-progress read, never from publicUser", () => {
      // 🔴 The count is only safe on the caller's own data: the resolver ignores spottingDataPublic.
      const query = flat(GET_FLEET_PROGRESS_QUERY);

      expect(query).toMatch(/\buser \{ favouriteVehicles/);
      expect(query).not.toContain("publicUser");
    });

    it("selects the vehicle id and its lines' ids on both profile queries, which the vehicle links need", () => {
      for (const query of [GET_USER_DATA_QUERY, GET_PUBLIC_USER_QUERY]) {
        expect(flat(query)).toMatch(
          /favouriteVehicles \{ vehicle \{ id identificationNo lines \{ id code \} \} count \}/,
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
