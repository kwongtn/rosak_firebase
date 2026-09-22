import { isPlatformBrowser } from "@angular/common";
import { Injectable, PLATFORM_ID, computed, inject, signal } from "@angular/core";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient, graphqlResource } from "../../../core/graphql/graphql-client";
import { PollingSource } from "../../../core/polling/polling-source";
import {
  FEED_QUERY,
  FeedLink,
  FeedLinkEdge,
  FeedLinkPageInfo,
  FeedQueryData,
  FeedQueryVars,
  FRONT_PAGE_LINES_QUERY,
  FrontPageLinesQueryData,
  LinePulse,
} from "./home.queries";

/** Links per GraphQL page: the initial read and every `loadMore()` continuation ask for this
 * many. Kept small and equal to `HomePage`'s `FEED_INITIAL_VISIBLE` so the first render is
 * exactly one fetched page and one "Load More" reveals one continuation page. */
export const FEED_PAGE_SIZE = 8;

/**
 * Route-scoped store for the community front page (provided by the route in a later wave —
 * deliberately NOT `providedIn: "root"`). Owns the two reads the page needs (the line pulse
 * list and the public feed), cursor pagination for the feed, a shared polling beat, and a
 * per-user vote overlay.
 *
 * The overlay exists because `graphqlResource()` sends no auth token, so `userVote` from the
 * feed is always 0. When logged in, one authenticated `GraphQLClient.request` re-reads the
 * first feed page with the caller's idToken and records every non-zero vote; `userVoteFor()`
 * prefers that overlay over the anonymous feed value.
 */
@Injectable()
export class HomeStore {
  private readonly graphql = inject(GraphQLClient);
  private readonly auth = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly linesResource = graphqlResource<FrontPageLinesQueryData>(() => ({
    query: FRONT_PAGE_LINES_QUERY,
  }));

  private readonly feedResource = graphqlResource<FeedQueryData, FeedQueryVars>(() => ({
    query: FEED_QUERY,
    variables: { first: FEED_PAGE_SIZE, status: "LIVE", currentServiceDayOnly: true },
  }));

  readonly lines = computed<LinePulse[]>(() => this.linesResource.data()?.lines ?? []);

  private readonly appendedEdges = signal<FeedLinkEdge[]>([]);
  private readonly appendedHasNext = signal<boolean | null>(null);
  private readonly appendedTotalCount = signal<number | null>(null);
  private readonly nextCursor = signal<string | null>(null);
  private readonly loadingMore = signal(false);

  /** First page (resource) + appended continuation pages, in backend order. */
  private readonly edges = computed<FeedLinkEdge[]>(() => [
    ...(this.feedResource.data()?.publicSocialMediaLinks.edges ?? []),
    ...this.appendedEdges(),
  ]);

  readonly feedLinks = computed<FeedLink[]>(() => this.edges().map((edge) => edge.node));

  readonly feedPageInfo = computed<FeedLinkPageInfo | null>(() => {
    const first = this.feedResource.data()?.publicSocialMediaLinks.pageInfo;
    if (!first) {
      return null;
    }
    return {
      hasNextPage: this.appendedHasNext() ?? first.hasNextPage,
      endCursor: this.nextCursor() ?? first.endCursor,
    };
  });

  readonly feedTotalCount = computed<number>(() => {
    const first = this.feedResource.data()?.publicSocialMediaLinks.totalCount;
    return this.appendedTotalCount() ?? first ?? 0;
  });

  readonly isLoading = computed(
    () => this.linesResource.isLoading() || this.feedResource.isLoading(),
  );

  /** True while a `loadMore()` continuation page is in flight (the resources' own loading state
   * doesn't cover the manual request, so the page hides "Load More" on this too). */
  readonly isLoadingMore = this.loadingMore.asReadonly();

  readonly hasError = computed(() => this.linesResource.hasError() || this.feedResource.hasError());

  /** Per-user vote overlay, keyed by link id. Populated only for logged-in callers. */
  private readonly userVotes = signal<Record<string, number>>({});

  private readonly polling = new PollingSource(() => this.reloadAll());

  constructor() {
    // httpResource is lazy until first read — read both so the store fetches on creation
    // (the route-scoped store is created when the page mounts).
    this.lines();
    this.feedLinks();
    if (this.isBrowser) {
      void this.loadVoteOverlay();
    }
  }

  /** Starts the shared polling beat (no-op on the server). */
  start(): void {
    if (this.isBrowser) {
      this.polling.setIntervalMs(this.polling.intervalMs());
    }
  }

  /** Stops the shared polling beat. */
  stop(): void {
    this.polling.setIntervalMs(null);
  }

  /** The caller's vote for a link: overlay first, else the anonymous feed value, else 0. */
  userVoteFor(linkId: string): number {
    const overlay = this.userVotes()[linkId];
    if (overlay !== undefined) {
      return overlay;
    }
    return this.feedLinks().find((link) => link.id === linkId)?.userVote ?? 0;
  }

  /** Records the caller's vote after a successful vote mutation. */
  setUserVote(linkId: string, value: number): void {
    this.userVotes.update((prev) => ({ ...prev, [linkId]: value }));
  }

  /** Reloads both resources and drops appended continuation pages (they belong to the stale
   * dataset). */
  reloadAll(): void {
    this.appendedEdges.set([]);
    this.appendedHasNext.set(null);
    this.appendedTotalCount.set(null);
    this.nextCursor.set(null);
    this.linesResource.reload();
    this.feedResource.reload();
  }

  /** Loads the next feed page through the same query with the last page's cursor. Coalesced by
   * `loadingMore`; a no-op when there is no next page or no cursor. */
  async loadMore(): Promise<void> {
    const pageInfo = this.feedPageInfo();
    const cursor = pageInfo?.endCursor ?? null;
    if (this.loadingMore() || !pageInfo?.hasNextPage || !cursor) {
      return;
    }
    this.loadingMore.set(true);
    try {
      const data = await this.graphql.request<FeedQueryData, FeedQueryVars>(FEED_QUERY, {
        first: FEED_PAGE_SIZE,
        after: cursor,
        status: "LIVE",
        currentServiceDayOnly: true,
      });
      const connection = data.publicSocialMediaLinks;
      this.appendedEdges.update((prev) => [...prev, ...connection.edges]);
      this.appendedHasNext.set(connection.pageInfo.hasNextPage);
      this.appendedTotalCount.set(connection.totalCount);
      this.nextCursor.set(connection.pageInfo.endCursor);
    } finally {
      this.loadingMore.set(false);
    }
  }

  /** One authenticated read of the first feed page, recording every non-zero vote. */
  private async loadVoteOverlay(): Promise<void> {
    await this.auth.whenReady;
    if (!this.auth.isLoggedIn()) {
      return;
    }
    const token = await this.auth.idToken();
    if (!token) {
      return;
    }
    const data = await this.graphql.request<FeedQueryData, FeedQueryVars>(
      FEED_QUERY,
      { first: FEED_PAGE_SIZE, status: "LIVE" },
      { "firebase-auth-key": token },
    );
    const overlay: Record<string, number> = {};
    for (const edge of data.publicSocialMediaLinks.edges) {
      if (edge.node.userVote !== 0) {
        overlay[edge.node.id] = edge.node.userVote;
      }
    }
    this.userVotes.set(overlay);
  }
}
