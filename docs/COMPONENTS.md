# System Component Registry & Architecture Map

_Compiled from `docs/components/*.md` — covers all 12 top-level features under `src/app/features/`.
This file is topology + feature index; per-feature interfaces, state, and extension points live in
those docs._

## High-Level System Topology

The app is a single Angular (standalone components, Signals-first) frontend with three parallel
integrations — most features use one; several straddle two:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Angular Feature Pages (src/app/features/*)                             │
│  home · gallery · gdpr · about · methodology · spotting · profile ·     │
│  console · insiden · station · tracker · not-found                      │
└───────┬───────────────────┬───────────────────┬─────────────────────────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────────────────┐
│ Shared Core    │   │ Firebase SDK   │   │ External / static feeds   │
│ Services       │   │ (direct)       │   │                            │
│ (src/app/core) │   │                │   │                            │
│                │   │                │   │                            │
│ GraphQLClient /│   │ Firestore      │   │ GTFS-realtime protobuf     │
│ graphqlResource│   │ onSnapshot     │   │ feeds (per-operator)       │
│ AuthService    │   │ (public/gdpr,  │   │ GTFS-static stops.txt      │
│ RecaptchaService│  │  public/about) │   │ (via /api/gtfs-proxy,      │
│ ImageUploadSvc │   │ Firebase       │   │ CORS workaround)           │
│ (+IndexedDB Q) │   │ Storage        │   │ Railway GeoJSON overlay    │
│ ThemeService   │   │ (tracker       │   │ (Firebase Storage)         │
│ observeHeight  │   │  railway file) │   │ thecatapi/dog.ceo (404 pg) │
│ PushService    │   │ Messaging      │   │                            │
│ (web push)     │   │ (web push)     │   │                            │
└───────┬────────┘   └────────────────┘   └────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│ Django / Strawberry GraphQL    │   one legacy REST endpoint:
│ backend (rosak_backend)        │◄──operation/line_vehicles_status_
│ spotting · profile · console · │   trend_count (spotting's
│ insiden query/mutate here      │   VehicleStatusTrendComponent —
└────────────────────────────────┘   no GraphQL equivalent exists yet)
```

**Cross-cutting UI layers** used by nearly every feature: `src/app/ui/*` (Spartan/Helm primitives —
button, badge, skeleton, sheet, table, toast…, plus `app-avatar` and `app-external-link-icon`),
`src/app/domain-ui/*` (status badges, activity heatmap — thin wrappers over the shared enums in
`core/graphql/types.ts`), and `src/app/shell/*` (page chrome: `AppNavComponent`,
`AppFooterComponent`, account panel, compact nav, offline strip). `shell/nav-config.ts` holds the
one `NAV_LINKS` module list (the compact nav renders it minus the active module) and the one
`CONSOLE_LINKS` list; the logo (`<svg app-brand-logo>`), the "Report a bug" button
(`<button app-report-bug-button>`) and the admin Console hover menu (`<div app-console-menu>`) are
shared by `<app-nav>` and `<app-compact-nav>`, so a change to one reaches both. `HlmSheet` stays mounted once it has
opened. While it is closed its focus trap is off and its panel is `inert`, so nothing in it can take
focus or reach a screen reader, and a host whose control had focus moves focus back to its opener
itself.
Every open `HlmSheet` holds the root `ScrollLock` (`ui/sheet/scroll-lock.ts`) once, so the page
unlocks only when the last open sheet lets go, whatever order they open and close in. The scrim is
`z-[48]`: above the sticky nav (`z-[45]`) and under the `z-50` panel, so it dims the nav.
`HlmButton` defaults a `<button>` to `type="button"` (an `<a>` gets no `type`); a submit button says
`type="submit"`. `HlmIconButton` (`<button hlmIconBtn aria-label="…">`, `ui/icon-button/icon-button.ts`) is the bare
round icon-only button (`size-8`, hover tint, focus ring, always `type="button"`) behind the nav sheets' "Close"
buttons, the console incident Close buttons (`insiden/links`, `insiden/pending`) and `<button app-report-bug-button>` (a host directive there); a consumer `class` (`size-7`, `-mr-1.5`)
overrides its defaults through `hlm()`. It needs `aria-label` or `aria-labelledby` and logs a dev-mode
`console.warn` without one; `hlmBtn size="icon"` stays the bordered/filled form. There is no Helm primitive yet for
dropdown menu panels, segmented filter chips or dashed empty-state boxes: those stay hand-written class strings
(and `media-viewer` still carries its own icon-button string).

`HlmCard`, `HlmCardContent`, `HlmSkeleton` and `HlmTr` merge a consumer `class`
through `hlm()`, so a `gap-3 p-4` or `rounded-full` on them wins; the other card and table parts keep
static host classes (known conflicts, handled by the consumer: `!text-end` on `hlmTh` in the incident
history table, `flex-row` on `hlmCardHeader` on the about page). `styles.css` defines `--success`, `--warning` and `--info` with `-foreground`
variants, light and dark, as `bg-success`, `text-info-foreground` and so on: `--X` is the accent for
an icon, dot, fill or large text, `--X-foreground` is small text on a `bg-X/15` tint (not on a solid `bg-X`, unlike `--primary-foreground`). Red is the
existing `--destructive`. Badge variants, toast icons, the home hero and the vote buttons use them;
other components still use raw palette utilities.

**Cross-cutting core** (`src/app/core/*`, no per-feature doc):

- `core/graphql/`: `graphqlResource()` reads (`data()` and `errors()` never throw; `data()` keeps the
  last good payload while the SAME request fails or retries, and a changed request clears it) and
  `GraphQLClient.request` writes. `toastSubmitFailure(toast)` is what a form's submit `catch` calls
  for any error the client did not already toast, before rethrowing to Sentry. A `graphqlResource`
  read is anonymous (`ANONYMOUS`) unless it passes `{ authenticated: true }`, which waits for
  `AuthService.whenReady` before its first request (once; it does not refetch on sign-in or
  sign-out) and is then signed by the auth interceptor (`core/http/` below). `GraphQLClient.request`
  is signed for a signed-in viewer; call sites pass no token. `request()`'s fourth argument takes
  `timeout` (ms, handed to `HttpClient`, which then rejects with a status-0 `HttpErrorResponse`),
  `quiet` (no "GraphQL Error" toast from the client, for a background caller that toasts itself;
  Sentry still gets it) and `anonymous` (sent with `ANONYMOUS`, for a continuation page of an
  anonymous `graphqlResource` list: home feed, gallery, links tab, incident card links).
- `core/http/auth.interceptor.ts` (eager, registered in `app.config.ts`): `authInterceptor` adds
  the signed-in viewer's Firebase ID token as `firebase-auth-key` to every request whose URL starts
  with `backendGraphqlUrl` or `backendUrl`, and sets `transferCache: false` on it (the SSR transfer
  cache keys on method, URL and body, not headers, so it would answer a signed-in viewer with the
  server's anonymous render). It reads `AuthService` through the `AUTH_SESSION` token, which the
  service fills when it starts, because importing the service would put Firebase Auth in `main`.
  A signed-out viewer's request goes out at once and unsigned; a failed token refresh fails the
  request with Firebase's error before anything is sent. A public read opts out with
  `new HttpContext().set(ANONYMOUS, true)` (the footer's backend version, the vehicle status trend).
  The AI service's `Authorization: Bearer` call to its own API is not a backend request and keeps
  its own token.
- `core/auth/`: `AuthService` (lazy, with Firebase Auth). `whenReady` resolves once Firebase has
  restored or ruled out a session, also when the admin claim cannot be read (offline with an
  expired token: `isAdmin` stays `false` and the error goes to the `ErrorHandler`). Every auth
  state change runs `claimSessionDrafts(uid)` (see `core/util/` below).
- `core/sentry/`: Session Replay is a dynamic `import()` after bootstrap, at idle (`main.ts`). The
  "Report a bug" widget loads on first use through `FeedbackService.openForm()` (browser only; one
  shared in-flight open; the current theme is applied on every open). Both load `?lazy` private
  copies of the Sentry packages, and `scripts/check-sentry-lazy.mjs` (end of `npm run generate`)
  fails the build if first-load code names replay or feedback.
- `core/upload/`: `ImageUploadService.triggerUpload` is the only place an image leaves the device.
  Right before the `FormData` is built, `withoutGps()` runs `stripGps` (lossless Exif GPS removal for
  JPEG, TIFF and PNG) once per queued file. `PhotoPickerComponent` accepts every image (`image/*` or an
  empty type); formats `stripGps` cannot clean (HEIC, WebP, AVIF, ...) upload as they are, GPS
  included, by the owner's choice.
- `core/export/`: file downloads of data the page already holds. `csv.util.ts` (`toCsv` is pure and always
  emits a header row; `downloadCsv`) and `json.util.ts` (`downloadJson`) share one contract: the platform
  flag is a parameter and the download is a no-op on the server. Consumers: home's Pro lines widget (CSV),
  profile's spotting history (CSV and JSON) and tracker's info panel (CSV).
- `core/time/kl-date.ts`: `klDateKey(now?)`, the Asia/Kuala_Lumpur `YYYY-MM-DD` (fixed UTC+8, the
  same in every zone), is the one "today" for `/insiden`, its calendar and the link list.
- `core/network/`: `OnlineService.isOnline` (root signal: `navigator.onLine` at startup, then the
  window's `online`/`offline` events; always `true` on the server). `false` is reliable, `true` only
  means a network exists. Read by `OfflineStripComponent` (`shell/offline-strip/`: a slim
  non-blocking "You're offline" line under `<app-nav>` and at the bottom of `<app-compact-nav>`; its
  host is a permanent `role="status"` `aria-live="polite"` region, empty while online) and by
  `NewVersionService`. `PollingSource` (`core/polling/`) reads `navigator.onLine` itself, the way it
  reads `document.hidden`: offline pauses the beat, and the `online` event refreshes at once (not
  while hidden, never for a "Never" beat).
- `core/offline/`: `ReportOutboxService` (root, lazy), the outbox for line status reports the
  server could not take (audit F211). Storage is `localStorage` key `rosak:report-outbox:v1`, because
  it must survive a killed tab and holds at most one small entry per line; IndexedDB was not used,
  since `core/upload/upload-queue-db.ts` is hard-wired to one store of photo records.
  `enqueue(report, statusWindowMinutes)` keeps one entry per line (latest wins) and records
  `queuedAt`, the Firebase uid and the line's own `statusWindowMinutes` from the board. The backend
  stamps a report on arrival and takes no client time, so an entry is dropped once it is older than
  that window, the longest it could still have counted had it arrived on time.
  `REPORT_OUTBOX_FALLBACK_WINDOW_MINUTES` (15) is a frontend fallback for a caller that did not know
  the window, not a copy of the backend's. `flush(send)` first awaits `AuthService.whenReady`,
  outside its busy flag and the Web Lock, so a slow session restore blocks no other flush. It then
  runs only online, one at a time, inside the Web Lock `rosak:report-outbox` where the browser has
  one (so two tabs that reconnect together send a report once), and re-reads storage first. It drops
  expired entries with a toast to the account that queued them. For the signed-in account only, it
  then sends the rest oldest first through the caller's sender. `isRetryableSendFailure(err)`, which
  the line-status sheet also uses to decide what to queue, keeps the entry and everything after it
  for the next try on a status-0 `HttpErrorResponse` (a dead link or a request timeout),
  502/503/504 or `auth/network-request-failed`; that is not rethrown, since the submit that queued it
  already reached Sentry. Any other answer drops the entry and toasts why: a `GraphQLRequestError`
  (the server's message), a payload that is not `ok`, or another HTTP error, which also goes to the
  `ErrorHandler`. An empty outbox returns before the session wait and the lock, so the home route can
  flush on every board beat for the price of one storage read.
  `core/` cannot import the feature's mutation, so the service registers no trigger of its own. The
  home route registers one (`features/home/data/report-outbox-flush.ts`, see
  [home](components/home.md) → Line-status sheet). `app.routes.spec.ts` keeps `core/offline/` out of
  the initial bundle.
- `core/push/`: web push alerts for a rider's lines (audit F294), every file lazy.
  `PushService` (root, `push.service.ts`) keeps this browser's FCM token and the lines registered
  with it in `localStorage` key `rosak:push:v1` (`push-storage.ts`, through the web-storage
  wrappers; nothing is stored while no line has alerts, so "a token is stored" means "alerts are
  on"). `availability()` is, most blocking first, `unconfigured` (no VAPID key), `install` (a tab
  on iOS or iPadOS: `navigator.standalone === false` with touch points), `unsupported`, `blocked`
  (permission denied), `signed-out` or `ready`. The permission is read again on every tap
  (`syncPermission()`, which the bell and `subscribe` call), because the rider can change it in the
  site settings at any time. `subscribe(line)` calls `Notification.requestPermission()` (unless
  already granted) before its first `await`, because the prompt needs the tap's user activation,
  then `getToken(messaging, { vapidKey })` and `registerPushToken(token, lineIds)` with the FULL list
  (the backend replaces it).
  `unsubscribe(lineId)` re-registers the rest, or calls `unregisterPushToken(token)` once none is
  left, and `turnOff()` unregisters. State changes only after the backend said `ok`. A failure is
  toasted and reported, never thrown. A `storage` event for the key from another tab replaces the
  in-memory state, so a sign-out there (or a bell tapped there) is this tab's state too. Firebase
  Messaging is a further dynamic `import()` on first use, loaded once for the token and the
  listener, and `firebaseApp()` reuses the app that Auth created. A visible tab gets no system
  notification, so `onMessage` shows an info toast with the title, the body and an "Open" link
  (`ToastService.info(title, description, link)`). The link opens on this origin:
  `linkOnOrigin(link, origin)` keeps the path, query and fragment, because the backend's
  `FRONTEND_BASE_URL` need not be the site the rider is on (a staging or preview origin).
  - `push-loader.ts`: `FCM_VAPID_KEY` (token, from `environment.fcm.vapidKey`) and
    `injectPushService()`, the only way a control reaches the service: a signal that is `null` until
    a dynamic import lands after the first render and `AuthService.whenReady` has resolved (so a
    signed-in rider is never offered the sign-in while Firebase restores the session). In a build
    without a key it loads nothing and stays `null`. Consumers: home's alert bell on pinned rows and profile's Alerts card.
  - `AuthService` drives two hooks through its own dynamic import, and only when a token is stored:
    `resume()` after a sign-in reads `pushSubscription(token)` once (the backend's lines win, and
    `null`, an unknown token or another account's, clears them; offline or on a failed read the
    stored lines stand). With permission granted it starts the foreground listener and, when the
    backend still has lines, asks the SDK for the current token: a token FCM replaced is registered
    with the same lines, quietly. `forget()` runs before `signOut`, because `unregisterPushToken`
    needs the session that registered the token. It clears the stored state at once and awaits
    nothing: it asks for the ID token while that account is signed in and sends the unregister
    when the token arrives, so an expired token's refresh on a dead link cannot hold the sign-out.
  - The backend sends one notification per device for a newly approved MAJOR incident on any line
    that device follows (one, however many of the incident's lines it follows), and at most one
    push per line every 30 minutes, with `webpush.fcm_options.link` set to
    `{FRONTEND_BASE_URL}/insiden/<start date>` (`rosak_backend/docs/components/incident.md` → Web
    push). That rule is published as the
    `incidents.push-alerts` metric. `app.routes.spec.ts` keeps `core/push/` out of the initial
    bundle.
- `core/util/dom-event.util.ts`: `eventValue(event)`, the typed `$event.target.value` for an `input`
  or `change` handler. A component exposes it as `protected readonly eventValue = eventValue` and the
  template calls `eventValue($event)`, so no template needs `$any`.
- `core/util/web-storage.util.ts`: `readStorageItem` / `writeStorageItem` / `removeStorageItem` over
  `"local" | "session"`, the try/catch wrappers `PreferencesService` keeps for itself (a failed read
  is `null`, a failed write or removal is dropped). Used by the outbox, the line alerts and the two
  report drafts (home's line-status sheet, spotting's report form), which live in `sessionStorage`
  under `SESSION_DRAFT_PREFIX` (`rosak:draft:`). A draft is one account's typing: `claimSessionDrafts(uid)`
  records the uid this tab's drafts belong to (`rosak:draft-owner`) and removes every draft when a
  different account, or nobody, is signed in, so a sign-out in another tab still counts once this
  page restores its session; a draft saved while signed out survives the sign-in.
  `readSessionDraft(key, uid)` hides a draft recorded for another account, for the moment before a
  new page knows who is signed in.
- `core/version/`: `NewVersionService` polls `/version.json` every 10 minutes while online
  (`cache: "no-store"` plus an `ngsw-bypass` header, so neither the HTTP cache nor the service worker
  answers it) and prompts for a reload on a failed same-origin chunk only.
  `promptReloadForNewVersion()` (also called by `AppErrorHandler` for router chunk errors) checks
  `OnlineService` first: offline it toasts "You're offline. This page needs a connection." on every
  failed attempt. Online it asks `/version.json` (5 s timeout) before blaming a deploy, because in a
  tunnel `navigator.onLine` stays `true` on a link that carries nothing. No answer gives the same
  offline toast, this build's hash gives "This page couldn't load. Check your connection and try
  again.", and only a different hash sets `hasNewVersion` and lights the update button. That
  button's click (`reloadForNewVersion()`) clears Cache Storage, the worker's precache included,
  and reloads. Offline it does neither and toasts "You're offline. Reconnect to load the new
  version." instead.
- **Installable app and service worker** (no `core/` module):
  - `public/manifest.webmanifest`: "MLPTF", `display: standalone`, `start_url: "/"`, background and
    theme `#fafcff` (the light `--background`). Icons in `public/icons/`: 192 and 512 PNG, a
    maskable 512 and an opaque 180 `apple-touch-icon.png` (iOS paints transparency black). They
    were rasterised once from `favicons/default.svg` and are not regenerated like `favicon.svg`, so
    re-rasterise them by hand if the logo changes. `src/index.html` links the manifest and the touch
    icon and sets two `theme-color` metas (`#fafcff` light, `#080e16` dark). They follow the OS
    scheme, not an in-app `ThemeService` override.
  - `app.config.ts` registers `ngsw-worker.js` with `provideServiceWorker`: `enabled: !isDevMode()`,
    `registrationStrategy: "registerWhenStable:30000"`, never on the server. Only `angular.json`'s
    production configuration sets `"serviceWorker": "ngsw-config.json"`, so `ng serve` and the e2e
    dev build have no worker.
  - `ngsw-config.json`: group `app` prefetches `/*.css`, `/*.js` (all hashed; about 1.7 MB gzip
    today, more than half of it the tracker chunk) and `/index.csr.html`, the CSR shell, but not
    `/firebase-messaging-sw.js`, which the browser fetches itself as a worker script. Group
    `media` caches images lazily. `navigationRequestStrategy` is `freshness` with the default
    `navigationUrls`, so every navigation goes to the network first and SSR answers it. Only when
    that request fails does the worker serve the cached CSR shell. The SSR HTML itself is never
    cached. `index` must stay `/index.csr.html`: `ng build` overwrites it with the CSR shell's name
    whatever the config says, so a static offline page cannot be the fallback. There is no data
    group: GraphQL reads are POSTs and ngsw caches only GET and HEAD, so the board has no offline
    data yet. `src/app/ngsw-config.spec.ts` runs the real ngsw generator over a fake build output
    to pin these rules.
  - Offline, in-app navigation to a lazy route works from the precache. A full reload or a cold
    open offline (the home-screen icon included) boots the app from the CSR shell, the path
    `RenderMode.Client` routes already take: the nav and the offline strip render, reads show their
    error states, and the `online` event refreshes the board on reconnect. Until the worker has
    installed and finished its prefetch (a first visit: up to 30 s, then the download), an offline
    reload still gets the browser's own error page.
  - `src/server.ts` serves `browser/` with a one-year `max-age`, except the files
    `staticCacheControl()` (`src/server-cache-control.ts`) lists: the worker files (the FCM worker
    too), `ngsw.json`, the web app manifest, `icons/`, `index.csr.html` and `version.json` get
    `no-cache`, since their names survive a deploy.
  - **A second worker, for web push only:** `public/firebase-messaging-sw.js`. It is generated on
    every `npm run generate` by `scripts/generate-firebase-config.mjs` (builder
    `scripts/firebase-messaging-sw.mjs`, spec `src/app/firebase-messaging-sw.spec.ts`) and
    gitignored, like `favicon.svg`, because a worker cannot import the app and needs the Firebase
    config as literals. It loads the compat SDK of the installed `firebase` version from
    `www.gstatic.com` through `importScripts` (the one external script the app loads this way) and
    calls `firebase.messaging()`, which shows a notification that arrives while no tab is visible.
    Its own `notificationclick` handler runs before the SDK's: it focuses a tab already on the
    alert's page, or opens it, always on this origin (the link's path, query and fragment, built
    with URL setters so a `//host` path stays a path). The SDK registers the file on the first
    `getToken()` at its default scope `/firebase-cloud-messaging-push-scope`, so the worker
    controls no page and never meets `ngsw-worker.js` at `/`. `ng serve`, which has no ngsw, serves
    it too.
  - **To turn the line alerts on:** in the Firebase console, open Project settings, then Cloud
    Messaging, then Web Push certificates, and generate a key pair. Paste the public key as the
    value of `FCM_VAPID_KEY` in `apphosting.yaml` (and in `apphosting.staging.yaml` for staging).
    The key is public, because the browser receives it. `scripts/generate-runtime-config.mjs` writes
    it into `environment.fcm.vapidKey`. While it is empty, every bell is an aria-disabled "Alerts are
    not set up yet", the profile has no Alerts card, and no push code is downloaded. Locally,
    `FCM_VAPID_KEY=<key> npm start` turns them on. The backend must send from an https
    `FRONTEND_BASE_URL`, and its Celery worker needs the same `GOOGLE_APPLICATION_CREDENTIALS` as
    the API.
  - `@angular/service-worker` declares the exact `@angular/core` version as a peer dependency: bump
    it together with the other `@angular/*` packages.
  - **To disable it:** remove `"serviceWorker"` from `angular.json` and `provideServiceWorker` from
    `app.config.ts`, then deploy. An installed worker that gets a 404 for `/ngsw.json` (the app's
    not-found page) deletes its caches and unregisters itself. `enabled: false` alone is not
    enough: it stops new registrations but leaves installed workers running. In an emergency,
    serve the emitted `safety-worker.js` as `ngsw-worker.js`: it unregisters itself and clears the
    caches.
- **Sheet hosts** (home, `/insiden`, `/spotting`, every Situasi tab) mount the form of a closed sheet
  behind `@defer (when <sheet>.isOpen(); prefetch on idle)`, so its reads stay out of SSR and
  TransferState. Footers reach the form through a string-locator `viewChild`, null-safe.
- **Unit-test isolation** (no `core/` module): `@angular/build:unit-test` runs Vitest with
  `isolate: false` (its default; `ng test --isolate` flips it, at roughly three times the run time
  here). One worker process then runs many spec files on ONE jsdom window (DOM, storage,
  `location`, `navigator`, `URL`) and ONE module cache. Vitest runs the previous run's failed and
  slowest files first, so a leak shows up as a flake in an innocent file that passes alone or on a
  rerun. Rules that keep the suite independent of file order:
  - Restore what a spec changes: spy (`vi.spyOn`, then `vi.restoreAllMocks()`) rather than define
    and `delete`. Never delete `URL.createObjectURL`: the test DOM's `URL` has its own, which
    converts a jsdom Blob for Node, and without it `mapbox-gl` (loaded by the L7 specs) throws
    `The "obj" argument must be an instance of Blob` at import.
  - `src/test-setup.ts` empties the toast list before every test: ordinary app code writes to that
    process-wide store, so specs are not asked to clean up after it. It also lifts Vitest's limits
    of 5 s a test and 10 s a hook to 15 s and 30 s, because a component's first render takes up to
    8 s when the machine is busy. `vi.waitFor` keeps its own 1 s default (`vi.setConfig` cannot
    change it): pass `{ timeout }` where a wait covers a slow first render.
  - A spec that `vi.mock`s a module starts with `vi.hoisted(() => vi.resetModules())` and ends with
    `afterAll(() => vi.resetModules())`. Mocks are per file, the module cache is not: without the
    first, the unit under test keeps the bindings of whichever file loaded it first (a Sentry
    assertion that never fires); without the second, the next file gets modules still bound to
    these mocks. Where the unit has a DI seam (`LOAD_FEEDBACK`, `UPLOAD_ERROR_REPORTER`), stub it
    through TestBed instead of mocking the module.
  - `src/test-hygiene.spec.ts` fails the suite for a spec that calls `vi.mock` without that pair or
    deletes a member of `URL`. It reads spec source with regexes, so a leak written another way
    slips past: chase those with the seeded single-worker run below.
  - To chase an order-dependent failure, run one worker in a fixed or seeded order with a
    throwaway `--runner-config` file: `test: { maxWorkers: 1, fileParallelism: false }` plus
    `sequence: { sequencer }` (a class whose `sort(files)` returns the order) or
    `sequence: { shuffle: { files: true }, seed: 11 }`.
- **Contract and accessibility specs**: `core/graphql/documents.spec.ts` validates every query and
  mutation string in the `*.queries.ts` / `*.mutations.ts` modules under `src/app` against
  `core/graphql/schema.graphql`, a snapshot of the backend SDL, and checks that each string-literal
  union named after a schema enum, in `core/graphql/types.ts` or a feature `*.queries.ts`, lists that
  enum's values (lowercase stored TextChoices spellings are ignored on purpose). After a
  backend schema change, run `npm run schema:refresh` (needs the Docker backend; set
  `ROSAK_BACKEND_COMPOSE` outside `../rosak_backend`) and commit the snapshot: the spec is only as
  fresh as the last refresh, and nothing in CI compares it with the backend yet. A known mismatch is
  listed in the spec's (now empty) `KNOWN_DRIFT` map and runs as `it.fails`. `src/testing/axe.ts` exports
  `expectNoAxeViolations(fixture)`; `src/testing/naive-myt.ts` holds the naive Kuala Lumpur time fixtures (`naiveMyt`, `mytInstant`, `SPEC_ZONES`): axe-core with structural rules only (names, roles, ARIA, forms,
  list structure); jsdom has no layout, so contrast and target size belong to the browser passes.
  Await it after `detectChanges()`.

**Content models coexist by design:**

- **GraphQL-backed, dynamic:** home, spotting, profile, console, insiden, station —
  user/admin-generated data, queried live from the Django backend.
- **Firestore-backed, hand-edited CMS:** gdpr, about — single documents (`public/gdpr`,
  `public/about`) edited by an admin outside the app, streamed via `onSnapshot`. Same pattern in
  both (private `_data` signal + `computed()` projections + manual subscribe/`ngOnDestroy`
  unsubscribe).
- **Code-first static content:** methodology — `/methodology` reads a typed TypeScript registry
  (`src/app/core/methodology/`: `methodology.constants.ts` + `methodology.content.ts`), is
  `RenderMode.Server` for indexability, and is neither Firestore nor GraphQL-backed in v1. The same
  registry feeds every `app-info-popover`, so page and tooltips cannot drift.
- **tracker** is the outlier: no app-backend involvement — it polls third-party GTFS feeds directly.
- **gallery** and **not-found** are the purely read/decorative leaves — gallery reads the GraphQL
  backend read-only; not-found only calls cosmetic third-party image APIs.

## Initial bundle

`angular.json`'s production budget fails the build when the **initial total** passes 1 MB: `main`,
every chunk it imports statically, and `styles.css` (Angular counts 1 kB as 1000 bytes). The 500 kB
warning always fires and is accepted. Never raise the error budget; move the import instead. To see
what is initial, run `npx ng build --stats-json` and walk `dist/web/browser-stats.json` (an esbuild
metafile) from `main-*.js` through its `import-statement` imports. The list below sums the
metafile's per-input `bytesInOutput`, which overstates the emitted size by about a fifth; "Last
measured" quotes the file sizes the build prints.

**Eager, and why** (2026-10-22):

- The framework, about 517 kB: Angular core, common, platform-browser, router and service worker,
  rxjs and Spartan Brain (the toaster), behind `App`, `app.config.ts` and its app initializers.
- Sentry's base SDK, about 200 kB (`@sentry/core` 112 kB, `@sentry/browser` 43 kB,
  `@sentry/browser-utils` 39 kB, `@sentry/angular` 6 kB): `main.ts` calls `Sentry.init()` before
  bootstrap and `AppErrorHandler` wraps `Sentry.createErrorHandler()`. Replay and feedback are lazy
  (`core/sentry/`).
- `marked` 53 kB and `ngx-markdown` 16 kB: the root `provideMarkdown()` in `app.config.ts`, though
  only `IncidentCardComponent` renders markdown (on `/insiden`, the spotting line page's insiden
  tab and `/console/insiden/pending`).
- `@angular/forms` 48 kB and `ng-recaptcha-2` 4 kB: the root ng-recaptcha-2 providers in
  `app.config.ts`, though only `ConsolePage` (`/console/spotting`) injects `ReCaptchaV3Service`.
- Firebase app, analytics, installations and their helpers, about 57 kB: `AnalyticsService`, which
  `App` injects. It touches the SDK only after the first render, but imports it statically.
- About 21 kB of app code: the services the app initializers start (new-version check, scroll
  memory), the analytics service, the route strategies, the toaster, the nav progress bar, theme,
  network state, the auth interceptor and the environment.

Everything else is lazy, the front page included (`features/home/home.routes.ts`, see
[home](components/home.md) → Route). So are the shell (the pages import it), `AuthService` with
Firebase Auth (a shared chunk of about 91 kB), `GraphQLClient`, `PreferencesService`, the
methodology registry and the report outbox. A static import of any of them from `main.ts`,
`app.config.ts`, `app.routes.ts` or anything they import moves it into `main`. `app.routes.spec.ts`
walks the static imports from `main.ts` and fails when it reaches `features/`, `shell/` or
`core/{auth,graphql,preferences,methodology,offline,push}/`.

**Last measured** (`npx ng build`, 2026-10-22, after the home route's providers moved out of
`app.routes.ts`):

- `Initial total | 997.74 kB | 260.00 kB` became `Initial total | 841.90 kB | 223.49 kB`.
- `main` went from 393.21 kB to 237.37 kB. The other initial files did not change: Angular core,
  common, platform-browser and rxjs 276.42 kB, router and Spartan Brain 133.45 kB, `@sentry/core`
  91.76 kB, `styles` 100.88 kB and a 2.02 kB shared chunk.
- Lazy: the front page's chunk is 174.80 kB (page, store and queries; the page alone was 142.53 kB),
  and four shared chunks are new: `@firebase/auth` 91.08 kB, the methodology registry 20.45 kB,
  `PreferencesService` 4.43 kB and `GraphQLClient` 3.02 kB. The `@ng-icons/core` chunk grew from
  8.23 kB to 10.60 kB, and every other lazy chunk by 0.05 to 0.12 kB of import lines.
- A cold load of `/` fetches the same code in more files (headless Chromium against the local API,
  idle prefetches included: 42 files and 1,452,540 bytes before, 46 files and 1,450,760 bytes
  after). `/insiden` fetches 36 kB less (1,422,438 bytes before, 1,386,281 after). The SSR HTML of
  `/` and `/insiden` is the same.
- At `0a57ec4`, with the later packages merged, the table reads
  `Initial total | 842.04 kB | 223.51 kB`. `main` is unchanged at 237.37 kB, and `styles` grew from
  100.88 kB to 101.01 kB.
- The typical week in a line's expanded panel (`line-week-profile`, its util, query document and two
  registry tokens), measured on `c14b955` (the push and station packages merged) and on the branch:
  `Initial total | 843.51 kB | 223.94 kB` became `843.67 kB | 224.00 kB`. All of the 0.16 kB is
  `styles` (101.38 kB to 101.54 kB); `main` stays 238.08 kB. The front page's lazy `home-routes` chunk
  grew from 193.00 kB to 201.00 kB (40.23 kB to 41.99 kB transferred).
- At `28bc9b2`, the final gate of the feature pass (Prettier clean, 222 test files and 3481 tests
  passed), the table reads `Initial total | 843.67 kB | 223.93 kB`, and the budget warning reports
  `total of 843.42 kB`, which leaves about 156 kB under the 1 MB error budget. That is 1.63 kB above
  the 842.04 kB at `0a57ec4`, and the wave 2 packages account for all of it: the station page 0.20 kB
  (`842.24 kB`), the line alerts 1.27 kB (`843.51 kB` with the station page) and the typical week
  0.16 kB, all of it `styles`. The typical week bullet above quotes 224.00 kB for the transfer size
  from that package's own build, and the gate printed 223.93 kB.
- At `a1134965`, the tip of the audit quality pass (265 test files and 4035 tests passed), the table
  reads `Initial total | 840.33 kB | 224.58 kB`, which is 3.34 kB below the 843.67 kB at `28bc9b2`.
  Limiting Tailwind's source detection to `src/` (F404) took 5.28 kB off `styles` (the total read
  838.39 kB right after it), and the later packages added 1.94 kB, the last 0.45 kB of it from the auth
  interceptor package (839.88 kB before it).

**Next candidates**, smallest risk first:

1. Markdown: `provideMarkdown()` without options provides only `MarkdownService`, so listing it in
   `IncidentCardComponent`'s `providers` (one cheap service per card) moves about 69 kB out of
   `main`.
2. reCAPTCHA: provide `RECAPTCHA_V3_SITE_KEY`, `ReCaptchaV3Service` and `RecaptchaLoaderService`
   on the console's `spotting` route. That moves about 52 kB, `@angular/forms` included (nothing
   else eager imports it).
3. Analytics: `AnalyticsService` already waits for the first render and `isSupported()`. Load
   `firebase/analytics` with a dynamic import inside its `start()` and the SDK leaves `main`, about
   57 kB.
4. Sentry: the largest, about 200 kB, and the riskiest. Deferring `Sentry.init()` needs a buffer
   that keeps errors thrown before it loads and flushes them into Sentry, an `ErrorHandler` that
   works before and after, and `scripts/check-sentry-lazy.mjs` kept green.

## Component Catalog

All features are Angular presentation layers under `src/app/features/<name>/`. "Deps" are key
dependencies; "Extend" is the primary extension point. Full detail is in each linked doc.

- **home** (`features/home/` — page + hero/feed/line-pulse/line-status/refresh-control/report/pro
  groups + route-scoped store; [doc](components/home.md)) — Public landing page at `""`: a Today /
  Last Week rolling link feed (login-gated submit, duplicate detection, votes) under a hero (stat
  tiles, intent CTAs, refresh donut) over the **network board** — a three-group partition of the
  line read (`Needs attention`, `My lines`, `All lines`) with a five-intent report chooser, a
  draft-first line-status sheet (its draft saved per line, and a report the server cannot take
  queued in the outbox and flushed on reconnect), an alert bell on each pinned row (web push,
  `core/push/`), 24-hour history strips and a per-line typical-week heat strip in each expanded
  line, and, for `?view=pro`, a
  bento dashboard (extra filters, heat grid, CSV export, ongoing incidents, Line HQ, `/` `r` `p`
  shortcuts).
  - Deps: `graphqlResource`/`GraphQLClient`, `AuthService`; route-scoped
    `HomeStore`/`HomeViewModeService` (the one writer of `?view=`)/`LineStatusSheetService` and the
    outbox flush (`provideReportOutboxFlush()`); root
    `ReportChooserService`/`IncidentSheetService`/`PreferencesService`/`ReportOutboxService`/
    `OnlineService`; `core/url-state`,
    `core/export/csv.util.ts`; insiden's `AssetMultiSelectComponent`, `VoteButtonComponent`,
    `app-link-thread`; spotting's `humanizeSince`.
  - Extend: the `home-*.queries.ts` GraphQL contract files (`pulseLinks.isAutomated` is what makes
    "official" mean anything); `HomeStore` (polling beat, cursor pagination, `userVote` overlay,
    board derivations, `isStale`); pure utils (`passenger-status`, `network-summary`, `status-confidence`,
    `status-history-display`, `week-profile-display`, `feed-url`, `feed-day-groups`, `feed-filter` — all
    `*.util.ts`);
    `LinkSheetService` prefill, `LineStatusSheetService.openFor(id, { presetStatus })`,
    `ReportChooserService` intent seam; `HOME_FEED_COLLAPSE_VARS` on every feed read;
    `ui/motion/tick-up.directive.ts` (`hlmTickUp`, the one number-reveal primitive) + the
    `--animate-*` `@theme` tokens (all motion is inert under `prefers-reduced-motion`).
- **gallery** (`features/gallery/` — page + 3 child components + pure utils;
  [doc](components/gallery.md)) — Paginated, year-grouped public photo feed with a full-screen
  lightbox, driven by a Relay-style GraphQL connection. A shared `/gallery/:mediaId` link opens from
  one `media(id)` fetch (on the server too) with per-photo share tags. The lightbox steps between
  photos (arrow keys, swipe, buttons; fetching the next page at the end of the feed) and shares a
  photo's link.
  - Deps: `graphqlResource`/`GraphQLClient`, `ToastService`, `Title`/`Meta`, Hlm button/skeleton.
  - Extend: reusable `JustifiedGridComponent` (CSS-only layout, so the server renders the photos)
    and `MediaViewerComponent` (modal dialog; input/output driven, no gallery coupling: optional
    `prev`/`next`/`sharePath` inputs and a `navigate` output, plain without them, as in insiden);
    pure `getImgurThumbnail()`/`mediaLabel()`.
- **gdpr** (`features/gdpr/` — single page; [doc](components/gdpr.md)) — Read-only GDPR compliance
  checklist rendered from a hand-edited Firestore doc.
  - Deps: `firebase/firestore` (`public/gdpr`, direct SDK), `HlmBadge`/`HlmSkeleton`.
  - Extend: the `GdprDetail`/`GdprDetailChild` schema is additive; new checklist fields need no
    component changes.
- **about** (`features/about/` — single page; [doc](components/about.md)) — About page (project
  blurb, sub-projects, personnel, tech stack, community projects) from a Firestore doc, with an
  in-page admin editor (`AboutEditorComponent`, form-only child loaded with `@defer`; the page owns
  `setDoc` on save).
  - Deps: `firebase/firestore` (`public/about`), Hlm Card/Badge/Button/Skeleton.
  - Extend: schema-driven `@for` over `display`-flagged arrays; `STATUS_VARIANT` lookup for new
    project statuses.
- **methodology** (`features/methodology/` — page + section component over `core/methodology/`;
  [doc](components/methodology.md)) — Public "How this is counted" page: 8 anchored method sections,
  each naming its owning spec and rendering the in-progress state until that spec's code lands; the
  one registry that also feeds every `app-info-popover`.
  - Deps: `core/methodology/` registry, `Meta`, `RouterLink`, `app-info-popover`,
    `app-disclaimer-note`.
  - Extend: `methodology.constants.ts` / `methodology.content.ts` (add a `MetricDoc` + token);
    `renderMethodologyCopy()`; the `InfoPopover` `popoverExtra` slot.
- **spotting** (`features/spotting/` — flagship; 7 subcomponent groups + route-scoped store;
  [doc](components/spotting.md)) — Crowd-sourced train/rolling-stock spotting log: browse per-line
  fleet/history/incidents, submit spotting reports.
  - Deps: `graphqlResource`/`GraphQLClient`, `AuthService`, `ImageUploadService`/compression,
    `@angular/forms/signals`, domain-ui badges/heatmap.
  - Extend: `ReportSheetService` (cross-page sheet trigger seam); `report-form.schema.ts`
    (declarative validation); `spotting.queries.ts` (single GraphQL contract seam, including the
    one-vehicle `VEHICLE_HEADER_QUERY` behind the vehicle page).
- **profile** (`features/profile/` — page +
  `user-card`/`fleet-progress`/`alerts`/`my-spottings`/`my-links`; [doc](components/profile.md)) —
  Signed-in user's dashboard: identity, editable nickname, spotting stats/heatmap, own-profile fleet
  progress (distinct vehicles spotted per line, with the missing ones listed), this browser's line
  alerts (own profile), deletable and exportable (CSV/JSON) spotting history, own submitted links
  with thread grouping. Vehicle numbers link to the vehicle page, the owner can copy a share link,
  and the tab is titled after the spotter.
  - Deps: `GraphQLClient`, `AuthService`, `RecaptchaService`, domain-ui heatmap/badges, `core/export`,
    `core/push` (`injectPushService()`), the methodology registry (`fleet.progress`,
    `incidents.push-alerts`).
  - Extend: `data/profile.queries.ts` (single seam for query/type changes); `UserCardComponent`'s
    `isOwnProfile` input picks the own branch (signed-in identity, edit, privacy, votes) or the
    public branch (the owner's nickname, no controls). `data/fleet-progress.util.ts` and
    `data/my-spottings-export.util.ts` are the pure seams for the collection view and the export columns.
    `favouriteVehicles` beyond its default count is requested on the own profile only, in the Fleet
    progress card's own non-blocking request (the resolver ignores `spottingDataPublic`).
- **console** (`features/console/` — admin-only; spotting page + `insiden/pending` incident queue +
  `insiden/links` link triage at `/console/links`; [doc](components/console.md)) — Admin moderation
  queues: crowd-submitted spotting events (filter, paginate, bulk mark-as-read), pending incidents
  (approve/reject + full editor), and social-media link triage (filters,
  Approve/Hide/Mark-completed/Delete, full edit sheet, accordion over the link tree with
  context-gated row verbs).
  - Deps: `GraphQLClient`, `AuthService`, `adminOnlyGuard`, `ReCaptchaV3Service`.
  - Extend: `FilterFormModel`/`buildFilters()` additive per-field pattern; `useBulkActions`
    (`core/composables/use-bulk-actions.ts`: always-on `checkedIds` + `anchorId` selection with
    shift-click range-select; pure `toggleCheckedRange` exported beside it); the link table's single
    `linkStatusInput()` builder (replace-not-patch payload) and the shared
    `link-thread-selection.util.ts` helpers (also used by profile's My Links).
- **not-found** (`features/not-found/` — single page; [doc](components/not-found.md)) — Catch-all
  404 with SSR-correct HTTP status, deterministic per-URL joke messaging, and a two-screen layout
  (pet photo one screen down, viewport-pinned footer).
  - Deps: `Router`/`Location`, `LineStatusBadge`, cat/dog public image APIs.
  - Extend: `NOT_FOUND_MESSAGES` + `NOT_FOUND_SCROLL_LINES` static content pools; the pet-photo
    block is isolated behind `@if`/platform guard.
- **insiden** (`features/insiden/` — page + form + card + calendar + the shared link components
  `link-card`/`link-list`/`link-sheet`/`link-thread` + vote; [doc](components/insiden.md)) —
  Community incident reporting: month calendar + day-scoped list + ongoing/long-running pinning;
  line/severity/"My lines" filters over the loaded month (URL-synced); "Add to calendar" (`.ics`)
  per incident and "Export month" (`.csv`/`.ics`); a lazily read "Last 12 months" chart; create/edit
  incidents through the approval lifecycle, chronology status/votes/deletion requests,
  per-incident links with infinite scroll, in-page photo viewer.
  - Deps: `graphqlResource`, `GraphQLClient`, `AuthService`, `ImageUploadService`,
    `MediaViewerComponent` (from gallery), `PhotoPickerComponent` (from spotting), `klDateKey`
    (`core/time`), `ngx-markdown`, `InfiniteScrollDirective`, `PreferencesService` (pinned lines),
    `core/url-state`, `core/export/{csv,ics}.util.ts`, the methodology registry.
  - Extend: `insiden.queries.ts` (single flat-query seam); `incident-filter.util.ts` (a new filter
    axis), `incident-export.util.ts` (CSV columns / event fields), `core/export/ics.util.ts`,
    `insiden-history.queries.ts` + `incident-monthly.util.ts` (the "Last 12 months" read); `SEVERITY_*`/`CHRONOLOGY_DOT` lookup
    tables; `RetryableResource` structural interface; pure utils (`canEditIncident`,
    `incidentLinkLine`, `incidentToForm`, `chronologyStatusLabel`, `linkDisplayInstant`,
    `isoToOccurredAtInput`/`occurredAtInputToIso`, `link-thread-selection` helpers);
    `app-link-thread` is the named extension point for any grouped link row.
- **station** (`features/station/` — single page + `data/` query module and one pure util;
  [doc](components/station.md)) — Public, server-rendered `/station/:id`: the lines that serve a
  station with their current status, the approved incidents tagged with it (in effect now, then the
  newest 10 others, each linking to its day on `/insiden`), the rider reports that name it among each
  serving line's newest 10 (a browser-only read), and its lifts and escalators with their status.
  The tab and the share tags are titled after the station, and an unknown id renders the 404 page.
  Station names in incident cards, the report station strip of an expanded line on the front page,
  spotting history origins and destinations, and the line page's assets tab link here (the station
  names inside a line card's report rows are still plain text).
  - Deps: `graphqlResource`, `Title`/`Meta`, `RouterLink`, domain-ui `line-status-badge` and
    `asset-status-badge`, `NotFoundPage`, home's incident and passenger-status utils, spotting's
    `humanizeSince` and `ASSET_TYPE_LABEL`, the methodology registry (`incidents.station`,
    `station.reports`).
  - Extend: `data/station.queries.ts` (one server read whose only variable is the route's id;
    `stationReportsRequest` for the per-line reports), `data/station-reports.util.ts`
    (`stationTaggedReports`, the swap point for a backend station filter on reports).
- **tracker** (`features/tracker/` — shell + map + status-card + info-panel, 4 root-provided
  services; [doc](components/tracker.md)) — Full-bleed live WebGL map of GTFS-realtime vehicles +
  GTFS-static stops + railway overlay, with opt-in layers via a draft/Apply flow.
  - Deps: `GtfsRealtimeService`/`GtfsStaticService`/`LayerSelectionService`/`GeojsonStorageService`
    (root), `@antv/l7`, Firebase Storage, `/api/gtfs-proxy`.
  - Extend: `layer-config.ts` checkbox catalogs (data-only new-feed addition); the `InfoPanelKind`
    union; the draft/applied/undo signal-triplet contract in `LayerSelectionService`.

## Cross-Component Feature Opportunities

Every feature doc proposes LLM/embedding features, but there is no AI infrastructure — no `core/ai`
service, LLM client, or embeddings store.

1. **Unified "service health" digest (spotting + insiden + tracker).** The three share a
   status/severity vocabulary (`core/graphql/types.ts` enums, `domain-ui` badges); one "what's
   happening now" summary component on a shared surface beats three one-off summarizers.
2. **One AI vision pipeline for uploaded photos (gallery + spotting + insiden).**
   `ImageUploadService`/`ImageCompressionService` is the single upload queue behind spotting and
   insiden photos (and, indirectly, gallery's bot-ingested media). A pre-/post-upload hook there
   yields alt-text, duplicate detection, and moderation for all three and for console's review
   queue. `ImageUploadService.withoutGps()` is already one such pre-upload hook.
3. **Shared "CMS AI editor" for gdpr + about.** Both are a single Firestore doc with the same
   `_data` + `computed()` shape (gdpr read-only, about with an in-page admin editor); one
   schema-aware drafting tool over `PublicGdprDocument`/`PublicAboutDocument` covers both with no
   page changes.
4. **Missing component — a provider-agnostic LLM/embedding gateway** (auth, rate-limiting, caching),
   injectable like `GraphQLClient`/`ToastService`. Prerequisite for 1–3 and every per-feature AI
   idea.

## Cross-Component Feature Opportunities (Non-AI)

Synthesized from each feature doc's `Potential Feature Opportunities`. Per-feature bullets for 1–3:
[`MISTAKES.md`](../MISTAKES.md#cross-component-opportunities).

1. **URL-state sync (signal ↔ query param).** Shared helper exists:
   `core/url-state/query-param.util.ts` (pure read helpers, one browser-gated merge/replace write;
   defaults are never written to the URL). Adopted by home (`?view=`/`?sort=`/`?line=`/`?q=`) and
   insiden (`?lines=`/`?severity=`/`?mine=`); spotting's line-overview writes `sort`/`dir` through
   `writeQueryParams`/`queryParamForWrite` (it keeps its own `isSortColumn` read guard).
   Not yet adopted: gdpr (item deep-links), about (section anchors), spotting filters, console
   (shareable filter views), insiden (per-incident expand state), tracker (map/layer views).
   Elsewhere only path params are bound.
2. **Client-side export.** `core/export/csv.util.ts` (`toCsv` is pure, always emits a header row
   and does not defuse spreadsheet formulas: a cell of user-written text goes through its exported
   `neutralizeSpreadsheetFormula`; `downloadText` is the browser-gated Blob + anchor download,
   spelled `downloadCsv` / `downloadIcs`), `core/export/json.util.ts` (`downloadJson`) and `core/export/ics.util.ts`
   (`buildIcs`: RFC 5545 escaping, 75-octet folding, KL `TZID` times, pure) exist. Consumers: home's
   Pro lines widget (CSV), profile's spotting history (CSV and JSON, paged from the API) and insiden
   ("Add to calendar" and "Export month", `.csv`/`.ics`) and tracker's info panel (CSV). Still wanted, with data already client-side and no backend change: console (filtered
   queue), gallery (per-year zip). No zip helper yet. `downloadJson` still copies the blob-and-anchor
   steps that `downloadText` now holds once for CSV and iCalendar; point it at `downloadText`.
3. **User preferences / persistence.** `core/preferences/preferences.service.ts`
   (`PreferencesService`, localStorage key `rosak:preferences:v1`) holds home's pinned lines, view
   mode, density, etc.; home is the only writer, and insiden's "My lines" filter reads the
   pinned lines. The report drafts (home's line-status sheet per line, spotting's report form in one
   slot) live in `sessionStorage`, and the status-report outbox (`core/offline/`) and this browser's
   line alerts (`core/push/`) in `localStorage`, all through `core/util/web-storage.util.ts`. Still
   missing: tracker saved layer presets, profile settings. The only other persistence is the upload queue's IndexedDB.
4. **"Select rows, then act" bulk actions (console + profile).** **Status: split (2026-10-01)** —
   there are two shared implementations, not the one extraction originally asked for:
   `core/composables/use-bulk-actions.ts` (console's spotting queue: always-on selection,
   `checkedIds` `Set<string>`, `anchorId`, single toggle + Shift-click range-select over
   `orderedIds`, pure `toggleCheckedRange()` with its own spec; one consumer, `ConsolePage`) and
   `features/insiden/data/link-thread-selection.util.ts`
   (`toggleSelection`/`areAllSelected`/`canGroup`/`canNest`/`selectedWithin`/`threadLabel`; read by
   console's `/console/links` and profile's "My Submitted Links"). Remaining gap: profile's
   **proposed** bulk-delete of spotting entries has no selection UI. A future extraction should pick
   **one** of the two rather than add a third, and keep the immutability contract both honour
   (results are written straight into a signal, so an in-place mutation is invisible to change
   detection). No mode toggle is left to lift.
