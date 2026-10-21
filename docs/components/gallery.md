# Component: gallery

## 📌 Purpose & Scope

- **Core Responsibility:** The public, read-only `/gallery` page. It shows a chronological, year-grouped, newest-first feed of community spotting photos (`Media` records), with a "jump to year" slider and a full-screen viewer opened by a `:mediaId` route param. Pages load on demand through the backend's Relay-style `medias` connection. The connection is used instead of `mediasGroupByPeriod`, which has no pagination argument and loads every row on each call.
- **Domain/Layer:** Angular Presentation (standalone, lazy-routed page, three presentational children, pure utilities). No backend code lives here. It consumes an existing GraphQL API read-only.

## 🔌 Interface & Data Flow

**`GalleryPage`** (`gallery.page.ts`, `app-gallery`). Route: `pathWithOptionalParamMatcher("gallery", "mediaId")` in `app.routes.ts`. `/gallery` and `/gallery/:mediaId` are one route and one component instance, so opening or closing a photo does not destroy the page or its loaded feed.

- **Input:** `mediaIdParam = input<string | undefined>(undefined, { alias: "mediaId" })`. `undefined` means the viewer is closed. A value opens, or deep-links to, that media.
- **Output:** none (routed page). Navigates with `Router.navigate(["/gallery", id])` / `["/gallery"]` to keep the URL in sync.
- **Computed:** `yearGroups: YearGroup[]` (`{ year, items: MediaNode[] }[]`, derived from loaded `edges`). `yearCounts` is sorted descending, from the separate year-count aggregate. That aggregate is requested in the browser only (see `MEDIA_YEAR_COUNTS_QUERY` below), so it is empty in the server HTML.

Child components:

| Component (file)                                                                                         | Inputs                                                                                           | Outputs                 |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------- |
| `JustifiedGridComponent` (`justified-grid/justified-grid.component.ts`, `app-justified-grid`)            | `items` (required `MediaNode[]`)                                                                 | `imageClick: MediaNode` |
| `MediaViewerComponent` (`media-viewer/media-viewer.component.ts`, `app-media-viewer`)                    | `media` (required `MediaNode`)                                                                   | `close: void`           |
| `GalleryYearSliderComponent` (`year-slider/gallery-year-slider.component.ts`, `app-gallery-year-slider`) | `years` (required `MediaYearCount[]`), `activeYear` (default `null`), `isBusy` (default `false`) | `yearSelected: number`  |

`TARGET_ROW_HEIGHT = 220` is exported from `JustifiedGridComponent` and reused by `gallery.page.ts` to size loading skeletons.

**GraphQL** (`data/gallery.queries.ts`; read-only, no mutations):

- `MEDIAS_QUERY` (`MediasFeed`): `medias(first, after, order: { created: DESC })` → `{ totalCount, pageInfo { hasNextPage, endCursor }, edges [{ cursor, node: MediaNode }] }`. `MediaNode = { id, createdDate, width, height, file: { url } | null, uploader: { nickname } }`.
- `MEDIA_YEAR_COUNTS_QUERY` (`MediaYearCounts`): metadata-only `mediasGroupByPeriod(type: YEAR) { year count }`, a GROUP BY aggregate kept off the SSR path. `GalleryPage` requests it in the browser only (its `graphqlResource()` request function returns `undefined` on the server), because SSR holds the response until an `httpResource` settles and the counts feed nothing but the year slider. The slider fills in after hydration and reserves its height meanwhile (`GalleryYearSliderComponent` is `invisible` with a `min-height` while empty). It never loads images and never sub-selects `medias`.

**Dependencies:**

- `GraphQLClient.request()` (`core/graphql/graphql-client.ts`): one-shot paginated `medias` calls. The page drives its own accumulation, so the calls are not resource-bound.
- `graphqlResource()` (same file): `httpResource` wrapper with exponential-backoff retry. Used only for `MEDIA_YEAR_COUNTS_QUERY`, and only in the browser.
- `ToastService` (`ui/toast/toast.service.ts`, wraps `@spartan-ng/brain/sonner`): load-failure, "still loading" and "not found" feedback.
- `HlmButton` (the "Load more" button), `HlmSkeleton` (initial-load rows), `AppNavComponent` / `AppFooterComponent` (`shell/`).
- `Router` (URL sync for the open media). Angular's `DatePipe` (viewer date).
- `injectIsBrowser()` (`core/composables/is-browser.ts`) gates browser-only work: DOM scroll, `ResizeObserver`, and the `document.body` scroll lock.
- Native `ResizeObserver` (`JustifiedGridComponent`).
- Pure, framework-agnostic utilities, each independently unit-testable: `data/imgur.util.ts` (`getImgurThumbnail`, the Imgur URL-suffix thumbnail trick) and `data/justified-layout.util.ts` (`computeJustifiedRows`, Flickr-style row packing).

## ⚙️ Internal State & Logic

- **`GalleryPage`** holds all feed state in signals: `edges` (accumulated `MediaNode` edges across loaded pages), `hasMore`, `isLoading`, `isJumping`, `jumpTargetYear`, `selectedMedia`. `yearGroups` and `_loadedYears` are `computed()` from `edges`.
- **Concurrency:** a single `inFlightLoad: Promise<boolean>` field (a plain field, not a signal) de-duplicates concurrent `loadMore(pageSize = PAGE_SIZE)` calls, where `PAGE_SIZE = 24`. The constructor's initial load and a same-tick `openMediaById()` (a deep link) can race. `loadMore()` returns whether the load succeeded, so loops can stop instead of hammering a failing request.
- **Pagination model:** `edges` only ever grows (append-only cursor accumulation). There is no server-side year filter. `jumpToYear()` and `openMediaById()` both go through a shared `loadUntil()` loop. It pages forward at `JUMP_PAGE_SIZE = 100`, throttled by `JUMP_REQUEST_DELAY_MS = 200`, and capped at `MAX_JUMP_PAGES = 100`, until the target year or id appears or the feed is exhausted.
- **URL ↔ state sync:** an `effect()` in the constructor watches `mediaIdParam` and opens or closes `selectedMedia` to match. UI-driven open and close set the signal directly, for instant feedback, then navigate separately. The effect's own already-open check turns the resulting route callback into a no-op.
- **`JustifiedGridComponent`** tracks `containerWidth` as a signal fed by a `ResizeObserver` (set up in `afterNextRender`). It recomputes rows via `computeJustifiedRows()` whenever `items()` or the width changes. No state persists beyond the current input and viewport.
- **`MediaViewerComponent`** has no state beyond its inputs. It sets `document.body.style.overflow` (a scroll lock) in its constructor and clears it in `ngOnDestroy`. It listens for Escape with `(document:keydown.escape)`.
- **`GalleryYearSliderComponent`** is stateless: inputs in, template out.

## 🧩 Extension Points & Hooks

- **`JustifiedGridComponent` and `MediaViewerComponent`** are input/output driven and reusable for any `MediaNode[]` or `MediaNode`, without touching `GalleryPage`.
- **`computeJustifiedRows()` and `getImgurThumbnail()`** are generic (`JustifiedItem`, `JustifiedCell<T>`, `JustifiedRow<T>`) and have no Angular or gallery coupling.
- **`graphqlResource()`** is a shared primitive (auto-retry, SSR TransferState). The gallery uses only `data`, with no manual `retryNow()`, and requests it in the browser only.
- **`pathWithOptionalParamMatcher`** (`core/routing/optional-param-matcher.ts`) is the reusable convention that keeps `/gallery` and `/gallery/:mediaId` as one component instance. `/insiden` uses it too (`date` param).
- No `ng-content` slots, decorators or interceptors. Extension is by composition (new child components and inputs).

## 💡 Potential Feature Opportunities

- **Shareable deep links from the viewer.** The route already syncs `selectedMedia` with `/gallery/:mediaId` through `Router.navigate` and the `mediaIdParam` input. A "copy link" action in `MediaViewerComponent` (a new `output`, or a direct clipboard call plus `ToastService`) is a small additive change with no state or backend work.
- **Keyboard prev/next in the viewer.** `MediaViewerComponent` handles only Escape (`onEscape`). `ArrowLeft` / `ArrowRight` are ready to add. The viewer needs neighbour ids, or the ordered `MediaNode[]`, passed down as a new input from `GalleryPage`'s `edges`, because it receives only a single `media` today.
- **Infinite scroll instead of "Load more".** Still a button in `gallery.page.html`. `hasMore`, `isLoading` and the de-duplicated `loadMore()` are already in place. Ready: place the shared sentinel directive `appInfiniteScroll` (`ui/infinite-scroll/`; emits `loadMore`, takes `appInfiniteScrollLoading`) below the grid. Insiden's incident card uses the same pattern.
- **Filter the feed by uploader.** `MediaNode.uploader.nickname` is fetched on every edge, so client-side filtering of loaded pages is possible now. Server-side filtering is not: the `medias` connection has no filter argument. A `uploader` / `MediaFilter` argument on the Strawberry `medias` resolver in `rosak_backend` has to come first.
- **Bulk-download a year's photos.** Each `MediaNode` carries `file.url`, so a per-year download action is largely client-side. Nothing in the app orchestrates multi-file downloads or zipping, and it needs a small utility: fetch-and-zip in the browser, or a backend batch export if large galleries make client-side zipping impractical. COMPONENTS.md lists the shared export utility.

## 💡 Potential AI Feature Opportunities

- **Auto-generated alt text.** Every `<img>` in the grid and viewer renders `alt=""`. An image-captioning model at ingestion could fill meaningful alt text and searchable metadata, which would also make the feed searchable.
- **Semantic search.** The year slider offers only coarse year-bucket navigation over `created`-ordered results, with no server-side filter. A vector index over photo content or uploader/date metadata could support natural-language or visual-similarity search without waiting on the `MediaFilter` argument.
- **Content moderation and duplicate detection.** Ingestion is bot-driven (Discord/Telegram) with no human upload gate, and this page is public and unauthenticated. An AI pass (NSFW, spam, duplicate-image detection) could run before photos reach it.
