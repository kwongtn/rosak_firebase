import type { AssetMultiSelectOption } from "../../../insiden/asset-multi-select/asset-multi-select.component";
import type { InsidenReferenceQueryData } from "../../../insiden/data/insiden.queries";

/** The three reference shapes, indexed off the query data so this module has no
 *  dependency on the (unexported) element interfaces. */
type ReferenceLine = InsidenReferenceQueryData["lines"][number];
type ReferenceStation = InsidenReferenceQueryData["stations"][number];
type ReferenceCategory = InsidenReferenceQueryData["calendarIncidentCategories"][number];

export type ReferenceData = InsidenReferenceQueryData | undefined;

/** Index a reference list by id, tolerating the pre-load `undefined`. */
export function indexLinesById(data: ReferenceData): Map<string, ReferenceLine> {
  const lines = data?.lines ?? [];
  return new Map(lines.map((line) => [line.id, line]));
}

export function indexStationsById(data: ReferenceData): Map<string, ReferenceStation> {
  return new Map((data?.stations ?? []).map((station) => [station.id, station]));
}

export function indexCategoriesById(data: ReferenceData): Map<string, ReferenceCategory> {
  return new Map(
    (data?.calendarIncidentCategories ?? []).map((category) => [category.id, category]),
  );
}

/** Options for the line multi-select: `code — displayName`. */
export function lineOptionsOf(data: ReferenceData): AssetMultiSelectOption[] {
  return (data?.lines ?? []).map((line) => ({
    id: line.id,
    label: `${line.code} — ${line.displayName}`,
  }));
}

/** Station options, carrying each station's parent line codes. */
export function stationOptionsOf(data: ReferenceData): AssetMultiSelectOption[] {
  return (data?.stations ?? []).map((station) => ({
    id: station.id,
    label: station.displayName,
    parentCodes: (station.lines ?? []).map((line) => line.code),
  }));
}

/** Category options (the calendar-incident categories). */
export function categoryOptionsOf(data: ReferenceData): AssetMultiSelectOption[] {
  return (data?.calendarIncidentCategories ?? []).map((category) => ({
    id: category.id,
    label: category.name,
  }));
}

/** A vehicle's true line memberships, computed over ALL lines (not just a
 *  selected-filtered view) — a vehicle's parent codes shouldn't disappear just
 *  because its line got unchecked. */
export function vehicleParentCodesOf(data: ReferenceData): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const line of data?.lines ?? []) {
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
}

export function indexVehiclesById(
  data: ReferenceData,
): Map<string, { id: string; identificationNo: string }> {
  const map = new Map<string, { id: string; identificationNo: string }>();
  for (const line of data?.lines ?? []) {
    for (const vehicleType of line.vehicleTypes) {
      for (const vehicle of vehicleType.vehicles) {
        map.set(vehicle.id, { id: vehicle.id, identificationNo: vehicle.identificationNo });
      }
    }
  }
  return map;
}

function vehicleOptionsFromLines(
  lines: readonly (ReferenceLine | undefined)[],
  parentCodes: Map<string, string[]>,
): AssetMultiSelectOption[] {
  const seen = new Set<string>();
  const options: AssetMultiSelectOption[] = [];
  for (const line of lines) {
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

/** Vehicle options for the edit form, narrowed to the selected lines (no selection
 *  = every line). */
export function vehicleOptionsOf(
  data: ReferenceData,
  selectedLineIds: readonly string[],
  linesById: Map<string, ReferenceLine>,
  parentCodes: Map<string, string[]>,
): AssetMultiSelectOption[] {
  const selected =
    selectedLineIds.length > 0
      ? selectedLineIds.map((id) => linesById.get(id))
      : [...linesById.values()];
  return vehicleOptionsFromLines(selected, parentCodes);
}

/** Filter controls reuse the same parent-filtering pattern, keyed on the FILTER
 *  line instead of the edit form's selection. */
export function filterVehicleOptionsOf(
  data: ReferenceData,
  filterLineId: string,
  linesById: Map<string, ReferenceLine>,
  parentCodes: Map<string, string[]>,
): AssetMultiSelectOption[] {
  const line = filterLineId ? linesById.get(filterLineId) : undefined;
  const lines = line ? [line] : [...linesById.values()];
  return vehicleOptionsFromLines(lines, parentCodes);
}

export function filterStationOptionsOf(
  data: ReferenceData,
  filterLineId: string,
): AssetMultiSelectOption[] {
  const stations = filterLineId
    ? (data?.stations ?? []).filter((station) =>
        (station.lines ?? []).some((line) => line.id === filterLineId),
      )
    : (data?.stations ?? []);
  return stations.map((station) => ({
    id: station.id,
    label: station.displayName,
    parentCodes: (station.lines ?? []).map((line) => line.code),
  }));
}
