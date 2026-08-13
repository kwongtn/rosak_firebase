# Component: insiden

## 📌 Purpose & Scope

- **Core Responsibility:** Displays line/vehicle/station-level service disruptions (signal
  failures, breakdowns, train crashes, etc.), authored by admins via Django admin. The feature is a
  public, read-only view built around a month calendar (severity dots per day) that drives a
  day-scoped incident list, plus an always-visible "Ongoing & Long-Running" section for
  unresolved/long-term incidents regardless of which day is selected. The one authenticated write
  path is attaching photos to an existing incident. It is a direct Angular port of the legacy
  `src/app/insiden/` feature (ng-zorro calendar + event-list), rebuilt on signals and the new
  design system.
- **Domain/Layer:** Angular Presentation (standalone, lazy-loaded routed feature). Composed of one
  routed page (`InsidenPage`) and two presentational child components (`IncidentCalendarComponent`,
  `IncidentCardComponent`), backed by a `data/` layer of pure query/util modules (no services,
  no state store of its own).

## 🔌 Interface & Data Flow

- **Inputs / Props / Signals:**
  - `InsidenPage` (route: `/insiden` and `/insiden/:date`, via a custom `pathWithOptionalParamMatcher`
    in `app.routes.ts`): `dateParam = input<string | undefined>(undefined, { alias: "date" })` —
    absent on the bare `/insiden` route, which then defaults to "today" rather than redirecting.
  - `IncidentCalendarComponent`: `incidents = input.required<CalendarIncident[]>()`,
    `selectedDate = input.required<string>()` (a `YYYY-MM-DD` key).
  - `IncidentCardComponent`: `incident = input.required<CalendarIncident>()`.
- **Outputs / Events / API Responses:**
  - `IncidentCalendarComponent.daySelected = output<string>()` — emits a `dateKey` on day click,
    "Today", month/year jump commit, or prev/next-month navigation; `InsidenPage` reacts by calling
    `router.navigate(["/insiden", dateKey])`, keeping the viewed day a real, shareable URL rather
    than local-only UI state.
  - GraphQL query `INSIDEN_INCIDENTS_QUERY` (`data/insiden.queries.ts`) — single unfiltered
    `calendarIncidents` query fetching the entire dataset (~280 records / ~290KB / ~5s including
    details+media) once per page load; everything is filtered/grouped client-side rather than using
    per-view queries. Returns `InsidenIncidentsQueryData { calendarIncidents: CalendarIncident[] }`.
  - `CalendarIncident` shape: id, start/end datetime, `severity` (`MAJOR`/`MINOR`/`OTHERS`), title,
    brief, details, `hasDetails`, `impactFactor`, `longTerm`, `inaccurate`, `lastUpdated`, related
    `lines`/`vehicles`/`stations`, `chronologies[]` (ordered timeline entries with a
    `ChronologyIndicator` of `GREEN`/`RED`/`BLUE`/`GRAY`), and `medias[]` (image URLs + dimensions).
  - Photo attachment is fire-and-forget: `IncidentCardComponent.uploadPhotos()` pushes each pending
    file to `ImageUploadService.addToQueue(incidentId, file, "INCIDENT_CALENDAR_INCIDENT")`; no
    direct response is awaited by the component (the service manages its own upload queue/retries).
- **Dependencies:**
  - `graphqlResource()` (`core/graphql/graphql-client.ts`) — signal-based reactive GraphQL query
    wrapper over Angular's `httpResource`, giving free SSR TransferState hydration, background retry
    with exponential backoff, and `isLoading`/`hasError`/`retryCountdownSec`/`retryNow` semantics.
  - `ImageUploadService` (`core/upload/image-upload.service.ts`) — app-wide, IndexedDB-persisted
    photo upload queue (depends on `AuthService` for the Firebase auth token and
    `upload-queue-db.ts` for persistence); `ImageFile` (`core/upload/image-file.ts`) is the shared
    upload-candidate model.
  - `ToastService` (`ui/toast/toast.service.ts`) — thin wrapper for success/error/info toasts.
  - `RetryBannerComponent` (`ui/retry-banner/retry-banner.component.ts`) — shared error-state UI,
    consumes any object matching the minimal `RetryableResource` interface (`retryCountdownSec`,
    `retryNow`), so it works with `graphqlResource()`'s return shape without a hard type dependency.
  - `HlmSkeleton`, `HlmButton`, `HlmBadge`, `HlmCardImports`, `HlmCombobox`/`ComboboxItem` — design
    system primitives from `src/app/ui/*` (hand-rolled, not spartan/CDK-based).
  - `AppNavComponent`, `AppFooterComponent` (`shell/app-nav`, `shell/app-footer`) — page chrome.
  - `PhotoPickerComponent` (`features/spotting/report-form/photo-picker/`) — cross-feature reuse
    from the "spotting" feature; exposes a `model<ImageFile[]>` two-way `files` binding and an
    `isCompressing` computed signal.
  - `MarkdownComponent` (`ngx-markdown`, third-party) — renders an incident's long-form `details`
    field as Markdown.
  - `Router` (`@angular/router`) — drives day selection via URL navigation.

## ⚙️ Internal State & Logic

- No RxJS subjects and no dedicated store — state is entirely Angular signals, computed at three
  levels:
  - `InsidenPage`: `selectedDate`/`selectedDateObj` computed from the route param (or "today");
    `incidentsResource` (the `graphqlResource`) is the single source of truth for all incident
    data; `allIncidents`, `_sorted` (newest-first by `startDatetime`), `dayIncidents` (incidents
    covering the selected day) and `pinned` (unresolved incidents not already shown for the day)
    are all derived `computed()`s over that one resource — no incident data is duplicated or
    manually synced.
  - `IncidentCalendarComponent`: `viewedMonth` is a `linkedSignal` seeded from `selectedDate` (so
    deep links land on the right month) but independently writable by month navigation; `weeks()`
    and `_countsByDate()` derive the 42-cell grid and per-day severity-dot counts from
    `incidents()` + `viewedMonth()`. A small local state machine (`pendingMonth`/`pendingYear`,
    `jumpCounting`/`jumpProgress`, backed by `setTimeout`/`setInterval`) implements a 3-second
    "commit window" after a month/year combobox pick, cleaned up in `ngOnDestroy`.
  - `IncidentCardComponent`: local UI-only signals (`detailsExpanded`, `photosExpanded`,
    `pendingPhotos`); `chronology`, `duration`, `isOngoing`, `isInaccurate`, `severityVariant`/
    `severityLabel` are computed from the `incident` input. A live elapsed-time ticker
    (`elapsedTime` signal + `setInterval`, started in `afterNextRender`) runs only while
    `isOngoing()`, torn down via `DestroyRef`/`ngOnDestroy`.
- Pure helper modules carry the only non-trivial domain logic outside the components:
  `calendar-date.util.ts` (`dateKeyOf`, `incidentCoversDate` — UTC-based day-key math mirroring the
  backend's own date-filter semantics) and `elapsed-time.util.ts` (`getReadableTimeDifference` —
  largest-two-non-zero-units duration formatting).

## 🧩 Extension Points & Hooks

- `RetryableResource` is a structural interface, not a concrete type import — any future
  resource-like object (a different fetch wrapper, a mocked resource in tests) can drive
  `RetryBannerComponent` without coupling to `graphqlResource()`.
- `CalendarIncidentSeverity`/`ChronologyIndicator` → CSS-class/label lookup tables
  (`SEVERITY_DOT`, `SEVERITY_VARIANT`, `SEVERITY_LABEL`, `CHRONOLOGY_DOT`) are centralized
  `Record<...>` constants — adding a new severity or indicator value is a one-line addition per
  table rather than a scattered conditional.
- `defaultChronology()` in `incident-card.component.ts` is an isolated synthesis function for when
  the backend has no chronology entries — a natural seam for adjusting/enriching the fallback
  timeline without touching rendering logic.
- The GraphQL query is a single flat string constant (`INSIDEN_INCIDENTS_QUERY`); extending the
  fetched fields (e.g. adding a new backend field) is a local, additive edit to `insiden.queries.ts`
  with a matching `CalendarIncident` interface change — no query-building abstraction to route
  around.
- Details/photos use an in-place expand/collapse idiom (matching `vehicle-list.component.ts`
  elsewhere in the app) rather than a modal/drawer — consistent with how new expandable sections
  elsewhere in the app should be built.
- The photo-attach path is entirely additive: `PhotoPickerComponent` and `ImageUploadService` are
  shared, feature-agnostic primitives (already reused from `features/spotting`), so any new
  "attach evidence" flow elsewhere in the app can plug into the same picker/queue without new
  infrastructure.

## 💡 Potential Feature Opportunities

- **Client-side filtering by line/vehicle/station/severity:** Ready now — `allIncidents`,
  `dayIncidents`, and `pinned` are already `computed()` signals derived from `incidentsResource`;
  adding a filter-criteria signal and folding it into those `computed()`s is a small additive
  change, since the full ~280-record dataset from `INSIDEN_INCIDENTS_QUERY` is already resident
  client-side and needs no new query or backend work.
- **Calendar export (iCal/.ics):** Ready now — `CalendarIncident` already carries start/end
  datetime, title, and brief per record, enough to generate a standards-compliant `.ics` feed or
  "Add to calendar" action directly from the existing `incidentsResource` data with no schema
  changes.
- **Ongoing-incident subscriptions/notifications:** Good idea, not ready — `pinned` already
  isolates unresolved/long-running incidents and `IncidentCardComponent.isOngoing()` already flags
  active ones, so the client-side targeting logic exists. Context for future LLMs: there is no
  push-notification service or per-user subscription record anywhere in the app or backend today;
  this would need a new delivery mechanism (e.g. an FCM topic or backend-triggered webhook) and a
  backend "subscribe to incident" mutation/model before any frontend work is possible.
- **Shareable/deep-linkable incident state:** Partially ready — day selection already round-trips
  through the URL (`daySelected` → `router.navigate(["/insiden", dateKey])`), but per-incident UI
  state (`detailsExpanded`, `photosExpanded` in `IncidentCardComponent`) is local component signal
  state, not reflected in the URL. Extending the route with an incident-id fragment/query param
  synced to those local signals is a moderate, self-contained change confined to
  `InsidenPage`/`IncidentCardComponent`.
- **Paginated/incremental incident loading:** Good idea, not ready — the doc already flags
  `INSIDEN_INCIDENTS_QUERY` as a single unfiltered client-side fetch of the entire dataset
  (~280 records/~290KB/~5s). Context for future LLMs: the query and the backend `calendarIncidents`
  field currently accept no date-range/limit/offset arguments, so introducing pagination requires a
  backend resolver change first — the frontend cannot request a bounded window until that argument
  exists.

## 💡 Potential AI Feature Opportunities

- **Automated incident summarization/triage:** `brief`, `details`, and ordered `chronologies[]`
  are already structured, timestamped text — a natural fit for an LLM-generated plain-language
  summary of "what happened and current status," or auto-classifying `severity`/`impactFactor`
  from free-text admin input at creation time.
- **Anomaly/pattern detection over historical incidents:** the full incident dataset (lines,
  vehicles, stations, severity, duration) is already fetched client-side in one shot, making it a
  ready substrate for a recurring-disruption or "this line has had N incidents this month" insight
  surfaced alongside the calendar, without any new data-fetching infrastructure.
- **Smart photo/evidence assistance:** the existing photo-attachment pipeline (`PhotoPickerComponent`
  → `ImageUploadService`) is a ready hook for AI-assisted captioning, duplicate/blur detection, or
  auto-tagging uploaded incident photos before they're queued, reusing the same queue/compression
  flow already in place.
