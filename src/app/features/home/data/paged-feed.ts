import { computed, signal } from "@angular/core";

import type { FeedQueryData, FeedQueryVars } from "./home-feed.queries";
import { dedupeEdges, maxFeedTotalCount, mergeFeedPageInfo } from "./home-feed.util";
import type { FeedLink, FeedLinkEdge, FeedLinkPageInfo } from "./home-feed-items";

/**
 * One feed window's pagination: a first page owned by a `graphqlResource` plus the Load More pages
 * appended behind it. `HomeStore` builds one for the Today feed and one for Last Week, so the
 * invariants below exist once and cannot drift between the two:
 *
 *  - **One variables source.** `variables` feeds the first-page resource AND every continuation
 *    (which adds only `after`), so a continuation can never disagree with its own first page about
 *    the window, the collapse flag, the page size or the line filter.
 *  - **Overlap dedupe.** A refetched page one can re-include a row an appended page already holds;
 *    {@link dedupeEdges} keeps one copy per id (see it for why a duplicate id is not cosmetic).
 *  - **Cursor reset.** {@link reset} drops every appended signal together, including the cursor. A
 *    cursor is only meaningful inside the query that minted it, so a filter change or a whole-dataset
 *    reload must clear them as one.
 *  - **Coalesced Load More.** {@link loadMore} is a no-op while one is in flight, when there is no
 *    next page and when there is no cursor.
 *
 * A plain class over signals, not an injectable: its owner decides the lifetime, and it holds no
 * dependency of its own (the first page and the request arrive as functions).
 */
export class PagedFeed {
  private readonly appendedEdges = signal<FeedLinkEdge[]>([]);
  private readonly appendedHasNext = signal<boolean | null>(null);
  private readonly appendedTotalCount = signal<number | null>(null);
  private readonly nextCursor = signal<string | null>(null);
  private readonly loadingMore = signal(false);

  /** First page + appended continuation pages, in backend order, de-duplicated by `node.id`. */
  private readonly edges = computed<FeedLinkEdge[]>(() =>
    dedupeEdges([
      ...(this.firstPage()?.publicSocialMediaLinks.edges ?? []),
      ...this.appendedEdges(),
    ]),
  );

  readonly links = computed<FeedLink[]>(() => this.edges().map((edge) => edge.node));

  readonly pageInfo = computed<FeedLinkPageInfo | null>(() =>
    mergeFeedPageInfo(
      this.firstPage()?.publicSocialMediaLinks.pageInfo ?? null,
      this.appendedHasNext(),
      this.nextCursor(),
    ),
  );

  /** The "Showing N of M" denominator — see {@link maxFeedTotalCount} for why it is a `Math.max`. */
  readonly totalCount = computed<number>(() =>
    maxFeedTotalCount(
      this.appendedTotalCount(),
      this.firstPage()?.publicSocialMediaLinks.totalCount ?? null,
    ),
  );

  /** True while a {@link loadMore} continuation page is in flight. */
  readonly isLoadingMore = this.loadingMore.asReadonly();

  constructor(
    /** The first page's answer (a resource's `data`). */
    private readonly firstPage: () => FeedQueryData | undefined,
    /** The window's variables, read at call time so a filter change is picked up. */
    private readonly variables: () => FeedQueryVars,
    /** Sends one page request. */
    private readonly request: (variables: FeedQueryVars) => Promise<FeedQueryData>,
  ) {}

  /** Drops every appended page and the cursor, so the next Load More starts from page one again. */
  reset(): void {
    this.appendedEdges.set([]);
    this.appendedHasNext.set(null);
    this.appendedTotalCount.set(null);
    this.nextCursor.set(null);
  }

  /** Loads the next page with the last page's cursor; see the class doc for when it is a no-op. */
  async loadMore(): Promise<void> {
    const pageInfo = this.pageInfo();
    const cursor = pageInfo?.endCursor ?? null;
    if (this.loadingMore() || !pageInfo?.hasNextPage || !cursor) {
      return;
    }
    this.loadingMore.set(true);
    try {
      const connection = (await this.request({ ...this.variables(), after: cursor }))
        .publicSocialMediaLinks;
      this.appendedEdges.update((prev) => [...prev, ...connection.edges]);
      this.appendedHasNext.set(connection.pageInfo.hasNextPage);
      this.appendedTotalCount.set(connection.totalCount);
      this.nextCursor.set(connection.pageInfo.endCursor);
    } finally {
      this.loadingMore.set(false);
    }
  }
}
