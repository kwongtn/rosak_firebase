/**
 * Pure adapter from a `CalendarIncident` row (as fetched by INSIDEN_INCIDENTS_QUERY) to the
 * full draft state of the report form: the flat Signal Forms model, the chronology drafts
 * (sorted by `order`, local-only keys, expanded), and the four affected-asset id arrays.
 *
 * Kept free of Angular (mirrors chronology-list.util.ts / extract-data.util.ts) so the mapping
 * is unit-testable in isolation — see incident-to-form.util.spec.ts. This is the single
 * conversion used by `IncidentFormComponent.hydrate()`; the console panel's own `openDetail`
 * prefill stays separate (Task 11 scope is the public form).
 */

import type { CalendarIncident } from "../data/insiden.queries";
import type { ChronologyDraft } from "./chronology-list.util";
import { isoToDateTimeLocal } from "./extract-data.util";
import type { IncidentFormModel } from "./incident-form.schema";

export interface IncidentToFormData {
  model: IncidentFormModel;
  /** Chronology drafts sorted by backend `order`, keyed `startKey..startKey+n-1`. */
  chronologies: ChronologyDraft[];
  selectedLineIds: string[];
  selectedVehicleIds: string[];
  selectedStationIds: string[];
  selectedCategoryIds: string[];
}

/**
 * Maps an incident row onto the form's draft state.
 *
 * @param startKey  First local chronology key — the caller owns key uniqueness across
 *                  hydrations (keys are local-only, never sent to the backend).
 */
export function incidentToForm(incident: CalendarIncident, startKey = 0): IncidentToFormData {
  const chronologies = (incident.chronologies ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((chronology, index) => ({
      key: startKey + index,
      indicator: chronology.indicator,
      datetime: isoToDateTimeLocal(chronology.datetime),
      sourceUrl: chronology.sourceUrl ?? "",
      content: chronology.content ?? "",
      collapsed: false,
    }));

  return {
    model: {
      title: incident.title ?? "",
      brief: incident.brief ?? "",
      details: incident.details ?? "",
      startDatetime: isoToDateTimeLocal(incident.startDatetime),
      endDatetime: isoToDateTimeLocal(incident.endDatetime),
      severity: incident.severity ?? "",
      longTerm: incident.longTerm ?? false,
      inaccurate: incident.inaccurate ?? false,
    },
    chronologies,
    selectedLineIds: (incident.lines ?? []).map((line) => line.id),
    selectedVehicleIds: (incident.vehicles ?? []).map((vehicle) => vehicle.id),
    selectedStationIds: (incident.stations ?? []).map((station) => station.id),
    selectedCategoryIds: (incident.categories ?? []).map((category) => category.id),
  };
}
