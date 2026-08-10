# Global Application Shell, Routing & System Pages

This document is the **canonical sitemap** for the whole app. Every other doc in
`docs/frontend-map/` links back here instead of repeating the top-level route table, guard
logic, or maintenance-mode mechanism.

Scope covered: `src/app/header/**` (top nav chrome), `src/app/app.component.{ts,html,scss}`
(root shell), `src/app/app-routing.module.ts` (full route table), `src/app/fallback/**` (404),
`src/app/construction/**` (maintenance placeholder). Cross-cutting services referenced but
**not** re-documented in depth here (see their own docs): `src/app/services/auth.service.ts`,
`src/app/services/auth-permissions.ts`, `src/app/services/theme.service.ts`,
`src/app/services/image-upload.service.ts`, `src/app/graphql.module.ts`,
`src/environments/environment*.ts`.

## Path(s) & Routing

All routes are declared in one flat array in
`/home/kwongtn/rosak_firebase/src/app/app-routing.module.ts:68-235`, registered via
`RouterModule.forRoot(routes, { scrollPositionRestoration: "enabled" })`
(app-routing.module.ts:239-242). There is no `PreloadAllModules` strategy configured — every
lazy route is fetched on first navigation to it, not preloaded in the background.

### Guard functions (defined at the top of the file)

```ts
function redirectUnauthorizedToSpotting(): AuthPipe {
    return redirectUnauthorizedTo(["spotting"]);
}
function adminOnly(): AuthPipe {
    return hasCustomClaim("admin");
}
function betaTesterOnly(): AuthPipe {
    return hasCustomClaim("betaTester");
}
```

(app-routing.module.ts:56-66, using `@angular/fire/auth-guard`'s `AuthGuard` via
`canActivate(pipe)` — `canActivate(pipe) => ({ canActivate: [AuthGuard], data: { authGuardPipe: pipe } })`,
confirmed from `node_modules/@angular/fire/fesm2022/angular-fire-auth-guard.mjs:43-45`.)

**Guard semantics differ meaningfully between the two helpers actually used** (verified against
the AngularFire source, `angular-fire-auth-guard.mjs:11,50,53`):

- `hasCustomClaim(claim)` → `pipe(customClaims, map(claims => claims.hasOwnProperty(claim)))` —
  resolves to a **plain boolean**. `AuthGuard.canActivate` passes booleans straight through
  (`map(can => typeof can === "boolean" ? can : …)`), so on failure the navigation is simply
  **cancelled** (`NavigationCancel`) — there is **no redirect anywhere else**, the user's URL
  and rendered page stay whatever they were before attempting the navigation. Used by
  `adminOnly` (`/console`) and `betaTesterOnly` (`/situasi`).
- `redirectUnauthorizedTo(redirect)` → `pipe(loggedIn, map(loggedIn => loggedIn || redirect))` —
  resolves to `true` if logged in (**regardless of any role/claim**), or to the `redirect` array
  if not, which `AuthGuard` converts to a real `UrlTree` via `router.createUrlTree(redirect)`.
  Used only by `redirectUnauthorizedToSpotting` on `/profile` — i.e. `/profile` requires being
  logged in (any account), not any specific role, and an unauthenticated visitor is actively
  redirected to `/spotting` rather than merely blocked.

### Maintenance-mode mechanism

```ts
interface MaintenanceElement { curentlyInMaintenance: boolean; notes?: string | undefined; }
type PageType = "console" | "gallery" | "insiden" | "profile" | "situasi" | "spotting" | "tracker";
type MaintananceDocument = { [key in PageType]: MaintenanceElement };
const maintenance: MaintananceDocument = { spotting: {curentlyInMaintenance:false}, insiden: {...}, ... };
```

(app-routing.module.ts:14-54 — note the misspelling **`curentlyInMaintenance`** (missing the
first "r"), used consistently throughout the file, not a one-off typo.)

This is a **hardcoded, build-time-only, developer-edited boolean per feature key** — there is no
admin UI, environment variable, remote config, or Firestore document driving it. To take a page
down, a developer flips the relevant key to `true` in this source file and redeploys. All seven
keys are currently `false` (nothing is in maintenance as of this writing). `about` and
`compliance` are **not** part of the `PageType` union at all and have no maintenance
switch — they can never be placed in maintenance mode via this mechanism.

Two different code patterns implement the swap, and they have materially different bundling
consequences (see Known Quirks):

- **`loadComponent`-style** (gallery, spotting, spotting/:id, tracker, console, profile): the
  maintenance check lives _inside_ the dynamic `import().then(...)` callback, e.g.
    ```ts
    loadComponent: () => {
        if (maintenance.gallery.curentlyInMaintenance) {
            return import("./construction/construction.component").then(
                (m) => m.ConstructionComponent
            );
        } else {
            return import("./gallery/gallery.component").then(
                (m) => m.GalleryComponent
            );
        }
    };
    ```
    Both branches are genuinely lazy/code-split; nothing from either branch loads until the user
    navigates to that specific route.
- **`loadChildren` + eager `component`-style** (insiden, situasi): the maintenance check runs
  **synchronously at route-table construction time** (i.e. at app bootstrap) to pick between two
  **already-statically-imported** classes for the `component:` property, e.g.
    ```ts
    component: maintenance.spotting.curentlyInMaintenance   // <- bug, see Known Quirks
        ? ConstructionComponent
        : InsidenMainComponent,
    ```
    `ConstructionComponent`, `InsidenMainComponent`, and `SituasiComponent` are all imported via
    plain top-of-file `import` statements (app-routing.module.ts:10-12), because a `Route.component`
    must be a synchronous class reference — Angular's `Route` type has no async form for it. The
    `loadChildren` callback alongside it does still dynamically `import()` the real feature module
    (or `ConstructionModule`), but for these two routes that module registers **no** child routes
    of its own (see Component Tree) — the actually-rendered component is whichever class the
    `component:` ternary already resolved to at bootstrap.

### Canonical route table

| Path            | `<title>`                 | Guard                                                                                 | Renders (real feature)                                                                                | Maintenance key                                                           | Notes                                                                                                                                                                                                                       |
| --------------- | ------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `insiden`       | `MLPTF \| Insiden`        | none                                                                                  | `InsidenMainComponent` — `src/app/insiden/insiden.component.ts` (module: `insiden/insiden.module.ts`) | `maintenance.insiden` (checked by `loadChildren`) — **but see bug below** | Combined `loadChildren`+`component` pattern; both classes eagerly bundled                                                                                                                                                   |
| `gallery`       | `MLPTF \| Gallery`        | none                                                                                  | `GalleryComponent` (standalone) — `src/app/gallery/gallery.component.ts`                              | `maintenance.gallery`                                                     | `loadComponent`, properly lazy                                                                                                                                                                                              |
| `spotting`      | `MLPTF \| TranSPOT`       | none                                                                                  | `SpottingMainComponent` (standalone) — `src/app/spotting/spotting-main.component.ts`                  | `maintenance.spotting`                                                    | `loadComponent`, properly lazy                                                                                                                                                                                              |
| `spotting/:id`  | `MLPTF \| TranSPOT`       | none                                                                                  | same `SpottingMainComponent`, same maintenance check                                                  | `maintenance.spotting`                                                    | Literal duplicate route entry (not a child route) — identical inline logic copy-pasted rather than shared                                                                                                                   |
| `situasi`       | `MLPTF \| Situasi`        | `canActivate(betaTesterOnly)`                                                         | `SituasiComponent` — `src/app/situasi/situasi.component.ts` (module: `situasi/situasi.module.ts`)     | `maintenance.situasi` (self-consistent, no bug)                           | Combined `loadChildren`+`component` pattern; has its own nested route table (`situasi-routing.module.ts`) documented in `situasi.md`                                                                                        |
| `tracker`       | `MLPTF \| Tracker`        | **none** — `canActivate(betaTesterOnly)` is commented out (app-routing.module.ts:165) | `TrackerComponent` (standalone) — `src/app/tracker/tracker.component.ts`                              | `maintenance.tracker`                                                     | `loadComponent`, properly lazy. Nav-menu visibility still requires the `betaTester` claim (cosmetic only — see Permissions)                                                                                                 |
| `about`         | `MLPTF \| About`          | none                                                                                  | `AboutComponent` (standalone) — `src/app/about/about.component.ts`                                    | none (not in `PageType`)                                                  | `loadComponent`, properly lazy                                                                                                                                                                                              |
| `compliance`    | `MLPTF \| Compliance`     | none                                                                                  | `ComplianceComponent` (standalone) — `src/app/compliance/compliance.component.ts`                     | none (not in `PageType`)                                                  | `loadComponent`, properly lazy. **Orphaned**: no nav link anywhere in the app (confirmed by repo-wide grep for `/compliance` — only hits are the route table and the feature's own files); reachable only by typing the URL |
| `console`       | `MLPTF \| Console`        | `canActivate(adminOnly)` (`hasCustomClaim("admin")`)                                  | `ConsoleMainComponent` (standalone) — `src/app/console/console.component.ts`                          | `maintenance.console`                                                     | `loadComponent`, properly lazy                                                                                                                                                                                              |
| `profile`       | `MLPTF \| Profile`        | `canActivate(redirectUnauthorizedToSpotting)`                                         | `ProfileMainComponent` (standalone) — `src/app/profile/profile.component.ts`                          | `maintenance.profile`                                                     | `loadComponent`, properly lazy. Redirects to `/spotting` if not logged in                                                                                                                                                   |
| `""` (empty)    | —                         | none                                                                                  | —                                                                                                     | —                                                                         | `redirectTo: "/spotting"`, `pathMatch: "full"`                                                                                                                                                                              |
| `transpot`      | —                         | none                                                                                  | —                                                                                                     | —                                                                         | `redirectTo: "/spotting"`, `pathMatch: "full"` — legacy URL alias                                                                                                                                                           |
| `**` (wildcard) | `MLPTF \| Page not Found` | none                                                                                  | `FallbackComponent` (standalone) — `src/app/fallback/fallback.component.ts`                           | —                                                                         | `loadComponent`, properly lazy. Catches every unmatched path                                                                                                                                                                |

Route match order is exactly this array's order (first match wins); the wildcard `**` is last,
as required. Both `""` and `transpot` funnel to `/spotting`, which functions as the site's
de facto home page.

**`ConstructionComponent`** (`src/app/construction/construction.component.ts`, module
`construction/construction.module.ts`) is not itself a route — it is the placeholder swapped in
for whichever of the seven maintenance-eligible routes above has its flag set. It is reached
via two different import paths depending on which pattern the owning route uses: bare
`import("./construction/construction.component")` (loadComponent-style routes) or
`import("./construction/construction.module")` (loadChildren-style routes, insiden/situasi) —
both resolve to the same component class at runtime.

## Purpose

This is the app-wide chrome every route renders inside: the sticky top header (branding, nav
links, theme toggle, login/avatar, pending-upload status, bug-report entry point) and the outer
page-padding/footer wrapper, plus the two system pages that exist outside any specific feature —
a 404 fallback and a generic "under maintenance" placeholder. It is used by **every** visitor,
public or authenticated, and is the one place in the codebase that decides, per request: what
nav links are visible (based on login state and Firebase custom claims), what page title/URL
maps to what lazily-loaded feature module, whether that feature is currently swapped out for
maintenance, and what happens when a URL matches nothing.

## Component Tree

```
AppComponent (app-root)                              app.component.ts / .html / .scss
 ├─ <d-common-header> HeaderComponent                 header/header.component.ts
 │   ├─ <d-header-logo> LogoComponent                 header/logo/logo.component.ts
 │   ├─ <d-header-menu> MenuComponent                 header/menu/menu.component.ts
 │   │   (reads ThemeService, ImageUploadService)
 │   └─ (drawer, opened on avatar click via NzDrawerService)
 │       LoginDropdownComponent (app-login-dropdown)  header/login-dropdown/login-dropdown.component.ts
 │        ├─ (reads AuthService, ThemeService)
 │        └─ <verification-code-card>                 @ui/verification-code-card/verification-code-card.component.ts
 │             └─ GetCodeService (GraphQL mutation)    @ui/verification-code-card/services/get-code.service.ts
 ├─ <router-outlet>  → one of every route in the table above, incl.:
 │    ├─ ConstructionComponent (app-construction)      construction/construction.component.ts   (maintenance placeholder)
 │    └─ FallbackComponent (app-fallback)              fallback/fallback.component.ts            (404)
 └─ <app-footer> FooterComponent (standalone)          @ui/footer/footer.component.ts   — rendered only when `applyPadding` is true
```

Communication notes:

- `AppComponent` passes `header` (a computed string) into `<d-header-logo name>`, and its own
  `innerMenuList` array into `<d-header-menu menuList>` / `[selectedItem]="innerMenuList[0]"`
  (app.component.html:9-13). There is **no `@Output()` flowing back up** from `HeaderComponent`/
  `MenuComponent`/`LogoComponent` to `AppComponent` — all of the shell's own reactive state
  (`innerMenuList`, `userAvatar`, `header`, `routeKey`, `applyPadding`, `applyTopPadding`) is
  derived by `AppComponent` itself, directly from `AuthService`'s subjects and `Router.events`,
  not from anything its header children emit.
- `HeaderComponent` receives `userAvatar` as a plain `@Input()` from `AppComponent` and forwards
  it into the login drawer via `NzDrawerService`'s `nzContentParams: { userAvatar: this.userAvatar }`
  (header.component.ts:88-93) — this is how `LoginDropdownComponent` gets an avatar URL despite
  not being declared anywhere in `AppComponent`'s or `HeaderComponent`'s template (it's
  instantiated dynamically by the drawer service).
- `MenuComponent` talks to two unrelated app-wide singletons directly (constructor-injected,
  not passed down from `AppComponent`): `ThemeService` (toggle button) and `ImageUploadService`
  (pending-upload badge) — see State Management.
- `insiden`/`situasi`'s feature modules are loaded via `loadChildren`, but as established above,
  neither module registers any `RouterModule.forChild(routes)` of its own for the _top-level_
  route in this table (situasi's own `situasi-routing.module.ts` is a separate, nested concern
  documented in `situasi.md`; `insiden.module.ts` has no routing module at all — grep confirms no
  `RouterModule`/`forChild` token anywhere in `insiden/insiden.module.ts`). Practically, loading
  these modules exists only to satisfy Angular's requirement that a non-standalone component be
  declared by _some_ `NgModule` before the router can instantiate it via `component:`.

## Functionality & Behavior

### `AppComponent` (`app.component.ts`)

- **Constructor** sets a CSS custom property, `--padding-top`, directly on the host element:
  `100px` if `environment.sentry.environment === "staging"`, else `70px`
  (app.component.ts:75-79). This exists purely to leave room for the staging-only banner
  `HeaderComponent` renders (see below) so page content doesn't get covered by it.
- **`innerMenuList`** starts as a fixed 4-item array — Gallery (tag `"Alpha"`, style
  `"danger"`), Insiden (tag `"Beta"`, style `"waiting"`), TranSPOT (no tag), About (no tag) —
  each shaped `{ name, href, target, tag?, style?, headerTitle }` (app.component.ts:18-50).
  `menuContainsHref`/`removeFromMenu`/`addToMenu` (app.component.ts:82-98) are small array
  helpers; `addToMenu` **prepends** via `unshift` (so most-recently-added items land at index 0).
- **`getHeader()`/`resize()`** (window `resize` listener, app.component.ts:100-120): on
  viewports narrower than 1024px, the header's displayed title text swaps to the current
  route's `headerTitle` (e.g. `" - Gallery "`) if the current URL's first path segment matches
  a menu item's `href`; otherwise (and always on wider viewports) it falls back to the generic
  title `" Malaysia Land Public Transport Fans "` (app.component.ts:16). This string is what's
  bound into `<d-header-logo [name]="header">`.
- **`ngOnInit`**:
    - Subscribes to `authService.userData` (`BehaviorSubject<User|null|undefined>`): sets
      `userAvatar` from `user.photoURL` (or `""`); adds an `"@Me" → /profile` menu item when
      logged in, or removes both `/profile` and `/console` when logged out
      (app.component.ts:122-139). Logs the raw `user` object to the console on every emission —
      shipped debug logging (app.component.ts:124).
    - Subscribes to `authService.customClaims` (`BehaviorSubject<ParsedToken|undefined>`): adds
      `"Console"` (tag `"Admin"`, style `"danger"`) when the `admin` claim is present, else
      removes it; adds `"Situasi"` **and** `"Tracker"` (both tag `"Alpha"`, style `"danger"`) when
      `betaTester` is present, else removes both (app.component.ts:141-178). Also logs the raw
      claims object on every emission (app.component.ts:142).
    - Subscribes to `router.events` filtered to `NavigationEnd`: recomputes `header`, `routeKey`
      (`router.url.split("/")[1]`), and two layout flags —
      `applyPadding = !["situasi","tracker"].includes(routeKey)` and
      `applyTopPadding = !["tracker"].includes(routeKey)` (app.component.ts:52-53,180-196).
- **`ngOnDestroy`** calls `this.authService.userData.unsubscribe()` (app.component.ts:200) — see
  Known Quirks; this is almost certainly a latent bug rather than intentional cleanup.
- **Template layout** (app.component.html): `<d-common-header>` wraps `<d-header-logo>` +
  `<d-header-menu>`; below it, a padding wrapper whose classes depend on `applyPadding`/
  `applyTopPadding` (three mutually exclusive modes — see `.scss` classes
  `content-outer-container`/`content-inner-container`/`top-margin-only`, app.component.scss:9-34)
  wraps the `<router-outlet>`; a commented-out `<nz-alert>` maintenance-window banner sits dead
  in the markup (app.component.html:25-29, dated "10 May 2023" — long expired); finally
  `<app-footer>` renders below an `<hr>` **only** when `applyPadding` is true (i.e. never on
  `/situasi` or `/tracker`).

### `HeaderComponent` (`d-common-header`, `header.component.ts`/`.html`/`.scss`)

- Purely presentational shell. `@Input()`s: `showShadow`, `isFixed`, `hasMaxWidth`,
  `showSlideButton` (always `false` in practice — never bound to `true` anywhere in
  `app.component.html`), `userAvatar`.
- Projects `<d-header-logo>`/`<d-header-menu>`/`<d-ecosystem>` content slots
  (header.component.html:43,46-47) — the `d-ecosystem` slot is never actually projected into
  from anywhere in this app; vestigial.
- Renders a clickable avatar (`nz-avatar`): the user's real photo if `userAvatar` is truthy,
  else a generic "user" icon with tooltip "Click here to login" (placement left). Clicking it
  (`onLoginIconClick`, header.component.ts:79-94) opens `LoginDropdownComponent` in an
  `NzDrawerService` drawer, `nzTitle: "Login"`, placement `"bottom"` if
  `document.body.clientWidth < 500` else `"right"`.
- Staging banner: when `environment.sentry.environment === "staging"`, renders an
  `<nz-alert nzBanner>` reading _"You are in staging environment. Take note that all progress
  will be reset to public build everyday at 03:00 GMT+08."_ (header.component.html:72-77) — this
  is the only thing the `--padding-top: 100px` compensation in `AppComponent`'s constructor is
  for.
- Responsive nav collapse (**working**): below 1360px viewport width, `.header-wapper` switches
  to a column layout and a hamburger (`#headerCollapseMenu`, always in the DOM but CSS-hidden
  above 1360px) becomes visible; clicking it toggles `collapseMenuActive`
  (`toggleMenu($event)`, header.component.ts:58-61), which toggles the `.active` class on
  `.header-right` (turning the nav+avatar into a dropdown panel, header.component.scss:148-179).
- Responsive nav collapse (**dead**): `showSlideMenu`/`clickSlideMenu()`/`setSlideBarStyle()`
  (header.component.ts:42-46,63-77) target a `.sidebar-wrapper` element via
  `document.querySelector(".sidebar-wrapper")` that does not exist anywhere in this app's
  templates — always `null`, always a no-op. Likewise the `showSlideButton` hamburger-SVG block
  in the template (header.component.html:15-42) never renders since the input is never `true`.
  Both are inert leftovers from the ng-devui docs-site header this component was adapted from.
- `@ContentChildren(LogoComponent) subLogo` (header.component.ts:32-33) is populated but never
  read anywhere in the class — dead.

### `LogoComponent` (`d-header-logo`, `logo.component.ts`/`.html`/`.scss`)

- Renders the inline SVG MLPTF wordmark (orange accent `#ee7104` + theme-following
  `$devui-text` fill) inside an `<a routerLink="/">`, plus a `{{ name }}` text span — the
  dynamic title text computed by `AppComponent.getHeader()`.
- `@Input() link = "/home"` (logo.component.ts:10) is declared but **unused** — the template's
  `routerLink` is hardcoded to `'/'`, never bound to `this.link`.

### `MenuComponent` (`d-header-menu`, `menu.component.ts`/`.html`/`.scss`)

- Renders `menuList` items as `routerLink`s. The "active" item is highlighted by comparing each
  item's first path segment against `router.url`'s first segment
  (`item.href.split('/')[1] === router.url.split('/')[1]`, menu.component.html:6-9) — **not**
  via the `selectedItem` input (see Known Quirks).
- Optional colored tag badge per item (rendered as absolutely-positioned pill text, not
  ng-zorro's `nz-badge`, because the tags here are text like "Alpha"/"Beta" rather than
  numbers — `menu.component.scss:29-42`). Color via `badgeColor(style)`: `"danger"` → `#f66f6a`,
  `"waiting"` → `#beccfa`, else `#5e7ce0` (menu.component.ts:88-97).
- Static GitHub link icon → `https://github.com/kwongtn/rosak_firebase` (new tab).
- Theme toggle: a static "sun" icon (`nz-icon nzType="sun"` — does **not** swap to a moon icon in
  dark mode) → `toggleTheme()` → `ThemeService.toggleTheme()`.
- "Report a bug" icon (bug icon, tooltip "Report a bug", placement left) → `reportBug()`
  (menu.component.ts:78-81): lazily creates and opens a Sentry User Feedback form
  (`Sentry.feedbackIntegration().createForm()`). Sentry is initialized in `src/main.ts:17-21`
  with `feedbackIntegration({ colorScheme: "system", autoInject: false })` — `autoInject:false`
  means there is **no** always-visible floating Sentry widget anywhere else; this bug icon is
  the sole entry point to it.
- Pending-upload indicator: subscribes to `ImageUploadService.$pendingUploadCount`
  (menu.component.ts:48-56). The whole indicator block is hidden (`@if (countIcon > 0 ||
hadUpload)`) until the **first** time any upload is queued during the current session;
  `hadUpload` latches `true` permanently once `countIcon` first exceeds 0 and never resets, so
  once any upload has happened this session the icon (badge while pending, green
  two-tone checkmark once drained to 0, tooltip "All uploads complete") persists in the header
  for the rest of the session even long after uploads finish.

### `LoginDropdownComponent` (`app-login-dropdown`, opened via drawer from the avatar)

- If logged in: an `nz-card` shows an 85px avatar, display name (linking to `/profile`), and
  email as the card description. If logged out, that card slot renders nothing at all (whole
  card is behind `@if (authService.userData | async)`, login-dropdown.component.html:1-25).
- Always renders `<verification-code-card>` below it — but that child component gates its
  _own_ content on the same login check, so a logged-out user sees an empty gap there too.
- "Follow System Theme" switch (`nz-switch`, two-way bound to `themeFollowSystemColorScheme`) →
  `ThemeService.followSystemColorScheme(bool)`. Turning it on subscribes a
  `matchMedia("(prefers-color-scheme: dark)")` listener that live-switches theme on OS changes
  and immediately syncs to the current OS preference; turning it off just stops listening,
  leaving whichever theme was current.
- Login/Logout button: shows **"Logout"** if `authService.userData | async` is truthy, else
  **"Login with Google"** if it is loosely `== null` (login-dropdown.component.html:36-45).
  Because `userData`'s initial `BehaviorSubject` value is `undefined` (not yet resolved by
  Firebase) and `undefined == null` is `true` in JS, the "Login with Google" button is what
  renders during the brief window before Firebase Auth first resolves too — there is no
  distinct "checking session…" loading state.
- `authService.login()` → Firebase `signInWithPopup(GoogleAuthProvider)`. Success: toast
  "Login Successful" / "Welcome back, `<name or email>`" (or "Welcome!" if
  `metadata.lastSignInTime` is falsy, i.e. first-ever sign-in). Failure: a persistent
  (`nzDuration: 0`) "Account Banned" toast if the Firebase error code is
  `auth/user-disabled`, pointing the user at `tungnan5636@gmail.com`; otherwise a generic error
  toast with the raw Firebase error message (`auth.service.ts:103-147`).
- `authService.logout()` → Firebase `signOut`. Toasts "Logout Successful" on success, generic
  error toast on failure.

### `VerificationCodeCardComponent` (`verification-code-card`, nested inside the login drawer)

Included here because it's physically part of the header's login surface (not documented in
depth elsewhere):

- "Bot Linking" card, visible only when logged in. "Request Code" button (shows a loading
  spinner in flight) triggers the `requestVerificationCode` GraphQL mutation (see Data & API
  Contracts). On success, shows the returned 6-digit code via `nz-statistic` with a live
  60-second countdown (`setInterval`, 1s ticks); once it hits 0 the code is cleared from the UI.
  This is a **client-side display timer only** — nothing here re-verifies the code's actual
  server-side expiry (see Open Questions).
- An info-circle icon in the card's extra slot links to
  `https://github.com/kwongtn/rosak_firebase/wiki/Linking-to-Telegram` (new tab), explaining
  what the code is for (linking the user's account to the project's Telegram bot).

### `ConstructionComponent` (`app-construction`) — maintenance placeholder

- Template is a single centered `<img>` (`assets/page-under-construction.jpg`, capped at
  500×500px) wrapped in an `<a target="_blank">` pointing at a YouTube Rickroll video
  (`https://www.youtube.com/watch?v=dQw4w9WgXcQ`). `onClick()`/the injected `Router`
  (construction.component.ts:10-16) are **unused** — nothing in the template calls `onClick()`;
  the only interactive element is the raw Rickroll `<a>`.

### `FallbackComponent` (`app-fallback`) — 404 page

- ng-zorro `<nz-result nzStatus="404">`, title _"Whoops! Page does not exist."_, subtitle _"It
  seems that you have wandered into uncharted waters. Shall we send you back? 😉"_
  (fallback.component.ts:15-16).
- Two buttons: "Back to TranSpot" → `router.navigate(["/spotting"])`; "Surprise Me" → the same
  Rickroll link as `ConstructionComponent`, opened in a new tab (fallback.component.html:1-11).
- `fallback.component.scss` is an **empty file** — no custom styling beyond ng-zorro's own
  `nz-result` defaults.

## Data & API Contracts

### GraphQL

**`requestVerificationCode`** — used by `VerificationCodeCardComponent` via `GetCodeService`
(`/home/kwongtn/rosak_firebase/src/app/@ui/verification-code-card/services/get-code.service.ts:14-22`):

```graphql
mutation {
    requestVerificationCode {
        code
    }
}
```

- Sent with an explicit `firebase-auth-key` header (the current Firebase ID token) and
  `fetchPolicy: "network-only"` (verification-code-card.component.ts:33-48).
- Backend: `CommonMutations.request_verification_code`
  (`/home/kwongtn/rosak_backend/common/schema/schema.py:93-100`), gated by
  `permission_classes=[IsLoggedIn]` (`/home/kwongtn/rosak_backend/rosak/permissions.py:36-40` —
  only checks `bool(info.context.user)`, no role/claim requirement). Creates a
  `UserVerificationCode` row (`common/models.py:129-134` — `code` is a random unique
  `PositiveIntegerField`, 100000–999999, via `get_verification_code`) tied to the current
  backend `User`, and returns `UserVerificationCodeScalar { user, created, code }`
  (`common/schema/scalars.py:190-193`; the frontend only requests `code`). No rate-limiting or
  cooldown is visible in this resolver — a user can request a fresh code repeatedly with no
  server-side throttle; the 60-second countdown in the UI is a purely client-side display timer,
  not something this resolver enforces or reports back.

### Firebase (via `AuthService`, shared plumbing — see `auth.service.ts`)

- **Auth**: `signInWithPopup(GoogleAuthProvider)` / `signOut` (Login/Logout buttons);
  `user.getIdTokenResult()` → custom claims `admin`/`betaTester`, which drive both the header's
  conditional nav items and the `console`/`situasi` route guards.
- **Firestore**: a live `onSnapshot` listener on `users/{uid}` (`auth.service.ts:75-88`) feeds
  `UserAuthData.permissions` (currently only `{ admin?: boolean }`), which is cross-checked
  against `auth-permissions.ts`'s `isUserAllowed()` for the **current URL** on every snapshot
  update and every login/logout transition; on a mismatch it force-navigates to `[""]` (→
  redirects to `/spotting`). This is a **second, independent enforcement layer** from the route
  guards — see Permissions.
- **Analytics**: `Analytics` is injected into `AppComponent` (app.component.ts:11,73) but
  **never explicitly called** anywhere in the shell — any page-view tracking happens implicitly
  via `ScreenTrackingService`/`UserTrackingService`, which are only registered as providers
  `if (environment.production)` (`app.module.ts:104-109`), not through any call in these files.

### REST

None directly inside `header/**`/`app.component.*`. `ImageUploadService`
(`services/image-upload.service.ts`, shared plumbing) posts to
`${environment.backendUrl}upload/`; the header only _displays_ its pending-count state (see
State Management) — the actual upload flow is documented in the feature areas that queue files
(spotting/insiden).

### Browser storage

`localStorage` keys `"user-custom-theme"` (values `"infinity"` | `"galaxy"`) and
`"devuiThemeFollowSystemColorScheme"` (values `"on"` | `"off"`) — both read/written exclusively
by `ThemeService` (`services/theme.service.ts`), surfaced in this scope via `MenuComponent`'s
theme-toggle icon and `LoginDropdownComponent`'s "Follow System Theme" switch. The key names
retain their original ng-devui-era naming (see Known Quirks) despite that package being removed.

## State Management

No NgRx/global store. The shell composes state from a few root-provided (`providedIn: "root"`)
singleton services plus `Router` events:

- **`AuthService`** (`services/auth.service.ts`, documented in depth elsewhere) —
  `userData`/`customClaims`/`userAuth` `BehaviorSubject`s are the shell's primary source of
  truth for "who is this and what can they see." Read by `AppComponent` (nav visibility),
  `HeaderComponent`/`LoginDropdownComponent` (avatar/login UI), and
  `VerificationCodeCardComponent`.
- **`ThemeService`** (`services/theme.service.ts`) — `themeFollowSystemColorScheme`/
  `colorScheme` `BehaviorSubject`s, backed by the two `localStorage` keys above. Read/written by
  `MenuComponent` (toggle icon) and `LoginDropdownComponent` (follow-system switch); also
  consumed by feature areas outside this scope (e.g. Situasi's chart theming).
- **`ImageUploadService`** (`services/image-upload.service.ts`) — `$pendingUploadCount`
  `BehaviorSubject`, read only by `MenuComponent` in this scope; populated by feature areas
  elsewhere in the app that actually queue uploads.
- **`AppComponent`'s own fields** (`innerMenuList`, `header`, `routeKey`, `applyPadding`,
  `applyTopPadding`, `userAvatar`) are component-local, recomputed reactively from the services
  above plus `Router` events, and hold nothing across a full page reload — a fresh load always
  starts from the hardcoded `initialMenuList` and rebuilds once Firebase Auth resolves.

## Permissions, Roles & Flags

- **Public, no auth, always in nav**: `gallery`, `insiden`, `spotting`/`spotting/:id`, `about`.
- **Public, no auth, never in nav**: `compliance` (orphaned route, URL-only).
- **Public, no auth, nav-gated but URL-open**: `tracker` — nav entry only appears for
  `betaTester` claim holders (app.component.ts:166-173), but the route guard that used to
  enforce this is commented out (app-routing.module.ts:165), so anyone who knows/is sent the URL
  can load it regardless of claims.
- **Any authenticated user (no role)**: `profile` — `redirectUnauthorizedTo(["spotting"])`
  redirects logged-out visitors; any logged-in account passes, admin or not.
- **Claim-gated route guard, boolean-only, no redirect on failure**: `console` (`admin` claim),
  `situasi` (`betaTester` claim) — see guard semantics above; a denied user's navigation is
  simply cancelled, not redirected anywhere.
- **Second, independent, Firestore-backed enforcement layer** (`AuthService` +
  `auth-permissions.ts`): continuously kicks the current user back toward `/spotting` (via
  navigating to `[""]`) if their Firestore `users/{uid}.permissions` don't grant a role whose
  `explicitlyAllowedPaths` includes the **current** URL. But `auth-permissions.ts`'s
  `permissions` map (`services/auth-permissions.ts:9-13`) only defines
  `admin → ["/console"]` — there is no entry at all for `betaTester`/`/situasi`, so
  `isUserAllowed()` returns `true` unconditionally for every path that isn't `/console`
  (`auth-permissions.ts:23-27, explicitlyAllowedPaths.has(path)` is `false` for anything else).
  In practice this second layer is **redundant-but-consistent** with the route guard for
  `/console`, and a **complete no-op** for `/situasi`/`/tracker`/everything else.
- **No backend/GraphQL enforcement tied to the shell's own operations**: the one GraphQL
  operation this scope uses (`requestVerificationCode`) only requires being logged in, no
  specific claim. Whether the _features_ behind `console`/`situasi` themselves enforce anything
  server-side is out of scope here (see their own docs — `situasi.md` explicitly confirms no
  backend enforcement of the `betaTester` claim on any GraphQL/REST endpoint it uses).
- **Maintenance-mode** is a build-time developer toggle, not a role or permission, and is not
  visible or controllable from any UI in the app.

## Known Quirks / Tech Debt

1. **`ErrorHandler` provider likely never wires up the custom handler.**
   `app.module.ts:70-76`:
    ```ts
    {
        provide: ErrorHandler,
        useClass: GlobalErrorHandler,
        useValue: Sentry.createErrorHandler({ showDialog: true }),
    },
    ```
    specifies **both** `useClass` and `useValue` on one provider object. Angular's DI resolves
    `useValue` before ever checking `useClass` (Angular core's provider-to-factory logic checks
    `isValueProvider` — `useValue !== undefined` — first), so `Sentry.createErrorHandler(...)`
    almost certainly wins and `GlobalErrorHandler` (`error-handler.ts` — which auto-reloads the
    page 3 seconds after detecting a failed lazy-chunk load, i.e.
    `/Loading chunk [\d]+ failed/`) is likely **dead code, never actually instantiated**. Not
    confirmed by running the app; see Open Questions.
2. **Copy-paste bug in the `insiden` maintenance switch.** `app-routing.module.ts:83-85`
   checks `maintenance.spotting.curentlyInMaintenance` for the `insiden` route's `component:`
   ternary, instead of `maintenance.insiden.curentlyInMaintenance` (which the `loadChildren`
   callback just above it, correctly, does check). Currently harmless since both flags are
   `false`, but flipping `insiden`'s flag alone would **not** actually swap in the placeholder
   component for that route.
3. **Inconsistent lazy-loading bundling** between the two maintenance-switch patterns (see
   Path(s) & Routing) — `ConstructionComponent`, `InsidenMainComponent`, and `SituasiComponent`
   are all statically imported at the top of `app-routing.module.ts` (lines 10-12) and therefore
   ship in the app's main/initial JS bundle unconditionally, unlike every other routed component
   in this table, which is only fetched over the network on first navigation to its route. Worth
   a deliberate decision in the rewrite rather than silently carrying this asymmetry forward.
4. **Duplicate/conflicting binding.** `app.component.html:1-8` binds `[showShadow]` twice on
   `<d-common-header>` (`false`, then `true`); the second silently wins, leaving the first dead.
5. **`ngOnDestroy` unsubscribes a shared `BehaviorSubject`, not a per-component subscription.**
   `app.component.ts:200` calls `this.authService.userData.unsubscribe()`. Since `userData` is a
   root-provided `BehaviorSubject` read by many other components app-wide, calling
   `.unsubscribe()` on it tears down the subject for _every_ subscriber, not just
   `AppComponent`'s own listener. Currently harmless only because `AppComponent` is the root
   component and is never actually destroyed during normal SPA navigation.
6. **Shipped debug logging.** `app.component.ts:124,142` `console.log` the raw `user` and
   `claim` objects on every auth-state emission.
7. **Stale dead markup.** `app.component.html:25-29` — a commented-out `<nz-alert>` announcing a
   "10 May 2023" maintenance window, long expired, left in place rather than removed.
8. **Dead `@ContentChildren`.** `header.component.ts:32-33`'s `subLogo` is populated but never
   read anywhere in the class.
9. **Two inert responsive-nav code paths** in `HeaderComponent`: the `showSlideButton` hamburger
   block (never enabled) and `showSlideMenu`/`setSlideBarStyle()` (targets a `.sidebar-wrapper`
   element that doesn't exist anywhere in this app) — leftovers from the ng-devui docs-site
   header this component was adapted from, distinct from the collapse-on-narrow-viewport
   behavior that **does** work (`.header-collapse-menu`/`collapseMenuActive`).
10. **Unused `@Input()`.** `logo.component.ts:10`'s `link = "/home"` is ignored — the template's
    `routerLink` is hardcoded to `'/'`.
11. **Unused `@Input()`.** `menu.component.ts:23`'s `selectedItem` is written to but never read
    in the template; active-item highlighting is computed independently via `router.url`
    comparison (`menu.component.html:6-9`).
12. **Sticky "upload complete" icon.** `menu.component.ts:51-55`'s `hadUpload` flag latches
    `true` permanently the first time any upload is queued in a session and never resets — the
    pending-upload icon (badge or checkmark) never fully disappears again for the rest of that
    session.
13. **ng-devui-era SCSS shim.** `header`/`logo`/`menu`/`login-dropdown`'s `.scss` files all
    `@import "styles/devui-vars.scss"` — a local `$devui-*` variable shim
    (`src/styles/devui-vars.scss:1-5`) re-created after ng-devui's removal purely to keep old
    variable names resolving to CSS custom properties defined in `src/styles.scss`. A Tailwind
    rewrite would replace this whole layer rather than port it.
14. **Nav config lives in two disconnected places.** The public nav items (`initialMenuList`,
    `app.component.ts:18-50`) are a hand-maintained array entirely separate from the route table
    in `app-routing.module.ts` — adding/removing/reordering a nav link requires editing
    `app.component.ts` in addition to (or instead of) the routing file, with nothing enforcing
    they stay in sync.
15. **Orphaned route.** `/compliance` has no nav entry anywhere in the app (see route table) —
    reachable only by direct URL entry or an external link not present in this repo.
16. **Broken/likely-failing Karma specs in this scope.** The repo's own commit
    `40dc5d5` ("test: fix pre-existing TestBed setup bugs...") explicitly documents two classes
    of bug it fixed in _other_ files but that remain present here:
    - `fallback.component.spec.ts:11` does
      `TestBed.configureTestingModule({ declarations: [FallbackComponent] })`, but
      `FallbackComponent` is `standalone: true` (and has been since well before the ng-zorro
      migration — `git log --follow` shows it was made standalone in commit
      `2a84a91`/`4ba98fb`). Per `40dc5d5`'s own description, "components already marked
      `standalone: true`... were being put in the TestBed's `declarations` array instead of
      `imports`, which Angular 18 rejects outright" — this file was simply not in that fix's
      file list, so it very likely still fails today the same way.
    - `header.component.spec.ts`, `menu.component.spec.ts`, `login-dropdown.component.spec.ts`,
      `construction.component.spec.ts`, and `app.component.spec.ts` all use bare
      `TestBed.configureTestingModule({ declarations: [...] })` (`app.component.spec.ts` also
      imports `RouterTestingModule`) with **no providers** for the real services their
      constructors need (`AuthService` → Firebase `Auth`/`Firestore`; `NzDrawerService`;
      `ImageUploadService` → `HttpClient` + `AuthService`; `Router` for `ConstructionComponent`,
      not satisfied by a bare `TestBed` without `RouterTestingModule`). `40dc5d5`'s commit
      message explicitly names this exact remaining-failure family ("~72 remaining failures are
      almost all 'No provider for Apollo/HttpClient/Auth/Firestore'... a separate, considerably
      larger effort"). `logo.component.spec.ts` is the one file in this scope that is **not**
      affected — `LogoComponent`'s constructor has no injected dependencies at all. None of this
      was confirmed by actually executing `ng test`/Karma in this session (it requires a real
      browser); see Open Questions.

## Open Questions / Verify Against Live Site

- Whether the `ErrorHandler` dual-provider bug (#1 above) actually results in `Sentry`'s handler
  winning over `GlobalErrorHandler` in a real running build — inferred from Angular core's
  documented provider-resolution order, not confirmed by inspecting a live app's injector.
- The exact visual/UX result of a denied `hasCustomClaim` guard (visiting `/console` or
  `/situasi` without the claim) — does the browser URL bar even change before the navigation is
  cancelled, does the previous page flash/reload, or does nothing visibly happen at all? Needs
  confirming in an authenticated-but-unprivileged browser session.
- Precise rendered behavior of the duplicate `[showShadow]` binding on `<d-common-header>` — my
  reading (second binding silently wins, first is dead) follows from how Angular's template
  compiler handles repeated property bindings on one element, but was not verified against
  compiled/rendered output.
- Exact pixel breakpoints' live appearance: the 1360px header nav-collapse, the 1024px
  `getHeader()` title-swap threshold, and the 500px login-drawer placement threshold (bottom vs.
  right) — all inferred from source, not visually confirmed on the live site.
- Whether ng-zorro's own component styling (buttons, avatars, drawers, alerts used throughout
  this scope) actually re-themes for dark mode, or whether only the `$devui-*`/`--devui-*`
  custom-property layer switches while ng-zorro's own antd styles stay visually light — would
  need to check `src/nz-zorro.scss` (out of this doc's file scope) or inspect the live site with
  dark mode toggled.
- Whether the six likely-broken spec files listed in Known Quirks #16 actually fail when Karma
  is run with a real browser present — asserted from the exact bug pattern the repo's own commit
  message describes plus straightforward Angular DI reasoning, but not executed in this session.
- Whether the backend's `UserVerificationCode` row has any server-side expiry/single-use
  enforcement wherever it's later consumed (presumably by `telegram_provider`, out of this doc's
  scope) — the 60-second countdown in `VerificationCodeCardComponent` is confirmed to be a
  client-only display timer, but whether the code itself is still valid after that on the server
  side wasn't traced here.
