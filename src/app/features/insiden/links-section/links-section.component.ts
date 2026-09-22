import { Component, computed, inject, signal } from "@angular/core";
import { GraphQLClient, graphqlResource } from "../../../core/graphql/graphql-client";
import { HlmButton } from "../../../ui/button/button";
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";
import { RetryBannerComponent } from "../../../ui/retry-banner/retry-banner.component";
import { InfiniteScrollDirective } from "../../../ui/infinite-scroll/infinite-scroll.directive";
import { LinkListComponent } from "../link-list/link-list.component";
import {
  PUBLIC_SOCIAL_MEDIA_LINKS_QUERY,
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
 * — the full-dataset fetch is gone. Rendering is delegated to the shared LinkListComponent
 * (day grouping, pending collapsible, edit pencils); this host only owns pagination and
 * reload-on-sheet-close (dropping continuation pages of the stale dataset).
 */
@Component({
  selector: "app-links-section",
  imports: [
    HlmSkeleton,
    HlmButton,
    RetryBannerComponent,
    LinkListComponent,
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
      <app-link-list
        [links]="links()"
        [voteValues]="voteValues()"
        (voteChanged)="onVoteChanged($event)"
        (sheetClosed)="onSheetClosed()"
      />
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
    }
  `,
})
export class LinksSectionComponent {
  private readonly graphql = inject(GraphQLClient);

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

  /** Sheet close (edit submit or cancel) changed the data server-side: drop the appended
   * continuation pages (they belong to the stale dataset) and refetch the first page. The
   * open→closed edge itself is detected by LinkListComponent, which emits `sheetClosed`. */
  protected onSheetClosed(): void {
    this.appendedEdges.set([]);
    this.appendedHasNext.set(null);
    this.nextCursor.set(null);
    this.linksResource.reload();
  }

  /** Per-link vote overlay handed to the list (the cards' optimistic copy). */
  protected readonly voteValues = signal<Record<string, number>>({});

  protected onVoteChanged(event: { id: string; value: number }): void {
    this.voteValues.update((prev) => ({ ...prev, [event.id]: event.value }));
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
