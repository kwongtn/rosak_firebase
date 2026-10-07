import { Injectable, computed, inject, signal } from "@angular/core";
import type { OnDestroy } from "@angular/core";

import { injectIsBrowser } from "../../../core/composables/is-browser";
import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient, graphqlResource } from "../../../core/graphql/graphql-client";
import { PollingSource } from "../../../core/polling/polling-source";
import { PreferencesService } from "../../../core/preferences/preferences.service";
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
  HOME_RECENT_INCIDENT_VARS,
  HOME_RECENT_INCIDENTS_QUERY,
  HomeIncidentItem,
  HomeRecentIncidentsQueryData,
  HomeRecentIncidentsQueryVars,
  LINES_STATUS_HISTORY_QUERY,
  LinePulse,
  LineStatus,
  LineStatusHourBucket,
  LinesStatusHistoryQueryData,
  LinesStatusHistoryQueryVars,
  NETWORK_STATUS_HISTORY_QUERY,
  NetworkStatusHistoryQueryData,
  NetworkStatusHistoryQueryVars,
  PRO_INCIDENT_LIMIT,
  PassengerStatus,
} from "./home.queries";
import type { FeedLinkStatusFilter } from "./feed-filter.util";
import {
  BOARD_SORTS,
  DEFAULT_BOARD_SORT,
  LINE_STATUSES,
  PASSENGER_STATUSES,
  filterProLines,
  partitionBoardLines,
} from "./board-lines.util";
import type { BoardLineGroups, BoardSort } from "./board-lines.util";
import {
  FEED_PAGE_SIZE,
  HOME_FEED_COLLAPSE_VARS,
  LAST_WEEK_PAGE_SIZE,
  OFFICIAL_NOTICES_VARS,
  dedupeEdges,
  maxFeedTotalCount,
  mergeFeedPageInfo,
  recordSubtreeVotes,
  resolveUserVote,
} from "./home-feed.util";
import { NetworkSummary, summarizeNetwork } from "./network-summary.util";

/**
 * How long the post-submit highlight ring stays on the line that was reported about.
 *
 * Long enough to be noticed after the eye travels from the (just-closed) sheet back down the board,
 * short enough that a reader who carries on scrolling is not left looking at a ring that has stopped
 * meaning "just now". Matches the refresh control's own "Updated" confirmation window, so the two
 * transient messages on this page last the same beat.
 */
export const HIGHLIGHT_VISIBLE_MS = 2000;

/**
 * The most line ids `linesStatusHistory` accepts.
 *
 * The backend answers anything above this with a typed GraphQL error rather than a silent
 * truncation, so a board that grew past 64 lines would take the whole per-line read down with it.
 * The cap is enforced HERE, at the variable, rather than discovered in production — and it is
 * declared next to the resource so a future backend cap bump has exactly one place to move.
 */
export const HISTORY_LINE_ID_CAP = 64;

/**
 * Route-scoped store for the community front page (provided by the route in a later wave —
 * deliberately NOT `providedIn: "root"`). Owns the three page-critical reads (the line pulse
 * list and the two feed windows), the two LAZY service-day history reads behind the history
 * widgets, cursor pagination for the feed, a shared polling beat, a per-user vote overlay, and the
 * feed's line filter.
 *
 * The overlay exists because `graphqlResource()` sends no auth token, so `userVote` from the
 * feed is always 0. When logged in, two authenticated `GraphQLClient.request` reads — one per feed
 * resource, with the same variables each of those resources sends EXCEPT the feed's `lineId`
 * filter, plus the caller's idToken as a header — record every non-zero vote; `userVoteFor()`
 * prefers that overlay over the anonymous feed value, and `userVotes` exposes the whole map for
 * hosts that render one conversation (root plus its whole tree) per row. The read's variables and
 * its window are load-bearing, not a convenience: see the invariant on `loadVoteOverlay()`.
 *
 * This is the one surface that collapses conversations — see `HOME_FEED_COLLAPSE_VARS` for why
 * that is a correctness requirement rather than a presentation choice.
 *
 * 🔴 **The history reads are NOT page-critical and are deliberately kept out of `hasError` /
 * `isLoading` / `isRefreshing`.** See the block comment above `networkHistoryResource`: a chart
 * that will not load hides itself, and never takes the page's retry banner with it.
 */
@Injectable()
export class HomeStore {
  private readonly graphql = inject(GraphQLClient);
  private readonly auth = inject(AuthService);
  private readonly isBrowser = injectIsBrowser();

  /**
   * Reader-owned display state (which lines are pinned, which view the reader chose).
   *
   * Root-provided, so it deliberately OUTLIVES this route-scoped store — a pin survives navigating
   * away from `/` and back, which is the whole point of persisting it. Nothing about it is read at
   * construction time and no host gates visible UI on its `hydrated()`: it hydrates in
   * `afterNextRender`, so the server HTML and the client's first paint agree (see the service).
   */
  private readonly preferences = inject(PreferencesService);

  private readonly linesResource = graphqlResource<FrontPageLinesQueryData>(() => ({
    query: FRONT_PAGE_LINES_QUERY,
  }));

  /**
   * Which line the FEED is narrowed to, or `null` for the whole network.
   *
   * A signal rather than a page-local input for the reason every other piece of this page's view
   * state is in the store: **one source derives every feed variable.** The two resources, both
   * `loadMore*` continuations and — deliberately NOT — the two authenticated vote-overlay reads all
   * derive from this one signal, so the page cannot end up with a filtered list drawn next to an
   * unfiltered "Showing N of M", or a continuation page that disagrees with its own first page.
   *
   * `null` is the ABSENCE of the filter and is spread in conditionally, never sent as `null` — see
   * `FeedQueryVars.lineId`.
   *
   * Phase 3 ships the plumbing only: the filter controls land in the next phase, so nothing sets
   * this yet except a deep link that does so through `setLineFilter`.
   */
  private readonly _lineFilter = signal<string | null>(null);
  readonly lineFilter = this._lineFilter.asReadonly();

  /**
   * Narrows BOTH feeds to one line, or clears the filter with `null`.
   *
   * 🔴 **Every appended-page signal for both feeds is cleared on the same edge**, and that is the
   * whole point of doing this in the store rather than in a control. Appended pages carry a CURSOR,
   * and a cursor is only meaningful inside the query that produced it: asking for "the page after
   * `cursor-x` narrowed to LRT" when `cursor-x` was minted by an unfiltered read returns an
   * arbitrary slice of the network rather than the continuation of what the reader is looking at.
   * Keeping them would also leave rows the previous filter selected rendered next to rows the new
   * one selected — the exact stale-page state `reloadAll()` exists to prevent. The reader loses
   * their Load More place, which is the honest cost of changing WHAT they are reading; the poll
   * beat's 30s refresh, which does not change the filter, still preserves it (see
   * `reloadFirstPages()`).
   *
   * A no-op for an equal value, so a toggle that re-selects the current filter resets nothing.
   */
  setLineFilter(lineId: string | null): void {
    const next = lineId === "" ? null : lineId;
    if (next === this._lineFilter()) {
      return;
    }
    this._lineFilter.set(next);
    this.appendedEdges.set([]);
    this.appendedHasNext.set(null);
    this.appendedTotalCount.set(null);
    this.nextCursor.set(null);
    this.lastWeekAppendedEdges.set([]);
    this.lastWeekAppendedHasNext.set(null);
    this.lastWeekAppendedTotalCount.set(null);
    this.lastWeekNextCursor.set(null);
  }

  /**
   * The `lineId` key as a SPREADABLE object, present only while a filter is set.
   *
   * One narrowing site for four call sites (two resources + two continuations), and it is a
   * `computed` rather than a helper so a filter change invalidates every one of them at once. The
   * alternative — testing `this._lineFilter()` twice inside each variables literal — loses the
   * narrowing on the second read and widens `lineId` back to `string | null`, which is precisely the
   * spelling `FeedQueryVars.lineId` exists to make unrepresentable.
   */
  private readonly _lineFilterVars = computed<{ lineId?: string }>(() => {
    const lineId = this._lineFilter();
    return lineId === null ? {} : { lineId };
  });

  private readonly feedResource = graphqlResource<FeedQueryData, FeedQueryVars>(() => ({
    query: FEED_QUERY,
    variables: {
      first: FEED_PAGE_SIZE,
      status: "LIVE",
      currentServiceDayOnly: true,
      ...HOME_FEED_COLLAPSE_VARS,
      // Conditionally spread so "no filter" is the key's ABSENCE — see `FeedQueryVars.lineId`.
      ...this._lineFilterVars(),
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
      ...this._lineFilterVars(),
    },
  }));

  readonly lines = computed<LinePulse[]>(() => this.linesResource.data()?.lines ?? []);

  /* ------------------------------------------------------------------ *
   * The service-day history widgets — two lazy reads, two widgets, and
   * NEITHER of them is allowed to become a page-level error
   * ------------------------------------------------------------------ *
   *
   * Both resources below are LAZY in the strict sense — nothing reads them until a WIDGET does, so a
   * board with no mounted history surface issues neither read. They are additionally GATED on the
   * lines read having data, because both are answers to "what has happened to the network" and a
   * network with no lines has no history to ask about; that gate is the documented lazy precedent
   * — `graphqlResource(() => { if (!gate()) return undefined; return { query, variables }; })` —
   * and it also means a board whose lines read FAILED never fires two more requests that would fail
   * the same way.
   *
   * 🔴 **FAILURE ISOLATION — the acceptance rule of this phase.** A failing history read hides its
   * OWN widget and nothing else. It deliberately does NOT feed `hasError`, `isLoading`,
   * `isRefreshing` or `isLoadingLastWeek`, because those four drive the page-level retry banner, the
   * board skeleton and the refresh control's "Updating" label: folding a decorative sparkline into
   * them would replace a whole working page — statuses, feed, every row — with one banner because a
   * chart would not load. The widgets therefore read their OWN `hasError` (`networkHistoryFailed` /
   * `linesHistoryFailed`) and render nothing. This is a deliberate asymmetry with the three
   * page-critical reads, and `home.store.spec.ts` pins it by failing a history read and asserting
   * every one of those four flags stayed false.
   *
   * 🔴 **THE WIDGETS ASK FOR THEM.** Both resources stay inert until `requestHistoryReads()` is
   * called, which each history widget does in its own constructor. That is not only the lazy-resource
   * convention — it is forced, and the reason is worth recording because it is invisible from the
   * call site: `graphqlResource` installs an `effect` that reads `isLoading()`/`data()` on the
   * underlying `httpResource`, so the moment the store is constructed the request function is
   * ALREADY being evaluated and re-evaluated. A gate that only the projections satisfied would
   * therefore not defer the request at all — only the `lines()` gate would, and it is the wrong gate:
   * it would fire both reads for every store, including the ones whose widgets are never mounted
   * (a Rider view has no heat grid) and including every store spec that is about the feed. One
   * explicit opt-in from the surface that actually renders the data is the only gate that is honest
   * about what is being requested, and it is the same arrangement `LineStatusChartComponent`'s
   * `expanded` input and the station sheet's `open` state already use.
   *
   * `dayStartHour` is NEVER sent (the backend default of 3 applies), and `linesStatusHistory`'s id
   * list is SORTED — both because the variables object has to be structurally identical between the
   * server render and the client hydration for the TransferState payload to be reused instead of
   * refetched. No `new Date()`, no client clock, and no board-order dependency: the same set of ids
   * in the same order, whatever the sort is set to.
   */

  /**
   * Set by the history widgets on mount. `false` until then, which is what keeps both reads — and
   * every store spec that is not about them — completely untouched.
   */
  private readonly _historyReadsRequested = signal(false);

  /**
   * Asks the store to run the two service-day history reads. Called by the widgets that draw them,
   * never by the page.
   *
   * Idempotent by construction: `signal.set` with an equal value does not notify, so a second row
   * mounting adds nothing and re-entering `/` re-requests nothing.
   */
  requestHistoryReads(): void {
    this._historyReadsRequested.set(true);
  }

  /** The network-wide hour tally behind the hero's sparkline. Inert until lines have landed. */
  private readonly networkHistoryResource = graphqlResource<
    NetworkStatusHistoryQueryData,
    NetworkStatusHistoryQueryVars
  >(() => {
    if (!this._historyReadsRequested() || this.lines().length === 0) {
      return undefined;
    }
    return { query: NETWORK_STATUS_HISTORY_QUERY, variables: {} };
  });

  /** The line ids the per-line read asks for: every line's id, sorted, capped at the backend limit. */
  private readonly _historyLineIds = computed<string[]>(() =>
    this.lines()
      .map((line) => line.id)
      .sort()
      .slice(0, HISTORY_LINE_ID_CAP),
  );

  /**
   * Every line's hour buckets in ONE request, behind the board rows' report labels and the Pro
   * heat grid.
   *
   * Inert while there are no lines. `.sort()` with no comparator rather than `localeCompare`, on
   * purpose: this array must be byte-identical in every process that builds it, and a locale
   * collation is not a total order the same everywhere.
   */
  private readonly linesHistoryResource = graphqlResource<
    LinesStatusHistoryQueryData,
    LinesStatusHistoryQueryVars
  >(() => {
    const lineIds = this._historyLineIds();
    if (!this._historyReadsRequested() || lineIds.length === 0) {
      return undefined;
    }
    return { query: LINES_STATUS_HISTORY_QUERY, variables: { lineIds } };
  });

  /**
   * The network's hourly report tally for the hero's sparkline.
   *
   * `[]` is the documented "nothing reported in this service day" answer, not an error: the widget
   * hides itself on an empty array exactly as it does on `hasError`, and neither state is ever
   * rendered as a failure.
   */
  readonly networkHistory = computed<LineStatusHourBucket[]>(
    () => this.networkHistoryResource.data()?.networkStatusHistory ?? [],
  );

  /** True when the NETWORK history read failed — its widget's own hide signal, never `hasError`. */
  readonly networkHistoryFailed = this.networkHistoryResource.hasError;

  /**
   * Every line's buckets, keyed by line id, for the board rows' report labels and the Pro heat grid.
   *
   * A MAP rather than an array lookup per widget because there is one of these per rendered row and
   * one per grid row: sixteen rows each scanning sixteen entries is a linear scan nobody can see
   * until the board grows. An entry present with an EMPTY `buckets` array means the backend answered
   * for that line and the line simply reported nothing this service day — the two states are
   * distinguishable here and are NOT collapsed.
   */
  private readonly _linesHistoryById = computed<Map<string, LineStatusHourBucket[]>>(() => {
    const byId = new Map<string, LineStatusHourBucket[]>();
    for (const entry of this.linesHistoryResource.data()?.linesStatusHistory ?? []) {
      byId.set(entry.lineId, entry.buckets);
    }
    return byId;
  });

  /**
   * One line's hourly buckets for its row's report label and the heat grid, or `[]` when nothing has
   * landed for it.
   *
   * A method rather than a `computed()` per row because a component would then need a factory or a
   * prebuilt list; reading a `Map` is already O(1) and the caller is a template binding.
   */
  linesHistoryFor(lineId: string): LineStatusHourBucket[] {
    return this._linesHistoryById().get(lineId) ?? [];
  }

  /** True when the PER-LINE history read failed — its widgets' own hide signal, never `hasError`. */
  readonly linesHistoryFailed = this.linesHistoryResource.hasError;

  /* ------------------------------------------------------------------ *
   * The Pro dashboard's OWN filters — default OFF, reset on leaving Pro
   * ------------------------------------------------------------------ *
   *
   * 🔴 **These three filters are Pro-only, and their DEFAULTS are what keeps them out of the Rider
   * board.** All three are "no narrowing" (`null` / `false`), so `visibleLines` is `lines()` until a Pro
   * reader touches a control, and a Rider view — which mounts none of them — cannot be narrowed even
   * by accident. That is the whole reason they are separate signals rather than one `filters` object
   * shared with the board: a shared object would have to be reset by the board too, and the board has
   * no way to know whether a filter is a reader's view state or a Pro tool's transient narrowing.
   *
   * 🔴 **The route injector outlives a visit, so a filter that is not reset outlives the Pro view
   * that set it.** `ProDashboardComponent.ngOnDestroy` calls {@link resetProFilters}; without it, a
   * reader who narrowed the board to one line in Pro and switched back to Rider would come to a
   * rider board quietly missing eleven lines with no control on the page to explain why. The feed's
   * own line filter and search are reset by the same call, because Pro is the only surface that has a
   * control for either (see `setLineFilter`).
   */

  /** Operational status the board is narrowed to, or `null` for every status. */
  private readonly _proStatusFilter = signal<LineStatus | null>(null);
  readonly proStatusFilter = this._proStatusFilter.asReadonly();

  /**
   * The passenger severity the board is narrowed to **at or above**, or `null` for any.
   *
   * A threshold rather than an equality, and that is the useful shape for a rider-reported axis: a
   * Pro reader asking for `DELAYED` wants "delayed or worse", not the subset that happened to report
   * exactly `DELAYED`. The comparison mirrors `PASSENGER_SEVERITY_RANK` — the backend's own enum
   * order — rather than a hand-written ladder, so a backend enum reorder cannot make this filter
   * quietly wrong (the rule `network-summary.util` already documents for the same reason).
   */
  private readonly _proPassengerFilter = signal<PassengerStatus | null>(null);
  readonly proPassengerFilter = this._proPassengerFilter.asReadonly();

  /** "Only lines we actually know something about" — see {@link visibleLines}. */
  private readonly _proOnlyWithData = signal(false);
  readonly proOnlyWithData = this._proOnlyWithData.asReadonly();

  /** The Pro feed widget's free-text search over the resident roots, or `""` for no search. */
  private readonly _feedSearchQuery = signal("");
  readonly feedSearchQuery = this._feedSearchQuery.asReadonly();

  /** The Pro feed widget's provenance axis. Defaults to `all`, the absence. */
  private readonly _feedStatusFilter = signal<FeedLinkStatusFilter>("all");
  readonly feedStatusFilter = this._feedStatusFilter.asReadonly();

  /**
   * The lines the BOARD draws: `lines()` narrowed by the three Pro filters, which default to no
   * narrowing.
   *
   * 🔴 **The board's three groups partition THIS, not `lines()`** — and that is what keeps the
   * Pro filters consistent with the partition instead of drawing a filtered set beside groups
   * computed from an unfiltered one. Because every filter defaults to "no narrowing", `visibleLines`
   * IS `lines()` on a Rider view and in any store that never touched a Pro control, so the rider board
   * is byte-for-byte what it was; the Rider view additionally has no control that can set one.
   *
   * The store's OTHER views deliberately stay on `lines()`: the hero's headline and tiles describe the
   * NETWORK, and the two history reads are keyed by line id. Narrowing those would make the page
   * describe a subset while claiming to describe the network.
   */
  readonly visibleLines = computed<LinePulse[]>(() =>
    filterProLines(this.lines(), {
      status: this._proStatusFilter(),
      passengerStatus: this._proPassengerFilter(),
      onlyWithData: this._proOnlyWithData(),
    }),
  );

  /** Sets the operational-status filter. `null` (or `""`) clears it; an unknown value is a no-op. */
  setProStatusFilter(status: LineStatus | null): void {
    this._proStatusFilter.set(
      status !== null && (LINE_STATUSES as readonly string[]).includes(status) ? status : null,
    );
  }

  /** Sets the passenger-severity floor. `null` (or `""`) clears it; unknown values are a no-op. */
  setProPassengerFilter(status: PassengerStatus | null): void {
    this._proPassengerFilter.set(
      status !== null && (PASSENGER_STATUSES as readonly string[]).includes(status) ? status : null,
    );
  }

  /** Turns "only lines with data" on or off. */
  setProOnlyWithData(on: boolean): void {
    this._proOnlyWithData.set(on === true);
  }

  /** Sets the Pro feed widget's free-text search. `null` and `""` are the same state. */
  setFeedSearchQuery(query: string | null): void {
    this._feedSearchQuery.set(query ?? "");
  }

  /** Sets the Pro feed widget's provenance axis. An unrecognised value degrades to `all`. */
  setFeedStatusFilter(status: FeedLinkStatusFilter | null): void {
    this._feedStatusFilter.set(status === "official" || status === "community" ? status : "all");
  }

  /**
   * Clears every Pro-only filter, the feed's line filter and the feed search, in one call.
   *
   * One method rather than five calls at the destroy site so the list of things a Pro reader can
   * narrow — and therefore the list of things that MUST be undone — is written down exactly once, in
   * the class that owns the signals. A destroy hook that reset four of the five would be a silent,
   * invisible leak rather than an error.
   *
   * Clearing {@link lineFilter} re-issues both feed resources, which is correct and necessary: the
   * Rider board that comes back must not be server-filtered to whatever line the Pro reader was on.
   */
  resetProFilters(): void {
    this._proStatusFilter.set(null);
    this._proPassengerFilter.set(null);
    this._proOnlyWithData.set(false);
    this._feedSearchQuery.set("");
    this._feedStatusFilter.set("all");
    this.setLineFilter(null);
  }

  /* ------------------------------------------------------------------ *
   * The Pro dashboard's INCIDENTS read — a third lazy, ISOLATED read
   * ------------------------------------------------------------------ *
   *
   * The same arrangement as the two history reads above, for the same reason: a supporting widget
   * that cannot load must hide ITSELF and never put the page's retry banner over a working page. So
   * `incidentsResource` is gated on the Pro widget's explicit opt-in, feeds
   * {@link recentIncidents} / {@link incidentsFailed}, and appears in NEITHER `hasError` NOR
   * `isRefreshing` — a chart-and-list pair must not be able to hold the refresh confirmation open or
   * replace the board with an error banner.
   *
   * Its variables are the module-level {@link HOME_RECENT_INCIDENT_VARS} constant — NOT computed per
   * call and certainly not from a clock — so the server render and the client hydration send the
   * same object and the TransferState payload is reused.
   */
  private readonly _incidentsRequested = signal(false);

  /** Asks the store to read the ongoing-incidents list. Called by the Pro widget's constructor. */
  requestIncidentsRead(): void {
    this._incidentsRequested.set(true);
  }

  private readonly incidentsResource = graphqlResource<
    HomeRecentIncidentsQueryData,
    HomeRecentIncidentsQueryVars
  >(() => {
    if (!this._incidentsRequested()) {
      return undefined;
    }
    return { query: HOME_RECENT_INCIDENTS_QUERY, variables: HOME_RECENT_INCIDENT_VARS };
  });

  /**
   * The newest ongoing incidents, capped at {@link PRO_INCIDENT_LIMIT}.
   *
   * The backend returns an ordered LIST with no limit argument, so the cap is a slice here. It is a
   * slice rather than a claim of completeness, and the widget says "newest first" rather than
   * "everything" so the reader is not misled about what the other rows were.
   */
  readonly recentIncidents = computed<HomeIncidentItem[]>(() => {
    // 🔴 **The failure flag is read BEFORE `data()`, and that order is load-bearing.** A
    // `graphqlResource`'s `data()` THROWS while the resource is in an error state rather than
    // returning undefined, so a computed that reached for the payload on a failed read would take the
    // page down from inside a `computed` — the exact opposite of "hide the widget". Returning early on
    // the flag is what makes this signal TOTAL, which is why the widget's own visibility check is a
    // belt-and-braces second gate rather than the only one.
    if (this.incidentsFailed()) {
      return [];
    }
    return (this.incidentsResource.data()?.calendarIncidents ?? []).slice(0, PRO_INCIDENT_LIMIT);
  });

  /** True when the incidents read failed — the widget's OWN hide signal, never `hasError`. */
  readonly incidentsFailed = this.incidentsResource.hasError;

  /* ------------------------------------------------------------------ *
   * The Pro dashboard's OFFICIAL-NOTICES ARCHIVE read — a fourth lazy,
   * ISOLATED read, and deliberately NOT one of the page-critical six
   * ------------------------------------------------------------------ *
   *
   * The same arrangement as the incidents read above, for the same reason: an archive that cannot
   * load must hide ITSELF and never put the page's retry banner over a working page. So
   * `officialNoticesResource` is gated on the widget's explicit opt-in, feeds {@link officialNotices}
   * / {@link officialNoticesFailed}, and appears in NEITHER `hasError` NOR `isLoading` NOR
   * `isRefreshing`.
   *
   * 🔴 **IT IS NOT PART OF THE COLLAPSE INVARIANT, and that is a decision rather than an omission.**
   * The six reads that render the rider feed (the two `graphqlResource` first pages, their two
   * `loadMore*` continuations and the two vote-overlay reads) must agree on variables and page shape
   * because the feed renders votable cards and an id-keyed overlay has to cover exactly those ids.
   * The archive renders NO votes and NO edit affordance — it is a reference panel of "what the
   * operator last said", so a reader cannot vote a row there and there is no overlay to be complete.
   * Adding a fourth `FEED_QUERY` read that shares the document but not the id set is therefore safe
   * precisely BECAUSE it is read-only; the moment it grows a vote button it inherits the invariant and
   * `loadVoteOverlay()` has to cover its ids too. The widget's doc says the same thing from the other
   * side.
   *
   * It sends {@link OFFICIAL_NOTICES_VARS} and nothing derived, and it is deliberately absent from
   * `reloadAll()` — a link submit or edit changes what an official archive should hold, but the
   * incidents read is absent for the same reason and a background widget re-reading itself on every
   * whole-dataset invalidation is a request nobody asked for. Mounting the widget re-reads it.
   */
  private readonly _officialNoticesRequested = signal(false);

  /** Asks the store to read the official-notices archive. Called by the widget's constructor. */
  requestOfficialNotices(): void {
    this._officialNoticesRequested.set(true);
  }

  private readonly officialNoticesResource = graphqlResource<FeedQueryData, FeedQueryVars>(() => {
    if (!this._officialNoticesRequested()) {
      return undefined;
    }
    return { query: FEED_QUERY, variables: OFFICIAL_NOTICES_VARS };
  });

  /**
   * The official posts in the newest public page, newest first.
   *
   * 🔴 **The failure flag is read BEFORE `data()`, and that order is load-bearing** — exactly as in
   * {@link recentIncidents}: `data()` THROWS while the resource is in an error state, so reaching for
   * the payload on a failed read would take the page down from inside a `computed`.
   *
   * 🔴 **The `isAutomated` filter is CLIENT-SIDE, on purpose.** `FEED_QUERY` already selects
   * `isAutomated` on every node (it is what draws the feed card's "Official" chip), so filtering the
   * answer here needs no backend argument, no contract change and no second document — and the plan's
   * own amendment says to add an `isAutomated` filter argument only if client-side filtering proves
   * insufficient. It is not: the page is small, the filter is a `=== true` on a field the query already
   * returns, and it keeps the archive reading the SAME document as the feed beside it. `=== true`
   * rather than truthiness, because this flag is the entire definition of "official" and a truthy
   * check would one day admit a string.
   */
  readonly officialNotices = computed<FeedLink[]>(() => {
    if (this.officialNoticesFailed()) {
      return [];
    }
    return (this.officialNoticesResource.data()?.publicSocialMediaLinks.edges ?? [])
      .map((edge) => edge.node)
      .filter((node) => node.isAutomated === true);
  });

  /** True when the archive read failed — the widget's OWN hide signal, never `hasError`. */
  readonly officialNoticesFailed = this.officialNoticesResource.hasError;

  /**
   * True while the archive's very FIRST fetch is in flight — the panel's own "do not render yet".
   *
   * Separate from `officialNoticesFailed` because the widget has three states, not two: loading must
   * not be painted as the EMPTY archive, or the panel would tell a Pro reader "no official posts"
   * during the beat before its first answer arrives. And separate from `HomeStore.isLoading` because
   * that one is the page's skeleton — this read must never hold the whole page's skeleton open.
   */
  readonly officialNoticesLoading = this.officialNoticesResource.isLoading;

  /* ------------------------------------------------------------------ *
   * The board's derived views — a PARTITION of `visibleLines()`, no new reads
   * ------------------------------------------------------------------ *
   *
   * 🔴 **The four groups partition `visibleLines()`: every line appears in EXACTLY ONE of
   * `attentionLines` / `myLines` / `allLines` / `othersLines`.** The full rule (attention always
   * wins, "pin wins" for an out-of-service line, the Others bucket) lives with
   * {@link partitionBoardLines}; this store only feeds it the board's own Pro filters, the reader's
   * pins and the sort — so the hero's tiles and the board's groups cannot disagree about which lines
   * need attention.
   */

  /** The rolled-up network state (headline, counts, worst line) over the one lines read. */
  readonly networkSummary = computed<NetworkSummary>(() => summarizeNetwork(this.lines()));

  /**
   * The board's sort. A signal rather than a preference because it is view state the URL also owns
   * (`?sort=`) — `NetworkBoardComponent` reads the URL first and falls back to this, and a toggle
   * writes both. Defaults to {@link DEFAULT_BOARD_SORT}, which is also the value the URL OMITS, so
   * "no query param" and "severity" are one state.
   *
   * Declared ABOVE the groups below purely so a reader never has to wonder whether a `computed()`
   * reading a later field is safe; the dependency would be fine either way, but the order costs
   * nothing to make obvious.
   */
  private readonly _boardSort = signal<BoardSort>(DEFAULT_BOARD_SORT);
  readonly boardSort = this._boardSort.asReadonly();

  /** Sets the board's sort. A no-op for an unrecognised value rather than a thrown error, matching
   * the URL parse's own degrade-to-default rule. */
  setBoardSort(sort: BoardSort): void {
    if (!(BOARD_SORTS as readonly string[]).includes(sort)) {
      return;
    }
    this._boardSort.set(sort);
  }

  /** The board's four groups, computed once so every projection and the partition share one pass. */
  private readonly _boardPartition = computed<BoardLineGroups>(() =>
    partitionBoardLines(this.visibleLines(), this.preferences.pinnedLineIds(), this.boardSort()),
  );

  /** Lines needing attention, worst first — the board's full `LinePulseCardComponent` group. */
  readonly attentionLines = computed<LinePulse[]>(() => this._boardPartition().attention);

  /** The reader's pinned lines that no higher group claimed, worst first. Includes pinned
   * out-of-service lines: for them, "pin wins" over the Others bucket. */
  readonly myLines = computed<LinePulse[]>(() => this._boardPartition().mine);

  /** The in-service lines neither group above claimed, in the board's current sort. */
  readonly allLines = computed<LinePulse[]>(() => this._boardPartition().all);

  /**
   * The out-of-service lines no group above claimed — the board's LAST group, "Others".
   *
   * TESTING (pre-opening) and DEFUNCT (closed) lines are inventory, not service: they can never
   * need attention and the hero never counts them (see `isInService`). The board still shows them,
   * at the bottom, so a reader can find a line that has not opened or has closed. A pinned
   * out-of-service line stays in My lines instead — "pin wins" — which is why this group subtracts
   * the ids `myLines` claimed rather than filtering on pin state itself.
   */
  readonly othersLines = computed<LinePulse[]>(() => this._boardPartition().others);

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

  readonly feedPageInfo = computed<FeedLinkPageInfo | null>(() =>
    mergeFeedPageInfo(
      this.feedResource.data()?.publicSocialMediaLinks.pageInfo ?? null,
      this.appendedHasNext(),
      this.nextCursor(),
    ),
  );

  /** The "Showing N of M" denominator for the today feed — see {@link maxFeedTotalCount} for why it
   * is the `Math.max` of the live first page and the appended reading. */
  readonly feedTotalCount = computed<number>(() =>
    maxFeedTotalCount(
      this.appendedTotalCount(),
      this.feedResource.data()?.publicSocialMediaLinks.totalCount ?? null,
    ),
  );

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

  readonly lastWeekPageInfo = computed<FeedLinkPageInfo | null>(() =>
    mergeFeedPageInfo(
      this.lastWeekResource.data()?.publicSocialMediaLinks.pageInfo ?? null,
      this.lastWeekAppendedHasNext(),
      this.lastWeekNextCursor(),
    ),
  );

  /** The "Showing N of M" denominator for the last-week section — `Math.max` of the two sources for
   * exactly the reason `feedTotalCount` documents. */
  readonly lastWeekTotalCount = computed<number>(() =>
    maxFeedTotalCount(
      this.lastWeekAppendedTotalCount(),
      this.lastWeekResource.data()?.publicSocialMediaLinks.totalCount ?? null,
    ),
  );

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
    // The history resources are excluded here for the same reason they are excluded from
    // `hasError`: "Updating…" describes the page's LIVE numbers, and a chart request in flight is
    // not the reader's data changing. Its absence also keeps a slow history read from holding the
    // confirmation open for a beat that already settled.
  );

  /** True while a `loadMore()` continuation page is in flight (the resources' own loading state
   * doesn't cover the manual request, so the page hides "Load More" on this too). */
  readonly isLoadingMore = this.loadingMore.asReadonly();

  readonly hasError = computed(
    () =>
      this.linesResource.hasError() ||
      this.feedResource.hasError() ||
      this.lastWeekResource.hasError(),
    // 🔴 The two HISTORY resources are deliberately absent, and their exclusion is this phase's
    // acceptance rule rather than an oversight: a sparkline that will not load must not replace a
    // working page with the retry banner. Each history widget hides itself on its own
    // `networkHistoryFailed` / `linesHistoryFailed` instead. `home.store.spec.ts` fails a history
    // read and asserts this stays false.
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
   * through `sublinks` at every depth (`recordSubtreeVotes`). 🔴 **The feed's line filter is the ONE
   * key the overlay may omit** (and the one it must): the overlay reads stay unfiltered because a
   * wider read is harmless under this invariant, while a narrowed one would drop every id outside
   * the selected line. Do not "simplify" that walk back to `edges`, do not stop it at one level,
   * do not drop a window flag, and do not copy the filter into the overlay: an uncollapsed, a
   * wider-windowed, a filtered, or a shallower-walked read is a DIFFERENT id set, and the walk is
   * the only thing standing between a collapsed render and an anonymous-zero fallback for every
   * node the render shows but the walk never reaches.
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
  /** Bumped on every lines-only poll so the line cards' open accordions can re-read their own
   * data (`NetworkBoardComponent` → `LinePulseCardComponent` / `LinePulseRowComponent` →
   * chart/reports). */
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

  /**
   * The line whose board row is wearing the transient "you just reported about this" ring, or `null`.
   *
   * 🔴 IT LIVES HERE, NOT ON THE PAGE, because the board takes **no inputs at all** — it reads this
   * store for its lines, its groups and its poll tick, and giving it an input would mean re-deriving
   * what it already owns on the page. The page's only job is to call `highlightLine()`; the board
   * draws the ring and scrolls the anchor, and neither of them has to know which sheet just closed.
   */
  private readonly _highlightedLineId = signal<string | null>(null);
  readonly highlightedLineId = this._highlightedLineId.asReadonly();

  /** The auto-clear for the ring. Re-armed (never stacked) by every `highlightLine()`. */
  private _highlightTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Rings the given line's row for {@link HIGHLIGHT_VISIBLE_MS}, then clears.
   *
   * The timer is the whole "transient" half, and it is why the signal is `null`-able rather than a
   * boolean on the page: a highlight nobody cleared would be a permanently-ringed line that reads as
   * "this needs attention" — the one thing on this page that must never be cosmetic. A timer means
   * the state can also be forgotten (store destroyed, next visit) instead of outliving its meaning.
   */
  highlightLine(lineId: string): void {
    if (lineId === "") {
      return;
    }
    clearTimeout(this._highlightTimer);
    this._highlightTimer = setTimeout(() => {
      this._highlightTimer = undefined;
      this._highlightedLineId.set(null);
    }, HIGHLIGHT_VISIBLE_MS);
    this._highlightedLineId.set(lineId);
  }

  ngOnDestroy(): void {
    clearTimeout(this._highlightTimer);
    this._highlightTimer = undefined;
  }

  constructor() {
    // httpResource is lazy until first read — read each so the store fetches on creation
    // (the route-scoped store is created when the page mounts).
    //
    // 🔴 The two HISTORY resources are deliberately NOT read here: they wait for a widget's
    // `requestHistoryReads()` (see the block above for why that gate is necessary rather than
    // merely tidy), so a store with no mounted history surface — and every store spec that is about
    // the feed rather than about the charts — issues neither read.
    this.lines();
    this.feedLinks();
    this.lastWeekLinks();
    if (this.isBrowser) {
      void this.loadVoteOverlay();
    }
  }

  /**
   * (Re)starts the shared polling beat (no-op on the server).
   *
   * The store is route-scoped, but the router's injector for this route OUTLIVES the page
   * component: on every return to `/`, Angular creates a fresh `HomePage` while handing it the
   * SAME `HomeStore`, whose beat `ngOnDestroy` has just paused. So a first start (interval still
   * at its default) has nothing to do — `PollingSource` schedules itself when constructed and the
   * resources' constructor reads are the initial fetch — while a RE-entry must both re-arm the
   * beat and revalidate the first pages, or the returning reader would get the previous visit's
   * data with no countdown and no refresh ever scheduled. `resume()` is the only way back from
   * the paused `null`; re-applying `intervalMs()` would just re-apply the pause.
   */
  start(): void {
    if (!this.isBrowser) {
      return;
    }
    if (this.polling.intervalMs() === null) {
      this.polling.resume();
      this.reloadFirstPages();
    }
  }

  /** Pauses the shared polling beat — re-armed by a later `start()` at the same cadence. */
  stop(): void {
    this.polling.setIntervalMs(null);
  }

  /** The caller's vote for a link: overlay first, else the anonymous feed value, else 0. */
  userVoteFor(linkId: string): number {
    return resolveUserVote(this._userVotes(), this.feedLinks(), linkId);
  }

  /** Records the caller's vote after a successful vote mutation. Records against the id the
   *  wrapper reported, which for a thread is the VOTED card's id (root or member), not the root's. */
  setUserVote(linkId: string, value: number): void {
    this._userVotes.update((prev) => ({ ...prev, [linkId]: value }));
  }

  /** Reloads all three resources and drops appended continuation pages (they belong to the stale
   * dataset).
   *
   * The two HISTORY resources are reloaded here too, because this is the "the whole dataset is
   * invalid" path (submit / edit / report / the retry banner's "Try Now") and a reader who just
   * filed a report should not have to reload to see the service-day bar they just moved. The 30s
   * beat deliberately does NOT (`reloadFirstPages`) — a chart that redraws every 30 seconds is noise,
   * and the service-day aggregate it draws barely changes inside one tick. */
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
    this.networkHistoryResource.reload();
    this.linesHistoryResource.reload();
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
        // The same conditional spread the resource uses, and for the same reason: a continuation
        // page is a FRESH request with its own variables, so a cursor minted under one filter must
        // not be continued under another (see `setLineFilter`).
        ...this._lineFilterVars(),
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
        ...this._lineFilterVars(),
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
   *
   *     🔴 **THE ONE KEY THE OVERLAY MAY OMIT IS `lineId`, AND IT IS THE ONLY ONE.** The feed's line
   *     filter narrows the RENDERED rows (`FeedQueryVars.lineId`), so the overlay reads stay
   *     UNFILTERED — deliberately, and in the direction that is safe: a wider read is harmless under
   *     the rule above (an extra id costs nothing), while a narrowed one would drop every id outside
   *     the selected line and render a rider's own vote as anonymous. It is also the only way that
   *     stays true as the filter changes mid-session, since the overlay is a mount-time SNAPSHOT
   *     (see CADENCE) and a filtered read would freeze the filter's answer at that instant.
   *     `home.store.spec.ts` pins the asymmetry structurally: the overlay variables equal the
   *     mirrored resource's variables EXACTLY, less the single `lineId` key — no more, no less.
   *
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
    //
    // 🔴 Neither variables object below spreads the feed's `lineId` filter, and that is the ONE
    // documented asymmetry with the two resources. Do not "fix" it by copying the spread across:
    // a filtered overlay is a NARROWER read than the render, which is the direction that loses
    // votes (see the invariant above).
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
