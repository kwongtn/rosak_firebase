import { describe, expect, it } from "vitest";

import { stationTaggedReports } from "./station-reports.util";
import type { StationReportNode, StationReportsQueryData } from "./station.queries";

function report(
  id: string,
  created: string,
  stationIds: string[],
  overrides: Partial<StationReportNode> = {},
): StationReportNode {
  return {
    id,
    status: "CROWDED",
    delayMinutes: null,
    notes: "",
    created,
    stations: stationIds.map((stationId) => ({ id: stationId })),
    ...overrides,
  };
}

function page(...nodes: StationReportNode[]): { edges: Array<{ node: StationReportNode }> } {
  return { edges: nodes.map((node) => ({ node })) };
}

const LINES = [
  { id: "6", code: "KTMK-PKL" },
  { id: "4", code: "LRT KJL" },
];

describe("stationTaggedReports", () => {
  it("keeps only the reports that name the station, each with the line it was filed for", () => {
    const data: StationReportsQueryData = {
      line0: page(
        report("1", "2026-09-24T15:24:17.741912", ["65"]),
        report("2", "2026-09-24T15:22:17.741912", ["127"]),
      ),
      line1: page(report("3", "2026-09-24T15:23:00", ["127", "65"])),
    };

    const reports = stationTaggedReports(data, LINES, "65");

    expect(reports.map((r) => [r.id, r.line.code])).toEqual([
      ["1", "KTMK-PKL"],
      ["3", "LRT KJL"],
    ]);
  });

  it("puts the newest first across lines, then the higher id when the times are equal", () => {
    const data: StationReportsQueryData = {
      line0: page(
        report("10", "2026-09-24T09:00:00", ["65"]),
        report("11", "2026-09-24T08:00:00", ["65"]),
      ),
      line1: page(
        report("12", "2026-09-24T09:00:00", ["65"]),
        report("13", "2026-09-24T08:30:00.5", ["65"]),
      ),
    };

    expect(stationTaggedReports(data, LINES, "65").map((r) => r.id)).toEqual([
      "12",
      "10",
      "13",
      "11",
    ]);
  });

  it("reads alias line<i> as lines[i]", () => {
    const data: StationReportsQueryData = {
      line1: page(report("7", "2026-09-24T09:00:00", ["65"])),
    };

    expect(stationTaggedReports(data, LINES, "65")[0]?.line).toEqual({ id: "4", code: "LRT KJL" });
  });

  it("answers an empty list for no data, a null alias or no matching report", () => {
    expect(stationTaggedReports(undefined, LINES, "65")).toEqual([]);
    expect(stationTaggedReports({ line0: null, line1: undefined }, LINES, "65")).toEqual([]);
    expect(
      stationTaggedReports(
        { line0: page(report("1", "2026-09-24T09:00:00", ["127"])) },
        LINES,
        "65",
      ),
    ).toEqual([]);
  });

  it("keeps the report's own fields as the backend sent them", () => {
    const data: StationReportsQueryData = {
      line0: page(
        report("1", "2026-09-24T09:00:00", ["65"], {
          status: "DELAYED",
          delayMinutes: 12,
          notes: "Stuck at the platform",
        }),
      ),
    };

    expect(stationTaggedReports(data, LINES, "65")).toEqual([
      {
        id: "1",
        status: "DELAYED",
        delayMinutes: 12,
        notes: "Stuck at the platform",
        created: "2026-09-24T09:00:00",
        stations: [{ id: "65" }],
        line: { id: "6", code: "KTMK-PKL" },
      },
    ]);
  });
});
