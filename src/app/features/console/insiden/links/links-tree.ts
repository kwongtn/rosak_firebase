import { computed, signal, type Signal } from "@angular/core";
import type { SocialMediaLinkRow } from "../data/insiden-console.queries";
import {
  areAllSelected,
  canGroup,
  canNest,
  selectedWithin,
  toggleSelection,
} from "../../../insiden/data/link-thread-selection.util";
import * as linkTree from "./link-tree.util";

/**
 * The links queue's selection and conversation tree over the loaded rows: the ticked ids, the
 * accordion's open rows and rendered order, each row's depth and sibling run, and the per-row
 * answers the sequence and nesting verbs are gated on (`link-tree.util.ts` holds the rules).
 * `queueIsComplete` is the queue's flag that the loaded rows are the whole table.
 */
export function useLinksTree(
  links: Signal<SocialMediaLinkRow[]>,
  queueIsComplete: Signal<boolean>,
) {
  /** Rows ticked for the group action. Built ONLY through `toggleSelection` from
   *  `link-thread-selection.util.ts` and never by concatenation, because that
   *  module's contract is what makes this safe to feed straight back into a
   *  signal: every helper returns a NEW array, and a duplicate id (or a blank
   *  one) is a hard rejection server-side (`[ID!]!` plus an explicit repeat
   *  check).
   *
   *  The selection deliberately SURVIVES a refetch — narrowing a filter is not an
   *  intent to forget — so every mutation scopes it to `visibleLinkIds` before
   *  sending. Without that, ticking three rows, narrowing the search and hitting
   *  Group would post ids the admin can no longer see, and the all-or-nothing
   *  rejection would read as a plain "grouping failed". */
  const selectedIds = signal<string[]>([]);

  /** Every LOADED row's id, collapsed children included — the scope of every
   *  grouping mutation. 🔴 NOT the rendered set: see the accordion note in the
   *  `SocialMediaLinksComponent` docstring. Collapsing a conversation is a view gesture, and a mutation
   *  scoped to what happens to be open would quietly drop the admin's own ticks. */
  const visibleLinkIds = computed(() => links().map((link) => link.id));

  const selectedCount = computed(() => selectedIds().length);

  /** At least TWO links. Delegated to `canGroup` rather than re-derived, so the
   *  "a one-link thread is a no-op that renders as a thread" rule lives in
   *  exactly one place — the one the profile surface's grouping UI also reads. */
  const canGroupSelection = computed(() => canGroup(selectedIds()));

  /** Is there any payload at all to nest? ONE tick is enough (see `canNest`), and
   *  this is the ROW-BUTTON's gate rather than the per-row one.
   *
   *  🔴 WHY THE PER-ROW BUTTON IS DRAWN ONLY PAST THIS POINT, while the toolbar's
   *  "Group into thread" stays permanently visible and merely disabled. Two
   *  buttons that are dead on every row of an untouched queue are read as broken,
   *  not as unavailable — and nesting is the one tree-building verb an admin uses
   *  on a SINGLE link, so it is the one that has to look ready. The toolbar hint
   *  already spells out the gate ("Tick a link to nest it under another"), so the
   *  affordance appears with the first tick and the discovery cost is the one
   *  sentence already on screen.
   *
   *  `canNestUnder` (per row) stays the authority on whether a PARTICULAR row can
   *  be the target: a row inside the selection is a cycle the server rejects
   *  wholesale, so once a selection exists the button is drawn there too — disabled,
   *  with that reason on hover. Hidden-until-ticked is not hidden-forever-disabled. */
  const nestSelectionReady = computed(() => canNest(selectedIds()));

  /** The rows the ACCORDION is currently showing — `links()` minus every row
   *  whose loaded ancestors are all collapsed. This is what Select-all and the
   *  header's checked state read, so a closed conversation is never half-ticked
   *  from under the admin; see the `SocialMediaLinksComponent` docstring for why the MUTATIONS still
   *  scope to `visibleLinkIds`. */
  const renderedLinkIds = computed(() => renderedLinks().map((link) => link.id));

  /** Drives the header Select-all checkbox. False over an empty page on purpose
   *  (see `areAllSelected`). */
  const allVisibleSelected = computed(() => areAllSelected(selectedIds(), renderedLinkIds()));

  /* ---- Icon-only row verbs: the hover copy ------------------------------- */

  /** 🔴 THE HOVER/AT HELP COPY, DECLARED ONCE EACH, and that is the whole point of
   *  this block. The three tree verbs are icon-only buttons (see the action cell),
   *  so a label can no longer be read off the button's own text: an icon has to
   *  carry its meaning in `aria-label` AND `title`, and those two are set from the
   *  SAME field precisely so a screen reader and a mouse user cannot be told
   *  different things by a copy change. Literal strings in the template would drift
   *  the moment one of the two was edited.
   *
   *  Each is the `?? ` FALLBACK of its button's title — what the tooltip says when
   *  the action is AVAILABLE. The blocked case is the other branch of the same
   *  binding and it stays a `null`-returning method (`moveBlockedReason`,
   *  `nestBlockedReason`), because the reason is per ROW and per QUEUE STATE while
   *  this is constant. */
  const moveUpHelp = "Move this link one place earlier in the conversation.";
  const moveDownHelp = "Move this link one place later in the conversation.";
  const nestHelp = "Nest the ticked links under this one.";

  /* ---- Hierarchy: depth, sequence, nesting ------------------------------- */

  /** Each loaded row's depth, computed by walking its `parentId` chain inside the
   *  loaded set — see `computeDepths` for the walk and its cycle safety. A method
   *  rather than a per-row signal: the map behind it is one computed over the
   *  whole queue, and the template asks once per row. */
  const _depths = computed(() => linkTree.computeDepths(links()));

  function depthOf(link: SocialMediaLinkRow): number {
    return _depths().get(link.id) ?? 0;
  }

  /** The width of ONE rail, which the template BINDS rather than restates; see
   *  `DEPTH_INDENT_PX` for why the rail step is a single definition. */
  const depthIndentPx = linkTree.DEPTH_INDENT_PX;

  /** One entry per ancestor level, so the URL cell can draw that many vertical
   *  rails. `depthRailsFor` is the pure helper; the depth still has exactly one
   *  definition in `_depths`. */
  function depthRails(link: SocialMediaLinkRow): number[] {
    return linkTree.depthRailsFor(depthOf(link));
  }

  /* ---- Hierarchy: the accordion ---------------------------------------- */

  /** Which conversations are open. COLLAPSED BY DEFAULT (an empty set), the same
   *  rule and the same reason as the public feed's `app-link-thread`: a triage
   *  queue is read for its newest rows, and nobody should have to close a
   *  conversation before reading it.
   *
   *  IMMUTABLE UPDATES ARE LOAD-BEARING, not hygiene: a signal compares by
   *  reference, so an in-place `add`/`delete` would produce the SAME `Set`, change
   *  detection would never fire, and the chevron would stop responding. Every
   *  toggle therefore copies (see `toggleExpanded`).
   *
   *  It is keyed by id and deliberately SURVIVES a refetch: ids are stable across
   *  reloads, so a conversation the admin opened stays open through the reload a
   *  grouping or a reorder triggers — collapsing it under them mid-write would be
   *  the one thing the accordion could not plausibly explain. An id that no longer
   *  exists is simply inert. */
  const expandedIds = signal<ReadonlySet<string>>(new Set<string>());

  /** Open/close one conversation. A NEW set every call, for the reason above. */
  function toggleExpanded(id: string): void {
    const next = new Set(expandedIds());
    if (!next.delete(id)) {
      next.add(id);
    }
    expandedIds.set(next);
  }

  function isExpanded(id: string): boolean {
    return expandedIds().has(id);
  }

  /** Every loaded row grouped by the id of its PARENT, each group in the STORED
   *  order — the ONE map a sibling run is built from (`groupRunsByParentId`). */
  const _runsByParentId = computed(() => linkTree.groupRunsByParentId(links()));

  /** A row's direct children, in the STORED order. The chevron's gate: a row is a
   *  PARENT iff it has LOADED children (`childCountOf`). */
  function childCountOf(link: SocialMediaLinkRow): number {
    return linkTree.childCountOf(_runsByParentId(), link);
  }

  /** The rows the accordion actually draws, in display order — see
   *  `renderedLinksOf` for the walk and its cycle safety net. */
  const renderedLinks = computed<SocialMediaLinkRow[]>(() =>
    linkTree.renderedLinksOf(links(), expandedIds(), _runsByParentId()),
  );

  /** Offered at every row except the head of its run (`canMoveUp`). */
  function canMoveUp(link: SocialMediaLinkRow): boolean {
    return linkTree.canMoveUp(_runsByParentId(), link, queueIsComplete());
  }

  /** Offered at every row except the tail of its run (`canMoveDown`). */
  function canMoveDown(link: SocialMediaLinkRow): boolean {
    return linkTree.canMoveDown(_runsByParentId(), link, queueIsComplete());
  }

  /** Why a sequence action is off, or `null` when it IS available (`moveBlockedReason`). */
  function moveBlockedReason(link: SocialMediaLinkRow, direction: "up" | "down"): string | null {
    return linkTree.moveBlockedReason(_runsByParentId(), link, direction, queueIsComplete());
  }

  /** May the ticked rows be nested under this row? ONE tick is enough (`canNestUnder`). */
  function canNestUnder(link: SocialMediaLinkRow): boolean {
    return linkTree.canNestUnder(selectedIds(), link);
  }

  /** Why Nest-under is off, or `null` when it is available (`nestBlockedReason`). */
  function nestBlockedReason(link: SocialMediaLinkRow): string | null {
    return linkTree.nestBlockedReason(selectedIds(), link);
  }

  /* ---- Multi-select + conversation grouping ---------------------------- */

  /** One row's checkbox. Routed through the shared helper because the result is
   *  written straight back into a signal: an in-place `push`/`splice` would
   *  produce the SAME array reference, change detection would never fire, and
   *  the checkbox would silently stop responding. */
  function toggleRowSelection(id: string): void {
    selectedIds.set(toggleSelection(selectedIds(), id));
  }

  /** The header checkbox. REPLACES the selection with every RENDERED row, or clears
   *  it when they are all already selected — a replacement, never a merge, so repeated
   *  clicks can't accumulate a hidden selection from a previous filter. Stays unchecked
   *  over an empty page: "select all" of nothing is a lie, and an invitation to post an
   *  empty selection.
   *
   *  🔴 REPLACING MEANS COLLAPSING CAN DROP TICKS. Tick a conversation's children, close
   *  it, then press Select-all: those hidden ticks are gone, because the rendered set no
   *  longer contains them. That is deliberate — a checkbox is a statement about what is on
   *  screen, and preserving ticks the admin cannot see would make the header read
   *  "all selected" over a list it does not describe. It is also the exact OPPOSITE of
   *  `scopedSelection`, which scopes to every loaded row so a collapse cannot discard a
   *  decision already made: a mutation is about what they had already decided. */
  function toggleSelectAll(): void {
    selectedIds.set(allVisibleSelected() ? [] : [...renderedLinkIds()]);
  }

  function clearSelection(): void {
    selectedIds.set([]);
  }

  /** The selection scoped to the LOADED rows, blanks dropped. Applied by BOTH group
   *  verbs before anything is sent: `linkIds` is `[ID!]!`, so an empty element is a
   *  hard validation error, and the server rejects the whole call if one id is not
   *  the admin's to touch — an id filtered out would make every grouping action
   *  fail for no visible reason.
   *
   *  ⚠️ NOT `renderedLinkIds`. The accordion can hide a loaded row the admin
   *  already ticked (open a conversation, tick two children, close it again), and
   *  scoping to the rendered set would silently drop those two from the payload —
   *  a collapse reading as "those links are no longer selected". Collapsing is a
   *  view gesture; the selection outlives it. */
  function scopedSelection(): string[] {
    return selectedWithin(selectedIds(), visibleLinkIds()).filter(Boolean);
  }

  return {
    selectedIds,
    visibleLinkIds,
    selectedCount,
    canGroupSelection,
    nestSelectionReady,
    renderedLinkIds,
    allVisibleSelected,
    moveUpHelp,
    moveDownHelp,
    nestHelp,
    depthOf,
    depthIndentPx,
    depthRails,
    expandedIds,
    toggleExpanded,
    isExpanded,
    runsByParentId: _runsByParentId,
    childCountOf,
    renderedLinks,
    canMoveUp,
    canMoveDown,
    moveBlockedReason,
    canNestUnder,
    nestBlockedReason,
    toggleRowSelection,
    toggleSelectAll,
    clearSelection,
    scopedSelection,
  };
}

export type LinksTree = ReturnType<typeof useLinksTree>;
