import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONSTANTS } from "../../../core/methodology/methodology.constants";
import {
  metricDoc,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import type { LinePulse, LineStatus, PassengerStatus } from "./home.queries";
import {
  LINE_STATUS_SEVERITY_RANK,
  NEEDS_ATTENTION_PASSENGER_RANK,
  compareLineSeverity,
  lineCallout,
  lineNeedsAttention,
  networkHeadline,
  networkTone,
  sortLinesBySeverity,
  summarizeNetwork,
} from "./network-summary.util";
import { PASSENGER_SEVERITY_RANK } from "./passenger-status.util";

function makeLine(overrides: Partial<LinePulse> = {}): LinePulse {
  return {
    id: "line-1",
    code: "KJL",
    displayName: "Kelana Jaya Line",
    displayColor: "#e11d48",
    status: "ACTIVE",
    inServiceVehicleCount: 12,
    totalVehicleCount: 16,
    passengerStatus: "NORMAL",
    passengerStatusMessage: null,
    statusReportCount: 2,
    vehicleStatusCounts: [],
    passengerStatusCount: 1,
    statusWindowMinutes: 15,
    pulseLinks: [],
    ...overrides,
  };
}

/** `n` healthy ACTIVE lines, distinguishable only by id. */
function healthy(n: number, first = 0): LinePulse[] {
  return Array.from({ length: n }, (_, index) =>
    makeLine({ id: `ok-${index + first}`, code: `OK${index + first}` }),
  );
}

const ALL_LINE_STATUSES: LineStatus[] = [
  "TESTING",
  "DEFUNCT",
  "ACTIVE",
  "PARTIAL_ACTIVE",
  "PARTIAL_DISRUPTION",
  "TOTAL_DISRUPTION",
];

const ALL_PASSENGER_STATUSES: PassengerStatus[] = [
  "NORMAL",
  "BUSY",
  "CROWDED",
  "EXTREMELY_CROWDED",
  "BACKLOGGED",
  "DELAYED",
  "DISRUPTED",
];

describe("network-summary.util: severity tables", () => {
  it("scores every line status, with ACTIVE as the floor", () => {
    for (const status of ALL_LINE_STATUSES) {
      expect(LINE_STATUS_SEVERITY_RANK[status], status).toBeTypeOf("number");
    }
    expect(LINE_STATUS_SEVERITY_RANK["ACTIVE"]).toBe(0);
  });

  it("orders the operational states worst-first, above the two un-actionable ones", () => {
    const order = [
      "TOTAL_DISRUPTION",
      "PARTIAL_DISRUPTION",
      "PARTIAL_ACTIVE",
      "DEFUNCT",
      "TESTING",
      "ACTIVE",
    ] as LineStatus[];

    for (let i = 1; i < order.length; i++) {
      expect(LINE_STATUS_SEVERITY_RANK[order[i]]).toBeLessThan(
        LINE_STATUS_SEVERITY_RANK[order[i - 1]],
      );
    }

    // The whole reason the order is not the enum's own: DEFUNCT and TESTING are settled facts a
    // rider cannot act on, so they must not outrank a line that is only partly running.
    expect(LINE_STATUS_SEVERITY_RANK["DEFUNCT"]).toBeLessThan(
      LINE_STATUS_SEVERITY_RANK["PARTIAL_ACTIVE"],
    );
    expect(LINE_STATUS_SEVERITY_RANK["TESTING"]).toBeLessThan(
      LINE_STATUS_SEVERITY_RANK["PARTIAL_DISRUPTION"],
    );
  });

  it("mirrors the backend PassengerStatus enum order in PASSENGER_SEVERITY_RANK", () => {
    expect(Object.keys(PASSENGER_SEVERITY_RANK)).toEqual(ALL_PASSENGER_STATUSES);
    ALL_PASSENGER_STATUSES.forEach((status, index) => {
      expect(PASSENGER_SEVERITY_RANK[status], status).toBe(index);
    });
  });

  it("keeps the needs-attention threshold on DELAYED, and documents the number once", () => {
    expect(NEEDS_ATTENTION_PASSENGER_RANK).toBe(PASSENGER_SEVERITY_RANK["DELAYED"]);
    expect(METHODOLOGY_CONSTANTS["NEEDS_ATTENTION_PASSENGER_RANK"]).toEqual({
      value: NEEDS_ATTENTION_PASSENGER_RANK,
      source: "LINE_STATUS_DERIVE.md",
    });
    // The threshold the hero publishes must resolve to the same number the code compares with,
    // or the popover would describe a different rule than the board applies.
    expect(renderMethodologyCopy(metricDoc("network.needs-attention").definition)).toContain(
      String(NEEDS_ATTENTION_PASSENGER_RANK),
    );
  });
});

describe("network-summary.util: lineNeedsAttention", () => {
  it("accepts a fully-running line with no rider complaint", () => {
    expect(lineNeedsAttention(makeLine())).toBe(false);
  });

  it("flags every non-ACTIVE operational status", () => {
    for (const status of ALL_LINE_STATUSES.filter((entry) => entry !== "ACTIVE")) {
      expect(lineNeedsAttention(makeLine({ status })), status).toBe(true);
    }
  });

  it("flags a running line reported DELAYED or DISRUPTED", () => {
    expect(lineNeedsAttention(makeLine({ passengerStatus: "DELAYED" }))).toBe(true);
    expect(lineNeedsAttention(makeLine({ passengerStatus: "DISRUPTED" }))).toBe(true);
  });

  it("does not flag crowding, which describes one carriage rather than the service", () => {
    // If BUSY/CROWDED/EXTREMELY_CROWDED/BACKLOGGED counted, any busy evening would report zero
    // healthy lines and the headline would stop meaning anything.
    for (const status of [
      "NORMAL",
      "BUSY",
      "CROWDED",
      "EXTREMELY_CROWDED",
      "BACKLOGGED",
    ] as const) {
      expect(lineNeedsAttention(makeLine({ passengerStatus: status })), status).toBe(false);
    }
  });

  it("treats an absent passenger report as no evidence at all", () => {
    expect(lineNeedsAttention(makeLine({ passengerStatus: null }))).toBe(false);
  });
});

describe("network-summary.util: compareLineSeverity", () => {
  it("puts operational severity ahead of passenger severity", () => {
    // A line that will not run outranks one that merely runs badly, no matter how the second is
    // reported — the two axes are compared in order, never summed.
    const broken = makeLine({ code: "AAA", status: "TOTAL_DISRUPTION", passengerStatus: "NORMAL" });
    const crowded = makeLine({ code: "BBB", status: "ACTIVE", passengerStatus: "DISRUPTED" });
    expect(compareLineSeverity(broken, crowded)).toBeLessThan(0);
  });

  it("falls through to the passenger axis when the operations tie", () => {
    const worse = makeLine({ code: "AAA", passengerStatus: "DISRUPTED" });
    const better = makeLine({ code: "BBB", passengerStatus: "BUSY" });
    expect(compareLineSeverity(worse, better)).toBeLessThan(0);
  });

  it("breaks a full tie on the line code, so the order is total and stable", () => {
    const a = makeLine({ code: "AAA" });
    const b = makeLine({ code: "BBB" });
    expect(compareLineSeverity(a, b)).toBeLessThan(0);
    expect(compareLineSeverity(b, a)).toBeGreaterThan(0);
    expect(compareLineSeverity(a, makeLine({ code: "AAA" }))).toBe(0);
  });
});

describe("network-summary.util: sortLinesBySeverity", () => {
  it("returns a new array and never mutates its input", () => {
    const input = [makeLine({ code: "BBB" }), makeLine({ code: "AAA", status: "PARTIAL_ACTIVE" })];
    const before = [...input];

    const sorted = sortLinesBySeverity(input);

    expect(sorted).not.toBe(input);
    expect(input).toEqual(before);
    expect(sorted[0].status).toBe("PARTIAL_ACTIVE");
  });

  it("puts every non-ACTIVE line ahead of every healthy one", () => {
    const sorted = sortLinesBySeverity([
      makeLine({ code: "A01", status: "ACTIVE" }),
      makeLine({ code: "B02", status: "PARTIAL_ACTIVE" }),
      makeLine({ code: "C03", status: "ACTIVE", passengerStatus: "DISRUPTED" }),
      makeLine({ code: "D04", status: "TESTING" }),
      makeLine({ code: "E05", status: "ACTIVE" }),
    ]);

    const codes = sorted.map((line) => line.code);
    // TESTING and DEFUNCT are un-actionable settled facts, so they rank BELOW the partial states
    // even though every one of these is a "non-ACTIVE" line.
    expect(codes.indexOf("B02")).toBeLessThan(codes.indexOf("D04"));
    expect(codes.indexOf("D04")).toBeLessThan(codes.indexOf("C03"));
    expect(codes.indexOf("C03")).toBeLessThan(codes.indexOf("A01"));
    expect(codes.indexOf("A01")).toBeLessThan(codes.indexOf("E05"));
  });

  it("handles an empty list", () => {
    expect(sortLinesBySeverity([])).toEqual([]);
  });
});

describe("network-summary.util: networkHeadline", () => {
  it("says so plainly when there is no data yet", () => {
    // Never "0 of 0 lines running normally": that reads as a total outage rather than a first
    // read still in flight.
    expect(networkHeadline(0, 0, 0)).toBe("No live line data yet");
  });

  it("reports a clean network as all of them", () => {
    expect(networkHeadline(16, 16, 0)).toBe("All 16 lines running normally");
  });

  it("counts the normal ones out of the total", () => {
    expect(networkHeadline(16, 14, 2)).toBe("14 of 16 lines running normally");
  });

  it("avoids the misleading '0 of M' shape when nothing is normal", () => {
    expect(networkHeadline(3, 0, 3)).toBe("No lines running normally — 3 need attention");
  });
});

describe("network-summary.util: networkTone", () => {
  it("stays neutral until a first read lands", () => {
    // Zero lines is a first read in flight, not a good or a bad network — and it must never read as
    // green, which would be a "all clear" nobody can act on.
    expect(networkTone(0, 0)).toBe("unknown");
  });

  it("is green only when every single line is running", () => {
    expect(networkTone(16, 0)).toBe("normal");
  });

  it("is orange for one line among many, and for exactly half", () => {
    expect(networkTone(16, 1)).toBe("degraded");
    // The half-way point is the ceiling of "degraded", NOT the floor of "critical": a network where
    // half the lines need attention is still carrying half the riders.
    expect(networkTone(16, 8)).toBe("degraded");
  });

  it("is red only past half, so a small board is not cried over", () => {
    expect(networkTone(16, 9)).toBe("critical");
    expect(networkTone(4, 3)).toBe("critical");
    expect(networkTone(1, 1)).toBe("critical");
  });
});

describe("network-summary.util: lineCallout", () => {
  it("names the operational status for a line that is not running normally", () => {
    expect(lineCallout(makeLine({ code: "KJL", status: "PARTIAL_DISRUPTION" }))).toBe(
      "KJL — Partial Disruption",
    );
  });

  it("names the rider report for a running line, since there is no operational label to print", () => {
    expect(lineCallout(makeLine({ code: "KJL", passengerStatus: "DISRUPTED" }))).toBe(
      "KJL — riders report it disrupted",
    );
  });
});

describe("network-summary.util: summarizeNetwork", () => {
  it("returns an empty but complete summary for an empty read", () => {
    for (const input of [[], null, undefined]) {
      const summary = summarizeNetwork(input);
      expect(summary.total).toBe(0);
      expect(summary.normalCount).toBe(0);
      expect(summary.needsAttentionCount).toBe(0);
      expect(summary.needsAttentionLines).toEqual([]);
      expect(summary.worstLine).toBeNull();
      expect(summary.callout).toBeNull();
      expect(summary.headline).toBe("No live line data yet");
      expect(summary.reportsNow).toBe(0);
    }
  });

  it("splits normal from needs-attention lines and counts the attention rows", () => {
    const summary = summarizeNetwork([
      makeLine({ code: "A01" }),
      makeLine({ code: "B02", status: "TOTAL_DISRUPTION" }),
      makeLine({ code: "C03" }),
      makeLine({ code: "D04", passengerStatus: "DELAYED" }),
      makeLine({ code: "E05", status: "PARTIAL_ACTIVE" }),
    ]);

    expect(summary.total).toBe(5);
    expect(summary.normalCount).toBe(2);
    expect(summary.needsAttentionCount).toBe(3);
    expect(summary.needsAttentionLines.map((line) => line.code)).toEqual(["B02", "E05", "D04"]);
  });

  it("names the worst line and describes it once", () => {
    const summary = summarizeNetwork([
      makeLine({ code: "A01", passengerStatus: "DISRUPTED" }),
      makeLine({ code: "B02", status: "PARTIAL_DISRUPTION" }),
      makeLine({ code: "C03", status: "TOTAL_DISRUPTION" }),
    ]);

    expect(summary.worstLine?.code).toBe("C03");
    expect(summary.callout).toBe("C03 — Total Disruption");
  });

  it("has no worst line and no callout on a clean network", () => {
    const summary = summarizeNetwork(healthy(3));

    expect(summary.headline).toBe("All 3 lines running normally");
    expect(summary.worstLine).toBeNull();
    expect(summary.callout).toBeNull();
  });

  it("sums the per-line rolling-window report counts", () => {
    const summary = summarizeNetwork([
      makeLine({ statusReportCount: 3 }),
      makeLine({ statusReportCount: 0 }),
      makeLine({ statusReportCount: 5 }),
    ]);

    expect(summary.reportsNow).toBe(8);
  });

  it("treats a missing report count as zero rather than NaN", () => {
    // The query selects the field, but `strict`/`strictNullChecks` are OFF, so a host could hand
    // this a partial object and a NaN would then render in the hero's tile as "NaN".
    const summary = summarizeNetwork([
      { ...makeLine(), statusReportCount: undefined } as unknown as LinePulse,
    ]);

    expect(summary.reportsNow).toBe(0);
  });

  it("does not mutate the caller's array", () => {
    const lines = [makeLine({ code: "B02" }), makeLine({ code: "A01", status: "TESTING" })];
    summarizeNetwork(lines);
    expect(lines.map((line) => line.code)).toEqual(["B02", "A01"]);
  });
});
