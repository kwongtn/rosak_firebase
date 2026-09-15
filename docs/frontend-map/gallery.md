# Gallery

## Path(s) & Routing

- **URL path:** `/gallery`
- **Route definition:** `src/app/app-routing.module.ts:88-101`
- **Page `<title>`:** `"MLPTF | Gallery"` (set via the route's `title` property, `app-routing.module.ts:89`)
- **Component:** standalone `GalleryComponent`, lazy-loaded via `loadComponent()` from `src/app/gallery/gallery.component.ts` (no separate routing module — the route points directly at the standalone component).
- **Route guards:** none. The `gallery` route has no `canActivate` and no `AuthPipe` guard applied (contrast with `/console` → `adminOnly`, `/profile` → `redirectUnauthorizedToSpotting`, `/situasi` → `betaTesterOnly`). `/gallery` is reachable by anyone, including unauthenticated visitors.
- **Maintenance-mode switch:** `app-routing.module.ts:19-54` defines a `PageType` union including `"gallery"` and a `maintenance` map. `maintenance.gallery.curentlyInMaintenance` (currently hardcoded `false`, `app-routing.module.ts:45-47`) is checked at `app-routing.module.ts:91`; if `true`, the route resolves `ConstructionComponent` (`src/app/construction/construction.component.ts`) instead of `GalleryComponent`. There is no admin UI or environment variable to flip this — it is a source-code boolean toggled by redeploy.
- **Redirects:** none specific to gallery. It is not part of the `""` → `/spotting` or `/transpot` → `/spotting` redirect rules, and is not the wildcard fallback.
- **Top nav entry:** `src/app/app.component.ts:18-26` — "Gallery" nav link to `/gallery`, tagged `"Alpha"` with `style: "danger"` (a warning-colored badge in the nav, presumably to flag it as an unstable/early feature) and `headerTitle: " - Gallery "` used to build the page header text. The nav item is unconditional — not filtered by role.

## Purpose

A public, read-only photo/media gallery that displays all images (`Media` records) uploaded to the platform, grouped and displayed by the day they were created, most-recent day first. It has no relation to a specific spotting event or incident — it is a global chronological feed of every media asset in the `common.Media` table (e.g. images sent to the project's Discord bot/Telegram bot and persisted as `Media` rows), independent of the "spotting" (TranSPOT) or "insiden" (incident) domains. Marked "Alpha" in the nav, implying it is an early/experimental feature for the general public and beta testers alike — no login or role is required to view it.

## Component Tree

- **`GalleryComponent`** (`src/app/gallery/gallery.component.ts`, selector `app-gallery`) — the entire page. Standalone component; owns the query, the date→images map, and the intersection-based lazy-render logic. Imports `CommonModule`, `ImageGridModule`, `InViewportModule`, `NzSpinModule`.
  - Injects **`GetMediasService`** (`src/app/gallery/services/get-medias.service.ts`) — an `apollo-angular` `Query<MediaRelayResponse>` subclass, this feature's sole data source.
  - Renders, per date bucket, either:
    - a placeholder `<div>` sized by an estimated height (while the bucket is out of viewport), or
    - **`ImageGridComponent`** (`src/app/@ui/image-grid/image-grid.component.ts`, selector `image-grid`), passed `[images]="imgDate.value.images"` (type `InputImage[]`). `ImageGridComponent` is a shared `@ui` component (also used independently by the `insiden` feature's `image-drawer` component — not gallery-specific) that lays out a masonry-style flex grid, lazily marks each image element visible via `ng-in-viewport`, shows an `nz-spin` spinner per-tile until the `<img>` fires `load`, and opens `NzImageService`'s full-screen preview/lightbox (`nz-image-group`) on click, cycling through all images in the current date bucket.
  - Uses directive **`inViewport`** (from `ng-in-viewport`, applied to `.date-image-container` and again inside `ImageGridComponent` on `nz-image-group`) for two independent layers of viewport-driven lazy rendering (see Functionality section).
  - Uses **`NzSpinModule`**'s `<nz-spin>` for a full-page loading indicator while the initial query is in flight.
  - **Does not** use `src/app/@ui/spotting-image-list` at all — that component (and its own, differently-shaped `GetMediasService` querying `events { isMine, medias { file { url } } }`) is used only by `src/app/@ui/spotting/image-preview-button/image-preview-button.component.ts`, unrelated to gallery. The two `GetMediasService` classes (`gallery/services/get-medias.service.ts` vs `@ui/spotting-image-list/services/get-medias.service.ts`) are distinct classes with the same name in different files/DI scopes; do not conflate them.
  - Utility function **`getThumbnail`** (`src/app/@util/imgur.ts`) — pure function, no component, used by `GalleryComponent.ngOnInit` to rewrite each image's Imgur URL into a "medium" (`m`, 320×320) thumbnail URL for the grid tile; the original untouched URL is kept for the full-size lightbox view.

No `@Input`/`@Output` communication beyond the one `[images]` binding into `image-grid`; no router params are consumed (the route has no `:id` or query params); no cross-component shared service beyond the Apollo `GetMediasService` singleton.

## Functionality & Behavior

1. **Initial load** (`gallery.component.ts:43-95`, `ngOnInit`):

   - Fires a `GetMediasService.watch({ type: "DAY" }, { fetchPolicy: "network-only" })` — always a fresh network request, no cache reuse, and no re-fetch/refresh mechanism is offered afterward (no polling, no manual "refresh" button, no `refetch()` call anywhere in the file).
   - `type: "DAY"` is hardcoded — the UI has no control to switch grouping to `MONTH`/`WEEK`/`YEAR` even though the backend enum (`DateGroupings`) supports all four.
   - The subscription callback (`gallery.component.ts:53-94`) iterates `data.mediasGroupByPeriod` and, for each day bucket (`dateKey`):
     - Creates the bucket in `imageDateMaps` on first sight with `{ images: [], displayImages: false }` (`displayImages` starts `false`, i.e. every new bucket starts collapsed/placeholder-rendered).
     - **Rebuilds `images` from scratch every emission** — `elem.medias.map(...)` fully replaces `imageDateMaps[dateKey].images` rather than appending, so if the query re-emits (e.g. Apollo cache update), any bucket present in the new payload has its image list fully replaced, not merged.
     - Per media item, builds an `InputImage`: `{ height, width, url, thumbnailUrl, display: false }`. If `media.file` is falsy (null — no uploaded file, or upload failed), both `url` and `thumbnailUrl` fall back to `./assets/image-not-found.png` (a bundled static asset, confirmed present at `src/assets/image-not-found.png`). Otherwise `url = media.file.url` (original Imgur URL) and `thumbnailUrl = getThumbnail(media.file.url, "m")` (rewritten to Imgur's medium/320×320 thumbnail convention — see `@util/imgur.ts:9-30`).
     - Sets `this.loading = loading` from the Apollo emission's own loading flag every time (not just once), so the spinner ties directly to Apollo's watch-query loading state.
   - Note: the whole payload for **all** day-buckets and **all** media in them is fetched in a single round trip — there is no pagination, `first`/`after` cursor usage, or incremental loading at the GraphQL level. (The unused `firstCursor`/`lastCursor` fields at `gallery.component.ts:36-37` and the commented-out TODO in the template referencing `ngInfiniteScroll`/relay-style pagination (`gallery.component.html:8-12`) confirm cursor/relay-style infinite-scroll pagination was planned but never implemented — see Known Quirks.)

2. **Sorting** (`gallery.component.html:14`, `compareFn` at `gallery.component.ts:114-120`): the template iterates `imageDateMaps | keyvalue: compareFn`. `compareFn` returns `1` if `a.key < b.key` else `-1`, which is a **descending** sort by `dateKey` string (e.g. `"2026-08-05"` sorts before `"2026-08-04"`) — i.e., most recent day first. Because `dateKey` is a zero-padded `YYYY-MM-DD` string (see backend `get_date_key`, below), lexicographic sort is equivalent to chronological sort.

3. **Per-day heading**: `gallery.component.html:23` — `{{ imgDate.key | date }}` — renders the `dateKey` string through Angular's default `date` pipe (default format, locale-dependent, e.g. "Aug 5, 2026"). Note `dateKey` is a plain `YYYY[-MM[-DD]]` string (not always a full date — see backend section on `YEAR`/`MONTH` groupings), so for the `DAY` grouping actually used here it should format correctly, but the same `compareFn`/`date` pipe code path would behave unpredictably if `type` were ever switched to `MONTH` or `YEAR` (partial date strings piped through Angular's `date` pipe).

4. **Two-tier lazy rendering / virtualization**, both keyed off `ng-in-viewport`'s `inViewport` directive with `rootMargin: '200px 0px'` (i.e., trigger 200px before entering/leaving the actual viewport):

   - **Tier 1 — per day-bucket** (`gallery.component.html:15-33`): each `.date-image-container` (one per day) is wrapped in `inViewport`. `onIntersection()` (`gallery.component.ts:97-112`) sets `imageDateMaps[target.id].displayImages = visible`. While a bucket is off-screen, instead of `<image-grid>` a plain placeholder `<div>` is rendered with `height: (images.length / 3) * 200 + 'px'` — a rough estimate assuming ~3 images per row at ~200px row height, used purely to keep scroll height/position stable so the page doesn't jump as buckets mount/unmount their real content. When the bucket scrolls into range, the real `<image-grid>` mounts and the images actually load.
   - **Tier 2 — per image tile**, inside `ImageGridComponent` itself (`image-grid.component.html:9-13`, `image-grid.component.ts:70-78`): each `nz-image-group` tile also carries `inViewport`, feeding `displayImage[target.id]`, though `displayImage` is tracked but not actually read anywhere in that component's template (the `[src]` binding on `<img>` is unconditional) — this second tier's `displayImage` map currently has no visible effect on rendering; the actual perf mechanism doing real work is Tier 1 plus the browser's native lazy image loading via a plain `<img src>`.
   - Both intersection handlers currently `console.log(target.id, "✅"/"❌")` on every viewport transition (`gallery.component.ts:106-110`) — debug logging left in production code (see Known Quirks).

5. **Loading state**: while the initial (and only) `watch()` emission is loading (`loading === true`), an `<nz-spin>` banner is shown above the list with `nzTip`: _"Due to the high number of image entries, loading will be slow. Please bear with us while we work on optimizations 🥲"_ (`gallery.component.html:3-7`) — an explicit, user-facing acknowledgment that this page is slow because everything loads in one shot with no pagination.

6. **Empty state**: not explicitly handled. If `mediasGroupByPeriod` returns `[]` (no media in the system), `imageDateMaps` stays `{}` and the `@for` loop simply renders nothing beneath the `<h1>Gallery</h1>` heading and the (now-hidden, since `loading` becomes `false`) spinner — no "no images yet" message.

7. **Error state**: not explicitly handled. There is no `error` callback/branch on the `valueChanges.subscribe(...)` call (`gallery.component.ts:53-94`) — a GraphQL/network error would surface only as an uncaught console error and the page would remain stuck showing the loading spinner forever (since `loading` is only updated from successful emissions).

8. **Per-image click → lightbox**: clicking a thumbnail (`image-grid.component.html:36`, `onViewImage`) opens `NzImageService.preview()` with **all** images belonging to that image-grid instance (i.e. all images in that one day-bucket, not the whole gallery), `switchTo(index)`-ing straight to the clicked image. Broken images (404/failed load) fall back client-side via the `<img onerror>` handler to `./assets/image-not-found.png` (`image-grid.component.html:33`) — this is a plain inline `onerror` HTML attribute, not an Angular error binding.

9. **No filter/search/date-range controls** exist on this page — the entire visible dataset is whatever `mediasGroupByPeriod(type: DAY)` returns, unfiltered by uploader, source, or any query param.

## Data & API Contracts

### `mediasGroupByPeriod` query

- **Frontend definition:** `src/app/gallery/services/get-medias.service.ts:26-41`, unnamed (anonymous) `gql` query:
  ```graphql
  query ($type: DateGroupings!) {
    mediasGroupByPeriod(type: $type) {
      type
      dateKey
      count
      medias {
        width
        height
        file {
          url
        }
      }
    }
  }
  ```
  Invoked once in `GalleryComponent.ngOnInit` with `{ type: "DAY" }` and `fetchPolicy: "network-only"`.
- **Backend resolver:** `common/schema/schema.py:36-77`, `CommonScalars.medias_group_by_period(self, info, type: DateGroupings) -> List[MediasGroupByPeriodScalar]`, exposed on the root `Query` type via `rosak/schema.py` (`Query` composes `CommonScalars` among others).
  - **No `permission_classes`** on this field (contrast with the sibling `user` field on the same `CommonScalars` type, which requires `IsLoggedIn` — `common/schema/schema.py:27-34`) — **this query is public; no authentication is required to call it.** This matches the frontend route having no guard.
  - **Grouping logic:** builds a Django `annotate()` on `common.models.Media` keyed by `created__year` always, plus `created__month` when `type` is `MONTH` or `DAY`, plus `created__day` when `type` is `DAY` (`common/schema/schema.py:40-46`). So requesting `DAY` (as the frontend always does) groups strictly by calendar day of `Media.created` (a `TimeStampedModel` auto-`created` timestamp, not a user-supplied date).
  - **Row filter:** `Media.objects.filter(~Q(file=""))` (`common/schema/schema.py:49`) — excludes `Media` rows whose (legacy) `file` field is an empty string. Note this filters on the Imgur `file` field specifically, not on the Discord `file_id`/`file_name` fields, so a `Media` row with only Discord-CDN data and no Imgur `file` could theoretically be excluded here even though it has a usable `url` via the model's `url` property — this filter is not exercised by the frontend's field selection either way, since the frontend only ever requests `file { url }`, not `url`.
  - **`count`** and **`medias`** are computed by a single aggregate query using `Count("id")` and `ArrayAgg(F("id"), distinct=True, default=[])` (`common/schema/schema.py:52-54`), then each bucket's media IDs are resolved to full objects via `info.context.loaders["common"]["media_from_id_loader"]`, a batched `DataLoader` (`common/schema/loaders.py:23-25,30`) — this avoids N+1 queries when the same request touches many buckets, but does **not** batch/limit the _number_ of buckets or images returned; every matching bucket and every one of its media rows is loaded and returned in one response.
  - **`date_key`** is built by `common/utils.py:43-55`, `get_date_key(year, month=None, week=None, day=None)` → zero-padded `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` depending on which of `month`/`day`/`week` are present. For `type=DAY` (the only value the frontend ever sends) this always yields a full `YYYY-MM-DD` string.
  - **`MediasGroupByPeriodScalar`** (`common/schema/scalars.py:36-44`): `type: DateGroupings`, `date_key: str`, `year: int`, `month: Optional[int]`, `day: Optional[int]`, `count: int`, `medias: List[MediaScalar]`.
  - **`MediaScalar`** (`common/schema/scalars.py:25-33`, `strawberry_django.type(models.Media, pagination=True)`): `id: strawberry.ID`, `uploader: UserScalar`, `file: Optional[strawberry_django.DjangoImageType]` (auto-derived from the model's `ImgurField file`; its `.url` resolves through Django's storage API, which for the `ImgurField`/`ImgurStorage` combination (`common/models.py:19`, `common/imgur_field.py`) yields an `i.imgur.com` URL, not a locally-hosted asset), `width: int`, `height: int`, `url: Optional[str]` (a **separate** model property, `common/models.py:58-63`, that builds a `cdn.discordapp.com` URL from `file_id`/`file_name`/`message_id` — **not requested by this frontend query**), `discord_suffix: str`.
    - **Nullability in practice:** `media.file` can be `null` (frontend explicitly branches on `if (media.file)` — `gallery.component.ts:80-86`), meaning a `Media` row can exist with no Imgur file at all; the frontend's fallback-to-`image-not-found.png` behavior exists specifically to cover this.
  - **`DateGroupings` enum** (`generic/schema/enums.py:6-11`): `YEAR`, `MONTH`, `WEEK`, `DAY` — all four are valid GraphQL enum values the frontend could send, but the gallery UI only ever sends `DAY`.
- **Underlying data source of `Media` rows:** the `common.Media` Django model (`common/models.py:22-63`) — `file` (deprecated per an inline `# TODO: Deprecate in future version` comment, `common/models.py:23`), `width`/`height` (nullable ints), `uploader` (FK to `common.User`, `on_delete=PROTECT`), plus Discord-bot ingestion fields `message_id`, `file_id`, `file_name`, `content_type`. This indicates media are ingested from a bot pipeline (e.g. Telegram/Discord — see `telegram_provider` app and `discord_suffix`) rather than uploaded directly through this frontend; there is no "upload image" UI anywhere under `src/app/gallery/**`.

### No mutations

The gallery feature is read-only — no mutations, no writes back to the backend.

### No REST calls, no Firebase SDK usage, no browser storage

Nothing under `src/app/gallery/**` touches `localStorage`/`sessionStorage`/`IndexedDB`, Firebase Auth/Firestore/Storage/Analytics, or any REST endpoint. The only network call is the single Apollo GraphQL query above, sent to `environment.backendGraphqlUrl` per `src/app/graphql.module.ts:9-15` (global Apollo client config, not gallery-specific — see that file for the shared `HttpLink`/`InMemoryCache` setup).

## State Management

- All state is local component state on `GalleryComponent`: `imageDateMaps` (the day→images map driving the whole view), `watchQueryOption`/`mainQuerySubscription` (the live Apollo `QueryRef` and its subscription), `firstCursor`/`lastCursor` (declared, always `null`, never assigned or read — dead fields, see Known Quirks), `loading`.
- `GetMediasService` is `providedIn: "root"` (Angular DI singleton), but it is only consumed by `GalleryComponent` within this feature's scope — it holds no state itself beyond the `gql` document (it is an `apollo-angular` `Query` subclass, so calling `.watch()` creates a fresh `QueryRef`/`Observable` each time; no shared cached state is read by any other component in this feature).
- Lifecycle: query fires in `ngOnInit`, `imageDateMaps` accumulates for the component's lifetime (never cleared), subscription is torn down in `ngOnDestroy` (`gallery.component.ts:122-124`). Navigating away and back to `/gallery` re-creates the component from scratch (since it's not reused across navigations here) and re-runs the query with `fetchPolicy: "network-only"`, so there is no cross-visit caching of gallery state within the SPA session.
- `ImageGridComponent`'s `loading`/`displayImage` state is local to each grid instance (one per visible day-bucket) and is not shared with `GalleryComponent` or across bucket instances.

## Permissions, Roles & Flags

- **Route guard:** none (confirmed above) — `/gallery` has no `canActivate`/`AuthPipe`, unlike `/console` (`adminOnly` = `hasCustomClaim("admin")`), `/situasi` (`betaTesterOnly` = `hasCustomClaim("betaTester")`), or `/profile` (`redirectUnauthorizedToSpotting`).
- **Backend guard:** none — `medias_group_by_period` has no `permission_classes`, so the GraphQL query is callable by anyone, authenticated or not (see Data & API Contracts).
- **Template-level `*ngIf` role checks:** none found in `gallery.component.html`.
- **`auth-permissions.ts`:** no mention of `gallery` in `src/app/services/auth-permissions.ts` (grepped, zero matches) — the role→path permission map that gates other areas of the app simply does not include this route, consistent with it being unrestricted.
- **Net effect:** this is the most open feature in the app — no role or login is required on either the frontend route or the backend field. The only "restriction" visible anywhere is cosmetic: the "Alpha" nav badge signaling instability, not access control.
- **Maintenance flag:** `maintenance.gallery.curentlyInMaintenance` (`app-routing.module.ts:45-47`), currently `false`. If flipped to `true` in source and redeployed, `/gallery` would render `ConstructionComponent` instead, with no data fetching at all.

## Known Quirks / Tech Debt

- **Dead/unused fields:** `firstCursor`, `lastCursor` (`gallery.component.ts:36-37`) are declared and typed but never assigned or read anywhere — vestiges of a planned (but unimplemented) cursor-based pagination scheme.
- **Unimplemented pagination, documented as a TODO in the template:** `gallery.component.html:8-12` — an HTML comment literally says "Refer the following for implementation" and links to two infinite-scroll libraries/blog posts (`nginfinitescroll`, `ngx-infinite-scroll`), confirming the current single-shot full-dataset fetch is a known-incomplete state, not the intended final design.
- **Debug `console.log` left in place:** `gallery.component.ts:106-110` — every viewport enter/exit for every day-bucket logs `target.id` with a ✅/❌ emoji to the browser console. Also dead commented-out `Renderer2` class-toggle code directly above it (`gallery.component.ts:104-105`).
- **Second lazy-loading tier appears inert:** `ImageGridComponent.displayImage` (`image-grid.component.ts:42,70-78`) is populated by its own `inViewport`/`onIntersection` handler but is never read in `image-grid.component.html` — the `<img [src]>` binding is unconditional, so this tracked state currently does nothing observable. Possibly intended to gate rendering of the `<img>` tag itself but never wired up.
- **No error handling on the main query subscription** (`gallery.component.ts:53-94`) — a failed request leaves the page stuck on the loading spinner indefinitely (see Functionality, item 7).
- **Placeholder height estimate is a rough heuristic**, not derived from actual measured/expected grid geometry: `(imgDate.value.images.length / 3) * 200 + 'px'` (`gallery.component.html:29`) assumes a fixed "3 images per row, 200px tall" layout that will drift from the real `image-grid` masonry layout (which uses variable per-image aspect-ratio-driven widths, `ratioBaseline = 200` by default) — likely to cause visible scroll-jump/layout-shift in practice when a bucket's actual rendered height doesn't match the placeholder.
- **`type: "DAY"` is hardcoded** with no UI to pick `MONTH`/`WEEK`/`YEAR` even though both the frontend's `MediaRelayResponse` interface (`get-medias.service.ts:13-20`) and the backend enum fully support all four groupings — the query/response shape was clearly built to be grouping-agnostic but the UI never exposes the choice.
- **Legacy `ImgurField`** (`common/models.py:23`, comment `# TODO: Deprecate in future version`) is the actual field this whole feature's images come from (`file.url` in the frontend query) — the backend already has a newer Discord-CDN-based `url` property on the same model (`common/models.py:58-63`) that this feature does not use. A rewrite should confirm with the backend team whether `Media.file`/Imgur is still the live ingestion path or whether new media now only populate the Discord fields (in which case this gallery would silently show fewer/no new images going forward, since it never requests the `url`/Discord fields).
- **Two same-named-but-distinct `GetMediasService` classes** exist in the codebase (`gallery/services/get-medias.service.ts` and `@ui/spotting-image-list/services/get-medias.service.ts`) with different query shapes and return types — easy to import the wrong one by mistake; worth renaming distinctly in the rewrite (e.g. `GetMediasByPeriodService` vs `GetEventMediasService`).
- **Spinner copy is an apology for known bad performance** (`gallery.component.html:6`) — a very concrete signal from the current maintainers that the "fetch everything at once" approach is a stopgap, not a design decision to preserve.

## Open Questions / Verify Against Live Site

- **Rendered heading/copy exact wording**: the `<h1>Gallery</h1>` and per-day `{{ imgDate.key | date }}` heading format are read directly from the template, but the exact locale/format Angular's default `date` pipe produces at runtime (e.g. "Aug 5, 2026" vs. some other locale format) was not verified against the live site's configured `LOCALE_ID`.
- **"Alpha" nav badge visual style** (`style: "danger"`, `tag: "Alpha"` in `app.component.ts`) — the exact rendered color/shape of this badge depends on nav/header template and CSS not reviewed in depth here (out of this feature's file scope); confirm visually on the live site.
- **Actual current ingestion path for `Media` rows**: static analysis shows the model still has both a legacy Imgur `file` field and a newer Discord CDN `url` property, with an explicit backend TODO to deprecate the former — but whether new media rows created today still populate `file` (and thus still show up correctly in this gallery, which only ever queries `file.url`) could not be confirmed without inspecting the live ingestion pipeline (e.g. `telegram_provider` app resolvers/tasks) or a live database. If new uploads have stopped populating `file`, the gallery may already be silently missing recent images on the live site.
- **Real-world data volume / actual load time**: the spinner's warning about slow loading due to "high number of image entries" suggests this is a real, currently-felt performance problem on production, but the actual number of `Media` rows and observed load time weren't measured here (would require live DB/live site access).
- **Whether `ImageGridComponent.displayImage` inertness is a genuine bug or intentionally leftover scaffolding** for a not-yet-finished second-tier lazy-load — flagged in Known Quirks; worth confirming with whoever wrote it (or just re-deciding fresh in the rewrite) rather than assuming intent.

## Rewrite Notes (2026) — What Changed, and Backend Gaps to Revisit

The `web/` rewrite (`web/src/app/features/gallery/`) keeps this fully public (no route guard, no auth
header sent) and ports the Imgur thumbnail-URL trick verbatim (`data/imgur.util.ts`), but deliberately
does **not** call `medias_group_by_period` — the "will be slow" spinner copy above is describing a real,
structural limitation of that field (see "Known Quirks"), not something a frontend rewrite can paper
over. Instead it uses the **`medias` Relay connection** (`common/schema/schema.py:25`), which was already
in the schema but never called by any frontend code — it has real cursor pagination (`first`/`after`,
`pageInfo.hasNextPage`) and a real `order: { created: DESC }`, which `medias_group_by_period` has neither
of. The one-time confirmed-live resolution of the "is `file` still populated?" open question above (yes —
`convert_temporary_media_to_media_task` in `common/tasks.py` still writes both the Imgur `file` field and
the Discord fields on every new `Media` row, gated only by the `IMAGE_UPLOAD` feature flag, not by ingestion
path) means this thumbnail approach should keep working going forward, not just for historical rows.

**What this lets the rewrite do without any backend changes:**

- Genuine progressive loading — an initial page of 24, "Load more" in the same size, on `medias`.
- Sort newest-first via `order: { created: DESC }`.
- A year-by-year "jump" sidebar, populated from a _separate_, deliberately cheap
  `mediasGroupByPeriod(type: YEAR) { year count }` call (no `medias` sub-field requested, so the
  backend's per-bucket media aggregation never gets serialized into this response) — this is metadata
  only, never used to actually load images.

**What it can't do, because the schema genuinely doesn't support it (not a frontend gap):**

- **No server-side year (or any date-range) filter on `medias`.** `MediaType` declares no `filters=` at
  all — the one filter class that could support this, `common/schema/filters.py`'s `MediaFilter`, is
  fully commented-out dead code, never attached to any type. Clicking a year in the UI that hasn't been
  reached yet has to page forward through _every newer item first_, in `created` order, until it reaches
  that year — there's no way to ask the server to start there directly. For a popular year (the live
  backend currently reports low thousands of photos for the two most recent years) this can mean dozens
  of sequential requests just to reach it. **Backend fix that would remove this limitation:** attach a
  filter to `medias` (e.g. wire up `MediaFilter` with a `created` range/year filter, following the same
  `strawberry_django.field(filters=..., pagination=True, order=...)` pattern already used by
  `SpottingScalars.events` in `spotting/schema/schema.py:25-27`).
- **No thumbnail/size-variant field or argument anywhere in the schema.** Both `MediaScalar.file` and
  `MediaType.file` expose exactly one URL each. The "thumbnail" in this UI is 100% the Imgur URL-suffix
  client-side hack (`data/imgur.util.ts`), which only works because the underlying storage happens to be
  Imgur (`ImgurStorage.url()`) — it is not a backend capability a rewrite could switch to using instead.
  If the backend ever migrates image storage away from Imgur, this trick breaks silently (thumbnails
  would just resolve to the full-size image, no crash) — worth a heads-up to whoever owns that migration.
- **`MediaType.file` is typed non-`Optional` in the schema despite the underlying model column being
  nullable** (`Media.file` is `null=True, blank=True` at the model level). This rewrite hasn't hit a
  concrete failure from it (every row returned by `medias` so far has had a file), but it's a real
  schema/model mismatch — a `Media` row with no file could plausibly make `medias` error instead of
  returning `null`, whereas `medias_group_by_period`'s `MediaScalar.file` is correctly `Optional` and the
  old frontend explicitly branches on it being falsy. Worth the backend team fixing the type to match the
  model rather than a frontend workaround.
- **No uploader/"mine" filter either** (not currently needed here, but noting it's absent in case a
  future "my uploads" view is ever wanted on `/profile` or similar).
