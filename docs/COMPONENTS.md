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
`AppFooterComponent`, account panel, compact nav).

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
    board derivations); pure utils (`passenger-status`, `network-summary`, `status-confidence`,
    `status-history-display`, `feed-url`, `feed-day-groups`, `feed-filter` — all `*.util.ts`);
    `LinkSheetService` prefill, `LineStatusSheetService.openFor(id, { presetStatus })`,
    `ReportChooserService` intent seam; `HOME_FEED_COLLAPSE_VARS` on every feed read;
    `ui/motion/tick-up.directive.ts` (`hlmTickUp`, the one number-reveal primitive) + the
    `--animate-*` `@theme` tokens (all motion is inert under `prefers-reduced-motion`).
- **gallery** (`features/gallery/` — page + 3 child components + pure utils;
  [doc](components/gallery.md)) — Paginated, year-grouped public photo feed with a full-screen
  lightbox, driven by a Relay-style GraphQL connection.
  - Deps: `graphqlResource`/`GraphQLClient`, `ToastService`, Hlm button/skeleton.
  - Extend: reusable `JustifiedGridComponent`/`MediaViewerComponent` (pure input/output, no gallery
    coupling); pure `computeJustifiedRows()`/`getImgurThumbnail()`.
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
    (declarative validation); `spotting.queries.ts` (single GraphQL contract seam).
- **profile** (`features/profile/` — page + `user-card`/`my-spottings`/`my-links`;
  [doc](components/profile.md)) — Signed-in user's dashboard: identity, editable nickname, spotting
  stats/heatmap, deletable spotting history, own submitted links with thread grouping.
  - Deps: `GraphQLClient`, `AuthService`, `RecaptchaService`, domain-ui heatmap/badges.
  - Extend: `data/profile.queries.ts` (single seam for query/type changes); the `isOwnProfile`
    branch is already wired as a placeholder for a future by-id public-profile backend field.
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
    `MediaViewerComponent` (from gallery), `PhotoPickerComponent` (from spotting), `ngx-markdown`,
    `InfiniteScrollDirective`.
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
   queue.
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
   spotting's line-overview encodes `sort`/`dir` inline. Not yet adopted: gallery (copy-link), gdpr
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
