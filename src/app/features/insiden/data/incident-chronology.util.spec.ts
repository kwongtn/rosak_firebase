import { CalendarIncident } from "./insiden.queries";
import { buildChronologyEntries } from "./incident-chronology.util";

function makeIncident(overrides: Partial<CalendarIncident> = {}): CalendarIncident {
  return {
    id: "1",
    startDatetime: "2026-08-01T08:00:00+08:00",
    endDatetime: null,
    severity: "MINOR",
    title: "Test incident",
    brief: "",
    details: "",
    hasDetails: false,
    impactFactor: 0,
    longTerm: false,
    inaccurate: false,
    lastUpdated: "2026-08-01T08:00:00+08:00",
    lines: [],
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

function chronology(order: number, content: string) {
  return {
    order,
    indicator: "BLUE" as const,
    datetime: "2026-08-01T08:00:00+08:00",
    content,
    sourceUrl: null,
  };
}

describe("buildChronologyEntries", () => {
  it("empty chronologies + resolved → default start and end entries, no synthetic entry", () => {
    const entries = buildChronologyEntries(
      makeIncident({ endDatetime: "2026-08-01T10:00:00+08:00" }),
    );

    expect(entries.map((e) => e.content)).toEqual(["Start of incident", "Issue resolved"]);
    expect(entries[0]?.indicator).toBe("BLUE");
    expect(entries[1]?.indicator).toBe("GREEN");
    expect(entries.some((e) => e.synthetic === true)).toBe(false);
  });

  it("empty chronologies + ongoing → default start entry plus a synthetic RED tail entry", () => {
    const entries = buildChronologyEntries(makeIncident());

    expect(entries.length).toBe(2);
    expect(entries[0]?.content).toBe("Start of incident");
    expect(entries[0]?.synthetic).toBeUndefined();
    expect(entries[1]?.synthetic).toBe(true);
    expect(entries[1]?.indicator).toBe("RED");
    expect(entries[1]?.order).toBe(1);
  });

  it("real chronologies + ongoing → sorted entries then synthetic appended with order = max + 1", () => {
    const entries = buildChronologyEntries(
      makeIncident({
        chronologies: [
          chronology(0, "start"),
          chronology(5, "update B"),
          chronology(3, "update A"),
        ],
      }),
    );

    expect(entries.map((e) => e.content)).toEqual(["start", "update A", "update B", "Ongoing"]);
    expect(entries[0]?.synthetic).toBeUndefined();
    expect(entries[3]?.synthetic).toBe(true);
    expect(entries[3]?.order).toBe(6);
  });

  it("sorts entries by order ascending and adds no synthetic entry when resolved", () => {
    const entries = buildChronologyEntries(
      makeIncident({
        endDatetime: "2026-08-01T10:00:00+08:00",
        chronologies: [chronology(3, "third"), chronology(1, "first"), chronology(2, "second")],
      }),
    );

    expect(entries.map((e) => e.content)).toEqual(["first", "second", "third"]);
    expect(entries.some((e) => e.synthetic === true)).toBe(false);
  });
});
