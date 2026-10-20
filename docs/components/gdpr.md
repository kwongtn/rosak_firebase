# Component: gdpr

## 📌 Purpose & Scope

- **Core Responsibility:** Renders the public `/gdpr` compliance page: a read-only checklist of GDPR requirements, authored by an admin. Each item is flagged adhered / not adhered, with rich-text detail and an optional note, grouped into sections. The component owns no business logic. It is a thin presentation shell over one Firestore document.
- **Domain/Layer:** Angular Presentation. A standalone, route-level page, `GdprPage` (`selector: "app-gdpr"`), lazy-loaded via `loadComponent` in `app.routes.ts`. Client-rendered only (`RenderMode.Client` in `app.routes.server.ts`, because the content only changes by hand).

## 🔌 Interface & Data Flow

- **Inputs:** none. Routed page; all content comes from Firestore at runtime.
- **Outputs:** none (leaf page). Template-facing signals:
  - `isLoading: Signal<boolean>`: `true` until the first snapshot resolves or errors.
  - `isError: Signal<boolean>`: set by the snapshot error callback. Shows an error banner with a Retry button.
  - `definition`, `intro: Signal<string>` (default `""`); `details: Signal<GdprDetail[]>` (default `[]`).
- **Data source:** a real-time `onSnapshot` on Firestore doc `public/gdpr`, typed as `PublicGdprDocument` (`src/app/features/gdpr/data/gdpr.model.ts`; `GdprDetail` and `GdprDetailChild` describe the groups and items). This is admin-edited CMS content that the app never writes.
- **Dependencies:**
  - `firebase/app` and `firebase/firestore` used directly (`getApps` / `initializeApp`, `getFirestore`, `doc`, `onSnapshot`). It reuses an already-initialized app rather than going through a shared Angular Firestore service.
  - `environment.firebase` (`src/environments/environment.ts`) for `initializeApp`.
  - `injectIsBrowser()` (`core/composables/is-browser.ts`): guards Firestore access so it only runs in the browser.
  - `HlmBadge` (`ui/badge/badge.ts`): the "Adhered" / "Not adhered" pill (`variant="success" | "destructive"`). `HlmSkeleton` (`ui/skeleton/skeleton.ts`): loading blocks. `HlmButton`: Retry.
  - `AppNavComponent` and `AppFooterComponent` (`shell/`): shared chrome, not gdpr-specific.

## ⚙️ Internal State & Logic

- **Signals only.** No RxJS, no store.
  - `_data: WritableSignal<PublicGdprDocument | undefined>`: private, set only from the `onSnapshot` callback.
  - `isLoading` flips to `false` on the first snapshot, success or error. `isError` flips to `true` on error.
  - `definition`, `intro`, `details` are `computed()` projections over `_data()` with `""` / `[]` fallbacks, so the template never null-checks the raw document.
- **Subscription lifecycle:** `onSnapshot` starts in the constructor (browser only) and is torn down in `ngOnDestroy` through the stored `Unsubscribe` handle. This is a manual subscribe/unsubscribe, not an `async` pipe or `takeUntilDestroyed()`. `retry()` clears the error, unsubscribes, and resubscribes.
- **Expand/collapse is not component-managed.** Each item is a native `<details open>`, which owns its open/closed state in the DOM. This replaces the legacy ng-zorro `nz-collapse-panel` + `isCollapsed` bookkeeping (see the header comment in `gdpr.page.ts`).
- **Trusted HTML:** `definition`, `intro`, `child.details` and `child.notes` are bound with `[innerHTML]`. They render as trusted rich text from the CMS document, not escaped text.
- **Empty state:** when `details` is empty, the page shows "No GDPR information has been published yet."

## 🧩 Extension Points & Hooks

- **Route swap-in:** registered purely through `loadComponent` in `app.routes.ts`. The page can be moved, guarded, or given resolvers without touching the component.
- **Schema growth:** `GdprDetail` / `GdprDetailChild` are the sole contract with the CMS document. Adding optional fields (severity, last-reviewed date, reference link) is additive as long as consumers default sensibly.
- **Status states:** `HlmBadge` takes a `variant` input. New states (e.g. "partial", "in progress") can be added as a model field mapped to existing variants (`warning`, `info`), without changing the badge.
- **Loading / error / empty branches:** the `isLoading`, `isError` and empty-details branches in the template. Richer states (e.g. partial data) would extend these branches.
- **SSR:** the route is client-only by choice. A server-fetched initial payload would mean moving off `RenderMode.Client` and reading `public/gdpr` on the server. The `injectIsBrowser()` guard marks where that would start.

## 💡 Potential Feature Opportunities

- **Filter by adherence ("show only not-adhered").** Ready now. Every `GdprDetailChild` carries the `adhered` boolean the badge renders from, and the template tracks children by `child.title`. A `computed()` filter over `details()`, driven by a small filter signal, needs no schema change.
- **Deep-link to one item.** Ready now. `group.title` / `child.title` are already the `@for` track keys, so they work as stable identifiers. Slugify them into element `id`s and read a URL fragment inside the browser guard. A shared link could then scroll to and expand one item. (The template has no `id` attributes yet.)
- **Bulk expand/collapse all.** Not ready. Native `<details open>` has no component-side state to toggle. Replace it with a signal-backed open set (e.g. `WritableSignal<Set<string>>` keyed by title) before "Expand all" / "Collapse all" is possible.
- **"Last reviewed" date per item.** Not ready. `GdprDetail` / `GdprDetailChild` have no timestamp field. It has to be added to the `public/gdpr` document and to whatever admin tool authors it before any model or template change.

## 💡 Potential AI Feature Opportunities

- **Compliance drafting/review assistant.** Each item has an adherence flag plus free-form rich-text `details` / `notes`. An AI assistant could draft that copy for admins editing the Firestore doc, or flag inconsistencies (e.g. "not adhered" items with no explanatory notes). See COMPONENTS.md, AI cross-cutting item 3, for the shared CMS-editor idea.
- **Plain-language / multilingual summaries.** `definition`, `intro` and `details` are static rich text. An AI layer could generate on-demand plain-language or translated summaries per section, without changing the CMS schema.
- **Change-aware notifications.** The page already streams live Firestore updates via `onSnapshot`. An AI-generated "what changed since your last visit" summary, triggered when an admin updates `public/gdpr`, is structurally simple.
