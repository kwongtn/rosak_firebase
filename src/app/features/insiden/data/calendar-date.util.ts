import { CalendarIncident } from "./insiden.queries";

/** Pure Y-M-D calendar key, built off UTC getters so day-boundary arithmetic never drifts with
 * the viewer's local timezone. Matches the same pattern used by the spotting activity heatmap. */
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
