/**
 * GraphQL document + hand-written types for the Pro dashboard's "recent incidents" widget.
 * Field names are copied verbatim from the deployed Strawberry schema. Split out of the
 * former monolithic `home.queries.ts`.
 */

/* ---------------------------------------------------------------------- *
 * calendarIncidents — the Pro dashboard's "recent incidents" widget
 * ---------------------------------------------------------------------- */

/**
 * 🔴 **THE VARIABLES ARE COMPILE-TIME CONSTANTS, AND THAT IS THE WHOLE REASON THIS DOCUMENT EXISTS.**
 *
 * The obvious way to write a "recent incidents" widget is a `date: { range: … }` spanning the last
 * few days, and that is exactly the shape this project cannot ship: a client clock baked into query
 * variables makes the server render and the client hydration compute DIFFERENT variables, so the SSR
 * TransferState payload is not reused and every read fires twice (the same rule that makes the
 * feed's `lastWeekOnly` a backend-computed boolean).
 *
 * So the window is expressed in terms the backend can answer without being told what time it is:
 * `ongoing: true` (backend `end_datetime IS NULL` — "no end date yet") ordered by
 * `startDatetime DESC`. Every value is a literal in the source, so the variables object is
 * structurally identical in every process, which is the property the whole home contract rests on.
 *
 * `calendarIncidents` returns a LIST, not a connection, and takes no `first`/`after` — so "the
 * newest N" is expressed by ORDER plus a client-side slice, which is what the widget does. The
 * consequence, stated so nobody is surprised by it: this is one full payload of ongoing incidents
 * and the widget shows the first {@link PRO_INCIDENT_LIMIT} of it, which is honest ("the newest
 * ongoing ones") rather than a truncated "recent" window pretending to be complete.
 *
 * The selection is deliberately MINIMAL — six scalars plus the lines the incident touches. The
 * insiden page's own document selects `details`, `medias`, `chronologies` and a first page of
 * `links` per incident because its cards render them; this widget draws one row per incident, so
 * asking for them would multiply payload and resolver fan-out across the whole dataset for fields
 * nothing here reads.
 */
export const HOME_RECENT_INCIDENTS_QUERY = /* GraphQL */ `
  query HomeRecentIncidents($filters: CalendarIncidentFilter, $order: CalendarIncidentOrder) {
    calendarIncidents(filters: $filters, order: $order) {
      id
      startDatetime
      endDatetime
      severity
      title
      brief
      lines {
        id
        code
      }
    }
  }
`;

/** The one and only variables object this document is ever read with. Frozen so no caller can mutate
 * the shared constant into something the server render never sent. */
export const HOME_RECENT_INCIDENT_VARS = Object.freeze({
  filters: { OR: { ongoing: true } },
  order: { startDatetime: "DESC" },
});

export interface HomeRecentIncidentsQueryVars {
  filters: Record<string, unknown>;
  order: Record<string, unknown>;
}

/** The severity axis, mirroring the backend's `CalendarIncidentSeverity` enum. */
export type HomeIncidentSeverity = "MAJOR" | "MINOR" | "OTHERS";

/** One incident row in the Pro widget — the six scalars plus the lines it touches. */
export interface HomeIncidentItem {
  id: string;
  /** Naive local wall time, no offset (backend `USE_TZ = False`) — never re-formatted through UTC. */
  startDatetime: string;
  /** `null` while the incident is still open; a resolved one carries its end instant. */
  endDatetime: string | null;
  severity: HomeIncidentSeverity;
  title: string;
  brief: string;
  lines: Array<{ id: string; code: string }>;
}

export interface HomeRecentIncidentsQueryData {
  calendarIncidents: HomeIncidentItem[];
}

/** How many incident rows the Pro widget shows. The backend takes no limit, so this is a
 *  client-side slice of the newest-first list — see the document's own note on why. */
export const PRO_INCIDENT_LIMIT = 6;
