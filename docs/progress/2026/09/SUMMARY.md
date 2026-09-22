# Monthly Summary — 2026-09

## Overview

CI/des reliability month: both GitHub Actions workflows (`CI`, `Deploy Functions`) were red on every run and are green again. The month closed with the new **home** community front page going live as the app's landing route, then a second pass that scoped the feed to the current service day and merged the three link lists onto one shared card.

---

## Highlights

| Date   | Highlight                                                                                                                                                                                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sep 15 | Fixed `CI`: mocked `graphqlResource` HTTP in console specs, stubbed Firebase-touching test doubles                                                                                                                                                                               |
| Sep 15 | Fixed `Deploy Functions`: resynced lockfile, Node 18→20, added `firebase.json` functions codebase                                                                                                                                                                                |
| Sep 16 | Pre-paint theme init for dark-mode ads; links tab edit flow + compact cards + day grouping; link form pinned selections + category dropdown; unified link list + link sheet into a shared `app-link-list`/`app-link-sheet` component set (situasi gains day headers, -275 lines) |
| Sep 17 | `/insiden` month-window incident fetching: month ±14 days + ongoing via `calendarIncidents(filters:)`; backend interval-overlap fix; year picker floored at 2022                                                                                                                 |
| Sep 17 | Incident card chronology rows highlight on vote/deletion-button hover; entries with a source URL show a right-aligned link icon before the vote buttons                                                                                                                          |
| Sep 17 | `/about` admin editor (structured draft-in-signals → `setDoc` with sanitization), search/filter across personnel/projects/tech stack, chronological project sort by `startDate`                                                                                                  |
| Sep 22 | **home** community front page ships as the landing route: global link feed (login-gated submit, duplicate detection, votes) + per-line pulse cards + mobile line-status bottom sheet                                                                                             |
| Sep 22 | Root `""` route swaps from the `/spotting` redirect to lazy `HomePage` with route-scoped `HomeStore`/`LineStatusSheetService`                                                                                                                                                    |
| Sep 22 | Home hosts the spotting entry sheet: `ReportSheetService.openFor(lineId)` + one-shot line seed in the report form (wave 1 of the UI revision)                                                                                                                                    |
| Sep 22 | Front-page UX round: inline submit errors + Cancel on the line-status sheet and feed box, schemeless-URL normalization, all-24-hour chart labels, feed Load More, per-status counts folded into the status legend                                                                |
| Sep 22 | Feed scoped to the current service day with a `Showing X of Y` footer; recent community reports show their related station and a hover timestamp; the shared card, legend counts and footer covered by e2e (9/9)                                                                 |
| Sep 22 | One shared `app-link-card` for the feed, `/insiden` and situasi (feed's URL split + relative-time tooltip + votes merged with insiden's favicon/pending/edit); the two duplicated feed-card files deleted, home feed gains working edit via the shared link sheet                |
| Sep 22 | Fixed the Pending pill and pending group: the shared card and list now key "pending" off the approval `status` (`PENDING_APPROVAL`), never the console's separate `completed` handled flag; `FEED_QUERY` selects `status`                                                        |

### Home — community front page (2026-09-22)

New landing feature under `src/app/features/home/`, delivered in four commits:

| Commit    | Deliverable                                                                                   |
| --------- | --------------------------------------------------------------------------------------------- |
| `de073ff` | Data layer: queries/types, route-scoped `HomeStore`, polling beat, authenticated vote overlay |
| `0dc074f` | Line pulse list + line-status bottom sheet                                                    |
| `ca8b495` | Link submit box + feed link card                                                              |
| `f4ede6b` | Root-route swap + page shell                                                                  |

### Home — front-page UX round (2026-09-22)

Follow-up polish on the same landing feature, five commits:

| Commit    | Deliverable                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------- |
| `9c1acf8` | Line-status sheet: inline submit error on all three failure paths + Cancel button                                 |
| `dcf9885` | Feed submit box: inline error + schemeless-URL normalization (`feed-url.util.ts`)                                 |
| `a0f1b95` | Line-status chart: all 24 hour labels + shared reserved-height skeleton                                           |
| `858d059` | Feed: bottom-aligned timestamp, split URL colours, Load More list                                                 |
| `3e46c04` | Line card: removed the single count badge; per-status counts folded into the status legend (revised in `33b367e`) |

### Home — shared card, service-day feed and e2e (2026-09-22)

Seven commits close out the front page:

| Commit    | Deliverable                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------- |
| `920e49a` | Feed day/total contract mirror + report stations + minute-granular `humanizeSince`                  |
| `c6989eb` | Recent report row shows its station and a right-pinned hover timestamp                              |
| `33b367e` | Per-status counts folded into the status legend (reverses the separate count-pill cluster)          |
| `46b0319` | One shared `app-link-card` across the feed, situasi and insiden lists; duplicated feed card deleted |
| `d60c906` | Feed scoped to the current service day; `feed-footer` "Showing X of Y" beside Load More             |
| `dd77aab` | e2e retargeted to the shared card, legend counts and feed footer (9/9)                              |
| `6157823` | `.gitignore` ignores Playwright artifact dirs so `prettier --check .` stays clean                   |

### Home/insiden — Pending pill keyed off the approval status (2026-09-22)

| Commit    | Deliverable                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `be72cad` | Pending pill + approved/pending grouping key off `status === "PENDING_APPROVAL"`; `FEED_QUERY` selects `status`; regressions pinned |

## Commit Statistics

| Type      | Count  | Percentage |
| --------- | ------ | ---------- |
| feat      | 35     | ~48%       |
| docs      | 12     | ~16%       |
| fix       | 11     | ~15%       |
| test      | 3      | ~4%        |
| refactor  | 3      | ~4%        |
| merge     | 5      | ~7%        |
| other     | 2      | ~3%        |
| style     | 1      | ~1%        |
| chore     | 1      | ~1%        |
| **Total** | **73** | **100%**   |

> September 2026 on the checked-out branch. `merge` covers 3 `Merge branch 'staging'` and 2 `Merge branch 'main' into staging`; `other` covers `Update AGENTS.md` and `Add graphify`.

---

## Daily Logs

- [15.md](./15.md)
- [16.md](./16.md)
- [17.md](./17.md)
- [22.md](./22.md)
