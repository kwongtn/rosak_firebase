# Component: not-found

## 📌 Purpose & Scope

- **Core Responsibility:** Catch-all fallback rendered for any unmatched route (the wildcard `**` entry in `app.routes.ts`). Tells the user the page doesn't exist, offers a way back into the app, and — via `app.routes.server.ts`'s matching wildcard — ensures the SSR response actually carries an HTTP 404 status rather than just looking like one.
- **Domain/Layer:** Angular Presentation (standalone, lazy-loaded routed page component). No business logic, no backend calls of its own beyond a cosmetic third-party fetch.

## 🔌 Interface & Data Flow

- **Inputs / Props / Signals:** None. `NotFoundPage` is a route-loaded component (`loadComponent` in `app.routes.ts`) with no `@Input`/`input()` bindings — it derives everything it needs from injected services rather than route params.
- **Outputs / Events / API Responses:**
  - No `@Output`/`output()` emitters — this is a terminal page, not a reusable widget.
  - Internally computes `attemptedPath` from `Router.url` and derives a `message` (`NotFoundMessage`) by hashing that path into an index over the static `NOT_FOUND_MESSAGES` pool (`not-found-messages.ts`) — deterministic per-URL rather than `Math.random()`, so SSR and client hydration render the same joke.
  - Browser-only side effect: on construction (guarded by `isPlatformBrowser`), fires a one-off `fetch()` to `thecatapi.com` or `dog.ceo` for a decorative image, populating `petPic` signal or `petPicFailed` on error/rejection. Not called during SSR.
  - Server-side: `app.routes.server.ts`'s own wildcard route sets `status: 404` for this path so the document response itself is a real 404 (SSR only; client-side navigation can't retroactively change an already-loaded document's status).
- **Dependencies:**
  - `@angular/router` — `Router` (current URL), `RouterLink` ("Back to TranSPOT" link to `/spotting`).
  - `@angular/common` — `Location` (browser history back), `isPlatformBrowser`/`PLATFORM_ID` (SSR guard).
  - `../../ui/button/button` (`HlmButton`) and `../../ui/skeleton/skeleton` (`HlmSkeleton`) — shared Spartan/hlm UI primitives, no app-specific coupling beyond styling.
  - `../../domain-ui/line-status-badge/line-status-badge` (`LineStatusBadge`) — required `status: LineStatus` input; the 404 page reuses this real domain badge (see `core/graphql/types.ts` for `LineStatus`) so each joke message renders a genuine line-status value rather than a lookalike.
  - `../../shell/app-nav/app-nav.component` and `../../shell/app-footer/app-footer.component` — standard app chrome, included directly in the template like any other page.
  - `./not-found-messages` (`NOT_FOUND_MESSAGES`, `NotFoundMessage`) — co-located static content module, 40 themed message/status entries.
  - Third-party, browser-only: `api.thecatapi.com` and `dog.ceo` public image APIs (keyless, no client SDK).

## ⚙️ Internal State & Logic

- Two `signal()`s: `petPic: PetPic | null` and `petPicFailed: boolean`, populated only in the browser via a constructor-time async fetch.
- Two `computed()`s: `attemptedPath` (thin wrapper over `router.url`, defined as a plain function reference rather than `computed()`) and `message` (indexes into `NOT_FOUND_MESSAGES` using a local `hashString` djb2-style hash of the attempted path — non-cryptographic, purely for stable pseudo-randomness across SSR/hydration).
- No RxJS streams, no shared state store, no persisted state — everything is local to the component instance and re-derived from the current URL.

## 🧩 Extension Points & Hooks

- `NOT_FOUND_MESSAGES` in `not-found-messages.ts` is the natural extension point for content: adding/editing entries requires no component changes, only conforming to the `NotFoundMessage` shape (`eyebrow`, `status: LineStatus`, `heading`, `body`).
- The pet-photo block is isolated behind an `@if`/`@else if` (image vs. skeleton vs. nothing on failure) and guarded by `isPlatformBrowser`, so it can be swapped for a different decorative widget, feature-flagged, or removed without touching the core 404 messaging logic.
- `goBack()` and the "Back to TranSPOT" `routerLink` are the only user actions; either could be extended (e.g., a search box, a sitemap link) without restructuring the component.

## 💡 Potential Feature Opportunities

- **Dedicated "page not found" analytics event:** `AnalyticsService` (`core/analytics/analytics.service.ts`) already fires a generic Firebase Analytics `page_view` `logEvent()` on every `NavigationEnd` — including this wildcard route — via an app-initializer-installed `Router.events` subscription. Ready now: add a small public method to that service (or inject `Analytics` directly, same `isPlatformBrowser`-guarded pattern already used for `petPic`) to fire a distinct `page_not_found` event carrying `attemptedPath()` as a param, so 404 hits stop being indistinguishable from real page views in GA4 — no new telemetry pipeline needed, just an additive call on infra that already exists.
- **Focus management on route change:** Nothing currently moves keyboard/screen-reader focus when the Router lands here client-side, so assistive-tech users get no cue the page changed. Ready now: the component already has an established browser-only-guard convention (`isPlatformBrowser` gating the `petPic` fetch in the constructor); adding an `ElementRef`/`afterNextRender` call to focus the `<h1>404</h1>` heading (or an `aria-live` region) reuses that exact pattern rather than introducing new infrastructure.
- **Path-aware message subsets:** `NOT_FOUND_MESSAGES` is already the documented extension point — any conforming `NotFoundMessage` entry can be added with zero component changes. Ready now: entries could be filtered/weighted by prefix of `attemptedPath()` (e.g. `/tracker/*` misses lean on vehicle-tracking-flavored copy, `/console/*` misses on admin-flavored copy) purely by extending the lookup in `not-found.page.ts`, no new dependencies.
- **"Did you mean" link to a known route:** A plain string-matching suggestion (no embeddings/similarity model, just substring or edit-distance against known top-level paths) against `attemptedPath()` would be a genuinely useful next step, but this isn't ready today — there is no exported flat registry of `{ path, label }` pairs; `app.routes.ts` only holds lazy `loadChildren`/`loadComponent` entries with per-route `title` strings, not a shape any component can iterate. **Context for future LLMs:** build a small shared route manifest (or derive one from `app.routes.ts` at build time) before attempting this; without it there's nothing for `attemptedPath()` to be compared against.
- **A third user action alongside "Back to TranSPOT" / "Go back":** the Extension Points section already flags `goBack()` and the `routerLink` as the only two actions today, with room noted for a third (search box, sitemap link) without restructuring. A "Copy link" button against the already-rendered `attemptedPath()` `<code>` block is ready now (pure Clipboard API, no new service). A "Report this broken link" action is not ready — there is no backend mutation or Firestore write path for user-submitted link reports today. **Context for future LLMs:** this would need a new GraphQL mutation (or a Firestore collection, following the CMS-doc pattern used elsewhere in this app) before it's more than a dead button.

## 💡 Potential AI Feature Opportunities

- **Smart route suggestion:** Replace/augment the static message hash with a lightweight similarity lookup (e.g., embed the attempted path against known route names) to suggest "Did you mean `/spotting/bus/123`?" — the `attemptedPath` signal already isolates the exact string needed as input.
- **Dynamic joke generation:** The `NotFoundMessage` pool is a fixed 40-entry array; an LLM call (server-side, cached per hashed path) could generate fresh on-brand "transit disruption" copy on demand instead of relying solely on a static list, while keeping the existing hash-for-stability approach for cache keys.
- **Broken-link telemetry:** Since `attemptedPath` and timestamp are already computed client-side, this is a structurally convenient place to pipe unmatched URLs into an analytics/AI-triage pipeline (e.g., clustering frequently-hit dead links to prioritize redirects or fix upstream links).
