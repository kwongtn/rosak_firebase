import type { LinePulse, LineStatus } from "./home.queries";
import {
  PASSENGER_SEVERITY_RANK,
  passengerLabel,
  passengerSeverityRank,
} from "./passenger-status.util";
import { lineStatusInfo } from "./status-info.util";

/**
 * How badly a line is doing, from the OPERATIONAL (line status) axis. Higher is worse.
 *
 * This is a TOTAL order, not the backend's enum order: the enum is
 * `TESTING < DEFUNCT < ACTIVE < PARTIAL_ACTIVE < PARTIAL_DISRUPTION < TOTAL_DISRUPTION`, i.e. it
 * groups the two administrative states together in the middle and hides ACTIVE inside them. For a
 * board whose entire job is "show me what is broken first", the operational states a rider can act
 * on must outrank the ones they cannot:
 *
 *  - `TOTAL_DISRUPTION` (6) — not running at all; change route.
 *  - `PARTIAL_DISRUPTION` (5) — partially disrupted; expect delays or detours.
 *  - `PARTIAL_ACTIVE` (4) — running, part of it closed (e.g. a phased extension).
 *  - `DEFUNCT` (3) — permanently closed. Sits BELOW the partial states deliberately: it is a
 *    settled, un-actionable fact, not something a rider can wait out.
 *  - `TESTING` (2) — pre-opening trial service; also un-actionable.
 *  - `ACTIVE` (0) — the floor. A fully-running line is the best state available, never a deficit.
 *
 * `ACTIVE` is 0 rather than 1 so a healthy line has room below it for the passenger axis to do its
 * work (see {@link compareLineSeverity}).
 */
export const LINE_STATUS_SEVERITY_RANK: Record<LineStatus, number> = {
  TOTAL_DISRUPTION: 6,
  PARTIAL_DISRUPTION: 5,
  PARTIAL_ACTIVE: 4,
  DEFUNCT: 3,
  TESTING: 2,
  ACTIVE: 0,
};

/**
 * The two statuses that are NOT running passenger service a rider could be on.
 *
 * `TESTING` is a pre-opening trial and `DEFUNCT` is permanently closed — the same two states
 * {@link LINE_STATUS_SEVERITY_RANK} already calls settled and un-actionable. A line in either state
 * can never be "running normally" nor ever recover while a rider watches, so counting it as a
 * deficit is not a fact about the service: it is a permanent property of the line. Everything else,
 * including every PARTIAL/TOTAL state, is a live operational condition and keeps counting.
 */
const OUT_OF_SERVICE_STATUSES: ReadonlySet<LineStatus> = new Set(["TESTING", "DEFUNCT"]);

/**
 * Whether this line is carrying passenger service at all — i.e. whether it is a candidate for the
 * network's "running normally" sentence and tone.
 *
 * Scoped to the HEADLINE only (see {@link InServiceSummary}). The board, the tile and the callout
 * still take every line, because a closed line is exactly what those are for.
 */
export function isInService(line: LinePulse): boolean {
  return !OUT_OF_SERVICE_STATUSES.has(line.status);
}

/**
 * The passenger rank at or above which a line counts as needing attention.
 *
 * = `PASSENGER_SEVERITY_RANK.DELAYED` (5). DELAYED and DISRUPTED are the two passenger states that
 * describe the SERVICE rather than one carriage: crowding (BUSY … EXTREMELY_CROWDED) and a
 * platform backlog are real rider pain but they are reports about a train, not about the line, and
 * treating them as service failures would leave the headline reading "0 of 16 lines running
 * normally" on any busy evening — a metric nobody would keep reading. 🔴 This threshold is
 * documented in the methodology registry as `network.needs-attention` (with the number coming from
 * `METHODOLOGY_CONSTANTS`), so it is one value with two readers rather than two copies.
 */
export const NEEDS_ATTENTION_PASSENGER_RANK = PASSENGER_SEVERITY_RANK.DELAYED;

/**
 * Whether a line is anything other than fully running, or has a rider report describing the
 * service (rather than the load) as late or suspended. A `null` passenger status is not evidence
 * of trouble — see {@link passengerSeverityRank}.
 */
export function lineNeedsAttention(line: LinePulse): boolean {
  return (
    line.status !== "ACTIVE" ||
    passengerSeverityRank(line.passengerStatus) >= NEEDS_ATTENTION_PASSENGER_RANK
  );
}

/**
 * Sort comparator for board rows: **operational severity first, passenger severity second**.
 *
 * The two axes are not interchangeable, so they are compared in order rather than summed. A
 * PARTIAL_DISRUPTION line is worse than a DELAYED one no matter how crowded the second is reported
 * to be: one of them will not run, the other will run badly. The passenger axis then separates the
 * lines that tie on operations, which is exactly where it carries information.
 *
 * `code` is the final tiebreak, so the ordering is TOTAL and two boards with the same data always
 * render in the same order (a stable render is worth more here than preserving input order, and the
 * input order is an unmeaningful backend default).
 */
export function compareLineSeverity(a: LinePulse, b: LinePulse): number {
  const operational = LINE_STATUS_SEVERITY_RANK[b.status] - LINE_STATUS_SEVERITY_RANK[a.status];
  if (operational !== 0) {
    return operational;
  }
  const passenger =
    passengerSeverityRank(b.passengerStatus) - passengerSeverityRank(a.passengerStatus);
  if (passenger !== 0) {
    return passenger;
  }
  return a.code.localeCompare(b.code);
}

/** A new array in severity order — the caller's input is never mutated. */
export function sortLinesBySeverity(lines: readonly LinePulse[]): LinePulse[] {
  return [...lines].sort(compareLineSeverity);
}

/** The two counts the headline sentence and the tone are built from — in-service lines only. */
export interface InServiceSummary {
  /** Lines actually in passenger service ({@link isInService}). */
  total: number;
  /** Of those, the ones failing {@link lineNeedsAttention}. */
  needsAttentionCount: number;
}

/** The board's rolled-up state, derived from one read of the line list. No new network reads. */
export interface NetworkSummary {
  /** Lines in the read (0 while the first read is still in flight). */
  total: number;
  /** Lines that are ACTIVE with no DELAYED/DISRUPTED rider report. */
  normalCount: number;
  /** Lines failing {@link lineNeedsAttention}, most severe first. */
  needsAttentionLines: LinePulse[];
  /** `needsAttentionLines.length`, precomputed because the hero renders it four times. */
  needsAttentionCount: number;
  /** The single most severe line needing attention, or `null` when the network is clean. */
  worstLine: LinePulse | null;
  /**
   * The headline's own counts: lines IN SERVICE only (TESTING/DEFUNCT excluded), because a
   * pre-opening or closed line can never be "running normally". Every other field on this summary
   * still counts ALL lines — the tile, the callout and the board keep listing them.
   */
  inService: InServiceSummary;
  /** `"All 14 lines running normally"` — the hero's headline, counted over in-service lines. */
  headline: string;
  /** One plain-language sentence naming the worst line, or `null` when the network is clean. */
  callout: string | null;
  /**
   * Sum of every line's `statusReportCount` — rider reports in each line's OWN rolling window
   * (`statusWindowMinutes`, a backend-owned number). It is a sum over per-line windows rather than
   * a single counted set: two lines with different windows can double-count one rider, which is
   * why the hero's tile says "reports now" rather than claiming a distinct-report count.
   */
  reportsNow: number;
}

/**
 * Roll a line list up into the board's headline numbers.
 *
 * Pure and total: an empty list is a valid input and yields `headline: "No live line data yet"`
 * rather than the misleading "0 of 0 lines running normally", so the hero renders real copy during
 * the first read instead of an arithmetic edge case.
 */
export function summarizeNetwork(lines: readonly LinePulse[] | null | undefined): NetworkSummary {
  const present = lines ?? [];
  const needsAttentionLines = sortLinesBySeverity(present.filter(lineNeedsAttention));
  const needsAttentionCount = needsAttentionLines.length;
  const normalCount = present.length - needsAttentionCount;
  const worstLine = needsAttentionLines[0] ?? null;

  // The headline and the tone read these two numbers; everything else above reads all lines.
  const inServiceLines = present.filter(isInService);
  const inService: InServiceSummary = {
    total: inServiceLines.length,
    needsAttentionCount: inServiceLines.filter(lineNeedsAttention).length,
  };
  const inServiceNormal = inService.total - inService.needsAttentionCount;

  return {
    total: present.length,
    normalCount,
    needsAttentionLines,
    needsAttentionCount,
    worstLine,
    inService,
    // "No live line data yet" is `networkHeadline`'s own empty-read branch; a read that DID return
    // lines but none of them in service is a different fact, and gets its own words rather than
    // "No lines running normally — 0 need attention".
    headline:
      inService.total === 0 && present.length > 0
        ? "No lines in service"
        : networkHeadline(inService.total, inServiceNormal, inService.needsAttentionCount),
    callout: worstLine ? lineCallout(worstLine) : null,
    reportsNow: present.reduce((sum, line) => sum + (line.statusReportCount ?? 0), 0),
  };
}

/**
 * How well the network as a WHOLE is doing — the hero's single colour tone.
 *
 * Deliberately derived from the same two numbers the headline sentence is built from — which are
 * `summary.inService`, not the all-lines counts — so the words and the colour can never describe
 * different arithmetic. `degraded` is capped at HALF: at exactly half the network needing attention
 * is still a majority of riders on working trains, and painting that the same alarm red as a
 * network that is broadly down would train readers to ignore red.
 */
export type NetworkTone = "unknown" | "normal" | "degraded" | "critical";

/**
 * The network's colour tone for the hero: normal = every line running; degraded = at least one line
 * needs attention but no more than half; critical = MORE THAN half need attention; unknown = no
 * lines read yet. "Needs attention" is the existing lineNeedsAttention rule.
 */
export function networkTone(total: number, needsAttentionCount: number): NetworkTone {
  if (total <= 0) {
    return "unknown";
  }
  if (needsAttentionCount <= 0) {
    return "normal";
  }
  return needsAttentionCount * 2 > total ? "critical" : "degraded";
}

/**
 * The headline sentence, in plain language rather than dashboard shorthand. Three shapes plus the
 * empty-read case, so no branch can render "0 of 0" or "0 of 16" (the latter reads as a total
 * outage, which is not what zero-normal means on a line list that is still loading).
 */
export function networkHeadline(
  total: number,
  normalCount: number,
  attentionCount: number,
): string {
  if (total === 0) {
    return "No live line data yet";
  }
  if (attentionCount === 0) {
    return `All ${total} lines running normally`;
  }
  if (normalCount === 0) {
    return `No lines running normally — ${attentionCount} need attention`;
  }
  return `${normalCount} of ${total} lines running normally`;
}

/**
 * One sentence about the worst line, built from the SAME two lookup tables the card's own chips
 * read (`lineStatusInfo` for the operational label, `passengerLabel` for the crowd), so a status
 * name can never be spelled two ways on one screen. A fully-running line with a late/severely
 * disrupted rider report is called out by its passenger status, because there is no operational
 * label worth printing for it.
 */
export function lineCallout(line: LinePulse): string {
  if (line.status !== "ACTIVE") {
    return `${line.code} — ${lineStatusInfo(line.status).title}`;
  }
  return `${line.code} — riders report it ${passengerLabel(line.passengerStatus).toLowerCase()}`;
}
