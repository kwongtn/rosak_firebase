import { describe, expect, it } from "vitest";

import type { LinePulse } from "../data/home.queries";
import { filterChooserLines, orderChooserLines } from "./report-chooser-order.util";

function makeLine(id: string, overrides: Partial<LinePulse> = {}): LinePulse {
  return {
    id,
    code: id.toUpperCase(),
    displayName: `Line ${id}`,
    displayColor: "#e11d48",
    status: "ACTIVE",
    inServiceVehicleCount: 1,
    totalVehicleCount: 2,
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

const codes = (lines: readonly LinePulse[]): string[] => lines.map((line) => line.code);

describe("orderChooserLines", () => {
  it("returns nothing for no lines, rather than a placeholder", () => {
    expect(orderChooserLines([], ["a"], ["b"])).toEqual([]);
  });

  it("falls back to the board's severity order when nothing is pinned or recent", () => {
    const lines = [
      makeLine("ok"),
      makeLine("dead", { status: "TOTAL_DISRUPTION" }),
      makeLine("late", { passengerStatus: "DELAYED" }),
    ];

    // Same comparator as the board's "Needs attention" group — the chooser must not quietly disagree
    // with the list two inches above it about which line is worst.
    expect(codes(orderChooserLines(lines, [], []))).toEqual(["DEAD", "LATE", "OK"]);
  });

  it("puts PINNED lines first, ahead of a broken line that is only recent", () => {
    const lines = [
      makeLine("dead", { status: "TOTAL_DISRUPTION" }),
      makeLine("mine"),
      makeLine("seen", { status: "PARTIAL_ACTIVE" }),
    ];

    // "I care about this line" is a standing statement the reader can see on the board and correct
    // by unpinning; "I looked at this one five minutes ago" is an artefact of scrolling. The pinned
    // line therefore outranks both recency and severity, and the dead line is NOT hoisted above the
    // merely-recent one — recency is a band of its own, not a hint added to the severity sort.
    expect(codes(orderChooserLines(lines, ["mine"], ["seen"]))).toEqual(["MINE", "SEEN", "DEAD"]);
  });

  it("puts RECENT lines next, most recent first", () => {
    const lines = [makeLine("a"), makeLine("b"), makeLine("c")];

    expect(codes(orderChooserLines(lines, [], ["c", "a"]))).toEqual(["C", "A", "B"]);
  });

  it("lets a PINNED line outrank a MORE RECENT one", () => {
    const lines = [makeLine("recent"), makeLine("pinned")];

    expect(codes(orderChooserLines(lines, ["pinned"], ["recent"]))).toEqual(["PINNED", "RECENT"]);
  });

  it("keeps severity INSIDE each rank band rather than the backend's order", () => {
    // The remainder is not "whatever the backend sent": a dead line must still beat a healthy one
    // once the personal signals have had their say, or the chooser reads as a second board.
    const lines = [
      makeLine("healthy"),
      makeLine("dead", { status: "TOTAL_DISRUPTION" }),
      makeLine("sick", { passengerStatus: "DELAYED" }),
    ];

    expect(codes(orderChooserLines(lines, [], ["healthy"]))).toEqual(["HEALTHY", "DEAD", "SICK"]);
  });

  it("ignores pinned and recent ids this read does not contain", () => {
    const lines = [makeLine("a")];

    expect(codes(orderChooserLines(lines, ["ghost", "a"], ["also-ghost"]))).toEqual(["A"]);
  });

  it("does not mutate the array it was given", () => {
    const lines = [makeLine("ok"), makeLine("dead", { status: "TOTAL_DISRUPTION" })];
    const before = codes(lines);

    orderChooserLines(lines, ["ok"], ["dead"]);

    expect(codes(lines)).toEqual(before);
  });
});

describe("filterChooserLines", () => {
  const lines = [
    makeLine("kjl", { displayName: "Kelana Jaya Line" }),
    makeLine("sbk", { displayName: "Sungai Besi–Kajang?" }),
    makeLine("kde", { displayName: "Kelana Jaya Express" }),
  ];

  it("returns every line for a blank query, in the order it was given", () => {
    expect(codes(filterChooserLines(lines, ""))).toEqual(["KJL", "SBK", "KDE"]);
    expect(codes(filterChooserLines(lines, "   "))).toEqual(["KJL", "SBK", "KDE"]);
  });

  it("matches a code fragment case-insensitively", () => {
    expect(codes(filterChooserLines(lines, "kjl"))).toEqual(["KJL"]);
    expect(codes(filterChooserLines(lines, "KJ"))).toEqual(["KJL"]);
  });

  it("matches a name fragment and keeps every hit", () => {
    expect(codes(filterChooserLines(lines, "kelana"))).toEqual(["KJL", "KDE"]);
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(filterChooserLines(lines, "zzzz")).toEqual([]);
  });
});
