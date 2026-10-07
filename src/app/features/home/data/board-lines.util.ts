import { isInService, lineNeedsAttention, sortLinesBySeverity } from "./network-summary.util";
import { passengerSeverityRank } from "./passenger-status.util";
import { lineHasData } from "./status-confidence.util";
import type { LinePulse } from "./home-board.queries";
import type { LineStatus, PassengerStatus } from "./home.queries";

/**
 * How the board's "All lines" group orders the lines no higher group claimed.
 *
 * `severity` is the default because the board's entire job is "what is broken first", and it is the
 * same order the hero's callout and the "Needs attention" group use — one reader, one order, so the
 * page can never claim a line is fine while listing it below a worse one. `name` is the alphabetical
 * fallback for a reader who wants the network as a list of names.
 *
 * 🔴 This sorts ONLY the "All lines" group. "Needs attention" and "My lines" are always
 * severity-sorted, deliberately: both are short, both are the reason the reader came to the page,
 * and re-ordering them alphabetically would put a dead line under a healthy one for no gain.
 */
export type BoardSort = "severity" | "name";

/** The board's sort with nothing chosen — also the value the URL omits. */
export const DEFAULT_BOARD_SORT: BoardSort = "severity";

/** Every accepted `?sort=` value, for the URL's own parse-and-degrade. */
export const BOARD_SORTS: readonly BoardSort[] = ["severity", "name"];

/** Every `LineStatus`, for the Pro board's operational-status filter's own options. Named once so a
 * control cannot offer a value the data cannot hold. */
export const LINE_STATUSES: readonly LineStatus[] = [
  "ACTIVE",
  "PARTIAL_ACTIVE",
  "PARTIAL_DISRUPTION",
  "TOTAL_DISRUPTION",
  "TESTING",
  "DEFUNCT",
];

/** Every `PassengerStatus`, for the Pro board's passenger filter's own options. */
export const PASSENGER_STATUSES: readonly PassengerStatus[] = [
  "NORMAL",
  "BUSY",
  "CROWDED",
  "EXTREMELY_CROWDED",
  "BACKLOGGED",
  "DELAYED",
  "DISRUPTED",
];

/** Local name compare for `code`, the last tiebreak of the severity order as well as the whole of
 * the `name` order. `localeCompare` rather than `<`: MRT line codes mix letters and digits, and a
 * raw character-code compare sorts "K10" before "K2". */
function byCode(a: LinePulse, b: LinePulse): number {
  return a.code.localeCompare(b.code);
}

/** The three Pro-only board narrowing axes, all defaulting to "no narrowing". */
export interface ProLineFilters {
  /** Operational status the board is narrowed to, or `null` for every status. */
  status: LineStatus | null;
  /** Passenger severity the board is narrowed to **at or above**, or `null` for any. */
  passengerStatus: PassengerStatus | null;
  /** "Only lines we actually know something about" — see {@link lineHasData}. */
  onlyWithData: boolean;
}

/**
 * The lines the PRO board draws, over every Pro filter — `lines()` narrowed by the three axes, which
 * default to no narrowing.
 *
 * Each axis is applied in order and independently, so a reader who set two filters sees their
 * intersection rather than whichever control fired last. The ORDER of the three is only about
 * readability of the predicate; they are independent `&&`s.
 *
 * 🔴 **"Has data" is {@link lineHasData} — `statusConfidence(line).level !== "none"` — and it is
 * deliberately the SAME rule the board's confidence chip already shows the reader.** That is not
 * convenience — it is what makes the filter honest. See the function for why the more obvious
 * spelling would claim a quiet line has data while the chip beside it says "No recent reports".
 *
 * Every other axis is exact equality — `status === X`, `severity >= X` — because those are literal
 * values the reader named; only this one is a judgement call, which is why it is the one published
 * in the methodology registry.
 */
export function filterProLines(lines: readonly LinePulse[], filters: ProLineFilters): LinePulse[] {
  const floor =
    filters.passengerStatus === null ? null : passengerSeverityRank(filters.passengerStatus);

  return lines.filter((line) => {
    if (filters.status !== null && line.status !== filters.status) {
      return false;
    }
    if (floor !== null && passengerSeverityRank(line.passengerStatus) < floor) {
      return false;
    }
    return !filters.onlyWithData || lineHasData(line);
  });
}

/** One unclaimed board group in the board's current sort: worst-first, or by `code` when asked for
 * `name`. Copies before sorting so a caller's input array is never re-ordered under it. */
function sortBoardGroup(lines: readonly LinePulse[], sort: BoardSort): LinePulse[] {
  return sort === "name" ? [...lines].sort(byCode) : sortLinesBySeverity(lines);
}

/** The four board groups, in render order. A PARTITION of the `visible` input — see
 * {@link partitionBoardLines}. */
export interface BoardLineGroups {
  attention: LinePulse[];
  mine: LinePulse[];
  all: LinePulse[];
  others: LinePulse[];
}

/**
 * The board's four groups — a PARTITION of `visibleLines()` (the board's own Pro filters). 🔴 **Every
 * line appears in EXACTLY ONE of `attention` / `mine` / `all` / `others`.** That is the property the
 * whole board rests on, and it is achieved by ONE decision, applied in one order:
 *
 *  - **Attention membership always wins.** A line that needs attention is in `attention` even when
 *    the reader has pinned it. Pinning is a way of saying "I care about this line", not a way of
 *    hiding a broken one further down the page — a pinned line with a `TOTAL_DISRUPTION` status is
 *    exactly the line the reader most wants at the top, and duplicating it into "My lines" would
 *    print it twice on one page. Out-of-service lines (TESTING/DEFUNCT) never reach this group:
 *    `lineNeedsAttention` skips them, so a closed or pre-opening line is never painted as a problem.
 *  - `mine` is therefore "pinned AND NOT already in attention" — including a pinned out-of-service
 *    line: for those, "pin wins", because the reader explicitly asked to keep it.
 *  - `all` is the in-service rest — "neither claimed, and actually running" — so it never absorbs a
 *    Defunct/Testing line it does not describe.
 *  - `others` is "out of service AND unpinned" — the administrative bucket, rendered LAST as
 *    "Others", never counted by the hero and never listed as needing attention.
 *
 * The consequence is the point: no line renders twice, and no line disappears — a reader who pins
 * three lines still sees every other line, and one bad report can never make a line vanish from a
 * group it belonged to. Each group subtracts the ids the previous ones CLAIMED rather than
 * re-deriving its own predicate, because four independently-written filters is how a line ends up in
 * two groups or in none.
 *
 * The counts and the headline come from the SAME pure `summarizeNetwork` the hero reads, so the
 * hero's tiles and the board's groups cannot disagree about which lines need attention — which is
 * also why the partition is taken over `visibleLines()` rather than `lines()`: the partition has to
 * be over the same set the rows are drawn from, or a Pro filter would shrink a group without
 * shrinking the others.
 */
export function partitionBoardLines(
  visible: readonly LinePulse[],
  pinnedLineIds: readonly string[],
  sort: BoardSort,
): BoardLineGroups {
  const attention = sortLinesBySeverity(visible.filter((line) => lineNeedsAttention(line)));
  const attentionIds = new Set(attention.map((line) => line.id));

  const pinned = new Set(pinnedLineIds);
  const mine = sortLinesBySeverity(
    visible.filter((line) => pinned.has(line.id) && !attentionIds.has(line.id)),
  );

  const claimed = new Set([...attentionIds, ...mine.map((line) => line.id)]);
  const all = sortBoardGroup(
    visible.filter((line) => isInService(line) && !claimed.has(line.id)),
    sort,
  );

  const mineIds = new Set(mine.map((line) => line.id));
  const others = sortBoardGroup(
    visible.filter((line) => !isInService(line) && !mineIds.has(line.id)),
    sort,
  );

  return { attention, mine, all, others };
}
