import { CalendarIncident } from "./insiden.queries";

/** How many days either side of the shown month the page reads, so the calendar's leading and
 * trailing days of the neighbouring months carry their dots. The page's own copy about the loaded
 * window interpolates this, so the words cannot drift from the read. */
export const CALENDAR_WINDOW_PAD_DAYS = 14;

export function calendarMonthRange(monthKey: string): { start: string; end: string } {
  const month = new Date(`${monthKey}-01T00:00:00Z`);
  const year = month.getUTCFullYear();
  const index = month.getUTCMonth();
  return {
    start: dateKeyOf(new Date(Date.UTC(year, index, 1 - CALENDAR_WINDOW_PAD_DAYS))),
    end: dateKeyOf(new Date(Date.UTC(year, index + 1, CALENDAR_WINDOW_PAD_DAYS))),
  };
}

/** UTC `YYYY-MM-DD` of a `Date` used purely as a calendar-math tool (grid cursors, month padding).
 * Never feed it `new Date()` for "today": that is the UTC day, which is yesterday for the first
 * eight hours of every Kuala Lumpur day. Use `klDateKey()` for the current day. */
export function dateKeyOf(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whether `dateKey` falls within an incident's [start, end] span (inclusive), treating a null
 * `endDatetime` as still-ongoing — mirrors the real backend's own `CalendarIncidentFilter.date`
 * semantics (rosak_backend/incident/schema/filters.py) exactly, so a multi-day incident shows on
 * every day it covers rather than just the day it started. ISO date-key strings compare
 * lexicographically the same as their dates, so plain string comparison is enough here. */
export function incidentCoversDate(incident: CalendarIncident, dateKey: string): boolean {
  const startKey = incident.startDatetime.slice(0, 10);
  if (startKey > dateKey) {
    return false;
  }
  if (incident.endDatetime === null) {
    return true;
  }
  return incident.endDatetime.slice(0, 10) >= dateKey;
}
