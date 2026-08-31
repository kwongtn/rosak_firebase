import { computed, Injectable } from "@angular/core";
import { graphqlResource } from "../../../core/graphql/graphql-client";
import { INSIDEN_REFERENCE_QUERY, type InsidenReferenceQueryData } from "./insiden.queries";
import type { AssetMultiSelectOption } from "../asset-multi-select/asset-multi-select.component";

/**
 * Root-provided reference data for the incident/link report forms: lines (with their vehicle
 * rosters), stations and incident categories. Both forms previously each held their own
 * `graphqlResource` + derived dropdown computeds; this store hoists that into one shared,
 * singleton resource so the reference query is fetched exactly once per app session regardless
 * of how many forms mount. The `graphqlResource` is created in a field initializer, which runs in
 * the root injection context — no `runInInjectionContext` needed.
 */
@Injectable({ providedIn: "root" })
export class InsidenReferenceStore {
  private readonly referenceResource = graphqlResource<InsidenReferenceQueryData>(() => ({
    query: INSIDEN_REFERENCE_QUERY,
  }));

  /** Underlying resource — exposes `hasError`/`isLoading`/`reload` for retry banners. */
  readonly resource = this.referenceResource;
  readonly isLoading = this.referenceResource.isLoading;
  readonly hasError = this.referenceResource.hasError;
  readonly reload = (): void => {
    this.referenceResource.reload();
  };

  readonly lineOptions = computed<AssetMultiSelectOption[]>(() =>
    (this.referenceResource.data()?.lines ?? []).map((line) => ({
      id: line.id,
      label: `${line.code} — ${line.displayName}`,
    })),
  );

  readonly linesById = computed(
    () =>
      new Map((this.referenceResource.data()?.lines ?? []).map((line) => [line.id, line] as const)),
  );

  /** vehicle id → deduped parent line codes, computed over ALL lines (not a selected-filtered view). */
  readonly vehicleParentCodes = computed(() => {
    const lines = this.referenceResource.data()?.lines ?? [];
    const map = new Map<string, string[]>();
    for (const line of lines) {
      for (const vehicleType of line.vehicleTypes) {
        for (const vehicle of vehicleType.vehicles) {
          const codes = map.get(vehicle.id);
          if (codes) {
            if (!codes.includes(line.code)) {
              codes.push(line.code);
            }
          } else {
            map.set(vehicle.id, [line.code]);
          }
        }
      }
    }
    return map;
  });

  /** Flattened vehicle list for dropdowns (deduped by id, with parent line codes attached). */
  readonly vehicleOptions = computed<AssetMultiSelectOption[]>(() => {
    const lines = this.referenceResource.data()?.lines ?? [];
    const seen = new Set<string>();
    const options: AssetMultiSelectOption[] = [];
    for (const line of lines) {
      for (const vehicleType of line.vehicleTypes) {
        for (const vehicle of vehicleType.vehicles) {
          if (seen.has(vehicle.id)) {
            continue;
          }
          seen.add(vehicle.id);
          options.push({
            id: vehicle.id,
            label: vehicle.identificationNo,
            parentCodes: this.vehicleParentCodes().get(vehicle.id),
          });
        }
      }
    }
    return options;
  });

  readonly stationOptions = computed<AssetMultiSelectOption[]>(() =>
    (this.referenceResource.data()?.stations ?? []).map((station) => ({
      id: station.id,
      label: station.displayName,
      parentCodes: (station.lines ?? []).map((l) => l.code),
    })),
  );

  readonly categoryOptions = computed<AssetMultiSelectOption[]>(() =>
    (this.referenceResource.data()?.calendarIncidentCategories ?? []).map((category) => ({
      id: category.id,
      label: category.name,
    })),
  );
}
