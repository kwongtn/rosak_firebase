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

## 💡 Potential AI Feature Opportunities

- **Smart route suggestion:** Replace/augment the static message hash with a lightweight similarity lookup (e.g., embed the attempted path against known route names) to suggest "Did you mean `/spotting/bus/123`?" — the `attemptedPath` signal already isolates the exact string needed as input.
- **Dynamic joke generation:** The `NotFoundMessage` pool is a fixed 40-entry array; an LLM call (server-side, cached per hashed path) could generate fresh on-brand "transit disruption" copy on demand instead of relying solely on a static list, while keeping the existing hash-for-stability approach for cache keys.
- **Broken-link telemetry:** Since `attemptedPath` and timestamp are already computed client-side, this is a structurally convenient place to pipe unmatched URLs into an analytics/AI-triage pipeline (e.g., clustering frequently-hit dead links to prioritize redirects or fix upstream links).
