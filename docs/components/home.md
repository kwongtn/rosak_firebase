# Component: home

## 📌 Purpose & Scope

- **Core Responsibility:** The community front page and the app's landing route (root `""`). It
  composes three things: a login-gated box that submits a community link, a global rolling **feed**
  of approved links (with voting), and a per-line **pulse** list showing each line's live
  operational + passenger status alongside the social entries behind it. Tapping a line's pulse card
  opens a **line-status bottom sheet** for a link-less live report (status, optional delay/notes,
  affected stations). It also hosts the spotting feature's **"Add a Spotting Entry" sheet**, opened
  via `ReportSheetService.openFor(lineId)` from a line card and pre-scoped to that line. It replaces
  the old default-route redirect to `/spotting`. One fixed-cadence refresh beat (30s) keeps the whole
  page current — line statuses, the Today feed and the Last Week first page — and its countdown /
  manual click are the same action.
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
    through the shared insiden `app-link-thread` (`LinkThreadComponent`) — the **recursive**
    conversation wrapper around `app-link-card`, and the only link-row element in this page. An
    ungrouped link is visually indistinguishable from a pre-threading row, because the wrapper renders
    its root through the same card with the same inputs; a conversation adds exactly one thing, the
    card's own in-rail "N links" + chevron, and expanding it reveals each level indented beneath the
    one above. There is no home-local card.
  - `hero/` — `home-hero.component.ts` (selector `app-home-hero`): the page's full-width headline
    strip ABOVE the `home-panels` grid. It renders the plain-language headline (with an
    `app-info-popover` whose `content` is
    `renderMethodologyCopy(metricDoc("network.lines-normal").definition)`), the disruption callout
    naming the worst line, four stat tiles (lines normal · needs attention · reports now · links
    today) and an **intent-based** CTA row — Report a delay · Spot a train · Share a link · Live map
    (`routerLink="/tracker"`). It reads **nothing**: `lines = input.required<LinePulse[]>()` and
    `linksToday = input(0)` are bound by `HomePage` from `store.lines()` and
    `store.feedTotalCount()`, both already in flight, so the hero adds **zero** network reads.
    Wiring: Spot a train → `ReportSheetService.open()`, Share a link → `LinkSheetService.open()`,
    Live map → the router, and **Report a delay emits `reportDelay`**, which
    `HomePage.scrollToLineBoard()` answers by scrolling to `data-testid="line-board"` (the chooser
    itself belongs to the board, not to a full-width summary strip).
  - `line-pulse/` — `line-pulse-card.component.ts` (one line's live status plus the expand/collapse
    toggle), `line-pulse-list.component.ts` (skeletons / empty state / the list),
    `line-status-chart.component.ts` (the expanded hourly report strip),
    `line-status-reports.component.ts` (the expanded report list), and
    `status-info-chip.component.ts` (the hover/tap info popover shared by the card's chips — a thin
    wrapper over the shared `app-info-popover` that passes `showIcon=false` (the projected badge is
    the trigger) and forwards `showMethodologyLink`; `status-info-chip.server.spec.ts` renders it
    through the real server path to guard SSR/hydration).
  - `line-status/` — `line-status-sheet.component.ts` (the mobile report sheet).
  - `refresh-control/` — `home-refresh-control.component.ts` (the single source of the fixed-cadence
    refresh row: countdown spinner, the **Updating** state (up while ANY non-initial refresh is in
    flight), the click-armed transient "Updated" confirmation and the `Click to Refresh Now`
    tooltip). Rendered TWICE by the page — the countdown
    drives the whole-page beat, so it heads whichever section the reader is actually looking at: the
    links section below `lg`, the line panel from `lg` up. The two instances are gated with **CSS
    only** (`lg:hidden` / `hidden lg:block`), never a `matchMedia` placement signal, so SSR and
    hydration emit identical markup; the `data-testid`s are therefore duplicated in the DOM (two
    `line-refresh-countdown` buttons, exactly one visible) and specs must scope to a section. The
    trigger **shrink-wraps to the row it draws** (`:host { display: inline-block }`, no `w-full`), so
    the tap target is the spinner + label the reader can see and not an invisible full-width strip;
    right-edge alignment is the host's `flex justify-end` gate doing that work, not the control.
  - `home.page.ts` additionally hosts the spotting feature's `ReportFormComponent` in a second
    `hlm-sheet` (reused as-is — no form built here); the line seed travels through
    `ReportSheetService.openFor(lineId)`. The page's desktop layout is a two-panel split: the
    retry banner and footer stay full width, while the feed and the line-status
    sections share `data-testid="home-panels"` (`flex flex-col gap-6 lg:grid lg:grid-cols-2
lg:items-start`) — stacked on mobile, URL feed left / line statuses right from `lg` up. In the
    stacked layout the line section draws its **own divider** (`border-border border-t pt-6
lg:border-t-0 lg:pt-0`): the rule is what separates the two sections below `lg`, and both halves
    are dropped from `lg`, where a border between two grid columns would only draw a line down the
    middle of the gap. The submit box heads the feed column (full width on mobile, column-wide from
    `lg` up, ahead of
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
    the **last 7 calendar days, with today excluded** (backend `lastWeekOnly`; the newest day group
    is therefore always "Yesterday" — see the window note below), bucketed by local calendar day
    (`data-testid="last-week-day-group"`, headings Today / Yesterday / `EEE, d MMM`), with a
    skeleton (`data-testid="last-week-skeleton"`) and an empty state
    (`data-testid="last-week-empty"`, "No links in the last week.") and its own `Load More`
    (`data-testid="last-week-load-more"`) pulling 20-link day-aligned pages (the page may exceed 20
    to finish a day). The refresh row is the fixed-cadence control, and it covers BOTH sections:
    the 30s beat and a click both go through the same `HomeStore.reloadFirstPages()`, re-reading
    the line statuses, the Today feed's first page and the Last Week first page. Rendered by
    `HomeRefreshControlComponent` as the `<button data-testid="line-refresh-countdown">` — spinner +
    `Refreshing in {n}s` from the store's public `polling.secondsRemaining()`, and a click calling
    `store.polling.refreshNow()`. Hovering it (or tapping it when the device has no hover —
    capability is measured with `(hover: hover) and (pointer: fine)`, the same
    `StatusInfoChipComponent` pattern) reveals a `Click to Refresh Now` tooltip
    (`data-testid="line-refresh-tooltip"`). A click reads as **three** states, in this order:
    **Updating** (`data-testid="line-refresh-updating"`, `role="status"`) → a transient GREEN
    **Updated** confirmation (`data-testid="line-refresh-confirmation"`, `role="status"`,
    `text-green-600 dark:text-green-400` on both the tick and the label, ~2s) → the countdown again.
    Only the FIRST of the three is not click-gated: "Updating" tracks `HomeStore.isRefreshing`, so
    it is up while ANY non-initial refresh is in flight — a click, the 30s beat, any other reload —
    and its one exclusion is the **pristine initial load** (a first paint is not a refresh), derived
    from `isLoading() || isLoadingLastWeek()`. "Updated" stays **click-armed**: it appears only once
    a clicked request settles **without an error**, so a reader watching the beat is never told
    "just refreshed" on a timer they did not set. There is no separate `Refresh now` button any
    more, and the trigger is only as wide as the row it draws. Deliberately no interval picker
    (unlike situasi), the 30s cadence is fixed.
    ⚠️ Already-loaded `Load More` pages are **never** dropped by that refresh — a 30-second reset of
    the appended pages would wipe the reader's place in a long feed — which is why the beat calls
    `reloadFirstPages()` and not `reloadAll()`; `reloadAll()` (full reset) stays with the submit box,
    the sheets and the retry banner.
  - `data/` — `home.queries.ts` (GraphQL documents + types), `home.store.ts` (the route-scoped
    `HomeStore`), `feed-day-groups.util.ts` (the Last Week section's local-calendar day bucketing),
    `line-status-sheet.service.ts` (sheet controller), `line-status-metrics.util.ts`
    (per-status plain-language copy), `status-info.util.ts` (popover/legend/breakdown row builders), `network-summary.util.ts` (the
    pure board roll-up: severity tables, the needs-attention rule, the comparator, the headline and
    the worst-line callout), and the pure `passenger-status.util.ts` (labels/variants +
    `PASSENGER_SEVERITY_RANK`, no components).

## 🔌 Interface & Data Flow

- **Route:** `""` in `src/app/app.routes.ts` — `loadComponent: HomePage` with
  `providers: [HomeStore, LineStatusSheetService, SpottingLinesStore]`. Route-scoped rather than root
  singletons, but 🔴 **the route injector — and therefore `HomeStore` — OUTLIVES a visit**: the router
  retains it while `HomePage` is recreated on every navigation to `""`, so a return to `/` is handed
  the SAME store, not a new one. The page's lifecycle edges are consequently asymmetric:
  `HomePage.ngOnDestroy` calls `store.stop()` (pauses the beat, `polling.setIntervalMs(null)`) and the
  next page's constructor calls `store.start()` (resumes it at the last cadence **and** revalidates the
  first pages). Anything a `destroy` disarms must be re-armed by the next `start`, because it is not
  a fresh store — see the polling bullet below. `SpottingLinesStore` is the spotting feature's
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
  - `LinkThreadComponent` (the shared insiden `app-link-thread`, the feed's row wrapper — **recursive**,
    it renders its own children as nested threads at every depth):
    `link = input.required<LinkCardItem>()` — the node this instance renders; the feed's `FeedLink`
    satisfies the structural contract directly, and the backend nests each conversation's descendants
    under `sublinks`, so a row is self-contained. Also `userVote = input<number | null>(null)` (the
    host passes `HomeStore.userVoteFor(link.id)`; the default is `null`, not `0`, so "not supplied"
    stays distinguishable from "the host removed my vote" — and it is **not** forwarded to nested
    levels, because it is unkeyed and a child would apply the root's number to itself),
    `voteValues = input<Record<string, number>>({})` (the store's whole overlay, forwarded to
    **every** card at **every** depth because a sublink is votable too and the id the host keys on is
    that link's own) and `editable = input(false)` (host-gated with `canEditLink`; forwarded to every
    descendant, so a sublink is editable too — see the superseded rationale in `insiden.md`). The card
    underneath is `LinkCardComponent`: `link = input.required<LinkCardItem>()`, `userVote = input(0)`,
    `editable = input(false)`, plus the conversation inputs `sublinkCount = input(0)` and
    `sublinksExpanded = input(false)` and the `sublinkToggle` output.
  - `LineStatusSheetComponent.line = input<LinePulse | null>(null)` (the host's pulse entry;
    `LineStatusSheetService.lineId()` is the fallback for hosts that only know the id).
- **Outputs (signals `output()`):**
  - `LinkSubmitBoxComponent.submitted = output<void>()` (after a successful submit or duplicate, so
    the host calls `HomeStore.reloadAll()`).
  - `LinkThreadComponent.voteChanged = output<{ id: string; value: number }>()` — re-emitted with the
    **voted card's** id (root, sublink, or any deeper descendant), so the host records it against the
    right row through `HomePage.onVoteChanged` → `HomeStore.setUserVote(id, value)`; and
    `edit = output<LinkCardItem>()` carrying the **clicked descendant's own** item (the host opens the
    shared link sheet in edit mode, so a wrong object would edit the wrong link). The card underneath
    emits `voteChanged = output<{ value: number }>()`, `edit = output<LinkCardItem>()` and
    `sublinkToggle = output<void>()`; the wrapper adds the id and re-emits the item unchanged.
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
    through UTC), and the conversation fields `parentId` / `isThreadRoot` / `sublinkCount` plus a
    nested `sublinks { … }` sub-selection, itself **nested four levels deep**. Details that matter:
    - The old names (`threadId` / `threadSize` / `threadLinks`) are **gone server-side with no alias**,
      so a stale spelling is a hard "Unknown field" on the whole query — not a degraded response.
    - All four are **required on `FeedLink`** (unlike on the structural `LinkCardItem`, where they are
      optional for the flat hosts): this document selects all four at every level, and with
      `strict`/`strictNullChecks` OFF an optional field here would be a hole the compiler could not
      report.
    - `isThreadRoot` is a **root marker** (`parentId == null`, which is also true of every ordinary
      ungrouped link), so it may not decide whether to draw an expand affordance. `sublinkCount` is a
      node's OWN publicly-visible descendants **at any depth** — to size a conversation read the
      ROOT's count, and never sum the column (that double-counts by exactly the depth).
    - Each sublink level selects exactly what a card renders for a **child**: the root's fields minus
      `normalizedUrl` (nothing renders it). `created` is selected at every level even though it is not
      displayed, because `LinkCardItem` **requires** it (a child without it renders a blank time), and
      the three tree scalars are selected at every level so a nested conversation can itself expand.
    - The types are an intersection chain over `Omit<FeedLink, "normalizedUrl" | "sublinks">`, so a
      level can never drift from its parent — `FeedLinkSublink`, `…Level2`, `…Level3`, `…Level4`. The
      document writes out **four** `sublinks` blocks while the type stops at level 3: the server's
      `MAX_THREAD_DEPTH = 3` counts a root as depth 0, so a level-4 node is never materialised (it
      would answer `[]`) and declaring a `sublinks` key it never receives would be a small lie. The
      extra block is deliberate — it makes the nesting a number a reader can check against the server
      constant, and raising the cap later needs no document change.
      One document
      backs **two** resources: the today feed requests `first: FEED_PAGE_SIZE` (8), `status: "LIVE"`,
      `currentServiceDayOnly: true` — **unchanged** — so a feed row is always approved and never shows
      the Pending pill; the Last Week section requests `first: LAST_WEEK_PAGE_SIZE` (20),
      `status: "LIVE"`, `lastWeekOnly: true`, `alignPageToDay: true`. `lastWeekOnly` keeps only rows
      whose **event instant** is since 00:00 Asia/Kuala_Lumpur six days before today AND before 00:00
      today — i.e. the 7-day window with **today excluded**, because the backend's
      `displayTodayInLastWeek` argument defaults to `false` (computed backend-side so no date is ever
      baked into query vars — SSR TransferState needs identical vars; and, deliberately, **not** sent
      from here, so a frontend that deploys before the backend still gets the right window instead of
      asking a variable an older schema rejects). The Today feed already carries the current service
      day, so a "Today" group in this section is always a duplicate of it.
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
  - `UPVOTE_SOCIAL_MEDIA_LINK_MUTATION` / `DOWNVOTE_SOCIAL_MEDIA_LINK_MUTATION` /
    `REMOVE_SOCIAL_MEDIA_LINK_VOTE_MUTATION` — used by the shared vote button. Each selects
    `{ ok userVote voteScore upvotes downvotes }`: the mutation acknowledges with the vote state
    the write produced, and the button repaints from that instead of projecting the score itself
    (see the vote-button note below).
  - Input types: `FeedLinkInput { url, title?, occurredAt?, lineIds?, stationIds?, status?,
delayMinutes?, notes? }` and `LineStatusReportInput { lineId, status, stationIds?, delayMinutes?,
notes? }`. `FeedLinkInput.occurredAt` is only ever sent when a caller has a value: there is no edit
    path on this query, so omitted and explicit `null` are identical server-side and omitting is the
    honest spelling.
  - Enums mirrored from the schema: `LineStatus`, `PassengerStatus`, `SocialMediaLinkStatus`.
- **Dependencies (shared services/state consumed):**
  - `graphqlResource()` (`core/graphql/graphql-client.ts`) — reactive reads (SSR TransferState +
    backoff retry); the returned `isFetching` (raw in-flight, true across reloads and retries —
    unlike the pristine-only `isLoading`) is what backs `HomeStore.isRefreshing` and the refresh
    control's confirmation; `GraphQLClient.request(query, variables?, extraHeaders?)` — mutations and
    the authenticated vote-overlay read.
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
  - **Conversation collapsing (`HOME_FEED_COLLAPSE_VARS`)** is folded into **all four** home link list
    reads — `feedResource`, `lastWeekResource`, `loadMore()` and `loadMoreLastWeek()` — **and** into
    both authenticated vote-overlay reads inside `loadVoteOverlay()` (see the overlay bullet below),
    so the coverage is **all six reads of this connection**. It is a correctness requirement, not a
    cosmetic grouping preference. A conversation's descendants are not adjacent under
    `-occurredAt, -id` (an admin can nest a 09:00 post under an 11:00 one, and the feed may return
    them several positions apart, possibly on different pages), so grouping a flat page client-side is
    unsound: a sublink can arrive with its root nowhere on the page. Collapsing pushes the decision to
    the backend, which returns **roots only** and nests each one's whole subtree under `sublinks`.
    Three knock-on effects make it right rather than merely tidier — `totalCount` counts the roots the
    page actually renders, so "Showing X of Y" does not inflate behind unexpanded conversations;
    continuation pages must agree with page one, so the constant is repeated in
    `loadMore()`/`loadMoreLastWeek()` rather than inherited (a continuation is a fresh request with
    its own variables; an uncollapsed page 2 would re-list every root and render sublinks as loose
    rows); and the overlay can only be complete if it asks for the same shape (below). The flag is a
    compile-time constant, so SSR and hydration compute identical variables and the TransferState
    payload is reused. It is the ONLY surface that collapses — `/insiden`, the situasi tab, the
    per-incident cards and My Links stay flat and omit the key entirely.
  - Derived: `lines` (pulse list), `feedLinks` (first page + appended pages, de-duplicated by
    `node.id` — see the ⚠️ below), `feedPageInfo`
    (appended `hasNextPage`/`endCursor` wins over the first page's), `feedTotalCount` (the appended
    page's `totalCount` wins over the first page's, else `0`); the last week mirrors
    `lastWeekLinks`/`lastWeekPageInfo`/`lastWeekTotalCount`, plus `lastWeekDayGroups`
    (`groupFeedLinksByDay` over the resident links — keyed on the **displayed** instant
    `occurredAt ?? created`, matching the feed's ordering) and `isLoadingLastWeek` (the resource's
    own pristine fetch — drives the section skeleton). `isLoading` is lines + today feed and
    `hasError` ORs in all three resources (the retry banner covers a last-week failure too);
    `isRefreshing` ORs in all three resources' **`isFetching`** — the raw in-flight flag, which
    unlike `isLoading` is observable for every reload — and is what the refresh control watches to
    know a refresh actually started and finished. Its ONE consumer-side exclusion is the pristine
    first fetch: the control ANDs the two loading flags (`isLoading() || isLoadingLastWeek()`), and
    because both are pristine-only that exclusion can never fire again after the first load.
    ⚠️ `edges`/`lastWeekEdges` de-duplicate by `edge.node.id` on merge, first occurrence wins. That
    is a correctness requirement, not tidiness: `reloadFirstPages()` refetches page one while leaving
    the appended pages in place, and an admin edit or deletion between the two reads can shift a row
    out of page one and into a position the appended pages already cover. A duplicate id would throw
    on the page's `@for (link of …; track link.id)`.
  - Cursor pagination:
    `appendedEdges`/`appendedHasNext`/`appendedTotalCount`/`nextCursor`/`loadingMore` signals;
    `loadMore()` re-issues `FEED_QUERY` through `GraphQLClient.request` with the last cursor and
    appends, coalesced by `loadingMore`. The last week has its own mirror set
    (`lastWeekAppended*`, `lastWeekNextCursor`, `lastWeekLoadingMore`) driven by
    `loadMoreLastWeek()` (same `lastWeekOnly`/`alignPageToDay`/`collapseThreads` vars + cursor,
    exposed as `isLoadingMoreLastWeek`).
  - Polling: a public `new PollingSource(() => this.reloadFirstPages())`, 30s default.
    🔴 `start()`/`stop()` are **not** a symmetric pair, because the store outlives the page component
    (see Route above): `stop()` disarms with `polling.setIntervalMs(null)`, and `start()` is a no-op on
    the server **and** on a first mount (the `PollingSource` constructor schedules the beat; the three
    constructor reads are the initial fetch). Only on a **re-entry** — `polling.intervalMs() === null`
    on a retained store — does it act, calling `polling.resume()` (the ONLY exit from the paused `null`;
    `resume()` re-arms at the last named cadence, or the 30s default if none was named) **and**
    `reloadFirstPages()`, so the returning reader gets both a live countdown and fresh first pages
    instead of the previous visit's rows. 🔴 Never spell that resume as
    `polling.setIntervalMs(polling.intervalMs())`: that re-applies the paused `null` and leaves the beat
    permanently dead — the control's `@if (intervalMs() !== null)` then renders _nothing_ at all, which
    is exactly how the refresh row disappeared for the rest of the session (fixed, `7221ff6`; the
    rule is recorded in `MISTAKES.md`).
    `reloadFirstPages()` re-reads page one of **all three** resources and bumps `linesRefreshTick` —
    the beat covers the whole page (line statuses + Today feed + Last Week), because on mobile the
    countdown heads the links section and would otherwise be lying about what it refreshes — but it
    touches **no** appended-page signal, so a poll can never drop the reader's Load More progress. `reloadAll()` (full reset of both
    appended-page sets + all three resources) stays with the submit box, the sheets and the retry
    banner. The public beat is what the control's countdown renders
    (`intervalMs()`/`secondsRemaining()`) and what `refreshNow()` drives, so the automatic tick and
    the manual click cannot diverge; `linesRefreshTick` travels page → list → card → the open accordion's
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
    ⚠️ INVARIANT — **the overlay's read set must EQUAL the set of ids the page RENDERS**, and that
    is **two independent requirements**, each of which has shipped broken on its own:
    1. **THE READ.** Each overlay read is **the same query with the same variables as the resource it
       mirrors**, minus only the auth header: same window (`currentServiceDayOnly` on the today read,
       `lastWeekOnly` + `alignPageToDay` on the last-week read), same `first`, same
       `collapseThreads`. The auth key is the ONLY difference. `home.store.spec.ts` captures both
       resources' variable objects and compares them **structurally** to the two overlay reads'
       variables, so an added or removed key is red. A _wider_ window is harmless (an unused id costs
       nothing), a _different_ one is not.
    2. **THE WALK.** The read is collapsed, so `edges` alone holds only the ROOTS. Every node below a
       root is rendered and votable, so the walk **recurses through `sublinks` at every depth**
       (`recordSubtreeVotes`) — with no depth limit and no `MAX_THREAD_DEPTH` mirror. A version that
       walked the roots plus ONE level shipped and left every deeper node reading as the anonymous
       `0`, with no error and no failed request anywhere: the reads were correctly collapsed and
       window-matched, and the bug was purely the loop's depth.

    Break either half and a rider's own vote renders as if they had never cast it, because
    `LinkThreadComponent.voteFor` falls back to `link.userVote ?? 0` and for `graphqlResource` data
    `userVote` is ALWAYS the anonymous zero. Do not "simplify" the walk back to `edges`, do not stop
    it at one level, and do not drop a window flag. `allSettled`, not `all`: if one read fails the
    other's votes must still land (each failure is already surfaced by `GraphQLClient`).
- **`LineStatusSheetService`** (`data/line-status-sheet.service.ts`) — the cross-component sheet
  controller: `isOpen` + `lineId` signals, `openFor(lineId)` (sets both), `setOpen(open)`.
  `LinePulseCardComponent` calls `openFor`; the sheet reads `isOpen`/`lineId`.
- **`HomePage`** — `sheetLine` computes the `LinePulse` for `lineStatusSheet.lineId()` from
  `store.lines()`; `errorResource` is a minimal `RetryableResource` adapter over `store.reloadAll()`
  (no countdown). `start()` in the constructor, `stop()` in `ngOnDestroy` — which is a **pause**, not a
  teardown: the route injector keeps this `HomeStore` alive across visits, so the next page's `start()`
  resumes the beat and revalidates (the store bullet above has the `null`-vs-cadence rule). The feed
  renders `store.feedLinks()` in full (no reveal slice; `loadMore()` only pulls the next page); below
  it `_lastWeekExpanded` (a `signal(false)`) drives the collapsed Last Week section and
  `canLoadMoreLastWeek` (`computed`) gates its Load More (`loadMoreLastWeek()`) on
  `lastWeekPageInfo().hasNextPage` while neither the first page nor a continuation is loading. The
  page itself holds no refresh state at all: it composes two `app-home-refresh-control` instances
  (links section below `lg`, line panel from `lg` up, each behind a CSS visibility class) and the
  countdown, tooltip, "Updating" label and transient "Updated" confirmation all live in that
  component.
- **`LinkThreadComponent`** (shared insiden `app-link-thread`) — the feed's row element, and
  **recursive**: it renders one `app-link-card` for its node, then, when expanded, one nested
  `app-link-thread` per child in a `border-l pl-3` indented container. `children` is
  `link().sublinks ?? []` (direct children, stored sibling `position` order) and the count it hands
  the card is `link().sublinkCount ?? 0`. The **card** decides whether to draw the affordance, gating
  on `sublinkCount > 0` — **not** on `isThreadRoot`, because the backend defines a root as
  `parentId == null`, which is also true of every ordinary ungrouped link, so that gate would put a
  "1 links" chip on every row in the app. `expanded = signal(false)` — **collapsed by default, per
  level and independently** (one signal per component instance), the same pattern and reasoning as
  `app-link-list`'s "Pending (N)" section: a conversation stays out of the way until a rider asks for
  it. The card's chip carries `aria-expanded`, an action-naming `aria-label` ("Show/Hide the other
  links in this thread (N links)") and the count as **readable text** in
  `data-testid="link-thread-size"`, not a bare icon.
  `voteFor(link)` is the per-card fallback chain `voteValues[id]` → the root's scalar `userVote`
  (**this node only**) → `link.userVote ?? 0` — identical to `app-link-list`, so a link can move
  between a flat list and a conversation without changing how its vote renders. 🔴 The scalar
  `userVote` is **not** forwarded to nested levels (it is unkeyed, so a child would apply the root's
  number to itself); the keyed `voteValues` map is. 🔴 `editable` **is** forwarded to every level and
  `edit` re-emits the clicked descendant's own `LinkCardItem` — see the superseded rationale in
  `insiden.md` — which means the home page's root-derived `canEditLink(root)` also paints a pencil on
  a sublink somebody else submitted (a cosmetic over-permission the backend rejects on write).
  Nothing in the wrapper knows the server's `MAX_THREAD_DEPTH`: the read side is bounded by what the
  query fetched, so a deeper selection just answers `[]`. The **root is rendered through the same
  `app-link-card` with the same inputs as a plain list row** — no wrapper class, no bold, no badge, no
  size change — which is a product decision, not an oversight: the first link of a conversation is
  just the first thing a rider sees, and styling it differently would grow a second visual hierarchy.
  The only legitimate difference is the one rail chip, which the card itself owns. SSR-safe: no
  browser APIs.
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
  asset tags). Local state is just `duplicateOfId`, `isSubmitting`, `submitError` (inline
  `[data-testid="feed-submit-error"]`, set for a rejected or unreachable submit) and
  `submitAttempted`. The URL input is
  `type="text"` + `inputmode="url"` and `normalizeFeedUrl` scheme-qualifies the value at submit
  time — native `type="url"` silently rejected schemeless input before the handler ran. On a
  duplicate response it stores `duplicateOfId` (used for the `#feed-link-<id>` anchor) and records
  the backend's auto-upvote via `store.setUserVote`. On a fresh submit it toasts success; either
  outcome resets the form and emits `submitted` so the host reloads.
  **Validation is submit-gated, and blur stays quiet.** The "Enter a URL" note and the input's
  destructive border + `aria-invalid` are driven by `submitAttempted` — set first thing in
  `submit()`, cleared by `_reset()` — and not by the form field's `touched()`. `FormField` marks a
  field touched on blur, so `touched()` cannot tell "typed here and left" from "actually pressed
  Submit", and nagging on blur is not wanted; both entry points (the button and the
  `(keydown.enter)` shortcut) route through `submit()`, so one flag covers them. The flag reaches
  the border/`aria-invalid` through `HlmInput`'s optional `errorVisible` input, which **overrides**
  `touched` as the visibility gate when supplied and leaves every other consumer's behaviour
  untouched when it is `undefined`.
  ⚠️ The `<form>` is **`novalidate`**, and that is load-bearing rather than cosmetic: `FormField`
  reflects the schema's `required` onto the DOM as a native `required` attribute, and a
  constraint-invalid `<form>` without `novalidate` aborts submission **before** the `submit` event
  ever fires — the native bubble would show and this component's own inline note could never render,
  in a real browser and in jsdom alike. Turning native validation off leaves exactly one error
  surface.
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
  the vote control and the edit pencil, both OUTSIDE the navigational `<a>`. The `<a>` itself is a
  **stretched overlay** (`absolute inset-0`) across the left column rather than a wrapper: the
  visible body and the tag row are `pointer-events-none` layers above it, so a click on the title
  or on any chip still opens the link, while the conversation toggle — a sibling of the anchor,
  hit-testing restored with `pointer-events-auto` — expands instead of navigating. Its tag row
  carries
  two independent chips: the Pending pill, driven by the link's approval `status`
  (`PENDING_APPROVAL`), never by the separate `completed` handled flag, and the **Official** chip,
  driven by the link's `isAutomated` provenance flag (only the home feed's `FEED_QUERY` selects it
  today, so the insiden and situasi hosts show no chip rather than a wrong one).
  The **conversation affordance lives here** (it moved out of the wrapper with the nested-thread
  work, then out of the right rail into the chip row): a chevron + readable "N links" button in the
  **tag row beside Pending/Official**, gated on the `sublinkCount` **input** being `> 0` and labelled
  `threadLabel(sublinkCount() + 1)`. On this surface the wrapper always passes the real count, so a
  conversation gets a chip and a lone link does not — and because the gate is the input and never
  `link.sublinkCount`, the flat hosts (whose nodes _do_ carry a real count) still render no chip.
  Sitting in the tag row is what the stretched-link anchor bought: the row is now a SIBLING of the
  anchor, so the `<button>` is valid HTML and its click expands rather than navigating.
- **`HomePage`** — feed edit wiring: `canEdit(link)` calls `canEditLink` with the host's
  `isLoggedIn`/`isAdmin`/`user.uid` over `AuthService`; `openEdit(link)` calls
  `LinkSheetService.openEdit(link)`; the page hosts `<app-link-sheet>` and an effect on the sheet's
  open→closed edge calls `store.reloadAll()`. ⚠️ `canEdit` is evaluated on the thread **root** and the
  resulting single boolean is forwarded to every level, so a conversation also paints a pencil on a
  sublink somebody else submitted. That is a cosmetic over-permission only — the backend re-checks
  permission on the target link and rejects the write. Per-level authorship would need a predicate
  input on `app-link-thread`, which no host asks for today.
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
- **`app-link-thread` (`LinkThreadComponent`)** is the named extension point for any new grouped row,
  and it is **recursive** (it renders its own children as nested threads, so a host gets arbitrary
  depth for free — see the `app-link-thread` entry in `insiden.md` for the full contract, the
  self-reference, and the card-owns-the-chip / wrapper-owns-the-state split). It takes the same
  structural `LinkCardItem` the card takes, so a new host binds a `FeedLink`, a
  `PublicSocialMediaLink` or a hand-built fixture straight in. Its `expanded` state is internal,
  collapsed by default **per level**; a host that wants conversations open, or wants one specific one
  open, adds an input rather than re-deriving the toggle. The affordance gate is `sublinkCount > 0`,
  decided by the **card** on its own `sublinkCount` input, and the count is phrased by the SHARED
  `link-thread-selection.util.ts` `threadLabel` — the card's `conversationLabel` is its only
  pluralisation, and both the visible "N links" text and the toggle's `aria-label` read that one
  computed, exactly like the console chip and the profile badge. 🔴 `threadLabel` takes a
  **conversation size**, so the `+ 1` in `threadLabel(sublinkCount() + 1)` is load-bearing: passing the
  raw count silently deletes the chip on a root with exactly ONE sublink.
  Do **not** "improve" the root's presentation: rendering it through the same `app-link-card` with
  the same inputs (byte-identical DOM to a plain row apart from the one rail chip) is a product
  decision — a future change that bolds, badges or resizes the root would grow a second visual
  hierarchy in the feed for no gain.
- **`link-occurred-at.util.ts` (`isoToOccurredAtInput` / `occurredAtInputToIso`)** is the shared
  datetime-local ↔ API conversion seam for the link feature (link form, console edit sheet, and any
  future surface that hydrates a `datetime-local` from `occurredAt`). It is Angular-free and
  spec-covered in isolation. Its contract: offset-free in and out, never `toISOString()` on a naive
  wall-time field (that shifts it 8 hours), and a value that does not match the control's shape is
  passed through unchanged rather than mapped to `null` — because `null` on the update path is a
  destructive "reset to submission time", so guessing there would turn a typo into silent data loss.
- **`link-thread-selection.util.ts`** (`toggleSelection`, `areAllSelected`, `canGroup`, `canNest`,
  `selectedWithin`, `threadLabel`) is the shared selection-mechanics seam for any future grouping
  surface — the console triage table, "My Submitted Links" **and** the shared `app-link-card` all
  read it, so their behaviour cannot drift. Every function is total, Angular-free and returns a NEW
  array (the results are fed straight back into a signal, where an in-place mutation is invisible to
  change detection). `canGroup` (≥ 2 distinct ids) and `canNest` (≥ 1) are deliberately separate: the
  same `groupSocialMediaLinks` mutation is a no-op on one link without a target and a real re-parent
  with one.
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
  next page; `refreshTick` is the seam for propagating the poll beat's line half into an open
  accordion.
- **`refresh-control/home-refresh-control.component.ts`** is the single source of the refresh
  affordance and the seam for any future host of it: it takes no inputs, injects `HomeStore` itself,
  and is rendered twice with a CSS visibility class rather than a JS breakpoint probe. Keep it that
  way — a second copy of this markup (or a `matchMedia`-driven placement) would either duplicate the
  confirmation state machine or desync SSR from hydration. It is also the reference for "how do I
  react to a RELOAD completing": `graphqlResource.isLoading` is pristine-only, so the control latches
  on `HomeStore.isRefreshing()` going true and CONFIRMS on it settling false with `!hasError()`.
  🔴 **The `Updating` label tracks `isRefreshing`, NOT the click** — so the beat's own refreshes say
  "Updating" too (`35b8c08`), and the **pristine initial load is the only exclusion**, derived from
  the two pristine-first-fetch-only flags (`isLoading() || isLoadingLastWeek()`). The **"Updated"
  confirmation is still click-armed**, because a passive reader must never be told "just refreshed"
  on a 30s timer they did not set. Both instances of the control show the label (they share the
  store's one beat; only one is visible per breakpoint) while each arms the confirmation off its own
  click alone. The click-arm machinery therefore still belongs to the **confirmation**, and a click's
  arm still has to be torn down on **both** exits out of an armed window — the settle edge (placed
  _before_ the
  `hasError` early-return, so an errored refresh still drops the label) and the stale-arm expiry
  (`ARM_EXPIRY_MS`, the only exit for a click whose request never started). Clearing one edge only
  is how a no-op click ends up saying "Updating" for the rest of the session. The Updating branch is
  also the **first** template branch on purpose: `refreshNow()` resets the beat, so if the countdown
  branch won, an in-flight click would flash a freshly-reset "Refreshing in 30s". A future host that
  wants its own refresh affordance must answer the same three states in the same order.
  🔴 The Updating spinner carries `reverse` **inside** the `animation` shorthand
  (`style="animation: spin 3s linear infinite reverse"`), not only on the
  `[animation-direction:reverse]` class: an inline shorthand resets every animation sub-property, so
  the class alone is dead markup. jsdom computes no styles, so this cannot be caught by a spec — it
  was found in a real browser, and the spec pins the string. The countdown's own 1s spinner still
  carries the class-only form and must not be "fixed": its behaviour (clockwise 1s) is intended.
- **The trigger is not a row, so it must not be styled like one.** The control shrink-wraps to its
  visible content (`:host { display: inline-block }`, no `w-full` on the button) and each host gate
  is a `flex justify-end` wrapper, which is what parks it at the right edge. Putting `w-full` or a
  block host back makes the tap target an invisible full-width strip again.
- **`network-summary.util.ts` (`summarizeNetwork`)** is the one place the board's rule lives, and it
  is **pure** — no Angular, no requests. Three exported values make the rule legible instead of
  implicit: `LINE_STATUS_SEVERITY_RANK` (a **total order**, deliberately NOT the backend enum's:
  `TOTAL_DISRUPTION` 6 > `PARTIAL_DISRUPTION` 5 > `PARTIAL_ACTIVE` 4 > `DEFUNCT` 3 > `TESTING` 2 >
  ACTIVE 0, because DEFUNCT/TESTING are settled, un-actionable facts and must not outrank a line
  that is only partly running), `NEEDS_ATTENTION_PASSENGER_RANK` (= `PASSENGER_SEVERITY_RANK.DELAYED`,
  5), and `lineNeedsAttention` (`status !== "ACTIVE" || passengerSeverity >= that rank`). 🔴 The
  threshold is `DELAYED` and not `CROWDED` on purpose: crowding reports describe one carriage, not
  the service, and counting them would leave the headline reading "0 of 16 lines running normally"
  on any busy evening. `compareLineSeverity` compares the operational axis **first** and the
  passenger axis second (never sums them — a line that will not run outranks one that merely runs
  badly), with `code` as the final tiebreak so the order is total and two boards with the same data
  render identically. `summarizeNetwork` returns `{ total, normalCount, needsAttentionLines,
needsAttentionCount, worstLine, headline, callout, reportsNow }`; an empty read yields
  `headline: "No live line data yet"` rather than the misleading "0 of 0 lines running normally", and
  `reportsNow` sums each line's `statusReportCount` (over its OWN rolling `statusWindowMinutes`),
  which is why the tile says "reports now" rather than claiming a distinct-report count. 🔴
  **`PASSENGER_SEVERITY_RANK` mirrors the backend `PassengerStatus` enum order** (NORMAL 0 … DISRUPTED 6) — the schema exposes the enum in declaration order, so a higher rank IS a more severe status.
  Do not "tidy" the numbers into a preferred order (DELAYED before CROWDED, say): they are the
  server's order made numeric, and a backend reorder would make every consumer wrong at once.
- **`LinePulseListComponent` is now ONE worst-first list, not two buckets.** The previous shape led
  with every ACTIVE line and folded everything else into a collapsed "Other lines" `<details>`
  (testids `other-lines` / `other-lines-summary`, both **retired**). That hid the two deadest lines
  behind a summary the reader has to open, so a page whose hero just said "3 lines need attention"
  led with a column of lines that are fine. Rows are now `sortLinesBySeverity(lines())` under a
  `data-testid="line-board-attention-heading"` caption (`Needs attention · N`) that counts with the
  hero's OWN `lineNeedsAttention` predicate — so the caption, the hero's tile and the row order can
  never disagree about which lines need attention. Each row wraps its card in
  `data-testid="line-board-row"`, the stable hook for order assertions.
- **`LinePulseCardComponent`'s action hierarchy** is deliberate: two buttons, one primary and one
  secondary — **Report status** (`submit-line-status`, default variant) and **Log spotting**
  (`add-spotting-entry`, `outline`). Both testids and both class sets are unchanged; only the visible
  copy moved off the internal nouns ("Submit line status" / "Add spotting entry"). Everything else
  lives in a kebab: `line-card-menu` (the trigger; `aria-expanded`, `aria-haspopup="menu"`, an
  action-naming `aria-label`) opening `line-card-menu-panel` (`role="menu"`) with three
  `role="menuitem"` children — `line-card-pin` (through `PreferencesService`), `line-card-hq`
  (`/spotting/<lineId>`) and `line-card-hq-details` (`/spotting/<lineId>/details`). The panel closes
  on Escape, on an outside click and on choosing an item; host-level `document:` listeners do the
  first two, and `src/app/ui/` has **no dropdown/menu primitive** to reuse, so it is built inline
  against the contract `app-info-popover` established — a real primitive can replace it without a
  behaviour change. Icons (`lucideEllipsisVertical` / `lucidePin` / `lucideExternalLink`) come from
  `@ng-icons/lucide` through `NgIcon` + `provideIcons`, the FIRST usage of that library in `src/`
  (previously zero); the existing chevron SVGs stay as they are. The card also draws the line's
  `displayColor` as a leading accent rail (a backend hex, so it needs no dark-mode twin) and calls
  `PreferencesService.pushRecentLine()` on the panel's **open** edge.
- **`PreferencesService`** (`core/preferences/preferences.service.ts`, `providedIn: "root"`) is the
  reader-owned display state the board needs — `pinnedLineIds`, `viewMode` (`"rider" | "pro"`),
  `density`, `lastReportedLineId`, `recentLineIds` — persisted under the **versioned** key
  `rosak:preferences:v1` (the `:v1` is the migration seam: a shape change bumps it, so a stale
  payload is orphaned rather than half-read). API: `isPinned(lineId)`, `togglePin`, `setViewMode`,
  `setDensity`, `setLastReportedLine`, `pushRecentLine` (most-recent-first, de-duplicated, capped at
  `MAX_RECENT_LINES` = 5), `reset()`, `snapshot()` and `hydrated()`. 🔴 **Its constructor never reads
  storage.** It builds on the defaults and hydrates inside `afterNextRender`, which does not run on
  the server: a constructor read would make the client's first paint disagree with the server's HTML
  and throw an `NG0500` hydration mismatch for any rider who had pinned anything. The persist
  `effect` is gated on `hydrated()` for the same reason from the other direction — an ungated effect
  fires on its first run, BEFORE the read, and would overwrite real preferences with the defaults
  they are about to inherit. Every stored field is validated **independently** (corrupt JSON, a
  non-object payload, an unknown enum value and a wrong-typed id each fall back on their own),
  because a half-recognisable payload is the common case, not an edge case.
- **`query-param.util.ts`** (`core/url-state/`) is the shared read/write seam for URL-owned view
  state (`?view=`, `?sort=`, `?line=`, `?q=`). The READ half is pure over a `ParamMap`-shaped
  record (`parseEnumQueryParam`, `parseTextQueryParam`, `readEnumQueryParam`,
  `readTextQueryParam`), the WRITE half is one browser-gated `navigate()`
  (`writeQueryParams(router, route, patch, isBrowser)`). Two rules both callers inherit instead of
  re-deriving: **a default value never appears in the URL** (`queryParamForWrite(value, default)` →
  `null`, so "no query params" and "the default view" are one state) and **writes merge and
  replace, never push**. 🔴 The `isBrowser` flag is a parameter rather than an internal
  `isPlatformBrowser` check because reading `PLATFORM_ID` needs an injection context a plain
  function should not have; a _reactive_ `router.navigate()` during SSR hangs the render, exactly as
  `line-overview.page.ts`'s sort write-back documents.
- **`feed-empty` is now an invitation.** The old copy ("No links today yet.") stated a fact and left
  the reader to work out what to do about it, which is how a page whose job is community reports ends
  up reporting nothing. It now reads "No links yet today — be the first" with a `feed-empty-cta`
  button that opens the same shared sheet the hero's "Share a link" does, so the page keeps exactly
  ONE link-submission surface. The `feed-empty` testid and its dashed/muted shell (matching the
  line-list empty state) are unchanged.
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
- **A dedicated route `title` and share metadata.** ✅ The `title` and `<meta name="description">`
  landed with the network board's Phase 0 (`title: "MLPTF | Live Network Board"` on the `""` route;
  `Meta.updateTag` in `HomePage`, so the tag is in the SSR HTML). Still missing: open-graph /
  Twitter card tags and a per-route share image.
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
