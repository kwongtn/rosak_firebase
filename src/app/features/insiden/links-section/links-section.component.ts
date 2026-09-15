import { Component, computed, effect, inject, signal } from "@angular/core";
import { DatePipe } from "@angular/common";
import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient, graphqlResource } from "../../../core/graphql/graphql-client";
import { HlmButton } from "../../../ui/button/button";
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";
import { RetryBannerComponent } from "../../../ui/retry-banner/retry-banner.component";
import { InfiniteScrollDirective } from "../../../ui/infinite-scroll/infinite-scroll.directive";
import { LinkCardComponent } from "../link-card/link-card.component";
import { canEditLink } from "../data/can-edit.link.util";
import { groupLinksByDay, linkDateKey } from "../data/link-day-group.util";
import { LinkSheetService } from "../data/link-sheet.service";
import {
  PUBLIC_SOCIAL_MEDIA_LINKS_QUERY,
  PublicSocialMediaLink,
  PublicSocialMediaLinkEdge,
  PublicSocialMediaLinksQueryData,
  PublicSocialMediaLinksVars,
} from "../data/social-links.queries";

const PAGE_SIZE = 20;

/**
 * The "Submitted Links" tab of /insiden: public social-media links (both approved and pending)
 * fetched through the cursor-paginated `publicSocialMediaLinks(first, after)` query (Task 10
 * backend, Task 16 infinite scroll). The first page loads through `graphqlResource` (SSR +
 * retry banner); continuation pages append below it, driven by the `appInfiniteScroll` sentinel
 * — the full-dataset fetch is gone. Approved (`completed === true`) cards render first with no
 * header, then — only when at least one pending link exists — a collapsed-by-default
 * "Pending (N)" collapsible using the repo's boolean-signal + @if expand/collapse idiom
 * (docs/components/insiden.md). Ordering is the backend's (created DESC, id DESC); pages append
 * in order, so the list stays monotonic without a client sort.
 */
@Component({
  selector: "app-links-section",
  imports: [
    DatePipe,
    HlmSkeleton,
    HlmButton,
    RetryBannerComponent,
    LinkCardComponent,
    InfiniteScrollDirective,
  ],
  template: `
    @if (isLoading()) {
      <div class="flex flex-col gap-4">
        <div hlmSkeleton class="h-24 w-full"></div>
        <div hlmSkeleton class="h-24 w-full"></div>
        <div hlmSkeleton class="h-24 w-full"></div>
      </div>
    } @else if (hasError()) {
      <app-retry-banner [resource]="linksResource" message="Couldn't load submitted links." />
    } @else {
      @if (links().length === 0) {
        <p class="text-muted-foreground text-sm">No submitted links yet.</p>
      }
      <div class="flex flex-col gap-4">
        @for (group of approvedGroups(); track group.key) {
          <div class="flex flex-col gap-2">
            @if (group.label) {
              <h2 class="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
                {{ group.label }}
              </h2>
            } @else if (group.key) {
              <h2 class="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
                {{ group.key | date: "MMMM d, y" : "UTC" }}
              </h2>
            }
            <div class="flex flex-col gap-2">
              @for (link of group.items; track link.id) {
                <app-link-card [link]="link" [editable]="canEdit(link)" (edit)="openEdit($event)" />
              }
            </div>
          </div>
        }
        @if (pending().length > 0) {
          <div class="flex flex-col gap-4">
            <button
              type="button"
              class="flex cursor-pointer items-center gap-1.5 self-start text-muted-foreground text-sm font-semibold tracking-wide uppercase"
              [attr.aria-expanded]="pendingExpanded()"
              (click)="pendingExpanded.set(!pendingExpanded())"
            >
              <svg
                viewBox="0 0 24 24"
                class="size-4 shrink-0 transition-transform"
                [class.rotate-180]="pendingExpanded()"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
              Pending ({{ pending().length }})
            </button>
            @if (pendingExpanded()) {
              <div class="flex flex-col gap-2">
                @for (link of pending(); track link.id) {
                  <app-link-card
                    [link]="link"
                    [editable]="canEdit(link)"
                    (edit)="openEdit($event)"
                  />
                }
              </div>
            }
          </div>
        }
        @if (hasNextPage()) {
          @if (loadMoreError()) {
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
            @if (loadingMore()) {
              <div hlmSkeleton class="h-24 w-full"></div>
            }
            <div
              appInfiniteScroll
              [appInfiniteScrollLoading]="loadingMore()"
              (loadMore)="loadMore()"
              class="h-px"
              aria-hidden="true"
            ></div>
          }
        }
      </div>
    }
  `,
})
export class LinksSectionComponent {
  private readonly graphql = inject(GraphQLClient);
  private readonly auth = inject(AuthService);
  private readonly linkSheet = inject(LinkSheetService);

  protected readonly linksResource = graphqlResource<PublicSocialMediaLinksQueryData>(() => ({
    query: PUBLIC_SOCIAL_MEDIA_LINKS_QUERY,
    variables: { first: PAGE_SIZE },
  }));

  protected readonly isLoading = this.linksResource.isLoading;
  protected readonly hasError = this.linksResource.hasError;

  private readonly appendedEdges = signal<PublicSocialMediaLinkEdge[]>([]);
  private readonly appendedHasNext = signal<boolean | null>(null);
  private readonly nextCursor = signal<string | null>(null);
  protected readonly loadingMore = signal(false);
  protected readonly loadMoreError = signal<string | null>(null);

  /** First page (resource) + appended continuation pages, in backend order. */
  private readonly edges = computed(() => [
    ...(this.linksResource.data()?.publicSocialMediaLinks.edges ?? []),
    ...this.appendedEdges(),
  ]);

  protected readonly links = computed(() => this.edges().map((edge) => edge.node));

  /** "Approved" on links = `completed === true` (the backend has no status enum for links). */
  protected readonly approved = computed(() => this.links().filter((link) => link.completed));
  protected readonly pending = computed(() => this.links().filter((link) => !link.completed));

  /** Approved links bucketed by UTC day (created-DESC preserved within each day). The
   * Today/Yesterday/date headers give the flood of incoming links a scannable rhythm; UTC so
   * SSR (server) and browser (viewer tz) agree on the buckets. */
  protected readonly approvedGroups = computed(() =>
    groupLinksByDay(this.approved(), linkDateKey(new Date().toISOString())),
  );

  protected readonly hasNextPage = computed(
    () =>
      this.appendedHasNext() ??
      this.linksResource.data()?.publicSocialMediaLinks.pageInfo.hasNextPage ??
      false,
  );

  protected readonly endCursor = computed(
    () =>
      this.nextCursor() ??
      this.linksResource.data()?.publicSocialMediaLinks.pageInfo.endCursor ??
      null,
  );

  /** Collapsed by default — pending links stay out of the way until explicitly requested. */
  protected readonly pendingExpanded = signal(false);

  /** Author-or-admin gate for the card's edit pencil (see can-edit.link.util). */
  protected canEdit(link: PublicSocialMediaLink): boolean {
    return canEditLink(link, {
      isLoggedIn: this.auth.isLoggedIn(),
      isAdmin: this.auth.isAdmin(),
      userId: this.auth.user()?.uid ?? null,
    });
  }

  /** Opens the sheet in edit mode for the clicked link. */
  protected openEdit(link: PublicSocialMediaLink): void {
    this.linkSheet.openEdit(link);
  }

  private _wasSheetOpen = false;

  constructor() {
    // Reload when the link sheet closes (edit submit or cancel): the edited link changed
    // server-side, so the first page must be refetched and appended continuation pages
    // dropped (they belong to the stale dataset).
    effect(() => {
      const isOpen = this.linkSheet.isOpen();
      if (!isOpen && this._wasSheetOpen) {
        this.appendedEdges.set([]);
        this.appendedHasNext.set(null);
        this.nextCursor.set(null);
        this.linksResource.reload();
      }
      this._wasSheetOpen = isOpen;
    });
  }

  /** Loads the next page through the same query with the last page's cursor. Coalesced
   * by `loadingMore`; a failure swaps the sentinel for an inline retry. */
  protected async loadMore(): Promise<void> {
    const cursor = this.endCursor();
    if (this.loadingMore() || !this.hasNextPage() || !cursor) {
      return;
    }
    this.loadingMore.set(true);
    this.loadMoreError.set(null);
    try {
      const data = await this.graphql.request<
        PublicSocialMediaLinksQueryData,
        PublicSocialMediaLinksVars
      >(PUBLIC_SOCIAL_MEDIA_LINKS_QUERY, { first: PAGE_SIZE, after: cursor });
      const connection = data.publicSocialMediaLinks;
      this.appendedEdges.update((prev) => [...prev, ...connection.edges]);
      this.appendedHasNext.set(connection.pageInfo.hasNextPage);
      this.nextCursor.set(connection.pageInfo.endCursor);
    } catch (err) {
      this.loadMoreError.set(err instanceof Error ? err.message : "Unknown error");
    } finally {
      this.loadingMore.set(false);
    }
  }
}
