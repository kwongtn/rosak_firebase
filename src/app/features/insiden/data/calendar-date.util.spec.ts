import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { klDateKey } from "../../../core/time/kl-date";
import {
  CALENDAR_WINDOW_PAD_DAYS,
  calendarMonthRange,
  dateKeyOf,
  incidentCoversDate,
} from "./calendar-date.util";
import { CalendarIncident } from "./insiden.queries";
import { mytInstant, naiveMyt, SPEC_ZONES } from "../../../../testing/naive-myt";

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

describe("calendarMonthRange", () => {
  it.each([
    ["2026-09", "2026-08-18", "2026-10-14"],
    ["2026-01", "2025-12-18", "2026-02-14"],
    ["2026-12", "2026-11-17", "2027-01-14"],
    ["2024-02", "2024-01-18", "2024-03-14"],
    ["2025-02", "2025-01-18", "2025-03-14"],
  ])("pads %s by exactly fourteen days on either side", (month, start, end) => {
    expect(calendarMonthRange(month)).toEqual({ start, end });
  });

  it("pads by CALENDAR_WINDOW_PAD_DAYS, the figure the page's scope note quotes", () => {
    expect(CALENDAR_WINDOW_PAD_DAYS).toBe(14);
    // 2026-09: the 1st minus the pad, and the day after the last day plus the pad.
    const { start, end } = calendarMonthRange("2026-09");
    expect(start).toBe(dateKeyOf(new Date(Date.UTC(2026, 8, 1 - CALENDAR_WINDOW_PAD_DAYS))));
    expect(end).toBe(dateKeyOf(new Date(Date.UTC(2026, 9, CALENDAR_WINDOW_PAD_DAYS))));
  });
});

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

describe.each(SPEC_ZONES)("the API's naive times across 00:00-08:00 Kuala Lumpur, in %s", (tz) => {
  beforeEach(() => {
    vi.stubEnv("TZ", tz);
    vi.useFakeTimers({ toFake: ["Date"] });
    // 05:23 MYT on 1 October, which is still 30 September (21:23) in UTC.
    vi.setSystemTime(mytInstant("2026-10-01", "05:23:15"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("puts an incident on the Malaysian day of its naive start and end", () => {
    const lastSecond = createMockIncident(
      naiveMyt("2026-09-30", "23:59:59"),
      naiveMyt("2026-10-01", "00:00:00"),
    );
    const earlyMorning = createMockIncident(naiveMyt("2026-10-01", "05:23:15", 833490), null);

    expect(incidentCoversDate(lastSecond, "2026-09-30")).toBe(true);
    expect(incidentCoversDate(lastSecond, "2026-10-01")).toBe(true);
    expect(incidentCoversDate(lastSecond, "2026-10-02")).toBe(false);
    expect(incidentCoversDate(earlyMorning, "2026-09-30")).toBe(false);
    expect(incidentCoversDate(earlyMorning, "2026-10-01")).toBe(true);
  });

  it("finds an incident from 05:23 on Today, the Kuala Lumpur day, and its month's window", () => {
    const today = klDateKey();
    const earlyMorning = createMockIncident(naiveMyt("2026-10-01", "05:23:15", 833490), null);

    expect(today).toBe("2026-10-01");
    expect(incidentCoversDate(earlyMorning, today)).toBe(true);
    expect(calendarMonthRange(today.slice(0, 7))).toEqual({
      start: "2026-09-17",
      end: "2026-11-14",
    });
    // Why dateKeyOf must never be handed the clock: it is still the 30th in UTC, which would open
    // September and miss the incident.
    expect(dateKeyOf(new Date())).toBe("2026-09-30");
    expect(incidentCoversDate(earlyMorning, dateKeyOf(new Date()))).toBe(false);
  });
});
