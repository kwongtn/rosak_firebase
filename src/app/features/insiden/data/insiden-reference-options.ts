import { computed, linkedSignal, type Signal, type WritableSignal } from "@angular/core";
import { graphqlResource } from "../../../core/graphql/graphql-client";
import type { AssetMultiSelectOption } from "../asset-multi-select/asset-multi-select.component";
import { INSIDEN_REFERENCE_QUERY, type InsidenReferenceQueryData } from "./insiden.queries";

type ReferenceLine = InsidenReferenceQueryData["lines"][number];

/** The category a new report or link starts on. */
const DEFAULT_CATEGORY_NAME = "Just Reporting";

/**
 * The vehicle checkboxes for a selection of lines. No line selected lists every vehicle. Otherwise
 * the selected lines' vehicles are listed, plus every line a selected vehicle belongs to: a vehicle
 * tagged without its line (an edit of an older row, or a line unticked afterwards) would otherwise
 * be hidden while it is still selected and still sent, and the rider could neither see nor remove it.
 * Each option carries all its parent line codes, so a vehicle on two lines can be found by either.
 */
export function vehicleOptionsFor(
  lines: readonly ReferenceLine[],
  selectedLineIds: readonly string[],
  selectedVehicleIds: readonly string[],
): AssetMultiSelectOption[] {
  const parentCodes = new Map<string, string[]>();
  const parentLineIds = new Map<string, string[]>();
  for (const line of lines) {
    for (const vehicleType of line.vehicleTypes) {
      for (const vehicle of vehicleType.vehicles) {
        const codes = parentCodes.get(vehicle.id) ?? [];
        const ids = parentLineIds.get(vehicle.id) ?? [];
        if (!codes.includes(line.code)) codes.push(line.code);
        if (!ids.includes(line.id)) ids.push(line.id);
        parentCodes.set(vehicle.id, codes);
        parentLineIds.set(vehicle.id, ids);
      }
    }
  }

  const linesById = new Map(lines.map((line) => [line.id, line]));
  const shown =
    selectedLineIds.length === 0
      ? lines
      : [
          ...new Set([
            ...selectedLineIds,
            ...selectedVehicleIds.flatMap((id) => parentLineIds.get(id) ?? []),
          ]),
        ].map((id) => linesById.get(id));

  const seen = new Set<string>();
  const options: AssetMultiSelectOption[] = [];
  for (const line of shown) {
    if (!line) continue;
    for (const vehicleType of line.vehicleTypes) {
      for (const vehicle of vehicleType.vehicles) {
        if (seen.has(vehicle.id)) continue;
        seen.add(vehicle.id);
        options.push({
          id: vehicle.id,
          label: vehicle.identificationNo,
          parentCodes: parentCodes.get(vehicle.id),
        });
      }
    }
  }
  return options;
}

/**
 * The reference read the incident and link forms tag with (every line with its vehicles, every
 * station, every category) and the four option lists built from it. `resource` is the read itself,
 * for its loading, error and retry state. Call in an injection context: it starts the read.
 */
export function injectInsidenReferenceOptions(
  selectedLineIds: Signal<readonly string[]>,
  selectedVehicleIds: Signal<readonly string[]>,
) {
  const resource = graphqlResource<InsidenReferenceQueryData>(() => ({
    query: INSIDEN_REFERENCE_QUERY,
  }));
  return {
    resource,
    lineOptions: computed<AssetMultiSelectOption[]>(() =>
      (resource.data()?.lines ?? []).map((line) => ({
        id: line.id,
        label: `${line.code} — ${line.displayName}`,
      })),
    ),
    vehicleOptions: computed(() =>
      vehicleOptionsFor(resource.data()?.lines ?? [], selectedLineIds(), selectedVehicleIds()),
    ),
    stationOptions: computed<AssetMultiSelectOption[]>(() =>
      (resource.data()?.stations ?? []).map((station) => ({
        id: station.id,
        label: station.displayName,
        parentCodes: (station.lines ?? []).map((line) => line.code),
      })),
    ),
    categoryOptions: computed<AssetMultiSelectOption[]>(() =>
      (resource.data()?.calendarIncidentCategories ?? []).map((category) => ({
        id: category.id,
        label: category.name,
      })),
    ),
  };
}

/** Id of "Just Reporting" among the category options; null until they load. */
export function defaultCategoryId(options: readonly AssetMultiSelectOption[]): string | null {
  return options.find((option) => option.label === DEFAULT_CATEGORY_NAME)?.id ?? null;
}

/**
 * The form's single, mandatory category: "Just Reporting" on a new submission once the categories
 * load, and nothing while editing (the edit hydration sets the row's own). It is writable, so the
 * rider's pick and the hydration hold until that default itself changes. The form's clear sets it
 * back with `defaultCategoryId`, since a clear in create mode leaves the default unchanged.
 */
export function injectDefaultCategory(
  categoryOptions: Signal<readonly AssetMultiSelectOption[]>,
  isEditing: Signal<boolean>,
): WritableSignal<string | null> {
  // Through a computed, so the linked value resets only when the default id changes, not whenever
  // the option list is rebuilt with the same id.
  const defaultId = computed(() => (isEditing() ? null : defaultCategoryId(categoryOptions())));
  return linkedSignal(() => defaultId());
}
