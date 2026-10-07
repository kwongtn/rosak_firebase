import { Component, ElementRef, computed, effect, inject, viewChild } from "@angular/core";

import { AuthService } from "../../../core/auth/auth.service";
import { HlmButton } from "../../../ui/button/button";
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";
import { HlmInput } from "../../../ui/input/input";
import { HlmNativeSelect } from "../../../ui/select/native-select";
import { canEditLink } from "../../insiden/data/can-edit.link.util";
import { LinkCardItem } from "../../insiden/data/link-card-item";
import { LinkSheetService } from "../../insiden/data/link-sheet.service";
import { LinkThreadComponent } from "../../insiden/link-thread/link-thread.component";
import {
  FEED_LINK_STATUS_FILTERS,
  FeedLinkStatusFilter,
  filterFeedLinks,
} from "../data/feed-filter.util";
import { HomeStore } from "../data/home.store";

/**
 * What the widget says when a filter matches nothing.
 *
 * NOT "No links today." — that is the rider feed's message for an empty day, and reusing it here
 * would blame the network for a narrowing the reader just chose. The wording names the cause, which is
 * the one thing the reader can act on.
 */
const PRO_FEED_EMPTY_COPY = "No links match these filters.";

/**
 * The Pro dashboard's COMMUNITY FEED widget — the rider feed's reading surface with three filters on
 * top, and nothing else new.
 *
 * 🔴 **Rows render through `app-link-thread`, exactly as the rider feed renders them.** The thread
 * wrapper (and the card underneath) is the shared conversation UI every list in this app uses; a Pro
 * row that rendered through anything else would be a second link row in the codebase, and the vote
 * and edit wiring below has to be re-implemented rather than inherited. Vote and edit bind the SAME
 * store signals the rider feed binds, so a vote cast here is the same vote and the overlay's
 * completeness invariant is untouched.
 *
 * The three filters sit on opposite sides of the network boundary, which is the whole design:
 *
 *  - **The LINE filter is the BACKEND's.** `HomeStore.setLineFilter()` narrows `$lineId` on the
 *    connection itself, and it has to: a keyset cursor is only meaningful inside the query that
 *    minted it, so a client-side filter over an unfiltered page would splice unrelated links together
 *    the moment the reader pressed Load More. The store already clears every appended page on that
 *    edge, so the denominator and the rows stay the same query's.
 *  - **The STATUS (provenance) and TEXT filters are CLIENT-side**, over the rows currently resident,
 *    because the connection exposes no argument for either. They are the pure
 *    `filterFeedLinks`, which treats a conversation as ONE unit — a root is kept when a match is
 *    anywhere in its tree, and a kept root keeps its WHOLE tree. Dropping the non-matching members
 *    would make the root's own "N links" chip lie and expanding it would show nothing.
 *
 * 🔴 **This widget shows TODAY only.** The rider feed's collapsed "Last Week" section is a Rider
 * surface and stays there. A Pro reader who wants last week has a filter they do not have — search
 * over a 7-day, day-aligned window with client-side narrowing on top would mean a second resident set,
 * a second count and a second cursor, for a second of the screen. One window per surface, stated here
 * so a reader who searched for something from Tuesday is not left concluding it was never filed.
 *
 * `focusSearch()` is public because the dashboard's `/` shortcut has to move focus into this input
 * from outside: the keyboard handler lives with the other shortcuts, and a document-level listener
 * cannot reach into a sibling's template. One input, one owner of "where does `/` go".
 */
@Component({
  selector: "app-pro-feed-widget",
  imports: [HlmButton, HlmInput, HlmNativeSelect, HlmSkeleton, LinkThreadComponent],
  template: `
    <section
      class="border-border bg-card flex flex-col gap-3 rounded-xl border p-4"
      data-testid="pro-feed-widget"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-sm font-semibold tracking-wide uppercase">Community feed</h2>
        <!-- The window this widget actually searches, said on the surface rather than left for the
             reader to discover: a Pro reader looking for Tuesday's link is otherwise told, wrongly,
             that nobody filed it. -->
        <span class="text-muted-foreground text-xs" data-testid="pro-feed-window">Today only</span>
      </div>

      <div class="flex flex-wrap items-end gap-3" data-testid="pro-feed-filters">
        <label class="flex min-w-0 flex-1 flex-col gap-1 text-xs">
          <span class="text-muted-foreground">Search</span>
          <!-- A focus-visible ring rather than focus alone: the / shortcut moves focus here
               programmatically, and a reader who arrived by keyboard must be able to SEE where they
               are. The ring is brand, not the default ring, so it is visible against the card in
               both themes, and the ring-offset-background token keeps it from reading as a filled box. -->
          <input
            #searchInput
            hlmInput
            type="text"
            name="q"
            autocomplete="off"
            placeholder="Title, link, or reporter"
            class="focus-visible:ring-brand focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            data-testid="pro-feed-search"
            [value]="store.feedSearchQuery()"
            (input)="onSearchChanged($event)"
          />
        </label>

        <label class="flex min-w-0 flex-col gap-1 text-xs">
          <span class="text-muted-foreground">Line</span>
          <select
            hlmSelect
            class="w-40"
            data-testid="pro-feed-line"
            [value]="store.lineFilter() ?? ''"
            (change)="onLineChanged($event)"
          >
            <option value="">All lines</option>
            @for (line of store.lines(); track line.id) {
              <option [value]="line.id">{{ line.code }} · {{ line.displayName }}</option>
            }
          </select>
        </label>

        <label class="flex min-w-0 flex-col gap-1 text-xs">
          <span class="text-muted-foreground">Source</span>
          <select
            hlmSelect
            class="w-40"
            data-testid="pro-feed-status"
            [value]="store.feedStatusFilter()"
            (change)="onStatusChanged($event)"
          >
            @for (status of _statusFilters; track status) {
              <option [value]="status">{{ _statusLabel(status) }}</option>
            }
          </select>
        </label>
      </div>

      @if (store.isLoading() && visible().length === 0) {
        <div hlmSkeleton class="h-24 w-full" data-testid="pro-feed-skeleton"></div>
      } @else if (visible().length === 0) {
        <p class="text-muted-foreground text-sm" data-testid="pro-feed-empty">
          {{ _emptyCopy }}
        </p>
      } @else {
        <div class="flex flex-col gap-3" data-testid="pro-feed-list">
          @for (link of visible(); track link.id) {
            <app-link-thread
              [link]="link"
              [userVote]="store.userVoteFor(link.id)"
              [voteValues]="store.userVotes()"
              [editable]="canEdit(link)"
              (voteChanged)="onVoteChanged($event)"
              (edit)="openEdit($event)"
            />
          }
        </div>
      }

      <!-- The same footer contract the rider feed uses, and for the same reason: "Showing X of Y" with
           Y as the FILTERED server total is the only way a reader can tell "that is everything" from
           "there are more". Load More continues the server-side query, which is why the line filter
           has to live there rather than here. -->
      @if (visible().length > 0) {
        <div class="flex items-center justify-end gap-3" data-testid="pro-feed-footer">
          <span class="text-muted-foreground text-xs" data-testid="pro-feed-count">
            Showing {{ visible().length }} of {{ store.feedTotalCount() }}
          </span>
          @if (canLoadMore()) {
            <button
              hlmBtn
              variant="outline"
              class="self-center"
              data-testid="pro-feed-load-more"
              (click)="loadMore()"
            >
              Load More
            </button>
          }
        </div>
      }
    </section>
  `,
})
export class ProFeedWidgetComponent {
  protected readonly store = inject(HomeStore);
  private readonly auth = inject(AuthService);
  private readonly linkSheet = inject(LinkSheetService);

  /** The search input, for the dashboard's `/` shortcut. Signal query — no decorator, no `@ViewChild`. */
  private readonly searchInput = viewChild.required<ElementRef<HTMLInputElement>>("searchInput");

  protected readonly _emptyCopy = PRO_FEED_EMPTY_COPY;
  protected readonly _statusFilters = FEED_LINK_STATUS_FILTERS;

  protected readonly _statusLabel = (status: FeedLinkStatusFilter): string =>
    status === "all" ? "All sources" : status === "official" ? "Official only" : "Community only";

  /**
   * The rows this widget draws: the store's resident roots, narrowed by the two client-side axes.
   *
   * The line filter is passed as well, and that is deliberate rather than redundant — see
   * `filterFeedLinks`. The server already narrowed the connection, so re-checking the same id can only
   * agree with it; what it adds is that a conversation survives when its only mention of the line is
   * on a member, which is the reading a reader means by "links about Kajang".
   */
  protected readonly visible = computed(() =>
    filterFeedLinks(this.store.feedLinks(), {
      lineId: this.store.lineFilter(),
      status: this.store.feedStatusFilter(),
      query: this.store.feedSearchQuery(),
    }),
  );

  /** Load More is offered only while another page exists and nothing is in flight — the rider feed's
   * own rule, for the same reason: a button that does nothing is worse than an absent one. */
  protected readonly canLoadMore = computed(
    () =>
      Boolean(this.store.feedPageInfo()?.hasNextPage) &&
      !this.store.isLoading() &&
      !this.store.isLoadingMore(),
  );

  /** Moves keyboard focus into the search box. The `/` shortcut's only job. */
  focusSearch(): void {
    this.searchInput().nativeElement.focus();
  }

  protected onSearchChanged(event: Event): void {
    this.store.setFeedSearchQuery((event.target as HTMLInputElement | null)?.value ?? "");
  }

  protected onLineChanged(event: Event): void {
    const value = (event.target as HTMLSelectElement | null)?.value ?? "";
    this.store.setLineFilter(value === "" ? null : value);
  }

  protected onStatusChanged(event: Event): void {
    const value = (event.target as HTMLSelectElement | null)?.value ?? "";
    this.store.setFeedStatusFilter(value === "" ? "all" : (value as FeedLinkStatusFilter));
  }

  protected loadMore(): void {
    void this.store.loadMore();
  }

  /** Author-or-admin gate for the card's edit pencil — identical to the rider feed's, so a Pro reader
   *  and a rider get the same pencil on the same row. */
  protected canEdit(link: LinkCardItem): boolean {
    return canEditLink(link, {
      isLoggedIn: this.auth.isLoggedIn(),
      isAdmin: this.auth.isAdmin(),
      userId: this.auth.user()?.uid ?? null,
    });
  }

  protected onVoteChanged(event: { id: string; value: number }): void {
    this.store.setUserVote(event.id, event.value);
  }

  protected openEdit(link: LinkCardItem): void {
    this.linkSheet.openEdit(link);
  }

  /**
   * An edit that closes the shared sheet reloads the feed, exactly as the rider page does.
   *
   * 🔴 **The same effect, not a reload on the submit itself.** The edit form is the feature's
   * component, not this feature's, and the only signal it exposes to a host is the sheet's open edge —
   * so a host that instead reloaded on some other trigger would either miss the edit or reload on a
   * cancel too. Duplicating the rider page's three-line effect is cheaper than forking the form's
   * contract, and it means an edit made from Pro and an edit made from the rider feed behave
   * identically.
   */
  constructor() {
    let wasOpen = false;
    effect(() => {
      const isOpen = this.linkSheet.isOpen();
      if (!isOpen && wasOpen) {
        this.store.reloadAll();
      }
      wasOpen = isOpen;
    });
  }
}
