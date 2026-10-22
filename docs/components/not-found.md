# Component: not-found

## 📌 Purpose & Scope

- **Core Responsibility:** Catch-all for unmatched routes (the `**` entry in `app.routes.ts`). It tells the user the page doesn't exist and offers a way back. On SSR it also sets a real HTTP 404 status (see Interface & Data Flow for how).
- **Domain/Layer:** Angular Presentation (standalone, lazy-loaded routed page). No business logic and no backend calls beyond a decorative third-party fetch.

## 🔌 Interface & Data Flow

- **Inputs / Signals:** none. `NotFoundPage` derives everything from injected services (`Router`, `Location`), not route params.
- **Outputs:** none. Terminal page.
- **Embedded use:** the station page (`/station/:id`, see [station](station.md)) renders `<app-not-found>` inside itself for an unknown station id, so the 404 status and the joke apply there too. Anything this page starts to read from its own route config would not be there in that case.
- **Message selection:** `attemptedPath` is `Router.url`. `message` (`NotFoundMessage`) hashes that path into an index over `NOT_FOUND_MESSAGES` (`not-found-messages.ts`, 40 entries). The pick is deterministic per URL, not `Math.random()`, so SSR and hydration render the same joke.
- **Pet caption:** the same hash picks the line above the photo. `petCaption(kind)` delegates to `scrollLineFor(attemptedPath, kind)`, which indexes `NOT_FOUND_SCROLL_LINES` (8 lines) and substitutes the `{kind}` token. It is a function, not a `computed()`, because the animal is known only after the browser fetch resolves.
- **Pet fetch (browser only):** in the constructor, guarded by `injectIsBrowser()`. It picks cat or dog at random (50/50) and calls `api.thecatapi.com/v1/images/search` or `dog.ceo/api/breeds/image/random`. Both are keyless. It sets `petPic` on success and `petPicFailed` on error. Not called during SSR.
- **HTTP status:** set in the constructor through `RESPONSE_INIT` (from `@angular/core`), on SSR only: `responseInit.status = 404`. The server route is deliberately not used. `app.routes.server.ts`'s `**` entry has no status. Angular SSR's route extraction gives every matcher-based client route (`/gallery`, `/insiden`) the path `**`, so a `status: 404` there would stamp 404 onto those valid pages (the staging `/insiden` bug). Client-side navigation cannot change the status of an already-loaded document, so only SSR can set it.
- **Dependencies:**
  - `@angular/router`: `Router` (current URL) and `RouterLink` ("Back to TranSPOT" → `/spotting`).
  - `@angular/common`: `Location` (`goBack()`).
  - `core/composables/is-browser.ts` (`injectIsBrowser`).
  - `ui/button/button` (`HlmButton`) and `ui/skeleton/skeleton` (`HlmSkeleton`).
  - `domain-ui/line-status-badge/line-status-badge` (`LineStatusBadge`, required `status: LineStatus` from `core/graphql/types.ts`). Each joke renders a real line-status value, so the badge is not a lookalike.
  - `shell/app-nav` and `shell/app-footer`: standard chrome.
  - `./not-found-messages`: `NOT_FOUND_MESSAGES`, `NOT_FOUND_SCROLL_LINES`, `NotFoundMessage`, `hashString` (lives here because both pickers share it), `scrollLineFor`.
  - Third-party, browser-only: `api.thecatapi.com` and `dog.ceo` (keyless, no SDK).

## 🖼️ Layout: two screens, pinned footer

This is the one page whose layout does **not** match the `min-h-screen` shell used everywhere else. The deviation is deliberate:

- **Two viewport-tall sections.** The 404 block fills the first `min-h-dvh` section. The pet is centred in a second one, so it appears only after scrolling a screen's worth. `dvh`, not `vh`, on purpose: on a phone `vh` includes the space behind the browser chrome, which would push the photo off-centre by the height of the URL bar the reader can't see.
- **Footer pinned to the viewport.** Elsewhere the footer sits in normal flow at the end of a `min-h-screen` shell, which pins it to the bottom of a _short_ viewport. Here the page is two screens tall, so a flow footer would sit two screens down and effectively never be seen. It is wrapped in a `fixed inset-x-0 bottom-0 z-40 bg-background` div (`data-testid="not-found-footer"`), scoped to this page only. The shared `AppFooterComponent` stays layout-agnostic. `z-40` sits below the nav's sticky bar (`z-[45]`) and below the app's `z-50` overlay layer, matching the z-index ladder documented in `app-nav.component.ts`.
- **Matching reservation.** The pet section (`data-testid="not-found-pet"`) carries `pb-28`, so the centred photo can never end up behind the pinned footer.
- **Short-viewport escape hatch** (the component's own `styles` array). Below `max-height: 640px` the 404 block's content (~404px) is taller than the screen. The first section overflows its `min-h-dvh` and pushes the photo section past one screen, far enough that the pinned bar lands on the photo. Measured: 242px of a 288px photo hidden behind the footer at 844×390; 122px at 1280×450; only 21px of clearance at 1280×550. A pinned bar and a fully visible photo are mutually exclusive at that height, and no fixed image cap fixes it, because the overflow depends on how the copy wraps. So under the threshold the footer returns to normal flow (where it can't overlap anything) and the pet reservation drops to `1.5rem`. Verified 0px overlap at scroll 0, one screen down, and at the document end. The threshold sits between 639px (unpinned) and 641px (pinned).
  - ⚠️ This lives in `styles`, not a Tailwind arbitrary variant. `[@media(max-height:640px)]:…` in a template attribute is parsed by **Angular** as an `@` control-flow block and fails to compile. Writing `&#64;` satisfies Angular's parser but makes Tailwind's scanner miss the variant. The attribute selectors in `styles` also beat the `fixed` / `pb-28` utilities on specificity. See `MISTAKES.md`.

## ⚙️ Internal State & Logic

- Two `signal()`s: `petPic: PetPic | null` and `petPicFailed: boolean`. Both are set only in the browser, by the constructor's fetch.
- `message` is a `computed()` that indexes `NOT_FOUND_MESSAGES` with `hashString` (non-cryptographic, used only for stable pseudo-randomness across SSR and hydration). `attemptedPath` is a plain function over `router.url`.
- `petCaption(kind)` is a pure, template-callable function.
- No RxJS, no shared store, no persisted state. Everything is re-derived from the current URL.

## 🧩 Extension Points & Hooks

- **`NOT_FOUND_MESSAGES`** (`not-found-messages.ts`) is the content extension point. Entries are added or edited with no component change, as long as each conforms to `NotFoundMessage` (`eyebrow`, `status: LineStatus`, `heading`, `body`).
- **`NOT_FOUND_SCROLL_LINES`** is the same idea for the line above the photo: a flat `string[]` whose `{kind}` token `scrollLineFor` substitutes. Keep at least one `{kind}` in each line. The spec's "every line in the pool is reachable" assertion (`not-found-messages.spec.ts`) catches copy that no hash bucket can land on.
- **Pet block:** an `@if` / `@else if` (image, skeleton, or nothing on failure) behind the browser guard. It can be swapped for another decorative widget, feature-flagged, or removed without touching the 404 messaging.
- **Actions:** `goBack()` and the "Back to TranSPOT" `routerLink` are the only user actions. Either can be extended (search box, sitemap link) without restructuring.

## 💡 Potential Feature Opportunities

- **Dedicated "page not found" analytics event.** `AnalyticsService` (`core/analytics/analytics.service.ts`) already logs a generic Firebase Analytics `page_view` (`page_path`, `page_location`, `page_title`) after every `NavigationEnd`, including this wildcard route. `page_path` is the route pattern (`/profile/:id`, and `/**` here), never the visited URL, so 404 hits show in GA4 as `/**` with the page-not-found title but the path that missed is not recorded. Ready now: add a method that fires a distinct `page_not_found` event carrying `attemptedPath()`, following the same browser-guarded `logEvent` path. No new pipeline. The same event stream could also feed dead-link clustering for redirect fixes.
- **Focus management on route change.** Nothing moves keyboard or screen-reader focus when the Router lands here client-side, so assistive-tech users get no cue. Ready now: an `afterNextRender` call that focuses the `<h1>404</h1>` (or an `aria-live` region), following the existing browser-guard convention.
- **Path-aware message subsets.** Weight or filter `NOT_FOUND_MESSAGES` by `attemptedPath()` prefix (`/tracker/*` misses get vehicle-flavoured copy, `/console/*` misses get admin-flavoured copy). Only the lookup in `not-found.page.ts` changes.
- **"Did you mean" link to a known route.** Substring or edit-distance matching of `attemptedPath()` against known top-level paths. Not ready: there is no exported flat registry of `{ path, label }` pairs. `app.routes.ts` holds only lazy `loadChildren` / `loadComponent` entries with per-route `title` strings, which no component can iterate. Build a small shared route manifest (or derive one from `app.routes.ts` at build time) first.
- **Third user action.** "Copy link" against the rendered `attemptedPath()` `<code>` block is ready now (Clipboard API, no new service). "Report this broken link" is not ready: there is no GraphQL mutation or Firestore write path for user link reports. It would need one, or a CMS-style collection, before it is more than a dead button.

## 💡 Potential AI Feature Opportunities

- **Smart route suggestion.** Augment the static hash with a similarity lookup of `attemptedPath` against known route names ("Did you mean `/spotting/bus/123`?"). The `attemptedPath` signal already isolates the exact input string.
- **Dynamic joke generation.** The fixed 40-entry pool could be generated on demand by an LLM, server-side and cached per hashed path. The hash stays as the cache key.
