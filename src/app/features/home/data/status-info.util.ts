import type { BadgeVariants } from "../../../ui/badge/badge";
import type { LineStatus, PassengerStatus } from "./home.queries";
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
}

const NO_PASSENGER_DATA: StatusInfo = {
  title: "No data",
  body: "No recent community reports for this line.",
};

/** Plain-language explanation per passenger status. */
export const PASSENGER_INFO: Record<PassengerStatus, StatusInfo> = {
  NORMAL: {
    title: "Normal",
    body: "Trains are running normally — no crowding reported.",
  },
  BUSY: { title: "Busy", body: "Busier than usual, but still comfortable." },
  CROWDED: { title: "Crowded", body: "Noticeably crowded; expect to stand." },
  EXTREMELY_CROWDED: { title: "Extremely Crowded", body: "Packed — boarding may be difficult." },
  BACKLOGGED: { title: "Backlogged", body: "Services are backing up; expect waits." },
  DELAYED: { title: "Delayed", body: "Trains are running late." },
  DISRUPTED: { title: "Disrupted", body: "Service is disrupted; expect significant delays." },
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

/** The full severity legend, with exactly the active level flagged. */
export function passengerScale(status: PassengerStatus | null | undefined): StatusScaleEntry[] {
  return PASSENGER_SCALE.map((key) => ({
    key,
    label: PASSENGER_LABEL[key],
    variant: PASSENGER_VARIANT[key],
    active: key === status,
  }));
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
