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
 * a flat page is therefore unsound: a sublink can arrive with its root nowhere on the page, and the
 * two would render as two unrelated links.
 *
 * Collapsing pushes the decision to the backend, which returns conversation ROOTS only and nests each
 * one's whole subtree under `sublinks` — a self-contained unit that needs no second request. Two
 * consequences that make this the right call rather than merely a tidier one:
 * - `totalCount` counts ROOTS while collapsing, so the page's "Showing N of M" keeps counting the
 *   rows it actually renders instead of inflating behind conversations the user has not expanded.
 * - The continuation pages MUST agree with the first page. A collapsed first page followed by an
 *   uncollapsed continuation would list every root twice and render its sublinks as loose rows,
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
 * Merge helper for a refetched first page + already-appended continuation pages, de-duplicated by
 * `node.id` and keeping the FIRST occurrence (i.e. the backend's own order: first page first).
 *
 * This is a correctness requirement, not tidiness. The poll beat / manual refresh re-reads page one
 * WITHOUT dropping the appended pages (dropping them would wipe the user's Load More progress every
 * 30s — see `reloadFirstPages()`), and the two sets can then legitimately OVERLAP: an admin edit
 * between the two reads moves a row, so a row an appended page already holds comes back INTO page
 * one and the same id lands in both. A duplicate id is not cosmetic — the page renders
 * `@for (link of store.feedLinks(); track link.id)`, and a repeated track key throws on the next
 * render of that view. First-wins keeps the newest refetched copy for a row that is in both.
 *
 * SCOPE — OVERLAP ONLY, and that limit is load-bearing rather than an omission. The other
 * consequence of preserving appended pages is INVISIBLE to this merge: a row DELETED (or aged out
 * of the window) between the two reads is simply ABSENT from the refetched page one, while its
 * older copy is still sitting in an appended page. Dedupe can only see the ids it is GIVEN, and the
 * appended copy is still given, so that row keeps rendering — correctly as far as this function is
 * concerned, because "one id, one row" is the whole of its contract. See `reloadFirstPages()` for
 * when such a row is actually cleared.
 */
function dedupeEdges(edges: FeedLinkEdge[]): FeedLinkEdge[] {
  const seenIds = new Set<string>();
  const merged: FeedLinkEdge[] = [];
  for (const edge of edges) {
    if (seenIds.has(edge.node.id)) {
      continue;
    }
    seenIds.add(edge.node.id);
    merged.push(edge);
  }
  return merged;
}

/**
 * One node of a collapsed feed conversation, as far as the VOTE OVERLAY walk cares: the id the
 * overlay is keyed by, the row's own `userVote`, and the children to recurse into.
 *
 * Declared structurally rather than as `FeedLink` or one of the `FEED_QUERY` sublink levels,
 * because the walk has to accept ALL of them: `FEED_QUERY` nests `sublinks` four levels deep and
 * each level is its own derived type (they stop at different depths), so naming any single one
 * would type the recursion at exactly one level — which is the bug this function exists to fix.
 * `sublinks` is OPTIONAL here because the deepest level selects no children at all, and a target
 * property that may be absent is satisfied by a source type that omits it. Every level's `id` /
 * `userVote` are required in its own type, so nothing unchecked reaches the overlay.
 */
interface VoteOverlayNode {
  id: string;
  userVote: number;
  sublinks?: VoteOverlayNode[] | null;
}

/**
 * Record every non-zero vote in one conversation's whole subtree into `overlay`, mutating it in
 * place — the overlay map is a local accumulator, never a signal, so the reference-based
 * reactivity this file is built on does not apply inside it.
 *
 * The RECURSION is the point, and it is unbounded on purpose. The collapsed feed renders a root
 * plus its entire tree, and every node in that tree is a votable card, so the set of ids the page
 * can draw is `∪ over every level of sublinks` — not just the roots and not just their direct
 * children. A walk that stopped at either of those two levels shipped as a live bug: the reads
 * were correctly collapsed and window-matched, and members one level down still read as the
 * ANONYMOUS zero, because a missing overlay entry falls back to `link.userVote`, which for
 * `graphqlResource` data is always 0. So: no depth limit, no `MAX_THREAD_DEPTH` mirror, and no
 * early exit — the server's write-side cap is not the client business, and a client that mirrors
 * it silently loses a level the day the cap moves.
 *
 * Only NON-ZERO votes are recorded, so the overlay never shadows a genuine anonymous 0. `?? []`
 * because `strictNullChecks` is OFF: a hand-built fixture or a partially cached payload must not
 * throw inside this fire-and-forget walk.
 */
function recordSubtreeVotes(node: VoteOverlayNode, overlay: Record<string, number>): void {
  if (node.userVote !== 0) {
    overlay[node.id] = node.userVote;
  }
  for (const child of node.sublinks ?? []) {
    recordSubtreeVotes(child, overlay);
  }
}

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
 * value, and `userVotes` exposes the whole map for hosts that render one conversation (root plus
 * its whole tree) per row. The read's variables and its window are load-bearing, not a
 * convenience: see the invariant on `loadVoteOverlay()`.
 *
 * This is the one surface that collapses conversations — see `HOME_FEED_COLLAPSE_VARS` for why
 * that is a correctness requirement rather than a presentation choice.
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

  /** The collapsed "Last Week" section's first page: a 7-calendar-day window with TODAY EXCLUDED
   * (the backend's `displayTodayInLastWeek` default is `false`, so the newest day group is
   * "Yesterday"), day-aligned pages. Variables are STATIC (only the boolean flags, never a computed
   * date) so SSR's TransferState hydrates without a refetch. Collapses threads too — this surface
   * renders `app-link-thread` per day group exactly like the today feed, so an uncollapsed last week
   * would split a group across two day headers. */
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

  /** First page (resource) + appended continuation pages, in backend order, de-duplicated by
   *  `node.id` — see `dedupeEdges`: a refresh of page one can overlap an appended page, and a
   *  duplicate id would throw on the page's `track link.id`. */
  private readonly edges = computed<FeedLinkEdge[]>(() =>
    dedupeEdges([
      ...(this.feedResource.data()?.publicSocialMediaLinks.edges ?? []),
      ...this.appendedEdges(),
    ]),
  );

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

  /**
   * The "Showing N of M" denominator for the today feed.
   *
   * `Math.max(...)`, NOT `appendedTotalCount() ?? first ?? 0`. That chain made the frozen appended
   * total WIN over the live first-page one, and the beat now refreshes page one while every appended
   * signal is deliberately left alone (see `reloadFirstPages()`) — so the appended reading is pinned
   * at whatever the last continuation page happened to report and can silently disagree with the
   * refreshed page one in either direction. The LIVE first-page total is the authoritative one (the
   * same collapsed-roots count the resource's own `edges` came back with), and the appended total is
   * only ever another reading of the same connection, so the larger of the two is never a lie: it is
   * also the rule that a denominator must never be smaller than EITHER source, because a shrink
   * under a reader who has already loaded more pages than the stale count knew about is the one
   * reading that is visibly wrong ("Showing 40 of 12").
   */
  readonly feedTotalCount = computed<number>(() => {
    const first = this.feedResource.data()?.publicSocialMediaLinks.totalCount;
    return Math.max(this.appendedTotalCount() ?? 0, first ?? 0);
  });

  /** First page (resource) + appended continuation pages of the last-week section, in backend
   * order (newest-first), de-duplicated by `node.id` like the today feed. */
  private readonly lastWeekEdges = computed<FeedLinkEdge[]>(() =>
    dedupeEdges([
      ...(this.lastWeekResource.data()?.publicSocialMediaLinks.edges ?? []),
      ...this.lastWeekAppendedEdges(),
    ]),
  );

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

  /** The "Showing N of M" denominator for the last-week section — `Math.max` of the two sources for
   * exactly the reason `feedTotalCount` documents. */
  readonly lastWeekTotalCount = computed<number>(() => {
    const first = this.lastWeekResource.data()?.publicSocialMediaLinks.totalCount;
    return Math.max(this.lastWeekAppendedTotalCount() ?? 0, first ?? 0);
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

  /**
   * True while ANY of the three page resources has a request in flight — the first load, a poll
   * beat, or a manual refresh.
   *
   * Built on each resource's `isFetching`, NOT on `isLoading`, and the distinction is the whole
   * point: `graphqlResource.isLoading` is pristine-first-fetch-only, so it is `false` for every
   * reload after the first success. A refresh confirmation ("Updated") has to observe a request
   * actually starting and finishing, which `isLoading` cannot report. `hasError` is read
   * separately by the control, so a beat that settles with an error shows nothing.
   */
  readonly isRefreshing = computed(
    () =>
      this.linesResource.isFetching() ||
      this.feedResource.isFetching() ||
      this.lastWeekResource.isFetching(),
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
   * INVARIANT — the overlay's read set must EQUAL the rendered id set: the SAME read, by the same
   * query, the same variables (window, collapse flag, page size), the auth header being the only
   * difference; AND the loop must walk EVERY level of the nesting, not only the roots in `edges`
   * and not only their direct children. The page renders each root with its whole conversation
   * tree nested under it, so `loadVoteOverlay()` collapses its reads the same way and recurses
   * through `sublinks` at every depth (`recordSubtreeVotes`). Do not "simplify" that walk back to
   * `edges`, do not stop it at one level, and do not drop a window flag: an uncollapsed, a
   * wider-windowed, or a shallower-walked read is a DIFFERENT id set, and the walk is the only
   * thing standing between a collapsed render and an anonymous-zero fallback for every node the
   * render shows but the walk never reaches.
   *
   * CADENCE — that equality is claimed at MOUNT TIME, and the overlay is deliberately a mount-time
   * SNAPSHOT rather than something re-read on the poll beat. Since the beat started refreshing page
   * one (see `reloadFirstPages()`) the RENDERED id set grows every tick, so a root that arrives
   * later is rendered without an overlay entry and falls through to the wrapper's
   * `link.userVote ?? 0` — the anonymous zero. That gap is ACCEPTED, not overlooked: an id that did
   * not exist when the reader was on the page is one they had no chance to have voted on in this
   * session, so its true value IS 0 and the snapshot would have recorded nothing for it anyway. The
   * invariant that must not break is the one above — every id that could carry a vote is covered.
   * Do NOT "fix" the gap by re-reading the overlay per beat: that is two extra authenticated reads
   * every 30 seconds, spent on rows whose only possible vote is zero.
   */
  readonly userVotes = this._userVotes.asReadonly();

  /** Bumped on every lines-only poll so the line cards' open accordions can re-read their own
   * data (`LinePulseListComponent` → `LinePulseCardComponent` → chart/reports). */
  readonly linesRefreshTick = signal(0);

  /**
   * The shared 30s beat. Public so the page can render its countdown (`secondsRemaining()`) and a
   * manual "Refresh Now"; both the beat and the click go through the SAME `reloadFirstPages()`.
   *
   * The beat covers the WHOLE page — line statuses, the Today feed's first page and the Last Week
   * first page — not just the lines, because "Refreshing in 12s" sitting above the links section
   * on mobile promises the links refresh too. What it must NOT do is drop the appended Load More
   * pages: resetting them every 30 seconds would wipe the reader's place in a long feed, which is
   * why the beat calls `reloadFirstPages()` (append-only signals untouched) and not `reloadAll()`.
   * The full reset stays for the flows that genuinely invalidate the whole dataset — a submit, a
   * link edit, a status report, the retry banner's "Try Now".
   */
  readonly polling = new PollingSource(() => this.reloadFirstPages());

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

  /**
   * The poll beat's refresh (and the manual click's — the countdown control drives the same store
   * beat): re-reads page one of ALL THREE resources and bumps `linesRefreshTick` for the open line
   * accordions.
   *
   * Every appended-page signal is deliberately LEFT ALONE. Dropping them would be simplest and
   * would also be wrong at a 30-second cadence: the reader's Load More progress would be thrown
   * away every tick, and the first page's rows would be the only thing on screen. The overlap that
   * creates instead (a refetched page one can re-include a row an appended page already holds) is
   * absorbed by the `dedupeEdges` merge in `edges`/`lastWeekEdges` — which is why the two pieces
   * belong together and neither is optional.
   *
   * The flip side, stated so nobody reads the merge as a full reconciliation: a row DELETED server
   * side since a page was appended is gone from this refetch but still held by that appended page,
   * so it lingers on screen — `dedupeEdges` cannot remove an id it is never asked about. Only
   * `reloadAll()`, which drops the appended pages, clears it.
   *
   * Use `reloadAll()` when the whole dataset is invalid (submit / edit / report / retry), not here.
   */
  reloadFirstPages(): void {
    this.linesResource.reload();
    this.linesRefreshTick.update((tick) => tick + 1);
    this.feedResource.reload();
    this.lastWeekResource.reload();
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
   *  into one vote overlay (the anonymous feed value is always 0), recording every non-zero vote
   *  found ANYWHERE in the rendered conversation trees.
   *
   *  INVARIANT — the overlay's id set must EQUAL the rendered id set, and that is TWO separate
   *  requirements, not one. The auth header is the only difference between a read and the resource
   *  it mirrors; break either half and a rider's own vote renders as if they had never cast it, with
   *  no error and no failed request anywhere to notice it by.
   *
   *  1. THE READ. An overlay read is THE SAME READ as the resource it mirrors: the same query, the
   *     same variables (same window, same collapse, same page size). Both reads send
   *     `HOME_FEED_COLLAPSE_VARS`, for the same reason the two resources do — the rendered feed is
   *     roots-with-whole-trees-nested, so an id-keyed overlay is only complete if the read that
   *     fills it has the SAME shape. An uncollapsed read returns the `first` newest FLAT rows —
   *     `r1,c1,g1,r2,c2,g2,…` — while the render is `r1..rN` each carrying its whole subtree, a
   *     strictly larger id set once the feed is more than half conversations; the nodes the flat
   *     window drops would have no overlay entry and would read as the anonymous 0 on an expanded
   *     conversation. Today's read carries `currentServiceDayOnly: true` because the rendered feed
   *     does: without it the read asks for the newest 8 rows OVERALL while the page draws the newest
   *     8 rows WITHIN THE CURRENT SERVICE DAY, so once the newest rows overall are all older than
   *     the day cut the two id sets diverge again and a rendered id misses the overlay. The
   *     last-week read likewise carries the same `lastWeekOnly` + `alignPageToDay` window as
   *     `lastWeekResource`. A *wider* read is harmless (an extra id costs nothing, and an absent id
   *     and an unused id behave identically); a *different* read is not.
   *  2. THE WALK. The read is collapsed, so `edges` alone holds only the roots. Every node below a
   *     root is also rendered and also votable, so the walk recurses through `sublinks` at EVERY
   *     depth — see `recordSubtreeVotes`. This is not hypothetical: a version that walked the roots
   *     plus ONE level shipped, and left every node below that level reading as anonymous.
   *
   *  So do not "optimise" any of the four mirrored facts — the collapse flag, the day window, the
   *  day alignment, the page size — and do not flatten the walk to a single level. The failure mode
   *  is invisible: the thread wrapper's `voteFor` falls back to `link.userVote ?? 0`, and for
   *  `graphqlResource` data `userVote` is ALWAYS the anonymous zero.
   *  3. THE CADENCE. This runs ONCE, from the constructor — the poll beat deliberately does NOT
   *     repeat it, and must not (see `userVotes`). Re-reading both resources every 30s would be two
   *     extra authenticated requests per beat for votes that cannot have changed, and the beat's own
   *     page refresh would swap the merged map underneath a render. A root a later beat introduces
   *     has no overlay entry and reads as the anonymous 0, which is the right answer anyway: the
   *     caller cannot have voted on a row that did not exist when they voted.
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
        recordSubtreeVotes(edge.node, overlay);
      }
    }
    this._userVotes.set(overlay);
  }
}
