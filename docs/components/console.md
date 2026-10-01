# Component: console

## 📌 Purpose & Scope

- **Core Responsibility:** Provides admin-only moderation queues. The **spotting queue** (`""` →
  `/console/spotting`) filters the crowd-submitted vehicle "spotting" event backlog (status, spotting type, date ranges, anonymity, read/notes flags, free text), pages through results, and bulk-marks a selection of events as reviewed ("read"). The **incident approval queue** (`/console/insiden/pending`) and the **social-media link triage queue** (`/console/links`, documented in full below) cover the two other moderation surfaces.
- **Domain/Layer:** Angular Presentation (standalone routed page components, lazy-loaded feature). Talks to a Django/Strawberry GraphQL backend (`rosak_backend`) over HTTP; no server-side rendering data needed beyond auth/token resolution.
- **Location:** `src/app/features/console/console.page.ts` (+ `.html`) for the spotting queue, routed via `src/app/features/console/console.routes.ts`; query/mutation definitions and DTOs live in `src/app/features/console/data/console.queries.ts`. The insiden sub-pages are `insiden/pending/pending.component.*` and `insiden/links/links.component.*` with their own `data/*.queries.ts` / `data/*.util.ts`.
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
  filters, per-row status actions (Approve / Hide / Mark completed / Delete), a full editable panel,
  and the conversation hierarchy as both a moderation/organisation tool (multi-select → group, per-row
  Nest under / Ungroup / Move up / Move down) and a display mode (per-row chevron, depth indent,
  `N links` chip).
- **Location:** `src/app/features/console/insiden/links/links.component.ts` + `.html`; documents and
  DTOs in `../data/insiden-console.queries.ts`; pure helpers in `../data/date-range.util.ts`,
  `../data/link-status-input.util.ts`, `../data/search-debounce.util.ts` plus the two **shared**
  insiden utils `insiden/data/link-occurred-at.util.ts` and
  `insiden/data/link-thread-selection.util.ts`.
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
  `occurredAt` and the four conversation scalars `parentId` / `isThreadRoot` / `sublinkCount` /
  `position`; `sublinks` is deliberately **not** selected — the accordion derives the hierarchy from
  `parentId` **client-side** over the flat loaded array (the same data the depth indent and the
  reorder payload already use), so selecting the nested list would add nothing but let a HIDDEN row's
  URL/title travel inside a nested field of an admin-gated query. All four
  are **required** on `SocialMediaLinkRow` (unlike on the structural `LinkCardItem`, where they are
  optional for the flat hosts), so the document and the row type cannot drift apart.
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
    🔴 **Approve now issues BOTH of these, in that order, and reloads exactly ONCE** (see Internal
    State) — it is a two-step sequence, not two independent actions.
  - `deleteSocialMediaLink` (IsAdmin) — hard delete behind a native `confirm()`, plus a local row
    drop and panel close.
- **Table columns:** select-all checkbox · URL (external link, `max-w-72`, carrying the **depth
  indent** and `break-all`) · Title (`max-w-64`, `break-words`) · Submitter (carrying the per-row Official chip,
  `data-testid="link-official"`) · Categories · Status · **Submitted** · **Occurred** · **Thread** ·
  Actions. Ten columns; `min-w-[1280px]` (it grew with the sequence/nesting verbs in the action cell,
  which would otherwise scroll out of reach on a narrow screen), and the loading/empty `colspan`s are 10.
  ⚠️ The "Status" column and the "Status" filter are BOTH about the admin's `completed` handled flag
  (a `Completed` / warning `Pending` badge, and the All/Pending/Completed select → `completed:
Boolean`) — **not** the link's approval `status` (`LIVE` / `PENDING_APPROVAL` / `HIDDEN`), which
  this queue never renders as a column. Approve and Hide are the verbs for that axis. The two are
  independent (see `MISTAKES.md`), so a row can be `LIVE` and still read "Pending" here.
- **Depth indent:** the URL cell's wrapper is `data-testid="link-depth"`, carrying
  `[attr.data-depth]="depthOf(link)"` and `[style.padding-left.px]="depthOf(link) * depthIndentPx"`
  (`DEPTH_INDENT_PX = 16` — a flat arithmetic scale, not a Tailwind class per level, so a hand-edited
  row deeper than any class ladder still indents instead of snapping to column zero). `depthOf` walks
  the row's `parentId` chain **inside the loaded set** and is bounded and cycle-safe. 🔴 A row whose
  parent is not loaded counts as depth 0, and that is exactly what a filter causes: searching for a
  phrase leaves a sublink's parent out of the result, and rendering it flush is honest, whereas
  indenting by a depth the payload cannot support would make a filtered queue look corrupted.
- **Long URLs and titles wrap; they are never clipped** (2026-10-01). The URL anchor carries
  `break-all` and the title cell `break-words`: a URL is **one unbroken token**, so without
  `break-all` a long address runs past `max-w-72` and the table's scroll container cuts off its tail —
  an admin cannot judge the link whose last characters they cannot see. A title is prose, so it gets
  `break-words` (break only where the text has no other opportunity) rather than `break-all`. Neither
  cell may gain `truncate` / `whitespace-nowrap` / `overflow-hidden`. The two **date** columns keep
  `whitespace-nowrap` on purpose: a wrapped `Aug 1, 2026 08:30` reads as two values, and the whole
  point of showing both clocks side by side is that each is legible at a glance. The detail sheet's
  URL anchor already used `break-all` and is the precedent.
- **Row actions:** Approve (when `status !== "LIVE"`), Hide (when `status !== "HIDDEN"`), Mark
  completed (when not `completed`), **Move up** / **Move down**
  (`data-testid="move-link-up"` / `move-link-down`), **Nest under…** (`data-testid="nest-under"`),
  **Ungroup** (`data-testid="ungroup-link"`, **sublinks only** — a root has nothing to detach), Delete.
  Every one calls `$event.stopPropagation()` so activating it does not also open the detail panel, and
  the cell is `flex-wrap` so a wider action set degrades to a taller row rather than an unreachable
  control. Row click / `Enter` opens the detail panel; the row's own checkbox stops propagation
  (`(click)`, not `(change)` — `change` only fires after the click has already bubbled, so without
  this, ticking a row would also open its editor).
- **Detail panel** (row click): the URL, title, the **"When did this happen?"** control
  (`data-testid="edit-occurred-at"`, hint "Clear it to fall back to the report time. This is the
  column the public feed sorts on."), the bulk tag block (lines/vehicles/stations/categories), the
  `data-testid="detail-occurred-at"` line, the submitter, the completion metadata
  (`completedAt` + `completedBy`), and the same field set as "Submit a link". The sheet's footer
  carries its own **Approve** (`data-testid="panel-approve"`, rendered only while
  `status !== "LIVE"`), which is the _same_ `approveLink` the row calls — not a panel-only variant —
  so the two surfaces cannot disagree about what approving means. Save calls the
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
  - the depth indent, the `N links` chip + its coupling tooltip, and every per-row verb (Ungroup /
    Move up / Move down / Nest under… / Approve / Hide / Mark completed / Delete) are **unchanged**
    and reachable on every rendered row. A collapsed conversation's descendants are simply not on
    screen — which is the point;
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
  enabled Nest-under rows and offers the second tick for grouping. A `reorder-hint` paragraph renders
  whenever the queue is filtered and carries the one-click `reorder-show-all` action (see the gates
  below). A node with descendants
  gets a chip whose **visible text is just the `threadLabel` count — `2 links`**, not a literal
  `Thread (N)` — (`data-testid="link-thread"`, `hlmBadge variant="special"`), with a `title` tooltip
  stating the coupling (and whether the row is the root); everything else renders an em dash. 🔴 That
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
    practice** — the disabled buttons said "clear the filters", but `Reset` restores the queue default,
    which IS Pending. The `reorder-hint` therefore carries `reorder-show-all`
    (`showAllLinks()`): one click cancels the debounce, clears every live control and every applied
    field, sets Status to All, and reloads, which is the only sequence that makes the flag true from
    the default view. `resetFilters()` and `showAllLinks()` share the one `applyQueueFilters(completed)`
    snapshot writer so the two cannot drift. Why the gate matters:
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
    first" would itself be a claim about an order the queue cannot read.
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
  - 🔴 **Hide deliberately does NOT complete.** `completed` is the triage flag and hiding is a feed
    decision: auto-completing on Hide would retire a row from the queue because an admin removed it
    from the feed. The asymmetry is asserted in the spec.
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
  hovered, absent on touch, and gone by the time the admin reaches the Hide button two cells over.
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
  in-card indicator all read `threadLabel`, and each of the three passes `sublinkCount + 1`.
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
- **`linkStatusInput` is the single builder for the status-only verbs**, extracted so Approve and Hide
  can never drift apart into one of them losing a field; `sendLinkStatus` is the single request both
  of them issue, so the two-step Approve reuses it rather than re-deriving the payload. A third
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
