import { describe, expect, it } from "vitest";

import type { LinePulse } from "./home-board.queries";
import { DEFAULT_BOARD_SORT, filterProLines, partitionBoardLines } from "./board-lines.util";

/** One line with every field a board predicate reads; overrides carry the interesting axis. */
function makeLine(id: string, overrides: Partial<LinePulse> = {}): LinePulse {
  return {
    id,
    code: id.toUpperCase(),
    displayName: `Line ${id}`,
    displayColor: "#ff0000",
    status: "ACTIVE",
    inServiceVehicleCount: 3,
    totalVehicleCount: 5,
    passengerStatus: "NORMAL",
    passengerStatusMessage: null,
    statusReportCount: 0,
    vehicleStatusCounts: [],
    passengerStatusCount: 0,
    statusWindowMinutes: 60,
    pulseLinks: [],
    ...overrides,
  };
}

const ids = (lines: LinePulse[]) => lines.map((line) => line.id);

describe("board-lines.util: filterProLines", () => {
  it("is `lines()` unchanged when no axis is set", () => {
    // The load-bearing default: a Rider view (which mounts no control) must be byte-for-byte the
    // unfiltered read.
    const lines = [makeLine("a"), makeLine("b")];

    expect(
      ids(filterProLines(lines, { status: null, passengerStatus: null, onlyWithData: false })),
    ).toEqual(["a", "b"]);
  });

  it("narrows to one operational status by exact equality", () => {
    const lines = [
      makeLine("a", { status: "ACTIVE" }),
      makeLine("b", { status: "TOTAL_DISRUPTION" }),
      makeLine("c", { status: "TESTING" }),
    ];

    expect(
      ids(
        filterProLines(lines, {
          status: "TOTAL_DISRUPTION",
          passengerStatus: null,
          onlyWithData: false,
        }),
      ),
    ).toEqual(["b"]);
  });

  it("treats the passenger axis as a floor, not an equality", () => {
    const lines = [
      makeLine("normal", { passengerStatus: "NORMAL" }),
      makeLine("crowded", { passengerStatus: "CROWDED" }),
      makeLine("delayed", { passengerStatus: "DELAYED" }),
      makeLine("disrupted", { passengerStatus: "DISRUPTED" }),
    ];

    expect(
      ids(filterProLines(lines, { status: null, passengerStatus: "DELAYED", onlyWithData: false })),
    ).toEqual(["delayed", "disrupted"]);
  });

  it("applies the three axes as an intersection, not last-writer-wins", () => {
    const lines = [
      makeLine("both", {
        status: "PARTIAL_DISRUPTION",
        passengerStatus: "DELAYED",
        statusReportCount: 2,
      }),
      makeLine("status-only", {
        status: "PARTIAL_DISRUPTION",
        passengerStatus: "NORMAL",
        statusReportCount: 2,
      }),
      makeLine("passenger-only", {
        status: "ACTIVE",
        passengerStatus: "DELAYED",
        statusReportCount: 2,
      }),
    ];

    expect(
      ids(
        filterProLines(lines, {
          status: "PARTIAL_DISRUPTION",
          passengerStatus: "DELAYED",
          onlyWithData: true,
        }),
      ),
    ).toEqual(["both"]);
  });

  it("keeps only lines with data, using the confidence rule rather than a count", () => {
    // "Has data" is the chip's own rule: a report, a non-ACTIVE status, a rider status above NORMAL,
    // or an official post. A quiet ACTIVE/NORMAL line with no reports is NOT data — see lineHasData.
    const lines = [
      makeLine("quiet"),
      makeLine("reported", { statusReportCount: 1 }),
      makeLine("degraded", { status: "PARTIAL_DISRUPTION" }),
      makeLine("busy", { passengerStatus: "CROWDED" }),
      makeLine("official", {
        pulseLinks: [{ isAutomated: true } as LinePulse["pulseLinks"][number]],
      }),
    ];

    expect(
      ids(filterProLines(lines, { status: null, passengerStatus: null, onlyWithData: true })),
    ).toEqual(["reported", "degraded", "busy", "official"]);
  });
});

describe("board-lines.util: partitionBoardLines", () => {
  it("partitions every visible line into exactly one group", () => {
    // Three degraded lines, two healthy in-service ones, one pre-opening — so attention, all and
    // others are each populated and the union covers the input with no repeats.
    const visible = [
      makeLine("deg1", { status: "PARTIAL_DISRUPTION" }),
      makeLine("deg2", { status: "TOTAL_DISRUPTION" }),
      makeLine("ok1"),
      makeLine("ok2"),
      makeLine("pre", { status: "TESTING" }),
    ];

    const { attention, mine, all, others } = partitionBoardLines(visible, [], DEFAULT_BOARD_SORT);
    const grouped = [...attention, ...mine, ...all, ...others];

    expect(ids(grouped).sort()).toEqual(["deg1", "deg2", "ok1", "ok2", "pre"]);
    expect(new Set(ids(grouped)).size).toBe(visible.length);
  });

  it("gives attention to a pinned line that needs it — no line renders twice", () => {
    const visible = [makeLine("broken", { status: "TOTAL_DISRUPTION" })];

    const groups = partitionBoardLines(visible, ["broken"], DEFAULT_BOARD_SORT);

    expect(ids(groups.attention)).toEqual(["broken"]);
    expect(groups.mine).toEqual([]);
  });

  it("keeps a pinned OUT-OF-SERVICE line in My lines — pin wins there", () => {
    // An out-of-service line can never need attention (isInService), so pinning it is the only way
    // to keep it out of Others.
    const visible = [makeLine("closed", { status: "DEFUNCT" })];

    const groups = partitionBoardLines(visible, ["closed"], DEFAULT_BOARD_SORT);

    expect(groups.attention).toEqual([]);
    expect(ids(groups.mine)).toEqual(["closed"]);
    expect(groups.others).toEqual([]);
  });

  it("puts an unpinned out-of-service line in Others and excludes it from All lines", () => {
    const visible = [makeLine("closed", { status: "TESTING" }), makeLine("running")];

    const groups = partitionBoardLines(visible, [], DEFAULT_BOARD_SORT);

    expect(ids(groups.all)).toEqual(["running"]);
    expect(ids(groups.others)).toEqual(["closed"]);
  });

  it("sorts All lines and Others by code when asked for Name", () => {
    const visible = [
      makeLine("spl"),
      makeLine("kjl"),
      makeLine("bdr"),
      makeLine("xtr", { status: "DEFUNCT" }),
      makeLine("def", { status: "TESTING" }),
    ];

    const groups = partitionBoardLines(visible, [], "name");

    expect(ids(groups.all)).toEqual(["bdr", "kjl", "spl"]);
    expect(ids(groups.others)).toEqual(["def", "xtr"]);
  });

  it("leaves attention and my-lines on severity order whatever the sort", () => {
    const visible = [
      makeLine("bdr", { status: "PARTIAL_DISRUPTION" }),
      makeLine("kjl", { status: "TOTAL_DISRUPTION" }),
      makeLine("spl"),
    ];

    const groups = partitionBoardLines(visible, ["spl"], "name");

    // TOTAL before PARTIAL — worst first, regardless of the Name sort that only re-orders All.
    expect(ids(groups.attention)).toEqual(["kjl", "bdr"]);
    expect(ids(groups.mine)).toEqual(["spl"]);
  });

  it("never mutates the input array", () => {
    const visible = [makeLine("b"), makeLine("a")];
    const before = ids(visible);

    partitionBoardLines(visible, [], "name");

    expect(ids(visible)).toEqual(before);
  });
});
