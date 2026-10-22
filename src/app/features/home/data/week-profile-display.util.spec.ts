import { METHODOLOGY_CONSTANTS } from "../../../core/methodology/methodology.constants";
import {
  metricDoc,
  metricTooltip,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import type { LineStatusWeekBucket } from "./home-history.queries";
import { PASSENGER_BAR_CLASS, PASSENGER_NO_DATA_BAR_CLASS } from "./passenger-status.util";
import { SERVICE_DAY_START_HOUR } from "./status-history-display.util";
import {
  MIN_REPORTS_PER_WEEK_SLOT,
  WEEK_PROFILE_WEEKS,
  buildWeekProfile,
  notEnoughReportsPhrase,
} from "./week-profile-display.util";

/** One slot as the backend sends it. */
function slot(
  weekday: number,
  hour: number,
  count: number,
  overrides: Partial<LineStatusWeekBucket> = {},
): LineStatusWeekBucket {
  return {
    weekday,
    hour,
    count,
    dominantStatus: count > 0 ? "CROWDED" : null,
    statusCounts: count > 0 ? [{ status: "CROWDED", count }] : [],
    ...overrides,
  };
}

/**
 * All 168 slots in the order the backend sends them (Monday first, then the service day's hours from
 * `dayStartHour`), empty unless `filled` says otherwise. Keys are "weekday:hour".
 */
function fullWeek(
  filled: Record<string, LineStatusWeekBucket> = {},
  dayStartHour = SERVICE_DAY_START_HOUR,
): LineStatusWeekBucket[] {
  const slots: LineStatusWeekBucket[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let index = 0; index < 24; index++) {
      const hour = (dayStartHour + index) % 24;
      slots.push(filled[`${weekday}:${hour}`] ?? slot(weekday, hour, 0));
    }
  }
  return slots;
}

describe("week-profile-display.util: the published constants", () => {
  it("sends and applies the numbers the methodology page publishes", () => {
    // The popover and /methodology say "last N weeks" and "fewer than M reports" from registry
    // tokens; these pins keep the sentence from drifting away from the window the read sends and the
    // threshold the strip applies.
    expect(WEEK_PROFILE_WEEKS).toBe(METHODOLOGY_CONSTANTS["WEEK_PROFILE_WEEKS"].value);
    expect(MIN_REPORTS_PER_WEEK_SLOT).toBe(
      METHODOLOGY_CONSTANTS["MIN_REPORTS_PER_WEEK_SLOT"].value,
    );
  });

  it("resolves the typical-week definition and summary with those numbers and no raw token", () => {
    const definition = renderMethodologyCopy(metricDoc("line-status.typical-week").definition);
    const tooltip = metricTooltip("line-status.typical-week");
    for (const text of [definition, tooltip]) {
      expect(text).not.toContain("{{");
      expect(text).toContain(`last ${WEEK_PROFILE_WEEKS} weeks`);
      expect(text).toMatch(new RegExp(`fewer than ${MIN_REPORTS_PER_WEEK_SLOT} reports`, "i"));
      expect(text).toContain(`${SERVICE_DAY_START_HOUR}:00 to 02:00`);
    }
  });
});

describe("week-profile-display.util: the empty case", () => {
  it("is empty, with nothing to draw, when the backend sends no slots", () => {
    expect(buildWeekProfile([])).toEqual({ state: "empty", total: 0, columns: [], days: [] });
  });

  it("is empty when every slot of a full week holds no report", () => {
    const profile = buildWeekProfile(fullWeek());
    expect(profile.state).toBe("empty");
    expect(profile.days).toEqual([]);
  });

  it("is empty when the only slots sent are outside the grid", () => {
    const profile = buildWeekProfile([slot(7, 3, 9), slot(0, 24, 9), slot(-1, 3, 9)]);
    expect(profile.state).toBe("empty");
    expect(profile.total).toBe(0);
  });
});

describe("week-profile-display.util: the layout", () => {
  const profile = buildWeekProfile(fullWeek({ "0:3": slot(0, 3, 4) }));

  it("has seven rows, Monday first", () => {
    expect(profile.days.map((day) => day.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(profile.days.map((day) => day.short)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(profile.days[0]?.name).toBe("Monday");
    expect(profile.days[6]?.name).toBe("Sunday");
  });

  it("runs the 24 columns in service-day order from the day start, like today's chart", () => {
    expect(profile.columns.map((column) => column.label)).toEqual([
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
      "16",
      "17",
      "18",
      "19",
      "20",
      "21",
      "22",
      "23",
      "00",
      "01",
      "02",
    ]);
    for (const day of profile.days) {
      expect(day.cells.map((cell) => cell.hour)).toEqual(profile.columns.map((c) => c.hour));
    }
  });

  it("prints an axis label on every other column only, starting with the first", () => {
    expect(profile.columns.map((column) => column.tick).slice(0, 6)).toEqual([
      "03",
      "",
      "05",
      "",
      "07",
      "",
    ]);
    expect(profile.columns.filter((column) => column.tick !== "")).toHaveLength(12);
  });

  it("writes each column's hour as a range, wrapping 23:00 to 00:00", () => {
    const ranges = profile.columns.map((column) => column.range);
    expect(ranges[0]).toBe("03:00–04:00");
    expect(ranges[20]).toBe("23:00–00:00");
    expect(ranges[23]).toBe("02:00–03:00");
  });

  it("files the small hours at the END of the service day's row, under the weekday they belong to", () => {
    // The backend's weekday is the SERVICE day's: 01:30 on a Tuesday is Monday, hour 1.
    const monday = buildWeekProfile(fullWeek({ "0:1": slot(0, 1, 5) })).days[0];
    const cell = monday?.cells.find((candidate) => candidate.count > 0);
    expect(monday?.cells.indexOf(cell as NonNullable<typeof cell>)).toBe(22);
    expect(cell?.title).toBe("Monday 01:00–02:00 · 5 reports · Crowded 5");
  });

  it("does not depend on the order the slots arrive in", () => {
    const ordered = fullWeek({ "2:7": slot(2, 7, 6), "5:23": slot(5, 23, 3) });
    // A fixed pseudo-random permutation (an LCG-driven Fisher-Yates), so a failure reproduces.
    const shuffled = [...ordered];
    let seed = 12345;
    for (let index = shuffled.length - 1; index > 0; index--) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const other = seed % (index + 1);
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    expect(shuffled).not.toEqual(ordered);
    expect(buildWeekProfile(shuffled)).toEqual(buildWeekProfile(ordered));
  });

  it("starts the columns at the day start it is given, for a window sent with another start", () => {
    const fromMidnight = buildWeekProfile(fullWeek({ "0:0": slot(0, 0, 4) }, 0), 0);
    expect(fromMidnight.columns.map((column) => column.label).slice(0, 3)).toEqual([
      "00",
      "01",
      "02",
    ]);
    expect(fromMidnight.columns[23]?.label).toBe("23");
    const fromFive = buildWeekProfile(fullWeek({ "0:5": slot(0, 5, 4) }, 5), 5);
    expect(fromFive.columns[0]?.label).toBe("05");
    expect(fromFive.columns[23]?.label).toBe("04");
    expect(fromFive.days[0]?.cells[0]?.count).toBe(4);
  });

  it("draws a slot the backend left out as an empty cell, so every row stays 24 wide", () => {
    const sparse = buildWeekProfile([slot(3, 15, 9)]);
    expect(sparse.days).toHaveLength(7);
    for (const day of sparse.days) {
      expect(day.cells).toHaveLength(24);
    }
    const monday = sparse.days[0]?.cells[0];
    expect(monday?.muted).toBe(true);
    expect(monday?.count).toBe(0);
  });

  it("ignores a slot outside the grid and leaves it out of the total", () => {
    const withStray = buildWeekProfile([slot(3, 15, 9), slot(8, 15, 50), slot(3, 30, 50)]);
    expect(withStray.total).toBe(9);
    expect(withStray.days.flatMap((day) => day.cells).filter((cell) => !cell.muted)).toHaveLength(
      1,
    );
  });

  it("totals the reports across the grid", () => {
    expect(buildWeekProfile(fullWeek({ "0:3": slot(0, 3, 4), "6:2": slot(6, 2, 7) })).total).toBe(
      11,
    );
  });
});

describe("week-profile-display.util: the minimum-report threshold", () => {
  function cellAt(weekday: number, hour: number, ...slots: LineStatusWeekBucket[]) {
    return buildWeekProfile(slots).days[weekday]?.cells.find((cell) => cell.hour === hour);
  }

  it("mutes a slot with fewer reports than the minimum and says so, with the count", () => {
    const profile = buildWeekProfile([slot(3, 15, 9), slot(3, 8, MIN_REPORTS_PER_WEEK_SLOT - 1)]);
    const cell = profile.days[3]?.cells.find((candidate) => candidate.hour === 8);
    expect(cell?.muted).toBe(true);
    expect(cell?.status).toBeNull();
    expect(cell?.colorClass).toBe(PASSENGER_NO_DATA_BAR_CLASS);
    expect(cell?.text).toBe("Not enough reports (2 of 3)");
    expect(cell?.title).toBe("Thursday 08:00–09:00 · Not enough reports (2 of 3)");
  });

  it("colours a slot that has exactly the minimum with its dominant status", () => {
    const cell = cellAt(3, 15, slot(3, 15, MIN_REPORTS_PER_WEEK_SLOT));
    expect(cell?.muted).toBe(false);
    expect(cell?.status).toBe("CROWDED");
    expect(cell?.colorClass).toBe(PASSENGER_BAR_CLASS["CROWDED"]);
    expect(cell?.text).toBe("Crowded, 3 reports");
    expect(cell?.title).toBe("Thursday 15:00–16:00 · 3 reports · Crowded 3");
  });

  it("mutes a slot with no report at all, and counts it as zero of the minimum", () => {
    const empty = cellAt(3, 16, slot(3, 15, 9), slot(3, 16, 0));
    expect(empty?.muted).toBe(true);
    expect(empty?.text).toBe("Not enough reports (0 of 3)");
  });

  it("paints each status with the colour the other history widgets use", () => {
    const statuses = [
      "NORMAL",
      "BUSY",
      "CROWDED",
      "EXTREMELY_CROWDED",
      "BACKLOGGED",
      "DELAYED",
    ] as const;
    const profile = buildWeekProfile([
      ...statuses.map((status, index) =>
        slot(0, 3 + index, 4, { dominantStatus: status, statusCounts: [{ status, count: 4 }] }),
      ),
      slot(0, 10, 4, {
        dominantStatus: "DISRUPTED",
        statusCounts: [{ status: "DISRUPTED", count: 4 }],
      }),
    ]);
    const monday = profile.days[0]?.cells ?? [];
    statuses.forEach((status, index) => {
      expect(monday[index]?.colorClass).toBe(PASSENGER_BAR_CLASS[status]);
    });
    expect(monday[7]?.colorClass).toBe(PASSENGER_BAR_CLASS["DISRUPTED"]);
  });

  it("lists the slot's own breakdown in the backend's order, not just the dominant status", () => {
    const cell = cellAt(
      3,
      7,
      slot(3, 7, 7, {
        dominantStatus: "NORMAL",
        statusCounts: [
          { status: "NORMAL", count: 3 },
          { status: "BUSY", count: 1 },
          { status: "DELAYED", count: 3 },
        ],
      }),
    );
    expect(cell?.title).toBe("Thursday 07:00–08:00 · 7 reports · Normal 3, Busy 1, Delayed 3");
    expect(cell?.text).toBe("Normal, 7 reports");
  });

  it("mutes a slot with plenty of reports but no dominant status to paint", () => {
    const cell = cellAt(3, 15, slot(3, 15, 20, { dominantStatus: null, statusCounts: [] }));
    expect(cell?.muted).toBe(true);
    expect(cell?.colorClass).toBe(PASSENGER_NO_DATA_BAR_CLASS);
  });

  it("moves the threshold when it is given another minimum", () => {
    const slots = [slot(3, 15, 4), slot(3, 16, 9)];
    expect(buildWeekProfile(slots, 3, 5).days[3]?.cells.filter((c) => !c.muted)).toHaveLength(1);
    expect(buildWeekProfile(slots, 3, 2).days[3]?.cells.filter((c) => !c.muted)).toHaveLength(2);
  });

  it("is ready when any slot clears the minimum", () => {
    expect(buildWeekProfile([slot(3, 15, 9), slot(3, 16, 1)]).state).toBe("ready");
  });

  it("is sparse when reports exist but no slot clears the minimum", () => {
    const profile = buildWeekProfile([slot(3, 15, 2), slot(4, 8, 1)]);
    expect(profile.state).toBe("sparse");
    expect(profile.total).toBe(3);
    expect(profile.days).toHaveLength(7);
  });

  it("says how close a slot is in one phrase", () => {
    expect(notEnoughReportsPhrase(2)).toBe("Not enough reports (2 of 3)");
    expect(notEnoughReportsPhrase(0, 5)).toBe("Not enough reports (0 of 5)");
  });
});
