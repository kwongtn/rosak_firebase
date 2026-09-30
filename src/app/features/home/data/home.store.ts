import { isPlatformBrowser } from "@angular/common";
import { Injectable, PLATFORM_ID, computed, inject, signal } from "@angular/core";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient, graphqlResource } from "../../../core/graphql/graphql-client";
import { PollingSource } from "../../../core/polling/polling-source";
import { FeedDayGroup, groupFeedLinksByDay } from "./feed-day-groups.util";
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
 * many. A fetch size only — the page renders every loaded link and "Load More" pulls one
 * more continuation page. */
export const FEED_PAGE_SIZE = 8;

/** Links per page for the collapsed "Last Week" section. Larger than the today feed because it
 * spans up to seven calendar days; `alignPageToDay` keeps a page from ending mid-day. */
export const LAST_WEEK_PAGE_SIZE = 20;

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

  /** The collapsed "Last Week" section's first page: last 7 calendar days (today + 6), day-aligned
   * pages. Variables are STATIC (only the boolean flags, never a computed date) so SSR's
   * TransferState hydrates without a refetch. */
  private readonly lastWeekResource = graphqlResource<FeedQueryData, FeedQueryVars>(() => ({
    query: FEED_QUERY,
    variables: {
      first: LAST_WEEK_PAGE_SIZE,
      status: "LIVE",
      lastWeekOnly: true,
      alignPageToDay: true,
    },
  }));

  readonly lines = computed<LinePulse[]>(() => this.linesResource.data()?.lines ?? []);

  private readonly appendedEdges = signal<FeedLinkEdge[]>([]);
  private readonly appendedHasNext = signal<boolean | null>(null);
  private readonly appendedTotalCount = signal<number | null>(null);
  private readonly nextCursor = signal<string | null>(null);
  private readonly loadingMore = signal(false);

  private readonly lastWeekAppendedEdges = signal<FeedLinkEdge[]>([]);
  private readonly lastWeekAppendedHasNext = signal<boolean | null>(null);
  private readonly lastWeekAppendedTotalCount = signal<number | null>(null);
  private readonly lastWeekNextCursor = signal<string | null>(null);
  private readonly lastWeekLoadingMore = signal(false);

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

  /** First page (resource) + appended continuation pages of the last-week section, in backend
   * order (newest-first). */
  private readonly lastWeekEdges = computed<FeedLinkEdge[]>(() => [
    ...(this.lastWeekResource.data()?.publicSocialMediaLinks.edges ?? []),
    ...this.lastWeekAppendedEdges(),
  ]);

  readonly lastWeekLinks = computed<FeedLink[]>(() =>
    this.lastWeekEdges().map((edge) => edge.node),
  );

  readonly lastWeekPageInfo = computed<FeedLinkPageInfo | null>(() => {
    const first = this.lastWeekResource.data()?.publicSocialMediaLinks.pageInfo;
    if (!first) {
      return null;
    }
    return {
      hasNextPage: this.lastWeekAppendedHasNext() ?? first.hasNextPage,
      endCursor: this.lastWeekNextCursor() ?? first.endCursor,
    };
  });

  readonly lastWeekTotalCount = computed<number>(() => {
    const first = this.lastWeekResource.data()?.publicSocialMediaLinks.totalCount;
    return this.lastWeekAppendedTotalCount() ?? first ?? 0;
  });

  /** The last-week links bucketed into local calendar days (up to 7 groups, newest first). */
  readonly lastWeekDayGroups = computed<FeedDayGroup[]>(() =>
    groupFeedLinksByDay(this.lastWeekLinks()),
  );

  /** True only for the last-week resource's very first, pristine fetch (drives its skeleton). */
  readonly isLoadingLastWeek = this.lastWeekResource.isLoading;

  /** True while a `loadMoreLastWeek()` continuation page is in flight. */
  readonly isLoadingMoreLastWeek = this.lastWeekLoadingMore.asReadonly();

  readonly isLoading = computed(
    () => this.linesResource.isLoading() || this.feedResource.isLoading(),
  );

  /** True while a `loadMore()` continuation page is in flight (the resources' own loading state
   * doesn't cover the manual request, so the page hides "Load More" on this too). */
  readonly isLoadingMore = this.loadingMore.asReadonly();

  readonly hasError = computed(
    () =>
      this.linesResource.hasError() ||
      this.feedResource.hasError() ||
      this.lastWeekResource.hasError(),
  );

  /** Per-user vote overlay, keyed by link id. Populated only for logged-in callers. */
  private readonly userVotes = signal<Record<string, number>>({});

  /** Bumped on every lines-only poll so the line cards' open accordions can re-read their own
   * data (`LinePulseListComponent` → `LinePulseCardComponent` → chart/reports). */
  readonly linesRefreshTick = signal(0);

  /**
   * The shared 30s beat. Public so the page can render its countdown
   * (`secondsRemaining()`) and a manual "Refresh now". The callback is lines-only on purpose —
   * a full `reloadAll()` would drop the feed's appended pages and the user's Load More
   * progress every 30 seconds.
   */
  readonly polling = new PollingSource(() => this.reloadLines());

  constructor() {
    // httpResource is lazy until first read — read both so the store fetches on creation
    // (the route-scoped store is created when the page mounts).
    this.lines();
    this.feedLinks();
    this.lastWeekLinks();
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

  /** Reloads all three resources and drops appended continuation pages (they belong to the stale
   * dataset). */
  reloadAll(): void {
    this.appendedEdges.set([]);
    this.appendedHasNext.set(null);
    this.appendedTotalCount.set(null);
    this.nextCursor.set(null);
    this.lastWeekAppendedEdges.set([]);
    this.lastWeekAppendedHasNext.set(null);
    this.lastWeekAppendedTotalCount.set(null);
    this.lastWeekNextCursor.set(null);
    this.linesResource.reload();
    this.feedResource.reload();
    this.lastWeekResource.reload();
  }

  /** The poll beat's refresh: lines only, so the feed (and the user's Load More progress)
   * survives every tick. Bumps `linesRefreshTick` for the open line accordions. */
  reloadLines(): void {
    this.linesResource.reload();
    this.linesRefreshTick.update((tick) => tick + 1);
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

  /** Loads the next day-aligned last-week page through the same query with the last page's
   * cursor. Coalesced by `lastWeekLoadingMore`; a no-op when there is no next page or no cursor. */
  async loadMoreLastWeek(): Promise<void> {
    const pageInfo = this.lastWeekPageInfo();
    const cursor = pageInfo?.endCursor ?? null;
    if (this.lastWeekLoadingMore() || !pageInfo?.hasNextPage || !cursor) {
      return;
    }
    this.lastWeekLoadingMore.set(true);
    try {
      const data = await this.graphql.request<FeedQueryData, FeedQueryVars>(FEED_QUERY, {
        first: LAST_WEEK_PAGE_SIZE,
        after: cursor,
        status: "LIVE",
        lastWeekOnly: true,
        alignPageToDay: true,
      });
      const connection = data.publicSocialMediaLinks;
      this.lastWeekAppendedEdges.update((prev) => [...prev, ...connection.edges]);
      this.lastWeekAppendedHasNext.set(connection.pageInfo.hasNextPage);
      this.lastWeekAppendedTotalCount.set(connection.totalCount);
      this.lastWeekNextCursor.set(connection.pageInfo.endCursor);
    } finally {
      this.lastWeekLoadingMore.set(false);
    }
  }

  /** Two authenticated reads — the today feed's first page and the last-week first page — merged
   * into one vote overlay (the anonymous feed value is always 0), recording every non-zero vote. */
  private async loadVoteOverlay(): Promise<void> {
    await this.auth.whenReady;
    if (!this.auth.isLoggedIn()) {
      return;
    }
    const token = await this.auth.idToken();
    if (!token) {
      return;
    }
    const headers = { "firebase-auth-key": token };
    // allSettled, not all: if one read fails, the other's votes must still land in the overlay.
    // A per-request failure is already surfaced by `GraphQLClient` (toast + Sentry), so there is
    // nothing to rethrow — and swallowing it keeps the constructor's fire-and-forget
    // `void this.loadVoteOverlay()` from producing an unhandled rejection.
    const results = await Promise.allSettled([
      this.graphql.request<FeedQueryData, FeedQueryVars>(
        FEED_QUERY,
        { first: FEED_PAGE_SIZE, status: "LIVE" },
        headers,
      ),
      this.graphql.request<FeedQueryData, FeedQueryVars>(
        FEED_QUERY,
        {
          first: LAST_WEEK_PAGE_SIZE,
          status: "LIVE",
          lastWeekOnly: true,
          alignPageToDay: true,
        },
        headers,
      ),
    ]);
    const overlay: Record<string, number> = {};
    for (const result of results) {
      if (result.status !== "fulfilled") {
        continue;
      }
      for (const edge of result.value.publicSocialMediaLinks.edges) {
        if (edge.node.userVote !== 0) {
          overlay[edge.node.id] = edge.node.userVote;
        }
      }
    }
    this.userVotes.set(overlay);
  }
}
