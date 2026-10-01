import {
  Component,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from "@angular/core";
import { DatePipe, isPlatformBrowser } from "@angular/common";
import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient, GraphQLRequestError } from "../../../core/graphql/graphql-client";
import { HlmBadge } from "../../../ui/badge/badge";
import { HlmButton } from "../../../ui/button/button";
import { HlmCardImports } from "../../../ui/card/card";
import { HlmCheckbox } from "../../../ui/checkbox/checkbox";
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";
import { ToastService } from "../../../ui/toast/toast.service";
import { hlm } from "../../../ui/utils/hlm";
import { InfiniteScrollDirective } from "../../../ui/infinite-scroll/infinite-scroll.directive";
import {
  GROUP_SOCIAL_MEDIA_LINKS_MUTATION,
  GroupSocialMediaLinksData,
  GroupSocialMediaLinksVars,
  PUBLIC_SOCIAL_MEDIA_LINKS_QUERY,
  PublicSocialMediaLink,
  PublicSocialMediaLinksQueryData,
  PublicSocialMediaLinksVars,
  REORDER_SOCIAL_MEDIA_LINKS_MUTATION,
  ReorderSocialMediaLinksData,
  ReorderSocialMediaLinksVars,
  UNGROUP_SOCIAL_MEDIA_LINKS_MUTATION,
  UngroupSocialMediaLinksData,
  UngroupSocialMediaLinksVars,
} from "../../insiden/data/social-links.queries";
import {
  areAllSelected,
  canGroup,
  canNest,
  selectedWithin,
  threadLabel,
  toggleSelection,
} from "../../insiden/data/link-thread-selection.util";
import { linkStatusLabel, linkStatusVariant } from "./my-links-status.util";

const PAGE_SIZE = 20;

/**
 * Sibling-run key for the rows that are ROOTS. Ids are decimal strings from a
 * sequence column, so a value no id can take is a safe sentinel — and it makes the
 * "roots are one run" rule visible at the point the run is keyed rather than
 * hidden behind a `?? null` that reads like a missing parent.
 */
const ROOT_RUN_KEY = "#roots";

/**
 * Which way a row moves inside its sibling run. A two-value union, not a number:
 * the sign of an offset is the kind of thing that ends up multiplied by a scale
 * factor somewhere downstream, and "up" / "down" is what the button says.
 */
type MoveDirection = "up" | "down";

/**
 * Client-side mirror of the backend's write-side cap on tree depth
 * (`rosak_backend/incident/services/social_link_threads.py: MAX_THREAD_DEPTH = 3`,
 * a root being 0). 🔴 This is a mirror, NOT the authority: it exists so the nest
 * action can be disabled with a reason instead of offering a call the server will
 * reject, and a mirror that drifts is only ever optimistic — the backend still
 * measures the resulting depth itself and rejects the whole call as a unit. The
 * one thing it must never become is permissive past the real cap, so the
 * comparison below is "target is already at or past the cap" rather than any
 * attempt to also predict the depth of the links being moved (which is server
 * state this page does not have).
 */
const MAX_NEST_DEPTH = 3;

/** A decimal id, the shape every link id in this feature has (GraphQL `ID`
 *  serialised from an integer primary key), used by the tie-break below to tell a
 *  numeric key from a non-numeric one rather than trusting `Number()`. */
const DECIMAL_ID = /^\d+$/;

/**
 * The order ONE SIBLING RUN is in: `position` ASC, then `id` ASC. Total, and never
 * the list's own order. Applied ONCE, where the runs are built, so the payload, the
 * move index and the "already first / already last" reasons all read the same array
 * and cannot disagree.
 *
 * WHY THIS IS THE WHOLE RULE: `reorderSocialMediaLinks` is a PERMUTATION of one
 * existing sibling set — backend `social_link_threads.py::_reorder_sync` renumbers
 * the ids it is given to `10, 20, 30, …` from the ORDER THEY ARRIVE IN and then
 * leaves every sibling it was not told about after them — so the list this
 * comparator orders IS the list the server writes. This document's rows arrive
 * `occurredAt DESC, id DESC`, a different ordering, and the backend builds a
 * conversation OLDEST-FIRST, so a conversation the user arranged arrives here
 * reversed. Permuting the arrival order would write the timeline over the story,
 * permanently, and report success.
 *
 * 🔴 WHY `id` IS A REQUIRED SECOND KEY, not a nicety: every structural write
 * renumbers a run to the exact `10, 20, 30, …` series, EXCEPT ungrouping — backend
 * `_ungroup_sync` writes `parent` ONLY ("inventing a root order nobody asked for is
 * a presentation change disguised as a repair"), so a promoted link keeps the number
 * it held under its old parent and can TIE with a root that already holds it. A
 * root's `parentId` is `null`, so every root is a sibling of every other root and
 * the ROOT run is where the collision is observable. Sorting on `position` alone
 * leaves that to the engine's sort stability, i.e. to arrival order all over again.
 *
 * The id comparison mirrors the backend's own `(position, pk)` (see
 * `schema/loaders.py::batch_load_sublink_subtrees`, which is what renders
 * `sublinks`), so a tie resolves the way the nested conversation list is DRAWN rather
 * than lexicographically — `"10"` would otherwise sort before `"9"`. Anything that is
 * not a decimal id falls back to a code-unit compare, which is still total.
 *
 * ⚠️ `position` is OPTIONAL on this row type, so the comparator has to stay total
 * over data that can be missing the key: an absent rank sorts as `0` HERE ONLY to
 * keep the comparison antisymmetric, and no decision is ever taken on that result —
 * `_runOrderIsKnown` refuses the whole run while any sibling lacks a rank (see the
 * note there for why a synthesised order is not an acceptable fallback). The `0` is
 * a tie-break of last resort inside a sort, not a claim about where the row sits.
 */
function compareStoredSequence(a: PublicSocialMediaLink, b: PublicSocialMediaLink): number {
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

/**
 * "My Submitted Links" (Task 23) — the one-way-street view from spec F2: a logged-in
 * user sees their own link submissions here (never others'), via the Task 10 `mine`
 * cursor-paginated connection. Data access mirrors <app-my-spottings> EXACTLY — this
 * is NOT graphqlResource (that is an HttpClient helper with no auth headers and would
 * 403 the `mine` filter): the idToken is minted per call and sent as firebase-auth-key;
 * on the server `auth.idToken()` resolves null and the query is skipped.
 *
 * CONVERSATION TREE (spec F7, submitter half, on the nested backend model). A
 * conversation is an ordered TREE: a row's `parentId` is null exactly when the row IS
 * a root (which is also true of every ordinary ungrouped link), and `sublinkCount` is
 * that row's OWN descendant count at any depth. Three things follow, and all three
 * were false under the old depth-1 model:
 *
 * 1. 🔴 A ROOT IS NOT "UNGROUPED". Under the old flat model `threadId == null` meant
 *    "in no group"; under the tree it means "this link is the HEAD of its own
 *    conversation". So Ungroup is offered on rows that HAVE a parent and never on a
 *    root: detaching a root is inert (its sublinks stay attached to it), and
 *    detaching a child promotes it to a root of its own without flattening what it
 *    carried. A row that is a root and has sublinks is a healthy conversation head,
 *    not a row awaiting repair.
 * 2. `threadLabel`'s parameter is a CONVERSATION SIZE, not a descendant count, so this
 *    page passes `sublinkCount + 1` (see `_conversationLabel`). A raw `sublinkCount`
 *    would delete the badge on a root with exactly ONE sublink.
 * 3. `isThreadRoot` is a ROOT MARKER that is ALSO true of every ungrouped link, so it
 *    is never an affordance gate. The only correct test for "this row has something
 *    below it" is `sublinkCount > 0`.
 *
 * The list stays FLAT on purpose, and that is a DELIBERATE consequence of the shape,
 * not a leftover: `mine` is never thread-collapsed server-side (so a submitter can
 * never lose their own sublinks behind a root), and `PUBLIC_SOCIAL_MEDIA_LINKS_QUERY`
 * deliberately does not select `sublinks` at all. Hierarchy is therefore shown by
 * INDENT (`_depthOf`), and a row whose parent has not been paged in renders at depth
 * 0 — it is a root as far as this page can prove, and indenting it under a parent it
 * cannot see would be a claim the payload does not support.
 *
 * Every selection question ("may I group this?", "is Select-all checked?", "does this
 * row show a badge?", "is this row movable?", "may I nest under this row?") is
 * answered by the SHARED helpers in `link-thread-selection.util.ts` where one exists,
 * so the admin console's triage table cannot drift from this surface. The tree-only
 * questions (depth, sibling run, reorder/nest reasons) are answered here, because
 * this page is the only submitter-side surface and the rules are stated in terms of a
 * paginated personal list.
 */
@Component({
  selector: "app-my-links",
  imports: [
    DatePipe,
    HlmBadge,
    HlmButton,
    HlmCheckbox,
    HlmSkeleton,
    InfiniteScrollDirective,
    ...HlmCardImports,
  ],
  template: `
    <div hlmCard>
      <div hlmCardHeader><h2 hlmCardTitle>My Submitted Links</h2></div>
      <div hlmCardContent>
        @if (_links().length === 0 && _isLoading()) {
          <div class="flex flex-col gap-4">
            <div hlmSkeleton class="h-24 w-full"></div>
            <div hlmSkeleton class="h-24 w-full"></div>
          </div>
        } @else if (_links().length === 0 && _loadError() !== null) {
          <div class="flex flex-col items-start gap-2">
            <p class="text-destructive text-sm">Couldn't load your submitted links.</p>
            <button
              type="button"
              hlmBtn
              variant="outline"
              size="sm"
              data-testid="retry-first-page"
              (click)="loadMore()"
            >
              Retry
            </button>
          </div>
        } @else if (_links().length === 0) {
          <p class="text-muted-foreground text-sm">No links submitted yet.</p>
        } @else {
          <!-- Grouping toolbar. Rendered ONLY once there is something to group: a "Select all"
               over an empty page would be a lie (areAllSelected is false for zero ids) and an
               invitation to send an empty selection to a mutation. -->
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="thread-toolbar">
            <label class="flex items-center gap-2 text-sm">
              <hlm-checkbox
                data-testid="select-all"
                [checked]="_allSelected()"
                (checkedChange)="toggleSelectAll()"
              />
              Select all
            </label>
            <span
              class="text-muted-foreground text-xs tabular-nums"
              data-testid="thread-selection-count"
            >
              {{ _selectedCount() }} selected
            </span>
            <!-- aria-describedby points at the hint below: the button is disabled until two
                 links are ticked, and a disabled control gives no explanation of its own. -->
            <button
              type="button"
              hlmBtn
              variant="outline"
              size="sm"
              data-testid="group-selected"
              aria-describedby="my-links-thread-hint"
              [disabled]="!_canGroupSelected() || _isThreading()"
              (click)="groupSelection()"
            >
              Group into thread
            </button>
          </div>
          <!-- Discoverability for a power nobody has seen before: ONE line of prose, not a
               tutorial and not a new route. It names both requirements (one to nest, two or
               more to group), the scope (your own submissions), all THREE verbs the backend
               supports — nest, group, order — and the payoff. Kept in step with the toolbar
               because a hint that under-sells the row actions reads as a bug report. -->
          <p
            id="my-links-thread-hint"
            class="text-muted-foreground text-xs"
            data-testid="thread-hint"
          >
            Tick one of your own submissions and nest it under another link with “Nest ticked here”
            — or tick two or more to group them into a thread. Then use the arrows on a row to set
            the order they read in; on the feed they read as one story, led by the link with the
            earliest event time.
          </p>
          <!-- The one reason that is GLOBAL rather than per row, so it is stated once here
               instead of on every row's tooltip: while another page is still coming, a sibling
               may simply not be loaded, and reorder is a permutation of a WHOLE sibling set. -->
          @if (_sequenceNotice(); as notice) {
            <p class="text-muted-foreground text-xs" data-testid="thread-sequence-notice">
              {{ notice }}
            </p>
          }

          <div class="flex flex-col gap-3">
            @for (link of _links(); track link.id) {
              <!-- The row is a CARD, not an anchor: the checkbox and the row actions are
                   interactive siblings of the link, never nested inside it (a control inside
                   an <a> would open the link on every tick). The indent is this card's own
                   padding-left, so the hierarchy is visible without nesting the list. -->
              <div
                hlmCard
                [class]="_rowCardClass(link)"
                [attr.data-testid]="'row-' + link.id"
                [attr.data-depth]="_depthOf(link)"
              >
                <div class="flex items-start gap-3">
                  <label class="flex shrink-0 items-center pt-0.5">
                    <hlm-checkbox
                      [checked]="_isSelected(link.id)"
                      [attr.data-testid]="'select-link-' + link.id"
                      (checkedChange)="toggleSelected(link.id)"
                    />
                    <!-- Visually hidden because the row's own title already names the link;
                         the checkbox still needs an accessible name of its own. -->
                    <span class="sr-only">Select {{ link.title || link.url }}</span>
                  </label>

                  <a
                    [href]="link.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex min-w-0 flex-1 flex-col gap-2.5"
                    [class]="_rowLinkClass(link)"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div class="flex min-w-0 flex-col gap-1">
                        <span class="line-clamp-1 text-sm font-semibold">
                          {{ link.title || link.url }}
                        </span>
                        @if (link.title) {
                          <span class="text-muted-foreground line-clamp-1 text-xs">
                            {{ link.url }}
                          </span>
                        }
                      </div>
                      <div class="flex shrink-0 flex-col items-end gap-1">
                        <span class="text-muted-foreground text-xs whitespace-nowrap">
                          {{ link.created | date: "MMM d, y HH:mm" }}
                        </span>
                        <span hlmBadge [variant]="linkStatusVariant(link)">
                          {{ linkStatusLabel(link) }}
                        </span>
                      </div>
                    </div>
                  </a>
                </div>

                <!-- The row's structural actions. Unconditional, because unlike the old
                     depth-1 model every row is now a candidate for all of them: a ROOT is a
                     valid nest target, a LEAF is a valid thing to move, and a disabled
                     control with a title explaining itself is more honest than a control
                     that silently is not there. -->
                <div class="flex flex-wrap items-center gap-2">
                  <!-- threadLabel answers "" for a conversation of one, and
                       sublinkCount + 1 IS the conversation size, so the badge's own
                       non-empty test is exactly the "sublinkCount > 0" gate. NEVER
                       isThreadRoot: it is true of every ungrouped link in the app. -->
                  @if (_conversationLabel(link); as label) {
                    <span hlmBadge variant="outline" [attr.data-testid]="'thread-badge-' + link.id">
                      Thread · {{ label }}
                    </span>
                  }
                  <!-- Ungroup ONLY on a row that HAS a parent. Under the tree a root is
                       the head of its conversation, not a row in no group: there is
                       nothing to detach, and its sublinks stay attached to it either
                       way, so a button here would promise a cascade that deliberately
                       does not exist. -->
                  @if (link.parentId) {
                    <button
                      type="button"
                      hlmBtn
                      variant="ghost"
                      size="xs"
                      [attr.data-testid]="'ungroup-' + link.id"
                      [disabled]="_isThreading()"
                      (click)="ungroupLink(link)"
                    >
                      Ungroup
                    </button>
                  }
                  <button
                    type="button"
                    hlmBtn
                    variant="ghost"
                    size="xs"
                    [attr.data-testid]="'move-up-' + link.id"
                    [title]="_moveReason(link, 'up') ?? ''"
                    [disabled]="_moveReason(link, 'up') !== null"
                    (click)="moveLink(link, 'up')"
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    hlmBtn
                    variant="ghost"
                    size="xs"
                    [attr.data-testid]="'move-down-' + link.id"
                    [title]="_moveReason(link, 'down') ?? ''"
                    [disabled]="_moveReason(link, 'down') !== null"
                    (click)="moveLink(link, 'down')"
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    hlmBtn
                    variant="ghost"
                    size="xs"
                    aria-describedby="my-links-thread-hint"
                    [attr.data-testid]="'nest-' + link.id"
                    [title]="_nestReason(link) ?? ''"
                    [disabled]="_nestReason(link) !== null"
                    (click)="nestSelectionUnder(link)"
                  >
                    Nest ticked here
                  </button>
                </div>
              </div>
            }

            @if (_hasMore()) {
              @if (_loadError() !== null) {
                <button
                  type="button"
                  hlmBtn
                  variant="outline"
                  size="sm"
                  class="self-start"
                  data-testid="retry-load-more"
                  (click)="loadMore()"
                >
                  Couldn't load more — retry
                </button>
              } @else {
                <div
                  appInfiniteScroll
                  [appInfiniteScrollLoading]="_isLoading()"
                  (loadMore)="loadMore()"
                  class="h-px"
                  aria-hidden="true"
                ></div>
              }
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class MyLinksComponent {
  /** Gate: this section is the caller's own submissions only (spec F2 one-way street). */
  readonly isOwnProfile = input.required<boolean>();

  protected readonly linkStatusLabel = linkStatusLabel;
  protected readonly linkStatusVariant = linkStatusVariant;
  /** Shared with the console triage table so the two surfaces pluralise conversations
   *  identically. Re-exposed on the class because that is the seam
   *  `link-thread-selection.util.ts` documents for this surface; the template itself no longer
   *  calls it, because the `+ 1` this page owes it is encapsulated in `_conversationLabel` and a
   *  template that could still reach the raw helper is a template that can one day pass a
   *  descendant count by mistake. */
  protected readonly threadLabel = threadLabel;

  private readonly graphql = inject(GraphQLClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  /** Firebase-id-token requests only exist in the browser; on the server `auth.idToken()`
   * resolves null and the `mine` query would just fail (same reasoning as my-spottings). */
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly _links = signal<PublicSocialMediaLink[]>([]);
  protected readonly _isLoading = signal(false);
  protected readonly _hasMore = signal(false);
  private readonly _nextCursor = signal<string | null>(null);
  protected readonly _loadError = signal<string | null>(null);

  /** The ticked link ids. Starts EMPTY and is never seeded from storage or a clock, so the
   * server-rendered markup and the hydrated one agree (a selection only exists after a click). */
  protected readonly selectedIds = signal<string[]>([]);
  /** True while a group / nest / reorder / ungroup is on the wire: it disables every
   * structural action and doubles as the reload window, during which the list on screen is
   * stale by definition. */
  protected readonly _isThreading = signal(false);

  private readonly _selectedSet = computed(() => new Set(this.selectedIds()));
  /** Every id currently rendered. The list only ever GROWS (pages append), so this is the whole
   * universe of rows a selection can name — and the scope `selectedWithin` is checked against. */
  private readonly _visibleIds = computed(() => this._links().map((link) => link.id));
  protected readonly _selectedCount = computed(() => this.selectedIds().length);
  /** The selection as it will be SENT: scoped to the rendered rows, so a selection that no
   * longer covers two visible rows can never produce a one-link "thread". */
  private readonly _scopedSelection = computed(() =>
    selectedWithin(this.selectedIds(), this._visibleIds()).filter(Boolean),
  );
  /** >= 2 distinct ids, per the shared rule: a one-link "thread" is a no-op that only looks
   * like a thread, so the GROUP action stays disabled for zero and for one. NESTING answers
   * to its own minimum (`canNest`, one id) because it sends a target: the same call with a
   * `parentId` makes the ticked row a real child, which is a write rather than an election. */
  protected readonly _canGroupSelected = computed(() => canGroup(this.selectedIds()));
  protected readonly _allSelected = computed(() =>
    areAllSelected(this.selectedIds(), this._visibleIds()),
  );

  /**
   * The three structural facts about the loaded set, derived in ONE pass and recomputed only
   * when the list changes:
   *   - `depthById`: how many loaded ancestors a row has. A row whose parent is not loaded has
   *     an EMPTY ancestor chain and therefore depth 0 — the row is a root as far as this page
   *     can prove, and indenting it under a parent it cannot see would be a claim the payload
   *     does not support (this is what a cursor boundary between a child and its parent looks
   *     like, and it happens on every page over `MAX_THREAD_DEPTH`).
   *   - `ancestorsById`: the same chains, root-first, which is what makes a NEST cycle
   *     detectable client-side: the target is fine unless some ticked link is on its chain.
   *   - `runs`: sibling runs keyed by `parentId` (roots under `ROOT_RUN_KEY`), each in the
   *     STORED order — `position` ASC, then `id` (see `compareStoredSequence`). Reorder
   *     permutes one run, so the run is the unit the action operates on, and the run's ORDER
   *     IS the payload: these rows arrive `occurredAt DESC, id DESC`, a different ordering
   *     from the one the server stores.
   *
   * The chain walk is bounded and cycle-safe. `seen` starts holding the row's own id and the
   * loop stops on a repeat, so hand-edited cyclic data (which the backend refuses to create,
   * but which a restore could contain) cannot hang the render; such a row simply renders at
   * the depth the walk reached. Depth is a function of the `parentId` chain and nothing
   * else, so no sequence of moves can change it and the indentation cannot come to disagree
   * with the run a reorder permutes.
   */
  private readonly _shape = computed(() => {
    const links = this._links();
    const parentOf = new Map<string, string | null>();
    for (const link of links) {
      parentOf.set(link.id, link.parentId ?? null);
    }
    const depthById = new Map<string, number>();
    const ancestorsById = new Map<string, string[]>();
    const runs = new Map<string, PublicSocialMediaLink[]>();
    for (const link of links) {
      const chain: string[] = [];
      const seen = new Set<string>([link.id]);
      let cursor = parentOf.get(link.id) ?? null;
      while (cursor && parentOf.has(cursor) && !seen.has(cursor)) {
        seen.add(cursor);
        chain.unshift(cursor);
        cursor = parentOf.get(cursor) ?? null;
      }
      ancestorsById.set(link.id, chain);
      depthById.set(link.id, chain.length);
      const runKey = link.parentId ?? ROOT_RUN_KEY;
      const run = runs.get(runKey);
      if (run) {
        run.push(link);
      } else {
        runs.set(runKey, [link]);
      }
    }
    // THE ONE PLACE THE SEQUENCE ORDER IS ESTABLISHED. Sorting here rather than at each
    // read is what makes `_runOf`, `_moveReason` and `moveLink` share a single answer:
    // they all take this array, so the payload a button sends and the "already first /
    // already last" reason printed on that button can never be derived from two
    // different orderings. The runs are freshly built here, so sorting in place touches
    // nothing the `_links` signal owns and re-renders are not at risk.
    for (const run of runs.values()) {
      run.sort(compareStoredSequence);
    }
    return { depthById, ancestorsById, runs };
  });

  /**
   * The one page-level caveat about ordering, and it is global because the cause is: while
   * `hasNextPage` is true, a row's sibling run MAY be spread across a page boundary, and
   * `reorderSocialMediaLinks` is a PERMUTATION of one whole sibling set. It does not reject a
   * partial list — it renumbers the sent rows first and appends the ones it was not told
   * about, which would silently push an unseen sibling to the end of the conversation. So the
   * control is disabled while the list is incomplete and the reason is stated in prose, rather
   * than relying on a server that will not complain.
   */
  protected readonly _sequenceNotice = computed(() =>
    this._hasMore()
      ? "Still loading more of your links — reordering turns on once the whole list is here, so a sibling you cannot see can never be pushed to the end of a conversation."
      : "",
  );

  /** The in-flight `loadMore` promise, so a mutation-triggered reload can wait out an
   * infinite-scroll page already on the wire instead of resetting the list underneath it. */
  private _loadInFlight: Promise<void> | null = null;

  constructor() {
    // Only dependency is isOwnProfile(); loadMore() runs untracked so appending
    // pages never re-trigger this effect (same trap as my-spottings).
    effect(() => {
      if (this.isOwnProfile()) {
        untracked(() => void this.loadMore());
      }
    });
  }

  /** A row's own card: the indent, merged with the static card padding so a conditional class
   *  can never lose (or win) a Tailwind conflict. `hlm()` is the repo's one merge helper. */
  protected _rowCardClass(link: PublicSocialMediaLink): string {
    return hlm("gap-2.5 p-4", this._indentClass(link));
  }

  /**
   * The depth ladder, as LITERAL Tailwind classes — the classes Tailwind emits are the ones
   * written out, so an interpolated one ("pl-" + n * 4) would silently produce no rule at
   * all. Clamped at the last step, which is also the deepest level the backend stores
   * (`MAX_THREAD_DEPTH = 3` admits four levels), so the clamp is unreachable for real data and
   * exists only so a hand-edited tree cannot walk off the end of the ladder.
   */
  private _indentClass(link: PublicSocialMediaLink): string {
    const ladder = ["", "pl-8", "pl-16", "pl-24", "pl-32"];
    const depth = this._depthOf(link);
    return depth >= ladder.length ? ladder[ladder.length - 1] : ladder[depth];
  }

  /** How many LOADED ancestors this row has; 0 when its parent is not in the loaded set. */
  protected _depthOf(link: PublicSocialMediaLink): number {
    return this._shape().depthById.get(link?.id ?? "") ?? 0;
  }

  /** A row's own link area: a ticked row is tinted so the selection is legible without
   *  counting checkboxes. `hlm()` merges the two halves so a conditional class can never
   *  lose (or win) a Tailwind conflict against the static one. */
  protected _rowLinkClass(link: PublicSocialMediaLink): string {
    return hlm("rounded-lg", this._isSelected(link.id) && "bg-primary/5");
  }

  protected _isSelected(id: string): boolean {
    return this._selectedSet().has(id);
  }

  protected toggleSelected(id: string): void {
    this.selectedIds.set(toggleSelection(this.selectedIds(), id));
  }

  /** Select-all / clear-all over the rendered rows. Uses `areAllSelected` for the decision so
   *  an empty page can never read as "all selected" and flip to a no-op clear. */
  protected toggleSelectAll(): void {
    this.selectedIds.set(this._allSelected() ? [] : [...this._visibleIds()]);
  }

  protected async loadMore(): Promise<void> {
    if (!this.isBrowser || this._isLoading()) {
      return;
    }
    this._loadInFlight = this._fetchPage();
    await this._loadInFlight;
  }

  /**
   * The run of siblings this row belongs to: every LOADED row with the same `parentId`, in
   * the STORED order (`position` ASC, then `id` — sorted once in `_shape`). It is NOT the
   * order the list arrived in, and it is not the order the cards are rendered in. The roots
   * are one run keyed by `ROOT_RUN_KEY`, which is what makes "reorder the roots"
   * (`parentId: null`) fall out of the same code path as a sublink run instead of needing a
   * second implementation.
   */
  private _runOf(link: PublicSocialMediaLink): PublicSocialMediaLink[] {
    return this._shape().runs.get(link?.parentId ?? ROOT_RUN_KEY) ?? [];
  }

  /**
   * Can this run's STORED order be read at all? False as soon as one sibling came back
   * without a `position`.
   *
   * 🔴 A MISSING `position` IS NOT ZERO, and the obvious `?? 0` is the bug this check
   * exists to prevent. The column is gap-spaced (`10, 20, 30, …`), so `0` does not mean
   * "before 10" — it is only the model's default for a row written outside `save()`. A
   * fallback would float the unknown row to the head of the conversation and then, because
   * a reorder is a PERMUTATION the server writes verbatim, make that guess the stored
   * sequence. A synthesised order is therefore refused rather than trusted: the button is
   * off, it says why, and nothing is sent. This is the same rule as the paging gate in
   * `_moveReason` — a precondition this page cannot prove means no call.
   *
   * It is a RUNTIME check on an OPTIONAL field, which is the whole point of the guard:
   * `position` is optional on `PublicSocialMediaLink` because that type is also the node
   * of the narrow `links(first: 10)` sub-select in the incident card, and `strict` /
   * `strictNullChecks` are off, so no compiler anywhere will tell a consumer the value can
   * be missing. The console's triage table applies the identical rule to the same
   * situation, so the two surfaces cannot disagree about it.
   */
  private _runOrderIsKnown(link: PublicSocialMediaLink): boolean {
    return this._runOf(link).every((row) => typeof row.position === "number");
  }

  /**
   * 🔴 WHY THIS `+ 1`, in one place: `threadLabel`'s parameter is a CONVERSATION SIZE — this
   * node plus its publicly-visible descendants — and it answers `""` for anything `<= 1`.
   * `sublinkCount` is the node's OWN descendant count, so a root with exactly ONE sublink
   * reports `1`, `threadLabel(1)` answers `""`, and the badge VANISHES off a row that has
   * something below it. Passing `sublinkCount + 1` also makes the empty-string case do the
   * gating for free: `0 + 1` is `1`, which is `""`, which is exactly the `sublinkCount > 0`
   * test — so the badge can never appear on a leaf and can never be `isThreadRoot`-gated.
   */
  protected _conversationLabel(link: PublicSocialMediaLink): string {
    return threadLabel((link?.sublinkCount ?? 0) + 1);
  }

  /**
   * May this row move one step inside its run? `null` means yes.
   *
   * The order of these checks is the order of how much they would mislead:
   *   1. an in-flight write, because the run on screen is about to be replaced;
   *   2. an INCOMPLETE run (another page is still coming) — checked BEFORE the ends, because
   *      "already first" is a claim about a set that may be missing rows, and a partial
   *      permutation is not rejected by the server, it silently reorders unseen siblings;
   *   3. an UNREADABLE stored order — likewise before the ends, for the same reason: which
   *      end a row sits at is a claim about the run's sequence, and there is no sequence
   *      to read. Sending a permutation of a guess is the failure this avoids;
   *   4. the ends, which are the ordinary, self-evident reason.
   *
   * The ends are judged on the STORED run (`position` ASC, `id` tie-break), never on the
   * order the pages arrived in: a conversation the backend assembled oldest-first arrives
   * here newest-first, so the two would name opposite rows and a user would be told the
   * first link of their story is the last.
   */
  protected _moveReason(link: PublicSocialMediaLink, direction: MoveDirection): string | null {
    if (!this.isBrowser) {
      return "Ordering your links needs a browser session.";
    }
    if (this._isThreading()) {
      return "Saving another change…";
    }
    if (this._hasMore()) {
      return "More of your links are still loading, so this row's siblings are not all here yet.";
    }
    if (!this._runOrderIsKnown(link)) {
      // Direction-agnostic on purpose: the whole run is unorderable, so neither of its
      // ends can honestly be named.
      return "One of the links sharing this parent arrived without its stored order (position), so the sequence they are in is unknown and reordering it would write a guess.";
    }
    const run = this._runOf(link);
    const index = run.findIndex((row) => row.id === link?.id);
    if (index < 0) {
      return "This row is no longer on the page.";
    }
    if (direction === "up" && index === 0) {
      return "Already first among the links that share its parent.";
    }
    if (direction === "down" && index === run.length - 1) {
      return "Already last among the links that share its parent.";
    }
    return null;
  }

  /**
   * Move one row one step inside its sibling run.
   *
   * The payload is the WHOLE run in its new order, not the two rows that swapped: the backend
   * treats `reorderSocialMediaLinks` as a permutation of one existing sibling set and rebuilds
   * the stored `position` values from the list it is given, so a two-item payload would renumber
   * the sent pair first and append every sibling it was not told about.
   *
   * `parentId` is ALWAYS present, and is the row's OWN parent: a nullable `null` is the
   * meaningful value that means "reorder the roots". Omitting the key is not the same thing —
   * it is an operation error, but NOT a schema one: the argument is `ID`, nullable with no SDL
   * default, so in GraphQL "required" IS "non-null" and an omitted key is LEGAL GraphQL that
   * `ProvidedRequiredArgumentsRule` never refuses. What rejects it is the RESOLVER'S OWN GUARD
   * (`if not parent_id: raise GraphQLError`, `interactions.py:287`), deliberately, at execution
   * time; it cannot be tightened to `ID!` because the meaningful `null` would then be a hard error.
   *
   * ⚠️ THE INVARIANT THIS CALL DEPENDS ON: `_runOf` returns the run in the STORED sibling
   * order — `position` ASC with `id` as the tie-break — so what follows is that order with
   * one row moved. NEVER the list's own `occurredAt DESC, id DESC` order, which is what
   * these pages arrived in and is a DIFFERENT ordering: a conversation the backend built
   * oldest-first arrives here newest-first, so permuting the arrival order would write the
   * timeline over the story and report success. `_moveReason` has already refused the click
   * if any sibling's `position` is missing, so the run being permuted is a sequence the client
   * actually read.
   *
   * The ticks are deliberately KEPT: a reorder changes no row's membership, and a user who has
   * just arranged a conversation and then wanted to nest something into it should not have to
   * re-tick. (Group and nest clear them, because those two DO change membership.)
   */
  protected async moveLink(link: PublicSocialMediaLink, direction: MoveDirection): Promise<void> {
    const linkId = link?.id ?? "";
    if (!linkId || this._moveReason(link, direction) !== null) {
      return;
    }
    const run = this._runOf(link);
    const from = run.findIndex((row) => row.id === linkId);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= run.length) {
      return;
    }
    // THE PAYLOAD IS THE STORED SIBLING ORDER WITH ONE ROW MOVED: `run` is already in
    // `position` ASC / `id` order, and the splice permutes exactly one element of it, so
    // the whole set is preserved. Building this from `_links()` directly would be the
    // bug this method's comment above exists to prevent.
    const ordered = run.map((row) => row.id);
    ordered.splice(to, 0, ...ordered.splice(from, 1));
    await this._saveStructure("Couldn't reorder these links", async () =>
      this.graphql.request<ReorderSocialMediaLinksData, ReorderSocialMediaLinksVars>(
        REORDER_SOCIAL_MEDIA_LINKS_MUTATION,
        { linkIds: ordered, parentId: link.parentId ?? null },
        await this._authHeaders(),
      ),
    );
  }

  /**
   * May the ticked rows be nested UNDER this row? `null` means yes.
   *
   * The cycle checks are the reason this is not simply "is the target ticked": nesting
   * `X` under `P` makes `X` a child of `P`, so a cycle exists whenever `P` is itself inside
   * the subtree of something being moved — which includes `P` being ticked AND `P` having a
   * ticked ancestor. The server rejects either as a unit, so the walk up `P`'s loaded chain
   * catches both before a call is made. A cycle through an ancestor that is NOT loaded is not
   * detectable here; that one is the server's to reject, and it arrives as a toast.
   *
   * The depth check is the client mirror of `MAX_THREAD_DEPTH` (see the constant): a target
   * already at the cap cannot take another level. It is deliberately the ONLY structural
   * precondition not answered from the selection.
   */
  protected _nestReason(link: PublicSocialMediaLink): string | null {
    const targetId = link?.id ?? "";
    if (!targetId) {
      return null;
    }
    if (!this.isBrowser) {
      return "Nesting needs a browser session.";
    }
    if (this._isThreading()) {
      return "Saving another change…";
    }
    if (!canNest(this._scopedSelection())) {
      return "Tick one of your own links first — it becomes a direct child of this one.";
    }
    const selected = this._selectedSet();
    if (selected.has(targetId)) {
      return "This link is ticked too — it cannot be nested under itself.";
    }
    const ancestors = this._shape().ancestorsById.get(targetId) ?? [];
    if (ancestors.some((ancestorId) => selected.has(ancestorId))) {
      return "This link already sits under a ticked link — nesting here would make the conversation cyclic.";
    }
    const depth = this._depthOf(link);
    if (depth >= MAX_NEST_DEPTH) {
      return "This link is already the deepest level a conversation may reach.";
    }
    return null;
  }

  /** Nest the ticked rows as DIRECT CHILDREN of `link`, which may itself be a sublink. */
  protected async nestSelectionUnder(link: PublicSocialMediaLink): Promise<void> {
    const targetId = link?.id ?? "";
    if (!targetId || this._nestReason(link) !== null) {
      return;
    }
    const linkIds = this._scopedSelection();
    await this._saveStructure(
      "Couldn't nest these links",
      async () =>
        this.graphql.request<GroupSocialMediaLinksData, GroupSocialMediaLinksVars>(
          GROUP_SOCIAL_MEDIA_LINKS_MUTATION,
          { linkIds, parentId: targetId },
          await this._authHeaders(),
        ),
      { clearSelection: true },
    );
  }

  /**
   * Group the ticked links into a NEW conversation.
   *
   * `parentId` is left OUT of the payload on purpose. The backend argument is `ID = null`
   * WITH a default, so omitting the key and sending `null` are the same request, and omitting
   * it is the spelling that cannot be confused with the nest mode — which is decided by the
   * KEY'S PRESENCE, since the same mutation with a `parentId` makes the selection children of
   * that link. The backend then elects the root (earliest `(occurredAt, id)`) and parents the
   * rest to it, so the tick order is irrelevant.
   *
   * The mutation returns the new tree's top node `id`, a GraphQL **`Int`** (not an `ID`
   * string, unlike every other id in this feature) — deliberately unused: the page reloads the
   * whole flat list rather than refetching one conversation, so nothing here may treat it as a
   * string id.
   *
   * Failure is ALL-OR-NOTHING server-side (the backend checks the selection as a unit), so
   * there is no partial group to reconcile: toast and leave the ticks exactly as they were.
   */
  protected async groupSelection(): Promise<void> {
    // Scope to the rendered rows before re-checking `canGroup`: the button's gate reads the
    // raw selection, and a selection that no longer covers two visible rows must not send a
    // one-link "thread".
    const linkIds = this._scopedSelection();
    if (!this.isBrowser || this._isThreading() || !canGroup(linkIds)) {
      return;
    }
    await this._saveStructure(
      "Couldn't group these links",
      async () =>
        this.graphql.request<GroupSocialMediaLinksData, GroupSocialMediaLinksVars>(
          GROUP_SOCIAL_MEDIA_LINKS_MUTATION,
          { linkIds },
          await this._authHeaders(),
        ),
      { clearSelection: true },
    );
  }

  /**
   * Detach ONE row from its parent.
   *
   * Sends just this row's id — "Ungroup" sits next to a row, so it means that row, not the
   * current selection. Offered only on a row that HAS a parent, which under the tree means
   * the row is a sublink: detaching it promotes it to a root of its own, and deliberately
   * does NOT flatten or re-root anything — the branch it carried stays attached to it, and
   * no re-root election happens. Ungrouping a ROOT is inert by the same rule (there is
   * nothing to detach), so no button is offered there and no cascade is implied anywhere.
   * The selection is left untouched: the row survives the reload as a root and can be ticked
   * straight back into a group.
   */
  protected async ungroupLink(link: PublicSocialMediaLink): Promise<void> {
    const linkId = link?.id ?? "";
    if (!this.isBrowser || this._isThreading() || !linkId || !link?.parentId) {
      return;
    }
    await this._saveStructure("Couldn't ungroup this link", async () =>
      this.graphql.request<UngroupSocialMediaLinksData, UngroupSocialMediaLinksVars>(
        UNGROUP_SOCIAL_MEDIA_LINKS_MUTATION,
        { linkIds: [linkId] },
        await this._authHeaders(),
      ),
    );
  }

  /**
   * The ONE place a structural write is wrapped, so the busy flag, the error split and the
   * reload cannot drift between the four verbs. `clearSelection` is per verb, not global:
   * group and nest change WHICH rows are in a conversation, so leaving stale ticks would
   * invite an accidental second action; a reorder changes no membership and keeps them.
   */
  private async _saveStructure(
    title: string,
    send: () => Promise<unknown>,
    { clearSelection = false }: { clearSelection?: boolean } = {},
  ): Promise<boolean> {
    this._isThreading.set(true);
    try {
      await send();
      if (clearSelection) {
        this.selectedIds.set([]);
      }
      await this._reloadList();
      return true;
    } catch (err) {
      this._reportThreadError(title, err);
      return false;
    } finally {
      this._isThreading.set(false);
    }
  }

  /** Mint the id token for a structural write. Both mutations and the reorder are
   *  `IsLoggedIn` and the ownership gate needs the caller's `common.User`, so an absent
   *  header fails as anonymous — the header is required, not decoration. */
  private async _authHeaders(): Promise<Record<string, string>> {
    const idToken = await this.auth.idToken();
    return idToken ? { "firebase-auth-key": idToken } : {};
  }

  /** Full reload from the first page — the only correct refresh after a structural write,
   *  because `parentId`/`sublinkCount`/the stored order are all server-computed, and while
   *  this document DOES select `position` a mutation returns only `ok`: there is no sequence
   *  in the response to patch, so a reload is the only way the page learns what it wrote. */
  private async _reloadList(): Promise<void> {
    // Let an in-flight scroll page finish FIRST: it appends to the CURRENT list, so clearing
    // underneath it would leave the reload racing a stale append.
    await this._loadInFlight;
    this._links.set([]);
    this._nextCursor.set(null);
    this._hasMore.set(false);
    this._loadError.set(null);
    await this.loadMore();
  }

  /**
   * A rejected structural write is an EXPECTED outcome (the ownership, cycle and depth gates
   * all reject the whole call as one unit), so it belongs in a toast with the server's own
   * wording — the list and the ticks are left untouched because nothing changed. A
   * `GraphQLRequestError` is already toasted and reported to Sentry by `GraphQLClient`;
   * anything else is genuinely unexpected and must reach the Sentry-backed global ErrorHandler
   * instead of dying quietly in a click handler (the same split <app-link-submit-box> makes).
   */
  private _reportThreadError(title: string, err: unknown): void {
    this.toast.error(title, err instanceof Error ? err.message : "Unknown error");
    if (!(err instanceof GraphQLRequestError)) {
      throw err;
    }
  }

  private async _fetchPage(): Promise<void> {
    this._isLoading.set(true);
    this._loadError.set(null);
    try {
      const idToken = await this.auth.idToken();
      const data = await this.graphql.request<
        PublicSocialMediaLinksQueryData,
        PublicSocialMediaLinksVars
      >(
        PUBLIC_SOCIAL_MEDIA_LINKS_QUERY,
        { mine: true, first: PAGE_SIZE, after: this._nextCursor() },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      const connection = data.publicSocialMediaLinks;
      this._links.update((list) => [...list, ...connection.edges.map((edge) => edge.node)]);
      this._hasMore.set(connection.pageInfo.hasNextPage);
      this._nextCursor.set(connection.pageInfo.endCursor);
    } catch (err) {
      this._loadError.set(err instanceof Error ? err.message : "Unknown error");
    } finally {
      this._isLoading.set(false);
    }
  }
}
