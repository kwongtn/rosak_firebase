# Component: console

## 📌 Purpose & Scope

- **Core Responsibility:** Provides admin-only moderation queues. The **spotting queue** (`""` →
  `/console/spotting`) filters the crowd-submitted vehicle "spotting" event backlog (status, spotting type, date ranges, anonymity, read/notes flags, free text), pages through results, and bulk-marks a selection of events as reviewed ("read"). The **incident approval queue** (`/console/insiden/pending`) and the **social-media link triage queue** (`/console/insiden/links`, documented in full below) cover the two other moderation surfaces.
- **Domain/Layer:** Angular Presentation (standalone routed page components, lazy-loaded feature). Talks to a Django/Strawberry GraphQL backend (`rosak_backend`) over HTTP; no server-side rendering data needed beyond auth/token resolution.
- **Location:** `src/app/features/console/console.page.ts` (+ `.html`) for the spotting queue, routed via `src/app/features/console/console.routes.ts`; query/mutation definitions and DTOs live in `src/app/features/console/data/console.queries.ts`. The insiden sub-pages are `insiden/pending/pending.component.*` and `insiden/links/links.component.*` with their own `data/*.queries.ts` / `data/*.util.ts`.
- **Lineage:** Ported from the legacy `src/app/console/` implementation. Deliberately _not_ a 1:1 port — the doc comment in `console.page.ts` records that the old app built its GraphQL filter object with flat `statusIn`/`typeIn` keys that don't exist on the backend's `EventFilter` type, so the Status/Spotting-Type filters silently no-opped there. This version fixes that (`status: { inList }` / `type: { inList }`) rather than reproducing the bug.

## 🔌 Interface & Data Flow

- **Route:** `CONSOLE_ROUTES` exposes four routes, three of them guarded by `adminOnlyGuard`:
  - `""` with `pathMatch: "full"` → `redirectTo: "spotting"`. `pathMatch` is **mandatory** —
    without it the empty-path redirect would also swallow `/console/insiden/*`. No `canActivate`
    here: Angular forbids guards on redirect routes, and the redirect _target_ is guarded, so
    `/console` is guarded transitively.
  - `"spotting"` → `ConsolePage`.
  - `"insiden/pending"` → `PendingIncidentsComponent`.
  - `"insiden/links"` → `SocialMediaLinksComponent` (see the dedicated section below).
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

## 🧩 Extension Points & Hooks

- **Filter model is additively extensible:** `FilterFormModel`/`ConsoleEventFilters`/`buildFilters()` follow a per-field opt-in pattern (add a field to the interface, the default factory, the template, and one `if` branch in `buildFilters()`) — new backend `EventFilter` fields can be wired in without touching existing filters.
- **Query/mutation isolation:** All GraphQL documents and their TS DTOs are centralized in `data/console.queries.ts`, separate from the component. Additional queries/mutations (e.g. per-event actions) can be added there and imported without restructuring the page.
- **Bulk-action pattern is reusable:** `selectMode` + `checkedIds` + a conditional action button is a generic "select rows, then act" pattern that could support more bulk actions (e.g. bulk-delete, bulk-flag) alongside `markAsRead` with minimal new plumbing.
- **Guard swap-in:** Restoring real admin enforcement is a one-line change in `admin-only.guard.ts` (uncomment `auth.isAdmin()` check) — the guard boundary is already in place at the routing layer, so no page-level changes are needed once claim-granting is fixed server-side.
- **`GraphQLClient.request()` vs. `graphqlResource()`:** the codebase offers a reactive, auto-retrying resource helper (`graphqlResource`) for read-heavy pages; console deliberately uses the imperative `request()` API instead because of its append/pagination semantics. A future rewrite as infinite-scroll or virtualized table could reconsider that tradeoff.

## 💡 Potential Feature Opportunities

- **Shareable/saved filter views:** Since `filterForm`/`appliedFilters` already fully describe queue state as a plain `FilterFormModel` object, serializing it to and from route query params would let an admin bookmark or share a specific filtered view (e.g. "unread depot spottings with notes") without re-entering filters by hand. Not ready today — `ConsolePage` doesn't inject `ActivatedRoute` or read/write query params anywhere yet, so this needs new sync logic layered on top of the existing `buildFilters()` seam; no backend change required.
- **Bulk actions beyond mark-as-read:** The `selectMode` + `checkedIds` pattern (already flagged as reusable in Extension Points) is generic "select rows, then act" plumbing — adding a bulk-delete or bulk-flag button alongside the existing mark-as-read action is a small, additive frontend change. Not ready on the backend: `data/console.queries.ts` only defines `MARK_AS_READ_MUTATION` today, so a bulk-delete/flag GraphQL mutation would need to be added to the Strawberry schema first, with a matching query/DTO added to that same isolation file once it exists.
- **Sortable results table:** `CONSOLE_EVENTS_QUERY` already accepts an `eventOrder` variable, currently hardcoded to `{ created }` — exposing column-header sort controls that swap the value passed for `eventOrder` is a small, additive change to an already-wired parameter. Whether the backend's order input supports fields beyond `created` (e.g. status, spotting type) isn't established in this doc, so confirm the Strawberry `EventOrder` type's fields before promising more than one sortable column.
- **Client-side export of the current queue:** `events: Signal<ConsoleEvent[]>` already holds the full fetched result set in memory, so a "Export CSV" button that serializes the current signal value needs no new query, mutation, or backend change — it's ready to build now as a pure frontend utility.
- **Keyboard/accessibility polish for select mode:** `checkedIds`, a plain `Set<string>` toggled independently of `selectMode`, is friendly to extension — e.g. Escape to exit select mode, or Shift-click to range-select between the last-checked row and the current one. This is ready to implement now purely in `console.page.ts`/`console.page.html`, with no new dependencies or backend changes.

## 💡 Potential AI Feature Opportunities

- **Smart triage / auto-prioritization:** With free-text notes, media counts, and a "vehicle status differs from report" flag already in the data model, an AI classifier could score/sort incoming events by likely urgency or data quality, surfacing high-value reports first instead of pure `created DESC` order.
- **Natural-language filter input:** The existing `freeSearch` field and structured filter set are a natural fit for an LLM-driven query parser — letting an admin type "unread depot spottings from last week with notes" and have it populate the structured filter fields automatically.
- **Automated moderation assist:** Since `notes` is free text moderators currently read manually, an AI summarizer/anomaly-detector could flag spam/duplicate/suspicious submissions (e.g. cross-referencing `isAnonymous`, `mediaCount`, and note content) to pre-filter the queue before human review, reducing the manual "mark as read" workload this page exists to manage.

## 🗂️ Sub-page: Social Media Links Triage (`/console/insiden/links`)

> Added 2026-09-30. Until then this page was undocumented, because `console.md` only ever described
> the spotting queue. `SocialMediaLinksComponent` is a separate lazy component with its own data
> layer, not a mode of `ConsolePage`.

### 📌 Purpose & Scope

- **Core Responsibility:** the admin triage queue for every crowd-submitted social-media link — a
  flat moderation table over `socialMediaLinks`, with server-side filters, per-row status actions
  (Approve / Hide / Mark completed / Delete), a full editable panel, and thread grouping
  (multi-select → one thread, per-row Ungroup).
- **Location:** `src/app/features/console/insiden/links/links.component.ts` + `.html`; documents and
  DTOs in `../data/insiden-console.queries.ts`; pure helpers in `../data/date-range.util.ts`,
  `../data/link-status-input.util.ts`, `../data/search-debounce.util.ts` plus the two **shared**
  insiden utils `insiden/data/link-occurred-at.util.ts` and
  `insiden/data/link-thread-selection.util.ts`.
- **Route:** `CONSOLE_ROUTES` → `{ path: "insiden/links", canActivate: [adminOnlyGuard],
loadComponent: SocialMediaLinksComponent }`. `adminOnlyGuard` awaits `auth.whenReady` and redirects
  non-admins to `/spotting` (it is **not** a pass-through stub — do not "re-fix" it). The backend
  additionally refuses a non-admin status change, so the row actions carry no second permission
  check.
- **Two clocks, on purpose:** the queue is **sorted** on the event instant (`occurredAt`,
  `-occurredAt, -id`) and the range filter windows the same column, but an admin _moderates_ against
  the report instant (`created`) — "how long has this been sitting un-reviewed" is a `created`
  question, "is this report back-dated" is an `occurredAt` one. So the table shows **both** columns
  side by side and the filter is labelled "Occurred between", because no single label can honestly
  describe a window over `occurredAt` any more.

### 🔌 Interface & Data Flow

- **Inputs:** none — a page-level component, all state local signals.
- **Filters** (a card above the table; `appliedX` plain fields hold what was last committed, so
  editing a control does not refetch until its own trigger fires). Free text search (URL + title,
  matched server-side) is **debounced**; Category, and the All/Pending/Completed status select refetch
  **immediately**; Line, Vehicle, Station and the date range refetch through the same trailing
  debounce; **Reset** clears everything. The default status filter is **Pending** (not-completed).

  | control                                                                                                 | backend argument                                   |
  | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
  | Search (URL, title)                                                                                     | `search: String`                                   |
  | Category                                                                                                | `categoryId: ID`                                   |
  | Status (All / Pending / Completed)                                                                      | `completed: Boolean` (omitted for "any")           |
  | Line / Vehicle / Station                                                                                | `lineId` / `vehicleId` / `stationId`               |
  | **Occurred between** (two `<input type="date">`, aria-labels "Occurred from date" / "Occurred to date") | **`occurredAfter` / `occurredBefore`: `DateTime`** |
  | (sorting, not a control)                                                                                | fixed `-occurredAt, -id`                           |

  ⚠️ The date args were **renamed** from `createdAfter`/`createdBefore`, deliberately and with **no
  alias**: the queue orders by `occurredAt`, so an alias would have kept a filter that windows one
  column while the rows above it are sorted by another — quietly wrong for every back-dated report.
  A stale `createdAfter` is a loud GraphQL "Unknown argument" error, which is the intended failure
  mode. See `MISTAKES.md`.
  `date-range.util.ts` (`dateInputToIsoStart` / `dateInputToIsoEnd`) builds the bounds from the
  browser's **local** day (`T00:00:00` / `T23:59:59.999`) and then calls `.toISOString()` — correct
  **here** and only here, because the bound is an _aware_ instant the backend converts back. The
  contrast with the naive wall-time `occurredAt` field is documented in both files.

- **Query:** `SOCIAL_MEDIA_LINKS_QUERY` (console-scoped `socialMediaLinks`), fetched imperatively
  through `GraphQLClient.request` with a freshly minted `firebase-auth-key`. The node selection adds
  `occurredAt` and the thread fields `threadId` / `isThreadRoot` / `threadSize`; `threadLinks` is
  deliberately **not** selected — the queue is a flat table, the thread chip's `2 links` label
  already answers "how many members does this row hide?", and selecting them would let a HIDDEN
  row's URL/title travel inside a nested field of an admin-gated query for no rendering benefit.
- **Mutations** (all with the `firebase-auth-key` header; all reload the list on success):
  - `updateSocialMediaLink` (**`IsLoggedIn`** — see the gate note below, _not_ `IsAdmin`) — Approve
    (`status: "LIVE"`) and Hide (`status: "HIDDEN"`) build their payload through the single shared
    builder `linkStatusInput(link, status)`, which re-sends the row's current `url`, `title`, all
    four M2M id lists **and `occurredAt` verbatim**. Both halves are load-bearing:
    `SocialMediaLinkInput` is replace-not-patch (it would otherwise blank the title and strip every
    tag), and `occurredAt` is tri-state with a destructive `null` (reset to the row's submission
    time) — so `?? null` here would rewrite the event time of every row on every click, and re-sort
    the public feed with it. Approve stays available on a hidden row; it is the un-hide verb.
    ⚠️ **Why an `IsLoggedIn` mutation is still safe on an admin page.** The GraphQL class is the
    wrong place to look for this page's authority: the **route** is what is gated
    (`adminOnlyGuard`, genuinely enforced — do not "re-fix" it), and the finer rule lives in the
    backend's **service layer**, which forces a non-admin's edit back to `PENDING_APPROVAL`. So no
    non-admin can set `HIDDEN` — or keep `LIVE` — through this mutation whatever the class says,
    and the only other caller the class admits is a submitter editing their own link. Read a
    permission class from the mutation's `permission_classes`, never from the page that calls it.
  - `markSocialMediaLinkCompleted` — its own id-only mutation, so it needs no equivalent payload.
  - `deleteSocialMediaLink` (IsAdmin) — hard delete behind a native `confirm()`, plus a local row
    drop and panel close.
- **Table columns:** select-all checkbox · URL (external link, `max-w-72`) · Title (`max-w-64`) ·
  Submitter (carrying the per-row Official chip, `data-testid="link-official"`) · Categories · Status
  · **Submitted** · **Occurred** · **Thread** · Actions. Ten columns; `min-w-[1100px]`, and the
  loading/empty `colspan`s are 10.
  ⚠️ The "Status" column and the "Status" filter are BOTH about the admin's `completed` handled flag
  (a `Completed` / warning `Pending` badge, and the All/Pending/Completed select → `completed:
Boolean`) — **not** the link's approval `status` (`LIVE` / `PENDING_APPROVAL` / `HIDDEN`), which
  this queue never renders as a column. Approve and Hide are the verbs for that axis. The two are
  independent (see `MISTAKES.md`), so a row can be `LIVE` and still read "Pending" here.
- **Row actions:** Approve (when `status !== "LIVE"`), Hide (when `status !== "HIDDEN"`), Mark
  completed (when not `completed`), **Ungroup** (`data-testid="ungroup-link"`, **members only**),
  Delete. Row click / `Enter` opens the detail panel; the row's own checkbox stops propagation
  (`(click)`, not `(change)` — `change` only fires after the click has already bubbled, so without
  this, ticking a row would also open its editor).
- **Detail panel** (row click): the URL, title, the **"When did this happen?"** control
  (`data-testid="edit-occurred-at"`, hint "Clear it to fall back to the report time. This is the
  column the public feed sorts on."), the bulk tag block (lines/vehicles/stations/categories), the
  `data-testid="detail-occurred-at"` line, the submitter, the completion metadata
  (`completedAt` + `completedBy`), and the same field set as "Submit a link". Save calls the
  `IsLoggedIn` `updateSocialMediaLink` with the **complete** form state (the backend replaces the
  M2M sets verbatim) and patches the row locally, mirroring the server's tri-state with
  `occurredAtInputToIso(...) ?? link.created` so a cleared box optimistically shows the fallback.
- **Thread grouping (moderation/organisation, not a display mode):** the list stays flat and every
  link keeps its own row. The selection toolbar renders **always** (discoverability, and so "needs
  two" shows as a disabled button with a stated reason rather than an absent one):
  `data-testid="group-selected"`, a `selection-count` span, `Clear selection` once something is
  ticked, and the hint "Select at least two links to group them into one thread." A genuine
  multi-link root gets a chip whose **visible text is just the `threadLabel` count — `2 links`**,
  not a literal `Thread (N)` — (`data-testid="link-thread"`, `hlmBadge variant="special"`), with
  the `Thread root — 2 links in this thread. A thread is public only while its root is…` wording
  in the `title` tooltip; everything else renders an em dash. Grouping sends
  `groupSocialMediaLinks(linkIds)` with **no** `threadId` (so the backend elects the root — the
  earliest `(occurredAt, id)` of the selection) and Ungroup sends `ungroupSocialMediaLinks` for the
  single row. The returned root `id` is deliberately unused: it is a GraphQL **`Int`**, unlike every
  other id in the feature, and this list reloads wholesale.

### ⚙️ Internal State & Logic

- Signals only, no RxJS. The selection is `selectedIds = signal<string[]>([])` and is built **only**
  through `link-thread-selection.util.ts` — the same module the profile's "My Submitted Links" uses,
  so the two surfaces cannot drift on "may I group this?", "is Select-all checked?" or "does this row
  show a chip?". The helpers are immutable by contract because their results are written straight
  back into this signal: an in-place mutation yields the same array reference, change detection never
  fires, and the checkbox silently stops updating.
- The selection deliberately **survives a refetch** (narrowing a filter is not an intent to forget),
  so every mutation scopes it through `selectedWithin(selectedIds(), visibleLinkIds())` and filters
  blanks — `linkIds` is `[ID!]!` and the backend rejects a repeated id outright. Without the scoping,
  ticking three rows, narrowing the search and hitting Group would post ids the admin can no longer
  see, and the all-or-nothing rejection would read as a plain "grouping failed".
- **Grouping is all-or-nothing server-side** (one link outside the permission gate rejects the whole
  selection), so there is no partial state to render and nothing to roll back. A failure toasts and
  leaves both the list and the selection exactly as they were — keeping the ticks is deliberate, so
  the admin can adjust and retry. Success reloads and clears the selection (a selection of rows that
  are now members of one thread is a request that has already been made).
- **Ungroup is members-only, on purpose.** Ungrouping a **root** is inert by design — it is not a
  member of anything, so there is nothing to detach and its members stay attached; done one member at
  a time, the thread dissolves and the original root is left standing as a singleton (no cascade, no
  re-root election, both deliberate server-side). Offering the button on a root would be a promise
  the backend cannot keep.
- **Hide asks before hiding a thread root.** `confirmThreadCoupling(link)` shows a native
  `confirm()` naming the count — "A thread is public only while its root is, so hiding this row
  hides every member too" — and only when `threadLabel(link.threadSize)` is non-empty, so an
  ordinary Hide (and every unthreaded row and every thread member, whose own `threadSize` is 1) stays
  a single click. A static tooltip on the chip is not enough on its own: it is invisible until
  hovered, absent on touch, and gone by the time the admin reaches the Hide button two cells over.
  It reuses the same native-`confirm` idiom as the Delete guard, so the console has one confirmation
  idiom rather than two.
- `threadLabel` is re-exposed on the class (`protected readonly threadLabel = threadLabel`) rather
  than re-implemented, because a template can only read members off the component — and re-deriving
  it is how this table and "My Submitted Links" end up saying "1 links" and "2 link" for the same
  thread. (Scope note: this table and the profile list are two of its three callers. The third is
  `app-link-thread`, whose `groupLabel` computed is `threadLabel(totalCount())` — a feed row is a
  THIRD place the same string is rendered, which is the whole reason the helper exists rather than
  two per-table copies; see `insiden.md` for why one helper also serves a surface whose minimum is 2.)

### 🧩 Extension Points & Hooks

- **The filter set is additively extensible** in the same spirit as the spotting queue: each control
  is a draft signal, one branch in `fetchLinks()`, and one row in the filter card. Unset optional
  keys are **omitted** rather than sent as `null`, so the wire never carries explicit nulls.
- **All grouping decisions are delegated, not inlined.** Anything that adds a selection affordance
  here must call `link-thread-selection.util.ts`; the pluralisation of a link thread's size is
  decided app-wide in exactly one place — this chip, the profile badge and the `app-link-thread`
  indicator all read `threadLabel`.
- **`linkStatusInput` is the single builder for the status-only verbs**, extracted so Approve and Hide
  can never drift apart into one of them losing a field. A third status verb (Reject, say) should
  reuse it rather than build its own payload — the replace-not-patch and `occurredAt` tri-state traps
  are both live here (see `MISTAKES.md`).
- **The edit panel is a full `SocialMediaLinkInput`**, so every future editable link field is one
  signal, one control, one payload key and one optimistic-patch key. The panel is driven by the
  console's own signals, not by `LinkSheetService` — deliberately, so the admin sheet is independent
  of the public form's open/close lifecycle.
- **Thread UI is deliberately not a display mode here.** Any future "collapse threads in the console"
  toggle must remember: the queue shows a HIDDEN row as well as public ones, so a thread root's
  `threadSize` counts only _publicly-visible_ members and the gap against the raw member count is
  exactly the hidden ones.
