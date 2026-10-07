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
  - `home.page.ts` — the routed page: a hidden-until-focused **skip link** as the first child of
    `main`, nav → a two-panel **network-board-first** split (board left /
    feed right from `lg` up, board above feed when stacked) → footer, plus the status sheet and the
    shared link sheet (feed-link edits); starts/stops the store's polling and adapts the store to
    the shared retry banner. Inside the feed column the submit box heads a **Today / Last Week tab
    set** (`role="tablist"`), each period a `role="tabpanel"`. Phase 5B added the page's `a11y`
    skeleton: the skip link, `id="line-board"` + `tabindex="-1"` as its target (on the board section
    in the rider branch, on `app-pro-dashboard` in the Pro branch), a visually-hidden
    `<h2>Community feed</h2>` as the feed column's first child, and the day labels stepped from `h2`
    to `h3`.
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
    `sparkline-bar`, one `role="img"` sentence instead of 24 announced bars). 🔴 Its `<figure>` is
    **unconditional**: a failed or empty read draws a dashed `network-sparkline-empty` placeholder of
    the chart's own `h-10` rather than vanishing, so the hero costs the page no height in any of its
    three states — see the sparkline bullet below. Then
    `home-hero.component.ts` (selector `app-home-hero`): the page's full-width headline
    strip ABOVE the `home-panels` grid. 🔴 Its headline is the page's **only `h1`** (Phase 5B — it
    used to be an `h2`, so the page had no top-level heading at all). It renders the plain-language headline (with an
    `app-info-popover` whose `content` is
    `metricTooltip("network.lines-normal")` — the tooltip carries the short summary (in-service
    scoping), while the tone's green/orange/red rule stays in the full definition on /methodology),
    the disruption callout
    naming the worst line, four stat tiles (lines normal · needs attention · reports now · links
    today) and an **intent-based** CTA row — Report a delay · Spot a train · Share a link · Live map
    (`routerLink="/tracker"`). Each tile's FIGURE is an `hlmTickUp` host, so a changed number replays a
    one-shot reveal and an unchanged one does not move at all (first paint never animates). Two of
    the four tile LABELS are their own `app-info-popover` triggers — `network.needs-attention` and
    `network.reports-now`, the two that are RULES rather than counts — while "lines normal" is the
    headline's own sentence above and "links today" is the row count of the feed list below. It reads **no request of its own**: `lines = input.required<LinePulse[]>()` and
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
    is what keeps it from contradicting the sentence underneath.
    🔴 **The top edge is the STATUS LINE, not decoration.** The Phase-0 brand-orange rail is replaced
    by a full-width STATIC hairline (`hero-status-line`, renamed from `hero-countdown-line` in round
    2c) that wears the network's own **tone** and nothing else — no countdown, no width binding, no
    inline `style`, and no `HomeStore` read (the hero injects no store at all); the poll beat's
    indicator is the donut inside `app-home-refresh-control` on the headline row below. 🔴 Round 2e
    gave the one bar on the page the one thing it was missing — a way to notice it: its tone
    **fades over 300ms** (`transition-colors duration-300` + `motion-reduce:transition-none`) and
    then **glows for 5s** after every tone change (`motion-safe:animate-icon-glow`, two 2.5s
    box-shadow pulses), the first run only for a real tone (an `unknown` first read is an empty
    read, not a network event). See the Motion section. The `h1` beside it wears
    the same tone as text, from the same two counts. Both come from the pure
    `networkTone(normalCount + needsAttentionCount, needsAttentionCount)` — over the **IN-SERVICE**
    lines only (`isInService`: `TESTING` and `DEFUNCT` excluded). Since the Others bucket landed the
    whole hero agrees on that scope: the tile and the callout below the sentence are in-service
    scoped too, so a pre-opening trial or a permanently closed line can never drag the words, the
    colour, the tile or the callout down — it is shown in the board's `Others` group instead (see the
    board bullet). `unknown` (no lines read)
    neutral, `normal` (0 needing attention) green, `degraded` (needs attention ≤ HALF the in-service
    lines) orange, `critical` (> half) red — so the words and the colour can never describe different
    arithmetic. Only the class maps live in the component; the rule is unit-tested in
    `data/network-summary.util.ts`. Half is the CEILING of `degraded`, not the floor of `critical`:
    at exactly half, most riders are still on working trains, and painting that the same alarm red as
    a broadly-down network trains readers to ignore red. The line counts nothing — `_lineClass` (the
    tone pair, plus the glow class while `_toneGlow` is on) is the whole binding, so a beat tick,
    reset or pause never writes to it; the countdown lives in the refresh control's ring (see its
    bullet and the Motion section).
    🔴 The hero card **no longer clips** (`overflow-hidden` removed): the headline popover, the tile
    popovers and the menu panel all live inside it and must be able to escape. The two decorative
    edges are clipped instead by ONE card-shaped overlay — the card's first child,
    `pointer-events-none absolute inset-0 overflow-hidden rounded-2xl`, `aria-hidden` and holding
    both `hero-status-line` and `hero-ribbon` — because neither line can clip itself: each is 4px
    tall, and CSS clamps a corner radius to its own box, so their `rounded-*` collapsed to ~4px and
    their square ends poked outside the card's 18px corners, while an overlay the size of the CARD
    is not clamped. The lines carry no rounding of their own any more — the overlay does the
    cutting, and its `pointer-events-none` is what keeps it from swallowing a click on what it
    covers.
    🔴 Every CTA wears the **default theme** — "Report a delay" and "Live map" lost their MLPTF brand
    override, because the page's identity is carried by type and layout, not by a coloured button.
    The hero hosts the page's **live refresh indicator** (`app-home-refresh-control`) in the
    `hero-refresh-slot` at the right end of the headline row, at **every width** — see the
    refresh-control bullet.
    Wiring: Spot a train → `ReportSheetService.open()`, Share a link → `LinkSheetService.open()`,
    Live map → the router, and **Report a delay → `ReportChooserService.open()`** (root-provided, the
    sheet is hosted by the page). 🔴 The hero is a pure trigger: it does not decide which line, and
    the `reportDelay` output + `HomePage.scrollToLineBoard()` it used to emit were **removed** in
    Phase 2 — the CTA answers a question a reader on a platform cannot (they do not know a line id),
    so scrolling them to the board to find one was the wrong affordance.
  - `line-pulse/` — `network-board.component.ts` (the four-group board: skeleton rows / empty state /
    the controls row / `Needs attention` cards / `My lines` + `All lines` + `Others` rows — its `h2`
    headings carry a decorative `motion-safe:animate-breathe` dot, the one pulse on the page),
    `line-pulse-row.component.ts` (one compact line row + its lazy expanded panel; its
    `line-row-reports` tally reads `N reports (X this hour)` off the store's ONE per-line read —
    service-day total plus the current service-hour bucket — so sixteen rows cost one request, and
    falls back to the plain rolling `statusReportCount reports` when there is no service-day history
    to enrich it; the enriched label carries the `line-row-reports-popover` info trigger, the
    fallback carries none),
    `line-pulse-card.component.ts` (one line's full live status plus the expand/collapse
    toggle), `line-status-chart.component.ts` (the expanded hourly report strip),
    `line-status-reports.component.ts` (the expanded report list + the per-station strip), and
    `status-info-chip.component.ts` (the hover/tap info popover shared by the card's and the row's
    chips — a thin
    wrapper over the shared `app-info-popover` that passes `showIcon=false` (the projected badge is
    the trigger) and forwards `showMethodologyLink`; `status-info-chip.server.spec.ts` renders it
    through the real server path to guard SSR/hydration).
    🔴 The card and the compact row both dropped `overflow-hidden`, because their info popovers and
    disclosure panels live INSIDE them and must escape the edge; their leading colour rails
    carry `rounded-l-xl` / `rounded-l-lg` instead, so the accent still meets the card's own corner.
    On this page the popover "i" now **trails** its wording (`iconPosition="end"`) — hero headline,
    sparkline caption, row report tally, heat strip, pro lines and report ranking — because a leading
    glyph reads as a bullet list item; `/methodology` and the component default are untouched.
    🔴 `line-pulse-list.component.ts` (and its spec) was **DELETED** with the board: it was one
    worst-first list, which is exactly the shape the board replaces. Nothing references it any more.
  - `pro/` — 🔴 **the Pro bento dashboard (Phase 4)**: `pro-dashboard.component.ts` (`app-pro-dashboard`)
    plus its six widgets — `pro-lines-widget.component.ts` (`app-pro-lines-widget`: three Pro-only
    filters + the reused `app-network-board` + the CSV export), `pro-feed-widget.component.ts`
    (`app-pro-feed-widget`: the rider feed's reading surface + line/provenance/search filters),
    `network-heat-strip.component.ts` (its own cell), `pro-incidents-widget.component.ts`
    (`app-pro-incidents-widget`: the ongoing-incident list),
    `pro-report-ranking.component.ts` (`app-pro-report-ranking`: the top-5 lines by reports today, a
    re-ranking of the shared history read) and `pro-official-widget.ts`
    (`app-pro-official-widget`: the all-time archive of operator notices). See the "Pro dashboard"
    bullet below for the layout, the shortcuts, the filter contract and the incidents decision.
    `network-heat-strip.component.ts` (selector `app-network-heat-strip`): the **Pro**
    heat grid — one row per line, one column per service-day hour, colour = the status that dominated
    that line-hour and opacity = how many reports it was (`network-heat-strip` / `-popover` /
    `heat-grid` / `heat-axis` / `heat-row` / `heat-row-code` / `heat-row-total` / `heat-cell` /
    `heat-cell-glow` / `heat-popover` / `heat-legend` / `heat-scale`, plus `heat-empty` for the
    quiet-service-day state). 🔴 **Every row is the SAME 24 columns, whatever that line reported.**
    The columns come from one template — `_columns()`, the first visible line with any bucket at all —
    and each row looks its own hour up in a per-row `Map<hourStart, bucket>`, so a line the backend
    returned `buckets: []` for draws 24 grey no-data cells (`data-empty` on the cell) instead of the
    blank strip it used to: a missing row read as a rendering fault, and it destroyed the column
    alignment the whole comparison rests on. The code gutter is `w-20` with the code shown WHOLE and
    `title` = the full display name, because a three-letter code identifies nothing to a rider who
    does not commute; the same `w-20`/`w-7` gutters are repeated on the "Service day" line and on a
    new `heat-axis` tick row beneath it that labels every OTHER hour, aligned to those 24 columns
    (at this cell width all 24 labels collide). 🔴 **The hour the reader is in GLOWS; it is not
    recoloured** — `data-current-hour` on the cell plus a `heat-cell-glow` overlay span
    (`pointer-events-none absolute -inset-px`, amber ring + soft shadow,
    `motion-safe:animate-pulse`, `aria-hidden`), never a class on the cell itself, because
    `animate-pulse` there would fade the status colour that carries the data. Its clock is seeded
    browser-only in `afterNextRender` and refreshed on the poll `linesRefreshTick`, so SSR emits no
    marker at all. 🔴 **ONE JS-driven `heat-popover` replaces the per-cell native `title`**: measured
    against the cell and clamped inside the `relative` `heat-grid` wrapper, `pointer-events-none`
    and `aria-hidden` (a panel that could take the pointer would steal the hover from the cell under
    it), showing the line name + code, the hour range, the report count and the per-status
    breakdown — or "No reports" — because a native title cannot carry a breakdown and 24
    browser-default tooltips per row each block on hover. The shared intensity scale, the legend,
    the per-row `role="img"` sentences and the failed-hides/empty-shows split are unchanged;
    `heatCellTitle` was deleted from the util with the native titles that used it.
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
    refresh row: the **"Refreshing in Ns"** text, the **Updating** state (up while ANY non-initial
    refresh is in flight), the transient "Updated" confirmation and the `Click to Refresh Now` +
    `Last updated Ns ago` tooltip). 🔴 Round 2c restored the **click-to-action donut**: an SVG ring
    (`line-refresh-ring` / `line-refresh-ring-arc`) whose arc DRAINS as the beat runs down (full at
    reset, empty at zero), an indeterminate counter-clockwise **spinner** while Updating, and the
    green check for a clean settle — indicator and click target are ONE control again. 🔴
    Round 2d **sized** it: the restored ring carried no `width`/`height` (only a `viewBox`), so it
    rendered at the CSS initial size — a 112×112px blob in the hero row — and it now copies the
    tracker side panel's `CountdownRingComponent` exactly (`width`/`height="22"`,
    `viewBox="0 0 22 22"`, circles at cx/cy 11, r 9, `stroke-width="2.5"`, track
    `text-muted-foreground/20`). All THREE glyphs live inside ONE always-rendered fixed slot
    (`inline-flex size-7 shrink-0 items-center justify-center`, glyph only) — the tracker rows'
    pattern, `CountdownRingComponent`'s ring slot plus `LayerChecklistComponent`'s "contents vary"
    one — for two reasons: this button shrink-wraps to its visible content, so a constant slot is
    what stops every state change re-flowing the row; and 🔴 round 2e moved that slot **AFTER the
    label chain** (label first, slot second, tooltip third), which pins the circle to the button's
    right edge. A LEADING glyph travelled sideways every time the countdown's own text changed
    width ("30s" → "9s") — the one number on the row that changes once a second. The inline
    **"Refreshing in Ns" text stays** beside the ring, to its LEFT now — the tracker shows its
    seconds on hover only, a deliberate divergence: this control states the countdown at a glance.
    🔴 Round 2e also made all three glyphs **22×22**: the spinner was rebuilt on the RING's 22-unit
    geometry (`width`/`height="22"`, `viewBox="0 0 22 22"`, cx/cy 11, r 9, `stroke-width="2.5"`,
    arc `M20 11a9 9 0 0 0-9-9`) and the check kept its 24-unit viewBox scaled down to a 22×22 box,
    so the row's glyph width is constant and a 14px check beside a 22px ring no longer reads as a
    different control answering the same button. Both lost their `size-3.5` class on purpose: a CSS
    size outranks the `width`/`height` **attributes**, so keeping it would have silently re-shrunk
    them to 14px. The spinner runs **reverse** at **2s** per revolution
    (`[animation:spin_2s_linear_infinite_reverse]`, was 1s — round 2i halved it; it started at 3s),
    with no inline `style`. 🔴 Round 2f
    gave that spinner a **draw-in entrance**: a stroke animates its own `stroke-dashoffset` from its own
    length to 0 over 500ms (`animate-spinner-draw-arc`) — a whole circle appearing in one frame reads
    as a hard cut into motion. 🔴 Round 2g narrowed that to the BRIGHT LINE only: the faded backdrop
    `<circle>` (r 9, `stroke-opacity="0.25"`) is plain markup now — no `stroke-dasharray`, no draw
    class — so it is present from the **first frame** and the line draws onto it, rather than the
    glyph's own backdrop still arriving 500ms after the state did. 🔴 **Round 2h made the spin run
    WHILE the line draws in**: the spin shorthand carries **no delay**, so the glyph is already
    rotating from the first frame and the two animations share the whole 500ms window. 🔴 **Round 2i
    moved the draw's start from 3 o'clock to 12 o'clock**: both strokes are wrapped in
    `<g transform="rotate(-90 11 11)">`, a quarter turn anticlockwise about the ring's own centre.
    It is a **group transform, never a class on the svg** — the spin animation writes `transform` on
    the svg itself, so a `-rotate-90` class there would be overwritten every frame; a group transform
    COMPOSES with the animation. The draw is still anticlockwise; only its start point moved. The
    one keyframe left is a **global
    `@theme` token** in `src/styles.css` (`--animate-spinner-draw-arc`) and cannot live in
    the component's `styles`, which Angular's emulated encapsulation renames — see `MISTAKES.md`.
    The ring is a `computed` over the same `secondsRemaining()/intervalMs()` pair the "Refreshing in Ns"
    text names, so the two readings cannot drift, and its arc is `text-primary` (default theme) where
    the pre-round-2 ring was `text-brand`. The hero's top status line is decoupled from the beat — a tone
    bar whose only motion is its own 300ms fade + 5s glow, see the hero bullet — so this control is
    the countdown's only home. Rendered
    **ONCE**, in the **HERO**'s headline row (`hero-refresh-slot`, `shrink-0`, rightmost) with **no
    width gate** — it used to sit in a `hidden justify-end lg:flex` corner, which hid it entirely at
    the mid widths while the sticky mobile bar's Refresh button drove the same beat. "Refreshing in
    12s" modifies the sentence above it, so the two belong on one row. The page's mobile copy that
    used to head the feed column was **removed in Phase 2** and replaced by the sticky action bar's
    Refresh button, which calls the same `store.polling.refreshNow()`. One component, one beat, one
    control instance in the DOM (`line-refresh-countdown` is therefore no longer a duplicated testid),
    and placement is **CSS only** (one row's flex layout), never a `matchMedia` placement signal, so
    SSR and hydration emit identical markup. 🔴 Only the WRAPPER ever moved into the hero — a second
    copy of the updating/confirmed state machine
    there would double every confirmation and desync the two instances from the one beat they share. The
    trigger **shrink-wraps to the row it draws** (`:host { display: inline-block }`, no `w-full`), so
    the tap target is the ring and label the reader can see and not an invisible full-width strip.
    The tooltip sits at **`z-50`** (the app overlay layer, above the nav's `z-[45]`) and closes
    **300ms after the pointer leaves**, the same grace window `InfoPopover` and the nav use — a
    tooltip that vanishes the instant the cursor moves toward it is unreadable. 🔴 Round 2e gave it
    a **second line**, `Last updated {age}`, answering the one question a countdown cannot: how stale
    are the numbers on screen RIGHT NOW (the first line says when the NEXT refresh is).
  - `home.page.ts` additionally hosts the spotting feature's `ReportFormComponent` in a second
    `hlm-sheet` (reused as-is — no form built here); the line seed travels through
    `ReportSheetService.openFor(lineId)`. It hosts `app-report-chooser` as the **first** sheet in the
    template (ordering is load-bearing — see the `report/` bullet) and ends with the sticky **mobile
    action bar** (`data-testid="home-mobile-bar"`, `fixed inset-x-0 bottom-0 z-30 lg:hidden
pb-[env(safe-area-inset-bottom)]`) hosting `home-mobile-report` (the chooser),
    `home-mobile-refresh` (the SAME `store.polling.refreshNow()` the countdown's click calls — one
    beat, two affordances) and `home-mobile-map` (a `routerLink="/tracker"` anchor, because "Live map"
    must not be the one intent mobile loses). 🔴 Report and Live map, plus the page's skip link, lost
    their MLPTF brand override (`bg-brand` / `text-brand` → the `hlmBtn` default variant and
    `bg-primary`), so all four of the page's chrome buttons now share one theme with the rest of the
    app. `main` grows a matching `pb-24 lg:pb-6` so the bar never
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
    renders lives inside it — and carries `id="line-board"` + `tabindex="-1"`, the skip link's target.
    The feed column opens with a visually-hidden `<h2>Community feed</h2>`, and the submit box is the
    column's first INTERACTIVE thing (full width on mobile, column-wide from
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
    (`data-testid="last-week-day-group"`, `h3` headings Today / Yesterday / `EEE, d MMM`), with a
    skeleton (`data-testid="last-week-skeleton"`) and an empty state
    (`data-testid="last-week-empty"`, "No links in the last week.") and its own `Load More`
    (`data-testid="last-week-load-more"`) pulling 20-link day-aligned pages (the page may exceed 20
    to finish a day). 🔴 **Switching tabs changes presentation only** — both resources stay mounted
    and in flight, both sets of appended pages are kept, and neither read is re-issued. The refresh row is the fixed-cadence control, and it covers BOTH sections:
    the 30s beat and a click both go through the same `HomeStore.reloadFirstPages()`, re-reading
    the line statuses, the Today feed's first page and the Last Week first page. Rendered by
    `HomeRefreshControlComponent` as the `<button data-testid="line-refresh-countdown">` — 🔴
    **the countdown draws itself**: the draining donut (`line-refresh-ring` /
    `line-refresh-ring-arc`, arc from the store's public `polling.secondsRemaining()` /
    `intervalMs()` pair) beside `Refreshing in {n}s`, the reverse-spun spinner while Updating, the
    green check while Updated — and a click calling
    `store.polling.refreshNow()`. All three glyphs sit inside ONE always-rendered fixed
    `inline-flex size-7` slot (round 2d), all **22×22** (round 2e: the spinner rebuilt on the ring's
    22-unit geometry, the check scaled from its 24-unit viewBox) — the ring itself is an explicit
    22px, the tracker's `CountdownRingComponent` geometry — so the shrink-wrapped row never re-flows
    between states. 🔴 That slot sits **after** the label chain (label, slot, tooltip), which pins the
    circle to the row's fixed right edge: with the glyph first, it travelled sideways with the
    countdown text's own width changes ("30s" → "9s").
    Hovering it (or tapping it when the device has no hover —
    capability is measured with `(hover: hover) and (pointer: fine)`, the same
    `StatusInfoChipComponent` pattern) reveals a `Click to Refresh Now` tooltip
    (`data-testid="line-refresh-tooltip"`, `z-50`, closing 300ms after the pointer leaves so it can
    be read and re-entered) whose second line reads `Last updated just now / {n}s ago / {n}m ago /
{n}h ago` (round 2e) — how stale the numbers on screen already are, which the countdown itself
    cannot say. A refresh reads as **three** states, in this order:
    **Updating** (`data-testid="line-refresh-updating"`, `role="status"`) → a transient GREEN
    **Updated** confirmation (`data-testid="line-refresh-confirmation"`, `role="status"`,
    `text-green-600 dark:text-green-400` on both the tick and the label, **500ms** since round 2e) →
    the countdown again.
    Neither of the first two is click-gated: "Updating" tracks `HomeStore.isRefreshing`, so
    it is up while ANY non-initial refresh is in flight — a click, the 30s beat, any other reload —
    and its one exclusion is the **pristine initial load** (a first paint is not a refresh), derived
    from `isLoading() || isLoadingLastWeek()`. 🔴 "Updated" followed round 2e onto the same rule: it
    appears after ANY refresh observed in flight settles **without an error** — the beat's included,
    because a reader who watched the row change is owed the same confirmation a reader who clicked
    gets — and the short 500ms flash is what keeps a 30s cadence from being noise. The one exclusion
    is still the pristine first load, which therefore confirms nothing: data that was never on screen
    cannot be stale. There is no separate `Refresh now` button
    any more, and the trigger is only as wide as the row it draws. Deliberately no interval picker
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
    pure board roll-up: severity tables, the needs-attention rule, the comparator, the in-service
    split (`isInService` / `inService`), the headline, the worst-line callout and the `networkTone`
    colour tone), `status-confidence.util.ts` (the pure **confidence** rule: how much to
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
    `viewMode = input<PreferencesViewMode>("rider")`. The `density` input is **gone** with the board's
    density control: padding is fixed comfortable (`p-3 pl-4`) at every width, so the row takes one
    fewer input and the board one fewer group. The row injects `HomeStore` and calls
    `requestHistoryReads()` from its own constructor — it reads the service-day buckets itself for the
    report tally, and sixteen mounted rows still cost ONE read.
  - `NetworkBoardComponent` has **no inputs at all**. It injects `HomeStore` for `lines()`,
    `isLoading()`, `linesRefreshTick()`, `highlightedLineId()` and its own three group views, exactly
    the way
    `HomeRefreshControlComponent` injects the store's beat. The partition RULE belongs to the store;
    passing the groups down as inputs would mean re-deriving them on the page for no gain — and the
    same is why the post-submit highlight signal lives in the store rather than being passed in.
  - `HomeHeroComponent` keeps its two data inputs (`lines`, `linksToday`) and injects **no store at
    all** since round 2c — the top status line counts nothing, so the `HomeStore` read that used to
    feed the countdown width went with `_countdownPct` / `_snapToFull`. The beat lives only where it
    is drawn or driven: `HomeRefreshControlComponent` (the countdown ring) and
    `NetworkSparklineComponent` (`networkHistory()`) each inject the same route-scoped store in the
    same injector tree, so no request and no timer is added anywhere; a hero that started its own
    beat would double the countdown.
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
    `LINES_STATUS_HISTORY_QUERY` (`linesStatusHistory(lineIds)`) back the four history widgets
    (the sparkline, the compact row's report tally, the heat grid and the Pro report ranking);
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

### The six cells, in three rows

| Row | Cell                     | Component                  | Owns                                                                   |
| --- | ------------------------ | -------------------------- | ---------------------------------------------------------------------- |
| A   | Lines (large, left)      | `app-pro-lines-widget`     | three Pro-only filters, the reused `app-network-board`, the CSV export |
| A   | Community feed (right)   | `app-pro-feed-widget`      | line / provenance / search filters over the rider feed's rows          |
| B   | Reports by line and hour | `app-network-heat-strip`   | nothing — a pure projection of the shared per-line read                |
| C   | Recent incidents         | `app-pro-incidents-widget` | its own lazy incidents read                                            |
| C   | Worst lines by reports   | `app-pro-report-ranking`   | nothing — a projection of the same shared per-line read, re-ranked     |
| C   | Official notices         | `app-pro-official-widget`  | its own lazy all-time notices read                                     |

**Rows are sized by the HEIGHT of their answer, not by how important it is.** `pro-bento` is a flex
column of three rows:

- **Row A** — `xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]`, `items-start`: the board and the community
  feed. The only two-column row, because these are the only two TALL cells; pairing them means both
  columns end at roughly the same height. 🔴 **The previous layout stacked both tall cells in the LEFT
  column and all the short ones in the right one**, which left the right rail ending halfway down the
  page beside a large dead zone and stranded the feed — the second thing a Pro reader opens this for —
  at the bottom-left. Still a stack below `xl`: a bento at `lg` squeezes two dense lists into two
  narrow columns and reads worse than the stack.
- **Row B** — the heat grid, **full width**. It is 24 columns of one-pixel cells behind a fixed `w-20`
  code gutter; inside a `2fr` rail the hour axis was illegible, and it is the one cell whose answer is
  inherently two-dimensional, so it wants every pixel of the page.
- **Row C** — `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 items-start`: incidents, ranking and official
  notices. All three are reference panels a reader scrolls to rather than a list they work
  through, and each owns its own read and its own failure state, so two of them hide themselves
  routinely (incidents and the ranking on an empty or failed read). In a tile flow a hidden widget just
  closes its cell; `items-start` stops the survivors stretching down to match it. Order is the reading
  order, not a priority claim.

**The board is REUSED, not reimplemented.** Every row, group, sort, anchor and
highlight rule under the Lines widget is the component the Rider page mounts. It carries exactly one
new input, `embedHeatStrip` (default `true`), which the dashboard turns **off** because the heat grid
gets its own cell — two copies would mean two `network-heat-strip` testids and the same comparison
drawn twice. Default `true` so the Rider board's behaviour cannot change to accommodate a new layout.

**`NetworkHeatStripComponent` reads `visibleLines()`**, not `lines()`, so the grid is always the same
SET of lines the board beside it draws; its shared intensity scale is computed over those same rows.

🔴 **Empty is NOT hidden — a failed read is.** The grid itself (`network-heat-strip`) is rendered only
when at least one line has at least one bucket. On a read that SUCCEEDED and found nothing it renders a
single labelled line instead, `heat-empty` — _"No rider reports in this service day yet."_ On a FAILED
read (`store.linesHistoryFailed()`) it renders nothing at all. The three states are deliberately
different: _"we could not load it"_ is a widget problem to stay quiet about, _"nobody reported anything
in this service day"_ is the answer to the question this cell exists to answer (and on a quiet morning,
or a fresh install with no reports yet, it is the correct whole answer), and an empty bordered card read
as a rendering fault rather than as either. Note this is **not** the row-sparline's rule — that widget
uses the same empty-vs-failed split but keeps its space, drawing a dashed `network-sparkline-empty`
placeholder of the chart's own height, because it sits inside the hero where a hole would scroll the
whole page under the reader, while the heat grid is its own Pro cell.

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

`HomeStore.visibleLines()` is what the board draws and what its four groups **partition** — the
partition has to be taken over the same set the rows are drawn from, or a Pro filter would shrink one
group without shrinking the other three. Because every filter defaults off, `visibleLines` IS `lines()`
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
incidents read fails still gets the board, the feed, the heat grid and the report ranking. The
official-notices archive is the third widget on that arrangement (see below).

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

### The official-notices widget — an archive, not a feed

`app-pro-official-widget` lists the newest **official** statements an operator has filed, so a Pro
reader can check what the operator has already said without scrolling the rider feed. It is the second
widget with its own read (`officialNoticesResource`), and it is built on the **existing** `FEED_QUERY`
rather than a new document:

- 🔴 **Official = `isAutomated === true`, filtered CLIENT-SIDE over the page.** `FeedLink.isAutomated`
  is already in `FEED_QUERY`'s selection (the rider feed's link card shows the badge), so the flag
  costs zero extra bytes and needs no backend argument; the plan allowed adding an `isAutomated` arg
  _only if_ client-side filtering proved insufficient, and it does not for an archive bounded at 50
  rows that is never paged. Doing it on the client also keeps the read composable with
  `HOME_FEED_COLLAPSE_VARS` — an official notice is usually a conversation root, and collapsing is what
  makes each row one statement instead of a thread.
- **Its variables are compile-time constants**: `OFFICIAL_NOTICES_VARS` (frozen) is
  `{ first: OFFICIAL_NOTICES_PAGE_SIZE (50), status: "LIVE", collapseThreads: true }` and **no window
  at all** — `currentServiceDayOnly` and `lastWeekOnly` are omitted, which the backend defaults to
  `false`, so this is an all-time, newest-first archive. No `new Date()` anywhere: a client clock in
  query variables makes SSR and hydration compute different variables, the TransferState payload is
  discarded and the read fires twice (the same rule that makes the incidents read's window constant).
- 🔴 **It is opted in, and it is absent from `reloadAll()`.** `requestOfficialNotices()` mirrors
  `requestHistoryReads()` for the reason above — `graphqlResource` installs an effect that reads its
  `httpResource` at CALL time, so a gate only the projections satisfied would defer nothing. What is
  different from the history reads is that a submit / report / retry does **not** re-issue it: an
  operator notice filed by someone else does not invalidate anything this widget draws, and a
  background widget re-reading on every whole-dataset invalidation is a request nobody asked for.
  Mounting re-reads; the 30 s beat never did.
- 🔴 **It feeds NONE of `hasError`, `isLoading`, `isRefreshing`, `isLoadingLastWeek` or the retry
  banner.** Same reasoning as the history reads, one step sharper: those flags are page chrome, and a
  failed archive must not replace a fully working board with "Something went wrong".
- **Three states, not two** — hence `officialNoticesLoading` alongside `officialNoticesFailed`. With
  only a failure flag, "no data yet and not failed" renders the **empty** panel, so every Pro visit
  would flash "No official notices" before the first answer arrived.
- **Read-only, and that is why it is not an `<app-link-thread>`.** The archive shows no vote buttons
  and no edit pencil, so the **vote-overlay invariant** (the overlay's read set must equal the set of
  ids the page renders) does not apply — there is nothing to vote on, and a widget that rendered
  `app-link-thread` would import the vote surface without carrying any of its read-set obligation.
  Reusing the card would also drag the "N links" conversation expander into a list whose job is to be
  scannable.
- Each row is title, `humanizeSince(occurredAt)`, one neutral chip per line (the operator's own
  claim, capped at three), and an `Open original` anchor with `target="_blank" rel="noopener
noreferrer"` — the operator's text lives outside the app, so it opens in a new tab with the
  referrer stripped.
- ⚠️ **No line filter.** §12 asked for "filterable by line"; the chips are there but the control is
  not, because the only lines available to filter by are the chips of the 50 rows already resident, and
  a filter over a page of an archive is a worse affordance than reading 50 titles. Add it when the
  archive is server-paged and the reader needs to isolate one line's statements.
- Hidden while loading and on error; an empty answer renders a friendly panel that says an operator has
  posted nothing official yet, which is a fact about the network and not a failure.

### The report-ranking widget — the same read, a different order

`app-pro-report-ranking` answers one question: **which lines do riders report most about today?** It
runs the same arrangement as the incidents widget — `store.requestHistoryReads()` from its own
constructor, **zero reads of its own** — and reads the same per-line history the heat grid draws, so
the two cells can never disagree.

- **Top 5 by total report count over the current service day**, summed from
  `linesHistoryFor(line.id)`'s bucket counts (`historyTotal`). `REPORT_RANKING_TOP_LINES` (5) is a real
  numeric constant, so it lives in `METHODOLOGY_CONSTANTS` and is rendered with the rest of the copy.
- **The bar is one dimension.** Length is the whole reading (a single `bg-brand` fill on a `bg-muted`
  track), deliberately _not_ the heat grid's hour×severity two-dimensional grid — this cell answers
  "which", the grid beside it answers "when and how badly".
- **Ties break on `localeCompare(code)`**, so equal counts render in a stable, alphabetical order
  rather than whatever order the lines read happened to arrive in.
- Reads `visibleLines()`, so the Pro filters narrow it exactly as they narrow the board.
- Hidden when `linesHistoryFailed` and when every count is zero: "nobody reported anything today" is
  not a ranking, and an all-zero list of bars reads as broken rather than as quiet.
- `InfoPopover` bound to the `network.report-ranking` metric doc, via
  `metricTooltip("network.report-ranking")` — it says **reports, not
  faults**: the count is what riders filed, which is not the same claim as the network being at fault.

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
    error — 🔴 with ONE exception, the board row's report tally, which **falls back** to the rolling
    `statusReportCount` instead of disappearing: a row missing its one number reads as a layout fault,
    and the row is not a widget that hides. `reloadAll()` re-reads both (submit / report / retry is a
    full invalidation); the 30 s beat
    deliberately does not — a chart that redraws every 30 seconds is noise.
  - 🔴 **The official-notices ARCHIVE is a fourth lazy read, on the isolation list and off the
    invalidation list.** `officialNoticesResource` re-issues the EXISTING `FEED_QUERY` with the frozen
    `OFFICIAL_NOTICES_VARS` (`first: OFFICIAL_NOTICES_PAGE_SIZE` (50), `status: "LIVE"`,
    `collapseThreads: true`, and deliberately NO `currentServiceDayOnly` / `lastWeekOnly` — the
    backend defaults both to `false`, which is what makes this an all-time archive). It stays inert
    until the widget calls `requestOfficialNotices()`, and exposes `officialNotices` /
    `officialNoticesFailed` / `officialNoticesLoading`. Projections filter `isAutomated === true`
    client-side — the flag is already in the feed selection, so no new document and no new backend
    argument. Like the incidents read it feeds **none** of `hasError` / `isLoading` / `isRefreshing` /
    `isLoadingLastWeek`, and unlike the history reads it is deliberately absent from `reloadAll()`:
    an operator filing a notice invalidates nothing this widget draws, and mounting re-reads anyway.
  - 🔴 **The feed's LINE FILTER** (`lineFilter` signal + `setLineFilter()`) derives from ONE signal,
    so a filtered list can never be drawn beside an unfiltered denominator or continued by a cursor
    from the wrong query: the two resources, both `loadMore*` continuations and — deliberately NOT —
    the two overlay reads all read it. `setLineFilter` **clears every appended page for both feeds**:
    a cursor is only meaningful inside the query that minted it, and keeping the appended rows would
    leave the previous filter's links on screen beside the new one's. The 30 s beat, which does not
    change the filter, still preserves Load More progress. An empty string is `null`; re-selecting the
    current filter is a no-op.
  - **The board's derived views — a PARTITION, not three filters.** `networkSummary` (`summarizeNetwork`
    over the one lines read), `attentionLines`, `myLines`, `allLines`, `othersLines`, and the
    `boardSort` signal (`"severity" | "name"`, default `severity`, `DEFAULT_BOARD_SORT`/`BOARD_SORTS`
    exported for the URL's own parse, `setBoardSort()` a no-op for an unrecognised value). 🔴 **Every
    line appears in EXACTLY ONE of the four groups**, and that is achieved by ONE decision applied in
    one order: **attention membership always wins** for in-service lines — a line needing attention
    sits in `attentionLines` even when it is PINNED, because pinning says "I care about this line",
    not "hide a broken one further down", and duplicating a dead line onto the page would be worse
    than the group it gives up. Out-of-service (TESTING/DEFUNCT) lines can never reach attention (the
    rule skips them), so for them **pin wins**: `myLines` is "pinned AND NOT already in attention",
    pinned Testing/Defunct included. `allLines` is the in-service rest, and `othersLines` is the
    out-of-service rest (unpinned) — rendered LAST as "Others" and never counted by the hero. Each
    group subtracts the ids the previous ones CLAIMED rather than re-deriving its own predicate —
    four independently-written filters is exactly how a line ends up in two groups or in none.
    `attentionLines` and `myLines` are ALWAYS severity-sorted; `allLines` and `othersLines` follow
    `boardSort` (severity, or `code` via `localeCompare`, so `K10` does not sort before `K2`). `PreferencesService`
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
  later seedless open (a row's own "Report" button) cannot resurrect a status from a report
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
  signal and arms a `HIGHLIGHT_VISIBLE_MS` (2000 ms — deliberately LONGER than the refresh control's
  500ms "Updated" flash, which is an acknowledgement, not a state a reader has to read) timer to clear
  it; `ngOnDestroy` cancels it. 🔴 It lives in the STORE, not on the page,
  because the board takes **no inputs at all** — giving it one would mean re-deriving on the page what
  it already owns. The board renders every row wrapper (all four groups) with a stable
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
  `[data-testid="status-scale-count"]` (`(n)`) only when the backend reported a non-zero count. 🔴 The
  card's `line-card-confidence` chip and its `passenger-status` badge render **ONLY for an ACTIVE
  line**: a non-Active line draws just its `line-status-badge` plus the vehicle badge, because the
  operational badge already carries the story and "Unconfirmed (0 reports)" / "No data" beside it is
  noise. The
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
- **`NetworkSparklineComponent` / `LinePulseRowComponent` / `NetworkHeatStripComponent`** — the
  three service-day widgets. All three read `HomeStore` (the store owns the reads), all three share
  `status-history-display.util.ts` for their vocabulary, and all three share the first two rules:
  **never reach for `HomeStore.hasError()`** (their own `networkHistoryFailed` /
  `linesHistoryFailed` — a supporting widget must not put the retry banner over a working page), and
  **opt in** with `store.requestHistoryReads()` so no store with an unmounted history surface issues
  the reads at all. 🔴 They no longer agree on what to DO about a failed or empty read: the heat grid
  still hides itself (it is its own Pro cell), while the hero **sparkline holds its height** with a
  dashed `network-sparkline-empty` placeholder — a hero that grows a hole in itself when the slowest
  read lands is worse than one that says nothing was reported — and the **row keeps its row**: on a
  failed or empty history read the `N reports (X this hour)` label is simply not drawn and the meta
  fragment falls back to the plain rolling `statusReportCount reports`. A rolling fifteen-minute
  number is a quiet state, not an error, and a row whose one number vanished would read as a layout
  fault. 🔴 `networkStatusHistory` is a NETWORK aggregate
  and `linesStatusHistory` is per line: the sparkline's label says "across every line on the network"
  for exactly that reason, because drawing the aggregate under one line's name would attribute other
  lines' reports to it. Each widget hands its chart a single `role="img"` sentence
  (`historySummaryLabel`); the grid does it **per row**, because the comparison between lines is the
  whole point of that widget. The grid's cells stay `aria-hidden` and their hour detail moved into the
  ONE `heat-popover` panel — a native `title` cannot carry the per-status breakdown, and 24
  browser-default tooltips per row that each block on hover are unusable anyway. Every
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
  every widget hands its `role="img"`), `currentServiceBucketIndex` (which service-hour bucket a
  given instant is in — half-open `[start, end)`, so a seam instant belongs to the LATER hour, and
  `-1` for an empty or out-of-series answer: the row's "this hour" figure and the grid's current-hour
  marker both read it, and a client clock is the one thing neither may guess), and the heat grid's
  `heatIntensityStep` / `heatIntensityClass` / `heatCellClass` / `heatLegendEntries`. 🔴
  `HEAT_INTENSITY_CLASSES` is a list of
  LITERAL Tailwind utilities rather than interpolated ones, because Tailwind v4 only compiles what it
  finds as literal text in the source — `opacity-${n}` would emit nothing and every cell would render
  at the browser's default. The scale is per WIDGET on purpose, and the widgets
  disagree there DELIBERATELY: `historyBarHeightPct` scales to the busiest hour in its own series
  (the sparkline — a quiet network must look quiet; a line's expanded chart is that line's own
  busiest hour), while the grid scales to the busiest cell on screen (comparing lines is the grid's
  entire job). `heatCellTitle` was **deleted** with the grid's native `title`s — the sparkline and the
  expanded chart's shared `historyBarTitle` are untouched.
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
  and is rendered ONCE — in the hero's headline row, at every width, inside `hero-refresh-slot` —
  rather than twice with a CSS visibility class. Keep it that way — a second copy of this markup (or a
  `matchMedia`-driven placement) would either duplicate the confirmation state machine or desync SSR
  from hydration.
  ⚠️ A host that wants a REFRESH BUTTON rather than the countdown (the mobile action bar does) must
  call `HomeStore.polling.refreshNow()` and **must not** re-implement the three states. It is also the
  reference for "how do I
  react to a RELOAD completing": `graphqlResource.isLoading` is pristine-only, so the control latches
  on `HomeStore.isRefreshing()` going true and CONFIRMS on it settling false with `!hasError()`.
  🔴 **The `Updating` label tracks `isRefreshing`, NOT the click** — so the beat's own refreshes say
  "Updating" too (`35b8c08`), and the **pristine initial load is the only exclusion**, derived from
  the two pristine-first-fetch-only flags (`isLoading() || isLoadingLastWeek()`). 🔴 Round 2e moved
  the **"Updated" confirmation onto the same rule**: it now fires after ANY refresh observed in
  flight settles clean — the beat's included — and is retained for **500ms** (`REFRESHED_VISIBLE_MS`,
  was a click-only 2000ms). The reasoning is that the OLD rule cost more than it saved: a 2s flash on
  a 30s beat was showing "Updated" one time in fifteen, long enough to read as a lingering status
  rather than an acknowledgement, and short enough that a reader who looked away missed it. The
  `_refreshPending` / `_refreshStarted` arm pair is gone; **one `_sawRefresh` latch** replaces it (set
  when a NON-pristine refresh is seen in flight, consumed on the settle edge, which keeps the
  conservative page-wide `hasError` suppression). The **pristine first load is excluded from both
  states** by the same guard, so the first paint neither says "Updating" nor claims "Updated" for
  data that was never on screen. What the click still owns is the label it raises **synchronously**
  (`refreshNow()` only flips `isRefreshing` once the request is on the wire — a round trip after the
  click the reader is watching for an answer to) and its own **expiry**: `ARM_EXPIRY_MS` is now the
  only exit for a click whose request never appears, which returns early when `_sawRefresh` is true
  so a slow request is never mistaken for a dropped click. Clearing one edge only
  is how a no-op click ends up saying "Updating" for the rest of the session. Two smaller rules
  fell out of dropping the arm: a refresh going in flight CLEARS a visible "Updated" and its timer
  (`_hideRefreshed` — otherwise the confirmation outlives the state it describes and sits through
  the whole new flight), and the effect's own re-runs may not touch a click whose expiry timer is
  still live. The Updating branch is
  also the **first** template branch on purpose: `refreshNow()` resets the beat, so if the countdown
  branch won, an in-flight click would flash a freshly-reset "Refreshing in 30s". A future host that
  wants its own refresh affordance must answer the same three states in the same order.
  🔴 **The control draws all three of its states** (round 2c restored the graphics round 2 removed).
  The countdown is a draining donut: `_ringOffset` is a `computed` over `secondsRemaining()` /
  `intervalMs()` — deliberately NOT `PollingSource.percentRemaining`, which lags a refresh by a tick
  and would leave the arc describing the beat that just ended — clamped at both ends so a paused or
  overshot beat cannot invert it, with a 1s linear `transition-[stroke-dashoffset]` that
  `motion-reduce:transition-none` drops (the arc still MOVES to its new length; it steps instead of
  tweening). 🔴 Round 2d: the ring is **explicitly sized** — `width`/`height="22"` over its own
  `viewBox="0 0 22 22"` (the round-2c restoration carried no `width`/`height` at all, so the
  viewBox rendered at the CSS initial size and the ring came out 112×112px) — the tracker side
  panel's `CountdownRingComponent` geometry (cx/cy 11, r 9, `stroke-width="2.5"`, track
  `text-muted-foreground/20`), centred by ONE always-rendered fixed
  `inline-flex size-7 shrink-0 items-center justify-center` slot that holds the glyph of
  all three states and nothing else. 🔴 Round 2e moved that slot **after** the label chain: the button
  is `justify-end` in the hero's `shrink-0` slot, so a TRAILING slot pins the circle to the row's
  fixed right edge, while a leading one travelled with the countdown text's own width changes.
  "Updating" is the indeterminate spinner — it carries the
  Phase-5B rule: the `reverse`
  direction lives **inside** the `animation` shorthand as an arbitrary-property UTILITY
  (`[animation:spin_2s_linear_infinite_reverse]` — **2s** per revolution since round 2i, half the
  tracker checklist's own 1s (3s before round 2e), and still with **no delay**, so the rotation runs
  _while_ the line draws in rather than after it),
  never
  as a separate `[animation-direction:reverse]`
  class, because the shorthand resets every sub-property — and never as an inline
  `style="animation: …"`, which outranks **every** class and makes the `motion-reduce:[animation:none]`
  that disables it under `prefers-reduced-motion` unreachable. jsdom computes no styles, so a spec can
  only pin the class and the absent `style` attribute. 🔴 Round 2e rebuilt it on the **ring's** 22-unit
  geometry (`width`/`height="22"`, cx/cy 11, r 9, `stroke-width="2.5"`, arc `M20 11a9 9 0 0 0-9-9`)
  so all three glyphs are 22×22 in one slot, and the green check beside "Updated" keeps its 24-unit
  viewBox scaled down to a 22×22 box; **neither carries a `size-*` class**, because a CSS size
  outranks the `width`/`height` attributes and would silently re-shrink them. The check needs no
  `reverse`/reduced-motion treatment because it is not an animation. The hero's top
  status line counts nothing — it is a tone bar with a 300ms fade and a 5s post-change glow, so this
  control is the countdown's only home.
  🔴 **The tooltip is part of this component's contract, not its decoration**: `z-50` (the app overlay
  layer, above the nav's `z-[45]`) and a **300ms** close delay after `mouseleave`, cancelled on
  re-entry and on destroy — the same window `InfoPopover` and the nav use. Do not "simplify" it to an
  instant close; a tooltip that disappears as the pointer moves toward it is unreadable. 🔴 Round 2e
  added its **second line**, `Last updated {age}`, over `_lastUpdatedAt` (epoch ms, stamped on every
  clean settle): `—` while no fetch has ever completed, then `just now` (<5s), `{n}s ago` (<60s),
  `{n}m ago` (<60m), `{n}h ago`, with a backwards clock clamped into "just now". It is a plain
  **method**, not a `computed`, precisely so the age keeps counting while a reader holds the tooltip
  open; the `ponytail:` ceiling is that a tooltip left open across a whole beat does not re-render on
  its own (nothing marks the view dirty), so the number only ticks when something else does.
  🔴 The stamp is set at **mount** when the store is already idle — the pristine fetch often settles
  BEFORE this control's effect first runs (warm cache, local API, late hydration), and the tooltip
  then read `—` until the first 30s beat on a page whose data was seconds old. Guarded on
  `!isRefreshing && !pristineInitialLoad && !hasError()`: idle because the load is over, clean
  because a failed first paint is not an update. A genuinely loading-at-mount page still stamps
  through the pristine settle instead.
- **The trigger is not a row, so it must not be styled like one.** The control shrink-wraps to its
  visible content (`:host { display: inline-block }`, no `w-full` on the button); the hero's headline row
  (`flex items-start justify-between gap-3`) parks it at the right edge through the `shrink-0`
  `hero-refresh-slot`, not the control. Putting `w-full` or a block host back makes the tap target an
  invisible full-width strip again.
- **`network-summary.util.ts` (`summarizeNetwork`)** is the one place the board's rule lives, and it
  is **pure** — no Angular, no requests. Three exported values make the rule legible instead of
  implicit: `LINE_STATUS_SEVERITY_RANK` (a **total order**, deliberately NOT the backend enum's:
  `TOTAL_DISRUPTION` 6 > `PARTIAL_DISRUPTION` 5 > `PARTIAL_ACTIVE` 4 > `DEFUNCT` 3 > `TESTING` 2 >
  ACTIVE 0, because DEFUNCT/TESTING are settled, un-actionable facts and must not outrank a line
  that is only partly running), `NEEDS_ATTENTION_PASSENGER_RANK` (= `PASSENGER_SEVERITY_RANK.DELAYED`,
  5), and `lineNeedsAttention` (`isInService(line) && (status !== "ACTIVE" || passengerSeverity >=
that rank)`). 🔴 Out-of-service lines never need attention — a Defunct or Testing line is a settled
  administrative fact, not a live failure — so they are listed in the board's `Others` group instead
  of being painted as a problem forever. The threshold is `DELAYED` and not `CROWDED` on purpose:
  crowding reports describe one carriage, not the service, and counting them would leave the
  headline reading "0 of 14 lines running normally" on any busy evening (the whole hero now counts
  in-service lines only — see below). `compareLineSeverity` compares the operational axis **first**
  and the
  passenger axis second (never sums them — a line that will not run outranks one that merely runs
  badly), with `code` as the final tiebreak so the order is total and two boards with the same data
  render identically. `summarizeNetwork` returns `{ total, normalCount, needsAttentionLines,
needsAttentionCount, worstLine, headline, callout, reportsNow }`. 🔴
  **Every SERVICE field is scoped to in-service lines** — the pure `isInService(line)` excludes
  exactly `TESTING` and `DEFUNCT`, the same two statuses the severity table calls settled and
  un-actionable: `normalCount` (the in-service healthy), `needsAttentionLines` /
  `needsAttentionCount` (in-service problems) and `worstLine` (which the callout names) all skip
  them, and `normalCount + needsAttentionCount` IS the in-service total the headline and tone are
  built from. So today's live read says "All 14 lines running normally" in green beside a tile that
  says "0 Needs attention", with SAL and SKY reachable only through the board's `Others` group — the
  sentence, the colour, the tile and the callout can never disagree again. Only `total` and
  `reportsNow` count every line (they describe the read and the community's reporting, not service).
  An empty read yields
  `headline: "No live line data yet"` rather than the misleading "0 of 0 lines running normally", and
  a read that DID return lines but nothing in service yields its own words, `"No lines in service"`
  — a different fact from an empty read. `reportsNow` sums each line's `statusReportCount` (over its OWN rolling `statusWindowMinutes`),
  which is why the tile says "reports now" rather than claiming a distinct-report count. 🔴
  **`PASSENGER_SEVERITY_RANK` mirrors the backend `PassengerStatus` enum order** (NORMAL 0 … DISRUPTED 6) — the schema exposes the enum in declaration order, so a higher rank IS a more severe status.
  Do not "tidy" the numbers into a preferred order (DELAYED before CROWDED, say): they are the
  server's order made numeric, and a backend reorder would make every consumer wrong at once.
  🔴 **`networkTone(total, needsAttentionCount)` is the same file's second exported rule**, and it is
  pure for the same reason — it is a fact about the network, not a design decision. It returns one of
  four `NetworkTone` values from the SAME two counts `summarizeNetwork` builds the headline sentence
  from — the summary's in-service counts, NOT the all-lines totals — which is the entire point: the hero's
  coloured status line and its `h1` cannot disagree, because neither can be computed without the
  other's arithmetic. `unknown` (no lines read, or nothing in service) is neutral
  rather than green — "nothing is wrong" is not the same claim as "everything is fine". Keep the class
  maps in the component (`_tone` / `_headlineClass` / `_lineClass`): which shade of orange is a
  visual choice, and Tailwind needs full literal class strings in source to compile them.
- **`NetworkSparklineComponent` always holds its height.** Its `<figure>` is unconditional; the ONE
  branch decision is `_plotted()` — `!networkHistoryFailed() && _bars().length > 0` — and the
  `network-sparkline-empty` dashed `h-10` placeholder is its else-branch, so bars and placeholder can
  never both be present or both absent. Three rules: (1) a **failed** read must not draw the last
  good answer, which is why the predicate still excludes a failed read even though the store holds a
  stale array — yesterday's picture drawn as today's is worse than an honest empty box; (2) the two
  quiet states **read differently** ("Activity data unavailable" vs "No activity reported yet"),
  because only one is a failure the reader may hit again; (3) the hour-axis row is unconditional too
  (empty strings and all), so the widget's total height is identical in all three states. 🔴 Never
  reach for `HomeStore.hasError()` here: a supporting widget must not replace a working page of
  statuses with the page-level retry banner.
- **`NetworkBoardComponent` is the board: four groups over ONE partition.** It replaces the deleted
  `LinePulseListComponent` (one worst-first list) and takes over its job of NOT folding a dead line
  away — while adding the grouping the plan asks for. Structure: skeleton rows
  (`line-skeleton`, kept from the old list) while the first read is in flight AND there is nothing to
  show (a later reload never blanks the board), the dashed/muted `line-board-empty` ("No lines yet."),
  then the `board-controls` row and four groups.
  - `Needs attention · N` (`line-board-attention` / `line-board-attention-heading`, the testid KEPT
    from the old list) — full `app-line-pulse-card`s, in-service lines only (out-of-service ones can
    never need attention — see the summary bullet), and **hidden entirely when empty**: a reader with
    nothing broken must not scroll past a "· 0" heading to learn there is nothing.
  - `My lines` (`line-board-mine` / `-mine-heading`) — compact rows, **rendered only when pinned
    lines exist**. An empty pin list is a gap, not an invitation: the whole group, heading included, is
    absent, so there is no `line-board-mine-empty` state at all — a heading whose only content is
    "nothing is here" is noise on a board whose whole job is showing lines. Pinned out-of-service lines
    stay here ("pin wins").
  - `All lines` (`line-board-all` / `-all-heading`) — compact rows; hidden when empty.
  - `Others` (`line-board-others` / `-others-heading`) — compact rows, rendered LAST and hidden when
    empty: the unpinned out-of-service lines (TESTING pre-opening / DEFUNCT closed). This is where the
    lines that once polluted "Needs attention" and the hero now live; the board still shows every line
    it reads, but inventory no longer masquerades as service.

  🔴 **The divider is per-section and CONDITIONAL.** Each lower group carries `border-t pt-4` on its
  own section, but only when a section actually precedes it on the page — `_attentionRendered()` /
  `_mineRendered()` / `_allRendered()` are the SAME length predicates the groups' `@if`s use, exposed
  as signals for the bindings. The **first visible group** under the controls row therefore draws
  neither: the controls row's `border-b` is the only line there, and a divider would have doubled it an
  inch above itself. With My lines hidden, All lines is still the second visible group and keeps its
  divider when it follows the attention group. (The attention group itself never carries the pair: it
  is always the first section rendered, so its divider state is fixed.)

  Every row keeps the `line-board-row` wrapper (the stable order/partition hook from Phase 0).

  - 🔴 **The Pro heat grid is mounted only when the effective view is `pro`** (`@if (_view() ===
"pro")`), using the SAME `_view()` the controls row writes. It is the one widget here that compares
    lines against each other rather than describing one, and it costs a screen of width, so a Rider
    view must not pay for it. It hides itself on a failed or empty read rather than reaching the
    page's error state.

- **The controls row** is **two** labelled `role="group"` segmented controls — four buttons — each an
  `aria-pressed` pair: `board-sort-severity` / `board-sort-name` and `board-view-rider` /
  `board-view-pro`. The Comfortable/Compact density group is **gone** with the row's `density` input
  and the preference behind it; all rows are comfortable at every width.
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
- **`LinePulseRowComponent`** is the compact row: the backend-hex colour rail, `code · name`,
  `line-row-status` (the operational `LineStatusBadge`, non-ACTIVE lines only — "Active" is the
  unremarkable default), and on the badge row `line-row-chips` the `line-row-confidence` chip and the
  `line-row-passenger` badge — 🔴 **both rendered ONLY for an ACTIVE line**. A non-Active status badge
  already carries the line's story, so "Unconfirmed (0 reports)" / "No data" beside "Partial
  Disruption" is noise rather than a qualification; the confidence question is asked exactly where the
  operational status is the unremarkable default. The row also carries a `line-row-pin` toggle
  (`aria-pressed`, action-naming `aria-label`) and a
  `line-row-report` button that calls `LineStatusSheetService.openFor(line.id)`. 🔴 **The pin glyph
  FILLS when the row is pinned** (`[&>svg]:fill-current` on the `ng-icon` while `_isPinned()`,
  alongside the static `size-4`): `aria-pressed` alone leaves a 16px outline pin saying "pin
  available" about a pin that is already on. The expand toggle is
  `line-row-toggle` (`aria-expanded`) and its panel is `line-row-expanded`, holding the SAME lazy
  `app-line-status-chart` + `app-line-status-reports` the card shows, both gated on the same
  `expanded` input. **Pro view adds `line-row-pro`**: `line-row-report-window` ("N reports · 15 min
  window" — a bare count is what a pro reader is most likely to over-read, and the window is what
  makes it interpretable) plus `line-row-hq-details` ("Details"). The "Line HQ" link to
  `/spotting/:id` is **gone** from here as it is from the card — "Details" is the way out, and it is
  the only one that survives. Opening the panel pushes the
  line into `PreferencesService.pushRecentLine()` on the OPEN edge only, exactly like the card.
  🔴 **The fleet count and the report count are their own strip, `line-row-meta`** —
  `line-row-vehicles` ("12/16 in service") and `line-row-reports`. They were both on the
  badge row, where a 390px phone could not fit them with the status pill, the confidence chip and the
  passenger badge — so the report count alone wrapped onto a line of its own on EVERY row and read as a
  layout fault rather than as a number. Grouped, they wrap together as one fragment; the report count
  is additionally hidden below `sm`, because nothing is lost there (on an ACTIVE line the confidence
  chip beside it already reads "Unconfirmed (2 reports)" / "No recent reports", and Pro view's own
  block carries "2 reports · 15 min window"). 🔴 **`line-row-vehicles` is now wrapped in the SAME
  `app-status-info-chip` the card's `line-vehicle-count` uses** — one shared `vehicleCountInfo()`
  definition read from the methodology registry (via `renderMethodologyCopy`) plus the
  `vehicleBreakdownRows()` per-status breakdown closed by its derived `Total`, and an `aria-label` of
  "N of M vehicles in service" — so "12/16 in service" is explained one way on every board surface.
  That second popover in the strip is why the report popover's specs scope to the reports element
  rather than to `line-row-meta`. 🔴 `line-row-reports` now reads **`N reports (X this hour)`** — N is the line's
  whole service-day total from `linesHistoryFor`, X the current service-hour bucket's count via
  `currentServiceBucketIndex` — because `statusReportCount` alone is a 15-minute rolling window and a
  number nobody can scale is a number nobody can read. It is the same ONE store read the heat grid
  draws, so sixteen rows still cost one request. The enriched label is a METRIC, so it carries the
  `line-row-reports-popover` info trigger (`network.line-reports-summary`); with no service-day
  history to enrich it (no buckets, or no browser clock seeded yet) the plain rolling
  `statusReportCount reports` is drawn instead and that popover is **not** rendered at all — attaching
  a service-day definition to a fifteen-minute number would describe a claim it does not make.
  🔴 **The row's clock is seeded browser-only**, in `afterNextRender` and refreshed by an effect over
  the forwarded `refreshTick` behind a `_clockSeeded` gate, so a row left open across an hour
  boundary stops naming the hour that has passed while the server render never depends on the server's
  clock. The gate is the load-bearing part: an `effect` runs during change detection, i.e. BEFORE
  `afterNextRender`, so an ungated `set(new Date())` would put a client-clock string in the very first
  paint the server never produced (`NG0500`) — the same reasoning as `PreferencesService`'s storage read.
  🔴 The responsive hiding sits on a plain `line-row-reports-wrap` `<span class="hidden sm:inline">`,
  never on the projected span and never on the `app-info-popover` host: the component's own host
  binding is `relative inline-flex`, and `.inline-flex` is emitted after `.hidden`, so a same-
  specificity `display` tie would leave the host visible — and hiding the projected span alone leaves
  a lone "i" floating beside a row with no number under it. A wrapper has nothing to compete with.
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
  the confidence chip — which both row elements render **only for an ACTIVE line**, next to where the
  status badge would otherwise sit — because "what does the page know, and
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
  operational status. That last one is deliberately evidence with a count of zero: the RULE resolves a
  `PARTIAL_DISRUPTION` line with no rider reports to `unconfirmed`, "Unconfirmed (0 reports)" — even
  though the chip never renders on that line, because the non-Active status badge already tells its
  story (that is the rendering rule, not the evidence rule). `passengerStatus: "NORMAL"` is NOT
  evidence, because it is the derived "nothing notable" reading and
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
- **The card's action set is unified with the compact row's**: the same three controls, same order —
  **pin** (icon-only, `line-card-pin`, `hlmBtn size="icon-sm" variant="ghost"`, `aria-pressed` and a
  fill-when-pinned glyph through `PreferencesService`; wrapped in `app-info-popover`
  (`line-card-pin-popover`, `showIcon=false` / `showMethodologyLink=false`) whose tooltip names the
  action — title `Click to unpin` / `Click to pin`, body explaining the effect and how to undo it),
  **Details** (`line-card-details`,
  `hlmBtn size="sm" variant="outline"`, an `a[routerLink]` to `/spotting/<lineId>/details`) and
  **Report** (`submit-line-status`, default/primary variant, opening the line-status sheet). The row
  carries the identical set as `line-row-pin` / `line-row-details` / `line-row-report` (Report
  outline there; no width classes), with the row's pin wrapped in the same tooltip
  (`line-row-pin-popover`), so whichever board group a line lands in, the reader sees ONE
  control set. 🔴 The pin button is passed to the popover as a `triggerTpl` (declared in a sibling
  `<ng-template #cardPinTpl>` / `#rowPinTpl>`): it IS the trigger, and the popover renders no button of
  its own, so an interactive control is never nested inside another button. Its `parentElement` is
  therefore the popover's `inline-flex` span wrapper — spec assertions on cluster order or sibling
  spacing must `closest("app-info-popover")` first (see `MISTAKES.md`). 🔴 Round 3 removed the card's kebab menu (its single item was pin) and its "Log
  spotting" button: the pinned/actions split asked the reader to learn two different affordances for
  the same three verbs, and spotting already has its own surfaces. `hlmBtn`'s selector is
  `button[hlmBtn], a[hlmBtn]`, so the Details anchor needs no extra wiring, and `hlm()` merges its
  `class=` input, so the card's `w-full sm:w-auto` mobile stacking survives. Icons (`lucidePin`)
  come from `@ng-icons/lucide` through `NgIcon` + `provideIcons`; the existing chevron SVGs stay as
  they are. The card also draws the line's
  `displayColor` as a leading accent rail (a backend hex, so it needs no dark-mode twin) and calls
  `PreferencesService.pushRecentLine()` on the expansion's **open** edge. 🔴 The card does **not**
  clip: `overflow-hidden` was removed because the popovers and the disclosure panel are
  all positioned inside it, and the rail carries `rounded-l-xl` so the accent still meets the card's
  own corner. Same rule on `line-pulse-row` (`rounded-l-lg`). If you ever re-add an
  `overflow-hidden` here, check first whether a popover is nested inside.
- **`PreferencesService`** (`core/preferences/preferences.service.ts`, `providedIn: "root"`) is the
  reader-owned board display state — `pinnedLineIds`, `viewMode` (`"rider" | "pro"`),
  `lastReportedLineId`, `recentLineIds` — persisted under the **versioned** key
  `rosak:preferences:v1` (the `:v1` is the migration seam: a shape change bumps it, so a stale
  payload is orphaned rather than half-read). API: `isPinned(lineId)`, `togglePin`, `setViewMode`,
  `setLastReportedLine`, `pushRecentLine` (most-recent-first, de-duplicated, capped at
  `MAX_RECENT_LINES` = 5), `reset()`, `snapshot()` and `hydrated()`. 🔴 **`density` is gone from the
  shape**, with the row's `density` input and the board's control that fed it. The storage key is
  unchanged and nothing migrates: `parseStoredPreferences` reads NAMED keys off the stored record, so
  a stale `density` in a rider's payload is simply never looked at — that is exactly why the field was
  dropped from parsing rather than defaulted, and why the unversioned orphaning rule above never has
  to fire for it. 🔴 **Its constructor never reads
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

- Dashboard: `pro-dashboard`, `pro-bento` (the whole three-row bento — the grids inside it are anonymous,
  so a spec asserts the ROW structure through the widgets' parents), `pro-shortcuts`,
  `pro-shortcut-search`, `pro-shortcut-refresh`, `pro-shortcut-rider`, `pro-back-to-rider`.
  🔴 `pro-shortcut-rider` is the `<kbd>p</kbd>` **inside** `pro-back-to-rider` — one control, so
  "Back to rider view" appears exactly once in the row (a touch reader has no `p` key, so the button
  cannot go; the words are how the key is discovered, so they cannot either).
- Lines widget: `pro-lines-widget`, `pro-lines-filters`, `pro-filter-status`, `pro-filter-passenger`,
  `pro-filter-only-with-data` (+ `-popover`), `pro-filter-clear`, `pro-lines-export`.
- Feed widget: `pro-feed-widget`, `pro-feed-window`, `pro-feed-filters`, `pro-feed-search`,
  `pro-feed-line`, `pro-feed-status`, `pro-feed-skeleton`, `pro-feed-empty`, `pro-feed-list`,
  `pro-feed-footer`, `pro-feed-count`, `pro-feed-load-more`.
- Heat cell: `pro-heat-widget`. Incidents: `pro-incidents-widget`, `-window`, `-list`, `-row`,
  `-title`, `-since`, `-all`. 🔴 **Removed:** the whole **Line HQ** tile — its component, its spec and
  its seven testids (`-widget`, `-list`, `-row`, `-name`, `-flag`, `-link`, `-details`, `-empty`) —
  because the only thing it projected was a per-line link, and the board row's own
  `line-row-hq-details` already is that.
- Ranking: `pro-report-ranking`, `-list`, `ranking-row`, `ranking-row-code`, `ranking-row-count`,
  `ranking-bar`.
- Official archive: `pro-official-widget`, `pro-official-count`, `official-notice-list`,
  `official-notice`, `official-notice-title`, `official-notice-since`, `official-notice-line`,
  `official-notice-link`, `official-notice-empty`.

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
  info popover through `metricTooltip(...)`.
- **`network.report-ranking`** — the `MetricDoc` for "reports per line over the current service day,
  top 5", read by the ranking widget's popover the same way. It is the honest counterpart to the heat
  grid: same numbers, different question, and the copy has to say **reports, not faults**.
- **`OFFICIAL_NOTICES_PAGE_SIZE` / `OFFICIAL_NOTICES_VARS`** in `home.store.ts` — the archive's one
  tunable (50) and its frozen variable object. The page size is a deliberate ceiling, not a tunable the
  reader drives: an official statement is worth a scroll but not a page control, and 50 roots of
  `FEED_QUERY` is one payload. Raise it when the archive is server-paged.
- **No new query document.** The archive reuses `FEED_QUERY` because `FeedLink.isAutomated` is already
  selected — a second document selecting the same fields with a different `first` would be a second
  thing to keep in sync with `home.queries.spec.ts`'s pinned selection.

### Motion (Phase 5B)

The motion on this page was added in pieces across the polish rounds, all **CSS-only** (`motion-safe:` /
`motion-reduce:` variants or a
bounded transition), none a new dependency, and every one **inert under
`prefers-reduced-motion: reduce`** — a reader who asked for less motion gets the same information with
nothing moving (for the countdown ring's arc, `motion-reduce:transition-none` drops the tween, so it
steps per tick instead; for the "Updating" spinner, BOTH of its animated elements are switched
off — the `motion-reduce:[animation:none]` on the svg plus `motion-reduce:animate-none` on the bright
arc; the faded backdrop circle is static by construction, so it has nothing to switch off). No
`matchMedia` probe and no JS animation loop exists anywhere in this feature.

- **Number tick-up on the hero's four stat tiles** — `src/app/ui/motion/tick-up.directive.ts`
  (`hlmTickUp`, selector `[hlmTickUp]`, input also `hlmTickUp`: `number`). The value is never rendered
  by the directive — the text stays in the template — it only **reveals** a changed number by adding
  `--animate-tick-up`, a keyframe pair declared in `@theme` in `src/styles.css` (the plan requires
  every new animation token to live there, not in a component stylesheet). 🔴 It is a short upward
  slide with a fade, **not a rolling digit**: a rolling digit needs a per-frame JS tween and a
  `tabular-nums` column to animate inside, which is a lot of machinery to say "this number changed".
  Three rules are the whole contract:
  1. 🔴 **The first effect run is skipped.** A tile that has never changed must not animate on arrival
     — the numbers are already correct when the reader sees them, so animating them would be
     decoration pretending to be information.
  2. **A re-trigger is a forced reflow, not a remount.** The class is removed, `void el.offsetWidth` is
     read, and the class goes back on: the only way to restart a CSS animation on an element that
     never left the DOM.
  3. **The class is never removed afterwards.** The animation is non-infinite and has no fill mode, so
     it is inert the moment it ends — there is nothing to clean up and therefore no cleanup timer to
     leak. (Add one only if a future animation has `forwards`.)
     ⚠️ **Usage is `[hlmTickUp]="n"` ALONE.** A bare `hlmTickUp` attribute _alongside_ the binding binds
     the empty string `""` to a required `number` input and fails the build with `Type 'string' is not
assignable to type 'number'`. The bound attribute is itself the selector match, so the bare form is
     not needed. (This is unlike `hlmBtn`, whose bare attribute matches nothing the directive declares.)
     🔴 It is SSR-safe for free: the first run is a no-op by rule 1, so a server render — which does not
     replay the directive's later runs — emits exactly the template's own text.
- **Disrupted pulse on the lines needing attention** — a decorative `bg-brand` dot inside the
  attention `h2` (`line-board-attention-dot`, `aria-hidden`) carrying
  `motion-safe:animate-breathe`. It reuses the **existing** `--animate-breathe` theme token rather than
  adding a second one, and the count beside it — the actual information — never moves.
- **Countdown donut** — the refresh control's OWN ring (`line-refresh-ring` /
  `line-refresh-ring-arc`), since round 2c; the hero's top status line is a tone bar that counts
  nothing. A `-rotate-90` SVG holds a track circle plus an arc whose `stroke-dasharray` is one
  full turn (r=9 → `56.55`) and whose `stroke-dashoffset` is a `computed` over
  `secondsRemaining() / intervalMs()`, so the ring, the "Refreshing in Ns" text beside it and the
  beat itself are readings of the same two numbers and cannot drift. 🔴 **The arc DRAINS while the
  beat counts down** — full at reset, empty at zero — and refills in the same render that puts the
  text back to 30s; the 1s linear `transition-[stroke-dashoffset]` interpolates between the
  once-per-second writes (no stepping), and `motion-reduce:transition-none` drops it so reduced
  motion sees the arc jump straight to its new length: same information, no tween. The arc class is
  `text-primary` (default theme), where the pre-round-2 ring was `text-brand`. 🔴 It is computed
  from that pair **deliberately rather than from `PollingSource.percentRemaining`**: `scheduleNext()`
  resets `secondsRemaining` on the same edge but leaves `percentRemaining` to the next 1s tick, so
  immediately after a refresh the published percentage still describes the beat that just ended and
  the ring would visibly refuse to refill for up to a second while claiming to be full. A null
  interval (paused beat, ring not rendered at all) and an overshot countdown both clamp to the ends
  of the range rather than inverting the arc — a negative offset would draw MORE than a full turn.
  🔴 **Round 2d sized it**: the round-2c restoration had no `width`/`height` (only a `viewBox`), so
  it rendered at the CSS initial size and the ring came out **112×112px** — it is now an explicit
  22×22px svg in its own 22-unit `viewBox`, the tracker side panel's `CountdownRingComponent`
  geometry, centred by the control's ONE fixed `size-7` glyph slot (the shared slot is
  `LayerChecklistComponent`'s "always rendered, contents vary" pattern) — which round 2e moved
  **after** the label chain so the circle is pinned to the row's right edge instead of travelling with
  the countdown text's own width. Its track class is
  `text-muted-foreground/20` — a class, not a `stroke-opacity` attribute — and the 1s/linear arc
  duration is deliberate: our `stroke-dashoffset` rebinds once per second, while the tracker's
  source ticks every 100ms and so tweens shorter.
- **The "Updating" spinner** — the tracker checklist's spinner spun in REVERSE
  (`[animation:spin_2s_linear_infinite_reverse]` + `motion-reduce:[animation:none]`, the direction
  inside the shorthand and **no delay** — the spin runs while the line draws in, see the
  refresh-control seam), so
  "the page is working on it" never reads as
  "the countdown is running". 🔴 **Round 2i halved the speed** to 2s per revolution: at the
  tracker's 1s the glyph read as a spinner **rushing** rather than as work in progress, and no
  other motion on this page moves fast enough to compete with it. Round 2c restored both graphics to the control while the hero's top
  line went tone-only, ending round 2's **text-only** phase: the indicator and the click target are one
  control again. 🔴 Round 2e rebuilt it on the **ring's** 22-unit geometry (`width`/`height="22"`,
  `viewBox="0 0 22 22"`, cx/cy 11, r 9, `stroke-width="2.5"`) instead of the checklist's 24-unit one,
  so all three glyphs are 22×22 in one slot; it dropped `size-3.5` because a CSS size outranks the
  `width`/`height` attributes, which is exactly how the old 14px spinner survived the round-2d slot.
  The green check kept its 24-unit viewBox and gained an explicit 22×22 box for the same reason.
  🔴 **Round 2f gave the spinner a DRAW-IN entrance instead of a pop-in.** A finished circle appearing
  in one frame reads as a hard cut into motion, so a stroke now animates **its own**
  `stroke-dashoffset` down from **its own** length to 0 over **500ms** — round 2f held the rotation
  back for that window with a **500ms DELAY** inside the spin shorthand; 🔴 **round 2h REMOVED that
  delay**, so the glyph is already rotating from the first frame and the spin and the draw share the
  whole 500ms: the line draws anticlockwise _on a rotating glyph_, and there is no
  separate "then it starts moving" phase (`reverse` is still inside the
  shorthand; the duration went 1s → **2s** in round 2i). 🔴 **Round 2g then
  narrowed the entrance to the BRIGHT LINE alone.** The track circle (r 9, `stroke-opacity="0.25"`) is
  now plain markup — its `stroke-dasharray="56.55"` and `animate-spinner-draw-ring` are GONE — so the
  glyph's backdrop is there from the **first frame** and static for the whole state; animating it meant
  the line was drawing onto nothing for the first 500ms of a state that had already arrived. The arc
  path keeps `stroke-dasharray="14.14"` (the quarter turn that is exactly that path's length) and
  `animate-spinner-draw-arc`. Five rules:
  1. 🔴 **The spin and the draw are CONCURRENT, never sequential.** The shorthand is
     `[animation:spin_2s_linear_infinite_reverse]` — no fourth token, hence **no delay**: a 500ms delay
     there made the entrance read as two phases (a still circle that then starts moving) instead of one
     motion, which is exactly what the user asked to be fixed. jsdom computes no styles, so the spec
     pins the shorthand string itself and asserts no time slot crept back in front of `infinite`.
  2. 🔴 **The draw starts at 12 O'CLOCK, and that is GEOMETRY — a group transform, not a class.**
     Both strokes (the static track and the drawn arc) are wrapped in
     `<g transform="rotate(-90 11 11)">`, a quarter turn anticlockwise about the ring's own centre.
     It cannot be a `-rotate-90` class on the svg: the spin animation writes `transform` **on the
     svg**, so the class would be overwritten on the very first frame and the start point would flip
     back to 3 o'clock mid-spin. A **group** transform composes with the parent's animation, so the
     start point is fixed and the glyph still spins anticlockwise around it. The direction itself was
     never touched: the arc `M20 11a9 9 0 0 0-9-9` starts at `(20,11)` in its own coordinates and its
     sweep flag `0` walks negative-angle (anticlockwise in SVG's y-down frame) to `(2,11)`, so walking
     `stroke-dashoffset` **down** from the path's own length (14.14) to 0 reveals the stroke from the
     path's start **forward** along the path — that same anticlockwise quarter turn, now rotated to
     begin at 12 o'clock. Reversing the path to "change the direction" would still only desync the
     draw from the geometry.
  3. 🔴 **The keyframe is a GLOBAL `@theme` token in `src/styles.css`**
     (`--animate-spinner-draw-arc`), applied as the generated `animate-spinner-draw-arc` utility. It
     **cannot** live in the component's `styles`: Angular's emulated encapsulation RENAMES `@keyframes`
     declared there (`spinner-draw-arc` → `_ngcontent-ng-cXXXX_spinner-draw-arc`), so a
     class-referenced `animation-name` from the global sheet matched nothing and the entrance
     **silently never fired** — green spec, clean build, no entrance. Every `animate-*` token in this
     repo is global for that reason. See `MISTAKES.md`. (2g deleted the now-unused
     `--animate-spinner-draw-ring` token and its keyframes with it.)
  4. **Both animated elements are classes, never inline styles** — the svg's arbitrary
     `[animation:…]` and the arc's generated `animate-*`. An inline animation outranks every
     class in the cascade, including the `motion-reduce:` opt-out that has to beat it. With both
     off, nothing sets a base `stroke-dashoffset`, so the arc falls back to the default `0`: the
     glyph is still **fully drawn, static, and honest** — and the static backdrop is already there.
  5. **A jsdom spec cannot see this class of bug** (it computes no styles — the class names were all
     correct while the animation was not), so the entrance needs one browser look: the class names
     themselves are what the spec pins, and the computed `animation-name` / sampled `dashoffset` are
     what a human verifies.
- 🔴 **Hero status-line tone fade + glow** (round 2e) — the only motion the tone bar has, and the
  bar itself still counts nothing. Two parts: a **300ms colour fade** in the element's STATIC class
  (`transition-colors duration-300 motion-reduce:transition-none`) so a tone change is not a jump,
  and a **5s `motion-safe:animate-icon-glow`** after each tone change — two of the keyframe's 2.5s
  box-shadow pulses. Three rules keep it honest:
  1. 🔴 **The fill carries a matching `text-*` beside its `bg-*`.** `icon-glow` paints its shadow in
     `currentColor`, so without it the glow would take the fill's inherited foreground.
  2. **The 5s is a `setTimeout`, not the class.** The animation is `infinite`, so nothing about the
     class itself ever ends the glow; `ngOnDestroy` clears the timer. `animate-breathe` is
     deliberately NOT used — its keyframe scales, which would visibly breathe the full-width bar.
  3. **It fires only on a CHANGE.** An effect over `_tone()` compares against the previous tone; the
     first run glows only if the tone is already real (an `unknown` first read is an empty read, not
     a network event), every later run on any change.
- **The Pro heat grid's current-hour glow** — a `motion-safe:animate-pulse` on the
  `heat-cell-glow` overlay span (`ring-2 ring-amber-400/80` + a soft amber `shadow-`), so a reader who
  asked for less motion gets a **static amber ring** and still finds the hour: the ring is the
  information, the pulse is the flourish. Two rules make it honest. 🔴 **It is an overlay, never a
  class on the cell** — `animate-pulse` on the cell would fade the status colour that carries its data
  along with the marker, and a wash behind it would hide that colour entirely; the span is
  `pointer-events-none absolute -inset-px` and `aria-hidden`, drawn over the cell and never under it.
  🔴 **Its clock is seeded browser-only** (`afterNextRender`, refreshed by the `linesRefreshTick`
  effect behind a `_clockSeeded` gate), so the server emits no marker at all and the client's first
  paint is the marker-free grid the server sent — the same `NG0500` trap the refresh control and
  `PreferencesService` guard.
- 🔴 **Any future motion here is a `motion-safe:` / `motion-reduce:` pair on the element, plus a spec
  that asserts the class.** jsdom computes no styles, so "the animation is disabled" is only testable
  as "the class that disables it is on the element". A motion feature whose spec cannot name that
  class is not testable.

### Dark-mode contrast audit (Phase 5B)

Every colour the home page draws in dark mode was measured against its actual backdrop (WCAG 2.1
relative luminance + contrast ratio), not eyeballed. **One value changed**; everything else was
already passing, and the failures worth recording are the ones that were left alone on purpose.

| Surface                                                                                             | Dark                                                  | Light                 | Verdict                                                                                                                                     |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `--brand` (official-update "Open original", attention dot, highlight ring, ranking bar) on `--card` | `#f79331` → **7.56:1**                                | `#ee7104` → **3.0:1** | Dark passes AA; light fails as body text (see below)                                                                                        |
| `--brand-foreground` on `--brand` (button fill)                                                     | **8.23:1**                                            | **3.0:1**             | Dark passes; light is the same light-mode failure                                                                                           |
| Highlight ring (`ring-brand` on a row)                                                              | **8.48:1**                                            | n/a                   | Passes, unchanged                                                                                                                           |
| Feed tabs (selected + unselected on `--card`)                                                       | **6.98:1**                                            | passes                | Unchanged                                                                                                                                   |
| Pro dashboard surfaces (bento cells, filter buttons, export)                                        | pass                                                  | pass                  | Unchanged                                                                                                                                   |
| Status bar `DISRUPTED` (`PASSENGER_BAR_CLASS`)                                                      | `rose-600` **3.84:1** → `dark:bg-rose-500` **4.61:1** | `rose-600` passes     | 🔴 **The one fix.** It was the only status bar below 4.5:1 on the dark card _and_ the dimmest, so the most severe status read least clearly |

- 🔴 **The fix is one `dark:` pair inside the shared `PASSENGER_BAR_CLASS` table**
  (`features/home/data/passenger-status.util.ts`), not seven new tokens. Every consumer of that table
  (the card's legend, the expanded chart, the row, the heat grid, the status chip) inherits it, and a
  token would have meant one new custom property for a single value. `status-history-display.util.spec.ts`
  pins the class.
- **The heat grid's intensity ladder was left alone, deliberately.** `HEAT_INTENSITY_CLASSES` steps are
  theme-independent opacities, so the faintest step is 1.06:1 in **light** and 1.60:1 in dark — the
  light end is the worse one, which means a dark-mode-only fix would be fixing the wrong theme. No
  floor move reaches 3:1 without collapsing the separation between the five steps, and that separation
  _is_ the encoding (a reader compares cells against each other, not against the card). The grid ships
  a per-row `role="img"` sentence plus the ONE `heat-popover` panel as the accessible equivalent, which
  is the honest fix for a magnitude channel; a `role="img"` per CELL would read out 384 numbers.
- 🔴 **Light mode is a known, recorded failure, not an oversight.** `--brand` `#ee7104` on `--card` is
  3.0:1, so `text-brand` fails AA for body text — on this page it is used for the official-update
  "Open original" link, which sits at mobile sizes where the large-text threshold does not apply. White
  on brand (a `bg-brand text-brand-foreground` button fill) is the same 3.0:1, and the page no longer
  has one: the hero's "Report a delay", "Live map", the mobile bar's Report and the skip link all took
  the **default theme** in this pass, which removed the two worst offenders rather than restyling the
  token. Fixing the rest means darkening the site's brand orange, which is a design decision above this
  feature's remit: the accent was picked for hue identity, and every consumer of it (the nav, the ad
  slots, the tracker) was designed against it. Fixing the home page alone would leave two brand oranges
  in one product. Recorded as a still-open item below, not silently restyled.
- ⚠️ **The four network-tone classes are NOT in the measured table.** `networkTone`'s
  `green/orange/red-600 dark:*-400` (and the neutral `text-foreground`) arrived after this audit and
  were only checked in a browser, not measured. The headline they colour is `text-xl font-semibold`
  (`sm:text-2xl`), so the **large-text** threshold (3:1) is the one that applies, not the 4.5:1 body
  threshold the `--brand` rows above are judged against — but that is an argument, not a measurement.
  Re-measure before trusting it, and do not add a fifth tone without the same check.
- **No wholesale restyle.** Where a token already exists the fix went into the token (`PASSENGER_BAR_CLASS`)
  rather than into an ad-hoc `dark:` override at a call site; the audit found no surface where a new
  token was needed.

### Accessibility (Phase 5B)

The pass covered the page's own structure — landmarks, headings, focus order and names — and every
control the redesign added. `hlmBtn`, `hlmInput`, `hlmSelect`, the checkbox, the chooser tiles and the
Pro widgets' links already carried an accessible name and a `focus-visible` ring from their
primitives and were left alone.

- **One `h1`, and it is the hero headline.** The page had no `h1` at all: the hero's sentence was an
  `h2`, so a screen reader's heading list started one level down with nothing above it. It is now the
  page's only `h1`, inside the existing `app-info-popover` (so the metric's explanation still travels
  with it). Everything else steps down: the board's group headings are `h2`, the feed column gained a
  visually-hidden `<h2>Community feed</h2>` as its first child, and the Last Week day labels went from
  `h2` to `h3` because a day is a subsection of that column, not a peer of it.
- **Skip link** — `<a href="#line-board" data-testid="home-skip-link">`, the **first child of `<main>`**
  and therefore the first focusable thing on the page, `sr-only focus:not-sr-only focus:fixed
focus:top-3 focus:left-3 focus:z-50`. `focus:fixed` rather than `focus:relative` on purpose: a
  relative skip link pushes the hero down the page the moment it is focused, so it moves the content
  it exists to let you jump past. 🔴 The target is `id="line-board"` + **`tabindex="-1"`**, on the
  rider board `<section>` in one branch and on `<app-pro-dashboard>` in the other — an anchor to an
  element with no `tabindex` scrolls the page but leaves the caret at the top, which is the classic
  half-working skip link. The two branches are mutually exclusive, so the id is on exactly one element
  in either layout and the fragment is never ambiguous.
- **`aria-expanded` + `aria-controls` on both expand toggles** — `line-pulse-card` and
  `line-pulse-row` gained `aria-controls` pointing at ids scoped **per line**
  (`line-card-expanded-<id>` / `line-row-expanded-<id>`), because every row is one of sixteen
  instances of the same control. 🔴 Those panels stay behind `@if` rather than being pre-rendered and
  hidden: an `aria-controls` target that does not exist is worse than none, and always-mounted would
  mean thirty-two lazy chart/report subtrees reading on a page nobody expanded.
- **Focus rings where nothing else draws one.** The board's two segmented control groups
  (`board-sort-*`, `board-view-*`) and the two feed tabs are plain `<button>`s under
  a border — not `hlmBtn` — so the primitive's ring does not come with them; all four groups carry
  `outline-none focus-visible:ring-2 focus-visible:ring-ring/50` explicitly. (The card's hand-built
  kebab that once needed the same ring is gone; the unified action set is all `hlmBtn`.) 🔴 The heat
  grid's new `heat-popover` and `heat-cell-glow` are the
  opposite case: both are `pointer-events-none` and `aria-hidden`, so they are **not** focusable and
  must not be — the grid's accessible equivalent is the per-row `role="img"` sentence, and the panel
  is a pointer-only readout beside it.
- **Landmark labels kept.** The board section (`aria-label="Line status"`) and the feed section
  (`aria-label="Community feed"`) are unchanged; the feed's real `<h2>` is an addition to that label,
  not a replacement for it, because `aria-label` appears only in the landmark list.
- **Focus-order surprises fixed:** the skip link is first, the mobile action bar sits after the main
  content (a fixed bar is still in DOM order, so it must not come before the panels it overlays), and
  the feed tablist keeps its roving `tabindex` so `Tab` enters the pair once and leaves it once.
- **The network tone is never the only channel.** The hero's status line is `aria-hidden` — it is a
  colour, and colour alone is not information — and every fact it carries is available in text on the
  same screen: the `h1` states the sentence, the "Refreshing in Ns" label states the beat, and the
  board names the lines underneath. Adding a fifth tone must add its sentence too, not just its
  colour. Likewise the sparkline's two quiet states are literal text in the DOM (not `aria-hidden`),
  so "No activity reported yet" and "Activity data unavailable" are both announced.

### New seams and testids (Phase 5B)

**New testids** — every pre-existing one is unchanged:

- `home-skip-link` (the visually-hidden-until-focused skip link).
- `line-refresh-ring` / `line-refresh-ring-arc` — **REMOVED** in the home-page polish round 2 and
  **RESTORED in round 2c**: the countdown ring inside the control again (arc draining to
  `text-primary`, clamped and guarded), together with the reverse-spun "Updating" spinner. **SIZED
  in round 2d** — explicit 22px (a viewBox-only svg rendered at 112px) inside the shared `size-7`
  glyph slot, per the refresh-control seam. **Round 2e** moved that slot after the label chain and made
  the spinner and the check 22×22 to match it. **Round 2f** gave the spinner a draw-in entrance, and
  **round 2g** narrowed it to the bright line only: that arc is asserted by its
  `animate-spinner-draw-arc` class plus its own `stroke-dasharray` (14.14) and
  `motion-reduce:animate-none`, while the faded backdrop circle is asserted **static** —
  `stroke-opacity="0.25"` and NO `stroke-dasharray` and NO `class` attribute at all. The animation is
  a global `@theme` token — see `MISTAKES.md` for why a component's own `@keyframes` cannot be
  referenced by a class. The beat's
  only indicator is that donut plus the control's own label; the hero's `hero-status-line` counts
  nothing.
- `line-board-attention-dot` (the decorative pulse dot beside "Needs attention · N").
- `line-board-others` / `line-board-others-heading` — the fourth board group (round 3).
  `line-row-details` joined `line-row-pin` / `line-row-report` as the unified per-line action set,
  and `line-row-hq-details`, `line-card-menu`, `line-card-menu-panel` and `add-spotting-entry` were
  retired with the old card controls.
- `line-card-pin-popover` / `line-row-pin-popover` (home-page polish round 4) — the pin tooltip panels
  on the card and the compact row. The same round **retired `line-board-mine-empty`**: the `My lines`
  group is hidden when nothing is pinned, so the empty-state paragraph no longer exists.
- `hero-needs-attention-popover` / `hero-reports-now-popover` (the two tile-label info popovers).

**New seams:**

- **`hlmTickUp`** (`src/app/ui/motion/tick-up.directive.ts`) — the one motion primitive in `src/app/ui/`.
  A new number on any surface that wants the reveal is one binding; a new KIND of motion needs its own
  directive rather than a branch here, because this one knows about exactly one thing (count from 0 to
  a number).
- **`network.reports-now`** — the `MetricDoc` the Phase-5B registry audit found **missing**: "Reports
  now" has been on the hero since the board shipped, is a number a reader is expected to weigh, and had
  no definition anywhere. It needs no `METHODOLOGY_CONSTANTS` token — the window is the backend's
  per-line `statusWindowMinutes`, which varies line to line, and that variability IS the definition (a
  sum of per-line counts, so one rider on two lines counts twice).
- **The registry audit's second finding:** `network.needs-attention` had a definition nobody could
  reach. It and `network.reports-now` are now surfaced from the hero's own tile labels, through
  `metricTooltip(...)` like every other metric on the page. "Lines normal"
  stays plain (the headline popover directly above it IS that sentence) and "Links today" stays plain
  (it is the row count of the feed list further down the page). `network.severity-order` is still
  reachable only through `/methodology`; putting an info trigger on the board's `Severity` sort button
  is a UI decision, not a docs one, and is left open below.
- **`network.line-reports-summary`** ("A line's reports today") — the `MetricDoc` behind the compact
  row's `N reports (X this hour)` label. It **replaced `network.line-history-strip`**, which described
  the deleted per-row service-day strip, and it is the registry entry the row's
  `line-row-reports-popover` renders. It states both numbers (the service-day total, and how much of it
  landed in the hour we are in) and **that it counts reports, not faults** — without that clause the
  bracket reads as a severity score and a busy-but-normal morning looks like a breakdown. It also
  states the fallback: with no service-day reports, or a read that failed, the row shows its own
  shorter window instead and this label is not drawn at all. `REVIEWED_AT_HISTORY_WIDGETS` moved to
  `2026-10-06`, which re-reviews the whole history-widget section (sparkline · row label · heat grid).

### New seams and testids (home-page polish, round 2 · 2b · 2c)

The tone line, the refresh slot and the sparkline placeholder — plus (round 2b) the hero's
card-shaped clipping overlay, which has **no testid of its own**: it is asserted structurally, as
`home-hero`'s first child holding both edge lines. **Removed (round 2):** `line-refresh-ring` /
`line-refresh-ring-arc` — both **restored in round 2c** (the draining donut + spinner back in the
control) — and the hero's brand-rail span (it was never a testid — it was the `bg-brand`
element the round-2 spec asserted _absent_).

- `hero-status-line` (renamed from `hero-countdown-line` in round 2c; the hairline inside the hero's
  top status track — since round 2b, inside the card-shaped clipping overlay rather than its own track
  wrapper) — its `[class]` is the network's tone and that is the WHOLE binding: no `style.width`, no
  inline `style` at all, no store read, nothing to write after a beat tick (the spec pins
  `style.width === ""`
  and `style.transitionDuration === ""` across `secondsRemaining` 30 → 15 → 0 and a paused
  `intervalMs`), so the countdown's testid home is `line-refresh-ring` / `-ring-arc` again. 🔴 Round
  2e added classes to that binding without adding a countdown back: the tone pair (`bg-*` plus the
  `text-*` the glow's `currentColor` needs), the 300ms `transition-colors` fade and the glow class
  itself — so a spec that asserts "no transition" now has to read `style.transitionDuration === ""`
  (still true: the fade is a class) rather than the absence of a transition class. It
  carries no `rounded-*` of its own — the overlay is what cuts it to the card's silhouette.
- `hero-refresh-slot` (the `shrink-0` wrapper holding `app-home-refresh-control` at the right end of
  the headline row). The old placement was asserted by hunting for `[class~="lg:flex"]`, which is a
  class-token substring match that any future gate can silently satisfy; assert this testid and the
  row's `flex items-start justify-between` instead. 🔴 `[data-testid]` on an `InfoPopover` is the
  **PANEL**, not the trigger — to reach the headline's popover in a spec, query
  `row.querySelector("app-info-popover")`.
- `network-sparkline-empty` (the dashed `h-10` placeholder). Its copy distinguishes the two quiet
  states, and the `h-10` is the assertion that the hero does not change height.
- `InfoPopover.iconPosition` is now `"end"` on all six home usages (hero headline, sparkline caption,
  row report tally, Pro heat strip, Pro lines widget, Pro report ranking). The component default is
  still `"start"`, so `/methodology` and the ad slot are pixel-identical — do not "tidy" the default.
  The row's third usage took over from the deleted per-row history surface, so the count is unchanged.
- `InfoPopover`'s panel moved `z-20` → **`z-50`**, the app overlay layer (the nav is `z-[45]`, the
  sticky mobile action bar `z-30`). 🔴 The pair of rules this bought is now load-bearing: a container
  that hosts an `InfoPopover` must not be `overflow-hidden`, and a popover must never be painted
  under chrome. `line-pulse-card` and `line-pulse-row` gave up their clipping and rounded their
  decorative rails instead; the hero card keeps no clipping either — its two decorative edge lines
  are cut by the card-shaped `overflow-hidden rounded-2xl` overlay described above, which hosts no
  popover (and is `pointer-events-none`), so the rule holds. See `MISTAKES.md` for the full entry.

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
- 🔴 **Light-mode brand-orange contrast — a design decision, not a home-page bug.** `--brand`
  `#ee7104` on `--card` measures **3.0:1**, so `text-brand` fails WCAG AA for body text and white on a
  `bg-brand` fill is the same 3.0:1. Dark mode passes (7.56:1 / 8.23:1), so this is the light theme
  alone. **Partly resolved in the polish round 2**: the hero's "Live map", its "Report a delay", the
  mobile bar's Report and the skip link all took the default theme, so the two worst offenders on this
  page are gone. What remains is the official-update **"Open original"** link, at mobile sizes where
  the large-text threshold does not apply. Fixing that still means darkening the site's brand orange —
  an accent chosen for hue identity and already used by the nav, the ad slots and the tracker, so
  changing it for this page would leave two brand oranges in one product. The honest options are a
  design decision (darken the token globally) or a targeted one (stop using `text-brand` for that link
  in light mode, e.g. `--primary`).
- **Station-flow and verification-count widgets — still roadmap, not built.** Two metrics the plan names
  that need backend work before they can be drawn honestly: a **station flow** widget (entries/exits at
  a station over the service day — `LineStatusReportsComponent`'s per-station strip already aggregates
  the reports a reader has loaded, but a flow is a count the backend has to own) and a **verification
  count** (how many sightings were confirmed by a second report — no such relation exists on the
  sighting yet). Neither should be approximated client-side from truncated pages; both need an additive
  backend aggregate first, the same reasoning the per-station strip documents.
- **`network.severity-order` has no in-situ surface.** It is reachable through `/methodology` (and
  `methodology.page.spec.ts` renders one popover per `MetricDoc`, so it is genuinely published), but the
  board's `Severity` sort button has no info trigger of its own. Adding one is a UI decision — a help
  glyph inside a segmented control — rather than a registry gap.

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
