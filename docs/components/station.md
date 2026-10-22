# Component: station

## 📌 Purpose & Scope

- **Core Responsibility:** The public `/station/:id` page. Riders think in stations ("Is KL Sentral OK?"), and this is the one page organised around one. It shows the station's name, the lines that serve it as chips with their current status, the approved incidents tagged with it (those in effect now, then the newest of the rest, each linking to its day on `/insiden`), the rider status reports that name it among each serving line's newest, and its lifts and escalators with their status. Every station name elsewhere in the app links here (see Inbound links).
- **Domain/Layer:** Angular Presentation (standalone, lazy-routed page, a `data/` layer of one query module and one pure utility). Read-only: it consumes existing GraphQL fields and sends no mutation.

## 🔌 Interface & Data Flow

**`StationPage`** (`station.page.ts` + `station.page.html`, `app-station`). Route: `station/:id` in `app.routes.ts` (`loadComponent`, title `MLPTF | Station` until the station has loaded). `app.routes.server.ts` renders it `RenderMode.Server`, so the HTML of a shared link already holds the station, its lines, its incidents and its share tags.

- **Input:** `id = input.required<string>()`, bound from the route param by `withComponentInputBinding()`. Going from one station to another reuses the instance, and the read follows the input.
- **Output:** none (routed page). Links out: a line chip opens `/spotting/<lineId>/details`. An incident row opens `/insiden/<YYYY-MM-DD>`, the day it starts (`incidentDayKey`), or `/insiden` when the datetime cannot be read.
- **Title and share tags:** once the station has loaded, an effect sets the title `<name> | MLPTF`, `name="description"`, `og:title` and `og:description` (`<name> station on MLPTF: the lines that serve it, incidents in effect now and recent rider reports.`). It reads the title and description it replaces, and its cleanup puts them back and removes `og:title` and `og:description` (`index.html` has neither). This is the gallery photo route's pattern. The page sets no `og:image`, so the site-wide share card stays. On the server the effect runs before the HTML is written, so a link preview shows the station.
- **Not found:** a non-numeric `id`, or an answer with no station, renders `<app-not-found>` inside the page (`data-testid="station-not-found"`) and sets the title `MLPTF | Page not found`. `NotFoundPage` sets the HTTP 404 on the server (`RESPONSE_INIT`), so `/station/99999` and `/station/kl-sentral` answer 404. A non-numeric id sends no request, because the backend rejects one with a GraphQL error that would read as a failed load (retry banner, toast, Sentry event). It is not a redirect. A failed read is not "not found" either: it shows the retry banner.

**GraphQL** (`data/station.queries.ts`, no codegen; field names checked against the local schema):

- **`STATION_PAGE_QUERY`** (`StationPage($id: ID!)`) is the one server-rendered read. Its only variable is the route's `id`, so the server render and the hydrated page send the same request and the browser takes the transferred answer.
  - `stations(filters: { id: $id })` with `id displayName lines { id code displayName status passengerStatus } assets { id assetType status officialid shortDescription longDescription }`. `Station.lines` returns `Line`, so `status` and `passengerStatus` are the two fields the front page board reads for a line's current state. Never select `Asset.stations` (removed; the foreign key is `Asset.station`), `StationLine.stations` or `StationLine.lines` (both raise). `location` is not selected: the page draws no map, and 191 of the 226 stations have no coordinates.
  - `current: calendarIncidents(filters: { status: LIVE, activeNow: true, stations: { id: $id } }, order: { startDatetime: DESC })`, and `history:` the same with `activeNow: false`. Both select `id startDatetime severity title`. 🔴 `status: LIVE` is required on both: the root field has no status gate, so without it anonymous callers get drafts, pending and rejected reports. `activeNow` is the backend's clock (started, and not ended or open-ended, both edges inclusive), and `false` is its exact complement, so the two lists never share an incident and no date computed here enters the variables. The `stations` filter matches incidents tagged with the station (`CalendarIncident.stations`, the join moderators edit), once each.
  - shortcut: `calendarIncidents` takes no limit, so `history` is the station's whole approved history (four scalars an incident) and the page shows the newest `STATION_INCIDENT_HISTORY_LIMIT` (10). Ask the backend for a limit argument if a station's history grows large.
- **`stationReportsRequest(lineIds)`** builds the reports read: one aliased `lineStatusReports(lineId: $lineN, first: $first)` per serving line (`line0`, `line1`, …, in the order of `station.lines`) in ONE request, each selecting `id status delayMinutes notes created stations { id }` through a fragment. `$first` is `STATION_REPORTS_PER_LINE` (10). The line ids travel as variables, never inside the document text. It throws for an empty list, which would be an invalid document. The read is browser-only (its request function returns `undefined` on the server), so the server HTML does not wait on a supporting read and renders the section's skeleton. The backend has no station filter on reports, so this is a bounded search: KL Sentral's eight lines make one request of eight aliases, at most 80 rows.
- **`stationTaggedReports(data, lines, stationId)`** (`data/station-reports.util.ts`, pure) keeps the reports that name the station, attaches the line (`id`, `code`) that alias `line<i>` was asked for, and sorts newest first by `created`, then by id so equal times keep one order. A missing or null alias adds nothing. `created` is the backend's offset-free ISO string, so comparing the strings compares the times.

**Dependencies:**

- `graphqlResource()` (`core/graphql/`) for both reads; `injectIsBrowser()` gates the reports read.
- `Title` and `Meta` (`@angular/platform-browser`), `RouterLink`, `DatePipe`, `NgTemplateOutlet` (one incident-row template for both lists).
- `domain-ui`: `LineStatusBadge` and `AssetStatusBadge`, reused unchanged.
- `ui`: `HlmBadge`, `HlmSkeleton`, `InfoPopover`, `RetryBannerComponent`; `shell`: `AppNavComponent`, `AppFooterComponent`.
- `NotFoundPage` (`features/not-found/`), rendered inline for an unknown station.
- From home (`features/home/data/`): `incidentDayKey`, `incidentSeverityLabel`, `incidentSeverityVariant` (`incident-notices.util.ts`), `passengerLabel`, `passengerVariant` (`passenger-status.util.ts`), and the types `HomeIncidentSeverity` and `PassengerStatus` (type-only imports). From spotting: `humanizeSince` and `ASSET_TYPE_LABEL` (moved into `spotting.queries.ts` for this page; the line page's assets section reads the same table), and the `AssetType` type.
- The methodology registry (`metricDoc`, `metricTooltip`): metrics `incidents.station` (section `episodes`) and `station.reports` (section `line-status`), constants `STATION_INCIDENT_HISTORY_LIMIT` and `STATION_REPORTS_PER_LINE` (both 10, caps this client chooses). Both metrics have `ownerRoute: null`, because there is no bare `/station` route for the registry to resolve.

**Inbound links.** Each of these renders a station name as a `RouterLink` to `['/station', station.id]`. A host or spec that renders one needs the router (`provideRouter([])` in a spec).

| Where                                                                         | Element                                                                   | `data-testid`                           |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------- |
| insiden `IncidentCardComponent` (every incident card)                         | `<a hlmBadge variant="outline">`, the badge look kept                     | `incident-station`                      |
| home `LineStatusReportsComponent` (the station strip of an expanded line)     | `<a hlmBadge variant="neutral">`, count inside, then a hidden `report(s)` | `station-strip-link`                    |
| spotting `SpottingHistoryComponent` (vehicle page)                            | underlined text links, origin then destination                            | `history-origin`, `history-destination` |
| spotting `StationAssetsSectionComponent` (`/spotting/:lineId/details/assets`) | the station heading's name                                                | `station-assets-station`                |

The strip groups reports by display name. The backend keeps display names unique (a DB constraint on `Station.display_name`), so each chip is one station and links to its id.

## ⚙️ Internal State & Logic

- **Signals:** `_hasNumericId` (`/^\d+$/` on the id), `resource` (no request for a non-numeric id), `station` (the first of `stations`), `isNotFound` (`!_hasNumericId()` or an answered, empty `stations`; `data()` is `undefined` while a request is in flight and `hasError()` covers a failed one, so neither counts), `currentIncidents` and `recentIncidents` (`IncidentRow`: severity word and badge variant, title, start, link; `recentIncidents` is sliced to `STATION_INCIDENT_HISTORY_LIMIT` in the order the backend sent), `_lineIds` (a `computed` with value equality on the joined ids, so an equal station answer never sends the reports read again: see `MISTAKES.md`, "a new but equal request object re-reads"), `reportsResource`, and `reports` (`undefined` until the reports answer lands, so the template can tell loading from none).
- **Line chips:** the line's code, its `line-status-badge`, and for an `ACTIVE` line that riders have reported in its current window, the passenger-status badge. That is the board's rule: a badge other than Active is the whole story. The chip's `title` is the line's full name.
- **States and test ids:** `station-loading` (skeleton until the first answer), the retry banner on a failed read, then:
  - Header `station-header`: `station-name` (the page's `h1`), `station-lines` (a list named "Lines at this station") of `station-line` links with `station-line-status` and `station-line-passenger`.
  - Incidents `station-incidents` with `station-incidents-popover`: `station-current` holds `station-current-incident` rows or `station-current-empty`, `station-history` holds `station-history-incident` rows or `station-history-empty`, and each row's link is `station-incident-link` (severity word, title, start day).
  - Recent rider reports `station-reports` (only for a station with lines) with `station-reports-popover`: `station-report` rows (`station-report-line`, the status badge, the delay, `station-report-time`, the notes), `station-reports-empty`, `station-reports-loading` (also the server HTML), or the section's own retry banner.
  - Lifts and escalators `station-assets`: `station-asset` rows (type, short description or official id, `asset-status-badge`, long description), the note that the MLPTF team sets the status (`station-asset-note`, shown only while an asset is listed), or `station-assets-empty`.
- **Dates:** incident rows format the naive Kuala Lumpur wall time with `DatePipe` (`d MMM y`). The string is parsed and formatted in the same zone, so the server and the browser print the same day. Report times use `humanizeSince` with the exact time on `title`, browser-only, so they cannot break hydration.
- **No refresh:** the page reads once. It does not poll and does not revalidate on return, so an incident that starts while the page is open shows on the next visit.
- **Specs:** `station.page.spec.ts` (TestBed with `HttpTestingController`: the read's variables, every state above, the share tags and their cleanup, the two not-found cases, and the two constants pinned against the registry), `data/station.queries.spec.ts` (the id as the only variable, the `activeNow` split, no `Asset.stations` or location, and `stationReportsRequest`: one request, ids as variables, no reporter selected, an empty list refused), `data/station-reports.util.spec.ts` (the filter, the order and the alias mapping).
- **Local data:** 226 stations, 35 with a location, none with an asset, and every incident is a `DRAFT`. Locally both incident lists and the assets section therefore show their empty states. To see an incident, set one station-tagged `CalendarIncident` to `status="live"` (and `end_datetime=None` for In effect now) with a queryset `update()` in `manage.py shell`, and put it back afterwards.

## 🧩 Extension Points & Hooks

- **`data/station.queries.ts`** is the single GraphQL seam. A new field on the page goes into `STATION_PAGE_QUERY` with its interface; keep the route's `id` its only variable, so hydration keeps reusing the server answer.
- **`stationTaggedReports`** is the swap point for a station filter on reports: once the backend has one, a single station-filtered read replaces the aliased per-line read and this client-side filter.
- **A new station mention elsewhere:** `[routerLink]="['/station', station.id]"` on the element that shows the name, `RouterLink` in the component's `imports`, and `provideRouter([])` in its spec, with an `href` assertion.
- **A new section** reads `station()` and sits in the loaded branch of `station.page.html`, beside the others.

## 💡 Potential Feature Opportunities

- **A bounded incident history.** `calendarIncidents` has no limit argument, so `history` is the station's whole approved history. Ready once the backend adds one: request `STATION_INCIDENT_HISTORY_LIMIT` and drop the client slice.
- **Reports filtered by station.** `lineStatusReports` takes a line only, so the list is a search of each serving line's newest 10 and reaches back only a short time on a busy line (the `station.reports` metric says so). A backend station argument, or a `Station.statusReports` connection, would make it a real per-station list that can page.
- **The station names in a report row.** A line card's report rows show their stations as one truncated line of text (`report-station`); only the strip above them links to station pages. Each name as its own link needs a layout that still truncates.
- **A station index or search.** Nothing lists the stations, so the page is reached only through a station name somewhere else. A searchable list of the 226 stations at `/station` would be an entry point and would let the two metrics name an `ownerRoute`.
- **Live refresh.** The page reads once (see Internal State). The board's `PollingSource` beat, or `revalidateOnReturn`, would keep In effect now current while the page stays open.
- **Nearest station, or a map.** Not ready: 191 of the 226 stations have no `location`. Fill the coordinates before building either.

## 💡 Potential AI Feature Opportunities

- **A one-line station digest.** The page already holds the inputs: the serving lines' statuses, the incidents in effect now and the reports that name the station. A model could summarise them as "KL Sentral: ERL crowded, no incident in effect", which suits a share preview or a notification. It should cite the counts it summarises, and say nothing when the data is empty.
