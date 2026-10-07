import { DatePipe } from "@angular/common";
import { Component, computed, inject, signal } from "@angular/core";
import { AuthService } from "../../../../core/auth/auth.service";
import { graphqlResource, GraphQLClient } from "../../../../core/graphql/graphql-client";
import { ToastService } from "../../../../ui/toast/toast.service";
import { HlmBadge } from "../../../../ui/badge/badge";
import { HlmButton } from "../../../../ui/button/button";
import { HlmCardImports } from "../../../../ui/card/card";
import { ErrorBoxComponent } from "../../../../ui/error-box/error-box";
import { HlmInput } from "../../../../ui/input/input";
import { HlmSheet, HlmSheetBody, HlmSheetFooter, HlmSheetHeader } from "../../../../ui/sheet/sheet";
import { HlmSkeleton } from "../../../../ui/skeleton/skeleton";
import { HlmTableImports } from "../../../../ui/table/table";
import { AppNavComponent } from "../../../../shell/app-nav/app-nav.component";
import { AppFooterComponent } from "../../../../shell/app-footer/app-footer.component";
import { ConsoleNavComponent } from "../../console-nav.component";
import { LinkQueueRowComponent } from "./link-queue-row.component";
import { LinksFilterBarComponent } from "./links-filter-bar.component";
import { LinksSelectionToolbarComponent } from "./links-selection-toolbar.component";
import {
  categoryOptionsOf,
  filterStationOptionsOf,
  filterVehicleOptionsOf,
  indexCategoriesById,
  indexLinesById,
  indexStationsById,
  indexVehiclesById,
  lineOptionsOf,
  stationOptionsOf,
  vehicleOptionsOf,
  vehicleParentCodesOf,
} from "./link-reference.util";
import {
  appliedFiltersAreUnfiltered,
  queueQueryVars,
  type AppliedQueueFilters,
  type CompletedFilter,
} from "./link-queue-filter.util";
import {
  AssetMultiSelectComponent,
  type AssetMultiSelectOption,
} from "../../../insiden/asset-multi-select/asset-multi-select.component";
import {
  INSIDEN_REFERENCE_QUERY,
  type InsidenReferenceQueryData,
} from "../../../insiden/data/insiden.queries";
import {
  CONSOLE_CATEGORIES_QUERY,
  ConsoleCategoriesQueryData,
  DELETE_SOCIAL_MEDIA_LINK_MUTATION,
  DeleteSocialMediaLinkData,
  DeleteSocialMediaLinkVars,
  MARK_LINK_COMPLETED_MUTATION,
  MarkLinkCompletedData,
  MarkLinkCompletedVars,
  SOCIAL_MEDIA_LINKS_QUERY,
  SocialMediaLinkRow,
  SocialMediaLinksQueryData,
  SocialMediaLinksQueryVars,
  UPDATE_SOCIAL_MEDIA_LINK_MUTATION,
  UpdateSocialMediaLinkData,
  UpdateSocialMediaLinkVars,
} from "../data/insiden-console.queries";
import {
  SEARCH_DEBOUNCE_MS,
  createTrailingDebounce,
  searchTermOrUndefined,
} from "../data/search-debounce.util";
import { isSameMinute } from "../data/same-minute.util";
import { linkStatusInput } from "../data/link-status-input.util";
import {
  isoToOccurredAtInput,
  occurredAtInputToIso,
} from "../../../insiden/data/link-occurred-at.util";
import {
  areAllSelected,
  canGroup,
  canNest,
  selectedWithin,
  threadLabel,
  toggleSelection,
} from "../../../insiden/data/link-thread-selection.util";
import {
  DEPTH_INDENT_PX,
  canMoveDown,
  canMoveUp,
  canNestUnder,
  childCountOf,
  computeDepths,
  depthRailsFor,
  groupRunsByParentId,
  moveBlockedReason,
  nestBlockedReason,
  renderedLinksOf,
  runOrderIsKnown,
  siblingsOf,
} from "./link-tree.util";
import {
  GROUP_SOCIAL_MEDIA_LINKS_MUTATION,
  GroupSocialMediaLinksData,
  GroupSocialMediaLinksVars,
  REORDER_SOCIAL_MEDIA_LINKS_MUTATION,
  ReorderSocialMediaLinksData,
  ReorderSocialMediaLinksVars,
  UNGROUP_SOCIAL_MEDIA_LINKS_MUTATION,
  UngroupSocialMediaLinksData,
  UngroupSocialMediaLinksVars,
} from "../../../insiden/data/social-links.queries";
import type { SocialMediaLinkStatus } from "../../../home/data/home.queries";

/**
 * /console/links — triage queue for crowd-submitted social media
 * posts (its component still lives under `console/insiden/links/`; only the
 * URL moved, and `/console/insiden/links` redirects here).
 * Text search (URL + title, matched server-side) is debounced; the
 * category dropdown and the All/Pending/Completed status select refetch
 * immediately. The line/vehicle/station selects and the occurred-between
 * date range also refetch through the same trailing debounce (they map to the
 * backend resolver's `lineId`/`vehicleId`/`stationId`/`occurredAfter`/
 * `occurredBefore` args) — and, per the spec, the queue defaults to the
 * PENDING (not-completed) filter, with All/Completed still reachable.
 *
 * TWO CLOCKS, ON PURPOSE. The queue is sorted on the EVENT instant
 * (`occurredAt`, `-occurredAt, -id`) and the range filter windows the same
 * column, but an admin moderates against the REPORT instant (`created`) — "how
 * long has this been sitting un-reviewed" is a `created` question, and "is this
 * report back-dated" is an `occurredAt` one. So the cell shows BOTH instants,
 * the event one on a second, quieter line under the report one and labelled in
 * full (`Occurred Aug 1, 2026 08:30`) rather than by position or a tooltip, and
 * the filter is labelled "Occurred between" rather than "Submitted between":
 * one filter label cannot honestly describe a window over `occurredAt` any more.
 * The second line is drawn ONLY when the two instants fall in DIFFERENT MINUTES —
 * `isSameMinute(created, occurredAt)`, a rule about DISPLAY PRECISION and not
 * about the data, because both lines are rendered `MMM d, y HH:mm` and the
 * seconds are truncated away before anyone sees them. An exact-instant test would
 * print `Aug 1, 2026 09:00` directly under an identical `Aug 1, 2026 09:00` for
 * any payload whose two instants differ only below the minute, which is strictly
 * worse than either showing one line or showing two that genuinely differ. A
 * back-dated report is the case that still earns the line, and it is the only one
 * an admin is meant to act on. This is also why the two instants are never
 * conflated in the payload — see `linkStatusInput` and the `occurredAt` note in
 * `saveLinkEdit` for the tri-state that keeps a save from silently rewriting one
 * as the other.
 *
 * Row click opens a fully editable panel: the same field set as "Submit a
 * link" (URL required, title optional, the optional "when did this happen?"
 * datetime, lines/vehicles/stations/categories multi-selects) pre-filled from
 * the selected row. Save calls the IsAdmin `updateSocialMediaLink` — the backend
 * replaces the M2M sets verbatim, so every editable field is sent — then patches
 * the row locally. Mark-completed calls the admin mutation and reloads so the
 * row's completion state and timestamp come back as server truth. The detail
 * card names the completing admin (`completedBy`) next to `completedAt`.
 *
 * Approve is the publish gate for a row that isn't LIVE yet (a community
 * submission, or an auto-ingested operator post): it sends the same
 * `updateSocialMediaLink` with `status: "LIVE"`, then reloads. Hide is its
 * moderation counterpart (`status: "HIDDEN"`) for rows that must not appear in
 * the feed at all — it is offered on every row that isn't already HIDDEN, and
 * Approve stays available on a hidden row so un-hiding is just Approve. Both go
 * through one private `setLinkStatus`, which re-sends the row's full payload
 * (the input is replace-not-patch) and reloads. The console route is already
 * `adminOnlyGuard`-gated, and the backend refuses a non-admin status change, so
 * the row action carries no second permission check.
 *
 * THREAD GROUPING IS AN ACCORDION (2026-10-01), collapsed by default. This
 * SUPERSEDES an earlier decision recorded here, and the reasoning behind it is
 * kept because the rule it disagreed with still explains the parts that did not
 * change. The flat-table rationale was: "the table stays one row per link
 * deliberately — nesting a conversation inside a table cell is the single thing
 * that makes a moderation queue unreadable, and an admin's job is to compare
 * rows, not to expand one." That was sound about the ROW SET (an admin really
 * does compare rows, and every link really should keep its own row, its own
 * checkbox and its own action cell) and wrong about the VISIBLE ROW SET: a flat
 * queue prints a four-link conversation as four unrelated lines separated by
 * whatever else the triage order happened to interleave, so the admin cannot see
 * that they are one conversation without re-deriving it from the indent. The
 * accordion answers that without nesting anything inside a cell — it is still one
 * row per link, one set of columns, one action cell; the only thing that changes
 * is WHICH rows are on screen.
 *
 * So the queue renders an ACCORDION over the same flat, ordered TREE, exactly as
 * the public feed's `app-link-thread` already does (which is also collapsed by
 * default, per level and independently — the same rule, the same reason):
 *   - a row is a PARENT iff it has LOADED children, and it then carries a
 *     chevron (`data-testid="thread-toggle"`, `aria-expanded`, rotating icon) in
 *     the URL cell's indented flex, with an equal-width placeholder
 *     (`data-testid="chevron-placeholder"`) on a childless row so the columns
 *     cannot shift as rows open and close;
 *   - expanding reveals a row's direct children DIRECTLY BENEATH IT in the
 *     STORED order (`position` ASC, `id` tie-break — `compareStoredSequence`),
 *     and recursively: a child with children of its own gets its own chevron, so
 *     "each level expands on its own" holds at any depth;
 *   - the ROOT order is unchanged — the queue's `occurredAt DESC, id DESC`. Only
 *     the placement of children moves, from wherever the arrival order put them
 *     to directly under their parent;
 *   - COLLAPSED BY DEFAULT, because a triage queue is read for its newest rows,
 *     and an admin opening the queue should not have to close anything first;
 *   - NESTING IS LEGIBLE FROM THE ROW ALONE: one vertical rail per ancestor
 *     level (`data-testid="link-rail"`, `depthRails`) plus a muted background
 *     tint on the child row, on top of the rails being the indent themselves
 *     (`DEPTH_INDENT_PX`). The `N links` chip now sits under the URL inside the
 *     same cell — it is a statement about the row the URL belongs to, and a
 *     column of its own made the table ten wide to say what the URL cell could
 *     say in its second line;
 *   - every per-row verb is reachable on every RENDERED row, but the two that
 *     have a PRECONDITION are not rendered until it holds: Move up / Move down
 *     appear only once `queueIsComplete()`, and Nest under… only once something is
 *     ticked (`nestSelectionReady`). Greyed-out controls on the default queue read
 *     as broken, and "Show all links" — the one-click way to the state the
 *     sequence actions need — is a discoverable substitute for a tooltip that
 *     explains why two buttons on every row do nothing. The GATE ITSELF IS
 *     UNCHANGED: nothing re-enables on a filtered queue (see `reorderSiblings`,
 *     which re-checks both conditions because it is reachable programmatically
 *     too).
 *
 * ⚠️ A DOCUMENTED DIVERGENCE, stated here because it contradicts a rule this repo has
 * already written down. `MISTAKES.md` (2026-09-30, home/`collapseThreads`) rules that
 * "client-side grouping of a flat page is unsound in the first place … so collapsing has
 * to be the backend's decision, and the consumer's job is to walk the shape it asked for"
 * — and this accordion groups a flat payload on the client. It is safe HERE because the
 * console resolver has no pagination and no row cap (backend `get_social_media_links`), so
 * whenever the applied filters are UNFILTERED — Status on All counts, it is a filter too —
 * the loaded set IS the whole table, which is exactly the `queueIsComplete` precondition —
 * and every structural action is refused outright when the loaded set cannot prove it is
 * complete. So the walk never reconstructs a
 * grouping the payload does not carry: a parent missing from a filtered result makes its
 * child a root (see `_depths`), and the accordion only ever decides which rows of a
 * COMPLETE set are DRAWN. It never loads less than the page did and never writes an order
 * back.
 *
 * The hierarchy is a TREE, not the old two-level thread: `parentId` points at
 * any link, depth is arbitrary up to the store's cap, and every node keeps its
 * own descendants (`sublinkCount` is a node's OWN count at ANY depth, so it is
 * NOT the conversation's size — read the root's row for that, and never sum the
 * column, which double-counts by exactly the depth). Two consequences run
 * through this component:
 *
 * 1. THE CHIP, AND WHY ITS ARGUMENT IS `sublinkCount + 1`. `threadLabel`'s
 *    parameter is a CONVERSATION SIZE and it answers `""` for anything `<= 1`,
 *    so the raw descendant count must not be handed to it: a root with exactly
 *    ONE sublink would lose its chip entirely (`1` → `""`), while every leaf
 *    would keep it correctly absent (`0` → `""`) — which is exactly why the bug
 *    hides. Do not "simplify" the `+ 1` away; it is the off-by-one
 *    `threadLabel`'s own docstring is written around.
 * 2. THE HIDE COUPLING IS RECURSIVE. A conversation is public iff its ROOT is,
 *    so hiding a root pulls its whole subtree out of the feed — and under the
 *    tree that is true at EVERY depth, not just one: hiding a mid-tree node
 *    takes its own descendants with it, and the middle node that joins them is
 *    how a deep conversation can be broken in half. Nothing in a row states any
 *    of that, so `hideLink` asks before doing it (see `confirmThreadCoupling`).
 *
 * THE SEQUENCE (Move up / Move down) writes the stored sibling order through
 * `reorderSocialMediaLinks`, which is a PERMUTATION of one existing sibling set
 * and renumbers it `10, 20, 30, …` server-side. Two client rules follow and both
 * are load-bearing: the payload is the WHOLE sibling run reordered (sending only
 * the two swapped rows is a different, wrong request), and the `parentId` key is
 * ALWAYS present, `null` being the meaningful "reorder the roots" case. The
 * argument is `ID` — nullable with no SDL default, so in GraphQL "required" IS
 * "non-null" and omitting the key is legal; the RESOLVER'S OWN GUARD
 * (`reorder_social_media_links`'s own `if not parent_id` in
 * `incident/schema/mutations/interactions.py`) refuses the omission, deliberately,
 * at execution time.
 *
 * ⚠️ THE ORDER THIS TABLE SHOWS IS NOT THE ORDER IT WRITES — and that is the
 * design, not a gap. The queue is sorted `occurredAt DESC, id DESC`, which is a
 * TRIAGE order ("what happened most recently") and stays exactly as it is. The
 * stored sibling sequence is a DIFFERENT ordering, `position` ASC, and it is the
 * one a conversation reads in. So every payload here is built from the STORED run
 * with one row moved (see `siblingsOf` and `compareStoredSequence`), while the
 * table keeps rendering the event-time order. The visible consequence is
 * deliberate: a successful move can leave the table looking unchanged, because
 * the two orders are not the same order, and the toast is what reports the write.
 * The converse is deliberate too — a conversation the backend assembled
 * oldest-first arrives here newest-first, so the move buttons answer from the
 * stored run rather than from what happens to be on screen.
 *
 * ONE PRECONDITION COMES WITH THAT. A row whose `position` did not arrive is a
 * row whose stored order is UNKNOWN, and a permutation of an unknown order is
 * indistinguishable from a permutation of a wrong one: the server accepts either,
 * renumbers it, and the guess becomes the stored truth. So the sequence actions
 * refuse while any sibling's `position` is missing — and say so on the button —
 * rather than inventing an order the admin never saw.
 *
 * Selection itself is pure: `selectedIds` is only ever built and judged through
 * `link-thread-selection.util.ts`, the same module the profile surface's "My
 * Submitted Links" uses, so the two cannot drift on questions like "may I group
 * this?", "may I nest this?" and "does this row show a chip?". Grouping needs two
 * ticks; NESTING NEEDS ONE, because a targeted nest writes a real child while an
 * untargeted one-link "group" would elect the link as its own root. Reordering
 * deliberately KEEPS the selection: a reorder is not a grouping change, so the
 * rows an admin ticked to find the sequence are still the rows they ticked
 * afterwards.
 *
 * 🔴 SELECT-ALL READS THE RENDERED ROWS; THE MUTATIONS SCOPE TO THE LOADED ONES.
 * Two different id lists exist on purpose, and they answer different questions:
 * `renderedLinkIds` (what the accordion is showing) drives `toggleSelectAll` and
 * `allVisibleSelected`, because "select all" must not tick rows the admin cannot
 * see — the checkbox would then read as fully selected while N conversations sit
 * closed, and a second press would clear those ticks. `visibleLinkIds` (every
 * LOADED row, collapsed children included) stays the scope of `scopedSelection`,
 * because collapsing a conversation is a VIEW gesture, not an intent to forget:
 * tick a root, open it, tick two children, close it, and hitting Group must still
 * move all three. Scoping the mutation to the rendered set instead would make a
 * collapse silently drop the admin's own selection.
 */
@Component({
  selector: "app-console-social-media-links",
  imports: [
    AppNavComponent,
    AppFooterComponent,
    AssetMultiSelectComponent,
    DatePipe,
    ErrorBoxComponent,
    HlmBadge,
    HlmButton,
    HlmInput,
    HlmSkeleton,
    HlmSheet,
    HlmSheetHeader,
    HlmSheetBody,
    HlmSheetFooter,
    ...HlmCardImports,
    ...HlmTableImports,
    ConsoleNavComponent,
    LinkQueueRowComponent,
    LinksFilterBarComponent,
    LinksSelectionToolbarComponent,
  ],
  templateUrl: "./links.component.html",
})
export class SocialMediaLinksComponent {
  private readonly graphql = inject(GraphQLClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  /** One trailing debounce serves search AND the filter controls — last change wins. */
  private readonly queueDebouncer = createTrailingDebounce(SEARCH_DEBOUNCE_MS);

  protected readonly links = signal<SocialMediaLinkRow[]>([]);
  protected readonly categories = signal<{ id: string; name: string }[]>([]);
  protected readonly isLoading = signal(false);

  protected readonly skeletonRows = [0, 1, 2, 3, 4];

  protected readonly searchTerm = signal("");
  protected readonly categoryId = signal("");
  /** Defaults to PENDING per the spec ("by default only view entries that are
   * NOT completed"); All/Completed options remain available. */
  protected readonly completedFilter = signal<CompletedFilter>("pending");

  /** Server-side queue filters (Task 10 resolver args), debounced like search.
   * Empty string = no filter on that axis; the applied snapshot is taken when
   * the debounce fires so a slow dial of the selects sends one coherent query. */
  protected readonly filterLineId = signal("");
  protected readonly filterVehicleId = signal("");
  protected readonly filterStationId = signal("");
  protected readonly filterDateFrom = signal("");
  protected readonly filterDateTo = signal("");

  protected readonly selectedLink = signal<SocialMediaLinkRow | null>(null);

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
  protected readonly selectedIds = signal<string[]>([]);

  /** Every LOADED row's id, collapsed children included — the scope of every
   *  grouping mutation. 🔴 NOT the rendered set: see the accordion note in the
   *  class docstring. Collapsing a conversation is a view gesture, and a mutation
   *  scoped to what happens to be open would quietly drop the admin's own ticks. */
  protected readonly visibleLinkIds = computed(() => this.links().map((link) => link.id));

  protected readonly selectedCount = computed(() => this.selectedIds().length);

  /** At least TWO links. Delegated to `canGroup` rather than re-derived, so the
   *  "a one-link thread is a no-op that renders as a thread" rule lives in
   *  exactly one place — the one the profile surface's grouping UI also reads. */
  protected readonly canGroupSelection = computed(() => canGroup(this.selectedIds()));

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
  protected readonly nestSelectionReady = computed(() => canNest(this.selectedIds()));

  /** The rows the ACCORDION is currently showing — `links()` minus every row
   *  whose loaded ancestors are all collapsed. This is what Select-all and the
   *  header's checked state read, so a closed conversation is never half-ticked
   *  from under the admin; see the class docstring for why the MUTATIONS still
   *  scope to `visibleLinkIds`. */
  protected readonly renderedLinkIds = computed(() => this.renderedLinks().map((link) => link.id));

  /** Drives the header Select-all checkbox. False over an empty page on purpose
   *  (see `areAllSelected`). */
  protected readonly allVisibleSelected = computed(() =>
    areAllSelected(this.selectedIds(), this.renderedLinkIds()),
  );

  /** Re-exposed, not re-implemented: an Angular template can only read members off
   *  the component class, and the pluralisation of a CONVERSATION SIZE is decided in
   *  exactly one module so this table and the profile surface's badge cannot end
   *  up disagreeing ("1 links" vs "2 link"). */
  protected readonly threadLabel = threadLabel;

  /** Re-exposed for the same reason, and with the same "one definition" rule: the
   *  minute-bucketing that decides whether the Submitted cell needs a second line
   *  lives in `same-minute.util.ts`, so its NaN guard and truncation rule cannot
   *  be re-invented inline in a template binding. */
  protected readonly isSameMinute = isSameMinute;

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
  protected readonly moveUpHelp = "Move this link one place earlier in the conversation.";
  protected readonly moveDownHelp = "Move this link one place later in the conversation.";
  protected readonly nestHelp = "Nest the ticked links under this one.";

  /* ---- Hierarchy: depth, sequence, nesting ------------------------------- */

  /** Is the loaded queue EVERY link there is?
   *
   *  🔴 This is the precondition for the sequence actions, and the reason they are
   *  disabled under any filter: `reorderSocialMediaLinks` permutes ONE sibling
   *  SET, so a payload built from a filtered page is a PARTIAL permutation. That
   *  does not fail loudly — the server writes the named ids first and leaves every
   *  unnamed sibling after them — so the call SUCCEEDS and silently shoves a row
   *  the admin cannot see to the end of the conversation. Offering it here would
   *  let the stored order quietly disagree with the order on screen, which is
   *  worse than not offering the action at all.
   *
   *  Only an unfiltered queue proves otherwise: the console resolver has no
   *  pagination and no row cap (backend `get_social_media_links`), so "no search,
   *  no category, no line/vehicle/station, no date window, Status on All" means
   *  the loaded set is the whole table and therefore the whole of every sibling
   *  set in it. The status filter counts: the queue DEFAULTS to Pending, which
   *  already hides every completed row.
   *
   *  It is a SIGNAL, not a computed over the filter controls, because the answer
   *  belongs to the ROWS and not to the dials: a dial changes up to a trailing
   *  debounce before any refetch, so a computed would re-enable the action while
   *  a filtered page was still on screen. `fetchLinks` writes it from the same
   *  applied filter snapshot that built the query — SNAPSHOT BEFORE that query is
   *  awaited, not read back after it, see that method — so the flag and the rows
   *  it describes cannot disagree. The toolbar's "Show all links" action
   *  (`showAllLinks`) writes that unfiltered snapshot in one click, which is what
   *  makes the state reachable from the default (Pending) queue.
   *
   *  🔴 READ AS A RENDER GATE, NOT ONLY AS A DISABLED STATE. The per-row Move up /
   *  Move down buttons are not drawn at all while this is false. Nothing is
   *  weakened by that — `reorderSiblings` refuses on the same condition, and the
   *  per-button `[disabled]` keeps the run-end reasons once the queue IS whole —
   *  but two permanently greyed buttons on every row of the default Pending queue
   *  read as BROKEN rather than as unavailable, and the toolbar hint names the one
   *  click that resolves them. */
  protected readonly queueIsComplete = signal(false);

  /** Each loaded row's depth, computed by walking its `parentId` chain inside the
   *  loaded set — see `computeDepths` for the walk and its cycle safety. A method
   *  rather than a per-row signal: the map behind it is one computed over the
   *  whole queue, and the template asks once per row. */
  private readonly _depths = computed(() => computeDepths(this.links()));

  protected depthOf(link: SocialMediaLinkRow): number {
    return this._depths().get(link.id) ?? 0;
  }

  /** The width of ONE rail, which the template BINDS rather than restates; see
   *  `DEPTH_INDENT_PX` for why the rail step is a single definition. */
  protected readonly depthIndentPx = DEPTH_INDENT_PX;

  /** One entry per ancestor level, so the URL cell can draw that many vertical
   *  rails. `depthRailsFor` is the pure helper; the depth still has exactly one
   *  definition in `_depths`. */
  protected depthRails(link: SocialMediaLinkRow): number[] {
    return depthRailsFor(this.depthOf(link));
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
  protected readonly expandedIds = signal<ReadonlySet<string>>(new Set<string>());

  /** Open/close one conversation. A NEW set every call, for the reason above. */
  protected toggleExpanded(id: string): void {
    const next = new Set(this.expandedIds());
    if (!next.delete(id)) {
      next.add(id);
    }
    this.expandedIds.set(next);
  }

  protected isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  /** Every loaded row grouped by the id of its PARENT, each group in the STORED
   *  order — the ONE map a sibling run is built from (`groupRunsByParentId`). */
  private readonly _runsByParentId = computed(() => groupRunsByParentId(this.links()));

  /** A row's direct children, in the STORED order. The chevron's gate: a row is a
   *  PARENT iff it has LOADED children (`childCountOf`). */
  protected childCountOf(link: SocialMediaLinkRow): number {
    return childCountOf(this._runsByParentId(), link);
  }

  /** The rows the accordion actually draws, in display order — see
   *  `renderedLinksOf` for the walk and its cycle safety net. */
  protected readonly renderedLinks = computed<SocialMediaLinkRow[]>(() =>
    renderedLinksOf(this.links(), this.expandedIds(), this._runsByParentId()),
  );

  /** Offered at every row except the head of its run (`canMoveUp`). */
  protected canMoveUp(link: SocialMediaLinkRow): boolean {
    return canMoveUp(this._runsByParentId(), link, this.queueIsComplete());
  }

  /** Offered at every row except the tail of its run (`canMoveDown`). */
  protected canMoveDown(link: SocialMediaLinkRow): boolean {
    return canMoveDown(this._runsByParentId(), link, this.queueIsComplete());
  }

  /** Why a sequence action is off, or `null` when it IS available (`moveBlockedReason`). */
  protected moveBlockedReason(link: SocialMediaLinkRow, direction: "up" | "down"): string | null {
    return moveBlockedReason(this._runsByParentId(), link, direction, this.queueIsComplete());
  }

  /** May the ticked rows be nested under this row? ONE tick is enough (`canNestUnder`). */
  protected canNestUnder(link: SocialMediaLinkRow): boolean {
    return canNestUnder(this.selectedIds(), link);
  }

  /** Why Nest-under is off, or `null` when it is available (`nestBlockedReason`). */
  protected nestBlockedReason(link: SocialMediaLinkRow): string | null {
    return nestBlockedReason(this.selectedIds(), link);
  }

  /** Edit form state — same signals as LinkFormComponent's fields, driven by
   * the console's own sheet instead of LinkSheetService. */
  protected readonly editUrl = signal("");
  protected readonly editTitle = signal("");
  /** "When did this happen?" — a `datetime-local` value (`YYYY-MM-DDTHH:mm`, naive
   *  local wall time), hydrated from the row's `occurredAt` and NOT from `created`:
   *  a link whose event time differs from its report time is exactly the one an
   *  admin opens this sheet to correct, so hydrating from the wrong column would
   *  quietly rewrite it on the very next save. */
  protected readonly editOccurredAt = signal("");
  protected readonly urlTouched = signal(false);
  protected readonly isEditing = signal(false);
  protected readonly isSaving = signal(false);
  protected readonly isDeleting = signal(false);

  protected readonly selectedLineIds = signal<string[]>([]);
  protected readonly selectedVehicleIds = signal<string[]>([]);
  protected readonly selectedStationIds = signal<string[]>([]);
  protected readonly selectedCategoryIds = signal<string[]>([]);

  protected readonly referenceResource = graphqlResource<InsidenReferenceQueryData>(() => ({
    query: INSIDEN_REFERENCE_QUERY,
  }));

  protected readonly lineOptions = computed<AssetMultiSelectOption[]>(() =>
    lineOptionsOf(this.referenceResource.data()),
  );

  private readonly _linesById = computed(() => indexLinesById(this.referenceResource.data()));

  private readonly _vehicleParentCodes = computed(() =>
    vehicleParentCodesOf(this.referenceResource.data()),
  );

  private readonly _vehiclesById = computed(() => indexVehiclesById(this.referenceResource.data()));

  protected readonly vehicleOptions = computed<AssetMultiSelectOption[]>(() =>
    vehicleOptionsOf(
      this.referenceResource.data(),
      this.selectedLineIds(),
      this._linesById(),
      this._vehicleParentCodes(),
    ),
  );

  private readonly _stationsById = computed(() => indexStationsById(this.referenceResource.data()));

  protected readonly stationOptions = computed<AssetMultiSelectOption[]>(() =>
    stationOptionsOf(this.referenceResource.data()),
  );

  protected readonly filterVehicleOptions = computed<AssetMultiSelectOption[]>(() =>
    filterVehicleOptionsOf(
      this.referenceResource.data(),
      this.filterLineId(),
      this._linesById(),
      this._vehicleParentCodes(),
    ),
  );

  protected readonly filterStationOptions = computed<AssetMultiSelectOption[]>(() =>
    filterStationOptionsOf(this.referenceResource.data(), this.filterLineId()),
  );

  private readonly _categoriesById = computed(() =>
    indexCategoriesById(this.referenceResource.data()),
  );

  protected readonly categoryOptions = computed<AssetMultiSelectOption[]>(() =>
    categoryOptionsOf(this.referenceResource.data()),
  );

  /** Mirrors link-form.schema's `required(f.url)` — Save is disabled while the URL is blank. */
  protected readonly canSave = computed(() => this.editUrl().trim().length > 0);

  private appliedSearch: string | undefined;
  private appliedCategoryId = "";
  private appliedCompleted: CompletedFilter = "pending";
  private appliedLineId: string | undefined;
  private appliedVehicleId: string | undefined;
  private appliedStationId: string | undefined;
  private appliedDateFrom: string | undefined;
  private appliedDateTo: string | undefined;

  /** Is a `load()` waiting for the current one to finish before it runs? A plain
   *  field, not a signal: nothing renders from it, it is read and written only
   *  inside `load()`. See that method for why a mid-load call is queued rather
   *  than dropped. */
  private reloadQueued = false;

  constructor() {
    this.load();
    this.loadCategories();
  }

  protected onSearchInput(value: string): void {
    this.searchTerm.set(value);
    this.queueDebouncer.push(() => {
      this.appliedSearch = searchTermOrUndefined(this.searchTerm());
      this.load();
    });
  }

  protected onCategoryChange(value: string): void {
    this.categoryId.set(value);
    this.appliedCategoryId = value;
    this.load();
  }

  protected onCompletedFilterChange(value: CompletedFilter): void {
    this.completedFilter.set(value);
    this.appliedCompleted = value;
    this.load();
  }

  private pushFilterChange(): void {
    this.queueDebouncer.push(() => {
      this.appliedLineId = this.filterLineId() || undefined;
      this.appliedVehicleId = this.filterVehicleId() || undefined;
      this.appliedStationId = this.filterStationId() || undefined;
      this.appliedDateFrom = this.filterDateFrom() || undefined;
      this.appliedDateTo = this.filterDateTo() || undefined;
      this.load();
    });
  }

  protected onFilterLineChange(value: string): void {
    this.filterLineId.set(value);
    // A vehicle/station hidden by the new line must not keep narrowing the query.
    this.filterVehicleId.set("");
    this.filterStationId.set("");
    this.pushFilterChange();
  }

  protected onFilterVehicleChange(value: string): void {
    this.filterVehicleId.set(value);
    this.pushFilterChange();
  }

  protected onFilterStationChange(value: string): void {
    this.filterStationId.set(value);
    this.pushFilterChange();
  }

  protected onDateFromInput(value: string): void {
    this.filterDateFrom.set(value);
    this.pushFilterChange();
  }

  protected onDateToInput(value: string): void {
    this.filterDateTo.set(value);
    this.pushFilterChange();
  }

  protected resetFilters(): void {
    this.applyQueueFilters("pending");
    this.load();
  }

  /** Drop EVERY filter and load the queue with Status on All — the state
   *  `queueIsComplete` exists to certify, offered as one click because the
   *  sequence actions are otherwise unreachable from the default (Pending) view:
   *  they are NOT DRAWN there at all, so this button is the whole route to the
   *  enabled state. "Reset" deliberately cannot stand in for it — Reset restores
   *  the QUEUE DEFAULT, which is Pending, and Pending is itself the filter that
   *  keeps reordering off. The applied snapshot is written synchronously with the
   *  controls (no debounce) so `fetchLinks` reads a complete, coherent state on
   *  the very query this triggers.
   *
   *  ⚠️ IT IS NEVER DISABLED, not even while a load is in flight, and that is a
   *  deliberate combination with `load()`'s queue-and-replay: an admin who clicks
   *  it during the first load gets the unfiltered queue, not a dropped click over
   *  controls that have already moved. The snapshot written above is the one the
   *  replayed (or the in-flight mutation's own) `fetchLinks` reads. */
  protected showAllLinks(): void {
    this.applyQueueFilters("any");
    this.load();
  }

  /** Write one coherent filter snapshot — live controls AND the applied fields
   *  `fetchLinks` reads — for the two whole-queue actions above. `completed` is
   *  the one axis they disagree on, which is exactly why it is the parameter:
   *  every other axis is cleared in both. The trailing debounce the search and
   *  the multi-selects otherwise sit behind is cancelled because a pending
   *  keystroke firing after this write would re-apply a filter the admin just
   *  cleared. */
  private applyQueueFilters(completed: CompletedFilter): void {
    this.queueDebouncer.cancel();
    this.searchTerm.set("");
    this.categoryId.set("");
    this.completedFilter.set(completed);
    this.filterLineId.set("");
    this.filterVehicleId.set("");
    this.filterStationId.set("");
    this.filterDateFrom.set("");
    this.filterDateTo.set("");
    this.appliedSearch = undefined;
    this.appliedCategoryId = "";
    this.appliedCompleted = completed;
    this.appliedLineId = undefined;
    this.appliedVehicleId = undefined;
    this.appliedStationId = undefined;
    this.appliedDateFrom = undefined;
    this.appliedDateTo = undefined;
  }

  /* ---- Multi-select + conversation grouping ---------------------------- */

  /** One row's checkbox. Routed through the shared helper because the result is
   *  written straight back into a signal: an in-place `push`/`splice` would
   *  produce the SAME array reference, change detection would never fire, and
   *  the checkbox would silently stop responding. */
  protected toggleRowSelection(id: string): void {
    this.selectedIds.set(toggleSelection(this.selectedIds(), id));
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
  protected toggleSelectAll(): void {
    this.selectedIds.set(this.allVisibleSelected() ? [] : [...this.renderedLinkIds()]);
  }

  protected clearSelection(): void {
    this.selectedIds.set([]);
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
  private scopedSelection(): string[] {
    return selectedWithin(this.selectedIds(), this.visibleLinkIds()).filter(Boolean);
  }

  /** Start a NEW conversation from the ticked rows.
   *
   *  The `parentId` key is OMITTED here, which is what the backend reads as "no
   *  target": it elects the root — the earliest `(occurredAt, id)` of the
   *  selection — and hangs the rest off it. Sending an explicit `null` would
   *  mean the same thing (the argument is `ID = null`, nullable WITH a default),
   *  but omitting it is the spelling that stays correct if that default ever
   *  becomes meaningful. Contrast `reorderSiblings`, where the key is ALWAYS
   *  present because an omission is refused by the resolver's own guard
   *  (`reorder_social_media_links`'s own `if not parent_id` in
   *  `incident/schema/mutations/interactions.py`) — the argument is `ID`, nullable
   *  with no default, so the SDL itself cannot require it.
   *
   *  Grouping is ALL-OR-NOTHING server-side: one link outside the admin's
   *  permission, a cycle or a depth-cap breach rejects the entire selection, so
   *  there is no partial state to render and nothing to roll back locally. A
   *  failure therefore toasts and leaves both the list and the selection exactly
   *  as they were — keeping the selection on failure is deliberate: the admin can
   *  adjust it and retry instead of re-ticking from scratch. Success reloads (the
   *  payload is a flat array — the accordion derives the hierarchy from `parentId`
   *  client-side — so the server's `parentId`/`sublinkCount` truth is what drives
   *  the indentation, the chips and the chevrons) and clears the selection, which is
   *  otherwise a selection of rows that are now one conversation — i.e. a request
   *  that has already been made.
   *
   *  The returned root id is deliberately unused: it is an `Int` (every other id
   *  in this feature is a string `ID`) and exists so a surface that re-fetched ONE
   *  conversation on demand could spend it. This queue fetches the whole flat
   *  array with no pagination and reloads wholesale, so there is nothing to spend
   *  it on — the accordion collapses what is already in memory instead. */
  protected async groupSelected(): Promise<boolean> {
    const linkIds = this.scopedSelection();
    if (!canGroup(linkIds)) {
      return false;
    }
    return this.sendGrouping(
      linkIds,
      undefined,
      "Links grouped",
      `${linkIds.length} links are now one conversation.`,
      "Couldn't group links",
    );
  }

  /** Nest the ticked rows as CHILDREN of the row this was clicked on — the same
   *  verb as "Group into thread", with a target instead of an elected root.
   *
   *  WHY A ROW ACTION AND NOT A TARGET PICKER: the selection is the payload and
   *  the row is the target, so the click that names both is the row whose
   *  conversation the admin is looking at. A picker would ask them to choose,
   *  from a list of rows that is ALREADY on screen in front of them, the exact
   *  same target — one extra click and a second source of truth for "where does
   *  this go", with the same cycle rules to enforce. The row's own Nest-under
   *  button is disabled (with a stated reason) whenever the action cannot be
   *  sent, so the affordance is never a live control that quietly does nothing.
   *
   *  The guards are the two the server would reject the whole call for:
   *   - an EMPTY selection, which is `canNest` — with a target, ONE ticked row is
   *     already a real write (it becomes this row's child), unlike the no-target
   *     grouping minimum of two that `canGroup` encodes. A nest is how a
   *     conversation's first child is created, so one has to be enough;
   *   - the target itself being in the selection, which is a CYCLE: a link cannot
   *     be its own ancestor. The server rejects such a call as a unit, with
   *     nothing written, so the client never sends one.
   *  Both are re-checked here and not only in the template, so a programmatic
   *  call cannot post a request the server will refuse wholesale. The depth cap
   *  is the third server-side rejection and is NOT mirrored here: it depends on
   *  where the target sits in a tree this table cannot fully see (a filtered page
   *  hides ancestors), so the server stays the authority and its message is what
   *  the admin reads.
   *
   *  Success clears the selection, exactly as grouping does: the ticked rows are
   *  now one subtree, so re-ticking them would offer to nest them again. */
  protected async nestSelectedUnder(link: SocialMediaLinkRow): Promise<boolean> {
    if (!this.canNestUnder(link)) {
      return false;
    }
    const linkIds = this.scopedSelection();
    if (!canNest(linkIds)) {
      return false;
    }
    return this.sendGrouping(
      linkIds,
      link.id,
      "Links nested",
      `${linkIds.length} links are now under ${link.url}.`,
      "Couldn't nest links",
    );
  }

  /** The one call both group verbs make, so the tri-state `parentId` spelling, the
   *  auth header, the reload and the all-or-nothing failure handling cannot drift
   *  between them.
   *
   *  `parentId === undefined` OMITS the key (start a new conversation); a string
   *  sends it (nest under that link). The two are not the same request, which is
   *  why the parameter is optional rather than nullable. */
  private async sendGrouping(
    linkIds: string[],
    parentId: string | undefined,
    successTitle: string,
    successBody: string,
    errorTitle: string,
  ): Promise<boolean> {
    const vars: GroupSocialMediaLinksVars = { linkIds };
    if (parentId) {
      vars.parentId = parentId;
    }
    this.isLoading.set(true);
    try {
      const idToken = await this.auth.idToken();
      await this.graphql.request<GroupSocialMediaLinksData, GroupSocialMediaLinksVars>(
        GROUP_SOCIAL_MEDIA_LINKS_MUTATION,
        vars,
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.toast.success(successTitle, successBody);
      await this.fetchLinks();
      this.clearSelection();
      return true;
    } catch (err) {
      this.toast.error(errorTitle, err instanceof Error ? err.message : "Unknown error");
      return false;
    } finally {
      this.finishLoading();
    }
  }

  /** Detach ONE link from whatever it hangs under. Offered only where
   *  `parentId` is non-null, i.e. on a sublink — which is the only spelling of
   *  this action that does anything: ungrouping a ROOT leaves its whole subtree
   *  attached (there is nothing to detach), so a root's job here is to carry the
   *  chip and its descendants' Ungroup buttons, not an Ungroup of its own.
   *
   *  The asymmetry is deliberate server-side (no cascade, no re-root election), so
   *  the button detaches exactly the row it is on and the copy says so. Under the
   *  tree it also has a consequence the depth-1 design did not have: a PROMOTED
   *  link keeps its own children, so ungrouping a middle node lifts a whole
   *  subtree to the root level. The server deliberately does not flatten it and
   *  neither does this row, which is why the copy stays about the one row. */
  protected async ungroupLink(link: SocialMediaLinkRow): Promise<boolean> {
    if (!link.parentId) {
      return false;
    }
    this.isLoading.set(true);
    try {
      const idToken = await this.auth.idToken();
      await this.graphql.request<UngroupSocialMediaLinksData, UngroupSocialMediaLinksVars>(
        UNGROUP_SOCIAL_MEDIA_LINKS_MUTATION,
        { linkIds: [link.id].filter(Boolean) },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.toast.success("Link removed from its parent", link.url);
      await this.fetchLinks();
      return true;
    } catch (err) {
      this.toast.error(
        "Couldn't ungroup link",
        err instanceof Error ? err.message : "Unknown error",
      );
      return false;
    } finally {
      this.finishLoading();
    }
  }

  /* ---- Sequence (reorder) ---------------------------------------------- */

  /** "Move up" in the row's sibling run. A named wrapper so the template reads as
   *  an action rather than as an arithmetic shift into a shared verb. */
  protected moveLinkUp(link: SocialMediaLinkRow): Promise<boolean> {
    return this.reorderSiblings(link, -1);
  }

  /** "Move down" — the mirror. Same payload shape, opposite direction. */
  protected moveLinkDown(link: SocialMediaLinkRow): Promise<boolean> {
    return this.reorderSiblings(link, 1);
  }

  /** 🔴 THE SEQUENCE WRITE. Everything about this call is shaped by the fact that
   *  `reorderSocialMediaLinks` is a PERMUTATION OF ONE SIBLING SET, not a move:
   *
   *  - `linkIds` is the WHOLE run with the row swapped one place, never the two
   *    rows involved. The server renumbers the ids it is given `10, 20, 30, …` and
   *    leaves every id it was NOT given after them, so sending a pair would be a
   *    request to move those two to the front of the run and push everything else
   *    back — the opposite of a swap, and a silent one.
   *  - ⚠️ AND THE RUN MUST BE THE STORED ONE. `siblingsOf` returns it in
   *    `position` ASC with `id` as the tie-break, and THIS payload is the stored
   *    sibling order with one row moved — never the feed's `occurredAt` order,
   *    never the order the table happens to render. The server writes the list it
   *    is given verbatim as the new sequence, so a payload built from the arrival
   *    order overwrites the stored story with the queue's triage timeline (and
   *    reverses a conversation the backend assembled oldest-first, which is
   *    therefore the order it ARRIVES in).
   *  - `parentId` is the row's OWN `parentId`, and the key is ALWAYS present.
   *    The argument is `ID` — NULLABLE, with no SDL default, so in GraphQL
   *    "required" IS "non-null" and omitting the key is LEGAL GraphQL that
   *    `ProvidedRequiredArgumentsRule` never refuses. What rejects an omitted key
   *    is the RESOLVER'S OWN GUARD (`reorder_social_media_links`'s own
   *    `if not parent_id: raise GraphQLError` in
   *    `incident/schema/mutations/interactions.py`), deliberately, at execution
   *    time. It cannot be tightened to `ID!`, because the meaningful `null`
   *    ("reorder the roots") would then become a hard error. `?? null` is what
   *    guarantees the key exists even if a payload omitted the field entirely.
   *  - the run comes from the loaded rows, so `queueIsComplete` is the gate: a
   *    filtered page would send a PARTIAL permutation that succeeds and pushes
   *    the unseen rows to the end. See that signal for why that is worse than a
   *    rejection. `runOrderIsKnown` is the second gate and the same argument: a
   *    run with an unreadable stored order would send a permutation of a GUESS.
   *
   *  Optimistic patching is NOT an option here and the reload is not optional
   *  politeness: the order this table shows is not the order this table writes (it
   *  shows `occurredAt DESC, id DESC`), so nothing on screen can confirm the new
   *  sequence even in principle. A reload is what makes the next move a real swap
   *  against the stored one — the rows come back with their new `position`, which
   *  this document does select. The table therefore looks unchanged after a
   *  successful move; that is the honest result, and the toast is what tells the
   *  admin the write landed.
   *
   *  The SELECTION SURVIVES, unlike after grouping: a reorder changes no
   *  membership, so the rows the admin ticked to find the sequence are still the
   *  rows they ticked. A failure keeps everything — no reload, no local write, no
   *  selection change — and toasts, because a swallowed rejection here would look
   *  exactly like a successful no-op. */
  private async reorderSiblings(link: SocialMediaLinkRow, delta: -1 | 1): Promise<boolean> {
    // Both gates again, not just the buttons': this is reachable from a programmatic
    // call, and a partial or a guess is worse than no call at all.
    if (!this.queueIsComplete() || !runOrderIsKnown(this._runsByParentId(), link)) {
      return false;
    }
    const siblings = siblingsOf(this._runsByParentId(), link);
    const from = siblings.findIndex((row) => row.id === link.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= siblings.length) {
      return false;
    }
    // THE PAYLOAD IS THE STORED SIBLING ORDER (`position` ASC, `id` tie-break) WITH
    // ONE ROW MOVED — never the feed's `occurredAt` order, and never `this.links()`'s
    // arrival order. `siblings` is already in that order; this only swaps one element
    // within it, so the whole run is preserved and permuted exactly once.
    const reordered = [...siblings];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const linkIds = reordered.map((row) => row.id);
    this.isLoading.set(true);
    try {
      const idToken = await this.auth.idToken();
      await this.graphql.request<ReorderSocialMediaLinksData, ReorderSocialMediaLinksVars>(
        REORDER_SOCIAL_MEDIA_LINKS_MUTATION,
        // ALWAYS both keys — see the note above.
        { linkIds, parentId: link.parentId ?? null },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.toast.success("Sequence updated", `${linkIds.length} links reordered.`);
      await this.fetchLinks();
      return true;
    } catch (err) {
      this.toast.error(
        "Couldn't reorder links",
        err instanceof Error ? err.message : "Unknown error",
      );
      return false;
    } finally {
      this.finishLoading();
    }
  }

  /** Publish a row that isn't LIVE yet (community submission or an
   *  auto-ingested operator post) AND retire it: approving is the queue's
   *  "handled it" gesture, so it runs TWO mutations in a fixed order —
   *  `updateSocialMediaLink(status: "LIVE")` then
   *  `markSocialMediaLinkCompleted(linkId:)` — and exactly ONE reload at the
   *  end.
   *
   *  WHY TWO WRITES AND NOT ONE. The two fields are orthogonal axes and the
   *  backend keeps both (no migration): `status` is FEED VISIBILITY
   *  (`LIVE`/`PENDING_APPROVAL`/`HIDDEN`) and `completed`/`completedAt`/
   *  `completedBy` is the GLOBAL triage flag. Before this, approving published a
   *  row and left it sitting in the Pending queue forever, so the admin had to
   *  find the same row again and press a second button for the thing they had
   *  just done. Approve now means both, and the standalone "Mark completed"
   *  action stays for a row that is already visible (e.g. an auto-ingested post
   *  someone wants retired without a status change).
   *
   *  ⚠️ ORDER IS THE CONTRACT. The status write goes first because it is the one
   *  that can fail on its own (the input is replace-not-patch and the backend
   *  refuses a non-admin change); completing a row that is still `PENDING_APPROVAL`
   *  would retire a link nobody can see, which is not what a failed publish meant.
   *
   *  🔴 A PARTIAL FAILURE IS NEVER SILENT, and it never rolls back. If the status
   *  write fails: the existing error toast, NO completion request, and NO reload —
   *  the list is exactly as it was. If the publish succeeds but the completion
   *  fails, the row IS live and still pending, so the error toast says exactly
   *  that in its title, and the reload still happens so the admin sees the true
   *  state instead of an optimistic chip. The return value is the PUBLISH
   *  outcome, which is what the detail panel's close-on-success reads.
   *
   *  ONE reload, not two: `markCompleted`'s own reload is deliberately not
   *  reused here (see `sendMarkCompleted`) — a mid-sequence reload would render
   *  the row as `LIVE` and still pending, and the second reload would race the
   *  admin's next click. */
  protected async approveLink(link: SocialMediaLinkRow): Promise<boolean> {
    this.isLoading.set(true);
    try {
      try {
        await this.sendLinkStatus(link, "LIVE");
        this.toast.success("Link approved", link.url);
      } catch (err) {
        this.toast.error(
          "Couldn't approve link",
          err instanceof Error ? err.message : "Unknown error",
        );
        return false;
      }
      try {
        await this.sendMarkCompleted(link);
      } catch (err) {
        this.toast.error(
          "Link approved, but not marked completed",
          `The link is now published, but it is still waiting in the triage queue: ${
            err instanceof Error ? err.message : "Unknown error"
          }. Use “Mark completed” to finish it.`,
        );
      }
      await this.fetchLinks();
      return true;
    } finally {
      this.finishLoading();
    }
  }

  /** Moderation counterpart of approveLink: pull a row out of the public feed
   *  (`status: "HIDDEN"`) without deleting it — e.g. a celebratory update that
   *  must not sit in the feed. The row keeps its title, tags and votes because
   *  the same full payload is re-sent. Approve stays available on a hidden row,
   *  which is how an admin puts it back (Approve → `LIVE`).
   *
   *  On any row that has links BELOW it the action is not confined to the row:
   *  the feed renders a conversation as its root, a conversation is public IFF
   *  its root is, and hiding a node takes its whole subtree with it at EVERY
   *  depth — recursively, not just its direct children. That is a side effect on
   *  N other rows that no badge states on its own, hence the guard. */
  protected async hideLink(link: SocialMediaLinkRow): Promise<boolean> {
    if (!this.confirmThreadCoupling(link)) {
      return false;
    }
    return this.setLinkStatus(link, "HIDDEN", "Link hidden", "Couldn't hide link");
  }

  /** WHY A CONFIRM, AND WHY ONLY HERE.
   *
   *  The coupling ("a conversation is public iff its root is") is real, it is
   *  invisible in the row, and it is decided at the moment of the click — so the
   *  least intrusive thing that actually communicates it is a one-time native
   *  confirm naming the count, right where the destructive decision is made. A
   *  static tooltip on the chip is not enough on its own: it is invisible until
   *  hovered, absent on touch, and gone by the time the admin reaches the Hide
   *  button at the other end of the row. (The chip sits under the URL in the
   *  row's FIRST cell and Hide is in the action cell at the far end, so it is not
   *  even adjacent any more — which is a second, cheaper reason the confirm earns
   *  its place beside the click.)
   *
   *  🔴 UNDER THE TREE THE BLAST RADIUS IS NOT ONE LEVEL, and this is the copy
   *  that has to say so. `sublinkCount` counts a node's descendants AT ANY DEPTH,
   *  so a root whose only sublink is itself a parent of two more reports a
   *  conversation of four, and hiding it removes all four — not the two rows
   *  directly under it. Saying "hides every member" would understate it, and the
   *  admin would learn the rest of the subtree's fate by looking for it in the
   *  feed afterwards. A MID-TREE node is asked about too, for the same reason one
   *  level down: hiding the middle of a conversation takes the rest of it with it.
   *
   *  It is NOT applied to every row. `threadLabel` answers "" for a
   *  conversation size of 1, which is every childless link (an ungrouped link and
   *  a leaf are both a subtree of nothing), so ordinary Hide stays a single
   *  click and only a row that really has links below it is asked about. The gate
   *  is therefore `sublinkCount > 0` and NEVER `isThreadRoot` — the backend
   *  defines a root as `parentId == null`, which is true of every ungrouped link
   *  in the queue, so gating on it would interrupt every Hide on the page.
   *
   *  🔴 The `+ 1` below is the off-by-one `threadLabel`'s contract demands: its
   *  parameter is a CONVERSATION SIZE (this node plus its descendants), not the
   *  descendant count, and it answers "" for anything `<= 1` — so a raw
   *  `sublinkCount` of 1 (a root with exactly one sublink) would SKIP the
   *  confirm entirely. Same rule as the chip; the two must never diverge.
   *
   *  The native `confirm()` matches the delete guard this component already
   *  uses, so the console has one confirmation idiom rather than two. */
  private confirmThreadCoupling(link: SocialMediaLinkRow): boolean {
    const subtree = threadLabel(link.sublinkCount + 1);
    if (!subtree) {
      return true;
    }
    return link.isThreadRoot
      ? confirm(
          `This link is the root of a conversation with ${subtree}. A conversation is public only while its root is, so hiding this row hides the whole thing below it — every link in that subtree, at any depth. Hide the whole conversation?`,
        )
      : confirm(
          `This link has ${subtree} below it. Hiding this row hides that whole subtree with it, and a conversation is public only while its root is. Hide it and everything under it?`,
        );
  }

  /** The ONE status-changing request the queue makes, for every verb that changes
   *  one (Hide here, and Approve's publish step). Split out from the
   *  toast-and-reload wrapper below so the two-step Approve can issue it as the
   *  first half of its own sequence without dragging that reload along — one
   *  request builder, one payload, and the replace-not-patch rule cannot drift
   *  between the verbs.
   *
   *  `SocialMediaLinkInput` is not a patch: `url` is non-nullable and the service
   *  assigns `title` and calls `.set()` on the four M2M tag relations
   *  unconditionally, so a status-only payload would blank the title and strip
   *  every tag. The row's current scalars and ids are therefore re-sent
   *  alongside the new status (see `linkStatusInput`).
   *
   *  It REJECTS on failure and never catches: every caller decides what the
   *  failure means (Hide's "leave it alone" vs Approve's "don't complete either"),
   *  and a helper that swallowed the error would be exactly where that decision
   *  got lost. */
  private async sendLinkStatus(
    link: SocialMediaLinkRow,
    status: SocialMediaLinkStatus,
  ): Promise<void> {
    const idToken = await this.auth.idToken();
    await this.graphql.request<UpdateSocialMediaLinkData, UpdateSocialMediaLinkVars>(
      UPDATE_SOCIAL_MEDIA_LINK_MUTATION,
      { socialMediaLinkId: link.id, input: linkStatusInput(link, status) },
      idToken ? { "firebase-auth-key": idToken } : {},
    );
  }

  /** The one completion request, for the same reason as `sendLinkStatus` above:
   *  `approveLink` needs the mutation WITHOUT the standalone action's reload, or
   *  approving would refetch twice. Rejects on failure. */
  private async sendMarkCompleted(link: SocialMediaLinkRow): Promise<void> {
    const idToken = await this.auth.idToken();
    await this.graphql.request<MarkLinkCompletedData, MarkLinkCompletedVars>(
      MARK_LINK_COMPLETED_MUTATION,
      { linkId: link.id },
      idToken ? { "firebase-auth-key": idToken } : {},
    );
  }

  /** The single-request status-change path, currently Hide's. Shared so the
   *  replace-not-patch payload can never drift between the verbs, and so Hide
   *  cannot grow a completion side effect: `completed` is a triage flag and
   *  hiding a row is a FEED decision, not a decision that it was handled. */
  private async setLinkStatus(
    link: SocialMediaLinkRow,
    status: SocialMediaLinkStatus,
    successMessage: string,
    errorTitle: string,
  ): Promise<boolean> {
    this.isLoading.set(true);
    try {
      await this.sendLinkStatus(link, status);
      this.toast.success(successMessage, link.url);
      await this.fetchLinks();
      return true;
    } catch (err) {
      this.toast.error(errorTitle, err instanceof Error ? err.message : "Unknown error");
      return false;
    } finally {
      this.finishLoading();
    }
  }

  /** The standalone "Mark completed" action — retire a row WITHOUT touching its
   *  visibility. Still needed after Approve grew its own completion step: a row
   *  that is already `LIVE` (or was published by a previous session) can need
   *  retiring on its own, and a partially-completed approve offers this as the
   *  documented way to finish the job. */
  protected async markCompleted(link: SocialMediaLinkRow): Promise<boolean> {
    this.isLoading.set(true);
    try {
      await this.sendMarkCompleted(link);
      this.toast.success("Link marked completed", link.url);
      await this.fetchLinks();
      return true;
    } catch (err) {
      this.toast.error(
        "Couldn't mark completed",
        err instanceof Error ? err.message : "Unknown error",
      );
      return false;
    } finally {
      this.finishLoading();
    }
  }

  protected openLinkDetail(link: SocialMediaLinkRow): void {
    this.selectedLink.set(link);
    this.isEditing.set(true);
    this.editUrl.set(link.url);
    this.editTitle.set(link.title);
    // From `occurredAt`, never from `created` — see editOccurredAt's comment.
    this.editOccurredAt.set(isoToOccurredAtInput(link.occurredAt));
    this.urlTouched.set(false);
    this.selectedLineIds.set(link.lines.map((line) => line.id));
    this.selectedVehicleIds.set(link.vehicles.map((vehicle) => vehicle.id));
    this.selectedStationIds.set(link.stations.map((station) => station.id));
    this.selectedCategoryIds.set(link.categories.map((category) => category.id));
  }

  protected closeLinkPanel(): void {
    this.selectedLink.set(null);
    this.isEditing.set(false);
    this.editUrl.set("");
    this.editTitle.set("");
    // Reset with the rest of the form: a closed sheet must not carry one row's
    // event time into the next one an admin opens.
    this.editOccurredAt.set("");
    this.urlTouched.set(false);
    this.selectedLineIds.set([]);
    this.selectedVehicleIds.set([]);
    this.selectedStationIds.set([]);
    this.selectedCategoryIds.set([]);
  }

  protected onEditUrlInput(value: string): void {
    this.editUrl.set(value);
    this.urlTouched.set(true);
  }

  protected onEditTitleInput(value: string): void {
    this.editTitle.set(value);
  }

  protected onEditOccurredAtInput(value: string): void {
    this.editOccurredAt.set(value);
  }

  /** Full edit — same field set as "Submit a link". The backend replaces
   *  lines/vehicles/stations/categories from the input verbatim, so the payload
   *  carries the complete form state, not just the edited scalars. */
  protected async saveLinkEdit(): Promise<void> {
    const link = this.selectedLink();
    if (!link) {
      return;
    }
    if (!this.canSave()) {
      this.urlTouched.set(true);
      return;
    }
    this.isSaving.set(true);
    try {
      const idToken = await this.auth.idToken();
      await this.graphql.request<UpdateSocialMediaLinkData, UpdateSocialMediaLinkVars>(
        UPDATE_SOCIAL_MEDIA_LINK_MUTATION,
        {
          socialMediaLinkId: link.id,
          input: {
            url: this.editUrl(),
            title: this.editTitle() || null,
            lineIds: this.selectedLineIds(),
            vehicleIds: this.selectedVehicleIds(),
            stationIds: this.selectedStationIds(),
            categoryIds: this.selectedCategoryIds(),
            // ⚠️ ALWAYS send this key, and never write it as `?? undefined` or
            // `link.occurredAt ?? null`. `SocialMediaLinkInput` is
            // replace-not-patch and `occurredAt` is tri-state with a
            // DESTRUCTIVE third state:
            //   omitted        → leave the event time untouched
            //   a datetime     → set it
            //   explicit null  → RESET it to the row's submission time
            // So an untouched box round-trips the link's current event time (the
            // normal save), and a CLEARED box sends the explicit `null` on
            // purpose — "this actually happened when it was reported" is exactly
            // what null encodes, and it is the one place an admin can undo a
            // wrong guess. Omitting the key instead would make "cleared"
            // unreachable from a visible-but-empty control. Mirrors
            // LinkFormComponent.submit's identical branch.
            occurredAt: occurredAtInputToIso(this.editOccurredAt()),
          },
        },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      const updated = this.buildUpdatedLink(link);
      this.links.update((list) =>
        list.map((existing) => (existing.id === link.id ? updated : existing)),
      );
      this.selectedLink.set(updated);
      this.toast.success("Link updated", updated.url);
    } catch (err) {
      this.toast.error(
        "Couldn't save changes",
        err instanceof Error ? err.message : "Unknown error",
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  /** Rebuilds the local row from the saved form state so the table row and the
   *  detail card show exactly what the backend now holds. Preference goes to
   *  reference data (it carries the display labels); anything the reference set
   *  doesn't know yet falls back to the row's own objects. */
  private buildUpdatedLink(link: SocialMediaLinkRow): SocialMediaLinkRow {
    const resolve = <T extends { id: string }>(
      ids: string[],
      current: T[],
      lookup: (id: string) => T | undefined,
    ): T[] =>
      ids
        .map((id) => lookup(id) ?? current.find((item) => item.id === id))
        .filter((x): x is T => x !== undefined);
    const linesById = this._linesById();
    const vehiclesById = this._vehiclesById();
    const stationsById = this._stationsById();
    const categoriesById = this._categoriesById();
    return {
      ...link,
      url: this.editUrl(),
      title: this.editTitle(),
      // Mirrors the tri-state the server just applied: a cleared box RESETS the
      // event time to the submission time, so the optimistic row must show that
      // same fallback rather than keep the stale value it is replacing.
      occurredAt: occurredAtInputToIso(this.editOccurredAt()) ?? link.created,
      lines: resolve(this.selectedLineIds(), link.lines, (id) => linesById.get(id)),
      vehicles: resolve(this.selectedVehicleIds(), link.vehicles, (id) => vehiclesById.get(id)),
      stations: resolve(this.selectedStationIds(), link.stations, (id) => stationsById.get(id)),
      categories: resolve(this.selectedCategoryIds(), link.categories, (id) =>
        categoriesById.get(id),
      ),
    };
  }

  /** The detail sheet's Approve — the SAME two-write sequence the row's Approve
   *  runs, reached through the same `approveLink`, so the two surfaces cannot
   *  disagree about what approving means (and there is deliberately no
   *  panel-only variant to drift).
   *
   *  It closes the panel when the PUBLISH succeeded, including the partial-failure
   *  case: the row is live either way, the toast has already said whether it was
   *  also retired, and the sheet's `selectedLink` is a stale copy of a row the
   *  reload has already replaced. `markCompletedFromPanel` closes on the same
   *  rule. */
  protected async approveFromPanel(): Promise<void> {
    const link = this.selectedLink();
    if (!link) {
      return;
    }
    const ok = await this.approveLink(link);
    if (ok) {
      this.closeLinkPanel();
    }
  }

  protected async markCompletedFromPanel(): Promise<void> {
    const link = this.selectedLink();
    if (!link) {
      return;
    }
    const ok = await this.markCompleted(link);
    if (ok) {
      this.closeLinkPanel();
    }
  }

  /** Admin hard-delete of a link entry. Mirrors the spotting-history delete:
   *  a native confirm guard, then the admin mutation; on success the row is
   *  dropped locally and the panel closes. */
  protected async deleteLink(link: SocialMediaLinkRow): Promise<void> {
    if (!confirm("Delete this link entry? This can't be undone.")) {
      return;
    }
    this.isDeleting.set(true);
    try {
      const idToken = await this.auth.idToken();
      await this.graphql.request<DeleteSocialMediaLinkData, DeleteSocialMediaLinkVars>(
        DELETE_SOCIAL_MEDIA_LINK_MUTATION,
        { linkId: link.id },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.links.update((list) => list.filter((existing) => existing.id !== link.id));
      if (this.selectedLink()?.id === link.id) {
        this.closeLinkPanel();
      }
      this.toast.success("Link deleted", link.url);
    } catch (err) {
      this.toast.error(
        "Couldn't delete link",
        err instanceof Error ? err.message : "Unknown error",
      );
    } finally {
      this.isDeleting.set(false);
    }
  }

  /** The APPLIED filter snapshot the queue's query (and its completeness answer)
   *  is built from — the plain fields written when a control commits, never the
   *  live signals. See `appliedFiltersAreUnfiltered` and `queueQueryVars`. */
  private appliedSnapshot(): AppliedQueueFilters {
    return {
      search: this.appliedSearch,
      categoryId: this.appliedCategoryId,
      completed: this.appliedCompleted,
      lineId: this.appliedLineId,
      vehicleId: this.appliedVehicleId,
      stationId: this.appliedStationId,
      dateFrom: this.appliedDateFrom,
      dateTo: this.appliedDateTo,
    };
  }

  /** 🔴 A `load()` ARRIVING MID-LOAD IS QUEUED, NOT SWALLOWED.
   *
   *  The re-entrancy guard below exists so two filter changes cannot interleave
   *  two queries, and it does that job. What it used to do to the toolbar's "Show
   *  all links" was drop the click on the floor, and the drop was SILENT: the
   *  button had been disabled while `isLoading()` (the reason it was greyed), so
   *  the click could not land at all; the button is no longer disabled — it is the
   *  one action that must look ready — and `showAllLinks` has ALREADY rewritten
   *  the applied filter snapshot by the time it calls this. Swallowing the call
   *  would therefore leave the controls showing "All" over the PENDING rows that
   *  the in-flight query is still returning: the admin clicks "Show all links",
   *  the dials visibly change, and nothing happens.
   *
   *  So a second arrival parks a reload and `finishLoading()` replays it once the
   *  flag drops. The replay is what makes the click take effect; the filter
   *  snapshot it reads is already the unfiltered one.
   *
   *  ⚠️ THE DRAIN IS IN `finishLoading()`, NOT HERE, and that is load-bearing
   *  rather than tidiness. Six of the seven verbs that hold this flag — grouping,
   *  ungrouping, reordering, approve, hide, mark-completed — set it themselves and
   *  run `fetchLinks()` directly, so they never pass through this method. An admin
   *  who clicks "Show all links" while one of THEIR refetches is in flight parks a
   *  reload here, and if the drain lived in this `finally` it would sit unclaimed
   *  until some later unrelated `load()` spent it: the dials would read "All" over
   *  the PENDING rows the refetch returned, the hint would still be on screen, and
   *  the admin's click would appear to do nothing until they pressed it a second
   *  time — the swallowed click, relocated by one window. `finishLoading` is called
   *  from every site that drops the flag, so no in-flight request can strand it. */
  private async load(): Promise<void> {
    if (this.isLoading()) {
      this.reloadQueued = true;
      return;
    }
    this.isLoading.set(true);
    try {
      await this.fetchLinks();
    } finally {
      this.finishLoading();
    }
  }

  /** 🔴 THE ONE PLACE `isLoading` DROPS, and therefore the one place a reload
   *  parked by `load()` is drained.
   *
   *  Every verb that occupies the queue — `load()` itself and all six mutations —
   *  ends in a `finally` that hands off here, which is what makes the guarantee
   *  "a 'Show all links' click is never silently dropped" hold for ALL of them and
   *  not just for the one that goes through `load()`. The window that needs this is
   *  spelled out on `load()`: a mutation's own post-write refetch holds the flag
   *  long enough for the admin to click, and that refetch never returns here.
   *
   *  A METHOD RATHER THAN INLINE CODE in seven `finally` blocks because the rule has
   *  to hold for the NEXT verb too. An eighth site that cleared the flag directly
   *  would compile, pass every spec, and strand the next parked reload — the failure
   *  is invisible until an admin hits that exact window, so it belongs in one place
   *  a reader can check rather than in seven places a reader has to.
   *
   *  `void this.load()` is deliberate: the caller is inside its own `finally` and
   *  must not have its return value (the mutation's success/failure) overwritten by
   *  a follow-up query's outcome. It is fire-and-forget because `load()` is a pure
   *  side effect on signals, and re-entering it here is exactly the mid-load case it
   *  handles — `isLoading` is already false, so this is a normal fresh load, not a
   *  second arrival.
   *
   *  ⚠️ NOT FOR `isSaving` / `isDeleting`. Those are the DETAIL SHEET's two flags
   *  with their own lifecycles and their own buttons; routing them here would make a
   *  save replay a queued "Show all links", which no click asked for. */
  private finishLoading(): void {
    this.isLoading.set(false);
    if (this.reloadQueued) {
      this.reloadQueued = false;
      void this.load();
    }
  }

  /** The actual links query, without load()'s re-entrancy guard — callers
   * that already hold the loading flag (markCompleted) use this directly. */
  private async fetchLinks(): Promise<void> {
    /* 🔴 SNAPSHOT THE COMPLETENESS ANSWER BEFORE THE FIRST `await`, never read it
     * back after the request. `vars` below is built from the applied filter fields
     * in the same synchronous run, so the flag has to describe THAT query — and the
     * fields are mutable plain properties, not a signal, so a later read describes
     * whatever the admin has done since.
     *
     * The window is real: `showAllLinks` rewrites every applied field to the
     * unfiltered snapshot and calls `load()` while a FILTERED request is still in
     * flight. Reading `appliedFiltersAreUnfiltered()` after that request resolves
     * would read the NEW snapshot over rows the FILTERED query produced — the flag
     * would claim a whole queue over a partial page, and the sequence buttons would
     * light up over rows whose siblings are not loaded, which is precisely the state
     * the flag exists to prevent. Capturing it here is what keeps the flag and the
     * rows it describes from ever disagreeing. */
    const applied = this.appliedSnapshot();
    const queueIsComplete = appliedFiltersAreUnfiltered(applied);
    try {
      const idToken = await this.auth.idToken();
      const vars = queueQueryVars(applied);
      const data = await this.graphql.request<SocialMediaLinksQueryData, SocialMediaLinksQueryVars>(
        SOCIAL_MEDIA_LINKS_QUERY,
        vars,
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.links.set(data.socialMediaLinks);
      // The CAPTURED answer, not a fresh read — see the note above. Written only on
      // success, so the flag can never claim a whole queue over rows a failed query
      // never replaced. This is what gates the sequence actions.
      this.queueIsComplete.set(queueIsComplete);
    } catch (err) {
      this.toast.error("Couldn't load links", err instanceof Error ? err.message : "Unknown error");
    }
  }

  private async loadCategories(): Promise<void> {
    try {
      const idToken = await this.auth.idToken();
      const data = await this.graphql.request<ConsoleCategoriesQueryData>(
        CONSOLE_CATEGORIES_QUERY,
        undefined,
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.categories.set(data.calendarIncidentCategories);
    } catch (err) {
      this.toast.error(
        "Couldn't load categories",
        err instanceof Error ? err.message : "Unknown error",
      );
    }
  }
}
