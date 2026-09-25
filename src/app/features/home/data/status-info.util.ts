import { metricDoc } from "../../../core/methodology/methodology-render.util";
import type { BadgeVariants } from "../../../ui/badge/badge";
import type { LineStatus, PassengerStatus, VehicleStatus } from "./home.queries";
import { PASSENGER_LABEL, PASSENGER_VARIANT } from "./passenger-status.util";

/** Copy shown in a status info popover: a short title plus one line of plain language. */
export interface StatusInfo {
  title: string;
  body: string;
}

/** One row of the passenger-severity legend. */
export interface StatusScaleEntry {
  key: PassengerStatus;
  label: string;
  variant: BadgeVariants["variant"];
  active: boolean;
  /** Reports behind this level in the current window; absent when the level has no count. */
  count?: number;
}

/** One row of the vehicle-status breakdown popover: a readable label plus its current count. */
interface VehicleStatusCountRow {
  key: VehicleStatus;
  label: string;
  count: number;
}

/** Readable label per vehicle status — the hover breakdown's row text. */
export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  IN_SERVICE: "In service",
  NOT_SPOTTED: "Not spotted",
  OUT_OF_SERVICE: "Out of service",
  DECOMMISSIONED: "Decommissioned",
  MARRIED: "Married",
  TESTING: "Testing",
  UNKNOWN: "Unknown",
};

/** The 7 vehicle statuses in enum order — the order the breakdown must render them in. */
export const VEHICLE_STATUS_ORDER: VehicleStatus[] = [
  "IN_SERVICE",
  "NOT_SPOTTED",
  "OUT_OF_SERVICE",
  "DECOMMISSIONED",
  "MARRIED",
  "TESTING",
  "UNKNOWN",
];

/**
 * The reported vehicle counts as readable rows: statuses with a non-zero count only, in enum
 * order, with duplicate entries for one status summed. Missing input yields no rows at all.
 */
export function vehicleStatusRows(
  counts: readonly { status: VehicleStatus; count: number }[] | null | undefined,
): VehicleStatusCountRow[] {
  const byStatus = new Map<VehicleStatus, number>();
  for (const entry of counts ?? []) {
    byStatus.set(entry.status, (byStatus.get(entry.status) ?? 0) + entry.count);
  }
  return VEHICLE_STATUS_ORDER.filter((status) => (byStatus.get(status) ?? 0) > 0).map((status) => ({
    key: status,
    label: VEHICLE_STATUS_LABEL[status],
    count: byStatus.get(status) ?? 0,
  }));
}

const NO_PASSENGER_DATA: StatusInfo = {
  title: "No data",
  body: "No recent community reports for this line.",
};

/**
 * The popover copy for a methodology registry metric: its title plus its definition. Reading the
 * registry here is what keeps the tooltip and `/methodology` from ever disagreeing.
 */
function infoFromDoc(id: string): StatusInfo {
  const doc = metricDoc(id);
  return { title: doc.title, body: doc.definition };
}

/** Plain-language explanation per passenger status, sourced from the methodology registry. */
export const PASSENGER_INFO: Record<PassengerStatus, StatusInfo> = {
  NORMAL: infoFromDoc("passenger.normal"),
  BUSY: infoFromDoc("passenger.busy"),
  CROWDED: infoFromDoc("passenger.crowded"),
  EXTREMELY_CROWDED: infoFromDoc("passenger.extremely_crowded"),
  BACKLOGGED: infoFromDoc("passenger.backlogged"),
  DELAYED: infoFromDoc("passenger.delayed"),
  DISRUPTED: infoFromDoc("passenger.disrupted"),
};

/** The 7 passenger levels in severity order — the order the legend must render them in. */
export const PASSENGER_SCALE: PassengerStatus[] = [
  "NORMAL",
  "BUSY",
  "CROWDED",
  "EXTREMELY_CROWDED",
  "BACKLOGGED",
  "DELAYED",
  "DISRUPTED",
];

/** Info for a passenger status, or a "No data" explanation when absent. */
export function passengerInfo(status: PassengerStatus | null | undefined): StatusInfo {
  return status ? PASSENGER_INFO[status] : NO_PASSENGER_DATA;
}

/**
 * The full severity legend, with exactly the active level flagged. When reported counts are
 * given, each level carries its summed count — duplicate entries for one status are added
 * together, and a level with no count (or a zero one) stays undefined.
 */
export function passengerScale(
  status: PassengerStatus | null | undefined,
  counts?: readonly { status: PassengerStatus; count: number }[] | null,
): StatusScaleEntry[] {
  const byStatus = new Map<PassengerStatus, number>();
  for (const entry of counts ?? []) {
    byStatus.set(entry.status, (byStatus.get(entry.status) ?? 0) + entry.count);
  }
  return PASSENGER_SCALE.map((key) => {
    const count = byStatus.get(key) ?? 0;
    return {
      key,
      label: PASSENGER_LABEL[key],
      variant: PASSENGER_VARIANT[key],
      active: key === status,
      count: count > 0 ? count : undefined,
    };
  });
}

/** Plain-language explanation per line status, sourced from the methodology registry. */
export const LINE_STATUS_INFO: Record<LineStatus, StatusInfo> = {
  TESTING: infoFromDoc("line-status.testing"),
  DEFUNCT: infoFromDoc("line-status.defunct"),
  ACTIVE: infoFromDoc("line-status.active"),
  PARTIAL_ACTIVE: infoFromDoc("line-status.partial_active"),
  PARTIAL_DISRUPTION: infoFromDoc("line-status.partial_disruption"),
  TOTAL_DISRUPTION: infoFromDoc("line-status.total_disruption"),
};

/** Info for a line status. */
export function lineStatusInfo(status: LineStatus): StatusInfo {
  return LINE_STATUS_INFO[status];
}
