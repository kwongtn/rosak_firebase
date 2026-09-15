# Component: gdpr

## 📌 Purpose & Scope

- **Core Responsibility:** Renders the public `/gdpr` compliance page — a read-only, admin-authored
  checklist of GDPR-related requirements (each flagged adhered / not adhered, with rich-text detail
  and an optional note), grouped into collapsible sections. The component itself owns no business
  logic; it is a thin, lazily-loaded presentation shell over a single Firestore document.
- **Domain/Layer:** Angular Presentation — a standalone, route-level "page" component
  (`app-gdpr`), lazy-loaded via `loadComponent` at path `/gdpr` (`src/app/app.routes.ts:32-34`).
  Client-rendered only (no SSR path); ported 1:1 in behavior from the legacy app's
  `compliance/gdpr.component.ts`.

## 🔌 Interface & Data Flow

- **Inputs / Props / Signals:** None. The component takes no `@Input()`s or `input()` signals —
  it is a routed page with no parent-supplied configuration. All content comes from Firestore at
  runtime.
- **Outputs / Events / API Responses:** No `@Output()`s or emitted events (leaf/page component).
  Internally it exposes derived read-only signals to its own template:
  - `isLoading: Signal<boolean>` — `true` until the first Firestore snapshot resolves (or errors).
  - `definition: Signal<string>` — computed from the live doc, `""` default.
  - `intro: Signal<string>` — computed from the live doc, `""` default.
  - `details: Signal<GdprDetail[]>` — computed from the live doc, `[]` default.
  - Data source: a real-time `onSnapshot` subscription on Firestore doc `public/gdpr`, typed as
    `PublicGdprDocument` (`src/app/features/gdpr/data/gdpr.model.ts`). This is admin-edited CMS
    content that the app never writes to.
- **Dependencies:**
  - `firebase/app`, `firebase/firestore` — direct Firebase SDK usage (`getApps`/`initializeApp`,
    `getFirestore`, `doc`, `onSnapshot`), reusing the already-initialized app if present rather than
    going through a shared Angular Firestore service/injection token.
  - `src/environments/environment.ts` — supplies `environment.firebase` config for
    `initializeApp`.
  - `@angular/common` (`isPlatformBrowser`) + `PLATFORM_ID` — guards Firestore access so it only
    runs in the browser (no-op during SSR/prerender).
  - `src/app/ui/badge/badge.ts` (`HlmBadge`) — renders the "Adhered" / "Not adhered" status pill
    (`variant="success" | "destructive"`).
  - `src/app/ui/skeleton/skeleton.ts` (`HlmSkeleton`) — loading-state placeholder blocks.
  - `src/app/shell/app-nav/app-nav.component.ts` (`AppNavComponent`) and
    `src/app/shell/app-footer/app-footer.component.ts` (`AppFooterComponent`) — shared page chrome
    (top nav, bottom build-info footer); not gdpr-specific.
  - `./data/gdpr.model.ts` — local type definitions (`PublicGdprDocument`, `GdprDetail`,
    `GdprDetailChild`) describing the Firestore document shape.

## ⚙️ Internal State & Logic

- State is entirely Angular Signals, no RxJS/BehaviorSubject and no NgRx/global store involvement:
  - `_data: WritableSignal<PublicGdprDocument | undefined>` — private, set only from the
    `onSnapshot` callback.
  - `isLoading: WritableSignal<boolean>` — flips to `false` on the first snapshot (success or
    error).
  - `definition`, `intro`, `details` — `computed()` projections over `_data()` with safe
    fallbacks (`""` / `[]`), so the template never needs null-checks on the raw document.
- Subscription lifecycle: the `onSnapshot` listener is established in the constructor (browser
  only) and explicitly torn down in `ngOnDestroy` via the stored `Unsubscribe` handle — a manual
  subscribe/unsubscribe pattern rather than an `async` pipe or `takeUntilDestroyed()`.
- Per-item expand/collapse state is **not** component-managed: each detail child renders as a
  native `<details open>` element, which owns its own open/closed state in the DOM. This is a
  deliberate simplification versus the old app's ng-zorro `nz-collapse-panel` + `isCollapsed`
  bookkeeping (documented in the file's header comment).
- Firestore content fields (`definition`, `intro`, `child.details`, `child.notes`) are bound via
  `[innerHTML]`, i.e. rendered as trusted rich text/HTML sourced from the CMS document rather than
  escaped plain text.

## 🧩 Extension Points & Hooks

- **Route-level swap-in:** Registered purely through `loadComponent` in `app.routes.ts`, so the
  page can be relocated, wrapped in a route guard, or given resolvers without touching the
  component itself.
- **Document schema growth:** `GdprDetail` / `GdprDetailChild` are the sole contract with the CMS
  document; adding new optional fields (e.g. a severity level, last-reviewed date, or external
  reference link) is additive and non-breaking as long as existing consumers default sensibly.
- **Shared UI primitives:** Status rendering goes through `HlmBadge`'s `variant` input, so new
  states beyond adhered/not-adhered (e.g. "partial", "in progress") could be added by extending the
  model with a variant field mapped to existing badge variants (`warning`, `info`, etc.) without
  changing the badge component.
- **Loading/empty/error states:** The `isLoading` / `details().length === 0` branches in the
  template are the natural seams for richer states (e.g. distinguishing "still loading" from
  "Firestore read failed" — currently both collapse into the same non-loading, empty-details view
  since the `onSnapshot` error callback only clears `isLoading`).
- **SSR:** The `isPlatformBrowser` guard is a ready-made seam for adding a server-fetched initial
  payload later, matching the comment's note that there is "no SSR benefit" today only because the
  content changes by hand, not by request.

## 💡 Potential Feature Opportunities

- **Filter by adherence status ("show only not-adhered"):** Ready now — every `GdprDetailChild`
  already carries the `adhered` boolean the badge renders from, and the template already tracks
  each child by `child.title`. A `computed()` filter layered on top of the existing `details()`
  signal (driven by a new small filter-state signal) needs no Firestore schema change.
- **Deep-link directly to one compliance item:** Ready now — `group.title` / `child.title` are
  already used as the `@for` `track` keys, so they're effectively stable identifiers. Slugifying
  them into element `id`s and reading a URL fragment inside the existing `isPlatformBrowser` guard
  would let a shared link auto-scroll to (and expand) one specific item.
- **Bulk expand/collapse all:** Not ready today. Each item is a native `<details open>` element
  that owns its own open/closed state in the DOM (a deliberate simplification noted in the file's
  header comment) — there is no component-managed signal to toggle en masse. Context for future
  LLMs: this requires replacing the native-`<details>` approach with a signal-backed open/closed
  set (e.g. `WritableSignal<Set<string>>` keyed by title) before "Expand all" / "Collapse all"
  controls become possible.
- **Surface a "last reviewed" date per item:** Not ready today. The Extension Points section
  flags a last-reviewed date as a natural schema addition, but `GdprDetail` / `GdprDetailChild`
  (`src/app/features/gdpr/data/gdpr.model.ts`) currently has no timestamp field at all. Context for
  future LLMs: this needs a CMS/Firestore field added to the `public/gdpr` document (and whatever
  admin tool authors it) before any model or template change is possible.

## 💡 Potential AI Feature Opportunities

- **Compliance drafting/review assistant:** Since each checklist item already carries a
  boolean adherence flag plus free-form rich-text `details`/`notes`, an AI assistant could suggest
  or draft the `details`/`notes` copy for admins editing the underlying Firestore document, or flag
  internal inconsistencies (e.g. "not adhered" items with no explanatory notes).
- **Plain-language / multilingual summarization:** The `definition`/`intro`/`details` fields are
  static rich text; an AI layer could generate an on-demand plain-language summary or translated
  version per section for end users, without altering the CMS schema.
- **Change-aware notifications:** Because the page already subscribes to live Firestore updates
  (`onSnapshot`), it's structurally trivial to add an AI-generated diff/summary ("What changed in
  our GDPR compliance since you last visited") whenever the `public/gdpr` document is updated by an
  admin.
