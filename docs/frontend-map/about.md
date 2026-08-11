# About

## Path(s) & Routing

- **URL path:** `/about`
- **Route definition:** `/home/kwongtn/rosak_firebase/src/app/app-routing.module.ts:167-175`
  ```ts
  {
      path: "about",
      title: "MLPTF | About",
      loadComponent: () => {
          return import("./about/about.component").then(
              (m) => m.AboutComponent
          );
      },
  },
  ```
- **Page `<title>`:** `MLPTF | About` (set declaratively via the Angular Router `title` property; Angular's default `TitleStrategy` is used — no custom `TitleStrategy` provider was found in the app, so this string is set verbatim as `document.title` on navigation).
- **Lazy-loaded component:** standalone component, `loadComponent()` (no NgModule) — `AboutComponent` at `/home/kwongtn/rosak_firebase/src/app/about/about.component.ts`.
- **Route guards:** **none.** Unlike `situasi` (`canActivate(betaTesterOnly)`), `console` (`canActivate(adminOnly)`), and `profile` (`canActivate(redirectUnauthorizedToSpotting)`), the `about` route object has no `canActivate`/`canLoad` entry at all. It is fully public, reachable while logged out.
- **Maintenance-mode switch:** none. The `about` route is not a key in the `PageType` union or the `maintenance: MaintananceDocument` map (`app-routing.module.ts:19-54`), so there is no construction/placeholder fallback for this page — it cannot be toggled into `ConstructionComponent`.
- **Redirect rules:** none targeting or originating from `/about`. (The unrelated top-level `""` route redirects to `/spotting`, not `/about`.)
- **Primary nav entry:** `/about` is one of four hard-coded items in `AppComponent`'s `initialMenuList` (`/home/kwongtn/rosak_firebase/src/app/app.component.ts:18-50`):
  ```ts
  {
      name: "About",
      href: "/about",
      headerTitle: " - About the Project ",
      // tag: "Prelim",
      // style: "default",
  },
  ```
  It renders in the header menu (`d-header-menu` / `/home/kwongtn/rosak_firebase/src/app/header/menu/menu.component.ts`) with no badge/tag (the commented-out `tag: "Prelim"` / `style: "default"` lines show a badge was once planned but is currently disabled). On narrow viewports (`window.innerWidth < 1024`), `AppComponent.getHeader()` shows `" - About the Project "` next to the generic site title.

## Purpose

A public, static-content "about the project" page for the MLPTF (Malaysia Land Public Transport Fans) community site. It explains what the overall project is, lists the sub-projects/products under the MLPTF umbrella and their maturity status, credits the team members (with photos, roles, and social links), asks for donations via OpenCollective, and lists the open-source tech stack used to build the site. It requires no authentication and exposes no role-gated content — anyone (including logged-out visitors) can view it. It sits alongside `/compliance` as one of the two "informational" pages in the site's top-level route table (as opposed to the operational pages: `/spotting`, `/insiden`, `/situasi`, `/tracker`, `/gallery`, `/console`, `/profile`).

## Component Tree

```
AboutComponent                 (about.component.ts)      selector: app-about
├─ ProjectsCardComponent × N   (projects-card/…)          selector: about-projects
├─ AvatarCardComponent × N     (avatar-card/…)             selector: about-avatar
└─ TechstackCardComponent × N  (techstack-card/…)          selector: about-techstack
```

- **`AboutComponent`** — `/home/kwongtn/rosak_firebase/src/app/about/about.component.ts`. Standalone component; the page's sole top-level container. Opens a live Firestore `onSnapshot` listener on document `public/about` and stores the result in `items: PublicAboutDocument | undefined`. Owns the `showLoading` spinner flag. Iterates `items.projects`, `items.personnel`, `items.techStacks` with `@for` loops in the template and passes each array element down via `[data]` to the three card components below. No inputs/outputs of its own (it is routed to directly, not embedded by a parent). No router params are read or used.
- **`AvatarCardComponent`** (`about-avatar`) — `/home/kwongtn/rosak_firebase/src/app/about/avatar-card/avatar-card.component.ts`. Renders one team member: `@Input() data!: Personnel`. Standalone; imports `NzCardModule`, `NzToolTipModule`, `NzIconModule`, `NzAvatarModule`. Also imports a local static icon map (`icon = Icon` from `avatar-card.icons.ts`) used to render inline SVG social icons.
- **`ProjectsCardComponent`** (`about-projects`) — `/home/kwongtn/rosak_firebase/src/app/about/projects-card/projects-card.component.ts`. Renders one sub-project: `@Input() data!: Project`. Standalone; imports `NzCardModule`, `NzTagModule`.
- **`TechstackCardComponent`** (`about-techstack`) — `/home/kwongtn/rosak_firebase/src/app/about/techstack-card/techstack-card.component.ts`. Renders one tech-stack entry: `@Input() data!: TechStack`. Standalone; imports `NzCardModule`.
- All three card components are "dumb" presentational components: no services, no outputs, no internal state beyond the `@Input()`; all communication is one-directional data down from `AboutComponent`.
- **`/home/kwongtn/rosak_firebase/src/app/about/models/firestore.ts`** — shared TypeScript interfaces (`Personnel`, `TechStack`, `Project`, `PublicAboutDocument`) used to type-cast the raw Firestore snapshot data. These are frontend-only convenience types; Firestore itself is schemaless, so nothing on the backend enforces this shape (see Known Quirks).
- **`/home/kwongtn/rosak_firebase/src/app/about/utils.ts`** — exports `sortOrder(arr)`, a comparator-based sort helper keyed on an `order` numeric field. **Not called anywhere** in the about feature (or the rest of the app) — dead code (see Known Quirks).
- This feature is entirely self-contained: a repo-wide grep confirms no other feature imports `AboutComponent`, `about-avatar`, `about-projects`, or `about-techstack` — the only inbound reference is the route's `loadComponent()` and the nav-menu href string `/about`.

## Functionality & Behavior

1. **Loading state.** The whole page body is wrapped in `<nz-spin [nzSpinning]="showLoading">` (`about.component.html:1`). `showLoading` starts `true` (`about.component.ts:39`) and is flipped to `false` only inside the Firestore `onSnapshot` callback, and only once `doc.exists()` is true (`about.component.ts:47-57`). Until the first snapshot arrives, the whole page (including headings) is dimmed/covered by the ng-zorro spinner overlay — there's no skeleton/placeholder content, and the headings and static copy still render underneath the spinner overlay because they're plain static HTML, not conditionally rendered.
   - **Edge case:** if the Firestore document `public/about` does not exist, `doc.exists()` is false forever, the callback body's `if` never executes, `showLoading` stays `true` permanently, and the page spins forever with no timeout, retry, or error UI.
   - **Edge case:** if the `onSnapshot` listener itself errors (permission-denied, offline, etc.), there is no error callback registered (`onSnapshot` is called with only a success callback, no error handler) — an error would be silently swallowed by the Firebase SDK's default behavior and the page would spin forever with no visible error state.
2. **Live updates, not one-shot fetch.** `onSnapshot` (not `getDoc`) is used, so the page is reactive: any write to the `public/about` Firestore document (e.g. an admin editing team bios) is pushed to any currently-open `/about` tab in real time without a page refresh.
3. **Cleanup.** `ngOnDestroy` calls the stored `Unsubscribe` function to detach the Firestore listener when the component is destroyed (route navigated away) — `about.component.ts:64-68`. Prevents listener leaks across navigations.
4. **Section 1 — "About the project"** (`about.component.html:2-73`):
   - `<h1>About the project</h1>` static heading.
   - A commented-out block (`about.component.html:5-30`) would have shown two CI/CD build-status badge images (Semaphore CI backend build badge and a GitHub Actions frontend build badge), both driven by `branchName` (`build.git.branch` from the generated `src/build.ts`) and `semaphoreBadgeKey` (`environment.semaphore.badgeKey`). **This is currently dead/disabled markup** — the badges do not render on the live page today (see Known Quirks).
   - `{{ items?.aboutProject }}` — a free-text string from Firestore rendered directly as page copy, no sanitization/markdown parsing beyond Angular's default HTML-escaping interpolation (so any HTML in the field is shown as literal text, not rendered as markup).
   - **Projects grid:** `items?.projects` iterated with `@for` (track by the item object itself, not an id field — see Known Quirks) into an `nz-list nzGrid` responsive grid. Each item is wrapped in a column (`nzXs=24` full width / `nzMd=12` half width / `nzXl=8` third width) and only rendered `@if (item.display)` — a `Project.display` flag lets Firestore-side data be authored but hidden from the public page without deleting it. Each visible item renders `<about-projects [data]="item" />`.
   - **Donation call-to-action:** static heading "Like our projects? Buy us a coffee ☕ / beer 🍺 / whatever you like ✨", an OpenCollective "Contribute" button image linking to `https://opencollective.com/mlptf/projects/community-site` (opens in a new tab, `target="_blank"`, no `rel="noopener"` on this particular link — see Known Quirks), and a static paragraph of copy about funding being optional but transparent/auditable via the OpenCollective public ledger.
5. **Section 2 — "About the team"** (`about.component.html:75-98`): `items?.personnel` iterated the same way into an `nz-list nzGrid` (columns: `nzXs=24`/`nzSm=12`/`nzMd=8`/`nzXl=6`, i.e. up to 4 per row on extra-large screens), gated per-item on `item.display`, rendering `<about-avatar [data]="item" />` for each visible member.
6. **Section 3 — "Special Mentions"** (`about.component.html:100-102`): entirely commented out — a heading-only section stub that was never built out. Currently invisible/non-existent on the rendered page.
7. **Section 4 — "Tech Stacks & Open Source"** (`about.component.html:104-119`): `items?.techStacks` iterated into an `nz-list nzGrid` (columns: `nzXs=12`/`nzMd=8`/`nzXl=6`). **Note:** unlike the other two lists, tech-stack items are rendered unconditionally — there is no `@if (item.display)` check here even though nothing in the `TechStack` interface has a `display` field to begin with, so every tech-stack document entry always shows.
8. **`AvatarCardComponent` rendering** (`avatar-card.component.html`):
   - `nz-card` with a cover template showing an `nz-avatar` (100px, `[nzSrc]="data.avatar"`, with a fallback `nzIcon="user"` glyph shown if the image URL is missing/broken).
   - Card title template shows `data.name`, underlined and bold via `.name` CSS class.
   - Card body shows `data.title` (role/position) then `data.description` (free text bio), each in its own `<p>`.
   - **Social icons row:** `data.socials` (array of `{link, name, type}`) iterated (`track social`, i.e. by object identity) into a row of icon links, laid out `flex-direction: row-reverse` (so icons visually read left-to-right in reverse array order — i.e., the _last_ social in the array appears leftmost). Each icon is wrapped in an `nz-tooltip` showing `social.name` on hover (placement: bottom), and is a clickable `<a [href]="social.link" target="_blank">` (no `rel="noopener"` here either). The actual icon glyph is an inline SVG path pulled from the local `Icon` map (`avatar-card.icons.ts`) keyed by `social.type`, which supports exactly three values: `"github"`, `"linkedin"`, `"instagram"` (typed as a union in `PersonnelSocial.type` — any other string would fail to type-check when authoring Firestore-adjacent code, but since Firestore data is untyped JSON at runtime, an unexpected `type` value from Firestore would simply fail to match any icon and likely render blank/broken via `nz-icon`'s `[nzType]` binding).
9. **`ProjectsCardComponent` rendering** (`projects-card.component.html`):
   - `nz-card` titled with `data.name`, body showing `data.description`.
   - `nzExtra` slot (top-right of the card) shows a color-coded `nz-tag` status badge via a `@switch` on `data.status`:
     - `"alpha"` → tag color `volcano` (red/orange), label "Alpha"
     - `"beta"` → tag color `gold`, label "Beta"
     - `"stable"` → tag color `blue`, label "Stable"
     - anything else (including the typed `"planned"` value, and any unrecognized value) → `@default` branch, tag color `lime`, label "Planned"
   - Note: `data.startDate` (typed as `Date` in the `Project` interface) is **never rendered anywhere in the template** — it's fetched/typed but unused in the UI.
10. **`TechstackCardComponent` rendering** (`techstack-card.component.html`): the entire card is wrapped in an `<a [href]="data.url" target="_blank" rel="noopener noreferrer">` (this one _does_ have `rel="noopener noreferrer"`, inconsistent with the other two link types above) making the whole card clickable through to the tech's homepage/repo. Inside: an `<img [src]="data.iconUrl">` logo (CSS-capped to `max-height:10vh; max-width:10vw; object-fit:contain` — no fallback/alt-error handling if the icon URL 404s beyond the static `alt="logo"` attribute), then `data.name` (bold) and `data.description`.
11. **Responsive grid breakpoints** are ng-zorro's standard `nz-col` breakpoint props (`nzXs`/`nzSm`/`nzMd`/`nzXl`), using ng-zorro/Ant Design's default breakpoint pixel widths (not custom breakpoints defined in this feature) — an important detail for the Tailwind rewrite since these will need to be reimplemented as Tailwind responsive grid classes.
12. **No pagination, filtering, or sorting UI exists anywhere in this feature.** Whatever order the arrays are stored in Firestore is the order rendered, aside from the per-item `display` boolean gate on `projects` and `personnel` (not on `techStacks`). The `Personnel.order` and a generic `sortOrder()` utility exist in the codebase (see Component Tree) but are **not wired up** to any of the three `@for` loops — so despite `order` being modeled as a field, nothing in this feature actually sorts by it today.
13. **No forms, no user input, no mutations anywhere on this page.** It is 100% read-only/display-only content — no create/edit/delete affordance for team members, projects, or tech stack entries is exposed in the frontend (any editing of the underlying Firestore document must happen out-of-band, e.g. via the Firebase console or a separate admin tool not present in this codebase).

## Data & API Contracts

**This feature uses no GraphQL at all** — a full read of every file under `about/` confirms there is no ``gql` `` tagged template, no Apollo `query`/`mutate` call, and no import from `src/app/models/query` or `src/app/models/mutation.ts` anywhere in this directory. The `/about` page is the one major exception in the app that talks directly to Firestore instead of the Django/GraphQL backend. Nothing here needs tracing into the `rosak_backend` schema.

- **Firebase Firestore (read-only, real-time):**
  - **Provider setup:** `/home/kwongtn/rosak_firebase/src/app/app.module.ts:91,93` — `provideFirebaseApp(() => initializeApp(environment.firebase))` and `provideFirestore(() => getFirestore())`, using the Firebase project credentials in `environment.firebase` (project `rosak-7223b`; see `/home/kwongtn/rosak_firebase/src/environments/environment.ts:9-17`). No Firestore emulator is configured, so this connects to the **live production Firestore project** even when the app is run locally (`ng serve`).
  - **Read:** `onSnapshot(doc(firestore, "public", "about"), callback)` — `about.component.ts:47-57`. Subscribes to document path `public/about`. Live-updates on every remote write. No `getDoc()`/one-shot fetch is used anywhere in this feature.
  - **Document shape** (frontend-assumed, from `/home/kwongtn/rosak_firebase/src/app/about/models/firestore.ts`, cast via `as PublicAboutDocument` — Firestore does not enforce this at the database level):
    ```ts
    interface PublicAboutDocument {
      personnel: Personnel[];
      techStacks: TechStack[];
      projects: Project[];
      aboutProject: string;
    }
    interface Personnel {
      name: string;
      avatar: string;
      title: string;
      description: string;
      display: boolean;
      order: number;
      socials: {
        link: string;
        name: string;
        type: "github" | "linkedin" | "instagram";
      }[];
    }
    interface Project {
      description: string;
      name: string;
      startDate: Date; // never rendered in the UI
      display: boolean;
      status: "alpha" | "beta" | "stable" | "planned";
    }
    interface TechStack {
      description: string;
      name: string;
      iconUrl: string;
      url: string;
      // no `display` field
    }
    ```
  - **Write:** none. This feature performs zero writes to Firestore (or anywhere else). The `public/about` document must be populated/maintained by some other mechanism (Firebase console, a script, or an admin tool not present in `rosak_firebase`).
  - **Security rules:** no `firestore.rules` file exists anywhere in this repo, so read/write access rules for the `public/about` document cannot be confirmed from this codebase — they live either in the Firebase console directly or in a separate infrastructure repo not available here (see Open Questions).
- **REST:** none used in this feature.
- **Firebase Auth:** not used directly by any file under `about/` (no guard, no `AuthService` injection, no `*ngIf` on auth state anywhere in this feature's templates).
- **Firebase Analytics:** not used directly by any file under `about/` (the app-wide `Analytics` provider is injected in `AppComponent`, not here).
- **Browser storage:** none — no `localStorage`/`sessionStorage`/`IndexedDB` reads or writes anywhere under `about/`.
- **Build metadata (non-Firestore, static):** `import build from "src/build"` (`about.component.ts:5`) pulls `build.git.branch` for use in the now-commented-out CI badge URLs. `/home/kwongtn/rosak_firebase/src/build.ts` is a generated file (comment: "Build information, automatically generated by `ng-info`") containing `version`, `timestamp`, `message`, and `git.{user,branch,hash,fullHash}` — at rest in the repo it currently holds placeholder/test values (`branch: "main"`, `hash: "<<This is a test build>>"`), and is presumably regenerated by the CI pipeline at real build time. Since the badge markup is commented out, this import currently has no visible effect on the rendered page.

## State Management

- **No shared/global state.** `AboutComponent` owns all of its state locally: `items: PublicAboutDocument | undefined`, `showLoading: boolean`, `unsubscribe: Unsubscribe | undefined`.
- **Lifecycle:** state is populated asynchronously and reactively via the Firestore `onSnapshot` listener established in the constructor (not `ngOnInit`, which is a no-op stub here — `about.component.ts:60-62`). It is invalidated/refreshed automatically and continuously for as long as the component instance and its Firestore subscription live — i.e., for as long as the user stays on `/about`. It is torn down in `ngOnDestroy` when the user navigates away.
- **No RxJS Subjects, no NgRx/service-based store, no Angular signals** are used anywhere in this feature. The only "service" touched is the injected `Firestore` instance itself (Angular Fire's DI-provided singleton), used purely for the one `onSnapshot` call.
- **No interaction with app-wide services** such as `AuthService`, `ThemeService`, or `ImageUploadService` — this feature is fully decoupled from the rest of the app's state, aside from being listed in `AppComponent.initialMenuList` for navigation purposes (that array lives in and is owned by `AppComponent`, outside this feature's scope).

## Permissions, Roles & Flags

- **Route-level:** fully public — no `canActivate`/`canLoad` guard on the `/about` route (contrast with `situasi` → `betaTesterOnly`, `console` → `adminOnly`, `profile` → `redirectUnauthorizedToSpotting`, all defined in the same `app-routing.module.ts`).
- **Template-level:** no `*ngIf`/`@if` gating on auth state, custom claims, or roles anywhere in any `about/` template. The only conditional rendering is the content-authoring `display` boolean per-item on `projects` and `personnel` (see Functionality & Behavior #4, #5), which is a data-driven visibility flag set by whoever authors the Firestore document — not a user-permission check.
- **Backend/Firestore-level:** cannot be confirmed from this repo — no `firestore.rules` file is present. Whether the `public/about` document is truly world-readable (as the `public` collection name implies) or has more nuanced rules is unverifiable from the frontend code alone (see Open Questions).
- **No feature flags** specific to this feature exist in `environment*.ts` (no `about`-related key). The route also has no maintenance-mode entry (see Path(s) & Routing).
- **Net effect:** anyone — including a fully logged-out visitor — can load `/about` and see whatever is currently published in `public/about`. There is no beta-tester/admin-only content on this page.

## Known Quirks / Tech Debt

- **Dead code — CI badge markup.** `about.component.html:5-30` contains a full commented-out block rendering two build-status badges (Semaphore backend build, GitHub Actions frontend build) driven by `branchName` and `semaphoreBadgeKey` (`about.component.ts:42-43`). The `.build-status` CSS rule in `about.component.scss:2-5` targets this now-invisible markup. The `<h1>About the project</h1>` heading currently renders with no badges next to it.
- **Dead code — `sortOrder()` utility.** `/home/kwongtn/rosak_firebase/src/app/about/utils.ts` defines `sortOrder(arr)` (sorts by an `order` numeric field) but it is never imported/called anywhere in the codebase (confirmed by repo-wide grep). The `Personnel.order` field exists in the data model with no corresponding UI sort — display order is whatever order Firestore returns the array in.
- **Dead/stub section — "Special Mentions".** `about.component.html:100-102` is a commented-out heading-only stub (`<h1>Special Mentions</h1>`) that was apparently planned but never implemented.
- **Unused field — `Project.startDate`.** Modeled as `Date` in `/home/kwongtn/rosak_firebase/src/app/about/models/firestore.ts:27` but never read/rendered by `ProjectsCardComponent` or anywhere else.
- **Missing `display` gating on tech stacks.** `projects` and `personnel` are both individually gated by an `item.display` boolean before rendering; `techStacks` items are rendered unconditionally with no equivalent field even modeled on the `TechStack` interface — inconsistent authoring capability across the three lists.
- **Inconsistent `rel` attribute usage on outbound links.** `TechstackCardComponent`'s wrapping `<a>` uses `rel="noopener noreferrer"` (`techstack-card.component.html:1`), but the OpenCollective donation link (`about.component.html:53-56`) and every per-social-icon link in `AvatarCardComponent` (`avatar-card.component.html:15`) use `target="_blank"` with **no `rel` attribute at all** — a minor but real inconsistency/tab-nabbing-hardening gap worth normalizing in the rewrite.
- **Silent-forever loading/error states.** As detailed in Functionality & Behavior #1, if the Firestore document is missing, or the `onSnapshot` listener errors (no error callback is registered — `about.component.ts:48-57` only passes a success callback), the page shows the ng-zorro spinner indefinitely with no user-facing error message, retry button, or timeout. This is a gap worth explicitly fixing in the rewrite.
- **Frontend-typed but backend-schemaless data contract.** The entire `PublicAboutDocument`/`Personnel`/`Project`/`TechStack` interface set in `models/firestore.ts` is a TypeScript-only contract enforced by nothing at runtime — a malformed or missing field in the live Firestore document (e.g. a personnel entry missing `socials`, or a `social.type` value outside the three known enum strings) would not throw a schema validation error; it would either render blank/undefined text or fail silently depending on where in the template the missing field is used. The rewrite should decide whether to keep this loose contract or introduce runtime validation.
- **Trivial no-op constructors/`ngOnInit`s.** `AvatarCardComponent`, `ProjectsCardComponent`, and `TechstackCardComponent` all have empty `constructor() { return; }` and `ngOnInit(): void { return; }` bodies — boilerplate with no behavior, safe to drop in a rewrite.
- **Empty stylesheet file.** `/home/kwongtn/rosak_firebase/src/app/about/projects-card/projects-card.component.scss` exists but is completely empty (0 bytes) — the card relies entirely on ng-zorro's default `nz-card` styling with no custom CSS.
- **Minor code-style inconsistency.** `projects-card.component.ts` uses 2-space indentation and slightly different formatting (`standalone:true` with no space, trailing comma inside `imports` array) versus the 4-space/prettier-style formatting used in every other file in this directory — cosmetic only, likely just missed by a formatter/linter run at some point.
- **Live-production Firestore, even locally.** Because no Firestore emulator is wired into `environment.ts`, running the app locally (`ng serve`) against the default environment still reads live data from the production `rosak-7223b` Firestore project for this page — worth flagging for anyone setting up a local dev/test environment for the rewrite.

## Open Questions / Verify Against Live Site

- **Actual content of `public/about`.** The real personnel list (names, titles, bios, avatar URLs, social links), the real projects list (names, descriptions, statuses, start dates), the real tech-stack list (names, icon URLs, links), and the `aboutProject` free-text copy all live in a live Firestore document that is not present anywhere in this repo (no seed/fixture JSON was found). The exact copy, number of team members/projects/tech entries, and their `display` flags can only be confirmed by inspecting the live Firestore document (e.g. via Firebase console) or the rendered live page — I could not verify any of this from static code.
- **Whether the commented-out CI badges (`about.component.html:5-30`) are truly absent from the live page**, or whether this is stale markup that was actually re-enabled in a way not reflected in this exact file state — worth a quick visual check.
- **Firestore security rules for `public/about`.** No `firestore.rules` file exists in this repo, so I could not confirm whether the document is genuinely publicly readable-only, whether writes are locked down to a specific admin UID/claim, or how "public" the `public` collection really is at the database level. Verify via Firebase console → Firestore → Rules.
- **Exact rendered pixel breakpoints / column counts.** I described the ng-zorro `nz-col` breakpoint props used (`nzXs`/`nzSm`/`nzMd`/`nzXl`) per grid, but the actual visual column count at a given real-world viewport width depends on ng-zorro/Ant Design's internal default breakpoint definitions (not overridden here), which I did not trace into the `ng-zorro-antd` library source — worth confirming visually at a few breakpoints (mobile, tablet, desktop, large desktop) before committing to equivalent Tailwind grid classes.
- **Whether the header nav badge/tag for "About" (commented-out `tag: "Prelim"` / `style: "default"` in `app.component.ts:47-48`) was ever live in production** — currently it renders with no tag, but the presence of commented code suggests it may have shown a "Prelim" badge at some point. Cosmetic, but worth confirming against any historical screenshots if pixel-perfect parity matters.
- **Whether `startDate` on `Project` was ever intended to be shown** (e.g. "since 2022") and was simply cut, or is genuinely vestigial — worth asking the product owner before deciding whether to carry it into the rewrite's data model.
