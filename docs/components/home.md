# Component: home

## 📌 Purpose & Scope

- **Core Responsibility:** The community front page and the app's landing route (root `""`). It
  composes three things: a login-gated box that submits a community link, a global rolling **feed**
  of approved links (with voting), and the **network board** — a per-line status panel grouped the
  way a reader reads it (`Needs attention` as full pulse cards, then `My lines` and `All lines` as
  compact rows) showing each line's live operational + passenger status, how much to trust it, and the
  social entries behind it. Tapping a line's report button opens a **line-status bottom sheet** for a
  link-less live report (status, optional delay/notes, affected stations). It also hosts the spotting
  feature's **"Add a Spotting Entry" sheet**, opened
  via `ReportSheetService.openFor(lineId)` from a line card and pre-scoped to that line. 🔴 **Every
  submission on the page goes through ONE chooser** (`app-report-chooser`): five intent tiles (Delay /
  crowding · Stopped · Spot a train · Share a link · Report an incident) and, for the three line-based
  intents, a line picker ordered pinned → recent → severity. It is triggered by the hero's "Report a
  delay" and by the sticky **mobile action bar** (`Report` · `Refresh` · `Live map`, `lg:hidden`), so
  no intent is reachable on desktop and unreachable on a phone. After a successful status or spotting
  report the affected line's `#line-<id>` anchor is scrolled into view and briefly ringed. One
  fixed-cadence refresh beat (30s) keeps the whole page current — line statuses, the Today feed and
  the Last Week first page — and its countdown / manual click are the same action.
- **Domain/Layer:** Angular Presentation (standalone, lazy-loaded routed feature, route-scoped
  providers). It reads and mutates the Django/Strawberry GraphQL backend; Firebase Auth gates every
  submit and vote. It has no Firestore involvement.
- **Subcomponent breakdown** (one routed page, three child groups, a route-scoped store):
  - `home.page.ts` — the routed page: nav → a two-panel **network-board-first** split (board left /
    feed right from `lg` up, board above feed when stacked) → footer, plus the status sheet and the
    shared link sheet (feed-link edits); starts/stops the store's polling and adapts the store to
    the shared retry banner. Inside the feed column the submit box heads a **Today / Last Week tab
    set** (`role="tablist"`), each period a `role="tabpanel"`.
  - `feed/` — `link-submit-box.component.ts` (the login-gated submit affordance: a quick URL-only
    form plus an "Advanced Input" button that opens the shared link sheet) and
    `feed-url.util.ts` (`normalizeFeedUrl`, submit-time scheme qualification). Feed rows render
    through the shared insiden `app-link-thread` (`LinkThreadComponent`) — the **recursive**
    conversation wrapper around `app-link-card`, and the only link-row element in this page. An
    ungrouped link is visually indistinguishable from a pre-threading row, because the wrapper renders
    its root through the same card with the same inputs; a conversation adds exactly one thing, the
    card's own in-rail "N links" + chevron, and expanding it reveals each level indented beneath the
    one above. There is no home-local card.
  - `hero/` — `network-sparkline.component.ts` (selector `app-network-sparkline`: 24 bars, one per
    service-day hour, tall by how many rider reports the WHOLE network received in that hour and
    coloured by the status that dominated it; `network-sparkline` / `-bars` / `-popover` /
    `sparkline-bar`, one `role="img"` sentence instead of 24 announced bars) and
    `home-hero.component.ts` (selector `app-home-hero`): the page's full-width headline
    strip ABOVE the `home-panels` grid. It renders the plain-language headline (with an
    `app-info-popover` whose `content` is
    `renderMethodologyCopy(metricDoc("network.lines-normal").definition)`), the disruption callout
    naming the worst line, four stat tiles (lines normal · needs attention · reports now · links
    today) and an **intent-based** CTA row — Report a delay · Spot a train · Share a link · Live map
    (`routerLink="/tracker"`). It reads **no request of its own**: `lines = input.required<LinePulse[]>()` and
    `linksToday = input(0)` are bound by `HomePage` from `store.lines()` and
    `store.feedTotalCount()`, both already in flight, so the hero adds **zero** network reads. Two
    decorative/detail additions sit on top of the Phase 0 shape: the network's own **colour ribbon**
    (`hero-ribbon`, one flex segment per line's `displayColor` along the bottom edge, `aria-hidden` and
    hidden when there are no lines — a fingerprint of the read, not information; a blank colour is
    DROPPED so a line without one cannot leave a hole), and the **official-update callout**
    (`hero-official-callout` / `hero-official-badge` / `hero-official-link`), which appears **above**
    the disruption callout when — and only when — the SAME worst line `summarizeNetwork` already
    names has an `isAutomated` pulse link. It shows that post's title and links the ORIGINAL with
    `target="_blank" rel="noopener noreferrer"` and the words "Open original": a community page
    quoting an operator must never look like the operator said it here. Scoping it to the worst line
    is what keeps it from contradicting the sentence underneath. The hero also hosts the page's
    **live refresh indicator** (`app-home-refresh-control`, `hidden lg:flex`) — see the
    refresh-control bullet.
    Wiring: Spot a train → `ReportSheetService.open()`, Share a link → `LinkSheetService.open()`,
    Live map → the router, and **Report a delay → `ReportChooserService.open()`** (root-provided, the
    sheet is hosted by the page). 🔴 The hero is a pure trigger: it does not decide which line, and
    the `reportDelay` output + `HomePage.scrollToLineBoard()` it used to emit were **removed** in
    Phase 2 — the CTA answers a question a reader on a platform cannot (they do not know a line id),
    so scrolling them to the board to find one was the wrong affordance.
  - `line-pulse/` — `network-board.component.ts` (the three-group board: skeleton rows / empty state /
    the controls row / `Needs attention` cards / `My lines` + `All lines` rows),
    `line-pulse-row.component.ts` (one compact line row + its lazy expanded panel),
    `line-history-strip.component.ts` (`app-line-history-strip`: the row's own 24-cell service-day
    strip — `row-history-strip` / `-popover` / `-cell` / `-label` — drawn ABOVE the disclosure and
    served by the store's ONE per-line read, so sixteen rows cost one request),
    `line-pulse-card.component.ts` (one line's full live status plus the expand/collapse
    toggle), `line-status-chart.component.ts` (the expanded hourly report strip),
    `line-status-reports.component.ts` (the expanded report list + the per-station strip), and
    `status-info-chip.component.ts` (the hover/tap info popover shared by the card's and the row's
    chips — a thin
    wrapper over the shared `app-info-popover` that passes `showIcon=false` (the projected badge is
    the trigger) and forwards `showMethodologyLink`; `status-info-chip.server.spec.ts` renders it
    through the real server path to guard SSR/hydration).
    🔴 `line-pulse-list.component.ts` (and its spec) was **DELETED** with the board: it was one
    worst-first list, which is exactly the shape the board replaces. Nothing references it any more.
  - `pro/` — 🔴 **the Pro bento dashboard (Phase 4)**: `pro-dashboard.component.ts` (`app-pro-dashboard`)
    plus its five widgets — `pro-lines-widget.component.ts` (`app-pro-lines-widget`: three Pro-only
    filters + the reused `app-network-board` + the CSV export), `pro-feed-widget.component.ts`
    (`app-pro-feed-widget`: the rider feed's reading surface + line/provenance/search filters),
    `network-heat-strip.component.ts` (its own cell), `pro-incidents-widget.component.ts`
    (`app-pro-incidents-widget`: the ongoing-incident list) and `pro-line-hq-widget.component.ts`
    (`app-pro-line-hq-widget`: per-line `/spotting/:id` + `/details` links). See the "Pro dashboard"
    bullet below for the layout, the shortcuts, the filter contract and the incidents decision.
    `network-heat-strip.component.ts` (selector `app-network-heat-strip`): the **Pro**
    heat grid — one row per line, one column per service-day hour, colour = the status that dominated
    that line-hour and opacity = how many reports it was (`network-heat-strip` / `-popover` /
    `heat-row` / `heat-row-code` / `heat-row-total` / `heat-cell` / `heat-legend` / `heat-scale`).
    Hand-rolled `<div>`s: this repo has no charting dependency, and the colour vocabulary is the same
    `PASSENGER_BAR_CLASS` the expanded card's chart uses. It is mounted by `NetworkBoardComponent`
    **only when the effective view is `pro`**, and hides itself on a failed or empty read.
  - `line-status/` — `line-status-sheet.component.ts` (the mobile report sheet, now **draft-first**:
    the form and its footer render whether or not anyone is signed in; see the Internal State bullet).
  - `report/` — `report-chooser.component.ts` (`app-report-chooser`, the sheet itself) plus its three
    seams: `report-chooser.service.ts` (`ReportChooserService`, root: `isOpen` / `intent` / `open()` /
    `choose()` / `backToTiles()` / `setOpen()`), `report-chooser-order.util.ts` (the pure
    `orderChooserLines` + `filterChooserLines`) and its spec. Two steps — five intent tiles
    (`chooser-tile-delay|stopped|spot|link|incident`), then a line picker
    (`chooser-line-picker`, `chooser-line-filter`, `chooser-line-list`, `chooser-line-<id>`,
    `chooser-line-hint`, `chooser-no-match`, `chooser-empty-lines`) for the three intents that are
    about a specific line. It reads `HomeStore.lines()` and issues **no request of its own**; its only
    two step-state signals are `isOpen` + `intent`, and `intent` is cleared by `open()` and by every
    close so a stale trigger cannot resurrect a half-finished "which line?" step. 🔴 It must be
    MOUNTED FIRST among the page's sheets — see the ordering note on the chooser's own doc comment and
    the pinned spec in `home.page.spec.ts`. Dispatch: **delay** →
    `LineStatusSheetService.openFor(lineId)` with NO preset ("Delay / crowding" is two conditions and
    only the reader knows which one they saw); **stopped** → the same sheet with
    `{ presetStatus: "DISRUPTED" }`, i.e. the rider's word mapped onto the existing PassengerStatus
    rather than a ninth value; **spot** → `ReportSheetService.openFor(lineId)`; **link** →
    `LinkSheetService.open()`; **incident** → `IncidentSheetService.open()` **and then**
    `router.navigate(["/insiden"])` — the incident sheet is hosted by `/insiden`, so opening it first
    (its service is root-provided) is what makes it already open on arrival. Every line-based choice
    also calls `PreferencesService.pushRecentLine(line.id)`, and the chooser closes after dispatching
    in all five cases.
  - `refresh-control/` — `home-refresh-control.component.ts` (the single source of the fixed-cadence
    refresh row: countdown spinner, the **Updating** state (up while ANY non-initial refresh is in
    flight), the click-armed transient "Updated" confirmation and the `Click to Refresh Now`
    tooltip). Rendered **ONCE**, in the **HERO** behind `hidden lg:flex`; the page's mobile copy that
    used to head the feed column was **removed in Phase 2** and replaced by the sticky action bar's
    Refresh button, which calls the same `store.polling.refreshNow()`. One component, one beat, one
    countdown instance in the DOM (`line-refresh-countdown` is therefore no longer a duplicated
    testid), and the placement gate stays **CSS
    only** (`hidden lg:flex`), never a `matchMedia` placement signal, so SSR and
    hydration emit identical markup. 🔴 Only the WRAPPER ever moved into the hero — a second copy of
    the countdown/updating/confirmed state machine
    there would double every confirmation and desync the two instances from the one beat they share. The
    trigger **shrink-wraps to the row it draws** (`:host { display: inline-block }`, no `w-full`), so
    the tap target is the spinner + label the reader can see and not an invisible full-width strip;
    right-edge alignment is the host's `flex justify-end` gate doing that work, not the control.
  - `home.page.ts` additionally hosts the spotting feature's `ReportFormComponent` in a second
    `hlm-sheet` (reused as-is — no form built here); the line seed travels through
    `ReportSheetService.openFor(lineId)`. It hosts `app-report-chooser` as the **first** sheet in the
    template (ordering is load-bearing — see the `report/` bullet) and ends with the sticky **mobile
    action bar** (`data-testid="home-mobile-bar"`, `fixed inset-x-0 bottom-0 z-30 lg:hidden
pb-[env(safe-area-inset-bottom)]`) hosting `home-mobile-report` (the chooser),
    `home-mobile-refresh` (the SAME `store.polling.refreshNow()` the countdown's click calls — one
    beat, two affordances) and `home-mobile-map` (a `routerLink="/tracker"` anchor, because "Live map"
    must not be the one intent mobile loses). `main` grows a matching `pb-24 lg:pb-6` so the bar never
    covers the last feed row. The page's desktop layout is a two-panel split: the
    retry banner and footer stay full width, while the line-status and feed
    sections share `data-testid="home-panels"` (`flex flex-col gap-6 lg:grid lg:grid-cols-2
lg:items-start`) — 🔴 **network board left / community feed right** from `lg` up, and board ABOVE the
    feed when the two stack on mobile. 🔴 That order is **DOM order, not a CSS `order` value**:
    `lg:grid-cols-2` fills its columns in document order and the stacked mobile layout follows the
    same order, so one swap moves both layouts — an `order` value would have fixed only the desktop
    half and left a phone reading the feed first. The live network is the reason to open this page
    (the hero's headline above is about the NETWORK), so it leads. In the stacked layout the FEED
    section draws the **divider** (`border-border border-t pt-6
lg:border-t-0 lg:pt-0`): the rule is what separates the two sections below `lg`, and both halves
    are dropped from `lg`, where a border between two grid columns would only draw a line down the
    middle of the gap. The board section keeps `scroll-mt-24` because every `#line-<id>` anchor it
    renders lives inside it. The submit box heads the feed column (full width on mobile, column-wide from
    `lg` up, ahead of the tab set in DOM order), and the feed renders **every loaded link** in an uncapped `feed-scroll` container (no inner scroll —
    the page scrolls) and owns the load-more continuation: the bottom-right `feed-footer`
    (`data-testid="feed-footer"`) holds a `feed-count` span reading `Showing X of Y`
    (`store.feedLinks().length` over `HomeStore.feedTotalCount()`, so the denominator stays the
    filtered total as pages append) beside the `feed-load-more` button, both hidden while the feed
    is empty; while the first page loads the feed shows `feed-skeleton`
    (`data-testid="feed-skeleton"`, `hlmSkeleton h-24 w-full`), and an empty, settled, error-free
    feed instead shows the muted `feed-empty` (`data-testid="feed-empty"`, "No links today yet.") styled
    like the line list's empty state (the retry banner replaces both when the read errored).

    🔴 **The two periods are a TAB SET, not a disclosure.** Under the submit box sits one
    `role="tablist"` (`aria-label="Feed period"`) holding `feed-tab-today` and `feed-tab-lastweek`
    (`role="tab"`, `aria-selected`, `aria-controls`, roving `tabindex` — exactly ONE tab is in the page
    tab order) over two `role="tabpanel"`s, `feed-panel-today` and `feed-panel-lastweek`
    (🔴 the latter keeps the historical `last-week-panel` testid; each is `aria-labelledby` its own tab
    and carries `tabindex="0"` so a keyboard reader lands on the panel even where it holds no
    focusable child — the last-week empty state has none). `ArrowRight` / `ArrowLeft` step between the
    tabs and **wrap**, `Home` / `End` jump to the ends, and every other key is left alone so `Tab` can
    still leave the set; `preventDefault` fires only for the four keys the handler acts on. Selection is
    automatic (an arrow key selects AND focuses) because with two instant panels a focus-only move
    would make the reader press Enter to see the list they just asked for. 🔴 The inactive panel is
    **`hidden`, never unmounted**, so each tab's `aria-controls` always resolves and an expanded
    conversation is still expanded on the way back; the layout classes therefore live on an inner
    wrapper, since a Tailwind `display` utility on the panel itself would out-rank the stylesheet's
    `[hidden]` rule and the hidden panel would still take up space. The state is one signal,
    `HomePage.feedTab` (`"today" | "lastweek"`, default `"today"`), which **replaced** the old
    `_lastWeekExpanded` boolean: two periods of which one shows is an EXCLUSIVE choice, so one signal
    holds it, and nothing is persisted. 🔴 `last-week-count` stayed on the **tab label** (`Last Week
(N)` from `store.lastWeekTotalCount()`), where the collapsed disclosure's header used to carry it:
    a count that only appeared after switching would be one tap too late to decide with. The retired
    `last-week-toggle` button is gone. The Last Week panel lists the same feed links over
    the **last 7 calendar days, with today excluded** (backend `lastWeekOnly`; the newest day group
    is therefore always "Yesterday" — see the window note below), bucketed by local calendar day
    (`data-testid="last-week-day-group"`, headings Today / Yesterday / `EEE, d MMM`), with a
    skeleton (`data-testid="last-week-skeleton"`) and an empty state
    (`data-testid="last-week-empty"`, "No links in the last week.") and its own `Load More`
    (`data-testid="last-week-load-more"`) pulling 20-link day-aligned pages (the page may exceed 20
    to finish a day). 🔴 **Switching tabs changes presentation only** — both resources stay mounted
    and in flight, both sets of appended pages are kept, and neither read is re-issued. The refresh row is the fixed-cadence control, and it covers BOTH sections:
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
    `HomeStore`), `home-view-mode.service.ts` (the route-scoped owner of `?view=`),
    `feed-filter.util.ts` (the pure Pro feed narrowing — status provenance + free text, over the
    resident conversation roots),
    `feed-day-groups.util.ts` (the Last Week section's local-calendar day bucketing),
    `line-status-sheet.service.ts` (sheet controller), `line-status-metrics.util.ts`
    (per-status plain-language copy), `status-info.util.ts` (popover/legend/breakdown row builders), `network-summary.util.ts` (the
    pure board roll-up: severity tables, the needs-attention rule, the comparator, the headline and
    the worst-line callout), `status-confidence.util.ts` (the pure **confidence** rule: how much to
    trust a line's reported status, and the operator-post test), and the pure
    `passenger-status.util.ts` (labels/variants + `PASSENGER_SEVERITY_RANK`, no components).

## 🔌 Interface & Data Flow

- **Route:** `""` in `src/app/app.routes.ts` — `loadComponent: HomePage` with
  `providers: [HomeStore, HomeViewModeService, LineStatusSheetService, SpottingLinesStore]`.
  🔴 `HomeViewModeService` is route-scoped for the same reason as the store **and for one more**: it
  reads `ActivatedRoute`, and the ONE answer to "which view is this page in" has to be shared by the
  page (which picks between two layouts) and the board (which owns the toggle). Before Phase 4 the
  board answered that question privately and the page had no answer at all. Route-scoped rather than root
  singletons, but 🔴 **the route injector — and therefore `HomeStore` — OUTLIVES a visit**: the router
  retains it while `HomePage` is recreated on every navigation to `""`, so a return to `/` is handed
  the SAME store, not a new one. The page's lifecycle edges are consequently asymmetric:
  `HomePage.ngOnDestroy` calls `store.stop()` (pauses the beat, `polling.setIntervalMs(null)`) and the
  next page's constructor calls `store.start()` (resumes it at the last cadence **and** revalidates the
  first pages). Anything a `destroy` disarms must be re-armed by the next `start`, because it is not
  a fresh store — see the polling bullet below. `SpottingLinesStore` is the spotting feature's
  route-scoped line list, provided here too because the spotting report form is hosted on this page.
- **Hosted spotting sheet:** `<hlm-sheet data-testid="spotting-entry-sheet">` wraps
  `<app-report-form #reportFormRef (submitted)="onSpottingSubmitted($event)" />` plus a
  Clear/Cancel/Submit footer (submit testid `submit-spotting-entry`);
  `onSpottingSubmitted(lineId)` closes the sheet, calls `store.reloadAll()` and rings that line. The
  seed comes from
  `ReportSheetService.openFor(lineId)` (root-provided), which the report form consumes on its
  open edge — which is exactly why the reported line rides on the `submitted` PAYLOAD
  (`output<string | null>()`, read before the form's own `clear()`): by the time the host hears about
  the submit, the service's one-shot seed is already null.
- **Component `input()`/`input.required()` signals:**
  - `LinePulseCardComponent.line = input.required<LinePulse>()`, `refreshTick = input(0)` (the
    host's poll beat, forwarded to the expanded panel's chart and reports).
  - `LinePulseRowComponent.line = input.required<LinePulse>()`, `refreshTick = input(0)`,
    `density = input<PreferencesDensity>("comfortable")`, `viewMode = input<PreferencesViewMode>("rider")`.
    🔴 Density is PRESENTATION ONLY: it changes the row's padding and nothing else — never what is
    counted, never which actions exist, never whether a group renders.
  - `NetworkBoardComponent` has **no inputs at all**. It injects `HomeStore` for `lines()`,
    `isLoading()`, `linesRefreshTick()`, `highlightedLineId()` and its own three group views, exactly
    the way
    `HomeRefreshControlComponent` injects the store's beat. The partition RULE belongs to the store;
    passing the groups down as inputs would mean re-deriving them on the page for no gain — and the
    same is why the post-submit highlight signal lives in the store rather than being passed in.
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
  - `LineStatusSheetComponent.submitted = output<void>()` (after a successful report, the page reloads
    **and** rings the reported line — the line id comes from the service, which keeps it after the close,
    so the output stays payload-free).
  - `ReportFormComponent.submitted = output<string | null>()` (spotting; the line it filed against).
- **GraphQL documents** (`data/home.queries.ts`, single contract seam; hand-written types, no
  codegen):
  - `FRONT_PAGE_LINES_QUERY` — per-line pulse list: `id/code/displayName/displayColor/status`,
    `inServiceVehicleCount`/`totalVehicleCount`, `vehicleStatusCounts` (the per-status fleet
    breakdown), `passengerStatus`/`passengerStatusMessage` (both nullable), `statusReportCount`,
    `passengerStatusCount`/`passengerStatusCounts` (the per-category report breakdown the passenger
    chip's severity legend reads), `statusWindowMinutes` (the rolling window), and nested
    `pulseLinks` (a `SocialMediaLinkScalar` subset — including **`isAutomated`**, the backend
    provenance flag that is the ONLY thing separating "the operator announced it" from "N riders think
    so"; the board's confidence chip and the hero's official callout both read it, and
    `home.queries.spec.ts` pins the selection because a fixture can invent any field it likes).
    `NETWORK_STATUS_HISTORY_QUERY` (`networkStatusHistory(dayStartHour)`) and
    `LINES_STATUS_HISTORY_QUERY` (`linesStatusHistory(lineIds)`) back the three history widgets;
    both select the same `LineStatusHourBucket` fields as `LINE_STATUS_HISTORY_QUERY` above, and
    `home.queries.spec.ts` pins that shape field-for-field on both.
    `LINE_STATUS_HISTORY_QUERY` (hourly buckets,
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
      `lineId: $lineId` narrows the connection to links tagged with one line (the feed's line filter).
      It is declared NULLABLE and every call site **omits the key** when no line is selected, so
      "unfiltered" is the ABSENCE of the argument rather than one of two spellings — which is what
      keeps the six reads' variables structurally identical between the server render and hydration.
      `FeedQueryVars.lineId` is therefore `string | undefined` and **cannot** be written `null`: the
      overlay reads deliberately never send it, so "omitted" has to be one ownable state. The filter
      UI itself lands in a later phase; Phase 3 ships the plumbing and its specs.
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

## 🧩 The Pro dashboard (Phase 4)

`app-pro-dashboard` is the second layout `HomePage` can render, chosen by **one** signal:
`HomeViewModeService.view()` — the URL's `?view=` when it carries one, else
`PreferencesService.viewMode()`.

### The branch, and what stays outside it

```html
@if (viewMode.view() === "pro") {
<app-pro-dashboard />
} @else {
<div data-testid="home-panels">… the board + feed columns (board first) …</div>
}
```

The hero, the retry banner, the footer and **every sheet** are above and below that branch, and the
sticky mobile action bar too. A report, a link submission and a spotting entry therefore go through
exactly the same code in both views — a "mode" that quietly grew its own submission path is the one
thing this refactor exists to prevent, and `home.page.spec.ts` pins the sheet order across the branch.

### The five cells

| Cell                     | Component                  | Owns                                                                   |
| ------------------------ | -------------------------- | ---------------------------------------------------------------------- |
| Lines (large, left)      | `app-pro-lines-widget`     | three Pro-only filters, the reused `app-network-board`, the CSV export |
| Community feed           | `app-pro-feed-widget`      | line / provenance / search filters over the rider feed's rows          |
| Reports by line and hour | `app-network-heat-strip`   | nothing — a pure projection of the shared per-line read                |
| Recent incidents         | `app-pro-incidents-widget` | its own lazy incidents read                                            |
| Line HQ                  | `app-pro-line-hq-widget`   | nothing — a projection of `visibleLines()`                             |

**The board is REUSED, not reimplemented.** Every row, group, sort, density toggle, anchor and
highlight rule under the Lines widget is the component the Rider page mounts. It carries exactly one
new input, `embedHeatStrip` (default `true`), which the dashboard turns **off** because the heat grid
gets its own cell — two copies would mean two `network-heat-strip` testids and the same comparison
drawn twice. Default `true` so the Rider board's behaviour cannot change to accommodate a new layout.

**`NetworkHeatStripComponent` reads `visibleLines()`**, not `lines()`, so the grid is always the same
SET of lines the board beside it draws; its shared intensity scale is computed over those same rows.

### The filters — Pro-only, default off, reset on leaving Pro

Three board filters, all in `HomeStore`, all defaulting to "no narrowing":

- **Status** — `line.status === X` (exact).
- **Crowding at least** — `passengerSeverityRank(line.passengerStatus) >= rank(X)`, a **floor**, not
  an equality: a Pro reader asking for `DELAYED` wants "delayed or worse". The comparison mirrors
  `PASSENGER_SEVERITY_RANK` (the backend's own enum order), so a backend reorder cannot make this
  filter quietly wrong.
- **Only lines with data** — 🔴 `statusConfidence(line).level !== "none"`, i.e. **exactly the evidence
  the board's confidence chip already shows the reader**. The more obvious spelling
  (`statusReportCount > 0 || passengerStatus != null || status !== "ACTIVE"`) is wrong: `passengerStatus`
  is never null on a line that has been read, because the backend derives it and `NORMAL` is its
  "nothing notable" answer — so that version would claim data on every line and the toggle would remove
  nothing, while the chip beside it said "No recent reports". Published as the `network.has-data`
  metric doc, because it is a judgement the reader is asked to trust rather than a literal they typed.

`HomeStore.visibleLines()` is what the board draws and what its three groups **partition** — the
partition has to be taken over the same set the rows are drawn from, or a Pro filter would shrink one
group without shrinking the other two. Because every filter defaults off, `visibleLines` IS `lines()`
on a Rider view. The store's OTHER views deliberately stay on `lines()`: the hero's headline and tiles
describe the NETWORK, and the two history reads are keyed by line id.

🔴 **`ProDashboardComponent.ngOnDestroy` calls `HomeStore.resetProFilters()`**, which clears the three
board filters, the feed's provenance axis, the feed search **and** `lineFilter`, then writes `?line=`
and `?q=` back to `null`. `HomeStore` is route-scoped and its injector OUTLIVES a visit, so anything
left set is still set when the Rider board mounts — a rider board quietly missing eleven lines, and a
feed narrowed to one line, with no control on the page to explain either. The URL clear is the other
half of the same promise: without it the address bar keeps `?line=3` while the rider feed shows the
whole network, so re-entering Pro would re-apply a filter the reader visibly walked away from.

### The feed widget's three axes

- **Line** — the **backend's**, through `HomeStore.setLineFilter()`. A keyset cursor is only meaningful
  inside the query that minted it, so a client-side filter over an unfiltered page would splice
  unrelated links together the moment the reader pressed Load More. `setLineFilter` already clears
  every appended page on that edge.
- **Source (provenance)** and **Search** — **client-side**, over the resident roots, because the
  connection exposes no argument for either. Both live in the pure `filterFeedLinks`, which treats a
  conversation as ONE unit: a root is KEPT when a match is anywhere in its tree, and a kept root keeps
  its **whole** subtree. Dropping non-matching members would make the root's own "N links" chip lie and
  expanding the row would find nothing.
- 🔴 The "status" axis is **provenance**, not the link's approval state: both home feed resources
  request `status: "LIVE"`, so the approval axis is constant on this read and a control over it would
  be a filter that provably never removes anything.
- 🔴 **This widget shows Today only.** The rider feed's Last Week panel is a Rider surface and stays
  there (behind the rider feed's Today / Last Week tab set, which this widget does not render); the
  widget says `Today only` on its surface so a Pro reader searching for
  something from Tuesday is not left concluding it was never filed.

### Keyboard shortcuts (Pro only)

| Key | Action                                                                                    |
| --- | ----------------------------------------------------------------------------------------- |
| `/` | focus the feed search input                                                               |
| `r` | `store.polling.refreshNow()` — the SAME beat the refresh control and the mobile bar drive |
| `p` | back to the Rider view, through `HomeViewModeService.setView("rider")`                    |

A visible hints row (`pro-shortcuts`) names all three and adds a real **Back to rider view** button, so
the shortcuts are an accelerator and not the only way out of a mode. The rules that make them safe:

- 🔴 **Refused while the reader is typing** — inputs, textareas, selects and anything `contenteditable`.
  `r` and `p` are ordinary letters: without this a reader typing "Kelana Jaya" into the search would
  refresh on the `r` in "Kelana" and lose the rest.
- 🔴 **A modified keystroke is never a shortcut** — Ctrl/Cmd+R is reload and Cmd/Ctrl+P is print.
- The listener is on `document`, because a reader who has clicked nothing has focus on `document.body`
  and a host-level listener would never fire. It exists only while the dashboard does, which is what
  confines the whole feature to the Pro view: on a Rider page there is no listener at all.
- The search input carries a `focus-visible:ring-brand` + `ring-offset-background` ring, so focus moved
  there by the keyboard is visible in both themes.

### Widget loading / error isolation

`HomeStore.incidentsResource` follows the same arrangement as the two history reads: gated on the
widget's explicit `requestIncidentsRead()`, exposing `recentIncidents` / `incidentsFailed` /
`isLoadingIncidents`, and appearing in **neither `hasError` nor `isRefreshing`**. A Pro reader whose
incidents read fails still gets the board, the feed, the heat grid and the HQ grid.

🔴 **`recentIncidents` reads `incidentsFailed()` BEFORE `data()`, and that order is load-bearing.** A
`graphqlResource`'s `data()` THROWS while the resource is in an error state rather than returning
`undefined`, so a computed that reached for the payload on a failed read would take the page down from
inside a `computed`. The two history computeds have the same shape and their widgets gate on the
failure flag first for the same reason.

### The incidents widget — the decision and its reasoning

`calendarIncidents` is public and takes `filters` / `order`, so the widget ships. What it shows is
**ongoing incidents, newest first**, and the widget says so (`Ongoing · newest first · showing N`),
because that is exactly the set the read asks for.

- ✅ `{ OR: { ongoing: true } }` + `{ startDatetime: "DESC" }` — both **compile-time constants**
  (`HOME_RECENT_INCIDENT_VARS`, frozen). This is the deciding factor: a "last 7 days" `date.range`
  would need `new Date()`, and a client clock in query variables makes the server render and the client
  hydration compute different variables, so the SSR TransferState payload is discarded and every read
  fires twice — the same rule that makes the feed's `lastWeekOnly` a backend-computed boolean.
- ⚠️ `calendarIncidents` returns a **list, not a connection, and takes no `first`/`after`**. "Newest N"
  is therefore ORDER + a client-side slice at `PRO_INCIDENT_LIMIT` (6). That is one full payload of
  ongoing incidents per Pro reader; the document's selection is deliberately minimal (six scalars plus
  the lines) so the payload is far smaller than `/insiden`'s, which selects `details`, `medias`,
  `chronologies` and a first page of `links` per incident because its cards render them.
- The widget links out to `/insiden` rather than duplicating the calendar here.

## ⚙️ Internal State & Logic

- **`HomeStore`** (`data/home.store.ts`, `@Injectable()` provided by the route) is the single source
  of truth for page data:
  - Three `graphqlResource`s: `linesResource` (`FRONT_PAGE_LINES_QUERY`), `feedResource`
    (`FEED_QUERY` with `first: FEED_PAGE_SIZE` (8), `status: "LIVE"`, `currentServiceDayOnly: true`)
    and `lastWeekResource` (`FEED_QUERY` with `first: LAST_WEEK_PAGE_SIZE` (20), `status: "LIVE"`,
    `lastWeekOnly: true`, `alignPageToDay: true`). The constructor reads all three once so the lazy
    `httpResource` fetches on store creation. **Both link resources also spread
    `HOME_FEED_COLLAPSE_VARS = { collapseThreads: true }`** — see the threading bullet below.
  - 🔴 **The two SERVICE-DAY HISTORY reads are lazy, widget-opted-in, and deliberately ISOLATED from
    the page's error state.** `networkHistoryResource` (`NETWORK_STATUS_HISTORY_QUERY`, variables
    `{}`) and `linesHistoryResource` (`LINES_STATUS_HISTORY_QUERY`, variables
    `{ lineIds }`) both stay inert until (a) a widget calls the store's `requestHistoryReads()` and
    (b) `lines()` has data. The opt-in is **not** merely tidy — `graphqlResource` installs an effect
    that reads the underlying `httpResource`, so a gate only the projections satisfied would not defer
    the request at all; one explicit call from the surface that renders the answer is the only honest
    gate, and it is the same arrangement `LineStatusChartComponent`'s `expanded` input uses.
    `linesStatusHistory` is capped at `HISTORY_LINE_ID_CAP` (64, the backend's own limit) at the
    variable, so a board that grew past it cannot take the read down. Projections: `networkHistory()`,
    `linesHistoryFor(lineId)` (one O(1) map lookup per rendered row) plus `networkHistoryFailed` /
    `linesHistoryFailed`. 🔴 **Neither resource feeds `hasError`, `isLoading`, `isLoadingLastWeek` or
    `isRefreshing`** — those four drive the page-level retry banner, the board skeleton and the
    refresh control's "Updating" label, so folding a decorative chart into them would replace a whole
    working page with one banner. A failed history read hides ITS widget and nothing else; an empty
    answer hides it too, because `[]` is the backend's "nothing reported this service day", not an
    error. `reloadAll()` re-reads both (submit / report / retry is a full invalidation); the 30 s beat
    deliberately does not — a chart that redraws every 30 seconds is noise.
  - 🔴 **The feed's LINE FILTER** (`lineFilter` signal + `setLineFilter()`) derives from ONE signal,
    so a filtered list can never be drawn beside an unfiltered denominator or continued by a cursor
    from the wrong query: the two resources, both `loadMore*` continuations and — deliberately NOT —
    the two overlay reads all read it. `setLineFilter` **clears every appended page for both feeds**:
    a cursor is only meaningful inside the query that minted it, and keeping the appended rows would
    leave the previous filter's links on screen beside the new one's. The 30 s beat, which does not
    change the filter, still preserves Load More progress. An empty string is `null`; re-selecting the
    current filter is a no-op.
  - **The board's derived views — a PARTITION, not three filters.** `networkSummary` (`summarizeNetwork`
    over the one lines read), `attentionLines`, `myLines`, `allLines`, and the `boardSort` signal
    (`"severity" | "name"`, default `severity`, `DEFAULT_BOARD_SORT`/`BOARD_SORTS` exported for the
    URL's own parse, `setBoardSort()` a no-op for an unrecognised value). 🔴 **Every line appears in
    EXACTLY ONE of the three groups**, and that is achieved by ONE decision applied in one order:
    **attention membership always wins** — a line needing attention sits in `attentionLines` even when
    it is PINNED, because pinning says "I care about this line", not "hide a broken one further down",
    and duplicating a dead line onto the page would be worse than the group it gives up. So `myLines`
    is "pinned AND NOT already in attention", and `allLines` is "everything neither claimed". Each
    group subtracts the ids the previous one CLAIMED rather than re-deriving its own predicate —
    three independently-written filters is exactly how a line ends up in two groups or in none.
    `attentionLines` and `myLines` are ALWAYS severity-sorted; only `allLines` follows `boardSort`
    (severity, or `code` via `localeCompare`, so `K10` does not sort before `K2`). `PreferencesService`
    is injected (root-provided, so it deliberately outlives this route-scoped store) — the store reads
    `pinnedLineIds()` and nothing else about it, and no new read is involved anywhere in this.
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
       🔴 **`lineId` is the ONE key the overlay may omit, and it is the key it MUST.** The feed's line
       filter narrows what the page RENDERS, so the overlay reads stay unfiltered: a wider read is
       harmless under this invariant, while a narrowed one would drop every id outside the selected
       line — and since the overlay is a mount-time snapshot, a filtered read would freeze the filter's
       answer at that instant. The structural compare now asserts exactly that asymmetry: the overlay's
       variables equal the mirrored resource's variables with the single `lineId` key removed, and the
       key sets are compared too, so a future variable is not quietly exempted alongside it. The spec
       applies the filter BEFORE capturing, or the omission would be trivially true.
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
  controller: `isOpen` + `lineId` + `presetStatus` signals, `openFor(lineId, { presetStatus? })`
  (sets all three), `setOpen(open)`. `LinePulseCardComponent` / `LinePulseRowComponent` and the
  report chooser call `openFor`; the sheet reads `isOpen`/`lineId`/`presetStatus`. 🔴 `presetStatus`
  exists for exactly ONE caller — the chooser's "Stopped" tile, which is the rider's word for the
  existing `DISRUPTED` PassengerStatus — and it is **one-shot**: the sheet consumes it (sets it back
  to `null`) on the open edge, exactly as the spotting form consumes `ReportSheetService.lineId`, so a
  later seedless open (a row's own "Report status" button) cannot resurrect a status from a report
  that was already submitted or cancelled.
- **`ReportChooserService`** (`report/report-chooser.service.ts`, `providedIn: "root"`) — the page's
  one submission trigger, mirroring `LinkSheetService` (`isOpen` + `intent`, `open()` / `choose()` /
  `backToTiles()` / `setOpen()`). Root-provided because its triggers are spread across two components
  (the hero's CTA and the mobile action bar) while its sheet is hosted by the page.
- **`HomePage`** — `sheetLine` computes the `LinePulse` for `lineStatusSheet.lineId()` from
  `store.lines()`; `errorResource` is a minimal `RetryableResource` adapter over `store.reloadAll()`
  (no countdown). `start()` in the constructor, `stop()` in `ngOnDestroy` — which is a **pause**, not a
  teardown: the route injector keeps this `HomeStore` alive across visits, so the next page's `start()`
  resumes the beat and revalidates (the store bullet above has the `null`-vs-cadence rule). The feed
  renders `store.feedLinks()` in full (no reveal slice; `loadMore()` only pulls the next page); above
  it a `role="tablist"` selects the period through `feedTab` (a `signal<FeedTab>("today")` that
  **replaced** `_lastWeekExpanded` — one exclusive choice, one signal), and
  `canLoadMoreLastWeek` (`computed`) gates the Last Week panel's Load More (`loadMoreLastWeek()`) on
  `lastWeekPageInfo().hasNextPage` while neither the first page nor a continuation is loading. The
  page itself holds no refresh state and no line data at all: it mounts `<app-network-board>` with
  **no inputs**, hosts the ONE `app-home-refresh-control` (inside the hero), the chooser and the
  spotting sheet, and draws the `lg:hidden` mobile action bar — the countdown, tooltip,
  "Updating" label, transient "Updated" confirmation, the lines read and the board's partition all
  live in the store and its components. Its own three submission handlers are deliberately thin:
  `openReportChooser()` (hero CTA + mobile Report), `refreshNow()` (mobile Refresh →
  `store.polling.refreshNow()`) and `onLineStatusSubmitted()` (reload + `store.highlightLine(id)`).
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
  payload, a `GraphQLRequestError` (server message mirrored), a transport failure, **or the two
  submit-time guards**; only a truthy `ok` closes the sheet and emits. A
  `[data-testid="cancel-line-status-report"]` button closes it without submitting. `lineId` is
  computed from the input or the service. `stationsResource` is a
  lazy `graphqlResource` that stays inert until the sheet is open on a known line
  (`STATION_LINES_QUERY`, reused from spotting).
  🔴 **DRAFT-FIRST (Phase 2).** The form and its footer render whether or not anyone is signed in;
  logged out only ADDS a banner above the form ("You'll need to log in before submitting, but feel
  free to fill in the details first." + the `login-button`), wording deliberately identical to the
  spotting report form's. The account is asked for at exactly ONE place — `submit()` — which writes
  the same message inline (`role="alert"`, above the footer, so it survives a missed toast) and toasts,
  then returns. The draft is discarded on exactly ONE edge (open→closed, via `clear()`), so the login
  popup cannot cost the reader their typing; the `login-button` opens the popup without touching any
  draft signal. ONE `effect` handles both sheet edges: on **open** it consumes a `presetStatus`
  (one-shot) and on **close** it clears — deliberately the same effect, because the seed and the reset
  must never race against the same `_wasOpen` latch. On success the sheet also records
  `PreferencesService.setLastReportedLine(lineId)` + `pushRecentLine(lineId)`: the chooser orders its
  picker by pinned → recent → severity, so this is what makes "the line I just reported about" the
  one at hand next time.
- **Post-submit highlight (`HomeStore` + `NetworkBoardComponent`)** — after a successful line-status
  report the page calls `HomeStore.highlightLine(lineId)`, which sets the store's `highlightedLineId`
  signal and arms a `HIGHLIGHT_VISIBLE_MS` (2000 ms, the same window as the refresh control's
  "Updated") timer to clear it; `ngOnDestroy` cancels it. 🔴 It lives in the STORE, not on the page,
  because the board takes **no inputs at all** — giving it one would mean re-deriving on the page what
  it already owns. The board renders every row wrapper (all three groups) with a stable
  `id="line-<id>"`, the ring classes (`ring-2 ring-brand ring-offset-2 ring-offset-background`, only on
  the highlighted row, plus a `data-highlighted` marker attribute) and a `scroll-mt-24` so the sticky
  nav cannot cover it; a browser-gated `effect` scrolls that anchor into view
  (`block: "center"`, `behavior: "smooth"` unless `prefers-reduced-motion`, which gets `"auto"`).
  🔴 **Reduced motion drops the transition, never the ring**: `motion-reduce:transition-none` leaves
  `duration-1000` inert under `prefers-reduced-motion`, because a reader who asked for less motion
  still has to be told WHICH line they just reported about — dropping the ring would lose the
  information, not just the flourish. The scroll never runs on the server. The page reads the line id
  from `LineStatusSheetService.lineId`, which deliberately SURVIVES the close; for a spotting submit it
  comes from the output payload instead (`ReportFormComponent.submitted: output<string | null>()`, the
  line it filed against — the form consumes its own one-shot seed, so the service has nothing left).
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
- **`NetworkSparklineComponent` / `LineHistoryStripComponent` / `NetworkHeatStripComponent`** — the
  three service-day widgets. All three read `HomeStore` (the store owns the reads), all three share
  `status-history-display.util.ts` for their vocabulary, and all three follow the SAME two rules:
  **hide entirely on a failed or empty read** (their own `networkHistoryFailed` /
  `linesHistoryFailed`, never `HomeStore.hasError()` — a supporting widget must not put the retry
  banner over a working page), and **opt in** with `store.requestHistoryReads()` so no store with an
  unmounted history surface issues the reads at all. 🔴 `networkStatusHistory` is a NETWORK aggregate
  and `linesStatusHistory` is per line: the sparkline's label says "across every line on the network"
  for exactly that reason, because drawing the aggregate under one line's name would attribute other
  lines' reports to it. Each widget hands its chart a single `role="img"` sentence
  (`historySummaryLabel`) and keeps its cells `aria-hidden` with the hour detail in `title`; the grid
  does it **per row**, because the comparison between lines is the whole point of that widget. Every
  definition comes from the methodology registry through `InfoPopover` — never a literal.
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
- **`status-history-display.util.ts`** is the one place the three service-day history widgets are
  allowed to describe an hour: `serviceHourLabel` / `serviceHourRangeLabel` (MYT, so a reader in
  another timezone still lines the bars up with the backend's own hours), `reportsPhrase`,
  `historyBarHeightPct` (scaled to the busiest hour **in the same series**, with a visible floor),
  `historyBreakdownPhrase` / `historyBarTitle`, `historySummaryLabel` (the one accessible sentence
  every widget hands its `role="img"`), and the heat grid's `heatIntensityStep` /
  `heatIntensityClass` / `heatCellClass` / `heatLegendEntries`. 🔴 `HEAT_INTENSITY_CLASSES` is a list of
  LITERAL Tailwind utilities rather than interpolated ones, because Tailwind v4 only compiles what it
  finds as literal text in the source — `opacity-${n}` would emit nothing and every cell would render
  at the browser's default. `historyBarHeightPct` scales per widget on purpose, and the two widgets
  disagree there DELIBERATELY: a row strip scales to its own line (a quiet line must look quiet), the
  grid to the busiest cell on screen (comparing lines is the grid's entire job).
- **`HomeStore`** centralizes the page's data lifecycle: the polling beat (`PollingSource`), cursor
  pagination (today feed + last week), `reloadAll()`, the two lazy service-day history reads behind
  the history widgets, and the authenticated `userVote` overlay. New derived views belong here as
  `computed()`s over the resources rather than in components. A new _read_ of the feed connection
  must be copied from the resource it mirrors, not sketched: `HOME_FEED_COLLAPSE_VARS` goes into all
  four list reads **and** into both vote-overlay reads, which additionally carry the auth header and
  nothing else — the overlay is only complete if its window, page size and collapse match the rendered
  one (see Internal State), and the feed's `lineId` filter is the ONE variable the overlay must NOT
  copy. A new history-style read is the same shape: a `graphqlResource` gated on a signal the
  SURFACE sets, constant variables, and an error signal that stays out of `hasError` unless the data
  is page-critical.
- **`LineStatusSheetService`** is the cross-component trigger seam: any future card or page can open
  the report sheet with `openFor(lineId)` — or `openFor(lineId, { presetStatus })` when it already
  knows which condition the rider meant — without wiring the sheet itself.
- **`ReportChooserService` + `report-chooser-order.util.ts`** are the submission-intent seam: a new
  intent is one entry in the tile table plus one branch in `onTile()`/`onLineChosen()`, and a new
  ordering rule is one pure function with its own spec. The chooser **creates no data** — every tile
  dispatches to an existing sheet, so an intent that needs a write path of its own is a backend +
  feature decision, not a chooser change.
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
  and is now rendered ONCE (in the hero, behind `hidden lg:flex`) rather than twice with a CSS
  visibility class. Keep it that way — a second copy of this markup (or a `matchMedia`-driven
  placement) would either duplicate the confirmation state machine or desync SSR from hydration.
  ⚠️ A host that wants a REFRESH BUTTON rather than the countdown (the mobile action bar does) must
  call `HomeStore.polling.refreshNow()` and **must not** re-implement the three states; at mobile
  widths the countdown is not rendered, so the confirmation belongs to a surface the reader can
  actually see. It is also the reference for "how do I
  react to a RELOAD completing": `graphqlResource.isLoading` is pristine-only, so the control latches
  on `HomeStore.isRefreshing()` going true and CONFIRMS on it settling false with `!hasError()`.
  🔴 **The `Updating` label tracks `isRefreshing`, NOT the click** — so the beat's own refreshes say
  "Updating" too (`35b8c08`), and the **pristine initial load is the only exclusion**, derived from
  the two pristine-first-fetch-only flags (`isLoading() || isLoadingLastWeek()`). The **"Updated"
  confirmation is still click-armed**, because a passive reader must never be told "just refreshed"
  on a 30s timer they did not set. The click-arm machinery therefore still belongs to the
  **confirmation**, and a click's
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
- **`NetworkBoardComponent` is the board: three groups over ONE partition.** It replaces the deleted
  `LinePulseListComponent` (one worst-first list) and takes over its job of NOT folding a dead line
  away — while adding the grouping the plan asks for. Structure: skeleton rows
  (`line-skeleton`, kept from the old list) while the first read is in flight AND there is nothing to
  show (a later reload never blanks the board), the dashed/muted `line-board-empty` ("No lines yet."),
  then the `board-controls` row and three groups.
  - `Needs attention · N` (`line-board-attention` / `line-board-attention-heading`, the testid KEPT
    from the old list) — full `app-line-pulse-card`s, and **hidden entirely when empty**: a reader with
    nothing broken must not scroll past a "· 0" heading to learn there is nothing.
  - `My lines` (`line-board-mine` / `-mine-heading`) — compact rows; when empty it shows the invitation
    `line-board-mine-empty` ("Pin a line to keep it here.") rather than a gap in the page.
  - `All lines` (`line-board-all` / `-all-heading`) — compact rows; rendered whenever it has any,
    which is exactly when the rest of the board is showing nothing.

  Every row keeps the `line-board-row` wrapper (the stable order/partition hook from Phase 0).

  - 🔴 **The Pro heat grid is mounted only when the effective view is `pro`** (`@if (_view() ===
"pro")`), using the SAME `_view()` the controls row writes. It is the one widget here that compares
    lines against each other rather than describing one, and it costs a screen of width, so a Rider
    view must not pay for it. It hides itself on a failed or empty read rather than reaching the
    page's error state.

- **The controls row** is three labelled `role="group"` segmented controls, each an `aria-pressed`
  pair: `board-sort-severity` / `board-sort-name`, `board-view-rider` / `board-view-pro`, and —
  **pro only**, because a rider has no use for a density control and a greyed one is noise —
  `board-density-comfortable` / `board-density-compact`.
- 🔴 **URL state** (`?sort=` / `?view=`), all through `core/url-state/query-param.util`:
  - READ half: `toSignal(route.queryParamMap, { initialValue: route.snapshot.queryParamMap })` —
    seeded from the SNAPSHOT, so the server render itself reads the server's URL and a deep link
    cannot render the default on the server and the linked value on the client. `readTextQueryParam`
    is what distinguishes "absent" from "present but unrecognised"; `readEnumQueryParam` then narrows
    it, so `?view=wizard` degrades to the shared DEFAULT rather than to the reader's stored preference
    (a URL is user input and must resolve to something the UI actually offers).
  - Effective values: **URL when present, else the stored state** — `view` falls back to
    `PreferencesService.viewMode()`, `sort` to `HomeStore.boardSort()`. That is what makes
    `?view=pro` a shareable link while a returning Pro reader still gets Pro without one.
  - WRITE half: one browser-gated `effect` (a reactive `router.navigate()` during SSR hangs the
    render) that mirrors BOTH effective values through `writeQueryParams`, guarded on the URL already
    saying the same thing — otherwise a browser back/forward would immediately re-navigate onto the
    exact parameters it just left. Defaults are written as `null`, so `sort=severity` /
    `view=rider` never appear and "no query params" is one state with "the default". A **stored** Pro
    view IS mirrored into the URL on load — that is the shareable part.
  - Two more effects push a deep link DOWN into the durable state (`store.setBoardSort` /
    `preferences.setViewMode`), because otherwise the board would revert the moment the reader edited
    the URL away. `signal.set` with an equal value does not notify, so this never fights a toggle
    that already wrote both halves.
  - **Density is preference-only.** It is a per-device reading habit, not something a shared link
    should impose, so it never reaches the URL.
- **`LinePulseRowComponent`** is the compact row: the backend-hex colour rail, `code · name`,
  `line-row-status` (the operational `LineStatusBadge`, non-ACTIVE lines only — "Active" is the
  unremarkable default), `line-row-confidence`, `line-row-passenger`, `line-row-vehicles`
  ("12/16 in service"), `line-row-reports` ("N reports"), a `line-row-pin` toggle (`aria-pressed`,
  action-naming `aria-label`) and a `line-row-report` button that calls
  `LineStatusSheetService.openFor(line.id)`. The expand toggle is `line-row-toggle`
  (`aria-expanded`) and its panel is `line-row-expanded`, holding the SAME lazy
  `app-line-status-chart` + `app-line-status-reports` the card shows, both gated on the same
  `expanded` input. **Pro view adds `line-row-pro`**: `line-row-report-window` ("N reports · 15 min
  window" — a bare count is what a pro reader is most likely to over-read, and the window is what
  makes it interpretable) plus `line-row-hq` / `line-row-hq-details`. Opening the panel pushes the
  line into `PreferencesService.pushRecentLine()` on the OPEN edge only, exactly like the card.
  🔴 The row's report button reports on **the line the reader is looking at** — which is exactly as
  honest as the card's, and deliberately NOT routed through the chooser: a rider already on a row knows
  the line, and making them pick it again would be the chooser solving the wrong problem. The chooser
  exists for the reader who arrives from the hero CTA or the mobile bar with no line in mind.
- **`#line-<id>` anchors + the post-submit highlight ring** are the board's "return the reader to the
  line they just reported about" contract, and both halves matter: every row wrapper in **all three
  groups** carries the stable id (an anchor that existed only on the compact rows would break it for
  exactly the lines that need attention), and the ring is driven by `HomeStore.highlightedLineId`
  rather than by any per-row state, so a ring can never disagree between the card group and the row
  groups. `data-highlighted` is on the same element as the ring classes purely so a spec can assert
  the highlight through the DOM as well as through the signal.
- **`status-confidence.util.ts` (`statusConfidence`, `hasOfficialPulseLink`)** is the pure rule behind
  the confidence chip both row elements show next to the status, because "what does the page know, and
  how do we know it?" was being answered three different ways on one screen (a backend state, a derived
  crowd, a raw count). Four levels, **first match wins**, and the order IS the design:
  1. `official` — any pulse link with `isAutomated === true`. Checked FIRST, so a line that is both
     officially announced and heavily reported still reads as official: a rider tally is not stronger
     evidence than the operator saying so.
  2. `none` — no status evidence at all → "No recent reports". Its own label, because claiming
     confirmation from zero reports is the exact failure the chip exists to prevent.
  3. `confirmed` — evidence exists and `statusReportCount >= CONFIRMED_MIN_REPORTS` (3; the frontend's
     own rule, published as `METHODOLOGY_CONSTANTS.CONFIRMED_MIN_REPORTS` with the
     `status-confidence.confirmed` metric doc — one number, two readers, pinned together by
     `status-confidence.util.spec.ts`).
  4. `unconfirmed` — evidence but too few reports → "Unconfirmed (N reports)", the count in the LABEL
     so the reader can weigh it without opening the popover.

  **Evidence** = a report in the line's own window, OR a rider status above `NORMAL`, OR a non-`ACTIVE`
  operational status. That last one is deliberately evidence with a count of zero — a
  `PARTIAL_DISRUPTION` line with no rider reports is honestly "Unconfirmed (0 reports)" — while
  `passengerStatus: "NORMAL"` is NOT evidence, because it is the derived "nothing notable" reading and
  treating it as one would put a confident green chip on a line nobody has reported.
  `hasOfficialPulseLink` tests `=== true`, never truthiness: an absent or stale field must never claim
  provenance that was not sent. The chip's popover content comes from the resolved level's OWN registry
  entry (`status-confidence.*`), so the panel explains the level on screen rather than one generic
  paragraph, and `/methodology` cannot drift from the chip.

- **`LineStatusReportsComponent`'s per-station strip** (`station-strip`, counts in
  `station-strip-count`) tallies the reports the reader has ALREADY loaded by `station.displayName` and
  renders them above the list — no request, no new fields, and it answers WHERE, which the list cannot
  at a glance (nine stations is a line problem; nine reports on two stations is a platform problem).
  Busiest first, name as the tiebreak so the strip is stable between reads; hidden entirely when no
  loaded report names a station. 🔴 v1 aggregates ONLY the loaded pages (the first page of ten), so the
  strip is "where, among the reports you can see", never a total — making it complete needs an additive
  backend aggregate over the status-report table, a documented option deliberately NOT taken here
  because this phase ships zero new reads and a client-side total over a truncated page would be a lie
  the reader cannot detect.
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

### New seams and testids (Phase 4)

**New testids** — every pre-existing one is unchanged:

- Dashboard: `pro-dashboard`, `pro-bento`, `pro-shortcuts`, `pro-shortcut-search`,
  `pro-shortcut-refresh`, `pro-shortcut-rider`, `pro-back-to-rider`.
- Lines widget: `pro-lines-widget`, `pro-lines-filters`, `pro-filter-status`, `pro-filter-passenger`,
  `pro-filter-only-with-data` (+ `-popover`), `pro-filter-clear`, `pro-lines-export`.
- Feed widget: `pro-feed-widget`, `pro-feed-window`, `pro-feed-filters`, `pro-feed-search`,
  `pro-feed-line`, `pro-feed-status`, `pro-feed-skeleton`, `pro-feed-empty`, `pro-feed-list`,
  `pro-feed-footer`, `pro-feed-count`, `pro-feed-load-more`.
- Heat cell: `pro-heat-widget`. Incidents: `pro-incidents-widget`, `-window`, `-list`, `-row`,
  `-title`, `-since`, `-all`. HQ: `pro-line-hq-widget`, `-list`, `-row`, `-name`, `-flag`, `-link`,
  `-details`, `-empty`.

**New seams:**

- **`HomeViewModeService`** (`data/home-view-mode.service.ts`) — the ONE writer and ONE reader of
  `?view=`. `NetworkBoardComponent` reads its `view()` and its toggle calls `setView()`; `HomePage`
  branches on it; the Pro dashboard's `p` shortcut goes through it. `setView()` writes the preference
  **and** the URL itself, because `view()` is URL-first: a `setView("rider")` that only touched the
  preference would leave the effective view reading `pro` and the mirroring effect would see no change,
  so the button would look dead. (That is exactly what the board's own toggle did while the logic lived
  inside it, and its spec only ever toggled UP from a URL-less page, so the trap was invisible.)
- **`filterFeedLinks`** (`data/feed-filter.util.ts`) — the pure Pro feed narrowing. A new client-side
  feed axis is one `&&` here plus a documented rule about whether a conversation's members participate.
- **`core/export/csv.util.ts`** — `toCsv(columns, rows)` (pure, RFC-4180, header always) and
  `downloadCsv(filename, csv, isBrowser)`. Rows are keyed by COLUMN NAME, not positionally: a
  positional row silently shifts every value one column left the moment a builder forgets a field, and
  a CSV of hourly status buckets read one hour off is a plausible-looking lie. `isBrowser` is a
  parameter for the documented `writeQueryParams` reason — reading `PLATFORM_ID` needs an injection
  context a plain function should not have.
- **`HOME_RECENT_INCIDENTS_QUERY` / `HOME_RECENT_INCIDENT_VARS`** in `home.queries.ts` — the home
  contract seam's one new document, with frozen constant variables.
- **`network.has-data`** — the `MetricDoc` for the "only lines with data" rule, read by the filter's
  info popover through `renderMethodologyCopy(metricDoc(...).definition)`.

### Deliberate deviations (Phase 4)

- **No `@defer`.** The brief preferred `@defer (on viewport)` for the below-the-fold secondary widgets
  (incidents, HQ). This repo has **zero** `@defer` precedent, and `TestBed`'s `deferBlockBehavior` /
  `fixture.deferBlocks` would have made every widget spec assert on a manual flush rather than on
  behaviour. Independent loading — which is what the requirement is actually about — is delivered by
  construction instead: each widget owns its own resource and its own failure flag, and the incidents
  read is opt-in from the widget's own constructor, so nothing is shared but the store.
- **`NetworkBoardComponent` grew one input** (`embedHeatStrip`, default `true`), breaking its "no
  inputs at all" invariant. Without it the dashboard would render the heat grid twice.
- **`HomePage`'s mobile action bar stays outside the branch** as shared chrome: Report/Refresh/Live map
  are the same three intents a Pro reader needs, and a second mobile bar inside the dashboard would
  duplicate the refresh beat's affordance.

## 💡 Potential Feature Opportunities

- **A per-link deep link.** The feed's filter UI, the `?line=`/`?q=` mirrors and the search box all
  **shipped in Phase 4** (Pro view). Still missing: a per-link route/fragment that scrolls to and
  highlights a single row — the `#feed-link-<id>` anchor the duplicate indicator already emits exists
  for every row, so the DOM hook is there and only the route is missing. It is a Rider-surface idea: a
  shared link should be able to point at one report.
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
- ~~**Client-side search/sort over the resident feed page.**~~ ✅ Shipped in Phase 4 for the Pro view
  (`filterFeedLinks`, `?q=`). The Rider feed deliberately has no search box — it is a glance, not a
  query surface.

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
