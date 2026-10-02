# Component: profile

## 📌 Purpose & Scope

- **Core Responsibility:** Render the signed-in user's personal dashboard — identity header, editable nickname, aggregate spotting statistics, a spotting-activity heatmap, and a paginated/deletable history of the user's own spotting submissions. Reachable at `/profile/:id` (uid-keyed); a bare `/profile` redirects to the caller's own uid (or to `/spotting` if logged out) via `redirectToOwnProfileGuard`.
- **Domain/Layer:** Angular Presentation (standalone components, signals-based, SSR-aware). Consumes a Django/Strawberry GraphQL backend but contains no business logic of its own beyond client-side display/guard rules — ownership, delete windows, and stat computation are enforced server-side.

Directory map:

- `profile.page.ts` — route-level container (`ProfilePage`, selector `app-profile`).
- `profile.routes.ts` — lazy-loaded child routes (`PROFILE_ROUTES`).
- `data/profile.queries.ts` — all GraphQL documents + response/variable TypeScript types for this feature (no components).
- `user-card/user-card.component.ts` — identity header, nickname editor, stat cards (`UserCardComponent`, selector `app-profile-user-card`).
- `my-spottings/my-spottings.component.ts` — "Historical Spottings" paginated list with delete + notes popover (`MySpottingsComponent`, selector `app-my-spottings`).
- `my-links/my-links.component.ts` — "My Submitted Links": the caller's own social-media-link submissions, keyset-paginated, with per-row status badges and (own profile only) the **conversation hierarchy** — multi-select grouping, per-row Nest under / Ungroup / Move up / Move down, a depth indent and a `Thread · N links` badge (`MyLinksComponent`, selector `app-my-links`). It is hosted inline by `profile.page.ts` as `<app-my-links [isOwnProfile]="true" />`, below `<app-my-spottings>` — it is not a route.

## 🔌 Interface & Data Flow

- **Inputs / Props / Signals:**
  - `ProfilePage.id` — `input.required<string>()`, the route's `:id` param (Firebase uid); no default.
  - `UserCardComponent.user` — `input.required<UserData>()` (see `UserData` in `data/profile.queries.ts`: nickname, spottingsCount, mediaCount, spottingTrends, withMostEntriesMonth/Day, favouriteVehicles).
  - `MySpottingsComponent` — no inputs; it fetches its own data independently.
  - `MyLinksComponent.isOwnProfile` — `input.required<boolean>()`; the page passes `true` only on the
    owner's profile, and a constructor `effect` calls `loadMore()` (untracked) when it becomes true.
  - Internal page state (all Angular `signal`/`computed`, no defaults exposed externally): `isAuthReady`, `isOwnProfile` (derived from `auth.user()?.uid === id()`), `_isLoading`, `_user`.
- **Outputs / Events / API Responses:**
  - `UserCardComponent.nicknameSaved` — `output<string>()`, emitted after a successful `UPDATE_USER_MUTATION`; `ProfilePage.onNicknameSaved` merges it into the locally held `UserData` (avoids a full re-fetch).
  - GraphQL operations (all in `data/profile.queries.ts`):
    - `GET_USER_DATA_QUERY` — `user { nickname, spottingsCount, mediaCount, spottingTrends, withMostEntriesMonth, withMostEntriesDay, favouriteVehicles }`, vars `{ typeGroup, freeRange }`. Always resolves to the _caller's own_ user (backend has no by-id lookup — see Known Quirks in `docs/frontend-map/profile.md`).
    - `UPDATE_USER_MUTATION` — `updateUser(input: UserInput!) { nickname }`.
    - `GET_MY_EVENTS_QUERY` — `events(filters: {onlyMine: true}, order: {created: DESC}, pagination: {limit, offset})`, returns `MyEvent[]` (id, spottingDate, notes, created, status, type, runNumber, mediaCount, isMine, vehicle{…}).
    - `DELETE_EVENT_MUTATION` — `deleteEvent(input: DeleteEventInput!) { ok }`; server enforces both ownership and a hard 3‑day window (`DELETE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000`, mirrored client-side purely for UI affordance).
  - `MyLinksComponent` reads and writes, all through `inject(GraphQLClient).request()` with a per-call `firebase-auth-key` — deliberately **not** `graphqlResource()`, which is an `HttpClient` helper that sends no auth header and would 403 the backend's `mine: true` filter (same reasoning as `my-spottings`; on the server `auth.idToken()` resolves `null` and the read is skipped):
    - `PUBLIC_SOCIAL_MEDIA_LINKS_QUERY` with `{ mine: true, first: 20, after }` — the caller's own submissions, status-independent, keyset-paginated via `InfiniteScrollDirective`. The document selects `parentId` / `isThreadRoot` / `sublinkCount` / `position` but **not** `sublinks` (see Internal State), and `collapseThreads` is never sent.
    - `GROUP_SOCIAL_MEDIA_LINKS_MUTATION` / `UNGROUP_SOCIAL_MEDIA_LINKS_MUTATION` / `REORDER_SOCIAL_MEDIA_LINKS_MUTATION` (declared in the **insiden** feature's `data/social-links.queries.ts`, not here) — the three structural verbs, i.e. **group** (omit `parentId`, so the backend elects the root — the earliest `(occurredAt, id)` of the selection — and hangs the rest off it), **nest** (the same mutation with `parentId` set to the clicked row, which may itself be a sublink) and **reorder** (the stored sibling sequence). Each is a different KEY SET on the same payload shape, which is why the nest target is a row action rather than a picker: a submitter cannot see other people's conversations, so choosing among them would be guesswork. 🔴 **Reorder is the one verb that must always carry `parentId`** — an id, or an explicit `null` for the roots — because `reorderSocialMediaLinks.parentId` is `ID`: nullable with **no SDL default**, so omitting it is legal GraphQL and is refused by the mutation's own resolver guard, not by validation. In GraphQL "required" _is_ "non-null", so a nullable argument cannot enforce its own presence; `ID!` would have made the meaningful `null` ("reorder the roots") a hard error, so the guard does it instead. That is why `ReorderSocialMediaLinksVars.parentId` is `string | null` and deliberately **not** `string | null | undefined` — the same discipline the console documents at its `link.parentId ?? null` payload.
  - No component in this feature throws to its parent — GraphQL/network failures are swallowed and surfaced only via `ToastService` and/or an inline error/empty state.
- **Dependencies:**
  - `core/graphql/graphql-client.ts` — `GraphQLClient.request<TData, TVars>()`, a one-shot POST-based GraphQL caller (used for every query/mutation in this feature; note the codebase also has a reactive `graphqlResource()` helper, unused here since these calls are imperative/event-driven).
  - `core/graphql/types.ts` — shared enum/scalar types (`SpottingType`, `VehicleStatus`) and the generic `GraphQLResponse<T>`/`GraphQLError` envelope.
  - `core/auth/auth.service.ts` — `AuthService`: signals `user`, `isLoggedIn`, `isAdmin`; `whenReady: Promise<void>` (must be awaited before trusting auth signals, guards against a false redirect on page refresh); `idToken()` mints a fresh Firebase ID token per call; `login()`.
  - `core/auth/redirect-to-own-profile.guard.ts` — `redirectToOwnProfileGuard`, used only by `profile.routes.ts` on the bare `""` path.
  - `core/recaptcha/recaptcha.service.ts` — `RecaptchaService.execute(action)`, loads reCAPTCHA v3 lazily and returns a token; required by `deleteEvent` (server enforces `IsRecaptchaChallengePassed`).
  - `ui/toast/toast.service.ts` — `ToastService.success/error/info(title, description?)`, thin wrapper over `@spartan-ng/brain/sonner`.
  - `ui/*` (spartan/ui "Helm" layer) — `HlmButton`, `HlmSkeleton`, `HlmCardImports`, `HlmSheet`/`HlmSheetHeader`/`HlmSheetBody`, `HlmInput`. Purely presentational, no shared state.
  - `domain-ui/vehicle-status-badge`, `domain-ui/spotting-type-badge` — colored badge components keyed off `VehicleStatus`/`SpottingType` enums.
  - `domain-ui/spotting-activity-heatmap` — `SpottingActivityHeatmap`, inputs `data: input.required<SpottingActivityPoint[]>()` and `totalAllTime: input.required<number>()`; fed directly from `UserData.spottingTrends`/`spottingsCount`.
  - `shell/app-nav`, `shell/app-footer` — page chrome, no data coupling to this feature.
  - Third-party: Angular `@angular/forms` (`FormsModule`/`ngModel` for the nickname draft input), `@angular/common` (`DatePipe`, `DecimalPipe`).

## ⚙️ Internal State & Logic

- Pure Angular **Signals** throughout — no RxJS `BehaviorSubject`/Apollo cache, no local DB (`IndexedDB`) usage in this feature. Each component owns its own component-scoped state; there is no feature-level shared store.
- `ProfilePage`: `isAuthReady` gates rendering until `auth.whenReady` resolves; an `effect()` re-runs `load()` whenever `isOwnProfile()` becomes true (and clears `_user` otherwise). `_user`/`_isLoading` are plain signals populated by one imperative `GraphQLClient.request` call, no polling/re-fetch on interval.
- `UserCardComponent`: `_savedNickname` signal shadows `user().nickname` after a successful save so the UI reflects the edit without waiting for/forcing a parent re-fetch (input itself is never mutated). `_favouriteVehicle`/`_favouriteVehicleLines` are `computed()` with an explicit `favouriteVehicles[0]` guard (fixes a null-array crash present in the pre-rewrite version, per its own doc comment).
- `MyLinksComponent`: the list stays **flat** on purpose — the backend never collapses `mine`, so a
  person can see, and ungroup, every submission they ever made including one an admin has hidden; no
  `collapseThreads` is ever sent, and `PUBLIC_SOCIAL_MEDIA_LINKS_QUERY` deliberately does not select
  `sublinks`, so a row carries no expansion to reveal. Hierarchy is therefore shown by **INDENT**.
  The toolbar (`data-testid="thread-toolbar"`) renders
  only once the list is non-empty, with a per-row `hlm-checkbox` (`data-testid="select-link-<id>"` +
  a visually hidden accessible name), a count, a **Group into thread** button
  (`data-testid="group-selected"`, disabled below two — Nest ticked here needs only **one** tick,
  because a targeted nest writes a real child while an untargeted one-link group is a no-op) wired by
  `aria-describedby` to one line of
  discoverability prose (`data-testid="thread-hint"`, which names all three verbs — nest, group,
  order), plus a page-level `thread-sequence-notice` that appears while more pages are still loading.
  A ticked row tints via `hlm("rounded-lg", … && "bg-primary/5")`, and the
  row is a **card, not an anchor**, so a tick can never open the link.

  **The hierarchy is a TREE here too**, and three consequences run through the surface:
  1. 🔴 **A ROOT IS NOT "UNGROUPED".** Under the old flat model `threadId == null` meant "in no
     group"; under the tree it means "this link is the HEAD of its own conversation". So **Ungroup is
     offered only on rows that have a parent** and never on a root: detaching a root is **inert** (its
     sublinks stay attached to it), and detaching a child promotes it to a root of its own **without**
     flattening what it carried. A row that is a root and has sublinks is a healthy conversation head,
     not a row awaiting repair.
  2. 🔴 **`threadLabel` takes a CONVERSATION SIZE, not a descendant count.** `_conversationLabel`
     passes `sublinkCount + 1`, and that `+ 1` is why the `Thread · N links` badge
     (`data-testid="thread-badge-<id>"`) cannot vanish off a root with exactly one sublink. The
     template no longer calls the raw helper (it is still re-exposed on the class for the same
     re-exposed-member reason as the console), because a template that can reach the helper is a
     template that can one day pass a descendant count by mistake.
  3. 🔴 **`isThreadRoot` is a ROOT MARKER**, true of every ungrouped link, so it is never an
     affordance gate; the badge's own non-empty `threadLabel(...)` test is exactly the
     `sublinkCount > 0` gate. `sublinkCount` is this row's OWN descendants **at any depth**, so a
     conversation is sized from the ROOT's row and the column is never summed.

  **Depth** comes from one computed (`_shape`) that derives three things in a single pass over the
  loaded rows: `depthById` (how many loaded ancestors a row has), `ancestorsById` (the same chains,
  root-first — which is what makes a nest cycle detectable client-side) and `runs` (sibling runs
  keyed by `parentId`, roots under a `ROOT_RUN_KEY` sentinel so "reorder the roots" falls out of the
  same code path). A row whose parent has not been paged in renders at depth **0**: it is a root as
  far as this page can prove, and indenting it under a parent it cannot see would be a claim the
  payload does not support. The chain walk is bounded and cycle-safe, so hand-edited cyclic data
  cannot hang the render.

  **Ordering (Move up / Move down, `data-testid="move-up-<id>"` / `move-down-<id>"`)** carries the one
  rule both this surface and the console had to rediscover: **siblings are ordered by `position` ASC
  with `id` as the tie-break — NOT by the `occurredAt DESC, id DESC` order these pages arrived in.**
  Three orderings, each with one job: the stored `position` is what a conversation reads in; the
  arrival order is what the list renders in; `id` only breaks ties. 🔴 `reorderSocialMediaLinks` is a
  **permutation of one sibling set** — the server renumbers the ids it is sent to `10, 20, 30, …` from
  the order they arrive in and appends the siblings it was not told about — so the payload is the
  **whole** run with one row moved, never the two rows involved, and sending the arrival order would
  overwrite the stored story with the timeline (and report success). The run is sorted **once**, in
  `_shape`, so `_runOf`, `_moveReason` and `moveLink` cannot disagree.

  **Two gates, both refusals rather than fallbacks.** `_moveReason` returns `null` for "available" and
  otherwise the reason, which is bound straight to the button's `title` (and its `disabled` is
  `_moveReason(...) !== null`, so a control is never live and quietly inert). The checks are ordered by
  how much each would mislead: no browser session (SSR renders the button inert rather than firing a
  mutation the server would refuse); an in-flight write; an **incomplete** run (`_hasMore`, because a run may
  straddle a cursor page and a partial permutation is not rejected — the server validates that every
  id _is_ a child of the named parent but merely **tolerates absence**, silently pushing an unseen
  sibling to the end); an **unreadable** stored order (`_runOrderIsKnown` — a missing `position` is
  not `0`, and a `?? 0` fallback would float the unknown row to the head and then WRITE that as the
  sequence; note `position` is genuinely optional on `PublicSocialMediaLink` here, which is why the
  guard is a runtime `typeof` check and not a type-driven one); and only then the two ends, which are
  the ordinary self-evident reason. Nest-under is gated the same way, adding the client mirrors of the
  two server rejections the page can see: the target must not be ticked, and no **ancestor** of the
  target may be ticked either (nesting under a link that already sits under a ticked link is a cycle).
  A cycle through an unloaded ancestor is not detectable here and is the server's to reject. The depth
  check uses `MAX_NEST_DEPTH = 3`, an explicit **mirror** of the server's write-side cap — never
  permissive past the real one.

  Every selection question is answered by the **shared** `insiden/data/link-thread-selection.util.ts`
  helpers (`toggleSelection`, `areAllSelected`, `canGroup`, `selectedWithin`, `threadLabel`) — the same
  module the admin console's triage table uses, so the two surfaces cannot drift. Those helpers are
  immutable by contract because the result is written straight back into `selectedIds`: an in-place
  mutation yields the same array reference, change detection never fires, and the checkbox silently
  stops updating.
  The selection starts empty and is never seeded from storage or a clock, so the server-rendered
  markup and the hydrated one agree. After a mutation, `_reloadList()` waits out any in-flight
  infinite-scroll page **first** (it appends to the current list, so clearing underneath it would
  race a stale append), then clears and reloads from the first page — `parentId`/`sublinkCount`/
  `position` are all server-computed and a structural mutation returns only `ok`, so a reload is the
  only way the page learns what it wrote. Group and nest **clear** the ticks (they change which rows
  are in a conversation); a reorder **keeps** them (it changes no membership). A rejected structural
  write is an **expected**
  outcome (the ownership, cycle and depth gates reject the whole selection as one unit) and belongs in
  a toast; a
  `GraphQLRequestError` is already toasted and reported to Sentry by `GraphQLClient`, and anything
  else is rethrown to the Sentry-backed global `ErrorHandler` rather than dying quietly in a click
  handler. The mutation's returned root `id` is deliberately unused: it is a GraphQL `Int`, unlike
  every other id in the feature, and this list reloads wholesale.

- `MySpottingsComponent`: `_eventsSignal` accumulates pages (`loadMore()` appends, offset = current length — simple forward-only cursor, "load more" button rather than infinite scroll). `_groups` is a `computed()` that buckets events by `spottingDate` over the _entire_ accumulated list (not a single linear pass), since ordering is by `created DESC`, so same-`spottingDate` rows aren't guaranteed adjacent. `_hoverCapable` is set once, client-side only, via `afterNextRender` + `matchMedia("(hover: hover) and (pointer: fine)")`, choosing a hover tooltip vs. a tap-triggered `hlm-sheet` modal for notes. `_canDelete(event)` recomputes the real 3-day window client-side (`Date.now() - created <= DELETE_WINDOW_MS`) — deliberately fixed vs. the legacy app's incorrect 10-day constant.
- SSR-safety: nothing in this feature reads `window`/`document` outside `afterNextRender`/browser-gated code (`AuthService`, `RecaptchaService` are themselves platform-guarded).

## 🧩 Extension Points & Hooks

- `PROFILE_ROUTES` is a plain `Routes` array with two lazy `loadComponent` entries — new sibling routes (e.g. `/profile/:id/settings`) can be added here without touching `ProfilePage`.
- `UserCardComponent.nicknameSaved` is the only `@Output()` in the feature — the established pattern for a child mutating shared data and reporting back to the page, rather than each child re-fetching independently; a new "editable field" child component could follow the same one-directional-input / single-output shape.
- The stat-card grid in `UserCardComponent` is a flat, unconditionally-guarded list of `@if` blocks (Total Spottings, Media Uploaded, Best month, Best day, Favourite Train) — adding a new stat card is additive (new `@if` block reading a new `UserData` field) and doesn't require restructuring existing cards.
- `data/profile.queries.ts` centralizes every query/mutation/type for the feature; extending the `user` query (e.g. adding a new aggregate field) only requires touching this one file plus the `UserData` interface consumer.
- `MySpottingsComponent`'s notes affordance (hover tooltip vs. tap modal) is a reusable capability-detection pattern (`_hoverCapable`) that could be lifted into a shared directive/service if other features need the same hover/touch branching.
- **`link-thread-selection.util.ts` is the shared "select rows, then group them" seam** (insiden, imported by the admin console and this page, and read by the shared `app-link-card` for its in-card indicator): it decides "may I group this?", "is Select-all checked?" and "does this row show a badge?" in one place, and its immutability contract is load-bearing rather than hygiene. A new multi-select list anywhere in the app should route its selection through it rather than re-deriving the same three signals. The **tree**-only questions (depth, the sibling run, the reorder/nest block reasons) are answered locally on each surface, because they depend on a flat list and a different completeness proof — a filtered table here would prove completeness by "no filters", a paginated one by "no more pages". The same opportunity is catalogued as
  [`docs/COMPONENTS.md` § Cross-Component Feature Opportunities #4](../COMPONENTS.md), which now
  records that this module and the console's `useBulkActions` are **two** shared bulk-selection
  implementations rather than one: the spotting queue's is always-on with Shift-click range-select
  and has no enabling mode, so "lift the `Set` + mode-toggle shape" describes nothing that still
  exists.
- The backend has no "fetch another user by id" field yet (`CommonScalars.user` always resolves the caller from the auth token) — `ProfilePage` already has the `isOwnProfile`/non-owner branch wired up as a placeholder, so once that GraphQL field exists, real public profiles are a matter of swapping the query variables/guard, not restructuring the component.

## 💡 Potential Feature Opportunities

- **Public profile view for other users**: `ProfilePage` already computes `isOwnProfile` and has the non-owner branch wired up as a placeholder (see Extension Points above) — turning this into a real "view someone else's stats" page is a query/guard swap, not a restructure. **Status: ✅ IMPLEMENTED**: see [Public Profile Implementation](#public-profile-implementation) below.
- **Bulk-select and delete spotting entries**: `MySpottingsComponent` already gates deletability per row via `_canDelete(event)` (the 3-day `DELETE_WINDOW_MS` check) before firing `DELETE_EVENT_MUTATION`. **Structurally ready now** — a checkbox-selection UI can reuse the same per-row `_canDelete` gate and loop the existing mutation over the selected ids with no query/type changes; a real batch mutation on the backend would just be a nice follow-up for atomicity/performance.
- **Export historical spottings (CSV/JSON download)**: `_eventsSignal` already accumulates the user's full paginated history client-side (id, spottingDate, notes, type, vehicle, etc. from `GET_MY_EVENTS_QUERY`). **Ready now** — a "download my spottings" action can serialize the already-fetched signal value directly, with zero backend or query changes; only needs a small client-side CSV/JSON-writing utility.
- **New aggregate stat cards** (e.g., current spotting streak, most-visited station): the stat-card grid in `UserCardComponent` is explicitly an additive list of `@if` blocks reading `UserData` fields (per Extension Points). **Frontend pattern is ready**, but **not ready end-to-end** — today's `UserData` has no streak/station-frequency field. _Context for future LLMs_: the metric would need to be computed server-side and added to the `user` query in `data/profile.queries.ts` (and the `UserData` interface) before a matching `@if` card can be wired up; this is the same one-file-touch extension the doc already calls out.
- **Per-profile settings sub-page** (e.g., notification or privacy preferences): `PROFILE_ROUTES` is a plain `Routes` array built for additive `loadComponent` entries (e.g. `/profile/:id/settings`), so the routing shell is ready today with no changes to `ProfilePage` itself. **Not ready on the data side**: there's no settings/preferences query or mutation in `data/profile.queries.ts` yet. _Context for future LLMs_: needs a new GraphQL type + query/mutation pair (modeled on the existing `UPDATE_USER_MUTATION`/`UserInput` pattern) before the route can hold real content beyond a placeholder.

## Public Profile Implementation

**Status**: ✅ **IMPLEMENTED** (as of 2026-08-19)

### Backend GraphQL

- **Query**: `publicUser(id: ID!)` returns user profile by Firebase UID
- **Privacy Logic**:
  - Public stats (nickname, counts, heatmap, favorite vehicle) always visible
  - Historical spottings (`spottings` field) returns `null` when `spotting_data_public=false` for non-owners
  - Owner always sees own spottings regardless of privacy flag

### Frontend Components

- **ProfilePage**: Conditionally uses `GET_PUBLIC_USER_QUERY` vs `GET_USER_DATA_QUERY` based on `isOwnProfile()`
- **MySpottingsComponent**: Shows privacy message when `user().spottings === null`
- **UserCardComponent**: Hides edit button for non-owner views
- **SettingsComponent** (NEW): Privacy toggle at `/profile/:id/settings`
  - Ionic toggle with confirmation dialog on enable
  - Instant disable (no friction for privacy restoration)
  - Persists via `UPDATE_USER_MUTATION`

### Privacy Contract

- **Default**: `spotting_data_public = false` (strictly opt-in)
- **Public data** (always visible): nickname, spottingsCount, mediaCount, heatmap, withMostEntries*, favouriteVehicles
- **Private data** (opt-in only): historical spottings list with full details
- **Email**: Never exposed in any query

### Routes

- `/profile` → redirects to `/profile/{own-uid}`
- `/profile/:id` → public profile view (respects privacy)
- `/profile/:id/settings` → privacy settings (lazy-loaded, own profile only)

## 💡 Potential AI Feature Opportunities

- **Personalized spotting insights/narrative summaries**: the feature already aggregates rich per-user time-series data (`spottingTrends`, `withMostEntriesMonth/Day`, `favouriteVehicles`) purely as raw numbers/cards — an LLM could turn this into a natural-language "your year in spotting" digest or highlight anomalies (e.g. a sudden drop in activity, a new favourite line).
- **Smart notes/tagging on spotting entries**: `MyEvent.notes` is free-text with no structure today; an AI pass could auto-suggest tags, extract structured facts (location, condition remarks), or flag notes worth surfacing (e.g. defect reports) since the data already flows through a single well-typed pipeline (`GetMyEventsData`/`MyEvent`).
- **Nickname/content moderation assist**: `UPDATE_USER_MUTATION` currently has no client- or server-side validation on the nickname string — a lightweight AI/heuristic moderation check could be slotted into `UserCardComponent.save()` before the mutation fires, with no change to the surrounding component contract.
