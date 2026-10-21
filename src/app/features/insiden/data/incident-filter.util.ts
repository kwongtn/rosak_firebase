import {
  readEnumQueryParam,
  readTextQueryParam,
  type QueryParamPatch,
} from "../../../core/url-state/query-param.util";
import type { CalendarIncident } from "./insiden.queries";

/**
 * Client-side filtering of the incidents `/insiden` has loaded, and the URL <-> state mapping for it.
 *
 * Everything here is pure and Angular-free: the page folds {@link filterIncidents} into
 * `allIncidents` (and so into the calendar dots, the day list and the pinned section) and owns the
 * Router/Preferences wiring, so the rules below are testable without either.
 *
 * 🔴 **The filter applies to the LOADED window only** — the selected month +/- 14 days plus every
 * unresolved incident (see `calendarMonthRange` and `INSIDEN_INCIDENTS_QUERY`) — never to all
 * history, and the page says so beside the controls. Narrowing a month to "my line" is the use case;
 * a cross-month search would need a wider fetch.
 */

/** The severities the filter offers. `OTHERS` is deliberately absent: it is a catch-all, not a
 * thing a rider asks for. */
export type IncidentFilterSeverity = "MAJOR" | "MINOR";

/** What the lists are narrowed by. An empty `lineIds` and a `null` severity mean "no filter". */
export interface IncidentFilterCriteria {
  /** An incident matches when ANY of its lines is listed. Empty = every line. */
  lineIds: string[];
  severity: IncidentFilterSeverity | null;
}

/** The URL parameter names, named once so the read and write halves cannot drift. */
export const FILTER_LINES_PARAM = "lines";
export const FILTER_SEVERITY_PARAM = "severity";
export const FILTER_MINE_PARAM = "mine";

/** `?severity=` as written in a URL (lower case, like `?view=` and `?sort=`), with the value that
 * means "unfiltered" so `readEnumQueryParam` has a fallback of the same type. */
const SEVERITY_PARAM_VALUES = ["all", "major", "minor"] as const;
const SEVERITY_FROM_PARAM: Record<string, IncidentFilterSeverity> = {
  major: "MAJOR",
  minor: "MINOR",
};

/** Line ids are the backend's numeric primary keys; the pattern only has to keep hand-edited junk
 * (`?lines=<script>`) out of state, not to model the id format. */
const LINE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * What the URL carries, BEFORE `mine` is resolved against the reader's pinned lines.
 *
 * Two fields describe the line axis because they mean different things: `lineIds` is an explicit
 * selection that travels with a shared link, while `mine` is "whatever MY pinned lines are", which
 * resolves differently for every reader and tracks their pins live. An explicit `lineIds` wins when
 * both are present (a URL that names lines names exactly those lines).
 */
export interface IncidentFilterUrlState {
  lineIds: string[];
  severity: IncidentFilterSeverity | null;
  mine: boolean;
}

export function emptyIncidentFilterUrlState(): IncidentFilterUrlState {
  return { lineIds: [], severity: null, mine: false };
}

/**
 * `?lines=` as a de-duplicated id list. Blank and malformed entries are dropped rather than
 * thrown on: a URL is user input and must degrade to a state the UI actually offers.
 */
export function parseLineIdsParam(raw: string | null | undefined): string[] {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text === "") {
    return [];
  }
  const ids: string[] = [];
  for (const part of text.split(",")) {
    const id = part.trim();
    if (LINE_ID_PATTERN.test(id) && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

/** The read half: the three params off a `ParamMap`-shaped object. */
export function readIncidentFilterUrlState(
  params: { get(name: string): string | null } | null | undefined,
): IncidentFilterUrlState {
  const severity = readEnumQueryParam(params, FILTER_SEVERITY_PARAM, SEVERITY_PARAM_VALUES, "all");
  return {
    lineIds: parseLineIdsParam(readTextQueryParam(params, FILTER_LINES_PARAM)),
    severity: SEVERITY_FROM_PARAM[severity] ?? null,
    mine: readEnumQueryParam(params, FILTER_MINE_PARAM, ["0", "1"] as const, "0") === "1",
  };
}

/**
 * The write half: the patch for `writeQueryParams`. A default (no lines, no severity, `mine` off)
 * is `null`, which REMOVES the key, so an unfiltered page carries no parameter it did not choose.
 */
export function incidentFilterQueryPatch(state: IncidentFilterUrlState): QueryParamPatch {
  return {
    [FILTER_LINES_PARAM]: state.lineIds.length === 0 ? null : state.lineIds.join(","),
    [FILTER_SEVERITY_PARAM]: state.severity === null ? null : state.severity.toLowerCase(),
    [FILTER_MINE_PARAM]: state.mine ? "1" : null,
  };
}

/**
 * The criteria in force: an explicit `lineIds` selection, else the reader's pinned lines when
 * `mine` is on, else no line filter.
 *
 * With `mine` on and nothing pinned the result is "no line filter", not "match nothing": an empty
 * pin list means the reader has not chosen lines yet, and an empty page would read as "no incidents
 * on your lines" — a claim about the network that no data supports.
 */
export function resolveIncidentFilter(
  state: IncidentFilterUrlState,
  pinnedLineIds: readonly string[],
): IncidentFilterCriteria {
  const lineIds = state.lineIds.length > 0 ? state.lineIds : state.mine ? [...pinnedLineIds] : [];
  return { lineIds, severity: state.severity };
}

/** True when "My lines" is what is driving the line axis (so its button reads as pressed). */
export function isMineActive(state: IncidentFilterUrlState): boolean {
  return state.mine && state.lineIds.length === 0;
}

export function isIncidentFilterActive(criteria: IncidentFilterCriteria): boolean {
  return criteria.lineIds.length > 0 || criteria.severity !== null;
}

/**
 * "My lines" pressed: off when it is already driving the filter, otherwise on — and turning it on
 * REPLACES any explicit selection, which is what "seeding the selection from my pins" means.
 */
export function withMineToggled(state: IncidentFilterUrlState): IncidentFilterUrlState {
  return isMineActive(state) ? { ...state, mine: false } : { ...state, mine: true, lineIds: [] };
}

/**
 * One line chip pressed. It toggles within the line selection IN FORCE (`effectiveLineIds`), so a
 * chip pressed while "My lines" is on edits a copy of the pins instead of discarding them — and the
 * result is an explicit selection, which turns `mine` off.
 */
export function withLineToggled(
  state: IncidentFilterUrlState,
  effectiveLineIds: readonly string[],
  lineId: string,
): IncidentFilterUrlState {
  const lineIds = effectiveLineIds.includes(lineId)
    ? effectiveLineIds.filter((id) => id !== lineId)
    : [...effectiveLineIds, lineId];
  return { ...state, mine: false, lineIds };
}

/** The severity `<select>`'s value as a filter value: anything but `major`/`minor` means "all". */
export function severityFromSelectValue(value: string): IncidentFilterSeverity | null {
  return SEVERITY_FROM_PARAM[value] ?? null;
}

/**
 * `incidents` narrowed by `criteria`. The very array that came in when no filter is active, so the
 * computed signals downstream keep their reference (and skip a pointless re-render).
 */
export function filterIncidents(
  incidents: CalendarIncident[],
  criteria: IncidentFilterCriteria,
): CalendarIncident[] {
  if (!isIncidentFilterActive(criteria)) {
    return incidents;
  }
  const lineIds = new Set(criteria.lineIds);
  return incidents.filter(
    (incident) =>
      (criteria.severity === null || incident.severity === criteria.severity) &&
      (lineIds.size === 0 || incident.lines.some((line) => lineIds.has(line.id))),
  );
}

/** One line chip. `pinned` lets the strip lead with the reader's own lines. */
export interface IncidentLineOption {
  id: string;
  code: string;
  displayName: string;
  pinned: boolean;
}

/**
 * The chips on offer: every line the loaded incidents reference, the reader's pinned ones first,
 * then by code (numeric-aware, so KTM2 sorts before KTM10).
 *
 * A pinned line that no loaded incident references has no chip: its label would have to come from a
 * lines lookup this page does not make, and a chip reading "Line 7" is worse than none. It is still
 * part of the "My lines" selection, and the caller counts it via {@link unlistedLineIds}.
 */
export function incidentLineOptions(
  incidents: readonly CalendarIncident[],
  pinnedLineIds: readonly string[],
): IncidentLineOption[] {
  const pinned = new Set(pinnedLineIds);
  const byId = new Map<string, IncidentLineOption>();
  for (const incident of incidents) {
    for (const line of incident.lines) {
      if (!byId.has(line.id)) {
        byId.set(line.id, {
          id: line.id,
          code: line.code,
          displayName: line.displayName,
          pinned: pinned.has(line.id),
        });
      }
    }
  }
  return [...byId.values()].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) || a.code.localeCompare(b.code, "en", { numeric: true }),
  );
}

/** Selected line ids that have no chip, so an active filter is never invisible. */
export function unlistedLineIds(
  selectedLineIds: readonly string[],
  options: readonly IncidentLineOption[],
): string[] {
  const listed = new Set(options.map((option) => option.id));
  return selectedLineIds.filter((id) => !listed.has(id));
}
