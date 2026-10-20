# Monthly Summary — 2026-09

## Overview

September opened on CI reliability: `CI` and `Deploy Functions` were both failing and went green on Sep 15. The rest of the month built the **home** community front page (landing route from Sep 22; two-panel layout and 30s line refresh from Sep 23), the **methodology** page and shared info popover (Sep 24), console link moderation (Approve, Hide, Delete; Sep 23–28), and a **link-data wave** on Sep 30 that adds event time (`occurredAt`) and thread grouping across insiden, home, console and profile.

---

## Highlights

| Date              | Highlight                                                                                                                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Sep 15](./15.md) | Fixed `CI` (console specs mock `graphqlResource` HTTP) and `Deploy Functions` (lockfile resync, Node 18→20, `firebase.json` functions codebase). Follow-up: injectable `UPLOAD_ERROR_REPORTER` token for a spec that broke under shared module registries; step-level WIF gates; `actionlint` gate                       |
| [Sep 16](./16.md) | Pre-paint theme init for dark-mode ads (`32edd8b`); incident form chronology polish, mandatory category, Undo All (`6b76a41`); Links tab edit flow, compact cards and day grouping; shared `app-link-list` / `app-link-sheet` (situasi gains day headers, −275 lines); situasi link edit pencil (`871ab17`)              |
| [Sep 17](./17.md) | `/insiden` fetches a month window (±14 days plus ongoing) via `calendarIncidents(filters:)`, with a backend interval-overlap fix; year picker floored at 2022. Incident card: chronology hover highlight and source-link icon. `/about` admin editor (sanitized `setDoc`), search and filter, chronological project sort |
| [Sep 22](./22.md) | **home** front page becomes the landing route (`""` → `HomePage`): link feed with login-gated submit, duplicate detection and votes; per-line pulse cards; mobile line-status sheet; spotting entry sheet hosted on home. Commits `de073ff`, `0dc074f`, `ca8b495`, `f4ede6b`                                             |
| [Sep 22](./22.md) | Front-page UX round (`9c1acf8`, `dcf9885`, `a0f1b95`, `858d059`, `3e46c04`); one shared `app-link-card` across feed, `/insiden` and situasi (`46b0319`); feed scoped to the current service day with `Showing X of Y` (`d60c906`); e2e 9/9 (`dd77aab`)                                                                   |
| [Sep 22](./22.md) | Pending pill and pending group keyed off `status === "PENDING_APPROVAL"` (`fb136df`); hourly bars stacked by report type (`statusCounts`); recent-reports list capped in its own scroller                                                                                                                                |
| [Sep 23](./23.md) | Two-panel front page (URL list left, line statuses right) with a 30s lines-only refresh countdown; the poll no longer resets Load More pages. The countdown is the refresh control (separate button removed)                                                                                                             |
| [Sep 23](./23.md) | Front-page round 7 (`dbacb1c`..`6bbb2a0`): URL form heads the desktop feed; feed skeleton and empty states; `line-vehicle-count` badge; status pill only for non-ACTIVE lines; combobox Enter commits only deliberate matches (`22add7c`); cleared combobox deselects in the spotting form (`1f37d7d`)                   |
| [Sep 23](./23.md) | Console admins can delete social-media link entries from the triage queue (`481a332`)                                                                                                                                                                                                                                    |
| [Sep 24](./24.md) | **methodology**: `/methodology` "How this is counted" page over one code-first registry (8 sections, 13 metric docs), read by the page and every `app-info-popover`; `app-disclaimer-note`; PR-template anti-drift checklist. Nine commits `6355d6b`..`56ac071`                                                          |
| [Sep 24](./24.md) | Home SSR regression fixed (`/` returned a 22-byte error at HTTP 200 from a hydration mismatch; `f0954ac`); popover exclusivity and 300 ms hover grace (`53255b4`); schedule-derived rail sentence dropped from the disclaimer (`6727641`)                                                                                |
| [Sep 24](./24.md) | Spotting: roster table/cards switch moved from `sm` to `md`; line-details grid gets a stacked mobile layout below 768px                                                                                                                                                                                                  |
| [Sep 25](./25.md) | Spotting mobile pinned-type label matches the in-flow label (`mobileTypeLabelClass()`); `graphqlResource()` keeps structurally equal response data by default; spotting route persistence (keep-alive pages, scroll memory, silent revalidation). Suite 93 files / 800 tests                                             |
| [Sep 26](./26.md) | Console `/console/insiden/links`: admin **Approve** for non-`LIVE` rows (`updateSocialMediaLink` with `status: "LIVE"`, then reload), per `OFFICIAL_POST_INGESTION.md` §5.3. Suite 93 files / 805 tests                                                                                                                  |
| [Sep 28](./28.md) | **Official** chip on the shared card (from `isAutomated`; backend `0d2eea2`); console **Hide** action (`status: "HIDDEN"`) with per-row Official chip; "Hidden" label in profile list; `/about` admin cards in the public grid. Suite 94 files / 819 tests                                                               |
| [Sep 30](./30.md) | Home quick submit box: URL-only Submit Link plus Advanced Input, which opens the shared sheet with a URL prefill (`abd0a79`). Collapsed **Last Week (N)** section: last 7 days via backend `lastWeekOnly` (backend `c2c23e3`), day-grouped, 20-link day-aligned Load More (`dae7fa4`)                                    |
| [Sep 30](./30.md) | Links carry event time: `occurredAt` ("when it happened") is displayed, `created` stays the report axis; hand-written `datetime-local` ↔ ISO conversion (`toISOString()` would shift 8 h); every grouping and sort keys on the display instant (`ed5d958`)                                                               |
| [Sep 30](./30.md) | Thread grouping: `app-link-thread` on the home feed, with `collapseThreads: true` on every home read; console Occurred column, multi-select Group into thread and Ungroup; profile "My Submitted Links" grouping via the shared `link-thread-selection.util.ts`                                                          |
| [Sep 30](./30.md) | "Advertisement" caption opens the shared info popover with `AD_DISCLOSURE` copy (`2f2a03b`). Corrections: thread docs now match the code; the vote-overlay read uses the rendered feed's `currentServiceDayOnly` window. Suite 99 files / 982 tests                                                                      |

[30.md](./30.md) was written before commit. Git shows `abd0a79`, `dae7fa4`, `ed5d958` and `2f2a03b` committed on Sep 30.

---

## Commit Statistics

- **152 non-merge commits** in September (161 including 9 merges), `git log --no-merges` on the checked-out branch. Busiest logged days: Sep 22 (36), Sep 24 (21), Sep 23 (14), Sep 16 (13), Sep 25 (12), Sep 30 (12).
- Commit days with no daily log: Sep 1 (16), Sep 2 (7), Sep 3 (2), Sep 14 (1), Sep 29 (1).

---

## Daily Logs

- [15.md](./15.md)
- [16.md](./16.md)
- [17.md](./17.md)
- [22.md](./22.md)
- [23.md](./23.md)
- [24.md](./24.md)
- [25.md](./25.md)
- [26.md](./26.md)
- [28.md](./28.md)
- [30.md](./30.md)
