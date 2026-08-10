# Cross-Cutting Services, Models, Pipes & GraphQL/API Plumbing

> Scope: `src/app/services/**`, `src/app/models/**`, `src/app/pipes/**`, `src/app/@util/**`,
> `src/app/graphql.module.ts`, `src/app/app.module.ts`. This is app-wide plumbing, not a routed
> feature — **"Path(s) & Routing" and "Component Tree" are not applicable and are omitted.**
> Every other `docs/frontend-map/*.md` doc should treat `AuthService`/`auth-permissions.ts` here as
> the canonical source of truth for the permission model, and `graphql.module.ts` here as the
> canonical source of truth for how Apollo authenticates.

## Purpose

This is the app's shared substrate: the singleton services every feature injects (auth, toasts,
theming, image handling, upload queueing, session history), the hand-written TypeScript response
shapes for a handful of GraphQL operations, the five presentational pipes used across templates,
one tiny Imgur URL helper, and the two root Angular modules (`GraphQLModule`, `AppModule`) that wire
up Apollo, Firebase, Sentry, reCAPTCHA, and global error handling for every route. All of it is
consumed by "public", "authenticated", "beta-tester", and "admin" users alike — the services
themselves are role-agnostic; role/claim checks live specifically in `AuthService`,
`auth-permissions.ts`, and `app-routing.module.ts`, documented in full under **Permissions, Roles &
Flags** below.

## Functionality & Behavior

### AuthService

`/home/kwongtn/rosak_firebase/src/app/services/auth.service.ts` — `providedIn: "root"` singleton, the
single source of truth for "who is logged in and what can they do."

**Public API:**

- `authState$ = authState(this.auth)` (`:36`) — Angular Fire's raw Firebase `User | null` stream, subscribed to internally; not typically read by consumers directly.
- `userData: BehaviorSubject<User | null | undefined>` (`:39`, initial value `undefined`) — the current Firebase `User` object (`null` = logged out, `undefined` = not yet resolved).
- `customClaims: BehaviorSubject<ParsedToken | undefined>` (`:43`) — the decoded Firebase ID-token custom claims (`admin`, `betaTester`, or absent).
- `userAuth: BehaviorSubject<UserAuthData | null | undefined>` / `userAuth$` observable (`:46-49`) — the live Firestore `users/{uid}` document for the current user (see Data & API Contracts). **This is a separate data source from `customClaims`** (see Known Quirks).
- `loginViaLoginFunction: boolean` (`:51`) — declared, never read or written anywhere else in the app (dead flag).
- `login()` (`:103-147`) — `signInWithPopup(auth, new GoogleAuthProvider())`. On success: pushes the user into `userData`, and calls `ToastService.addToast("Login Successful", ...)` with a personalized "Welcome back, {displayName|email}" message if `metadata.lastSignInTime` is set, else a generic "Welcome!" for first-time sign-ins. On failure: if `reason.code === "auth/user-disabled"`, shows a permanent (`nzDuration: 0`) "Account Banned" error toast pointing to `tungnan5636@gmail.com`; otherwise shows a generic error toast with `reason.message`.
- `logout()` (`:149-167`) — `signOut(auth)`; on success sets `userData` to `null` and shows a "Logout Successful" toast; on failure shows an error toast.
- `sentrySetUser(user)` (`:169-179`) — called from the `userData` subscription on every change; sets/clears `Sentry.setUser({ email, id: uid, ip_address: "{{auto}}" })`.
- `getIdToken(): Promise<string> | undefined` (`:181-183`) — `this.userData.getValue()?.getIdToken()`. This is the Firebase ID token that every GraphQL/REST call site manually attaches as the `Firebase-Auth-Key` header (see GraphQLModule below) — `AuthService` itself never attaches it to any request.
- `isLoggedIn(): boolean` (`:185-187`) — `Boolean(this.userData.value)`.
- `isAdmin(): boolean` (`:189-191`) — `Boolean(this.customClaims.value?.["admin"])`. **Reads the Firebase custom claim**, not the Firestore `userAuth`/`permissions.admin` field (see Known Quirks).

**Types exported:**

```ts
export interface UserAuthData {
    permissions?: { admin?: boolean };
}
export interface CustomClaims {
    admin?: boolean;
    betaTester?: boolean;
}
```

`CustomClaims` is declared but not actually used to type anything at any call site (`customClaims` on the service is typed as Firebase's own `ParsedToken`) — effectively a stale/unused interface, though it accurately documents the two claim names in use.

**Constructor-time wiring** (`:54-101`):

1. Subscribes to `authState$`: whenever Firebase reports a non-null `user`, pushes it into `userData` and calls `user.getIdTokenResult()` to populate `customClaims` from the decoded token.
2. Subscribes to `userData` itself (not `authState$`) to drive two side effects on every change:
    - `sentrySetUser(user)`.
    - If `user` is truthy: opens a live Firestore `onSnapshot` listener on `doc(firestore, "users", user.uid)`. On every snapshot: pushes `doc.data()` into `userAuth`, and calls `isUserAllowed(data, this.router.url)` — if it returns `false`, force-navigates to `""` (root, which redirects to `/spotting` — see `app-routing.module.ts`).
    - If `user === null` (explicitly logged out, not just "not yet resolved" `undefined`): pushes `undefined` into `userAuth`, unsubscribes the Firestore listener if one exists, and re-runs `isUserAllowed(undefined, this.router.url)` — same forced-redirect behavior.
3. **This means every login/logout and every Firestore-doc-write to `users/{uid}` re-evaluates `isUserAllowed` against the _current_ route and can silently redirect the user away** — it is not just an initial route guard, it is a live watchdog for as long as the app is open.

Depends on: `@angular/fire/auth` (`Auth`, `authState`, `GoogleAuthProvider`, `signInWithPopup`, `signOut`), `@angular/fire/firestore` (`Firestore`, `doc`, `onSnapshot`), `@angular/router` (`Router`), `@sentry/browser`, `ToastService`, `auth-permissions.ts`.

**Consumers** (grep, non-spec files): `app.component.ts` (nav menu gating via `customClaims`/`userData`), `header/header.component.ts`, `header/login-dropdown/login-dropdown.component.ts` (login/logout buttons), `@ui/verification-code-card/verification-code-card.component.ts`, `spotting/spotting-form/spotting-form.component.ts`, `profile/profile.component.ts`, `profile/spottings/spottings.component.ts`, `profile/user/user.component.ts`, `console/services/mark-read.service.ts`, `console/events-table/events-table.component.ts`, and `services/image-upload.service.ts` (for `getIdToken()` on upload requests).

### auth-permissions.ts (`isUserAllowed`)

`/home/kwongtn/rosak_firebase/src/app/services/auth-permissions.ts` — a plain module (no `@Injectable`), imported only by `auth.service.ts`.

**Public API:**

```ts
export const permissions: { [key in PermissionKey]?: PermissionElement } = {
    admin: { explicitlyAllowedPaths: ["/console"] },
};
export function isUserAllowed(
    permissionObj: UserAuthData | undefined,
    path: string
): boolean;
```

- `PermissionKey = string | "admin" | "editor"` — a widened union that is effectively just `string` (the `"admin"`/`"editor"` literals add no narrowing since `string` already includes them); today only the `admin` key is actually defined in the `permissions` map, `"editor"` is aspirational/unused.
- `explicitlyAllowedPaths` (module-level `Set<string>`, `:15-21`) is the flattened set of every path mentioned across all `permissions[key].explicitlyAllowedPaths` — currently just `{"/console"}`.
- **Algorithm** (`:23-48`): if `path` is not in `explicitlyAllowedPaths` at all, return `true` (i.e. **default-allow** for any path not explicitly gated). Only if `path` _is_ one of the explicitly-gated paths does it then require `permissionObj?.permissions` to exist, walk each role key the user has (`Object.keys(permissionObj.permissions)`), union up that role's `explicitlyAllowedPaths`, and check membership.
- **Net effect today:** the only path this function ever actually restricts is the literal string `"/console"`, and it restricts it only to users whose **Firestore** `users/{uid}` document has `permissions.admin === true` (any truthy-keyed value works, since the code only reads `Object.keys(...)`, not the boolean values themselves — see Known Quirks).

Depends on: `UserAuthData` (from `auth.service.ts`). Depended on by: `auth.service.ts`'s constructor-time watchdog only. Not used by `app-routing.module.ts`'s route guards, which use an entirely separate mechanism (Firebase custom claims — see Permissions section).

### BuildInfoService

`/home/kwongtn/rosak_firebase/src/app/services/build-info.service.ts` — `providedIn: "root"`.

**Public API:**

- `buildInfo = build` — the statically-imported `../../build` module (`src/build.ts`), shape `{ version, timestamp, message, git: { user, branch, hash, fullHash } }`.
- `backendBuildInfo: BehaviorSubject<BackendBuildInfo>` — `interface BackendBuildInfo { hash: string; datetime: string }`, initial placeholder value `{ hash: "...", datetime: "..." }`.
- `getBuildInfo(): typeof build` (`:59-61`) — returns `this.buildInfo`.

**Constructor behavior** (`:25-57`): logs a styled multi-line build banner to the console (frontend version/branch/hash/message plus whether `environment.production`/`environment.sentry.environment` is "production 🏭", "staging 🚈", or "development 🚧"), then fires `GET {environment.backendUrl}version/` once and pushes the response into `backendBuildInfo`.

Depends on: `HttpClient`, `src/build.ts` (see Known Quirks — this file is a checked-in placeholder regenerated by the `angular-build-info` npm package, invoked via the `buildProd`/`buildStaging` npm scripts, `package.json:7-8`), `environment`.

**Consumer:** `@ui/footer/footer.component.ts` only — reads `getBuildInfo()` once in its constructor and subscribes to `backendBuildInfo` to show frontend/backend build hash and timestamp in the site footer.

### ImageCompressionService

`/home/kwongtn/rosak_firebase/src/app/services/image-compression.service.ts` — `providedIn: "root"`, stateless (empty constructor).

**Public API** (all instance methods, no shared state):

- `retrieveExif(blob: Blob): Promise<Blob>` (`:18-45`) — hand-rolled JPEG/EXIF (`APP1`/EXIF marker) byte scanner using `DataView`; rejects with `"not a valid jpeg"` if the file doesn't start with the JPEG SOI marker `0xFFD8`; resolves an empty `Blob` if no EXIF segment is found before the SOS marker.
- `copyExif(src: File, dest: File): Promise<File>` (`:47-52`) — extracts EXIF from `src` via `retrieveExif` and splices it into `dest` right after `dest`'s first 2 bytes, re-wrapped as a `File` named after `src` with `type: "image/jpeg"` (hardcoded, even if `dest` wasn't actually a JPEG).
- `ResizeImage(file, maxHeight = Infinity, maxWidth = Infinity, format = "jpeg", quality = 0.8): Promise<File>` (`:84-119`) — loads the file into an `<img>`, computes a scaled width/height preserving aspect ratio against the max bounds (scales down only, via two sequential `if` checks — width first, then height against the _already-adjusted_ width), draws to an off-DOM `<canvas>`, and re-encodes via `canvas.toBlob(..., "image/${format}", quality)`. **Bug-shaped edge case:** the returned `File`'s `type` is `file.type` (the _original_ file's MIME type), not `image/${format}` — so a re-encoded PNG-turned-JPEG blob is returned wrapped in a `File` object still claiming the original MIME type.
- `ResizeToSize(file, max_size = 0, quality = 0.85, format = "jpeg"): Promise<File>` (`:121-179`) — binary-search compression: first tries a same-dimension re-encode; if under `max_size` already, returns immediately (with EXIF copied back in via `copyExif`). Otherwise binary-searches a scale percentage (`top`/`bottom` bounds, starting 100/0) by repeatedly calling `ResizeImage` at `naturalHeight/Width * (i/100)` until `Math.ceil(top) === Math.ceil(bottom)`, then returns that result (EXIF re-attached). **No maximum iteration cap** — relies purely on the `Math.ceil` convergence of a shrinking `[bottom, top]` window, which is bounded (≤ ~7 iterations for a 0–100 range) but not defensively capped.
- `FileBlobToDataUrl(file: File | Blob): Promise<string>` (`:181-188`) — `FileReader.readAsDataURL` wrapped in a Promise.
- `Base64ToBlob(data: string): Promise<Blob>` (`:190-193`) — `fetch(data).then(r => r.blob())` (works because `data:` URIs are fetchable).
- `Base64ToFile({data, type, name}): Promise<File>` (`:196-199`).

Depends on: nothing beyond browser APIs (`DataView`, `FileReader`, `Canvas`, `fetch`). No Angular/Firebase/Apollo dependency at all.

**Consumer:** `@ui/spotting/form-upload/form-upload.component.ts` only — its internal `ImageFile` class (`:28-`) uses `compressServiceInstance` (an injected `ImageCompressionService`) to compress images client-side before queuing them via `ImageUploadService`.

### ImageUploadService

`/home/kwongtn/rosak_firebase/src/app/services/image-upload.service.ts` — `providedIn: "root"`. The queue/retry engine behind every image upload in the app (spotting-event photos, incident-calendar photos).

**Public API:**

- `pendingUploads: IPendingUpload[]` — in-memory array of `{ _type: PendingUploadType; relatedId: number | string; file: ImageFile }`, where `PendingUploadType = "SPOTTING_EVENT" | "INCIDENT_CALENDAR_INCIDENT"` (`:15-17`, matches the backend's `TemporaryMediaType` choices exactly — see Data & API Contracts).
- `$pendingUploadCount`, `$totalUploadCount`, `$percentUploaded: BehaviorSubject<number>` — progress-bar state consumed by the header badge and per-page upload progress bars.
- `isUploading: boolean` — simple re-entrancy flag.
- `addToQueue(relatedId, file: ImageFile, uploadType: PendingUploadType): void` (`:146-170`) — pushes onto `pendingUploads`, calls `addCounts(1)` to bump `$totalUploadCount`, and — **only if no interval is already running** — starts a `setInterval(..., 1000)` that calls `triggerUpload()` every second as long as `pendingUploads.length > 0 && !isUploading`.
- `triggerUpload(): Promise<void>` (`:45-103`) — snapshots and clears `pendingUploads`, then runs them through `PromisePool.withConcurrency(environment.upload.concurrency)` (5 in prod, 10 elsewhere — `environment*.ts`). For each pending item: if `file.toCompress && !file.isCompressed` (compression still in flight client-side), **re-queues the item unchanged and skips it this tick** rather than blocking; otherwise builds a `FormData` (`related_id`, `upload_type`, `image`) and does `POST {backendUrl}upload/` with header `Firebase-Auth-Key: <ID token>` (obtained fresh via `authService.getIdToken()` on every attempt). On HTTP error, the item is pushed back onto `pendingUploads` for retry and the error is re-thrown (swallowed by `PromisePool`, so one failed upload does not abort the batch). After the whole pool settles, calls `addCounts()` and clears `isUploading`.
- `onUploaded(): void` (`:105-114`) — decrements the pending count and recomputes `$percentUploaded` as `((total - pending) * 100) / total`.
- `addCounts(addCount = 0): void` (`:116-144`) — bumps `$totalUploadCount` by `addCount` if positive, recomputes `$pendingUploadCount`/`$percentUploaded` from `pendingUploads.length`, and — once the queue is fully drained (`pendingUploads.length === 0`) — shows a 10-second "Uploads complete. You may now close this tab." success message via `ToastService.addMessage` and clears the polling interval.

Depends on: `ToastService`, `HttpClient`, `AuthService` (for `getIdToken()`), `@supercharge/promise-pool`, `environment.backendUrl`, `environment.upload.concurrency`, and the `ImageFile` type from `@ui/spotting/form-upload/form-upload.component.ts` (a cross-feature import — a service in `services/` reaching into a UI component file for a type).

**Consumers:** `header/menu/menu.component.ts` (upload-count badge icon), `spotting/spotting-main.component.ts`, `insiden/event-list/event-card/event-card.component.ts`, `@ui/spotting/image-preview-button/image-preview-button.component.ts` (all three call `addToQueue`).

### SessionHistoryService

`/home/kwongtn/rosak_firebase/src/app/services/session-history.service.ts` — `providedIn: "root"`. A pure in-memory, non-persisted "recent actions this tab session" log (despite the name, **nothing is written to `sessionStorage`** — see Known Quirks).

**Public API:**

- `historyStore: BehaviorSubject<IHistoryStore>` where `IHistoryStore = { [timestamp: string]: { historyType: THistoryStore; [key: string]: any } }`, `THistoryStore = "spotting" | "mediaUpload"`.
- `historyStoreLength: BehaviorSubject<number>` — auto-derived count, kept in sync via a constructor-time subscription to `historyStore` (`:41-45`).
- `addSessionHistory(type: THistoryStore, data: any): void` (`:25-33`) — prepends a new entry keyed by `new Date().getTime().toString()` (newest-first, spread before the previous store).
- `clearSessionHistory(): number` (`:35-39`) — resets the store to `{}` and returns the previous entry count.

Depends on: nothing beyond RxJS. **Consumers:** `spotting/spotting-main.component.ts` (logs `"spotting"` entries after successful submissions), `spotting/spotting-form/spotting-form.component.ts` (reads `historyStore.value` to pre-fill/recall recent form values), `@ui/action-list/action-list.component.ts` (renders the history list + a "clear" action, presumably as an in-page "recent activity" panel).

### SpottingStorageService

`/home/kwongtn/rosak_firebase/src/app/services/spotting-storage.service.ts` — `providedIn: "root"`. A tiny "remember the last spotting-form choices for this tab session" cache — plain instance fields, not even `BehaviorSubject`s, so nothing is reactive; consumers must call the getters imperatively.

**Public API:**

- `setLine(lineId: string)` / `getLine(): string | undefined`
- `setType(typeObj: string)` / `getType(): string` (default `"JUST_SPOTTING"`)
- `setAtStationStation(obj: TGenericSeachField)` / `getAtStationStation(): TGenericSeachField | undefined`, where `TGenericSeachField = { name: string; value: string; disabled?: boolean }`.

**Only consumer:** `spotting/spotting-form/spotting-form.component.ts` — reads all three getters when the form initializes (to pre-select the last-used line/type/station) and writes back via the setters whenever the form's `type`/`line`/at-station fields change (`:396-566` in that file). Purely a same-tab, page-navigation-scoped memory aid — a full reload loses it (no `localStorage` backing), unlike `ThemeService`'s persisted choices.

### ThemeService

`/home/kwongtn/rosak_firebase/src/app/services/theme.service.ts` — `providedIn: "root"`. Governs the app's light/dark theme, entirely hand-rolled since the `844ee9e` ng-devui→ng-zorro migration (previously delegated to `ng-devui`'s runtime theme engine).

**Public API:**

- `themeFollowSystemColorScheme: BehaviorSubject<boolean>` — seeded from `localStorage.getItem("devuiThemeFollowSystemColorScheme") === "on"` (`:23-25`; note the **legacy `devui`-prefixed key name**, kept for backward-compat with previously-set values — see Known Quirks).
- `colorScheme: BehaviorSubject<"light" | "dark">` — lazily created the first time `themeChange()` runs (`:67-73`), so it is `undefined` until then; consumers doing `themeService.colorScheme.subscribe(...)` synchronously at injection time (before any `themeChange` call) would throw, but in practice the constructor always calls either `followSystemColorScheme(true)` or `initTheme()` (which calls `themeChange`), so `colorScheme` is always populated by the time any other component's constructor could plausibly run and inject the singleton.
- `advancedThemeList = ["infinity", "galaxy"]`, `currentTheme = "infinity"` — internal theme-name vocabulary, a direct carry-over from ng-devui's own built-in theme names (`"infinity"` = light, `"galaxy"` = dark); there is no third theme and no way to add one without editing this list and the `themeChange` mapping.
- `initTheme(): void` (`:34-44`) — reads `localStorage.getItem("user-custom-theme")`, splits on `"-"` and takes the first segment (accommodating theme names like `"infinity-blue"` that ng-devui supported but this app's `advancedThemeList` no longer does), falls back to `"infinity"` if the stored value isn't in `advancedThemeList`, then calls `themeChange(currentTheme)`.
- `toggleTheme(): void` (`:46-57`) — turns off "follow system" mode, then flips `currentTheme` between `"infinity"`/`"galaxy"`.
- `themeChange(theme: string): void` (`:59-74`) — sets `currentTheme`, persists to `localStorage["user-custom-theme"]`, sets `document.documentElement.setAttribute("data-theme", theme === "infinity" ? "light" : "dark")` (**this is the only thing that actually drives visual theming** — CSS in `src/styles.scss` keys off `:root[data-theme="dark"]`), and pushes the mapped `"light"|"dark"` value into `colorScheme`.
- `followSystemColorScheme(toggleValue: boolean): void` (`:76-89`) — removes any existing `matchMedia` listener, and if `toggleValue`, re-adds `mediaQueryListener` (which calls `themeChange` on every OS-level light/dark change) and immediately applies the current OS preference; persists the on/off flag via `setThemeFollowSystemColorScheme`.
- `ngOnDestroy(): void` (`:91-93`) — removes the media-query listener. **Never actually invoked** since `ThemeService` is a `providedIn: "root"` singleton that Angular never destroys during a normal app session (see Known Quirks).
- `setThemeFollowSystemColorScheme(value: "on" | "off"): void` (`:95-97`) — writes `localStorage["devuiThemeFollowSystemColorScheme"]`.

Depends on: `window.matchMedia("(prefers-color-scheme: dark)")`, `localStorage`, the `document.documentElement` DOM attribute, and `src/styles.scss`'s `[data-theme="dark"]` CSS override block (`styles.scss:49`).

**Consumers:** `header/menu/menu.component.ts` (theme toggle button, calls `toggleTheme()`), `header/login-dropdown/login-dropdown.component.ts` ("follow system" switch, reads/writes `themeFollowSystemColorScheme`), `@ui/spotting-vehicle-calendar-heatmap/spotting-vehicle-calendar-heatmap.component.ts` and `situasi/situasi.component.ts` (both subscribe to `colorScheme` to pick light/dark chart or map styling at runtime).

### ToastService

`/home/kwongtn/rosak_firebase/src/app/services/toast.service.ts` — `providedIn: "root"`. Thin wrapper around ng-zorro's `NzMessageService` (small inline "toasts", top-of-viewport) and `NzNotificationService` (larger corner "notification cards" with title+body).

**Public API:**

- `getPlacement(): NzNotificationPlacement` (`:27-29`) — `window.innerWidth < 1024 ? "bottom" : "top"`, i.e. mobile viewports default notifications to the bottom of the screen, desktop to the top.
- `addMessage(message: string, type: MessageType = "info", options?: NzMessageDataOptions): void` (`:31-67`) — `MessageType = "info" | "success" | "error" | "warning" | "loading"`; `console.log`s every call (message/type/options as JSON) before delegating to the matching `NzMessageService` method; throws a local `MessageTypeNotFoundError` for an unrecognized `type` (defensive, effectively unreachable given the TS union unless a caller uses `as any`).
- `addToast(title: string, content: string, type: NotificationType = "info", options?: NzNotificationDataOptions): void` (`:69-112`) — `NotificationType = "blank" | "success" | "error" | "info" | "warning"`; merges `{ nzPlacement: this.getPlacement() }` as a _default_ that caller-supplied `options` can override (`options = { nzPlacement: ..., ...options }`, `:75-78`); same `console.log`-then-dispatch pattern; throws `NotificationTypeNotFoundError` for an unrecognized type.

Depends on: `ng-zorro-antd/message`'s `NzMessageService`, `ng-zorro-antd/notification`'s `NzNotificationService`. This is the one service in scope whose dependency (`ng-zorro-antd`) is explicitly slated for removal in the Tailwind rewrite — every call site (`addMessage`/`addToast`) and their two-type-union API surface will need a replacement toast/notification primitive.

**Consumers (11 files):** `services/image-upload.service.ts`, `services/auth.service.ts`, `error-handler.ts` (global uncaught-error handler, see AppModule below), `@ui/spotting/image-preview-button/image-preview-button.component.ts`, `@ui/spotting/form-upload/form-upload.component.ts`, `spotting/spotting-main.component.ts`, `spotting/spotting-form/spotting-form.component.ts`, `profile/spottings/spottings.component.ts`, `profile/user/user.component.ts`, `insiden/event-list/event-card/event-card.component.ts`.

### models/mutation.ts (`GenericMutationReturn`)

`/home/kwongtn/rosak_firebase/src/app/models/mutation.ts` — a single reusable response-shape interface, not tied to any one mutation name:

```ts
export interface GenericMutationReturn {
    [key: string]: { ok: boolean };
}
```

Used as the generic type parameter to apollo-angular's `Mutation<T>` base class for any backend mutation that just returns a Strawberry `GenericMutationReturn { ok: bool }` payload (confirmed on the backend at `/home/kwongtn/rosak_backend/common/schema/scalars.py:197-198` — exact match, just `ok: bool`, no `errors`/`message` field). Concretely instantiated by `profile/services/delete-event.service.ts` (`Mutation<GenericMutationReturn>` wrapping the `deleteEvent` mutation) and structurally mirrored (inline, not by importing this type) by `console/services/mark-read.service.ts`'s `MarkEventAsReadResult` and `spotting/schema`'s other `ok`-only mutations reached from the frontend.

### models/query/get-vehicles.ts

`/home/kwongtn/rosak_firebase/src/app/models/query/get-vehicles.ts` — pure TypeScript interfaces (no runtime code, no `gql`), documenting the response shapes for the spotting feature's vehicle/line/spotting-history GraphQL queries. Cross-checked against the backend (`operation/schema/scalars.py`, `spotting/schema/scalars.py`) — field names match exactly once you apply Strawberry's automatic snake_case→camelCase GraphQL field naming (e.g. backend `vehicle_status_in_service_count` ⇄ frontend `vehicleStatusInServiceCount`).

- `LineStatus = "TESTING" | "DEFUNCT" | "ACTIVE" | "PARTIAL_ACTIVE" | "PARTIAL_DISRUPTION" | "TOTAL_DISRUPTION"` — mirrors `operation.models.Line.status` (`strawberry.auto`, a Django `TextChoices` enum on the backend).
- `VehicleStatusCountType` — the eight `vehicle_status_*_count`/`vehicle_total_count` computed fields strawberry-django dataloader-resolves per `VehicleType` (`operation/schema/scalars.py:177-223`); each backend field is an `async` dataloader call (`vehicle_status_count_from_vehicle_type_loader`), i.e. batched N+1-safe, not a naive per-row COUNT.
- `VehicleType extends VehicleStatusCountType` adds `id`, `internalName`, `displayName`, and `vehicles: Array<{...}>` (`identificationNo`, `status`, `lastSpottingDate`, `inServiceSince`, `spottingCount`, `notes`, `nickname`, `incidentCount`, `wheelStatus`) — all present on the backend `Vehicle` type (`operation/schema/scalars.py:226-298`), several likewise dataloader-computed (`lastSpottingDate`, `spottingCount`, `incidentCount`) rather than plain columns. Note: the backend `Vehicle` type also exposes `canExpand: bool` (`:288-298`) and `spottings`/`incidents`/`spottingTrends` fields that this particular frontend interface does not model — this file only documents the subset of fields the spotting queries actually select, not the full backend type.
- `GetVehiclesReponse` (sic — typo preserved from source) / `GetLinesAndVehiclesResponse` / `GetLinesResponse` — thin wrappers around `vehicleTypes`/`lines` root-query shapes; the actual `gql` query text lives in `spotting/services/get-lines-vehicles-gql.service.ts` and sibling files (spotting feature, out of scope here — see that feature's own doc).
- `LastSpottingsElementStation { id, displayName }`, `LastSpottings` (spotting-date, status, type, origin/destination station, notes, runNumber, mediaCount, isMine, wheelStatus, and an optional `location` object with `accuracy`/`altitudeAccuracy`/`heading`/`speed`/`location: [number, number]`/`altitude`) — mirrors the backend `EventScalar` type (`spotting/schema/scalars.py:29-` ) including its dataloader-computed `mediaCount` and `isMine` fields (the latter resolves as `self.reporter.id == info.context.user.id`, `spotting/schema/scalars.py:72-79`, i.e. **is only meaningful when the request is authenticated** — an anonymous request gets `isMine: false` for every row).
- `GetVehiclesLastSpottingResponse { events: LastSpottings[] }` — maps to the backend `SpottingScalars.events` root field (`strawberry_django.field(filters=EventFilter, pagination=True, order=EventOrder)`, `spotting/schema/schema.py:25-27`) — i.e. the real backend field supports arbitrary filter/pagination/order arguments that this response-shape file does not itself encode (those live in the calling query's variables, in spotting-feature files out of scope here).
- `IncidentSeverityType = "TRIVIA" | "STATUS" | "CRITICAL"` and `GetVehicleIncidentsResponse { vehicleIncidents: [...] }` — used by `spotting/vehicle-type-container/spotting-table/inline-timeline/inline-timeline.component.ts` for the per-vehicle incident timeline popover.

Depends on (imports): `SpottingType` (from `pipes/spotting-type/spotting-type.pipe.ts`) and `VehicleStatus` (from `pipes/vehicle-status/vehicle-status.pipe.ts`) — i.e. this "model" file's types are partly defined in terms of the pipes' type unions rather than the reverse, an unusual but harmless direction of coupling.

### models/spotting-table/source-type.ts

`/home/kwongtn/rosak_firebase/src/app/models/spotting-table/source-type.ts` — frontend-only presentation-layer types (no GraphQL correspondence), used to shape data specifically for the spotting results `nz-table`:

```ts
interface ExpandConfig {
    expandable: boolean;
    expand: boolean;
}
export interface SourceType {
    id: string | number;
    identificationNo: string;
    status: string;
    inServiceSince: string | null;
    lastSpotted: string;
    timesSpotted: number;
    notes: string;
    $expandConfig: ExpandConfig;
}
export interface TableDataType {
    displayName: string;
    vehicleStatusCount: VehicleStatusCountType;
    tableData: SourceType[];
}
```

`$expandConfig` is a row-level UI-state bag (expandable/expanded flags for the table's row-detail-expand feature), not backend data — the `$`-prefix is this codebase's informal convention for "derived/UI-only field bolted onto a data row." Depends on `VehicleStatusCountType` from `models/query/get-vehicles.ts`. **Only consumers:** `spotting/vehicle-type-container/spotting-table/spotting-table.component.ts` and its parent `spotting/vehicle-type-container/vehicle-type-container.component.ts` — both in the spotting feature (own doc), which transforms the raw `GetLinesAndVehiclesResponse`/`GetVehiclesLastSpottingData` GraphQL shapes into this table-ready shape.

### Pipes: BeautifulDecimalPipe

`/home/kwongtn/rosak_firebase/src/app/pipes/beautiful-decimal/beautiful-decimal.pipe.ts` — standalone pipe, name `beautifulDecimal`.

```ts
transform(value: number, precision: number = 5): string
```

Implementation: `value.toPrecision(precision).replace(/\.?0+$/, "")` — formats a number to `precision` significant digits, then strips trailing zeros (and a trailing bare decimal point if all decimals were zero). E.g. `12.3456789` at default precision 5 → `"12.346"`; `10.0` → `"10"`. **Edge case:** `toPrecision` on very large/small numbers can switch to exponential notation (e.g. `1234567 .toPrecision(5)` → `"1.2346e+6"`), and the trailing-zero-strip regex would incorrectly eat zeros out of the exponent portion if the mantissa happens to end in a zero before the `e` — not something the current call site (coordinate-ish/decimal display) is likely to trigger, but a real edge case for a general-purpose formatter. **Only consumer:** `@ui/spotting-type-cell-display/spotting-type-cell-display.component.html` (via `| beautifulDecimal`).

### Pipes: CalendarIncidentSeverityPipe

`/home/kwongtn/rosak_firebase/src/app/pipes/calendar-incident-severity/calendar-incident-severity.pipe.ts` — standalone pipe, name `calendarIncidentSeverity`.

```ts
transform(severity: string, returnType: "type" | "color" = "type"): string
```

Two internal lookup maps keyed on `MAJOR | MINOR | OTHERS`:

- `returnType: "type"` → ng-zorro `nz-alert`/`nz-tag` semantic type strings: `MAJOR → "error"`, `MINOR → "warning"`, `OTHERS → "processing"`, anything else → `"default"`.
- `returnType: "color"` → ng-zorro tag color names: `MAJOR → "red"`, `MINOR → "orange"`, `OTHERS → "blue"`, anything else → `"cyan"`.
- Any other `returnType` value falls through to the (unreachable given the TS union) `else` branch returning `severity` unchanged.

Note: despite the name "**Incident**Severity", the enum values (`MAJOR`/`MINOR`/`OTHERS`) are calendar-incident-severity levels, distinct from the _vehicle_-incident `IncidentSeverityType` (`TRIVIA | STATUS | CRITICAL`) modeled in `models/query/get-vehicles.ts` — two unrelated severity vocabularies in the same app, easy to conflate by name alone. **Consumers:** `insiden/event-list/event-card/event-card.component.html`, `insiden/calendar/calendar.component.html`, and re-exported/declared in `insiden/insiden.module.ts`.

### Pipes: CoordinatesHumanizerPipe

`/home/kwongtn/rosak_firebase/src/app/pipes/coordinates-humanizer/coordinates-humanizer.pipe.ts` — standalone pipe, name `coordinatesHumanizer`.

```ts
transform(value: GeolocationCoordinates, toFixedCount: number = 5, flags: "location-only"[] = []): string
```

Formats a browser `GeolocationCoordinates` object as e.g. `"3.12345N, 101.65432E ± 12.00000m"` — sign-to-hemisphere-letter conversion (`latitude > 0 → "N"` else `"S"`; `longitude > 0 → "E"` else `"W"`, both via `Math.abs` + `toFixed(toFixedCount)`), with the `± {accuracy}m` suffix omitted only when `flags` includes `"location-only"`. **Edge case:** a coordinate of exactly `0` (equator/prime meridian) is treated as `"S"`/`"W"` respectively since the comparison is strict `> 0`, not `>= 0` — a real if extremely unlikely-in-practice cosmetic bug. **Consumers:** `@ui/spotting-type-cell-display/spotting-type-cell-display.component.html`, `spotting/spotting-form/spotting-form.component.html` (both display the current/recorded GPS fix for a spotting event).

### Pipes: SpottingTypePipe

`/home/kwongtn/rosak_firebase/src/app/pipes/spotting-type/spotting-type.pipe.ts` — standalone pipe, name `spottingType`. Also exports the `SpottingType` union type consumed elsewhere (e.g. `models/query/get-vehicles.ts`'s `LastSpottings.type`).

```ts
export type SpottingType = "DEPOT" | "LOCATION" | "BETWEEN_STATIONS" | "JUST_SPOTTING" | "AT_STATION";
transform(value: SpottingType): string
```

Straight dictionary lookup → human labels (`"Depot"`, `"Location"`, `"Between Stations"`, `"Just Spotting"`, `"At Station"`). **No fallback** — if `value` isn't one of the five known keys, `dict[value]` is `undefined` and the pipe returns `undefined` (renders as empty string in the template), unlike `VehicleStatusPipe` below which has an explicit `?? "Unknown"` fallback. **Consumers:** `@ui/spotting-type-tag/spotting-type-tag.component.html` (via the pipe), `profile/spotting-trends/spotting-trends.component.ts` (imports the `SpottingType` type, not necessarily the pipe itself).

### Pipes: VehicleStatusPipe

`/home/kwongtn/rosak_firebase/src/app/pipes/vehicle-status/vehicle-status.pipe.ts` — standalone pipe, name `vehicleStatusPipe` (inconsistent naming convention vs. the other four pipes, which all use bare camelCase nouns without a `Pipe` suffix in the pipe _name_ string — this one keeps it).

```ts
export type VehicleStatus = "IN_SERVICE" | "NOT_SPOTTED" | "OUT_OF_SERVICE" | "DECOMMISSIONED" | "MARRIED" | "TESTING" | "UNKNOWN";
transform(value: VehicleStatus | SpottingVehicleStatus): string
```

Dictionary lookup with an extra `NOT_IN_SERVICE: "Not in Service"` entry that exists in the map but **is not a member of the `VehicleStatus` type union** (dead map entry, unreachable via the typed parameter unless called with `as any`) plus `?? "Unknown"` fallback for any unrecognized value. Accepts a second type, `SpottingVehicleStatus` imported from `src/app/spotting/spotting-form/spotting-form.types.ts` — a locally-declared, structurally-identical-looking `VehicleStatus` union in the spotting-form feature — so this pipe's parameter type is a union of two same-shaped-but-independently-declared enums (a duplication smell worth consolidating in the rewrite). Backend correspondence: mirrors `operation.enums.VehicleStatus` used on `Vehicle.status` (`strawberry.auto`, `operation/schema/scalars.py:234`). **Only consumer:** `@ui/vehicle-status-tag/vehicle-status-tag.component.html`.

### @util/imgur.ts (`getThumbnail`)

`/home/kwongtn/rosak_firebase/src/app/@util/imgur.ts` — the sole file under `@util/`. One private helper (`getFilename`) plus one exported function:

```ts
export function getThumbnail(
    url: string,
    size: "s" | "b" | "t" | "m" | "l" | "h"
): string;
```

Implements Imgur's "thumbnail trick" (documented in the file's own doc-comment, linking to `https://thomas.vanhoutte.be/miniblog/imgur-thumbnail-trick/`): given a full Imgur image URL, splices a one-letter size suffix onto the filename before the extension (`s`=90×90, `b`/`t`=160×160, `m`=320×320, `l`=640×640, `h`=1024×1024) to fetch a pre-generated thumbnail instead of the full-size original. **Assumes the URL is an Imgur URL** with the standard `https://i.imgur.com/{id}.{ext}` shape — no validation or fallback for non-Imgur media URLs; if the app's media storage were ever migrated off Imgur (plausible for the rewrite, given `common/views.py`'s S3-backed `GenericUpload` in the current backend — see Known Quirks), every call site of this function would break silently (wrong/missing thumbnails, not an error). **Consumers:** `@ui/spotting-image-list/spotting-image-list.component.ts`, `gallery/gallery.component.ts`, `insiden/event-list/event-card/image-drawer/image-drawer.component.ts` — all three request the `"m"` (320×320) size specifically.

### GraphQLModule (`graphql.module.ts`)

`/home/kwongtn/rosak_firebase/src/app/graphql.module.ts` — the entire Apollo Client bootstrap for the app, and it is intentionally minimal:

```ts
const uri = environment.backendGraphqlUrl;
export function createApollo(httpLink: HttpLink): ApolloClientOptions<any> {
    return { link: httpLink.create({ uri }), cache: new InMemoryCache() };
}
@NgModule({
    exports: [ApolloModule],
    providers: [
        { provide: APOLLO_OPTIONS, useFactory: createApollo, deps: [HttpLink] },
    ],
})
export class GraphQLModule {}
```

- **Endpoint:** `environment.backendGraphqlUrl` — `http://localhost:8000/graphql/` (dev), `https://rosak-staging.kwongtn.xyz/graphql/` (staging), `https://api-community.mlptf.org.my/graphql/` (prod; see `src/environments/environment{,.staging,.prod}.ts`).
- **Cache:** a bare `new InMemoryCache()` — no custom `typePolicies`, no `possibleTypes`, no cache persistence (nothing survives a page reload; every navigation re-fetches).
- **No auth link, no error link, no batch link, no retry link of any kind.** `HttpLink` is apollo-angular's default single-operation-per-HTTP-request transport with no middleware chain at all.
- **How auth actually reaches the backend:** since there is no global auth link, **every individual call site that needs authentication has to fetch the Firebase ID token itself (via `AuthService.getIdToken()`) and pass it as a per-call HTTP header through Apollo's per-operation `context` option**, which apollo-angular's `HttpLink` merges directly into the outgoing HTTP request's headers:
    ```ts
    this.apollo.mutate({
        mutation: MARK_AS_READ,
        variables: { input: { eventIds } },
        context: {
            headers: {
                "firebase-auth-key": await this.authService.getIdToken(),
            },
        },
    });
    ```
    (verbatim pattern from `console/services/mark-read.service.ts:42-49`; the same pattern — with varying header-name casing, `"Firebase-Auth-Key"` vs `"firebase-auth-key"`, HTTP headers being case-insensitive so this has no functional effect — appears in `@ui/verification-code-card/verification-code-card.component.ts`, `spotting/spotting-form/spotting-form.component.ts`, `profile/profile.component.ts`, `profile/spottings/spottings.component.ts`, `profile/user/user.component.ts`, `console/events-table/events-table.component.ts`).
    - Repo-wide, **22 files** use a `gql` tagged template; only **7 of them** attach this header. The other 15 (e.g. lines/vehicles lookups, calendar-incident listings, media galleries) send fully anonymous GraphQL requests with no auth context at all — which is fine only insofar as the corresponding backend resolvers don't require `IsLoggedIn`/`IsAdmin`.
    - Some mutations (e.g. `mark-read.service.ts`) additionally attach a `g-recaptcha-response` header (from `ReCaptchaV3Service.execute(...)`) alongside the Firebase header, for backend `IsRecaptchaChallengePassed` checks.
- **Backend-side verification** (`/home/kwongtn/rosak_backend`): the Django `CustomGraphQLView.get_context()` (`rosak/context.py:22-31`) builds the per-request GraphQL context as a `DotMap` containing `user: await FirebaseUser(request).get_current_user()`. `FirebaseUser.get_current_user()` (`common/utils.py:22-40`) reads the raw `Firebase-Auth-Key` request header, and if present, calls `firebase_admin.auth.verify_id_token(auth_key)` (validates the JWT's signature/expiry against the Firebase project directly — no network round-trip to Firestore needed for this step), then `User.objects.get_or_create(firebase_id=key_contents["uid"])` — **so the very first authenticated GraphQL/REST call from a brand-new Firebase user silently provisions a corresponding backend `common.User` row**, there is no separate "register" step. If the header is absent, `info.context.user` is `None`.
- **Backend permission classes** built on top of that context (`rosak/permissions.py`):
    - `IsLoggedIn` — `bool(info.context.user)`.
    - `IsAdmin` — re-fetches the _live_ Firebase user record via `firebase_admin.auth.get_user(firebase_id)` (a fresh Admin SDK call, not trusting any claim baked into the already-decoded token) and checks `user.custom_claims.get("admin", False)`. **This is the same `admin` custom claim the frontend route guard and `AppComponent`'s nav-menu gating check** — the three are consistent with each other (see Permissions section).
    - `IsRecaptchaChallengePassed` — reads the raw `G-Recaptcha-Response` header and calls Google's `siteverify` REST API server-side, checking both `success` and `score >= settings.RECAPTCHA_MIN_SCORE`.
    - Both `Firebase-Auth-Key` and `g-recaptcha-response` are in the backend's `CORS_ALLOW_HEADERS` allow-list (`rosak/settings.py:196-199`), and the frontend's own origins (`localhost:4200`, `*.web.app`, `*.kwongtn.xyz`, `community.mlptf.org.my`, `staging-community.mlptf.org.my`) are in `CORS_ALLOWED_ORIGINS`/`CORS_ALLOWED_ORIGIN_REGEXES` (`rosak/settings.py:183-194`).
- **CSRF:** not relevant here — the Django GraphQL view is `AsyncGraphQLView`/`csrf_exempt`-style REST-ish POST endpoint authenticated purely by the bearer-style `Firebase-Auth-Key` header, not Django session cookies.

### AppModule (`app.module.ts`)

`/home/kwongtn/rosak_firebase/src/app/app.module.ts` — the root `NgModule`, `bootstrap: [AppComponent]`. Assembles every global provider the rest of the app relies on:

- **Imports:** `BrowserAnimationsModule`, `BrowserModule`; ng-zorro's `NzAlertModule`/`NzMessageModule`/`NzNotificationModule` (global, app-wide toast/alert support — everything else in ng-zorro is imported per-feature/standalone); `AppRoutingModule`; `GraphQLModule` (above); `HeaderModule`; the standalone `FooterComponent`; `RecaptchaFormsModule`/`RecaptchaV3Module`; `MarkdownModule.forRoot()` (used by the compliance/about-style markdown-rendering pages, out of this doc's scope).
- **Error handling:** `{ provide: ErrorHandler, useClass: GlobalErrorHandler, useValue: Sentry.createErrorHandler({ showDialog: true }) }` (`:70-76`) — **both `useClass` and `useValue` are set on the same provider object**, which Angular's DI does not support simultaneously; Angular's provider-resolution logic checks for a defined `useValue` before `useClass`, so in practice **`GlobalErrorHandler` (the custom "chunk load failed → toast + auto-reload in 3s" handler, `error-handler.ts`) is never actually installed** — only Sentry's own `createErrorHandler({ showDialog: true })` (which shows Sentry's built-in user-feedback dialog on unhandled errors and reports to Sentry) is. See Known Quirks.
- **Sentry router tracing:** `{ provide: Sentry.TraceService, deps: [Router] }` plus a no-op `APP_INITIALIZER` whose only job is to force-instantiate `Sentry.TraceService` at bootstrap (`:77-87`) — the standard `@sentry/angular` idiom for enabling route-change performance spans. `Sentry.init(...)` itself (DSN, tunnel, `browserTracingIntegration`, `replayIntegration`, `feedbackIntegration`, sample rates) happens earlier, in `src/main.ts:10-36`, **not** in this module.
- **reCAPTCHA v3:** `ReCaptchaV3Service` + `{ provide: RECAPTCHA_V3_SITE_KEY, useValue: environment.captcha.key }` — a global site key, consumed ad hoc by individual mutation call sites (e.g. `mark-read.service.ts`) that need a fresh token per action via `recaptchaV3Service.execute(actionName)`.
- **i18n:** `{ provide: NZ_I18N, useValue: en_US }` — ng-zorro's English locale pack; paired with `registerLocaleData(en)` for Angular's own `@angular/common/locales/en` (`:16,45`). No i18n/locale switching exists anywhere in the app — English only.
- **Firebase:** `provideFirebaseApp(() => initializeApp(environment.firebase))`, plus `provideAnalytics`, `provideFirestore`, `provideAuth`, `provideDatabase`, `provideStorage` — i.e. Firebase Auth, Firestore, Realtime Database, Cloud Storage, and Analytics are **all** initialized globally regardless of route, even though (per the rest of this doc set) most features only actually touch Auth + Firestore.
- **Production-only extras** (`if (environment.production) { ... }`, `:104-117`): `ScreenTrackingService`/`UserTrackingService` (Firebase Analytics auto screen/user tracking) and `providePerformance(() => getPerformance())` (Firebase Performance Monitoring) are registered **only** when `environment.production === true` — true for both the `staging` and `prod` environment files (both set `production: true`), false only for local `environment.ts`. A second, redundant `provideAnalytics(() => getAnalytics())` call is also pushed here (`:108`), duplicating the one already unconditionally provided above (harmless — Angular DI providers for the same token are just concatenated/last-wins for a given injection, and `getAnalytics()` itself is idempotent per Firebase app — but dead duplication worth cleaning up in the rewrite). A commented-out `CONFIG`/`APP_VERSION` provider block (`:110-115`) is dead code.
- **Misc global providers:** `provideMarkdown()`, `provideHttpClient()` (the modern functional HttpClient provider — this coexists with the classic `NgModule`-style imports elsewhere in the app), `NzModalService`, `NzImageService`, `NzDrawerService` (ng-zorro's three imperative/"headless" services for programmatically opening modals, image previews, and drawers from any component without template markup).

Depends on: everything above plus `@angular/fire/*`, `@sentry/angular`, `ng-recaptcha-2`, `ngx-markdown`, `ng-zorro-antd/{alert,message,notification}`. Depended on by: nothing (it's the root module) — but every other module/component in the app transitively relies on the providers it registers.

## Data & API Contracts

- **GraphQL transport:** Apollo Client via apollo-angular, endpoint `environment.backendGraphqlUrl` (see `GraphQLModule` above for the exact URI per environment). No global auth/error/batch link — auth is opt-in per call site via `context.headers["firebase-auth-key"]`. Backend: Strawberry + strawberry-django schema at `/home/kwongtn/rosak_backend/rosak/schema.py`, served by `rosak/context.py`'s `CustomGraphQLView`.
- **Firebase-Auth-Key verification (backend):** `common/utils.py:FirebaseUser.get_current_user()` → `firebase_admin.auth.verify_id_token(...)` → `common.models.User.objects.get_or_create(firebase_id=uid)`. No separate signup/registration endpoint exists — any valid Firebase ID token auto-provisions a backend `User` row on first authenticated request.
- **REST (non-GraphQL) endpoints consumed by services in this scope:**
    - `GET {backendUrl}version/` (`BuildInfoService`) → backend `rosak/custom_view.py:git_version` (`rosak/urls.py:46`) → `{ hash: os.environ["GIT_COMMIT_HASH"], datetime: os.environ["GIT_COMMIT_TIME"] }`, unauthenticated, no request body.
    - `POST {backendUrl}upload/` with `multipart/form-data` (`related_id`, `upload_type`, `image`) and header `Firebase-Auth-Key` (`ImageUploadService`) → backend `common/views.py:GenericUpload` (`rosak/urls.py:44`), a DRF `APIView`. Validates `upload_type` against `common.enums.TemporaryMediaType` (`SPOTTING_EVENT` | `INCIDENT_CALENDAR_INCIDENT`, exact match with the frontend's `PendingUploadType`) → `400` if unrecognized. Requires a resolved Firebase user → `401` if the header is missing/invalid. For `SPOTTING_EVENT`: loads the `Event` by `related_id` and checks `user.id == event.reporter_id` → `403` if the uploader isn't the event's own reporter (**note:** an admin cannot upload media to someone else's spotting event via this endpoint — ownership is the only check, custom claims are irrelevant here). Writes a `common.models.TemporaryMedia` row (`status: PENDING`) — actual media only lands in permanent storage after some further out-of-band moderation/promotion step not present in this endpoint (see the `TemporaryMediaStatus` choices `CLEARED`/`TRUSTED_CLEARED`/`OVERRIDE_CLEARED` for the states a pending upload can graduate to). Returns bare `201`/no body on success.
- **`GenericMutationReturn`-shaped mutations** (backend `common/schema/scalars.py:197-198`, `{ ok: bool }`): e.g. `deleteEvent(input: DeleteEventInput!): GenericMutationReturn` (`spotting/schema/schema.py:43-57`, permissions `IsLoggedIn + IsRecaptchaChallengePassed`; business rule: only the event's own `reporter_id`, and only within 3 days of `created`, can delete it — anything else returns `{ ok: false }`, not an error) and `markAsRead(input: MarkEventAsReadInput!): GenericMutationReturn` (`spotting/schema/schema.py:167-183`, permissions `IsLoggedIn + IsRecaptchaChallengePassed + IsAdmin`, i.e. only admins can mark events as read).
- **`models/query/get-vehicles.ts` response shapes** cross-checked against backend types: `VehicleType`/`VehicleStatusCountType` ⇄ `operation/schema/scalars.py`'s `VehicleType` (dataloader-batched per-status counts); `LastSpottings` ⇄ `spotting/schema/scalars.py`'s `EventScalar` (dataloader-computed `mediaCount`/`isMine`); `events` root query ⇄ `spotting/schema/schema.py`'s `SpottingScalars.events` (`strawberry_django.field` with `EventFilter`/pagination/`EventOrder` — full filter/order/pagination contract lives in the spotting feature's own query-building code, out of scope here).
- **Firebase Firestore:** `AuthService` opens a live `onSnapshot` listener on `users/{uid}` (read-only from this scope's code — nothing here writes to it; the `permissions.admin` field must be set out-of-band, e.g. via the Firebase console or a separate admin tool not present in this repo).
- **Firebase Auth:** `signInWithPopup` w/ `GoogleAuthProvider` (Google is the **only** sign-in method wired up — no email/password, no other OAuth providers anywhere in this scope), `signOut`, `getIdToken()`/`getIdTokenResult()` for the custom-claims-bearing JWT.
- **Browser storage:** `localStorage` keys `devuiThemeFollowSystemColorScheme` (`"on"`/`"off"`) and `user-custom-theme` (`"infinity"`/`"galaxy"`, or a legacy `"{name}-{variant}"` string whose first segment is taken) — both owned by `ThemeService`. No `sessionStorage` or `IndexedDB` usage anywhere in this scope despite `SessionHistoryService`'s name (its store is plain in-memory RxJS state, lost on refresh — see Known Quirks).
- **Firebase Analytics/Performance:** provisioned globally in `AppModule` (see above); no service in this scope's `services/**` directly logs custom Analytics events — `AppComponent` injects `Analytics` directly instead.

## State Management

- **`AuthService`** owns the single most cross-cutting piece of global state: `userData`/`customClaims`/`userAuth` `BehaviorSubject`s, populated reactively from Firebase Auth state changes and a live Firestore listener, for the lifetime of the whole app session (it's a root singleton, never torn down). Every other feature that needs "am I logged in / am I admin / am I a beta tester" reads one of these three subjects (directly, or via `isLoggedIn()`/`isAdmin()`).
- **`ImageUploadService`** owns a self-driving polling loop (`setInterval`, 1s) that lives as long as `pendingUploads` is non-empty — started lazily on first `addToQueue()` call, torn down automatically once the queue drains to zero. This state (and the interval itself) persists across route navigations within the same tab since the service is a root singleton — uploads queued on one page continue in the background if the user navigates elsewhere before they finish.
- **`SessionHistoryService`** and **`SpottingStorageService`** are both scoped to "however long this browser tab stays open" — no persistence layer, reset to empty on a hard reload. `SessionHistoryService` is reactive (`BehaviorSubject`); `SpottingStorageService` is not (plain fields, imperative getters).
- **`ThemeService`** is the one service in this scope with real cross-session persistence, via `localStorage` (survives reloads and new tabs) — populated at construction time (either from a "follow system" media-query snapshot or the last explicitly-saved theme name) and updated on every `toggleTheme()`/`followSystemColorScheme()` call.
- **`BuildInfoService`** fetches backend build info exactly once, at construction (app bootstrap) — never refreshed for the lifetime of the session, so a backend deploy that happens while a user's tab is open won't be reflected in the footer until they reload.
- **No NgRx / global store / signals** anywhere in this scope — every service is a hand-rolled `BehaviorSubject`-based mini-store, and `SpottingStorageService` isn't even that.

## Permissions, Roles & Flags

This is the authoritative description of the app's role model — **every other feature doc in this
set should link here rather than re-deriving it.**

There are **two independent Firebase-Auth-derived signals** and **one Firestore-derived signal**, and they are checked in three different places that do not all agree with each other:

1. **Firebase custom claims** — `admin: boolean` and `betaTester: boolean`, baked into the user's Firebase ID token server-side (set via the Firebase Admin SDK, presumably by some out-of-band admin tooling not present in this repo — no code in `rosak_firebase` or `rosak_backend` ever calls `auth.set_custom_user_claims`/`setCustomUserClaims`, so provisioning an admin/beta-tester today is a fully manual, out-of-repo operation). Read from the frontend via `AuthService.customClaims` (populated from `user.getIdTokenResult().claims`, `auth.service.ts:64-66`).
    - **Route guards** (`app-routing.module.ts`, using `@angular/fire/auth-guard`'s `hasCustomClaim`):
        - `/console` → `canActivate(adminOnly)` = `hasCustomClaim("admin")` (`:60-61,199`). If the claim is falsy, the `AuthPipe` resolves to `false` and — since it is **not** piped through `redirectUnauthorizedTo(...)` — the router simply cancels the navigation (the user is left wherever they were; no redirect page is shown).
        - `/situasi` → `canActivate(betaTesterOnly)` = `hasCustomClaim("betaTester")` (`:64-65,149`), same cancel-not-redirect behavior on failure.
        - `/tracker` → the equivalent `...canActivate(betaTesterOnly)` line is **commented out** (`app-routing.module.ts:165`) — `/tracker` is reachable by anyone with a direct link today, unlike `/situasi`, despite `AppComponent` gating the _nav menu entry_ for both identically on `betaTester` (see below). This is a real route-guard vs. nav-menu inconsistency, not just a doc gap.
        - `/profile` → `canActivate(redirectUnauthorizedToSpotting)` = `redirectUnauthorizedTo(["spotting"])` (`:56-58,215`) — any logged-out user hitting `/profile` is redirected to `/spotting` (the only route in this table that actually redirects rather than just blocking).
        - `/spotting`, `/spotting/:id`, `/insiden`, `/gallery`, `/about`, `/compliance` — **no guard at all**, fully public.
    - **Nav menu gating** (`app.component.ts:141-178`, subscribing to `AuthService.customClaims`): adds/removes menu entries for "Console" (`admin`) and "Situasi"+"Tracker" (`betaTester`) purely as UX — this is presentation-only and enforces nothing; the actual enforcement (where it exists) is the route guards above. A user who somehow knows a gated URL and passes its guard could always navigate there directly regardless of what's in the menu.
    - **Backend GraphQL `IsAdmin` permission class** (`rosak/permissions.py:43-52`) independently re-verifies the **same** `admin` custom claim (via a fresh `firebase_admin.auth.get_user(...)` call, not trusting the client-supplied ID token's cached claims) before allowing e.g. the `markAsRead` mutation. There is no backend equivalent permission class checking `betaTester` anywhere in `rosak_backend` — the beta-tester gate is **frontend-route-only**; any GraphQL operations that a beta-tester-only page happens to call are not further restricted server-side by that claim (only by whatever `IsLoggedIn`/`IsAdmin`/recaptcha checks the specific resolver itself declares).
2. **`AuthService.isAdmin()`** (`auth.service.ts:189-191`) — a convenience method reading the **same** custom-claims subject as the route guard above; consistent with it by construction.
3. **Firestore `users/{uid}.permissions.admin`** — a **completely separate** admin signal, read live by `AuthService`'s constructor-time Firestore watchdog and checked by `auth-permissions.ts`'s `isUserAllowed()` against a hardcoded `explicitlyAllowedPaths` map (today, only `"/console"`). This is **not** the same data as the Firebase custom claim used by the route guard and `isAdmin()` — a user could in principle have the Firestore `permissions.admin` flag set without the Firebase custom claim (or vice versa), and the two mechanisms would disagree (see Known Quirks for why this matters in practice).
    - Concretely, on **every** Firestore `users/{uid}` snapshot (including the very first one after login) and on **every** logout, `isUserAllowed(data, router.url)` is re-evaluated against the _current_ URL; if the current path is `"/console"` and the Firestore-based check fails, `AuthService` force-navigates to `""` — this runs independently of, and in addition to, the Firebase-custom-claim-based `adminOnly` route guard already gating entry to `/console` in the first place. In practice this means `/console` is effectively double-gated by two unrelated data sources that must **both** currently be satisfied (the route guard to enter, and this watchdog to _stay_) — except that nothing in this repo ever writes `permissions.admin` into Firestore, so in the app's current real-world operation the Firestore gate can only ever fail-closed for `/console` (see Known Quirks: this may mean `/console` is unreachable for anyone in practice, or that the Firestore doc is provisioned by tooling not in this repo — verify against live site/ops tooling).
4. **reCAPTCHA v3** — not a role/claim at all, but a per-action bot-defense gate: some mutations (e.g. `markAsRead`, `deleteEvent`'s backend permission list) require a passing `IsRecaptchaChallengePassed` check server-side, fed by a token the frontend obtains via `ReCaptchaV3Service.execute(actionName)` and attaches as a `G-Recaptcha-Response`/`g-recaptcha-response` header per call.
5. **No page/feature in this scope's own files is admin/beta-tester-gated in its template via `*ngIf`** — the pipes, `@util`, and most services are role-agnostic; the only in-scope permission logic lives in `AuthService`/`auth-permissions.ts`/`app-routing.module.ts`/`app.component.ts` as described above.

## Known Quirks / Tech Debt

- **`ErrorHandler` provider is broken — `GlobalErrorHandler` is dead code.** `app.module.ts:70-76` provides `ErrorHandler` with **both** `useClass: GlobalErrorHandler` and `useValue: Sentry.createErrorHandler({ showDialog: true })` on the same provider object. Angular's DI provider-resolution treats an object with a defined `useValue` as a value provider outright, so `useClass` is simply ignored — `GlobalErrorHandler`'s "Loading chunk N failed → toast + auto-reload in 3s" recovery logic (`error-handler.ts`) is never installed; only Sentry's own error handler (which shows Sentry's feedback dialog) runs. This should be split into two `multi: false` `ErrorHandler` providers (impossible — `ErrorHandler` isn't multi) or `GlobalErrorHandler` should be refactored to itself extend/delegate to `Sentry.createErrorHandler(...)` if both behaviors are actually wanted.
- **Two unrelated "admin" signals.** As detailed in Permissions above: the Firebase custom claim `admin` (route guards, `isAdmin()`, backend `IsAdmin`) and the Firestore `users/{uid}.permissions.admin` field (`auth-permissions.ts`'s `isUserAllowed`) are entirely independent data sources that happen to share a name and both currently only gate `/console`. Nothing in either repo writes the Firestore field, so it's unclear whether this mechanism is live, vestigial, or provisioned by out-of-repo tooling.
- **`/tracker`'s beta-tester route guard is commented out** (`app-routing.module.ts:165`) while `/situasi`'s equivalent guard is active and both routes are identically gated in the nav menu (`app.component.ts:157-173`) — likely an oversight, not an intentional "tracker is public" decision, but only the human maintainer can confirm intent.
- **`isUserAllowed`'s role check ignores the boolean value.** `auth-permissions.ts:33-45` does `Object.keys(permissionObj.permissions)` and treats the mere _presence_ of an `admin` key as sufficient — `{ permissions: { admin: false } }` would be treated identically to `{ permissions: { admin: true } }` (both grant access), since the code never reads the value, only the key name.
- **`ThemeService` and `SessionHistoryService` still carry `ng-devui`-era naming** post-migration (`844ee9e`): `localStorage` key `devuiThemeFollowSystemColorScheme`, theme names `"infinity"`/`"galaxy"` (ng-devui's own built-in theme identifiers), and `THistoryStore`'s `"spotting" | "mediaUpload"` union bear no direct devui link but the storage-key naming does — worth renaming in the Tailwind rewrite since these are no longer meaningful outside historical continuity with previously-set `localStorage` values.
- **`SessionHistoryService` doesn't use `sessionStorage` despite its name** — it's an in-memory-only `BehaviorSubject`, lost on every hard reload. If the intent was genuinely tab-session-persistent history, this is a bug; if the intent was "just this page-lifetime," the name is misleading.
- **`ImageCompressionService.ResizeImage` returns a `File` with the wrong MIME type** (`image-compression.service.ts:118` — uses `file.type`, the _original_ file's type, not `image/${format}`, the actual re-encoded format) — only correct when `format` happens to match the original's type (true in every current call site, which always passes the default `"jpeg"` against JPEG uploads, but a latent bug for any future call with a different `format`).
- **`ImageUploadService`/`spotting-form/form-upload.component.ts` cross-boundary import.** `services/image-upload.service.ts:5` imports the `ImageFile` type from a UI component file (`@ui/spotting/form-upload/form-upload.component.ts`) rather than a shared model — a service in `services/` depending on a component in `@ui/` is backwards from the app's general layering and worth fixing when the upload pipeline is rebuilt.
- **Inconsistent `Firebase-Auth-Key` header casing across call sites** — some use `"Firebase-Auth-Key"` (`image-upload.service.ts:76`), most use lowercase `"firebase-auth-key"`. Functionally irrelevant (HTTP header names are case-insensitive) but worth normalizing for consistency in the rewrite.
- **Duplicate `provideAnalytics(() => getAnalytics())` call.** Registered once unconditionally (`app.module.ts:92`) and again inside the `environment.production` block (`app.module.ts:108`) — harmless (Firebase's `getAnalytics()` is idempotent per app instance) but dead duplication.
- **Dead/unused code:** `AuthService.loginViaLoginFunction` (`auth.service.ts:51`, never read/written elsewhere); `AuthService`'s exported `CustomClaims` interface (declared, never used to type anything — `customClaims` itself is typed via Firebase's own `ParsedToken`); `VehicleStatusPipe`'s `NOT_IN_SERVICE` dictionary entry (unreachable given the typed `VehicleStatus` union, which has no such member); a commented-out `CONFIG`/`APP_VERSION` provider block in `app.module.ts:110-115`.
- **`ThemeService.ngOnDestroy()` is realistically dead code** — it's a `providedIn: "root"` singleton, and root-provided services are never destroyed during a normal SPA session (only on full page unload, at which point cleanup is moot), so the `matchMedia` listener removal it performs never actually runs in practice.
- **`imgur.ts`'s Imgur-URL assumption is a migration risk.** `getThumbnail()` hardcodes the `i.imgur.com` domain and Imgur's specific thumbnail-suffix convention; the current backend's `GenericUpload` view already uploads to a generic S3-compatible bucket (`common/views.py:17-27`, boto3 + `AWS_S3_ENDPOINT_URL`), so if production media has already moved (or moves during the rewrite) off Imgur, every consumer of `getThumbnail` needs a replacement strategy, not just a literal port.
- **`SpottingStorageService`'s `TGenericSeachField`** (`spotting-storage.service.ts:3-7`) has a typo in its name (`Seach` for `Search`) — cosmetic, but grep-worthy if renaming during the rewrite.

## Open Questions / Verify Against Live Site

- **Is `/console` actually reachable by anyone today?** Since no code in either repo ever writes `permissions.admin` into a Firestore `users/{uid}` document, and `AuthService`'s watchdog force-navigates away from `/console` whenever `isUserAllowed()` fails, it's unclear whether real admins currently rely on some out-of-repo tool/console-side manual Firestore edit to make this work, or whether this code path is effectively unreachable/vestigial in production. Worth confirming with whoever administers the live Firebase project.
- **Is the commented-out `/tracker` beta-tester guard (`app-routing.module.ts:165`) intentional?** I could not determine from the code/history alone whether `/tracker` is meant to be public today or whether this is a forgotten re-enable — worth asking the maintainer or checking whether an unauthenticated/non-beta browser session can currently load `/tracker` on the live site.
- **How and where are the `admin`/`betaTester` Firebase custom claims actually set?** No script, Cloud Function, or admin UI for setting custom claims exists in either `rosak_firebase` or `rosak_backend` (checked `rosak_backend/dev_permissioner.sh` on this lead — it turned out to be an unrelated dev-environment `chown`/filesystem-permissions script, not a claims tool). Presumably done via the Firebase Console or tooling outside both repos.
- **Firestore security rules for `users/{uid}`** — no `firestore.rules` file exists in this repo (same gap noted in the sibling `about.md` doc for `public/about`), so I cannot confirm from static code who can read/write the `permissions` field, or whether a client could tamper with their own `users/{uid}` document to self-grant `permissions.admin` (which — per the analysis above — wouldn't grant real `/console` access since the route guard depends on the separate, server-controlled custom claim, but would still affect what `isUserAllowed()` computes for that user's session).
- **Exact wording/placement of toast/notification copy** — I traced every `ToastService.addToast`/`addMessage` call site's message strings from source, so these should be accurate, but the actual on-screen visual placement (`getPlacement()`'s `<1024px → bottom` threshold) and stacking/animation behavior is ng-zorro's default rendering, which I did not visually verify.
- **`src/build.ts` real contents on a production deploy** — the checked-in file holds placeholder test values (`"<<This is a test build>>"`); I could not verify what the `angular-build-info` CLI actually populates it with on a real CI build (real git hash/branch/version) since that only happens as part of the `buildProd`/`buildStaging` npm scripts running in CI, not in this static checkout.
- **No mechanism for granting custom claims/Firestore permissions was found in either repo** — ruled out `dev_permissioner.sh` (see above). This is likely a manual, out-of-repo Firebase Console operation; worth confirming with the maintainer rather than searching further in code.
