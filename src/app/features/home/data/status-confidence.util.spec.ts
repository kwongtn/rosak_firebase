import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONSTANTS } from "../../../core/methodology/methodology.constants";
import {
  metricDoc,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import type { LinePulse } from "./home-board.queries";
import type { LineStatus, PassengerStatus } from "./home.queries";
import {
  CONFIRMED_MIN_REPORTS,
  StatusConfidenceInput,
  hasOfficialPulseLink,
  lineHasData,
  statusConfidence,
} from "./status-confidence.util";

/** Shorthand for the three facts a line always has, with the rest left absent on purpose. */
function evidence(overrides: Partial<StatusConfidenceInput> = {}): StatusConfidenceInput {
  return { status: "ACTIVE", passengerStatus: "NORMAL", reportCount: 0, ...overrides };
}

describe("status-confidence.util: statusConfidence", () => {
  describe("official — the operator outranks every count", () => {
    it("reads official from an operator-sourced pulse link even with no rider reports", () => {
      const result = statusConfidence(evidence({ hasOfficialPost: true }));

      expect(result.level).toBe("official");
      expect(result.label).toBe("Official update");
      expect(result.reportCount).toBe(0);
    });

    it("stays official when the line is ALSO heavily reported", () => {
      // The load-bearing assertion of the whole ordering: a rider tally is not stronger evidence
      // than the operator saying so, so "confirmed" must not win here.
      const result = statusConfidence(
        evidence({ hasOfficialPost: true, reportCount: 99, passengerStatus: "DISRUPTED" }),
      );

      expect(result.level).toBe("official");
    });

    it("is official on a clean line too — an operator post is evidence in its own right", () => {
      const result = statusConfidence(evidence({ hasOfficialPost: true, status: "ACTIVE" }));

      expect(result.level).toBe("official");
    });
  });

  describe("none — nothing to be confident about", () => {
    it("reads none for a healthy line nobody has reported", () => {
      const result = statusConfidence(evidence());

      expect(result.level).toBe("none");
      expect(result.label).toBe("No recent reports");
    });

    it("does not treat a NORMAL passenger status as evidence", () => {
      // NORMAL is the backend's derived "nothing notable" reading. Counting it as evidence would put
      // a confident green chip on a line nobody has ever reported — the exact failure the chip exists
      // to prevent.
      const result = statusConfidence(evidence({ passengerStatus: "NORMAL", reportCount: 0 }));

      expect(result.level).toBe("none");
    });

    it("does not treat crowding as evidence of a service problem", () => {
      // CROWDED is a real report, so the line is not "none" — but it is nowhere near corroborated,
      // so it lands on unconfirmed with its count, not on none.
      const result = statusConfidence(evidence({ passengerStatus: "CROWDED", reportCount: 1 }));

      expect(result.level).toBe("unconfirmed");
    });

    it("treats every absent field as no evidence rather than throwing", () => {
      for (const input of [undefined, null, {}, { reportCount: null }, { status: null }]) {
        expect(statusConfidence(input as StatusConfidenceInput).level, JSON.stringify(input)).toBe(
          "none",
        );
      }
    });
  });

  describe("confirmed — several people independently", () => {
    it("confirms at exactly the published threshold", () => {
      const result = statusConfidence(evidence({ reportCount: CONFIRMED_MIN_REPORTS }));

      expect(result.level).toBe("confirmed");
      expect(result.label).toBe("Confirmed");
    });

    it("confirms above the threshold", () => {
      expect(statusConfidence(evidence({ reportCount: 12 })).level).toBe("confirmed");
    });

    it("confirms a DELAYED line that reaches the threshold", () => {
      const result = statusConfidence(
        evidence({ passengerStatus: "DELAYED", reportCount: CONFIRMED_MIN_REPORTS }),
      );

      expect(result.level).toBe("confirmed");
    });
  });

  describe("unconfirmed — something to report, too thin to trust", () => {
    it("stays unconfirmed one report below the threshold", () => {
      const result = statusConfidence(evidence({ reportCount: CONFIRMED_MIN_REPORTS - 1 }));

      expect(result.level).toBe("unconfirmed");
      expect(result.label).toBe(`Unconfirmed (${CONFIRMED_MIN_REPORTS - 1} reports)`);
    });

    it("prints the count in the chip label, so the reader can weigh it without opening a popover", () => {
      expect(statusConfidence(evidence({ reportCount: 2 })).label).toBe("Unconfirmed (2 reports)");
    });

    it("accepts an operator-declared disruption with NO rider reports behind it", () => {
      // `PARTIAL_DISRUPTION` has been told to us; nobody has filed about it. "(0 reports)" is a true
      // and useful statement — dropping the count would imply there were some.
      const result = statusConfidence(evidence({ status: "PARTIAL_DISRUPTION" }));

      expect(result.level).toBe("unconfirmed");
      expect(result.label).toBe("Unconfirmed (0 reports)");
    });

    it("accepts a DELAYED rider report with no count behind it", () => {
      expect(statusConfidence(evidence({ passengerStatus: "DELAYED" })).level).toBe("unconfirmed");
    });

    it("counts a zero report reading as evidence when the line is degraded", () => {
      const result = statusConfidence(evidence({ reportCount: 0, status: "TESTING" }));

      expect(result.level).toBe("unconfirmed");
      expect(result.reportCount).toBe(0);
    });
  });

  describe("evidence rules", () => {
    it("reads a non-ACTIVE operational status as evidence on its own", () => {
      for (const status of [
        "TESTING",
        "DEFUNCT",
        "PARTIAL_ACTIVE",
        "PARTIAL_DISRUPTION",
        "TOTAL_DISRUPTION",
      ] as LineStatus[]) {
        expect(statusConfidence(evidence({ status })).level, status).toBe("unconfirmed");
      }
    });

    it("reads a passenger status above NORMAL as evidence on its own", () => {
      for (const status of [
        "BUSY",
        "CROWDED",
        "EXTREMELY_CROWDED",
        "BACKLOGGED",
        "DELAYED",
        "DISRUPTED",
      ] as PassengerStatus[]) {
        expect(statusConfidence(evidence({ passengerStatus: status })).level, status).toBe(
          "unconfirmed",
        );
      }
    });

    it("normalizes a nonsensical report count rather than trusting it", () => {
      // `strictNullChecks` is off and a hand-built fixture is a legal input, so a missing /
      // non-finite / negative count must read as "no reports" and never as something the threshold
      // comparison silently passes or crashes on.
      for (const reportCount of [Number.NaN, Number.POSITIVE_INFINITY, -5, null, undefined]) {
        const result = statusConfidence(evidence({ reportCount }));
        expect(result.reportCount, String(reportCount)).toBe(0);
        expect(result.level, String(reportCount)).toBe("none");
      }
    });

    it("floors a fractional report count instead of reporting a fraction of a rider", () => {
      expect(statusConfidence(evidence({ reportCount: 3.9 })).reportCount).toBe(3);
      expect(statusConfidence(evidence({ reportCount: 2.9 })).level).toBe("unconfirmed");
    });
  });

  describe("every level points at a registry metric that exists", () => {
    it.each([
      [{ hasOfficialPost: true }, "official"],
      [{ reportCount: 5 }, "confirmed"],
      [{ reportCount: 1 }, "unconfirmed"],
      [{}, "none"],
    ] as Array<[Partial<StatusConfidenceInput>, string]>)(
      "the %s reading resolves its own popover copy from the methodology registry",
      (input, level) => {
        const result = statusConfidence(evidence(input));
        expect(result.level).toBe(level);
        expect(result.metricId).toBe(`status-confidence.${level}`);

        const doc = metricDoc(result.metricId);
        expect(doc.sectionId).toBe("line-status");
        expect(doc.lastReviewed).toBe("2026-10-03");
        // Rendered, not raw: a definition with an unresolved token would throw here, which is what
        // keeps the popover and /methodology in step with the number the code compares.
        expect(renderMethodologyCopy(doc.definition)).not.toContain("{{");
      },
    );
  });

  it("documents the corroboration threshold once, and the copy names that same number", () => {
    // One number, two readers: the code compares with it and the registry publishes it. If either
    // side moved alone, the popover would describe a different rule than the chip applies.
    expect(METHODOLOGY_CONSTANTS["CONFIRMED_MIN_REPORTS"]).toEqual({
      value: CONFIRMED_MIN_REPORTS,
      source: "LINE_STATUS_DERIVE.md",
    });
    expect(renderMethodologyCopy(metricDoc("status-confidence.confirmed").definition)).toContain(
      String(CONFIRMED_MIN_REPORTS),
    );
  });

  it("gives each level its own colour, so the card and the row cannot drift apart", () => {
    expect(statusConfidence(evidence({ hasOfficialPost: true })).variant).toBe("info");
    expect(statusConfidence(evidence({ reportCount: 5 })).variant).toBe("success");
    expect(statusConfidence(evidence({ reportCount: 1 })).variant).toBe("warning");
    expect(statusConfidence(evidence()).variant).toBe("neutral");
  });
});

describe("status-confidence.util: hasOfficialPulseLink", () => {
  it("is true when any one of the links is operator-sourced", () => {
    expect(
      hasOfficialPulseLink([{ isAutomated: false }, { isAutomated: true }, { isAutomated: false }]),
    ).toBe(true);
  });

  it("is false when none is, and false for an empty or absent list", () => {
    expect(hasOfficialPulseLink([{ isAutomated: false }])).toBe(false);
    expect(hasOfficialPulseLink([])).toBe(false);
    expect(hasOfficialPulseLink(null)).toBe(false);
    expect(hasOfficialPulseLink(undefined)).toBe(false);
  });

  it("requires a real boolean true, so an absent field cannot claim provenance", () => {
    // The field is non-null on the server, but `strictNullChecks` is OFF and a stale cache entry
    // can omit it. Reading a truthy non-boolean here would put an "Official update" badge on a line
    // the operator never announced.
    expect(hasOfficialPulseLink([{}])).toBe(false);
    expect(hasOfficialPulseLink([{ isAutomated: null }])).toBe(false);
    expect(hasOfficialPulseLink([{ isAutomated: 1 as unknown as boolean }])).toBe(false);
    expect(hasOfficialPulseLink([{ isAutomated: "yes" as unknown as boolean }])).toBe(false);
  });
});

describe("status-confidence.util: lineHasData", () => {
  /** A line with nothing notable: the confidence rule resolves it to `none`. */
  function quietLine(overrides: Partial<LinePulse> = {}): LinePulse {
    return {
      id: "a",
      code: "A",
      displayName: "Line A",
      displayColor: "#ff0000",
      status: "ACTIVE",
      inServiceVehicleCount: 0,
      totalVehicleCount: 0,
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

  it("is false for a quiet line — a derived NORMAL passenger status is not evidence", () => {
    // The exact failure the rule guards: NORMAL is the backend's "nothing notable" answer, not a
    // report, so a line nobody has reported must not claim to "have data".
    expect(lineHasData(quietLine())).toBe(false);
  });

  it("is true for a report inside the line's window", () => {
    expect(lineHasData(quietLine({ statusReportCount: 1 }))).toBe(true);
  });

  it("is true for a non-ACTIVE operational status even with no reports behind it", () => {
    expect(lineHasData(quietLine({ status: "PARTIAL_DISRUPTION" }))).toBe(true);
  });

  it("is true for a rider-reported passenger status above NORMAL", () => {
    expect(lineHasData(quietLine({ passengerStatus: "CROWDED" }))).toBe(true);
  });

  it("is true for an operator-sourced pulse link", () => {
    expect(
      lineHasData(
        quietLine({ pulseLinks: [{ isAutomated: true } as LinePulse["pulseLinks"][number]] }),
      ),
    ).toBe(true);
  });
});
