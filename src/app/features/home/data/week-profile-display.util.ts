import type { LineStatusWeekBucket } from "./home-history.queries";
import type { PassengerStatus } from "./home.queries";
import { PASSENGER_LABEL, passengerBarClass } from "./passenger-status.util";
import {
  HISTORY_BUCKETS_PER_DAY,
  SERVICE_DAY_START_HOUR,
  historyBreakdownPhrase,
  reportsPhrase,
} from "./status-history-display.util";

/**
 * Pure display helpers for the "Typical week" strip in a line's expanded panel: the backend's
 * `lineStatusWeekProfile` slots turned into a 7-row (Monday to Sunday) by 24-column grid.
 *
 * The colours are the history widgets' own (`passengerBarClass`) and the phrases are theirs too
 * (`reportsPhrase`, `historyBreakdownPhrase`), so a Crowded hour reads the same in today's chart,
 * the Pro heat grid and here. Every function is total and Angular-free.
 */

/** How many weeks the typical week reads. Sent as the `weeks` literal, and published in the
 * methodology registry (`WEEK_PROFILE_WEEKS`; the spec pins the two together). */
export const WEEK_PROFILE_WEEKS = 6;

/** Fewer reports than this in a slot and it reads as "not enough reports" (`MIN_REPORTS_PER_WEEK_SLOT`
 * in the methodology registry; the spec pins the two together). */
export const MIN_REPORTS_PER_WEEK_SLOT = 3;

/** Index = the backend's `weekday`: 0 is Monday, 6 is Sunday. */
const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/**
 * - `empty`: no report in the window at all (the backend sends `[]`). Nothing to draw.
 * - `sparse`: reports exist, but no slot reaches the minimum, so every cell would be "not enough
 *   reports". The strip says so in words instead of drawing 168 grey boxes.
 * - `ready`: at least one slot has enough reports. Draw the grid.
 */
export type WeekProfileState = "empty" | "sparse" | "ready";

/** One column of the grid: an hour of the service day, in the order the day runs. */
export interface WeekProfileColumn {
  /** Local clock hour, 0 to 23. */
  hour: number;
  /** "03" */
  label: string;
  /** "03:00–04:00" */
  range: string;
  /** What the visible axis prints: the label on every other column and "" between, because 24
   * labels do not fit side by side at this cell width. */
  tick: string;
}

export interface WeekProfileCell {
  weekday: number;
  hour: number;
  /** Reports behind this slot over the whole window (a total, not an average). */
  count: number;
  /** The status the cell is painted with; `null` when it is muted. */
  status: PassengerStatus | null;
  /** Fewer than the minimum reports: painted as the muted track, never as a status. */
  muted: boolean;
  colorClass: string;
  /** One sentence that stands alone: "Thursday 15:00–16:00 · 9 reports · Crowded 6, Delayed 3". */
  title: string;
  /** The same cell without its weekday and hour, for a table whose headers carry those. */
  text: string;
}

export interface WeekProfileDay {
  /** 0 (Monday) to 6 (Sunday), the SERVICE day's weekday. */
  weekday: number;
  /** "Mon" */
  short: string;
  /** "Monday" */
  name: string;
  cells: WeekProfileCell[];
}

export interface WeekProfile {
  state: WeekProfileState;
  /** Reports across the grid. */
  total: number;
  /** 24 columns in service-day order; `[]` when `state` is `empty`. */
  columns: WeekProfileColumn[];
  /** 7 rows, Monday first; `[]` when `state` is `empty`. */
  days: WeekProfileDay[];
}

function hourLabel(hour: number): string {
  return String(hour).padStart(2, "0");
}

/** "23:00–00:00" — the hour after 23 is 00. */
function hourRange(hour: number): string {
  return `${hourLabel(hour)}:00–${hourLabel((hour + 1) % HISTORY_BUCKETS_PER_DAY)}:00`;
}

/** "Not enough reports (2 of 3)": says how close the slot is, and that the strip is not hiding a status. */
export function notEnoughReportsPhrase(
  count: number,
  minReports: number = MIN_REPORTS_PER_WEEK_SLOT,
): string {
  return `Not enough reports (${count} of ${minReports})`;
}

function slotKey(weekday: number, hour: number): string {
  return `${weekday}:${hour}`;
}

function isInGrid(slot: LineStatusWeekBucket): boolean {
  return (
    Number.isInteger(slot.weekday) &&
    slot.weekday >= 0 &&
    slot.weekday < WEEKDAY_NAMES.length &&
    Number.isInteger(slot.hour) &&
    slot.hour >= 0 &&
    slot.hour < HISTORY_BUCKETS_PER_DAY
  );
}

/**
 * Lays the backend's slots out as the strip draws them.
 *
 * Columns start at `dayStartHour` (0 to 23, the value sent to the backend) and run through the
 * 24 hours, so they line up with today's hourly chart, which starts at the same hour. Rows are the
 * service day's weekdays, Monday first. Both orders come from this function and never from the order
 * of `buckets`: each cell is looked up by (weekday, hour), a slot the backend left out is an empty
 * cell, and a slot outside 0-6 / 0-23 is not drawn.
 *
 * A cell is muted (the "no data" track, no status colour) when fewer than `minReports` reports sit
 * behind it, or when it has no dominant status to paint. That includes a slot with no report at all.
 */
export function buildWeekProfile(
  buckets: readonly LineStatusWeekBucket[],
  dayStartHour: number = SERVICE_DAY_START_HOUR,
  minReports: number = MIN_REPORTS_PER_WEEK_SLOT,
): WeekProfile {
  const slots = new Map<string, LineStatusWeekBucket>();
  for (const slot of buckets) {
    if (isInGrid(slot)) {
      slots.set(slotKey(slot.weekday, slot.hour), slot);
    }
  }
  let total = 0;
  for (const slot of slots.values()) {
    total += slot.count;
  }
  if (total <= 0) {
    return { state: "empty", total: 0, columns: [], days: [] };
  }

  const hours = Array.from(
    { length: HISTORY_BUCKETS_PER_DAY },
    (_, index) => (dayStartHour + index) % HISTORY_BUCKETS_PER_DAY,
  );
  let readyCells = 0;

  const toCell = (weekday: number, hour: number): WeekProfileCell => {
    const head = `${WEEKDAY_NAMES[weekday]} ${hourRange(hour)}`;
    const slot = slots.get(slotKey(weekday, hour));
    if (slot === undefined || !slot.dominantStatus || slot.count < minReports) {
      const phrase = notEnoughReportsPhrase(slot?.count ?? 0, minReports);
      return {
        weekday,
        hour,
        count: slot?.count ?? 0,
        status: null,
        muted: true,
        colorClass: passengerBarClass(null),
        title: `${head} · ${phrase}`,
        text: phrase,
      };
    }
    readyCells++;
    const reports = reportsPhrase(slot.count);
    return {
      weekday,
      hour,
      count: slot.count,
      status: slot.dominantStatus,
      muted: false,
      colorClass: passengerBarClass(slot.dominantStatus),
      title: `${head} · ${reports} · ${historyBreakdownPhrase(slot)}`,
      text: `${PASSENGER_LABEL[slot.dominantStatus]}, ${reports}`,
    };
  };

  const days = WEEKDAY_NAMES.map((name, weekday): WeekProfileDay => ({
    weekday,
    short: name.slice(0, 3),
    name,
    cells: hours.map((hour) => toCell(weekday, hour)),
  }));
  const columns = hours.map((hour, index): WeekProfileColumn => ({
    hour,
    label: hourLabel(hour),
    range: hourRange(hour),
    tick: index % 2 === 0 ? hourLabel(hour) : "",
  }));
  return { state: readyCells > 0 ? "ready" : "sparse", total, columns, days };
}
