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

## 🔌 Interface & Data Flow

- **Inputs / Props / Signals:**
  - `ProfilePage.id` — `input.required<string>()`, the route's `:id` param (Firebase uid); no default.
  - `UserCardComponent.user` — `input.required<UserData>()` (see `UserData` in `data/profile.queries.ts`: nickname, spottingsCount, mediaCount, spottingTrends, withMostEntriesMonth/Day, favouriteVehicles).
  - `MySpottingsComponent` — no inputs; it fetches its own data independently.
  - Internal page state (all Angular `signal`/`computed`, no defaults exposed externally): `isAuthReady`, `isOwnProfile` (derived from `auth.user()?.uid === id()`), `_isLoading`, `_user`.
- **Outputs / Events / API Responses:**
  - `UserCardComponent.nicknameSaved` — `output<string>()`, emitted after a successful `UPDATE_USER_MUTATION`; `ProfilePage.onNicknameSaved` merges it into the locally held `UserData` (avoids a full re-fetch).
  - GraphQL operations (all in `data/profile.queries.ts`):
    - `GET_USER_DATA_QUERY` — `user { nickname, spottingsCount, mediaCount, spottingTrends, withMostEntriesMonth, withMostEntriesDay, favouriteVehicles }`, vars `{ typeGroup, freeRange }`. Always resolves to the _caller's own_ user (backend has no by-id lookup — see Known Quirks in `docs/frontend-map/profile.md`).
    - `UPDATE_USER_MUTATION` — `updateUser(input: UserInput!) { nickname }`.
    - `GET_MY_EVENTS_QUERY` — `events(filters: {onlyMine: true}, order: {created: DESC}, pagination: {limit, offset})`, returns `MyEvent[]` (id, spottingDate, notes, created, status, type, runNumber, mediaCount, isMine, vehicle{…}).
    - `DELETE_EVENT_MUTATION` — `deleteEvent(input: DeleteEventInput!) { ok }`; server enforces both ownership and a hard 3‑day window (`DELETE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000`, mirrored client-side purely for UI affordance).
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
- `MySpottingsComponent`: `_eventsSignal` accumulates pages (`loadMore()` appends, offset = current length — simple forward-only cursor, "load more" button rather than infinite scroll). `_groups` is a `computed()` that buckets events by `spottingDate` over the _entire_ accumulated list (not a single linear pass), since ordering is by `created DESC`, so same-`spottingDate` rows aren't guaranteed adjacent. `_hoverCapable` is set once, client-side only, via `afterNextRender` + `matchMedia("(hover: hover) and (pointer: fine)")`, choosing a hover tooltip vs. a tap-triggered `hlm-sheet` modal for notes. `_canDelete(event)` recomputes the real 3-day window client-side (`Date.now() - created <= DELETE_WINDOW_MS`) — deliberately fixed vs. the legacy app's incorrect 10-day constant.
- SSR-safety: nothing in this feature reads `window`/`document` outside `afterNextRender`/browser-gated code (`AuthService`, `RecaptchaService` are themselves platform-guarded).

## 🧩 Extension Points & Hooks

- `PROFILE_ROUTES` is a plain `Routes` array with two lazy `loadComponent` entries — new sibling routes (e.g. `/profile/:id/settings`) can be added here without touching `ProfilePage`.
- `UserCardComponent.nicknameSaved` is the only `@Output()` in the feature — the established pattern for a child mutating shared data and reporting back to the page, rather than each child re-fetching independently; a new "editable field" child component could follow the same one-directional-input / single-output shape.
- The stat-card grid in `UserCardComponent` is a flat, unconditionally-guarded list of `@if` blocks (Total Spottings, Media Uploaded, Best month, Best day, Favourite Train) — adding a new stat card is additive (new `@if` block reading a new `UserData` field) and doesn't require restructuring existing cards.
- `data/profile.queries.ts` centralizes every query/mutation/type for the feature; extending the `user` query (e.g. adding a new aggregate field) only requires touching this one file plus the `UserData` interface consumer.
- `MySpottingsComponent`'s notes affordance (hover tooltip vs. tap modal) is a reusable capability-detection pattern (`_hoverCapable`) that could be lifted into a shared directive/service if other features need the same hover/touch branching.
- The backend has no "fetch another user by id" field yet (`CommonScalars.user` always resolves the caller from the auth token) — `ProfilePage` already has the `isOwnProfile`/non-owner branch wired up as a placeholder, so once that GraphQL field exists, real public profiles are a matter of swapping the query variables/guard, not restructuring the component.

## 💡 Potential AI Feature Opportunities

- **Personalized spotting insights/narrative summaries**: the feature already aggregates rich per-user time-series data (`spottingTrends`, `withMostEntriesMonth/Day`, `favouriteVehicles`) purely as raw numbers/cards — an LLM could turn this into a natural-language "your year in spotting" digest or highlight anomalies (e.g. a sudden drop in activity, a new favourite line).
- **Smart notes/tagging on spotting entries**: `MyEvent.notes` is free-text with no structure today; an AI pass could auto-suggest tags, extract structured facts (location, condition remarks), or flag notes worth surfacing (e.g. defect reports) since the data already flows through a single well-typed pipeline (`GetMyEventsData`/`MyEvent`).
- **Nickname/content moderation assist**: `UPDATE_USER_MUTATION` currently has no client- or server-side validation on the nickname string — a lightweight AI/heuristic moderation check could be slotted into `UserCardComponent.save()` before the mutation fires, with no change to the surrounding component contract.
