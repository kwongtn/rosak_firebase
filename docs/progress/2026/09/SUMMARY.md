# Monthly Summary — 2026-09

## Overview

CI/des reliability month: both GitHub Actions workflows (`CI`, `Deploy Functions`) were red on every run and are green again. The month closed with the new **home** community front page going live as the app's landing route.

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
| Sep 22 | Front-page UX round: inline submit errors + Cancel on the line-status sheet and feed box, schemeless-URL normalization, all-24-hour chart labels, feed Load More, per-category status pills in the hover popover                                                                 |

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

| Commit    | Deliverable                                                                         |
| --------- | ----------------------------------------------------------------------------------- |
| `9c1acf8` | Line-status sheet: inline submit error on all three failure paths + Cancel button   |
| `dcf9885` | Feed submit box: inline error + schemeless-URL normalization (`feed-url.util.ts`)   |
| `a0f1b95` | Line-status chart: all 24 hour labels + shared reserved-height skeleton             |
| `858d059` | Feed: bottom-aligned timestamp, split URL colours, Load More list                   |
| `3e46c04` | Line card: removed the single count badge, per-category pills in the status popover |

## Commit Statistics

| Type      | Count  | Percentage |
| --------- | ------ | ---------- |
| feat      | 28     | ~48%       |
| fix       | 15     | ~26%       |
| docs      | 10     | ~17%       |
| style     | 1      | ~2%        |
| refactor  | 1      | ~2%        |
| other     | 3      | ~5%        |
| **Total** | **58** | **100%**   |

> No-merge commits authored in September 2026. "other" covers three non-conventional subjects (`Update AGENTS.md`, `Add graphify`, `Revert optimization except sentry`).

---

## Daily Logs

- [15.md](./15.md)
- [16.md](./16.md)
- [17.md](./17.md)
- [22.md](./22.md)
