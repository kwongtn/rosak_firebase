# Component: insiden

## 📌 Purpose & Scope

- **Core Responsibility:** Community incident reporting for line/vehicle/station-level service
  disruptions (signal failures, breakdowns, train crashes, etc.). A month calendar (severity dots
  per day) drives a day-scoped incident list, plus an always-visible "Ongoing & Long-Running"
  section for unresolved/long-term incidents regardless of which day is selected. Logged-in users
  report and edit incidents through the full approval lifecycle (create → pending → admin approve),
  vote on incidents and individual chronology rows, request chronology deletions, attach photos,
  and submit per-incident social links. Admins moderate everything through the console queues.
  It is a direct Angular port of the legacy `src/app/insiden/` feature (ng-zorro calendar +
  event-list), rebuilt on signals and the new design system.
- **Domain/Layer:** Angular Presentation (standalone, lazy-loaded routed feature). Composed of one
  routed page (`InsidenPage`), presentational children (`IncidentCalendarComponent`,
  `IncidentCardComponent`, `IncidentFormComponent`, `LinkFormComponent`, `LinksSectionComponent`,
  `LinkCardComponent`, `VoteButtonComponent`, `AssetMultiSelectComponent`), backed by a `data/`
  layer of pure query/util modules and two sheet services (no state store of its own).

## 🔌 Interface & Data Flow

- **Inputs / Props / Signals:**
  - `InsidenPage` (route: `/insiden` and `/insiden/:date`, via a custom `pathWithOptionalParamMatcher`
    in `app.routes.ts`): `dateParam = input<string | undefined>(undefined, { alias: "date" })` —
    absent on the bare `/insiden` route, which then defaults to "today" rather than redirecting.
  - `IncidentCalendarComponent`: `incidents = input.required<CalendarIncident[]>()`,
    `selectedDate = input.required<string>()` (a `YYYY-MM-DD` key).
  - `IncidentCardComponent`: `incident = input.required<CalendarIncident>()`,
    `editActionEnabled = input(true)` (console hosts the card with this set to `false` — it has its
    own panel editing, so the edit/request-deletion/add-link affordances are hidden there).
  - `IncidentFormComponent`: hydrates from `IncidentSheetService.editTarget` (a
    `signal<CalendarIncident | null>`); no-arg `open()` stays create-only.
  - `LinkFormComponent`: reads `LinkSheetService.context` (`{ incidentId, incidentTitle? }`) to
    target a submission at a specific incident; no-arg open is the just-dumping flow.
  - `VoteButtonComponent`: `targetType = input<"incident" | "chronology">("incident")` — the same
    button drives both vote surfaces.
- **Outputs / Events / API Responses:**
  - `IncidentCalendarComponent.daySelected = output<string>()` — emits a `dateKey` on day click,
    "Today", month/year jump commit, or prev/next-month navigation; `InsidenPage` reacts by calling
    `router.navigate(["/insiden", dateKey])`, keeping the viewed day a real, shareable URL rather
    than local-only UI state.
  - GraphQL query `INSIDEN_INCIDENTS_QUERY` (`data/insiden.queries.ts`) — single unfiltered
    `calendarIncidents` query fetching the entire dataset (~280 records) once per page load;
    everything is filtered/grouped client-side rather than using per-view queries. The sub-selects
    now carry the full lifecycle surface: `status`, `version`, `user { shortId }`, `categories`,
    chronology `status` + vote fields, per-incident `links` (first page of the connection), and
    `medias` with `id` + `uploader { nickname }`.
  - `CalendarIncident` shape: id, start/end datetime, `severity` (`MAJOR`/`MINOR`/`OTHERS`),
    `status` (`DRAFT`/`PENDING_APPROVAL`/`LIVE`/`REJECTED`), title, brief, details, `hasDetails`,
    `impactFactor`, `version`, `longTerm`, `inaccurate`, `lastUpdated`, author `user`, related
    `lines`/`vehicles`/`stations`, `categories`, `chronologies[]` (ordered timeline entries with
    `status`, `voteScore`, `voteBreakdown`, `userVote`), `links` (connection), and `medias[]`.
  - Mutations (`data/insiden.queries.ts`): `CREATE_CALENDAR_INCIDENT_MUTATION`,
    `UPDATE_CALENDAR_INCIDENT_MUTATION` (sends `version` for OCC; returns the revision `id` when a
    non-admin LIVE edit created a draft, which the form then chains into
    `SUBMIT_CALENDAR_INCIDENT_MUTATION`), `UPVOTE`/`DOWNVOTE`/`REMOVE_VOTE` (incident + chronology
    variants), `REQUEST_CHRONOLOGY_DELETION_MUTATION`, `SUBMIT_SOCIAL_MEDIA_LINK_MUTATION`
    (carries `incidentId` when targeted).
  - Photo upload is fire-and-forget: `IncidentCardComponent.uploadPhotos()` pushes each pending
    file to `ImageUploadService.addToQueue(incidentId, file, "INCIDENT_CALENDAR_INCIDENT")`; no
    direct response is awaited by the component (the service manages its own upload queue/retries).
    Thumbnails open an in-page `MediaViewerComponent` overlay (same mechanism as `/gallery`), not a
    new tab.
- **Dependencies:**
  - `graphqlResource()` (`core/graphql/graphql-client.ts`) — signal-based reactive GraphQL query
    wrapper over Angular's `httpResource`, giving free SSR TransferState hydration, background retry
    with exponential backoff, and `isLoading`/`hasError`/`retryCountdownSec`/`retryNow` semantics.
    `GraphQLClient.request` is used directly for continuation pages (link infinite scroll).
  - `AuthService` (`core/auth/auth.service.ts`) — login state for the edit/vote/link gates and the
    author check (`user.shortId` vs `uid.slice(0, 8)`).
  - `ImageUploadService` (`core/upload/image-upload.service.ts`) — app-wide, IndexedDB-persisted
    photo upload queue (depends on `AuthService` for the Firebase auth token and
    `upload-queue-db.ts` for persistence); `ImageFile` (`core/upload/image-file.ts`) is the shared
    upload-candidate model.
  - `MediaViewerComponent` (`features/gallery/media-viewer/`) — cross-feature reuse for the in-page
    photo preview; `incidentMediaToViewerNode()` maps `MediaScalar` into its `MediaNode` input.
  - `ToastService` (`ui/toast/toast.service.ts`) — thin wrapper for success/error/info toasts.
  - `RetryBannerComponent` (`ui/retry-banner/retry-banner.component.ts`) — shared error-state UI,
    consumes any object matching the minimal `RetryableResource` interface (`retryCountdownSec`,
    `retryNow`), so it works with `graphqlResource()`'s return shape without a hard type dependency.
  - `InfiniteScrollDirective` (`ui/infinite-scroll/`) — IntersectionObserver sentinel for the
    cursor-paginated link lists (Submitted Links tab + per-card link sections).
  - `HlmSkeleton`, `HlmButton`, `HlmBadge`, `HlmCardImports`, `HlmCombobox`/`ComboboxItem`,
    `HlmSheet` — design system primitives from `src/app/ui/*`.
  - `AppNavComponent`, `AppFooterComponent` (`shell/app-nav`, `shell/app-footer`) — page chrome.
  - `PhotoPickerComponent` (`features/spotting/report-form/photo-picker/`) — cross-feature reuse
    from the "spotting" feature; exposes a `model<ImageFile[]>` two-way `files` binding and an
    `isCompressing` computed signal.
  - `MarkdownComponent` (`ngx-markdown`, third-party) — renders an incident's long-form `details`
    field as Markdown.
  - `Router` (`@angular/router`) — drives day selection via URL navigation.

## ⚙️ Internal State & Logic

- No RxJS subjects and no dedicated store — state is entirely Angular signals, computed at several
  levels:
  - `InsidenPage`: `selectedDate`/`selectedDateObj` computed from the route param (or "today");
    `incidentsResource` (the `graphqlResource`) is the single source of truth for all incident
    data; `allIncidents`, `_sorted` (newest-first by `startDatetime`), `dayIncidents` (incidents
    covering the selected day) and `pinned` (unresolved incidents not already shown for the day)
    are all derived `computed()`s over that one resource. An `effect` on
    `IncidentSheetService.isOpen()` (true→false transition) reloads the resource, so a successful
    create/edit refresh is driven by the sheet close.
  - `IncidentCalendarComponent`: `viewedMonth` is a `linkedSignal` seeded from `selectedDate` (so
    deep links land on the right month) but independently writable by month navigation; `weeks()`
    and `_countsByDate()` derive the 42-cell grid and per-day severity-dot counts from
    `incidents()` + `viewedMonth()`. A small local state machine (`pendingMonth`/`pendingYear`,
    `jumpCounting`/`jumpProgress`, backed by `setTimeout`/`setInterval`) implements a 3-second
    "commit window" after a month/year combobox pick, cleaned up in `ngOnDestroy`.
  - `IncidentCardComponent`: local UI-only signals (`detailsExpanded`, `photosExpanded`,
    `pendingPhotos`, `viewerMedia`, `deletionOverride`); `chronology`, `duration`, `isOngoing`,
    `isInaccurate`, `severityVariant`/`severityLabel`, `canEdit` (via the pure
    `canEditIncident()` util) are computed from the `incident` input. A live elapsed-time ticker
    (`elapsedTime` signal + `setInterval`, started in `afterNextRender`) runs only while
    `isOngoing()`, torn down via `DestroyRef`/`ngOnDestroy`. The card renders: chronology timeline
    with per-row status tags (`chronologyStatusLabel()`) and vote buttons, a "Request deletion"
    ghost button on LIVE rows (flips the row to `PENDING_DELETION` locally on success), a Links
    section (spec-format rows `[yyyy-mm-dd hh:mm] [favicon] [bold domain + paler rest]`, pending
    rows with an amber clock icon + "Pending approval" tooltip, continuation pages via the root
    `publicSocialMediaLinks(incidentId, first, after)` cursor), the latest history entry line
    (via `calendarIncidentHistory`), and the in-page photo viewer.
  - `IncidentFormComponent`: `hydrate(incident)` consumes the pure `incidentToForm()` util
    (model + chronologies + four id arrays); `isEditing` derives from `editTarget` and switches
    header/footer labels and the submit branch. Edit submit sends all fields + `version` (OCC echo)
    - `impactFactor` echo; a returned revision `id` chains `SUBMIT_CALENDAR_INCIDENT_MUTATION`.
      GraphQL rejections (one-open-draft / version-mismatch) toast verbatim and keep the sheet open.
      The chronology section has per-row collapse plus a "Collapse all / Expand all" helper
      (`setAllCollapsed()`), up/down reorder arrows, and the Gemini extract/summarize flows.
  - `LinksSectionComponent`: first page through `graphqlResource` (retry banner kept), continuation
    pages via `GraphQLClient.request` + the infinite-scroll sentinel; edges append, approved/pending
    split + collapsible preserved.
- Pure helper modules carry the non-trivial domain logic outside the components:
  `calendar-date.util.ts` (`dateKeyOf`, `incidentCoversDate`), `elapsed-time.util.ts`
  (`getReadableTimeDifference`), `incident-to-form.util.ts` (edit hydration), `can-edit.incident.util.ts`
  (edit-button gate matrix), `chronology-status.util.ts` (status labels + deletion predicates),
  `incident-link-line.util.ts` (spec link-line formatting), `incident-media-viewer.util.ts`
  (photo → viewer node), `social-link.util.ts`, `incident-status.util.ts`, `incident-chronology.util.ts`.

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
  around. New fields follow the optional-field + DEPLOY-ORDER comment pattern.
- Pure utils are the gate/label/format seams: `canEditIncident()`, `chronologyStatusLabel()`,
  `incidentLinkLine()`, `incidentToForm()`, `incidentMediaToViewerNode()` — each is a tested,
  isolated function a future feature can reuse or extend without touching component markup.
- Details/photos use an in-place expand/collapse idiom (matching `vehicle-list.component.ts`
  elsewhere in the app) rather than a modal/drawer — consistent with how new expandable sections
  elsewhere in the app should be built.
- The photo-attach path is entirely additive: `PhotoPickerComponent`, `ImageUploadService` and
  `MediaViewerComponent` are shared, feature-agnostic primitives (already reused from
  `features/spotting` and `features/gallery`), so any new "attach evidence" flow elsewhere in the
  app can plug into the same picker/queue/viewer without new infrastructure.
- `InfiniteScrollDirective` is a reusable sentinel (IntersectionObserver + coalescing) — any
  cursor-paginated list in the app can adopt it.

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
- **Paginated/incremental incident loading:** Partially ready — the backend `calendarIncidents`
  field now accepts `ongoing` and `date` (interval-overlap) filters, and the per-incident link
  lists are cursor-paginated, but the incidents query itself is still a single unfiltered
  client-side fetch of the entire dataset (~280 records). Introducing server-side pagination for
  the incidents list requires a backend resolver change (limit/offset or cursor args on
  `calendarIncidents`) before the frontend can request a bounded window.

## 💡 Potential AI Feature Opportunities

- **Automated incident summarization/triage:** `brief`, `details`, and ordered `chronologies[]`
  are already structured, timestamped text — a natural fit for an LLM-generated plain-language
  summary of "what happened and current status," or auto-classifying `severity`/`impactFactor`
  from free-text admin input at creation time. The form already ships Gemini extract/summarize
  flows (`IncidentAiService` → Firebase functions), so the plumbing exists.
- **Anomaly/pattern detection over historical incidents:** the full incident dataset (lines,
  vehicles, stations, severity, duration) is already fetched client-side in one shot, making it a
  ready substrate for a recurring-disruption or "this line has had N incidents this month" insight
  surfaced alongside the calendar, without any new data-fetching infrastructure.
- **Smart photo/evidence assistance:** the existing photo-attachment pipeline (`PhotoPickerComponent`
  → `ImageUploadService` → `MediaViewerComponent`) is a ready hook for AI-assisted captioning,
  duplicate/blur detection, or auto-tagging uploaded incident photos before they're queued, reusing
  the same queue/compression flow already in place.
