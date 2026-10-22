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
- Audit fix pass (Oct 21): the 24 Fix-first and Quick-win findings of the 2026-10-21 audit are fixed (F044 partly). Changes: lazy Sentry chunks, sheet forms created on open, Kuala Lumpur day keys, a client Exif GPS strip, gallery `media(id)` deep links and share tags, Angular 22.2.3. Anonymous spottings now hide their location, profile rows, counts and photo uploader from everyone but the owner and admins. A follow-up accepts every image: HEIC, WebP and other formats the GPS strip cannot clean upload as they are, by the owner's choice. Suite at 178 files / 2432 tests.
- Audit feature pass (Oct 22): sixteen feature findings of the same audit. Board Notice and Planned works chips, a `/station/:id` page, web push line alerts (frontend complete, VAPID key pending), an offline strip with a report outbox and restored drafts, an installable app with a service worker, calendar filters and `.ics`/`.csv` export, a 12-month incident chart and a typical-week strip, fleet progress and history export on the profile, viewer stepping and share, Fill from link mapping, spotting history details and asset status. The front page moved into its lazy route (initial bundle 997.74 → 841.90 kB) and spec files are isolated. Suite at 222 files / 3481 tests.
- Audit quality pass (Oct 22–23): 57 testing, tooling and code-quality findings of the same audit plus the auth-header one; 42 fixed, 14 partly fixed, F072 already done. `strict` and `strictTemplates` on, ESLint, a committed GraphQL schema snapshot with a validation spec, report-only coverage, a functions CI job, an SSR smoke job and Dependabot; one auth interceptor replaces 43 hand-attached headers; shared insiden form helpers, immutable chronology edits, URL-derived sort on the line page, a ref-counted sheet scroll lock, status colour tokens, an icon-button directive, the console links component split into composables; dependency bumps with Sentry 11 deferred. The new specs found seven real defects (see MISTAKES.md, 2026-10-22). Suite at 265 files / 4035 tests, initial bundle 842.69 kB.

---

## Module Arcs

| Module      | 2026 arc                                                                                                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| insiden     | Aug platform (report form, votes, AI summarize, approval) → Sep event time and threads → Oct conversation tree and sublink editing, line and severity filters, `.ics`/`.csv` export, 12-month chart, Fill from link mapping |
| console     | Aug approval queue and link triage → Sep Approve, Hide, Delete → Oct `/console/links` tree, accordion, Unhide                                                                                                               |
| home        | Sep landing page and shared link card → Oct refresh rework, network board, Pro dashboard, lazy route, Notice chips, push bell, report outbox, typical-week strip                                                            |
| profile     | Aug public view and privacy modal → Sep/Oct "My Submitted Links" grouping and tree → Oct 22 fleet progress, vehicle links, history export, Alerts card                                                                      |
| spotting    | Aug skeletons and z-index fixes → Sep combobox and route persistence → Oct report-form and mobile polish, drafts, history details, asset status                                                                             |
| station     | Oct 22 `/station/:id` server-rendered page: serving lines, incidents, reports, assets; every station name links to it                                                                                                       |
| gallery     | Oct 21 `media(id)` deep links and share tags → Oct 22 prev/next, swipe and share in the viewer                                                                                                                              |
| ads         | Aug `app-ad-slot`, AdSense units, robots.txt → Oct disclosure pill                                                                                                                                                          |
| methodology | Sep registry and `/methodology` page → Oct tooltip summaries, feature-pass metric docs                                                                                                                                      |
| about       | Sep admin editor and grid → Oct retired personnel, community projects, editor extraction                                                                                                                                    |
| tracker     | Aug latency and auth-gate fixes; Sep 24 info-panel copy change (`548581d`, `6727641`)                                                                                                                                       |
| core        | Aug bulk-action composable and reload prompt → Oct `injectIsBrowser()`, shared test polyfill, `OnlineService`, offline outbox, push service, service worker and manifest                                                    |

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

Counted with `git log --no-merges` on the checked-out branch on 2026-10-21. Oct 21 onward (73 commits for the audit fix pass, 189 for the Oct 22 feature pass to `28bc9b2`, 211 for the Oct 22–23 quality pass to `30201a2d`): see [10/SUMMARY](./10/SUMMARY.md).

---

## Open Items (from the logs)

- Staging cold-start TTFB is about 17 s, about 7 s of it in SSR render ([19.md](./10/19.md)).
- Expanded line rows cannot show cause or direction; the GraphQL schema has no such field ([19.md](./10/19.md)).
- Pro table last-report column is hourly precision; operator grouping is a heuristic ([19.md](./10/19.md)).
- Web push needs `FCM_VAPID_KEY` in `apphosting.yaml` and `apphosting.staging.yaml` before the bell can register a token; delivery is untested end to end ([22.md](./10/22.md)).
- The report outbox flushes on the home route only and has no idempotency key, so a report whose answer is lost can send twice ([22.md](./10/22.md)).
- The front page's Notice chips cost one extra backend read per server render ([22.md](./10/22.md)).
