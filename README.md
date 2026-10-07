# Rosak — Web App

Angular 22 SSR web application for the MLPTF/LRT community platform. Talks to three backends:
the sibling Django/Strawberry GraphQL API, Firebase (Auth, Firestore, Storage), and GTFS-realtime
feeds for the tracker.

**Read [`AGENTS.md`](AGENTS.md) first** — it is the source of truth for conventions, workflow gates,
and documentation-maintenance rules.

## Quick start

```bash
npm ci
npm start          # dev server on :4200 (prestart regenerates build-info + env config)
```

## Key commands

| Command                  | What it does                                                           |
| ------------------------ | ---------------------------------------------------------------------- |
| `npm start`              | dev server on :4200                                                    |
| `npm run build`          | production SSR build (`postbuild` uploads Sentry sourcemaps)           |
| `npm run serve:ssr:web`  | run the built SSR server from `dist/`                                  |
| `npm run verify`         | full gate: Prettier + unit tests + production build                    |
| `npm test -- --no-watch` | unit tests (Vitest) — single run; watch mode hangs in a TTY            |
| `npm run e2e`            | Playwright e2e against a development build + local mock GraphQL server |
| `npx prettier --check .` | the only lint gate (there is no ESLint)                                |

## Documentation

- [`AGENTS.md`](AGENTS.md) — conventions, verification gate, doc-maintenance rules.
- [`docs/COMPONENTS.md`](docs/COMPONENTS.md) — system topology and the component catalog.
- [`docs/components/`](docs/components/) — per-feature interfaces and extension points.
- `../okf_bundle/` — OKF knowledge bundle for the monorepo (`okf lookup <Name>`).

Never hand-edit the generated files (`src/build-info.ts`, `src/environments/*.generated.ts`) —
`scripts/*.mjs` regenerate them on start/build. Deploys run through Firebase App Hosting; Cloud
Functions deploy from `functions/` via GitHub Actions.
