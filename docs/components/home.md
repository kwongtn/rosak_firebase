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
    the feed column, a collapsed Last Week section below it) → footer, plus the status sheet and the
    shared link sheet (feed-link edits); starts/stops the store's polling and adapts the store to
    the shared retry banner.
  - `feed/` — `link-submit-box.component.ts` (the login-gated submit affordance: a quick URL-only
    form plus an "Advanced Input" button that opens the shared link sheet) and
    `feed-url.util.ts` (`normalizeFeedUrl`, submit-time scheme qualification). Feed rows render
    through the shared insiden `app-link-thread` (`LinkThreadComponent`) — the collapsible thread
    wrapper around `app-link-card`, and the only link-row element in this page. An unthreaded link
    is visually indistinguishable from a pre-threading row, because the wrapper renders its root
    through the same card with the same inputs. There is no home-local card.
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
    feed instead shows the muted `feed-empty` (`data-testid="feed-empty"`, "No links today yet.") styled
    like the line list's empty state (the retry banner replaces both when the read errored). Below
    the today feed sits a collapsed **Last Week** section: its header button
    (`data-testid="last-week-toggle"`, `[attr.aria-expanded]`) reads `Last Week (N)` from
    `store.lastWeekTotalCount()`, the chevron rotates when open, and the panel is closed by
    default so its content only mounts on first expand. Expanded, it lists the same feed links over
    the **last 7 calendar days including today** (backend `lastWeekOnly`), bucketed by local
    calendar day (`data-testid="last-week-day-group"`, headings Today / Yesterday / `EEE, d MMM`),
    with a skeleton (`data-testid="last-week-skeleton"`) and an empty state
    (`data-testid="last-week-empty"`, "No links in the last week.") and its own `Load More`
    (`data-testid="last-week-load-more"`) pulling 20-link day-aligned pages (the page may exceed 20
    to finish a day). The
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
    `HomeStore`), `feed-day-groups.util.ts` (the Last Week section's local-calendar day bucketing),
    `line-status-sheet.service.ts` (sheet controller), `line-status-metrics.util.ts`
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
  - `LinkThreadComponent` (the shared insiden `app-link-thread`, the feed's row wrapper):
    `link = input.required<LinkCardItem>()` — the thread ROOT; the feed's `FeedLink` satisfies the
    structural contract directly, and the backend nests each group's members under `threadLinks`, so
    a row is self-contained. Also `userVote = input<number | null>(null)` (the host passes
    `HomeStore.userVoteFor(link.id)`; the default is `null`, not `0`, so "not supplied" stays
    distinguishable from "the host removed my vote"), `voteValues = input<Record<string, number>>({})`
    (the store's whole overlay, forwarded to **every** card in the group because a member is votable
    and the id the host keys on is the member's own) and `editable = input(false)` (host-gated with
    `canEditLink`; members are always read-only). The card underneath is `LinkCardComponent`:
    `link = input.required<LinkCardItem>()`, `userVote = input(0)`, `editable = input(false)`.
  - `LineStatusSheetComponent.line = input<LinePulse | null>(null)` (the host's pulse entry;
    `LineStatusSheetService.lineId()` is the fallback for hosts that only know the id).
- **Outputs (signals `output()`):**
  - `LinkSubmitBoxComponent.submitted = output<void>()` (after a successful submit or duplicate, so
    the host calls `HomeStore.reloadAll()`).
  - `LinkThreadComponent.voteChanged = output<{ id: string; value: number }>()` — re-emitted with the
    **voted card's** id (root or member), so the host records it against the right row through
    `HomePage.onVoteChanged` → `HomeStore.setUserVote(id, value)`; and `edit = output<LinkCardItem>()`
    (the host opens the shared link sheet in edit mode). The card underneath emits
    `voteChanged = output<{ value: number }>()` and `edit = output<LinkCardItem>()`; the wrapper
    adds the id.
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
  - `FEED_QUERY` — `publicSocialMediaLinks(first, after, status, currentServiceDayOnly,
lastWeekOnly, alignPageToDay, collapseThreads)` connection
    (`edges { node, cursor }`, `pageInfo { hasNextPage, endCursor }`, and the cursor-independent
    `totalCount`); the node selection carries both link axes — `status` (the approval state the
    shared card keys its Pending pill off) and `completed` (the console's separate "mark handled"
    flag) — plus `isAutomated` (backend `is_automated`, the provenance flag the shared card keys
    its Official chip off), `occurredAt` (the **displayed and ordering** instant: "when did this
    happen", the leading key of this feed's `-occurredAt, -id` order, day windows and keyset
    cursor; naive local wall time with no offset, backend `USE_TZ = False` — never re-formatted
    through UTC), and the thread fields `threadId` / `isThreadRoot` / `threadSize` plus a nested
    `threadLinks { … }` sub-selection. The sub-selection is exactly the field set one card renders
    (so a member binds straight to `app-link-card` with no mapping) and is typed as a member =
    `FeedLink` minus the four thread fields, so a member can never drift from the root. One document
    backs **two** resources: the today feed requests `first: FEED_PAGE_SIZE` (8), `status: "LIVE"`,
    `currentServiceDayOnly: true` — **unchanged** — so a feed row is always approved and never shows
    the Pending pill; the Last Week section requests `first: LAST_WEEK_PAGE_SIZE` (20),
    `status: "LIVE"`, `lastWeekOnly: true`, `alignPageToDay: true`. `lastWeekOnly` keeps only rows
    whose **event instant** is since 00:00 Asia/Kuala_Lumpur six days before today (computed
    backend-side so no date is ever baked into query vars — SSR TransferState needs identical vars);
    `alignPageToDay` lets a page overshoot `first` to finish the calendar day it ended on.
    `collapseThreads: true` is the **only** surface that collapses (see the store below) and it is
    a compile-time constant, so SSR and hydration compute identical variables. `HIDDEN` rows never
    reach this query at all — the backend's public-feed resolver excludes them after the optional
    `status` narrowing, so the status argument cannot resurrect one.
  - `SUBMIT_FEED_LINK_MUTATION` (`submitFeedLink(input: FeedLinkInput!)`) — returns
    `{ ok, isDuplicate, duplicateOfId, userVote, link }`. Its `link` sub-selection mirrors the node
    selection (including the thread fields) so the payload really is a `FeedLink`; the submitted
    link is **not** prepended to the feed — `link-submit-box` emits `submitted` and the page calls
    `store.reloadAll()`, which re-reads the collapsed feed.
  - `SUBMIT_LINE_STATUS_REPORT_MUTATION` (`submitLineStatusReport(input: LineStatusReportInput!)`).
  - `UPVOTE`/`DOWNVOTE`/`REMOVE_SOCIAL_MEDIA_LINK_VOTE_MUTATION` — used by the shared vote button.
  - Input types: `FeedLinkInput { url, title?, occurredAt?, lineIds?, stationIds?, status?,
delayMinutes?, notes? }` and `LineStatusReportInput { lineId, status, stationIds?, delayMinutes?,
notes? }`. `FeedLinkInput.occurredAt` is only ever sent when a caller has a value: there is no edit
    path on this query, so omitted and explicit `null` are identical server-side and omitting is the
    honest spelling.
  - Enums mirrored from the schema: `LineStatus`, `PassengerStatus`, `SocialMediaLinkStatus`.
- **Dependencies (shared services/state consumed):**
  - `graphqlResource()` (`core/graphql/graphql-client.ts`) — reactive reads (SSR TransferState +
    backoff retry); `GraphQLClient.request(query, variables?, extraHeaders?)` — mutations and the
    authenticated vote-overlay read.
  - `AuthService` (`core/auth/auth.service.ts`) — `isLoggedIn`, `login()`, `idToken()`,
    `whenReady`.
  - `PollingSource` (`core/polling/polling-source.ts`) — the shared polling beat.
  - `AssetMultiSelectComponent` (`features/insiden/asset-multi-select/`) — cross-feature reuse for
    the line-status sheet's station picker (and the advanced link form's line picker).
  - `VoteButtonComponent` (`features/insiden/vote-button/`) — reused with `targetType="link"` for
    feed voting; its `VoteValue` is `{-1, 0, 1}`.
  - `humanizeSince` (`features/spotting/data/humanize-since.util.ts`) — cross-feature relative-time
    formatting, consumed by the shared link card.
  - `faviconHostnameOf` (`features/insiden/data/social-link.util.ts`) — hostname lookup for the pulse
    card's favicon; the shared link card's `linkUrlPartsOf`
    (`features/insiden/data/link-url.util.ts`) splits URLs with insiden's `splitHttpUrl`
    (`features/insiden/data/incident-link-line.util.ts`).
  - `LinkSheetService` / `app-link-sheet` / `canEditLink` / `app-link-thread`
    (`features/insiden/**`) — the shared link create/edit flow the home feed drives (same sheet as
    /insiden and situasi) plus the shared row wrapper: the quick box's "Advanced Input" opens the
    sheet in create mode with a one-shot URL prefill (`open(context?, { url })`), the card edit pencil
    opens edit mode, and **both** feed loops (`store.feedLinks()` and each
    `lastWeekDayGroups()` group) render `<app-link-thread>` rather than `<app-link-card>`.
  - `LineStatusBadge` (`domain-ui/line-status-badge`) — the operational-status badge on each pulse
    card; Hlm `badge`/`button`/`input`/`native-select`/`sheet`/`skeleton` primitives; `ToastService`;
    `RetryBannerComponent` (via its structural `RetryableResource`).
  - `AppNavComponent` / `AppFooterComponent` (`shell/`) — page chrome.

## ⚙️ Internal State & Logic

- **`HomeStore`** (`data/home.store.ts`, `@Injectable()` provided by the route) is the single source
  of truth for page data:
  - Three `graphqlResource`s: `linesResource` (`FRONT_PAGE_LINES_QUERY`), `feedResource`
    (`FEED_QUERY` with `first: FEED_PAGE_SIZE` (8), `status: "LIVE"`, `currentServiceDayOnly: true`)
    and `lastWeekResource` (`FEED_QUERY` with `first: LAST_WEEK_PAGE_SIZE` (20), `status: "LIVE"`,
    `lastWeekOnly: true`, `alignPageToDay: true`). The constructor reads all three once so the lazy
    `httpResource` fetches on store creation. **Both link resources also spread
    `HOME_FEED_COLLAPSE_VARS = { collapseThreads: true }`** — see the threading bullet below.
  - **Thread collapsing (`HOME_FEED_COLLAPSE_VARS`)** is folded into **all four** home link reads —
    `feedResource`, `lastWeekResource`, `loadMore()` and `loadMoreLastWeek()` — and it is a
    correctness requirement, not a cosmetic grouping preference. A thread's members are not adjacent
    under `-occurredAt, -id` (an admin can group a 09:00 post with an 11:00 one, and the feed may
    return them several positions apart, possibly on different pages), so grouping a flat page
    client-side is unsound: a member can arrive with its root nowhere on the page. Collapsing pushes
    the decision to the backend, which returns roots only and nests each group's members under
    `threadLinks`. Two knock-on effects make it right rather than merely tidier — `totalCount` then
    counts the rows actually rendered, so "Showing X of Y" does not inflate behind unexpanded
    threads; and continuation pages must agree with page one, so the constant is repeated in
    `loadMore()`/`loadMoreLastWeek()` rather than inherited (a continuation is a fresh request with
    its own variables; an uncollapsed page 2 would re-list every root and render members as loose
    rows). The flag is a compile-time constant, so SSR and hydration compute identical variables and
    the TransferState payload is reused. It is the ONLY surface that collapses — `/insiden`, the
    situasi tab, per-incident cards and My Links stay flat and omit the key entirely.
  - Derived: `lines` (pulse list), `feedLinks` (first page + appended pages), `feedPageInfo`
    (appended `hasNextPage`/`endCursor` wins over the first page's), `feedTotalCount` (the appended
    page's `totalCount` wins over the first page's, else `0`); the last week mirrors
    `lastWeekLinks`/`lastWeekPageInfo`/`lastWeekTotalCount`, plus `lastWeekDayGroups`
    (`groupFeedLinksByDay` over the resident links — keyed on the **displayed** instant
    `occurredAt ?? created`, matching the feed's ordering) and `isLoadingLastWeek` (the resource's
    own pristine fetch — drives the section skeleton). `isLoading` is lines + today feed and
    `hasError` ORs in all three resources (the retry banner covers a last-week failure too).
  - Cursor pagination:
    `appendedEdges`/`appendedHasNext`/`appendedTotalCount`/`nextCursor`/`loadingMore` signals;
    `loadMore()` re-issues `FEED_QUERY` through `GraphQLClient.request` with the last cursor and
    appends, coalesced by `loadingMore`. The last week has its own mirror set
    (`lastWeekAppended*`, `lastWeekNextCursor`, `lastWeekLoadingMore`) driven by
    `loadMoreLastWeek()` (same `lastWeekOnly`/`alignPageToDay`/`collapseThreads` vars + cursor,
    exposed as `isLoadingMoreLastWeek`).
  - Polling: a public `new PollingSource(() => this.reloadLines())`, armed by `start()` and
    disarmed by `stop()` (both no-ops on the server, 30s default). `reloadLines()` reloads the
    lines resource **only** and bumps `linesRefreshTick` — the feed is deliberately left alone so
    a poll can't drop the user's appended Load More pages. `reloadAll()` drops both appended-page
    sets and reloads all three resources for the submit/edit flows. The public beat is what
    the page's countdown renders (`intervalMs()`/`secondsRemaining()`) and what
    `refreshNow()` drives; `linesRefreshTick` travels page → list → card → the open accordion's
    chart/reports.
  - **Authenticated `userVote` overlay:** `graphqlResource()` sends no auth token, so the feed's
    `userVote` is always `0`. When logged in, `loadVoteOverlay()` awaits `auth.whenReady`, then
    issues **two** reads in `Promise.allSettled` — the today feed's first page and the last-week
    first page, both with `GraphQLClient.request(..., { "firebase-auth-key": idToken })` — and
    records every non-zero vote from either into a **public** `userVotes`
    (`_userVotes.asReadonly()`), which the page binds straight into every `app-link-thread`'s
    `voteValues`. The store stays the single source of truth for optimistic votes: the overlay is
    per-id (a thread renders the root **and** its members, and a member is votable, so one number
    per row would be wrong), and an absent id means "no opinion", not `0`. `userVoteFor(linkId)`
    prefers the overlay, then the anonymous feed value, then `0`; `setUserVote(linkId, value)` records
    a vote after a successful mutation, against the id the wrapper reported.
    ⚠️ INVARIANT — each overlay read is **the same query with the same variables as the resource it
    mirrors**, minus only the auth header: same window (`currentServiceDayOnly` on the today read,
    `lastWeekOnly` + `alignPageToDay` on the last-week read), same `first`, same `collapseThreads`.
    The auth key is the ONLY difference, and that is what makes the overlay's id set equal the
    rendered set. The loop then walks `threadLinks` as well as the roots, because a collapsed read
    nests every votable id under a root. Drop a window flag here — or uncollapse the read, or walk
    `edges` alone — and the overlay silently loses rows: `LinkThreadComponent.voteFor` falls back to
    `link.userVote ?? 0`, which for `graphqlResource` data is always the **anonymous** zero, so a
    rider's own upvote renders un-pressed with no error anywhere. A wider window is harmless (an
    unused id costs nothing), a _different_ window is not. `allSettled`, not `all`: if one read
    fails the other's votes must still land (each failure is already surfaced by `GraphQLClient`).
- **`LineStatusSheetService`** (`data/line-status-sheet.service.ts`) — the cross-component sheet
  controller: `isOpen` + `lineId` signals, `openFor(lineId)` (sets both), `setOpen(open)`.
  `LinePulseCardComponent` calls `openFor`; the sheet reads `isOpen`/`lineId`.
- **`HomePage`** — `sheetLine` computes the `LinePulse` for `lineStatusSheet.lineId()` from
  `store.lines()`; `errorResource` is a minimal `RetryableResource` adapter over `store.reloadAll()`
  (no countdown). `start()` in the constructor, `stop()` in `ngOnDestroy`. The feed renders
  `store.feedLinks()` in full (no reveal slice; `loadMore()` only pulls the next page); below it
  `_lastWeekExpanded` (a `signal(false)`) drives the collapsed Last Week section and
  `canLoadMoreLastWeek` (`computed`) gates its Load More (`loadMoreLastWeek()`) on
  `lastWeekPageInfo().hasNextPage` while neither the first page nor a continuation is loading. The
  line panel's countdown row mirrors the store's polling beat.
- **`LinkThreadComponent`** (shared insiden `app-link-thread`) — the feed's row element. `members`
  is `link().threadLinks ?? []`, `totalCount` prefers the backend's `threadSize` (already
  `1 + publicly-visible members`, so it counts the root) and falls back to
  `members().length + 1` for a host that selected only the members. The affordance is gated on
  `members().length > 0` — **not** on `isThreadRoot`, because the backend defines a root as
  `thread == null`, which is also true of every ordinary unthreaded link, so that gate would put a
  "1 links" badge on every row in the app. `expanded = signal(false)` — **collapsed by default**,
  the same pattern and reasoning as `app-link-list`'s "Pending (N)" section: a group stays out of
  the way until a rider asks for it. `toggleLabel` names the ACTION for screen readers
  ("Show/Hide the other N link(s) in this thread") alongside `aria-expanded`, and the visible
  `data-testid="link-thread-size"` text carries the count as readable text, not a bare icon.
  `voteFor(link)` is the per-card fallback chain `voteValues[id]` → the root's scalar `userVote`
  (root only) → `link.userVote ?? 0` — identical to `app-link-list`, so a link can move between a
  flat list and a thread without changing how its vote renders. Depth is 1 by model invariant, so
  members render with no thread UI of their own and there is no recursion. The **root is rendered
  through the same `app-link-card` with the same inputs as a plain list row** — no wrapper class, no
  bold, no badge, no size change — which is a product decision, not an oversight: the first link of
  a group is just the first thing a rider sees, and styling it differently would grow a second
  visual hierarchy. The affordance sits BESIDE the card in its own `flex flex-col` row; members
  render in a `border-l pl-3` indented column. SSR-safe: no browser APIs.
- **`HomePage.onVoteChanged({ id, value })`** — records a vote against the **voted card's** id,
  which `app-link-thread` reports; hard-coding the root's id (as the old flat loop could, because it
  knew the row) would file a member's vote under the group.
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
- **`LinkSubmitBoxComponent`** is a two-mode quick submit. Logged in it renders a Signal Forms
  `model`/`linkForm` (URL required) and two buttons in one responsive row (`flex-col` on mobile,
  `sm:flex-row` from `sm` up): **Submit Link** (`type=submit`) sends only
  `{ input: { url: normalizeFeedUrl(url) } }` through `submitFeedLink`; **Advanced Input**
  (`data-testid="advanced-input"`, `type=button`) calls
  `linkSheet.open(undefined, { url: trimmed || undefined })`, opening the shared sheet in create
  mode with whatever is already typed as a one-shot prefill (the sheet's fuller form adds title +
  asset tags). Local state is just `duplicateOfId`, `isSubmitting` and `submitError` (inline
  `[data-testid="feed-submit-error"]`, set for a rejected or unreachable submit). The URL input is
  `type="text"` + `inputmode="url"` and `normalizeFeedUrl` scheme-qualifies the value at submit
  time — native `type="url"` silently rejected schemeless input before the handler ran. On a
  duplicate response it stores `duplicateOfId` (used for the `#feed-link-<id>` anchor) and records
  the backend's auto-upvote via `store.setUserVote`. On a fresh submit it toasts success; either
  outcome resets the form and emits `submitted` so the host reloads.
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
  (`nickname || shortId || ""`), `occurredAt` + `occurredLabel`, and `voteValue`, which narrows the
  store's plain number into the shared vote button's `VoteValue`. **Two time axes:** the card
  _displays_ `occurredAt` — "when did this happen", the instant a rider cares about and the column
  every feed/queue orders on — falling back to `created` ("when was it reported") through
  `occurredAt = computed(() => link().occurredAt ?? link().created)`. That fallback is load-bearing:
  `occurredAt` is optional on `LinkCardItem` because it is selected per document, and `strict`/
  `strictNullChecks` are OFF, so a host that forgot the field would otherwise render nothing at all.
  The `data-testid="link-created"` span is deliberately **not** renamed with the field — it is the
  stable DOM hook host specs assert on — but its _value_ is now the event time. The tooltip's
  absolute stamp follows the same instant, and `submittedAt` adds a second line
  (`data-testid="link-submitted"`, "Submitted MMM d, y HH:mm") **only when the two parsed instants
  differ**; both absent or both equal → no second line. Comparison is by `Date.getTime()`, not by
  string, because the backend serialises microseconds and `created` may arrive without a fractional
  part. The meta rail stretches to the row height so the relative timestamp bottom-aligns with the
  tag row (or the title row when the card has no tags) instead of claiming a footer row, and holds
  the vote control plus the edit pencil (both OUTSIDE the navigational `<a>`). Its tag row carries
  two independent chips: the Pending pill, driven by the link's approval `status`
  (`PENDING_APPROVAL`), never by the separate `completed` handled flag, and the **Official** chip,
  driven by the link's `isAutomated` provenance flag (only the home feed's `FEED_QUERY` selects it
  today, so the insiden and situasi hosts show no chip rather than a wrong one). No thread UI lives
  in the card — that belongs to the `app-link-thread` wrapper, so every other surface of this shared
  card stays byte-for-byte a flat list.
- **`HomePage`** — feed edit wiring: `canEdit(link)` calls `canEditLink` with the host's
  `isLoggedIn`/`isAdmin`/`user.uid` over `AuthService`; `openEdit(link)` calls
  `LinkSheetService.openEdit(link)`; the page hosts `<app-link-sheet>` and an effect on the sheet's
  open→closed edge calls `store.reloadAll()`.
- Pure logic lives outside the components: `feed-url.util.ts`
  (`normalizeFeedUrl`), `feed-day-groups.util.ts` (`groupFeedLinksByDay`, the Last Week section's
  local-calendar day buckets/labels, keyed on `link.occurredAt ?? link.created` so a day header can
  never name a different day than the timestamp on the card under it), `passenger-status.util.ts`
  (`PASSENGER_LABEL`/`PASSENGER_VARIANT` lookup tables, `passengerLabel` null → `"No data"`,
  `passengerVariant` null → `"neutral"`), `status-info.util.ts` (the
  `passengerScale`/`vehicleStatusRows` and info/legend/breakdown row builders) and
  `line-status-metrics.util.ts` (`PASSENGER_METRIC`/`passengerMetric`).

## 🧩 Extension Points & Hooks

- **`home.queries.ts`** is the single GraphQL contract seam — new fields/queries/mutations are
  additive documents plus matching interfaces, keeping query strings out of components (mirrors
  `insiden.queries.ts`/`spotting.queries.ts`).
- **`HomeStore`** centralizes the page's data lifecycle: the polling beat (`PollingSource`), cursor
  pagination (today feed + last week), `reloadAll()`, and the authenticated `userVote` overlay. New
  derived views belong here as `computed()`s over the resources rather than in components. A new
  _read_ of the feed connection must be copied from the resource it mirrors, not sketched:
  `HOME_FEED_COLLAPSE_VARS` goes into all four list reads **and** into both vote-overlay reads,
  which additionally carry the auth header and nothing else — the overlay is only complete if its
  window, page size and collapse match the rendered one (see Internal State).
- **`LineStatusSheetService`** is the cross-component trigger seam: any future card or page can open
  the report sheet with `openFor(lineId)` without wiring the sheet itself.
- **`passenger-status.util.ts`** lookup tables are the label/variant seam — a new `PassengerStatus`
  value is a one-line addition per table (the sheet's chips and the submit box's select both derive
  their options from `Object.keys(PASSENGER_LABEL)`, so they stay in sync automatically).
- **`feed-url.util.ts` (`normalizeFeedUrl`)** is the submit-time URL normalizer seam — a new scheme
  rule is a one-function change with its own spec. URL _presentation_ (domain/path split) lives in
  insiden's `link-url.util.ts` (`linkUrlPartsOf`), shared by the one link card every surface uses.
- **`app-link-thread` (`LinkThreadComponent`)** is the named extension point for any new grouped row:
  it takes the same structural `LinkCardItem` the card takes, so a new host binds a `FeedLink`, a
  `PublicSocialMediaLink` or a hand-built fixture straight in. Its state (`expanded`) is internal and
  collapsed by default; a host that wants threads open, or wants to force one open, adds an input
  rather than re-deriving the toggle. The affordance gate is `threadLinks.length > 0` and the count
  comes from the component's own `totalCount` (the backend's `threadSize`, falling back to
  `members().length + 1`), so a host cannot accidentally re-decide either. That count is phrased by
  the SHARED `link-thread-selection.util.ts` `threadLabel` — `groupLabel` is its only pluralisation
  and both the visible "N links" text and the toggle's `aria-label` read it, exactly like the console
  chip and the profile badge; see the `app-link-thread` entry in `insiden.md` for why one helper
  serves a table row that must be able to say `""` and a wrapper whose minimum is 2.
  Do **not** "improve" the root's presentation: rendering it through the same `app-link-card` with
  the same inputs (byte-identical DOM to a plain row) is a product decision — a future change that
  bolds, badges or resizes the root would grow a second visual hierarchy in the feed for no gain.
- **`link-occurred-at.util.ts` (`isoToOccurredAtInput` / `occurredAtInputToIso`)** is the shared
  datetime-local ↔ API conversion seam for the link feature (link form, console edit sheet, and any
  future surface that hydrates a `datetime-local` from `occurredAt`). It is Angular-free and
  spec-covered in isolation. Its contract: offset-free in and out, never `toISOString()` on a naive
  wall-time field (that shifts it 8 hours), and a value that does not match the control's shape is
  passed through unchanged rather than mapped to `null` — because `null` on the update path is a
  destructive "reset to submission time", so guessing there would turn a typo into silent data loss.
- **`link-thread-selection.util.ts`** (`toggleSelection`, `areAllSelected`, `canGroup`,
  `selectedWithin`, `threadLabel`) is the shared selection-mechanics seam for any future grouping
  surface — the console triage table and "My Submitted Links" both read it, so their behaviour
  cannot drift. Every function is total, Angular-free and returns a NEW array (the results are fed
  straight back into a signal, where an in-place mutation is invisible to change detection).
- **`feed-day-groups.util.ts` (`groupFeedLinksByDay`)** is the Last Week section's day-bucketing
  seam — a new relative-day label or a different grouping key is a pure function change with its own
  spec. It is deliberately LOCAL-calendar (the backend's naive Asia/Kuala_Lumpur timestamps), unlike
  insiden's UTC `link-day-group.util`; an unparsable date falls into a headerless `""` group. The
  bucket key is the **displayed** instant (`occurredAt ?? created`) so a header always agrees with
  the timestamp on the card under it and with the `-occurredAt, -id` order the rows arrive in.
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

- **Feed filters + a real permalink.** The today feed is scoped to the current service day (with a
  collapsed last-week list below it) but otherwise unfiltered, and the only deep link is the in-page
  `#feed-link-<id>` anchor the duplicate indicator
  already emits. **Ready to implement, purely additive:** a line/status filter signal folded into
  the feed request (or client-side over the resident page), plus a per-link route/fragment that
  scrolls to and highlights a row, since the anchor id already exists for every row.
- **Extend the `userVote` overlay past the first page.** Today `loadVoteOverlay()` reads only the
  first page of the today feed (8) and of the last-week resource (20), so a logged-in user's own
  vote on an appended page renders as `0` until they vote again. **Ready now:** either re-run the
  authenticated read with the appended cursors, or batch the appended links' ids into one
  authenticated query when `loadMore()`/`loadMoreLastWeek()` resolves.
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
