# Profile

## Path(s) & Routing

- **URL**: `/profile`
- **Route definition**: `src/app/app-routing.module.ts:201-216`
- **Page `<title>`**: `"MLPTF | Profile"` (set via the Angular Router `title` route property, `app-routing.module.ts:203`)
- **Lazy-loaded entry component**: `ProfileMainComponent`, `loadComponent: () => import("./profile/profile.component").then((m) => m.ProfileMainComponent)` — standalone component, no separate routing module/children.
- **Route guard**: `...canActivate(redirectUnauthorizedToSpotting)` (`app-routing.module.ts:215`), where `redirectUnauthorizedToSpotting()` returns `redirectUnauthorizedTo(["spotting"])` from `@angular/fire/auth-guard` (`app-routing.module.ts:56-58`). Effect: any authenticated Firebase user (no role/custom-claim requirement) may enter; an unauthenticated visitor is redirected to `/spotting`. There is no role gate here (contrast with `/console`'s `hasCustomClaim("admin")` or `/situasi`'s `hasCustomClaim("betaTester")`, both defined a few lines below in the same file).
- **Maintenance-mode switch**: `maintenance.profile.curentlyInMaintenance` (`app-routing.module.ts:39-41`, currently hardcoded `false`). When `true`, the route's `loadComponent` instead resolves `./construction/construction.component`'s `ConstructionComponent` (`app-routing.module.ts:204-213`) — the generic "under construction" placeholder used by every other top-level route in this file. This is a compile-time-toggled boolean in source, not a runtime feature flag/remote config — flipping it requires a code change and redeploy.
- There is only one route under this feature; no child routes, no route params.

## Purpose

The Profile page is the personal dashboard for any signed-in user (Google sign-in via Firebase Auth — see `AuthService`). It shows the user's own identity (avatar/name/email/phone from the Firebase `User` object), lets them set/edit a site-specific **nickname**, shows aggregate personal spotting statistics (total spottings, media uploaded, busiest month/day, favourite train), a historical line chart of the user's own spotting activity over time, and a paginated table of the user's own submitted spotting events with the ability to preview attached photos and delete recent entries. It is purely self-service/personal — there is no admin or other-user view here (that lives in `/console`, guarded by `hasCustomClaim("admin")`). Every authenticated user, regardless of role, lands on the same Profile UI.

**No badges/achievements or notification history here, confirmed by direct check**: the backend `common.User` Django model does have a `badges = ManyToManyField(to="mlptf.Badge", through="mlptf.UserBadge")` relation (`rosak_backend/common/models.py:106-109`), but `mlptf` is not one of the apps composed into the root GraphQL `Query`/`Mutation` (`rosak_backend/rosak/schema.py:8-13`) and `UserScalar` never exposes a `badges` field (`rosak_backend/common/schema/scalars.py:61+`) — so badges are, today, backend-modeled but entirely unreachable via the API and not rendered anywhere in this feature (or, per a repo-wide grep, anywhere in the frontend at all). The `verification-code-card` component that this doc's task brief pointed at as a possible "badges" lead (`src/app/@ui/verification-code-card/**`) is unrelated — it is a Telegram-linking one-time-code widget used only from `src/app/header/login-dropdown/login-dropdown.component.html`, outside `src/app/profile/**`. There is likewise no notification-history or incident-report-history view under Profile — the closest thing, "report history," is the Historical Spottings table (`ProfileSpottingsComponent`) covered below, which only lists the user's own **spotting** events (TranSPOT), not incidents (`/insiden`, a separate top-level feature).

## Component Tree

```
ProfileMainComponent            (profile.component.ts, selector: profile-main)  — page-level container, standalone
 ├─ ProfileUserComponent        (user/user.component.ts, selector: profile-user)
 │    Inputs: user (Firebase User), loading (bool), displayData (UserDataResponseUser | undefined)
 │    Owns: nickname edit form/state, calls UpdateUserService mutation directly.
 ├─ SpottingTrendsComponent     (spotting-trends/spotting-trends.component.ts, selector: profile-spotting-trends)
 │    Input: data (UserSpottingTrends[]) — only rendered once !loading (profile.component.html:5-7)
 ├─ ProfileSpottingsComponent   (spottings/spottings.component.ts, selector: profile-spottings)
      No inputs — runs its own GraphQL query independently of ProfileMainComponent's query.
      Uses shared @ui building blocks (not part of this feature, documented elsewhere):
       ├─ SpottingTypeCellDisplayComponent (src/app/@ui/spotting-type-cell-display/…)
       │    └─ SpottingTypeTagComponent (src/app/@ui/spotting-type-tag/…)
       ├─ VehicleTableCellDisplayComponent (src/app/@ui/vehicle-table-cell-display/…)
       │    └─ VehicleStatusTagComponent (src/app/@ui/vehicle-status-tag/…)
       ├─ VehicleStatusTagComponent (src/app/@ui/vehicle-status-tag/…) — used directly for the Status column too
       └─ ImagePreviewButtonComponent (src/app/@ui/spotting/image-preview-button/…, selector: ui-spotting-image-preview-button)
            opens an NzDrawer hosting SpottingImageListComponent (src/app/@ui/spotting-image-list/…, outside this feature's scope)
```

Communication:

- `ProfileMainComponent` runs the single `GetUserDataService` GraphQL watch query and passes the result down as `[user]`/`[loading]`/`[displayData]` to `ProfileUserComponent`, and `[data]` (just `spottingTrends`) to `SpottingTrendsComponent`. It does **not** pass anything to `ProfileSpottingsComponent` — that component fetches its own data.
- `ProfileUserComponent` and `ProfileSpottingsComponent` each independently inject `AuthService` to obtain the Firebase ID token for authenticated GraphQL calls, and `ToastService` to surface success/error notifications.
- No `@Output()`s anywhere in this feature — all cross-component signaling is one-directional `@Input()` binding from the parent, or independent service calls.
- Services used, all under `src/app/profile/services/`: `GetUserDataService`, `GetEventsService`, `DeleteEventService`, `UpdateUserService` — each a thin `apollo-angular` `Query`/`Mutation` subclass with a hardcoded `gql` document (no dynamic query building).

## Functionality & Behavior

### ProfileMainComponent (`profile.component.ts`)

- On construction, reads the current Firebase user synchronously off `authService.userData.value` (`profile.component.ts:41`) — this assumes `userData` is already populated by the time this component is constructed (true here because the route itself is already gated on being logged in).
- `ngOnInit` awaits `authService.getIdToken()`, then calls `getUserDataGql.watch({ typeGroup: true, freeRange: true }, { context: { headers: { "firebase-auth-key": authKey } }, fetchPolicy: "network-only" })` (`profile.component.ts:44-66`). `fetchPolicy: "network-only"` means this always hits the network and bypasses Apollo's `InMemoryCache` (there is no cache normalization configured for these types anyway — see `src/app/graphql.module.ts`).
- `loading` starts `true`; both `loading` and `data` are driven off `valueChanges.subscribe(({data, loading}) => …)`. While `data` is `undefined` (before first emission), the child `ProfileUserComponent`'s `nz-spin` shows a full-card loading spinner (`user.component.html:1`, `[nzSpinning]="displayData === undefined"`).
- `SpottingTrendsComponent` is only instantiated once `!loading` (`profile.component.html:5-7`) — i.e., it is created fresh on every load-completion, which matters because its `ngOnInit` renders a brand-new G2Plot chart into a `#container` div every time (see below); there is no update-in-place path if `data` later changes, since the component's `data` array is `@Input()` but the constructor-time query has already finished.
- `ngOnDestroy` unsubscribes the query subscription.

### ProfileUserComponent (`user/user.component.ts` + `.html`)

- **Header card**: shows `user.photoURL` as a 150px `nz-avatar` (only if truthy), `user.displayName`, and a subtitle line: `user.email` only if `user.emailVerified` is true, plus `user.phoneNumber` in parentheses if present (`user.component.html:6-19`). Note: for Google Sign-In, `emailVerified` is effectively always true, and Google accounts normally carry no phone number in the Firebase profile, so the phone number line rarely if ever renders in practice.
- **Nickname stat card** (only rendered once `displayData` is truthy, i.e., after the parent query resolves):
  - Read mode: shows `nickname` value or the literal string `"N/A"` if empty (`user.component.html:88`); a suffix icon toggles between `edit` (if a nickname already exists) and `plus` (if not), with tooltip text "Edit Nickname"/"Add Nickname" (`user.component.html:96-107`).
  - Edit mode (`nicknameChangeButtonClicked = true`): a text `<input>` two-way-bound via `[(ngModel)]="nickname"`, placeholder `"Enter your desired nickname"`, with an inline "Save" button (check icon) and "Cancel" button (close icon) (`user.component.html:36-90`).
  - `toggleNicknameButtonClick()` just flips the boolean flag — Cancel does **not** revert an in-progress edit back to the last-saved value in local state until `ngOnChanges` next fires from a fresh `displayData` (there is no explicit rollback of `nickname` on cancel — `user.component.ts:81-83`). In practice this only matters if the user typed something, clicked Cancel, then reopened edit mode without a parent re-render; the input would still show what they typed.
  - `onNicknameSave()` (`user.component.ts:85-123`): sets `isNicknameSaveLoading = true` (wraps just this card in its own `nz-spin`), calls `UpdateUserService.mutate({ data: { nickname } }, { context: { headers: { "firebase-auth-key": await authService.getIdToken() } } })`, `.pipe(take(1))`. On GraphQL `errors`, logs to console and shows a `ToastService.addToast("Save failed", errors.join(" "), "error")` toast, leaving edit mode open. On success, sets local `nickname` from the mutation response and calls `toggleNicknameButtonClick()` to close edit mode (no explicit success toast). On a thrown/network error (`.catch`), shows `ToastService.addToast("Save failed", err.message, "error")`. `isNicknameSaveLoading` is reset to `false` in `.finally()` regardless of outcome.
  - **No client-side validation** on the nickname field at all — no max length, no character whitelist, no empty-string guard (an empty save is allowed and results in a blank nickname, displayed as "N/A" per the read-mode fallback). Any validation is left entirely to whatever the backend enforces (see Data & API Contracts — backend enforces none either beyond the `str` type).
- **Stat cards** (only rendered once `displayData` is truthy, except the two "most entries" cards which render unconditionally with `?.` optional chaining even while `displayData` is `undefined`, since those two are outside the `@if (displayData)` block — `user.component.html:149-177`):
  - "Total Spottings" — `displayData.spottingsCount`, number-formatted (`| number`).
  - "Media Uploaded" — `displayData.mediaCount`, number-formatted.
  - "Month with most entries (<dateKey>)" — `displayData.withMostEntriesMonth.count`, title interpolates the `dateKey` (e.g. `"2026-07"`) directly into the card title string.
  - "Day with most entries (<dateKey>)" — same shape, `withMostEntriesDay`.
  - "Favourite Train (<count> spottings)" — **only inside the `@if (displayData)` block**: reads `displayData.favouriteVehicles[0]` directly with no length/empty check (`user.component.html:179-200`, `getFavouriteTrainDisplayLineString()` in `user.component.ts:73-79` joins `vehicle.lines[].code` with `", "`). See Known Quirks — this throws if the user has zero spottings (empty `favouriteVehicles` array).
  - A commented-out "Year with most entries" card exists in the template (`user.component.html:134-147`) and a commented-out `withMostEntriesYear` field in the query document (`get-user-data.service.ts:32,68-74`) — dead/disabled feature, not wired up.
- Grid layout: `nz-col` spans are `[nzXs]="12" [nzMd]="8" [nzXl]="6"` for every stat card, i.e. 2 columns on mobile, 3 on tablet, 4 on desktop.

### SpottingTrendsComponent (`spotting-trends/spotting-trends.component.ts` + `.html`)

- Renders a single `<div id="container"></div>` and, in `ngOnInit`, builds an AntV G2Plot `Line` chart directly against the DOM element by id `"container"` (`spotting-trends.component.ts:57-134`) — this is an imperative, non-Angular-reactive chart render; if two instances of this component ever existed on the same page the `id="container"` selector would collide (not currently a problem since only one is rendered).
- Before charting, maps `eventType` on every data point through `SpottingTypePipe` (`DEPOT`→"Depot", `LOCATION`→"Location", `BETWEEN_STATIONS`→"Between Stations", `JUST_SPOTTING`→"Just Spotting", `AT_STATION`→"At Station") so the chart legend shows human labels rather than raw enum values (`spotting-trends.component.ts:46-55`).
- Chart config: x-axis `dateKey`, y-axis `count`, series split by (humanized) `eventType`, SVG renderer, smoothed line, 1s path-in appear animation, a bottom/right "slider" (zoom/brush) whose height and legend position (`"right"` if `document.body.clientWidth > 1024` else `"top"`) are responsive — recalculated on every `window:resize` via `@HostListener` (`spotting-trends.component.ts:26-44`). Chart theme colors are hardcoded to CSS vars from the removed `ng-devui` design system (`--devui-text`, `--devui-form-control-bg`, `--devui-float-block-shadow`) — see Known Quirks.
- Rendered via `ngZone.runOutsideAngular(...)` so chart interactions/animations don't trigger Angular change detection (`spotting-trends.component.ts:57`).
- No loading/empty state of its own — the parent only mounts this component once its own query is done loading, and passes `data ? data.spottingTrends : []` (`profile.component.html:6`), so an empty array renders an empty/blank chart rather than any "no data" message.

### ProfileSpottingsComponent (`spottings/spottings.component.ts` + `.html`)

This is an infinite-scroll table of the current user's own spotting events ("Historical Spottings").

- **Query & pagination**: `ngOnInit` awaits `authService.getIdToken()` then calls `getEventsGql.watch({ eventFilters: { onlyMine: true }, eventOrder: { created: "DESC" }, eventPagination: { limit: 30, offset: 0 } }, { context: { headers: { "firebase-auth-key": … } }, fetchPolicy: "network-only" })` (`spottings.component.ts:174-197`). `limit = 30` is a hardcoded page size (`spottings.component.ts:91`).
- After each page loads, `offset` is reset to `this.displayData.length` (`spottings.component.ts:212`, `251`), i.e. offset always tracks total rows loaded so far — a simple "load next 30" cursor, not true offset-based re-fetch-from-zero.
- **Infinite scroll**: `ngAfterViewInit` finds the ng-zorro-rendered `.ant-table-body` scroll container inside the `#tableWrapper` template ref and attaches a native `scroll` listener (`spottings.component.ts:217-223`). The handler (`onScroll`, `spottings.component.ts:77-85`) calls `loadMore()` once scrollTop + clientHeight is within `LOAD_MORE_THRESHOLD_PX = 50` px of the bottom, and only if not already `loading`. `loadMore()` (`spottings.component.ts:229-253`) calls `watchQueryOption.fetchMore({ variables: { eventPagination: { limit, offset } } })` and **concatenates** the new page onto `displayData` (does not replace it) and merges `expandConfig`.
- Table columns (`dataTableOptions.columns`, `spottings.component.ts:106-150`), in order: Event ID, Created, Status, Date (`spottingDate`), Spotting Type, Vehicle, Notes. Explicit pixel widths per column (`tableWidthConfig`, `spottings.component.ts:154-162`) resolved via `widthFor(field)`; table has `nzScroll: { x: "1450px", y: "50vh" }` and `nzTableLayout="fixed"` (`spottings.component.html:2-9`), i.e. horizontally scrollable with a fixed 50vh-tall vertically-scrolling body — that inner scrollable body is exactly the element the infinite-scroll listener is attached to.
- **Column rendering** (`spottings.component.html`, `@switch (colOption.fieldType)`):
  - `status` → `<vehicle-status-tag>` colored tag; if `runNumber` present, also shows a 🏃‍♂️ emoji + run number with a "Run Number" tooltip.
  - `id` → a link to the Django admin change page for that event, `{{backendUrl}}admin/spotting/event/{{id}}` opened in a new tab, plus (conditionally) a delete icon.
  - `created` → date formatted `"MMM dd, y"` then `"HH:mm:ss"` on the next line (Angular `date` pipe, local browser timezone).
  - `vehicle` → `<vehicle-table-cell-display>` (identification number + type + line codes + status tag + optional 📝 notes tooltip, itself linking to the vehicle's Django admin page).
  - `spottingType` → `<spotting-type-cell-display>` (colored type tag + location text/map link or origin→destination station names, plus a location details tooltip with accuracy/altitude/heading/speed when present).
  - `notes` → shows an `<ui-spotting-image-preview-button>` (photo count / add-photo button opening an `NzDrawer` image gallery) when `mediaCount > 0` or `isMine` is true, followed by the raw notes text.
  - default → raw field value interpolated as-is.
- **Delete flow** (`deleteEvent(eventId)`, `spottings.component.ts:291-340`):
  - The delete icon (🗑) only appears per-row when `rowItem.canDelete` is true. `canDelete` is computed client-side in `mapGqlResultsToDisplayData` (`spottings.component.ts:255-281`): `now - created <= 864e6` ms. **864e6 ms = 864,000,000 ms = 10 days**, not the "3 days" the adjacent code comment claims (`spottings.component.ts:272`: `// If entry created more than 3 days you cannot delete it`) — see Known Quirks, this mismatches the backend's actual 3-day rule.
  - Clicking delete opens an `nz-popconfirm` ("Are you sure?", placed bottom) before firing.
  - On confirm: sets `loading = true`; in parallel obtains a v3 reCAPTCHA token via `recaptchaV3Service.execute("deleteSpottingEntry")` and a fresh Firebase ID token; then calls `deleteEventGql.mutate({ deleteEventInput: { id: eventId } }, { context: { headers: { "g-recaptcha-response": captchaResponse, "firebase-auth-key": firebaseAuthKey } } })`.
  - On response: if `data.deleteEvent.ok` is true, removes the row from local `displayData` by filtering it out (no re-fetch) and shows a success toast `"Deletion of spotting event #<id> successful."`; if `ok` is false, shows an error toast `"Unknown error on deletion. Please refresh the page and try again."`. Either way `loading` is set back to `false`. There is no `.catch()` on this promise chain — a network-level failure (vs. a GraphQL-level `ok: false`) would surface as an unhandled promise rejection rather than a toast, and `loading` would stay stuck `true` (`spottings.component.ts:294-339`, no `.catch`).
- `onPictureIconClick(eventId)` toggles `expandConfig[eventId]` but nothing in the current template reads `expandConfig` to actually expand a row — this looks like a leftover hook from an earlier expandable-row design (see Known Quirks).
- `tableRows` getter and the "doesn't declare every field" comment (`spottings.component.ts:97-103`) is a deliberate typing workaround: the strongly-typed `ConsoleEventsGqlResponseTableDataElement` doesn't include `runNumber`/`canDelete`/`mediaCount`/`isMine` as far as the compiler is concerned inside the template, so rows are exposed as `any[]` to the table template.
- `ngOnDestroy` unsubscribes the query and removes the scroll listener.
- No dedicated "empty" state UI — an empty `displayData` just renders an empty `<tbody>` inside the `nz-table` (ng-zorro's own default "No Data" placeholder, if any, would apply, but nothing in this feature customizes it).

## Data & API Contracts

All requests are unauthenticated-by-default GraphQL calls that manually attach a `firebase-auth-key` HTTP header carrying the current Firebase ID token (`authService.getIdToken()`); there is no global Apollo `HttpLink`/interceptor doing this — every call site in this feature does it itself. Apollo client itself (`src/app/graphql.module.ts`) is a bare `HttpLink` + `InMemoryCache` pointed at `environment.backendGraphqlUrl`, with no custom cache-key/type-policy configuration — consistent with this feature always using `fetchPolicy: "network-only"`.

Backend context resolution: `rosak/context.py`'s `CustomGraphQLView.get_context` builds `context.user` via `FirebaseUser(request).get_current_user()` (`common/utils.py:23-40`), which reads the `Firebase-Auth-Key` header, calls Firebase Admin's `auth.verify_id_token`, then `User.objects.get_or_create(firebase_id=uid)` — i.e. **the backend `User` row is auto-provisioned on first authenticated GraphQL call**, there is no separate "sign up"/"create profile" step. `nickname` defaults to `""` (`common/models.py:104`).

### Query: `GetUserDataService` (`profile/services/get-user-data.service.ts:46-100`)

- Variables: `$dateGroup: DateGroupings` (unused by this feature — always omitted, so backend defaults to `DateGroupings.DAY`), `$typeGroup: Boolean` (sent `true`), `$freeRange: Boolean` (sent `true`).
- Fields requested on `user`: `nickname`, `spottingsCount`, `mediaCount`, `spottingTrends(dateGroup, typeGroup, freeRange) { dateKey year month day eventType count }`, `withMostEntriesMonth: withMostEntries(type: MONTH) { dateKey year month day count }`, `withMostEntriesDay: withMostEntries(type: DAY) { … }`, `favouriteVehicles { vehicle { identificationNo lines { code } } count }`. A `withMostEntriesYear: withMostEntries(type: YEAR)` block is present but commented out (`get-user-data.service.ts:68-74`).
- Backend root field: `CommonScalars.user` (`common/schema/schema.py:27-34`) — `@strawberry.field(permission_classes=[IsLoggedIn])`, resolves `await User.objects.aget(id=info.context.user.id)`. **Server-side note**: if `info.context.user` is falsy this resolver does `return None` for a non-Optional return type (`common/schema/schema.py:29-30`) — a latent server bug, though unreachable in practice because `IsLoggedIn` already blocks unauthenticated calls first.
- All the sub-fields are resolved on `UserScalar` (`common/schema/scalars.py:61-186`):
  - `spottings_count` → `Event.objects.filter(reporter_id=self.id).acount()` (count of the user's own spotting events, all-time).
  - `media_count` → `Media.objects.filter(uploader_id=self.id).acount()`.
  - `spotting_trends(start, end, date_group=DAY, type_group=False, free_range=False)` → calls `get_trends()` (`common/utils.py:147+`) grouping `Event` rows by `spotting_date` filtered to `reporter_id=self.id`. Because the frontend passes `free_range: true`, the resolver's `start`/`end` date-window filters are stripped entirely (`common/schema/scalars.py:152-169`, `common/utils.py:199-201`) — **this chart shows the user's entire spotting history, not a rolling window**. `type_group: true` additionally buckets by `type` (one of the `SpottingEventType` enum values: `DEPOT`, `LOCATION`, `BETWEEN_STATIONS`, `JUST_SPOTTING`, `AT_STATION`), which is what lets the frontend split the trend line into per-spotting-type series. `add_zero=True` is passed, meaning zero-count days are filled in rather than omitted (exact zero-fill behavior is inside `get_trends`, not fully traced here).
  - `with_most_entries(type)` (`common/schema/scalars.py:96-113`) → groups the user's own events by year (and month/day depending on `type`) and returns the single bucket with the highest count (`ORDER BY -count LIMIT 1` via `.order_by("-count")[0]`, line 109). **This raises an `IndexError` if the user has zero spotting events at all** (`.order_by("-count")[0]` on an empty queryset) — a brand-new user with no spottings would get a GraphQL resolver error on this field, not a null (see Known Quirks).
  - `favourite_vehicles(count=1)` → groups the user's own events by `vehicle`, orders by count desc, returns the top `count` (frontend never sends a custom `count`, so it's always exactly 1 vehicle, if any exist) — an empty list, not an error, if the user has zero spottings (contrast with `with_most_entries` above).
- No pagination/args used by the frontend beyond what's already covered above; no explicit `dateGroup` sent (defaults server-side to `DAY`, which is moot given `freeRange: true`).

### Mutation: `UpdateUserService` (`profile/services/update-user.service.ts`)

- `mutation ($data: UserInput!) { updateUser(input: $data) { nickname } }`.
- `UserInput` (`common/schema/inputs.py:14-15`) has exactly one field: `nickname: str` — **required, non-optional, no length/format constraint at the type level**.
- Backend resolver: `CommonMutations.update_user` (`common/schema/schema.py:85-91`) — `@strawberry.mutation(permission_classes=[IsLoggedIn])`; simply sets `user.nickname = input.nickname` on `info.context.user` and `await user.asave()`. **No server-side validation** (no length cap enforced at the GraphQL layer beyond the DB column's `max_length=255`, `common/models.py:104`; no uniqueness constraint; no profanity/format filter) — any string, including empty string, is accepted and persisted.

### Query: `GetEventsService` (`profile/services/get-events.service.ts`)

- `query ($eventFilters: EventFilter, $eventPagination: OffsetPaginationInput, $eventOrder: EventOrder) { events(filters: …, pagination: …, order: …) { id spottingDate notes created status type runNumber mediaCount isMine location { accuracy altitudeAccuracy heading speed location altitude } originStation { id displayName } destinationStation { id displayName } vehicle { id status identificationNo vehicleType { internalName } lines { code } } } }`.
- Backend root field: `SpottingScalars.events` (`spotting/schema/schema.py:25-27`), a `strawberry_django.field` with `filters=EventFilter, pagination=True, order=EventOrder` (i.e. generic strawberry-django filter/order/pagination, no custom resolver function — field-level permission enforcement happens through the filter itself, not a `permission_classes` gate on `events` as a whole).
- `eventFilters: { onlyMine: true }` → `EventFilter.only_mine` (`spotting/schema/filters.py:59-66`): if `info.context.user` is falsy, forces `queryset.none()` (i.e. an unauthenticated caller gets zero rows rather than an error); otherwise filters to `Q(reporter_id=info.context.user.id)`. This is the sole mechanism restricting the table to "my" events — there is no separate ownership check elsewhere.
- `eventOrder: { created: "DESC" }` → `EventOrder.created` (`spotting/schema/orderings.py`), a plain `strawberry.auto` ordering field.
- `eventPagination: { limit, offset }` → strawberry-django's standard `OffsetPaginationInput`.
- Per-row fields resolved on `EventScalar` (`spotting/schema/scalars.py:29-79`): `location`, `media_count`, `is_mine` are all resolved via async dataloaders/queries per event (`info.context.loaders["spotting"][…]`), i.e. N+1-safe via `DjangoOptimizerExtension`/dataloader batching but each is still a logically separate lookup keyed off the event id. `is_mine` compares `self.reporter.id == info.context.user.id` (false, not an error, if unauthenticated). `wheel_status`/`run_number`/`origin_station`/`destination_station` are plain nullable model fields.

### Mutation: `DeleteEventService` (`profile/services/delete-event.service.ts`)

- `mutation ($deleteEventInput: DeleteEventInput!) { deleteEvent(input: $deleteEventInput) { ok } }`, `DeleteEventInput` carries just `id`.
- Backend resolver: `SpottingMutations.delete_event` (`spotting/schema/schema.py:43-58`) — `permission_classes=[IsLoggedIn, IsRecaptchaChallengePassed]`.
  - `IsRecaptchaChallengePassed` (`rosak/permissions.py:11-33`) requires a `G-Recaptcha-Response` header, verifies it server-side against Google's `siteverify` endpoint using `settings.RECAPTCHA_KEY`, and requires `response["score"] >= settings.RECAPTCHA_MIN_SCORE`. If the header is missing or the score is too low, the whole mutation is denied (GraphQL permission error), which the frontend's `.then(({data}) => …)` chain does not explicitly branch on separately from a `data?.deleteEvent.ok === false` case — see Known Quirks.
  - The actual delete query is `models.Event.objects.filter(reporter_id=user_id, id=input.id, created__gte=now() - timedelta(days=3))` (`spotting/schema/schema.py:49-54`) — **the real ownership + 3-day-window enforcement happens here, server-side**, independent of whatever the frontend's `canDelete` flag decided. If the filtered queryset is empty (wrong owner, wrong id, or older than 3 days), the mutation returns `{ ok: false }` rather than raising an error.

### Firebase SDK usage

- `@angular/fire/auth`: reads the already-authenticated `User` object (`displayName`, `email`, `emailVerified`, `phoneNumber`, `photoURL`) directly off `AuthService.userData` (a `BehaviorSubject<User|null|undefined>` populated elsewhere, in the app shell — not fetched or refreshed by this feature itself) and calls `getIdToken()` per outgoing GraphQL request to mint a fresh bearer token. No Firestore/Storage/Analytics calls originate from inside `src/app/profile/**` itself (Firestore is used by `AuthService` for the `users/{uid}` permission doc, which is shared app-wide plumbing, not part of this feature).
- No `localStorage`/`sessionStorage`/`IndexedDB` reads/writes anywhere in this feature's files.
- No REST calls — everything here is GraphQL.

## State Management

- **No feature-local shared service/store** — each component holds its own component-scoped state (`loading`, `displayData`, `offset`, `expandConfig`, etc.) as plain class fields, populated from `apollo-angular` `Query`/`Mutation` classes that are `providedIn: "root"` (so technically singleton services, but each is used from exactly one place and each `.watch()` call creates its own independent `QueryRef`, so there's no cross-component cache sharing in practice).
- `ProfileMainComponent`'s query and `ProfileSpottingsComponent`'s query are two entirely separate GraphQL requests, fired independently in each component's own `ngOnInit`, both `fetchPolicy: "network-only"` — every time `/profile` is navigated to, both queries re-run from scratch (no persisted state across navigations away and back).
- Cross-feature state depended on but owned elsewhere: `AuthService.userData` (current Firebase `User`), `AuthService.getIdToken()` (fresh ID token per call), `ToastService` (global notification/message service). None of these are refreshed or invalidated by this feature; they're read-only dependencies here.
- `ProfileSpottingsComponent`'s pagination cursor (`offset`) is purely in-memory/component-lifetime state — reset to 0 on component construction, grows monotonically as pages load, lost entirely on navigating away.

## Permissions, Roles & Flags

- **Route-level**: `redirectUnauthorizedTo(["spotting"])` — the only gate. Any signed-in Firebase user (no custom claim required) reaches `/profile`; no user reaches `/profile` unauthenticated (redirected to `/spotting` instead).
- **No role-based UI branching inside this feature** — no `*ngIf` on `authService.isAdmin()` or similar anywhere in `src/app/profile/**`. Every signed-in user sees the identical Profile page, including the "Total Spottings"/nickname/etc. cards.
- **Backend enforcement** mirrors this: `IsLoggedIn` gates `user`, `updateUser`, and `deleteEvent`; there's no admin-only field or mutation touched by this feature. Ownership scoping (`onlyMine`, `reporter_id=user_id` in `delete_event`) is enforced server-side regardless of what the frontend requests, so a malicious client cannot read or delete another user's events even by tampering with the frontend.
- **Captcha gate**: `deleteEvent` additionally requires a passing Google reCAPTCHA v3 challenge (`IsRecaptchaChallengePassed`), configured via `environment.captcha.key` (site key, wired app-wide in `src/app/app.module.ts:89`) and `settings.RECAPTCHA_KEY`/`settings.RECAPTCHA_MIN_SCORE` server-side (values not inspected here — out of this feature's file scope).
- **Maintenance flag**: `maintenance.profile.curentlyInMaintenance` in `app-routing.module.ts` — a hardcoded boolean, not tied to any user role; when flipped it swaps in `ConstructionComponent` for literally everyone, admins included.

## Known Quirks / Tech Debt

- **Delete-window mismatch (client vs. server), likely bug**: `spottings.component.ts:272-277` computes `canDelete` using `now - created <= 864e6` ms. `864e6` ms = 864,000,000 ms = **10 days**, but the adjacent comment says `"If entry created more than 3 days you cannot delete it"`, and the backend (`spotting/schema/schema.py:53`) really does enforce **3 days** (`created__gte=now() - timedelta(days=3)`). Net effect: the delete icon is shown (and clickable) for events 3–10 days old, but the mutation will silently return `{ ok: false }` for anything past 3 days, surfacing the generic `"Unknown error on deletion. Please refresh the page and try again."` toast — a confusing false affordance. If the intent really was 3 days, the constant should be `259200000` (or `3 * 86400000`).
- **`favouriteVehicles[0]` accessed with no emptiness guard**: `user.component.html:184-198` renders `displayData.favouriteVehicles[0]…` whenever `displayData` is truthy, with no check that the array is non-empty. Backend confirms `favourite_vehicles` can legitimately return `[]` for a user with zero spottings (`common/schema/scalars.py:74-94`). A brand-new user visiting their own Profile page for the first time would hit a template-evaluation error on this binding (`Cannot read properties of undefined (reading 'vehicle')` or similar) instead of a graceful "no favourite train yet" state.
- **`with_most_entries` throws for zero-spotting users, server-side**: `common/schema/scalars.py:106-112`, `.order_by("-count")[0]` on an empty queryset raises `IndexError` inside the resolver. Combined with the point above, a fresh user with no spottings likely can't load the Profile page's stat cards cleanly at all — this needs verification (see Open Questions) but is a strong candidate for the single biggest functional gap for new users.
- **`CommonScalars.user` returns `None` for a non-Optional type when unauthenticated** (`common/schema/schema.py:29-30`) — dead code path today because `IsLoggedIn` already blocks the call first, but a latent inconsistency (Strawberry would raise on serializing `None` into a non-Optional `UserScalar` field if this branch were ever reached).
- **Commented-out "Year with most entries" feature**: query field (`get-user-data.service.ts:32,68-74`) and template block (`user.component.html:134-147`) both present but disabled — looks like a deliberately shelved feature (perhaps considered redundant next to Month/Day) rather than a bug; safe to drop entirely in a rewrite unless product wants it revived.
- **`onPictureIconClick(eventId)`** (`spottings.component.ts:342-344`) toggles `expandConfig[eventId]` but nothing in the current `spottings.component.html` reads `expandConfig` — likely a leftover hook from a previous expandable-row UI (image previews now use a drawer instead, via `ImagePreviewButtonComponent`). `expandConfig` itself is still computed and merged on every page load (`mapGqlResultsToExpandConfig`, `spottings.component.ts:283-289`) for no visible effect — dead code, safe to drop.
- **No `.catch()` on the `deleteEvent` mutation promise chain** (`spottings.component.ts:294-339`): a network failure (as opposed to a GraphQL-level `ok: false`) or a permission denial from `IsRecaptchaChallengePassed` would reject the promise chain with no `.catch`, leaving `loading = true` stuck and showing no user-facing toast at all — inconsistent with `onNicknameSave()` in the same feature, which does have a `.catch` for exactly this scenario.
- **G2Plot chart theme hardcodes removed-library CSS variables**: `spotting-trends.component.ts:70,79,87,95-112` reference `var(--devui-text, #252b3a)`, `var(--devui-form-control-bg, #ffffff)`, `var(--devui-float-block-shadow, rgba(94,124,224,0.3))` — leftovers from the `ng-devui` design system that was removed per the repo's recent history (see `git log`: "refactor: replace ng-devui with ng-zorro-antd (Stage 0 of Angular 19/20 upgrade)"). The fallback hex/rgba values are being used today (since the CSS custom properties themselves are presumably no longer defined anywhere), so the chart currently renders in fixed light-mode-ish colors regardless of theme; this is a real theming gap in a rewrite that should tie chart colors into whatever the new Tailwind-based theme system uses. `user.component.scss:1` (`@import "styles/devui-vars.scss"`) similarly still depends on this removed-ish variables file, and `.user-card-subtitle`/`.nickname-button` color rules (`user.component.scss:13-19`) reference `$devui-text-weak`.
- **Two independent test-setup bugs that likely make specs fail to compile** (both components are `standalone: true`, but their specs configure them the old NgModule way):
  - `profile.component.spec.ts:11` — `TestBed.configureTestingModule({ declarations: [ProfileMainComponent] })`; should be `imports: [ProfileMainComponent]`.
  - `spotting-trends.component.spec.ts:11` — same pattern, `declarations: [SpottingTrendsComponent]` instead of `imports: […]`.
    These two are inconsistent with `user.component.spec.ts` and `spottings.component.spec.ts`, which correctly use `imports: […]` — the repo's recent commit "test: fix pre-existing TestBed setup bugs on components touched by ng-zorro migration" apparently didn't cover these two files (or they weren't touched by that migration pass).
- **`ConsoleEventsGqlResponseTableDataElement` typing gap acknowledged in-code**: `spottings.component.ts:97-103` explicitly documents (and works around, via an `any[]` getter) that the shared type used for row data doesn't declare `runNumber`, `canDelete`, or `mediaCount` even though the template reads them — a rewrite should give this feature its own properly-typed row interface rather than reusing/coercing the Console feature's type.
- **Hardcoded page size** (`limit = 30`, `spottings.component.ts:91`) and **`LOAD_MORE_THRESHOLD_PX = 50`** (`spottings.component.ts:51`) are magic numbers with no user-facing control (no page-size selector, no "load more" button as a fallback to the scroll-triggered load).
- **Direct links to Django admin pages** are embedded in the UI itself: `spottings.component.html:48-56` (event admin link) and `vehicle-table-cell-display.component.html` (vehicle admin link) both build `{{backendUrl}}admin/...` URLs directly into the template. These only resolve/work for staff users with Django admin access — for a regular authenticated user these links exist in the DOM but 302 to the Django admin login. Not gated by any `*ngIf` on admin role.

## Open Questions / Verify Against Live Site

- **New-user / zero-spottings experience**: static analysis strongly suggests visiting `/profile` for the first time (no spottings yet) either throws/500s on the `withMostEntries` GraphQL field (backend `IndexError` on an empty queryset, `common/schema/scalars.py:111`) and/or breaks the "Favourite Train" card client-side (`favouriteVehicles[0]` on an empty array). Needs to be verified on a genuinely fresh account — it's possible Apollo's partial-data handling or some behavior not visible in these files (e.g. GraphQL error masking, a global error interceptor) softens this in practice.
- **Exact rendered copy/labels**: card titles ("Nickname", "Total Spottings", "Media Uploaded", "Month/Day with most entries (…)", "Favourite Train (… spottings)"), toast copy, and tooltip text were all read directly from template string literals, so these should be accurate, but final on-screen wording could still be affected by any global text pipes/interceptors not present in this feature's own files — worth a quick visual confirm.
- **Responsive chart/legend behavior**: `SpottingTrendsComponent`'s `getLegendPosition()`/`getSliderHeight()` switch at a `document.body.clientWidth > 1024` breakpoint, and `ImagePreviewButtonComponent`'s drawer width switches at 500/1024/1300px — these are plain JS breakpoints (not CSS media queries), so they should behave as coded, but actual visual density/overlap on real devices wasn't (and can't be, per the stated limitation on WebFetch against a client-rendered SPA) verified here.
- **ng-zorro "no data" placeholder**: whether `<nz-table>` shows any specific empty-state message/graphic out of the box when `displayData` is `[]` (e.g. brand-new user, no events yet) depends on ng-zorro's default template, which wasn't traced into node_modules — worth confirming visually.
- **`get_trends()` zero-fill / bucketing details**: the exact shape of zero-filled buckets, iso-week handling, etc. inside `common/utils.py`'s `get_trends()` was read only partially (enough to confirm `free_range: true` disables the date window and `type_group: true` splits by event type); full week/day-of-week/is-last-day-of-month annotation logic wasn't traced end-to-end since the frontend here doesn't consume those extra fields (`UserSpottingTrends` interface only reads `dateKey`, `year`, `month`, `day`, `eventType`, `count`).
- **Whether the "3 days" comment or the "10 days" (`864e6`) constant reflects the _intended_ product behavior** cannot be determined from code alone — flagged as a mismatch, but which side is "correct" (and thus what the rewrite should implement) is a product decision, not something inferable from the source.

## Rewrite Notes (2026) — `/profile/:id` and the Public-Profile Backend Gap

The `web/` rewrite moved this feature from a bare `/profile` to `/profile/:id`, keyed by Firebase uid:
bare `/profile` now only ever redirects (`core/auth/redirect-to-own-profile.guard.ts`) — to
`/profile/<your-own-uid>` if signed in, to `/spotting` otherwise. `/profile/:id` itself carries
**no route guard** — anyone can open any id.

That last part matters because of a real, confirmed backend gap: **there is no GraphQL field,
anywhere in the schema, that fetches a user's data by id.** `CommonScalars.user`
(`common/schema/schema.py`) takes no `id`/`uid` argument at all — it unconditionally resolves
`info.context.user` (the caller, from the request's `Firebase-Auth-Key` header). No other field
on the schema accepts a user id either: nested `reporter`/`uploader` fields on `Event`/`Media`
return a `UserScalar` but only for objects you already have, and `EventFilter` has no
`reporter`/`uploaderId` filter (`only_mine` is the only user-scoping filter, and it's hardcoded to
the caller, not parameterizable). There's a dead giveaway that this was once planned: a fully
commented-out `UserFilter(firebase_id: str)` sits unused in `common/schema/filters.py`, alongside
an equally dead `MediaFilter`.

Given that, `ProfilePage` deliberately does **not** call `GET_USER_DATA_QUERY` for any id except
the signed-in caller's own — calling it for someone else's id would just re-fetch and display
_your own_ data mislabeled as theirs (since the query ignores the id and resolves from auth
context regardless of what's in the URL), which is a worse outcome than showing nothing. So today,
visiting `/profile/<not-your-id>` shows an explicit "Public profiles aren't available yet" message
instead of any user data. This also happens to make the "hide historical spottings and email from
other users" requirement trivially true — there's currently no code path that shows _any_ other
user's data, historical-spottings or otherwise. Email specifically was never a backend field to
begin with: it (and avatar) come entirely from the client-side Firebase Auth SDK's own
currently-signed-in-user object (`AuthService.user()`), which structurally can't return anyone
else's account details in the browser (that needs the Admin SDK, server-side only) — so email/
avatar for other users isn't just gated, it's not obtainable client-side at all regardless of any
GraphQL change.

**Backend change needed to make real public profiles possible** (matching the schema's own
existing idioms):

- A root query field that fetches a `UserScalar` by id — e.g. a sibling to `CommonScalars.user`,
  such as `userByFirebaseId(firebase_id: str) -> Optional[UserScalar]`, resolving
  `User.objects.aget(firebase_id=firebase_id)` instead of `info.context.user.id`. Every field on
  `UserScalar` except `firebase_id` itself (`IsAdmin`-gated) already has no `permission_classes` —
  so once this field exists, nickname/stats/favourite-vehicle/spotting-trends/history would all be
  fetchable for any user with no further schema changes, _if_ that's the intended visibility.
  `short_id` (the truncated, already-intended-to-be-public identifier) is a natural key to expose
  this by instead of the full `firebase_id`.
- If "historical spottings" should ever be visible for other users (a product decision, not made
  here — this rewrite pass keeps them owner-only per the request), the simplest path is
  `UserScalar.spottings` off the new by-id field, which already exists and is already ungated —
  no `EventFilter` change needed. A root-level `events(filters: {reporterId: ...})` would need a
  new filter field on `EventFilter`, mirroring the dead `MediaFilter.uploader_id` stub.
- There's no reusable "is this the caller" permission class anywhere in `rosak/permissions.py`
  (only `IsLoggedIn`/`IsAdmin`/`IsRecaptchaChallengePassed` exist) — every existing ownership check
  (`only_mine`, `delete_event`, `is_mine`) compares `info.context.user.id` against a fixed column,
  never against a second, caller-supplied target id. If any field on the new by-id lookup should
  ever behave differently for "viewing yourself" vs. "viewing someone else," that comparison would
  need to be written fresh.
