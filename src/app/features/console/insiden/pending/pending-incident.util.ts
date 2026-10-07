import type { BadgeVariants } from "../../../../ui/badge/badge";
import type {
  CalendarIncident,
  CalendarIncidentSeverity,
} from "../../../insiden/data/insiden.queries";
import type { ChronologyDraft } from "../../../insiden/incident-form/chronology-list.util";
import type { IncidentFormModel } from "../../../insiden/incident-form/incident-form.schema";
import type { ExtractedIncidentData } from "../../../insiden/data/incident-ai.service";
import type { PendingIncident } from "../data/insiden-console.queries";

/** Severity → badge variant, for the queue row's severity tag. */
const SEVERITY_VARIANT: Record<PendingIncident["severity"], BadgeVariants["variant"]> = {
  MAJOR: "destructive",
  MINOR: "warning",
  OTHERS: "neutral",
};

/** Severity → display label, shared by the queue row and the edit form's severity select. */
const SEVERITY_LABEL: Record<PendingIncident["severity"], string> = {
  MAJOR: "Major",
  MINOR: "Minor",
  OTHERS: "Other",
};

export function severityBadgeVariant(
  severity: PendingIncident["severity"],
): BadgeVariants["variant"] {
  return SEVERITY_VARIANT[severity];
}

export function severityLabelText(severity: PendingIncident["severity"]): string {
  return SEVERITY_LABEL[severity];
}

/** Map a pending row onto the public `CalendarIncident` shape so the /insiden source-page
 *  element — `IncidentCardComponent` — can be embedded as-is in the detail panel. */
export function asCalendarIncident(row: PendingIncident): CalendarIncident {
  return {
    id: row.id,
    startDatetime: row.startDatetime,
    endDatetime: row.endDatetime,
    severity: row.severity,
    title: row.title,
    brief: row.brief,
    details: row.details,
    hasDetails: row.hasDetails,
    impactFactor: row.impactFactor,
    longTerm: row.longTerm,
    inaccurate: row.inaccurate,
    status: row.status,
    lastUpdated: row.lastUpdated,
    lines: row.lines,
    vehicles: row.vehicles,
    stations: row.stations,
    chronologies: row.chronologies,
    voteScore: row.voteScore,
    voteBreakdown: row.voteBreakdown,
    userVote: row.userVote,
    medias: row.medias,
  };
}

/** Mirrors incident-form.schema's required(title/brief/startDatetime/severity) plus the
 *  end>=start check — Save is disabled while the form is invalid. */
export function isIncidentFormSaveable(m: IncidentFormModel): boolean {
  if (!m.title.trim() || !m.brief.trim() || !m.startDatetime.trim() || !m.severity) {
    return false;
  }
  if (m.endDatetime && m.endDatetime < m.startDatetime) {
    return false;
  }
  return true;
}

/** Per-chronology state for the Extract Data flow. Late results (responses that
 * arrive after the 15s cap) are held here until the user opts to apply them. */
export interface ChronologyExtractState {
  extracting: boolean;
  lateResult: ExtractedIncidentData | null;
  preReplaceSnapshot: { datetime: string; content: string } | null;
  replaced: boolean;
}

/** Rebuilds the local row from the saved form state so the table row and the detail card
 *  show exactly what the backend now holds. Preference goes to reference data (it carries the
 *  display labels); anything the reference set doesn't know yet falls back to the row's own
 *  objects. Pure: every input is passed in by the calling component. */
export function buildUpdatedIncidentRow(args: {
  row: PendingIncident;
  model: IncidentFormModel;
  impactFactor: number;
  chronologies: ChronologyDraft[];
  selectedLineIds: string[];
  selectedVehicleIds: string[];
  selectedStationIds: string[];
  selectedCategoryIds: string[];
  linesById: ReadonlyMap<string, PendingIncident["lines"][number]>;
  vehiclesById: ReadonlyMap<string, PendingIncident["vehicles"][number]>;
  stationsById: ReadonlyMap<string, PendingIncident["stations"][number]>;
  categoriesById: ReadonlyMap<string, PendingIncident["categories"][number]>;
}): PendingIncident {
  const resolve = <T extends { id: string }>(
    ids: string[],
    current: T[],
    lookup: (id: string) => T | undefined,
  ): T[] =>
    ids
      .map((id) => lookup(id) ?? current.find((item) => item.id === id))
      .filter((x): x is T => x !== undefined);
  const m = args.model;
  return {
    ...args.row,
    title: m.title,
    brief: m.brief,
    details: m.details,
    hasDetails: m.details.trim().length > 0,
    startDatetime: new Date(m.startDatetime).toISOString(),
    endDatetime: m.endDatetime ? new Date(m.endDatetime).toISOString() : null,
    severity: m.severity as CalendarIncidentSeverity,
    longTerm: m.longTerm,
    inaccurate: m.inaccurate,
    impactFactor: args.impactFactor,
    lines: resolve(args.selectedLineIds, args.row.lines, (id) => args.linesById.get(id)),
    vehicles: resolve(args.selectedVehicleIds, args.row.vehicles, (id) =>
      args.vehiclesById.get(id),
    ),
    stations: resolve(args.selectedStationIds, args.row.stations, (id) =>
      args.stationsById.get(id),
    ),
    categories: resolve(args.selectedCategoryIds, args.row.categories, (id) =>
      args.categoriesById.get(id),
    ),
    chronologies: args.chronologies.map((chronology, index) => ({
      order: index,
      indicator: chronology.indicator,
      datetime: chronology.datetime ? new Date(chronology.datetime).toISOString() : "",
      content: chronology.content || "",
      sourceUrl: chronology.sourceUrl || null,
    })),
  };
}
