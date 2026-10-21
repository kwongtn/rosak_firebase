# Component: tracker

## 📌 Purpose & Scope

- **Core Responsibility:** Renders `/tracker`, a full-bleed live map of Malaysian public-transit vehicles. It polls several GTFS-realtime vehicle-position feeds plus GTFS-static stop data. Users opt sources in/out (per-operator realtime feeds, per-operator stop layers, a static railway-line overlay) through a draft → Apply flow. The result is drawn as an `@antv/l7` WebGL scene with markers, popups, and a per-layer info panel (stats, sortable table, raw JSON + CSV export).
- **Domain/Layer:** Angular Presentation: a standalone, lazy-routed page plus child components, backed by root-provided services that own polling and state. No Django/GraphQL involvement and no server-side business logic. One proxy endpoint, `/api/gtfs-proxy` (in `src/server.ts`, outside this feature), exists only to work around CORS on the GTFS-static host.

## 🔌 Interface & Data Flow

- **Route:** `tracker.routes.ts`, one lazy route (`path: ""`) → `TrackerShellPage` (`tracker-shell.page.ts`). No route params.
- **Inputs (`input()` signals):**
  - `CountdownRingComponent` (`status-card/countdown-ring.component.ts`): `source` (required `RtSource`), `error`.
  - `TrackerInfoPanelComponent` (`info-panel/tracker-info-panel.component.ts`): `open`, `kind` (required `InfoPanelKind` = `"realtime" | "stops" | "railway"`), `sourceKey`, `label` (required), `docsUrl`.
  - All other children (`TrackerMapComponent`, `StatusCardComponent`, `LayerChecklistComponent`, `LayerApplyBarComponent`, `MobileLayerSheetComponent`) take no inputs and read shared state via `inject()`.
- **Outputs:** only `TrackerInfoPanelComponent.openChange`, consumed by `LayerChecklistComponent` to clear `activePanel`. Everything else propagates through service signals.
- **Network payloads (consumed, not re-exposed):** a decoded `transit_realtime.FeedMessage` per realtime source; parsed `stops.txt` rows as a GeoJSON `FeatureCollection<Point>` per static source; a zipped GeoJSON `FeatureCollection` for the railway line, fetched from Firebase Storage.
- **Dependencies:**
  - In-feature `data/` (all `providedIn: "root"`, so state survives navigating away from `/tracker`): `GtfsRealtimeService`, `GtfsStaticService`, `LayerSelectionService`, `GeojsonStorageService`; plus `layer-config.ts` and `types.ts`.
  - Core: `core/theme/theme.service.ts` (`ThemeService.resolvedTheme`, which drives the L7 map style and, through `FeedbackService`, the Sentry feedback theme); `core/dom/observe-height.ts` (`observeHeight`, measures the info panel's sticky tabs row).
  - Shared UI (`src/app/ui/*`, Spartan/Helm, style-only): `HlmCardImports`, `HlmButton`, `HlmCheckbox`, `HlmSheet` / `HlmSheetHeader` / `HlmSheetBody`.
  - Shell: `ThemeToggleComponent` (`ui/theme-toggle/theme-toggle.component.ts`), rendered inline in the shell's compact nav rather than the app-wide `<app-nav>`.
  - Environment (`src/environments/environment.ts`): `environment.mapbox.token` (map tiles), `environment.firebase` (Storage, for the railway overlay).
  - Third-party: `@antv/l7` / `@antv/l7-maps` (`Scene`, `Mapbox`, `PointLayer`, `LineLayer`, `MarkerLayer`, `Marker`, `Popup`); `gtfs-realtime-bindings`; `jszip` (GTFS-static and railway archives); `papaparse` (`stops.txt`); `firebase/app` + `firebase/storage`; `@sentry/angular` (the shell's "Report a bug" widget, lazy-loaded by `core/sentry/FeedbackService`).

## ⚙️ Internal State & Logic

- **Signals only.** No RxJS subjects or NgRx. RxJS appears only as `firstValueFrom(http.get(...))` one-shots in `GtfsStaticService` / `GeojsonStorageService`.
- **`GtfsRealtimeService`** (root): `sources = signal<Record<string, RtSource>>({})`, one `RtSource` per applied realtime checkbox.
  - Each `RtSource` schedules its own `setTimeout` (not a fixed `setInterval`) and exposes signals `feedEntities`, `isLoading`, `hasLoadedOnce`, `hasError`, `lastErrorMessage`, `secondsRemaining`, `percentRemaining`.
  - Normal cadence: `refreshIntervalMs` (default 30 s, adjustable live from the layer panel).
  - On fetch failure: exponential backoff from 5 s, capped at 5 min, independent of the normal cadence.
  - `pauseAll()` / `resumeAll()` stop and restart timers without discarding data. `TrackerShellPage` calls them from its constructor and `ngOnDestroy`, so leaving `/tracker` really stops background polling.
- **`GtfsStaticService`** (root): `sources = signal<Record<string, StaticSource>>({})`. Each `StaticSource` loads once (no polling) through `/api/gtfs-proxy`, unzips, and parses only `stops.txt` into a `FeatureCollection<Point>` signal.
- **`LayerSelectionService`** (root): draft vs. applied state.
  - Draft: `realtimeChecked`, `stopsChecked`, `railwayChecked` (default `true`).
  - Applied: `appliedRealtimeChecked`, `appliedStopsChecked`, `appliedRailway`.
  - `hasUnsavedChanges` gates the Apply/Undo bar.
  - `apply()` snapshots draft → applied and returns the concrete `RtSourceConfig` / `StaticSourceConfig` maps for the two data services. `undo()` reverts drafts to applied without touching the map or services.
  - `realtimeCount` / `stopsCount` / `railwayCount` / `selectedCount` are `computed()` badges shown in the desktop card and mobile sheet.
- **`TrackerMapComponent`** owns the single `@antv/l7` `Scene`, created in `afterNextRender` (it needs real DOM and WebGL). An `effect()` diffs the `gtfsRealtime.sources()` / `gtfsStatic.sources()` keys against internal `Set`s (`seenRtKeys` / `seenStopsKeys`) and creates or tears down one `RtMarkerLayerController` per realtime source, or one `PointLayer` per stops source. Controller construction is deferred with `queueMicrotask` to avoid Angular's NG0602 (nested effect creation). The railway `LineLayer` is fetched once and added or removed reactively from `layerSelection.appliedRailway()`.
- **Teardown** (`TrackerMapComponent.ngOnDestroy`): after the controllers and effects, it restores the document `overflow` that `init()` saved (not a constant `auto`, which fights `HlmSheet`'s lock), reads the renderer canvas, calls `scene.stopAnimate()` (the animated rail layer's `requestAnimationFrame` loop survives `destroy()`), then `scene.destroy()` (disposes the Mapbox map, its context and the layers), then loses the canvas's WebGL context by hand (L7's renderer never calls `WEBGL_lose_context`; a detached canvas keeps it alive until a GC that may never come). Each visit therefore leaves no map, context or render loop behind.
- **`RtMarkerLayerController`** (`map/rt-marker-layer.controller.ts`): a plain class, not a component, wrapping one `MarkerLayer`. An internal `effect()` clears and re-adds all vehicle markers and popups on every `RtSource.feedEntities()` change. There is no incremental diffing because L7's `MarkerLayer.addMarker` has no dedup.
- **`TrackerInfoPanelComponent`** freezes `snapshotVehicles` on open and refreshes it only on explicit `refreshSnapshot()`. `isStale` compares by reference against the live signal. This is deliberately decoupled from the ticking countdown, so the Table and JSON views don't shift while being read.

## 🧩 Extension Points & Hooks

- **Config-driven checkbox catalogs:** `data/layer-config.ts` `REALTIME_LAYER_CHECKBOXES` / `STOPS_LAYER_CHECKBOXES` (`{ label, value, endpoint, source }`) are the single source of feeds. A new operator or city feed is data-only. The checklist, apply flow, map layering and info panel all key off `value`.
- **New layer type:** extend `InfoPanelKind` and the `switch` blocks in `TrackerInfoPanelComponent` (`overviewLabel` / `overviewValue` / `rows` / `jsonText`). The sheet chrome (tabs, sticky header, CSV export, JSON highlighter) is already generic over `kind`.
- **New GTFS-RT field:** every info-panel row is independently optional (`buildVehiclePopupHtml`'s `rows.push(...)`), so exposing a field is a one-line addition.
- **New layer category:** plug into the checked / applied / undo signal triplet and the `apply()` contract.
- **Per-source timer and backoff:** isolated in `RtSource`, so retry caps, jitter or circuit-breaking can change without touching the map or UI observers.
- **Icon selection:** `iconModeForSourceKey` (`map/vehicle-marker-icon.ts`) is one hardcoded function keyed on source `value`, returning `VehicleIconMode` (`"train" | "bus"`). See the vehicle-type opportunity below for the real mapping.

## 💡 Potential Feature Opportunities

- **Shareable, deep-linkable map views.** `LayerSelectionService`'s applied signals (`appliedRealtimeChecked` / `appliedStopsChecked` / `appliedRailway`) already are the single source of truth for what is live. Serialize them to query params, and read them back on load to seed the draft before `apply()`. This is a small additive change with no new state model, just a sync point with the router. Nothing in the tracker reads query params today.
- **In-panel vehicle/stop search or filter.** Add a text filter or column search on the existing `snapshotVehicles` table. It is additive and leaves the live/snapshot decoupling (`isStale`) intact. `TrackerInfoPanelComponent` has no filter input today.
- **Center-on-me / geolocation follow.** `TrackerMapComponent` creates its `Scene` in `afterNextRender`, the SSR-safe boundary. Calling `navigator.geolocation` behind an `injectIsBrowser()` guard and panning the scene is structurally ready. There is no geolocation code today.
- **Saved/favorite layer presets.** The draft/applied/undo triplet in `LayerSelectionService` is the natural seam, but nothing persists tracker state. Everything resets to `layer-config.ts` defaults on reload. A small persistence service has to come first (localStorage is the lowest-lift option; a per-user Firestore doc matches patterns used elsewhere). The checkbox/apply/undo logic needs no changes. See COMPONENTS.md, Non-AI cross-cutting item 3.
- **Vehicle-type filtering (train vs. bus vs. other).** `iconModeForSourceKey` already hardcodes a train/bus split per source `value`, but real filtering needs GTFS-static `route_type`. `GtfsStaticService` parses only `stops.txt`. Wiring it means extending the static unzip/parse to read `routes.txt`, plus `trips.txt` to join `route_id` → `route_type` per vehicle. Then thread `route_type` alongside `feedEntities`, so `iconModeForSourceKey` and a filter control key off it instead of the source-name heuristic.

## 💡 Potential AI Feature Opportunities

- **Natural-language feed/layer queries.** Sources already expose typed data (`IFeedEntity`, parsed stop collections), and the info panel builds table and JSON views on demand. An LLM could answer ad-hoc questions ("which KTMB vehicles haven't reported in over 10 minutes?") against the live snapshot in `TrackerInfoPanelComponent`.
- **Anomaly / delay summarization.** `relativeTimeFrom` (staleness) and the occupancy/congestion labels are already computed per vehicle in `vehicle-popup-content.ts`. An AI layer could aggregate them into a plain-language service-health summary per feed (e.g. "3 of 12 KTMB vehicles are reporting stale data; RapidBus KL shows heavier-than-usual congestion"), instead of making users inspect each popup or row.
- **Smart default layer selection.** Pre-populate the draft checkboxes with likely-relevant operators inferred from a rough location or recent `/spotting` activity. The apply/undo contract stays unchanged.
