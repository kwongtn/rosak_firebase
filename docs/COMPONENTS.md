# System Component Registry & Architecture Map

_Compiled from `docs/components/*.md` — covers all 11 top-level features under `src/app/features/`.
This file is topology + feature index; per-feature interfaces, state, and extension points live in
those docs._

## High-Level System Topology

The app is a single Angular (standalone components, Signals-first) frontend with three parallel
integrations — most features use one; several straddle two:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Angular Feature Pages (src/app/features/*)                             │
│  home · gallery · gdpr · about · methodology · spotting · profile ·     │
│  console · insiden · tracker · not-found                                │
└───────┬───────────────────┬───────────────────┬─────────────────────────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────────────────┐
│ Shared Core    │   │ Firebase SDK   │   │ External / static feeds   │
│ Services       │   │ (direct)       │   │                            │
│ (src/app/core) │   │                │   │                            │
│                │   │                │   │                            │
│ GraphQLClient /│   │ Firestore      │   │ GTFS-realtime protobuf     │
│ graphqlResource│   │ onSnapshot     │   │ feeds (per-operator)       │
│ AuthService    │   │ (public/gdpr,  │   │ GTFS-static stops.txt      │
│ RecaptchaService│  │  public/about) │   │ (via /api/gtfs-proxy,      │
│ ImageUploadSvc │   │ Firebase       │   │ CORS workaround)           │
│ (+IndexedDB Q) │   │ Storage        │   │ Railway GeoJSON overlay    │
│ ThemeService   │   │ (tracker       │   │ (Firebase Storage)         │
│ observeHeight  │   │  railway file) │   │ thecatapi/dog.ceo (404 pg) │
└───────┬────────┘   └────────────────┘   └────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│ Django / Strawberry GraphQL    │   one legacy REST endpoint:
│ backend (rosak_backend)        │◄──operation/line_vehicles_status_
│ spotting · profile · console · │   trend_count (spotting's
│ insiden query/mutate here      │   VehicleStatusTrendComponent —
└────────────────────────────────┘   no GraphQL equivalent exists yet)
```

**Cross-cutting UI layers** used by nearly every feature: `src/app/ui/*` (Spartan/Helm primitives —
button, badge, skeleton, sheet, table, toast…, plus `app-avatar` and `app-external-link-icon`),
`src/app/domain-ui/*` (status badges, activity heatmap — thin wrappers over the shared enums in
`core/graphql/types.ts`), and `src/app/shell/*` (page chrome: `AppNavComponent`,
`AppFooterComponent`, account panel, compact nav, offline strip).

**Cross-cutting core** (`src/app/core/*`, no per-feature doc):

- `core/graphql/`: `graphqlResource()` reads (`data()` and `errors()` never throw; `data()` keeps the
  last good payload while the SAME request fails or retries, and a changed request clears it) and
  `GraphQLClient.request` writes. `toastSubmitFailure(toast)` is what a form's submit `catch` calls
  for any error the client did not already toast, before rethrowing to Sentry.
- `core/sentry/`: Session Replay is a dynamic `import()` after bootstrap, at idle (`main.ts`). The
  "Report a bug" widget loads on first use through `FeedbackService.openForm()` (browser only; one
  shared in-flight open; the current theme is applied on every open). Both load `?lazy` private
  copies of the Sentry packages, and `scripts/check-sentry-lazy.mjs` (end of `npm run generate`)
  fails the build if first-load code names replay or feedback.
- `core/upload/`: `ImageUploadService.triggerUpload` is the only place an image leaves the device.
  Right before the `FormData` is built, `withoutGps()` runs `stripGps` (lossless Exif GPS removal for
  JPEG, TIFF and PNG) once per queued file. `PhotoPickerComponent` accepts every image (`image/*` or an
  empty type); formats `stripGps` cannot clean (HEIC, WebP, AVIF, ...) upload as they are, GPS
  included, by the owner's choice.
- `core/time/kl-date.ts`: `klDateKey(now?)`, the Asia/Kuala_Lumpur `YYYY-MM-DD` (fixed UTC+8, the
  same in every zone), is the one "today" for `/insiden`, its calendar and the link list.
- `core/network/`: `OnlineService.isOnline` (root signal: `navigator.onLine` at startup, then the
  window's `online`/`offline` events; always `true` on the server). `false` is reliable, `true` only
  means a network exists. Read by `OfflineStripComponent` (`shell/offline-strip/`: a slim
  non-blocking "You're offline" line under `<app-nav>` and at the bottom of `<app-compact-nav>`; its
  host is a permanent `role="status"` `aria-live="polite"` region, empty while online) and by
  `NewVersionService`. `PollingSource` (`core/polling/`) reads `navigator.onLine` itself, the way it
  reads `document.hidden`: offline pauses the beat, and the `online` event refreshes at once (not
  while hidden, never for a "Never" beat).
- `core/version/`: `NewVersionService` polls `/version.json` every 10 minutes while online
  (`cache: "no-store"` plus an `ngsw-bypass` header, so neither the HTTP cache nor the service worker
  answers it) and prompts for a reload on a failed same-origin chunk only.
  `promptReloadForNewVersion()` (also called by `AppErrorHandler` for router chunk errors) checks
  `OnlineService` first: offline it toasts "You're offline. This page needs a connection." on every
  failed attempt. Online it asks `/version.json` (5 s timeout) before blaming a deploy, because in a
  tunnel `navigator.onLine` stays `true` on a link that carries nothing. No answer gives the same
  offline toast, this build's hash gives "This page couldn't load. Check your connection and try
  again.", and only a different hash sets `hasNewVersion` and lights the update button. That
  button's click (`reloadForNewVersion()`) clears Cache Storage, the worker's precache included,
  and reloads. Offline it does neither and toasts "You're offline. Reconnect to load the new
  version." instead.
- **Installable app and service worker** (no `core/` module):
  - `public/manifest.webmanifest`: "MLPTF", `display: standalone`, `start_url: "/"`, background and
    theme `#fafcff` (the light `--background`). Icons in `public/icons/`: 192 and 512 PNG, a
    maskable 512 and an opaque 180 `apple-touch-icon.png` (iOS paints transparency black). They
    were rasterised once from `favicons/default.svg` and are not regenerated like `favicon.svg`, so
    re-rasterise them by hand if the logo changes. `src/index.html` links the manifest and the touch
    icon and sets two `theme-color` metas (`#fafcff` light, `#080e16` dark). They follow the OS
    scheme, not an in-app `ThemeService` override.
  - `app.config.ts` registers `ngsw-worker.js` with `provideServiceWorker`: `enabled: !isDevMode()`,
    `registrationStrategy: "registerWhenStable:30000"`, never on the server. Only `angular.json`'s
    production configuration sets `"serviceWorker": "ngsw-config.json"`, so `ng serve` and the e2e
    dev build have no worker.
  - `ngsw-config.json`: group `app` prefetches `/*.css`, `/*.js` (all hashed; about 1.7 MB gzip
    today, more than half of it the tracker chunk) and `/index.csr.html`, the CSR shell. Group
    `media` caches images lazily. `navigationRequestStrategy` is `freshness` with the default
    `navigationUrls`, so every navigation goes to the network first and SSR answers it. Only when
    that request fails does the worker serve the cached CSR shell. The SSR HTML itself is never
    cached. `index` must stay `/index.csr.html`: `ng build` overwrites it with the CSR shell's name
    whatever the config says, so a static offline page cannot be the fallback. There is no data
    group: GraphQL reads are POSTs and ngsw caches only GET and HEAD, so the board has no offline
    data yet. `src/app/ngsw-config.spec.ts` runs the real ngsw generator over a fake build output
    to pin these rules.
  - Offline, in-app navigation to a lazy route works from the precache. A full reload or a cold
    open offline (the home-screen icon included) boots the app from the CSR shell, the path
    `RenderMode.Client` routes already take: the nav and the offline strip render, reads show their
    error states, and the `online` event refreshes the board on reconnect. Until the worker has
    installed and finished its prefetch (a first visit: up to 30 s, then the download), an offline
    reload still gets the browser's own error page.
  - `src/server.ts` serves `browser/` with a one-year `max-age`, except the files
    `staticCacheControl()` (`src/server-cache-control.ts`) lists: the worker files, `ngsw.json`,
    the web app manifest, `icons/`, `index.csr.html` and `version.json` get `no-cache`, since
    their names survive a deploy.
  - `@angular/service-worker` declares the exact `@angular/core` version as a peer dependency: bump
    it together with the other `@angular/*` packages.
  - **To disable it:** remove `"serviceWorker"` from `angular.json` and `provideServiceWorker` from
    `app.config.ts`, then deploy. An installed worker that gets a 404 for `/ngsw.json` (the app's
    not-found page) deletes its caches and unregisters itself. `enabled: false` alone is not
    enough: it stops new registrations but leaves installed workers running. In an emergency,
    serve the emitted `safety-worker.js` as `ngsw-worker.js`: it unregisters itself and clears the
    caches.
- **Sheet hosts** (home, `/insiden`, `/spotting`, every Situasi tab) mount the form of a closed sheet
  behind `@defer (when <sheet>.isOpen(); prefetch on idle)`, so its reads stay out of SSR and
  TransferState. Footers reach the form through a string-locator `viewChild`, null-safe.

**Content models coexist by design:**

- **GraphQL-backed, dynamic:** home, spotting, profile, console, insiden — user/admin-generated
  data, queried live from the Django backend.
- **Firestore-backed, hand-edited CMS:** gdpr, about — single documents (`public/gdpr`,
  `public/about`) edited by an admin outside the app, streamed via `onSnapshot`. Same pattern in
  both (private `_data` signal + `computed()` projections + manual subscribe/`ngOnDestroy`
  unsubscribe).
- **Code-first static content:** methodology — `/methodology` reads a typed TypeScript registry
  (`src/app/core/methodology/`: `methodology.constants.ts` + `methodology.content.ts`), is
  `RenderMode.Server` for indexability, and is neither Firestore nor GraphQL-backed in v1. The same
  registry feeds every `app-info-popover`, so page and tooltips cannot drift.
- **tracker** is the outlier: no app-backend involvement — it polls third-party GTFS feeds directly.
- **gallery** and **not-found** are the purely read/decorative leaves — gallery reads the GraphQL
  backend read-only; not-found only calls cosmetic third-party image APIs.

## Component Catalog

All features are Angular presentation layers under `src/app/features/<name>/`. "Deps" are key
dependencies; "Extend" is the primary extension point. Full detail is in each linked doc.

- **home** (`features/home/` — page + hero/feed/line-pulse/line-status/refresh-control/report/pro
  groups + route-scoped store; [doc](components/home.md)) — Public landing page at `""`: a Today /
  Last Week rolling link feed (login-gated submit, duplicate detection, votes) under a hero (stat
  tiles, intent CTAs, refresh donut) over the **network board** — a three-group partition of the
  line read (`Needs attention`, `My lines`, `All lines`) with a five-intent report chooser, a
  draft-first line-status sheet, 24-hour history strips, and, for `?view=pro`, a bento dashboard
  (extra filters, heat grid, CSV export, ongoing incidents, Line HQ, `/` `r` `p` shortcuts).
  - Deps: `graphqlResource`/`GraphQLClient`, `AuthService`; route-scoped
    `HomeStore`/`HomeViewModeService` (the one writer of `?view=`)/`LineStatusSheetService`; root
    `ReportChooserService`/`IncidentSheetService`/`PreferencesService`; `core/url-state`,
    `core/export/csv.util.ts`; insiden's `AssetMultiSelectComponent`, `VoteButtonComponent`,
    `app-link-thread`; spotting's `humanizeSince`.
  - Extend: the `home-*.queries.ts` GraphQL contract files (`pulseLinks.isAutomated` is what makes
    "official" mean anything); `HomeStore` (polling beat, cursor pagination, `userVote` overlay,
    board derivations, `isStale`); pure utils (`passenger-status`, `network-summary`, `status-confidence`,
    `status-history-display`, `feed-url`, `feed-day-groups`, `feed-filter` — all `*.util.ts`);
    `LinkSheetService` prefill, `LineStatusSheetService.openFor(id, { presetStatus })`,
    `ReportChooserService` intent seam; `HOME_FEED_COLLAPSE_VARS` on every feed read;
    `ui/motion/tick-up.directive.ts` (`hlmTickUp`, the one number-reveal primitive) + the
    `--animate-*` `@theme` tokens (all motion is inert under `prefers-reduced-motion`).
- **gallery** (`features/gallery/` — page + 3 child components + pure utils;
  [doc](components/gallery.md)) — Paginated, year-grouped public photo feed with a full-screen
  lightbox, driven by a Relay-style GraphQL connection. A shared `/gallery/:mediaId` link opens from
  one `media(id)` fetch (on the server too) with per-photo share tags. The lightbox steps between
  photos (arrow keys, swipe, buttons; fetching the next page at the end of the feed) and shares a
  photo's link.
  - Deps: `graphqlResource`/`GraphQLClient`, `ToastService`, `Title`/`Meta`, Hlm button/skeleton.
  - Extend: reusable `JustifiedGridComponent` (CSS-only layout, so the server renders the photos)
    and `MediaViewerComponent` (modal dialog; input/output driven, no gallery coupling: optional
    `prev`/`next`/`sharePath` inputs and a `navigate` output, plain without them, as in insiden);
    pure `getImgurThumbnail()`/`mediaLabel()`.
- **gdpr** (`features/gdpr/` — single page; [doc](components/gdpr.md)) — Read-only GDPR compliance
  checklist rendered from a hand-edited Firestore doc.
  - Deps: `firebase/firestore` (`public/gdpr`, direct SDK), `HlmBadge`/`HlmSkeleton`.
  - Extend: the `GdprDetail`/`GdprDetailChild` schema is additive; new checklist fields need no
    component changes.
- **about** (`features/about/` — single page; [doc](components/about.md)) — About page (project
  blurb, sub-projects, personnel, tech stack, community projects) from a Firestore doc, with an
  in-page admin editor (`AboutEditorComponent`, form-only child loaded with `@defer`; the page owns
  `setDoc` on save).
  - Deps: `firebase/firestore` (`public/about`), Hlm Card/Badge/Button/Skeleton.
  - Extend: schema-driven `@for` over `display`-flagged arrays; `STATUS_VARIANT` lookup for new
    project statuses.
- **methodology** (`features/methodology/` — page + section component over `core/methodology/`;
  [doc](components/methodology.md)) — Public "How this is counted" page: 8 anchored method sections,
  each naming its owning spec and rendering the in-progress state until that spec's code lands; the
  one registry that also feeds every `app-info-popover`.
  - Deps: `core/methodology/` registry, `Meta`, `RouterLink`, `app-info-popover`,
    `app-disclaimer-note`.
  - Extend: `methodology.constants.ts` / `methodology.content.ts` (add a `MetricDoc` + token);
    `renderMethodologyCopy()`; the `InfoPopover` `popoverExtra` slot.
- **spotting** (`features/spotting/` — flagship; 7 subcomponent groups + route-scoped store;
  [doc](components/spotting.md)) — Crowd-sourced train/rolling-stock spotting log: browse per-line
  fleet/history/incidents, submit spotting reports.
  - Deps: `graphqlResource`/`GraphQLClient`, `AuthService`, `ImageUploadService`/compression,
    `@angular/forms/signals`, domain-ui badges/heatmap.
  - Extend: `ReportSheetService` (cross-page sheet trigger seam); `report-form.schema.ts`
    (declarative validation); `spotting.queries.ts` (single GraphQL contract seam, including the
    one-vehicle `VEHICLE_HEADER_QUERY` behind the vehicle page).
- **profile** (`features/profile/` — page + `user-card`/`my-spottings`/`my-links`;
  [doc](components/profile.md)) — Signed-in user's dashboard: identity, editable nickname, spotting
  stats/heatmap, deletable spotting history, own submitted links with thread grouping.
  - Deps: `GraphQLClient`, `AuthService`, `RecaptchaService`, domain-ui heatmap/badges.
  - Extend: `data/profile.queries.ts` (single seam for query/type changes); `UserCardComponent`'s
    `isOwnProfile` input picks the own branch (signed-in identity, edit, privacy, votes) or the
    public branch (the owner's nickname, no controls).
- **console** (`features/console/` — admin-only; spotting page + `insiden/pending` incident queue +
  `insiden/links` link triage at `/console/links`; [doc](components/console.md)) — Admin moderation
  queues: crowd-submitted spotting events (filter, paginate, bulk mark-as-read), pending incidents
  (approve/reject + full editor), and social-media link triage (filters,
  Approve/Hide/Mark-completed/Delete, full edit sheet, accordion over the link tree with
  context-gated row verbs).
  - Deps: `GraphQLClient`, `AuthService`, `adminOnlyGuard`, `ReCaptchaV3Service`.
  - Extend: `FilterFormModel`/`buildFilters()` additive per-field pattern; `useBulkActions`
    (`core/composables/use-bulk-actions.ts`: always-on `checkedIds` + `anchorId` selection with
    shift-click range-select; pure `toggleCheckedRange` exported beside it); the link table's single
    `linkStatusInput()` builder (replace-not-patch payload) and the shared
    `link-thread-selection.util.ts` helpers (also used by profile's My Links).
- **not-found** (`features/not-found/` — single page; [doc](components/not-found.md)) — Catch-all
  404 with SSR-correct HTTP status, deterministic per-URL joke messaging, and a two-screen layout
  (pet photo one screen down, viewport-pinned footer).
  - Deps: `Router`/`Location`, `LineStatusBadge`, cat/dog public image APIs.
  - Extend: `NOT_FOUND_MESSAGES` + `NOT_FOUND_SCROLL_LINES` static content pools; the pet-photo
    block is isolated behind `@if`/platform guard.
- **insiden** (`features/insiden/` — page + form + card + calendar + the shared link components
  `link-card`/`link-list`/`link-sheet`/`link-thread` + vote; [doc](components/insiden.md)) —
  Community incident reporting: month calendar + day-scoped list + ongoing/long-running pinning;
  create/edit incidents through the approval lifecycle, chronology status/votes/deletion requests,
  per-incident links with infinite scroll, in-page photo viewer.
  - Deps: `graphqlResource`, `GraphQLClient`, `AuthService`, `ImageUploadService`,
    `MediaViewerComponent` (from gallery), `PhotoPickerComponent` (from spotting), `klDateKey`
    (`core/time`), `ngx-markdown`, `InfiniteScrollDirective`.
  - Extend: `insiden.queries.ts` (single flat-query seam); `SEVERITY_*`/`CHRONOLOGY_DOT` lookup
    tables; `RetryableResource` structural interface; pure utils (`canEditIncident`,
    `incidentLinkLine`, `incidentToForm`, `chronologyStatusLabel`, `linkDisplayInstant`,
    `isoToOccurredAtInput`/`occurredAtInputToIso`, `link-thread-selection` helpers);
    `app-link-thread` is the named extension point for any grouped link row.
- **tracker** (`features/tracker/` — shell + map + status-card + info-panel, 4 root-provided
  services; [doc](components/tracker.md)) — Full-bleed live WebGL map of GTFS-realtime vehicles +
  GTFS-static stops + railway overlay, with opt-in layers via a draft/Apply flow.
  - Deps: `GtfsRealtimeService`/`GtfsStaticService`/`LayerSelectionService`/`GeojsonStorageService`
    (root), `@antv/l7`, Firebase Storage, `/api/gtfs-proxy`.
  - Extend: `layer-config.ts` checkbox catalogs (data-only new-feed addition); the `InfoPanelKind`
    union; the draft/applied/undo signal-triplet contract in `LayerSelectionService`.

## Cross-Component Feature Opportunities

Every feature doc proposes LLM/embedding features, but there is no AI infrastructure — no `core/ai`
service, LLM client, or embeddings store.

1. **Unified "service health" digest (spotting + insiden + tracker).** The three share a
   status/severity vocabulary (`core/graphql/types.ts` enums, `domain-ui` badges); one "what's
   happening now" summary component on a shared surface beats three one-off summarizers.
2. **One AI vision pipeline for uploaded photos (gallery + spotting + insiden).**
   `ImageUploadService`/`ImageCompressionService` is the single upload queue behind spotting and
   insiden photos (and, indirectly, gallery's bot-ingested media). A pre-/post-upload hook there
   yields alt-text, duplicate detection, and moderation for all three and for console's review
   queue. `ImageUploadService.withoutGps()` is already one such pre-upload hook.
3. **Shared "CMS AI editor" for gdpr + about.** Both are a single Firestore doc with the same
   `_data` + `computed()` shape (gdpr read-only, about with an in-page admin editor); one
   schema-aware drafting tool over `PublicGdprDocument`/`PublicAboutDocument` covers both with no
   page changes.
4. **Missing component — a provider-agnostic LLM/embedding gateway** (auth, rate-limiting, caching),
   injectable like `GraphQLClient`/`ToastService`. Prerequisite for 1–3 and every per-feature AI
   idea.

## Cross-Component Feature Opportunities (Non-AI)

Synthesized from each feature doc's `Potential Feature Opportunities`. Per-feature bullets for 1–3:
[`MISTAKES.md`](../MISTAKES.md#cross-component-opportunities).

1. **URL-state sync (signal ↔ query param).** Shared helper exists:
   `core/url-state/query-param.util.ts` (pure read helpers, one browser-gated merge/replace write;
   defaults are never written to the URL). Adopted by home (`?view=`/`?sort=`/`?line=`/`?q=`);
   spotting's line-overview encodes `sort`/`dir` inline. Not yet adopted: gdpr
   (item deep-links), about (section anchors), spotting filters, console (shareable filter views),
   insiden (per-incident expand state), tracker (map/layer views). Elsewhere only path params are
   bound.
2. **Client-side export.** `core/export/csv.util.ts` exists (`toCsv` is pure and always emits a
   header row; `downloadCsv` is browser-gated); its only consumer is home's Pro lines widget
   (tracker's info panel keeps a private `toCsv`). Still wanted, with data already client-side and
   no backend change: profile (spotting history CSV/JSON), console (filtered queue), insiden
   (`.ics`), gallery (per-year zip). No JSON/`.ics`/zip helper yet.
3. **User preferences / persistence.** `core/preferences/preferences.service.ts`
   (`PreferencesService`, localStorage key `rosak:preferences:v1`) holds home's pinned lines, view
   mode, density, etc.; home is the only consumer. Still missing: tracker saved layer presets,
   spotting report-form drafts, profile settings. The only other persistence is the upload queue's
   IndexedDB.
4. **"Select rows, then act" bulk actions (console + profile).** **Status: split (2026-10-01)** —
   there are two shared implementations, not the one extraction originally asked for:
   `core/composables/use-bulk-actions.ts` (console's spotting queue: always-on selection,
   `checkedIds` `Set<string>`, `anchorId`, single toggle + Shift-click range-select over
   `orderedIds`, pure `toggleCheckedRange()` with its own spec; one consumer, `ConsolePage`) and
   `features/insiden/data/link-thread-selection.util.ts`
   (`toggleSelection`/`areAllSelected`/`canGroup`/`canNest`/`selectedWithin`/`threadLabel`; read by
   console's `/console/links` and profile's "My Submitted Links"). Remaining gap: profile's
   **proposed** bulk-delete of spotting entries has no selection UI. A future extraction should pick
   **one** of the two rather than add a third, and keep the immutability contract both honour
   (results are written straight into a signal, so an in-place mutation is invisible to change
   detection). No mode toggle is left to lift.
