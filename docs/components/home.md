# Component: home

## 📌 Purpose & Scope

- **Core Responsibility:** The community front page and the app's landing route (root `""`). It
  composes three things: a login-gated box that submits a community link, a global rolling **feed**
  of approved links (with voting), and a per-line **pulse** list showing each line's live
  operational + passenger status alongside the social entries behind it. Tapping a line's pulse card
  opens a **line-status bottom sheet** for a link-less live report (status, optional delay/notes,
  affected stations). It also hosts the spotting feature's **"Add a Spotting Entry" sheet**, opened
  via `ReportSheetService.openFor(lineId)` from a line card and pre-scoped to that line. It replaces
  the old default-route redirect to `/spotting`.
- **Domain/Layer:** Angular Presentation (standalone, lazy-loaded routed feature, route-scoped
  providers). It reads and mutates the Django/Strawberry GraphQL backend; Firebase Auth gates every
  submit and vote. It has no Firestore involvement.
- **Subcomponent breakdown** (one routed page, three child groups, a route-scoped store):
  - `home.page.ts` — the routed page: nav → a two-panel feed/line-status split (submit box atop
    the feed column) → footer, plus the status sheet and the shared link sheet (feed-link edits);
    starts/stops the store's polling and adapts the store to the shared retry banner.
  - `feed/` — `link-submit-box.component.ts` (the login-gated submit affordance) and
    `feed-url.util.ts` (`normalizeFeedUrl`, submit-time scheme qualification). Feed rows render
    through the shared insiden `app-link-card` (`LinkCardComponent`) — there is no home-local card.
  - `line-pulse/` — `line-pulse-card.component.ts` (one line's live status plus the expand/collapse
    toggle), `line-pulse-list.component.ts` (skeletons / empty state / the list),
    `line-status-chart.component.ts` (the expanded hourly report strip),
    `line-status-reports.component.ts` (the expanded report list), and
    `status-info-chip.component.ts` (the hover/tap info popover shared by the card's chips — a thin
    wrapper over the shared `app-info-popover` that passes `showIcon=false` (the projected badge is
    the trigger) and forwards `showMethodologyLink`; `status-info-chip.server.spec.ts` renders it
    through the real server path to guard SSR/hydration).
  - `line-status/` — `line-status-sheet.component.ts` (the mobile report sheet).
  - `home.page.ts` additionally hosts the spotting feature's `ReportFormComponent` in a second
    `hlm-sheet` (reused as-is — no form built here); the line seed travels through
    `ReportSheetService.openFor(lineId)`. The page's desktop layout is a two-panel split: the
    retry banner and footer stay full width, while the feed and the line-status
    sections share `data-testid="home-panels"` (`flex flex-col gap-6 lg:grid lg:grid-cols-2
lg:items-start`) — stacked on mobile, URL feed left / line statuses right from `lg` up. The
    submit box heads the feed column (full width on mobile, column-wide from `lg` up, ahead of
    the list in DOM order), and the feed renders **every loaded link** in an uncapped `feed-scroll` container (no inner scroll —
    the page scrolls) and owns the load-more continuation: the bottom-right `feed-footer`
    (`data-testid="feed-footer"`) holds a `feed-count` span reading `Showing X of Y`
    (`store.feedLinks().length` over `HomeStore.feedTotalCount()`, so the denominator stays the
    filtered total as pages append) beside the `feed-load-more` button, both hidden while the feed
    is empty; while the first page loads the feed shows `feed-skeleton`
    (`data-testid="feed-skeleton"`, `hlmSkeleton h-24 w-full`), and an empty, settled, error-free
    feed instead shows the muted `feed-empty` (`data-testid="feed-empty"`, "No links yet.") styled
    like the line list's empty state (the retry banner replaces both when the read errored). The
    line-status panel is headed by a fixed-cadence refresh row
    (`data-testid="line-refresh-countdown"`), itself a `<button>`: spinner +
    `Refreshing in {n}s` from the store's public `polling.secondsRemaining()`, and a click
    calling `store.polling.refreshNow()`. Hovering it (or tapping it when the device has no
    hover — capability is measured with `(hover: hover) and (pointer: fine)`, the same
    `StatusInfoChipComponent` pattern) reveals a `Click to Refresh Now` tooltip
    (`data-testid="line-refresh-tooltip"`). After a manual refresh settles, the row swaps its
    spinner + countdown for a transient `Updated` confirmation
    (`data-testid="line-refresh-confirmation"`, `role="status"`, ~2s). There is no separate
    `Refresh now` button any more. Deliberately no interval picker (unlike situasi), the 30s
    cadence is fixed.
  - `data/` — `home.queries.ts` (GraphQL documents + types), `home.store.ts` (the route-scoped
    `HomeStore`), `line-status-sheet.service.ts` (sheet controller), `line-status-metrics.util.ts`
    (per-status plain-language copy), `status-info.util.ts` (popover/legend/breakdown row builders),
    and the pure `passenger-status.util.ts` (no components).

## 🔌 Interface & Data Flow

- **Route:** `""` in `src/app/app.routes.ts` — `loadComponent: HomePage` with
  `providers: [HomeStore, LineStatusSheetService, SpottingLinesStore]`. Route-scoped on purpose: the
  polling beat and the sheet state are created with the page and torn down with it
  (`HomePage.ngOnDestroy` calls `store.stop()`). `SpottingLinesStore` is the spotting feature's
  route-scoped line list, provided here too because the spotting report form is hosted on this page.
- **Hosted spotting sheet:** `<hlm-sheet data-testid="spotting-entry-sheet">` wraps
  `<app-report-form #reportFormRef (submitted)="onSpottingSubmitted()" />` plus a
  Clear/Cancel/Submit footer (submit testid `submit-spotting-entry`); `onSpottingSubmitted()` closes
  the sheet and calls `store.reloadAll()`. The seed comes from
  `ReportSheetService.openFor(lineId)` (root-provided), which the report form consumes on its
  open edge.
- **Component `input()`/`input.required()` signals:**
  - `LinePulseCardComponent.line = input.required<LinePulse>()`, `refreshTick = input(0)` (the
    host's poll beat, forwarded to the expanded panel's chart and reports).
  - `LinePulseListComponent.lines = input.required<LinePulse[]>()`, `isLoading = input(false)`,
    `refreshTick = input(0)` (forwarded to every card, active and "Other lines").
  - `LinkCardComponent` (the shared insiden `app-link-card`): `link = input.required<LinkCardItem>()`
    — the feed node satisfies the structural contract directly — `userVote = input(0)` (the host
    passes `HomeStore.userVoteFor(link.id)`, because the store's authenticated overlay wins over the
    anonymous feed value) and `editable = input(false)` (host-gated with `canEditLink`).
  - `LineStatusSheetComponent.line = input<LinePulse | null>(null)` (the host's pulse entry;
    `LineStatusSheetService.lineId()` is the fallback for hosts that only know the id).
- **Outputs (signals `output()`):**
  - `LinkSubmitBoxComponent.submitted = output<void>()` (after a successful submit or duplicate, so
    the host calls `HomeStore.reloadAll()`).
  - `LinkCardComponent.voteChanged = output<{ value: number }>()` (after a successful vote, so the
    host records it via `HomeStore.setUserVote`) and `edit = output<LinkCardItem>()` (the host opens
    the shared link sheet in edit mode).
  - `LineStatusSheetComponent.submitted = output<void>()` (after a successful report, reload).
- **GraphQL documents** (`data/home.queries.ts`, single contract seam; hand-written types, no
  codegen):
  - `FRONT_PAGE_LINES_QUERY` — per-line pulse list: `id/code/displayName/displayColor/status`,
    `inServiceVehicleCount`/`totalVehicleCount`, `vehicleStatusCounts` (the per-status fleet
    breakdown), `passengerStatus`/`passengerStatusMessage` (both nullable), `statusReportCount`,
    `passengerStatusCount`/`passengerStatusCounts` (the per-category report breakdown the passenger
    chip's severity legend reads), `statusWindowMinutes` (the rolling window), and nested
    `pulseLinks` (a `SocialMediaLinkScalar` subset). `LINE_STATUS_HISTORY_QUERY` (hourly buckets,
    each carrying `count`, `dominantStatus` and the `statusCounts { status count }` breakdown the
    chart stacks) and `LINE_STATUS_REPORTS_QUERY` (keyset-paginated report list, each node carrying
    its `stations { id displayName }`) back the expanded card panel.
  - `FEED_QUERY` — `publicSocialMediaLinks(first, after, status, currentServiceDayOnly)` connection
    (`edges { node, cursor }`, `pageInfo { hasNextPage, endCursor }`, and the cursor-independent
    `totalCount`); the node selection carries both link axes — `status` (the approval state the
    shared card keys its Pending pill off) and `completed` (the console's separate "mark handled"
    flag) — and the store always requests `first: FEED_PAGE_SIZE` (8), `status: "LIVE"`,
    `currentServiceDayOnly: true`, so a feed row is always approved and never shows the pill.
  - `SUBMIT_FEED_LINK_MUTATION` (`submitFeedLink(input: FeedLinkInput!)`) — returns
    `{ ok, isDuplicate, duplicateOfId, userVote, link }`.
  - `SUBMIT_LINE_STATUS_REPORT_MUTATION` (`submitLineStatusReport(input: LineStatusReportInput!)`).
  - `UPVOTE`/`DOWNVOTE`/`REMOVE_SOCIAL_MEDIA_LINK_VOTE_MUTATION` — used by the shared vote button.
  - Input types: `FeedLinkInput { url, title?, lineIds?, stationIds?, status?, delayMinutes?, notes? }`
    and `LineStatusReportInput { lineId, status, stationIds?, delayMinutes?, notes? }`.
  - Enums mirrored from the schema: `LineStatus`, `PassengerStatus`, `SocialMediaLinkStatus`.
- **Dependencies (shared services/state consumed):**
  - `graphqlResource()` (`core/graphql/graphql-client.ts`) — reactive reads (SSR TransferState +
    backoff retry); `GraphQLClient.request(query, variables?, extraHeaders?)` — mutations and the
    authenticated vote-overlay read.
  - `AuthService` (`core/auth/auth.service.ts`) — `isLoggedIn`, `login()`, `idToken()`,
    `whenReady`.
  - `PollingSource` (`core/polling/polling-source.ts`) — the shared polling beat.
  - `AssetMultiSelectComponent` (`features/insiden/asset-multi-select/`) — cross-feature reuse for
    the line picker (submit box) and station picker (status sheet).
  - `VoteButtonComponent` (`features/insiden/vote-button/`) — reused with `targetType="link"` for
    feed voting; its `VoteValue` is `{-1, 0, 1}`.
  - `humanizeSince` (`features/spotting/data/humanize-since.util.ts`) — cross-feature relative-time
    formatting, consumed by the shared link card.
  - `faviconHostnameOf` (`features/insiden/data/social-link.util.ts`) — hostname lookup for the pulse
    card's favicon; the shared link card's `linkUrlPartsOf`
    (`features/insiden/data/link-url.util.ts`) splits URLs with insiden's `splitHttpUrl`
    (`features/insiden/data/incident-link-line.util.ts`).
  - `LinkSheetService` / `app-link-sheet` / `canEditLink` (`features/insiden/**`) — the shared link
    edit flow the home feed now drives (same sheet as /insiden and situasi).
  - `LineStatusBadge` (`domain-ui/line-status-badge`) — the operational-status badge on each pulse
    card; Hlm `badge`/`button`/`input`/`native-select`/`sheet`/`skeleton` primitives; `ToastService`;
    `RetryBannerComponent` (via its structural `RetryableResource`).
  - `AppNavComponent` / `AppFooterComponent` (`shell/`) — page chrome.

## ⚙️ Internal State & Logic

- **`HomeStore`** (`data/home.store.ts`, `@Injectable()` provided by the route) is the single source
  of truth for page data:
  - Two `graphqlResource`s: `linesResource` (`FRONT_PAGE_LINES_QUERY`) and `feedResource`
    (`FEED_QUERY` with `first: FEED_PAGE_SIZE` (8), `status: "LIVE"`, `currentServiceDayOnly: true`).
    The constructor reads both once so the lazy
    `httpResource` fetches on store creation.
  - Derived: `lines` (pulse list), `feedLinks` (first page + appended pages), `feedPageInfo`
    (appended `hasNextPage`/`endCursor` wins over the first page's), `feedTotalCount` (the appended
    page's `totalCount` wins over the first page's, else `0`), `isLoading`/`hasError` (either
    resource).
  - Cursor pagination:
    `appendedEdges`/`appendedHasNext`/`appendedTotalCount`/`nextCursor`/`loadingMore` signals;
    `loadMore()` re-issues `FEED_QUERY` through `GraphQLClient.request` with the last cursor and
    appends, coalesced by `loadingMore`.
  - Polling: a public `new PollingSource(() => this.reloadLines())`, armed by `start()` and
    disarmed by `stop()` (both no-ops on the server, 30s default). `reloadLines()` reloads the
    lines resource **only** and bumps `linesRefreshTick` — the feed is deliberately left alone so
    a poll can't drop the user's appended Load More pages. `reloadAll()` (unchanged) still drops
    appended pages and reloads both resources for the submit/edit flows. The public beat is what
    the page's countdown renders (`intervalMs()`/`secondsRemaining()`) and what
    `refreshNow()` drives; `linesRefreshTick` travels page → list → card → the open accordion's
    chart/reports.
  - **Authenticated `userVote` overlay:** `graphqlResource()` sends no auth token, so the feed's
    `userVote` is always `0`. When logged in, `loadVoteOverlay()` awaits `auth.whenReady`, re-reads
    the first feed page with `GraphQLClient.request(..., { "firebase-auth-key": idToken })`, and
    records every non-zero vote into `userVotes = signal<Record<string, number>>({})`.
    `userVoteFor(linkId)` prefers the overlay, then the anonymous feed value, then `0`;
    `setUserVote(linkId, value)` records a vote after a successful mutation.
- **`LineStatusSheetService`** (`data/line-status-sheet.service.ts`) — the cross-component sheet
  controller: `isOpen` + `lineId` signals, `openFor(lineId)` (sets both), `setOpen(open)`.
  `LinePulseCardComponent` calls `openFor`; the sheet reads `isOpen`/`lineId`.
- **`HomePage`** — `sheetLine` computes the `LinePulse` for `lineStatusSheet.lineId()` from
  `store.lines()`; `errorResource` is a minimal `RetryableResource` adapter over `store.reloadAll()`
  (no countdown). `start()` in the constructor, `stop()` in `ngOnDestroy`. The feed renders
  `store.feedLinks()` in full (no reveal slice; `loadMore()` only pulls the next page) and the line
  panel's countdown row mirrors the store's polling beat.
- **`LineStatusSheetComponent`** local signals: `status` (`PassengerStatus | null`), `delayMinutes`
  (string, parsed on submit), `notes`, `selectedStationIds`, `isSubmitting`, and `submitError`
  (inline `[data-testid="line-status-submit-error"]`, `role="alert"`) — set on a GraphQL `ok: false`
  payload, a `GraphQLRequestError` (server message mirrored), or a transport failure; only a truthy
  `ok` closes the sheet and emits. A `[data-testid="cancel-line-status-report"]` button closes it
  without submitting. `lineId` is computed from the input or the service. `stationsResource` is a
  lazy `graphqlResource` that stays inert until the sheet is open on a known line
  (`STATION_LINES_QUERY`, reused from spotting). An `effect` detects the open→closed edge and calls
  `clear()` (which also resets `submitError`), so the next report starts clean. Logged out, the sheet
  body is a login prompt instead of the form.
- **`LinkSubmitBoxComponent`** local state: a Signal Forms `model`/`linkForm` (URL required),
  `selectedLineIds`, `selectedStatus`, `statusLineError` (a status without a line is blocked
  locally), `duplicateOfId`, `isSubmitting`, and `submitError` (inline
  `[data-testid="feed-submit-error"]`, set for a rejected or unreachable submit). The URL input is
  `type="text"` + `inputmode="url"` and `normalizeFeedUrl` scheme-qualifies the value at submit
  time — native `type="url"` silently rejected schemeless input before the handler ran. On a
  duplicate response it stores `duplicateOfId` (used for the `#feed-link-<id>` anchor) and records
  the backend's auto-upvote via `store.setUserVote`. On a fresh submit it toasts success.
  `lineOptions` is computed from `store.lines()`.
- **`LinePulseCardComponent`** — `_links` caps related `pulseLinks` at 5 (`MAX_PULSE_LINKS`); the
  passenger badge/label go through the pure `passengerLabel`/`passengerVariant` helpers. There is no
  standalone status-count badge (`passenger-status-count` was removed at the user's correction):
  the passenger chip's severity legend carries the per-status report counts inline, via
  `passengerScale(line().passengerStatus, line().passengerStatusCounts)` — a row shows
  `[data-testid="status-scale-count"]` (`(n)`) only when the backend reported a non-zero count. The
  status row ends with the `line-vehicle-count` badge (`{{inService}}/{{total}} in service`, e.g.
  "12/20 in service", `aria-label="N of M vehicles in service"`) whose popover lists the per-status
  fleet breakdown plus a derived `Total`; the `line-status-badge` pill renders only when
  `line().status !== "ACTIVE"` (Active is the default, not a chip) and passes
  `[showMethodologyLink]="false"` — line status has no method section of its own, so its popover is
  a plain tooltip while the passenger and vehicle chips keep the "How this is counted" link; and the
  consolidated
  `passengerStatusMessage` is not rendered — the query still selects it, but the card passes no
  `message` to its chips. The
  title row toggles the lazy expanded panel (`line-status-chart` + `line-status-reports`, both gated
  on `expanded`).
- **`LineStatusChartComponent`** — the expanded card's hourly strip: `bars`/`hasData`/`maxCount`
  computed over the lazy `LINE_STATUS_HISTORY_QUERY` (inert until `expanded`; a parent-driven
  `refreshTick` input reloads it while the accordion is open, via the same applied-tick guard as the
  reports list). One bar per service-day hour, scaled to the busiest hour and **stacked by report
  type**: `toSegments()` splits each hour's `statusCounts` in `PASSENGER_SCALE` order (bottom-up
  NORMAL → DISRUPTED, each segment `count / segmentedTotal * barHeightPct` so they sum to exactly the
  bar's height; a bucket with no counts falls back to one dominant-coloured segment). The bar
  container is `flex-col-reverse` (first DOM segment at the bottom) and only the topmost segment
  rounds its top. The hover readout and each bar's `title`/`aria-label` carry the hour range, the
  total and the per-status breakdown. All 24 hours are labelled on a `min-w-[24rem]` strip inside an
  `overflow-x-auto` lane, and the loading skeleton, empty state and loaded chart all share the
  exported `CHART_STATE_MIN_HEIGHT_CLASS` (`min-h-40`) so the card below never jumps between states.
- **`LineStatusReportsComponent`** — the expanded card's keyset-paginated report list
  (`LINE_STATUS_REPORTS_QUERY`), also gated on `expanded` (a parent-driven `refreshTick` input
  re-issues the read while the accordion is open, via the same applied-tick guard as the chart).
  Each row shows the passenger badge, an optional delay and the report's related `stations` (joined
  `displayName`s, `report-station`), with the relative time pinned right (`report-time`,
  `humanizeSince`) carrying the exact timestamp on its `title`. The loaded rows sit in their own
  scroll container (`data-testid="line-status-reports-scroll"`, `max-h-56 overflow-y-auto`) so the
  list shows roughly five one-line rows and scrolls internally rather than stretching the card;
  rows carrying notes run taller, so the cap is approximate. Only the loaded branch is capped — the
  skeleton, empty and error branches render outside it.
- **`LinkCardComponent`** (shared insiden `app-link-card`) — `urlParts` (`linkUrlPartsOf`; the domain
  keeps the card's foreground colour, the path renders muted), `faviconDomain`, `submitter`
  (`nickname || shortId || ""`), `createdLabel` (`humanizeSince`), and `voteValue`, which narrows the
  store's plain number into the shared vote button's `VoteValue`. The meta rail stretches to the row
  height so the relative timestamp bottom-aligns with the tag row (or the title row when the card has
  no tags) instead of claiming a footer row, and holds the vote control plus the edit pencil (both
  OUTSIDE the navigational `<a>`). Its Pending pill is driven by the link's approval `status`
  (`PENDING_APPROVAL`), never by the separate `completed` handled flag.
- **`HomePage`** — feed edit wiring: `canEdit(link)` calls `canEditLink` with the host's
  `isLoggedIn`/`isAdmin`/`user.uid` over `AuthService`; `openEdit(link)` calls
  `LinkSheetService.openEdit(link)`; the page hosts `<app-link-sheet>` and an effect on the sheet's
  open→closed edge calls `store.reloadAll()`.
- Pure logic lives outside the components: `feed-url.util.ts`
  (`normalizeFeedUrl`), `passenger-status.util.ts` (`PASSENGER_LABEL`/`PASSENGER_VARIANT` lookup
  tables, `passengerLabel` null → `"No data"`, `passengerVariant` null → `"neutral"`),
  `status-info.util.ts` (the `passengerScale`/`vehicleStatusRows` and info/legend/breakdown row
  builders) and `line-status-metrics.util.ts` (`PASSENGER_METRIC`/`passengerMetric`).

## 🧩 Extension Points & Hooks

- **`home.queries.ts`** is the single GraphQL contract seam — new fields/queries/mutations are
  additive documents plus matching interfaces, keeping query strings out of components (mirrors
  `insiden.queries.ts`/`spotting.queries.ts`).
- **`HomeStore`** centralizes the page's data lifecycle: the polling beat (`PollingSource`), cursor
  pagination, `reloadAll()`, and the authenticated `userVote` overlay. New derived views belong here
  as `computed()`s over the two resources rather than in components.
- **`LineStatusSheetService`** is the cross-component trigger seam: any future card or page can open
  the report sheet with `openFor(lineId)` without wiring the sheet itself.
- **`passenger-status.util.ts`** lookup tables are the label/variant seam — a new `PassengerStatus`
  value is a one-line addition per table (the sheet's chips and the submit box's select both derive
  their options from `Object.keys(PASSENGER_LABEL)`, so they stay in sync automatically).
- **`feed-url.util.ts` (`normalizeFeedUrl`)** is the submit-time URL normalizer seam — a new scheme
  rule is a one-function change with its own spec. URL _presentation_ (domain/path split) lives in
  insiden's `link-url.util.ts` (`linkUrlPartsOf`), shared by the one link card every surface uses.
- **`status-info.util.ts`** is the popover-content seam: a new `PassengerStatus`/`VehicleStatus`
  member is a one-line addition to the label/order tables, and the chips and legend stay in sync.
  **`line-status-metrics.util.ts`** holds the plain-language per-status copy. That copy is no longer
  authored here — both now read the shared methodology registry (`core/methodology/`,
  `metricDoc(...)`), so the popover and `/methodology` cannot drift.
- **Reused shared primitives stay the seams for new surfaces:** `AssetMultiSelectComponent`
  (line/station pickers), `VoteButtonComponent` (`targetType` already supports `"link"`), Hlm
  `sheet`/`skeleton`/`badge`/`button`, `RetryBannerComponent` (structural `RetryableResource`, so
  `HomeStore` doesn't need to expose the raw resources), and `humanizeSince`. The feed has no
  client-side reveal length any more — every loaded link renders and `Load More` only fetches the
  next page; `refreshTick` is the seam for propagating the lines-only poll beat into an open
  accordion.
- **`errorResource` in `HomePage`** shows the adapter pattern for exposing a store (rather than a
  raw resource) to the shared retry banner.

## 💡 Potential Feature Opportunities

- **Feed filters + a real permalink.** The feed is scoped to the current service day but otherwise
  unfiltered, and the only deep link is the in-page `#feed-link-<id>` anchor the duplicate indicator
  already emits. **Ready to implement, purely additive:** a line/status filter signal folded into
  the feed request (or client-side over the resident page), plus a per-link route/fragment that
  scrolls to and highlights a row, since the anchor id already exists for every row.
- **Extend the `userVote` overlay past the first page.** Today `loadVoteOverlay()` reads only the
  first `FEED_PAGE_SIZE` (8) links, so a logged-in user's own vote on an appended page renders as
  `0` until they vote again. **Ready now:** either re-run the authenticated read with the appended
  cursors, or batch the appended links' ids into one authenticated query when `loadMore()` resolves.
- **Optimistic voting.** `VoteButtonComponent` is reused as-is; the store's overlay makes optimistic
  score updates straightforward (record the overlay value first, roll back on a GraphQL error).
- **A dedicated route `title` and share metadata.** The `""` route sets no `title` (unlike every
  other route); a landing page deserves one for SSR/SEO.
- **Client-side search/sort over the resident feed page.** No new query needed for the current page;
  a text filter over `feedLinks()` is a small computed addition.

## 💡 Potential AI Feature Opportunities

- **"What's happening right now" digest.** The home page already consolidates exactly the inputs a
  digest needs — the global feed plus per-line `passengerStatus`/`passengerStatusMessage` and their
  supporting `pulseLinks`. This is the concrete surface for the catalog's cross-component
  "service health AI digest" opportunity (spotting + insiden + tracker share the same status
  vocabulary).
- **Spam / relevance classification of submitted links.** `submitFeedLink` already normalizes URLs for
  duplicate detection; an LLM/classifier layer on top could score link relevance, detect
  near-duplicates the normalizer misses, and suggest line tags from the link's content.
- **Passenger-status inference from feed text.** The per-line `passengerStatusMessage` is
  backend-consolidated today; an LLM could draft a plain-language line status from a cluster of recent
  link titles/notes, or pre-fill the status sheet's status chip from free-text notes.
