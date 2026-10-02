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

/**
 * Severity rank per passenger status — the enum's own declaration order, `NORMAL` (0) through
 * `DISRUPTED` (6).
 *
 * 🔴 This MIRRORS the backend `PassengerStatus` enum (`rosak_backend`, `operation/enums.py`):
 * the schema exposes the enum in declaration order, so "more severe" IS "declared later". The ranks
 * are therefore not an editorial layer on top of the server — they are the server's own order made
 * numeric, and a backend reorder would make every consumer of this table wrong at once. Keep the
 * two in step; the comment exists so nobody "tidies" the numbers into a preferred order (DELAYED
 * before CROWDED, say).
 *
 * `PASSENGER_SCALE` (`status-info.util.ts`) is the same order as a LIST (the legend's render order);
 * this table is the same order as a NUMBER (sort keys and thresholds). They stay separate on
 * purpose: the legend needs a stable display sequence even where no threshold is involved.
 */
export const PASSENGER_SEVERITY_RANK: Record<PassengerStatus, number> = {
  NORMAL: 0,
  BUSY: 1,
  CROWDED: 2,
  EXTREMELY_CROWDED: 3,
  BACKLOGGED: 4,
  DELAYED: 5,
  DISRUPTED: 6,
};

/**
 * The rank of a passenger status. Absent status ranks `0`, deliberately the same as NORMAL: "no
 * rider has reported a crowding level for this line" is not evidence of a problem, and giving it a
 * rank of its own would let an unreported line sort above a line somebody reported as Busy.
 */
export function passengerSeverityRank(status: PassengerStatus | null | undefined): number {
  return status ? PASSENGER_SEVERITY_RANK[status] : 0;
}

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
