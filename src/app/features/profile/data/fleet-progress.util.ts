import type { FavouriteVehicle, FleetVehicle } from "./profile.queries";

/** One line's fleet progress: how much of its fleet the user has spotted. */
export interface LineProgress {
  lineId: string;
  code: string;
  /** Distinct vehicles on this line the user has logged at least once. */
  spotted: number;
  /** Every vehicle assigned to the line (`Line.totalVehicleCount`), never below `spotted`. */
  total: number;
  /** `spotted` as a share of `total`, 0 to 100 and not rounded, so one vehicle is still a sliver. */
  percent: number;
  /** The spotted vehicles' ids, so a line's roster can be reduced to the ones still missing. */
  spottedIds: ReadonlySet<string>;
}

/**
 * Groups the user's spotted vehicles by line into one progress row per line, ordered by line code.
 *
 * A vehicle assigned to several lines counts toward each of them, as it is part of each fleet. A
 * vehicle on no line counts toward none. Spotted vehicles are counted DISTINCT by id, so a repeated
 * entry cannot overstate progress. Only lines holding at least one spotted vehicle appear: the
 * input knows no others.
 *
 * `total` is the line's own fleet size from the API, raised to `spotted` if the two ever disagree
 * (the numbers come from different counts, and a spotted vehicle is by definition part of its
 * line's fleet), so a bar can never run past 100%. A line with no size at all reads as complete
 * rather than as a division by zero.
 */
export function buildFleetProgress(
  favourites: readonly FavouriteVehicle[] | null | undefined,
): LineProgress[] {
  const byLine = new Map<string, { code: string; total: number; ids: Set<string> }>();
  for (const { vehicle } of favourites ?? []) {
    for (const line of vehicle.lines) {
      let entry = byLine.get(line.id);
      if (!entry) {
        entry = { code: line.code, total: line.totalVehicleCount ?? 0, ids: new Set() };
        byLine.set(line.id, entry);
      }
      entry.ids.add(vehicle.id);
    }
  }
  return [...byLine]
    .map(([lineId, { code, total, ids }]): LineProgress => {
      const spotted = ids.size;
      const fleet = Math.max(total, spotted);
      return {
        lineId,
        code,
        spotted,
        total: fleet,
        percent: (spotted / fleet) * 100,
        spottedIds: ids,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}

/**
 * The roster's vehicles the user has not spotted, in natural order of their number ("EMU2" before
 * "EMU10"). The API returns a roster unordered, and this is what the reader scans for a number.
 */
export function unspottedVehicles(
  roster: readonly FleetVehicle[],
  spottedIds: ReadonlySet<string>,
): FleetVehicle[] {
  return roster
    .filter((vehicle) => !spottedIds.has(vehicle.id))
    .sort((a, b) =>
      a.identificationNo.localeCompare(b.identificationNo, undefined, { numeric: true }),
    );
}
