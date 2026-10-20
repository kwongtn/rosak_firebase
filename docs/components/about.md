# Component: about

## 📌 Purpose & Scope

- **Core Responsibility:** Renders the public `/about` page — project description, a grid of
  sub-projects, the team ("personnel") roster, the open-source tech stack, and a grid of external
  community projects — all sourced live from a single Firestore document (`public/about`). Admins
  can edit the document in-page through `AboutEditorComponent`, a form-only child; the page owns
  visibility and persistence (`setDoc` on save).
- **Domain/Layer:** Angular Presentation (standalone, lazy-loaded routed page component). Client-
  rendered only — `app.routes.server.ts` explicitly maps `/about` to `RenderMode.Client` because
  the content changes by hand, not by request, so there's no SSR benefit.

## 🔌 Interface & Data Flow

- **Inputs / Props / Signals:** `AboutPage` is a route-level component (`loadComponent` in
  `app.routes.ts`, path `about`, title `"MLPTF | About"`) with no `@Input`s or route params — all
  data comes from Firestore, not from the route or a parent.
- **Editor component (`AboutEditorComponent`, selector `app-about-editor`,
  `features/about/editor/about-editor.component.ts`):**
  - Inputs: `initial` (`PublicAboutDocument | undefined`) — the draft is built from it **once**, in
    `ngOnInit`; a later remote snapshot does not overwrite an open draft. `undefined` (no doc yet)
    starts from an empty draft. `saving` (`boolean`, default `false`) — disables both buttons and
    relabels Save "Saving…"; `submit()` also returns early while it is `true`.
  - Outputs: `submitted` (emits `sanitizeDraft(draft)`, ready for Firestore) and `dismissed`
    (Cancel).
  - It owns the draft (`_draft`, exposed read-only) and every add/remove/update helper. It does
    not touch Firestore, toasts or visibility.
- **Page wiring:** `[initial]="data()" [saving]="saving()" (submitted)="saveDoc($event)"
(dismissed)="cancelEdit()"`, rendered inside `@if (isAdmin() && editMode())`.
- **Outputs / Events / API Responses:**
  - The page has no `@Output`s/EventEmitters — it is a leaf page.
  - Subscribes to a live Firestore snapshot listener (`onSnapshot` on `public/about`); every
    remote change re-renders the page reactively via signals.
  - Page meta: in the constructor it sets `description`, `og:title`, `og:description` and
    `og:type` through `Meta.updateTag`. The route is client-rendered, so only JS-running crawlers
    see these; link-preview scrapers (WhatsApp, Telegram) still read the static `index.html`
    tags.
  - Derived signals exposed to the template: `isLoading`, `isError` (with `retry()`), `data`
    (read-only projection of `_data`, passed to the editor as `initial`), `aboutProject` (string),
    `projects` (display-filtered, query-matched, sorted oldest-first by `startDate`), `personnel`
    (display-filtered, query-matched, sorted by `order`, `socials` normalized),
    `activePersonnel` / `retiredPersonnel` (`personnel` split on the `retired` boolean),
    `techStacks` and `communityProjects` (query-matched), `isEmptyDoc` (doc missing or nothing
    visible, with no search active), `noResults` (search matched nothing), `sectionLinks` (the "On
    this page" jump targets, only for sections with content), `statusVariant(status)`,
    `projectStart(project)` (the "Started …" label), `personPeriod(person)` (the formatted period
    label), `isAdmin` (from `AuthService`).
- **Dependencies:**
  - `firebase/app`, `firebase/firestore` — direct Firebase SDK usage (`initializeApp`/`getApps`,
    `getFirestore`, `doc`, `onSnapshot`, `setDoc`), guarded by `injectIsBrowser()` so it never
    runs during SSR/prerender. `setDoc` is called only by the page (`saveDoc`).
  - `src/app/environments/environment.ts` — supplies `environment.firebase` config used to
    initialize (or reuse) the Firebase app.
  - `src/app/core/auth/auth.service.ts` — `isAdmin` signal (Firebase `admin` custom claim)
    gates the edit button and the editor; `idToken()` is not needed here because Firestore
    security rules (not GraphQL) enforce write access on `public/about`.
  - `src/app/features/about/editor/about-editor.component.ts` — the admin form, loaded with
    `@defer (on immediate)` so visitors who are not editing never download it. It imports
    `HlmButton`, `HlmCardImports`, `HlmCheckbox`, `HlmInput` and `HlmNativeSelect`.
  - `@angular/platform-browser` `Meta` (page meta tags) and `DOCUMENT` (`jumpTo` scrolling and
    focus).
  - `src/app/features/about/data/about.model.ts` — local TypeScript interfaces describing the
    Firestore document shape (`PublicAboutDocument`, `Personnel`, `PersonnelSocial`, `TechStack`,
    `CommunityProject`, `Project`, `ProjectStatus`) — a type contract only, not a service.
    `Personnel` carries `retired` (collapsed group) plus month-precision `startDate`/`endDate`
    strings (empty end = "Present").
  - `src/app/features/about/data/about-edit.util.ts` — pure helpers, used by both halves:
    - Editor side: `draftFromDoc()` (normalizes missing fields: defaults `name`, social
      `name`/`link`, keeps a missing `display` as hidden), `sanitizeDraft()` (strips nameless
      rows, coerces undefined fields), and the `emptyProject`/`emptyPersonnel`/`emptyTechStack`/
      `emptySocial`/`emptyCommunityProject` factories.
    - Page side: `filterAndSortProjects`/`filterPersonnel`/`filterTechStacks`/
      `filterCommunityProjects` (query filtering; projects sort oldest-first).
    - Display helpers: `formatPeriod(startDate, endDate)`, `formatElapsed(startDate, endDate,
now?)`, `formatPersonPeriod(person, now?)` and `formatProjectStart(project)`. The period
      labels are deterministic and locale-free ("MMM YYYY - MMM YYYY · N years M months"), sharing
      one `monthLabel` helper; `formatProjectStart` returns "Started MMM YYYY", or `""` for a
      `planned` project or one with no parseable start. The `now` argument keeps tenure testable
      off a fixed clock.
  - `src/app/ui/avatar/avatar.ts` — `AvatarComponent` (`app-avatar`), a round person image with an
    initials fallback. Inputs: `name`, `src`, `size` (default 48). It also exports the pure
    `initialsOf(name)`. Used on the team cards.
  - `src/app/ui/external-link-icon/external-link-icon.ts` — `ExternalLinkIconComponent`
    (`app-external-link-icon`), a decorative `aria-hidden` arrow with no inputs. Used beside the
    sr-only "(opens in new tab)" cue on every `target="_blank"` link.
  - `src/app/shell/app-nav/app-nav.component.ts` and
    `src/app/shell/app-footer/app-footer.component.ts` — page chrome.
  - `src/app/ui/*` (Spartan/Helm-style UI primitives): the page uses `HlmBadge`, `HlmButton`,
    `HlmCardImports` (Card/CardHeader/CardTitle/CardContent), `HlmInput` (search) and
    `HlmSkeleton`; plus `AvatarComponent`, `ExternalLinkIconComponent`, `AdSlotComponent` and
    `ToastService` (save/error feedback). All are style-only directives or thin components.

## ⚙️ Internal State & Logic

- Angular Signals only, no RxJS/NgNg/BehaviorSubject.
- **Page state:** `isLoading` (`signal<boolean>`, starts `true`), `isError`, `editMode`, `saving`,
  `searchTerm`, and `_data` (`signal<PublicAboutDocument | undefined>`, private, exposed as the
  read-only `data`). Everything the template reads is a `computed()` derived from `_data` via the
  pure filter functions in `about-edit.util.ts`. The public team grid splits `personnel` into
  `activePersonnel` and `retiredPersonnel` (one `computed()` each, filtering on the `retired`
  boolean) so retired people render under a collapsed `<details>` rather than in the active grid.
- `searchTerm` drives the search box; it flows into the same `computed()`s so the page live-filters
  as the user types. The "Clear" button calls `clearSearch()`. The search does not match the
  `aboutProject` intro, which is always visible (intentional). The search box and the jump nav are
  hidden in edit mode.
- **Empty states:** a missing doc, or one with nothing visible, shows "Nothing has been published on
  this page yet." (`data-testid="about-empty"`) and hides the search box. A search that matches
  nothing shows "No results for “term”." (`data-testid="about-no-results"`, `role="status"`).
- **Jump nav:** an "On this page" `<nav>` of buttons (only when more than one section has content,
  hidden in edit mode) calls `jumpTo(id)`. It scrolls (`auto` under `prefers-reduced-motion`) and
  moves focus to the section `h2`. Ids: `projects`, `team`, `tech-stack`, `community`. A plain
  `#id` href would resolve against `<base href="/">`, so the page uses a button.
- **Visibility and loading:** the "Edit" button shows only for admins once the doc has loaded
  without error and not while editing. `beginEdit()` sets `editMode`; `cancelEdit()` clears it.
  The editor sits in `@defer (on immediate)`, so its chunk is fetched only when an admin presses
  Edit. While it loads, a `@loading` skeleton (sr-only "Loading the editor…") shows; if the chunk
  fails, an `@error` box (`role="alert"`) offers a Close button that calls `cancelEdit()`.
- **Persistence (`saveDoc`, page):** guarded by the `saving` signal against double-submit. It calls
  `setDoc()` on `public/about` with the editor's sanitized doc. On success it calls `cancelEdit()`
  and shows a "Saved" toast; on failure it shows a "Save failed" toast and leaves the editor open
  with the draft intact. `saving` is passed to the editor, which disables both buttons. The live
  `onSnapshot` subscription then re-renders the page.
- **Editor state (`AboutEditorComponent`):** `_draft` (`signal<PublicAboutDocument | undefined>`)
  is set from `initial` in `ngOnInit` and updated immutably by the per-section helpers
  (`patchDraft`, `updateProject`/`addProject`/`removeProject`, `updatePersonnel`/`addPersonnel`/
  `removePersonnel`, `updateSocial`/`addSocial`/`removeSocial` (the socials are nested under a
  person and take the person's index plus the social's index), `updateTechStack`,
  `updateCommunityProject` and their add/remove pairs). Input values are read with `valueOf($event)`
  and `numberOf($event)`, not `$any($event.target)`. Save and Cancel live in one sticky bottom bar.
  Each entry list wraps its editor cards in the same responsive grid as the public section below
  (`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3`), so an edit cell lines up with the card
  it produces.
- **Headings:** one `h1` (the page title, `text-2xl font-bold`). Section headings are `h2`s at
  `text-lg font-semibold`: "Projects", "About the team", "Tech Stack & Open Source" and "Other
  Community Projects". The donate callout's heading is an `h2` at `text-base`. The intro paragraph
  is `text-base` with `max-w-prose`. In the editor, "Edit about page" is an `h2` (`text-lg`) and
  its sub-sections are `h3`s (`text-sm font-semibold`).
- **Cards:** team cards show `app-avatar` (image, or initials when there is no `avatar` or it
  fails to load). Project cards show "Started Jan 2024" from `projectStart()` when the project is
  live and has a valid start date. Every `target="_blank"` link (the GitHub button, socials, tech
  stack and community cards) shows `app-external-link-icon` beside its sr-only cue.
- **Accessibility:** search input has an `aria-label`; the error box is `role="alert"`; the
  skeleton is `aria-busy` with sr-only status text; avatars (`alt=""` on the image, `aria-hidden`
  on the initials) and the external-link arrow are decorative, and the person's name or link text
  is always rendered beside them. Images have explicit `width`/`height` and `loading="lazy"`. New-tab
  links carry an sr-only "(opens in new tab)" cue. Focus-visible rings on card links, text links and
  the `<summary>` elements.
- The Firestore `onSnapshot` subscription is opened in the constructor (browser only) and torn
  down in `ngOnDestroy` via the stored `Unsubscribe` handle — the only lifecycle hook
  implemented (`OnDestroy`).
- No local caching/store: state lives only as long as the component instance; a fresh
  subscription is created on every navigation to `/about`.

## 🧩 Extension Points & Hooks

- **Schema-driven rendering:** every section (`projects`, `personnel`, `techStacks`,
  `communityProjects`) is an `@if`/`@for` over an array in the Firestore doc (`projects` and
  `personnel` are additionally gated by their `display` boolean) — new entries appear automatically
  without code changes; hiding one is just an admin edit.
- **Retired personnel group:** the team section partitions on `Personnel.retired` — active people
  render in the 3-column grid, retired people inside a collapsed native `<details>`
  (`data-testid="personnel-retired"`) sharing one `#personCard` template through `[ngTemplateOutlet]`
  / `[ngTemplateOutletContext]`. The whole section renders when either group is non-empty.
- **Period fields:** `Personnel.startDate`/`endDate` are month-precision `"YYYY-MM"` strings (empty
  end = "Present"); the editor uses native `<input type="month">` and the card label is composed by
  `formatPersonPeriod`. Rendering is defensive — a legacy entry with no dates simply shows no period
  line. `Project.startDate` is a `YYYY-MM-DD` string in the editor placeholder, but the display
  uses only its year and month.
- **Admin editor seams:**
  - `emptyProject()` / `emptyPersonnel()` / `emptyTechStack()` / `emptySocial()` /
    `emptyCommunityProject()` (in `about-edit.util.ts`) define the default shape of new entries —
    change one to add a new field to all newly created rows.
  - `draftFromDoc()` is the normalization seam for legacy rows: give any new field a default there,
    or an old row will read it as undefined.
  - `sanitizeDraft()` determines which fields survive the save (drops nameless placeholders,
    coerces undefineds) — new required fields get validated here.
  - The editor's per-section add/remove/update helpers (in `AboutEditorComponent`) follow one
    pattern: `updateIn(key, …)` plus `addX`/`removeX`. A new content section (e.g. a `blog` array)
    extends `PublicAboutDocument`, adds `emptyBlog()`, adds a template block, and wires the same
    helpers.
  - The page's `saveDoc()` is the only persistence path. Saving a new field needs no change there,
    because the editor emits the whole doc.
- **Section anchors:** a new content section needs a stable `id` on its `h2`, a `sectionLinks`
  entry (with its `show` condition), and a `jumpTo` target.
- **Search/filter:** `searchTerm` feeds through `filterAndSortProjects`, `filterPersonnel`,
  `filterTechStacks`, and `filterCommunityProjects` in `about-edit.util.ts`; additional matchable
  fields (e.g. project `startDate`) are a one-line change in the relevant filter function.
- **Status/variant mapping table:** `STATUS_VARIANT` is a small, centralized lookup from project
  status string to badge variant, defaulting to `"neutral"` for unknown values — new
  `ProjectStatus` values can be added to the model and this map without touching template logic.
- **Reusable UI directives:** all visual composition goes through the shared `Hlm*` directives
  (`hlmCard`, `hlmBadge`, `hlmBtn`, `hlmSkeleton`, `hlmInput`, `hlmSelect`, `hlm-checkbox`),
  so new variants/sizes added centrally in `src/app/ui` are picked up here for free. Within this
  feature, `hlmSelect` and `hlm-checkbox` are used only by the editor. The shared `app-avatar` and
  `app-external-link-icon` can be reused by any other page that shows people or new-tab links.
- **Document shape is the seam:** because the entire page is one Firestore document typed by
  `about.model.ts`, adding a new top-level field (e.g. a new content section) is additive — extend
  the interface, add an `empty*()` factory, add a computed signal, add a template block; no
  breaking change to existing consumers of the doc.
- **Specs:** `about.page.spec.ts` mocks `firebase/app` and `firebase/firestore` with `vi.mock` /
  `vi.hoisted` — the reusable pattern for any Firestore-reading page. The editor's form behaviour
  (draft from `initial`, emitted doc, Cancel, saving lock, per-person socials) is covered in
  `editor/about-editor.component.spec.ts`. The pure helpers are in `data/about-edit.util.spec.ts`
  (including `formatProjectStart`). `src/app/ui/avatar/avatar.spec.ts` covers `initialsOf` and the
  image/fallback behaviour; `src/app/ui/external-link-icon/external-link-icon.spec.ts` covers the
  decorative arrow.

## 💡 Potential Feature Opportunities

- **Share/copy-link buttons on personnel and project cards:** `PersonnelSocial` already types a
  closed set of platforms (`"github" | "linkedin" | "instagram"`) rendered per person, and the
  page already gates all browser-only work behind `injectIsBrowser()` for the Firestore
  subscription. Ready now: a "copy profile link" or native share button per card can reuse that
  same browser guard and the existing `HlmButton` directive — no new service needed.
- **URL fragment deep-links (e.g. `/about#team`):** the in-page jump nav exists, and the section
  ids are in place (`projects`, `team`, `tech-stack`, `community`). Still open: `AboutPage` takes
  no route params and never reads the URL fragment. Wiring it needs `ActivatedRoute` (or the
  router's fragment scroll) and a new dependency for this component. The URL-state sync layer in
  `docs/COMPONENTS.md` covers the same need.
- **Admin undo / edit history:** the editor's `_draft` is ephemeral — cancelling discards unsaved
  work, and there's no local undo stack or Firestore revision history surfaced. Firestore has
  built-in revision history via the Firebase console; surfacing it in-app or adding a local undo
  stack would be additive on the editor's draft seam.
- **Real SEO (deferred by owner):** the page is client-rendered, so link previews and non-JS crawlers
  see only the static `index.html` tags (title "TranSPOT", no og tags). Prerendering `/about` or
  moving it to SSR would fix that. The owner chose meta tags only for now.
- **Bahasa Malaysia / i18n (deferred by owner):** English only for now.
- **Sitemap and robots (not started):** `/sitemap.xml` returns 404, and `robots.txt` has no
  `Sitemap:` line.

## ⚠️ Known Gaps

- **Ad density:** three `app-ad-slot`s on `/about` share one unit id, and the template comment says
  the cap is 2.
- **Live snapshots vs. the open draft:** the editor reads `initial` once, so a remote snapshot does
  not refresh an in-progress admin draft. The admin can save a stale copy over a newer edit.
- **Editor inputs rely on placeholders:** most editor fields (project name, description, date,
  person name, order, title, avatar URL, social name and link, tech-stack and community-project
  fields) have a `placeholder` but no `<label>` or `aria-label`. Only the About textarea, the Status
  select, the period month inputs and the Show/Retired checkboxes have an accessible name.
- **`jumpTo` assumes `matchMedia`:** it calls `defaultView?.matchMedia(...)` without a guard for the
  method itself, so an environment with a window but no `matchMedia` throws.
- **Unused breakpoint:** the `md:` breakpoint is not used anywhere on this page.

## 💡 Potential AI Feature Opportunities

- **AI-assisted CMS editing:** the structured admin editor provides a natural integration point
  — an "AI draft" button per section (generate/rewrite `aboutProject` copy, personnel bios, or
  project descriptions from short prompts) could populate draft fields before the admin reviews
  and saves, using the editor's `patchDraft()` seam the manual form uses.
- **Auto-summarized "what's new"**: an AI summary of recent `projects`/`techStacks` changes
  (diffed against a prior snapshot) could be surfaced as a small "recently updated" callout,
  since the page already reacts live to document changes via `onSnapshot`.
- **Smart status/description QA:** given the loose, hand-edited nature of the data (optional
  `socials`, freeform `description` strings, manually chosen `ProjectStatus`), an LLM-based
  linter could flag inconsistent or stale entries (e.g. a project marked `stable` with a
  changelog implying otherwise) before an admin saves the document — or could run automatically
  inside `sanitizeDraft()` to surface warnings in the editor before save.
