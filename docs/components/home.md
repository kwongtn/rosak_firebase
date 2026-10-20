# Component: home

## 📌 Purpose & Scope

- **Core Responsibility:** The community front page and the app's landing route (`""`). One routed page
  composing:
  - a **hero** — plain-language network headline, tone line, four stat tiles, intent CTAs, live refresh
    indicator;
  - the **network board** — per-line status grouped `Needs attention` (full cards) → `My lines` →
    `All lines` → `Others` (compact rows): each line's live operational + passenger status, how far to
    trust it, and the social entries behind it;
  - a global rolling **feed** of approved links (voting, conversations) behind a Today / Last Week tab
    set, headed by a login-gated link submit box;
  - an alternate **Pro dashboard** layout (bento of six widgets), chosen by `?view=pro` or a stored
    preference.
- 🔴 **Every submission goes through ONE chooser** (`app-report-chooser`): five intent tiles (Delay /
  crowding · Stopped · Spot a train · Share a link · Report an incident), then — for the three
  line-based intents — a line picker ordered pinned → recent → severity. Triggers: the hero's "Report a
  delay" and the sticky **mobile action bar** (`lg:hidden`: `Report` · `Spot a train` icon-only ·
  `Refresh` · `Live map`, every control 44px), so no intent is reachable on desktop but not on a phone.
  A line's own report button opens the **line-status sheet** (link-less live report). After a successful
  status or spotting report the line's `#line-<id>` anchor scrolls into view and is briefly ringed.
- ONE fixed 30s refresh beat keeps the page current (line statuses, Today feed, Last Week first page
  once opened). Its countdown and a manual click are the same action.
- **Domain/Layer:** Angular Presentation (standalone, lazy routed feature, route-scoped providers).
  Reads/mutates the Django/Strawberry GraphQL backend; Firebase Auth gates every submit and vote. No
  Firestore.
- **Subcomponent map** (details in the sections below):
  - `home.page.ts` — the routed page: skip link (first child of `main`), nav → rider layout (board left
    / feed right from `lg`; board above feed when stacked) **or** `app-pro-dashboard` → footer. Hosts
    `app-report-chooser` (first sheet), the line-status sheet, the spotting `ReportFormComponent` in an
    `hlm-sheet`, the shared `app-link-sheet` and the mobile action bar. Starts/stops the store's
    polling, adapts the store to the retry banner, sets the route's `<meta name="description">`.
  - `hero/` — `home-hero.component.ts` (`app-home-hero`), `network-sparkline.component.ts`
    (`app-network-sparkline`).
  - `line-pulse/` — `network-board`, `line-pulse-card`, `line-pulse-row`, `line-status-chart`,
    `line-status-reports`, `status-info-chip` (thin wrapper over the shared `app-info-popover`:
    `showIcon=false`, forwards `showMethodologyLink`; `status-info-chip.server.spec.ts` renders it
    through the real server path to guard SSR/hydration) — each `*.component.ts`.
  - `pro/` — `pro-dashboard`, `pro-lines-widget` (+ `pro-lines-table.component.ts` / `.util.ts`),
    `pro-feed-widget`, `network-heat-strip`, `pro-incidents-widget`, `pro-report-ranking`,
    `pro-official-widget.ts`.
  - `feed/` — `link-submit-box.component.ts`, `feed-url.util.ts` (`normalizeFeedUrl`). Feed rows render
    through the shared insiden `app-link-thread` (recursive wrapper around `app-link-card`); there is no
    home-local card.
  - `line-status/line-status-sheet.component.ts`; `report/` — `report-chooser.component.ts`,
    `report-chooser.service.ts`, `report-chooser-order.util.ts`;
    `refresh-control/home-refresh-control.component.ts`.
  - `data/` — GraphQL modules `home.queries.ts` (shared schema enums), `home-board.queries.ts`,
    `home-feed.queries.ts` + `home-feed-items.ts`, `home-history.queries.ts`,
    `home-incidents.queries.ts`, `home-feed-mutations.queries.ts`; `home.store.ts`;
    `home-view-mode.service.ts`; `line-status-sheet.service.ts`; pure utils `network-summary`,
    `board-lines`, `status-confidence`, `status-history-display`, `status-info`, `line-status-metrics`,
    `passenger-status`, `home-feed`, `feed-filter`, `feed-day-groups`, `line-family` (each `*.util.ts`).
    Specs sit beside each file.

## 🔌 Interface & Data Flow

- **Route:** `""` in `src/app/app.routes.ts` — `loadComponent: HomePage` with
  `providers: [HomeStore, HomeViewModeService, LineStatusSheetService, SpottingLinesStore]`.
  - 🔴 **The route injector — and so `HomeStore` — OUTLIVES a visit.** The router retains it while
    `HomePage` is recreated on every navigation to `""`, so a return to `/` gets the SAME store.
    Lifecycle edges are asymmetric: `HomePage.ngOnDestroy` → `store.stop()` (pauses the beat); the next
    constructor → `store.start()` (resumes **and** revalidates first pages). Anything a destroy disarms
    must be re-armed by the next `start` (see Polling).
  - `HomeViewModeService` is route-scoped like the store, and because it reads `ActivatedRoute`: the ONE
    answer to "which view is this page in" is shared by the page (layout) and the board (toggle).
    `SpottingLinesStore` is the spotting feature's route-scoped line list, here because the spotting
    report form is hosted on this page.
  - **URL state:** `?view=` (`rider|pro`), `?sort=` (`severity|name`), `?op=` (operator/line-family
    chip; URL-only, the store follows via an effect), Pro-only `?line=` (feed line filter) and `?q=`
    (feed search). A default never appears in the URL. Mechanism: Network board → URL state.
- **Hosted spotting sheet:** `<hlm-sheet data-testid="spotting-entry-sheet">` wraps
  `<app-report-form #reportFormRef (submitted)="onSpottingSubmitted($event)" />` plus a
  Clear/Cancel/Submit footer (`submit-spotting-entry`). `onSpottingSubmitted(lineId)` closes the sheet,
  calls `store.reloadAll()` and rings that line. The seed comes from
  `ReportSheetService.openFor(lineId)` (root-provided), consumed by the form on its open edge — so the
  reported line rides on the `submitted` PAYLOAD (`output<string | null>()`, read before the form's own
  `clear()`): by the time the host hears of the submit the one-shot seed is already null.
- **Inputs:**
  - `LinePulseCardComponent`: `line = input.required<LinePulse>()`, `refreshTick = input(0)` (poll beat,
    forwarded to the expanded chart/reports). `LinePulseRowComponent`: `line`, `refreshTick`,
    `viewMode = input<PreferencesViewMode>("rider")`; padding is fixed (`p-3 pl-4`), no `density` input;
    the row injects `HomeStore` and calls `requestHistoryReads()` itself, so sixteen rows cost ONE read.
  - `NetworkBoardComponent`: **no data inputs** — it injects `HomeStore` (`lines()`, `isLoading()`,
    `linesRefreshTick()`, `highlightedLineId()`, its group views); the partition RULE and the
    post-submit highlight live in the store for that reason. Two layout inputs:
    `embedHeatStrip = input(true)` (Pro dashboard turns it off) and `foldQuiet = input(true)` (Pro lines
    widget turns it off).
  - `HomeHeroComponent`: `lines = input.required<LinePulse[]>()`, `linksToday = input(0)`, bound by
    `HomePage` from `store.lines()` / `store.feedTotalCount()`. Injects **no store**, issues **no
    request**; the beat lives only where it is drawn or driven (`HomeRefreshControlComponent`,
    `NetworkSparklineComponent`) — a hero with its own beat would double the countdown.
  - `LinkThreadComponent` (shared `app-link-thread`; full contract in `insiden.md`) as bound here:
    `link = input.required<LinkCardItem>()` (a `FeedLink` satisfies it; the backend nests each
    conversation under `sublinks`, so a row is self-contained); `userVote = input<number | null>(null)`
    (from `HomeStore.userVoteFor(link.id)`; `null` not `0` so "not supplied" differs from "host removed
    my vote"; NOT forwarded to nested levels — unkeyed);
    `voteValues = input<Record<string, number>>({})` (the store's whole overlay, forwarded to every card
    at every depth); `editable = input(false)` (gated by `canEditLink`, forwarded to every descendant).
  - `LineStatusSheetComponent.line = input<LinePulse | null>(null)` (`LineStatusSheetService.lineId()`
    is the fallback for hosts that only know the id).
- **Outputs:**
  - `LinkSubmitBoxComponent.submitted = output<void>()` — after submit or duplicate; the host calls
    `reloadAll()`.
  - `LinkThreadComponent.voteChanged = output<{ id: string; value: number }>()` carries the **voted
    card's** id (root, sublink or deeper) → `HomePage.onVoteChanged` →
    `HomeStore.setUserVote(id, value)`; `edit = output<LinkCardItem>()` carries the **clicked
    descendant's own** item (a wrong object edits the wrong link).
  - `LineStatusSheetComponent.submitted = output<void>()` — after success the page reloads **and** rings
    the line; the id comes from the service (which keeps it after close), so the output is payload-free.
  - `ReportFormComponent.submitted = output<string | null>()` — spotting; the line it filed against.
- **GraphQL documents** (`data/home-*.queries.ts`; hand-written types, no codegen):
  - `FRONT_PAGE_LINES_QUERY` (`home-board.queries.ts`): `id/code/displayName/displayColor/status`,
    `inServiceVehicleCount`/`totalVehicleCount`, `vehicleStatusCounts`, `passengerStatus` (nullable),
    `statusReportCount`, `passengerStatusCount`/`passengerStatusCounts` (the passenger legend's
    per-category breakdown), `statusWindowMinutes` (rolling window), flat
    `pulseLinks { id url title created isAutomated }`. `isAutomated` is the backend provenance flag —
    the ONLY thing separating "the operator announced it" from "N riders think so"; the confidence chip
    and the hero's official callout read it. `passengerStatusMessage` and other `pulseLinks` fields
    (`user`, `lines`, `voteScore`, `userVote`, `voteBreakdown`, `normalizedUrl`, `occurredAt`) are
    deliberately NOT selected; `home.queries.spec.ts` pins the selection field-for-field (a fixture can
    invent any field).
  - `home-history.queries.ts`: `LINE_STATUS_HISTORY_QUERY` (hourly buckets: `count`, `dominantStatus`,
    `statusCounts { status count }`) and `LINE_STATUS_REPORTS_QUERY` (keyset-paginated; nodes carry
    `stations { id displayName }`) back the expanded panel; `NETWORK_STATUS_HISTORY_QUERY`
    (`networkStatusHistory(dayStartHour)`) and `LINES_STATUS_HISTORY_QUERY`
    (`linesStatusHistory(lineIds)`) back the sparkline, row tally, heat grid and Pro ranking (same
    `LineStatusHourBucket` fields, pinned in the spec); `SUBMIT_LINE_STATUS_REPORT_MUTATION`
    (`submitLineStatusReport(input: LineStatusReportInput!)`).
  - `FEED_QUERY` (`home-feed.queries.ts`): the `publicSocialMediaLinks` connection. Args: `first`,
    `after`, `status`, `currentServiceDayOnly`, `lastWeekOnly`, `alignPageToDay`, `collapseThreads`,
    `lineId`. Returns `edges { node, cursor }`, `pageInfo { hasNextPage, endCursor }` and a
    cursor-independent `totalCount`. Node: `status` (approval; the card's Pending pill), `completed`
    (console's "mark handled" flag), `isAutomated` (Official chip), `occurredAt`, conversation fields.
    One document backs **three** resources (Today, Last Week, official archive).
    - **`occurredAt`** is the displayed AND ordering instant ("when did this happen"): leading key of
      `-occurredAt, -id`, of day windows and of the keyset cursor. Naive local wall time, no offset
      (backend `USE_TZ = False`) — never re-format through UTC.
    - **Conversation fields** `parentId` / `isThreadRoot` / `sublinkCount` / nested `sublinks { … }` are
      **required on `FeedLink`** (optional on the structural `LinkCardItem`): with
      `strict`/`strictNullChecks` OFF an optional field here would be a hole the compiler cannot report.
      The old names (`threadId` / `threadSize` / `threadLinks`) are gone server-side with no alias — a
      stale spelling is a hard "Unknown field" on the whole query. `isThreadRoot` is a root marker
      (`parentId == null`, also true of every ungrouped link), so it may not decide whether to draw an
      expand affordance. `sublinkCount` is a node's OWN publicly-visible descendants **at any depth**:
      size a conversation from the ROOT's count, never sum the column.
    - Each sublink level selects what a card renders for a child: the root's fields minus
      `normalizedUrl`; `created` stays (`LinkCardItem` requires it — a child without it renders a blank
      time) and so do the tree scalars (a nested conversation can expand). Types are an intersection
      chain over `Omit<FeedLink, "normalizedUrl" | "sublinks">`: `FeedLinkSublink`, `…Level2`,
      `…Level3`, `…Level4`. The document writes **four** `sublinks` blocks while the type stops at level
      3: the server's `MAX_THREAD_DEPTH = 3` counts a root as depth 0, so a level-4 node answers `[]`.
      The extra block is deliberate — nesting is a number checkable against the server constant, and
      raising the cap needs no document change.
    - **Today:** `first: FEED_PAGE_SIZE` (8), `status: "LIVE"`, `currentServiceDayOnly: true` (so a row
      is always approved, never Pending). **Last Week:** `first: LAST_WEEK_PAGE_SIZE` (20),
      `status: "LIVE"`, `lastWeekOnly: true`, `alignPageToDay: true`. `lastWeekOnly` = event instant
      since 00:00 Asia/Kuala_Lumpur six days before today AND before 00:00 today: **today excluded**
      (backend `displayTodayInLastWeek` defaults `false`; Today already carries the current day). The
      window is backend-computed so no date is baked into query vars (SSR TransferState needs identical
      vars), and that argument is deliberately **not** sent, so a frontend deployed before the backend
      still gets the right window. `alignPageToDay` lets a page overshoot `first` to finish its calendar
      day.
    - **`lineId`** narrows to one line (Pro feed's line filter). Nullable; every call site **omits the
      key** when unfiltered ("unfiltered" is the ABSENCE of the argument — structurally identical
      variables between server render and hydration). `FeedQueryVars.lineId` is `string | undefined`,
      never `null`; the overlay reads never send it.
    - **`collapseThreads: true`** — only this surface collapses; a compile-time constant. `HIDDEN` rows
      never reach the query (the public-feed resolver excludes them after `status` narrowing).
  - `SUBMIT_FEED_LINK_MUTATION` (`home-feed-mutations.queries.ts`):
    `submitFeedLink(input: FeedLinkInput!)` → `{ ok, isDuplicate, duplicateOfId, userVote, link }`; its
    `link` sub-selection mirrors the node selection. The new link is **not** prepended: the box emits
    `submitted` and the page calls `reloadAll()`, re-reading the collapsed feed.
  - `UPVOTE_SOCIAL_MEDIA_LINK_MUTATION` / `DOWNVOTE_SOCIAL_MEDIA_LINK_MUTATION` /
    `REMOVE_SOCIAL_MEDIA_LINK_VOTE_MUTATION` (shared vote button): each selects
    `{ ok userVote voteScore upvotes downvotes }`; the button repaints from that acknowledgement rather
    than projecting the score.
  - `HOME_RECENT_INCIDENTS_QUERY` + frozen `HOME_RECENT_INCIDENT_VARS` + `PRO_INCIDENT_LIMIT`
    (`home-incidents.queries.ts`) — the Pro incidents read.
  - Input types:
    `FeedLinkInput { url, title?, occurredAt?, lineIds?, stationIds?, status?, delayMinutes?, notes? }`
    and `LineStatusReportInput { lineId, status, stationIds?, delayMinutes?, notes? }`.
    `FeedLinkInput.occurredAt` is only sent when a caller has a value (no edit path here, so omitted ≡
    `null`). Enums mirrored: `LineStatus`, `PassengerStatus`, `SocialMediaLinkStatus`.
- **Dependencies (shared, consumed):**
  - `graphqlResource()` (`core/graphql/graphql-client.ts`) — reactive reads (SSR TransferState + backoff
    retry); its `isFetching` (raw in-flight, unlike pristine-only `isLoading`) backs
    `HomeStore.isRefreshing`. `GraphQLClient.request(query, variables?, extraHeaders?)` — mutations and
    the authenticated overlay read.
  - `AuthService` (`isLoggedIn`, `login()`, `idToken()`, `whenReady`).
  - `PollingSource` (`core/polling/polling-source.ts`) — the shared beat; pauses while `document.hidden`
    (deadline kept) and on return refreshes at once if the deadline passed, else re-arms for the
    remainder. Timers are browser-only: SSR never arms one, a hidden tab costs nothing.
  - `PreferencesService` (`core/preferences/`), `query-param.util` (`core/url-state/`), `csv.util`
    (`core/export/`) — see Internal State.
  - `AssetMultiSelectComponent` (`features/insiden/asset-multi-select/`) — station picker (status sheet)
    and line picker (advanced link form). `VoteButtonComponent` (`features/insiden/vote-button/`) —
    `targetType="link"`, `VoteValue ∈ {-1, 0, 1}`, optimistic with rollback. `humanizeSince`
    (`features/spotting/data/humanize-since.util.ts`). `faviconHostnameOf`
    (`features/insiden/data/social-link.util.ts`) for the pulse card's favicon; the shared card's
    `linkUrlPartsOf` (`features/insiden/data/link-url.util.ts`) uses `splitHttpUrl`
    (`features/insiden/data/incident-link-line.util.ts`).
  - `LinkSheetService` / `app-link-sheet` / `canEditLink` / `app-link-thread` (`features/insiden/**`) —
    the shared link create/edit flow (same sheet as /insiden and situasi) and row wrapper. "Advanced
    Input" opens create mode with a one-shot URL prefill (`open(context?, { url })`); the card's pencil
    opens edit mode; **both** feed loops (`store.feedLinks()` and each `lastWeekDayGroups()` group)
    render `<app-link-thread>`.
  - `LineStatusBadge` (`domain-ui/line-status-badge`), Hlm primitives, `ToastService`,
    `RetryBannerComponent` (via structural `RetryableResource`), `AppNavComponent` /
    `AppFooterComponent` (`shell/`).

## ⚙️ Internal State & Logic

### HomeStore (`data/home.store.ts`, `@Injectable()`, provided by the route)

The single source of truth for page data.

- **Page resources.** `linesResource` (`FRONT_PAGE_LINES_QUERY`), `feedResource` (`FEED_QUERY`, Today
  vars), `lastWeekResource` (`FEED_QUERY`, Last Week vars). The constructor reads the first two once;
  `lastWeekResource` is inert until `requestLastWeek()` (called the first time the Last Week tab is
  activated, never on load). Both link resources spread
  `HOME_FEED_COLLAPSE_VARS = { collapseThreads: true }`.
- **Lazy, ISOLATED reads** — the service-day history pair, the incidents read, the official-notices
  archive. Opt-in, and kept out of page error/refresh state:
  - **Opt-in is load-bearing.** `graphqlResource` installs an effect that reads its `httpResource` at
    call time, so a gate only the projections satisfied would not defer the request; one explicit call
    from the surface that renders the answer is the only honest gate (same as
    `LineStatusChartComponent`'s `expanded`). Heat grid, ranking, table and Pro widgets call from their
    constructors; the sparkline and row from `afterNextRender` (SSR never issues the read).
  - **Isolation.** None feeds `hasError`, `isLoading`, `isLoadingLastWeek` or `isRefreshing` — those
    drive the retry banner, board skeleton and "Updating" label, so folding a decorative widget in would
    replace a working page with one banner. A failed read hides ITS widget only.
  - 🔴 **Projections read the failure flag BEFORE `data()`**: a `graphqlResource`'s `data()` THROWS in an
    error state, which would take the page down from inside a `computed`. Widgets gate on the flag first
    too.
  - **History:** `networkHistoryResource` (`NETWORK_STATUS_HISTORY_QUERY`, vars `{}`) and
    `linesHistoryResource` (`LINES_STATUS_HISTORY_QUERY`, vars `{ lineIds }`, capped at
    `HISTORY_LINE_ID_CAP` = 64, the backend's limit). Inert until `requestHistoryReads()` AND `lines()`
    has data. Projections: `networkHistory()`, `linesHistoryFor(lineId)` (O(1) map lookup per row),
    `networkHistoryFailed`, `linesHistoryFailed`. Failed or empty hides the widget (`[]` is the
    backend's "nothing reported this service day"); exceptions under Service-day widgets. `reloadAll()`
    re-reads both; the beat does not (a chart redrawing every 30s is noise).
  - **Incidents:** `incidentsResource`, gated on `requestIncidentsRead()`; `recentIncidents` /
    `incidentsFailed` (no loading flag).
  - **Official-notices archive:** `officialNoticesResource` re-issues `FEED_QUERY` with frozen
    `OFFICIAL_NOTICES_VARS`; gated on `requestOfficialNotices()`; `officialNotices` /
    `officialNoticesFailed` / `officialNoticesLoading`. Absent from `reloadAll()` and the beat (like
    incidents): a notice filed elsewhere invalidates nothing it draws. Mounting the widget re-reads it
    (per the store's own comment). Details under Pro dashboard.
- **Feed line filter** (`lineFilter` + `setLineFilter()`) derives from ONE signal, so a filtered list
  never sits beside an unfiltered denominator or a cursor from the wrong query: both resources and both
  `loadMore*` read it; the two overlay reads deliberately do NOT. `setLineFilter` **clears every
  appended page of both feeds** (a cursor only means something inside the query that minted it). `""` is
  `null`; re-selecting the current filter is a no-op. The beat still preserves Load More progress.
- **Board views — a PARTITION, not three filters:** `networkSummary` (`summarizeNetwork`),
  `attentionLines`, `myLines`, `allLines`, `othersLines`, `visibleLines`, and the `boardSort` signal
  (`"severity" | "name"`; `DEFAULT_BOARD_SORT` / `BOARD_SORTS` exported for the URL parse;
  `setBoardSort()` ignores unrecognised values).
  - 🔴 **Every line is in EXACTLY ONE group**, by one decision in one order. **Attention wins for
    in-service lines**: a needs-attention line is in `attentionLines` even when pinned (pinning says "I
    care", not "hide a broken one further down"). Out-of-service (TESTING/DEFUNCT) lines never reach
    attention, so for them **pin wins**: `myLines` = pinned AND not in attention (pinned Testing/Defunct
    included). `allLines` = the in-service rest; `othersLines` = the unpinned out-of-service rest (LAST;
    never counted by the hero). Each group subtracts the ids earlier groups CLAIMED instead of
    re-deriving a predicate — independent filters are how a line lands in two groups or none.
  - `attentionLines`/`myLines` are always severity-sorted; `allLines`/`othersLines` follow `boardSort`
    (severity, or `code` via `localeCompare` so `K10` does not sort before `K2`).
  - `visibleLines()` = `lines()` narrowed by operator family (`?op=`, `setLineFamily` — NOT a Pro
    filter, so `resetProFilters()` leaves it: a shared family link must render on the Rider board), then by the three Pro filters. The
    partition is taken over `visibleLines` so a filter cannot shrink one group without the others; with
    filters off it IS `lines()`. The hero headline/tiles and the history reads stay on `lines()` (they
    describe the NETWORK; history is keyed by line id).
  - `PreferencesService` is injected (root, outlives this store); the store reads `pinnedLineIds()` and
    nothing else.
- **Conversation collapsing (`HOME_FEED_COLLAPSE_VARS`)** is in **all six reads** of the connection:
  `feedResource`, `lastWeekResource`, `loadMore()`, `loadMoreLastWeek()` and both authenticated overlay
  reads. A correctness requirement: a conversation's descendants are not adjacent under
  `-occurredAt, -id` (an admin can nest a 09:00 post under an 11:00 one, possibly pages apart), so
  client-side grouping of a flat page is unsound — a sublink can arrive with its root nowhere on the
  page. Collapsing makes the backend return **roots only** with each subtree under `sublinks`.
  Knock-ons: `totalCount` counts rendered roots ("Showing X of Y" does not inflate); continuation pages
  must agree with page one (a continuation is a fresh request, so the constant is repeated, not
  inherited — an uncollapsed page 2 re-lists every root and renders sublinks as loose rows); the overlay
  is only complete if it asks for the same shape. `/insiden`, situasi, per-incident cards and My Links
  stay flat and omit the key.
- **Derived state.** `lines`; `feedLinks` (first + appended pages, de-duplicated by `node.id`);
  `feedPageInfo` (appended `hasNextPage`/`endCursor` wins, via `??` so an appended `false` beats a stale
  `true`); `feedTotalCount`; Last Week mirrors `lastWeekLinks` / `lastWeekPageInfo` /
  `lastWeekTotalCount`; `lastWeekDayGroups` (`groupFeedLinksByDay`, keyed on the **displayed** instant
  `occurredAt ?? created`); `lastWeekCount` (`null` until the first Last Week page lands, so the tab
  reads `Last Week (–)` and never a false `0`); `lastWeekPending` (requested, unanswered, not failed —
  drives `last-week-skeleton`, covering the beat between selecting the tab and the answer);
  `isLoadingLastWeek` (pristine fetch, false for an unrequested read — used by the refresh control's
  initial-load exclusion, not for the skeleton).
  - `feedTotalCount` / `lastWeekTotalCount` = `Math.max` of the live first-page total and the appended
    reading (`maxFeedTotalCount`): the beat refreshes page one while appended signals stay frozen, and a
    denominator below either source reads "Showing 40 of 12".
  - `isLoading` = lines + Today feed (pristine). `hasError` ORs all three page resources. `isRefreshing`
    ORs their **`isFetching`** (observable for every reload); its one consumer-side exclusion is the
    pristine first fetch (`isLoading() || isLoadingLastWeek()`).
  - ⚠️ `edges` / `lastWeekEdges` de-duplicate by `edge.node.id` on merge, first wins:
    `reloadFirstPages()` refetches page one while appended pages stay, and an edit/delete between reads
    can shift a row into a position appended pages already cover; a duplicate id throws on
    `@for (…; track link.id)`. Overlap only — a row DELETED server-side since a page was appended
    lingers until `reloadAll()` drops the appended pages.
- **Cursor pagination.** `appendedEdges` / `appendedHasNext` / `appendedTotalCount` / `nextCursor` /
  `loadingMore`; `loadMore()` re-issues `FEED_QUERY` via `GraphQLClient.request` with the last cursor
  and appends, coalesced by `loadingMore` (no-op without next page/cursor). Last Week mirror:
  `lastWeekAppended*`, `lastWeekNextCursor`, `lastWeekLoadingMore`, `loadMoreLastWeek()`,
  `isLoadingMoreLastWeek`.
- **Polling.** Public `polling = new PollingSource(() => this.reloadFirstPages())`, 30s default.
  - `reloadFirstPages()` re-reads page one of all three resources (Last Week only once requested) and
    bumps `linesRefreshTick` (page → board → card/row → open chart/reports). It touches **no
    appended-page signal**, so a poll never drops Load More progress. `reloadAll()` (resets both
    appended sets; reloads lines, feed, Last Week-if-requested and both history reads) stays with the
    submit box, the sheets and the retry banner. The beat covers the whole page so the countdown never
    lies about what it refreshes.
  - 🔴 `start()` / `stop()` are **not** symmetric (the store outlives the page). `stop()` =
    `polling.setIntervalMs(null)`. `start()` is a no-op on the server **and** on a first mount (the
    `PollingSource` constructor schedules the beat; constructor reads are the initial fetch); only on a
    **re-entry** (`polling.intervalMs() === null` on a retained store) it calls `polling.resume()` (the
    ONLY exit from the paused `null`; re-arms at the last named cadence, else 30s) **and**
    `reloadFirstPages()`. 🔴 Never spell the resume `polling.setIntervalMs(polling.intervalMs())`: it
    re-applies the paused `null`, the beat stays dead and the control's `@if (intervalMs() !== null)`
    renders nothing — the refresh row vanishes for the session (`MISTAKES.md`, fix `7221ff6`).
  - The public beat feeds the control (`intervalMs()` / `secondsRemaining()`) and `refreshNow()`, so
    tick and click cannot diverge.
- **Authenticated `userVote` overlay.** `graphqlResource()` sends no token, so the feed's `userVote` is
  always `0`. When logged in, `loadVoteOverlay()` awaits `auth.whenReady`, then issues **two** reads in
  `Promise.allSettled` (Today first page, Last Week first page;
  `GraphQLClient.request(..., { "firebase-auth-key": idToken })`) and records every non-zero vote into
  the **public** `userVotes`, bound into every `app-link-thread`'s `voteValues`. `allSettled`, not
  `all`: one failure must not lose the other's votes. Per-id (a thread renders root **and** members,
  each votable); an absent id means "no opinion", not `0`. `userVoteFor(linkId)`: overlay → anonymous
  feed value → `0`. `setUserVote(linkId, value)` records a vote after a successful mutation against the
  id the wrapper reported.
  - ⚠️ **INVARIANT — the overlay's read set must EQUAL the set of ids the page RENDERS.** Two
    independent requirements, each of which has shipped broken on its own:
    1. **THE READ.** Each overlay read is the same query with the same variables as the resource it
       mirrors (window flags, `first`, `collapseThreads`), minus only the auth header.
       `home.store.spec.ts` compares the resources' variable objects **structurally** to the overlay's
       (key sets too), so an added or removed key is red. A wider window is harmless; a different one is
       not. 🔴 **`lineId` is the ONE key the overlay omits — and MUST:** the line filter narrows what is
       RENDERED, so a narrowed read would drop every id outside the line and, as a mount-time snapshot,
       freeze the filter's answer. The spec applies the filter BEFORE capturing, or the omission would
       be trivially true.
    2. **THE WALK.** The read is collapsed, so `edges` holds only ROOTS, yet every node below is
       rendered and votable: `recordSubtreeVotes` **recurses through `sublinks` at every depth** (no
       depth limit, no `MAX_THREAD_DEPTH` mirror). A roots-plus-one-level walk shipped and left deeper
       nodes reading the anonymous `0`, with no error anywhere.

    Break either half and a rider's own vote renders as never cast, since `LinkThreadComponent.voteFor`
    falls back to `link.userVote ?? 0`, which for `graphqlResource` data is ALWAYS the anonymous zero.
    Do not simplify the walk back to `edges`, stop it at one level, or drop a window flag.

  - **Cadence:** the equality is claimed at MOUNT TIME; the overlay is a snapshot, not re-read per beat.
    A root arriving on a later beat has no overlay entry (anonymous zero) — accepted: an id that did not
    exist when the reader arrived cannot carry their vote. Do not "fix" it with per-beat overlay reads
    (two extra authenticated reads every 30s for rows whose only possible vote is zero).
- **Post-submit highlight.** After a successful line-status report the page calls
  `HomeStore.highlightLine(lineId)`: it sets `highlightedLineId` and arms a `HIGHLIGHT_VISIBLE_MS`
  (2000ms — deliberately longer than the 500ms "Updated" flash, which is an acknowledgement, not
  something to read) timer; `ngOnDestroy` cancels it. 🔴 It lives in the STORE because the board takes no
  data inputs. A status report's id comes from `LineStatusSheetService.lineId` (survives close); a
  spotting submit's from the `submitted` payload. Board behaviour: Network board.
- **Other state:** `quietLinesExpanded` / `setQuietLinesExpanded()` (session-lived); the Pro filters,
  provenance axis, `feedSearchQuery`, `lineFilter` and `resetProFilters()` (see Pro dashboard).

### Sheet, chooser and view-mode services

- **`LineStatusSheetService`** (`data/line-status-sheet.service.ts`): `isOpen` + `lineId` +
  `presetStatus` signals, `openFor(lineId, { presetStatus? })` (sets all three and records
  `PreferencesService.lastReportedLineId`, so even an opened-then-closed form feeds the hero's "Report
  on {line}"), `setOpen(open)`. Card, row and chooser call `openFor`. 🔴 `presetStatus` exists for ONE
  caller — the chooser's "Stopped" tile — and is **one-shot**: the sheet consumes it (back to `null`) on
  the open edge, like the spotting form consumes `ReportSheetService.lineId`, so a later seedless open
  cannot resurrect a status from a submitted or cancelled report.
- **`ReportChooserService`** (`report/report-chooser.service.ts`, root): the page's one submission
  trigger, mirroring `LinkSheetService` — `isOpen` + `intent`, `open()` / `choose()` / `backToTiles()` /
  `setOpen()`. Root-provided because its triggers are in two components (hero CTA, mobile bar) while the
  page hosts the sheet. `intent` is cleared by `open()` and every close, so a stale trigger cannot
  resurrect a half-finished "which line?" step.
- **`HomeViewModeService`** (`data/home-view-mode.service.ts`): the ONE reader/writer of `?view=`.
  `view()` = the URL's `?view=` when present (unrecognised → default), else
  `PreferencesService.viewMode()`. The board reads it and its toggle calls `setView()`; `HomePage`
  branches on it; the Pro `p` shortcut uses it. `setView()` writes the preference **and** the URL
  (`view()` is URL-first; a preference-only write would leave the effective view `pro` and the button
  would look dead).

### Report chooser (`report/`)

`app-report-chooser`: step 1 five tiles (`chooser-tile-delay|stopped|spot|link|incident`); step 2 a line
picker (`chooser-line-picker`, `-filter`, `-list`, `chooser-line-<id>`, `-hint`, `chooser-no-match`,
`chooser-empty-lines`) for the three line-based intents. It reads `HomeStore.lines()`, issues **no
request**, and offers the last reported line as a button above the tiles (`chooser-report-last`; skips the picker). 🔴 It must
be MOUNTED FIRST among the page's sheets (ordering note on its doc comment; pinned in
`home.page.spec.ts`). Ordering/filtering = pure `orderChooserLines` + `filterChooserLines`.

- **delay** → `LineStatusSheetService.openFor(lineId)` with NO preset ("Delay / crowding" is two
  conditions; only the reader knows which they saw).
- **stopped** → same sheet with `{ presetStatus: "DISRUPTED" }` (the rider's word mapped onto the
  existing PassengerStatus, not a ninth value).
- **spot** → `ReportSheetService.openFor(lineId)`. **link** → `LinkSheetService.open()`.
- **incident** → `IncidentSheetService.open()` **then** `router.navigate(["/insiden"])` — the sheet is
  hosted by `/insiden`, so opening first (root service) makes it already open on arrival.

Every line-based choice also calls `PreferencesService.pushRecentLine(line.id)`; the chooser closes
after all five dispatches. It **creates no data** — an intent needing its own write path is a backend +
feature decision. New intent = one tile-table entry + one branch in `onTile()` / `onLineChosen()`; new
ordering rule = one pure function + spec.

### HomePage

- `sheetLine` computes the `LinePulse` for `lineStatusSheet.lineId()` from `store.lines()`;
  `errorResource` is a minimal `RetryableResource` adapter over `store.reloadAll()` (no countdown) — the
  pattern for giving a store, not raw resources, to the retry banner. `start()` in the constructor,
  `stop()` in `ngOnDestroy` — a **pause**, not a teardown.
- The page holds no refresh state or line data: it mounts `<app-network-board>`, hosts the ONE
  `app-home-refresh-control` (inside the hero), the chooser, spotting sheet and mobile bar. Handlers are
  thin: `openReportChooser()`, `refreshNow()` (→ `store.polling.refreshNow()`),
  `onLineStatusSubmitted()` (reload + `store.highlightLine(id)`), `onVoteChanged({ id, value })`
  (records against the **voted card's** id — the root's would file a member's vote under the group).
- **Layout.** Retry banner and footer are full width. Board + feed share `data-testid="home-panels"`
  (`flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start`): 🔴 **board left / feed right** from
  `lg`, board ABOVE feed stacked. That is **DOM order, not a CSS `order` value** — grid fills in
  document order and the stacked layout follows it, so one swap moves both (an `order` value fixes only
  desktop). The live network is why readers open the page, so it leads. Stacked, the FEED section draws
  the divider (`border-border border-t pt-6 lg:border-t-0 lg:pt-0`; dropped at `lg`, where it would draw
  a line down the gap). The board section keeps `scroll-mt-24` (every `#line-<id>` anchor lives in it)
  and carries `id="line-board"` + `tabindex="-1"` (the skip link's target). `main` has `pb-24 lg:pb-6`
  so the mobile bar never covers the last feed row.
- **Mobile action bar** (`home-mobile-bar`,
  `fixed inset-x-0 bottom-0 z-30 lg:hidden pb-[env(safe-area-inset-bottom)]`): `home-mobile-report`
  (chooser), `home-mobile-spot` (icon-only, `size-11`, `ReportSheetService.open()`, no line seed),
  `home-mobile-refresh` (the SAME `store.polling.refreshNow()` as the countdown click),
  `home-mobile-map` (`routerLink="/tracker"` anchor — "Live map" must not be the one intent mobile
  loses). OUTSIDE the rider/Pro branch as shared chrome (a second bar would duplicate the refresh
  affordance), after the main content in DOM order (a fixed bar must not precede the panels it
  overlays). Report, Live map and the skip link use the default theme (`hlmBtn` default / `bg-primary`),
  not the MLPTF brand override.
- **Feed column.** Opens with a visually-hidden `<h2>Community feed</h2>`; the submit box is its first
  INTERACTIVE element (full width on mobile, column-wide from `lg`, ahead of the tabs). The feed renders
  **every loaded link** in an uncapped `feed-scroll` (the page scrolls). `feed-footer` holds
  `feed-count` (`Showing X of Y` = `store.feedLinks().length` over `feedTotalCount()`) beside
  `feed-load-more`, both hidden while empty. States: first page loading → `feed-skeleton`
  (`hlmSkeleton h-24 w-full`); empty, settled, error-free → muted dashed `feed-empty` ("No links yet
  today — be the first") with a `feed-empty-cta` that opens the same shared link sheet as the hero's
  "Share a link" (ONE link-submission surface); a read error → the retry banner replaces both.
- 🔴 **Today / Last Week is a TAB SET, not a disclosure.** One `role="tablist"`
  (`aria-label="Feed period"`) holds `feed-tab-today` / `feed-tab-lastweek` (`role="tab"`,
  `aria-selected`, `aria-controls`, roving `tabindex` — exactly ONE tab in the page tab order) over two
  `role="tabpanel"`s with DOM ids `feed-panel-today` / `feed-panel-lastweek` (Last Week also
  `data-testid="last-week-panel"`; each `aria-labelledby` its tab, `tabindex="0"` so a keyboard reader
  lands on a panel with no focusable child — the Last Week empty state has none).
  - `ArrowRight`/`ArrowLeft` step and **wrap**; `Home`/`End` jump; other keys are left alone so `Tab`
    leaves the set; `preventDefault` only for those four. Selection is automatic (arrow selects AND
    focuses): a focus-only move would make the reader press Enter for the list they asked for.
  - The inactive panel is **`hidden`, never unmounted**: each `aria-controls` resolves and an expanded
    conversation survives the round trip. Layout classes live on an inner wrapper — a Tailwind `display`
    utility on the panel would out-rank the stylesheet's `[hidden]`.
  - State is one signal, `HomePage.feedTab` (`"today" | "lastweek"`, default `"today"`, not persisted):
    two periods of which one shows is an EXCLUSIVE choice. 🔴 **Switching changes presentation only** —
    both resources stay mounted and in flight, both appended sets are kept, neither read re-issues.
  - Last Week is **lazy** (once requested it stays requested and the beat keeps it fresh).
    `last-week-count` sits on the **tab label** (`Last Week (N)`): a count shown only after switching
    would be one tap too late to decide with.
  - The Last Week panel lists the same links over the last 7 calendar days, **today excluded** (newest
    group is always "Yesterday"), bucketed by local calendar day (`last-week-day-group`, `h3` headings
    Today / Yesterday / `EEE, d MMM`), with `last-week-skeleton`, `last-week-empty` ("No links in the
    last week.") and `last-week-load-more` (20-link day-aligned pages; may exceed 20 to finish a day).
    `canLoadMoreLastWeek` gates it on `lastWeekPageInfo().hasNextPage` while nothing is loading.
- **Feed edit wiring.** `canEdit(link)` = `canEditLink` with `isLoggedIn`/`isAdmin`/`user.uid` from
  `AuthService`; `openEdit(link)` = `LinkSheetService.openEdit(link)`; the page hosts `<app-link-sheet>`
  and reloads (`store.reloadAll()`) on its open→closed edge. ⚠️ `canEdit` is evaluated on the thread
  **root** and forwarded to every level, so a conversation also paints a pencil on a sublink somebody
  else submitted — cosmetic over-permission only (the backend re-checks on write). Per-level authorship
  would need a predicate input on `app-link-thread`; no host asks for one.
- **Shared link row.** `app-link-thread` / `app-link-card` are insiden components; their contracts
  (recursive wrapper, collapsed per level, `sublinkCount > 0` gate, `threadLabel(sublinkCount() + 1)`,
  `voteFor` fallback chain, stretched-link anchor, two time axes) live in `insiden.md`. Home rules: the
  root renders through the same card with the same inputs as a plain row (no bold/badge/size change — a
  product decision; the only difference is the rail's "N links" chip the card owns); the chip is gated
  on the card's `sublinkCount` **input**, never `link.sublinkCount`, and the wrapper passes the real
  count here; the Pending pill follows approval `status === "PENDING_APPROVAL"` (never `completed`); the
  Official chip follows `isAutomated` (only `FEED_QUERY` selects it, so other hosts show no chip);
  nothing here knows `MAX_THREAD_DEPTH`.
- **`feed-day-groups.util.ts`** (`groupFeedLinksByDay`): **local**-calendar buckets (the backend's naive
  Asia/Kuala_Lumpur timestamps; unlike insiden's UTC `link-day-group.util`), keyed on
  `occurredAt ?? created` so a day header never names a different day than the card's timestamp; an
  unparsable date goes into a headerless `""` group.

### Link submit box (`feed/link-submit-box.component.ts`)

Logged out: a `login-to-submit` button ("Log in to submit links", `auth.login()`). Logged in: a Signal
Forms `model`/`linkForm` (URL required) and two buttons in one row (`flex-col` → `sm:flex-row`):
**Submit Link** (`type=submit`) sends only `{ input: { url: normalizeFeedUrl(url) } }` via
`submitFeedLink`; **Advanced Input** (`advanced-input`, `type=button`) calls
`linkSheet.open(undefined, { url: trimmed || undefined })` — the shared sheet in create mode with the
typed URL as one-shot prefill (its form adds title + asset tags). Local state: `duplicateOfId`,
`isSubmitting`, `submitError` (inline `feed-submit-error`; rejected or unreachable submit),
`submitAttempted`.

- The input is `type="text"` + `inputmode="url"`; `normalizeFeedUrl` scheme-qualifies at submit time
  (native `type="url"` silently rejected schemeless input before the handler ran).
- Duplicate response: stores `duplicateOfId`, shows `duplicate-indicator` whose "View it in the feed"
  link is `#feed-link-<id>` (⚠️ no feed row renders that id — a dead anchor; see Feature Opportunities)
  and records the backend's auto-upvote via `store.setUserVote`. A fresh submit toasts success; either
  outcome resets the form and emits `submitted`.
- **Validation is submit-gated; blur stays quiet.** The "Enter a URL" note, destructive border and
  `aria-invalid` follow `submitAttempted` (set first in `submit()`, cleared by `_reset()`), not the
  field's `touched()` (`FormField` marks touched on blur, which cannot tell "typed and left" from
  "pressed Submit"). The button and `(keydown.enter)` both route through `submit()`. The flag reaches
  the border via `HlmInput`'s optional `errorVisible` input, which **overrides** `touched` when supplied
  and changes nothing for other consumers when `undefined`.
- ⚠️ The `<form>` is **`novalidate`** — load-bearing: `FormField` reflects `required` onto the DOM, and
  a constraint-invalid form without `novalidate` aborts submission **before** the `submit` event (the
  native bubble shows; the inline note never renders — browsers and jsdom alike).

### Line-status sheet (`line-status/line-status-sheet.component.ts`)

Local signals: `status` (`PassengerStatus | null`), `delayMinutes` (string, parsed on submit), `notes`,
`selectedStationIds`, `isSubmitting`, `submitError` (inline `line-status-submit-error`, `role="alert"`;
set on `ok: false`, a `GraphQLRequestError` (server message mirrored), a transport failure or a
submit-time guard; only a truthy `ok` closes and emits). `cancel-line-status-report` closes without
submitting. `lineId` is computed from the input or the service. `stationsResource` is a lazy
`graphqlResource`, inert until the sheet is open on a known line (`STATION_LINES_QUERY`, reused from
spotting).

- 🔴 **Draft-first.** The form and footer render signed in or not; logged out only ADDS a banner ("You'll
  need to log in before submitting, but feel free to fill in the details first." + `login-button`;
  wording identical to the spotting form's). The account is asked for at exactly ONE place — `submit()`
  — which writes the same message inline (`role="alert"`, above the footer, so a missed toast is
  survivable), toasts, and returns. The draft is discarded on exactly ONE edge (open→closed, `clear()`),
  so the login popup cannot cost the reader their typing; `login-button` opens the popup without
  touching a draft signal.
- ONE `effect` handles both edges: **open** consumes `presetStatus` (one-shot), **close** clears — same
  effect so the seed and the reset cannot race against the same `_wasOpen` latch.
- On success the sheet records `PreferencesService.setLastReportedLine(lineId)` +
  `pushRecentLine(lineId)` (the chooser orders pinned → recent → severity, so "the line I just reported"
  is at hand next time).

### Hero (`hero/home-hero.component.ts`)

The full-width headline strip above `home-panels`.

- 🔴 **Its headline is the page's only `h1`**, inside an `app-info-popover` whose `content` is
  `metricTooltip("network.lines-normal")` (the tooltip carries the short in-service summary; the
  green/orange/red rule stays in the full definition on /methodology). Below it: the disruption callout
  naming the worst line, four stat tiles (lines normal · needs attention · reports now · links today)
  and the CTA row.
- **Tiles.** Each FIGURE is an `hlmTickUp` host (a changed number replays a one-shot reveal; first paint
  never animates). Two LABELS are `app-info-popover` triggers — `network.needs-attention` and
  `network.reports-now`, the two RULES rather than counts (`hero-needs-attention-popover`,
  `hero-reports-now-popover`). "Lines normal" is the headline's own sentence; "links today" is the
  feed's row count.
- **CTA row — one primary action.** "Report a delay" is the filled default `hlmBtn` (`h-11`); "Spot a
  train" and "Share a link" are `variant="outline"` (`h-11`); "Live map" is `variant="link"` (`h-11`,
  `routerLink="/tracker"`). All default theme — page identity is type and layout, not a coloured button.
  Wiring: Spot → `ReportSheetService.open()`, Share → `LinkSheetService.open()`, **Report a delay →
  `ReportChooserService.open()`**. The hero is a pure trigger and never decides which line (a rider on a
  platform does not know a line id). At `sm`+, **"Report on {line}"** (`hero-report-last`, inside the
  `hero-report-last-wrap` that carries `hidden sm:inline-flex` — `hlmBtn`'s own `inline-flex` would win a
  tie against `hidden`) opens the line-status sheet for `PreferencesService.lastReportedLineId`; below `sm`
  the chooser carries the same shortcut (`chooser-report-last`).
- **Refresh indicator:** the hero hosts `app-home-refresh-control` in `hero-refresh-slot` (the
  `shrink-0` rightmost slot of the headline row) at every width.
- **Network tone.** `networkTone(normalCount + needsAttentionCount, needsAttentionCount)` over
  **IN-SERVICE** lines (`isInService` excludes `TESTING` and `DEFUNCT`) colours the `h1` text and
  `hero-status-line`: `unknown` (no lines) neutral · `normal` (0 needing attention) green · `degraded`
  (needs attention ≤ HALF the in-service lines) orange · `critical` (> half) red — so words and colour
  never describe different arithmetic. Half is the CEILING of `degraded`: at exactly half most riders
  are still on working trains, and the same red as a broadly-down network trains readers to ignore red.
  Out-of-service lines live in the `Others` group, so a trial or closed line never drags the words,
  colour, tile or callout down. Only class maps live in the component; the rule is unit-tested in
  `data/network-summary.util.ts`.
- 🔴 **The top edge is the STATUS LINE, not decoration.** `hero-status-line` is a full-width STATIC
  hairline wearing the network tone and nothing else: no countdown, no width binding, no inline `style`,
  no `HomeStore` read. `_lineClass` (tone pair, plus the glow class while `_toneGlow`) is the whole
  binding, so a beat tick, reset or pause never writes to it (the spec pins `style.width === ""` and
  `style.transitionDuration === ""` across beat changes; the fade is a class, so the latter holds). The
  beat's indicator is the refresh control's donut. Fade + glow rules: Motion.
- **Colour ribbon** (`hero-ribbon`): one flex segment per line's `displayColor` along the bottom edge,
  `aria-hidden`, hidden with no lines — a fingerprint of the read, not information. A blank colour is
  DROPPED so a line without one leaves no hole.
- **Official-update callout** (`hero-official-callout` / `-badge` / `-link`), **above** the disruption
  callout, appears only when the SAME worst line `summarizeNetwork` names has an `isAutomated` pulse
  link. Shows that post's title and links the ORIGINAL (`target="_blank" rel="noopener noreferrer"`,
  "Open original") — a community page quoting an operator must never look like the operator said it
  here. Scoping to the worst line keeps it from contradicting the sentence underneath.
- 🔴 **The hero card does NOT clip** (no `overflow-hidden`): the headline popover, tile popovers and menu
  panel live inside and must escape. The two decorative edges are cut by ONE card-shaped overlay — the
  card's first child, `pointer-events-none absolute inset-0 overflow-hidden rounded-2xl`, `aria-hidden`,
  holding `hero-status-line` and `hero-ribbon` (no testid; asserted structurally as `home-hero`'s first
  child). Each line is 4px tall and CSS clamps a radius to its own box, so their own `rounded-*`
  collapsed to ~4px and square ends poked outside the card's 18px corners; a card-sized overlay is not
  clamped. The lines carry no rounding; `pointer-events-none` keeps the overlay from swallowing clicks.

### Network sparkline (`hero/network-sparkline.component.ts`)

24 bars, one per service-day hour, tall by how many rider reports the WHOLE network received that hour,
coloured by the dominating status (`network-sparkline` / `-bars` / `-popover` / `sparkline-bar`; ONE
`role="img"` sentence, not 24 announced bars). Opts in via `afterNextRender`. The caption says "across
every line on the network": `networkStatusHistory` is a NETWORK aggregate, and drawing it under one
line's name would attribute other lines' reports to it.

- 🔴 **It always holds its height.** The `<figure>` is unconditional; the ONE branch is `_plotted()` =
  `!networkHistoryFailed() && _bars().length > 0`, with the dashed `h-10` `network-sparkline-empty`
  placeholder as the else-branch (bars and placeholder never both present or absent). The hero costs the
  page no height in any state — a hero growing a hole when the slowest read lands is worse than one
  saying nothing was reported.
  1. A **failed** read must not draw the last good answer, so the predicate excludes it even though the
     store holds a stale array (yesterday's picture as today's is worse than an honest empty box).
  2. The two quiet states **read differently** — "Activity data unavailable" vs "No activity reported
     yet" (only one is a failure the reader may hit again). Both are literal DOM text (not
     `aria-hidden`).
  3. The hour-axis row is unconditional too (empty strings and all), so height is identical in all three
     states.

### Refresh control (`refresh-control/home-refresh-control.component.ts`)

The single source of the refresh affordance. No inputs; injects `HomeStore`. Rendered **ONCE**, in the
hero's headline row (`hero-refresh-slot`) at every width — one component, one beat, one DOM instance
(`line-refresh-countdown` is a unique testid). Placement is **CSS only**, never a `matchMedia` signal,
so SSR and hydration emit identical markup. A second copy of the state machine would double
confirmations and desync from the one beat. A host wanting a REFRESH BUTTON (the mobile bar) calls
`HomeStore.polling.refreshNow()` and must not re-implement the states. It is the reference for "react to
a RELOAD completing": `graphqlResource.isLoading` is pristine-only, so the control latches on
`HomeStore.isRefreshing()` going true and CONFIRMS on it settling false with `!hasError()`.

- **Cadence.** Fixed 30s, deliberately no interval picker (unlike situasi). The beat and a click both
  call `HomeStore.reloadFirstPages()` (lines, Today first page, Last Week first page); loaded Load More
  pages are never dropped (a 30s reset would wipe the reader's place) — hence `reloadFirstPages()`, not
  `reloadAll()`.
- **Markup.** `<button data-testid="line-refresh-countdown">`, shrink-wrapped
  (`:host { display: inline-block }`, no `w-full`) so the tap target is the visible ring + label, not an
  invisible full-width strip; the headline row (`flex items-start justify-between gap-3`) parks it right
  via the `shrink-0` slot. Do not add `w-full` or a block host.
- **Three states, in this order.** Updating is the **first** template branch on purpose (`refreshNow()`
  resets the beat, so if the countdown branch won, a click would flash a fresh "Refreshing in 30s").
  1. **Updating** (`line-refresh-updating`, `role="status"`) tracks `HomeStore.isRefreshing`, NOT the
     click: up during ANY non-initial refresh (click, beat, any reload). Sole exclusion: the pristine
     initial load (`isLoading() || isLoadingLastWeek()`) — a first paint is not a refresh.
  2. **Updated** (`line-refresh-confirmation`, `role="status"`, `text-green-600 dark:text-green-400` on
     tick and label) after ANY refresh observed in flight settles without error — the beat's included (a
     reader who watched the row change is owed what a clicker gets) — kept **500ms**
     (`REFRESHED_VISIBLE_MS`; a 2s flash on a 30s beat showed one time in fifteen, reading as a
     lingering status). The pristine first load confirms nothing: data never on screen cannot be stale.
  3. **Countdown:** "Refreshing in {n}s" + the draining donut.
- **State machine.** One `_sawRefresh` latch (set when a NON-pristine refresh is seen in flight,
  consumed on the settle edge; keeps the conservative page-wide `hasError` suppression). A click still
  owns the label it raises **synchronously** (`refreshNow()` flips `isRefreshing` only once the request
  is on the wire) and its own **expiry**: `ARM_EXPIRY_MS` (5000) is the only exit for a click whose
  request never appears, and returns early when `_sawRefresh` is true so a slow request is not mistaken
  for a dropped click. Clearing one edge only is how a no-op click says "Updating" for the session. A
  refresh going in flight CLEARS a visible "Updated" and its timer (`_hideRefreshed`); effect re-runs
  may not touch a click whose expiry timer is live.
- **Glyphs.** Ring, spinner and check sit in ONE always-rendered fixed slot
  (`inline-flex size-7 shrink-0 items-center justify-center`, glyph only — the tracker rows' pattern),
  all **22×22**; a constant slot stops state changes re-flowing the shrink-wrapped row. The slot comes
  **AFTER** the label chain (label, slot, tooltip), pinning the circle to the right edge — a leading
  glyph travelled sideways when "30s" → "9s". The "Refreshing in Ns" text stays, LEFT of the ring (the
  tracker shows seconds on hover only; this control states the countdown at a glance).
  - Ring: explicit `width`/`height="22"`, `viewBox="0 0 22 22"`, cx/cy 11, r 9, `stroke-width="2.5"`,
    track `text-muted-foreground/20` (the tracker `CountdownRingComponent` geometry). 🔴 An svg with only
    a `viewBox` renders at CSS initial size (a 112×112px blob in the hero row).
  - Spinner: same 22-unit geometry, arc `M20 11a9 9 0 0 0-9-9`. Check: its 24-unit viewBox scaled into a
    22×22 box. 🔴 **No `size-*` class on any glyph** — a CSS size outranks the `width`/`height`
    attributes and silently re-shrinks them.
  - `_ringOffset` is a `computed` over `secondsRemaining()` / `intervalMs()` — the pair the text names,
    so ring, text and beat cannot drift — deliberately NOT `PollingSource.percentRemaining` (lags a
    refresh by a tick, so the arc would describe the beat that just ended). The arc DRAINS (full at
    reset, empty at zero), clamped both ends (a null/paused interval renders no ring; an overshoot
    cannot invert it — a negative offset draws MORE than a full turn); circumference 56.55; arc
    `text-primary`; 1s linear `transition-[stroke-dashoffset]` (the offset rebinds once a second; the
    tracker ticks every 100ms), dropped by `motion-reduce:transition-none` (the arc steps per tick).
  - Spinner motion and draw-in: Motion.
- **Tooltip** (`line-refresh-tooltip`) is part of the contract: "Click to Refresh Now" +
  `Last updated {age}` (how stale the numbers are RIGHT NOW; the countdown says when the NEXT refresh
  is). Hover when `(hover: hover) and (pointer: fine)` (the `StatusInfoChipComponent` pattern), tap
  otherwise; `z-50` (the app overlay layer, above the nav's `z-[45]`); closes **300ms** after the
  pointer leaves (`TOOLTIP_CLOSE_DELAY_MS`, the window `InfoPopover` and the nav use), cancelled on
  re-entry and destroy — do not simplify to an instant close.
  - Age is `_lastUpdatedAt` (epoch ms, stamped on every clean settle): `—` before any fetch, `just now`
    (<5s), `{n}s ago` (<60s), `{n}m ago` (<60m), `{n}h ago`; a backwards clock clamps to "just now". A
    plain **method**, not a `computed`, so the age keeps counting while the tooltip is open; known
    limit: a tooltip left open across a whole beat does not re-render on its own.
  - The stamp is also set at **mount** when the store is already idle — the pristine fetch often settles
    BEFORE the control's effect first runs (warm cache, local API, late hydration), leaving `—` until
    the first beat. Guarded on `!isRefreshing && !pristineInitialLoad && !hasError()` (a failed first
    paint is not an update); a loading-at-mount page stamps through the pristine settle.

### Network board (`line-pulse/network-board.component.ts`)

Four groups over ONE partition. Order: `line-skeleton` rows while the first read is in flight AND
nothing shows (a later reload never blanks the board), the dashed `line-board-empty` ("No lines yet."),
the `board-controls` row, the groups. Every row wrapper keeps `line-board-row` (stable order/partition
hook). Group `h2`s carry the breathing dot (Motion).

- `Needs attention · N` (`line-board-attention` / `-heading`) — full `app-line-pulse-card`s, in-service
  only, **hidden entirely when empty** (nobody should scroll past a "· 0" heading).
- `My lines` (`line-board-mine` / `-heading`) — compact rows, **only when pinned lines exist** (an empty
  pin list is a gap, not an invitation; no empty state). Pinned out-of-service lines stay ("pin wins").
- `All lines` (`line-board-all` / `-heading`) — compact rows; hidden when empty. 🔴 **Quiet lines fold**
  when `foldQuiet` (default `true`): a line that is in service, has no attention state,
  `statusReportCount` 0 and is not pinned (`isQuietLine` / `splitQuietLines` in
  `data/board-lines.util.ts`) is not drawn as a row. They sit behind one toggle
  (`line-board-quiet-toggle`, `aria-controls="line-board-quiet-panel"`, "N lines running normally",
  state `HomeStore.quietLinesExpanded`); the panel renders rows only when expanded. A pinned quiet line
  stays a row under `My lines`. The one piece of onboarding sits in the collapsed summary only: "Pin your
  lines to see them first" (`line-board-pin-hint` + `line-board-pin-hint-dismiss`), shown while nothing is
  pinned and `PreferencesService.pinHintDismissed` is false; gone for good on dismiss or the first pin.
- `Others` (`line-board-others` / `-heading`) — compact rows, LAST, hidden when empty: unpinned
  out-of-service lines (TESTING pre-opening / DEFUNCT closed). Inventory no longer masquerades as
  service.
- 🔴 **Dividers are per-section and CONDITIONAL.** A lower group carries `border-t pt-4` only when a
  section actually precedes it; `_attentionRendered()` / `_mineRendered()` / `_allRendered()` are the
  SAME length predicates the groups' `@if`s use, exposed as signals. The **first visible group** draws
  no divider (the controls row's `border-b` is the only line there); with `My lines` hidden, `All lines`
  keeps its divider when it follows attention. The attention group never carries the pair (always
  first).
- 🔴 **The Pro heat grid mounts only when the effective view is `pro`** (`@if (_view() === "pro")`, the
  same `_view()` the controls row writes) and `embedHeatStrip` is on — it compares lines against each
  other, costs a screen of width, and a Rider view must not pay for it.
- **Controls row** (`board-controls`): operator-family chips (`board-family-<code>`; only with more than
  one family; derived from EVERY line so a chip survives a Pro filter hiding its lines; popover
  `line-status.operator-family`) and two labelled `role="group"` segmented controls of `aria-pressed`
  buttons — `board-sort-severity|name`, `board-view-rider|pro`. No density control exists.
- **Operator family** (`data/line-family.util.ts`, `lineFamily()`): the leading letters of the line
  code, upper-cased (`KTM1` → `KTM`; no letters → `OTHER`) — a heuristic, because the schema has no
  operator field and nothing maps a prefix to a company. `?op=` must be 1–16 letters AND a family the
  data has; the chip writes the URL only and the store follows via an effect.
- 🔴 **URL state** (`?sort=` / `?view=` / `?op=`) through `core/url-state/query-param.util`:
  - READ: `toSignal(route.queryParamMap, { initialValue: route.snapshot.queryParamMap })` — seeded from
    the SNAPSHOT so the server render reads the server's URL (a deep link cannot render the default on
    the server and the linked value on the client). `readTextQueryParam` distinguishes "absent" from
    "present but unrecognised"; `readEnumQueryParam` narrows, so `?view=wizard` degrades to the shared
    DEFAULT, not the stored preference (a URL is user input).
  - Effective value: **URL when present, else stored state** (`view` → `PreferencesService.viewMode()`,
    `sort` → `HomeStore.boardSort()`), so `?view=pro` is shareable while a returning Pro reader gets Pro
    without one.
  - WRITE: one browser-gated `effect` (a reactive `router.navigate()` during SSR hangs the render)
    mirrors the effective sort/view through `writeQueryParams`, guarded on the URL already saying the
    same thing (else back/forward would re-navigate onto what it just left). Defaults write `null`. A
    **stored** Pro view IS mirrored into the URL on load (the shareable part).
  - Two effects push a deep link DOWN into durable state (`store.setBoardSort` /
    `preferences.setViewMode`), or the board would revert once the reader edited the URL away;
    `signal.set` with an equal value does not notify, so this never fights a toggle that already wrote
    both halves.
- **`#line-<id>` anchors + highlight ring.** Every row wrapper in **all four groups** carries the stable
  `id="line-<id>"` (an anchor only on compact rows would fail for exactly the lines needing attention)
  and `scroll-mt-24` so the sticky nav cannot cover it. The ring
  (`ring-2 ring-brand ring-offset-2 ring-offset-background` + a `data-highlighted` marker on the same
  element, so a spec can assert through the DOM) follows `HomeStore.highlightedLineId`, not per-row
  state, so card and row groups cannot disagree. A browser-gated `effect` scrolls the anchor into view
  (`block: "center"`, `behavior: "smooth"`, `"auto"` under `prefers-reduced-motion`; never on the
  server). 🔴 **Reduced motion drops the transition, never the ring** (`motion-reduce:transition-none`
  leaves `duration-1000` inert): the reader must still be told WHICH line they reported about. A
  highlighted line folded into the quiet summary opens the summary.
- 🔴 **Containers hosting a popover must not clip.** Card and compact row have no `overflow-hidden`
  (their popovers and disclosure panels live inside); their colour rails carry `rounded-l-xl` /
  `rounded-l-lg` so the accent meets the corner. Before re-adding `overflow-hidden`, check for a nested
  popover. `InfoPopover`'s panel is `z-50` (nav `z-[45]`, mobile bar `z-30`) — a popover must never
  paint under chrome (`MISTAKES.md`).
- **Popover icon placement:** the home page's trailing-glyph popovers use
  `InfoPopover.iconPosition="end"` — hero headline, sparkline caption, row report tally, board family
  chips (`board-family-popover`), Pro heat strip, Pro lines filter, Pro lines table last-report header
  (`pro-lines-last-report-popover`), Pro report ranking — because a leading glyph reads as a list
  bullet. The component default stays `"start"` (`/methodology` and the ad slot are untouched); do not
  tidy it.

### Line pulse card (`line-pulse/line-pulse-card.component.ts`)

- `_links` caps related `pulseLinks` at 5 (`MAX_PULSE_LINKS`); passenger badge/label via pure
  `passengerLabel` / `passengerVariant`. There is no standalone status-count badge: the passenger chip's
  severity legend carries per-status counts via
  `passengerScale(line().passengerStatus, line().passengerStatusCounts)`; a row shows
  `status-scale-count` (`(n)`) only for a non-zero backend count.
- 🔴 `line-card-confidence` and the `passenger-status` badge render **ONLY for an ACTIVE line**: a
  non-Active line draws its `line-status-badge` + the vehicle badge, because the operational badge
  already carries the story and "Unconfirmed (0 reports)" / "No data" beside it is noise.
  `line-status-badge` itself renders only when `status !== "ACTIVE"` and passes
  `[showMethodologyLink]="false"` (line status has no method section; its popover is a plain tooltip,
  while the passenger and vehicle chips keep "How this is counted"). The card passes no `message` to its
  chips.
- The status row ends with `line-vehicle-count` (`{{inService}}/{{total}} in service`,
  `aria-label="N of M vehicles in service"`) whose popover lists the per-status fleet breakdown + a
  derived `Total`. The title row toggles the lazy expanded panel (`line-status-chart` +
  `line-status-reports`, both gated on `expanded`).
- **Action set** (identical on the row, same order): **pin** (`line-card-pin`, icon-only
  `hlmBtn size="icon-sm" variant="ghost"`, `aria-pressed`, glyph FILLS when pinned, via
  `PreferencesService`; wrapped in `app-info-popover` `line-card-pin-popover` with `showIcon=false` /
  `showMethodologyLink=false`, title `Click to unpin` / `Click to pin` + a body on effect and undo),
  **Details** (`line-card-details`, `hlmBtn size="sm" variant="outline"`, `a[routerLink]` to
  `/spotting/<lineId>/details`), **Report** (`submit-line-status`, default variant, opens the
  line-status sheet). The row carries `line-row-pin` / `line-row-details` / `line-row-report` (Report
  outline; no width classes; pin in `line-row-pin-popover`), so whichever group a line lands in the
  reader sees ONE control set.
  - 🔴 The pin button is passed to the popover as a `triggerTpl` (sibling `<ng-template #cardPinTpl>` /
    `#rowPinTpl`): it IS the trigger and the popover renders no button of its own, so no control nests
    in a button. Its `parentElement` is therefore the popover's `inline-flex` span: specs asserting
    cluster order or sibling spacing must `closest("app-info-popover")` first (`MISTAKES.md`).
  - `hlmBtn`'s selector is `button[hlmBtn], a[hlmBtn]` (the Details anchor needs no wiring); `hlm()`
    merges the `class=` input, so the card's `w-full sm:w-auto` mobile stacking survives. Icons
    (`lucidePin`) via `@ng-icons/lucide` (`NgIcon` + `provideIcons`).
- Leading accent rail in `displayColor` (a backend hex: no dark-mode twin).
  `PreferencesService.pushRecentLine()` fires on the expansion's **open** edge only (like the row).
  There is no kebab menu or "Log spotting" button — spotting has its own surfaces.

### Line pulse row (`line-pulse/line-pulse-row.component.ts`)

- Backend-hex rail, `code · name`, `line-row-status` (operational `LineStatusBadge`, non-ACTIVE only),
  and on `line-row-chips` the `line-row-confidence` chip + `line-row-passenger` badge — 🔴 **both ONLY
  for an ACTIVE line** (a non-Active badge already tells the story; confidence is asked where status is
  the unremarkable default).
- `line-row-pin` (`aria-pressed`, action-naming `aria-label`; 🔴 the glyph FILLS when pinned —
  `[&>svg]:fill-current` on the `ng-icon` while `_isPinned()` — because `aria-pressed` alone leaves a
  16px outline pin saying "pin available" about a pin already on), `line-row-details`, `line-row-report`
  → `LineStatusSheetService.openFor(line.id)`. 🔴 The row's report button reports on **the line the
  reader is looking at** and is deliberately NOT routed through the chooser (a rider on a row knows the
  line; the chooser serves hero/mobile-bar readers with no line in mind).
- Expand toggle `line-row-toggle` (`aria-expanded`) → `line-row-expanded` holding the SAME lazy
  `app-line-status-chart` + `app-line-status-reports` as the card, gated on the same `expanded` input.
  Opening calls `pushRecentLine()` on the OPEN edge only.
- **Pro view** adds `line-row-pro` with `line-row-report-window` ("N reports · 15 min window" — a bare
  count is what a pro reader is likeliest to over-read; the window makes it interpretable). Details is
  not Pro-only.
- 🔴 **`line-row-meta` is its own strip** — `line-row-vehicles` ("12/16 in service") and
  `line-row-reports`. On one badge row a 390px phone could not fit them beside the status pill,
  confidence chip and passenger badge, so the report count alone wrapped onto its own line on EVERY row
  and read as a layout fault. Grouped, they wrap as one fragment. The report count is hidden below `sm`
  (nothing lost: on an ACTIVE line the confidence chip already reads "Unconfirmed (2 reports)" / "No
  recent reports", and Pro view has its own block).
  - `line-row-vehicles` is wrapped in the SAME `app-status-info-chip` as the card's
    `line-vehicle-count`: one `vehicleCountInfo()` definition from the methodology registry (via
    `renderMethodologyCopy`) + `vehicleBreakdownRows()` closed by a derived `Total`, `aria-label` "N of
    M vehicles in service". That second popover in the strip is why the report popover's specs scope to
    the reports element, not `line-row-meta`.
  - `line-row-reports` reads **`N reports (X this hour)`**: N = the line's service-day total from
    `linesHistoryFor`, X = the current service-hour bucket (`currentServiceBucketIndex`) —
    `statusReportCount` alone is a 15-minute rolling window, and a number nobody can scale is a number
    nobody can read. Same ONE store read as the heat grid, so sixteen rows cost one request. The
    enriched label is a METRIC and carries the `line-row-reports-popover` info trigger
    (`network.line-reports-summary`). With no service-day history (no buckets, failed read, or no
    browser clock yet) the plain rolling `statusReportCount reports` is drawn and that popover is
    **not** rendered — a service-day definition on a fifteen-minute number would claim something false.
    (The row keeps its row instead of hiding: a missing number reads as a layout fault, and a row is not
    a widget that hides.)
  - 🔴 **The row's clock is seeded browser-only**: `afterNextRender`, refreshed by an effect over the
    forwarded `refreshTick` behind a `_clockSeeded` gate, so a row open across an hour boundary stops
    naming the passed hour while the server render never depends on the server clock. The gate is
    load-bearing: an `effect` runs during change detection, BEFORE `afterNextRender`, so an ungated
    `set(new Date())` would put a client-clock string in the first paint (`NG0500`) — same reasoning as
    `PreferencesService`'s storage read.
  - 🔴 Responsive hiding sits on a plain `line-row-reports-wrap` `<span class="hidden sm:inline">`, never
    on the projected span or the `app-info-popover` host: the host's own binding is
    `relative inline-flex` and `.inline-flex` is emitted after `.hidden`, so a same-specificity
    `display` tie leaves it visible (`MISTAKES.md`); hiding only the projected span leaves a lone "i"
    beside no number.

### Expanded panel: chart and reports

- **`LineStatusChartComponent`** — hourly strip: `bars` / `hasData` / `maxCount` computed over the lazy
  `LINE_STATUS_HISTORY_QUERY` (inert until `expanded`; a parent `refreshTick` input reloads it while
  open, via the same applied-tick guard as the reports list). One bar per service-day hour, scaled to
  the busiest hour, **stacked by report type**: `toSegments()` splits each hour's `statusCounts` in
  `PASSENGER_SCALE` order (bottom-up NORMAL → DISRUPTED; each segment `count / total * barHeightPct`
  with `total` the summed `statusCounts`, so they sum to exactly the bar's height even if tallies drift
  from `count`; a bucket with no tallies falls back to one dominant-coloured segment, an empty hour to
  none). `flex-col-reverse`; only the topmost segment rounds its top. Hover readout and each bar's
  `title`/`aria-label` carry the hour range, total and per-status breakdown. All 24 hours labelled on a
  `min-w-[24rem]` strip in an `overflow-x-auto` lane; the skeleton, empty and loaded states share the
  exported `CHART_STATE_MIN_HEIGHT_CLASS` (`min-h-40`) so the card never jumps.
- **`LineStatusReportsComponent`** — keyset-paginated list (`LINE_STATUS_REPORTS_QUERY`), gated on
  `expanded`, re-read on `refreshTick` via the same guard. Row: passenger badge, optional delay, the
  report's `stations` (joined `displayName`s, `report-station`), relative time pinned right
  (`report-time`, `humanizeSince`, exact timestamp on `title`). Loaded rows sit in
  `line-status-reports-scroll` (`max-h-56 overflow-y-auto`, ~five one-line rows; notes make rows taller,
  so the cap is approximate); only the loaded branch is capped.
  - **Per-station strip** (`station-strip`, counts in `station-strip-count`) tallies the reports ALREADY
    loaded by `station.displayName` above the list — no request, no new fields — and answers WHERE (nine
    stations is a line problem; nine reports on two is a platform problem). Busiest first, name as
    tiebreak; hidden when no loaded report names a station. 🔴 It covers ONLY the loaded pages (first
    page of ten): "where, among the reports you can see", never a total. A complete figure needs an
    additive backend aggregate — a client total over a truncated page would be a lie the reader cannot
    detect.

### Service-day widgets (sparkline · row tally · heat grid)

Shared rules: all read `HomeStore` (the store owns the reads), share `status-history-display.util.ts`,
**never reach for `HomeStore.hasError()`** (use `networkHistoryFailed` / `linesHistoryFailed` — a
supporting widget must not put the retry banner over a working page), and **opt in** via
`store.requestHistoryReads()`. They deliberately differ on a failed/empty read: the heat grid hides
itself (own Pro cell), the sparkline holds its height, the row drops only its `N reports (X this hour)`
label and falls back to the rolling count. `networkStatusHistory` is a NETWORK aggregate,
`linesStatusHistory` per line. Each widget hands its chart a single `role="img"` sentence
(`historySummaryLabel`); the grid does so **per row** (comparing lines is its point). Definitions come
from the methodology registry through `InfoPopover`, never a literal.

**`NetworkHeatStripComponent`** (`pro/network-heat-strip.component.ts`, `app-network-heat-strip`) — the
**Pro** heat grid: one row per line, one column per service-day hour; colour = the status that dominated
the line-hour, opacity = report count. Hand-rolled `<div>`s (no charting dependency; colour vocabulary
is the same `PASSENGER_BAR_CLASS` as the expanded chart). Testids `network-heat-strip` / `-popover` /
`heat-grid` / `heat-axis` / `heat-row` / `heat-row-code` / `heat-row-total` / `heat-cell` /
`heat-cell-glow` / `heat-popover` / `heat-legend` / `heat-scale` / `heat-empty`. Reads `visibleLines()`,
so it is always the same SET of lines the board draws; its shared intensity scale is computed over those
rows.

- 🔴 **Every row is the SAME 24 columns, whatever that line reported.** Columns come from one template —
  `_columns()`, the first visible line with any bucket — and each row looks its hour up in a per-row
  `Map<hourStart, bucket>`, so a line the backend returned `buckets: []` for draws 24 grey no-data cells
  (`data-empty`). A missing row read as a rendering fault and destroyed the column alignment the
  comparison rests on.
- Code gutter `w-20`, code shown WHOLE, `title` = full display name (a three-letter code identifies
  nothing to a rider who does not commute). The same `w-20`/`w-7` gutters repeat on the "Service day"
  line and on the `heat-axis` tick row, which labels every OTHER hour aligned to the 24 columns (all 24
  labels collide at this cell width).
- 🔴 **The reader's current hour GLOWS; it is not recoloured** — `data-current-hour` on the cell plus a
  `heat-cell-glow` overlay (Motion). The clock is seeded browser-only (`afterNextRender`) and refreshed
  on the poll `linesRefreshTick`, so SSR emits no marker.
- 🔴 **ONE JS-driven `heat-popover` replaces per-cell native `title`s**: measured against the cell,
  clamped inside the `relative` `heat-grid` wrapper, `pointer-events-none` + `aria-hidden` (a panel
  taking the pointer would steal the hover from the cell under it); shows line name + code, hour range,
  report count and per-status breakdown — or "No reports". A native title cannot carry a breakdown, and
  24 browser tooltips per row each block on hover. (`heatCellTitle` no longer exists.)
- 🔴 **Empty is NOT hidden — a failed read is.** The grid renders only when at least one line has at
  least one bucket. A read that SUCCEEDED and found nothing renders one labelled line, `heat-empty` —
  _"No rider reports in this service day yet."_ A FAILED read (`store.linesHistoryFailed()`) renders
  nothing. "We could not load it" is a widget problem to stay quiet about; "nobody reported" is the
  answer this cell exists to give (the whole correct answer on a quiet morning); an empty bordered card
  read as a rendering fault. The sparkline uses the same split but keeps its space (it sits in the hero,
  where a hole would scroll the page).

### Status vocabulary and pure rules

- **`status-history-display.util.ts`** is the one place the history widgets describe an hour:
  `serviceHourLabel` / `serviceHourRangeLabel` (MYT, so any-timezone readers line bars up with the
  backend's hours), `reportsPhrase`, `historyBarHeightPct` (scaled to the busiest hour **in the same
  series**, with a visible floor), `historyBreakdownPhrase` / `historyBarTitle`, `historySummaryLabel`,
  `currentServiceBucketIndex` (which bucket an instant is in — half-open `[start, end)`, so a seam
  instant belongs to the LATER hour; `-1` for an empty or out-of-series answer; the row's "this hour"
  figure and the grid's current-hour marker both read it — a client clock is the one thing neither may
  guess), and the heat grid's `heatIntensityStep` / `heatIntensityClass` / `heatCellClass` /
  `heatLegendEntries`.
  - 🔴 `HEAT_INTENSITY_CLASSES` (`opacity-10|25|45|70|100`) is a list of LITERAL Tailwind utilities: v4
    compiles only literal text found in source, so `opacity-${n}` emits nothing and every cell renders
    at the browser default.
  - The scale is per WIDGET on purpose: `historyBarHeightPct` scales to the busiest hour in its own
    series (a quiet network must look quiet), while the grid scales to the busiest cell on screen
    (comparing lines is its job).
- **`network-summary.util.ts`** (`summarizeNetwork`) is the one place the board's rule lives — **pure**,
  no Angular, no requests.
  - `LINE_STATUS_SEVERITY_RANK` is a **total order**, deliberately NOT the backend enum's:
    `TOTAL_DISRUPTION` 6 > `PARTIAL_DISRUPTION` 5 > `PARTIAL_ACTIVE` 4 > `DEFUNCT` 3 > `TESTING` 2 >
    `ACTIVE` 0 (DEFUNCT/TESTING are settled, un-actionable facts and must not outrank a partly running
    line). `NEEDS_ATTENTION_PASSENGER_RANK` = `PASSENGER_SEVERITY_RANK.DELAYED` (5).
    `lineNeedsAttention` =
    `isInService(line) && (status !== "ACTIVE" || passengerSeverity >= that rank)`. The threshold is
    `DELAYED`, not `CROWDED`, on purpose: crowding reports describe one carriage, not the service, and
    would leave the headline at "0 of 14 lines running normally" on any busy evening.
  - 🔴 Out-of-service lines never need attention (a Defunct/Testing line is a settled administrative
    fact, not a live failure); they live in `Others` rather than being painted as a problem forever.
  - `compareLineSeverity` compares the operational axis **first**, the passenger axis second (never
    summed — a line that will not run outranks one that merely runs badly), with `code` as final
    tiebreak so equal data renders identically.
  - `summarizeNetwork` returns
    `{ total, normalCount, needsAttentionLines, needsAttentionCount, worstLine, headline, callout, reportsNow }`.
    🔴 **Every SERVICE field is in-service only** (`isInService` excludes exactly `TESTING` and
    `DEFUNCT`): `normalCount`, `needsAttentionLines`, `needsAttentionCount`, `worstLine` (which the
    callout names); `normalCount + needsAttentionCount` IS the in-service total the headline and tone
    use. So sentence, colour, tile and callout can never disagree (e.g. "All 14 lines running normally"
    in green beside "0 Needs attention", with out-of-service lines only in `Others`). Only `total` and
    `reportsNow` count every line. `reportsNow` sums each line's `statusReportCount` (over its OWN
    `statusWindowMinutes`): "reports now", not a distinct count (one rider on two lines counts twice).
  - Empty read → `headline: "No live line data yet"` (not "0 of 0 lines running normally"); lines but
    none in service → `"No lines in service"` — a different fact.
  - 🔴 **`PASSENGER_SEVERITY_RANK` mirrors the backend `PassengerStatus` enum order** (NORMAL 0 …
    DISRUPTED 6; the schema exposes declaration order, so higher IS more severe). Do not "tidy" it
    (DELAYED before CROWDED, say) — a backend reorder would make every consumer wrong at once.
  - 🔴 **`networkTone(total, needsAttentionCount)`** is the second pure rule: four `NetworkTone`s from
    the SAME two in-service counts the headline uses, so the hero's line and `h1` cannot disagree.
    `unknown` (no lines, or nothing in service) is neutral, not green — "nothing is wrong" is not
    "everything is fine". Class maps stay in the component (`_tone` / `_headlineClass` / `_lineClass`):
    shade is a visual choice and Tailwind needs literal class strings.
- **`status-confidence.util.ts`** (`statusConfidence`, `hasOfficialPulseLink`, `lineHasData`) is the
  pure rule behind the confidence chip (both row elements render it only for an ACTIVE line) — "what
  does the page know, and how do we know it?" was being answered three ways on one screen (a backend
  state, a derived crowd, a raw count). Four levels, **first match wins; the order IS the design**:
  1. `official` — any pulse link with `isAutomated === true`. FIRST: a rider tally is not stronger
     evidence than the operator saying so.
  2. `none` — no status evidence → "No recent reports". Its own label: claiming confirmation from zero
     reports is the failure the chip exists to prevent.
  3. `confirmed` — evidence and `statusReportCount >= CONFIRMED_MIN_REPORTS` (3; the frontend's own
     rule, published as `METHODOLOGY_CONSTANTS.CONFIRMED_MIN_REPORTS` with the
     `status-confidence.confirmed` metric doc — pinned together by `status-confidence.util.spec.ts`).
  4. `unconfirmed` — evidence, too few reports → "Unconfirmed (N reports)", count in the LABEL so the
     reader can weigh it without opening the popover.

  **Evidence** = a report in the line's own window, OR a rider status above `NORMAL`, OR a non-`ACTIVE`
  operational status. The last is evidence with a count of zero: the RULE resolves a
  `PARTIAL_DISRUPTION` line with no reports to `unconfirmed` "(0 reports)" even though the chip never
  renders there (rendering rule, not evidence rule). `passengerStatus: "NORMAL"` is NOT evidence — it is
  the derived "nothing notable" reading and would put a confident green chip on a line nobody reported.
  `hasOfficialPulseLink` tests `=== true`, never truthiness (an absent or stale field must not claim
  provenance). The popover uses the resolved level's OWN registry entry (`status-confidence.*`), so the
  panel explains the level on screen and `/methodology` cannot drift.

- `passenger-status.util.ts`: `PASSENGER_LABEL` / `PASSENGER_VARIANT` tables, `passengerLabel` (null →
  `"No data"`), `passengerVariant` (null → `"neutral"`), `PASSENGER_SEVERITY_RANK`,
  `PASSENGER_BAR_CLASS`; no components. `status-info.util.ts`: `passengerScale` / `vehicleStatusRows`
  and the info/legend/breakdown row builders. `line-status-metrics.util.ts`: `PASSENGER_METRIC` /
  `passengerMetric`. Per-status copy is read from the shared methodology registry (`core/methodology/`,
  `metricDoc(...)`), so popovers and `/methodology` cannot drift.
- `board-lines.util.ts`: Pro-filter predicate, four-group partition, name/sort comparator, `BoardSort` /
  `LINE_STATUSES` / `PASSENGER_STATUSES`. `home-feed.util.ts`: overlap de-dupe, page-info and
  total-count merges, the vote-overlay subtree walk, feed page sizes and request variables.
  `feed-filter.util.ts`: `filterFeedLinks`.

### Preferences and URL helpers

- **`PreferencesService`** (`core/preferences/preferences.service.ts`, root): reader-owned board display
  state — `pinnedLineIds`, `viewMode` (`"rider" | "pro"`), `lastReportedLineId`, `recentLineIds`,
  `pinHintDismissed` (one-time pin hint), `proLinesLayout` (`"board" | "table"`), `proLinesSort`.
  Persisted under the **versioned** key `rosak:preferences:v1` (`:v1` is the migration seam: a shape
  change bumps it, orphaning a stale payload instead of half-reading it). API: `isPinned(lineId)`,
  `togglePin`, `setViewMode`, `setLastReportedLine`, `pushRecentLine` (most-recent-first, de-duplicated,
  capped at `MAX_RECENT_LINES` = 5), `reset()`, `snapshot()`, `hydrated()`. No `density` field:
  `parseStoredPreferences` reads NAMED keys, so a stale `density` in a stored payload is never looked
  at.
  - 🔴 **Its constructor never reads storage.** It builds on defaults and hydrates in `afterNextRender`
    (which does not run on the server): a constructor read would make the client's first paint disagree
    with the server HTML (`NG0500`) for any rider with a pin. The persist `effect` is gated on
    `hydrated()` from the other direction — ungated, it fires BEFORE the read and overwrites real
    preferences with the defaults.
  - Every stored field is validated **independently** (corrupt JSON, non-object payload, unknown enum
    value and wrong-typed id each fall back alone): a half-recognisable payload is the common case.
- **`query-param.util.ts`** (`core/url-state/`): the shared read/write seam for URL-owned view state
  (`?view=`, `?sort=`, `?op=`, `?line=`, `?q=`). READ is pure over a `ParamMap`-shaped record
  (`parseEnumQueryParam`, `parseTextQueryParam`, `readEnumQueryParam`, `readTextQueryParam`); WRITE is
  one browser-gated `navigate()` (`writeQueryParams(router, route, patch, isBrowser)`). Rules both
  callers inherit: **a default never appears in the URL** (`queryParamForWrite(value, default)` →
  `null`) and **writes merge and replace, never push**. 🔴 `isBrowser` is a parameter because reading
  `PLATFORM_ID` needs an injection context a plain function should not have; a _reactive_
  `router.navigate()` during SSR hangs the render (as `line-overview.page.ts`'s sort write-back
  documents).
- **`core/export/csv.util.ts`**: `toCsv(columns, rows)` (pure, RFC-4180, header always) and
  `downloadCsv(filename, csv, isBrowser)`. Rows are keyed by COLUMN NAME, not position: a positional row
  silently shifts every value one column left when a builder forgets a field, and a CSV of hourly
  buckets read one hour off is a plausible-looking lie. `isBrowser` is a parameter for the
  `writeQueryParams` reason.

### Pro dashboard (`pro/`)

`app-pro-dashboard` is the second layout `HomePage` can render, chosen by **one** signal:
`HomeViewModeService.view()`.

```html
@if (viewMode.view() === "pro") {
<app-pro-dashboard />
} @else {
<div data-testid="home-panels">… the board + feed columns (board first) …</div>
}
```

The hero, retry banner, footer, **every sheet** and the mobile action bar sit outside that branch, so a
report, a link submission and a spotting entry run exactly the same code in both views — a "mode" that
grew its own submission path is what this design prevents; `home.page.spec.ts` pins the sheet order
across the branch.

**Six cells in three rows** (`pro-bento` is a flex column; the grids inside are anonymous, so specs
assert row structure through the widgets' parents). Rows are sized by the HEIGHT of their answer, not
importance:

- **Row A** — `xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start`: **Lines**
  (`app-pro-lines-widget`: three Pro-only filters, a Board/Table toggle — Table is the sortable
  `app-pro-lines-table`, persisted as `proLinesLayout` / `proLinesSort` — the reused `app-network-board`
  with `[foldQuiet]="false"`, and the CSV export) and **Community feed** (`app-pro-feed-widget`). The
  only two TALL cells, paired so both columns end at about the same height (stacking both tall cells in
  one column left the right rail ending halfway down beside dead space and stranded the feed). A stack
  below `xl` (at `lg` two dense lists in two narrow columns read worse).
- **Row B** — the heat grid (`app-network-heat-strip`, `pro-heat-widget`), **full width**: 24 one-pixel
  columns behind a fixed `w-20` gutter were illegible in a `2fr` rail, and it is the one inherently
  two-dimensional cell. Owns nothing — a projection of the shared per-line read.
- **Row C** — `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 items-start`: **Recent incidents**
  (`app-pro-incidents-widget`, own lazy read), **Worst lines by reports** (`app-pro-report-ranking`, the
  shared per-line read re-ranked) and **Official notices** (`app-pro-official-widget`, own lazy read).
  Reference panels a reader scrolls to; each owns its read and failure state, so incidents and the
  ranking routinely hide themselves. In a tile flow a hidden widget just closes its cell; `items-start`
  stops survivors stretching. Order is reading order, not priority.

**The board is REUSED, not reimplemented** — every row, group, sort, anchor and highlight rule under the
Lines widget is the Rider page's component. Its dashboard-specific input is `embedHeatStrip` (default
`true`, so the Rider board cannot change to suit a layout), which the dashboard turns **off**: the heat
grid has its own cell, and two copies would mean two `network-heat-strip` testids and the same
comparison drawn twice.

**Pro filters — default off, reset on leaving Pro.** Three board filters in `HomeStore`
(`pro-lines-filters`, `pro-filter-status`, `-passenger`, `-only-with-data` (+ `-popover`), `-clear`,
`pro-lines-export`):

- **Status** — `line.status === X` (exact).
- **Crowding at least** — `passengerSeverityRank(line.passengerStatus) >= rank(X)`, a **floor** (asking
  for `DELAYED` means "delayed or worse"); mirrors `PASSENGER_SEVERITY_RANK` (the backend enum order) so
  a backend reorder cannot make it quietly wrong.
- **Only lines with data** — 🔴 `statusConfidence(line).level !== "none"`: **exactly the evidence the
  confidence chip shows**. The obvious spelling
  (`statusReportCount > 0 || passengerStatus != null || status !== "ACTIVE"`) is wrong:
  `passengerStatus` is never null on a read line (the backend derives it; `NORMAL` is "nothing
  notable"), so the toggle would remove nothing while the chip beside it said "No recent reports".
  Published as the `network.has-data` metric doc.

🔴 **`ProDashboardComponent.ngOnDestroy` calls `HomeStore.resetProFilters()`**: clears the three board
filters, the feed's provenance axis, the feed search **and** `lineFilter`, then writes `?line=` and
`?q=` back to `null`. `HomeStore` outlives a visit, so anything left set is still set when the Rider
board mounts — a board quietly missing lines and a feed narrowed to one line, with no control to explain
either. The URL clear is the other half: otherwise the address bar keeps `?line=3` while the rider feed
shows the whole network, and re-entering Pro re-applies a filter the reader walked away from. One
method, so the list of things that MUST be undone is written once.

**Feed widget** (`pro-feed-widget`; `pro-feed-window`, `-filters`, `-search`, `-line`, `-status`,
`-skeleton`, `-empty`, `-list`, `-footer`, `-count`, `-load-more`) has three axes:

- **Line** — the **backend's**, via `HomeStore.setLineFilter()`: a keyset cursor means something only
  inside the query that minted it, so a client filter over an unfiltered page would splice unrelated
  links together on Load More.
- **Source (provenance)** and **Search** — **client-side**, over the resident roots (the connection has
  no argument for either), in the pure `filterFeedLinks`, which treats a conversation as ONE unit: a
  root is KEPT when a match is anywhere in its tree and a kept root keeps its **whole** subtree
  (dropping members would make the root's "N links" chip lie).
- The "status" axis is **provenance** (`official` / `community` / `all`), not approval: both feed
  resources request `status: "LIVE"`, so an approval control would provably never remove anything.
- 🔴 **Today only** — the widget says so on its surface (`pro-feed-window`); the Last Week panel is a
  Rider surface behind the rider tab set.

**Keyboard shortcuts** — a `@HostListener("document:keydown")` that exists only while the dashboard
does, so a Rider page has no listener. The `pro-shortcuts` hints row names all three and adds a real
**Back to rider view** button (`pro-back-to-rider`; `pro-shortcut-search|refresh|rider` are the hints,
and `pro-shortcut-rider` is the `<kbd>p</kbd>` _inside_ the button, so the words appear once — a touch
reader has no `p` key and the words are how the key is discovered).

| Key | Action                                                                                    |
| --- | ----------------------------------------------------------------------------------------- |
| `/` | focus the feed search input                                                               |
| `r` | `store.polling.refreshNow()` — the SAME beat the refresh control and the mobile bar drive |
| `p` | back to the Rider view via `HomeViewModeService.setView("rider")`                         |

- 🔴 **Refused while the reader is typing** — inputs, textareas, selects, anything `contenteditable`
  (checked on the element itself; jsdom lacks `isContentEditable`). `r` and `p` are ordinary letters:
  typing "Kelana Jaya" into search would otherwise refresh on the `r` in "Kelana".
- 🔴 **A modified keystroke is never a shortcut** (Ctrl/Cmd/Alt; Ctrl/Cmd+R is reload, Cmd/Ctrl+P is print).
- The listener is on `document` because a reader who clicked nothing has focus on `document.body`, so a
  host-level listener would never fire. The search input carries `focus-visible:ring-brand` +
  `ring-offset-background` so keyboard focus is visible in both themes.

**Incidents widget** (`pro-incidents-widget`, `-window`, `-list`, `-row`, `-title`, `-since`, `-all`) —
shows **ongoing incidents, newest first** and says so (`Ongoing · newest first · showing N`), linking to
`/insiden` rather than duplicating the calendar (`calendarIncidents` is public and takes `filters` /
`order`).

- ✅ Variables are `{ OR: { ongoing: true } }` + `{ startDatetime: "DESC" }` — **compile-time constants**
  (`HOME_RECENT_INCIDENT_VARS`, frozen). Deciding factor: a "last 7 days" `date.range` needs
  `new Date()`, and a client clock in query variables makes server render and hydration compute
  different variables, so the SSR TransferState payload is discarded and every read fires twice (the
  same rule that makes `lastWeekOnly` a backend-computed boolean).
- ⚠️ `calendarIncidents` returns a **list, not a connection, and takes no `first`/`after`**: "newest N"
  is the ORDER plus a client slice at `PRO_INCIDENT_LIMIT` (6) — one full payload of ongoing incidents
  per Pro reader. The document selects only six scalars plus the lines, far smaller than `/insiden`'s
  (which adds `details`, `medias`, `chronologies` and a first page of `links` because its cards render
  them).

**Official-notices widget** (`app-pro-official-widget`; `pro-official-widget`, `pro-official-count`,
`official-notice-list`, `official-notice`, `-title`, `-since`, `-line`, `-link`, `-empty`) — an archive
of the newest **official** statements an operator filed, so a Pro reader can check what the operator
said without scrolling the rider feed. Built on the **existing** `FEED_QUERY` (`FeedLink.isAutomated` is
already selected; a second document would be a second thing to keep in sync with
`home.queries.spec.ts`'s pinned selection).

- 🔴 **Official = `isAutomated === true`, filtered CLIENT-SIDE** over an archive bounded at 50 rows and
  never paged (no extra bytes, no backend argument). Staying composable with `HOME_FEED_COLLAPSE_VARS`
  matters — an official notice is usually a conversation root, and collapsing makes each row one
  statement.
- **Variables are compile-time constants:** `OFFICIAL_NOTICES_VARS` (frozen) =
  `{ first: OFFICIAL_NOTICES_PAGE_SIZE (50), status: "LIVE", collapseThreads: true }` with **no window**
  (`currentServiceDayOnly` / `lastWeekOnly` omitted; the backend defaults both `false`) — an all-time,
  newest-first archive. No `new Date()` (same SSR rule). 50 is a deliberate ceiling, not a reader-driven
  tunable (an official statement is worth a scroll, not a page control; 50 roots is one payload) — raise
  it when the archive is server-paged.
- 🔴 **Opted in, absent from `reloadAll()`**: a submit/report/retry does not re-issue it. 🔴 **It feeds
  NONE of `hasError`, `isLoading`, `isRefreshing`, `isLoadingLastWeek` or the retry banner**: those are
  page chrome, and a failed archive must not replace a working board with "Something went wrong".
- **Three states, not two** (`officialNoticesLoading` beside `officialNoticesFailed`): with only a
  failure flag, "no data yet and not failed" renders the **empty** panel and every Pro visit would flash
  "No official notices". Hidden while loading and on error; an empty answer renders a friendly panel
  saying an operator has posted nothing official yet (a fact about the network, not a failure).
- **Read-only, hence not an `<app-link-thread>`:** no vote buttons or edit pencil, so the **vote-overlay
  invariant** does not apply (rendering `app-link-thread` would import the vote surface without its
  read-set obligation), and the card's "N links" expander would pollute a list meant to be scannable.
- Row: title, `humanizeSince(occurredAt)`, one neutral chip per line (the operator's own claim, capped
  at three), and an `Open original` anchor (`target="_blank" rel="noopener noreferrer"` — the text lives
  outside the app: new tab, referrer stripped).
- ⚠️ **No line filter**: the only lines to filter by are the chips of the 50 resident rows, and a filter
  over one page of an archive is a worse affordance than reading 50 titles. Add it when the archive is
  server-paged.

**Report-ranking widget** (`app-pro-report-ranking`; `pro-report-ranking`, `-list`, `ranking-row`,
`ranking-row-code`, `ranking-row-count`, `ranking-bar`) answers "which lines do riders report most about
today?". It calls `store.requestHistoryReads()` from its constructor and has **zero reads of its own** —
it re-ranks the history the heat grid draws, so the two cells cannot disagree.

- **Top 5 by total report count over the current service day**, summed from `linesHistoryFor(line.id)`
  buckets (`historyTotal`). `REPORT_RANKING_TOP_LINES` (5) is in `METHODOLOGY_CONSTANTS` and rendered
  with the copy.
- The bar is one dimension: length is the whole reading (a single `bg-brand` fill on a `bg-muted` track)
  — this cell answers "which"; the grid beside it answers "when and how badly".
- Ties break on `localeCompare(code)` (stable regardless of read order). Reads `visibleLines()`, so Pro
  filters narrow it like the board.
- Hidden when `linesHistoryFailed` and when every count is zero ("nobody reported anything today" is not
  a ranking; an all-zero list of bars reads as broken).
- Popover = `metricTooltip("network.report-ranking")`: **reports, not faults** (the count is what riders
  filed, not a claim the network is at fault).

The Pro table's last-report column shows the HOUR of the last report (`lastReportHour`; history is
hourly and the header says so).

## 🧩 Extension Points & Hooks

- **`data/home-*.queries.ts`** are the GraphQL contract seam: new fields/queries/mutations are additive
  documents plus matching interfaces, keeping query strings out of components (mirrors
  `insiden.queries.ts` / `spotting.queries.ts`). Reuse an existing selection when it already carries the
  field (the official archive reuses `FEED_QUERY`).
- **`HomeStore`** owns the data lifecycle: beat, cursor pagination, `reloadAll()`, the lazy isolated
  reads and the vote overlay. New derived views are `computed()`s over the resources, never in
  components. A new _read_ of the feed connection is **copied from the resource it mirrors**, not
  sketched: `HOME_FEED_COLLAPSE_VARS` goes into all four list reads **and** both overlay reads (which
  add only the auth header; the overlay's window, page size and collapse must match the rendered one);
  the feed's `lineId` is the ONE variable the overlay must NOT copy. A new history-style read = a
  `graphqlResource` gated on a signal the SURFACE sets, constant variables, and an error signal kept out
  of `hasError` unless the data is page-critical.
- **`LineStatusSheetService`** — any card or page opens the report sheet with `openFor(lineId)`, or
  `openFor(lineId, { presetStatus })` when it already knows the condition, without wiring the sheet.
- **`ReportChooserService` + `report-chooser-order.util.ts`** — the submission-intent seam (see Report
  chooser).
- **`passenger-status.util.ts`** tables are the label/variant seam: a new `PassengerStatus` is one line
  per table (the sheet's chips and the submit box's select derive options from
  `Object.keys(PASSENGER_LABEL)`). **`status-info.util.ts`**: a new `PassengerStatus`/`VehicleStatus`
  member is one line in the label/order tables; chips and legend follow.
- **`feed-url.util.ts`** (`normalizeFeedUrl`) — submit-time URL normalizer; a new scheme rule is a
  one-function change with a spec. URL _presentation_ lives in insiden's `link-url.util.ts`.
- **`app-link-thread`** — the named extension point for any grouped row (recursive; contract and the
  `link-thread-selection.util.ts` / `link-occurred-at.util.ts` utilities in `insiden.md`). It takes the
  structural `LinkCardItem`, so a new host binds a `FeedLink`, a `PublicSocialMediaLink` or a fixture.
  `expanded` is internal, collapsed per level; a host wanting conversations open adds an input rather
  than re-deriving the toggle. The count text is the SHARED `threadLabel` — 🔴 it takes a **conversation
  size**, so `threadLabel(sublinkCount() + 1)`; the raw count silently deletes the chip on a root with
  exactly one sublink. Do **not** restyle the root.
- **`filterFeedLinks`** (`data/feed-filter.util.ts`) — Pro feed narrowing: a new client-side axis is one
  `&&` plus a documented rule on whether a conversation's members participate.
- **`HomeViewModeService`**, **`csv.util.ts`**, **`query-param.util.ts`**, **`PreferencesService`** —
  see Internal State.
- **`refresh-control`** — no inputs, injects `HomeStore`, rendered ONCE. A new host answers the same
  three states in the same order, or just calls `polling.refreshNow()`.
- **`hlmTickUp`** (`src/app/ui/motion/tick-up.directive.ts`) — the one motion primitive in
  `src/app/ui/`: a new number wanting the reveal is one binding; a new KIND of motion needs its own
  directive.
- **Reused shared primitives** stay the seams for new surfaces: `AssetMultiSelectComponent`,
  `VoteButtonComponent` (`targetType` supports `"link"`), Hlm `sheet`/`skeleton`/`badge`/`button`,
  `RetryBannerComponent` (structural `RetryableResource`, so `HomeStore` need not expose raw resources),
  `humanizeSince`. `refreshTick` propagates the beat's line half into an open accordion.
- **Methodology registry entries this page owns** (`core/methodology/`, surfaced via
  `metricTooltip(id)`): `network.lines-normal` (hero headline), `network.needs-attention` and
  `network.reports-now` (tile labels; `reports-now` is a sum over each line's own varying
  `statusWindowMinutes`, so it has no `METHODOLOGY_CONSTANTS` token), `network.activity-sparkline`
  (sparkline caption), `network.line-reports-summary` (row `N reports (X this hour)` label: both numbers,
  **reports not faults**, and the fallback), `network.heat-strip` (Pro grid), `network.has-data` (Pro
  filter), `network.report-ranking` (ranking; `REPORT_RANKING_TOP_LINES` lives in
  `METHODOLOGY_CONSTANTS`), `line-status.last-report-hour` (Pro table column),
  `line-status.operator-family` (family chips), `line-pulse.vehicle-count` (vehicle chips),
  `status-confidence.official|confirmed|unconfirmed|none` (confidence chip). `network.severity-order` is
  reachable only through `/methodology`. When a documented value changes, bump the owning section's
  `lastReviewed` (history widgets: `REVIEWED_AT_HISTORY_WIDGETS` in `methodology.content.ts`; see
  `methodology.md`).

### Seams & testids

A `data-testid` on an `InfoPopover` is its **PANEL**, not the trigger — reach the trigger via
`row.querySelector("app-info-popover")`.

- **Page:** `home-skip-link`, `home-panels`, `line-board`, `home-mobile-bar`, `home-mobile-report`,
  `home-mobile-spot`, `home-mobile-refresh`, `home-mobile-map`, `spotting-entry-sheet`,
  `submit-spotting-entry`.
- **Feed:** `login-to-submit`, `advanced-input`, `feed-submit-error`, `duplicate-indicator`,
  `feed-scroll`, `feed-skeleton`, `feed-empty`, `feed-empty-copy`, `feed-empty-cta`, `feed-footer`,
  `feed-count`, `feed-load-more`, `feed-tab-today`, `feed-tab-lastweek` (panel DOM ids
  `feed-panel-today`, `feed-panel-lastweek`), `last-week-panel`, `last-week-count`,
  `last-week-day-group`, `last-week-skeleton`, `last-week-empty`, `last-week-load-more`.
- **Hero:** `home-hero`, `hero-stats`, `hero-stat-lines-normal`, `hero-stat-needs-attention`,
  `hero-stat-reports-now`, `hero-stat-links-today`, `hero-disruption-callout`, `hero-actions`,
  `hero-report-delay`, `hero-spot-train`, `hero-share-link`, `hero-live-map`, `hero-status-line`,
  `hero-ribbon`, `hero-refresh-slot`, `hero-report-last`, `hero-report-last-wrap`,
  `hero-official-callout`, `hero-official-badge`, `hero-official-link`, `hero-needs-attention-popover`,
  `hero-reports-now-popover`, `hero-headline-popover`, `network-sparkline`, `network-sparkline-bars`,
  `network-sparkline-popover`, `network-sparkline-empty`, `sparkline-bar`.
- **Refresh:** `line-refresh-countdown`, `line-refresh-ring`, `line-refresh-ring-arc`,
  `line-refresh-updating`, `line-refresh-confirmation`, `line-refresh-tooltip`.
- **Board:** `board-controls`, `board-family-<code>`, `board-sort-severity`, `board-sort-name`,
  `board-view-rider`, `board-view-pro`, `line-skeleton`, `line-board-empty`, `line-board-row`,
  `line-board-attention`, `line-board-attention-heading`, `line-board-attention-dot`, `line-board-mine`,
  `line-board-mine-heading`, `line-board-all`, `line-board-all-heading`, `line-board-quiet-toggle`,
  `line-board-others`, `line-board-others-heading`, `board-family-popover`, `line-board-pin-hint`,
  `line-board-pin-hint-dismiss`.
- **Card:** `line-card-confidence`, `passenger-status`, `status-scale-count`, `line-vehicle-count`,
  `line-card-pin`, `line-card-pin-popover`, `line-card-details`, `submit-line-status`.
- **Row:** `line-row-status`, `line-row-chips`, `line-row-confidence`, `line-row-passenger`,
  `line-row-meta`, `line-row-vehicles`, `line-row-reports`, `line-row-reports-wrap`,
  `line-row-reports-popover`, `line-row-pin`, `line-row-pin-popover`, `line-row-details`,
  `line-row-report`, `line-row-toggle`, `line-row-expanded`, `line-row-pro`, `line-row-report-window`.
- **Expanded panel:** `line-status-chart`, `line-status-reports`, `line-status-reports-scroll`,
  `report-station`, `report-time`, `station-strip`, `station-strip-count`.
- **Sheets:** `line-status-submit-error`, `cancel-line-status-report`, `login-button`; chooser
  `chooser-tile-delay|stopped|spot|link|incident`, `chooser-line-picker`, `chooser-line-filter`,
  `chooser-line-list`, `chooser-line-<id>`, `chooser-line-hint`, `chooser-no-match`,
  `chooser-empty-lines`, `chooser-report-last`.
- **Heat grid:** `network-heat-strip`, `network-heat-strip-popover`, `heat-grid`, `heat-axis`,
  `heat-row`, `heat-row-code`, `heat-row-total`, `heat-cell`, `heat-cell-glow`, `heat-popover`,
  `heat-legend`, `heat-scale`, `heat-empty`, `pro-heat-widget`.
- **Pro dashboard:** `pro-dashboard`, `pro-bento`, `pro-shortcuts`, `pro-shortcut-search`,
  `pro-shortcut-refresh`, `pro-shortcut-rider`, `pro-back-to-rider`.
- **Pro lines:** `pro-lines-widget`, `pro-lines-layout-board`, `pro-lines-layout-table`,
  `pro-lines-filters`, `pro-filter-status`, `pro-filter-passenger`, `pro-filter-only-with-data` (+
  `-popover`), `pro-filter-clear`, `pro-lines-export`; table `pro-lines-table-wrap`, `pro-lines-table`,
  `pro-lines-sort-<key>`, `pro-lines-row`, `pro-lines-in-service`, `pro-lines-last-report`,
  `pro-lines-last-report-popover`.
- **Pro feed:** `pro-feed-widget`, `pro-feed-window`, `pro-feed-filters`, `pro-feed-search`,
  `pro-feed-line`, `pro-feed-status`, `pro-feed-skeleton`, `pro-feed-empty`, `pro-feed-list`,
  `pro-feed-footer`, `pro-feed-count`, `pro-feed-load-more`.
- **Pro incidents / ranking / official:** `pro-incidents-widget` (+ `-window`, `-list`, `-row`,
  `-title`, `-since`, `-all`); `pro-report-ranking`, `pro-report-ranking-list`,
  `pro-report-ranking-popover`, `ranking-row`, `ranking-row-code`, `ranking-row-count`, `ranking-bar`;
  `pro-official-widget`, `pro-official-count`, `official-notice-list`, `official-notice`,
  `official-notice-title`, `official-notice-since`, `official-notice-line`, `official-notice-link`,
  `official-notice-empty`.
- **Retired — do not re-add:** the Pro Line HQ tile (component, spec, testids), the card kebab
  (`line-card-menu`, `line-card-menu-panel`), `add-spotting-entry`, `line-row-hq-details`,
  `line-board-mine-empty`, `last-week-toggle`, per-cell native heat `title`s, `LinePulseListComponent`
  (deleted with the board; nothing references it).
- **Spec traps:** `hero-status-line` is asserted by `style` absence, not a missing transition class;
  hero placement is asserted via `hero-refresh-slot` + the row's `flex items-start justify-between`, not
  `[class~="lg:flex"]` (a substring match any future gate can satisfy); the hero overlay has no testid
  and is asserted structurally.

### Motion

All CSS-only (`motion-safe:` / `motion-reduce:` variants or a bounded transition), no dependency,
**inert under `prefers-reduced-motion: reduce`**: the reader gets the same information with nothing
moving (the ring's arc steps per tick; the spinner has BOTH animated elements switched off —
`motion-reduce:[animation:none]` on the svg plus `motion-reduce:animate-none` on the bright arc; the
backdrop circle is static by construction). No JS animation loop exists here; the only reduced-motion
`matchMedia` probe is the highlight scroll's `behavior`.

- 🔴 **Any new motion here is a `motion-safe:` / `motion-reduce:` pair on the element, plus a spec
  asserting the class.** jsdom computes no styles, so "the animation is disabled" is only testable as
  "the class that disables it is on the element". Every `animate-*` token is a global `@theme` token in
  `src/styles.css` (emulated encapsulation renames component `@keyframes`; `MISTAKES.md`).
- **Number tick-up** on the hero's four tiles — `hlmTickUp` (selector `[hlmTickUp]`, input `number`).
  The directive never renders the value; it **reveals** a changed number by adding `--animate-tick-up`
  (`@theme` keyframes, applied as `motion-safe:animate-tick-up`): a short upward slide + fade, **not a
  rolling digit** (that needs a per-frame JS tween and a `tabular-nums` column — too much machinery for
  "this number changed"). Contract:
  1. 🔴 **The first effect run is skipped** — a tile that never changed must not animate on arrival
     (decoration pretending to be information).
  2. **Re-trigger is a forced reflow, not a remount**: remove the class, read `void el.offsetWidth`,
     re-add — the only way to restart a CSS animation on an element that never left the DOM.
  3. **The class is never removed**: the animation is non-infinite with no fill mode, so it is inert
     once it ends; no cleanup timer to leak (add one only for an animation with `forwards`).
  - ⚠️ Usage is `[hlmTickUp]="n"` ALONE: a bare `hlmTickUp` attribute beside the binding binds `""` to
    the required `number` input and fails the build
    (`Type 'string' is not assignable to type 'number'`). Unlike `hlmBtn`, the bare form is not needed.
    SSR-safe: the first run is a no-op, so the server emits the template's own text.
- **Breathing dot** — decorative `bg-brand` dot in the attention `h2` (`line-board-attention-dot`,
  `aria-hidden`, `motion-safe:animate-breathe`, the **existing** `--animate-breathe` token). The count
  beside it never moves.
- **Countdown donut** — see Refresh control.
- **"Updating" spinner** — the tracker checklist's spinner spun in REVERSE so "the page is working on
  it" never reads as "the countdown is running". Rules:
  1. 🔴 **Spin and draw-in are CONCURRENT, never sequential.** The svg carries
     `[animation:spin_2s_linear_infinite_reverse] motion-reduce:[animation:none]`: **2s** per revolution
     (the tracker's 1s read as rushing), `reverse` INSIDE the shorthand (a separate
     `[animation-direction:reverse]` class is reset by the shorthand), and **no delay** (no fourth token
     — a 500ms delay made the entrance read as a still circle that then starts moving). The spec pins
     the shorthand string and asserts no time slot in front of `infinite`.
  2. **Draw-in on the BRIGHT LINE only.** A stroke animates its own `stroke-dashoffset` from its own
     length (`stroke-dasharray="14.14"`, the arc's quarter turn) to 0 over **500ms**
     (`animate-spinner-draw-arc motion-reduce:animate-none`); a whole circle appearing in one frame
     reads as a hard cut into motion. The faded backdrop circle (r 9, `stroke-opacity="0.25"`) is plain
     static markup — no dasharray, draw class or class attribute — present from the **first frame**, so
     the line draws onto it.
  3. 🔴 **The draw starts at 12 o'clock — a GROUP transform, not a class.** Both strokes sit in
     `<g transform="rotate(-90 11 11)">`. A `-rotate-90` class on the svg would be overwritten every
     frame (the spin writes `transform` on the svg); a group transform COMPOSES with it. Direction is
     unchanged: the arc `M20 11a9 9 0 0 0-9-9` starts at (20,11) and its sweep flag `0` walks
     anticlockwise to (2,11); walking `stroke-dashoffset` down from the path length reveals it forward
     from the path start. Reversing the path "to change direction" would only desync the draw.
  4. 🔴 **The keyframe is a GLOBAL `@theme` token** (`--animate-spinner-draw-arc` in `src/styles.css`),
     not a component `@keyframes`: emulated encapsulation renames those, so a class-referenced animation
     matched nothing and the entrance **silently never fired** (green spec, clean build). `MISTAKES.md`.
  5. **Both animated elements are classes, never inline styles** (an inline animation outranks every
     class, including the `motion-reduce:` opt-out). With both off nothing sets a base dashoffset, so
     the arc falls back to `0`: fully drawn, static, honest.
  6. jsdom cannot see this class of bug: the spec pins class names; one browser look verifies computed
     `animation-name` / sampled `dashoffset`.
- **Hero status-line tone fade + glow** (the bar still counts nothing): a **300ms colour fade** in the
  STATIC class (`transition-colors duration-300 motion-reduce:transition-none`) and a **5s
  `motion-safe:animate-icon-glow`** after each tone change (two 2.5s box-shadow pulses). Rules:
  1. 🔴 The fill carries a matching `text-*` beside its `bg-*`: `icon-glow` paints its shadow in
     `currentColor`, which otherwise takes the fill's inherited foreground.
  2. **The 5s is a `setTimeout`, not the class** (the animation is `infinite`); `ngOnDestroy` clears the
     timer. `animate-breathe` is NOT used — its keyframe scales and would visibly breathe the full-width
     bar.
  3. **Fires only on a CHANGE**: an effect over `_tone()` compares to the previous tone; the first run
     glows only if the tone is already real (an `unknown` first read is an empty read, not a network
     event).
- **Heat grid current-hour glow** — `motion-safe:animate-pulse` on the `heat-cell-glow` overlay span
  (`pointer-events-none absolute -inset-px`, `ring-2 ring-amber-400/80` + soft amber shadow,
  `aria-hidden`): reduced motion gets a **static amber ring** and still finds the hour (the ring is the
  information, the pulse the flourish). 🔴 **An overlay, never a class on the cell**: `animate-pulse` on
  the cell would fade the status colour carrying its data, and a wash behind it would hide it. 🔴 Its
  clock is seeded browser-only (`afterNextRender`, refreshed by the `linesRefreshTick` effect behind a
  `_clockSeeded` gate): the server emits no marker and the client's first paint is the marker-free grid
  the server sent — the same `NG0500` trap the row clock, `PreferencesService` and the refresh control
  guard.

### Dark-mode contrast

Every colour the page draws in dark mode was measured against its backdrop (WCAG 2.1 relative
luminance). Where a token exists, the fix goes into the token, never an ad-hoc `dark:` override at a
call site.

- `--brand` on `--card` (official "Open original", attention dot, highlight ring, ranking bar): dark
  `#f79331` **7.56:1** passes AA; light `#ee7104` **3.0:1** fails as body text. `--brand-foreground` on
  `--brand`: dark 8.23:1, light 3.0:1. Highlight ring dark 8.48:1; feed tabs dark 6.98:1; Pro surfaces
  (bento cells, filter buttons, export) pass.
- **`PASSENGER_BAR_CLASS.DISRUPTED`** (`features/home/data/passenger-status.util.ts`) =
  `bg-rose-600 dark:bg-rose-500`: the only status bar below 4.5:1 on the dark card (rose-600 3.84:1 →
  rose-500 4.61:1) and the dimmest, so the most severe status read least clearly. One `dark:` pair in
  the shared table, not seven tokens; every consumer (card legend, expanded chart, row, heat grid,
  status chip) inherits it. `status-history-display.util.spec.ts` pins the class.
- **The heat intensity ladder is left alone, deliberately.** `HEAT_INTENSITY_CLASSES` steps are
  theme-independent opacities, so the faintest step is 1.06:1 in **light** and 1.60:1 in dark — a
  dark-only fix would fix the wrong theme, and no floor move reaches 3:1 without collapsing the
  separation between the five steps, which _is_ the encoding (readers compare cells to each other, not
  to the card). The accessible equivalent is the per-row `role="img"` sentence plus the ONE
  `heat-popover` (`role="img"` per CELL would read out 384 numbers).
- 🔴 **Light-mode brand orange is a known, recorded failure.** `text-brand` on `--card` is 3.0:1; white
  on a `bg-brand` fill likewise. On this page `text-brand` remains only on the official-update "Open
  original" link, at mobile sizes where the large-text threshold does not apply; the hero's "Report a
  delay", "Live map", the mobile bar's Report and the skip link use the **default theme**. Fixing the
  rest means darkening the site's brand orange — a design decision above this feature (the accent was
  picked for hue identity; the nav, ad slots and tracker are designed against it; fixing home alone
  would leave two brand oranges). See Feature Opportunities.
- ⚠️ **The four network-tone classes are NOT measured**: `networkTone`'s
  `green/orange/red-600 dark:*-400` (and neutral `text-foreground`) were only checked in a browser. The
  headline is `text-xl font-semibold` (`sm:text-2xl`), so the **large-text** 3:1 threshold applies — an
  argument, not a measurement. Re-measure before trusting it; add no fifth tone without the same check.

### Accessibility

`hlmBtn`, `hlmInput`, `hlmSelect`, the checkbox, the chooser tiles and the Pro widgets' links carry an
accessible name and `focus-visible` ring from their primitives.

- **One `h1`: the hero headline** (inside its `app-info-popover`). Everything steps down: board group
  headings `h2`; the feed column opens with a visually-hidden `<h2>Community feed</h2>`; Last Week day
  labels `h3` (a day is a subsection of the column, not a peer).
- **Skip link** — `<a href="#line-board" data-testid="home-skip-link">`, the **first child of `<main>`**
  and first focusable thing:
  `sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50`. `focus:fixed`, not
  `focus:relative`: a relative link pushes the hero down the moment it is focused, moving the content it
  exists to jump past. 🔴 The target is `id="line-board"` + **`tabindex="-1"`** — on the rider board
  `<section>` in one branch and on `<app-pro-dashboard>` in the other (an anchor to an element without
  `tabindex` scrolls but leaves the caret at the top: the classic half-working skip link). The branches
  are exclusive, so the id is on exactly one element in either layout.
- **`aria-expanded` + `aria-controls` on both expand toggles** — ids scoped **per line**
  (`line-card-expanded-<id>` / `line-row-expanded-<id>`; every row is one of sixteen instances). 🔴
  Panels stay behind `@if`, not pre-rendered-and-hidden: an `aria-controls` target that does not exist
  is worse than none, and always-mounted would read thirty-two lazy chart/report subtrees nobody
  expanded.
- **Focus rings where nothing else draws one.** The board's two segmented groups (`board-sort-*`,
  `board-view-*`) and the two feed tabs are plain `<button>`s, not `hlmBtn`, so each carries
  `outline-none focus-visible:ring-2 focus-visible:ring-ring/50`. 🔴 `heat-popover` and `heat-cell-glow`
  are `pointer-events-none` + `aria-hidden` and must stay **non-focusable** — the grid's accessible
  equivalent is the per-row `role="img"` sentence; the panel is a pointer-only readout.
- **Landmarks:** board section `aria-label="Line status"`, feed section `aria-label="Community feed"`;
  the feed's real `<h2>` is an addition, not a replacement (`aria-label` appears only in the landmark
  list).
- **Focus order:** skip link first; mobile action bar after the main content; the feed tablist's roving
  `tabindex` so `Tab` enters the pair once and leaves once.
- **The network tone is never the only channel.** `hero-status-line` is `aria-hidden` (colour alone is
  not information); every fact it carries is also text on screen — the `h1` sentence, the "Refreshing in
  Ns" label, the board's named lines. A fifth tone must add its sentence too.

### Deliberate deviations

- **No `@defer`** for the below-the-fold Pro widgets. The repo has zero `@defer` precedent, and
  `TestBed`'s `deferBlockBehavior` / `fixture.deferBlocks` would make every widget spec assert on a
  manual flush instead of behaviour. Independent loading — the real requirement — is by construction:
  each widget owns its resource and failure flag and opts its read in from its own constructor, so
  nothing is shared but the store.
- **`NetworkBoardComponent` has two layout inputs** (`embedHeatStrip`, `foldQuiet`) despite taking no
  data inputs; without `embedHeatStrip` the dashboard would render the heat grid twice.
- **The mobile action bar stays outside the rider/Pro branch** as shared chrome (see HomePage).

## 💡 Potential Feature Opportunities

- **A per-link deep link.** The duplicate indicator links to `#feed-link-<id>`, but **no feed row
  renders `id="feed-link-<id>"`** — the anchor is dead today (`e2e/home.spec.ts` asserts only the
  `href`). Render the id on the thread/row wrapper, then add a route/fragment that scrolls to and
  highlights one row, so a shared link can point at a single report (a Rider-surface idea).
- **Extend the `userVote` overlay past the first page.** `loadVoteOverlay()` reads only the first page
  of Today (8) and Last Week (20), so a logged-in user's own vote on an appended page renders `0` until
  they vote again. Ready now: re-run the authenticated read with the appended cursors, or batch the
  appended ids into one authenticated query when `loadMore()` / `loadMoreLastWeek()` resolves (not per
  beat — see the overlay cadence note).
- **Share metadata.** Open-graph / Twitter card tags and a per-route share image are missing (`HomePage`
  sets `title` and `<meta name="description">` via `Meta.updateTag`; `about.page.ts` already sets `og:*`
  as a pattern).
- **Cause and direction on the expanded line row.** Not in the GraphQL `Line` schema, so neither the
  expanded row nor the Pro table can say why a line is disrupted or which way it runs. Needs an additive
  backend field first.
- **Operator grouping is a heuristic.** `lineFamily()` takes the leading letters of the line code
  because the schema has no operator field. Replace it when the backend exposes one.
- **Pro table last-report precision.** The column shows the HOUR (history is hourly); minute precision
  needs a backend timestamp.
- **E2E mock** (`e2e/home.spec.ts`) still returns `passengerStatusMessage`, which the query no longer
  selects. Harmless; prune it.
- 🔴 **Light-mode brand-orange contrast — a design decision, not a home bug** (measurements: Dark-mode
  contrast). What remains here is the official-update **"Open original"** `text-brand` link at mobile
  sizes. Options: darken the token globally, or stop using `text-brand` for that link in light mode
  (e.g. `--primary`).
- **Station-flow and verification-count widgets — roadmap, not built.** A **station flow**
  (entries/exits at a station over the service day; the per-station strip only aggregates loaded
  reports) and a **verification count** (sightings confirmed by a second report — no such relation
  exists on the sighting yet) both need an additive backend aggregate first; neither should be
  approximated client-side from truncated pages.
- **`network.severity-order` has no in-situ surface.** Published (`methodology.page.spec.ts` renders a
  popover per `MetricDoc`) but the board's `Severity` sort button has no info trigger. A help glyph
  inside a segmented control is a UI decision, not a registry gap.

## 💡 Potential AI Feature Opportunities

- **"What's happening right now" digest.** The page already consolidates exactly a digest's inputs — the
  global feed plus per-line `passengerStatus` and their supporting `pulseLinks`. This is the concrete
  surface for the catalog's cross-component "service health AI digest" (spotting + insiden + tracker
  share the status vocabulary).
- **Spam / relevance classification of submitted links.** `submitFeedLink` already normalizes URLs for
  duplicate detection; an LLM/classifier layer could score relevance, detect near-duplicates the
  normalizer misses, and suggest line tags from the link's content.
- **Passenger-status inference from feed text.** The backend still consolidates a per-line
  `passengerStatusMessage`, but the page does not select it; an LLM could draft a plain-language line
  status from a cluster of recent link titles/notes, or pre-fill the status sheet's status chip from
  free-text notes.
