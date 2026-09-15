import { describe, expect, it } from "vitest";
import { CalendarIncident } from "../../../insiden/data/insiden.queries";
import { incidentsForLine } from "./insiden-section.util";

const LINE_A = "line-a";
const LINE_B = "line-b";

function incident(id: string, overrides: Partial<CalendarIncident> = {}): CalendarIncident {
  return {
    id,
    startDatetime: "2026-08-01T00:00:00Z",
    endDatetime: null,
    severity: "MINOR",
    title: id,
    brief: "",
    details: "",
    hasDetails: false,
    impactFactor: 1,
    longTerm: false,
    inaccurate: false,
    lastUpdated: "2026-08-01T00:00:00Z",
    lines: [{ id: LINE_A, code: "A", displayName: "Line A" }],
    vehicles: [],
    stations: [],
    chronologies: [],
    voteScore: 0,
    voteBreakdown: { upvotes: 0, downvotes: 0 },
    userVote: 0,
    medias: [],
    ...overrides,
  };
}

describe("incidentsForLine", () => {
  it("filters out incidents not tagged to the line", () => {
    const result = incidentsForLine(
      [
        incident("kept", { lines: [{ id: LINE_A, code: "A", displayName: "Line A" }] }),
        incident("dropped", { lines: [{ id: LINE_B, code: "B", displayName: "Line B" }] }),
      ],
      LINE_A,
    );

    expect(result.map((i) => i.id)).toEqual(["kept"]);
  });

  it("sorts ongoing incidents before resolved ones", () => {
    const result = incidentsForLine(
      [
        incident("resolved-old", {
          endDatetime: "2026-08-03T00:00:00Z",
          startDatetime: "2026-08-02T00:00:00Z",
        }),
        incident("ongoing", { endDatetime: null, startDatetime: "2026-08-01T00:00:00Z" }),
        incident("resolved-new", {
          endDatetime: "2026-08-05T00:00:00Z",
          startDatetime: "2026-08-04T00:00:00Z",
        }),
      ],
      LINE_A,
    );

    expect(result.map((i) => i.id)).toEqual(["ongoing", "resolved-new", "resolved-old"]);
  });

  it("sorts resolved incidents newest-first by startDatetime", () => {
    const result = incidentsForLine(
      [
        incident("older", {
          endDatetime: "2026-08-05T00:00:00Z",
          startDatetime: "2026-08-01T00:00:00Z",
        }),
        incident("newer", {
          endDatetime: "2026-08-06T00:00:00Z",
          startDatetime: "2026-08-04T00:00:00Z",
        }),
      ],
      LINE_A,
    );

    expect(result.map((i) => i.id)).toEqual(["newer", "older"]);
  });

  it("keeps incidents tagged to multiple lines (one of which matches)", () => {
    const both = incident("both", {
      lines: [
        { id: LINE_A, code: "A", displayName: "Line A" },
        { id: LINE_B, code: "B", displayName: "Line B" },
      ],
    });

    const result = incidentsForLine([both, incident("other")], LINE_B);

    expect(result.map((i) => i.id)).toEqual(["both"]);
  });

  it("returns an empty array for empty input", () => {
    expect(incidentsForLine([], LINE_A)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [
      incident("resolved-old", {
        endDatetime: "2026-08-03T00:00:00Z",
        startDatetime: "2026-08-02T00:00:00Z",
      }),
      incident("ongoing", { endDatetime: null, startDatetime: "2026-08-01T00:00:00Z" }),
      incident("dropped", { lines: [{ id: LINE_B, code: "B", displayName: "Line B" }] }),
    ];
    const idsBefore = input.map((i) => i.id);

    incidentsForLine(input, LINE_A);

    expect(input.map((i) => i.id)).toEqual(idsBefore);
  });
});
