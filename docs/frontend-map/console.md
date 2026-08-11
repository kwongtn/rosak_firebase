# Console

## Path(s) & Routing

- **URL**: `/console`
- **Route definition**: `src/app/app-routing.module.ts:186-200`
- **Page `<title>`**: `"MLPTF | Console"` (Angular Router `title` route property, `app-routing.module.ts:187`)
- **Lazy-loaded entry component**: `ConsoleMainComponent`, `loadComponent: () => import("./console/console.component").then((m) => m.ConsoleMainComponent)` (`app-routing.module.ts:194-196`) — standalone component, no child routes, no route params.
- **Route guard**: `...canActivate(adminOnly)` (`app-routing.module.ts:199`), where `adminOnly()` returns `hasCustomClaim("admin")` from `@angular/fire/auth-guard` (`app-routing.module.ts:60-62`). This is the strictest gate in the app — every other guarded route (`redirectUnauthorizedToSpotting`, `betaTesterOnly`) is comparatively looser. See **Permissions, Roles & Flags** below for an important nuance in exactly what `hasCustomClaim` checks.
- **Maintenance-mode switch**: `maintenance.console.curentlyInMaintenance` (`app-routing.module.ts:42-44`, hardcoded `false` today). When `true`, `loadComponent` instead resolves `ConstructionComponent` from `./construction/construction.component` (`app-routing.module.ts:189-192`) — the same generic "under construction" placeholder used by every other top-level route. It is a compile-time boolean in source, not a remote/runtime feature flag.
- **No visible nav link by default**: there is no `routerLink`/`href` to `/console` anywhere in any `.html` template. The only in-app entry point is a dynamically injected top-nav menu item, added/removed in `app.component.ts:141-155` based on `authService.customClaims` (`claim?.["admin"]`): `{ name: "Console", href: "/console", target: "_self", tag: "Admin", style: "danger", headerTitle: " - Spotting Console " }`. This nav-menu visibility check and the route guard both ultimately read the same Firebase custom claim, just through two different code paths (see Permissions section).
- **Second, independent gate**: `/console` is the _only_ entry in `src/app/services/auth-permissions.ts`'s `explicitlyAllowedPaths` (`auth-permissions.ts:11`). This is a reactive kick-out check wired into `AuthService`, not a route guard — see **Permissions, Roles & Flags** for the full mechanics and how it relates to (and differs from) the `hasCustomClaim("admin")` guard.

## Purpose

Console is the admin-only moderation/triage queue for **spotting events** — the crowd-sourced train/vehicle-spotting reports users submit via the public "TranSPOT" feature (`/spotting`). It gives an admin a site-wide, filterable, infinite-scrolling table of every submitted event (not just their own, unlike `/profile`'s personal history table), lets them mark events as "read"/triaged, jump straight to the Django admin change pages for the underlying Event/User/Vehicle records, and preview photos attached to a report. It is the operational "back office" counterpart to the public spotting feed — used exclusively by whoever holds the `admin` Firebase custom claim; there is no other role (`betaTester`, plain authenticated user) with any access here.

## Component Tree

```
ConsoleMainComponent            (console.component.ts, selector: app-console-main) — page shell, standalone
 └─ ConsoleEventsTableComponent (events-table/events-table.component.ts, selector: console-events-table)
      Owns all filter state, the GraphQL query, and all row-level interaction. No inputs/outputs — it is
      self-contained and reads no router params.
      Uses shared @ui building blocks (not part of this feature, documented elsewhere):
       ├─ VehicleStatusTagComponent (src/app/@ui/vehicle-status-tag/…) — Status column color tag
       ├─ VehicleTableCellDisplayComponent (src/app/@ui/vehicle-table-cell-display/…) — Vehicle column
       │    └─ VehicleStatusTagComponent (nested again, for the vehicle's own status)
       ├─ SpottingTypeCellDisplayComponent (src/app/@ui/spotting-type-cell-display/…) — Spotting Type column
       │    └─ SpottingTypeTagModule (src/app/@ui/spotting-type-tag/…)
       └─ ImagePreviewButtonComponent (src/app/@ui/spotting/image-preview-button/…, selector: ui-spotting-image-preview-button)
            opens an NzDrawer hosting SpottingImageListComponent (src/app/@ui/spotting-image-list/…, outside this feature's scope)
```

- `console.component.html` is a two-line template: `<h1>Spotting Events</h1>` + `<console-events-table></console-events-table>` (`console.component.html:1-2`). `ConsoleMainComponent`'s `.ts` (`console.component.ts:15-23`) is otherwise empty — no logic, no state, purely a page wrapper.
- Services (`src/app/console/services/`), both injected directly into `ConsoleEventsTableComponent`'s constructor (`events-table.component.ts:231-236`):
  - `ConsoleEventsGqlService` (`services/events-gql.service.ts`) — `providedIn: "root"`, an `apollo-angular` `Query<...>` subclass with a hardcoded `gql` document (the "events" list query).
  - `MarkReadService` (`services/mark-read.service.ts`) — `providedIn: "any"`, wraps the `markAsRead` mutation.
  - `AuthService` (`src/app/services/auth.service.ts`, app-wide plumbing) — used only for `getIdToken()` here.
- `events-table/category-search.ts` is not a component/service — it's a static data file exporting `statusOptions`/`spottingTypeOptions` arrays consumed by the Status/Spotting Type multi-selects (`category-search.ts:1-19`).
- Communication: strictly parent→child by template composition (`ConsoleMainComponent` → `ConsoleEventsTableComponent`); no `@Input()`/`@Output()` anywhere in this feature's own components, since there's only one real component doing work.

## Functionality & Behavior

### Filter bar (`events-table.component.html:2-129`)

All controls are bound to `filterForm` (`events-table.component.ts:149-159`), a plain object, via `[(ngModel)]` inside an `nz-form nzLayout="inline"`:

- **Status** — `nz-select nzMode="multiple"`, options from `statusOptions` (`category-search.ts:6-11`): In Service / Not in Service / Decommissioned / Testing. Empty array = no filter ("Any").
- **Spotting Type** — same pattern, options from `spottingTypeOptions` (`category-search.ts:13-18`): Depot / Location / Between Stations / Just Spotting / At Station (all 5 real `SpottingEventType` values are represented here, unlike Status — see Known Quirks).
- **Created Time** — `nz-range-picker [nzShowTime]="true"`, binds `filterForm.createdTimeRange: [Date, Date] | null`.
- **Spotted Date** — `nz-range-picker` (no time), binds `filterForm.spottedDateRange: [Date, Date] | null`.
- **Vehicle Status Different**, **Is Anonymous**, **Is Read**, **Has Notes** — four identical three-way `nz-radio-group`s with options `Any` (`[nzValue]="undefined"`), `Yes` (`true`), `No` (`false`). `isRead` defaults to `false` (i.e. "No" is pre-selected); the other three default to `undefined` ("Any").
- **Free search** — a plain `nz-input` text box, bound to `filterForm.freeSearch`.
- **Search button** — `(click)="onSearch()"`.

`onSearch()` (`events-table.component.ts:404-430`): resets `limit`/`offset` back to `SEARCH_LIMIT`/`SEARCH_OFFSET` (100/0), rebuilds `this.filters` from the form via `filterFormToGqlFilters()` (see Data & API Contracts for the exact key mapping, including a confirmed bug), then calls `watchQueryOption.fetchMore(...)` and **replaces** `displayData` entirely with the new page (does not append). Also leaves a `console.log(this.filters)` debug statement in place (`events-table.component.ts:411`).

### Initial load / default view

`ngOnInit` (`events-table.component.ts:239-274`) starts the query with `this.filters = { isRead: false }` — **not** derived from `filterFormToGqlFilters()`. Practically this matches the form's own default (`isRead: false`, everything else empty/undefined), so the very first page an admin sees on opening Console is _only events not yet marked read by that specific admin_, ordered `created: DESC`, `limit: 100, offset: 0`. Because per-admin "read" state is tracked server-side per reader (see Data & API Contracts), two different admins land on two different sets of rows by default.

### Infinite scroll (`events-table.component.ts:276-282`, `109-117`, `342-368`)

`ngAfterViewInit` locates the ng-zorro-rendered `.ant-table-body` element inside the `#tableWrapper` template ref and attaches a native `scroll` listener. The handler fires `loadMore()` once scroll position is within `LOAD_MORE_THRESHOLD_PX = 50` px of the bottom, guarded by `!this.showLoading` so it can't stack concurrent requests. `loadMore()` calls `fetchMore` with the _current_ `this.filters`/`limit`/`offset` (deliberately omitting `eventOrder`, which Apollo simply keeps from the original `.watch()` call), **concatenates** the new page onto `displayData` (does not replace), and sets `offset = displayData.length` afterward — a simple "load next 100" cursor based on rows-loaded-so-far, not a true server cursor. `showLoading` (bound to an `nz-spin` wrapping the whole panel, including the filter bar) is set `true` for the duration.

### Mark-as-read toggle & action (`events-table.component.html:131-152`, `.ts:295-340`)

- An `nz-switch` labelled via tooltip "Toggle mark as read" flips `showCheckbox`, which reveals a checkbox column on the left of the table and (only while `showCheckbox` is true) a "Mark as Read" button below the switch.
- Clicking a row's checkbox calls `onRowCheckChange(checked, rowIndex, rowItem)` (`events-table.component.ts:321-336`): sets `rowItem.$checked`, and if `isShiftKeyDown` is true (tracked via global `document:keydown.shift`/`document:keyup.shift` `@HostListener`s, `events-table.component.ts:311-319`), extends the check state to every row between `lastSelectedRow` and the just-clicked row index (inclusive), i.e. shift-click range-select. `lastSelectedRow` starts `undefined`; see Known Quirks for the resulting no-op edge case on a first-ever shift-click.
- "Mark as Read" (`markAsRead()`, `events-table.component.ts:295-309`): sets `showLoading = true`, collects the `id`s of every row with `$checked === true`, calls `MarkReadService.markAsRead(ids)`. On `data?.markAsRead.ok`, those rows are removed from `displayData` client-side (filtered out, no refetch) — the table visibly shrinks, but the "Total data" footer count is **not** updated (see Known Quirks — `eventsCount` is a global count anyway, unaffected either way).
- There is no "select all" checkbox actually rendered — the header cell for the checkbox column is empty (`events-table.component.html:164-166`, just `<th [nzWidth]="'50px'"></th>`) even though `allChecked`/`halfChecked` fields exist on the component (see Known Quirks — dead code).

### Table columns (`dataTableOptions.columns`, `events-table.component.ts:165-216`, rendering in `events-table.component.html:154-335`)

In order, with fixed pixel widths (`tableWidthConfig`, `events-table.component.ts:218-227`) and `nzTableLayout="fixed"` / `nzScroll: { x: scrollX, y: '60vh' }` (horizontal width computed by summing all visible column widths plus 50px if the checkbox column is showing, `scrollX` getter `events-table.component.ts:288-293`):

1. **Event ID** (`id`, 100px) — link to `{{backendUrl}}admin/spotting/event/{{id}}` (Django admin), opens in a new tab.
2. **Reporter** (`reporter`, 100px) — link to `{{backendUrl}}admin/common/user/?q={{shortId}}`, label is `nickname` if non-empty else `shortId`, with the `shortId` shown italicized underneath when a nickname exists; renders `--` when `reporter` is `null` (always the case for anonymous events — see Data & API Contracts).
3. **Created** (`created`, 150px) — two lines via Angular `date` pipe: `MMM dd, y` then `HH:mm:ss`.
4. **Status** (`status`, 150px) — `<vehicle-status-tag>` colored tag for the _event's_ recorded status, plus a conditional 🏃 run-number line and a conditional 🛞 wheel-status line (`wheelStatus.replace("_", " ") | titlecase` — see Known Quirks for the single-underscore caveat).
5. **Date** (`spottingDate`, 150px) — raw field value, no date pipe applied (renders whatever string/ISO-date format the API returns, unformatted).
6. **Spotting Type** (`type`, 150px) — `<spotting-type-cell-display>`: colored type tag, plus either a Google Maps link + coordinates (with an info-icon popover showing accuracy/altitude/heading/speed, speed converted m/s→km/h ×3.6) when `location` is present, or an origin→destination station name (for `BETWEEN_STATIONS`/`AT_STATION` types) when it isn't.
7. **Vehicle** (`vehicle`, 250px) — `<vehicle-table-cell-display>`: identification number + vehicle type + line codes, a 📝 tooltip icon if the vehicle has notes, and the vehicle's own status tag; the identification number links to `{{backendUrl}}admin/operation/vehicle/{{id}}`.
8. **Notes** (`notes`, 500px) — `<ui-spotting-image-preview-button>` (photo-count button opening an `NzDrawer` gallery) shown only when `mediaCount > 0` or `isMine` is true, followed by the raw notes text.

### Loading / empty / footer states

- `nz-spin [nzSpinning]="showLoading"` wraps the entire panel (filter bar + toggle + table); `showLoading` is toggled on every query lifecycle event (initial load, search, load-more, mark-as-read) and driven by the query's own `loading` flag on the initial `valueChanges` subscription.
- No custom "empty results" UI — an empty `displayData` renders `<nz-table>` with zero body rows and whatever ng-zorro's own default placeholder is (not customized here, not verified visually — see Open Questions).
- Footer: `"Total data (excluding filters): {{ totalCount | number }}"` — `totalCount` comes straight from `data.eventsCount`, which (per the backend resolver, see Data & API Contracts) is **always the global count of every `Event` row in the database**, regardless of any filters/pagination in the same request. The "(excluding filters)" wording is accurate but easy to misread as "the filtered subtotal" — it never changes based on the Status/Date/etc. filters.

## Data & API Contracts

All GraphQL calls in this feature attach a `firebase-auth-key` header carrying `authService.getIdToken()` manually per call (no global Apollo interceptor does this — same pattern as every other feature in this app). Apollo Client itself (`src/app/graphql.module.ts:10-15`) is a bare `HttpLink` + `InMemoryCache` with no custom type policies and no `defaultOptions`, so any `.watch()` call that doesn't explicitly set `fetchPolicy` uses Apollo's own default, `cache-first` — see Known Quirks for why this matters here specifically (contrast with Profile, which forces `network-only`).

Backend context resolution is the same for every feature: `rosak/context.py`'s `CustomGraphQLView.get_context` (`rosak/context.py:22-31`) builds `context.user` from the `firebase-auth-key` header via `FirebaseUser(request).get_current_user()`, auto-provisioning a Django `User` row on first authenticated call. `DjangoOptimizerExtension` (`rosak/schema.py:38-39`) is applied globally, so nested fields like `vehicle`, `originStation`, `destinationStation` are resolved N+1-safely; `reporter`, `location`, `mediaCount` are resolved through per-request async `DataLoader`s defined in `spotting/schema/loaders.py:63-73`.

All field names, types, and nullability below were confirmed against the **actual exported GraphQL SDL** (`strawberry.Schema.as_str()` run against `rosak.schema.schema`), not just inferred from the Python source — this is the strongest ground truth available short of hitting a live server.

### Query: `ConsoleEventsGqlService` (`console/services/events-gql.service.ts:82-139`)

Anonymous (unnamed) query, variables `$eventFilters: EventFilter`, `$eventPagination: OffsetPaginationInput`, `$eventOrder: EventOrder`; requests `eventsCount` and `events(filters:, pagination:, order:) { id spottingDate notes created status type runNumber mediaCount isMine wheelStatus location{...} originStation{id displayName} destinationStation{id displayName} vehicle{id status identificationNo vehicleType{internalName} lines{code}} reporter{shortId nickname} }`.

- Backend root fields, confirmed SDL: `events(filters: EventFilter, order: EventOrder, pagination: OffsetPaginationInput): [EventScalar!]!` and `eventsCount: Int!` ("Number of events") — both declared on `SpottingScalars` (`spotting/schema/schema.py:23-31`), **with no `permission_classes` on either field**. `eventsCount`'s resolver (`spotting/schema/resolvers.py:4-5`) is simply `await Event.objects.acount()` — unfiltered, ignoring whatever `filters`/`pagination` were passed alongside it in the same query (confirming the footer label above).
- **This query is not admin-restricted at the GraphQL layer at all.** It is the exact same `events`/`eventsCount` root fields used by the public spotting feed (`src/app/spotting/services/get-spotting-history.service.ts`) and by a regular user's own history on `/profile` (`src/app/profile/services/get-events.service.ts`, which additionally passes `onlyMine: true`). Anyone who can reach the GraphQL endpoint — admin claim or not, even unauthenticated — can run this same query directly. "Admin-only" for the _read_ side of Console is enforced purely by the Angular route guard, not by the backend.
- `EventScalar` fields actually touched here, per confirmed SDL (`type EventScalar { id: ID! created: Date! spottingDate: Date! vehicle: Vehicle! notes: String! status: SpottingVehicleStatus! type: SpottingEventType! wheelStatus: SpottingWheelStatus runNumber: String originStation: Station destinationStation: Station reporter: UserScalar isRead: Boolean! location: LocationEvent mediaCount: Int! medias: [MediaScalar!]! isMine: Boolean! }`):
  - `reporter` resolves via `batch_load_reporter_from_event` (`spotting/schema/loaders.py:9-19`), which filters `is_anonymous=False` — **an anonymous event's `reporter` is always `null`, for every caller, including admins.** There is no way to deanonymize a reporter through this API; the "Reporter" column's `--` fallback is the _only_ thing an admin sees for anonymous reports here.
  - `is_mine` compares `self.reporter.id == info.context.user.id` (`spotting/schema/scalars.py:72-79`) — this is w.r.t. the _currently logged-in admin_, so it's `true` only for events the admin themself submitted (relevant to the Notes column's photo-preview-button visibility rule).
  - `status`/`type`/`wheelStatus` are the `SpottingVehicleStatus`/`SpottingEventType`/`SpottingWheelStatus` enums — confirmed full value sets: `SpottingVehicleStatus = IN_SERVICE | NOT_IN_SERVICE | DECOMMISSIONED | TESTING | NOT_SPOTTED | MARRIED | UNKNOWN`; `SpottingEventType = DEPOT | LOCATION | BETWEEN_STATIONS | JUST_SPOTTING | AT_STATION`; `SpottingWheelStatus = FRESH | NEAR_PERFECT | FLAT | WORN_OUT | WORRYING` (`spotting/enums.py`, cross-checked against the live SDL's `enum` blocks).

### `EventFilter` shape (confirmed live SDL) and a confirmed frontend/backend mismatch

```graphql
input EventFilter {
  id: ID
  type: StrBaseFilterLookup       # { exact, isNull, inList: [String!] }
  created: DatetimeDatetimeFilterLookup   # exact/gt/gte/lt/lte/inList/range{start,end} — DateTime-typed
  spotted: DatetimeDateFilterLookup       # same shape as above — also DateTime-typed (see note)
  notes: StrFilterLookup          # exact/isNull/inList + contains/startsWith/endsWith/regex (+case-insensitive)
  status: StrFilterLookup
  isAnonymous: Boolean
  vehicle: VehicleFilter
  AND, OR, NOT: EventFilter
  DISTINCT: Boolean
  hasNotes: Boolean
  differentStatusThanVehicle: Boolean
  isRead: Boolean
  onlyMine: Boolean
  freeSearch: String
}
```

`filterFormToGqlFilters()` (`events-table.component.ts:432-476`) maps the filter form onto this shape:

| Form field                    | Frontend sends                                          | Real `EventFilter` field                                     | Match?                                                     |
| ----------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| `status` (multi-select)       | `statusIn: [...]` (`events-table.component.ts:436-437`) | `status: { inList: [...] }`                                  | **No — `statusIn` is not a field on `EventFilter` at all** |
| `spottingType` (multi-select) | `typeIn: [...]` (`:439-440`)                            | `type: { inList: [...] }`                                    | **No — same problem**                                      |
| `createdTimeRange`            | `created: { range: { start, end } }` (`:442-448`)       | `created: { range: { start, end } }` (`DatetimeRangeLookup`) | Yes                                                        |
| `spottedDateRange`            | `spotted: { range: { start, end } }` (`:450-456`)       | `spotted: { range: { start, end } }`                         | Yes                                                        |
| `isVehicleStatusDifferent`    | `differentStatusThanVehicle: bool` (`:458-461`)         | `differentStatusThanVehicle: Boolean`                        | Yes                                                        |
| `isAnonymous`                 | `isAnonymous: bool` (`:462-464`)                        | `isAnonymous: Boolean`                                       | Yes                                                        |
| `isRead`                      | `isRead: bool` (`:465-467`)                             | `isRead: Boolean`                                            | Yes                                                        |
| `hasNotes`                    | `hasNotes: bool` (`:468-470`)                           | `hasNotes: Boolean`                                          | Yes                                                        |
| `freeSearch`                  | `freeSearch: string` (`:471-473`)                       | `freeSearch: String`                                         | Yes                                                        |

**Confirmed bug**: `EventFilter` has no `statusIn`/`typeIn` fields — the real fields are nested lookup objects (`status: { inList: [...] }`, `type: { inList: [...] }}`, confirmed against the live-exported SDL, not just the Python source). GraphQL input coercion rejects unknown fields on an input object, so clicking **Search** with any Status or Spotting Type option selected sends an invalid `EventFilter` and the _entire_ query fails (no partial results, no silent ignore of just that filter) — every other filter on the same Search click would be dropped too, since the whole request errors. This is very likely a live, user-visible bug today, not merely a naming inconsistency. Everything else in the table above is confirmed correct.

Custom filter resolvers backing the flat boolean/string fields (`spotting/schema/filters.py:19-76`):

- `is_read` (`:41-57`) — if `info.context.user` is falsy, returns `queryset.none()`; otherwise checks `EventRead` rows scoped to `reader_id=info.context.user.id`. **Read/unread state is per-admin**, not global — see `EventRead` model below.
- `different_status_than_vehicle` (`:35-39`) — `Q(vehicle__status=F("status"))` (or its negation) — flags events where the reporter's recorded status disagrees with the vehicle's own current/official status.
- `has_notes` (`:31-33`) — `~Q(notes="")` / `Q(notes="")`.
- `only_mine` (`:59-66`) — not used by Console's own UI (Console never sends it), but is the exact mechanism `/profile` uses to scope to the logged-in user's own events; included here for context since it's the same `EventFilter` type.
- `free_search` (`:68-76`) — `icontains` across `notes`, `originStation.displayName`, `destinationStation.displayName`, `vehicle.identificationNo`, `vehicle.nickname`.

### Mutation: `MarkReadService` (`console/services/mark-read.service.ts:8-54`)

`mutation ($input: MarkEventAsReadInput!) { markAsRead(input: $input) { ok } }`, called with headers `firebase-auth-key` (fresh ID token) and `g-recaptcha-response` (from `ReCaptchaV3Service.execute("markAsRead")`, `ng-recaptcha-2`).

- Backend: `markAsRead(input: MarkEventAsReadInput!): GenericMutationReturn!` at the `Mutation` root (confirmed SDL), resolver `SpottingMutations.mark_as_read` (`spotting/schema/schema.py:179-196`), input `MarkEventAsReadInput { eventIds: [ID!]! }` (`spotting/schema/inputs.py:26-28`), return `GenericMutationReturn { ok: Boolean! }` (`common/schema/scalars.py:197-198`).
- **This is the one place Console is actually backend-gated as admin-only**: `permission_classes=[IsLoggedIn, IsRecaptchaChallengePassed, IsAdmin]` (`spotting/schema/schema.py:180-181`).
  - `IsAdmin` (`rosak/permissions.py:43-52`) makes a **live** call to `firebase_admin.auth.get_user(info.context.user.firebase_id)` on every invocation and checks `custom_claims.get("admin", False)` — a real value check against Firebase Admin SDK, re-fetched per request (not reading whatever claims happen to be baked into the caller's current ID token). This is stricter/fresher than the frontend route guard (see Permissions section).
  - `IsRecaptchaChallengePassed` (`rosak/permissions.py:11-33`) requires a `G-Recaptcha-Response` header and a passing score (`settings.RECAPTCHA_MIN_SCORE = 0.85`, `rosak/settings.py:354`) from Google's `siteverify` endpoint.
- Resolver body: `EventRead.objects.abulk_create([EventRead(event_id=id, reader_id=current_user.id) for id in input.event_ids], ignore_conflicts=True)`, then unconditionally `return GenericMutationReturn(ok=True)`. `ignore_conflicts=True` means re-marking an already-read event is a silent no-op (the `EventRead` model has a `UniqueConstraint` on `(reader_id, event_id)`, `spotting/models.py:166-172`); there is also no existence check on the `event_id`s themselves, and the mutation always reports `ok: true` regardless (it cannot fail from the frontend's perspective except via a permission denial or network error, since there's no `ok: false` branch in the resolver at all).

### `EventRead` model (`spotting/models.py:156-172`)

Per-`(reader, event)` row, unique-constrained. This is what makes "read" state personal to each admin rather than a single global flag on the `Event` row — an event marked read by Admin A still shows up as unread for Admin B's default `isRead: false` view.

### Firebase SDK / browser storage

- Only Firebase SDK touch point inside `src/app/console/**` itself is `AuthService.getIdToken()` (mints a fresh ID token per outgoing GraphQL call, `events-table.component.ts:254-255`, `mark-read.service.ts:47`). The "Console" nav-menu-visibility check (`authService.customClaims`) lives in `app.component.ts`, outside this feature's own files.
- No Firestore/Storage/Analytics calls originate from inside `src/app/console/**`.
- No `localStorage`/`sessionStorage`/`IndexedDB` reads or writes anywhere in this feature.
- No REST calls — everything is GraphQL, plus the plain `<a href>` Django-admin deep links noted in Functionality (those are outside the GraphQL API entirely and only work for someone who _also_ has a valid Django-admin staff session on the backend host — a separate, unrelated auth system not checked or gated by this Angular app in any way).

## State Management

- No feature-local shared store/service. `ConsoleEventsTableComponent` holds everything (`filters`, `filterForm`, `displayData`, `totalCount`, `limit`/`offset`, `showCheckbox`, `expandConfig`, selection state) as plain component instance fields, created fresh on every navigation to `/console` and discarded on navigate-away (`ngOnDestroy` just unsubscribes the query, `events-table.component.ts:378-380`).
- `ConsoleEventsGqlService` is `providedIn: "root"` but only ever instantiates one `QueryRef` per mounted component (via `.watch()`); there's no cross-instance cache/state sharing in practice since only one instance of this component is ever mounted at a time. `MarkReadService` is `providedIn: "any"` instead — an inconsistent DI scope choice for two services used together, though functionally moot since both are stateless per-call wrappers (see Known Quirks).
- Read-only dependency on `AuthService.getIdToken()` — owned/lifecycled entirely outside this feature.
- The initial `.watch()` call (`events-table.component.ts:240-259`) does not set `fetchPolicy`, so it defaults to Apollo Client's `cache-first` — different from every explicit-`network-only` query documented in `profile.md`. `fetchMore` calls (Search, Load More) always hit the network regardless.

## Permissions, Roles & Flags

Getting into `/console` and staying there involves **three independent mechanisms**, two of which read the same underlying Firebase custom claim through different code paths, and one of which is a completely separate Firestore-backed check:

1. **Route guard — `hasCustomClaim("admin")`** (`app-routing.module.ts:60-62, 199`). Confirmed from the `@angular/fire` library source (`node_modules/@angular/fire/fesm2022/angular-fire-auth-guard.mjs:47-52`): `hasCustomClaim(claim)` maps the user's decoded ID-token claims through **`claims.hasOwnProperty(claim)`** — i.e. it checks whether the claim _key_ exists on the token, **not whether its value is truthy**. If a Firebase custom claim were ever set to `{ admin: false }` (key present, value falsy — e.g. an "explicit revoke" instead of deleting the claim outright), this guard would still evaluate `true` and let that user into `/console`. Neither repo contains any code that sets custom claims this way today, so this is a latent risk rather than an observed bug, but it's worth knowing before any rewrite reimplements this guard.
2. **Nav-menu visibility** (`app.component.ts:141-155`) — separately shows/hides the "Console" link based on the _same_ Firebase custom claim, via `authService.customClaims` (a `BehaviorSubject` populated from `user.getIdTokenResult()`, `auth.service.ts:60-69`), checking `claim?.["admin"]` — this one **is** a truthy check (correct semantics), it just doesn't gate the route itself, only whether the link is rendered. A user could still type `/console` into the address bar directly regardless of nav-link visibility; the route guard is what actually matters for access.
3. **`auth-permissions.ts`'s `isUserAllowed` / `explicitlyAllowedPaths: ["/console"]`** (`auth-permissions.ts:9-12`) — this is a **second, entirely separate** admin signal, sourced from a **Firestore** document at `users/{uid}` and its `permissions.admin` boolean field (`UserAuthData` interface, `auth.service.ts:21-25`), not the Firebase Auth custom claim at all. It's wired reactively into `AuthService`'s constructor (`auth.service.ts:71-99`): every time the Firestore `users/{uid}` doc emits via `onSnapshot`, or the user signs out, `isUserAllowed(userAuthDoc, this.router.url)` is re-checked; if it returns `false`, the app force-navigates to `/` (`this.router.navigate([""])`, which itself redirects to `/spotting` per `app-routing.module.ts:217-221`). Because `/console` is the _only_ path in `explicitlyAllowedPaths`, `isUserAllowed` is a no-op (`true`) for every other route (`auth-permissions.ts:27-28`) — this mechanism exists solely to police `/console`.

**How they relate**: (1) and (2) both read the Firebase Auth custom claim; (3) reads an unrelated Firestore document field. **Neither this frontend repo nor the backend repo contains any code that writes to either data source** — no `set_custom_user_claims` call, no Firestore write to `permissions.admin` — both must be provisioned entirely out-of-band (Firebase console, an external script, or tooling not present in either repo). There is therefore no code-level guarantee the two stay in sync; an account could plausibly hold the Firebase custom claim but not the Firestore flag, or vice versa, purely as an operational/manual-process risk. Practically:

- The route guard (Firebase claim) is what decides whether navigation to `/console` succeeds _at all_.
- The Firestore-backed check (3) is purely reactive/after-the-fact — it can only _evict_ someone already past the guard (e.g., if their Firestore doc changes while they're sitting on the page), and only takes effect whenever the `onSnapshot` listener next fires; there's no guarantee it runs before the guard lets a request through in the first place.
- **Backend-side, only the `markAsRead` mutation is actually admin-gated** (`IsAdmin`, live Firebase Admin SDK check on the _value_ of the `admin` claim — correct semantics, unlike the frontend guard). The read side (`events`/`eventsCount`) has no backend permission check whatsoever (see Data & API Contracts) — so in the current implementation, "admin-only" for viewing the Console table is almost entirely a **frontend-enforced convention**, with a real, value-correct backend guarantee only for the one mutating action available on this page.
- No `*ngIf`-based role branching exists inside `src/app/console/**` itself — the entire page assumes (via the route guard) that only admins ever render it; there's no secondary "read-only mode" or partial view for anyone else.

## Known Quirks / Tech Debt

- **Confirmed bug — broken Status/Spotting Type search filters**: `filterFormToGqlFilters()` (`events-table.component.ts:436-441`) sends flat `statusIn`/`typeIn` keys that do not exist on the real `EventFilter` GraphQL input (confirmed via live schema export — the real shape is nested `status: { inList: [...] }` / `type: { inList: [...] }`). Clicking Search with a Status or Spotting Type filter selected sends an invalid input object; GraphQL input coercion should reject the whole request. See Data & API Contracts for the full comparison table.
- **`hasCustomClaim` checks key existence, not value** (`node_modules/@angular/fire/fesm2022/angular-fire-auth-guard.mjs:50-52`) — see Permissions section; latent risk if an `admin: false` claim (rather than a deleted claim) is ever set.
- **Two independent, never-synced "admin" signals** (Firebase custom claim vs. Firestore `users/{uid}.permissions.admin`), with no writer for either anywhere in either repo — see Permissions section.
- **Dead code — "select all" checkbox**: `allChecked`/`halfChecked` fields (`events-table.component.ts:126-127`) are declared but never read or written anywhere else in the component or template; the checkbox column's header cell is empty (`events-table.component.html:164-166`) — no select-all UI actually exists despite the scaffolding for one.
- **Dead code — expand config**: `expandConfig` is computed on every initial load and every `loadMore()` (`mapGqlResultsToExpandConfig`, `events-table.component.ts:370-376`, called at `:269` and merged at `:359-362`), but nothing in `events-table.component.html` reads `expandConfig` — no expandable-row UI exists in the current template. Likely a leftover from a previous (pre-ng-zorro-migration) expandable-row table design; the exact same dead-code pattern is flagged in `profile.md` for `ProfileSpottingsComponent`.
- **Debug leftover**: `console.log(this.filters)` in `onSearch()` (`events-table.component.ts:411`).
- **"Total data" footer never reflects Mark-as-Read**: after successfully marking rows read, they're removed from `displayData` locally but `totalCount` (`eventsCount`) is not re-fetched/decremented — though since `eventsCount` is a global unfiltered count anyway (see Data & API Contracts), it was never going to reflect a "remaining under my filter" number in the first place; the label is accurate but easy to misread.
- **Shift-click range-select no-op on first use**: `lastSelectedRow` starts `undefined` (`events-table.component.ts:146`); `Math.min(undefined, rowIndex)`/`Math.max(...)` evaluate to `NaN`, so the range-select guard (`index >= firstOfList && index <= lastOfList`) is always false the very first time a row is shift-clicked in a session — silently selects nothing beyond the clicked row itself, not a crash.
- **Status filter dropdown is incomplete relative to the real enum**: `statusOptions` (`category-search.ts:6-11`) exposes only 4 of the 7 real `SpottingVehicleStatus` values (`IN_SERVICE, NOT_IN_SERVICE, DECOMMISSIONED, TESTING`); `NOT_SPOTTED`, `MARRIED`, `UNKNOWN` (confirmed real enum members) have no filter option, even though (bug above notwithstanding) the underlying field could carry any of the 7. Whether Event rows realistically ever carry the missing 3 is unverified (see Open Questions).
- **`vehicle-status-tag` color-coding gaps and a leftover removed-library CSS variable** (shared component, `src/app/@ui/vehicle-status-tag/vehicle-status-tag.component.html`): its `@switch` has cases for `IN_SERVICE`, `NOT_SPOTTED`, `TESTING`, `UNKNOWN`, `OUT_OF_SERVICE` — note `OUT_OF_SERVICE` is **not** a real value of the spotting `SpottingVehicleStatus` enum (the real value is `NOT_IN_SERVICE`); `NOT_IN_SERVICE`, `DECOMMISSIONED`, and `MARRIED` all fall through to `@default`, whose color is `'var(--devui-text-weak)'` — a CSS custom property from the removed `ng-devui` design system (see repo history: "refactor: replace ng-devui with ng-zorro-antd (Stage 0 of Angular 19/20 upgrade)"), very likely undefined now. This component is shared with Profile's vehicle display, so it's not Console-specific, but it directly affects the Status column here.
- **`wheelStatus.replace("_", " ")`** (`events-table.component.html:216-218`) uses a plain string argument, so only the _first_ underscore is replaced. Harmless today since every real `SpottingWheelStatus` value has at most one underscore, but would silently under-format any future two-underscore value.
- **Test-setup bug**: `console.component.spec.ts:11` uses `declarations: [ConsoleMainComponent]`, but `ConsoleMainComponent` is `standalone: true` (`console.component.ts:12`) — the same class of pre-existing bug the repo's recent commit ("test: fix pre-existing TestBed setup bugs on components touched by ng-zorro migration") fixed elsewhere, but apparently missed here; this spec likely fails to compile. `events-table.component.spec.ts` correctly uses `imports: [...]`.
- **Typing gap acknowledged in-code**: `TableSourceType extends ConsoleEventsGqlResponseTableDataElement` doesn't declare `runNumber`, `wheelStatus`, `reporter`, `mediaCount` even though the template reads them (`events-table.component.ts:138-141`), worked around via an `any[]` `tableRows` getter (`:142-144`) — same pattern flagged for `ConsoleEventsGqlResponseTableDataElement`'s reuse in `profile.md`'s Known Quirks.
- **Inconsistent DI scope**: `ConsoleEventsGqlService` is `providedIn: "root"` while `MarkReadService` (used in the same component) is `providedIn: "any"` — harmless today (both stateless), but worth normalizing in a rewrite.
- **Default Apollo `cache-first` fetch policy** on the main query (`events-table.component.ts:240-259` sets no `fetchPolicy`) — contrasts with Profile's explicit `network-only` everywhere; in-session revisits to `/console` with identical default variables could theoretically serve a stale cached page instead of refetching (not verified live).

## Open Questions / Verify Against Live Site

- **Does the Status/Spotting Type Search bug actually manifest in the live app today?** The schema mismatch is confirmed from the exported SDL, but whether admins currently exercise those two filters (and thus whether this is a known pain point vs. an unused code path) can't be determined from source alone.
- **Do Event rows ever actually carry `NOT_SPOTTED` / `MARRIED` / `UNKNOWN` status values** (the 3 `SpottingVehicleStatus` members missing from the Status filter dropdown)? These are real enum members shared with `Vehicle.status`, but whether the spotting submission form itself ever writes those onto an _Event_ (vs. only ever appearing on a `Vehicle` row) wasn't traced into the spotting submission form's own code (out of this feature's scope).
- **Exact rendered copy**: the `<h1>Spotting Events</h1>` title, filter labels, and tooltip text ("Toggle mark as read") were read directly from template literals so should be accurate as-is, but ng-zorro's own default rendering for things like the multi-select "Any" placeholder or the table's empty-state placeholder wasn't visually confirmed.
- **ng-zorro's default empty-state appearance** when `displayData` is `[]` — not customized in this feature's own files, so whatever `<nz-table>` does by default applies; not traced into `node_modules` or verified visually.
- **Whether admins reviewing Console also hold a separate Django-admin staff session** on the backend host — the Event/User/Vehicle deep links assume this, but that's a fact about how admin accounts are actually provisioned/operated, not visible in either repo.
- **Operational history of the dual admin-flag system** (Firebase custom claim vs. Firestore `permissions.admin`) — whether these have ever drifted out of sync in practice for a real account is outside what's inferable from source.
