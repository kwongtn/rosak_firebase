# Component: about

## 📌 Purpose & Scope

- **Core Responsibility:** Renders the public `/about` page — project description, a grid of
  sub-projects, the team ("personnel") roster, and the open-source tech stack — all sourced
  live from a single, hand-edited Firestore document (`public/about`). It is a pure read/render
  surface: the app never writes to this document, an admin edits it directly.
- **Domain/Layer:** Angular Presentation (standalone, lazy-loaded routed page component). Client-
  rendered only — `app.routes.server.ts` explicitly maps `/about` to `RenderMode.Client` because
  the content changes by hand, not by request, so there's no SSR benefit.

## 🔌 Interface & Data Flow

- **Inputs / Props / Signals:** None. `AboutPage` is a route-level component
  (`loadComponent` in `app.routes.ts`, path `about`, title `"MLPTF | About"`) with no `@Input`s
  or route params — all data comes from Firestore, not from the route or a parent.
- **Outputs / Events / API Responses:**
  - No `@Output`s/EventEmitters — this is a leaf, read-only page.
  - Subscribes to a live Firestore snapshot listener (`onSnapshot` on `public/about`); every
    remote change re-renders the page reactively via signals.
  - Derived read-only signals exposed to the template: `isLoading`, `aboutProject` (string),
    `projects` (filtered by `display`), `personnel` (filtered by `display && name`, sorted by
    `order`, `socials` normalized to `[]`), `techStacks`, and a `statusVariant(status)` helper
    mapping a project's status to a badge color variant.
- **Dependencies:**
  - `firebase/app`, `firebase/firestore` — direct Firebase SDK usage (`initializeApp`/`getApps`,
    `getFirestore`, `doc`, `onSnapshot`), guarded by `isPlatformBrowser` so it never runs during
    SSR/prerender.
  - `src/app/environments/environment.ts` — supplies `environment.firebase` config used to
    initialize (or reuse) the Firebase app.
  - `src/app/features/about/data/about.model.ts` — local TypeScript interfaces describing the
    Firestore document shape (`PublicAboutDocument`, `Personnel`, `PersonnelSocial`, `TechStack`,
    `Project`, `ProjectStatus`) — a type contract only, not a service.
  - `src/app/shell/app-nav/app-nav.component.ts` and
    `src/app/shell/app-footer/app-footer.component.ts` — page chrome (nav bar and build-info
    footer), each with their own further dependencies (auth, theming, upload, version-check
    services; a build-info footer fetch) not audited here.
  - `src/app/ui/*` (Spartan/Helm-style UI primitives): `HlmBadge`, `HlmButton`,
    `HlmCardImports` (Card/CardHeader/CardTitle/CardContent), `HlmSkeleton` — style-only
    directives (CVA-driven class composition), no state of their own.

## ⚙️ Internal State & Logic

- Angular Signals only, no RxJS/NgRx/BehaviorSubject.
- `isLoading` (`signal<boolean>`, starts `true`) and `_data` (`signal<PublicAboutDocument |
undefined>`, private) hold raw state; everything the template reads (`aboutProject`,
  `projects`, `personnel`, `techStacks`) is a `computed()` derived from `_data`.
- The Firestore `onSnapshot` subscription is opened in the constructor (browser only) and torn
  down in `ngOnDestroy` via the stored `Unsubscribe` handle — the only lifecycle hook
  implemented (`OnDestroy`).
- No local caching/store: state lives only as long as the component instance; a fresh
  subscription is created on every navigation to `/about`.

## 🧩 Extension Points & Hooks

- **Schema-driven rendering:** every section (`projects`, `personnel`, `techStacks`) is an
  `@if`/`@for` over an array already filtered by a `display` boolean in the Firestore doc — new
  entries appear automatically without code changes; hiding one is just an admin edit.
- **Status/variant mapping table:** `STATUS_VARIANT` is a small, centralized lookup from project
  status string to badge variant, defaulting to `"neutral"` for unknown values — new
  `ProjectStatus` values can be added to the model and this map without touching template logic.
- **Reusable UI directives:** all visual composition goes through the shared `Hlm*` directives
  (`hlmCard`, `hlmBadge`, `hlmBtn`, `hlmSkeleton`), so new variants/sizes added centrally in
  `src/app/ui` are picked up here for free.
- **Document shape is the seam:** because the entire page is one Firestore document typed by
  `about.model.ts`, adding a new top-level field (e.g. a new content section) is additive — extend
  the interface, add a computed signal, add a template block; no breaking change to existing
  consumers of the doc.

## 💡 Potential Feature Opportunities

- **Client-side search/filter across personnel and projects:** `personnel` and `projects` are
  already `computed()` signals derived from `_data` after a `display` filter (and, for
  `personnel`, a sort by `order`) — folding a `searchTerm` signal into those same `computed()`s
  to match against `name`/`title`/`description` is a small additive change on an existing seam.
  Ready now.
- **Explicit connection-error state:** the `onSnapshot` error callback in `about.page.ts` today
  only does `() => this.isLoading.set(false)` — a failed subscription renders identically to an
  empty doc, with no user-visible distinction or retry. Not ready as-is: needs a new `hasError`
  signal set inside that error callback plus an `@if` branch in `about.page.html` (with a retry
  action that re-invokes the existing `onSnapshot` subscription logic in the constructor).
  Context for future LLMs: no error signal or error UI currently exists on this page at all.
- **Chronological project timeline:** `Project` already carries a `startDate: string` field in
  `about.model.ts`, but the `projects` computed signal only filters by `display` — it is never
  sorted. Ready now: add a `.sort()` by parsed `startDate` in the same `computed()` (mirroring
  the existing `order`-based sort already used for `personnel`) to render projects oldest/newest
  first without any model or Firestore change.
- **Share/copy-link buttons on personnel and project cards:** `PersonnelSocial` already types a
  closed set of platforms (`"github" | "linkedin" | "instagram"`) rendered per person, and the
  page already gates all browser-only work behind `isPlatformBrowser(inject(PLATFORM_ID))` for
  the Firestore subscription. Ready now: a "copy profile link" or native share button per card
  can reuse that same browser guard and the existing `HlmButton` directive — no new service
  needed.
- **Deep-linkable sections (e.g. `/about#personnel`):** `AboutPage` currently takes no route
  params and never injects `ActivatedRoute` — the three sections (projects, personnel, tech
  stack) have no addressable anchors. Not ready yet: would need `ActivatedRoute`/`fragment`
  injected in the constructor (a new dependency for this component) and stable `id` attributes
  added to each section in `about.page.html`; worth doing since the content is already segmented
  into exactly these three blocks, but the wiring doesn't exist today.

## 💡 Potential AI Feature Opportunities

- **AI-assisted CMS editing:** since `public/about` is hand-edited with no in-app UI, an
  AI-drafting tool (generate/rewrite `aboutProject` copy, personnel bios, or project
  descriptions from short prompts) could sit in front of the same Firestore document without
  touching this page at all.
- **Auto-summarized "what's new"**: an AI summary of recent `projects`/`techStacks` changes
  (diffed against a prior snapshot) could be surfaced as a small "recently updated" callout,
  since the page already reacts live to document changes via `onSnapshot`.
- **Smart status/description QA:** given the loose, hand-edited nature of the data (optional
  `socials`, freeform `description` strings, manually chosen `ProjectStatus`), an LLM-based
  linter could flag inconsistent or stale entries (e.g. a project marked `stable` with a
  changelog implying otherwise) before an admin saves the document.
