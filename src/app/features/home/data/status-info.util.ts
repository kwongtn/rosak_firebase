import type { BadgeVariants } from "../../../ui/badge/badge";
import type { LineStatus, PassengerStatus, VehicleStatus } from "./home.queries";
import { PASSENGER_METRIC } from "./line-status-metrics.util";
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
export interface VehicleStatusCountRow {
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

/** Plain-language explanation per passenger status: its short title plus the universal metric. */
export const PASSENGER_INFO: Record<PassengerStatus, StatusInfo> = {
  NORMAL: { title: "Normal", body: PASSENGER_METRIC.NORMAL },
  BUSY: { title: "Busy", body: PASSENGER_METRIC.BUSY },
  CROWDED: { title: "Crowded", body: PASSENGER_METRIC.CROWDED },
  EXTREMELY_CROWDED: {
    title: "Extremely Crowded",
    body: PASSENGER_METRIC.EXTREMELY_CROWDED,
  },
  BACKLOGGED: { title: "Backlogged", body: PASSENGER_METRIC.BACKLOGGED },
  DELAYED: { title: "Delayed", body: PASSENGER_METRIC.DELAYED },
  DISRUPTED: { title: "Disrupted", body: PASSENGER_METRIC.DISRUPTED },
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

/** Plain-language explanation per line status. Titles mirror LineStatusBadge's labels. */
export const LINE_STATUS_INFO: Record<LineStatus, StatusInfo> = {
  TESTING: {
    title: "Testing",
    body: "The line is under test — service is not fully open to the public yet.",
  },
  DEFUNCT: { title: "Defunct", body: "This line is no longer in service." },
  ACTIVE: { title: "Active", body: "The line is fully operational." },
  PARTIAL_ACTIVE: {
    title: "Partially Active",
    body: "Only part of the line is open — some stations are skipped or closed.",
  },
  PARTIAL_DISRUPTION: {
    title: "Partial Disruption",
    body: "Part of the line is disrupted; expect delays or detours.",
  },
  TOTAL_DISRUPTION: {
    title: "Total Disruption",
    body: "The line is not running — use an alternative route.",
  },
};

/** Info for a line status. */
export function lineStatusInfo(status: LineStatus): StatusInfo {
  return LINE_STATUS_INFO[status];
}
