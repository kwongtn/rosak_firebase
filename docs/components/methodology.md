# Component: methodology

## 📌 Purpose & Scope

- **Core Responsibility:** Publishes the public **"How this is counted"** page at `/methodology`
  (`MethodologyPage` + `MethodologySectionComponent`) and the one **code-first registry**
  (`src/app/core/methodology/`) that both that page and every shared `app-info-popover` read their
  copy from. It owns presentation, structure and anti-drift; the substance of every rule (formulas,
  thresholds, clocks, episode rules) stays owned by the sibling specs and is only referenced here.
- **Domain/Layer:** Angular Presentation (`src/app/features/methodology/`) over a pure data layer in
  `src/app/core/methodology/`. The route is a `loadComponent` entry in `src/app/app.routes.ts`
  (immediately after `gdpr`, `title: "MLPTF | Methodology"`) and `RenderMode.Server` in
  `src/app/app.routes.server.ts`, so the whole method is in the initial HTML for crawlers and link
  previews. It is **not** a Firestore CMS page and **not** GraphQL-backed in v1.

### The registry contract (one registry, two readers)

Everything a rider can read about a number comes from three files under
`src/app/core/methodology/`:

- `methodology.constants.ts` — `METHODOLOGY_CONSTANTS`, the documented values that appear in copy,
  each tagged with the spec that owns it. v1 ships exactly one (`STALE_REVIEW_MONTHS: 6`); every
  transit number is backend-owned and has not landed.
- `methodology.content.ts` — `METHODOLOGY_SECTIONS` (the 8 anchored sections, all `inProgress: true`
  in v1) and `METRIC_DOCS` (6 `line-status.*` + 7 `passenger.*` + 1 `line-pulse.*` definitions),
  with the `MethodologySection` / `MetricDoc` interfaces.
- `methodology-render.util.ts` — `renderMethodologyCopy()`, `methodologyTokenValues()`,
  `metricDoc(id)` and `section(id)`.

**One registry, two readers.** `/methodology` renders `MetricDoc.definition` through
`renderMethodologyCopy()`; every `InfoPopover` on a metric renders the same string from the same
`metricDoc(id).definition`. The page and the tooltip therefore cannot drift by construction
(METHODOLOGY_DOCS.md §6.1). `metricDoc()` and `section()` **throw** on an unknown id, so a typo
fails a test instead of rendering `undefined`.

### The token rule — never a literal in a consuming template

Any number or rule in copy is a `{{TOKEN}}` resolved from `METHODOLOGY_CONSTANTS` at render time by
`renderMethodologyCopy()`. A consuming template must **never** type the digit itself. An unknown
token **throws** (the global `ErrorHandler` is Sentry-backed); a raw `{{` must never reach the DOM.
`MethodologySectionComponent` renders its body and even its `lastReviewed` line through the
renderer so nothing can bypass it. To change a documented value: edit the constant, not the prose.

### Popover guidance — every non-obvious number gets one

**Every non-obvious number or status gets an `app-info-popover`**, and the popover's `content` must
be `metricDoc(id).definition` rendered with the current constants, never a literal typed into the
consuming component. A popover carries **one precise paragraph**; anything longer belongs on
`/methodology`, and the popover's optional `link` (`{ text, routerLink, fragment }`) points at the
owning section anchor (`/methodology#<sectionId>`). The home status chips
(`status-info-chip.component.ts`) and the `MethodologySectionComponent` metric rows are the two
existing consumers; each chip carries a `linkFragment` input (default `line-status`) so it can
deep-link to the section that owns **its** metric — the passenger chip passes `sightings`.
DATA_PROVENANCE.md's `ProvenanceChipComponent` is expected to compose the same
component rather than re-implement hover/tap.

**SSR: the popover host skips hydration.** `InfoPopover`'s host carries `ngSkipHydration` because a
consumer can project `<div popoverExtra>` into `<ng-content select="[popoverExtra]" />`, which is
rendered inside `@if (_open())`. On the server `_open()` is false, so the projected node has no DOM
counterpart and Angular's hydration serializer throws `NG0502` mid-stream; `@angular/ssr` then
swallows the throw and the route serves a 22-byte `Internal server error.` behind HTTP 200. The
consequence is that every `app-info-popover` re-renders on hydration instead of hydrating; the
server-rendered markup is unaffected. Anyone projecting `[popoverExtra]` is already covered by this,
but a **new** conditionally-rendered slot (or any other hydration-incompatible content) needs the
same `ngSkipHydration` remedy and a server-render spec (`renderApplication`), because a jsdom
`TestBed` spec cannot catch this class of failure. See `MISTAKES.md` (2026-09-24).

### In-progress rule

A section whose owning spec has landed its **prose but not its code** renders the "in progress"
state (`data-testid="in-progress"`) naming the owning spec, and **no number** — never an invented
formula or threshold. v1's 8 sections are all in this state (METHODOLOGY_DOCS.md lines 31-32,
259-264). When a sibling spec's code lands, its section's `inProgress` flips to `false` and the
numbers come from the registry or the backend query, still never a literal.

### `ownerRoute: null` — the one documented exception

Every section links to a feature route **except** where no route exists yet: `reliability`
(its `/review` route is created by MONTHLY_REVIEW.md, not this work) and `limitations` (no owning
route). Both carry `ownerRoute: null` and the section renders its `sourceSpec` filename instead of a
link. Do not invent a route to satisfy the link rule.

### CMS overlay escape hatch (documented, **not built**)

If non-technical editors later need to edit prose, add a `public/methodology` Firestore document
keyed by section id and merge it **under** code: code wins for any section containing a `{{TOKEN}}`,
so a CMS string can replace token-free prose only. Formulas stay in code, editorial prose becomes
editable. This is deliberately **not built in v1** — there is no `onSnapshot`, no editor, and the
page stays `RenderMode.Server`.

### Anti-drift layers

1. **One registry, two readers** — page and popover read the same definition string.
2. **Tokens, not digits** — a test mutates a constant and asserts the rendered output changes, and
   asserts an unknown token throws.
3. **Registry completeness** — every `MetricDoc` has a valid `sectionId`, an `ownerRoute` present in
   `app.routes.ts` (or `null`), a `sourceSpec` ending in `.md`, and a parseable, non-future
   `lastReviewed`; every section has ≥1 metric.
4. **Owning-spec rule + PR checklist** — sibling specs reference constants by name and link to
   `/methodology#<id>` instead of restating values; `.github/pull_request_template.md` carries the
   checklist line requiring a registry update + `lastReviewed` bump + `npm test -- --no-watch`.

## 🔌 Interface & Data Flow

- **`MethodologyPage`** (`features/methodology/methodology.page.ts`): no inputs or outputs. Exposes
  `sections = METHODOLOGY_SECTIONS` to its template and sets the route's
  `<meta name="description">` in the constructor (`inject(Meta).updateTag(...)`). Renders
  `<app-nav>`, the `<h1>How this is counted</h1>`, an inline `<app-disclaimer-note>` under the
  heading, one `<app-methodology-section>` per section, a footer `<app-disclaimer-note>`, and
  `<app-footer>`.
- **`MethodologySectionComponent`** (`input.required<MethodologySection>()`): renders the anchored
  `<section [id]>`, the "Last reviewed" date, the body, the in-progress note, the owning-route link
  (or the `sourceSpec` when `ownerRoute` is `null`), and one `app-info-popover` per `MetricDoc` whose
  `sectionId` matches. Its `_body`, `_lastReviewed` and each metric's `content` all go through
  `renderMethodologyCopy()`.
- **`InfoPopover`** (`src/app/ui/info-popover/info-popover.ts`, selector `app-info-popover`):
  `label`, `content` (already-rendered text), optional `link`, `align: "start" | "end"`, and
  `testId` inputs. Content projection: default slot is the trigger label; `[popoverExtra]` is extra
  panel blocks (the home chip's window/breakdown/legend).
- **`DisclaimerNote`** (`src/app/ui/disclaimer-note/disclaimer-note.ts`, selector
  `app-disclaimer-note`): one canonical disclaimer string, `variant: "inline" | "footer"`, no data
  dependencies and no browser APIs (renders identically on the server).
- **Dependencies:** `@angular/platform-browser` (`Meta`), `@angular/router` (`RouterLink`), the
  registry under `core/methodology/`, the shared UI primitives above, and shell chrome
  (`AppNavComponent`/`AppFooterComponent`). No Firebase, no `GraphQLClient`, no HTTP in v1.

## ⚙️ Internal State & Logic

- All signals, no RxJS. `InfoPopover` owns `_open`, `_hoverCapable` (measured via
  `matchMedia("(hover: hover) and (pointer: fine)")`, default "no hover" until probed) and
  `_panelId` (starts empty so SSR and hydration agree, filled in `afterNextRender`).
- **a11y/behaviour (the five defects the extraction fixed):** the trigger is a real
  `<button type="button">` with `aria-label`/`aria-expanded`/`aria-controls`; the panel is a
  non-modal `role="dialog"` (with `tabindex="-1"`) when it carries a link and `role="tooltip"`
  otherwise; Escape closes and returns focus to the trigger; outside click closes; focus moving into
  the panel does not close it; the panel is width-clamped (`max-w-[calc(100vw-2rem)]`) and `align`
  flips its edge.
- The renderer computes token values fresh on each call (`methodologyTokenValues()`), so a test (or
  a future CMS overlay) that mutates a constant is reflected immediately rather than frozen at
  module load.
- The `home` copy is folded in: `PASSENGER_INFO` / `LINE_STATUS_INFO`
  (`features/home/data/status-info.util.ts`) build their `StatusInfo` from `metricDoc(id)`, and
  `PASSENGER_METRIC` (`features/home/data/line-status-metrics.util.ts`) reads the same definitions —
  the home specs keep their test ids and visible text.

## 🧩 Extension Points & Hooks

- **Add a metric:** add one `MetricDoc` to `METRIC_DOCS` (a `{{TOKEN}}` if it has a number), surface
  it with an `InfoPopover` whose `content` is `renderMethodologyCopy(metricDoc(id).definition)`, and
  the completeness spec enforces the rest. No page or template change.
- **Add a documented number:** add a `METHODOLOGY_CONSTANTS` entry (`value` + owning `source`) and
  reference its `{{TOKEN}}` in copy — never type the value.
- **Flip a section live:** set `inProgress: false` once the owning spec's code lands and render the
  numbers from the registry (or the backend query for backend-owned values).
- **Wire the `sources` section to the backend:** when DATA_PROVENANCE.md's public `dataSources`
  query lands, read it via `graphqlResource()` and render provider/license/sourceUrl/coverage from
  it; the `sources` section then drops its in-progress state. Never hardcode a license string.
- **A new `InfoPopover` consumer:** compose `app-info-popover` rather than re-implementing
  hover/tap/Escape/outside-click; the panel, its a11y wiring and its SSR-safe id are already done.
- **The CMS overlay seam:** the `public/methodology` merge described above is the documented,
  unbuilt extension point for editorial prose.
- **Route/chrome:** the route is registered through `loadComponent`, so it can be moved, guarded or
  given resolvers without touching the page; the footer link is the only nav entry (it is
  deliberately **not** in `MODULE_NAV_LINKS`, which is the app's module switcher).

## 💡 Potential Feature Opportunities

- **Admin-only "needs review" badge:** the `STALE_REVIEW_MONTHS` constant already exists; a section
  whose `lastReviewed` is older than that window could show a badge, visible only to
  `AuthService.isAdmin`, never a CI failure.
- **Deep-linked per-metric anchors:** each `MetricDoc` already has a stable `id`; rendering a
  per-metric `<a id>` (and having popovers link to `#<metricId>`) would let a shared link land on one
  definition instead of the whole section.
- **Search/filter over definitions:** `METRIC_DOCS` is plain data, so a client-side filter over
  `title`/`definition` needs no schema change.

## 💡 Potential AI Feature Opportunities

- **Plain-language definition drafting:** because every definition is one registry string with a
  known `sourceSpec`, an AI assistant could draft or tighten a `definition` for review, with the
  registry as the single diff target.
- **"What changed" summary:** the registry is versioned in git; an AI diff summary over
  `methodology.content.ts` / `methodology.constants.ts` could tell admins which documented rule
  moved and which `lastReviewed` dates need bumping.
