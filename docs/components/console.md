# Component: console

## 📌 Purpose & Scope

- **Core Responsibility:** Provides an admin-only moderation queue for crowd-submitted vehicle "spotting" events. Lets an admin filter the event backlog (status, spotting type, date ranges, anonymity, read/notes flags, free text), page through results, and bulk-mark a selection of events as reviewed ("read").
- **Domain/Layer:** Angular Presentation (standalone routed page component, lazy-loaded feature). Talks to a Django/Strawberry GraphQL backend (`rosak_backend`) over HTTP; no server-side rendering data needed beyond auth/token resolution.
- **Location:** `src/app/features/console/console.page.ts` (+ `.html`), routed via `src/app/features/console/console.routes.ts`; query/mutation definitions and DTOs live in `src/app/features/console/data/console.queries.ts`.
- **Lineage:** Ported from the legacy `src/app/console/` implementation. Deliberately _not_ a 1:1 port — the doc comment in `console.page.ts` records that the old app built its GraphQL filter object with flat `statusIn`/`typeIn` keys that don't exist on the backend's `EventFilter` type, so the Status/Spotting-Type filters silently no-opped there. This version fixes that (`status: { inList }` / `type: { inList }`) rather than reproducing the bug.

## 🔌 Interface & Data Flow

- **Route:** `CONSOLE_ROUTES` exposes a single empty-path route that lazy-loads `ConsolePage`, guarded by `adminOnlyGuard`.
- **Inputs / Props / Signals:** No `@Input()`s or route params — it's a page-level component. Internal reactive state (all `signal`/`computed`, no `@Input`):
  - `filterForm: Signal<FilterFormModel>` — draft filter state (status[], spottingType[], created/spotted date ranges, three tri-state booleans, free-text search). Default: `isRead: false`, everything else empty/`undefined`.
  - `events: Signal<ConsoleEvent[]>`, `totalCount: Signal<number | undefined>`, `isLoading`, `hasMore` (defaults `true`).
  - `selectMode: Signal<boolean>`, `checkedIds: Signal<Set<string>>`, `checkedCount = computed(...)`.
  - `appliedFilters` (plain field, not a signal) — the filter set actually sent to the server; only replaced when the admin clicks **Search**, so editing the form doesn't refetch until explicitly requested.
- **Outputs / Events / API Responses:**
  - `CONSOLE_EVENTS_QUERY` (GraphQL query `ConsoleEvents`) — vars `eventFilters: EventFilter`, `eventPagination: {limit, offset}`, `eventOrder: {created}`; returns `{ eventsCount, events: ConsoleEvent[] }`. Fetched via imperative `GraphQLClient.request()` (not the reactive `httpResource`-based `graphqlResource()` helper), because pagination is append-driven ("Load more") rather than a simple dependent-signal refetch.
  - `MARK_AS_READ_MUTATION` (GraphQL mutation `MarkAsRead`) — vars `{ input: { eventIds: string[] } }`, returns `{ markAsRead: { ok: boolean } }`. On success, matched rows are optimistically spliced out of the local `events` list and a success toast fires; on failure/exception an error toast fires.
  - No component `@Output()`s — all side effects are toasts (`ToastService`) or local signal mutation.
- **Dependencies:**
  - `GraphQLClient` (`core/graphql/graphql-client.ts`) — thin POST wrapper around `environment.backendGraphqlUrl`; throws `GraphQLRequestError` only when a response has no usable `data` at all (tolerates partial-success GraphQL responses).
  - `AuthService` (`core/auth/auth.service.ts`) — signals-based Firebase Auth wrapper; console uses `idToken()` to attach a `firebase-auth-key` header to both requests.
  - `adminOnlyGuard` (`core/auth/admin-only.guard.ts`) — route guard intended to require the Firebase `admin` custom claim.
  - `ReCaptchaV3Service` (`ng-recaptcha-2`) — `markAsRead` is the only mutation in the app that attaches a real reCAPTCHA v3 token (`g-recaptcha-response` header), because the backend actively enforces `IsRecaptchaChallengePassed` on this endpoint specifically.
  - `ToastService` (`ui/toast/toast.service.ts`) — thin wrapper over `@spartan-ng/brain/sonner` for success/error/info notifications.
  - UI kit: `HlmButton`, `HlmInput`, `HlmNativeSelect`, `HlmCheckbox`, `HlmBadge`, `HlmCardImports`, `HlmTableImports` (spartan/ui "Helm" styled components under `src/app/ui/*`).
  - Layout shell: `AppNavComponent`, `AppFooterComponent` (`src/app/shell/*`).
  - Domain UI: `VehicleStatusBadge`, `SpottingTypeBadge` (`src/app/domain-ui/*`) — color/label mapping components for vehicle and spotting-type enums.
  - `environment` (`src/environments/environment.ts`) — `backendUrl` (used to deep-link to the Django admin for a given event/reporter) and `backendGraphqlUrl` (via `GraphQLClient`).
  - Type contracts mirrored from the backend schema: `SpottingType`, `SpottingVehicleStatus`, `VehicleStatus`, `WheelStatus` (`core/graphql/types.ts`).
  - `RouterLink` — links each row's vehicle to its `/spotting/:lineId/vehicle/:vehicleId` detail page.

## ⚙️ Internal State & Logic

- Pure Angular Signals — no RxJS subjects, no NgRx/store, no local DB. `firstValueFrom` is used once, only to bridge the `ReCaptchaV3Service.execute()` Observable into the async `markAsRead()` flow.
- Pagination is **offset-based and additive**: `load()` requests `PAGE_SIZE = 100` starting at `events().length` and appends to the existing array; `hasMore` is derived from whether the last page returned a full page (`events.length === PAGE_SIZE`). "Search" resets `events`, `hasMore`, and `checkedIds` before reloading from offset 0.
- Filter application is intentionally two-phase: `filterForm` (draft, edited freely by the UI) vs. `appliedFilters` (committed, sent to the server) — decoupled so typing/toggling filters never triggers a network call until **Search** is clicked. `buildFilters()` translates the flat `FilterFormModel` into the nested `ConsoleEventFilters` shape the backend's `EventFilter` GraphQL input expects, omitting any field left at its "don't filter" default (empty array / `undefined` / empty string).
- Tri-state boolean filters (`isVehicleStatusDifferent`, `isAnonymous`, `isRead`, `hasNotes`) are modeled as `boolean | undefined` but rendered through native `<select>` elements, which only support strings — `triState()`/`onTriStateChange()` encode/decode the `"any" | "yes" | "no"` round-trip.
- Row selection is a `Set<string>` of checked event IDs, toggled independently of `selectMode` (a separate on/off switch for whether checkboxes/bulk-action UI show at all); both reset together on `toggleSelectMode()` and on `search()`.
- Guard note: `adminOnlyGuard` currently **always returns `true`** — the real `auth.isAdmin()` check is commented out with a `TEMPORARY` note because the Firebase `admin` custom claim isn't reliably granted yet. The route is presently reachable by any authenticated-or-not visitor who knows the URL; this is a known, explicitly flagged gap, not an oversight in this feature's own code.

## 🧩 Extension Points & Hooks

- **Filter model is additively extensible:** `FilterFormModel`/`ConsoleEventFilters`/`buildFilters()` follow a per-field opt-in pattern (add a field to the interface, the default factory, the template, and one `if` branch in `buildFilters()`) — new backend `EventFilter` fields can be wired in without touching existing filters.
- **Query/mutation isolation:** All GraphQL documents and their TS DTOs are centralized in `data/console.queries.ts`, separate from the component. Additional queries/mutations (e.g. per-event actions) can be added there and imported without restructuring the page.
- **Bulk-action pattern is reusable:** `selectMode` + `checkedIds` + a conditional action button is a generic "select rows, then act" pattern that could support more bulk actions (e.g. bulk-delete, bulk-flag) alongside `markAsRead` with minimal new plumbing.
- **Guard swap-in:** Restoring real admin enforcement is a one-line change in `admin-only.guard.ts` (uncomment `auth.isAdmin()` check) — the guard boundary is already in place at the routing layer, so no page-level changes are needed once claim-granting is fixed server-side.
- **`GraphQLClient.request()` vs. `graphqlResource()`:** the codebase offers a reactive, auto-retrying resource helper (`graphqlResource`) for read-heavy pages; console deliberately uses the imperative `request()` API instead because of its append/pagination semantics. A future rewrite as infinite-scroll or virtualized table could reconsider that tradeoff.

## 💡 Potential AI Feature Opportunities

- **Smart triage / auto-prioritization:** With free-text notes, media counts, and a "vehicle status differs from report" flag already in the data model, an AI classifier could score/sort incoming events by likely urgency or data quality, surfacing high-value reports first instead of pure `created DESC` order.
- **Natural-language filter input:** The existing `freeSearch` field and structured filter set are a natural fit for an LLM-driven query parser — letting an admin type "unread depot spottings from last week with notes" and have it populate the structured filter fields automatically.
- **Automated moderation assist:** Since `notes` is free text moderators currently read manually, an AI summarizer/anomaly-detector could flag spam/duplicate/suspicious submissions (e.g. cross-referencing `isAnonymous`, `mediaCount`, and note content) to pre-filter the queue before human review, reducing the manual "mark as read" workload this page exists to manage.
