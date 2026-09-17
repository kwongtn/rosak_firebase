# Component: about

## 📌 Purpose & Scope

- **Core Responsibility:** Renders the public `/about` page — project description, a grid of
  sub-projects, the team ("personnel") roster, and the open-source tech stack — all sourced
  live from a single Firestore document (`public/about`). Admins can edit the document in-page
  via a structured editor (draft-in-signals, `setDoc` on save).
- **Domain/Layer:** Angular Presentation (standalone, lazy-loaded routed page component). Client-
  rendered only — `app.routes.server.ts` explicitly maps `/about` to `RenderMode.Client` because
  the content changes by hand, not by request, so there's no SSR benefit.

## 🔌 Interface & Data Flow

- **Inputs / Props / Signals:** None. `AboutPage` is a route-level component
  (`loadComponent` in `app.routes.ts`, path `about`, title `"MLPTF | About"`) with no `@Input`s
  or route params — all data comes from Firestore, not from the route or a parent.
- **Outputs / Events / API Responses:**
  - No `@Output`s/EventEmitters — this is a leaf page.
  - Subscribes to a live Firestore snapshot listener (`onSnapshot` on `public/about`); every
    remote change re-renders the page reactively via signals.
  - Derived signals exposed to the template: `isLoading`, `aboutProject` (string), `projects`
    (display-filtered, query-matched, sorted by `startDate`), `personnel` (display-filtered,
    query-matched, sorted by `order`, `socials` normalized), `techStacks` (query-matched),
    `statusVariant(status)`, `isAdmin` (from `AuthService`).
- **Dependencies:**
  - `firebase/app`, `firebase/firestore` — direct Firebase SDK usage (`initializeApp`/`getApps`,
    `getFirestore`, `doc`, `onSnapshot`, `setDoc`), guarded by `isPlatformBrowser` so it never
    runs during SSR/prerender.
  - `src/app/environments/environment.ts` — supplies `environment.firebase` config used to
    initialize (or reuse) the Firebase app.
  - `src/app/core/auth/auth.service.ts` — `isAdmin` signal (Firebase `admin` custom claim)
    gates the edit button; `idToken()` is not needed here because Firestore security rules
    (not GraphQL) enforce write access on `public/about`.
  - `src/app/features/about/data/about.model.ts` — local TypeScript interfaces describing the
    Firestore document shape (`PublicAboutDocument`, `Personnel`, `PersonnelSocial`, `TechStack`,
    `Project`, `ProjectStatus`) — a type contract only, not a service.
  - `src/app/features/about/data/about-edit.util.ts` — pure helpers for the admin editor:
    `draftFromDoc()` (normalizes missing fields), `sanitizeDraft()` (strips nameless rows,
    coerces undefined fields), `emptyProject`/`emptyPersonnel`/`emptyTechStack`/`emptySocial`
    factories, and `filterAndSortProjects`/`filterPersonnel`/`filterTechStacks` (query
    filtering + chronological sort).
  - `src/app/shell/app-nav/app-nav.component.ts` and
    `src/app/shell/app-footer/app-footer.component.ts` — page chrome.
  - `src/app/ui/*` (Spartan/Helm-style UI primitives): `HlmBadge`, `HlmButton`,
    `HlmCardImports` (Card/CardHeader/CardTitle/CardContent), `HlmSkeleton`, `HlmCheckbox`,
    `HlmInput`, `HlmNativeSelect` — style-only directives (CVA-driven class composition),
    plus `ToastService` for save/error feedback.

## ⚙️ Internal State & Logic

- Angular Signals only, no RxJS/NgNg/BehaviorSubject.
- `isLoading` (`signal<boolean>`, starts `true`) and `_data` (`signal<PublicAboutDocument |
undefined>`, private) hold raw state; everything the template reads (`aboutProject`,
  `projects`, `personnel`, `techStacks`) is a `computed()` derived from `_data` via the pure
  filter functions in `about-edit.util.ts`.
- `searchTerm` (`signal<string>`) drives the search box; it flows into the same `computed()`s
  so the page live-filters as the user types.
- **Admin editor:** when `isAdmin() && editMode()`, the template renders a structured form
  bound to `_draft` (`signal<PublicAboutDocument | undefined>`). `beginEdit()` calls
  `draftFromDoc(data)` to populate a normalized copy; `patchDraft()` / `updateProject()` /
  `updatePersonnel()` etc. update it immutably; `saveDraft()` calls `sanitizeDraft()` (to
  prevent Firestore rejecting undefined values or empty placeholder rows) then `setDoc()` on
  the same `public/about` doc. The live `onSnapshot` subscription picks up the save and
  re-renders the page automatically; `cancelEdit()` discards the draft.
- The Firestore `onSnapshot` subscription is opened in the constructor (browser only) and torn
  down in `ngOnDestroy` via the stored `Unsubscribe` handle — the only lifecycle hook
  implemented (`OnDestroy`).
- No local caching/store: state lives only as long as the component instance; a fresh
  subscription is created on every navigation to `/about`.

## 🧩 Extension Points & Hooks

- **Schema-driven rendering:** every section (`projects`, `personnel`, `techStacks`) is an
  `@if`/`@for` over an array already filtered by a `display` boolean in the Firestore doc — new
  entries appear automatically without code changes; hiding one is just an admin edit.
- **Admin editor seams:**
  - `emptyProject()` / `emptyPersonnel()` / `emptyTechStack()` / `emptySocial()` define the
    default shape of new entries — change one to add a new field to all newly created rows.
  - `sanitizeDraft()` determines which fields survive the save (drops nameless placeholders,
    coerces undefineds) — new required fields get validated here.
  - The editor's add/remove/update helpers are per-section and reusable — a new content section
    (e.g. a `blog` array) follows the same pattern: extend `PublicAboutDocument`, add
    `emptyBlog()`, wire the same `updateIn` / `addX` / `removeX` pattern.
- **Search/filter:** `searchTerm` feeds through `filterAndSortProjects`, `filterPersonnel`,
  and `filterTechStacks` in `about-edit.util.ts`; additional matchable fields (e.g. project
  `startDate`) are a one-line change in the relevant filter function.
- **Status/variant mapping table:** `STATUS_VARIANT` is a small, centralized lookup from project
  status string to badge variant, defaulting to `"neutral"` for unknown values — new
  `ProjectStatus` values can be added to the model and this map without touching template logic.
- **Reusable UI directives:** all visual composition goes through the shared `Hlm*` directives
  (`hlmCard`, `hlmBadge`, `hlmBtn`, `hlmSkeleton`, `hlmInput`, `hlmSelect`, `hlm-checkbox`),
  so new variants/sizes added centrally in `src/app/ui` are picked up here for free.
- **Document shape is the seam:** because the entire page is one Firestore document typed by
  `about.model.ts`, adding a new top-level field (e.g. a new content section) is additive — extend
  the interface, add an `empty*()` factory, add a computed signal, add a template block; no
  breaking change to existing consumers of the doc.

## 💡 Potential Feature Opportunities

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
- **Admin undo / edit history:** the in-editor `_draft` is ephemeral — cancelling discards
  unsaved work, and there's no local undo stack or Firestore revision history surfaced.
  Firestore has built-in revision history via the Firebase console; surfacing it in-app or
  adding a local undo stack would be additive on the existing editor seam.

## 💡 Potential AI Feature Opportunities

- **AI-assisted CMS editing:** the structured admin editor provides a natural integration point
  — an "AI draft" button per section (generate/rewrite `aboutProject` copy, personnel bios, or
  project descriptions from short prompts) could populate draft fields before the admin reviews
  and saves, using the same `patchDraft()` seam the manual editor uses.
- **Auto-summarized "what's new"**: an AI summary of recent `projects`/`techStacks` changes
  (diffed against a prior snapshot) could be surfaced as a small "recently updated" callout,
  since the page already reacts live to document changes via `onSnapshot`.
- **Smart status/description QA:** given the loose, hand-edited nature of the data (optional
  `socials`, freeform `description` strings, manually chosen `ProjectStatus`), an LLM-based
  linter could flag inconsistent or stale entries (e.g. a project marked `stable` with a
  changelog implying otherwise) before an admin saves the document — or could run automatically
  inside `sanitizeDraft()` to surface warnings in the editor before save.
