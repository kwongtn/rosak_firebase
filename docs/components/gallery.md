# Component: gallery

## 📌 Purpose & Scope

- **Core Responsibility:** The public, read-only `/gallery` page. It shows a chronological, year-grouped, newest-first feed of community spotting photos (`Media` records), with a "jump to year" slider and a full-screen viewer opened by a `:mediaId` route param. Pages load on demand through the backend's Relay-style `medias` connection. The connection is used instead of `mediasGroupByPeriod` for the photos themselves: that field has no pagination argument, so selecting its `medias` sub-field returns every row of each bucket in one call. A shared `/gallery/:mediaId` link does not page through that connection: it fetches the one photo with the backend's `media(id)` query and opens it at once, on the server too, so the server HTML of the link already holds the viewer and the photo's share tags.
- **Domain/Layer:** Angular Presentation (standalone, lazy-routed page, three presentational children, pure utilities). No backend code lives here. It consumes an existing GraphQL API read-only.

## 🔌 Interface & Data Flow

**`GalleryPage`** (`gallery.page.ts`, `app-gallery`). Route: `pathWithOptionalParamMatcher("gallery", "mediaId")` in `app.routes.ts`. `/gallery` and `/gallery/:mediaId` are one route and one component instance, so opening or closing a photo does not destroy the page or its loaded feed.

- **Input:** `mediaIdParam = input<string | undefined>(undefined, { alias: "mediaId" })`. `undefined` means the viewer is closed. A value opens that media: from the loaded feed when it is already there, otherwise by fetching it by id.
- **Output:** none (routed page). Navigates with `Router.navigate(["/gallery", id])` / `["/gallery"]` to keep the URL in sync.
- **Computed:** `yearGroups: YearGroup[]` (`{ year, items: MediaNode[] }[]`, derived from loaded `edges`). `yearCounts` is sorted descending, from the separate year-count aggregate. That aggregate is requested in the browser only (see `MEDIA_YEAR_COUNTS_QUERY` below), so it is empty in the server HTML.

Child components:

| Component (file)                                                                                         | Inputs                                                                                           | Outputs                 |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------- |
| `JustifiedGridComponent` (`justified-grid/justified-grid.component.ts`, `app-justified-grid`)            | `items` (required `MediaNode[]`), `eagerCount` (default `0`)                                     | `imageClick: MediaNode` |
| `MediaViewerComponent` (`media-viewer/media-viewer.component.ts`, `app-media-viewer`)                    | `media` (required `MediaNode`)                                                                   | `close: void`           |
| `GalleryYearSliderComponent` (`year-slider/gallery-year-slider.component.ts`, `app-gallery-year-slider`) | `years` (required `MediaYearCount[]`), `activeYear` (default `null`), `isBusy` (default `false`) | `yearSelected: number`  |

`TARGET_ROW_HEIGHT = 220` is exported from `JustifiedGridComponent`, which scales every tile's `flex-basis` by it, and reused by `gallery.page.ts` to size loading skeletons. `GalleryPage` passes `eagerCount = 4` (`EAGER_IMAGE_COUNT`) to the first year's grid only.

**GraphQL** (`data/gallery.queries.ts`; read-only, no mutations):

- `MEDIAS_QUERY` (`MediasFeed`): `medias(first, after, order: { created: DESC })` → `{ totalCount, pageInfo { hasNextPage, endCursor }, edges [{ cursor, node: MediaNode }] }`. `MediaNode = { id, createdDate, width, height, file: { url } | null, uploader: { nickname } }`.
- `MEDIA_BY_ID_QUERY` (`MediaById`): `media(id: ID!)` → `MediaNode | null`, the same selection as one feed node. `id` is the Relay global id the feed exposes, passed verbatim (a raw database id returns `null`); `null` means there is no such photo. Known backend defect: `MediaType.file` is non-null in the schema but empty in the database for some legacy rows (417 of 2,856 in the dev data), so `media(id)` for such a photo returns a GraphQL error instead (and so does any feed page that contains one). `rosak_backend/docs/components/common.md` tracks it; the page treats it like any failed request.
- `MEDIA_YEAR_COUNTS_QUERY` (`MediaYearCounts`): metadata-only `mediasGroupByPeriod(type: YEAR) { year count }`, a GROUP BY aggregate kept off the SSR path. `GalleryPage` requests it in the browser only (its `graphqlResource()` request function returns `undefined` on the server), because SSR holds the response until an `httpResource` settles and the counts feed nothing but the year slider. The slider fills in after hydration and reserves its height meanwhile (`GalleryYearSliderComponent` is `invisible` with a `min-height` while empty). It never loads images and never sub-selects `medias`.

**Dependencies:**

- `GraphQLClient.request()` (`core/graphql/graphql-client.ts`): one-shot calls, the paginated `medias` pages and the single `media(id)` fetch. The page drives its own accumulation, so the calls are not resource-bound. It is `HttpClient` underneath, so SSR waits for them and hydration reuses the transferred responses.
- `graphqlResource()` (same file): `httpResource` wrapper with exponential-backoff retry. Used only for `MEDIA_YEAR_COUNTS_QUERY`, and only in the browser.
- `ToastService` (`ui/toast/toast.service.ts`, wraps `@spartan-ng/brain/sonner`): load-failure, "still loading" and "not found" feedback.
- `HlmButton` (the "Load more" button), `HlmSkeleton` (initial-load rows), `AppNavComponent` / `AppFooterComponent` (`shell/`).
- `Router` (URL sync for the open media). Angular's `DatePipe` (viewer date) and `formatDate` (`mediaLabel`).
- `Title` and `Meta` (`@angular/platform-browser`): the open photo's document title and share tags.
- `CdkTrapFocus` (`@angular/cdk/a11y`): the viewer's focus trap, the same primitive `HlmSheet` uses.
- `injectIsBrowser()` (`core/composables/is-browser.ts`) gates browser-only work: the year-count request, DOM scroll, and the `document.body` scroll lock.
- Pure, framework-agnostic utilities, each independently unit-testable: `data/imgur.util.ts` (`getImgurThumbnail`, the Imgur URL-suffix thumbnail trick) and `data/media-label.util.ts` (`mediaLabel`, the photo's accessible name).

## ⚙️ Internal State & Logic

- **`GalleryPage`** holds all feed state in signals: `edges` (accumulated `MediaNode` edges across loaded pages), `hasMore`, `isLoading`, `isJumping`, `jumpTargetYear`, `selectedMedia`. `yearGroups` and `_loadedYears` are `computed()` from `edges`.
- **Concurrency:** a single `inFlightLoad: Promise<boolean>` field (a plain field, not a signal) de-duplicates concurrent `loadMore(pageSize = PAGE_SIZE)` calls, where `PAGE_SIZE = 24`. The constructor's initial load and a year jump clicked before it lands can race. `loadMore()` returns whether the load succeeded, so loops can stop instead of hammering a failing request.
- **Pagination model:** `edges` only ever grows (append-only cursor accumulation). There is no server-side year filter. `jumpToYear()` goes through the `loadUntil()` loop. It pages forward at `JUMP_PAGE_SIZE = 100`, throttled by `JUMP_REQUEST_DELAY_MS = 200`, and capped at `MAX_JUMP_PAGES = 100`, until the target year appears or the feed is exhausted. Opening a photo by id never pages.
- **URL ↔ state sync:** an `effect()` in the constructor watches `mediaIdParam` and opens or closes `selectedMedia` to match. `openMediaById()` opens a photo the feed already holds (Back/Forward) without a request. Otherwise it fetches that one photo with `MEDIA_BY_ID_QUERY` and opens the viewer when it arrives, on the server too: the server HTML of `/gallery/:mediaId` carries the viewer, and the browser's hydration reuses the transferred response. The feed (`loadMore()`) loads independently. A `null` photo shows the "Couldn't find that photo" toast and a failed request the "Couldn't load that photo" one; both then `navigate(["/gallery"], { replaceUrl: true })`, which is a redirect to `/gallery` when it happens on the server. An answer that arrives after the route has moved on is dropped. UI-driven open and close set the signal directly, for instant feedback, then navigate separately. The effect's own already-open check turns the resulting route callback into a no-op.
- **Share metadata:** while a photo is open, an effect on `selectedMedia` sets the document title (`MLPTF | Photo by {nickname}, {d MMM y}`, the `mediaLabel()` words), `og:title`, `og:description`, `og:image` (the photo at Imgur's `h` size, `getImgurThumbnail(url, "h")`), `og:image:alt` and `twitter:card` through `Title` and `Meta`, so the server HTML of a shared link previews as that photo. A photo without a file keeps the site-wide `og:image`. The effect's cleanup restores the defaults when the viewer closes, the photo changes or the page is left: the title to `MLPTF | Gallery` (the route title), `og:image` to the site-wide share card (`https://community.mlptf.org.my/share-card.png`, also set statically in `src/index.html`), and the `og:title`, `og:description` and `og:image:alt` tags are removed (`index.html` has none). The effect also reads `mediaIdParam` so that it re-runs once a click-opened photo's navigation has landed: the router resets the title to the route's on every `NavigationEnd`.
- **`JustifiedGridComponent`** is stateless and measures nothing, so the server renders exactly what the browser does and the first page of photos is in the SSR HTML. One `flex flex-wrap` container (6 px gap); each tile's `flex-basis` is `aspect × TARGET_ROW_HEIGHT` px and its `flex-grow` is `aspect × 100`, so the browser fits as many tiles per row as the width allows and stretches the row to the full width at one shared height. A tile is a `div` holding a `padding-bottom: 100 / aspect %` box (it reserves the tile's height before the image arrives) and an absolutely positioned button with the `object-cover` image. A trailing spacer with `flex-grow: 1000000` keeps the last, incomplete row at the target height. `aspect` is `width / height`, or 4:3 when either is missing. The first `eagerCount` images use `loading="eager"` (the very first also `fetchpriority="high"`) and the rest `loading="lazy"`.
- **`MediaViewerComponent`** has no state beyond its inputs. It sets `document.body.style.overflow` (a scroll lock) in its constructor and clears it in `ngOnDestroy`. It listens for Escape with `(document:keydown.escape)`. It is a modal dialog: the host has `role="dialog"`, `aria-modal="true"` and `aria-label="Photo viewer"`, and a `cdkTrapFocus` wrapper with auto-capture moves focus to the Close button on open, keeps Tab inside, and restores focus to the element that had it before (the thumbnail that opened it) when the viewer is destroyed. The image `alt` is `mediaLabel(media)`.
- **`GalleryYearSliderComponent`** is stateless: inputs in, template out.
- **Names and motion:** each thumbnail button gets `aria-label="Photo by {nickname}, {d MMM y}"` from `mediaLabel()`, which drops whichever part is blank (many photos have no nickname, and incident photos have no date). The thumbnail `<img>` stays `alt=""`. `jumpToYear()` scrolls with `behavior: "auto"` when `prefers-reduced-motion: reduce` matches, and `"smooth"` otherwise.

## 🧩 Extension Points & Hooks

- **`JustifiedGridComponent` and `MediaViewerComponent`** are input/output driven and reusable for any `MediaNode[]` or `MediaNode`, without touching `GalleryPage`.
- **`getImgurThumbnail()`** is generic and has no Angular or gallery coupling.
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

- **Auto-generated alt text.** Photos are named only by who uploaded them and when (`mediaLabel()`); nothing describes what they show. An image-captioning model at ingestion could fill meaningful alt text and searchable metadata, which would also make the feed searchable.
- **Semantic search.** The year slider offers only coarse year-bucket navigation over `created`-ordered results, with no server-side filter. A vector index over photo content or uploader/date metadata could support natural-language or visual-similarity search without waiting on the `MediaFilter` argument.
- **Content moderation and duplicate detection.** Ingestion is bot-driven (Discord/Telegram) with no human upload gate, and this page is public and unauthenticated. An AI pass (NSFW, spam, duplicate-image detection) could run before photos reach it.
