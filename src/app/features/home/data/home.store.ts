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
 * The shared `collapseThreads` argument for every home-feed read — the two `graphqlResource`s, their
 * two `loadMore*` continuations, and the two authenticated vote-overlay reads.
 *
 * This is REQUIRED, not a cosmetic grouping preference, and the reason is the feed's ordering.
 * Every link list is ordered `occurredAt DESC, id DESC`, and a thread's members are NOT generally
 * adjacent in that order: an admin can group a 09:00 post with an 11:00 post, and the feed happily
 * returns two rows several positions apart — potentially on different pages. Client-side grouping of
 * a flat page is therefore unsound: a member can arrive with its root nowhere on the page, and the
 * two would render as two unrelated links.
 *
 * Collapsing pushes the decision to the backend, which returns thread ROOTS only and nests each
 * group's members under `threadLinks` — a self-contained unit that needs no second request. Two
 * consequences that make this the right call rather than merely a tidier one:
 * - `totalCount` counts ROOTS while collapsing, so the page's "Showing N of M" keeps counting the
 *   rows it actually renders instead of inflating behind threads the user has not expanded.
 * - The continuation pages MUST agree with the first page. A collapsed first page followed by an
 *   uncollapsed continuation would list every root twice and render its members as loose rows,
 *   which is why this constant is spread into `loadMore()`/`loadMoreLastWeek()` too.
 *
 * Deliberately the ONLY surface that collapses (plan decision 4): the /insiden tab, the situasi tab
 * and My Links stay flat lists and must not send this flag.
 *
 * SSR-safe: a compile-time constant, so the server render and the client hydration compute identical
 * variables and the TransferState payload is reused instead of refetched — the reason the last-week
 * window is a backend-computed boolean rather than a `new Date()` baked into the variables.
 */
const HOME_FEED_COLLAPSE_VARS = { collapseThreads: true } as const;

/**
 * Route-scoped store for the community front page (provided by the route in a later wave —
 * deliberately NOT `providedIn: "root"`). Owns the two reads the page needs (the line pulse
 * list and the public feed), cursor pagination for the feed, a shared polling beat, and a
 * per-user vote overlay.
 *
 * The overlay exists because `graphqlResource()` sends no auth token, so `userVote` from the
 * feed is always 0. When logged in, two authenticated `GraphQLClient.request` reads — one per feed
 * resource, with the same variables each of those resources sends, plus the caller's idToken as a
 * header — record every non-zero vote; `userVoteFor()` prefers that overlay over the anonymous feed
 * value, and `userVotes` exposes the whole map for hosts that render a thread (root + members) per
 * row. The read's variables and its window are load-bearing, not a convenience: see the invariant on
 * `loadVoteOverlay()`.
 *
 * This is the one surface that collapses threads — see `HOME_FEED_COLLAPSE_VARS` for why that is a
 * correctness requirement rather than a presentation choice.
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
    variables: {
      first: FEED_PAGE_SIZE,
      status: "LIVE",
      currentServiceDayOnly: true,
      ...HOME_FEED_COLLAPSE_VARS,
    },
  }));

  /** The collapsed "Last Week" section's first page: last 7 calendar days (today + 6), day-aligned
   * pages. Variables are STATIC (only the boolean flags, never a computed date) so SSR's
   * TransferState hydrates without a refetch. Collapses threads too — this surface renders
   * `app-link-thread` per day group exactly like the today feed, so an uncollapsed last week would
   * split a group across two day headers. */
  private readonly lastWeekResource = graphqlResource<FeedQueryData, FeedQueryVars>(() => ({
    query: FEED_QUERY,
    variables: {
      first: LAST_WEEK_PAGE_SIZE,
      status: "LIVE",
      lastWeekOnly: true,
      alignPageToDay: true,
      ...HOME_FEED_COLLAPSE_VARS,
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
  private readonly _userVotes = signal<Record<string, number>>({});

  /**
   * The overlay itself, as the `Record<string, number>` that `app-link-thread`'s `voteValues` input
   * takes — the home page hands every thread this ONE map instead of copying votes into page-local
   * state, so the store stays the single source of truth for optimistic votes.
   *
   * Per-id, not per-feed: a thread renders the root AND its members, and a member is votable, so a
   * single number bound to the wrapper would be wrong for every member. The wrapper's own fallback
   * chain (`voteValues[id]` → the root's scalar `userVote` → `link.userVote`) keeps this a pure
   * overlay — an absent id is "no opinion", not "0". That fallback is also why completeness is
   * load-bearing: an absent id silently renders the ANONYMOUS zero, so a rider who upvoted a
   * member sees the button unpressed with no error anywhere.
   *
   * INVARIANT — the overlay's read set must be the SAME READ as the rendered set: same query, same
   * variables, same collapse, same window, same page size (the auth header is the only difference).
   * The page renders roots with their members nested, so `loadVoteOverlay()` collapses its reads the
   * same way and walks `threadLinks` as well as `edges`. Do not "simplify" that walk back to
   * `edges`, and do not drop a window flag: an uncollapsed or wider-windowed read is a DIFFERENT id
   * set, and the loop below is the only thing standing between a collapsed render and an
   * anonymous-zero fallback for every member the flattened window drops.
   */
  readonly userVotes = this._userVotes.asReadonly();

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
    const overlay = this._userVotes()[linkId];
    if (overlay !== undefined) {
      return overlay;
    }
    return this.feedLinks().find((link) => link.id === linkId)?.userVote ?? 0;
  }

  /** Records the caller's vote after a successful vote mutation. Records against the id the
   *  wrapper reported, which for a thread is the VOTED card's id (root or member), not the root's. */
  setUserVote(linkId: string, value: number): void {
    this._userVotes.update((prev) => ({ ...prev, [linkId]: value }));
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
   * `loadingMore`; a no-op when there is no next page or no cursor.
   *
   * `HOME_FEED_COLLAPSE_VARS` is repeated here (not inherited from the resource) because a
   * continuation page is a fresh request with its own variables: an uncollapsed page 2 appended to a
   * collapsed page 1 would re-list every root and render members as loose rows. */
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
        ...HOME_FEED_COLLAPSE_VARS,
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
   * cursor. Coalesced by `lastWeekLoadingMore`; a no-op when there is no next page or no cursor.
   * Collapses threads, like its first page (see `loadMore`). */
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
        ...HOME_FEED_COLLAPSE_VARS,
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
   * into one vote overlay (the anonymous feed value is always 0), recording every non-zero vote.
   *
   *  INVARIANT — an overlay read is THE SAME READ as the resource it mirrors, and the auth header is
   *  the only difference: the same query, the same variables (same window, same collapse, same page
   *  size), with `firebase-auth-key` added. That is what makes the overlay's id set identical to the
   *  rendered set. Two independent things break that, and each looks like a harmless tidy-up:
   *
   *  1. SHAPE. Both reads send `HOME_FEED_COLLAPSE_VARS`, for the same reason the two resources do:
   *     the rendered feed is roots-with-members-nested, so an id-keyed overlay is only complete if
   *     the read that fills it has the SAME shape. An uncollapsed read returns the `first` newest
   *     FLAT rows — `r1,m1,r2,m2,…` — while the render is `r1..rN` each carrying all of its members,
   *     a strictly larger id set once the feed is more than half threads; the members the flat
   *     window drops would have no overlay entry and would read as the anonymous 0 on an expanded
   *     thread. Collapsing the read AND walking the nesting is what makes the two sets line up: the
   *     earlier concern that a collapsed read "hides" member votes is answered by the loop below, not
   *     by uncollapsing the query.
   *  2. WINDOW. Today's read carries `currentServiceDayOnly: true` because the rendered feed does —
   *     it is not optional tidiness. Without it the read asks for the newest 8 rows OVERALL while
   *     the page draws the newest 8 rows WITHIN THE CURRENT SERVICE DAY, so once the newest rows
   *     overall are all older than the day cut the two id sets diverge again and a rendered id
   *     misses the overlay. The last-week read likewise carries the same `lastWeekOnly` +
   *     `alignPageToDay` window as `lastWeekResource`. A *wider* read is harmless (an extra id costs
   *     nothing and an absent id and an unused id behave identically); a *different* read is not.
   *
   *  So do not "optimise" any of the four mirrored facts — the collapse flag, the day window, the
   *  day alignment, the page size — nor walk `edges` alone instead of `threadLinks`. The failure
   *  mode is invisible: `LinkThreadComponent.voteFor` falls back to `link.userVote ?? 0`, and for
   *  `graphqlResource` data `userVote` is ALWAYS the anonymous zero, so a rider's own upvote renders
   *  un-pressed with no error and no failed request anywhere.
   *
   *  Only NON-ZERO votes are recorded, so the overlay never shadows a genuine anonymous 0. */
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
        {
          first: FEED_PAGE_SIZE,
          status: "LIVE",
          currentServiceDayOnly: true,
          ...HOME_FEED_COLLAPSE_VARS,
        },
        headers,
      ),
      this.graphql.request<FeedQueryData, FeedQueryVars>(
        FEED_QUERY,
        {
          first: LAST_WEEK_PAGE_SIZE,
          status: "LIVE",
          lastWeekOnly: true,
          alignPageToDay: true,
          ...HOME_FEED_COLLAPSE_VARS,
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
        const root = edge.node;
        if (root.userVote !== 0) {
          overlay[root.id] = root.userVote;
        }
        // The MEMBERS are the whole reason this loop is not just `for (const edge …)`. A collapsed
        // read puts every votable id of the page in `root.id` ∪ `root.threadLinks[].id`; walking
        // only the edges would cover the roots alone, and `LinkThreadComponent.voteFor` would
        // answer `link.userVote ?? 0` — the anonymous zero — for every member the rider had voted
        // on. `?? []` because `strictNullChecks` is OFF: a hand-built fixture or a partially cached
        // payload must not throw inside this fire-and-forget loop.
        for (const member of root.threadLinks ?? []) {
          if (member.userVote !== 0) {
            overlay[member.id] = member.userVote;
          }
        }
      }
    }
    this._userVotes.set(overlay);
  }
}
