# Monthly Summary — August 2026

## Overview

August shipped three feature waves: the **insiden** incident platform (Aug 21–24), **console** admin tools (Aug 22–24) and **ads** (Aug 26), with polish across tracker, profile, spotting, navigation and core. Daily logs exist for [Aug 24](./24.md) and [Aug 27](./27.md) only. Other August commit days have no log (see Commit Statistics).

---

## Feature Waves

### Wave 1: insiden incident platform (Aug 21–24)

| Date   | Deliverables                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aug 21 | Firebase Functions scaffold; Gemini extraction with Cheerio (`20d7e31`, `36b4889`)                                                                                                                                                                                                                                                                                                                                                |
| Aug 22 | Report form with nested chronology editor (`7cc48e7`); vote button with net score and optimistic updates (`eb17dc9`); asset tagging and AI summarize (`2f742cd`); social-media link sheet (`86dcc50`); drafts submitted to the approval queue (`9b55adc`); `summarizeIncident` callable (`64e28f2`); report sheet and vote button wired into the page (`7b0956e`); Extract Data button (`b08a64a`); toast pin/dismiss (`89a0f5f`) |
| Aug 23 | Reference-data load failures surfaced; form and toast polish (`7147b1a`)                                                                                                                                                                                                                                                                                                                                                          |
| Aug 24 | Searchable asset multi-select (`912d204`)                                                                                                                                                                                                                                                                                                                                                                                         |

Architecture: client report form → Firebase Functions (Gemini + Cheerio) → console approval queue.

### Wave 2: console admin tools (Aug 22–24)

| Date      | Deliverables                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Aug 22    | Incident approval queue (`47d74b6`); social-media links triage page (`d45b6f0`); section nav on all console pages (`116a866`) |
| Aug 22–24 | Admin claim enforced on console routes (`29b5d6d`, security; git date Aug 22, listed in [24.md](./24.md))                     |

### Wave 3: ads monetization (Aug 26, commits listed in [24.md](./24.md))

| Commit    | Deliverable                                              |
| --------- | -------------------------------------------------------- |
| `aa1d8c2` | Shared `app-ad-slot` component + `ADS_CONFIG`            |
| `4ecb8cb` | Manual AdSense units across standard pages               |
| `5c1c1b1` | Reveal slots only when filled, cap to reserved block     |
| `aa34d6f` | Behavioral specs for ad-slot fill lifecycle and sizing   |
| `866cb37` | `robots.txt` excluding console and profile from crawling |
| `5379a41` | `CLAUDE.md` → `AGENTS.md` rename                         |

---

## Module-by-Module Breakdown

- **tracker**: `0010f5d` lower perceived latency on `/tracker` navigation; `e7b8069` compact nav links and auth gates synced; console dropdown fix (`4698bba`).
- **profile**: `f779e7e` public view (Aug 19); `873202f` privacy settings as a modal; `bdac574` historical spottings fetched on own-profile load.
- **spotting**: `1e7aac9` GraphQL error catching (Aug 19); `85efe4b` skeletons while line data loads; `6a33fdc` sticky z-index overlap fixed.
- **navigation / shell**: `38bde66` thin progress bar for slow route loads; `4698bba` one-shot reveal animations, nav z-index below overlays; `fd5d274` avatar, update pill and console sub-menu polish.
- **core**: `839e64d` reload prompt on stale lazy-chunk 404; `useBulkActions` composable extraction; `b6b5443` logical checkpoint commits (docs).
- **gdpr / about**: `ba95758` Firestore error state with retry button.

---

## Commit Statistics

- **74 non-merge commits** in August (`git log --no-merges`, checked-out branch). Busiest days: Aug 22 (22), Aug 24 (15), Aug 29 (7), Aug 26 (6).
- Commit days with no daily log: Aug 3, 4, 10, 11, 13, 16, 18, 19, 21, 22, 23, 26, 28, 29.

---

## Key Technical Decisions

1. Gemini extraction and `summarizeIncident` run in Firebase Functions, not the client (`36b4889`, `64e28f2`).
2. Vote button uses optimistic updates (`eb17dc9`).
3. Console routes check the admin claim (`adminOnlyGuard`; `29b5d6d`).
4. Ad slots: one shared component driven by `ADS_CONFIG`, revealed only when filled (`aa1d8c2`, `5c1c1b1`).

---

## Daily Logs

- [24.md](./24.md): 14 commits across insiden, tracker, profile, spotting, navigation, console, gdpr/about and core.
- [27.md](./27.md): progress-log structure created under `docs/progress/` (daily, monthly, yearly). Commit `13899da` per git; the log lists it as pending.
