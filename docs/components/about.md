# Component: about

## 📌 Purpose & Scope

- **Core Responsibility:** The public `/about` page: project intro, sub-projects grid, team roster,
  open-source tech stack, and external community projects. All content is one Firestore document
  (`public/about`), read live. Admins edit it in-page through `AboutEditorComponent` (form-only
  child); the page owns visibility and persistence (`setDoc` on save).
- **Domain/Layer:** Angular Presentation (standalone, lazy-loaded routed page). Client-rendered only:
  `app.routes.server.ts` maps `/about` to `RenderMode.Client` because content changes by hand, not
  per request, so SSR buys nothing.

## 🔌 Interface & Data Flow

- **Inputs / Signals:** `AboutPage` is route-level (`loadComponent` in `app.routes.ts`, path
  `about`, title `"MLPTF | About"`). No `@Input`s or route params; all data comes from Firestore.
- **Editor (`AboutEditorComponent`, `app-about-editor`, `features/about/editor/about-editor.component.ts`):**
  - Inputs: `initial` (`PublicAboutDocument | undefined`). The draft is built from it **once**, in
    `ngOnInit`; later remote snapshots never overwrite an open draft. `undefined` (no doc yet) starts
    empty. `saving` (default `false`) disables both buttons, relabels Save "Saving…", and makes
    `submit()` return early.
  - Outputs: `submitted` (emits `sanitizeDraft(draft)`, ready for Firestore) and `dismissed` (Cancel).
  - Owns the draft (`_draft`, exposed read-only as `draft`) and every add/remove/update helper. It
    does not touch Firestore, toasts or visibility.
- **Page wiring:** `[initial]="data()" [saving]="saving()" (submitted)="saveDoc($event)"
(dismissed)="cancelEdit()"`, inside `@if (isAdmin() && editMode())`.
- **Outputs / Events / API:**
  - The page has no `@Output`s; it is a leaf page.
  - An `onSnapshot` listener on `public/about` (opened in the constructor, browser only) re-renders
    the page on every remote change. Its error callback sets `isError`.
  - Page meta: the constructor sets `description`, `og:title`, `og:description` and `og:type` via
    `Meta.updateTag`. Only JS-running crawlers see them. Link-preview scrapers (WhatsApp, Telegram)
    read the static `index.html`, which has title `TranSPOT` and a description, but no og tags.
  - Template signals: `isLoading`, `isError` (+ `retry()`), `data` (read-only projection of `_data`,
    passed to the editor as `initial`), `aboutProject`, `projects` (display-filtered, query-matched,
    sorted oldest-first by `startDate`), `personnel` (display-filtered, query-matched, sorted by
    `order`, `socials` normalized), `activePersonnel` / `retiredPersonnel` (split on `retired`),
    `techStacks`, `communityProjects`, `isEmptyDoc`, `noResults`, `sectionLinks` (jump targets, only
    for sections with content), `statusVariant(status)`, `projectStart(project)`,
    `personPeriod(person)`, `isAdmin` (from `AuthService`).
- **Dependencies:**
  - `firebase/app`, `firebase/firestore`: direct SDK use (`initializeApp`/`getApps`, `getFirestore`,
    `doc`, `onSnapshot`, `setDoc`), guarded by `injectIsBrowser()` so nothing runs during SSR or
    prerender. Only the page calls `setDoc` (`saveDoc`).
  - `src/environments/environment.ts`: `environment.firebase`, used to initialize or reuse the app.
  - `src/app/core/auth/auth.service.ts`: `isAdmin` signal (Firebase `admin` custom claim) gates the
    Edit button and editor. `idToken()` is not needed: Firestore security rules, not GraphQL, enforce
    write access on `public/about`.
  - `features/about/editor/about-editor.component.ts`: loaded with `@defer (on immediate)`, so
    visitors who never edit never download it. Imports `HlmButton`, `HlmCardImports`, `HlmCheckbox`,
    `HlmInput`, `HlmNativeSelect`.
  - `@angular/platform-browser` `Meta` (page meta) and `DOCUMENT` (`jumpTo` scroll and focus).
  - `features/about/data/about.model.ts`: type-only contract for the doc (`PublicAboutDocument`,
    `Personnel`, `PersonnelSocial`, `TechStack`, `CommunityProject`, `Project`, `ProjectStatus`).
    `Personnel` has `retired` (collapsed group) and month-precision `startDate`/`endDate` strings
    (empty end = "Present").
  - `features/about/data/about-edit.util.ts`: pure helpers shared by both halves.
    - Editor: `draftFromDoc()` (normalizes missing fields; keeps a missing `display` as hidden),
      `sanitizeDraft()` (drops nameless rows, coerces undefined fields), and the
      `emptyProject`/`emptyPersonnel`/`emptyTechStack`/`emptySocial`/`emptyCommunityProject` factories.
    - Page: `filterAndSortProjects`, `filterPersonnel`, `filterTechStacks`, `filterCommunityProjects`.
    - Display: `formatPeriod`, `formatElapsed`, `formatPersonPeriod(person, now?)`,
      `formatProjectStart`. Labels are deterministic and locale-free ("MMM YYYY - MMM YYYY · N years
      M months"). `formatProjectStart` returns "Started MMM YYYY", or `""` for a `planned` project or
      one with no parseable start. The `now` argument keeps tenure testable.
  - `src/app/ui/avatar/avatar.ts`: `AvatarComponent` (`app-avatar`; inputs `name`, `src`,
    `size` = 48) and pure `initialsOf(name)`. Team cards use it.
  - `src/app/ui/external-link-icon/external-link-icon.ts`: `ExternalLinkIconComponent`
    (`app-external-link-icon`), a decorative `aria-hidden` arrow beside the sr-only
    "(opens in new tab)" cue on every `target="_blank"` link.
  - `src/app/shell/app-nav/app-nav.component.ts`, `src/app/shell/app-footer/app-footer.component.ts`:
    page chrome.
  - `src/app/ui/*`: the page uses `HlmBadge`, `HlmButton`, `HlmCardImports`, `HlmInput` (search),
    `HlmSkeleton`, plus `AvatarComponent`, `ExternalLinkIconComponent`, `AdSlotComponent`, and
    `ToastService` (save/error feedback).

## ⚙️ Internal State & Logic

- Signals only (no RxJS, no `BehaviorSubject`).
- **Page state:** `isLoading` (starts `true`), `isError`, `editMode`, `saving`, `searchTerm`, and
  private `_data` (exposed read-only as `data`). Template reads are `computed()`s over `_data`,
  built from the pure filters in `about-edit.util.ts`. The team grid splits `personnel` into
  `activePersonnel` and `retiredPersonnel`, so retired people render inside a collapsed
  `<details data-testid="personnel-retired">`.
- **Search:** `searchTerm` feeds the same `computed()`s, so the page filters as you type. "Clear"
  calls `clearSearch()`. Search does not match the `aboutProject` intro, which is always visible
  (intentional). The search box and jump nav are hidden in edit mode.
- **Empty states:** a missing doc, or one with nothing visible, shows "Nothing has been published on
  this page yet." (`data-testid="about-empty"`) and hides the search box. A search with no matches
  shows "No results for “term”." (`data-testid="about-no-results"`, `role="status"`).
- **Jump nav:** an "On this page" `<nav>` of buttons (only when more than one section has content;
  hidden in edit mode) calls `jumpTo(id)`. It scrolls (`auto` under `prefers-reduced-motion`) and
  moves focus to the section `h2`. Ids: `projects`, `team`, `tech-stack`, `community`. A plain `#id`
  href would resolve against `<base href="/">`, so the page uses buttons.
- **Visibility and loading:** Edit shows only for admins, once the doc loads without error, and not
  while editing. `beginEdit()` sets `editMode`; `cancelEdit()` clears it. The editor chunk loads on
  Edit: a `@loading` skeleton (sr-only "Loading the editor…") shows meanwhile; if the chunk fails, an
  `@error` box (`role="alert"`) offers a Close button that calls `cancelEdit()`.
- **Persistence (`saveDoc`):** guarded by `saving` against double-submit. It calls `setDoc()` on
  `public/about` with the sanitized doc. Success calls `cancelEdit()` and shows a "Saved" toast.
  Failure shows a "Save failed" toast and leaves the editor open with the draft intact. The snapshot
  listener then re-renders the page.
- **Editor state:** `_draft` (`signal<PublicAboutDocument | undefined>`) is set from `initial` in
  `ngOnInit` and updated immutably by `patchDraft` and the per-section `updateX` / `addX` / `removeX`
  helpers. Socials nest under a person and take `(personIndex, socialIndex)`. Input values come from
  `valueOf($event)` / `numberOf($event)`, not `$any($event.target)`. Save and Cancel share one sticky
  bottom bar. Entry lists use the same grid as the public section (`grid grid-cols-1 gap-3
sm:grid-cols-2 lg:grid-cols-3`), so each edit cell lines up with the card it produces.
- **Headings:** one `h1` (`text-2xl font-bold`). Section `h2`s are `text-lg font-semibold`: "Projects",
  "About the team", "Tech Stack & Open Source", "Other Community Projects". The donate callout heading
  is an `h2` at `text-base`. The intro paragraph is `text-base` with `max-w-prose`. In the editor,
  "Edit about page" is an `h2` and its sub-sections are `h3`s (`text-sm font-semibold`).
- **Cards:** team cards show `app-avatar` (image, or initials when there is no `avatar` or it fails
  to load). Project cards show "Started Jan 2024" from `projectStart()` when the project is live and
  has a valid start date. Every `target="_blank"` link (GitHub button, socials, tech stack and
  community cards) shows `app-external-link-icon` beside its sr-only cue.
- **Accessibility:** the search input has an `aria-label`; the error box is `role="alert"`; the
  skeleton is `aria-busy` with sr-only status text. Avatars (`alt=""`, initials `aria-hidden`) and the
  arrow are decorative; the person's name or link text is always rendered beside them. Images have
  explicit `width`/`height` and `loading="lazy"`. New-tab links carry the sr-only cue. Focus-visible
  rings on card links, text links and `<summary>`.
- **Lifecycle:** `onSnapshot` is opened in the constructor (browser only) and torn down in
  `ngOnDestroy`, the only lifecycle hook. No caching: state lives with the component instance, and a
  fresh subscription is created on every navigation to `/about`.

## 🧩 Extension Points & Hooks

- **Schema-driven rendering:** each section (`projects`, `personnel`, `techStacks`,
  `communityProjects`) is an `@if`/`@for` over an array in the doc. `projects` and `personnel` are
  also gated by their `display` boolean. New entries appear with no code change; hiding one is an
  admin edit.
- **Period fields:** `Personnel.startDate`/`endDate` are `"YYYY-MM"` strings (native
  `<input type="month">`; the label comes from `formatPersonPeriod`). Legacy entries with no dates
  show no period line. `Project.startDate` is `YYYY-MM-DD` in the editor placeholder, but the display
  uses only year and month.
- **Admin editor seams:**
  - The `emptyX()` factories define the default shape of new rows. Add a field there to give it to
    all new rows.
  - `draftFromDoc()` is the normalization seam for legacy rows. Give any new field a default there,
    or old rows read it as `undefined`.
  - `sanitizeDraft()` decides which fields survive save (drops nameless placeholders, coerces
    undefineds). Validate new required fields here.
  - Editor section helpers follow one pattern: `updateIn(key, …)` plus `addX`/`removeX`. A new
    content array (e.g. `blog`) extends `PublicAboutDocument`, adds `emptyBlog()`, a template block,
    and the same helpers.
  - `saveDoc()` is the only persistence path. The editor emits the whole doc, so new fields need no
    change there.
- **Section anchors:** a new content section needs a stable `id` on its `h2`, a `sectionLinks` entry
  (with its `show` condition), and a `jumpTo` target.
- **Search/filter:** `searchTerm` feeds `filterAndSortProjects`, `filterPersonnel`,
  `filterTechStacks`, and `filterCommunityProjects`. An extra matchable field (e.g. project
  `startDate`) is a one-line change in the relevant filter.
- **Status mapping:** `STATUS_VARIANT` (in `about.page.ts`) maps `alpha` / `beta` / `stable` /
  `planned` to warning / info / success / neutral; unknown values fall back to `neutral`.
- **Shared UI:** compose `Hlm*` directives from `src/app/ui` (`hlmCard`, `hlmBadge`, `hlmBtn`, …).
  `app-avatar` and `app-external-link-icon` are reusable on any page that shows people or new-tab
  links.
- **Document shape is the seam:** a new top-level field is additive. Extend the interface, add an
  `empty*()` factory, a computed signal and a template block. No existing consumer breaks.
- **Specs:** `about.page.spec.ts` mocks `firebase/app` and `firebase/firestore` with
  `vi.mock`/`vi.hoisted`, the reusable pattern for any Firestore-reading page. Editor behaviour (draft
  from `initial`, emitted doc, Cancel, saving lock, per-person socials) is in
  `editor/about-editor.component.spec.ts`. Pure helpers, including `formatProjectStart`, are in
  `data/about-edit.util.spec.ts`. `ui/avatar/avatar.spec.ts` covers `initialsOf` and the fallback;
  `ui/external-link-icon/external-link-icon.spec.ts` covers the arrow.

## ⚠️ Known Gaps

- **Ad density:** three `app-ad-slot`s on `/about` (`aboutBetweenSections`, `footerEnd`,
  `footerEndRight`) all resolve to the same unit id (`core/ads/ads.config.ts`). The density comment in
  `about.page.html` counts two ("footerEnd + this = 2"), so it is out of date with the markup.
- **Live snapshots vs. the open draft:** the editor reads `initial` once, so a remote snapshot never
  refreshes an in-progress draft. An admin can save a stale copy over a newer edit.
- **Editor inputs rely on placeholders:** most editor fields (project name, description, date, person
  name, order, title, avatar URL, social name and link, tech-stack and community-project fields) have
  a `placeholder` but no `<label>` or `aria-label`. Only the About textarea, the Status select, the
  period month inputs and the Show/Retired checkboxes have an accessible name.
- **`jumpTo` assumes `matchMedia`:** it calls `defaultView?.matchMedia(...)` with only optional
  chaining on the view, so a window without `matchMedia` throws.
- **Unused breakpoint:** the `md:` breakpoint is not used anywhere on this page.

## 💡 Potential Feature Opportunities

- **URL fragment deep-links (e.g. `/about#team`):** the jump nav and section ids (`projects`, `team`,
  `tech-stack`, `community`) exist. `AboutPage` takes no route params and never reads the fragment.
  Wiring it needs `ActivatedRoute` (or router fragment scrolling). The URL-state sync item in
  `docs/COMPONENTS.md` (Non-AI #1) covers the same need.
- **Admin undo / edit history:** `_draft` is ephemeral; cancelling discards unsaved work, and no undo
  stack or revision history is surfaced. Firestore keeps revision history in the Firebase console; an
  in-app view or a local undo stack would be additive on the editor's draft seam.
- **Real SEO (deferred by owner):** the page is client-rendered, so link previews and non-JS crawlers
  see only the static `index.html` tags. Prerendering `/about` or moving it to SSR would fix that. The
  owner chose meta tags only for now.
- **Bahasa Malaysia / i18n (deferred by owner):** English only for now.
- **Sitemap and robots (not started):** no `sitemap.xml` exists in `public/` or `src/`, and
  `public/robots.txt` has no `Sitemap:` line.

## 💡 Potential AI Feature Opportunities

- **AI-assisted CMS editing:** an "AI draft" button per section (generate or rewrite `aboutProject`
  copy, personnel bios, or project descriptions from short prompts) could fill draft fields through
  the same `patchDraft()` seam the manual form uses, before the admin reviews and saves.
- **Auto-summarized "what's new":** an AI summary of recent `projects` / `techStacks` changes, diffed
  against the prior snapshot, could appear as a "recently updated" callout. The page already reacts
  live to doc changes via `onSnapshot`.
- **Smart status/description QA:** the data is loose and hand-edited (optional `socials`, freeform
  `description`, manually chosen `ProjectStatus`). An LLM linter could flag inconsistent or stale
  entries, e.g. a `stable` project whose changelog implies otherwise, either before save or inside
  `sanitizeDraft()` as editor warnings.
