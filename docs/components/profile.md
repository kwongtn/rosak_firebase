# Component: profile

## 📌 Purpose & Scope

- **Core Responsibility:** The personal dashboard: identity header with editable nickname, spotting
  stats, a spotting-activity heatmap, a paginated and deletable history of the caller's own
  submissions, and the caller's own social-link submissions with a conversation hierarchy. The same
  page renders another user's public profile, gated by their privacy setting.
- **Routes:** `/profile/:id` (uid-keyed, public), defined in `profile.routes.ts` (`PROFILE_ROUTES`).
  A bare `/profile` is redirected by `redirectToOwnProfileGuard` to `/profile/<own uid>`, or to
  `/spotting` when logged out. `profile/**` is `RenderMode.Client` in `app.routes.server.ts`, because
  every read is auth-gated.
- **Domain/Layer:** Angular Presentation (standalone, signals, SSR-aware) over the Django/Strawberry
  GraphQL API. Ownership, delete windows, stats and privacy are enforced server-side. Client code
  handles display and UI guards only.

Directory map:

- `profile.page.ts`: route container (`ProfilePage`, `app-profile`), inline template. Hosts
  `<app-profile-user-card>`, `<app-my-spottings>` and `<app-my-links>`.
- `profile.routes.ts`: `""` (guarded redirect) and `":id"`, both lazy `loadComponent` entries for `ProfilePage`.
- `data/profile.queries.ts`: every GraphQL document, variable and response type for this feature (no components).
- `user-card/user-card.component.ts`: identity header, nickname editor, stat cards, votes card and
  privacy sheet (`UserCardComponent`, `app-profile-user-card`).
- `my-spottings/my-spottings.component.ts`: "Historical Spottings", a paginated list with delete and a
  notes popover (`MySpottingsComponent`, `app-my-spottings`).
- `my-links/my-links.component.ts`: "My Submitted Links" (`MyLinksComponent`, `app-my-links`). The
  caller's social-link submissions, keyset-paginated, with status badges. On the own profile only, it
  shows the conversation hierarchy: multi-select grouping, per-row Nest under / Ungroup / Move up /
  Move down, a depth indent and a `Thread · N links` badge. Hosted inline by `profile.page.ts`, not a route.
  - `my-links/my-links-tree.util.ts`: depth and ancestor chains, stored-order runs, reorder
    permutation, indent ladder, conversation-size label, `MAX_NEST_DEPTH`.
  - `my-links/my-links-reasons.util.ts`: the move and nest blocked-reason gates.
  - `my-links/my-links-row.component.ts`: presentational row (`div[app-my-links-row]`, signal inputs, void outputs).
  - `my-links/my-links-status.util.ts`: status labels and variants (Pending approval / Live / Hidden).

## 🔌 Interface & Data Flow

- **Inputs / Signals:**
  - `ProfilePage.id`: `input.required<string>()`, the `:id` route param (Firebase uid).
  - `UserCardComponent`: `user` (`input.required<UserData>()`) and `isOwnProfile` (`input<boolean>(true)`).
    `isOwnProfile` gates the edit, privacy and votes controls.
  - `MySpottingsComponent`: `user` (`input.required<PublicUserData>()`) and `isOwnProfile`
    (`input.required<boolean>()`). The owner's history is fetched by the component itself. A
    non-owner sees `user().spottings` (`null` means private).
  - `MyLinksComponent.isOwnProfile`: `input.required<boolean>()`, passed as `true`. A constructor
    `effect` calls `loadMore()` (untracked) when it becomes true.
  - `ProfilePage` internal state: `isAuthReady`, `isOwnProfile` (`auth.user()?.uid === id()`),
    `_isLoading`, `_isError`, `_user` (`PublicUserData | undefined`), `retryResource`.
- **Outputs / Events:**
  - `UserCardComponent.nicknameSaved` (`output<string>`) and `privacySaved` (`output<boolean>`).
    `ProfilePage.onNicknameSaved` and `onPrivacySaved` merge the value into `_user`, so no re-fetch is needed.
  - No component throws to its parent. Failures surface through `ToastService`, the shared retry
    banner (`ProfilePage`) or an inline error or empty state.
- **GraphQL** (`data/profile.queries.ts` unless noted):
  - `GET_USER_DATA_QUERY`: owner only. `user { nickname, spottingsCount, mediaCount, spottingDataPublic,
spottingTrends, withMostEntriesMonth, withMostEntriesDay, favouriteVehicles }`, vars
    `{ typeGroup, freeRange }`. `ProfilePage` sets the owner's `spottings` to `null`.
  - `GET_PUBLIC_USER_QUERY`: non-owners. `publicUser(id: $id)` with the same stats, plus `spottings`
    (the history list, `null` when private).
  - `UPDATE_USER_MUTATION`: `updateUser(input: UserInput!) { nickname }`. Used for nickname edits and
    for privacy saves (`{ nickname, spottingDataPublic }`).
  - `GET_MY_VOTES_CAST_QUERY`: own profile only. Returns the total votes cast (`myVotesCast`). Only the
    total is shown, never what was voted on.
  - `GET_MY_EVENTS_QUERY`: `events(filters: {onlyMine: true}, order: {created: DESC}, pagination:
{limit, offset})`, returns `MyEvent[]`.
  - `DELETE_EVENT_MUTATION`: `deleteEvent(input: DeleteEventInput!) { ok }`. The server enforces
    ownership and a hard 3-day window. `DELETE_WINDOW_MS` (`3 * 24 * 60 * 60 * 1000`) mirrors it on
    the client purely for UI affordance.
  - `MyLinksComponent` reads `PUBLIC_SOCIAL_MEDIA_LINKS_QUERY` (`features/insiden/data/social-links.queries.ts`)
    with `{ mine: true, first: 20, after }`. It is status-independent and keyset-paginated via
    `InfiniteScrollDirective`. It selects `parentId`, `isThreadRoot`, `sublinkCount` and `position`, but
    not `sublinks`, and never sends `collapseThreads`.
  - Structural writes are declared in the insiden feature, not here:
    `GROUP_SOCIAL_MEDIA_LINKS_MUTATION`, `UNGROUP_SOCIAL_MEDIA_LINKS_MUTATION` and
    `REORDER_SOCIAL_MEDIA_LINKS_MUTATION` (`features/insiden/data/social-links.queries.ts`).
- **Dependencies:**
  - `core/graphql/graphql-client.ts`: `GraphQLClient.request<TData, TVars>()`, a one-shot POST caller
    used for every operation here. `graphqlResource()` exists, but it is unused: these calls are
    imperative, and it sends no auth header (see the MyLinks section).
  - `core/graphql/types.ts`: `SpottingType`, `VehicleStatus`, and the `GraphQLResponse<T>` /
    `GraphQLError` envelope.
  - `core/auth/auth.service.ts`: `user`, `isLoggedIn`, `isAdmin`, `whenReady: Promise<void>` (await it
    before trusting auth signals, or a page refresh redirects a logged-in user), `idToken()` (a fresh
    token per call), `login()`.
  - `core/auth/redirect-to-own-profile.guard.ts`: used only on the bare `""` route.
  - `core/recaptcha/recaptcha.service.ts`: `RecaptchaService.execute(action)` lazy-loads reCAPTCHA v3 and
    returns a token. Required by `deleteEvent`, since the server enforces `IsRecaptchaChallengePassed`.
  - `ui/toast/toast.service.ts`: `ToastService.success/error/info(title, description?)`, a thin
    wrapper over `@spartan-ng/brain/sonner`.
  - `ui/retry-banner/retry-banner.component.ts`: `RetryBannerComponent` (`app-retry-banner`), fed by
    `ProfilePage` through a structural `RetryableResource` adapter (no countdown, `retryNow` re-runs
    the load).
  - `ui/*` (Helm layer): `HlmButton`, `HlmSkeleton`, `HlmCardImports`, `HlmSheet`/`HlmSheetHeader`/
    `HlmSheetBody`, `HlmInput`, `HlmCheckbox`. Presentational only.
  - `src/app/domain-ui/`: `vehicle-status-badge` and `spotting-type-badge` (enum-keyed badges);
    `spotting-activity-heatmap` (`SpottingActivityHeatmap`, inputs `data`
    (`input.required<SpottingActivityPoint[]>()`) and `totalAllTime` (`input.required<number>()`), fed
    from `UserData.spottingTrends` and `spottingsCount`).
  - `shell/app-nav`, `shell/app-footer`: page chrome, no data coupling.
  - `features/insiden/data/link-thread-selection.util.ts`: shared selection helpers (see Extension Points).
  - `@angular/forms` (`FormsModule` / `ngModel` on the nickname input), `@angular/common` (`DatePipe`, `DecimalPipe`).

## ⚙️ Internal State & Logic

- Signals throughout. No RxJS, no Apollo cache, no IndexedDB. Each component owns its state; there is
  no feature-level store.
- **SSR safety:** nothing reads `window` or `document` outside `afterNextRender` or browser-gated code.
  `AuthService` and `RecaptchaService` are platform-guarded themselves.
- **`ProfilePage`:** renders the loading state until `auth.whenReady` resolves (`isAuthReady`). An
  `effect()` then calls `load(id, isOwn)` untracked, after reading `id()` and `auth.user()` itself.
  Those two reads are the effect's only dependencies, so `/profile/A` -> `/profile/B` (the page stays
  mounted, `withComponentInputBinding` only updates `id`) and a login, logout or account switch each
  re-load. `load()` reads no signal after its first `await`. It picks `GET_USER_DATA_QUERY` for the
  owner and `GET_PUBLIC_USER_QUERY` for everyone else, with one imperative request and no polling.
  `onPrivacySaved` and `onNicknameSaved` update `_user` in place.
  - **Stale responses:** every `load()` bumps `_loadSeq`, and a response (or failure) whose number is
    no longer current is dropped. Without it a slow A can land after B and show the wrong user.
  - **Failure:** `_isError` swaps the page body for `app-retry-banner` ("Couldn't load this
    profile.", Try Now re-runs the load for the current id), and `_user` is cleared. A
    `GraphQLRequestError` is already toasted and reported by `GraphQLClient`, so the page adds
    nothing. Any other error goes to the injected `ErrorHandler` (Sentry) as well. A `publicUser` of
    `null` is not an error: it shows "User not found or profile unavailable."
- **`UserCardComponent`:**
  - `_savedNickname` shadows `user().nickname` after a successful save. The input is never mutated.
  - `_favouriteVehicle` is `favouriteVehicles?.[0]`, so an empty, `null` or `undefined` list renders
    no Favourite Train card. `_favouriteVehicleLines` joins its line codes.
  - **Privacy** (own profile only): `openPrivacySheet()` opens an `hlm-sheet` with a toggle
    (`id="privacy-toggle"`, disabled while `_isSavingPrivacy`). Enabling asks `window.confirm`, and
    declining reverts the draft. Disabling is instant with no confirmation. Both persist through
    `UPDATE_USER_MUTATION` with the current nickname. On failure the draft reverts and a toast shows.
  - **Votes card** (own profile only): loaded from an `effect` through an untracked call. Hidden while
    `_votesCast` is `null`.
  - Stat cards are guarded `@if` blocks over `UserData`: Total Spottings, Media Uploaded, Votes Cast
    (own profile only), Best month, Best day, Favourite Train.
- **`MySpottingsComponent`:**
  - `_ownEvents` accumulates pages. `loadMore()` appends, and the offset is the current length. It is a
    forward-only cursor behind a "load more" button, not infinite scroll.
  - `_groups` is a `computed()` that buckets events by `spottingDate` over the **whole** accumulated list.
    Ordering is `created DESC`, so rows with the same `spottingDate` are not guaranteed adjacent, and a single linear pass would split groups.
  - `_hoverCapable` is set once in `afterNextRender` from `matchMedia("(hover: hover) and (pointer: fine)")`.
    Notes show as a hover tooltip on hover-capable devices, or in a tap-opened `hlm-sheet` otherwise.
    Only one of the two renders.
  - `_canDelete(event)` recomputes the 3-day window client-side (`Date.now() - created <= DELETE_WINDOW_MS`).
    The window is 3 days (matching the server); never a 10-day constant.
  - An `isDestroyed` flag stops an in-flight `loadMore()` from writing into a destroyed component.
- **`MyLinksComponent`:** the list stays **flat** on purpose. The backend never collapses `mine`, so a
  person can see and ungroup every submission they made, including any an admin hid. Hierarchy is shown
  by **indent**, because a row carries nothing to expand.
  - The toolbar (`data-testid="thread-toolbar"`) appears once the list is non-empty. It has a per-row
    `hlm-checkbox` (`select-link-<id>`, with a visually hidden name), a count
    (`thread-selection-count`), and **Group into thread** (`group-selected`). Group needs at least two
    ticks. Nest needs only one, because a targeted nest writes a real child, while an untargeted
    one-link group is a no-op. The button's `aria-describedby` points at `thread-hint`, which names
    nest, group and order. `thread-sequence-notice` shows while more pages are still loading.
  - A ticked row tints (`bg-primary/5`). A row is a **card, not an anchor**, so a tick never opens the link.
  - **The hierarchy is a tree**, with three consequences:
    1. 🔴 **A root is not "ungrouped".** In the old flat model `threadId == null` meant "in no group".
       Now it means "head of its own conversation". Offer **Ungroup only on rows with a parent**, never
       on a root. Detaching a root is inert, because its sublinks stay attached. Detaching a child
       promotes it to a root of its own without flattening what it carried. A root with sublinks is a
       healthy conversation head, not a row awaiting repair.
    2. 🔴 **`threadLabel` takes a conversation size, not a descendant count.** `_conversationLabel`
       passes `sublinkCount + 1`. That `+ 1` is why the `Thread · N links` badge
       (`thread-badge-<id>`) cannot vanish on a root with exactly one sublink. The template never calls
       the raw helper, because a template that can reach it could one day pass a descendant count by mistake.
    3. 🔴 **`isThreadRoot` is a root marker**, true of every ungrouped link. Never use it as an
       affordance gate. The badge's non-empty `threadLabel(...)` is exactly the `sublinkCount > 0` gate.
       `sublinkCount` counts the row's own descendants **at any depth**, so size a conversation from the
       root's row and never sum the column.
  - **Depth:** one computed, `_shape`, calls `buildLinkShape` (`my-links-tree.util.ts`), which derives
    `depthById`, `ancestorsById` (root-first chains, which make a nest cycle detectable client-side) and
    `runs` (sibling runs keyed by `parentId`, with roots under `ROOT_RUN_KEY` so "reorder the roots" uses
    the same code path) in one pass. A row whose parent has not been paged in renders at depth 0: it is a
    root as far as this page can prove, and indenting it under a parent the payload does not show would be a claim the data does not support. The chain walk is bounded and cycle-safe, so hand-edited cyclic data cannot hang the render.
  - **Ordering** (Move up / Move down, `move-up-<id>` / `move-down-<id>`): siblings sort by `position`
    ASC with `id` as the tie-break. They do **not** sort by the `occurredAt DESC, id DESC` arrival order.
    The stored `position` is what a conversation reads in. The arrival order is what the list renders
    in. `id` only breaks ties. `reorderSocialMediaLinks` is a permutation of one sibling set: the server
    renumbers the ids it is sent as `10, 20, 30, …` in the order they arrive, and appends the siblings it
    was not told about. So the payload is the **whole** run with one row moved. Sending the arrival order
    would overwrite the stored sequence with the timeline and still report success. The run is sorted once,
    in `buildLinkShape`, so `_runOf`, `_moveReason` and `moveLink` cannot disagree.
  - **Gates are refusals, not fallbacks.** `_moveReason` wraps `moveBlockedReason`
    (`my-links-reasons.util.ts`). It returns `null` when the move is available, or the reason otherwise.
    The reason is bound to the button's `title`, and `disabled` is `_moveReason(...) !== null`, so a
    control is never live but quietly inert. Checks run in order of how misleading each would be:
    1. No browser session. SSR renders the button inert rather than firing a mutation the server refuses.
    2. A write is in flight.
    3. The run is incomplete (`_hasMore`). A run can straddle a cursor page, and a partial permutation
       is not rejected: the server checks that each id is a child of the named parent, but silently pushes
       an unseen sibling to the end.
    4. The stored order is unreadable (`runOrderIsKnown`). A missing `position` is not `0`. A `?? 0`
       fallback would float the unknown row to the head and then write that as the sequence. `position`
       is optional on `PublicSocialMediaLink`, which is why this guard is a runtime `typeof` check.
    5. Only then the two ends, which give the ordinary, self-evident reason.

    Nest-under uses the same pattern, with the client mirrors of two server rejections the page can see:
    the target must not be ticked, and no ancestor of the target may be ticked (nesting under a link that
    already sits under a ticked link is a cycle). A cycle through an unloaded ancestor is not detectable
    here, so the server rejects it. The depth check uses `MAX_NEST_DEPTH = 3`, an explicit mirror of the
    server's write-side cap. Never be more permissive than the real one.

  - **Reorder must always carry `parentId`**: an id, or an explicit `null` for the roots. Omitting it is
    legal GraphQL, because `reorderSocialMediaLinks.parentId` is nullable with no SDL default, and the
    mutation's resolver refuses it. `ReorderSocialMediaLinksVars.parentId` is `string | null`, and it is
    deliberately not `| undefined`, the same discipline the console documents at its `link.parentId ?? null`.
  - **Structural verbs** are key-set variations on one payload shape. **Group** omits `parentId`, so the
    backend elects the root (the earliest `(occurredAt, id)` of the selection) and hangs the rest off it.
    **Nest** is the same mutation with `parentId` set to the clicked row, which may itself be a sublink.
    Nest is a row action rather than a picker, because a submitter cannot see other people's conversations.
  - **Selection** goes through the shared `insiden/data/link-thread-selection.util.ts` helpers
    (`toggleSelection`, `areAllSelected`, `canGroup`, `selectedWithin`, `threadLabel`). The same module
    backs the admin console's triage table, so the two surfaces cannot drift. The helpers are immutable by
    contract, because the result is written straight back into `selectedIds`. An in-place mutation keeps
    the same array reference, change detection never fires, and the checkbox silently stops updating. The
    selection starts empty and is never seeded from storage or a clock, so server-rendered and hydrated markup agree.
  - **After a mutation,** `_reloadList()` waits out any in-flight infinite-scroll page first, because it
    appends to the current list and a clear underneath it would race a stale append. Then it clears and
    reloads from page 1. `parentId`, `sublinkCount` and `position` are server-computed, and a structural
    mutation returns only `ok`, so a reload is the only way the page learns what it wrote. Group and nest
    **clear** the ticks, since they change which rows are in a conversation. Reorder **keeps** them, since
    it changes no membership.
  - **Errors:** a rejected structural write is an expected outcome, because the ownership, cycle and depth
    gates reject the whole selection as one unit. It belongs in a toast. A `GraphQLRequestError` is already
    toasted and reported to Sentry by `GraphQLClient`. Anything else is rethrown to the Sentry-backed global
    `ErrorHandler` rather than dying quietly in a click handler. The mutation's returned root `id` is unused.
    It is a GraphQL `Int`, unlike every other id in the feature, and this list reloads wholesale.
  - **Auth:** `graphqlResource()` sends no auth header, which would 403 the `mine: true` filter. Reads and
    writes therefore go through `GraphQLClient.request()` with a per-call `firebase-auth-key`. On the server
    `auth.idToken()` resolves `null`, and the read is skipped. `MySpottingsComponent` and
    `UserCardComponent` follow the same pattern.

## 🧩 Extension Points & Hooks

- `PROFILE_ROUTES` is a plain `Routes` array with two lazy `loadComponent` entries. A new sibling route
  (e.g. `/profile/:id/settings`) is an additive `loadComponent` entry and does not touch `ProfilePage`.
- `UserCardComponent` emits `nicknameSaved` and `privacySaved`. That is the established pattern for a
  child that mutates shared data and reports back, rather than each child re-fetching. A new
  editable-field child can follow the same one-way input, single-output shape.
- The stat-card grid is a flat list of guarded `@if` blocks over `UserData` fields. A new card is
  additive: a new block, plus a new `UserData` field (see Potential Feature Opportunities).
- `data/profile.queries.ts` centralizes every document, type and variable for the feature. Extending the
  `user` query touches that file and the `UserData` consumer.
- `MySpottingsComponent`'s notes branch (hover tooltip vs tap sheet, via `_hoverCapable`) is a reusable
  capability-detection pattern. Lift it into a shared directive if another feature needs the same branching.
- **`link-thread-selection.util.ts` is the shared "select rows, then group them" seam.** Insiden uses it,
  so do the admin console and this page, and the shared `app-link-card` reads it for its in-card
  indicator. It answers "may I group this?", "is Select-all checked?" and "does this row show a badge?"
  in one place. A new multi-select list should route its selection through it rather than re-deriving
  those signals. Tree-only questions (depth, sibling runs, reorder and nest block reasons) stay local to
  each surface. They depend on a flat list and a different completeness proof: a filtered table proves
  completeness by "no filters", a paginated one by "no more pages". The opportunity is tracked in
  `docs/COMPONENTS.md` (Cross-Component Feature Opportunities, Non-AI, #4). This module and the console's
  `useBulkActions` are two separate bulk-selection implementations, not one shared one.

## 🌐 Public Profiles & Privacy

- **Backend:** `publicUser(id: ID!)` looks up a profile by Firebase uid. Public stats (nickname, counts,
  heatmap, favourite vehicle, `withMostEntries*`) are always visible. `spottings` (the history list)
  returns `null` for non-owners when `spotting_data_public` is false. The owner always sees their own history.
- **Frontend:** `ProfilePage` uses `GET_PUBLIC_USER_QUERY` for non-owners and the owner query otherwise.
  `MySpottingsComponent` shows a privacy message when `user().spottings === null`. `UserCardComponent`
  hides the edit, privacy and votes controls for non-owners.
- **Privacy control:** a sheet inside `UserCardComponent`, not a separate page. There is no `/profile/:id/settings` route.
- **Contract:** `spotting_data_public` defaults to `false` (strictly opt-in). Always public: nickname,
  counts, heatmap, `withMostEntries*`, favourite vehicles. Opt-in only: the historical spottings list with
  full details. Email is never exposed in any query.

## 💡 Potential Feature Opportunities

- **Bulk-select and delete spottings:** `MySpottingsComponent` gates each row's delete with `_canDelete(event)`,
  but it has no multi-select. A checkbox UI could loop `DELETE_EVENT_MUTATION` over the selected ids,
  keeping the `_canDelete` gate, with no query or type changes. A real batch mutation would be a later
  atomicity and performance follow-up. The selection helpers in `link-thread-selection.util.ts` already exist.
- **Export historical spottings (CSV or JSON):** `_ownEvents` already holds the caller's full history
  client-side, so a download action can serialize it with no backend change. The shared
  `core/export/csv.util.ts` (`toCsv` / `downloadCsv`) covers the CSV side. Not wired here yet.
- **New aggregate stat cards** (e.g. spotting streak, most-visited station): the frontend pattern is
  ready, but the data is not. The metric must be computed server-side and added to the `user` query and
  the `UserData` interface before a matching `@if` card can be wired.
- **Settings sub-page** (e.g. notification or extra privacy preferences): `PROFILE_ROUTES` can take a new
  route without touching `ProfilePage`. Privacy already lives in a sheet on `UserCardComponent`. A real page
  needs a new GraphQL type and a query/mutation pair (modeled on `UPDATE_USER_MUTATION` / `UserInput`)
  before it can hold content beyond a placeholder.

## 💡 Potential AI Feature Opportunities

- **Personalized spotting insights:** the feature aggregates rich per-user time-series data
  (`spottingTrends`, `withMostEntriesMonth/Day`, `favouriteVehicles`) as raw numbers and cards. An LLM
  could turn that into a "your year in spotting" digest or flag anomalies, such as a sudden drop in
  activity or a new favourite line.
- **Smart notes and tagging:** `MyEvent.notes` is free text with no structure. An AI pass could suggest
  tags, extract structured facts (location, condition remarks), or flag notes worth surfacing (e.g.
  defect reports). The data already flows through one typed pipeline (`GetMyEventsData` / `MyEvent`).
- **Nickname moderation assist:** `UserCardComponent.save()` sends the nickname with no client-side
  validation. A lightweight AI or heuristic check could run before the mutation fires, without changing the component contract.
