# Component: tracker

## 📌 Purpose & Scope

- **Core Responsibility:** Renders `/tracker`, a full-bleed live map of Malaysian public-transit
  vehicles. It polls multiple GTFS-realtime vehicle-position feeds and GTFS-static stop/route
  data, lets the user opt in/out of individual data sources (per-operator realtime feeds, per-
  operator stop layers, a static railway-line overlay) through a two-stage draft/Apply flow, and
  renders the result as an `@antv/l7` WebGL scene with markers, popups, and a per-layer debug/
  info panel (stats, sortable table, raw JSON + CSV export).
- **Domain/Layer:** Angular Presentation (standalone, lazy-loaded routed page + a cluster of child
  components) backed by root-provided Angular services that own polling/state — no server-side
  business logic of its own; one small proxy endpoint (`/api/gtfs-proxy`, outside this directory)
  exists purely to work around a CORS limitation on the upstream GTFS-static host.

## 🔌 Interface & Data Flow

- **Route:** `tracker.routes.ts` — single lazy route (`path: ""`) loading `TrackerShellPage`
  (`tracker-shell.page.ts`), the feature's entry point. No route params.
- **Inputs / Props / Signals** (component-level, `input()`/`@Input`-style):
  - `CountdownRingComponent` (`status-card/countdown-ring.component.ts`): `source =
input.required<RtSource>()`, `error = input(false)`.
  - `TrackerInfoPanelComponent` (`info-panel/tracker-info-panel.component.ts`): `open =
input(false)`, `kind = input.required<InfoPanelKind>()` (`"realtime" | "stops" | "railway"`),
    `sourceKey = input<string | null>(null)`, `label = input.required<string>()`, `docsUrl =
input<string | null>(null)`.
  - All other subcomponents (`TrackerMapComponent`, `StatusCardComponent`,
    `LayerChecklistComponent`, `LayerApplyBarComponent`, `MobileLayerSheetComponent`) take no
    inputs — they read shared state directly via `inject()`.
- **Outputs / Events / API Responses:**
  - `TrackerInfoPanelComponent.openChange = output<boolean>()` — sheet open/close, consumed by
    `LayerChecklistComponent` to clear `activePanel`.
  - No `@Output`s elsewhere; state changes propagate through shared services' signals rather than
    component events.
  - Network responses consumed (not re-exposed): decoded `transit_realtime.FeedMessage` protobuf
    per realtime source; parsed `stops.txt` rows turned into a GeoJSON `FeatureCollection<Point>`
    per static source; a zipped GeoJSON `FeatureCollection` (railway line) from Firebase Storage.
- **Dependencies:**
  - **In-feature (`data/`):** `GtfsRealtimeService`, `GtfsStaticService`, `LayerSelectionService`,
    `GeojsonStorageService` (all `providedIn: "root"`, so state survives navigation away from
    `/tracker`), plus static config (`layer-config.ts`) and shared types (`types.ts`).
  - **Core:** `src/app/core/theme/theme.service.ts` (`ThemeService.resolvedTheme` — drives both
    the L7 map style and the Sentry feedback widget theme); `src/app/core/dom/observe-height.ts`
    (`observeHeight` — measures the info panel's sticky tabs-row height for stacked sticky
    headers).
  - **Shared UI (`src/app/ui/*`, Spartan/Helm-style):** `HlmCardImports`, `HlmButton`,
    `HlmCheckbox`, `HlmSheet`/`HlmSheetHeader`/`HlmSheetBody` — style-only directives, no state.
  - **Shell:** `src/app/ui/theme-toggle/theme-toggle.component.ts` (`ThemeToggleComponent`),
    rendered inline in the shell's own compact nav rather than the app-wide `<app-nav>`.
  - **Environment:** `src/environments/environment.ts` — supplies `environment.mapbox.token` (map
    tiles) and `environment.firebase` (Storage config for the railway overlay).
  - **Third-party:** `@antv/l7` / `@antv/l7-maps` (`Scene`, `Mapbox`, `PointLayer`, `LineLayer`,
    `MarkerLayer`, `Marker`, `Popup`) for the WebGL map; `gtfs-realtime-bindings`
    (`transit_realtime.FeedMessage`) to decode realtime protobuf; `jszip` to unzip GTFS-static and
    the railway GeoJSON archive; `papaparse` to parse `stops.txt`; `firebase/app` +
    `firebase/storage` for the railway overlay's download URL; `@sentry/angular` for the shell's
    "Report a bug" feedback widget.

## ⚙️ Internal State & Logic

- **Angular Signals only** — no RxJS subjects/NgRx in this feature's own code (RxJS appears only
  as `firstValueFrom(http.get(...))` one-shot HTTP calls inside `GtfsStaticService`/
  `GeojsonStorageService`).
- **`GtfsRealtimeService`** (root): `sources = signal<Record<string, RtSource>>({})`, one `RtSource`
  per applied realtime checkbox. Each `RtSource` self-schedules its own `setTimeout` (not a fixed
  `setInterval`), exposes `feedEntities`, `isLoading`, `hasLoadedOnce`, `hasError`,
  `lastErrorMessage`, `secondsRemaining`, `percentRemaining` as signals, and implements
  exponential backoff on fetch failure (5s → capped 5min) independent of the shared "normal"
  refresh cadence (`refreshIntervalMs`, adjustable live from the layer panel). `pauseAll()` /
  `resumeAll()` stop/restart timers without discarding data — driven by `TrackerShellPage`'s
  `ngOnDestroy`/constructor so navigating away truly stops background polling (documented as a fix
  for a bug in the ported predecessor).
- **`GtfsStaticService`** (root): `sources = signal<Record<string, StaticSource>>({})`; each
  `StaticSource` loads once (no polling) via a server-proxied fetch (`/api/gtfs-proxy`) to sidestep
  upstream CORS, unzips, and parses only `stops.txt` into a `FeatureCollection<Point>` signal.
- **`LayerSelectionService`** (root): draft vs. applied state pattern — `realtimeChecked` /
  `stopsChecked` / `railwayChecked` signals hold in-progress checkbox state;
  `appliedRealtimeChecked` / `appliedStopsChecked` / `appliedRailway` hold what's live on the map;
  `hasUnsavedChanges` gates the Apply/Undo bar. `apply()` snapshots the draft as applied and
  returns the concrete `RtSourceConfig`/`StaticSourceConfig` maps for the two data services to
  consume; `undo()` reverts drafts to last-applied without touching the map/services.
  `realtimeCount`/`stopsCount`/`railwayCount`/`selectedCount` are `computed()` badges shown in both
  the desktop card and mobile sheet.
- **`TrackerMapComponent`** owns the single `@antv/l7` `Scene` instance (created in
  `afterNextRender`, since it needs real DOM/WebGL). It reactively diffs
  `gtfsRealtime.sources()`/`gtfsStatic.sources()` keys each `effect()` tick against internally
  tracked `Set`s (`seenRtKeys`/`seenStopsKeys`) to create/tear down one `RtMarkerLayerController`
  (realtime) or one `PointLayer` (stops) per active source, deferring controller construction via
  `queueMicrotask` to avoid Angular's NG0602 (no nested-effect-creation) error. The railway
  `LineLayer` is fetched once but added/removed from the scene reactively based on
  `layerSelection.appliedRailway()`.
- **`RtMarkerLayerController`** (`map/rt-marker-layer.controller.ts`) is a plain class (not an
  Angular component) wrapping one `MarkerLayer`; an internal `effect()` redraws all vehicle markers
  - popups on every `RtSource.feedEntities()` change, clearing and re-adding all markers each tick
    (no incremental diffing) since L7's `MarkerLayer.addMarker` has no dedup.
- **`TrackerInfoPanelComponent`** freezes a snapshot of live data (`snapshotVehicles`) on open and
  only refreshes it on explicit user action (`refreshSnapshot()`), computing an `isStale` flag by
  reference-inequality against the live signal — deliberately decoupled from the ticking countdown
  so the Table/JSON views don't visibly shift underfoot while being read.

## 🧩 Extension Points & Hooks

- **Config-driven checkbox catalogs:** `data/layer-config.ts`'s `REALTIME_LAYER_CHECKBOXES` /
  `STOPS_LAYER_CHECKBOXES` arrays (`{ label, value, endpoint, source }`) are the single source of
  truth for available feeds — adding a new operator/city feed is a data-only change; the
  checklist, apply flow, map layering, and info panel all key off `value` and pick it up with no
  further code changes.
- **`InfoPanelKind` union (`"realtime" | "stops" | "railway"`):** a new layer _type_ (e.g. a
  service-alerts overlay) would extend this union plus the small `switch` blocks in
  `TrackerInfoPanelComponent` (`overviewLabel`/`overviewValue`/`rows`/`jsonText`) — the sheet
  chrome (tabs, sticky header, CSV export, JSON highlighter) is already generic over `kind`.
  Every info-panel row is independently optional (`buildVehiclePopupHtml`'s `rows.push(...)`
  pattern), so a feed exposing a new GTFS-RT field is a one-line addition, not a template rewrite.
- **`VehicleIconMode` (`vehicle-marker-icon.ts`):** icon selection is a single hardcoded function
  (`iconModeForSourceKey`) keyed on source `value` — currently only distinguishes "train" (KTMB)
  vs. "bus" (everything else); a real mapping would key off GTFS-static `route_type` once that
  data is wired through, without touching marker-rendering code.
- **Draft/Apply separation (`LayerSelectionService`):** any future layer category can plug into
  the same checked/applied/undo signal triplet + `apply()` contract rather than inventing new
  state-management per layer type.
- **`RtSource`'s self-rescheduling timer + backoff:** isolated per source, so per-feed reliability
  behavior (retry caps, jitter, circuit-breaking) can be tuned or extended without touching the
  map or UI layers that merely observe its signals.

## 💡 Potential Feature Opportunities

- **Shareable/deep-linkable map views:** `LayerSelectionService`'s applied signals
  (`appliedRealtimeChecked`/`appliedStopsChecked`/`appliedRailway`) already represent the single
  source of truth for what's live on the map, so serializing them to query params (and reading
  them back on load to seed the draft before `apply()`) is a small additive change — no new state
  model needed, just a sync point between the existing signals and the router.
- **In-panel vehicle/stop search or filter:** `TrackerInfoPanelComponent` already freezes a
  `snapshotVehicles` array and renders it as a sortable table; adding a text filter or column
  search is additive on top of that existing snapshot rather than a new data path, and wouldn't
  disturb the deliberate live/snapshot decoupling (`isStale`) design.
- **Center-on-me / geolocation follow:** `TrackerMapComponent` owns the single `Scene` instance
  created in `afterNextRender`, which is exactly the SSR-safe boundary the codebase's conventions
  require for browser-only APIs — calling `navigator.geolocation` behind the existing
  `isPlatformBrowser` guard and panning/zooming the scene to the result is structurally ready
  today.
- **Saved/favorite layer presets:** the draft/applied/undo signal triplet in
  `LayerSelectionService` is the natural seam for "save this checkbox combination as a preset,"
  but there's currently no persistence layer (no localStorage, user profile, or Firestore doc)
  backing any tracker state — everything resets to `layer-config.ts` defaults on reload. Context
  for future LLMs: this needs a new small persistence service (localStorage is the lowest-lift
  option; a Firestore CMS doc keyed by user would match patterns used elsewhere in the app) before
  presets can survive a page reload; the checkbox/apply/undo logic itself needs no changes.
- **Vehicle-type filtering (train vs. bus vs. other):** `VehicleIconMode`'s `iconModeForSourceKey`
  already hardcodes a train/bus split per source `value`, so a checklist filter to show/hide
  vehicle types feels like an obvious next step — but it isn't ready: real filtering needs
  GTFS-static `route_type` data, and `GtfsStaticService` currently only parses `stops.txt`, not
  `routes.txt`/`trips.txt`. Context for future LLMs: wiring `route_type` through means extending
  `GtfsStaticService`'s unzip/parse step to also read `routes.txt` (and `trips.txt` to join
  `route_id` → `route_type` per vehicle), then threading that value alongside `feedEntities` so
  `iconModeForSourceKey` (and a new filter control) can key off it instead of the source-name
  heuristic.

## 💡 Potential AI Feature Opportunities

- **Natural-language feed/layer queries:** since every source already exposes structured, typed
  data (`IFeedEntity`, parsed stop `FeatureCollection`s) and the info panel already builds
  table/JSON views on demand, an LLM could answer ad-hoc questions ("which KTMB vehicles haven't
  reported in over 10 minutes?", "how many buses are currently in the Kuantan feed?") directly
  against the live snapshot already surfaced in `TrackerInfoPanelComponent`.
- **Anomaly / delay summarization:** `relativeTimeFrom` (staleness) and occupancy/congestion
  labels are already computed per vehicle in `vehicle-popup-content.ts` — an AI layer could
  aggregate these across a feed to surface a plain-language "service health" summary (e.g. "3 of
  12 KTMB vehicles are reporting stale data; RapidBus KL shows heavier-than-usual congestion")
  rather than requiring a user to manually inspect each vehicle popup or table row.
- **Smart default layer selection:** `LayerSelectionService`'s draft/apply model is a natural seam
  for an AI-suggested starting layer set (e.g. inferring likely-relevant operators from a user's
  rough location or recent `/spotting` activity elsewhere in the app) that pre-populates the
  draft checkboxes before the user ever opens the panel, without changing the apply/undo
  contract itself.
