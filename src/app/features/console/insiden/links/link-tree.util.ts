import type { SocialMediaLinkRow } from "../data/insiden-console.queries";
import { canNest } from "../../../insiden/data/link-thread-selection.util";

/** Width in pixels of ONE depth rail — which is also, because the rail STACK is
 *  the indent, the pixels a row is pushed right per level of conversation depth
 *  (see `depthRailsFor` and the URL cell's markup).
 *
 *  🔴 THIS NUMBER IS THE ONLY DEFINITION OF THE RAIL STEP, and the template binds
 *  it rather than restating it in a class: the rail span gets
 *  `[style.width.px]="depthIndentPx"` and the elbow the same width plus
 *  `[style.margin-left.px]="-depthIndentPx"` (the negative margin is what pulls
 *  the elbow back so its stub starts ON the last rail's own line instead of
 *  floating a rail-width to the right of it). A `w-5` on either span would render
 *  identically and be a SECOND place to change the geometry — which is exactly the
 *  drift this constant exists to prevent, and why `depthIndentPx` is read in the
 *  template at all.
 *
 *  WHY A RAIL AND NOT JUST PADDING. A bare `padding-left` reads as an indent
 *  only while the admin is looking at the gap beside the URL; the moment a
 *  conversation is three levels deep the offsets are a set of unrelated
 *  distances and nothing on the row says which link hangs under which. A vertical
 *  guide per ancestor level is the one cue that survives scanning, and it is
 *  drawn from the same number the padding was, so the two cannot disagree — the
 *  rails REPLACED `[style.padding-left.px]` rather than joining it.
 *
 *  ⚠️ AND A FLAT ARITHMETIC SCALE, not a Tailwind class per level, for the same
 *  reason the old padding used one: the store bounds nesting at
 *  `MAX_THREAD_DEPTH`, but a hand-edited row can be deeper than any ladder of
 *  classes, and an out-of-ladder row must still render NESTED rather than snapping
 *  back to column zero and reading as a root. `@for` over an array of the row's
 *  depth renders an unbounded number of rails; a class ladder cannot. */
export const DEPTH_INDENT_PX = 20;

/** A decimal id, the shape every link id in this feature has (GraphQL `ID`
 *  serialised from an integer primary key). Used by the tie-break below to tell a
 *  numeric key from a non-numeric one rather than trusting `Number()`. */
const DECIMAL_ID = /^\d+$/;

/** A row's siblings grouped by `parentId` (`null` = the root run), each run in the
 *  STORED order. The one map a sibling run is built from; see the queue component. */
export type LinkRuns = Map<string | null, SocialMediaLinkRow[]>;

/**
 * The order ONE SIBLING RUN is in: `position` ASC, then `id` ASC. Total, and
 * never the array's own order.
 *
 * WHY THIS IS THE WHOLE RULE: `reorderSocialMediaLinks` is a PERMUTATION of one
 * existing sibling set (backend `social_link_threads.py::_reorder_sync` — it
 * renumbers the ids it is given to `10, 20, 30, …` from the ORDER THEY ARRIVE IN
 * and leaves every sibling it was not told about after them), so the list this
 * comparator orders IS the list the server writes. A run taken from the queue's
 * arrival order is a different ordering, and the first move would write the
 * feed's `occurredAt DESC, id DESC` timeline over a conversation the backend
 * assembled oldest-first — arriving, here, reversed.
 *
 * 🔴 WHY `id` IS A REQUIRED SECOND KEY, not a nicety: every structural write
 * renumbers a run to the exact `10, 20, 30, …` series, EXCEPT ungrouping —
 * backend `_ungroup_sync` writes `parent` ONLY ("inventing a root order nobody
 * asked for is a presentation change disguised as a repair"), so a promoted link
 * keeps the number it held under its old parent and can TIE with a root that
 * already holds it. A root's `parentId` is `null`, so every root is a sibling of
 * every other root and the ROOT run is where the collision is observable. A sort
 * on `position` alone leaves that to the engine's sort stability, i.e. to the
 * arrival order — which is the very thing this comparator exists to stop.
 *
 * The id comparison mirrors the backend's own `(position, pk)` (see
 * `schema/loaders.py::batch_load_sublink_subtrees`, which is what renders
 * `sublinks`), so a tie resolves the way the nested list is DRAWN rather than
 * lexicographically — `"10"` would otherwise sort before `"9"`. Anything that is
 * not a decimal id falls back to a code-unit compare, which is still total: the
 * requirement is determinism, not numeric semantics.
 *
 * The `typeof` coercions below keep the comparison ANTISYMMETRIC over a payload
 * that dropped the key, so a sort can never produce `NaN` from it — they do not
 * decide anything. `position` is a required `number` here, and `runOrderIsKnown`
 * refuses the whole run while any sibling lacks one, so no consumer of a sorted run
 * can act on a row that landed by the fallback. It is spelled exactly as the
 * profile surface's copy on purpose: the two components cannot share a module, and
 * a rule written down twice has to be written down the same way twice.
 */
export function compareStoredSequence(a: SocialMediaLinkRow, b: SocialMediaLinkRow): number {
  const leftPosition = typeof a.position === "number" ? a.position : 0;
  const rightPosition = typeof b.position === "number" ? b.position : 0;
  if (leftPosition !== rightPosition) {
    return leftPosition - rightPosition;
  }
  if (DECIMAL_ID.test(a.id) && DECIMAL_ID.test(b.id)) {
    const left = Number(a.id);
    const right = Number(b.id);
    if (left !== right) {
      return left - right;
    }
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Every loaded row grouped by the id of its PARENT, each group in the STORED
 *  order — `position` ASC with `id` as the tie-break (`compareStoredSequence`).
 *  The `null` key is the ROOT RUN: `parentId ?? null` normalises a payload that
 *  omitted the key, so a real root and a row with an absent `parentId` land in
 *  ONE group instead of two, exactly as they must for `siblingsOf`.
 *
 *  ONE MAP, THREE READERS, so the sequence can only be defined once: the
 *  accordion's child runs, `siblingsOf`'s run (the same array — a row's
 *  siblings ARE its parent's children), and `childCountOf`'s count. The groups
 *  are built fresh here and sorted in place, so the in-place `sort` cannot touch
 *  the `links` signal's own array; the returned arrays are MEMOISED and shared,
 *  so a caller must copy before it reorders one (`reorderSiblings` does). */
export function groupRunsByParentId(links: readonly SocialMediaLinkRow[]): LinkRuns {
  const runs: LinkRuns = new Map();
  for (const link of links) {
    const key = link.parentId ?? null;
    const run = runs.get(key);
    if (run) {
      run.push(link);
    } else {
      runs.set(key, [link]);
    }
  }
  for (const run of runs.values()) {
    run.sort(compareStoredSequence);
  }
  return runs;
}

/** The direct children of `parentId`, in the STORED order. `parentId` is the
 *  node's OWN id when asking for a row's children, and its `parentId ?? null`
 *  when asking for a row's sibling run. */
export function runFor(runs: LinkRuns, parentId: string | null): SocialMediaLinkRow[] {
  return runs.get(parentId) ?? [];
}

/** Each loaded row's depth, computed by walking its `parentId` chain INSIDE the
 *  loaded set.
 *
 *  The walk is bounded and cannot loop: it stops as soon as a `parentId` is not a
 *  loaded row, and also on any id it has already visited, so hand-edited cyclic
 *  data renders as "not nested" instead of hanging the queue. The store's
 *  `MAX_THREAD_DEPTH` caps what can legitimately exist and this does not rely on
 *  it: a chain deeper than any ladder of classes still indents.
 *
 *  🔴 A ROW WHOSE PARENT IS NOT IN THE LOADED SET IS TREATED AS A ROOT (depth 0),
 *  and that is the rule for every case a filter causes — search for a phrase and
 *  a sublink's parent is not in the result, so the sublink shows up flush with
 *  the roots. The alternatives (indenting by a depth that cannot be derived, or
 *  leaving a gap where an invisible parent would be) would render a hierarchy
 *  the payload does not contain and make a filtered queue look like a corrupted
 *  one. Every structural action a row offers is scoped to the loaded set anyway,
 *  so the flattened depth costs nothing but an indentation.
 *
 *  Depth is a function of the `parentId` CHAIN and nothing else, which is why it
 *  needs no ordering at all: no sequence of moves can change a row's depth, so
 *  the indentation, the sibling run and the reorder payload cannot come to
 *  disagree about it. (The run is ordered by `position` — see `siblingsOf` — and
 *  the DISPLAY order is still the queue's `occurredAt DESC, id DESC`; three
 *  orderings, each with one job.) */
export function computeDepths(links: readonly SocialMediaLinkRow[]): Map<string, number> {
  const byId = new Map(links.map((link) => [link.id, link]));
  const depths = new Map<string, number>();
  for (const link of links) {
    const visited = new Set<string>([link.id]);
    let depth = 0;
    let cursorId = link.parentId;
    while (cursorId && byId.has(cursorId) && !visited.has(cursorId)) {
      visited.add(cursorId);
      depth += 1;
      cursorId = byId.get(cursorId)?.parentId ?? null;
    }
    depths.set(link.id, depth);
  }
  return depths;
}

/** One entry per ancestor level, so the URL cell can draw that many vertical
 *  rails with `@for (rail of depthRails; track $index)`.
 *
 *  `Array.from({ length }, …)` rather than a fixed ladder of classes, for the
 *  unbounded-depth reason on `DEPTH_INDENT_PX`: a hand-edited chain deeper than
 *  any class ladder still draws a rail per level instead of snapping back to
 *  column zero and reading as a root. A depth-0 row gets an empty array and
 *  therefore no rail and no elbow at all, which is what makes a root look
 *  like a root. */
export function depthRailsFor(depth: number): number[] {
  return Array.from({ length: depth }, (_unused, index) => index);
}

/** A row's direct children, in the STORED order. The chevron's gate: a row is a
 *  PARENT iff it has LOADED children, which is the rule the whole accordion
 *  hangs on — see `renderedLinksOf`.
 *
 *  ⚠️ LOADED, NOT `sublinkCount`. The two answer different questions and only one
 *  of them can drive rendering: a filtered page can hold a row whose descendants
 *  exist but are not in the result, and `sublinkCount > 0` would then draw a
 *  chevron that expands to nothing. Conversely `sublinkCount: 0` with a loaded
 *  child is hand-edited data, and refusing to draw the chevron would strand a
 *  child that the payload does contain — unreachable from the queue entirely.
 *  `sublinkCount` still owns the CHIP, which is a statement about the whole
 *  conversation including rows this page cannot show. */
export function childCountOf(runs: LinkRuns, link: SocialMediaLinkRow): number {
  return runFor(runs, link.id).length;
}

/** The row's sibling RUN: every loaded row sharing its `parentId`, in the STORED
 *  order — `position` ASC, `id` as the tie-break (see `compareStoredSequence` for
 *  why the second key is not optional).
 *
 *  THIS ARRAY IS THE CONTRACT, and it is deliberately the ONLY place a run is
 *  read: the reorder payload, the move index and the "already first / already
 *  last" reasons all read off it, so they cannot disagree with each other — and
 *  so it can be the SAME array the accordion expands, because a row's siblings
 *  are exactly its parent's children. It is NOT the order the top of the table
 *  renders — that stays the queue's `occurredAt DESC, id DESC`, and a run
 *  permuted in the arrival order would write the queue's triage ordering as the
 *  conversation's sequence.
 *
 *  ⚠️ It is memoised and SHARED (it comes out of `groupRunsByParentId`), so a
 *  caller that reorders it must copy first. `reorderSiblings` does. */
export function siblingsOf(runs: LinkRuns, link: SocialMediaLinkRow): SocialMediaLinkRow[] {
  return runFor(runs, link.parentId ?? null);
}

/** Can the STORED order of this row's run be read at all? False as soon as any
 *  sibling came back without a `position`.
 *
 *  🔴 A MISSING `position` IS NOT ZERO and must not be sorted as if it were. The
 *  column is gap-spaced (`10, 20, 30, …`), so `0` is not "before 10" — it is only
 *  the model's own default for a row written outside `save()`. A `?? 0` fallback
 *  would float the unknown row to the head of the conversation and then WRITE
 *  that as the stored sequence: a silent, permanent overwrite of an order nobody
 *  read. Refusing is the same discipline as `queueIsComplete` — a precondition this
 *  table cannot prove means no call, and the reason is stated rather than swallowed.
 *
 *  A `typeof` check, and deliberately not a type-driven one: `position` is a
 *  required `number` on the row type, so this guards a payload that omitted the
 *  key anyway (a stale cache, a host that stopped selecting it) — and
 *  `strictNullChecks` is off, so the compiler would never report it. The profile
 *  surface's identical check is load-bearing for real there, where the field is
 *  genuinely optional. */
export function runOrderIsKnown(runs: LinkRuns, link: SocialMediaLinkRow): boolean {
  return siblingsOf(runs, link).every((row) => typeof row.position === "number");
}

/** The row's own index in its sibling run — in the STORED order, because that is
 *  what `siblingsOf` returns — or -1 if it is not in the run (a row re-fetched out
 *  from under a click). Every move decision below is an index test against this
 *  one array, which is what keeps a button's enabled state and the payload that
 *  button produces in agreement. */
export function siblingIndexOf(runs: LinkRuns, link: SocialMediaLinkRow): number {
  return siblingsOf(runs, link).findIndex((row) => row.id === link.id);
}

/** Offered at every row except the head of its run. A one-row run disables both
 *  directions, which is the common case for an ungrouped link: there is no
 *  sequence to put it in. */
export function canMoveUp(
  runs: LinkRuns,
  link: SocialMediaLinkRow,
  queueIsComplete: boolean,
): boolean {
  return queueIsComplete && runOrderIsKnown(runs, link) && siblingIndexOf(runs, link) > 0;
}

/** Offered at every row except the tail of its run — the mirror of `canMoveUp`,
 *  kept as its own function so the template never computes an index to decide a
 *  disabled state. */
export function canMoveDown(
  runs: LinkRuns,
  link: SocialMediaLinkRow,
  queueIsComplete: boolean,
): boolean {
  if (!queueIsComplete || !runOrderIsKnown(runs, link)) {
    return false;
  }
  const index = siblingIndexOf(runs, link);
  return index >= 0 && index < siblingsOf(runs, link).length - 1;
}

/** Why a sequence action is off, as copy for the disabled button's tooltip, or
 *  `null` when it IS available — so the template binds the title straight through
 *  and never restates any of the conditions. Three reasons, and every one of them
 *  is a silent-failure trap, which is why a disabled button says which it is.
 *
 *  ⚠️ The `!queueIsComplete` reason below is now DEFENSIVE, not rendered: while
 *  the queue is filtered the buttons are not drawn at all (see `queueIsComplete`).
 *  It is kept because this is a total function of the row — a programmatic caller
 *  or a future template that wants to show a disabled button again gets the honest
 *  reason instead of a `null` title on a control that cannot work. */
export function moveBlockedReason(
  runs: LinkRuns,
  link: SocialMediaLinkRow,
  direction: "up" | "down",
  queueIsComplete: boolean,
): string | null {
  if (!queueIsComplete) {
    return "Reordering needs every link loaded — a filtered page may be missing siblings of this link, and a partial sequence would push the hidden ones to the end of the conversation. Use “Show all links”.";
  }
  if (!runOrderIsKnown(runs, link)) {
    // Direction-agnostic on purpose: the whole run is unorderable, so neither of
    // its ends can honestly be named — "already first" would be a claim about an
    // order this queue cannot read.
    return "Can't reorder this conversation yet: one of these links arrived without its stored order (`position`), so the sequence they are in is unknown and reordering it would write a guess.";
  }
  const index = siblingIndexOf(runs, link);
  const atEnd =
    direction === "up" ? index <= 0 : index < 0 || index >= siblingsOf(runs, link).length - 1;
  if (!atEnd) {
    return null;
  }
  return direction === "up"
    ? "Already first among the links sharing this parent."
    : "Already last among the links sharing this parent.";
}

/** May the ticked rows be nested under this row? ONE tick is enough — see `canNest`
 *  for why the target mode differs from the no-target grouping minimum. The target
 *  itself being ticked stays a cycle the server rejects wholesale, so it is refused
 *  here rather than sent. */
export function canNestUnder(selectedIds: readonly string[], link: SocialMediaLinkRow): boolean {
  return canNest(selectedIds) && !selectedIds.includes(link.id);
}

/** Why Nest-under is off, or `null` when it is available. Both reasons are
 *  things the server would REJECT THE WHOLE CALL for, so the copy names them
 *  rather than showing a dead button. */
export function nestBlockedReason(
  selectedIds: readonly string[],
  link: SocialMediaLinkRow,
): string | null {
  if (selectedIds.includes(link.id)) {
    return "This link is ticked too — nesting a selection under one of its own links is a cycle, and the whole call is rejected.";
  }
  if (!canNest(selectedIds)) {
    return "Tick a link first — the ticked links become the direct children of this one.";
  }
  return null;
}

/** The rows the accordion actually draws, in display order.
 *
 *  THE RULE, in one sentence: a row is rendered iff it has no loaded parent, or
 *  every loaded ancestor of it is expanded.
 *
 *  How that falls out of the code, and why it is written as a walk rather than
 *  as a per-row predicate: the top-level pass SKIPS a row iff its DIRECT parent
 *  is loaded — such a row is emitted by the recursion below, from its parent's
 *  own position, so "directly beneath it" is structural rather than something a
 *  flat filter has to reconstruct. Recursion then emits each open row's children
 *  in the STORED order, so a child of a collapsed row is never reached at all.
 *  That is also why the order is: root order first (the queue's unchanged
 *  `occurredAt DESC, id DESC` arrival order — the triage order is NOT the
 *  conversation order, and only the second one is the accordion's business),
 *  then each root's expanded subtree, then the next root.
 *
 *  🔴 A ROW THE WALK CANNOT PLACE IS STILL RENDERED — and the two reasons a row
 *  is missing from `rendered` have to be told APART, or the safety net undoes the
 *  accordion it is protecting. A row is unemitted either because a COLLAPSED
 *  ancestor is hiding it (the whole point) or because nothing can reach it:
 *  hand-edited or migrated data can be cyclic (`a → b → a`), and then every row of
 *  the cycle has a loaded parent, so the top-level pass skips them all and the
 *  recursion never starts. A queue that has silently swallowed rows is far worse
 *  than one that shows them untidily — an admin cannot act on a link they cannot
 *  see. So the net appends only the UNREACHABLE ones — AFTER everything the walk
 *  placed, in their relative arrival order, because there is no parent position to put
 *  them at; appending a merely-COLLAPSED child would be worse than
 *  the bug it guards, because it would draw a closed conversation in full.
 *  `hiddenByCollapse` is exactly that distinction.
 *
 *  Duplicates are impossible (`emitted` gates both the recursion and this loop),
 *  and the walk cannot hang: `emit` returns on an id it has already placed, which
 *  is also what bounds the cycle. `hiddenByCollapse`'s ancestor walk is bounded by
 *  the same visited-set rule `computeDepths` uses, so a cycle terminates there too. */
export function renderedLinksOf(
  links: readonly SocialMediaLinkRow[],
  expandedIds: ReadonlySet<string>,
  runs: LinkRuns,
): SocialMediaLinkRow[] {
  const loadedIds = new Map(links.map((link) => [link.id, link]));
  const rendered: SocialMediaLinkRow[] = [];
  const emitted = new Set<string>();

  const emit = (link: SocialMediaLinkRow): void => {
    if (emitted.has(link.id)) {
      return;
    }
    emitted.add(link.id);
    rendered.push(link);
    if (!expandedIds.has(link.id)) {
      return;
    }
    for (const child of runFor(runs, link.id)) {
      emit(child);
    }
  };

  for (const link of links) {
    const parentId = link.parentId ?? null;
    if (parentId !== null && loadedIds.has(parentId)) {
      continue;
    }
    emit(link);
  }

  /** Is this row merely HIDDEN — i.e. is some rendered ancestor of it CLOSED —
   *  as opposed to unreachable? Bounded and cycle-safe, by the same rule as
   *  `computeDepths`.
   *
   *  ⚠️ The test is "emitted AND closed", never just "closed". A collapsed
   *  ancestor that the walk never emitted (which is the case for every node
   *  inside a closed conversation) must NOT count: under the plain test, closing
   *  a conversation would hand the safety net every one of its descendants and
   *  the accordion would draw a closed conversation in full. Walking to the TOP
   *  of the chain and asking only about rows the walk actually placed gets both
   *  cases right — a closed ancestor is always somewhere above, even when the
   *  intermediate nodes were themselves never reached. */
  const hiddenByCollapse = (link: SocialMediaLinkRow): boolean => {
    const visited = new Set<string>([link.id]);
    let cursorId: string | null = link.parentId ?? null;
    while (cursorId && loadedIds.has(cursorId) && !visited.has(cursorId)) {
      if (emitted.has(cursorId) && !expandedIds.has(cursorId)) {
        return true;
      }
      visited.add(cursorId);
      cursorId = loadedIds.get(cursorId)?.parentId ?? null;
    }
    return false;
  };

  for (const link of links) {
    if (!emitted.has(link.id) && !hiddenByCollapse(link)) {
      rendered.push(link);
    }
  }
  return rendered;
}
