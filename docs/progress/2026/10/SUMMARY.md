# Monthly Summary — 2026-10

## Overview

First month of Q4. The only work so far is the **home** refresh rework: the 30s beat and its manual
click now refresh the whole page (line statuses + Today feed + Last Week first page) instead of the
lines alone, the refresh control moved on top of the links section on mobile, and its transient
"Updated" confirmation was fixed so it actually fires — and only on a clean, click-armed refresh.
Paired with it, the backend now excludes today from the Last Week window by default (the frontend
sends no new variable, so either deploy order is correct).

---

## Highlights

| Date  | Highlight                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Oct 1 | **home** the 30s poll beat and the manual refresh click both go through the new `HomeStore.reloadFirstPages()`: line statuses + Today feed + Last Week first page, with already-loaded `Load More` pages deliberately preserved (the old `reloadLines()` lines-only callback is gone; `reloadAll()` and its callers are unchanged). `graphqlResource()` gains an additive `isFetching` and the store a matching `isRefreshing` |
| Oct 1 | **home** refresh control extracted to `refresh-control/home-refresh-control.component.ts` and rendered twice with CSS-only visibility — top of the links section below `lg`, top of the line-status panel from `lg` up (no `matchMedia` placement, so SSR/hydration agree)                                                                                                                                                     |
| Oct 1 | **home** the transient "Updated" confirmation is green (`text-green-600 dark:text-green-400`) and now fires correctly: the old effect keyed on `graphqlResource.isLoading` (pristine-first-fetch-only), so it never re-ran after the first load and could also flash success on a FAILED refresh. Now click-armed, latched on an observed `isRefreshing` true→false transition, and suppressed on `hasError`                   |
| Oct 1 | **home** `edges`/`lastWeekEdges` de-duplicate by `node.id` on merge (first wins) — refetching page one while keeping appended pages can otherwise produce a duplicate id, which throws on the page's `track link.id`. **Last Week** now shows no "Today" group: today is excluded by the backend's `displayTodayInLastWeek: false` default, which this side deliberately does not send                                         |

---

## Tests & Gates

- `npx prettier --check .` clean
- `npm test -- --no-watch` — see [01.md](./01.md) for the exact count at close-out
- `npm run build` exit 0

---

## Commits

- `feat(home)`: refresh the links on the poll beat + `isFetching`/`isRefreshing`, `reloadFirstPages()`, dedup
- `feat(home)`: responsive refresh control component + green success check
- `docs(home)`: refresh semantics, Last Week exclusion, progress + MISTAKES

---

## Daily Logs

- [01.md](./01.md)
