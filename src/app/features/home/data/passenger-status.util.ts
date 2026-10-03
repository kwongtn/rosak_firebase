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

/**
 * Fill colour per passenger status for every hand-rolled bar visual on this feature: the expanded
 * card's hourly chart, the hero's network sparkline and the Pro heat grid's cells.
 *
 * 🔴 ONE table, three surfaces, on purpose. The first two widgets existed before this table (each
 * with its own private copy) and the heat grid is the third reader: three near-identical palettes
 * are three places a colour can be "tidied" one way, and the reader's eye then sees a Delayed hour
 * in one widget as amber and in another as yellow. It is deliberately NOT the badge-variant table
 * above — a badge is a tinted chip with a label beside it, and a bar is a fill with nothing beside
 * it, so they need different contrast; the two are kept as separate tables rather than one mapping
 * both, which would couple two things that have no reason to move together.
 */
export const PASSENGER_BAR_CLASS: Record<PassengerStatus, string> = {
  NORMAL: "bg-emerald-500",
  BUSY: "bg-blue-500",
  CROWDED: "bg-amber-500",
  EXTREMELY_CROWDED: "bg-red-500",
  BACKLOGGED: "bg-orange-500",
  DELAYED: "bg-yellow-500",
  // 🔴 The one bar that needed a dark pair, and the audit that found it. Measured against the dark
  // card (oklch 0.22): every status colour above clears 4.5:1 except this one, at 3.84:1 — and it is
  // DISRUPTED, the status a rider must not be able to miss, rendered as the DIMMEST bar on the page.
  // `rose-500` takes it to 4.61:1 on the same card. A `dark:` pair here rather than a new theme token
  // because this table IS the single place these seven colours are named (see its doc comment): the
  // values are literal Tailwind palette utilities by design — they must be, or the JIT pass never
  // emits them — so the palette step is what there is to switch, and one table is a smaller seam than
  // seven new tokens used exactly once each. Light is untouched: `rose-600` already sits at 4.5:1
  // on the light card.
  DISRUPTED: "bg-rose-600 dark:bg-rose-500",
};

/** The muted fill for an hour or cell with no reports — a track, not a zero-valued datum. */
export const PASSENGER_NO_DATA_BAR_CLASS = "bg-muted";

/**
 * The bar fill for a bucket's dominant status, or the muted track when the hour carried no reports.
 *
 * `dominantStatus` is nullable by design on the backend: an hour nobody reported anything about has
 * `count: 0`, `statusCounts: []` and a null dominant status. Falling back to a status colour there
 * would paint a "nothing happened" hour in Normal green, which reads as a confirmed good hour.
 */
export function passengerBarClass(status: PassengerStatus | null | undefined): string {
  return status ? PASSENGER_BAR_CLASS[status] : PASSENGER_NO_DATA_BAR_CLASS;
}
