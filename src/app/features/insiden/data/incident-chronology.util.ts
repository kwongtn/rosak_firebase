import { CalendarIncident, CalendarIncidentChronology } from "./insiden.queries";

/** A chronology row for the card's timeline. Backend entries are used as-is; rows flagged
 * `synthetic` are invented by the frontend (the "Ongoing for X" tail entry) and must be rendered
 * without a datetime prefix or source link. */
export type ChronologyEntry = CalendarIncidentChronology & { synthetic?: boolean };

/** Synthesized when the backend has no chronology entries at all — matches the old app's
 * EventCardComponent fallback, so every incident shows at least a start (and end, if resolved). */
function defaultChronology(incident: CalendarIncident): CalendarIncidentChronology[] {
  const entries: CalendarIncidentChronology[] = [
    {
      order: 0,
      indicator: "BLUE",
      datetime: incident.startDatetime,
      content: "Start of incident",
      sourceUrl: null,
    },
  ];
  if (incident.endDatetime) {
    entries.push({
      order: 1,
      indicator: "GREEN",
      datetime: incident.endDatetime,
      content: "Issue resolved",
      sourceUrl: null,
    });
  }
  return entries;
}

/** The card chronology: the incident's own entries sorted by order (falling back to
 * `defaultChronology` when the backend has none), plus — for an unresolved incident (`endDatetime`
 * null) — a synthetic RED tail entry carrying the live elapsed time, given a unique order so it
 * always tracks as the final row. */
export function buildChronologyEntries(incident: CalendarIncident): ChronologyEntry[] {
  const entries: ChronologyEntry[] =
    incident.chronologies.length > 0 ? incident.chronologies : defaultChronology(incident);
  const sorted = [...entries].sort((a, b) => a.order - b.order);
  if (incident.endDatetime === null) {
    const lastOrder = sorted.length > 0 ? sorted[sorted.length - 1].order : -1;
    sorted.push({
      order: lastOrder + 1,
      indicator: "RED",
      datetime: "",
      content: "Ongoing",
      sourceUrl: null,
      synthetic: true,
    });
  }
  return sorted;
}
