import { CalendarIncident } from "../../../insiden/data/insiden.queries";

/**
 * This line's calendar incidents: filters to incidents tagged to `lineId`, then sorts ongoing
 * (`endDatetime === null`) first, then resolved newest-first by `startDatetime`. One sort line,
 * trivially changeable if the requested order changes. Pure — the input array is never mutated
 * (filter returns a new array; the sort runs on that copy).
 */
export function incidentsForLine(
  incidents: CalendarIncident[],
  lineId: string,
): CalendarIncident[] {
  return incidents
    .filter((incident) => incident.lines.some((line) => line.id === lineId))
    .sort(
      (a, b) =>
        (a.endDatetime === null ? 0 : 1) - (b.endDatetime === null ? 0 : 1) ||
        b.startDatetime.localeCompare(a.startDatetime),
    );
}
