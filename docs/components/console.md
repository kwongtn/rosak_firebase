# Component: console

## 📌 Purpose & Scope

- **Core Responsibility:** Provides admin-only moderation queues. The **spotting queue** (`""` →
  `/console/spotting`) filters the crowd-submitted vehicle "spotting" event backlog (status, spotting type, date ranges, anonymity, read/notes flags, free text), pages through results, and bulk-marks a selection of events as reviewed ("read"). The **incident approval queue** (`/console/insiden/pending`) and the **social-media link triage queue** (`/console/links`, documented in full below) cover the two other moderation surfaces.
- **Domain/Layer:** Angular Presentation (standalone routed page components, lazy-loaded feature). Talks to a Django/Strawberry GraphQL backend (`rosak_backend`) over HTTP; no server-side rendering data needed beyond auth/token resolution.
- **Location:** `src/app/features/console/console.page.ts` (+ `.html`) for the spotting queue, routed via `src/app/features/console/console.routes.ts`; query/mutation definitions and DTOs live in `src/app/features/console/data/console.queries.ts`. The insiden sub-pages are `insiden/pending/pending.component.*` and `insiden/links/links.component.*` with their own `data/*.queries.ts` / `data/*.util.ts`. **Split 2026-10-07 (plan Task 4.7, `refactor(console): split pending.component`):** the incident approval queue is now a shell over a colocated pure util — `pending-incident.util.ts` (the severity tables, `asCalendarIncident`, `isIncidentFormSaveable`, `buildUpdatedIncidentRow`, `ChronologyExtractState`) — plus three attribute-selector presentational children: `pending-row.component.ts` (`tr[app-pending-row]`, the queue row + Approve/Reject), `pending-chronology-editor.component.*` (`section[app-pending-chronology-editor]`) and `pending-deletion-requests.component.ts` (`section[app-pending-deletion-requests]`). The parent keeps every stateful handler, since `pending.component.spec.ts` drives them directly off the component instance.
- **Lineage:** Ported from the legacy `src/app/console/` implementation. Deliberately _not_ a 1:1 port — the doc comment in `console.page.ts` records that the old app built its GraphQL filter object with flat `statusIn`/`typeIn` keys that don't exist on the backend's `EventFilter` type, so the Status/Spotting-Type filters silently no-opped there. This version fixes that (`status: { inList }` / `type: { inList }`) rather than reproducing the bug.

## 🔌 Interface & Data Flow

- **Route:** `CONSOLE_ROUTES` exposes five routes, three of them guarded by `adminOnlyGuard`:
  - `""` with `pathMatch: "full"` → `redirectTo: "spotting"`. `pathMatch` is **mandatory** —
    without it the empty-path redirect would also swallow `/console/insiden/*` and `/console/links`.
    No `canActivate` here: Angular forbids guards on redirect routes, and the redirect _target_ is
    guarded, so `/console` is guarded transitively.
  - `"spotting"` → `ConsolePage`.
  - `"insiden/pending"` → `PendingIncidentsComponent`.
  - `"links"` → `SocialMediaLinksComponent` (see the dedicated section below). **Moved 2026-10-01**
    out of the `insiden/` prefix to `/console/links`.
  - `"insiden/links"` with `pathMatch: "full"` → `redirectTo: "links"` — the legacy bookmark /
    shared-link path, kept working. Same rule as the bare-`/console` redirect above: **no
    `canActivate` on a redirect route** (Angular rejects the config), and the guard on the target
    makes the old path guarded transitively.
- **Inputs / Props / Signals:** No `@Input()`s or route params — it's a page-level component. Internal reactive state (all `signal`/`computed`, no `@Input`):
  - `filterForm: Signal<FilterFormModel>` — draft filter state (status[], spottingType[], created/spotted date ranges, three tri-state booleans, free-text search). Default: `isRead: false`, everything else empty/`undefined`.
  - `events: Signal<ConsoleEvent[]>`, `totalCount: Signal<number | undefined>`, `isLoading`, `hasMore` (defaults `true`).
  - `checkedIds: Signal<Set<string>>`, `checkedCount = computed(...)`, plus the selection anchor (`useBulkActions().anchorId`, internal to the composable — see the range-select note below).
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
- Row selection is a `Set<string>` of checked event IDs, always live: the checkbox column, the row
  highlight and the "Mark N as read" button need no enabling toggle. Clicking **anywhere** on a row
  body toggles that row; the row's own checkbox is the same toggle reached through its native
  `click` (not `checkedChange` — only a `click` carries `shiftKey`) and stops propagation so the row
  handler can't fire twice. The row's three inner interactive elements — the event-id and reporter
  deep links into the Django admin, and the vehicle `routerLink` — call `stopPropagation()` so
  activating them doesn't also select the row.
- **Shift-click range selection** (added 2026-10-01): `useBulkActions` keeps an `anchorId` — the last
  row clicked _without_ shift. A shift-click applies the clicked row's **new** state to the inclusive
  span between the anchor and the clicked row, resolved against the rendered order
  (`events().map(e => e.id)`), so shift-clicking a checked row un-checks the range. The anchor is
  deliberately _not_ moved by a shift-click, which is what makes a second shift-click able to
  retarget or undo the same range. The pure core is the exported
  `toggleCheckedRange(checked, orderedIds, anchorId, targetId, targetState)`; the composable method
  that applies it is `toggleCheckedInRange(orderedIds, targetId, targetState)`. Degenerate cases
  (no anchor, or an anchor/target that is no longer in the list) degrade to a single-row toggle
  instead of throwing. The anchor is cleared on `clearSelection()` (which also runs on `search()` and
  on a successful `markAsRead()`), whenever the selection empties, and on **every** `load()` — a
  search reset or an appended "Load more" page both change which ids sit at which index, so a
  stale anchor would sweep an arbitrary span. `useBulkActions` no longer carries a `selectMode`
  switch at all; the row `<tr>` is not a focus target — keyboard selection goes through the
  checkbox, whose inner `<button role="checkbox">` carries any held modifiers into the same
  handler.

## 🧩 Extension Points & Hooks

- **Filter model is additively extensible:** `FilterFormModel`/`ConsoleEventFilters`/`buildFilters()` follow a per-field opt-in pattern (add a field to the interface, the default factory, the template, and one `if` branch in `buildFilters()`) — new backend `EventFilter` fields can be wired in without touching existing filters.
- **Query/mutation isolation:** All GraphQL documents and their TS DTOs are centralized in `data/console.queries.ts`, separate from the component. Additional queries/mutations (e.g. per-event actions) can be added there and imported without restructuring the page.
- **Bulk-action pattern is reusable:** `checkedIds` + a conditional action button is a generic "select rows, then act" pattern that could support more bulk actions (e.g. bulk-delete, bulk-flag) alongside `markAsRead` with minimal new plumbing. `useBulkActions` now also owns the range-select anchor, so any new list that renders a row order can pass it to `toggleCheckedInRange(orderedIds, ...)` and get shift-click ranges for free.
- **Guard swap-in:** Restoring real admin enforcement is a one-line change in `admin-only.guard.ts` (uncomment `auth.isAdmin()` check) — the guard boundary is already in place at the routing layer, so no page-level changes are needed once claim-granting is fixed server-side.
- **`GraphQLClient.request()` vs. `graphqlResource()`:** the codebase offers a reactive, auto-retrying resource helper (`graphqlResource`) for read-heavy pages; console deliberately uses the imperative `request()` API instead because of its append/pagination semantics. A future rewrite as infinite-scroll or virtualized table could reconsider that tradeoff.

## 💡 Potential Feature Opportunities

- **Shareable/saved filter views:** Since `filterForm`/`appliedFilters` already fully describe queue state as a plain `FilterFormModel` object, serializing it to and from route query params would let an admin bookmark or share a specific filtered view (e.g. "unread depot spottings with notes") without re-entering filters by hand. Not ready today — `ConsolePage` doesn't inject `ActivatedRoute` or read/write query params anywhere yet, so this needs new sync logic layered on top of the existing `buildFilters()` seam; no backend change required.
- **Bulk actions beyond mark-as-read:** The `checkedIds` pattern (already flagged as reusable in Extension Points) is generic "select rows, then act" plumbing — adding a bulk-delete or bulk-flag button alongside the existing mark-as-read action is a small, additive frontend change. Not ready on the backend: `data/console.queries.ts` only defines `MARK_AS_READ_MUTATION` today, so a bulk-delete/flag GraphQL mutation would need to be added to the Strawberry schema first, with a matching query/DTO added to that same isolation file once it exists.
- **Sortable results table:** `CONSOLE_EVENTS_QUERY` already accepts an `eventOrder` variable, currently hardcoded to `{ created }` — exposing column-header sort controls that swap the value passed for `eventOrder` is a small, additive change to an already-wired parameter. Whether the backend's order input supports fields beyond `created` (e.g. status, spotting type) isn't established in this doc, so confirm the Strawberry `EventOrder` type's fields before promising more than one sortable column.
- **Client-side export of the current queue:** `events: Signal<ConsoleEvent[]>` already holds the full fetched result set in memory, so a "Export CSV" button that serializes the current signal value needs no new query, mutation, or backend change — it's ready to build now as a pure frontend utility.
- **Select-all + tri-state header checkbox:** the header cell is still an empty `<th class="w-10">`; a "check every loaded row" checkbox (tri-state when a page is partially selected) is a pure frontend addition on top of the existing `checkedIds` + `orderedIds` pair. Not built yet because "all loaded rows" is ambiguous against the append-only "Load more" pagination — decide first whether it selects the loaded page set or the whole `totalCount()` result (the latter needs a new backend query, not just a `setAll` on the composable).

## 💡 Potential AI Feature Opportunities

- **Smart triage / auto-prioritization:** With free-text notes, media counts, and a "vehicle status differs from report" flag already in the data model, an AI classifier could score/sort incoming events by likely urgency or data quality, surfacing high-value reports first instead of pure `created DESC` order.
- **Natural-language filter input:** The existing `freeSearch` field and structured filter set are a natural fit for an LLM-driven query parser — letting an admin type "unread depot spottings from last week with notes" and have it populate the structured filter fields automatically.
- **Automated moderation assist:** Since `notes` is free text moderators currently read manually, an AI summarizer/anomaly-detector could flag spam/duplicate/suspicious submissions (e.g. cross-referencing `isAnonymous`, `mediaCount`, and note content) to pre-filter the queue before human review, reducing the manual "mark as read" workload this page exists to manage.

## 🗂️ Sub-page: Social Media Links Triage (`/console/links`)

> Added 2026-09-30. Until then this page was undocumented, because `console.md` only ever described
> the spotting queue. `SocialMediaLinksComponent` is a separate lazy component with its own data
> layer, not a mode of `ConsolePage`.

### 📌 Purpose & Scope

- **Core Responsibility:** the admin triage queue for every crowd-submitted social-media link — a
  moderation table over `socialMediaLinks` rendered as an **accordion over the ordered link tree**
  (collapsed by default, one row per link, children revealed beneath their parent), with server-side
  filters, per-row status actions (Approve / Unhide / Hide / Mark completed / Delete), a full editable panel,
  and the conversation hierarchy as both a moderation/organisation tool (multi-select → group, per-row
  Nest under / Ungroup / Move up / Move down — the three tree verbs are **icon-only** buttons with
  hover help) and a display mode (per-row chevron, one **rail** per
  ancestor level plus a child-row tint, and the `N links` chip as the URL cell's second line).
- **Location:** `src/app/features/console/insiden/links/links.component.ts` + `.html`; documents and
  DTOs in `../data/insiden-console.queries.ts`; pure helpers in `../data/date-range.util.ts`,
  `../data/link-status-input.util.ts`, `../data/search-debounce.util.ts`,
  `../data/same-minute.util.ts` (the Submitted cell's same-minute rule) plus the two **shared**
  insiden utils `insiden/data/link-occurred-at.util.ts` and
  `insiden/data/link-thread-selection.util.ts`. **Split 2026-10-07 (plan Task 4.1,
  `refactor(console): split links.component`)** — the page is now a shell over colocated pure utils
  and presentational children; the named seams below live in these files:
  - `link-tree.util.ts` — `compareStoredSequence`, `computeDepths` (`depthOf`), `depthRailsFor`
    (`depthRails`), `groupRunsByParentId` (`_runsByParentId`), `childCountOf`, `siblingsOf`,
    `runOrderIsKnown`, `siblingIndexOf`, `canMoveUp`/`canMoveDown`/`moveBlockedReason`,
    `canNestUnder`/`nestBlockedReason`, `renderedLinksOf` (`renderedLinks`), `DEPTH_INDENT_PX`;
  - `link-reference.util.ts` — the reference option builders (`lineOptions`/`vehicleOptions`/
    `stationOptions`/`categoryOptions`, filter variants, vehicle parent-code indexing);
  - `link-queue-filter.util.ts` — `CompletedFilter`, `COMPLETED_LABEL`, `VisibilityFilter`,
    `VISIBILITY_LABEL`, `appliedFiltersAreUnfiltered`, `queueQueryVars`;
  - `link-queue-row.component.*` (`tr[app-link-queue-row]`, the row), `link-url-cell.component.*`
    (`td[app-link-url-cell]`, rails/elbow/chevron/chip), `links-filter-bar.component.*` (the filter
    card), `links-selection-toolbar.component.*` (group/clear/hint/show-all). The parent keeps every
    stateful handler because the spec drives them directly off the component instance.
- **Route:** `CONSOLE_ROUTES` → `{ path: "links", canActivate: [adminOnlyGuard],
loadComponent: SocialMediaLinksComponent }`, **plus** a legacy redirect
  `{ path: "insiden/links", pathMatch: "full", redirectTo: "links" }`. The URL moved out from under
  `/console/insiden/` on 2026-10-01 (it is a links queue, not an incidents sub-page), and the
  redirect carries **no `canActivate`** because Angular forbids guards on redirect routes — the target
  route is guarded, so the old path is guarded transitively, exactly as the bare `/console` redirect
  is. The **component folder did not move**: it is still `insiden/links/links.component.*`, so the
  folder path and the URL now disagree on purpose. Both nav lists — `shell/nav-config.ts::CONSOLE_LINKS`
  and the hardcoded duplicate `console-nav.component.ts::ITEMS` — point at `/console/links`, and the
  legacy path is in neither, so `RouterLinkActive` follows the real URL.
  `adminOnlyGuard` awaits `auth.whenReady` and redirects
  non-admins to `/spotting` (it is **not** a pass-through stub — do not "re-fix" it). The backend
  additionally refuses a non-admin status change, so the row actions carry no second permission
  check.
- **Two clocks, on purpose:** the queue is **sorted** on the event instant (`occurredAt`,
  `-occurredAt, -id`) and the range filter windows the same column, but an admin _moderates_ against
  the report instant (`created`) — "how long has this been sitting un-reviewed" is a `created`
  question, "is this report back-dated" is an `occurredAt` one. So the **Submitted** cell shows
  `created` and, **only across different MINUTES**, a quieter `Occurred {date}` line
  under it — a back-dated report is the case where the clocks genuinely disagree and the only one an
  admin is meant to act on. 🔴 **The granularity is the MINUTE because that is the rendered precision**:
  both lines go through `MMM d, y HH:mm`, so the seconds are gone before anyone sees either one, and an
  exact-instant test would print `Aug 1, 2026 09:00` directly under an identical `Aug 1, 2026 09:00` on
  any row whose two clocks differ only below the minute — worse than either showing one line or showing
  two that genuinely differ, because the admin cannot tell which mistake they are looking at. Nothing
  about a payload has to be broken to produce that: two `DateTime`s written microseconds apart, or a
  value re-serialised through a path that normalised the seconds, are enough. It is a rule about
  **rendering**, not about the data, and it is `isSameMinute` in
  `../data/same-minute.util.ts` (2026-10-02). Two columns of their own was the same answer costing a
  tenth of the table's width; the filter is labelled "Occurred
  between", because no single label can honestly describe a window over `occurredAt` any more. The
  instants stay separate in the **payload** (`linkStatusInput`, the `occurredAt` note in
  `saveLinkEdit`), because a save must not silently rewrite one as the other.

### 🔌 Interface & Data Flow

- **Inputs:** none — a page-level component, all state local signals.
- **Filters** (a card above the table; `appliedX` plain fields hold what was last committed, so
  editing a control does not refetch until its own trigger fires). Free text search (URL + title,
  matched server-side) is **debounced**; Category, the All/Pending/Completed status select and the
  All/Visible/Hidden visibility select refetch
  **immediately**; Line, Vehicle, Station and the date range refetch through the same trailing
  debounce; **Reset** clears everything. The default status filter is **Pending** (not-completed) and
  the default visibility filter is **All links** (hidden rows included, so the admin sees the whole
  moderation surface until they narrow it).

  | control                                                                                                 | backend argument                                   |
  | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
  | Search (URL, title)                                                                                     | `search: String`                                   |
  | Category                                                                                                | `categoryId: ID`                                   |
  | Status (All / Pending / Completed)                                                                      | `completed: Boolean` (omitted for "any")           |
  | Visibility (All links / Visible only / Hidden only)                                                     | `hidden: Boolean` (omitted for "All links")        |
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
  `occurredAt` and the four conversation scalars `parentId` / `isThreadRoot` / `sublinkCount` /
  `position`; `sublinks` is deliberately **not** selected — the accordion derives the hierarchy from
  `parentId` **client-side** over the flat loaded array (the same data the depth rails and the
  reorder payload already use), so selecting the nested list would add nothing but let a HIDDEN row's
  URL/title travel inside a nested field of an admin-gated query. All four
  are **required** on `SocialMediaLinkRow` (unlike on the structural `LinkCardItem`, where they are
  optional for the flat hosts), so the document and the row type cannot drift apart.
- **Mutations** (all with the `firebase-auth-key` header; all reload the list on success):
  - `updateSocialMediaLink` (**`IsLoggedIn`** — see the gate note below, _not_ `IsAdmin`) — Approve
    (`status: "LIVE"`), Unhide (`status: "LIVE"`) and Hide (`status: "HIDDEN"`) build their payload
    through the single shared
    builder `linkStatusInput(link, status)`, which re-sends the row's current `url`, `title`, all
    four M2M id lists **and `occurredAt` verbatim**. Both halves are load-bearing:
    `SocialMediaLinkInput` is replace-not-patch (it would otherwise blank the title and strip every
    tag), and `occurredAt` is tri-state with a destructive `null` (reset to the row's submission
    time) — so `?? null` here would rewrite the event time of every row on every click, and re-sort
    the public feed with it. A **HIDDEN** row offers Unhide — the same `LIVE` write as Approve but
    **without** the completion step (see Row actions), so republishing a hidden link does not retire
    it from the queue.
    ⚠️ **Why an `IsLoggedIn` mutation is still safe on an admin page.** The GraphQL class is the
    wrong place to look for this page's authority: the **route** is what is gated
    (`adminOnlyGuard`, genuinely enforced — do not "re-fix" it), and the finer rule lives in the
    backend's **service layer**, which forces a non-admin's edit back to `PENDING_APPROVAL`. So no
    non-admin can set `HIDDEN` — or keep `LIVE` — through this mutation whatever the class says,
    and the only other caller the class admits is a submitter editing their own link. Read a
    permission class from the mutation's `permission_classes`, never from the page that calls it.
  - `markSocialMediaLinkCompleted` — its own id-only mutation, so it needs no equivalent payload.
    🔴 **Approve now issues BOTH of these, in that order, and reloads exactly ONCE** (see Internal
    State) — it is a two-step sequence, not two independent actions.
  - `deleteSocialMediaLink` (IsAdmin) — hard delete behind a native `confirm()`, plus a local row
    drop and panel close.
- **Table columns:** select-all checkbox · URL (external link, `max-w-72`, carrying the **depth
  rails**, the chevron and the `N links` chip, and `break-all`) · Title (`max-w-64`, `break-words`) ·
  Submitter (carrying the per-row Official chip, `data-testid="link-official"`) · Categories · Status ·
  **Submitted** · Actions. **Eight** columns; `min-w-[1280px]` (it grew with the sequence/nesting verbs
  in the action cell, which would otherwise scroll out of reach on a narrow screen), and the skeleton
  rows and both `colspan`s are 8.
  - ⚠️ **Two pairs of columns merged (2026-10-02), so the table is eight wide rather than ten.**
    `Thread` moved **into the URL cell** as the anchor's second line, and `Occurred` merged into the
    Submitted cell as a second line gated on **`!isSameMinute(link.created, link.occurredAt)`** — the
    rule is stated once above; the mechanics are `same-minute.util.ts`'s, mirrored here because this
    bullet is what a reader arrives looking for:
    - 🔴 **The exact-string fast path comes FIRST, and it is not a micro-optimisation.** It is the only
      branch that can be right about a payload it CANNOT parse. The backend's `USE_TZ = False` columns
      send naive local wall time (`2026-08-01T09:00:00`, no offset and no `Z`) and `Date.parse` is the
      one place that resolves such a string in the viewer's zone; when both sides are byte-identical the
      answer is `true` whatever that resolution produced — and a pair of equal strings is also how the
      backend spells "the submitter stated no event time", i.e. the overwhelming majority of rows.
      Comparing first means those rows never depend on the host TZ at all.
    - ⚠️ **TRUNCATION, not rounding**: `Math.floor(ms / 60_000)` buckets each instant into the minute it
      falls in, so `09:00:59` and `09:01:00` are **different** minutes. Rounding would push the first up
      into the second and report a whole-minute disagreement as agreement — the exact boundary this
      exists to get right.
    - 🔴 **Every unparseable side returns `false`, so `NaN` never decides it.** `strict` /
      `strictNullChecks` are off in this repo, so a hand-built fixture, a stale cache or a host that
      stopped selecting the field can hand the comparison two unparseable values — and `NaN !== NaN` is
      **true**, so a naive `a === b || parse(a) === parse(b)` would report DIFFERENT instants as the
      same and render the line through the same date pipe as `Invalid Date`. Returning `false` can only
      ever **ADD** a (harmless, redundant) line, never suppress a real one or print a broken one; the
      identical-strings fast path is deliberately exempt, because two identical invalid strings really are
      the same value. The util is pure and total (no Angular, no `signal`, no clock read, no `any`) and
      re-exposed on the class as `isSameMinute`, so the NaN guard and the truncation rule cannot be
      re-invented inline in a template binding.
  - The chip's new home is a `flex-col items-start` **inside the URL cell** (`data-testid="link-thread"`,
    unchanged testid / gate / tooltip), so its left edge **is** the URL text's left edge by construction
    — no `margin-left` to compute and therefore nothing that can drift when the rail width, the chevron
    reserve or a gap changes. 🔴 `threadLabel`'s `""` answer renders **nothing** here, not an em dash: a
    lone ungrouped link is the overwhelming majority of the queue, and a column of dashes was the
    loudest thing on the row.
  - ⚠️ The "Status" column and the "Status" filter are BOTH about the admin's `completed` handled flag
    (a `Completed` / warning `Pending` badge, and the All/Pending/Completed select →
    `completed: Boolean`) — **not** the link's approval `status` (`LIVE` / `PENDING_APPROVAL` /
    `HIDDEN`), which this queue renders only as the per-row action verbs (Approve / Unhide / Hide)
    and, for a hidden row, a neutral **Hidden** chip (`data-testid="link-hidden"`) beside the
    submitter. The **Visibility** select (All links / Visible only / Hidden only → `hidden: Boolean`)
    is the filter for that axis. The two axes are independent (see `MISTAKES.md`), so a row can be
    `LIVE` and still read "Pending" here.
- **Depth is drawn as RAILS plus a tint, not as padding (2026-10-02).** The URL cell's wrapper is
  `data-testid="link-depth"`, carrying `[attr.data-depth]="depthOf(link)"` — the same number the rail
  count is derived from, so a spec can assert the hierarchy without measuring pixels. The indent itself
  is the rail **stack**: `depthRails(link)` returns one entry per ancestor level
  (`Array.from({ length: depth }, …)` — the values are never read, only the length) and
  `@for … track $index` draws that many `data-testid="link-rail"` spans, each
  `border-border/60 shrink-0 self-stretch border-l` with its width **style-bound** —
  `[style.width.px]="depthIndentPx"` rather than a `w-5` class, so `DEPTH_INDENT_PX` stays the ONE
  definition of the rail step (a class here would render identically and be a second place to change
  the geometry that no grep for the constant would find).
  🔴 **The rails REPLACED `[style.padding-left.px]` rather than joining it**, and there is deliberately
  **no `gap`** on the wrapper — a gap would fall _between_ two rails and break the line a reader follows
  downward, so every gap here is an explicit `ml-1`. A bare gap reads as an indent only while you are
  looking at that gap, and three levels of nothing read as three unrelated offsets.
  - An `aria-hidden` **elbow** (`data-testid="link-elbow"`,
    `border-border/60 h-6 shrink-0 self-start border-t`, the same
    `[style.width.px]="depthIndentPx"` plus `[style.margin-left.px]="-depthIndentPx"`) is emitted on
    the **last** rail only, which is what makes a rail mean something: without it a rail is a bare
    vertical rule and nothing says the row hangs off _it_; the negative margin (`-depthIndentPx`)
    pulls the stub back under the rail so it starts exactly on that rail's own line, and one per
    level would draw a row of ticks with no row to attach the first of them to.
  - `DEPTH_INDENT_PX` is now **20** and **is** the rail/elbow width the template binds
    (`[style.width.px]="depthIndentPx"`, `-depthIndentPx` for the elbow's pull-back); it is no longer
    multiplied into a padding. Binding it rather than writing `w-5` keeps the constant as the single
    definition of the rail step, and it is exposed on the class rather than imported by the template
    precisely so a `w-5` could never drift in beside it. It stays a flat scale — `@for` over the depth,
    never a class ladder per level — so a hand-edited row deeper than any ladder still draws a rail per
    level instead of snapping back to column zero and reading as a root.
  - The rails are `aria-hidden`, so the chevron reserve span has to carry
    `data-testid="chevron-placeholder"`: a spec asking "is the chevron's width reserved here?" cannot ask
    for `aria-hidden` and mean one specific element.
  - 🔴 A **child row is tinted** too: `[class.bg-muted/40]="depthOf(link) > 0"` on the `<tr>`, over
    `hover:bg-muted`. The rails say _which_ ancestor a row hangs under; the tint says the weaker,
    row-wide thing they cannot — "this is not a root, it belongs to a conversation above" — and it
    survives the row being scanned rather than its left margin being counted. Hover still wins, because
    `bg-muted` is a stronger value of the same token and comes later in the class list, so a pointer over
    a tinted row darkens it instead of cancelling the hover.
  - `depthOf` walks the row's `parentId` chain **inside the loaded set** and is bounded and cycle-safe.
    🔴 A row whose parent is not loaded counts as depth 0, and that is exactly what a filter causes:
    searching for a phrase leaves a sublink's parent out of the result, and rendering it flush is
    honest, whereas indenting by a depth the payload cannot support would make a filtered queue look
    corrupted.
- **Long URLs and titles wrap; they are never clipped** (2026-10-01). The URL anchor carries
  `break-all` and the title cell `break-words`: a URL is **one unbroken token**, so without
  `break-all` a long address runs past `max-w-72` and the table's scroll container cuts off its tail —
  an admin cannot judge the link whose last characters they cannot see. A title is prose, so it gets
  `break-words` (break only where the text has no other opportunity) rather than `break-all`. Neither
  cell may gain `truncate` / `whitespace-nowrap` / `overflow-hidden`. The single **Submitted** cell
  keeps `whitespace-nowrap` on purpose (it holds both clocks, as two lines): a wrapped
  `Aug 1, 2026 08:30` reads as two values, and the whole point of showing the event instant is that it
  is legible at a glance next to the report one. The detail sheet's URL anchor already used `break-all`
  and is the precedent.
- **Row actions:** Approve (`status === "PENDING_APPROVAL"` only — a hidden row never shows it), Unhide
  (`status === "HIDDEN"` only — a single `LIVE` write with **no** completion, so it does not retire
  the row), Hide (every row whose `status !== "HIDDEN"`), Mark
  completed (when not `completed`), the **icon-only** tree verbs **Move up** / **Move down** /
  **Nest under…** (`data-testid="move-link-up"` / `move-link-down` / `nest-under` — arrow-up, arrow-down,
  corner-down-right), **Ungroup** (`data-testid="ungroup-link"`, **sublinks only** — a root has nothing
  to detach), Delete. The cell is `flex-wrap`, so a wider set degrades to a taller row rather than an
  unreachable control.
  - 🔴 **The two that have a PRECONDITION are not DRAWN until it holds** (2026-10-02), and this is a
    rendering gate, not a weakened one. Move up / Move down are inside `@if (queueIsComplete())`, and
    Nest under… inside `@if (nestSelectionReady())` — so the default **Pending** queue shows no dead pair
    on every row, and the rows an admin is likely to nest under appear with the first tick. Two
    permanently greyed buttons read as a broken table rather than as unavailable. The gates themselves
    are **unchanged** — `canMoveUp` / `canMoveDown` / `canNestUnder` / `reorderSiblings` all still refuse
    on the same conditions, because a programmatic caller reaches past the template.
  - Once drawn they come back **fully**: Move up / Move down stay disabled at the two ends of the stored
    run with that reason on hover, and Nest under… is disabled on every row that cannot be the target —
    the ticked rows themselves, since nesting a selection under one of its own links is a cycle the
    server rejects as a unit.
  - 🔴 **The three tree verbs are ICON-ONLY, so their meaning is stated TWICE from ONE source**
    (2026-10-02). They used to spell out their labels, which is what made the action cell wrap to two
    lines and pushed Delete toward the edge; an arrow glyph carries none of that meaning on its own, so
    each button binds `[attr.aria-label]` (what a screen reader announces) and `[attr.title]` (what a
    mouse user reads on hover) to the **same field on the class** — `moveUpHelp` / `moveDownHelp` /
    `nestHelp` — declared once each as the `??` fallback of its title. The title is the blocked reason
    whenever there IS one (`moveBlockedReason` / `nestBlockedReason`) and the help copy only while the
    action is live, so the two states are mutually exclusive and a live button is never silently mute;
    the reason stays a `null`-returning method because it is per ROW and per QUEUE STATE while the help
    copy is constant. `attr.title` is **kept even though both branches are now non-null**, because
    `moveBlockedReason` is typed `string | null` and the guard has to survive whoever widens it next —
    a property binding coerces that null to the literal string `"null"`, which is a tooltip reading
    "null" on hover, while an attribute binding removes the attribute. Each `<svg>` carries
    `aria-hidden`: the glyph is decoration beside a labelled control, so announcing it would read the
    icon's shape out loud after the sentence that already names the action.
  - `size="icon-sm"` (a `size-7` square) rather than `size="sm"`: an icon button has no text to give it
    width, and the square keeps the row height and its neighbours' height identical. The glyphs are
    feather-style inline strokes (`viewBox="0 0 24 24"`, `stroke="currentColor"`, `size-4`), so they
    inherit the button's own colour in every variant rather than shipping two sets of assets.
  - Every one calls `$event.stopPropagation()` so activating it does not also open the detail panel. Row
    click / `Enter` opens the detail panel; the row's own checkbox stops propagation
    (`(click)`, not `(change)` — `change` only fires after the click has already bubbled, so without
    this, ticking a row would also open its editor).
- **Detail panel** (row click): the URL, title, the **"When did this happen?"** control
  (`data-testid="edit-occurred-at"`, hint "Clear it to fall back to the report time. This is the
  column the public feed sorts on."), the bulk tag block (lines/vehicles/stations/categories), the
  `data-testid="detail-occurred-at"` line, the submitter, the completion metadata
  (`completedAt` + `completedBy`), and the same field set as "Submit a link". The sheet's footer
  carries its own **Approve** (`data-testid="panel-approve"`, rendered only while
  `status === "PENDING_APPROVAL"`), **Unhide** (`data-testid="panel-unhide"`, only while
  `status === "HIDDEN"`) and **Hide** (`data-testid="panel-hide"`, every other row), which are the
  _same_ `approveLink` / `unhideLink` / `hideLink` the row calls — not panel-only variants —
  so the two surfaces cannot disagree about what the verbs mean. Save calls the
  `IsLoggedIn` `updateSocialMediaLink` with the **complete** form state (the backend replaces the
  M2M sets verbatim) and patches the row locally, mirroring the server's tri-state with
  `occurredAtInputToIso(...) ?? link.created` so a cleared box optimistically shows the fallback.
- **Conversation hierarchy: an ACCORDION over the loaded tree** (added 2026-10-01; ⚠️ this
  **supersedes** the earlier "moderation/organisation, not a display mode — the list stays flat" rule
  below, which was right about the row set and wrong about the visible set). Every link still gets
  its own row, its own checkbox and its own action cell — nothing is nested inside a cell — but the
  queue now renders the ordered TREE as an accordion, **collapsed by default**, matching the public
  feed's `app-link-thread`:
  - the `@for` iterates **`renderedLinks()`**, not `links()`. A row is drawn iff it has no loaded
    parent, or every loaded ancestor of it is expanded;
  - a row is a PARENT iff it has **LOADED children** (`childCountOf`), and it then carries a chevron
    — `data-testid="thread-toggle"`, `aria-expanded`, a rotating chevron icon, `(click)` with
    `$event.stopPropagation()` (the `<tr>` opens the detail panel on click) — inside the URL cell's
    padded flex. A **childless row draws an equal-width `size-4` placeholder** there instead: the
    chevron sits inside the padding, so without it every open/close would shift the URL and every
    column after it;
  - expanding reveals a row's direct children **directly beneath it, in the STORED order**
    (`position` ASC, `id` tie-break — `compareStoredSequence`), **recursively**: a child with
    children of its own gets its own chevron, so each level expands independently at any depth;
  - the **root order is unchanged** — the queue's `occurredAt DESC, id DESC`. Only the _placement_
    of children changes, from wherever the arrival order interleaved them to under their parent;
  - the **rails + child-row tint** (which are the indent itself), the `N links` chip + its coupling
    tooltip — now the URL cell's second line rather than a column of its own — and every per-row verb
    (Ungroup / the icon-only Move up / Move down / Nest under… / Approve / Unhide / Hide / Mark completed /
    Delete) are reachable
    on every rendered row, the two that need a precondition only once it holds (see Row actions above). A
    collapsed conversation's descendants are simply not on screen — which is the point;
  - 🔴 **the chevron's gate is `childCountOf`, never `sublinkCount`.** `sublinkCount > 0` on a
    filtered page describes descendants that are not in the result, and the chevron would expand to
    nothing; conversely `sublinkCount: 0` with a loaded child is hand-edited data, and refusing the
    chevron would strand a row the payload does contain. `sublinkCount` still owns the CHIP, which is
    a statement about the whole conversation including rows this page cannot show;
  - 🔴 **a row the walk cannot place is still rendered.** Hand-edited cyclic data (`a → b → a`) has
    no root for the recursion to start from, so anything the walk did not emit is appended **at the
    end of the rendered list, in its relative arrival order** (there is no parent position to put it
    at) — a queue that silently swallowed links would be worse than one that shows them
    untidily. The net distinguishes **unreachable** from **merely hidden behind a closed ancestor**
    by asking whether a _rendered_ ancestor is closed, so closing a conversation can never feed its
    own children back into the net;
  - the ancestor walk and the recursion are both cycle-safe (`emit` returns on an already-placed id;
    the collapse check uses the same visited-set rule as `depthOf`).
  - ⚠️ **this diverges from a rule `MISTAKES.md` states**, which is recorded here rather than left
    implicit: the 2026-09-30 `collapseThreads` entry rules that "client-side grouping of a flat page
    is unsound in the first place … so collapsing has to be the backend's decision". It is safe on
    this surface because the console resolver has **no pagination and no row cap**, so an unfiltered
    queue's loaded set **is** the whole table — the `queueIsComplete` precondition — and every
    structural action is refused outright when the loaded set cannot prove completeness. A parent
    missing from a filtered result makes its child render as a root, never a fabricated grouping,
    and the accordion only decides which rows of a complete set are **drawn**.
- 🔴 **Select-all reads the RENDERED rows; the grouping mutations scope to the LOADED ones.** Two id
  lists exist on purpose, answering different questions:
  - `renderedLinkIds` (what the accordion is showing) drives `toggleSelectAll` and
    `allVisibleSelected` — "select all" must not tick rows the admin cannot see, or the checkbox
    reads as fully selected while whole conversations sit closed, and a second press clears those
    ticks;
  - `visibleLinkIds` (**every loaded row**, collapsed children included) stays the scope of
    `scopedSelection` — collapsing a conversation is a VIEW gesture, not an intent to forget. Tick a
    root, open it, tick two children, close it, and Group must still move all three. Scoping the
    mutation to the rendered set would make a collapse silently drop the admin's own selection.
- The selection toolbar renders **always** (discoverability, and so a blocked action shows as a
  disabled button with a stated reason rather than an absent one):
  `data-testid="group-selected"`, a `selection-count` span, `Clear selection` once something is
  ticked, a `selection-hint` while fewer than two rows are ticked — **two spellings**, because the
  verbs have different minimums: with nothing ticked it says "tick a link to nest it under another,
  or tick two or more to group them into one conversation", and at exactly one tick it points at the
  enabled Nest-under rows and offers the second tick for grouping. ⚠️ That hint **spells "Nest under…"
  out in words on purpose**, and the copy is not to be tidied down to match the icon: it is the only
  place on the surface that names the glyph. A `reorder-hint` paragraph renders
  whenever the queue is filtered and carries the one-click `reorder-show-all` action (see the gates
  below) — 🔴 and since 2026-10-02 that action is **never disabled**, not even mid-load, and is
  **right-aligned** (`ml-auto shrink-0` against a `flex w-full` hint whose sentence is `flex-1 min-w-0`),
  because it is the resolution of the sentence beside it and belongs at the edge the eye lands on after
  reading the reason. A never-disabled button is only honest because the handler **cannot swallow the
  click**: `load()` queues a mid-flight arrival as `reloadQueued` and `finishLoading()` replays it, so a
  "Show all links" during the first load really does produce the unfiltered queue rather than leaving the
  dials reading "All" over the Pending rows still being fetched. A node with descendants
  gets a chip whose **visible text is just the `threadLabel` count — `2 links`**, not a literal
  `Thread (N)` — (`data-testid="link-thread"`, `hlmBadge variant="special"`), with a `title` tooltip
  stating the coupling (and whether the row is the root); it now sits in the **URL cell** under the
  anchor, and a `""` label renders **nothing** at all rather than an em dash. 🔴 That
  label is `threadLabel(link.sublinkCount + 1)` and the `+ 1` is load-bearing: `threadLabel` takes a
  **conversation size** and answers `""` for anything `<= 1`, so the raw descendant count would delete
  the chip on a root with exactly ONE sublink while leaving every ordinary row correctly chip-less.
  `confirmThreadCoupling` owes the same `+ 1`, or a one-sublink conversation would skip the confirm.
  The gate is `sublinkCount > 0`, **never** `isThreadRoot` (the backend calls every `parentId == null`
  link a root, so that flag is true of every ungrouped row and would chip the whole page).
  **Grouping** sends `groupSocialMediaLinks(linkIds)` with the `parentId` key **omitted** (so the
  backend elects the root — the earliest `(occurredAt, id)` of the selection — and hangs the rest off
  it); **nesting** is the same mutation with `parentId` set to the clicked row, and it is a **row
  action rather than a target picker** because the row is the target and the ticks are the payload;
  asking the admin to pick from a dropdown the target they are already looking at adds a step and a
  second source of truth. 🔴 **The two verbs do NOT share a minimum, and must not be made to.**
  Grouping needs two ticks (`canGroup`) because an untargeted one-link call elects that link as its
  own root — a no-op that renders as no conversation. Nesting needs only **one** (`canNest`): with a
  `parentId`, the ticked rows become that row's direct children, so a single link is a real write and
  the only way to create an existing link's first child. The backend enforces only the empty list
  (`_normalize_ids`) and its own tests nest single ids under a target throughout. **Ungroup** sends
  `ungroupSocialMediaLinks` for the single row and is
  offered on sublinks only. The returned root `id` is deliberately unused: it is a GraphQL **`Int`**,
  unlike every other id in the feature, and this list reloads wholesale.
- **🔴 THE ORDER THIS TABLE SHOWS IS NOT THE ORDER IT WRITES — that is the design, not a gap.** The
  queue is sorted `occurredAt DESC, id DESC`, which is a TRIAGE order ("what happened most recently")
  and stays exactly as it is. The stored sibling sequence is a **different** ordering, `position` ASC
  with `id` as the required tie-break, and it is the one a conversation reads in. `reorderSocialMediaLinks`
  is a **permutation** of one existing sibling set, so every payload is built from the STORED run
  (see Internal State) with one row moved. The visible consequence is deliberate: a successful move
  can leave the table looking unchanged, and the toast is what reports the write. The converse is
  deliberate too — a conversation the backend assembled oldest-first arrives here newest-first, so
  the move buttons answer from the stored run rather than from what happens to be on screen.

### ⚙️ Internal State & Logic

- Signals only, no RxJS. The selection is `selectedIds = signal<string[]>([])` and is built **only**
  through `link-thread-selection.util.ts` — the same module the profile's "My Submitted Links" uses,
  so the two surfaces cannot drift on "may I group this?", "may I nest this?", "is Select-all
  checked?" or "does this row show a chip?". The helpers are immutable by contract because their
  results are written straight
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
  are now one conversation is a request that has already been made). **Nesting clears it too**, for
  the same reason — it changes which rows are in a conversation — while a **reorder keeps it**: a
  reorder changes no membership, so the rows an admin ticked to find the sequence are still the rows
  they ticked afterwards.
- **`_runsByParentId` is the ONE map a sibling run is built**, and it is deliberately the only one. It
  groups the loaded rows by `parentId ?? null` (so the roots are the `null` run) and sorts each group
  with `compareStoredSequence`. Three readers share it, which is what keeps the sequence defined in
  one place: the accordion's child runs, `childCountOf`'s count, and `siblingsOf` — a row's siblings
  ARE its parent's children, so the reorder payload, the move index and the "already first / already
  last" reason all read that same array and cannot come to disagree with what the accordion expands.
  The groups are built fresh, so the in-place `sort` cannot touch the `links` signal's own array, and
  they are now **memoised and shared**: a caller that reorders a run must copy first (`reorderSiblings`
  does). ⚠️ **The run is NOT the order the top of the table renders** — that stays
  `occurredAt DESC, id DESC` and a run permuted in the arrival order would write the queue's triage
  timeline as the conversation's sequence.
- **`expandedIds` is a `signal<ReadonlySet<string>>`, and the immutability is load-bearing**: a
  signal compares by reference, so an in-place `add`/`delete` would produce the SAME `Set`, change
  detection would never fire and the chevron would silently stop responding. `toggleExpanded` copies
  every call. It is keyed by id and deliberately **survives a refetch** — ids are stable across
  reloads, so a conversation stays open through the reload a grouping or a reorder triggers, and an
  id that no longer exists is simply inert.
- **`compareStoredSequence` = `position` ASC, then `id` ASC**, mirroring the backend's own
  `(position, pk)` in `batch_load_sublink_subtrees` so a tie resolves the way the nested list is
  _drawn_ (`"10"` must not sort before `"9"`), with a code-unit compare as the non-decimal fallback
  (still total — the requirement is determinism, not numeric semantics). 🔴 **`id` is a required
  second key, not a nicety:** every structural write renumbers a run to the exact `10, 20, 30, …`
  series **except ungrouping**, which promotes links to roots without renumbering, so a promoted link
  keeps its old number and can TIE with a root that already holds it. Every root's `parentId` is
  `null`, so all roots are siblings and the root run is where the collision is observable; a sort on
  `position` alone leaves that to the engine's sort stability, i.e. to arrival order.
- **Two gates stand in front of every reorder**, and both are refusals rather than fallbacks:
  - `queueIsComplete` — a **signal**, not a `computed` over the filter dials, because a dial changes
    up to a trailing debounce before any refetch, so a `computed` would re-enable the action while a
    filtered page was still on screen. `fetchLinks` writes it from the same applied-filter snapshot
    that built the query, so the flag and the rows it describes cannot disagree. "Complete" is strict:
    no search, no category, no line/vehicle/station, no date window, **and** Status on All (the queue
    defaults to Pending, which already hides completed rows). The console resolver has no pagination
    and no row cap, so an unfiltered queue really is every link there is.
    🔴 **The default Pending view is itself a filter, so the raw gate made reordering unreachable in
    practice** — the greyed-out buttons said "clear the filters", but `Reset` restores the queue default,
    which IS Pending, and a permanently dead pair on every row of the default view reads as a broken
    table. So since 2026-10-02 the gate is a **render** gate: the two buttons are not drawn at all while
    it is false (the gates themselves are unchanged, and `reorderSiblings` re-checks both conditions
    because it is reachable programmatically). The `reorder-hint` carries `reorder-show-all`
    (`showAllLinks()`): one click cancels the debounce, clears every live control and every applied
    field, sets Status to All, and reloads, which is the only sequence that makes the flag true from
    the default view. `resetFilters()` and `showAllLinks()` share the one `applyQueueFilters(completed)`
    snapshot writer so the two cannot drift.
    - 🔴 **The completeness answer is SNAPSHOT BEFORE the first `await`, never read back after it.**
      `vars` is built from the applied fields in the same synchronous run, but those fields are mutable
      plain properties rather than a signal, so a later read describes whatever the admin has done
      since — and `showAllLinks` rewrites every one of them to the unfiltered snapshot while a
      **filtered** request is still in flight. Reading `appliedFiltersAreUnfiltered()` after that request
      resolved would claim a whole queue over a partial page, and the sequence buttons would light up over
      rows whose siblings are not loaded — precisely the state the flag exists to prevent. The captured
      answer is also written only on success, so the flag can never claim a whole queue over rows a
      failed query never replaced.
    - `moveBlockedReason`'s `!queueIsComplete()` branch is now **defensive only** — it is not rendered,
      because the buttons do not exist under a filtered queue. It stays because the function is a total
      function of the row: a programmatic caller or a future template that wants the disabled button back
      gets the honest reason rather than a `null` title on a control that cannot work.
    - Why the gate matters:
      `reorderSocialMediaLinks` permutes ONE sibling SET and **tolerates** a short list — the server
      writes the ids it was sent and appends the ones it was not told about, so a filtered page would
      succeed and silently shove a row the admin cannot see to the end of the conversation. Mark the
      boundary precisely: the server _does_ reject an id that is not already a child of the named
      parent ("permutes one set of siblings"), so **membership is validated and only absence is
      tolerated** — which is exactly why a short list is the case that slips through.
  - `runOrderIsKnown` — false as soon as **any** sibling came back without a `position`. 🔴 A missing
    `position` is **not zero**: the column is gap-spaced, so `0` is only the model's default for a row
    written outside `save()`, and a `?? 0` fallback would float the unknown row to the head of the
    conversation and then WRITE that as the stored sequence. A permutation of an unknown order is
    indistinguishable from a permutation of a wrong one. The comparators keep a `typeof` coercion
    only to stay antisymmetric so a sort can never produce `NaN` from a dropped key; no decision is
    taken on that result.
    `moveBlockedReason(link, direction)` returns the reason as copy for the disabled button's title (or
    `null` when it IS available) so the template binds it straight through and never restates a
    condition — and it is **direction-agnostic** about the unreadable-order case, because "already
    first" would itself be a claim about an order the queue cannot read. The template binds that `null`
    with `[attr.title]`, whose null **removes** the attribute: `[title]="… ?? null"` coerces the null to
    the literal string `"null"`, so every enabled button carried a "null" tooltip until 2026-10-02.
- **`isLoading` drops in exactly ONE place — `finishLoading()` — and that is load-bearing, not tidy.**
  Every verb that occupies the queue hands off to it from its own `finally`: `load()` itself plus all six
  mutations (`sendGrouping`, `ungroupLink`, `reorderSiblings`, `approveLink`, `setLinkStatus`,
  `markCompleted`). `load()`'s re-entrancy guard parks a second arrival as `reloadQueued`, and
  `finishLoading()` drains it with `void this.load()` — fire-and-forget deliberately, so a mutation's own
  success/failure return value is not overwritten by a follow-up query's outcome.
  - 🔴 The drain lives here rather than in `load()`'s own `finally` because **six of the seven verbs never
    pass through `load()`**: they set the flag and call `fetchLinks()` directly. A drain written in `load()`
    would leave a click parked during a mutation's post-write refetch unclaimed until some later unrelated
    `load()` spent it — the dials reading "All" over the Pending rows the refetch returned, and the admin's
    click apparently doing nothing until they pressed it a second time. That is the swallowed click,
    relocated by one window.
  - It is a **method rather than inline code in seven `finally` blocks** because the rule has to hold for
    the _next_ verb too: an eighth site that cleared the flag directly would compile, pass every spec, and
    strand the next parked reload — invisible until an admin hits that exact window.
  - ⚠️ **Not** for `isSaving` / `isDeleting`. Those are the detail sheet's two flags with their own
    lifecycles; routing them here would make a save replay a queued "Show all links" that no click asked
    for.
- **A reorder reloads and does not patch optimistically**, and that is not politeness: the order the
  table shows is not the order it writes, so nothing on screen could confirm the new sequence even in
  principle. The reload is what makes the next move a real swap against the stored one. The table
  therefore looks unchanged after a successful move; the toast is what tells the admin the write
  landed. `parentId` is **always** present in the payload (`link.parentId ?? null`) — an id for that
  parent's sublinks, `null` for the roots. 🔴 The backend argument is `parentId: ID`: **nullable with
  no SDL default**, so omitting it is perfectly legal GraphQL and is refused by the **resolver's own
  guard** (`if not parent_id: raise GraphQLError(…)`, `incident/schema/mutations/interactions.py:287`),
  _not_ by `ProvidedRequiredArgumentsRule` — in GraphQL "required" **is** "non-null", so a nullable
  argument cannot enforce its own presence at all. That is deliberate rather than a workaround:
  `ID!` would make the meaningful `null` ("reorder the roots") a hard error, so the schema cannot
  express the omitted/`null` distinction and the guard does it instead. The `?? null` here is
  therefore not cosmetic — it is what turns an accidental omission into a loud, specific error
  instead of a silent "reorder every root in the system".
- **Ungroup is offered on sublinks only, on purpose.** Ungrouping a **root** is inert by design — it
  is not a child of anything, so there is nothing to detach and its descendants stay attached; under
  the tree a PROMOTED node also **keeps its own children**, so detaching a middle node lifts a whole
  subtree to the root level (no cascade, no re-root election, both deliberate server-side). Offering
  the button on a root would be a promise the backend cannot keep, and the copy deliberately stays
  about the one row rather than claiming a cascade that does not exist.
- **Approve is a TWO-WRITE sequence, and it is the only verb that is** (2026-10-01): publish, then
  retire. `approveLink` sends `updateSocialMediaLink(status: "LIVE")` and then
  `markSocialMediaLinkCompleted(linkId:)`, and reloads **once** at the end. Approving is the queue's
  "handled it" gesture, and before this it published a row and left it sitting in the Pending queue
  forever — the admin had to find the same row again and press a second button for the thing they had
  just done. The two fields stay because they are **orthogonal axes** and the backend keeps both (no
  migration): `status` is FEED VISIBILITY, `completed`/`completedAt`/`completedBy` is the GLOBAL triage
  flag. The **standalone "Mark completed"** action is unchanged and still needed — a row that is
  already `LIVE` can need retiring on its own.
  - ⚠️ **Order is the contract.** The status write goes first because it is the half that can fail on
    its own; completing a row that is still `PENDING_APPROVAL` would retire a link nobody can see,
    which is not what a failed publish meant.
  - 🔴 **A partial failure is never silent and never rolls back.** If the publish fails: the existing
    error toast, **no** completion request, **no** reload. If the publish succeeds but the completion
    fails, the row IS live and still pending — so the error toast's _title_ says exactly that
    ("Link approved, but not marked completed") rather than reading as a plain "couldn't complete",
    and the reload **still** happens so the admin sees server truth instead of an optimistic chip. The
    return value is the **publish** outcome, which is what `approveFromPanel` reads to decide whether
    to close the sheet.
  - 🔴 **Hide deliberately does NOT complete, and neither does Unhide.** `completed` is the triage
    flag while both are FEED decisions: auto-completing on Hide would retire a row from the queue
    because an admin removed it from the feed, and auto-completing on Unhide would retire it because
    an admin put it back. Unhide is therefore a single `updateSocialMediaLink(status: "LIVE")` — it
    deliberately does **not** reuse Approve's completion step. Both asymmetries are asserted in the
    spec.
  - The implementation shape that keeps this honest: `sendLinkStatus` / `sendMarkCompleted` are
    request-only helpers that **reject** on failure and never catch, and `setLinkStatus` / `markCompleted`
    are the toast-and-reload wrappers over them. Approve composes the helpers directly instead of
    calling the wrappers, which is what keeps it to one reload — and the wrappers stay the path for
    every single-request verb, so the replace-not-patch payload still has exactly one builder.
- **Hide asks before hiding a node that has links below it — recursively.** `confirmThreadCoupling(link)`
  shows a native `confirm()` naming the count, and only when `threadLabel(link.sublinkCount + 1)` is
  non-empty, so an ordinary Hide (every ungrouped row and every leaf, whose own conversation size is
  `1`) stays a single click. 🔴 **Under the tree the blast radius is not one level**: `sublinkCount`
  counts descendants **at any depth**, so a root whose only sublink is itself a parent of two more
  reports a conversation of four and hiding it removes all four — saying "hides every member" would
  understate it, and the admin would learn the rest of the subtree's fate by looking for it in the
  feed afterwards. A **MID-TREE** node is asked about too, for the same reason one level down: hiding
  the middle of a conversation takes the rest of it with it. The same `+ 1` as the chip, and the two
  must never diverge. A static tooltip on the chip is not enough on its own: it is invisible until
  hovered, absent on touch, and gone by the time the admin reaches the Hide button at the other end of
  the row.
  It reuses the same native-`confirm` idiom as the Delete guard, so the console has one confirmation
  idiom rather than two.
- `threadLabel` is re-exposed on the class (`protected readonly threadLabel = threadLabel`) rather
  than re-implemented, because a template can only read members off the component — and re-deriving
  it is how this table and "My Submitted Links" end up saying "1 links" and "2 link" for the same
  conversation. (Scope note: this table, the profile list and the shared `app-link-card`'s in-card
  indicator are its three callers; the `app-link-thread` wrapper used to be a fourth and no longer is,
  because the indicator moved into the card. Re-derive that list from the code — see `insiden.md`.)

### 🧩 Extension Points & Hooks

- **The filter set is additively extensible** in the same spirit as the spotting queue: each control
  is a draft signal, one branch in `fetchLinks()`, and one row in the filter card. Unset optional
  keys are **omitted** rather than sent as `null`, so the wire never carries explicit nulls.
- **All grouping decisions are delegated, not inlined.** Anything that adds a selection affordance
  here must call `link-thread-selection.util.ts`; the pluralisation of a link conversation's size is
  decided app-wide in exactly one place — this chip, the profile badge and the shared `app-link-card`'s
  in-card indicator all read `threadLabel`, and each of the three passes `sublinkCount + 1`. Where a
  surface puts the chip is a **layout** question, not a shared one, and all three currently differ.
- **The hierarchy is a tree, and the tree-only questions are answered locally.** The selection
  questions are shared; **depth, the sibling run, and the reorder/nest block reasons are not** — they
  depend on a flat, filtered, un-paginated table, and the same three rules are re-derived (in the same
  wording) in the profile surface's copy. A third surface must copy the rule explicitly, because a
  module shared across features for a _presentation_ question would have to import a component's row
  type.
- **`siblingsOf` + `compareStoredSequence` are the sequence seam.** Any new ordering affordance here
  (drag-and-drop, a bulk "reverse this conversation") must derive its run from `siblingsOf` and must
  re-check both gates (`queueIsComplete`, `runOrderIsKnown`) rather than reading `this.links()`
  directly — that direct read is the exact bug the stored-order rule exists to prevent.
- **`linkStatusInput` is the single builder for the status-only verbs**, extracted so Approve, Hide and
  Unhide can never drift apart into one of them losing a field; `sendLinkStatus` is the single request
  they all issue, so the two-step Approve and the single-write Hide/Unhide reuse it rather than
  re-deriving the payload. A further
  status verb (Reject, say) should reuse both rather than build its own payload — the replace-not-patch
  and `occurredAt` tri-state traps are both live here (see `MISTAKES.md`).
- **The edit panel is a full `SocialMediaLinkInput`**, so every future editable link field is one
  signal, one control, one payload key and one optimistic-patch key. The panel is driven by the
  console's own signals, not by `LinkSheetService` — deliberately, so the admin sheet is independent
  of the public form's open/close lifecycle.
- **The accordion is the display mode; two rules govern anything added under it.** First, the queue
  shows HIDDEN rows as well as public ones, so a node's `sublinkCount` counts only _publicly-visible_
  descendants and the gap against the raw count is exactly the hidden ones — which is why the chip
  stays on `sublinkCount` while the chevron stays on `childCountOf`. Second, the tree is arbitrarily
  deep, so "a root and its members" is not a shape any of this table's state can assume: any new
  affordance that walks the tree (a "expand all", a bulk sequence, a per-level action) must go
  through `renderedLinks` / `_runsByParentId` and must not assume one level. ⚠️ An "Expand all" would
  have to write `expandedIds` for every row with loaded children in ONE `set` — a loop of
  `toggleExpanded` calls is correct but re-renders per iteration.
