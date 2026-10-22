# Rosak — Web App

Angular 22 SSR web application for the MLPTF/LRT community platform. Talks to three backends: the
sibling Django/Strawberry GraphQL API, Firebase (Auth, Firestore, Storage), and GTFS-realtime feeds
for the tracker.

**Read [`AGENTS.md`](AGENTS.md) first** — it is the source of truth for conventions, commands,
workflow gates, and documentation-maintenance rules.

## Quick start

Node 24 (`.nvmrc`), npm 11.

```bash
npm ci
npm start          # dev server on :4200 (prestart regenerates build-info + env config)
npm run verify     # before pushing: Prettier + unit tests + production build
```

The remaining commands (build, SSR serve, single test suites, Playwright e2e) are in
[`AGENTS.md`](AGENTS.md) § Quick Commands. Prettier is the CI lint gate; `npm run lint` (ESLint) fails only on errors, and most rules are still warnings.

## Documentation

- [`AGENTS.md`](AGENTS.md) — conventions, commands, verification gate, doc-maintenance rules.
- [`docs/COMPONENTS.md`](docs/COMPONENTS.md) — system topology and the feature catalog.
- [`docs/components/`](docs/components/) — per-feature interfaces and extension points.
- [`MISTAKES.md`](MISTAKES.md) — known defects and traps.
- `../okf_bundle/` — OKF knowledge bundle for the monorepo
  (`okf lookup --bundle ../okf_bundle <Name>`).

Never hand-edit generated files (`src/build-info.ts`, `src/environments/*.generated.ts`,
`public/favicon.{svg,ico}`) — `scripts/*.mjs` regenerate them on start/build. Deploys run through
Firebase App Hosting (`apphosting.yaml`, `apphosting.staging.yaml`); Cloud Functions deploy from
`functions/` via GitHub Actions.
