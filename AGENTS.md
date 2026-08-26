# AGENTS.md

Guidance for agents working in `rosak_firebase`. Read this before editing.

## ⚡ Quick Commands

**Frontend** (this repo, `/home/kwongtn/rosak_firebase`) — npm 11, Node 24:

```bash
npm start                       # dev server :4200 (prestart regenerates build-info + configs)
npm run build                   # prod SSR build; postbuild uploads Sentry sourcemaps
npm run serve:ssr:web           # run the built SSR server from dist/
npm test -- --no-watch          # Vitest single run — REQUIRED in automation (watch defaults
                                # to true in a TTY and will hang)
npm test -- --no-watch --filter "^App"   # single suite by name regex
npx prettier --check .          # the only lint gate (also enforced in CI + pre-commit)
npx prettier --write .          # autofix formatting
```

There is **no ESLint and no `lint` script**. Type checking happens only via `npm run build`.

**Backend** (`rosak_backend`, sibling repo at `/home/kwongtn/rosak_backend` — Django 4.2 +
Strawberry GraphQL + Celery, rye-managed). `rye`/`uv` are not on PATH; use the committed `.venv`
or Docker:

```bash
cd /home/kwongtn/rosak_backend
docker compose up                          # full stack: postgis, redis, granian app, nginx :8000,
                                           # celery worker + beat
.venv/bin/python manage.py makemigrations <app>   # then commit the migration WITH the model change
.venv/bin/python manage.py migrate
.venv/bin/python manage.py test            # Django runner — note every */tests.py is empty today
ruff check --fix . && ruff format .        # or: pre-commit run --all-files
celery -A rosak.celery_app worker -l INFO -c 2
```

## 🏛️ Architecture & Component Pointer

A zoneless, signals-first Angular 22 SSR app (standalone components, Tailwind v4, Spartan Brain
primitives with a local Helm layer in `src/app/ui/`), served by Express on Firebase App Hosting.
It talks to three independent backends: the sibling Django/Strawberry GraphQL API via
`graphqlResource()`/`GraphQLClient`, Firebase directly (Auth, Firestore CMS docs, Storage), and
third-party GTFS-realtime feeds for the tracker — no Supabase anywhere.

**Do not guess component interfaces, dependencies, or extension points — look them up:**

- **[`docs/COMPONENTS.md`](docs/COMPONENTS.md) is canonical** — system topology, the catalog of all
  9 features, and where the seams are.
- **[`docs/components/`](docs/components/)`<feature>.md`** — per-feature interfaces, internal state,
  and named extension points. Read the relevant one before touching a feature.
- ⚠️ **[`docs/frontend-map/`](docs/frontend-map/) is LEGACY** — it describes the pre-rewrite
  Angular 18 app (ng-zorro, Apollo, `src/app/services/**`). Those paths no longer exist. Useful only
  as background on backend/GraphQL contract history; never cite it for current structure, even
  though a few code comments still link to it.

## 📏 Non-Negotiable Code Conventions

**Frontend**

- **Zoneless** — there is no `zone.js`. Never add `provideZoneChangeDetection`, and don't reach for
  `ChangeDetectionStrategy.OnPush` (unused repo-wide; it's meaningless here).
- **Standalone is implicit** — no file sets `standalone: true`; don't start. Declare deps in the
  `@Component({ imports: [...] })` array.
- **Signals over RxJS.** `signal`/`computed`/`resource` only. There are zero `BehaviorSubject`s or
  `Subject`s in app code — keep it that way. Private state is `private readonly _x = signal(...)`
  exposed through `computed()` projections; anything the template reads is `protected readonly`.
- **Data access**: reads go through `graphqlResource()` (gives SSR TransferState + backoff retry for
  free); mutations call `postGraphQL()` from an event handler — never `httpResource`, whose
  re-fetch-on-signal-change lifecycle is wrong for one-shot writes.
- **`inject()`, not constructor parameters** (116 call sites vs 2 legacy holdouts).
- **Built-in control flow** `@if`/`@for`/`@switch`. `CommonModule`, `NgIf`, and `NgFor` appear
  nowhere — never import them.
- **UI layer**: compose from `src/app/ui/*` (HlmBadge, HlmButton, HlmSkeleton…) and Spartan Brain for
  behavior; merge classes with `hlm()` from `src/app/ui/utils/hlm.ts`. Tailwind v4 utilities only —
  do not introduce another styling system.
- **SSR safety**: guard every browser-only API with `isPlatformBrowser(inject(PLATFORM_ID))`, and
  tear down Firestore `onSnapshot` subscriptions in `ngOnDestroy`.
- **Lazy-load** new features via `loadChildren`/`loadComponent` in `src/app/app.routes.ts`. Budgets
  are enforced: 1 MB initial bundle, 8 kB per component stylesheet.
- **Never hand-edit** `src/build-info.ts` or `src/environments/*.generated.ts` — `scripts/*.mjs`
  regenerate them on every `prestart`/`prebuild`. Config changes belong in `apphosting.yaml` /
  `apphosting.staging.yaml`.

**Typing & error handling**

- ⚠️ **`strict`, `strictNullChecks`, and `strictTemplates` are all OFF** in `tsconfig.json`. The
  compiler will not catch null/undefined for you — guard explicitly with `?.` / `??` / early
  returns. Enabled and enforced: `noImplicitOverride`, `noImplicitReturns`,
  `noPropertyAccessFromIndexSignature`, `noFallthroughCasesInSwitch`.
- **`any` is banned** (2 occurrences repo-wide). Use `unknown` plus narrowing, or a real type.
- **Never swallow errors.** No empty `catch`, no catch-and-`console.log`. The global `ErrorHandler`
  is Sentry-backed — let unexpected errors reach it. Throw typed errors (e.g.
  `GraphQLRequestError`); surface expected failures to users via `ToastService` or the retry-banner
  pattern.

**Backend & database**

- The Strawberry schema is a **contract**. If the frontend needs a field that doesn't exist, the
  backend change lands first — never stub or fake a response shape.
- **Migrations ship with their model change**, in the same commit. Never hand-edit an applied
  migration; never `--fake` without saying so explicitly.
- `tach.yml` enforces dependency boundaries between Django apps — check it before adding a
  cross-app import.
- Long-running or scheduled work goes to a **Celery task** (`rosak.celery_app`), never inline in a
  request or GraphQL resolver.
- Ruff is the formatter and linter (via pre-commit). Database is Postgres/PostGIS.

## 🔄 Workflow & Execution Rules

1. **Explore → Plan → Code → Verify.** Before any change touching more than one file: read
   `docs/components/<feature>.md` and the actual source, then **state an explicit plan** (files,
   order, which documented seam you're extending) and get agreement before editing. The catalog
   already names the extension points — use them instead of inventing new ones.
2. **Verify before declaring done.** Run, in order:
   `npx prettier --check . && npm test -- --no-watch && npm run build`.
   Report real output. If something fails, say so — never claim completion on an unverified change.
3. **Tests**: always run them. Write new specs for pure utilities, services, and stores. Component
   template tests aren't expected — there is no existing pattern (`src/app/app.spec.ts` is the only
   spec in the repo), so don't invent a harness unasked.
4. **Context hygiene**: `/clear` between unrelated features. Feature areas here are deeply
   documented but largely independent — stale context from another feature causes wrong assumptions.
5. **Git**: commit at logical checkpoints — one concern per commit — so the history reads chronologically and the working tree is never left full of uncommitted changes; push only when asked. Pre-commit runs `lint-staged` → Prettier.
   Any AI-assisted commit must append a `Co-authored-by:` trailer naming the agent **and**
   the model used, e.g. `Co-authored-by: opencode (opencode-go/deepseek-v4-flash)
<noreply@opencode.ai>` or `Co-authored-by: Claude Code (claude-sonnet-4-5)
<noreply@anthropic.com>`. Never attribute AI work to a human co-author.
6. **Known trap**: `adminOnlyGuard` currently `return true`s unconditionally (marked `TEMPORARY`) —
   `/console` is effectively unguarded today. Don't reason as if it's protected, and don't silently
   "fix" it as a side effect of unrelated work.
