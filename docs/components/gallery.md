# Component: gallery

## 📌 Purpose & Scope

- **Core Responsibility:** Renders the public, read-only `/gallery` page — a chronological (year-grouped, newest-first), incrementally-paginated feed of community-submitted spotting photos (`Media` records), with a "jump to year" sidebar and a full-screen detail viewer opened via a `:mediaId` route param. It is a 2026 rewrite of a prior implementation that fetched the entire media history in one unpaginated request; this version deliberately uses the backend's Relay-style `medias` connection to load small pages on demand instead.
- **Domain/Layer:** Angular Presentation (standalone, lazy-loaded routed page + 3 child presentational components + pure data/layout utilities). No backend or edge-function code lives here — it consumes an existing GraphQL API.

## 🔌 Interface & Data Flow

**`GalleryPage`** (`gallery.page.ts`, selector `app-gallery`, route: `matcher: pathWithOptionalParamMatcher("gallery", "mediaId")` in `app.routes.ts`, so `/gallery` and `/gallery/:mediaId` are one route/one component instance — avoids destroying/recreating the page, and its already-loaded feed, on photo open/close)

- **Inputs:** `mediaIdParam = input<string | undefined>(undefined, { alias: "mediaId" })` — undefined on the bare `/gallery` path (closed viewer state); a value opens (or deep-links to) that media.
- **Outputs:** None (top-level routed page). Navigates via `Router.navigate(["/gallery", id])` / `["/gallery"]` to keep the URL in sync with the open/closed viewer.
- **Internal computed data:** `yearGroups: YearGroup[]` (`{ year, items: MediaNode[] }[]`, derived from loaded `edges`), `yearCounts` (sorted desc from a separate cheap query).

**`JustifiedGridComponent`** (`justified-grid/justified-grid.component.ts`, selector `app-justified-grid`)

- **Inputs:** `items = input.required<MediaNode[]>()`.
- **Outputs:** `imageClick = output<MediaNode>()`.
- Exports the constant `TARGET_ROW_HEIGHT = 220` (also reused by `gallery.page.ts` to size loading skeletons).

**`MediaViewerComponent`** (`media-viewer/media-viewer.component.ts`, selector `app-media-viewer`)

- **Inputs:** `media = input.required<MediaNode>()`.
- **Outputs:** `close = output<void>()`.

**`GalleryYearSliderComponent`** (`year-slider/gallery-year-slider.component.ts`, selector `app-gallery-year-slider`)

- **Inputs:** `years = input.required<MediaYearCount[]>()`, `activeYear = input<number | null>(null)`, `isBusy = input(false)`.
- **Outputs:** `yearSelected = output<number>()`.

**API responses (GraphQL, `data/gallery.queries.ts`):**

- `MEDIAS_QUERY` (`MediasFeed`) — Relay connection `medias(first, after, order: { created: DESC })` → `{ totalCount, pageInfo: { hasNextPage, endCursor }, edges: [{ cursor, node: MediaNode }] }`. `MediaNode = { id, createdDate, width, height, file: { url } | null, uploader: { nickname } }`.
- `MEDIA_YEAR_COUNTS_QUERY` (`MediaYearCounts`) — cheap, metadata-only `mediasGroupByPeriod(type: YEAR) { year count }`, used solely to populate the year-slider (never to load images, and never with `medias` sub-selected).
- No mutations; the feature is entirely read-only.

**Dependencies:**

- `GraphQLClient` (`core/graphql/graphql-client.ts`) — imperative `.request<TData, TVars>(query, variables)` used for the paginated `medias` calls (one-shot fetch, not resource-bound, since the page drives its own accumulation/pagination logic).
- `graphqlResource()` (same file) — a `httpResource`-based reactive query wrapper with built-in exponential-backoff auto-retry; used only for the one-shot `MEDIA_YEAR_COUNTS_QUERY`.
- `ToastService` (`ui/toast/toast.service.ts`) — thin wrapper over `@spartan-ng/brain/sonner`'s `toast`; used for load-failure/"still loading"/"not found" user feedback.
- `HlmButton`, `HlmSkeleton` (`ui/button`, `ui/skeleton`) — Spartan/Helm UI primitives for the "Load more" button and initial-load skeleton rows.
- `AppNavComponent`, `AppFooterComponent` (`shell/app-nav`, `shell/app-footer`) — shared page chrome.
- `Router` (`@angular/router`) — URL sync for the open media (`/gallery/:mediaId`).
- `PLATFORM_ID`/`isPlatformBrowser` — gates browser-only work (DOM scroll, `ResizeObserver`, `document.body` scroll lock) for SSR safety.
- Third-party: `@spartan-ng/brain/sonner` (via `ToastService`), Angular's built-in `DatePipe` (media-viewer), native `ResizeObserver` (justified-grid).
- Pure, dependency-free utilities: `data/imgur.util.ts` (`getImgurThumbnail`, Imgur URL-suffix thumbnail trick) and `data/justified-layout.util.ts` (`computeJustifiedRows`, Flickr-style row-packing algorithm) — both framework-agnostic and independently unit-testable.

## ⚙️ Internal State & Logic

- **`GalleryPage`** holds all feed state as Angular **signals**: `edges` (accumulated `MediaNode` edges across all loaded pages), `hasMore`, `isLoading`, `isJumping`, `jumpTargetYear`, `selectedMedia`. `yearGroups` and `_loadedYears` are `computed()` from `edges`. A single `inFlightLoad: Promise<boolean>` field (not a signal) de-duplicates concurrent `loadMore()` calls, since the constructor's initial load and a same-tick deep-link `openMediaById()` can race.
- **Pagination model:** `edges` only ever grows (append-only cursor accumulation); there is no server-side year filter, so `jumpToYear()`/`openMediaById()` both funnel through a shared `loadUntil()` loop that pages forward (at a larger `JUMP_PAGE_SIZE=100`, with a `JUMP_REQUEST_DELAY_MS=200` throttle and a `MAX_JUMP_PAGES=100` safety cap) until the target year/id is found or the feed is exhausted.
- **URL ↔ state sync:** an `effect()` in the constructor watches `mediaIdParam` and opens/closes `selectedMedia` to match; UI-driven open/close instead sets the signal directly (for instant feedback) and navigates separately, relying on the effect's own already-open check to no-op on the resulting route callback.
- **`JustifiedGridComponent`** tracks `containerWidth` as a signal fed by a `ResizeObserver` (set up in `afterNextRender`, browser-only), and recomputes `rows` via the pure `computeJustifiedRows()` utility whenever `items()` or `containerWidth()` change — no state persists beyond the current input/viewport.
- **`MediaViewerComponent`** has no reactive state of its own beyond its inputs; it toggles `document.body.style.overflow` in its constructor/`ngOnDestroy` as a scroll-lock side effect, and listens for `Escape` via `@HostListener`.
- **`GalleryYearSliderComponent`** is fully stateless/presentational — pure input → template rendering.

## 🧩 Extension Points & Hooks

- **`JustifiedGridComponent`** and **`MediaViewerComponent`** are decoupled, reusable presentational components driven entirely by `input`/`output` — either could be reused elsewhere for any `MediaNode[]`/`MediaNode` without touching `GalleryPage`.
- **`computeJustifiedRows()`** and **`getImgurThumbnail()`** are pure, generic-typed (`JustifiedItem`, `JustifiedCell<T>`, `JustifiedRow<T>`) utility functions with no Angular or gallery-specific coupling — usable for any width/height-bearing item list or Imgur URL elsewhere in the app.
- **`graphqlResource()`** is a shared, reusable reactive-query primitive (auto-retry, SSR TransferState) that any feature can adopt; the gallery only exercises a fraction of its surface (`data`, no manual `retryNow()` usage here).
- The route matcher pattern (`pathWithOptionalParamMatcher`) that keeps `/gallery` and `/gallery/:mediaId` as one component instance is a reusable routing convention already applied to `/insiden` as well.
- No content-projection (`ng-content`) slots or custom decorators/interceptors exist in this feature — extension is via composition (new child components/inputs) rather than injected hook points.

## 💡 Potential Feature Opportunities

- **Shareable/copyable deep links from the viewer:** the route already syncs `selectedMedia` to `/gallery/:mediaId` via `Router.navigate` and the `mediaIdParam` input, so a "copy link" affordance in `MediaViewerComponent` (emitting through a new `output` or calling `ToastService` on copy) is a small additive change with no new state or backend work.
- **Keyboard prev/next navigation in the viewer:** `MediaViewerComponent` already listens for `Escape` via `@HostListener`, establishing the pattern; adding `ArrowLeft`/`ArrowRight` handlers is ready now, but needs the ordered `MediaNode[]` (or neighbor ids) passed down as a new input from `GalleryPage`'s `edges`, since the viewer currently only receives a single `media`.
- **Infinite scroll instead of the "Load more" button:** `GalleryPage` already exposes `hasMore`, `isLoading`, and a de-duplicated `loadMore()` (guarded by the `inFlightLoad` promise), so swapping the manual `HlmButton` click for a browser-only `IntersectionObserver` sentinel (guarded by `isPlatformBrowser`, matching the existing `ResizeObserver` pattern in `JustifiedGridComponent`) is structurally ready today.
- **Filter the feed by uploader:** `MediaNode.uploader.nickname` is already fetched on every edge, so surfacing it in the UI is easy, but actually filtering server-side is **not ready** — `MEDIAS_QUERY`'s `medias` connection has no filter argument today (the AI section above notes the same gap as "the backend's currently-absent `MediaFilter`"). Context for future LLMs: this needs a new `uploader`/`MediaFilter` argument added to the Strawberry `medias` resolver in `rosak_backend` before the frontend can do anything beyond client-side filtering of already-loaded pages.
- **Bulk-download a year's photos:** each `MediaNode` already carries `file.url`, so client-side batch download (e.g. a "download this year" action per `yearGroups` entry) is largely ready, but there is currently no zip/bundling service or download-progress UI in the app. Context for future LLMs: this would need a new small utility/service (e.g. fetch-and-zip in the browser, or a backend batch-export endpoint if large galleries make client-side zipping impractical) — nothing today provides multi-file download orchestration.

## 💡 Potential AI Feature Opportunities

- **Auto-generated alt text / accessible descriptions:** every `<img>` in the grid and viewer currently renders `alt=""`; an image-captioning model could populate meaningful alt text and searchable metadata at ingestion time, improving accessibility and enabling text search over a currently opaque photo feed.
- **Smart "jump to" / semantic search:** the year-slider only supports coarse year-bucket navigation (paging through `created`-order results with no server-side filter). A vector-embedding index over photo content or uploader/date metadata could power natural-language or visual similarity search/filtering without waiting on the backend's currently-absent `MediaFilter`.
- **Content moderation / duplicate detection:** since ingestion is bot-driven (Discord/Telegram, per the linked rewrite notes) with no human upload gate, an AI moderation pass (NSFW/spam/duplicate-image detection) could run as a pre-processing step before photos reach this public, unauthenticated gallery.
