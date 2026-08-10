# Situasi

## Path(s) & Routing

**Top-level path:** `/situasi` — defined in
`/home/kwongtn/rosak_firebase/src/app/app-routing.module.ts:132-150`.

```ts
{
    path: "situasi",
    title: "MLPTF | Situasi",
    loadChildren: async () => {
        if (maintenance.situasi.curentlyInMaintenance) {
            const module = await import("./construction/construction.module");
            return module.ConstructionModule;
        } else {
            const module = await import("./situasi/situasi.module");
            return module.SituasiModule;
        }
    },
    component: maintenance.situasi.curentlyInMaintenance
        ? ConstructionComponent
        : SituasiComponent,
    ...canActivate(betaTesterOnly),
},
```

- **Page `<title>`:** `MLPTF | Situasi` (set via Angular Router `title` property, `app-routing.module.ts:134`).
- **Route guard:** `canActivate(betaTesterOnly)` where
  `betaTesterOnly()` returns `hasCustomClaim("betaTester")` from `@angular/fire/auth-guard`
  (`app-routing.module.ts:64-66`). **The entire `/situasi` subtree is gated behind the
  Firebase Auth custom claim `betaTester` — this is currently a beta-only feature.** There is
  no `redirectTo` configured for this guard (unlike `redirectUnauthorizedToSpotting` used on
  `/profile`), so `@angular/fire`'s default behavior for a failed `AuthPipe` applies (the
  router navigation is cancelled; no explicit fallback route is coded here).
- **Maintenance-mode switch:** `maintenance.situasi.curentlyInMaintenance` (`app-routing.module.ts:48-50`),
  currently hardcoded to `false`. If flipped to `true`, `/situasi` lazy-loads
  `ConstructionModule` / `ConstructionComponent` (`/home/kwongtn/rosak_firebase/src/app/construction/`)
  instead of the real feature — a simple "under maintenance" placeholder page, entirely
  independent of the beta-tester guard (the guard still applies even in maintenance mode).
- **Lazy-loaded module:** `SituasiModule` at
  `/home/kwongtn/rosak_firebase/src/app/situasi/situasi.module.ts`, shell component
  `SituasiComponent` (`situasi.component.ts`, selector `app-situasi`).
- **Child routes** — defined in
  `/home/kwongtn/rosak_firebase/src/app/situasi/situasi-routing.module.ts`, all rendered inside
  `SituasiComponent`'s `<router-outlet>`:

    | Path (relative to `/situasi`) | Lazy module                                                          | Component                 |
    | ----------------------------- | -------------------------------------------------------------------- | ------------------------- |
    | `""`                          | `overall/overall.module.ts` → `OverallModule`                        | `OverallComponent`        |
    | `:lineId`                     | `line/line.module.ts` → `LineModule`                                 | `LineComponent`           |
    | `:lineId/vehicles`            | `vehicles/vehicles.module.ts` → `VehiclesModule`                     | `VehiclesComponent`       |
    | `:lineId/vehicles/:tabName`   | `vehicles/vehicles.module.ts` → `VehiclesModule`                     | `VehiclesComponent`       |
    | `:lineId/station`             | `stations/stations.module.ts` → `StationsModule`                     | `StationsComponent`       |
    | `:lineId/vehicle/:assetId`    | `vehicle-details/vehicle-details.module.ts` → `VehicleDetailsModule` | `VehicleDetailsComponent` |
    | `:lineId/station/:assetId`    | `station-details/station-details.module.ts` → `StationDetailsModule` | `StationDetailsComponent` |

    Both `loadChildren` **and** an eagerly-imported `component` are set on every route entry
    (an unusual but functional Angular pattern — `component` renders immediately while
    `loadChildren` lazy-loads that component's own feeding module for `providedIn`/pipe
    registration purposes; since every child component here is declared with no routable
    grandchildren of its own, in practice this just means the components are not really
    "lazy" at the bytecode level, they're already referenced eagerly by
    `situasi-routing.module.ts`'s top-level imports at lines 4-9).

    No route has a `redirectTo`; there is no explicit 404/child-not-found route inside
    `situasi-routing.module.ts` (an unknown `:lineId` simply renders `LineComponent`/`OverallComponent`
    with no data validation — see Functionality & Behavior).

### Full path reference (with param meaning)

- `/situasi` — overview / landing page for the feature (route path `""`).
- `/situasi/:lineId` — per-line landing/overview page. `lineId` = numeric-string PK of a
  `Line` row in the backend (`operation.models.Line`), e.g. `/situasi/4` for LRT Kelana Jaya Line.
- `/situasi/:lineId/vehicles` — vehicle-status dashboard for a line, defaults to the first tab.
- `/situasi/:lineId/vehicles/:tabName` — same dashboard with a specific tab pre-selected.
  `tabName` is one of `statusHistory` | `spottingHeatmap` (see Vehicles route below).
- `/situasi/:lineId/station` — station listing for a line (**unimplemented stub**).
- `/situasi/:lineId/vehicle/:assetId` — single-vehicle detail page. `assetId` = numeric-string
  PK of a `Vehicle` row.
- `/situasi/:lineId/station/:assetId` — single-station detail page (**unimplemented stub**).

## Purpose

Situasi ("situation" in Malay) is meant to be a live operational-status dashboard for
Malaysia's rail/BRT transit fleet — browsable by transit line, then by vehicle or station,
showing spotting activity (community-submitted vehicle sightings) and chartography-derived
service-status history. Judging by the amount of scaffolding vs. built-out code, it is a
work-in-progress area of the product: only the vehicle-status sub-tree (`vehicles` and
`vehicle-details`) has real, working content; the line overview, line-overall, and the whole
station side of the tree are placeholders or unfinished generator stubs. It is currently
restricted to users holding the Firebase custom claim `betaTester`, i.e. an opt-in/invite-only
audience testing the feature ahead of general availability, distinct from the public-facing
`spotting` (TranSPOT) area it draws data from.

## Component Tree

```
SituasiComponent (app-situasi)                     situasi.component.ts
 ├─ nz-sider: line/vehicle nav menu (static `data.ts`)
 ├─ nz-breadcrumb: derived from Router.events + `data.ts` + assetTypes
 └─ <router-outlet> renders one of:
     ├─ OverallComponent (situasi-overall)          overall/overall.component.ts        — route ""
     ├─ LineComponent (situasi-line)                line/line.component.ts               — route ":lineId"
     ├─ VehiclesComponent (situasi-vehicles)         vehicles/vehicles.component.ts       — route ":lineId/vehicles"[,"/:tabName"]
     │   ├─ GetGqlDataService (injected)             vehicles/get-gql-data/get-gql-data.service.ts
     │   ├─ <ui-vehicle-status-history>              @ui/vehicle-status-history/vehicle-status-history.component.ts
     │   │   └─ GetDataService (injected, REST)      @ui/vehicle-status-history/services/get-data.service.ts
     │   └─ <spotting-line-calendar-heatmap>         @ui/spotting-line-calendar-heatmap/spotting-line-calendar-heatmap.component.ts
     ├─ StationsComponent (situasi-stations)         stations/stations.component.ts       — route ":lineId/station"  (STUB)
     ├─ VehicleDetailsComponent (situasi-vehicle-details) vehicle-details/vehicle-details.component.ts — route ":lineId/vehicle/:assetId"
     │   └─ <spotting-vehicle-calendar-heatmap>       @ui/spotting-vehicle-calendar-heatmap/spotting-vehicle-calendar-heatmap.component.ts
     │       └─ GetDataService (injected, REST)      @ui/spotting-vehicle-calendar-heatmap/services/get-data/get-data.service.ts
     │       └─ GetDataGqlService (defined, UNUSED)  @ui/spotting-vehicle-calendar-heatmap/services/get-data-gql/get-data-gql.service.ts
     └─ StationDetailsComponent (situasi-station-details) station-details/station-details.component.ts — route ":lineId/station/:assetId" (STUB)
```

Notes on communication:

- `SituasiComponent` derives `lineId` / `assetType` / `assetId` for its breadcrumb purely by
  re-parsing `router.events` (`NavigationEnd`) URL segments with `DefaultUrlSerializer`
  (`situasi.component.ts:53-126`) rather than by subscribing to `ActivatedRoute.params` —
  each leaf component (`VehiclesComponent`, `VehicleDetailsComponent`) separately subscribes
  to its own `ActivatedRoute.params` for the same `lineId`/`assetId`. There is no shared
  route-data service between the shell and its children; both parse the URL independently.
- `VehiclesComponent` passes `[lineId]` and `[sources]` (chartography sources fetched via
  GraphQL) as `@Input()`s into `<ui-vehicle-status-history>`, and `[lineId]` +
  `[vehicleCount]` into `<spotting-line-calendar-heatmap>`.
- `VehicleDetailsComponent` passes only `[vehicleId]` into `<spotting-vehicle-calendar-heatmap>`.
- `LineVehiclesChartographySource` interface (shape of a chartography "source", e.g. MLPTF/MTREC)
  is defined in `vehicles/get-gql-data/get-gql-data.service.ts:5-10` and re-imported by
  `@ui/vehicle-status-history/vehicle-status-history.component.ts:1-3` — a cross-feature
  import from `@ui` back into `situasi/`, worth flattening in the rewrite.

## Functionality & Behavior

### Shell — `SituasiComponent` (`situasi.component.ts` / `.html`)

- Renders an `nz-layout` with a fixed, collapsible `nz-sider` (width 200px) containing an
  `nz-menu` navigation tree, and a main content area with an `nz-page-header` (title +
  breadcrumb) wrapping the `<router-outlet>`.
- **Nav menu data source is fully static**, not fetched from the API: `menuData = data` and
  `menuAssetTypes = assetTypes`, both imported from `situasi/data.ts`
  (`situasi.component.ts:13,29-30`). `data.ts` is a ~4900-line hand-authored array of 16
  transit lines (`BRT SBL`, `ERL`, `KTM ETS`, `KTMB Loco`, `KTMK-PBL`, `KTMK-PKL`,
  `KTMK-PRL`, `KTMK-SRL`, `LRT AGL`, `LRT KJL`, `LRT SAL`, `LRT SPL`, `MRL`, `MRT KGL`,
  `MRT PYL`, `Skypark`), each carrying a hardcoded `id`, `code`, `displayName`, and full
  arrays of `vehicles` (`{id, displayName}`) and `stations` (`{id, displayName}`) — presumably
  a stale/manual snapshot of backend PKs and display names. **This is a significant
  divergence between the nav menu and the live API**: if a line/vehicle is renamed, added, or
  removed in the backend, this file must be manually edited or the sidebar goes stale/broken.
  `assetTypes` is `[{displayText: "Vehicles", href: ["vehicle"]}, {displayText: "Stations", href: ["station"]}]`
  (`data.ts:4899-4907`) and only drives the breadcrumb dropdown's asset-type switcher.
- Menu structure: "Overall" (top, links to `/situasi`) → for each line, a submenu titled with
  `line.code` linking to `/situasi/:lineId` → nested "Vehicle" submenu linking to
  `/situasi/:lineId/vehicles`, listing every vehicle in that line linking to
  `/situasi/:lineId/vehicle/:vehicleId`. **The "Stations" submenu is present in markup but
  entirely commented out** (`situasi.component.html:95-144`) — so today the sidebar can only
  navigate to vehicles, never to stations, even though the station routes exist.
  `nzOpen`/`ant-menu-item-selected` state for each submenu is computed live via
  `router.isActive(...)` template calls, not stored state.
- `onMenuItemClick(event)` (`situasi.component.ts:129-131`) is a no-op that only
  `console.log`s the clicked `NzMenuItemComponent` — dead/debug code.
- **Breadcrumb logic** (`situasi.component.ts:53-126`): on every `NavigationEnd`, re-parses
  the URL into segments `[situasi, lineId?, assetType?, assetId?]` using
  `DefaultUrlSerializer`. Looks up `lineId` in the static `menuData`; if found, pushes a
  breadcrumb item for the line (no dropdown). If a 3rd segment exists, it's treated as an
  asset-type verb — the code takes the literal path segment (`"vehicle"` or `"station"`) and
  appends `"s"` to guess the plural key on the line object (`assetVerb = assetType + "s"`,
  cast `as any` — `situasi.component.ts:81-82`), which only works because the singular URL
  segments happen to pluralize by simple suffix. Pushes a breadcrumb item for
  "Vehicles"/"Stations" with a `level: "typeSeperator"` (sic — typo for "separator") that
  drives a dropdown letting the user jump to the _other_ asset type for the same line. If a
  4th segment (asset id) exists and matches an entry in the line's `vehicles`/`stations`
  array, pushes a 3rd breadcrumb item (`level: "asset"`) titled with that asset's
  `displayName`, and sets `titleString` (the page header's title) to it; otherwise
  `titleString` falls back to `"<line displayName> - Vehicles|Stations"`. If there's no
  matching line at all, `titleString = "Situasi"`.
- The "asset" breadcrumb-dropdown case (letting a user jump to a sibling vehicle/station from
  the breadcrumb) is **commented out** (`situasi.component.html:202-231`) alongside its
  backing `menuAssets` array in the component (`situasi.component.ts:31,109-111`, also
  commented) — so today clicking the last breadcrumb item's dropdown arrow does nothing
  useful for asset-level items (only the type-seperator level has a working dropdown).
- Theme: subscribes to `ThemeService.colorScheme` (`../services/theme.service.ts`, shared
  app-wide plumbing) to toggle `nz-sider`/`nz-menu`'s `light`/`dark` `nzTheme`.
  Loads Google's "Material Symbols Outlined" webfont via a hardcoded `<link>` tag in the
  template (`situasi.component.html:1-4`) — an external network dependency injected per-page
  rather than globally.
- Footer: renders shared `<app-footer>` (`src/app/@ui/footer/footer.component.ts`) below an `<hr>`.

### Overall — `OverallComponent` (route `""`, i.e. `/situasi`)

- **Fully unimplemented placeholder.** Template is a single centered `<img>` of
  `assets/page-under-construction.jpg` wrapped in an `<a>` whose `href` is a YouTube Rickroll
  link (`https://www.youtube.com/watch?v=dQw4w9WgXcQ`) opened in a new tab
  (`overall/overall.component.html:1-5`). No inputs, no logic, no data fetching. Component
  class body is empty (`overall/overall.component.ts`).

### Line — `LineComponent` (route `:lineId`, i.e. `/situasi/:lineId`)

- **Also a placeholder**, byte-for-byte identical template/markup to `OverallComponent` (same
  "under construction" image + Rickroll link — `line/line.component.html`). Component class
  body is empty; `lineId` route param is not even read.
- `LineModule` imports `SpottingLineCalendarHeatmapComponent` (`line/line.module.ts:1,10`) but
  it is never referenced in the template — dead import left over from earlier scaffolding or
  a planned-but-unbuilt feature (line-level spotting heatmap summary, perhaps intended to live
  on this landing page rather than under `/vehicles`).

### Vehicles — `VehiclesComponent` (routes `:lineId/vehicles` and `:lineId/vehicles/:tabName`)

This is the most fully-built route in the feature.

- **Tabs:** an `nz-tabset` with two tabs defined in `tabItems`
  (`vehicles/vehicles.component.ts:27-36`):
    1. `statusHistory` → "Vehicle Status History" → renders `<ui-vehicle-status-history>`.
    2. `spottingHeatmap` → "Spotting Line Calendar Heatmap" → renders `<spotting-line-calendar-heatmap>`.
- On `ngOnInit`, subscribes to `ActivatedRoute.params`; reads `lineId` from the route, and
  sets `tabActiveIndex` by looking up `params["tabName"]` against `tabItems[].href`
  (`vehicles.component.ts:47-65`). If `tabName` is absent or doesn't match either href,
  `Array.findIndex` returns `-1`, and ng-zorro's `nz-tabset` with `nzSelectedIndex=-1`
  effectively shows no tab pre-selected as active (falls back to its own default, typically
  the first tab, since -1 is not a valid index) — i.e. visiting `/situasi/:lineId/vehicles`
  with no `tabName` does not explicitly select "Vehicle Status History", it relies on
  ng-zorro's fallback behavior.
- Fetches line data via `GetGqlDataService.fetch({lineFilter: {id: this.lineId}})`
  (GraphQL, see Data & API Contracts). Uses `firstValueFrom` — a one-shot fetch, **not** a
  live/watched subscription, so the tab content will not auto-refresh if the underlying data
  changes while the user stays on the page. On resolution, sets
  `this.sources = data.lines[0].chartographySources` and
  `this.vehicleCount = data.lines[0].vehicles.length` (`vehicles.component.ts:57-60`).
  **No null/empty check on `data.lines[0]`** — if `lineFilter.id` matches no `Line` row (e.g.
  a bogus `:lineId` in the URL), this throws a runtime `TypeError` reading `.chartographySources`
  off `undefined`, uncaught (no `.catch()` on the promise chain) — a real crash-on-bad-URL bug.
- `vehicleCount` starts at `-1` as a sentinel; the `spottingHeatmap` tab guards its child with
  `@if (lineId && vehicleCount !== -1)` (`vehicles.component.html:17`) so the heatmap isn't
  instantiated before the GraphQL fetch resolves — the `statusHistory` tab has no equivalent
  guard beyond `@if (lineId)` (`vehicles.component.html:7`), meaning `<ui-vehicle-status-history>`
  is initialized before `sources` are populated; it depends on `ngOnChanges` firing again
  once `sources` updates (see below) to react.
- `activeTabChange(index)` (`vehicles.component.ts:72-85`), bound to `nz-tabset`'s
  `(nzSelectedIndexChange)`, updates `tabActiveIndex` and calls
  `router.navigate(["situasi", lineId, "vehicles", tabItems[index].href], {queryParamsHandling: "replace"})`
  — i.e. switching tabs rewrites the URL to `/situasi/:lineId/vehicles/:tabName` and **drops**
  any existing query params (`replace`, not `merge`) — this would clobber query params the
  spotting heatmap sub-component sets for its own date range (see below), a likely bug if a
  user changes the heatmap's date range and then switches tabs and back.

#### Sub-component: `ui-vehicle-status-history` (`@ui/vehicle-status-history/`)

- Renders an `@antv/g2plot` `Area` chart (`chartRef`) plotting vehicle-status counts over
  time, `xField: "date"`, `yField: "count"`, `seriesField: "status"` — one colored series per
  vehicle status value (backend enum `operation.enums.VehicleStatus`: `IN_SERVICE`,
  `NOT_SPOTTED`, `OUT_OF_SERVICE`, `DECOMMISSIONED`, `MARRIED`, `TESTING`, `UNKNOWN`).
- **Data source picker:** `nz-segmented` control with 3 options
  (`vehicle-status-history.component.ts:42-58`): `MLPTF` (enabled, default), `MTREC`
  (enabled only if `sources` input contains a chartography Source named exactly `"MTREC"` —
  computed in `ngOnChanges`, `vehicle-status-history.component.ts:65-82`, string-compared
  case-sensitively against `val.name`), and `Prasarana` (**hardcoded `disabled: true`
  permanently** — not wired to any backend source check; a "coming soon" placeholder option
  baked into the code, `vehicle-status-history.component.ts:52-57`). Selecting an option
  calls `onDataSourceChange(index)` which re-fetches and re-renders the chart with the new
  `sourceString` (`vehicle-status-history.component.ts:243-270`).
- Chart date range is **hardcoded to "last 10 months to today"** — computed fresh on every
  fetch (`startDate.setMonth(startDate.getMonth() - 10)`,
  `vehicle-status-history.component.ts:112-113,248-249`) — there is no UI to change this
  range (unlike the spotting-heatmap sibling tab, which does have a date-range control).
- **Custom tooltip UI**: rather than G2Plot's built-in tooltip (`showContent: false` in chart
  config), the component renders its own tooltip panel above the chart
  (`vehicle-status-history.component.html:5-60`) driven by `tooltipItems`/`activeTooltipTitle`,
  populated by listening to the chart's native `tooltip:change` / `plot:mouseleave` events
  (`vehicle-status-history.component.ts:98-108`) and initialized to the **most recent data
  point** on load (`setInitialHighlight`, called with `AntVUtil.last(data)` —
  `vehicle-status-history.component.ts:84-96`). The custom tooltip header shows the
  highlighted date (`date` pipe, `"MMMM d, y"`) and per-status `nz-statistic` tiles (title =
  status enum value with underscores replaced by spaces, then `titlecase`-piped, e.g.
  `"In Service"`) showing that date's `count` (or `"-"` if falsy).
- **Series toggling**: clicking a status's statistic tile calls `changeActiveSeries(status)`
  (`vehicle-status-history.component.ts:210-241`), toggling that status in/out of
  `activeSeriesList`; toggled-off statuses are filtered out of the G2Plot chart via
  `chart.filter("status", ...)` and their tooltip tile gets an `.inactive` (dimmed, 0.25
  opacity) CSS class. This is a click-to-hide-series legend substitute (native G2Plot legend
  is disabled, `legend: false`).
- Loading state: `loading` boolean shows an `nz-spin` before the first chart render; no
  explicit empty-state UI if the fetched data array is empty (chart would just render with no
  points).
- `MTREC` info tooltip text (shown via an info-circle icon next to "Source"): _"Data is
  scraped on a best effort basis from Malaysia Trains & Rail Enthusiasts (MTREC) and hence may
  not reflect entirely their data."_ `Prasarana`'s: _"Official data from Prasarana website
  collected on a best effort basis."_ (`vehicle-status-history.component.ts:44-57`).

#### Sub-component: `spotting-line-calendar-heatmap` (`@ui/spotting-line-calendar-heatmap/`)

- Standalone component (`standalone: true`). Renders an `@antv/g2` cell/heatmap chart: X axis
  = week-of-year (`dateKey`), Y axis = vehicle (`vehicle`), color = spotting `count`, using a
  custom-registered G2 shape `"boundary-polygon"` that draws thicker borders on
  month/week boundaries for visual grouping (`spotting-line-calendar-heatmap.component.ts:158-242`).
  Color scale uses the `"BuPu"` palette with an explicit relation mapping `null` → `#eee` and
  `0` → `#fff` (i.e. "no data" vs. "zero spottings" are visually distinguished,
  `spotting-line-calendar-heatmap.component.ts:45-52`).
- **Date-range navigation** is query-param driven and shared with the URL (unlike the sibling
  Status History tab): reads `startDate`/`endDate` from `ActivatedRoute.queryParams`
  on init; if absent, defaults to "6 months ago (1st of month) → today"
  (`MAX_MONTHS = 6`, `spotting-line-calendar-heatmap.component.ts:150-169`). "-3 Months" /
  "+3 Months" buttons (`moveMonths(-3|3)`) shift both dates by 3 months and re-navigate with
  `queryParamsHandling: "merge"` (`spotting-line-calendar-heatmap.component.ts:110-139`),
  persisting the visible range in the URL so it survives reloads/back-nav. "+3 Months" is
  disabled once `endDate` would move within a day of "now"
  (`allowNextMonth` check, `spotting-line-calendar-heatmap.component.ts:111-112`) — there's no
  equivalent lower bound disabling "-3 Months" indefinitely into the past.
- Fetches its own data as a **CSV file fetched directly by the chart engine** — not through
  Angular's `HttpClient` at all: `data: {value: "<backendUrl>operation/line_vehicles_spotting_trend/:lineId/:startDate/:endDate/", type: "fetch", format: "csv"}`
  passed straight into G2's `Chart` config (`spotting-line-calendar-heatmap.component.ts:182-191`).
  Chart height is dynamically `vehicleCount * 30px` (`ROW_HEIGHT = 30`) so every vehicle row
  gets a fixed height regardless of vehicle count.
- Error handling: `chart.render()`'s rejection is caught, logged via `console.error`, and
  surfaces as an `nz-alert` showing `error.name`/`error.message`
  (`spotting-line-calendar-heatmap.component.ts:193-198`, template lines 22-29) — this is one
  of the few places in the feature with visible error UI.
- Re-renders on any `lineId`/`vehicleCount` input change (`ngOnChanges`,
  `spotting-line-calendar-heatmap.component.ts:141-148` — note the guard logic
  `!changes["lineId"]?.firstChange || !changes["vehicleCount"]?.firstChange` is a slightly odd
  double-negative-OR; practically it re-renders on any change event that isn't a same-tick
  first-change on _both_ inputs).

### Stations — `StationsComponent` (route `:lineId/station`)

- **Unimplemented scaffold.** Template is the literal Angular-CLI-generated placeholder text
  `<p>stations works!</p>` (`stations/stations.component.html`). Component class is empty,
  no route param is read, `StationsModule` has no feature imports beyond `CommonModule`.

### Vehicle Details — `VehicleDetailsComponent` (route `:lineId/vehicle/:assetId`)

- Reads `lineId` and `vehicleId` (bound from the `:assetId` route param, confusingly renamed
  in-component — `vehicle-details.component.ts:19-20`: `this.vehicleId = params["assetId"]`)
  from `ActivatedRoute.params` on construction; unsubscribes in `ngOnDestroy`.
  **`lineId` is captured but never used** anywhere in the component or its template — dead
  state.
- Template: a static `<h2>Spotting Trends</h2>` heading, then
  `@if (vehicleId) { <spotting-vehicle-calendar-heatmap [vehicleId]="vehicleId" /> }`
  (`vehicle-details.component.html`). No other content, no vehicle metadata (name,
  identification number, type, status) is displayed on this page at all despite the route
  being nominally a "vehicle details" page — today it is purely a spotting-heatmap viewer for
  one vehicle.

#### Sub-component: `spotting-vehicle-calendar-heatmap` (`@ui/spotting-vehicle-calendar-heatmap/`)

- Renders an `@antv/g2plot` `Heatmap` (day-of-week × week-index grid, color = spotting count)
  using the same custom `"boundary-polygon"` G2 shape registration as the line-level heatmap
  above (duplicated code, `spotting-vehicle-calendar-heatmap.component.ts:158-242` — nearly
  identical to `spotting-line-calendar-heatmap.component.ts:158-242`), with month/year labels
  computed from `dateKey` on the X axis (`spotting-vehicle-calendar-heatmap.component.ts:96-153`).
- **Date range is hardcoded** to "10 months ago (1st of month) → today" — no UI control, no
  query-param persistence (`spotting-vehicle-calendar-heatmap.component.ts:262-264`), unlike
  the line-level heatmap sibling which does support this.
- Data fetch: `GetDataService.getData(vehicleId, startDateString, endDateString)`
  (REST, JSON — see Data & API Contracts) returns `{data: TVehicleSpottingTrendData[], mappings: {yearWeek: {[key]: number}}}`.
  The component remaps each row's `yearWeek` string key through `mappings.yearWeek` to get a
  numeric `index` for the chart's `xField`
  (`spotting-vehicle-calendar-heatmap.component.ts:272-278`) — i.e. the backend pre-computes a
  dense zero-based index for whichever ISO year-weeks actually have data, and the frontend
  trusts that mapping completely for X-axis placement.
- Theming: subscribes to the shared `ThemeService.colorScheme` and calls `heatmapPlot.update({theme})` +
  `.render()` on every theme change (`spotting-vehicle-calendar-heatmap.component.ts:250-258`) —
  the only chart in this feature that reacts live to a dark/light toggle after initial render.
- Re-fetches and fully destroys/recreates the chart on any non-first `vehicleId` change
  (`ngOnChanges`, `spotting-vehicle-calendar-heatmap.component.ts:297-305`) — note this
  `ngOnChanges` unconditionally accesses `changes["vehicleId"].firstChange` without an
  optional-chain guard (unlike the sibling line-heatmap component, which does use `?.`), so if
  `vehicleId` is ever absent from a change event this would throw.
- **Dead code:** `GetDataGqlService` (`@ui/spotting-vehicle-calendar-heatmap/services/get-data-gql/get-data-gql.service.ts`)
  defines a GraphQL query for `vehicles(filters: $vehicleFilter) { id, identificationNo, nickname }`
  and its response type is imported by the component
  (`spotting-vehicle-calendar-heatmap.component.ts:17-19`), but the service is **never
  injected into the component's constructor** and never called — the component only uses
  the REST `GetDataService`. This looks like an abandoned migration from REST to GraphQL (or
  vice versa) for fetching vehicle identity info to label the heatmap; today the heatmap
  displays no vehicle name/identification at all, only the raw `vehicleId` is used
  internally.

### Station Details — `StationDetailsComponent` (route `:lineId/station/:assetId`)

- **Unimplemented scaffold**, same as `StationsComponent`: literal placeholder text
  `<p>station-details works!</p>` (`station-details/station-details.component.html`).
  Component class is empty, no route params read, `StationDetailsModule` has no feature
  imports beyond `CommonModule`.

## Data & API Contracts

### GraphQL

1. **`GetLinesAndVehicles($lineFilter: LineFilter)`**
   Defined in `/home/kwongtn/rosak_firebase/src/app/situasi/vehicles/get-gql-data/get-gql-data.service.ts:28-45`
   (`GetGqlDataService extends Query<GetLineVehiclesResponse>`, used by `VehiclesComponent`).

    ```graphql
    query GetLinesAndVehicles($lineFilter: LineFilter) {
        lines(filters: $lineFilter) {
            id
            code
            displayName
            chartographySources {
                id
                name
                description
                officialSite
            }
            vehicles {
                id
            }
        }
    }
    ```

    - Backend field: `OperationScalars.lines` — `/home/kwongtn/rosak_backend/operation/schema/schema.py:28`
      (`strawberry_django.field(filters=LineFilter)`), resolving to the
      `operation.schema.scalars.Line` type (`operation/schema/scalars.py:40-151`).
    - `LineFilter` (`/home/kwongtn/rosak_backend/operation/schema/filters.py:19-25`) supports
      filtering by `id`, `code`, `display_name` (lookup), `display_color` (lookup). The
      frontend only ever sends `{id: lineId}`.
    - `Line.chartographySources` is a custom async resolver
      (`operation/schema/scalars.py:129-151`) — it does **not** simply return a
      `chartography_sources` relation; it derives the list by looking up every distinct
      `chartography.LineVehicleStatusCountHistory` row for this line (matching either directly
      by `line_id` or indirectly via `custom_line__mapped_lines`), collecting their
      `Snapshot.source_id`s, and returning those `chartography.Source` rows. In other words:
      "which data sources have ever produced a status snapshot for this line" — this is how
      the frontend knows whether to enable the "MTREC" toggle in `ui-vehicle-status-history`.
    - `Line.vehicles` is a custom async resolver using a DataLoader
      (`vehicle_from_line_loader`, `operation/schema/scalars.py:64-72`) keyed on
      `(line_id, spotted_today)`; the frontend passes no `spotted_today` arg, so it gets every
      vehicle on the line. The frontend only reads `.length` off the result (to get
      `vehicleCount`), discarding the rest of each `Vehicle` object (it only requests the `id`
      field).
    - No `permission_classes` / auth check on `lines` or on the `chartographySources`/`vehicles`
      resolvers — **the GraphQL API for this data is not gated by the `betaTester` claim at
      all**; the beta restriction exists only as a client-side Angular route guard (see
      Permissions section).

2. **`vehicles(filters: $vehicleFilter) { id identificationNo nickname }`** — dead/unused
   query defined in
   `/home/kwongtn/rosak_firebase/src/app/@ui/spotting-vehicle-calendar-heatmap/services/get-data-gql/get-data-gql.service.ts:25-33`
   (`GetDataGqlService`, `providedIn: "any"`). Maps to the same `OperationScalars.vehicles`
   field (`operation/schema/schema.py:32-34`, filters via `VehicleFilter`,
   `operation/schema/filters.py:13-17`, i.e. `id`/`status`) resolving to
   `operation.schema.scalars.Vehicle` (`operation/schema/scalars.py:226-348`,
   `identification_no`/`nickname` fields at lines 233,237). **Not invoked anywhere** — see
   Known Quirks.

### REST (Django REST Framework, under `environment.backendUrl` = `https://api-community.mlptf.org.my/` in prod, `http://localhost:8000/` in dev — `/home/kwongtn/rosak_firebase/src/environments/environment.prod.ts:3`, `environment.ts:7`)

All three endpoints are plain `APIView`s with **no `permission_classes` override** and the
backend project defines no global `REST_FRAMEWORK["DEFAULT_PERMISSION_CLASSES"]`, so they run
under Django REST Framework's out-of-the-box default (`AllowAny`) — i.e. these are
unauthenticated, publicly callable endpoints regardless of the `betaTester` gate on the
Angular route. Routes declared in `/home/kwongtn/rosak_backend/operation/urls.py`, views in
`/home/kwongtn/rosak_backend/operation/views.py`.

1. **`GET operation/line_vehicles_spotting_trend/<int:line_id>/<start_date>/<end_date>/`**
   — used by `spotting-line-calendar-heatmap` (`@ui/spotting-line-calendar-heatmap/spotting-line-calendar-heatmap.component.ts:186`)
   as a raw CSV fetch (not via Angular `HttpClient`).

    - View: `LineVehiclesSpottingTrend.get` (`operation/views.py:18-56`). Looks up every
      `Vehicle` on the line (`operation_models.Vehicle.objects.filter(lines=line_id).in_bulk()`),
      computes weekly spotting-event trend counts via `common.utils.get_trends` grouped by
      `spotting_date` and `vehicle_id`, with `add_zero=True` (fills weeks with zero spottings
      rather than omitting them). Returns a CSV (via `polars`) with columns `vehicle`
      (the vehicle's `identification_no`, not its numeric id), `count`, `dateKey`, sorted by
      `(vehicle, dateKey)`. Response `content_type: text/csv`, HTTP 200.
    - No pagination; no error handling for an invalid `line_id` (would return an empty/short
      CSV rather than a 404).

2. **`GET operation/line_vehicles_status_trend_count/<int:line_id>/<slug:source_str>/<start_date>/<end_date>/`**
   — used by `ui-vehicle-status-history` via `GetDataService.getData`
   (`@ui/vehicle-status-history/services/get-data.service.ts:19-30`), JSON, through Angular `HttpClient`.

    - View: `LineVehiclesStatusTrendCount.get` (`operation/views.py:59-99`).
      `source_str` is looked up case-insensitively (`name__iexact`) against
      `chartography.models.Source` — 404 if not found (`get_object_or_404`); same for
      `line_id` against `operation.models.Line`. Queries
      `chartography.models.LineVehicleStatusCountHistory` filtered by
      `snapshot__source_id=source.id` and `snapshot.date` within `[start_date, end_date]`, and
      matching the line either directly (`line_id=line.id`) or via a mapped custom line
      (`custom_line__mapped_lines=line`) — i.e. some chartography snapshots are recorded
      against a "custom line" grouping that maps onto one or more canonical `operation.Line`s.
      Returns JSON array of `{status, count, date}` sorted by `f"{date}__{status}"` (lexical,
      via Python `sorted`), HTTP 200.
    - This is the endpoint whose `source_str` param is driven by the frontend's `MLPTF`/`MTREC`/`Prasarana`
      segmented control (only `MLPTF`/`MTREC` are ever actually requestable since `Prasarana`
      is permanently disabled client-side).

3. **`GET operation/vehicle_spotting_trend/<int:vehicle_id>/<start_date>/<end_date>/`**
   — used by `spotting-vehicle-calendar-heatmap` via `GetDataService.getData`
   (`@ui/spotting-vehicle-calendar-heatmap/services/get-data/get-data.service.ts:19-42`), JSON.
    - View: `VehicleSpottingTrend.get` (`operation/views.py:102-155`). Computes **daily**
      (`DateGroupings.DAY`) spotting-event trend counts for the single vehicle via
      `common.utils.get_trends` (`filters=Q(vehicle_id=vehicle_id)`, `add_zero=True`,
      `free_range=False`), returning per-day `count`, `dateKey`, `dayOfWeek`, `yearWeek`,
      `isLastDayOfMonth`, `isLastWeekOfMonth`. Additionally builds a `mappings.yearWeek`
      dict — a dense 0-based index assigned to each distinct ISO `(year, week)` pair present in
      the result set, sorted chronologically (`operation/views.py:128-145`) — this is the
      index the frontend heatmap uses directly as its X-axis category, so gaps in weeks with
      zero data still get compact/contiguous X positions.
    - No 404 handling for an unknown `vehicle_id` — would just return an all-zero/empty trend.

### Firebase / browser storage

- No direct Firebase Firestore/Storage/Analytics calls inside `situasi/**`. The only Firebase
  touchpoint relevant to this feature is the route guard itself
  (`@angular/fire/auth-guard`'s `hasCustomClaim("betaTester")`, checked against the
  authenticated user's Firebase Auth ID token custom claims — see `app/services/auth.service.ts`,
  documented elsewhere).
- No `localStorage`/`sessionStorage`/`IndexedDB` usage found anywhere under `situasi/**` or
  the `@ui` sub-components it depends on. State that would conventionally be "sticky" (chart
  date ranges) is instead persisted via **router query params** (see
  `spotting-line-calendar-heatmap`'s `startDate`/`endDate` query params, and `VehiclesComponent`'s
  `:tabName` path segment) rather than browser storage.

## State Management

No NgRx/global store. All state is component-local or route/query-param-derived:

- `SituasiComponent` holds `menuData`/`menuAssetTypes` (static, loaded once from `data.ts` at
  module load — never refreshed) and `breadcrumbsData`/`titleString`/`lineId`/`assetType`/`assetId`,
  recomputed synchronously on every `NavigationEnd` router event
  (`situasi.component.ts:53-126`). No caching between navigations — recomputed from scratch
  each time.
- `VehiclesComponent`'s `sources`/`vehicleCount` are populated once per `ngOnInit` route-param
  emission via a one-shot `firstValueFrom` GraphQL fetch (Apollo's `Query.fetch` — a
  network-only, non-cached, non-watched call per the `apollo-angular` `Query` base class
  default); switching `:lineId` (e.g. via the sidebar) re-triggers `ngOnInit`'s
  `route.params` subscription and re-fetches. Apollo's normalized cache (configured in
  `src/app/graphql.module.ts`, shared app-wide plumbing — not documented here) may still serve
  a cached response if the same `lineFilter` was requested recently elsewhere, but this
  component does not explicitly opt into cache-first behavior.
- Each chart sub-component (`ui-vehicle-status-history`, `spotting-line-calendar-heatmap`,
  `spotting-vehicle-calendar-heatmap`) owns its own chart instance (`chartRef`/`heatmapPlot`/`chart`)
  as component instance state, destroyed and recreated on relevant `@Input()` changes
  (`ngOnChanges`) — none of this is shared or cached across component instances/navigations.
- `spotting-line-calendar-heatmap`'s visible date range is the one piece of state promoted to
  the URL (query params `startDate`/`endDate`), making it shareable/bookmarkable and surviving
  a page reload; every other piece of transient UI state (active tab index, active tooltip
  series, active data source) resets on navigation/reload.
- `ThemeService.colorScheme` (`src/app/services/theme.service.ts`, app-wide shared service) is
  the one piece of cross-cutting state this feature reads (light/dark theme for the sidebar
  menu and for the vehicle-detail heatmap's chart theme).

## Permissions, Roles & Flags

- **Route guard (frontend only):** `/situasi` and everything under it requires the Firebase
  custom claim `betaTester`, enforced via `canActivate(betaTesterOnly)` /
  `hasCustomClaim("betaTester")` in `app-routing.module.ts:64-66,149`. This is the _only_
  enforcement point for the beta restriction.
- **No corresponding backend enforcement.** Every GraphQL field this feature touches
  (`lines`, `Line.vehicles`, `Line.chartographySources`, `vehicles`) and all three REST
  endpoints it calls have no permission/auth check tied to `betaTester` (or any claim) —
  confirmed by absence of `permission_classes` on the relevant Strawberry fields/resolvers and
  absence of any `permission_classes` override or global DRF default on the `operation` app's
  `APIView`s. Anyone who knows (or discovers) the GraphQL query shape or REST URL pattern can
  fetch this data directly without holding the beta claim or even being authenticated — the
  gate is UI-only.
- `auth-permissions.ts`'s `permissions` map (`src/app/services/auth-permissions.ts:9-13`) only
  lists `admin` → `/console`; `situasi` has no entry there, so `isUserAllowed()` would return
  `true` for any `/situasi` path check through that helper — it plays no role in gating this
  feature (the route guard is the sole mechanism, bypassing that helper entirely).
- No in-template `*ngIf` role checks anywhere under `situasi/**` — once past the route guard,
  every user who can reach the page sees the same UI (no admin-only or superuser-only controls
  inside the feature itself).
- The maintenance-mode flag `maintenance.situasi.curentlyInMaintenance`
  (`app-routing.module.ts:48-50`) is a hardcoded boolean in source, not a runtime feature flag
  from `environment*.ts` or a remote config — flipping it requires a code change + redeploy.

## Known Quirks / Tech Debt

- `overall/overall.component.html` and `line/line.component.html` are byte-identical
  "under construction" placeholders that link to a YouTube Rickroll
  (`https://www.youtube.com/watch?v=dQw4w9WgXcQ`) instead of real content — both the
  `/situasi` landing page and every `/situasi/:lineId` line-overview page are non-functional
  jokes/placeholders today.
- `stations/stations.component.html` and `station-details/station-details.component.html`
  are unedited Angular-CLI scaffold output (`"stations works!"` / `"station-details works!"`)
  — the entire station side of the feature (station listing + station detail) is unbuilt.
  The commented-out "Stations" submenu in `situasi.component.html:95-144` and the commented
  `menuAssets`/asset-dropdown logic in `situasi.component.ts:31,109-111` and
  `situasi.component.html:202-231` confirm station support was planned but shelved mid-build.
- `line/line.module.ts:1,10` imports `SpottingLineCalendarHeatmapComponent` but never uses it
  in the template — dead import.
- `vehicle-details/vehicle-details.component.ts:12,19` captures `lineId` from the route but
  never uses it anywhere in the component or template — dead state.
- `@ui/spotting-vehicle-calendar-heatmap/services/get-data-gql/get-data-gql.service.ts` (a
  full GraphQL query service, `GetDataGqlService`) is defined and its response type is
  imported by the component, but the service itself is never injected/called — likely an
  abandoned attempt to fetch vehicle identity (`identificationNo`/`nickname`) for display
  alongside the heatmap; today the vehicle-details heatmap shows no vehicle name at all.
- `situasi.component.ts:129-131` (`onMenuItemClick`) is a `console.log`-only stub — dead/debug code.
- `VehiclesComponent.ngOnInit`'s GraphQL fetch (`vehicles.component.ts:57-60`) has no
  `.catch()` and no null-check on `data.lines[0]` — an unmatched/bogus `:lineId` in the URL
  will throw an uncaught `TypeError` client-side rather than showing an error or empty state.
- `VehiclesComponent.activeTabChange` navigates with `queryParamsHandling: "replace"`
  (`vehicles.component.ts:81-83`), which will drop the `spottingHeatmap` tab's
  `startDate`/`endDate` query params if the user switches away from and back to that tab.
- The custom G2 `"boundary-polygon"` shape registration
  (`spotting-line-calendar-heatmap.component.ts:158-242` and
  `spotting-vehicle-calendar-heatmap.component.ts:158-242`) is duplicated verbatim between the
  line-level and vehicle-level heatmap components rather than shared/factored out.
- The sidebar's nav data (`situasi/data.ts`, ~4900 lines) is a hand-maintained static mirror
  of backend line/vehicle/station PKs and names, entirely decoupled from the live GraphQL API
  — a structural quirk that would need resolving in the rewrite (e.g. replace with a live
  `lines`/`vehicles` query) rather than a simple copy-over.
- Google Fonts "Material Symbols Outlined" is loaded via a hardcoded `<link>` in
  `situasi.component.html:1-4` rather than declared once globally — a per-page external
  network dependency (relevant to the Tailwind rewrite's asset-loading strategy).
- Breadcrumb "asset type" pluralization (`situasi.component.ts:81-82`,
  `assetVerb = (this.assetType + "s") as any`) is a fragile string-suffix hack rather than an
  explicit `"vehicle" → "vehicles"` / `"station" → "stations"` lookup table.
- `Prasarana` is presented as a real, user-visible data-source option in the segmented
  control (`vehicle-status-history.component.ts:52-57`) but is permanently `disabled: true`
  with no backing data or resolver — a UI-level "coming soon" stub baked directly into
  production code rather than gated behind a feature flag.
- **Root cause of the Line placeholder, per git history.** `git log -- src/app/situasi` shows
  commit `86b2ea1 fix(sit-line): No longer throw error, temporary fix` replacing a real
  `<spotting-line-calendar-heatmap>` in `LineComponent`'s template with a comment + the literal
  stub text `"line works!"` after it threw a runtime error; a later commit,
  `6404cd1 sit: Add splash for in progress pages`, replaced that stub with the current
  rickroll splash (and added the same splash to `OverallComponent`). The real per-line heatmap
  was never restored on this route — it now only exists nested inside the Vehicles page's
  "Spotting Line Calendar Heatmap" tab.
- **`SituasiComponent` injects `ActivatedRoute` but never reads it.**
  `situasi.component.ts:49` (`private route: ActivatedRoute`) is never referenced anywhere in
  the class body — a dead dependency, consistent with the component instead re-deriving all
  route state by manually re-parsing `Router.events`/`DefaultUrlSerializer` (see Component
  Tree / Functionality above).
- **`SituasiModule` also has a redundant component import**, separate from the one already
  noted on `LineModule`: `situasi.module.ts:12,32` imports `SpottingLineCalendarHeatmapComponent`,
  but `SituasiComponent`'s own template never renders `<spotting-line-calendar-heatmap>` — it's
  only used by the separately lazy-loaded `LineModule`/`VehiclesModule`, which each already
  import it independently.
- **Inconsistent singular/plural route segments between asset types.** Vehicles use plural
  `vehicles` for the list route (`:lineId/vehicles`) but singular `vehicle` for the detail
  route (`:lineId/vehicle/:assetId`), whereas stations use singular `station` for **both** the
  list (`:lineId/station`) and detail (`:lineId/station/:assetId`) routes
  (`situasi-routing.module.ts:28-71`) — worth normalizing in the rewrite.
- **Tab-only navigation still refetches the GraphQL query.** `VehiclesComponent.ngOnInit`'s
  `route.params` subscription re-fires `GetLinesAndVehicles` on every param emission
  (`vehicles.component.ts:47-65`), including a pure `tabName` switch that leaves `lineId`
  unchanged — the query result doesn't depend on `tabName` at all, so switching tabs triggers
  an unnecessary network round trip on top of the query-param loss already noted above.
- **Relative image path may resolve differently depending on route depth.** The "under
  construction" splash (`overall.component.html:3`, `line.component.html:3`) uses a plain
  `<img src="../../assets/page-under-construction.jpg">`. Angular does not rewrite arbitrary
  `<img src>` template attributes at build time (unlike `templateUrl`/`styleUrls`) — the browser
  resolves this relative path against the **current URL's path**, not the source file's
  location. Since `OverallComponent` renders at `/situasi` (depth 1) and `LineComponent` at
  `/situasi/:lineId` (depth 2), the identical relative path in both templates could resolve to
  two different absolute URLs depending on which route rendered it; not verified live (see Open
  Questions).
- **`SpottingVehicleCalendarHeatmapComponent`'s theme subscription is never torn down.** Its
  constructor subscribes directly to `themeService.colorScheme`
  (`spotting-vehicle-calendar-heatmap.component.ts:250-258`) without storing the `Subscription`
  or unsubscribing in `ngOnDestroy` — a minor leak per mounted instance (low practical impact
  since `colorScheme` is a long-lived root singleton, but worth cleaning up in the rewrite).

## Open Questions / Verify Against Live Site

- Exact live rendering of the "under construction" placeholder image
  (`assets/page-under-construction.jpg`) and whether the Rickroll link is intentional
  developer humor left in by mistake, or a deliberate (if odd) placeholder — could not be
  confirmed from code alone whether this ships to production or is caught by some
  build-time/env exclusion; no such exclusion was found in the routing or module code, so it
  is assumed to ship as-is.
- The exact fallback behavior when `hasCustomClaim("betaTester")`'s `AuthPipe` fails (no
  `redirectTo` is chained on this guard, unlike `redirectUnauthorizedToSpotting`) — need to
  confirm in a live/authenticated-but-non-beta browser session whether the user sees a blank
  page, a router error, or silently stays on their previous page.
- Whether `ng-zorro-antd`'s `nz-tabset` with `nzSelectedIndex={-1}` (the value produced when
  `params["tabName"]` doesn't match any `tabItems` href, e.g. on first visit to
  `/situasi/:lineId/vehicles` with no `tabName` segment) visually defaults to the first tab
  or renders with no tab visually active — inferred from ng-zorro's typical fallback behavior
  but not verified by running the app.
- Whether the static `data.ts` sidebar dataset is currently stale relative to the live
  backend `Line`/`Vehicle`/`Station` tables (i.e. whether all 16 hardcoded lines and their
  vehicle/station rosters still match what `operation.models` actually contains) — this can
  only be confirmed by diffing against a live database/GraphQL response, not from frontend
  source alone.
- Whether the Material Symbols Outlined icon font actually renders any icon glyphs in the
  current templates (no icon markup using that font family was found in the reviewed
  `situasi/**` templates — the `<link>` tag may be a leftover from a template this was copied
  from), versus ng-zorro's own icon set (`nz-icon`) which is what's actually used for the
  "Overall" sidebar entry.
- Actual DRF authentication/permission defaults for the `operation` app's REST endpoints were
  inferred from the absence of any `REST_FRAMEWORK` settings block or `permission_classes`
  override in the codebase (implying DRF's built-in `AllowAny` default) — worth confirming
  against the deployed environment's settings (e.g. an environment-variable override not
  present in this repo) rather than assuming the repo's settings.py is the complete picture in
  production.
- Whether the `../../assets/page-under-construction.jpg` splash image actually renders
  correctly on **both** `/situasi` (Overall, depth 1) and `/situasi/:lineId` (Line, depth 2) —
  per the relative-`<img src>`-resolution concern noted in Known Quirks, the browser resolves
  this path against the current URL's depth, not the template file's location, so the same
  markup could behave differently at the two call sites; could not verify without a running
  browser.
