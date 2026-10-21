import { describe, expect, it } from "vitest";

import { firstLineVehiclePath, vehiclePagePath } from "./vehicle-link.util";

describe("vehicle-link.util", () => {
  describe("vehiclePagePath", () => {
    it("builds the vehicle page route under the line", () => {
      expect(vehiclePagePath("4", "126")).toBe("/spotting/4/vehicle/126");
    });

    it("encodes both ids, so an id can never add a path segment", () => {
      expect(vehiclePagePath("4/x", "a b")).toBe("/spotting/4%2Fx/vehicle/a%20b");
    });
  });

  describe("firstLineVehiclePath", () => {
    it("links through the vehicle's first line when it is on several", () => {
      const vehicle = { id: "81", lines: [{ id: "7" }, { id: "6" }] };

      expect(firstLineVehiclePath(vehicle)).toBe("/spotting/7/vehicle/81");
    });

    it("returns null for a vehicle on no line, which the route cannot address", () => {
      expect(firstLineVehiclePath({ id: "81", lines: [] })).toBeNull();
    });
  });
});
