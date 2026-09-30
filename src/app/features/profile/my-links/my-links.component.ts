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
  UNGROUP_SOCIAL_MEDIA_LINKS_MUTATION,
  UngroupSocialMediaLinksData,
  UngroupSocialMediaLinksVars,
} from "../../insiden/data/social-links.queries";
import {
  areAllSelected,
  canGroup,
  selectedWithin,
  threadLabel,
  toggleSelection,
} from "../../insiden/data/link-thread-selection.util";
import { linkStatusLabel, linkStatusVariant } from "./my-links-status.util";

const PAGE_SIZE = 20;

/**
 * "My Submitted Links" (Task 23) — the one-way-street view from spec F2: a logged-in
 * user sees their own link submissions here (never others'), via the Task 10 `mine`
 * cursor-paginated connection. Data access mirrors <app-my-spottings> EXACTLY — this
 * is NOT graphqlResource (that is an HttpClient helper with no auth headers and would
 * 403 the `mine` filter): the idToken is minted per call and sent as firebase-auth-key;
 * on the server `auth.idToken()` resolves null and the query is skipped.
 *
 * THREAD GROUPING (spec F7, submitter half). Ticking two or more of the caller's OWN
 * submissions and pressing "Group into thread" starts a NEW thread over them; the backend
 * elects the root (earliest `(occurredAt, id)`), so the tick order is irrelevant and the
 * button deliberately offers no "append to an existing thread" picker — a submitter cannot
 * see other people's threads, so choosing among them would be guesswork. Every selection
 * question ("may I group this?", "is Select-all checked?", "does this row show a badge?")
 * is answered by the SHARED helpers in `link-thread-selection.util.ts`, which the admin
 * console's triage table uses too, so the two surfaces cannot drift.
 *
 * The list stays FLAT on purpose (the backend never collapses `mine`): a person must be
 * able to see — and ungroup — every submission they ever made, including the ones an
 * admin has hidden. `collapseThreads` is therefore never sent, exactly as before.
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
               tutorial and not a new route. It names the requirement (two or more), the scope
               (your own submissions) and the payoff (they read as one story on the feed). -->
          <p
            id="my-links-thread-hint"
            class="text-muted-foreground text-xs"
            data-testid="thread-hint"
          >
            Tick two or more of your own submissions to group them into a thread — on the feed they
            read as one story. The link with the earliest event time becomes the thread's main link.
          </p>

          <div class="flex flex-col gap-3">
            @for (link of _links(); track link.id) {
              <!-- The row is a CARD, not an anchor: the checkbox and the Ungroup button are
                   interactive siblings of the link, never nested inside it (a control inside
                   an <a> would open the link on every tick). -->
              <div hlmCard class="gap-2.5 p-4">
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

                <!-- threadLabel() returns "" for an absent or <= 1 size, so an ordinary
                     unthreaded row (which is a degenerate one-member thread) renders neither
                     chip. Ungroup appears only on a MEMBER (threadId non-null): ungrouping
                     a ROOT is inert by design — its members stay attached — so offering the
                     button there would be a promise the backend cannot keep. -->
                @if (threadLabel(link.threadSize) || link.threadId) {
                  <div class="flex flex-wrap items-center gap-2">
                    @if (threadLabel(link.threadSize); as label) {
                      <span
                        hlmBadge
                        variant="outline"
                        [attr.data-testid]="'thread-badge-' + link.id"
                      >
                        Thread · {{ label }}
                      </span>
                    }
                    @if (link.threadId) {
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
                  </div>
                }
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
  /** Shared with the console triage table so the two surfaces pluralise threads identically. */
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
  /** True while a group/ungroup is on the wire: it disables both actions and doubles as the
   * reload window, during which the list on screen is stale by definition. */
  protected readonly _isThreading = signal(false);

  private readonly _selectedSet = computed(() => new Set(this.selectedIds()));
  /** Every id currently rendered. The list only ever GROWS (pages append), so this is the whole
   * universe of rows a selection can name — and the scope `selectedWithin` is checked against. */
  private readonly _visibleIds = computed(() => this._links().map((link) => link.id));
  protected readonly _selectedCount = computed(() => this.selectedIds().length);
  /** >= 2 distinct ids, per the shared rule: a one-link "thread" is a no-op that only looks
   * like a thread, so the action stays disabled for zero and for one. */
  protected readonly _canGroupSelected = computed(() => canGroup(this.selectedIds()));
  protected readonly _allSelected = computed(() =>
    areAllSelected(this.selectedIds(), this._visibleIds()),
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
   * Group the ticked links into a NEW thread.
   *
   * `threadId` is left OUT of the payload on purpose — omitting the key means "start a new
   * thread" (`ID = null` on the backend), which is the only mode a submitter can be offered.
   * The mutation also returns the new root's `id`, a GraphQL **`Int`** (not an `ID` string,
   * unlike every other id in this feature) — deliberately unused: the page reloads the whole
   * flat list rather than refetching one thread, so nothing here may treat it as a string id.
   *
   * Failure is ALL-OR-NOTHING server-side (the backend checks the selection as a unit), so
   * there is no partial group to reconcile: toast and leave the ticks exactly as they were.
   */
  protected async groupSelection(): Promise<void> {
    // Scope to the rendered rows before re-checking `canGroup`: the button's gate reads the
    // raw selection, and a selection that no longer covers two visible rows must not send a
    // one-link "thread".
    const linkIds = selectedWithin(this.selectedIds(), this._visibleIds()).filter(Boolean);
    if (!this.isBrowser || this._isThreading() || !canGroup(linkIds)) {
      return;
    }
    this._isThreading.set(true);
    try {
      const idToken = await this.auth.idToken();
      await this.graphql.request<GroupSocialMediaLinksData, GroupSocialMediaLinksVars>(
        GROUP_SOCIAL_MEDIA_LINKS_MUTATION,
        { linkIds },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.selectedIds.set([]);
      await this._reloadList();
    } catch (err) {
      this._reportThreadError("Couldn't group these links", err);
    } finally {
      this._isThreading.set(false);
    }
  }

  /**
   * Detach ONE member row from its thread.
   *
   * Sends just this row's id — "Ungroup" sits next to a row, so it means that row, not the
   * current selection. Deliberately not offering the action on a ROOT: ungrouping a root is
   * inert by design (its members stay attached) and ungrouping members leaves the original
   * root a singleton — no cascade, no re-root election, and therefore no UI implying either.
   * The selection is left untouched: the row survives the reload as a plain unthreaded link
   * and can be ticked straight back into a new group.
   */
  protected async ungroupLink(link: PublicSocialMediaLink): Promise<void> {
    const linkId = link?.id ?? "";
    if (!this.isBrowser || this._isThreading() || !linkId || !link?.threadId) {
      return;
    }
    this._isThreading.set(true);
    try {
      const idToken = await this.auth.idToken();
      await this.graphql.request<UngroupSocialMediaLinksData, UngroupSocialMediaLinksVars>(
        UNGROUP_SOCIAL_MEDIA_LINKS_MUTATION,
        { linkIds: [linkId] },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      await this._reloadList();
    } catch (err) {
      this._reportThreadError("Couldn't ungroup this link", err);
    } finally {
      this._isThreading.set(false);
    }
  }

  /** Full reload from the first page — the only correct refresh after a mutation, because
   *  `threadId`/`threadSize` are server-computed and nothing on this page can patch them. */
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
   * A rejected group/ungroup is an EXPECTED outcome (the ownership gate rejects the whole
   * selection as one unit), so it belongs in a toast with the server's own wording — the list
   * is left untouched because nothing changed. A `GraphQLRequestError` is already toasted and
   * reported to Sentry by `GraphQLClient`; anything else is genuinely unexpected and must
   * reach the Sentry-backed global ErrorHandler instead of dying quietly in a click handler
   * (the same split <app-link-submit-box> makes).
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
