# Component: methodology

## 📌 Purpose & Scope

- **Core Responsibility:** Publishes the public **"How this is counted"** page at `/methodology`
  (`MethodologyPage` + `MethodologySectionComponent`) and the **code-first registry**
  (`src/app/core/methodology/`) that both that page and every `app-info-popover` read copy from. It
  owns presentation, structure and anti-drift. The substance of each rule (formulas, thresholds,
  clocks, episode rules) stays in its owning sibling spec and is only referenced here.
- **Domain/Layer:** Angular Presentation (`src/app/features/methodology/`) over a pure data layer
  (`src/app/core/methodology/`). The route is a `loadComponent` entry in `src/app/app.routes.ts`
  (after `gdpr`, title `"MLPTF | Methodology"`) with `RenderMode.Server` in
  `src/app/app.routes.server.ts`, so the whole method is in the initial HTML for crawlers and link
  previews. It is **not** Firestore- or GraphQL-backed in v1.

### The registry (one registry, two readers)

Three files under `src/app/core/methodology/`:

- `methodology.constants.ts`: `METHODOLOGY_CONSTANTS`, every number that appears in copy, each tagged
  with its owning `source` spec (seven at present). Header comments separate frontend rules and
  display caps from values that mirror backend values. A mirrored value (the service-day hour and bucket
  count, the push cooldown) is pinned only against frontend code, so a backend change fails no test and has
  to be mirrored by hand. Transit numbers (reliability, episodes,
  arrivals, staleness windows) are backend-owned and do not belong here.
- `methodology.content.ts`: `METHODOLOGY_SECTIONS` (8 anchored sections, all `inProgress: true` in v1)
  and `METRIC_DOCS` (one `MetricDoc` per metric, keyed by `id`), with the `MethodologySection` and
  `MetricDoc` interfaces.
- `methodology-render.util.ts`: `renderMethodologyCopy()`, `methodologyTokenValues()`, `metricDoc(id)`,
  `metricTooltip(id)`, `section(id)`, `isReviewStale(lastReviewed, now?)`.

**Loading.** No file in the initial graph imports the registry, so it ships as a shared lazy chunk
(about 20 kB, nearly all of it section and `MetricDoc` prose) fetched by the first page that reads
it: home, `/methodology` and every page with a metric popover. A static import from `main.ts`,
`app.config.ts`, `app.routes.ts` or anything they import moves it into `main` (see
`docs/COMPONENTS.md` → Initial bundle).

**Two readers.** `/methodology` renders `MetricDoc.definition` through `renderMethodologyCopy()`.
Every `InfoPopover` on a metric renders `metricTooltip(id)`: the optional `summary` (tooltip-sized),
falling back to `definition`. A summary is only ever a shorter phrasing of the definition beside it
(METHODOLOGY_DOCS.md §6.1), so the page and the tooltip cannot disagree. `metricDoc()`,
`metricTooltip()` and `section()` **throw** on an unknown id, so a typo fails a test instead of
rendering `undefined`.

### Token rule: never a literal in copy

Any number or rule in copy is a `{{TOKEN}}`, resolved from `METHODOLOGY_CONSTANTS` at render time by
`renderMethodologyCopy()`. A consuming template must **never** type the digit. An unknown token
**throws** (the global `ErrorHandler` is Sentry-backed), and a raw `{{` must never reach the DOM.
`MethodologySectionComponent` routes its body and its `lastReviewed` line through the renderer too.
To change a documented value, edit the constant, not the prose.

### Popover guidance

Every non-obvious number or status gets an `app-info-popover` whose `content` is `metricTooltip(id)`,
never a typed literal. A popover carries **one short paragraph**. Anything longer belongs on
`/methodology`, and the popover's optional `link` (`{ text, routerLink, fragment }`) points at the
owning anchor (`/methodology#<sectionId>`). Consumers are many (`grep -rl '<app-info-popover'`). The
home status chip (`status-info-chip.component.ts`) takes a `linkFragment` input (default
`line-status`), and the passenger chip in `line-pulse-card.component.ts` passes `sightings`. The ad
slot's disclosure is another consumer. DATA_PROVENANCE.md's planned `ProvenanceChipComponent` should
compose the same component rather than re-implement hover and tap (not built yet).

**SSR: the popover host skips hydration.** `InfoPopover`'s host carries `ngSkipHydration` because a
consumer can project `<div popoverExtra>` into a slot that renders inside `@if (_open())`. On the
server `_open()` is false, so the projected node has no DOM counterpart and hydration throws `NG0502`
mid-stream. `@angular/ssr` swallows the throw and the route serves a 22-byte `Internal server error.`
behind HTTP 200. Side effect: Angular discards the host's children and re-renders every
`app-info-popover` on the client. The result is functionally identical; a11y and the public API are
unchanged. A **new** conditionally rendered slot, or any other hydration-incompatible content, needs
the same `ngSkipHydration` remedy plus a server-render spec (`renderApplication`), because a jsdom
`TestBed` spec cannot catch this class of failure. See `MISTAKES.md` entries `[2026-09-24]` (SSR/hydration)
and `[2026-10-07]` (projection inside an `ng-template` under `ngSkipHydration` renders empty).

### In-progress rule

A section whose owning spec has landed its **prose but not its code** renders the "in progress" state
(`data-testid="in-progress"`), naming the owning spec, and **no number**. Never invent a formula or
threshold. All 8 v1 sections are in this state. Spec files live in `z_ideas/` (outside this repo);
see `z_ideas/completed/METHODOLOGY_DOCS.md`. When a sibling spec's code lands, flip its section's
`inProgress` to `false`. Numbers then come from the registry or the backend query, never a literal.

### `ownerRoute: null`: the one documented exception

Sections link to a feature route, **except** `reliability` (its `/review` route is created by
MONTHLY_REVIEW.md, not this work) and `limitations` (no owning route). Both carry `ownerRoute: null`
and render their `sourceSpec` filename instead of a link. Do not invent a route to satisfy the link
rule.

### CMS overlay (documented, **not built**)

If editors later need to edit prose, a `public/methodology` Firestore document keyed by section id
would merge **under** code. Code wins for any section containing a `{{TOKEN}}`, so CMS text can only
replace token-free prose. Formulas stay in code; editorial prose becomes editable. This is
deliberately not built in v1: there is no `onSnapshot`, no editor, and the page stays
`RenderMode.Server`.

### Anti-drift layers

1. **One registry, two readers.** The registry spec enforces that every `summary` renders without an
   unresolved `{{` and is strictly shorter than its `definition`.
2. **Tokens, not digits.** A test mutates a constant and asserts the rendered output changes; an
   unknown token must throw.
3. **Registry completeness.** Every `MetricDoc` has a valid `sectionId`, an `ownerRoute` present in
   `app.routes.ts` (or `null`), a `sourceSpec` ending in `.md`, and a parseable, non-future
   `lastReviewed`. Every section has at least one metric.
4. **Owning-spec rule + PR checklist.** Sibling specs reference constants by name and link to
   `/methodology#<id>` instead of restating values. `.github/pull_request_template.md` requires a
   registry update, a `lastReviewed` bump and `npm test -- --no-watch` when a documented value changes.

## 🔌 Interface & Data Flow

- **`MethodologyPage`** (`features/methodology/methodology.page.ts`): no inputs or outputs. Exposes
  `sections = METHODOLOGY_SECTIONS` to its template and sets `<meta name="description">` in the
  constructor (`inject(Meta).updateTag(...)`). Renders `<app-nav>`, `<h1>How this is counted</h1>`, an
  inline `<app-disclaimer-note>`, one `<app-methodology-section>` per section, a footer
  `<app-disclaimer-note>`, and `<app-footer>`.
- **`MethodologySectionComponent`** (`input.required<MethodologySection>()`): renders the anchored
  `<section [id]>`, the "Last reviewed" date, the body, the in-progress note, the owning-route link (or
  the `sourceSpec` when `ownerRoute` is `null`), and one `app-info-popover` per `MetricDoc` whose
  `sectionId` matches, with that metric's own `lastReviewed` beside it (`data-testid="metric-reviewed"`).
  The body, the section's `lastReviewed` and each metric's `content` go through `renderMethodologyCopy()`.
  A section or metric whose `lastReviewed` is more than `STALE_REVIEW_MONTHS` (6) old, by
  `isReviewStale()` against the clock, gets a "Needs review" pill (`data-testid="needs-review"`). The
  pill is public and informational: it never fails a build, because a calendar date must not break CI.
- **`InfoPopover`** (`src/app/ui/info-popover/info-popover.ts`, selector `app-info-popover`). Inputs:
  - `label`, `content` (already-rendered text), `link`, `testId`
  - `align`: `"start" | "end" | "center"`
  - `showIcon` (default `true`; `false` drops the "i" glyph)
  - `showMethodologyLink` (default `true`; `false` drops the link and demotes the panel to a tooltip)
  - `iconPosition`: `"start" | "end"` (default `"start"`; `"end"` puts the glyph after the content, as
    in the ad slot's "ADVERTISEMENT ⓘ")
  - `triggerClasses` (extra Tailwind classes merged onto the trigger `<button>`, e.g. a wider hover
    target)
  - `triggerTpl` (a consumer-owned trigger control: the component renders no button or glyph of its
    own, and `triggerClasses` does not apply)
  - Projection: the default slot is the trigger label; `[popoverExtra]` adds panel blocks (the home
    chip's window, breakdown and legend).
- **`DisclaimerNote`** (`src/app/ui/disclaimer-note/disclaimer-note.ts`, `app-disclaimer-note`): one
  canonical string, `variant: "inline" | "footer"`, no data dependencies or browser APIs (identical on
  the server). The schedule-derived rail sentence was removed on purpose, because the app shows live
  GTFS data, not schedule estimates. Don't re-add it.
- **Dependencies:** `@angular/platform-browser` (`Meta`), `@angular/router` (`RouterLink`), the
  registry under `core/methodology/`, the shared UI primitives above, and shell chrome
  (`AppNavComponent`, `AppFooterComponent`). No Firebase, no `GraphQLClient`, no HTTP in v1.

## ⚙️ Internal State & Logic

- Signals only, no RxJS. `InfoPopover` owns `_open`, `_hoverCapable` (set in `afterNextRender` from
  `matchMedia("(hover: hover) and (pointer: fine)")`; "no hover" until probed), `_panelId` (empty until
  `afterNextRender`, so SSR and hydration agree), and `_flipAbove`.
- **Popover behaviour contract:**
  - The trigger is a real `<button type="button">` with `aria-label`, `aria-expanded` and `aria-controls`.
  - The panel is a non-modal `role="dialog"` (`tabindex="-1"`) when it renders a link (`showMethodologyLink()`
    on and `link` set). Otherwise it is `role="tooltip"`.
  - Escape closes and returns focus to the trigger. An outside click closes. Focus moving into the panel does not close it.
  - Width is clamped (`max-w-[calc(100vw-2rem)]`), and `align` picks the edge. Position is measured on
    open and clamped to the viewport: shifted horizontally to stay on screen, and flipped above the
    trigger when there is no room below.
- **Hover is tracked on the host** (`mouseenter` / `mouseleave` on `app-info-popover`), so the
  absolutely positioned panel counts as hovered while the cursor crosses onto it. Leaving schedules
  a close after `HOVER_CLOSE_DELAY_MS` (300 ms): short enough that moving between pills feels
  immediate, long enough to reach the panel and its "How this is counted" link. Re-entering cancels
  the pending close. Escape and outside click close immediately and cancel it. The timer is cleared on destroy.
- **One open panel app-wide** (`InfoPopoverRegistry`, `providedIn: "root"`). Every open path (hover,
  focus, click, tap) claims the slot and closes the previous holder. Every close path (delay, Escape,
  outside click, blur, tap-toggle, destroy) releases it. Moving from pill A to pill B is atomic: there
  is no moment where both panels are open. The panel is `absolute … z-50`, above the nav (`z-[45]`)
  and mobile bar (`z-30`), so it wins hit-testing over the pills it overlaps. Those pills never get
  `mouseenter`, so A stays open and no other panel opens under the cursor.
- The renderer computes token values fresh on each call (`methodologyTokenValues()`), so a test or a
  future CMS overlay that mutates a constant is reflected immediately, not frozen at module load.
- **Home copy is folded in:** `PASSENGER_INFO` and `LINE_STATUS_INFO`
  (`features/home/data/status-info.util.ts`) build their `StatusInfo` from `metricDoc(id)`, and
  `PASSENGER_METRIC` (`features/home/data/line-status-metrics.util.ts`) reads the same definitions. The
  home specs keep their test ids and visible text.

## 🧩 Extension Points & Hooks

- **Add a metric:** add a `MetricDoc` to `METRIC_DOCS` (a `{{TOKEN}}` if it has a number, and a
  `summary` if the definition is too long to read in a tooltip). Surface it with an `InfoPopover`
  whose `content` is `metricTooltip(id)`. The completeness spec enforces the rest. No page or template change.
- **Add a documented number:** add a `METHODOLOGY_CONSTANTS` entry (`value` plus owning `source`) and
  reference its `{{TOKEN}}` in copy. Never type the value.
- **Flip a section live:** set `inProgress: false` once the owning spec's code lands, and render the
  numbers from the registry (or from the backend query for backend-owned values).
- **Wire the `sources` section to the backend:** when DATA_PROVENANCE.md's public `dataSources` query
  lands, read it via `graphqlResource()` and render provider, license, sourceUrl and coverage from it.
  The section then drops its in-progress state. Never hardcode a license string. Not wired yet; only
  a comment in `methodology.page.ts` mentions it.
- **New `InfoPopover` consumer:** compose `app-info-popover`; don't re-implement hover, tap, Escape or
  outside-click handling. Hover is tracked on the **host**, so when only a small pill should be the
  hotspot, use a shrink-wrapped position (`self-center`, not a stretched flex child). The ad slot does
  exactly this, so the panel does not open from anywhere across the caption row. Reach for
  `iconPosition` / `triggerClasses` rather than a second glyph or a second pill's padding.
- **Route and chrome:** the route is registered through `loadComponent`, so it can be moved, guarded or
  given resolvers without touching the page. The footer link is the only nav entry. It is deliberately
  **not** in `MODULE_NAV_LINKS` (`src/app/shell/nav-config.ts`), which is the app's module switcher.

## 💡 Potential Feature Opportunities

- **Deep-linked per-metric anchors:** each `MetricDoc.id` is stable. Rendering a per-metric `<a id>`
  (with popovers linking to `#<metricId>`) would let a shared link land on one definition. Not rendered today.
- **Search/filter over definitions:** `METRIC_DOCS` is plain data, so a client-side filter over
  `title` / `definition` needs no schema change. The page has no search today.

## 💡 Potential AI Feature Opportunities

- **Plain-language definition drafting:** every definition is one registry string with a known
  `sourceSpec`, so an AI assistant could draft or tighten it, with the registry as the single diff target.
- **"What changed" summary:** the registry is versioned in git. An AI diff summary over
  `methodology.content.ts` and `methodology.constants.ts` could tell admins which documented rule moved
  and which `lastReviewed` dates need bumping.
