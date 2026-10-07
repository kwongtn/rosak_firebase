import type { LineStatusHourBucket, PassengerStatus } from "./home.queries";
import { PASSENGER_LABEL, passengerBarClass } from "./passenger-status.util";

/**
 * Pure display helpers for the three service-day HISTORY widgets — the expanded card's hourly
 * chart, the hero's network sparkline and the Pro heat grid.
 *
 * They live here, apart from every widget, because the three surfaces describe the SAME 24 buckets
 * and must not describe them three ways: an hour labelled "03:00–04:00" in one widget and "3am–4am"
 * in the next is not a cosmetic difference, it is the reader unable to line the two up. Every
 * function is total, Angular-free and defensive about a null `dominantStatus` (which the backend
 * sends for an hour nobody reported anything about) because `strictNullChecks` is OFF.
 *
 * 🔴 `SERVICE_DAY_START_HOUR` is a DISPLAY fact here, not a variable to send. The three widgets read
 * buckets whose range the backend already chose (its own `dayStartHour` default of 3), so this
 * constant exists to LABEL that range and nothing else. Baking it into query variables is exactly
 * what the history documents refuse to do — see `NETWORK_STATUS_HISTORY_QUERY`.
 */

/** Buckets in one community service day: the backend zero-fills 03:00 → 02:00. */
export const HISTORY_BUCKETS_PER_DAY = 24;

/** The hour the community service day starts, and therefore the hour the backend buckets from. */
export const SERVICE_DAY_START_HOUR = 3;

/** Plain-language name of the window, for a heading or an aria label. */
export const SERVICE_DAY_LABEL = "03:00 to 02:00";

/** The shortest visible stub for an hour that HAS reports, so a count of 1 is still a bar. */
export const MIN_HISTORY_BAR_PERCENT = 6;

/**
 * Bucket hours are Malaysia service hours, so they are formatted in MYT rather than the viewer's own
 * zone: a rider reading the grid from another timezone must still line the bars up with the labels
 * the backend printed.
 */
const HOUR_LABEL = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Kuala_Lumpur",
});

/** The hour an instant falls in, as the two digits a tick label uses ("03", "23", "00"). */
export function serviceHourLabel(instant: string): string {
  return HOUR_LABEL.format(new Date(instant));
}

/** An hour bucket as the inclusive-looking range a reader reads it as, "03:00–04:00". */
export function serviceHourRangeLabel(hourStart: string, hourEnd: string): string {
  return `${serviceHourLabel(hourStart)}:00–${serviceHourLabel(hourEnd)}:00`;
}

/** "1 report" / "9 reports" — the pluralisation every history surface needs, in one place. */
export function reportsPhrase(count: number): string {
  return `${count} report${count === 1 ? "" : "s"}`;
}

/**
 * A bar's height as a percentage of the busiest hour in the same series, with a floor so a single
 * report is still visible.
 *
 * 🔴 Scale to the busiest hour IN THE SAME WIDGET, never to a fixed constant: the widgets are all
 * per-day, self-relative views (the sparkline is the network's busiest hour, a line's expanded chart
 * is that line's), and a shared absolute scale would make a quiet network render as a row of
 * hairlines beside a busy hour. `0` for an empty hour is also the honest answer — the `MIN_` floor
 * applies only where there is something to show, so "nobody reported" is never drawn as a sliver.
 */
export function historyBarHeightPct(count: number, max: number): number {
  if (max <= 0 || count <= 0) {
    return 0;
  }
  return Math.max((count / max) * 100, MIN_HISTORY_BAR_PERCENT);
}

/**
 * The per-status tally of one bucket as readable text — "Busy 1, Crowded 3" — or `""` for an hour
 * with no reports.
 *
 * The backend already sends `statusCounts` in `PassengerStatus` declaration order with zeros
 * omitted, so the order here is the server's severity order and needs no sort. An hour whose
 * tallies somehow sum to nothing falls back to the dominant status's own label rather than to an
 * empty string, so the hour's tooltip still says what it was.
 */
export function historyBreakdownPhrase(bucket: LineStatusHourBucket): string {
  const parts = (bucket.statusCounts ?? [])
    .filter((entry) => entry.count > 0)
    .map((entry) => `${PASSENGER_LABEL[entry.status]} ${entry.count}`);
  if (parts.length > 0) {
    return parts.join(", ");
  }
  return bucket.dominantStatus ? `${PASSENGER_LABEL[bucket.dominantStatus]} ${bucket.count}` : "";
}

/** The `title` / `aria-label` one hour's bar carries, shared by the chart and the sparkline. */
export function historyBarTitle(bucket: LineStatusHourBucket): string {
  const range = serviceHourRangeLabel(bucket.hourStart, bucket.hourEnd);
  const breakdown = historyBreakdownPhrase(bucket);
  const base = `${range} · ${reportsPhrase(bucket.count)}`;
  return breakdown.length === 0 ? base : `${base} · ${breakdown}`;
}

/** The bar fill for a bucket, from its dominant status — `null` paints the muted "no reports" track. */
export function historyBarClass(bucket: LineStatusHourBucket): string {
  return passengerBarClass(bucket.dominantStatus);
}

/**
 * The busiest hour of a series, or `null` when every hour is empty.
 *
 * Ties go to the EARLIEST hour, which `reduce` gives for free by keeping the incumbent: for a reader
 * asking "when was it busiest today", the first such hour is the answer a human gives too, and
 * picking the last one would make the same service day report a different peak depending on how many
 * hours happened to tie.
 */
export function busiestBucket(buckets: LineStatusHourBucket[]): LineStatusHourBucket | null {
  let busiest: LineStatusHourBucket | null = null;
  for (const bucket of buckets) {
    if (bucket.count > 0 && (busiest === null || bucket.count > busiest.count)) {
      busiest = bucket;
    }
  }
  return busiest;
}

/** The total report count across a series of buckets — the sparkline's headline number. */
export function historyTotal(buckets: LineStatusHourBucket[]): number {
  return buckets.reduce((sum, bucket) => sum + bucket.count, 0);
}

/** How many of the day's hours carried at least one report, for "active hours" phrasing. */
export function historyActiveHours(buckets: LineStatusHourBucket[]): number {
  return buckets.reduce((hours, bucket) => hours + (bucket.count > 0 ? 1 : 0), 0);
}

/**
 * Index of the bucket whose half-open window `[hourStart, hourEnd)` contains `now`, or `-1` when no
 * bucket does — an empty series, another service day, or instants neither side can parse.
 *
 * 🔴 HALF-OPEN on purpose, not by accident. Adjacent buckets share an instant: hour 3's `hourEnd`
 * IS hour 4's `hourStart`, so a closed test would match the first bucket that ends exactly now and
 * the "current hour" would read as the hour that just ended. `start <= t < end` gives every instant
 * in the day to exactly one bucket, with the seam belonging to the later hour.
 *
 * `-1` rather than a throw is the answer because this runs while rendering: an unparseable instant
 * (a null hour, a truncated string) must leave the widget in its ordinary "no current hour" state
 * instead of taking the page down with it.
 */
export function currentServiceBucketIndex(buckets: LineStatusHourBucket[], now: Date): number {
  const at = now.getTime();
  for (let index = 0; index < buckets.length; index++) {
    const start = new Date(buckets[index].hourStart).getTime();
    const end = new Date(buckets[index].hourEnd).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) {
      continue;
    }
    if (start <= at && at < end) {
      return index;
    }
  }
  return -1;
}

/**
 * One accessible sentence describing a whole hour series, for a `role="img"` container.
 *
 * The shape is deliberate: WHAT is counted, over WHICH window, HOW MUCH, and WHEN the peak was — a
 * screen-reader user gets the same four facts a sighted reader gets from 24 bars and a hover
 * tooltip, instead of twenty-four disconnected hour numbers. An empty series gets its own sentence
 * rather than "0 reports in 0 hours", which reads as a measurement rather than as the absence of one.
 */
export function historySummaryLabel(
  buckets: LineStatusHourBucket[],
  scope: string,
  emptyWhenNoData = "No rider reports in this service day yet.",
): string {
  const total = historyTotal(buckets);
  if (total === 0) {
    return emptyWhenNoData;
  }
  const hours = historyActiveHours(buckets);
  const peak = busiestBucket(buckets);
  const when = peak ? ` Busiest hour ${serviceHourRangeLabel(peak.hourStart, peak.hourEnd)}.` : "";
  return `${scope} · service day ${SERVICE_DAY_LABEL} · ${reportsPhrase(total)} in ${hours} of ${HISTORY_BUCKETS_PER_DAY} hours.${when}`;
}

/**
 * The heat grid's INTENSITY ladder — six literal Tailwind opacity utilities.
 *
 * 🔴 These are written out in full, not interpolated (`opacity-${n}`), because Tailwind v4 decides
 * what to compile by scanning the SOURCE for literal class names: an interpolated class is not in
 * the source, so the JIT pass never emits it and every cell would render at whatever opacity the
 * browser happened to default to. The same reason the legend has to name the same strings.
 *
 * The ladder is the grid's documented second dimension. Colour carries WHICH status dominated the
 * hour; opacity carries HOW MANY reports it had, relative to the busiest cell on screen. Two
 * dimensions, because "Disrupted" and "six people said it" are different facts and a single colour
 * cannot carry both.
 */
export const HEAT_INTENSITY_CLASSES = [
  "opacity-10",
  "opacity-25",
  "opacity-45",
  "opacity-70",
  "opacity-100",
] as const;

/** How many steps the ladder has — the number the methodology registry publishes. */
export const HEAT_INTENSITY_STEPS = HEAT_INTENSITY_CLASSES.length;

/**
 * Which intensity step a count belongs to, on a 0…`max` scale within ONE rendered grid.
 *
 * Zero is its own answer (`""`): the cell renders as the muted empty track with no opacity class at
 * all, so "nobody reported" and "one person did" can never look the same.
 */
export function heatIntensityStep(count: number, max: number): number {
  if (count <= 0 || max <= 0) {
    return 0;
  }
  const ratio = Math.min(count / max, 1);
  // `HEAT_INTENSITY_CLASSES.length` steps across 0 < ratio <= 1, so the busiest cell is always the
  // strongest and a lone report in a busy grid still lands on the first, faintest step.
  const step = Math.max(1, Math.ceil(ratio * HEAT_INTENSITY_STEPS));
  return Math.min(step, HEAT_INTENSITY_STEPS);
}

/** The opacity utility for a step from {@link heatIntensityStep}; `""` for the empty track. */
export function heatIntensityClass(step: number): string {
  return step <= 0 ? "" : (HEAT_INTENSITY_CLASSES[step - 1] ?? "");
}

/**
 * A heat cell's classes: the dominant status's colour, plus an intensity step when the hour carried
 * reports. An empty hour gets the muted track and NO opacity class, which is the "no data" colour
 * rather than a faint tint of a status nobody reported.
 */
export function heatCellClass(
  count: number,
  max: number,
  dominantStatus: PassengerStatus | null,
): string {
  if (count <= 0) {
    return passengerBarClass(null);
  }
  const intensity = heatIntensityClass(heatIntensityStep(count, max));
  return [passengerBarClass(dominantStatus), intensity].filter((part) => part !== "").join(" ");
}

/** The statuses the heat grid's legend lists, in the backend's own severity order. */
export function heatLegendEntries(): Array<{ status: PassengerStatus; label: string }> {
  return (
    [
      "NORMAL",
      "BUSY",
      "CROWDED",
      "EXTREMELY_CROWDED",
      "BACKLOGGED",
      "DELAYED",
      "DISRUPTED",
    ] as PassengerStatus[]
  ).map((status) => ({ status, label: PASSENGER_LABEL[status] }));
}
