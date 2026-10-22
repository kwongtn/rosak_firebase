# AGENTS.md

Guidance for agents working in `rosak_firebase` (the frontend; `../AGENTS.md` covers cross-repo
rules). Read before editing.

OKF knowledge bundle: `../okf_bundle/` (monorepo root; covers both repos).
`okf lookup --bundle ../okf_bundle <Name>` for concept context, add `--type <Type>` to filter;
`../okf_bundle/SUMMARY.md` is the knowledge map.

## Quick Commands

npm 11, Node 24 (`.nvmrc`).

```bash
npm start                       # dev server :4200 (prestart regenerates build-info + configs)
npm run build                   # prod SSR build; postbuild uploads Sentry sourcemaps
npm run serve:ssr:web           # run the built SSR server from dist/
npm test -- --no-watch          # Vitest single run (= npm run test:ci). REQUIRED in automation:
                                # watch defaults to true in a TTY and hangs
npm test -- --no-watch --filter "^App"   # single suite by name regex
npx prettier --check .          # the only lint gate (CI + pre-commit); --write . autofixes
npm run verify                  # full gate: prettier + unit tests + prod build (prefer this)
npm run e2e                     # Playwright: dev build + mock GraphQL server (see e2e/);
                                # run `npx playwright install chromium` once first
```

There is **no ESLint and no `lint` script**. Type checking happens only via `npm run build`.

Backend (`../rosak_backend`, Django 5.2 + Strawberry GraphQL + Celery): commands live in
`../AGENTS.md` and `../rosak_backend/AGENTS.md`.

## Architecture & Component Pointer

A zoneless, signals-first Angular 22 SSR app (standalone components, Tailwind v4, Spartan Brain
primitives with a local Helm layer in `src/app/ui/`), served by Express on Firebase App Hosting.
Three independent backends: the sibling Django/Strawberry GraphQL API via
`graphqlResource()`/`GraphQLClient`, Firebase directly (Auth, Firestore CMS docs, Storage), and
third-party GTFS-realtime feeds for the tracker.

**Do not guess component interfaces, dependencies, or extension points — look them up:**

- **[`docs/COMPONENTS.md`](docs/COMPONENTS.md) is canonical** — system topology, the catalog of all
  12 features, and where the seams are.
- **[`docs/components/`](docs/components/)`<feature>.md`** — per-feature interfaces, internal state,
  named extension points. Read the relevant one before touching a feature.
- **[`archive/frontend-map/`](archive/frontend-map/) is LEGACY** — the pre-rewrite Angular 18 app
  (ng-zorro, Apollo, `src/app/services/**`); those paths no longer exist. Background on
  backend/GraphQL contract history only; never cite it for current structure, even though a few code
  comments still link to it.

## Non-Negotiable Code Conventions

**Frontend**

- **Zoneless** — no `zone.js`. Never add `provideZoneChangeDetection`; don't reach for
  `ChangeDetectionStrategy.OnPush` (unused repo-wide, meaningless here).
- **Standalone is implicit** — no file sets `standalone: true`; don't start. Declare deps in
  `@Component({ imports: [...] })`.
- **Signals over RxJS.** `signal`/`computed`/`resource` only; no `BehaviorSubject`/`Subject` in app
  code. Private state is `private readonly _x = signal(...)` exposed through `computed()`
  projections; anything a template reads is `protected readonly`.
- **Data access**: reads go through `graphqlResource()` (SSR TransferState + backoff retry for
  free); mutations call `inject(GraphQLClient).request(query, variables, headers)` from an event
  handler — never `httpResource`, whose re-fetch-on-signal-change lifecycle is wrong for one-shot
  writes.
- **`inject()`, not constructor parameters.**
- **Built-in control flow** `@if`/`@for`/`@switch`; never import `CommonModule`, `NgIf`, or `NgFor`.
- **UI layer**: compose from `src/app/ui/*` (HlmBadge, HlmButton, HlmSkeleton…) and Spartan Brain
  for behavior; merge classes with `hlm()` from `src/app/ui/utils/hlm.ts`. Tailwind v4 utilities
  only — no other styling system.
- **SSR safety**: guard every browser-only API with `injectIsBrowser()` from
  `src/app/core/composables/is-browser.ts`; tear down Firestore `onSnapshot` subscriptions in
  `ngOnDestroy`.
- **Lazy-load** new features via `loadChildren`/`loadComponent` in `src/app/app.routes.ts`. Error
  budgets: 1 MB initial bundle, 8 kB per component stylesheet. Angular 22.2 counts eager shared
  chunks as initial. The initial total is 842.04 kB in the `ng build` table at `0a57ec4`
  (2026-10-22), after the front page moved into its lazy route (`14e4f5c`). Before that move it was
  997.74 kB in the same table at `f162b7e`, close to the error budget. `docs/COMPONENTS.md` ->
  Initial bundle lists what is still eager and the next candidates. The 500 kB warning always
  fires, so keep new eager imports out of `main`.
- **Sentry Replay and the feedback widget are lazy chunks** (`core/sentry/`). Name
  `Sentry.replayIntegration`, `feedbackIntegration`, `getReplay` or `getFeedback` only in
  `core/sentry/{replay,feedback}-integration.ts`; `scripts/check-sentry-lazy.mjs` runs at the end of
  `npm run generate` (so on start, build, test and e2e, and in CI) and fails otherwise.
- **Never hand-edit** `src/build-info.ts`, `src/environments/*.generated.ts`,
  `public/favicon.{svg,ico}` — `scripts/*.mjs` regenerate them on every `prestart`/`prebuild`.
  Config changes belong in `apphosting.yaml` / `apphosting.staging.yaml`.

**Typing & error handling**

- **`strict` is ON by default.** `tsconfig.json` sets no `strict` key, and TypeScript 6 defaults it
  to true, so `strictNullChecks`, `noImplicitAny` and the rest of the family are enforced (checked:
  `const a: string = null` fails `tsc`). Also enforced: `noImplicitOverride`, `noImplicitReturns`,
  `noPropertyAccessFromIndexSignature`, `noFallthroughCasesInSwitch`. `strictTemplates` is not set
  (Angular's default: off). GraphQL response types are hand-written mirrors of untyped query
  strings, so still guard server data explicitly with `?.` / `??` / early returns.
- **`any` is banned.** Use `unknown` plus narrowing, or a real type.
- **Never swallow errors.** No empty `catch`, no catch-and-`console.log`. The global `ErrorHandler`
  is Sentry-backed — let unexpected errors reach it. Throw typed errors (e.g.
  `GraphQLRequestError`); surface expected failures via `ToastService` or the retry-banner pattern.

**Backend & database**

- The Strawberry schema is a **contract**. If the frontend needs a field that doesn't exist, the
  backend change lands first — never stub or fake a response shape.
- **Migrations ship with their model change**, in the same commit. Never hand-edit an applied
  migration; never `--fake` without saying so explicitly.
- No tach config is checked in; `../rosak_backend/docs/APPS.md` documents the cross-app import graph
  — check it before adding a cross-app import.
- Long-running or scheduled work goes to a **Celery task** (`rosak.celery_app`), never inline in a
  request or GraphQL resolver.
- Ruff is the formatter and linter (via pre-commit). Database is Postgres/PostGIS.

## Workflow & Execution Rules

1. **Explore → Plan → Code → Verify.** Before any change touching more than one file: read
   `docs/components/<feature>.md` and the actual source, then **state an explicit plan** (files,
   order, which documented seam you're extending) and get agreement before editing. The catalog
   already names the extension points — use them instead of inventing new ones.
2. **Verify before declaring done.** Run `npm run verify` (Prettier + `npm test -- --no-watch` +
   `npm run build`). Report real output. If something fails, say so — never claim completion on an
   unverified change.
3. **Tests**: always run them. **Add a spec for every feature and bug fix where it is reasonably
   possible** — at minimum, any new pure utility, service, store, or build-script logic must have a
   test. Component specs with `data-testid` assertions are established too (e.g.
   `features/home/home.page.spec.ts`, `features/home/feed/link-submit-box.component.spec.ts`);
   follow the existing TestBed patterns rather than treating component tests as out of scope.
4. **Context hygiene**: `/clear` between unrelated features. Feature areas are deeply documented but
   largely independent — stale context from another feature causes wrong assumptions.
5. **Git**: commit at logical checkpoints — one concern per commit — so history reads
   chronologically and the working tree is never left full of uncommitted changes; push only when
   asked. Pre-commit runs `lint-staged` → Prettier. Any AI-assisted commit must append a
   `Co-authored-by:` trailer naming the agent **and** the model, e.g.
   `Co-authored-by: opencode (opencode-go/deepseek-v4-flash) <noreply@opencode.ai>` or
   `Co-authored-by: Claude Code (claude-sonnet-4-5) <noreply@anthropic.com>`. Never attribute AI
   work to a human co-author.
6. **Resolved trap**: `adminOnlyGuard` was once a `return true` stub but is **fixed** — it awaits
   `auth.whenReady`, then returns `auth.isAdmin() ? true : router.createUrlTree(["/spotting"])`
   (`src/app/core/auth/admin-only.guard.ts`, commit 29b5d6d). `/console` is genuinely admin-gated.
   Do not "re-fix" it.

**Code definitions**: never open, grep, or search files inside `.venv` or `node_modules`. For
library or framework docs, use the LSP tools or ask/run Python introspection directly.

---

## Documentation Maintenance Rules

### MISTAKES.md

[`MISTAKES.md`](MISTAKES.md) (repo root) catalogs known defects, traps, and past mistakes so future
agents don't repeat them. Update it when you discover a new defect/trap or fix a documented one.
Format:

```markdown
## [YYYY-MM-DD] Component: Brief Title

**Problem**: What went wrong
**Root Cause**: Why it happened
**Fix**: What was done (commit ref if applicable)
**Prevention**: How to avoid in future
```

### Progress Documentation (docs/progress/)

- **Structure**: `docs/progress/<yyyy>/<mm>/<dd>.md` + `SUMMARY.md` at month/year levels.
- **Update trigger**: implementing features, fixing bugs, or resolving TODOs.
- **Content**: grouped by module/feature, with commit references.
- **Main docs stay clean**: component docs show only _current_ opportunities, not history.

### Methodology & Metric Constants

- `/methodology` and every `app-info-popover` read ONE code-first registry:
  `src/app/core/methodology/methodology.constants.ts` (documented numbers) +
  `methodology.content.ts` (sections + metric definitions). Copy is rendered via
  `renderMethodologyCopy()` — never a literal in a consuming template.
- Any user-visible metric/status/threshold/rule must add a `MetricDoc` (+ a `METHODOLOGY_CONSTANTS`
  token if it has a number) and be surfaced by an `InfoPopover` whose `content` is
  `metricTooltip(id)` — the metric's optional `summary`, else its full `definition`, rendered with
  the constants. Author a `summary` when the definition is too long to read in a tooltip.
- When a feature changes a documented value or rule: update the registry, bump the owning section's
  `lastReviewed`, re-run `npm test -- --no-watch` (the PR template carries the checklist line).
- Backend-owned values (reliability constants, provenance licenses, staleness windows) are fetched
  via GraphQL and rendered — never mirrored into a frontend literal.
- Sections whose owning spec has not shipped its CODE render the "in progress" state naming the
  owning spec; never invent a formula or threshold.

### Workflow Integration

After any verified task completion:

1. Check whether it resolves a MISTAKES entry or completes a TODO. If not, stop.
2. Append to today's `docs/progress/<yyyy>/<mm>/<dd>.md`.
3. Update the monthly/yearly `SUMMARY.md`.
4. Remove it from the component doc's "Suggested Features" / "TODO" / "Potential Feature
   Opportunities" sections.
5. If it was a documented trap, update MISTAKES.md with the fix reference.
