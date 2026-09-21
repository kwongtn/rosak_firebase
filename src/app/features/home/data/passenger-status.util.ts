import type { BadgeVariants } from "../../../ui/badge/badge";
import type { PassengerStatus } from "./home.queries";

/** Human-readable label per passenger status. */
export const PASSENGER_LABEL: Record<PassengerStatus, string> = {
  NORMAL: "Normal",
  BUSY: "Busy",
  CROWDED: "Crowded",
  EXTREMELY_CROWDED: "Extremely Crowded",
  BACKLOGGED: "Backlogged",
  DELAYED: "Delayed",
  DISRUPTED: "Disrupted",
};

/** Badge variant per passenger status — reuses the HlmBadge variant vocabulary. */
export const PASSENGER_VARIANT: Record<PassengerStatus, BadgeVariants["variant"]> = {
  NORMAL: "success",
  BUSY: "info",
  CROWDED: "warning",
  EXTREMELY_CROWDED: "destructive",
  BACKLOGGED: "warning",
  DELAYED: "warning",
  DISRUPTED: "destructive",
};

/** Label for a passenger status, or exactly "No data" when absent. */
export function passengerLabel(status: PassengerStatus | null | undefined): string {
  return status ? PASSENGER_LABEL[status] : "No data";
}

/** Badge variant for a passenger status, or "neutral" when absent. */
export function passengerVariant(
  status: PassengerStatus | null | undefined,
): BadgeVariants["variant"] {
  return status ? PASSENGER_VARIANT[status] : "neutral";
}
