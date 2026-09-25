import { describe, expect, it } from "vitest";
import {
  isSpottingDetailsRoute,
  isSpottingLineRoute,
  isSpottingVehicleRoute,
} from "./spotting-route-patterns";

type RoutePredicate = (path: string) => boolean;

interface PatternCases {
  name: string;
  predicate: RoutePredicate;
  accepted: string[];
  rejected: string[];
}

const patternCases: PatternCases[] = [
  {
    name: "line overview",
    predicate: isSpottingLineRoute,
    accepted: ["/spotting/KL", "/spotting/North-South"],
    rejected: ["/spotting", "/spotting/KL/details", "/spotting/KL/vehicle/A", "/spotting/"],
  },
  {
    name: "line details",
    predicate: isSpottingDetailsRoute,
    accepted: ["/spotting/KL/details", "/spotting/KL/details/grid"],
    rejected: ["/spotting/KL", "/spotting/KL/detailsoup", "/spotting/KL/details/grid/extra"],
  },
  {
    name: "vehicle detail",
    predicate: isSpottingVehicleRoute,
    accepted: ["/spotting/KL/vehicle/A"],
    rejected: ["/spotting/KL/vehicle", "/spotting/KL/vehicle/A/history", "/spotting/KL/details/A"],
  },
];

describe("spotting-route-patterns", () => {
  for (const { name, predicate, accepted, rejected } of patternCases) {
    it(`accepts valid ${name} paths`, () => {
      for (const path of accepted) {
        expect(predicate(path), path).toBe(true);
      }
    });

    it(`rejects invalid ${name} paths`, () => {
      for (const path of rejected) {
        expect(predicate(path), path).toBe(false);
      }
    });
  }
});
