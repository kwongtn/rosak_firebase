# Frontend Map — Overview & Index

This directory is the source-of-truth specification for the **current** behavior of the `rosak_firebase` Angular
app, written to brief AI coding agents (and humans) ahead of a full rewrite. The rewrite's stated direction is to
drop `ng-zorro-antd` in favor of Tailwind CSS; these docs describe what exists today so the rewrite has a ground
truth to work from, not what the rewrite should look like.

Each doc was produced by independently reading the actual source in both repos — `rosak_firebase` (this repo,
Angular 18) and `rosak_backend` (Django + Strawberry GraphQL) — and cross-referencing every GraphQL operation
against the real backend schema/resolver code. Claims are cited with `file:line`. Anything a doc's author could not
confirm from static code (exact rendered copy, CSS layout, live data shape) is called out explicitly in that doc's
**Open Questions / Verify Against Live Site** section rather than presented as fact — a follow-up QA pass
independently re-checked route coverage, spot-checked ~12 factual claims against source, and confirmed the doc set
has zero fabricated claims found. See "Known limitation" below for why live-site verification wasn't done directly.

## How to use this doc set

- **Before rewriting a feature area**, read its doc in full, then work through its Open Questions — most need a
  5-minute look at the live site (`https://community.mlptf.org.my/`) with an authenticated/admin session, not more
  research.
- **`shared-services-and-plumbing.md`** and **`shared-ui-components.md`** are the canonical references for
  cross-cutting code — other docs link to them by component/service name instead of re-explaining shared pieces.
  Read these two before starting the rewrite, regardless of which feature you tackle first.
- **`shell.md`** is the canonical sitemap — the authoritative route table (paths, guards, lazy-loaded targets,
  maintenance-mode switches) lives there, not duplicated per-feature.
- Treat each doc as a living spec: as the rewrite progresses and questions get resolved (or behavior intentionally
  changes), edit the doc in place rather than letting it drift from reality.

## Known limitation: live-site verification

The production site is a pure client-side-rendered Angular SPA (empty `<app-root>` shell, no SSR), and this
documentation pass had no connected browser-automation tool — so it was written entirely from source code, not from
driving the live UI. This is arguably a _feature_, not just a workaround: the GraphQL backend schema/resolvers are a
more reliable ground truth for data contracts than reverse-engineering a running UI would have been. But visual/UX
details (exact copy, responsive layout, animations, what a broken state actually looks like on-screen) could not be
confirmed this way — those are exactly what each doc's Open Questions section flags for manual follow-up.

## Tech stack

- **Frontend** (this repo): Angular 18, `ng-zorro-antd` (component library being replaced), Apollo Angular / GraphQL
  client (`src/app/graphql.module.ts`), `@angular/fire` (Firebase Auth, Firestore, Storage), Sentry, `@antv/l7` +
  `@antv/l7-maps` + Mapbox (maps), `@antv/g2`/`g2plot` (charts), `ng-recaptcha-2`.
- **Backend** (`rosak_backend`, sibling repo): Django + `strawberry` / `strawberry-django` GraphQL API at
  `/graphql/` (schema composed in `rosak/schema.py`), plus a few plain Django REST `APIView` endpoints outside
  GraphQL (photo uploads, some chart data). Apps: `operation`, `common`, `reporting`, `generic`, `spotting`,
  `incident`, `mlptf`, `chartography`, `telegram_provider`.
- **Auth**: Firebase Authentication. Roles are Firebase custom claims (`admin`, `betaTester`) checked via
  `hasCustomClaim()` route guards — full model documented in `shared-services-and-plumbing.md`.

## Sitemap (summary — see `shell.md` for full detail)

| Path                                                                                                                                      | Guard                                                           | Notes                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| `/` , `/transpot`                                                                                                                         | —                                                               | redirect to `/spotting`                                              |
| `/spotting`, `/spotting/:id`                                                                                                              | none (public)                                                   | flagship feature; `:id` is a **line ID**, not a per-report permalink |
| `/insiden`                                                                                                                                | none (public)                                                   | has a route-guard copy-paste bug — see `insiden.md` Known Quirks     |
| `/gallery`                                                                                                                                | none (public)                                                   |                                                                      |
| `/situasi` (+ nested `:lineId`, `:lineId/vehicles[/:tabName]`, `:lineId/station`, `:lineId/vehicle/:assetId`, `:lineId/station/:assetId`) | `hasCustomClaim("betaTester")`, no redirect-on-fail             | mostly placeholder/unimplemented sub-routes today                    |
| `/tracker`                                                                                                                                | none (public — a `betaTester` guard is commented out)           | zero GraphQL use; polls public `data.gov.my` GTFS feeds directly     |
| `/about`                                                                                                                                  | none (public)                                                   | Firestore-backed, not GraphQL                                        |
| `/compliance`                                                                                                                             | none (public, no nav link)                                      | GDPR content, not PDPA                                               |
| `/console`                                                                                                                                | `hasCustomClaim("admin")`                                       | admin spotting-events moderation queue                               |
| `/profile`                                                                                                                                | `redirectUnauthorizedTo(["spotting"])` (any authenticated user) |                                                                      |
| `**`                                                                                                                                      | none                                                            | 404 fallback                                                         |

Every route also has a build-time `maintenance.<key>.curentlyInMaintenance` boolean (in `app-routing.module.ts`) that
swaps in a placeholder "under construction" component when flipped — currently all `false`.

## Doc index

| Doc                                                                    | Covers                                                                                                                                                     |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`shell.md`](./shell.md)                                               | Global app shell: header/nav, root `AppComponent`, the full route table, 404 fallback, maintenance placeholder                                             |
| [`about.md`](./about.md)                                               | `/about` — org/team/tech-stack info page, Firestore-backed                                                                                                 |
| [`compliance.md`](./compliance.md)                                     | `/compliance` — GDPR content page, Firestore-backed                                                                                                        |
| [`gallery.md`](./gallery.md)                                           | `/gallery` — public day-grouped photo feed                                                                                                                 |
| [`profile.md`](./profile.md)                                           | `/profile` — authenticated user's stats, spotting history, trends chart                                                                                    |
| [`insiden.md`](./insiden.md)                                           | `/insiden` — incident calendar/reporting feature                                                                                                           |
| [`spotting.md`](./spotting.md)                                         | `/spotting`, `/spotting/:id` — flagship train/vehicle spotting feature                                                                                     |
| [`situasi.md`](./situasi.md)                                           | `/situasi/**` — beta-gated line/station/vehicle operations dashboard (mostly unimplemented)                                                                |
| [`tracker.md`](./tracker.md)                                           | `/tracker` — live map tracking public GTFS feeds                                                                                                           |
| [`console.md`](./console.md)                                           | `/console` — admin-only spotting-events moderation queue                                                                                                   |
| [`shared-ui-components.md`](./shared-ui-components.md)                 | The `@ui/**` shared presentational component library (tags, grids, heatmaps, etc.) — canonical reference for anything other docs link to by component name |
| [`shared-services-and-plumbing.md`](./shared-services-and-plumbing.md) | Cross-cutting services, models, pipes, Apollo/GraphQL setup, and the **full auth/role model** — canonical reference for permissions                        |

_(Note: these last two were originally briefed as `shell-and-navigation.md` and `shared-services-state-and-data.md`;
they were written under the names above instead — this index is the source of truth for the actual filenames.)_

## Cross-cutting findings worth knowing before you start

These recurring themes surfaced independently across multiple docs — worth internalizing before touching any one
feature, since they affect several:

1. **Two independent, never-synced "admin" signals.** A Firebase custom claim (`admin`, checked by the `/console`
   route guard) and a separate Firestore `users/{uid}.permissions.admin` field (checked by
   `services/auth-permissions.ts`, which nothing in either repo currently _sets_). See
   `shared-services-and-plumbing.md`.
2. **No `firestore.rules` file exists in either repo.** Several public pages (`/about`, `/compliance`) and all
   per-user data read/write directly against Firestore with no visible security-rule enforcement in-repo — actual
   enforcement (if any) lives only in the Firebase project console, unverifiable from source.
3. **An in-progress Imgur → Discord-CDN image migration.** `common.models.Media.file` (Imgur-backed) is marked
   `# TODO: Deprecate`, and the upload pipeline now relays through Discord — but several GraphQL queries (gallery,
   insiden, spotting) still read the legacy Imgur field. Whether recently-uploaded photos still resolve is flagged
   as an open question in multiple docs.
4. **No code anywhere provisions Firebase custom claims.** `admin`/`betaTester` claims are read everywhere but never
   granted by any script/Cloud Function in either repo — provisioning is a fully manual, out-of-repo operation today.
5. **Beta/maintenance gating is inconsistent.** `/situasi` is beta-gated with no redirect-on-fail; `/tracker` has an
   identical guard commented out (public today, unclear if intentional); `/insiden`'s maintenance-mode fallback
   checks the wrong flag (copy-paste bug, currently inert since both flags are `false`).

## QA pass verdict

An independent QA agent read all 12 docs end-to-end, cross-checked every route against `app-routing.module.ts` /
`situasi-routing.module.ts`, spot-checked ~12 specific factual claims against cited source files, and checked
structural consistency. Verdict: **ready to use as a rewrite spec**; the two gaps it found (missing filenames match,
one missing shared-component subsection) were fixed directly in this pass.
