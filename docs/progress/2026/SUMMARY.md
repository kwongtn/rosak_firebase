# Yearly Summary — 2026

## Overview

2026 is the year rosak_firebase was rebuilt on **Angular 22** (SSR, Tailwind v4, standalone components, `graphqlResource()` over the Django GraphQL API), and its feature platforms were built on top: **insiden** (incident reporting), **console** (admin tools), **home** (landing page and network board), plus **ads** and **methodology**. Git has no 2026 commits before Aug 3. The Angular 22 rewrite landed Aug 11, and the progress logs start Aug 24.

---

## Monthly Digest

### August: [SUMMARY](./08/SUMMARY.md)

- Angular 22 rewrite replaced the old Angular 18 app at the repo root (Aug 11, `29d26cf`). ng-devui had been replaced by ng-zorro-antd on Aug 3 (`844ee9e`).
- Three feature waves: insiden platform (Aug 21–24), console admin tools (Aug 22–24), ads (Aug 26).
- Polish across tracker, profile, spotting, navigation and core.

### September: [SUMMARY](./09/SUMMARY.md)

- CI and Deploy Functions workflows fixed (Sep 15).
- **home** front page goes live as the landing route (Sep 22), with a two-panel layout and 30s refresh (Sep 23) and a shared link card.
- **methodology** page and shared info popover (Sep 24).
- Console link moderation: Approve, Hide, Delete, and the Official badge (Sep 23–28).
- Link data wave (Sep 30): event time (`occurredAt`), Last Week section, thread grouping across insiden, home, console and profile.

### October: [SUMMARY](./10/SUMMARY.md)

- **home** refresh control and polling reworked (Oct 1–2, 5–6); network board rebuilt in phases with a Pro dashboard (Oct 3–6).
- **console** links tree on `/console/links`: nest, reorder, accordion, Approve retires the row, Unhide and Visibility filter (Oct 1–2, 8).
- Seven god-file splits, shared `injectIsBrowser()`, `npm run verify` and an e2e job in CI (Oct 7).
- About page: community projects, retired personnel, extracted admin editor (Oct 7–8, 20).
- Docs squash to current state; profile reload/error-state/null-guard fixes and home `feed-link-<id>` anchors (Oct 21).
- Audit fix pass (Oct 21): the 24 Fix-first and Quick-win findings of the 2026-10-21 audit are fixed (F044 partly). Changes: lazy Sentry chunks, sheet forms created on open, Kuala Lumpur day keys, a client Exif GPS strip, gallery `media(id)` deep links and share tags, Angular 22.2.3. Anonymous spottings now hide their location, profile rows, counts and photo uploader from everyone but the owner and admins. Suite at 178 files / 2428 tests.

---

## Module Arcs

| Module      | 2026 arc                                                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| insiden     | Aug platform (report form, votes, AI summarize, approval) → Sep event time and threads → Oct conversation tree and sublink editing |
| console     | Aug approval queue and link triage → Sep Approve, Hide, Delete → Oct `/console/links` tree, accordion, Unhide                      |
| home        | Sep landing page and shared link card → Oct refresh rework, network board, Pro dashboard                                           |
| profile     | Aug public view and privacy modal → Sep/Oct "My Submitted Links" grouping and tree                                                 |
| spotting    | Aug skeletons and z-index fixes → Sep combobox and route persistence → Oct report-form and mobile polish                           |
| ads         | Aug `app-ad-slot`, AdSense units, robots.txt → Oct disclosure pill                                                                 |
| methodology | Sep registry and `/methodology` page → Oct tooltip summaries                                                                       |
| about       | Sep admin editor and grid → Oct retired personnel, community projects, editor extraction                                           |
| tracker     | Aug latency and auth-gate fixes; Sep 24 info-panel copy change (`548581d`, `6727641`)                                              |
| core        | Aug bulk-action composable and reload prompt → Oct `injectIsBrowser()`, shared test polyfill                                       |

---

## Architecture

- Frontend: Angular 22 with SSR, standalone components and signals; `hlm-*` UI primitives (Spartan Brain with a local Helm layer); `graphqlResource()` over the Strawberry API.
- Firebase Auth and Firestore for CMS docs; Firebase Functions for AI extraction (Aug 21).
- Before the rewrite the app was Angular 18 with Apollo and ng-zorro-antd (legacy docs under `archive/frontend-map/`, per AGENTS.md).
- Sep 24: one code-first methodology registry feeds `/methodology` and every info popover.
- Oct 7: logic moved into spec-covered `*.util.ts` files and presentational children, with DOM unchanged.

---

## Commit Statistics (2026)

| Period                | Non-merge commits | Daily logs                         |
| --------------------- | ----------------- | ---------------------------------- |
| Jan–Jul               | 0                 | none                               |
| Aug                   | 74                | [24](./08/24.md), [27](./08/27.md) |
| Sep                   | 152               | 10, see [SUMMARY](./09/SUMMARY.md) |
| Oct 1–20              | 152               | 10, see [SUMMARY](./10/SUMMARY.md) |
| **Total (to Oct 20)** | **378**           |                                    |

Counted with `git log --no-merges` on the checked-out branch on 2026-10-21. Oct 21 onward: see [10/SUMMARY](./10/SUMMARY.md).

---

## Open Items (from the logs)

- Staging cold-start TTFB is about 17 s, about 7 s of it in SSR render ([19.md](./10/19.md)).
- Expanded line rows cannot show cause or direction; the GraphQL schema has no such field ([19.md](./10/19.md)).
- Pro table last-report column is hourly precision; operator grouping is a heuristic ([19.md](./10/19.md)).
