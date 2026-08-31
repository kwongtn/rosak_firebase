import { computed, Injectable } from "@angular/core";
import { graphqlResource } from "../../../core/graphql/graphql-client";
import {
  INSIDEN_INCIDENTS_QUERY,
  type CalendarIncident,
  type InsidenIncidentsQueryData,
} from "./insiden.queries";
import { incidentCoversDate } from "./calendar-date.util";

/**
 * Root-provided incidents feed for the /insiden page. The page previously held its own
 * `graphqlResource` plus the `_sorted`/`dayIncidents`/`pinned` computeds; this store hoists the
 * fetch and the shared derived views so the incidents query is fetched once and the grouping
 * logic lives in a single, testable place. `dayIncidents`/`pinned` take the selected day as an
 * argument because the date is page-local (a route param), not store state.
 */
@Injectable({ providedIn: "root" })
export class InsidenStore {
  private readonly incidentsResource = graphqlResource<InsidenIncidentsQueryData>(() => ({
    query: INSIDEN_INCIDENTS_QUERY,
  }));

  /** Underlying resource — exposes `hasError`/`isLoading` for the retry banner. */
  readonly resource = this.incidentsResource;
  readonly isLoading = this.incidentsResource.isLoading;
  readonly hasError = this.incidentsResource.hasError;

  readonly allIncidents = computed(() => this.incidentsResource.data()?.calendarIncidents ?? []);

  private readonly _sorted = computed(() =>
    [...this.allIncidents()].sort((a, b) => b.startDatetime.localeCompare(a.startDatetime)),
  );

  /** Every incident covering the given day (multi-day incidents appear on each spanned day). */
  dayIncidents(dateKey: string): CalendarIncident[] {
    return this._sorted().filter((incident) => incidentCoversDate(incident, dateKey));
  }

  /** Still-unresolved incidents NOT already covering the selected day (so nothing shows twice). */
  pinned(dateKey: string): CalendarIncident[] {
    return this._sorted().filter(
      (incident) => incident.endDatetime === null && !incidentCoversDate(incident, dateKey),
    );
  }
}
