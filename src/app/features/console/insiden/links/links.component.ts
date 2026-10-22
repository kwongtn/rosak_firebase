import { DatePipe } from "@angular/common";
import { Component, computed } from "@angular/core";
import { eventValue } from "../../../../core/util/dom-event.util";
import { HlmBadge } from "../../../../ui/badge/badge";
import { HlmButton } from "../../../../ui/button/button";
import { HlmIconButton } from "../../../../ui/icon-button/icon-button";
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
  filterStationOptionsOf,
  filterVehicleOptionsOf,
  indexLinesById,
  vehicleParentCodesOf,
} from "./link-reference.util";
import {
  AssetMultiSelectComponent,
  type AssetMultiSelectOption,
} from "../../../insiden/asset-multi-select/asset-multi-select.component";
import { injectInsidenReferenceOptions } from "../../../insiden/data/insiden-reference-options";
import { isSameMinute } from "../data/same-minute.util";
import { threadLabel } from "../../../insiden/data/link-thread-selection.util";
import { injectLinksQueue } from "./links-queue";
import { useLinksTree } from "./links-tree";
import { injectLinksActions } from "./links-actions";
import { injectLinkEditPanel } from "./link-edit-panel";

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
 * Approve is the publish gate for a community submission: it publishes
 * (`status: "LIVE"`) and then retires the row (`markSocialMediaLinkCompleted`)
 * in one ordered, single-reload sequence. Hide is its moderation counterpart
 * (`status: "HIDDEN"`) for rows that must not appear in the feed at all — it is
 * offered on every row that isn't already HIDDEN. A HIDDEN row instead offers
 * Unhide (`status: "LIVE"` ONLY, never a completion), which puts it back in the
 * feed without retiring it. Hide and Unhide both go through one private
 * `setLinkStatus`, which re-sends the row's full payload (the input is
 * replace-not-patch) and reloads. The console route is already
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
    HlmIconButton,
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
  /* The page is wired from four pieces: the queue's data and filters (`links-queue.ts`), the
   * selection and conversation tree (`links-tree.ts`), the row verbs (`links-actions.ts`) and the
   * detail sheet (`link-edit-panel.ts`). The template and the spec read every member off this
   * class, so each piece's members are re-exposed here under their own names. */
  private readonly queue = injectLinksQueue();
  private readonly tree = useLinksTree(this.queue.links, this.queue.queueIsComplete);
  private readonly actions = injectLinksActions(this.queue, this.tree);
  private readonly panel = injectLinkEditPanel(this.queue.links, this.actions, () =>
    this.referenceResource.data(),
  );
  /** The edit form's tag options, built like the public link form's (`injectInsidenReferenceOptions`),
   *  so a vehicle tagged without its line stays listed and removable. */
  private readonly reference = injectInsidenReferenceOptions(
    this.panel.selectedLineIds,
    this.panel.selectedVehicleIds,
  );

  protected readonly links = this.queue.links;
  protected readonly isLoading = this.queue.isLoading;
  protected readonly queueIsComplete = this.queue.queueIsComplete;
  protected readonly searchTerm = this.queue.searchTerm;
  protected readonly categoryId = this.queue.categoryId;
  protected readonly completedFilter = this.queue.completedFilter;
  protected readonly visibilityFilter = this.queue.visibilityFilter;
  protected readonly filterLineId = this.queue.filterLineId;
  protected readonly filterVehicleId = this.queue.filterVehicleId;
  protected readonly filterStationId = this.queue.filterStationId;
  protected readonly filterDateFrom = this.queue.filterDateFrom;
  protected readonly filterDateTo = this.queue.filterDateTo;
  protected readonly onSearchInput = this.queue.onSearchInput;
  protected readonly onCategoryChange = this.queue.onCategoryChange;
  protected readonly onCompletedFilterChange = this.queue.onCompletedFilterChange;
  protected readonly onVisibilityFilterChange = this.queue.onVisibilityFilterChange;
  protected readonly onFilterLineChange = this.queue.onFilterLineChange;
  protected readonly onFilterVehicleChange = this.queue.onFilterVehicleChange;
  protected readonly onFilterStationChange = this.queue.onFilterStationChange;
  protected readonly onDateFromInput = this.queue.onDateFromInput;
  protected readonly onDateToInput = this.queue.onDateToInput;
  protected readonly resetFilters = this.queue.resetFilters;
  protected readonly showAllLinks = this.queue.showAllLinks;

  protected readonly selectedIds = this.tree.selectedIds;
  protected readonly visibleLinkIds = this.tree.visibleLinkIds;
  protected readonly selectedCount = this.tree.selectedCount;
  protected readonly canGroupSelection = this.tree.canGroupSelection;
  protected readonly nestSelectionReady = this.tree.nestSelectionReady;
  protected readonly renderedLinkIds = this.tree.renderedLinkIds;
  protected readonly allVisibleSelected = this.tree.allVisibleSelected;
  protected readonly moveUpHelp = this.tree.moveUpHelp;
  protected readonly moveDownHelp = this.tree.moveDownHelp;
  protected readonly nestHelp = this.tree.nestHelp;
  protected readonly depthOf = this.tree.depthOf;
  protected readonly depthIndentPx = this.tree.depthIndentPx;
  protected readonly depthRails = this.tree.depthRails;
  protected readonly expandedIds = this.tree.expandedIds;
  protected readonly toggleExpanded = this.tree.toggleExpanded;
  protected readonly isExpanded = this.tree.isExpanded;
  protected readonly childCountOf = this.tree.childCountOf;
  protected readonly renderedLinks = this.tree.renderedLinks;
  protected readonly canMoveUp = this.tree.canMoveUp;
  protected readonly canMoveDown = this.tree.canMoveDown;
  protected readonly moveBlockedReason = this.tree.moveBlockedReason;
  protected readonly canNestUnder = this.tree.canNestUnder;
  protected readonly nestBlockedReason = this.tree.nestBlockedReason;
  protected readonly toggleRowSelection = this.tree.toggleRowSelection;
  protected readonly toggleSelectAll = this.tree.toggleSelectAll;
  protected readonly clearSelection = this.tree.clearSelection;

  protected readonly groupSelected = this.actions.groupSelected;
  protected readonly nestSelectedUnder = this.actions.nestSelectedUnder;
  protected readonly ungroupLink = this.actions.ungroupLink;
  protected readonly moveLinkUp = this.actions.moveLinkUp;
  protected readonly moveLinkDown = this.actions.moveLinkDown;
  protected readonly approveLink = this.actions.approveLink;
  protected readonly hideLink = this.actions.hideLink;
  protected readonly unhideLink = this.actions.unhideLink;
  protected readonly markCompleted = this.actions.markCompleted;

  protected readonly selectedLink = this.panel.selectedLink;
  protected readonly editUrl = this.panel.editUrl;
  protected readonly editTitle = this.panel.editTitle;
  protected readonly editOccurredAt = this.panel.editOccurredAt;
  protected readonly urlTouched = this.panel.urlTouched;
  protected readonly isEditing = this.panel.isEditing;
  protected readonly isSaving = this.panel.isSaving;
  protected readonly isDeleting = this.panel.isDeleting;
  protected readonly selectedLineIds = this.panel.selectedLineIds;
  protected readonly selectedVehicleIds = this.panel.selectedVehicleIds;
  protected readonly selectedStationIds = this.panel.selectedStationIds;
  protected readonly selectedCategoryIds = this.panel.selectedCategoryIds;
  protected readonly canSave = this.panel.canSave;
  protected readonly openLinkDetail = this.panel.openLinkDetail;
  protected readonly closeLinkPanel = this.panel.closeLinkPanel;
  protected readonly onEditUrlInput = this.panel.onEditUrlInput;
  protected readonly onEditTitleInput = this.panel.onEditTitleInput;
  protected readonly onEditOccurredAtInput = this.panel.onEditOccurredAtInput;
  protected readonly saveLinkEdit = this.panel.saveLinkEdit;
  protected readonly approveFromPanel = this.panel.approveFromPanel;
  protected readonly markCompletedFromPanel = this.panel.markCompletedFromPanel;
  protected readonly hideFromPanel = this.panel.hideFromPanel;
  protected readonly unhideFromPanel = this.panel.unhideFromPanel;
  protected readonly deleteLink = this.panel.deleteLink;

  protected readonly skeletonRows = [0, 1, 2, 3, 4];

  /** Typed `$event.target.value` for the edit panel's inputs (no `$any` in a template). */
  protected readonly eventValue = eventValue;

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

  protected readonly referenceResource = this.reference.resource;
  protected readonly lineOptions = this.reference.lineOptions;
  protected readonly vehicleOptions = this.reference.vehicleOptions;
  protected readonly stationOptions = this.reference.stationOptions;
  protected readonly categoryOptions = this.reference.categoryOptions;

  /** The Category filter's options, from the same reference read as the edit panel's tags (it
   *  already selects every category), not a second categories query. */
  protected readonly categories = computed(
    () => this.referenceResource.data()?.calendarIncidentCategories ?? [],
  );

  private readonly _linesById = computed(() => indexLinesById(this.referenceResource.data()));

  private readonly _vehicleParentCodes = computed(() =>
    vehicleParentCodesOf(this.referenceResource.data()),
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

  constructor() {
    this.queue.load();
  }
}
