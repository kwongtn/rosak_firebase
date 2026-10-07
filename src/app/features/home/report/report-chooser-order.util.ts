import type { LinePulse } from "../data/home.queries";
import { sortLinesBySeverity } from "../data/network-summary.util";

/**
 * The order the chooser's line picker lists the network in: **pinned first, then recently touched,
 * then severity** — with the board's own comparator as the tiebreak everywhere.
 *
 * The order answers "which line am I probably reporting on?", and the answer is not "the worst one":
 * a rider who pinned two lines and last opened a third is working from THEIR network, not the
 * operator's. So the two personal signals outrank severity, and severity — not alphabetical order —
 * decides everything below them, which means a broken line is still above a healthy one within the
 * unclaimed remainder.
 *
 * 🔴 Pinned OUTRANKS recent. "I care about this line" (a standing statement the reader made and can
 * see on the board) is a stronger claim than "I looked at this line five minutes ago" (an artefact of
 * scrolling), and it is the one the reader can correct by unpinning.
 *
 * 🔴 Ties are broken by SEVERITY, not by the backend's order, and `Array.prototype.sort` is stable,
 * so sorting a severity-sorted list by rank preserves severity inside each rank band. A plain
 * `filter`-and-concatenate would silently reintroduce backend order for the remainder.
 */
export function orderChooserLines(
  lines: readonly LinePulse[],
  pinnedLineIds: readonly string[],
  recentLineIds: readonly string[],
): LinePulse[] {
  const recentRank = new Map(recentLineIds.map((id, index) => [id, index]));
  const bySeverity = sortLinesBySeverity(lines);
  return bySeverity
    .map((line, index) => {
      const rank = pinnedLineIds.includes(line.id) ? -1 : (recentRank.get(line.id) ?? Number.NaN);
      return { line, index, rank: Number.isNaN(rank) ? Number.MAX_SAFE_INTEGER : rank };
    })
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.line);
}

/**
 * The case-insensitive substring filter over the picker's list: a code ("kj"), a fragment of a name
 * ("kelana") or both. Nothing cleverer on purpose — the list is at most one line per MRT line, and a
 * fuzzy matcher that reorders results would contradict {@link orderChooserLines}, which is the order
 * the reader is being taught to rely on.
 */
export function filterChooserLines(lines: readonly LinePulse[], query: string): LinePulse[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return [...lines];
  }
  return lines.filter(
    (line) =>
      line.code?.toLowerCase().includes(needle) === true ||
      line.displayName?.toLowerCase().includes(needle) === true,
  );
}
