import { VehicleStatus } from "../../../../core/graphql/types";
import { dateKeyOf } from "../../../../domain-ui/spotting-activity-heatmap/spotting-activity-heatmap";
import { VehicleType } from "../../data/spotting.queries";

/** One vehicle's row in the grid — the subset of `VehicleRow` the grid actually renders. */
export interface GridRow {
  vehicleId: string;
  identificationNo: string;
  status: VehicleStatus;
}

/** One vehicle-type group of rows, sorted for display. */
export interface GridSection {
  typeId: string;
  typeName: string;
  rows: GridRow[];
}

/** One day in the visible window's column headers. */
export interface GridColumn {
  dateKey: string;
  dayOfMonth: number;
  isWeekend: boolean;
  /** True for the 1st of each visible month — draws the persistent divider (a plain `border-l`
   * baked into the cell itself, see `dayHeaderClass`/`dayCellClass`) that survives horizontal
   * scroll because it travels with the cell rather than needing to be redrawn as an overlay. */
  isMonthStart: boolean;
  isToday: boolean;
}

/** One visible month's worth of columns, under its own header label. */
export interface MonthGroup {
  key: string;
  label: string;
  /** This group's first column's position in the flattened `columns()` list — lets
   * `monthLabelShift` compute the group's pixel span without re-deriving it via a linear scan
   * of `columns()` on every call. */
  startIndex: number;
  columns: GridColumn[];
}

const MONTH_GROUP_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
export const TODAY_KEY = dateKeyOf(new Date());

/** Every row (header, section label, data) is this tall on *both* sides of the names/grid split
 * — see the class doc comment for why those are two independent `<table>`s that need to agree
 * pixel-for-pixel to still look like one grid. Header rows are two of these stacked (month label
 * + day number). Kept tall enough to comfortably fit a status badge without the row's real
 * content height ever exceeding this — see `ROW_H`'s own note on the vehicle-row cell padding. */
export const ROW_H = 32;

/** Every day column is this wide, on both the mirrored header and the scrolling body — enforced
 * via an explicit `<colgroup>` on each of those two (independent) tables rather than left to each
 * table's own auto-sizing, which is what keeps the two pixel-aligned as the body scrolls under
 * the header's mirrored transform (see the class doc comment). */
export const COL_W = 28;

/** Total header height on *both* sides — month-label row + day-number row, nothing more. This has
 * to be a fixed constant, not "however tall the day-grid header happens to be at the moment": the
 * two header tables are otherwise-independent elements, and if one grew/shrank purely from
 * scrolling while the other stayed fixed, everything below them — cell rows on one side, vehicle
 * names on the other — drifts out of alignment by exactly that difference the moment they
 * disagree. The currently-pinned section's mirrored aggregate row (see `_currentSection` and the
 * template's own `dayGridMirror` div) is *not* counted here even though it visually sits right
 * below this header — it's a zero-height sticky wrapper whose actual content overflows downward
 * only while a section is pinned, so it never adds to either side's reserved flow height the way
 * an earlier revision's literal third `<tr>` did. */
export const DAY_GRID_HEADER_H = ROW_H * 2;

/** The mobile pinned band's height — two `ROW_H` rows: the full-width vehicle-name/type-label
 * row stacked directly above its own date/totals row (see the template's `grid-mobile-pinned`).
 * Mirrors the exposed `ROW_H`/`COL_W`/`DAY_GRID_HEADER_H` constants for the same reason. */
export const MOBILE_PINNED_H = ROW_H * 2;

/** Fallback reserve for `monthLabelShift`, used only for the handful of frames before
 * `monthLabelWidths` has measured each label's *real* rendered width (see that signal) — a plain
 * guess turned out too small for the actual "Mon YYYY" text at this font size, letting the label
 * visibly slide into the next month's columns before it hit its own edge. */
export const MONTH_LABEL_FALLBACK_RESERVE_PX = COL_W * 3;

/** Groups the line's vehicle types into sorted, render-ready sections: types sorted by display
 * name, each type's vehicles filtered by the status filter then sorted numeric-aware by
 * identification number, and every empty section dropped. */
export function buildGridSections(
  vehicleTypes: VehicleType[],
  filter: VehicleStatus | null,
): GridSection[] {
  return [...vehicleTypes]
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map((type) => ({
      typeId: type.id,
      typeName: type.displayName,
      rows: [...type.vehicles]
        .filter((v) => !filter || v.status === filter)
        .sort((a, b) =>
          a.identificationNo.localeCompare(b.identificationNo, undefined, { numeric: true }),
        )
        .map((v) => ({
          vehicleId: v.id,
          identificationNo: v.identificationNo,
          status: v.status,
        })),
    }))
    .filter((section) => section.rows.length > 0);
}

/** Expands each visible month (oldest first) into its day columns plus a header group, assigning
 * every group its flattened start index so `monthLabelShift` can work in column pixels. */
export function buildMonthGroups(months: Date[], todayKey: string = TODAY_KEY): MonthGroup[] {
  let startIndex = 0;
  return months.map((month) => {
    const year = month.getUTCFullYear();
    const monthIndex = month.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const columns = Array.from({ length: daysInMonth }, (_, i) => {
      const date = new Date(Date.UTC(year, monthIndex, i + 1));
      const weekday = date.getUTCDay();
      const dateKey = dateKeyOf(date);
      return {
        dateKey,
        dayOfMonth: i + 1,
        isWeekend: weekday === 0 || weekday === 6,
        isMonthStart: i === 0,
        isToday: dateKey === todayKey,
      };
    });
    const group = {
      key: `${year}-${monthIndex}`,
      label: MONTH_GROUP_LABEL.format(month),
      startIndex,
      columns,
    };
    startIndex += columns.length;
    return group;
  });
}

/** `${vehicleId}|${dateKey}` → count for every spotting in the current range. */
export function buildCountsByKey(
  rows: ReadonlyArray<{ dateKey: string; count: number; vehicle: { id: string } }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(`${row.vehicle.id}|${row.dateKey}`, row.count);
  }
  return map;
}

/** One cell's spotting count, 0 when nothing was recorded for that vehicle/day. */
export function spottingCountFor(
  countsByKey: ReadonlyMap<string, number>,
  vehicleId: string,
  dateKey: string,
): number {
  return countsByKey.get(`${vehicleId}|${dateKey}`) ?? 0;
}

/** Sum of every visible (post-filter) vehicle's count in `section`, for one date column — the
 * per-vehicle-type total shown in both the inline and sticky-mirrored aggregation rows. */
export function aggregateSpottingsFor(
  section: GridSection,
  dateKey: string,
  countsByKey: ReadonlyMap<string, number>,
): number {
  return section.rows.reduce(
    (sum, row) => sum + spottingCountFor(countsByKey, row.vehicleId, dateKey),
    0,
  );
}
