import { neutralizeSpreadsheetFormula, toCsv, type CsvRow } from "../../../core/export/csv.util";
import { buildIcs, type IcsEvent, type IcsEventStatus } from "../../../core/export/ics.util";
import type { IncidentFilterCriteria, IncidentLineOption } from "./incident-filter.util";
import { isLiveIncidentStatus } from "./incident-status.util";
import type { CalendarIncident } from "./insiden.queries";

/**
 * Turns the incidents on `/insiden` into the two things a reader can take away: a CSV for
 * researchers and journalists, and an iCalendar for "Add to calendar". Pure and Angular-free; the
 * serialisers (`toCsv`, `buildIcs`) and the browser download live in `core/export/`.
 */

/**
 * The public site, absolute because an exported row or calendar event lives OUTSIDE the site and a
 * relative path would point nowhere. Production on purpose, not the running environment's origin:
 * one staging export would otherwise bake a link into somebody's calendar that dies with the
 * staging deployment.
 */
export const INSIDEN_SITE_ORIGIN = "https://community.mlptf.org.my";

/** The domain half of every event UID (`incident-<id>@…`). */
const UID_DOMAIN = "community.mlptf.org.my";

/** The CSV header, in order. `date` is the START date (`YYYY-MM-DD`) and `status` is the approval
 * state the API reports (`LIVE`, `PENDING_APPROVAL`, `DRAFT`, `REJECTED`). The page's month export
 * only ever writes `LIVE` rows (see {@link incidentsForMonthExport}); the column stays so the schema
 * does not change the day an option to include unapproved reports is added. */
export const INCIDENT_CSV_COLUMNS = [
  "date",
  "title",
  "severity",
  "lines",
  "stations",
  "status",
  "url",
] as const;

/** `/insiden/<start date>` — the page that lists the incident. The route takes a day, not an id, so
 * this is the closest stable address the site has for one incident. */
export function incidentPageUrl(incident: Pick<CalendarIncident, "startDatetime">): string {
  return `${INSIDEN_SITE_ORIGIN}/insiden/${incident.startDatetime.slice(0, 10)}`;
}

/** The approval state in its GraphQL spelling (the API sends either casing); empty when unknown. */
function statusLabel(status: string | undefined): string {
  return status?.toUpperCase() ?? "";
}

/** One incident as a CSV row, keyed by {@link INCIDENT_CSV_COLUMNS}. */
export function incidentToCsvRow(incident: CalendarIncident): CsvRow {
  return {
    date: incident.startDatetime.slice(0, 10),
    title: neutralizeSpreadsheetFormula(incident.title),
    severity: incident.severity,
    lines: neutralizeSpreadsheetFormula(incident.lines.map((line) => line.code).join("; ")),
    stations: neutralizeSpreadsheetFormula(
      incident.stations.map((station) => station.displayName).join("; "),
    ),
    status: statusLabel(incident.status),
    url: incidentPageUrl(incident),
  };
}

/** `incidents` as one CSV document, in the order given (header only when there are none). */
export function incidentsToCsv(incidents: readonly CalendarIncident[]): string {
  return toCsv(INCIDENT_CSV_COLUMNS, incidents.map(incidentToCsvRow));
}

/**
 * The calendar `STATUS` for an approval state. Only an approved incident is `CONFIRMED`: a pending
 * or draft report is `TENTATIVE`, so a calendar app draws it as unconfirmed instead of presenting a
 * community report nobody has vetted as a fact. Unknown/missing writes no `STATUS` at all.
 */
function icsStatusOf(status: string | undefined): IcsEventStatus | undefined {
  switch (status?.toUpperCase()) {
    case "LIVE":
      return "CONFIRMED";
    case "DRAFT":
    case "PENDING_APPROVAL":
      return "TENTATIVE";
    case "REJECTED":
      return "CANCELLED";
    default:
      return undefined;
  }
}

/**
 * One incident as a calendar event: UID `incident-<id>@community.mlptf.org.my` (stable, so
 * re-importing updates the event instead of duplicating it), the offset-free start/end the API sends
 * (an ongoing incident has no end), the title, the brief and the page URL.
 */
export function incidentToIcsEvent(incident: CalendarIncident): IcsEvent {
  return {
    uid: `incident-${incident.id}@${UID_DOMAIN}`,
    start: incident.startDatetime,
    end: incident.endDatetime,
    summary: incident.title,
    description: incident.brief,
    url: incidentPageUrl(incident),
    status: icsStatusOf(incident.status),
  };
}

/** `incidents` as one iCalendar, in the order given. `now` pins `DTSTAMP` for a spec. */
export function incidentsToIcs(incidents: readonly CalendarIncident[], now?: Date): string {
  return buildIcs(incidents.map(incidentToIcsEvent), { now });
}

/**
 * The incidents that STARTED in `monthKey` (`YYYY-MM`), oldest first.
 *
 * Start-based on purpose, so every row of a month's export is dated inside that month and one
 * incident is exported once across consecutive months — it reconciles with the "Last 12 months"
 * chart, which counts by start month too. An incident that began last month and is still running is
 * in LAST month's file. Chronological rather than the page's newest-first: a spreadsheet or calendar
 * import reads forward in time. Any approval state: {@link incidentsForMonthExport} is the one that
 * decides what may leave the page.
 */
export function incidentsStartingInMonth(
  incidents: readonly CalendarIncident[],
  monthKey: string,
): CalendarIncident[] {
  return incidents
    .filter((incident) => incident.startDatetime.slice(0, 7) === monthKey)
    .sort(
      (a, b) =>
        a.startDatetime.localeCompare(b.startDatetime) ||
        a.id.localeCompare(b.id, "en", { numeric: true }),
    );
}

/**
 * What "Export month" writes: the APPROVED incidents that started in `monthKey`, oldest first.
 *
 * `LIVE` only. `calendarIncidents` has no status filter, so a draft, a pending report and a rejected
 * one all reach every reader, and the page tucks them behind its "Pending Approval" toggle as
 * unvetted. A file leaves that framing behind: a rider forwarding an `.ics`, or a journalist quoting a
 * CSV, would be passing on community text nobody approved as if it were the record. It is also the
 * rule of the "Last 12 months" chart, so the count on the button, the rows in the file and the bar
 * for the month are the same number.
 */
export function incidentsForMonthExport(
  incidents: readonly CalendarIncident[],
  monthKey: string,
): CalendarIncident[] {
  return incidentsStartingInMonth(
    incidents.filter((incident) => isLiveIncidentStatus(incident.status)),
    monthKey,
  );
}

/**
 * The words a filtered export adds to its filename: each selected line's code (`line<id>` for one no
 * chip names), then the severity, in that order.
 *
 * Without them a file of one line's Major incidents is named exactly like the whole month's and,
 * once it has left the page, reads as if it were. A CSV has nowhere to say which filter produced it,
 * so the filename does.
 */
export function exportFilterTokens(
  criteria: IncidentFilterCriteria,
  lineOptions: readonly IncidentLineOption[],
): string[] {
  const codeById = new Map(lineOptions.map((option) => [option.id, option.code]));
  return [
    ...criteria.lineIds.map((id) => codeById.get(id) ?? `line${id}`),
    ...(criteria.severity === null ? [] : [criteria.severity]),
  ];
}

/**
 * `insiden-2026-10.csv` / `insiden-2026-10.ics`, plus one `-<token>` per filter word for a filtered
 * export: `insiden-2026-10-kjl-major.csv`. A token is reduced to lower-case letters and digits, so no
 * line code or odd id can put a path separator or a space in a filename; one that reduces to nothing
 * is dropped.
 */
export function monthExportFilename(
  monthKey: string,
  extension: "csv" | "ics",
  filterTokens: readonly string[] = [],
): string {
  const suffix = filterTokens
    .map((token) => token.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter((token) => token !== "")
    .map((token) => `-${token}`)
    .join("");
  return `insiden-${monthKey}${suffix}.${extension}`;
}

/** `insiden-incident-42.ics`. The id is reduced to filename-safe characters. */
export function incidentCalendarFilename(incident: Pick<CalendarIncident, "id">): string {
  return `insiden-incident-${incident.id.replace(/[^A-Za-z0-9_-]/g, "")}.ics`;
}
