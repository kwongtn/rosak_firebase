import { Component, computed, effect, inject, input, signal, untracked } from "@angular/core";
import { injectIsBrowser } from "../../../core/composables/is-browser";
import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient, GraphQLRequestError } from "../../../core/graphql/graphql-client";
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
import { moveBlockedReason, nestBlockedReason } from "./my-links-reasons.util";
import { MyLinksRowComponent } from "./my-links-row.component";
import {
  buildLinkShape,
  conversationLabelFor,
  indentClassForDepth,
  MoveDirection,
  reorderedRunIds,
  runOf,
  runOrderIsKnown,
} from "./my-links-tree.util";

const PAGE_SIZE = 20;

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
    HlmButton,
    HlmCheckbox,
    HlmSkeleton,
    InfiniteScrollDirective,
    MyLinksRowComponent,
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
                app-my-links-row
                [class]="_rowCardClass(link)"
                [attr.data-testid]="'row-' + link.id"
                [attr.data-depth]="_depthOf(link)"
                [link]="link"
                [selected]="_isSelected(link.id)"
                [threading]="_isThreading()"
                [conversationLabel]="_conversationLabel(link)"
                [moveUpReason]="_moveReason(link, 'up')"
                [moveDownReason]="_moveReason(link, 'down')"
                [nestReason]="_nestReason(link)"
                (toggleSelected)="toggleSelected(link.id)"
                (ungroup)="ungroupLink(link)"
                (moveUp)="moveLink(link, 'up')"
                (moveDown)="moveLink(link, 'down')"
                (nest)="nestSelectionUnder(link)"
              ></div>
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
  private readonly isBrowser = injectIsBrowser();

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

  /** The three structural facts about the loaded rows — depths, root-first ancestor chains and
   *  the stored-order sibling runs — derived in one pass. See `buildLinkShape` for the full
   *  derivation contract (the bounded, cycle-safe chain walk and the one-place run sort). */
  private readonly _shape = computed(() => buildLinkShape(this._links()));

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
    return hlm("gap-2.5 p-4", indentClassForDepth(this._depthOf(link)));
  }

  /** How many LOADED ancestors this row has; 0 when its parent is not in the loaded set. */
  protected _depthOf(link: PublicSocialMediaLink): number {
    return this._shape().depthById.get(link?.id ?? "") ?? 0;
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

  /** The stored-order sibling run this row belongs to — see `runOf`. The roots are one run,
   *  which is what lets "reorder the roots" (`parentId: null`) share the sublink code path. */
  private _runOf(link: PublicSocialMediaLink): PublicSocialMediaLink[] {
    return runOf(this._shape(), link);
  }

  /** Whether this row's stored order is readable at all — see `runOrderIsKnown`. A missing
   *  `position` is not `0`; a synthesised order is refused, not guessed. */
  private _runOrderIsKnown(link: PublicSocialMediaLink): boolean {
    return runOrderIsKnown(this._runOf(link));
  }

  /** `threadLabel(sublinkCount + 1)` — the conversation-size `+ 1` — see `conversationLabelFor`. */
  protected _conversationLabel(link: PublicSocialMediaLink): string {
    return conversationLabelFor(link);
  }

  /** May this row move one step inside its run? `null` means yes — see `moveBlockedReason`
   *  for the ordering of the gates and why the ends are judged on the STORED run. */
  protected _moveReason(link: PublicSocialMediaLink, direction: MoveDirection): string | null {
    const run = this._runOf(link);
    return moveBlockedReason({
      isBrowser: this.isBrowser,
      isThreading: this._isThreading(),
      hasMore: this._hasMore(),
      runOrderKnown: this._runOrderIsKnown(link),
      index: run.findIndex((row) => row.id === link?.id),
      runLength: run.length,
      direction,
    });
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
    // THE PAYLOAD IS THE STORED SIBLING ORDER WITH ONE ROW MOVED — see `reorderedRunIds`.
    // Building it from `_links()` directly would be the bug this method's comment above
    // exists to prevent.
    const ordered = reorderedRunIds(run, from, to);
    await this._saveStructure("Couldn't reorder these links", async () =>
      this.graphql.request<ReorderSocialMediaLinksData, ReorderSocialMediaLinksVars>(
        REORDER_SOCIAL_MEDIA_LINKS_MUTATION,
        { linkIds: ordered, parentId: link.parentId ?? null },
        await this._authHeaders(),
      ),
    );
  }

  /** May the ticked rows be nested UNDER this row? `null` means yes — see `nestBlockedReason`
   *  for the cycle (target-ticked / ticked-ancestor) and depth gates. */
  protected _nestReason(link: PublicSocialMediaLink): string | null {
    const targetId = link?.id ?? "";
    const selected = this._selectedSet();
    const ancestors = this._shape().ancestorsById.get(targetId) ?? [];
    return nestBlockedReason({
      targetId,
      isBrowser: this.isBrowser,
      isThreading: this._isThreading(),
      canNestSelection: canNest(this._scopedSelection()),
      targetSelected: selected.has(targetId),
      hasSelectedAncestor: ancestors.some((ancestorId) => selected.has(ancestorId)),
      depth: this._depthOf(link),
    });
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
