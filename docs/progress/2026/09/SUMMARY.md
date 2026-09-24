# Monthly Summary — 2026-09

## Overview

CI/des reliability month: both GitHub Actions workflows (`CI`, `Deploy Functions`) were red on every run and are green again. The month closed with the new **home** community front page going live as the app's landing route, then a second pass that scoped the feed to the current service day and merged the three link lists onto one shared card.

---

## Highlights

| Date   | Highlight                                                                                                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sep 15 | Fixed `CI`: mocked `graphqlResource` HTTP in console specs, stubbed Firebase-touching test doubles                                                                                                                                                                                                           |
| Sep 15 | Fixed `Deploy Functions`: resynced lockfile, Node 18→20, added `firebase.json` functions codebase                                                                                                                                                                                                            |
| Sep 16 | Pre-paint theme init for dark-mode ads; links tab edit flow + compact cards + day grouping; link form pinned selections + category dropdown; unified link list + link sheet into a shared `app-link-list`/`app-link-sheet` component set (situasi gains day headers, -275 lines)                             |
| Sep 17 | `/insiden` month-window incident fetching: month ±14 days + ongoing via `calendarIncidents(filters:)`; backend interval-overlap fix; year picker floored at 2022                                                                                                                                             |
| Sep 17 | Incident card chronology rows highlight on vote/deletion-button hover; entries with a source URL show a right-aligned link icon before the vote buttons                                                                                                                                                      |
| Sep 17 | `/about` admin editor (structured draft-in-signals → `setDoc` with sanitization), search/filter across personnel/projects/tech stack, chronological project sort by `startDate`                                                                                                                              |
| Sep 22 | **home** community front page ships as the landing route: global link feed (login-gated submit, duplicate detection, votes) + per-line pulse cards + mobile line-status bottom sheet                                                                                                                         |
| Sep 22 | Root `""` route swaps from the `/spotting` redirect to lazy `HomePage` with route-scoped `HomeStore`/`LineStatusSheetService`                                                                                                                                                                                |
| Sep 22 | Home hosts the spotting entry sheet: `ReportSheetService.openFor(lineId)` + one-shot line seed in the report form (wave 1 of the UI revision)                                                                                                                                                                |
| Sep 22 | Front-page UX round: inline submit errors + Cancel on the line-status sheet and feed box, schemeless-URL normalization, all-24-hour chart labels, feed Load More, per-status counts folded into the status legend                                                                                            |
| Sep 22 | Feed scoped to the current service day with a `Showing X of Y` footer; recent community reports show their related station and a hover timestamp; the shared card, legend counts and footer covered by e2e (9/9)                                                                                             |
| Sep 22 | One shared `app-link-card` for the feed, `/insiden` and situasi (feed's URL split + relative-time tooltip + votes merged with insiden's favicon/pending/edit); the two duplicated feed-card files deleted, home feed gains working edit via the shared link sheet                                            |
| Sep 22 | Fixed the Pending pill and pending group: the shared card and list now key "pending" off the approval `status` (`PENDING_APPROVAL`), never the console's separate `completed` handled flag; `FEED_QUERY` selects `status`                                                                                    |
| Sep 22 | Expanded line card's hourly chart stacks each bar by report type (new `statusCounts` contract): segments bottom-up NORMAL → DISRUPTED summing to the bar height, breakdown in the hover readout and bar `title`, plus a `refreshTick` poll hook                                                              |
| Sep 23 | Front page split into a two-panel desktop layout (full-height URL list left, line statuses right) with a 30s lines-only refresh countdown; the poll no longer resets the feed's Load More pages                                                                                                              |
| Sep 23 | Front-page round 7 (dbacb1c..6bbb2a0): the URL form heads the desktop feed column and the feed gains `feed-skeleton` / `feed-empty` states; the card's vehicle count becomes a `line-vehicle-count` badge and the line-status pill renders only for non-active lines                                         |
| Sep 23 | Combobox Enter now commits only a deliberately highlighted row or a non-empty query's match (fixes deselect-then-reselect, round 2); the spotting report's station resource projects `lineId`/`type` so unrelated model writes stop refetching `StationLinesByLine`                                          |
| Sep 23 | Console link triage: admins can hard-delete social-media link entries from `/console/insiden/links` (confirm guard + IsAdmin `deleteSocialMediaLink`, local row drop, panel close)                                                                                                                           |
| Sep 22 | Expanded line card's recent-reports list capped in its own scroll container (roughly 5 rows) instead of stretching the card                                                                                                                                                                                  |
| Sep 22 | Spotting report form: clearing a combobox or re-choosing a station placeholder now really deselects (shared `HlmCombobox.emptyValue`, non-disabled placeholder)                                                                                                                                              |
| Sep 23 | Home line-refresh countdown is now the refresh button itself, with a hover/tap "Click to Refresh Now" tooltip and a transient "Updated" confirmation; the separate Refresh now button is gone                                                                                                                |
| Sep 24 | **methodology** "How this is counted" page ships: one code-first registry (8 sections + 13 metric docs) read by the page and every `app-info-popover`; shared popover fixes 5 a11y defects; `app-disclaimer-note`; PR-template anti-drift checklist                                                          |
| Sep 24 | Fixed the home SSR regression (`/` was a 22-byte `Internal server error.` at HTTP 200): content projected into the popover's conditional slot orphaned a node → hydration serializer NG0502 swallowed by `@angular/ssr`; `ngSkipHydration` on `app-info-popover` + a server-render spec                      |
| Sep 24 | Home info chips drop the "(i)" pill (the badge is the trigger) and the shared popover closes only 1 s after the cursor leaves the host, so "How this is counted" stays clickable; `showMethodologyLink` makes the line-status chip's panel a plain tooltip; three non-isolated-runner cross-file leaks fixed |

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
| `fb136df` | Pending pill + approved/pending grouping key off `status === "PENDING_APPROVAL"`; `FEED_QUERY` selects `status`; regressions pinned |

### Home — stacked hourly report bars (2026-09-22)

- `line-status-chart.component.ts` bars are now stacked per passenger status from the backend's new
  `statusCounts` bucket field (bottom-up NORMAL → DISRUPTED, segments summing to exactly the bar's
  height, `flex-col-reverse` + `last:rounded-t-[2px]`), with the per-status breakdown in the hover
  readout and each bar's `title`, plus a `refreshTick` input so the parent's poll beat refreshes an
  open accordion. Covered by the chart/card specs and the e2e history stub.

### Home — recent-reports scroll container (2026-09-22)

- `line-status-reports.component.ts` wraps its loaded rows in a capped scroller
  (`data-testid="line-status-reports-scroll"`, `max-h-56 overflow-y-auto`) so the expanded card's
  report list shows ~5 one-line rows and scrolls internally; the skeleton/empty/error branches stay
  outside it. The same commit gave the component the `refreshTick` applied-tick effect (`4c92101`).

### Spotting — combobox / station clear-to-deselect (2026-09-22)

- The shared `HlmCombobox` gained `emptyValue` (default `undefined`): emptying the input clears the
  value, and `_syncSearchToValue` no longer resurrects the old label. The report-form line/vehicle
  pickers bind `emptyValue=""` and the three station placeholder options lost `disabled`, so a
  cleared pick really deselects (`1f37d7d`).

### Home — two-panel layout + lines-only refresh beat (2026-09-23)

One commit (`feat(home): split the front page into two panels with a line-refresh countdown`):

- The front page's feed and line-status sections share a `lg:grid-cols-2` wrapper (stacked on
  mobile) — URL list left, statuses right; the feed's `max-h-[60vh]` scroller and its
  `FEED_INITIAL_VISIBLE` reveal cap are gone, so every loaded link renders and the page scrolls.
- `HomeStore.polling` is public and now calls `reloadLines()` (lines resource + a new
  `linesRefreshTick`) instead of `reloadAll()`, so the 30s beat can't drop the feed's appended
  Load More pages; a spinner + `Refreshing in …s` + `Refresh now` row heads the line panel, and the
  tick is forwarded page → list → card → the expanded chart/reports.

### Home/spotting — front-page round 7 (2026-09-23, dbacb1c..6bbb2a0)

- `home.page.ts`: the URL submit box moved to the top of the desktop feed column, ahead of the list
  (still full width while the panels stack on mobile); the feed gained `feed-skeleton` (first-page
  load) and `feed-empty` ("No links yet.", styled like the line list's empty state), the retry
  banner replacing both on error.
- `line-pulse-card.component.ts`: the in-service text became a `line-vehicle-count` badge
  ("12/20 in service", `aria-label` "12 of 20 vehicles in service") keeping its per-status hover
  breakdown; the line-status pill renders only when `status !== "ACTIVE"`; the consolidated
  `passengerStatusMessage` is no longer rendered. `status-info-chip.component.ts` gained `mt-3` on
  the "Last N minutes" window line.
- `ui/combobox/combobox.ts`: Enter commits only a deliberate ArrowUp/Down highlight or a non-empty
  query's match, so a cleared field can't re-commit a stale item (the deselect fix's missing
  commit gesture; see `MISTAKES.md`).
- `report-form.component.ts`: the station resource reads projected `lineId`/`type` computeds instead
  of the whole model, ending the per-keystroke `StationLinesByLine` refetch storm.

### Console/insiden — social-media link delete in the triage queue (2026-09-23)

One commit (`feat(console): let admins delete social-media link entries`):

| Commit  | Deliverable                                                                                                                                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 481a332 | `deleteLink` on `/console/insiden/links`: native confirm guard + IsAdmin `deleteSocialMediaLink` mutation, local row drop, panel close, success/error toast; Delete buttons in the table Actions column and the sheet footer |

### methodology — "How this is counted" page + registry (2026-09-24)

Nine commits (`6355d6b..56ac071`) ship the methodology feature and its docs:

| Commit    | Deliverable                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `6355d6b` | Core registry: `methodology.constants.ts`, `methodology.content.ts` (8 sections, 13 metric docs), renderer + drift tests      |
| `1bb21a0` | Shared `app-info-popover` (real button, `role="dialog"`, Escape/focus-return, outside-click, viewport clamp, `aria-controls`) |
| `4af4550` | `app-disclaimer-note` (`inline` / `footer`)                                                                                   |
| `1dbb800` | Footer links `/methodology`                                                                                                   |
| `22c0d66` | PR-template anti-drift checklist line                                                                                         |
| `977e10f` | Home copy (`PASSENGER_INFO` / `LINE_STATUS_INFO` / `PASSENGER_METRIC`) sourced from the registry                              |
| `5c53c4c` | `status-info-chip` becomes a thin wrapper over `app-info-popover`                                                             |
| `548581d` | Tracker info panel gains the rail-schedule sentence                                                                           |
| `56ac071` | `/methodology` page + `app-methodology-section` + `RenderMode.Server` route                                                   |

Every one of the 8 sections renders the in-progress state naming its owning spec (the sibling specs
declare they block this one and their code has not landed); `reliability` and `limitations` carry
`ownerRoute: null` as the documented exception. v1 wires no `dataSources` fetch, so `sources` never
renders a license literal. Full suite 741 tests green.

## Commit Statistics

| Type      | Count  | Percentage |
| --------- | ------ | ---------- |
| feat      | 36     | ~49%       |
| docs      | 12     | ~16%       |
| fix       | 11     | ~15%       |
| test      | 3      | ~4%        |
| refactor  | 3      | ~4%        |
| merge     | 5      | ~7%        |
| other     | 2      | ~3%        |
| style     | 1      | ~1%        |
| chore     | 1      | ~1%        |
| **Total** | **74** | **100%**   |

> September 2026 on the checked-out branch. `merge` covers 3 `Merge branch 'staging'` and 2 `Merge branch 'main' into staging`; `other` covers `Update AGENTS.md` and `Add graphify`.

---

## Daily Logs

- [15.md](./15.md)
- [16.md](./16.md)
- [17.md](./17.md)
- [22.md](./22.md)
- [23.md](./23.md)
- [24.md](./24.md)
