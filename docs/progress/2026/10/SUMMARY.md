# Monthly Summary — 2026-10

## Overview

- **home refresh** (Oct 1–2, 5–6): the 30s beat and manual click reload the whole first-page set; the refresh control reads Updating → Updated → countdown; returning to `/` keeps the timer alive.
- **Network board** (Oct 3–6): hero, three-group board, report chooser, history widgets, Pro dashboard, motion and accessibility pass, Others group. "Line HQ" and the density control are removed.
- **Console links** (Oct 1–2, 8): links tree (nest, reorder, depth) on `/console/links`; accordion queue; Approve retires the row; Unhide and a Visibility filter.
- **Refactors and DX** (Oct 7): seven god-file splits (pure, byte-stable DOM); shared `injectIsBrowser()`; `npm run verify`; e2e job in CI.
- **About page** (Oct 7–8, 20): community projects, retired personnel, admin editor extracted into a lazy component.
- **Spotting report form** (Oct 4–6): vehicle picker ordering, inline vehicle status, mobile merged activity bar.
- **Docs and fixes** (Oct 21): docs squash — component docs, MISTAKES.md and progress summaries trimmed to current state; profile id-change reload, retry banner and user-card null guard; home `feed-link-<id>` anchors.
- **Audit fix pass** (Oct 21): the 24 Fix-first and Quick-win findings of the [2026-10-21 audit](../../../audit/2026-10-21.md) are fixed (F044 partly). Changes: focus rings, lazy Sentry Replay and feedback chunks, total `graphqlResource` `data()`/`errors()`, Kuala Lumpur day keys via `klDateKey()`, client Exif GPS strip, sheet forms created on open, a parallel vehicle page, a CSS-only gallery grid, `/gallery/:id` via `media(id)`, share tags and Angular 22.2.3. Anonymous spottings now hide their location, profile rows, counts and photo uploader from everyone but the owner and admins. Initial bundle: 984.97 kB against the 1 MB budget. The backend counterparts are logged in `rosak_backend`'s progress.
- Suite at **178 files / 2428 tests** (Oct 21, audit pass). The Oct 19 homepage UX and performance pass is uncommitted in its log.

---

## Highlights

| Date              | Highlight                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Oct 1](./01.md)  | **home**: the 30s beat and manual refresh reload line statuses, Today feed and Last Week first page via `HomeStore.reloadFirstPages()`; refresh control sits above the links below `lg` and above line statuses from `lg` up; "Updated" confirmation fires again (`86cae7f`); Last Week excludes today                                                                              |
| [Oct 1](./01.md)  | **console/spotting**: row selection always on (select-mode switch removed); click to toggle, Shift-click for range (`toggleCheckedRange()`)                                                                                                                                                                                                                                         |
| [Oct 1](./01.md)  | **insiden/home**: related links become a nested, ordered, editable tree (recursive `app-link-thread`; `parentId`/`sublinkCount`/`sublinks`/`position`); "N links" chevron sits in the first card; vote overlay walks every level                                                                                                                                                    |
| [Oct 1](./01.md)  | **console/profile**: move up/down, nest under a row and depth indent; reorder payload is the stored order (`position`, `id`), refused when the loaded set is incomplete                                                                                                                                                                                                             |
| [Oct 1](./01.md)  | **console/links** moves to `/console/links` (old path redirects; both nav lists updated); long URLs and titles wrap; date columns stay nowrap                                                                                                                                                                                                                                       |
| [Oct 1](./01.md)  | **console/links**: Approve publishes and marks completed in one reload (`markSocialMediaLinkCompleted`); Hide never completes; queue becomes an accordion over the link tree                                                                                                                                                                                                        |
| [Oct 1](./01.md)  | **insiden/home**: conversation chip joins the chip row; vote repaints from the server (`VoteMutationPayload`, three-layer display)                                                                                                                                                                                                                                                  |
| [Oct 1](./01.md)  | **home**: quick submit validation is submit-gated (`errorVisible` on `HlmInput`, `403bd1e`); `novalidate` added because `required` reflected onto the DOM blocked submit before the handler ran                                                                                                                                                                                     |
| [Oct 1](./01.md)  | **home/core-polling**: returning to `/` no longer removes the refresh control (`PollingSource.resume()`; `HomeStore.start()` resumes and revalidates)                                                                                                                                                                                                                               |
| [Oct 2](./02.md)  | Not-found page: the pet photo sits one screen down, in a second `min-h-dvh` section                                                                                                                                                                                                                                                                                                 |
| [Oct 2](./02.md)  | **home**: "Updating" covers the beat's own refreshes (`35b8c08`); "Updated" stays click-armed                                                                                                                                                                                                                                                                                       |
| [Oct 2](./02.md)  | **ui/ad-slot**: "Advertisement" caption is a pill with the "i" trailing; only the pill is the hover hotspot (`InfoPopover` gains `iconPosition` and `triggerClasses`)                                                                                                                                                                                                               |
| [Oct 2](./02.md)  | **console/profile**: "Nest under…" needs one tick (`canNest`, `84b9202`); "Show all links" clears filters for reorder                                                                                                                                                                                                                                                               |
| [Oct 2](./02.md)  | **console/links**: actions with a precondition drawn only once it holds; rails per ancestor level; eight columns instead of ten (`dcde12a`); icon-only tree verbs; Occurred shown only across different minutes (`2f5bd09`)                                                                                                                                                         |
| [Oct 3](./03.md)  | **home** network board Phase 0: full-width hero with zero new reads; worst-first list replaces the ACTIVE-first partition; `network-summary.util.ts` severity rule; `PreferencesService`. Backend `cb60769` adds the history queries                                                                                                                                                |
| [Oct 3](./03.md)  | **home** Phases 1–3: three-group board (Needs attention / My lines / All lines; attention wins); rider/pro toggle; confidence chip; five-intent report chooser with draft-first sheet; history widgets (hero sparkline, per-row strip, Pro heat grid) on two lazy reads; `lineId` feed filter                                                                                       |
| [Oct 3](./03.md)  | **home** Pro dashboard (Phase 4): bento with the `?view=` writer, `r`/`p` shortcuts, CSV export; plan §12 official-notices archive and worst-lines ranking (the ranking issues no reads of its own)                                                                                                                                                                                 |
| [Oct 3](./03.md)  | **home** Phase 5B: motion (`[hlmTickUp]`), dark-mode contrast audit, accessibility (single `h1`, skip link), methodology registry audit                                                                                                                                                                                                                                             |
| [Oct 3](./03.md)  | **home** browser QA: three-row bento, `heat-empty` state, "Back to rider view" once; contrast measured and left alone; sheet-scrim/z-index issue recorded in [MISTAKES.md](../../../../MISTAKES.md), not fixed here                                                                                                                                                                 |
| [Oct 4](./04.md)  | Report-form vehicle picker sorted A→Z (numeric-aware) with Married and Decommissioned last (`sortVehiclesForPicker`)                                                                                                                                                                                                                                                                |
| [Oct 5](./05.md)  | **home** hero top edge becomes the status line: `networkTone()` (half the lines is the ceiling of `degraded`); "Needs attention" and headline count in-service lines only (`isInService`)                                                                                                                                                                                           |
| [Oct 5](./05.md)  | **home** refresh control rework across rounds 2–2f (ring, spinner, 22 px glyphs, draw-in spinner; keyframes moved to global `@theme` tokens after emulated encapsulation broke them). Later rounds supersede round 2's text-only design                                                                                                                                             |
| [Oct 5](./05.md)  | **home** popovers paint above the chrome (`z-50`); hero and cards stop clipping them; sparkline keeps its height when empty or failed                                                                                                                                                                                                                                               |
| [Oct 6](./06.md)  | **home** refinement rounds 2g–2i: bright arc draws from 12 o'clock at half speed (2 s spin), track stays static                                                                                                                                                                                                                                                                     |
| [Oct 6](./06.md)  | **home** round 3: "Line HQ" removed everywhere (explicit decision); `/spotting/:lineId/details` kept as the Details button; history strip replaced by `N reports (X this hour)`; density control removed end-to-end; Pro heat grid made readable (`e92016c`)                                                                                                                        |
| [Oct 6](./06.md)  | **home** round 4: "Others" group for out-of-service lines (`TESTING`/`DEFUNCT`); per-line actions unified to pin · Details · Report                                                                                                                                                                                                                                                 |
| [Oct 6](./06.md)  | **spotting**: mobile activity bar merges line identity; title bar hands off to it on scroll; vehicle status inside the report field (`HlmCombobox.trailingTemplate`, `380de7b`); field labels inert (`ac4ac16`); month label mirrors its left edge                                                                                                                                  |
| [Oct 7](./07.md)  | **home** board polish round 4 (`2883604`): "My lines" hidden when empty; conditional dividers; pin tooltips; confidence and passenger chips for ACTIVE lines only                                                                                                                                                                                                                   |
| [Oct 7](./07.md)  | Tooltips: `summary` tier for registry metrics; `InfoPopover` viewport clamp (`80c95bc`, `bd03b19`, `defd29d`)                                                                                                                                                                                                                                                                       |
| [Oct 7](./07.md)  | About: "Other Community Projects" grid with in-page editor (additive `communityProjects`)                                                                                                                                                                                                                                                                                           |
| [Oct 7](./07.md)  | Task 4 god-file splits (pure refactors, byte-stable DOM): `links.component` 2143→1668; `home.store` 1486→1169 (`934edf7`); `home.queries` split into six modules; `vehicle-spotting-grid` 1321→1026; `my-links` 988→634 (`4a94f24`); `app-nav` 972→454 (`a0676e0`); `pending` 954→841                                                                                               |
| [Oct 7](./07.md)  | Shared pieces: `injectIsBrowser()` adopted across 38 files (`4cdcfd1`); one jsdom `ResizeObserver` polyfill in `src/test-setup.ts` (`10c214a`)                                                                                                                                                                                                                                      |
| [Oct 7](./07.md)  | DX and e2e: `npm run generate` (folded codegen), `npm run verify`, CI e2e job with chromium; legacy `docs/frontend-map/` archived; five long-red home e2e specs repaired (17/17) (`6d889be`, `8db2abe`, `69ac52e`, `8f2a63f`, `0aa683b`, `080eee2`)                                                                                                                                 |
| [Oct 8](./08.md)  | About: retired personnel (collapsed group) and month-precision service periods; additive fields on `public/about`                                                                                                                                                                                                                                                                   |
| [Oct 8](./08.md)  | console `/console/links`: Unhide verb and Visibility filter (All / Visible only / Hidden only); Approve only for `PENDING_APPROVAL`; Hide split by status                                                                                                                                                                                                                           |
| [Oct 8](./08.md)  | app-nav: Home label on `/?view=pro` (`routeSegmentOf`); fixed `NG0911` teardown race in the avatar hint                                                                                                                                                                                                                                                                             |
| [Oct 19](./19.md) | Homepage UX and performance pass, uncommitted at writing: single "Report a delay" CTA, four-control mobile bar, quiet-line fold, operator chips (`?op=`), Pro Board/Table toggle, lazy Last Week read, `GET /` edge cache (`s-maxage=20`), polling pauses on hidden tabs, concurrency 80→20                                                                                         |
| [Oct 20](./20.md) | Spotting "Most Recently Spotted" breaks ties on `lastSpottedAt`; comparator returns 0 only on a full tie                                                                                                                                                                                                                                                                            |
| [Oct 20](./20.md) | About hardening: legacy Firestore rows no longer break the editor; one `h1`, meta tags, empty and no-results states, double-submit guard, sticky save bar; `AboutEditorComponent` lazy-loaded; social-edit bug fixed (`8269470`); `app-avatar` (`5a7219e`); layout polish (`e235183`)                                                                                               |
| [Oct 21](./21.md) | Docs squash (`408e01f`): component docs, MISTAKES.md (1547→546 lines), AGENTS/README/COMPONENTS and progress summaries trimmed to current state; stale refs fixed                                                                                                                                                                                                                   |
| [Oct 21](./21.md) | **profile**: reload on `:id` change with a stale-response guard (`299ce29`); retry banner on failed load (`cd0c04c`); user-card `favouriteVehicles` null guard (`8d4b133`). **home**: feed rows render `feed-link-<id>` so the duplicate indicator scrolls to them (`a33b266`)                                                                                                      |
| [Oct 21](./21.md) | **Audit fix pass** (`365fa34`..`eb4895d`): F001, F002, F003, F007, F009, F010, F011, F012, F015, F016, F017, F018, F020, F022, F026, F030, F032, F033, F035, F043, F046, F047 and F049 fixed, F044 partly fixed, F072 fixed by the Angular update; three review rounds of follow-ups; MISTAKES entries and component docs updated; `AGENTS.md` now says TypeScript 6 `strict` is on |

---

## Tests & Gates

Last suite result on each logged close-out day:

| Day                 | Suite (files / tests)          |
| ------------------- | ------------------------------ |
| Oct 1               | 105 / 1229                     |
| Oct 2               | 108 / 1280                     |
| Oct 3               | 131 / 1766                     |
| Oct 5               | 131 / 1792                     |
| Oct 6               | 132 / 1823                     |
| Oct 7               | 145 / 1983 (`npm run verify`)  |
| Oct 8               | 146 / 2000                     |
| Oct 20              | 155 / 2148 (`ng build` exit 0) |
| Oct 21              | 158 / 2169 (`ng build` clean)  |
| Oct 21 (audit pass) | 178 / 2428 (e2e 17/17)         |

Oct 4 ran on the pre-Oct 3 base (108 / 1283). Oct 19 logs no test count.

---

## Commit Statistics

- **152 non-merge commits** Oct 1–20 (154 including 2 merges), `git log --no-merges`. No commits Oct 9–18. Oct 21 is logged in [21.md](./21.md); its audit fix pass adds 73 commits (`365fa34`..`eb4895d`).
- Busiest logged days: Oct 7 (50), Oct 6 (21), Oct 1 (17), Oct 2 (16), Oct 20 (16), Oct 5 (14).

---

## Daily Logs

- [01.md](./01.md)
- [02.md](./02.md)
- [03.md](./03.md)
- [04.md](./04.md)
- [05.md](./05.md)
- [06.md](./06.md)
- [07.md](./07.md)
- [08.md](./08.md)
- [19.md](./19.md)
- [20.md](./20.md)
- [21.md](./21.md)
