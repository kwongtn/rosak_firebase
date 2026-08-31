import { Injectable, inject, Injector, runInInjectionContext } from "@angular/core";
import { graphqlResource } from "../../../core/graphql/graphql-client";
import {
  VEHICLE_TYPES_QUERY,
  VehicleTypesQueryData,
  VehicleTypesQueryVars,
} from "./spotting.queries";

/** Builds one `graphqlResource` for a given lineId. Hoisted to module scope so the store can name
 * the exact return type via `ReturnType<typeof createVehicleTypesResource>` — the wrapper's
 * `data`/`isLoading`/`hasError` are typed against `VehicleTypesQueryData`, which matters because
 * the pages read `resource.data()?.vehicleTypes` straight off the cached wrapper. */
function createVehicleTypesResource(lineId: string) {
  return graphqlResource<VehicleTypesQueryData, VehicleTypesQueryVars>(() => ({
    query: VEHICLE_TYPES_QUERY,
    variables: { lineId },
  }));
}

export type VehicleTypesResource = ReturnType<typeof createVehicleTypesResource>;

/**
 * Route-scoped store (provided on the /spotting shell route alongside `SpottingLinesStore`) that
 * lazily creates and caches one `graphqlResource` per lineId for the per-line vehicle-types fleet
 * table. Pages call `vehicleTypesFor(lineId)` and get back the *same* cached wrapper on every later
 * call for that lineId — so moving between views of one line (overview → details → vehicle detail)
 * never re-requests the fleet.
 *
 * `graphqlResource` calls `inject()` internally, so the resource must be created inside an injection
 * context. Because `vehicleTypesFor` is invoked lazily (from a page, after construction), the store
 * captures its own `Injector` and runs the creation through `runInInjectionContext`.
 */
@Injectable()
export class SpottingLineDataStore {
  private readonly injector = inject(Injector);

  private readonly cache = new Map<string, VehicleTypesResource>();

  /** Returns the cached `graphqlResource` for `lineId`, creating (and caching) it on first use.
   * Subsequent calls for the same `lineId` return the identical wrapper — no second HTTP request. */
  vehicleTypesFor(lineId: string): VehicleTypesResource {
    const existing = this.cache.get(lineId);
    if (existing) {
      return existing;
    }
    const resource = runInInjectionContext(this.injector, () => createVehicleTypesResource(lineId));
    this.cache.set(lineId, resource);
    return resource;
  }
}
