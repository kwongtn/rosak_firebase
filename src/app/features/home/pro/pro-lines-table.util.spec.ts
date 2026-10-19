import { describe, expect, it } from "vitest";

import type { ProLinesSort } from "../../../core/preferences/preferences.service";
import type { LinePulse } from "../data/home-board.queries";
import type { LineStatusHourBucket } from "../data/home-history.queries";
import { lastReportHour, sortProLines } from "./pro-lines-table.util";

function line(id: string, overrides: Partial<LinePulse> = {}): LinePulse {
  return {
    id,
    code: id.toUpperCase(),
    displayName: `Line ${id}`,
    displayColor: "#000000",
    status: "ACTIVE",
    inServiceVehicleCount: 5,
    totalVehicleCount: 10,
    passengerStatus: null,
    statusReportCount: 0,
    vehicleStatusCounts: [],
    passengerStatusCount: 0,
    statusWindowMinutes: 15,
    pulseLinks: [],
    ...overrides,
  };
}

function bucket(hourStart: string, count: number): LineStatusHourBucket {
  return {
    hourStart,
    hourEnd: hourStart,
    count,
    dominantStatus: null,
    statusCounts: [],
  };
}

const NO_REPORT = (): string | null => null;

function codes(lines: LinePulse[]): string[] {
  return lines.map((entry) => entry.code);
}

describe("lastReportHour", () => {
  it("picks the latest hour that carries a report, ignoring empty hours", () => {
    const buckets = [
      bucket("2026-10-19T08:00:00", 2),
      bucket("2026-10-19T10:00:00", 0),
      bucket("2026-10-19T09:00:00", 1),
    ];

    expect(lastReportHour(buckets)).toBe("2026-10-19T09:00:00");
  });

  it("is null when no hour has a report, or there are no hours at all", () => {
    expect(lastReportHour([bucket("2026-10-19T08:00:00", 0)])).toBeNull();
    expect(lastReportHour([])).toBeNull();
  });
});

describe("sortProLines", () => {
  const lines = [
    line("kjl1", { status: "ACTIVE", statusReportCount: 3, inServiceVehicleCount: 2 }),
    line("ktm1", { status: "TOTAL_DISRUPTION", statusReportCount: 0, inServiceVehicleCount: 9 }),
    line("spl1", { status: "PARTIAL_ACTIVE", statusReportCount: 1, inServiceVehicleCount: 5 }),
  ];

  it("sorts by line code, A to Z or Z to A", () => {
    const sort = (direction: ProLinesSort["direction"]): string[] =>
      codes(sortProLines(lines, { column: "line", direction }, NO_REPORT));

    expect(sort("asc")).toEqual(["KJL1", "KTM1", "SPL1"]);
    expect(sort("desc")).toEqual(["SPL1", "KTM1", "KJL1"]);
  });

  it("sorts status by severity rank, healthiest first ascending", () => {
    expect(codes(sortProLines(lines, { column: "status", direction: "asc" }, NO_REPORT))).toEqual([
      "KJL1",
      "SPL1",
      "KTM1",
    ]);
    expect(codes(sortProLines(lines, { column: "status", direction: "desc" }, NO_REPORT))).toEqual([
      "KTM1",
      "SPL1",
      "KJL1",
    ]);
  });

  it("sorts reports and in-service counts numerically, not as text", () => {
    const many = [
      line("a", { statusReportCount: 10, inServiceVehicleCount: 10 }),
      line("b", { statusReportCount: 9, inServiceVehicleCount: 9 }),
    ];

    expect(codes(sortProLines(many, { column: "reports", direction: "asc" }, NO_REPORT))).toEqual([
      "B",
      "A",
    ]);
    expect(
      codes(sortProLines(many, { column: "inService", direction: "desc" }, NO_REPORT)),
    ).toEqual(["A", "B"]);
  });

  it("breaks an in-service tie on the fleet total, then on the code", () => {
    const tied = [
      line("b", { inServiceVehicleCount: 4, totalVehicleCount: 8 }),
      line("a", { inServiceVehicleCount: 4, totalVehicleCount: 6 }),
      line("c", { inServiceVehicleCount: 4, totalVehicleCount: 6 }),
    ];

    expect(codes(sortProLines(tied, { column: "inService", direction: "asc" }, NO_REPORT))).toEqual(
      ["A", "C", "B"],
    );
  });

  it("keeps a never-reported line LAST under both directions of the last-report sort", () => {
    const hours: Record<string, string | null> = {
      KJL1: "2026-10-19T08:00:00",
      KTM1: null,
      SPL1: "2026-10-19T10:00:00",
    };
    const lastOf = (entry: LinePulse): string | null => hours[entry.code] ?? null;

    expect(codes(sortProLines(lines, { column: "lastReport", direction: "asc" }, lastOf))).toEqual([
      "KJL1",
      "SPL1",
      "KTM1",
    ]);
    expect(codes(sortProLines(lines, { column: "lastReport", direction: "desc" }, lastOf))).toEqual(
      ["SPL1", "KJL1", "KTM1"],
    );
  });

  it("returns a new array and never re-orders the input", () => {
    const input = [...lines];
    const result = sortProLines(input, { column: "reports", direction: "desc" }, NO_REPORT);

    expect(result).not.toBe(input);
    expect(codes(input)).toEqual(["KJL1", "KTM1", "SPL1"]);
  });
});
