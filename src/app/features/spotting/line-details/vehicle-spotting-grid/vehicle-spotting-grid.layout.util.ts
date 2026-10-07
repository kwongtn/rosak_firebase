import {
  COL_W,
  GridColumn,
  MONTH_LABEL_FALLBACK_RESERVE_PX,
  MonthGroup,
} from "./vehicle-spotting-grid.data.util";

/** The one look shared by the mobile type label's two rendered copies, the in-flow row and the
 * pinned overlay. Pinning swaps one for the other, so they must be pixel-identical or the label
 * visibly jumps (font size, colour, borders) as it anchors; desktop has no such jump because its
 * pinned label is the same element. The overlay sits outside `<table class="text-xs">`, hence the
 * explicit `text-xs`. */
export const MOBILE_TYPE_LABEL_CLASS =
  "flex items-center gap-1.5 cursor-pointer bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground whitespace-nowrap select-none";

/** Class list for one day-number header cell. */
export function dayHeaderClass(col: GridColumn): string {
  return [
    "border-b p-1 text-center font-normal whitespace-nowrap",
    col.isMonthStart ? "border-l" : "",
    col.isWeekend ? "bg-muted" : "",
    // Static — not animate-pulse. The body cells below breathe down the whole column (see
    // the template's wash div); this header cell deliberately doesn't, so the one thing
    // that's always on screen while scrolling isn't also the thing drawing the most
    // attention to itself every couple of seconds.
    col.isToday
      ? "relative z-10 bg-amber-400/15 ring-2 ring-amber-500/70 dark:bg-amber-400/20"
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Class list for one body date cell. */
export function dayCellClass(col: GridColumn): string {
  return [
    // align-middle (not flex + items-center): a plain <td> keeps the browser's native
    // table cell layout, which lays cells out side by side per row; giving one `display:
    // flex` instead makes the browser stop treating it as a table cell at all — confirmed
    // directly, every row silently stacked its ~90 cells top-to-bottom instead of left-to-
    // right, each row ballooning to (cell count × cell height) tall. `align-middle` is the
    // table-native way to vertically center a cell's content; the pill centers horizontally
    // via its own `mx-auto` (see the template) instead of needing flex here at all.
    // relative (not relative+isolate): needed as the containing block for the today wash
    // and the hover tooltip (both absolutely positioned — see the template), but isolating
    // *here* was the wrong level for containing the tooltip's z-index — it also trapped
    // the tooltip against *sibling cells* in the row below whenever it rendered downward
    // instead of upward (confirmed live: it disappeared behind the very next row once
    // hovering far enough down the grid that room-below beat room-above). That's now
    // handled once, correctly, by #bodyScroll's own explicit z-index in the template.
    "relative border-b p-0 align-middle",
    col.isMonthStart ? "border-l" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** How far right (in px, added on top of the header table's own overall `translateX`, and on
 * top of the `<span>`'s own natural position flush against the *left* edge of its `<th>` — see
 * the template's own comment on why that `<th>` is `text-left`, not centered) a month group's
 * label should slide. This is the same shape as native `position: sticky` with both `left` and
 * `right` set, computed by hand because the header table isn't actually scrolling — it's
 * translated by hand to mirror `#bodyScroll` (see the class doc comment) — so a *real* sticky
 * child of it would just sit inert, never engaging, for the exact reason `dayGridMirror` can't
 * live inside `#bodyScroll` either:
 *
 *  - The label's own "resting" position, with nothing scrolled near either of its edges yet,
 *    is centered in the month (`centerPx`, not the month's start) — "assumes its position at
 *    the center of the month" once released from either sticky edge.
 *  - While that resting position would render past the *right* edge of whatever's currently
 *    visible (`viewRight`, or the month's own end, whichever is nearer) — i.e. the month has
 *    only just started entering from the right, or is on its way back out through it — the
 *    label instead clamps flush against that edge, "following in from the right" as more of
 *    the month scrolls into view, rather than staying invisible/off-screen until the resting
 *    position itself becomes reachable. The mirror of the left-edge rule below: once less than
 *    one label's worth of the month's *leading* edge is visible, that clamp collapses onto the
 *    month's own start instead, so the label rides the leading edge in and out — sliding into
 *    position / being pushed away — exactly as the left side rides the trailing edge.
 *  - While that resting position would render past the *left* edge of what's visible (the
 *    month is on its way out, scrolled mostly past) — it clamps flush against that edge
 *    instead, "stays there" — until the clamp's own upper bound (the month's end, minus the
 *    label's width) drops below it too, meaning even hugging the month's own trailing edge
 *    has run out of room; from that point the label is genuinely leaving with the rest of the
 *    month's columns, "until the last of the month exits too".
 *
 * Both clamps are bounded by the month's own start/end (never the *next* month's real
 * columns, and never the previous one's) as well as by the viewport — whichever is tighter —
 * so the label never leaves its own month's box and slides naturally with scroll, clipped
 * only by the viewport; the <th>'s overflow-hidden is the backstop that keeps it from ever
 * bleeding into a neighbouring month, not the thing that eats it mid-slide. */
export function monthLabelShift(
  group: MonthGroup,
  view: { labelWidth: number | undefined; headerScrollLeft: number; bodyScrollWidth: number },
): number {
  const monthStartPx = group.startIndex * COL_W;
  const monthWidthPx = group.columns.length * COL_W;
  const monthEndPx = monthStartPx + monthWidthPx;
  const labelWidth = view.labelWidth ?? MONTH_LABEL_FALLBACK_RESERVE_PX;
  // +4px breathing room past the label's own measured width — flush against the exact edge
  // reads as "about to overflow" even when it technically isn't yet.
  const labelSpace = labelWidth + 4;
  const centerPx = monthStartPx + monthWidthPx / 2;
  const viewLeft = view.headerScrollLeft;
  const viewRight = viewLeft + view.bodyScrollWidth;

  const restingLeft = centerPx - labelWidth / 2;
  const stickyLeftEdge = Math.max(monthStartPx, viewLeft);
  // Floored at the month's own start, mirroring how stickyLeftEdge is naturally floored there.
  // Without it, the final min() below would push the label left of its own <th> whenever the
  // viewport's right clamp falls within labelSpace of the month's start: the label would pin
  // to the viewport edge and be clipped by the <th> ("covered") instead of riding the month's
  // leading edge in and out ("pushed away"), the way the trailing edge mirrors it on the left.
  const stickyRightEdge = Math.max(Math.min(monthEndPx, viewRight) - labelSpace, monthStartPx);
  const targetLeft = Math.min(Math.max(restingLeft, stickyLeftEdge), stickyRightEdge);
  return targetLeft - monthStartPx;
}
