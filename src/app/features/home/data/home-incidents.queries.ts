/**
 * GraphQL document + hand-written types for the front page's incident reads: the Pro dashboard's
 * "recent incidents" widget and the network board's Notice / Planned works chips (both read the SAME
 * ongoing list; the chips add the upcoming one). Field names are copied verbatim from the deployed
 * Strawberry schema. Split out of the former monolithic `home.queries.ts`.
 */

/* ---------------------------------------------------------------------- *
 * calendarIncidents — the Pro "recent incidents" widget and the board's notice chips
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
 * `activeNow: true` (backend: started, and not yet ended — an incident with no end time included)
 * ordered by `startDatetime DESC`. Every value is a literal in the source, so the variables object is
 * structurally identical in every process, which is the property the whole home contract rests on.
 *
 * 🔴 **`status: LIVE` IS MANDATORY ON EVERY RIDER-FACING READ.** The root `calendarIncidents` field
 * has no status gate of its own: without a `status` filter it answers anonymous callers with drafts,
 * reports pending approval and rejected ones. This read used to filter on `OR: { ongoing: true }`
 * (the END time only), so the Pro widget — a public surface — listed drafts. A new filter added to
 * these variables must keep `status: "LIVE"` beside it; the queries spec pins it.
 *
 * `calendarIncidents` returns a LIST, not a connection, and takes no `first`/`after` — so "the
 * newest N" is expressed by ORDER plus a client-side slice, which is what the widget does. The
 * consequence, stated so nobody is surprised by it: this is one full payload of ongoing incidents
 * and the widget shows the first {@link PRO_INCIDENT_LIMIT} of it, which is honest ("the newest
 * ongoing ones") rather than a truncated "recent" window pretending to be complete. The board's
 * notice chips group the WHOLE list (a line's incident can sit past the widget's slice).
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

/** The variables of the ongoing read (Pro widget + board Notice chips): LIVE incidents that have
 * started and not yet ended, newest first. Frozen all the way down so no caller can mutate the shared
 * constant into something the server render never sent — in particular, into a filter without
 * `status: "LIVE"`. */
export const HOME_RECENT_INCIDENT_VARS = Object.freeze({
  filters: Object.freeze({ status: "LIVE", activeNow: true }),
  order: Object.freeze({ startDatetime: "DESC" }),
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
