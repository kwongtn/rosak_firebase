import { dateKeyOf, incidentCoversDate } from "./calendar-date.util";
import { CalendarIncident } from "./insiden.queries";

function createMockIncident(
  startDatetime: string,
  endDatetime: string | null = null,
): CalendarIncident {
  return {
    id: "inc-1",
    startDatetime,
    endDatetime,
    severity: "MAJOR",
    title: "Test Incident",
    brief: "Test Brief",
    details: "Test Details",
    hasDetails: true,
    impactFactor: 1,
    longTerm: false,
    inaccurate: false,
    lastUpdated: "2026-03-01T00:00:00Z",
    lines: [],
    vehicles: [],
    stations: [],
    chronologies: [],
    voteScore: 0,
    voteBreakdown: { upvotes: 0, downvotes: 0 },
    userVote: 0,
    medias: [],
  };
}

describe("dateKeyOf", () => {
  it("formats Date into YYYY-MM-DD using UTC values", () => {
    const date = new Date(Date.UTC(2026, 2, 15, 12, 30, 0));
    expect(dateKeyOf(date)).toBe("2026-03-15");
  });

  it("pads single-digit months and days with leading zeros", () => {
    const date = new Date(Date.UTC(2026, 0, 5, 0, 0, 0));
    expect(dateKeyOf(date)).toBe("2026-01-05");
  });

  it("remains consistent across timezone boundaries (UTC day boundary)", () => {
    // 23:59:59 UTC vs 00:00:00 UTC next day
    const lateUtc = new Date(Date.UTC(2026, 11, 31, 23, 59, 59, 999));
    const earlyUtc = new Date(Date.UTC(2027, 0, 1, 0, 0, 0, 0));

    expect(dateKeyOf(lateUtc)).toBe("2026-12-31");
    expect(dateKeyOf(earlyUtc)).toBe("2027-01-01");
  });

  it("handles leap day correctly", () => {
    const leapDay = new Date(Date.UTC(2024, 1, 29, 10, 0, 0));
    expect(dateKeyOf(leapDay)).toBe("2024-02-29");
  });
});

describe("incidentCoversDate", () => {
  it("returns false if dateKey is strictly before startDatetime", () => {
    const incident = createMockIncident("2026-05-10T08:00:00Z", "2026-05-12T18:00:00Z");
    expect(incidentCoversDate(incident, "2026-05-09")).toBe(false);
  });

  it("returns true on the exact start date", () => {
    const incident = createMockIncident("2026-05-10T08:00:00Z", "2026-05-12T18:00:00Z");
    expect(incidentCoversDate(incident, "2026-05-10")).toBe(true);
  });

  it("returns true on intermediate days of a multi-day spanning incident", () => {
    const incident = createMockIncident("2026-05-10T08:00:00Z", "2026-05-12T18:00:00Z");
    expect(incidentCoversDate(incident, "2026-05-11")).toBe(true);
  });

  it("returns true on the exact end date", () => {
    const incident = createMockIncident("2026-05-10T08:00:00Z", "2026-05-12T18:00:00Z");
    expect(incidentCoversDate(incident, "2026-05-12")).toBe(true);
  });

  it("returns false if dateKey is strictly after endDatetime", () => {
    const incident = createMockIncident("2026-05-10T08:00:00Z", "2026-05-12T18:00:00Z");
    expect(incidentCoversDate(incident, "2026-05-13")).toBe(false);
  });

  describe("ongoing incidents (null endDatetime)", () => {
    it("returns true for any date on or after startDatetime when endDatetime is null", () => {
      const incident = createMockIncident("2026-05-10T08:00:00Z", null);

      expect(incidentCoversDate(incident, "2026-05-10")).toBe(true);
      expect(incidentCoversDate(incident, "2026-05-20")).toBe(true);
      expect(incidentCoversDate(incident, "2099-12-31")).toBe(true);
    });

    it("returns false for date before startDatetime when endDatetime is null", () => {
      const incident = createMockIncident("2026-05-10T08:00:00Z", null);
      expect(incidentCoversDate(incident, "2026-05-09")).toBe(false);
    });
  });

  describe("single-day incidents", () => {
    it("returns true only on the incident day", () => {
      const incident = createMockIncident("2026-06-01T01:00:00Z", "2026-06-01T04:00:00Z");

      expect(incidentCoversDate(incident, "2026-05-31")).toBe(false);
      expect(incidentCoversDate(incident, "2026-06-01")).toBe(true);
      expect(incidentCoversDate(incident, "2026-06-02")).toBe(false);
    });
  });
});
