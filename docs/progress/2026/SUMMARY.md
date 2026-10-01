# Yearly Summary — 2026

## Overview

2026 marks the **Angular 22 SSR rewrite** and **feature platform maturation** year for rosak_firebase. The codebase transitioned from Angular 18 (ng-zorro-antd) to Angular 22 with Tailwind v4, SSR, and a modern component architecture. Three major feature platforms were delivered: **insiden** (incident reporting), **console** (admin tools), and **ads** (monetization), alongside significant tracker, profile, and spotting improvements.

---

## Major Milestones

### Q1–Q2: Foundation & Migration (Jan–Jul)

| Period  | Milestone                                                                                                                     |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Jan–Feb | Angular 18 → 19/20 upgrade prep, ng-devui → ng-zorro-antd migration (Stage 0)                                                 |
| Mar–Apr | Standalone component migration across all features (spotting, tracker, profile, insiden, gallery, console, about, compliance) |
| May–Jun | GTFS real-time tracking platform: multi-layer sources, status cards, path display, panel RT layer                             |
| Jul     | SSR enablement via Angular Universal, custom webpack builder, codecov integration                                             |

### Q3: Feature Platform Delivery (Aug)

| Week      | Milestone                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------- |
| Aug 3–4   | Angular 19/20 upgrade: ng-devui → ng-zorro-antd (Stage 0), global font/nav badges/avatar restoration |
| Aug 10–11 | Firebase config fixes, rewrite checkpoint                                                            |
| Aug 13    | Angular 22 rewrite at repo root (major architecture shift)                                           |
| Aug 16–19 | Error tracking improvements, favicon update, profile public view                                     |
| Aug 21–24 | **insiden platform**: Firebase Functions + Gemini AI, report form, voting, approval queue            |
| Aug 22–24 | **console platform**: Approval queue, social media triage, admin claim enforcement                   |
| Aug 26    | **ads platform**: AdSense integration, app-ad-slot, robots.txt                                       |

### Q3: Reliability (Sep)

| Week   | Milestone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sep 15 | CI + Deploy Functions workflows green: console spec HTTP mocks, functions Node 20                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Sep 22 | Home feed scoped to the current service day with a `Showing X of Y` footer; three link lists unified onto the shared `app-link-card`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Sep 22 | **home** community front page goes live as the app's landing route (link feed + line pulse + line-status sheet)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Sep 22 | Home front-page UX round: inline submit errors + Cancel, schemeless-URL normalization, 24-hour chart labels, feed Load More, per-status counts in the status legend                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Sep 22 | Home close-out: Pending pill + pending group keyed off the approval `status`; hourly bars stacked by report type (`statusCounts`); recent-reports list capped in its own scroller; `HlmCombobox` clear-to-deselect fix in the spotting report form                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Sep 23 | Front page split into a two-panel desktop layout (full-height URL feed left, line statuses right) with a 30s lines-only refresh countdown; the poll no longer resets the feed's Load More pages                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Sep 23 | Front-page round 7 (dbacb1c..6bbb2a0): URL form heads the desktop feed column, feed `feed-skeleton`/`feed-empty` states, `line-vehicle-count` badge + non-ACTIVE-only status pill, combobox Enter commit rule, station-resource dependency projection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Sep 24 | **methodology** "How this is counted" page + code-first registry (8 sections, 13 metric docs) read by the page and every shared `app-info-popover`; `app-disclaimer-note`; PR-template anti-drift checklist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Sep 28 | Link moderation + attribution: shared-card **Official** chip, console link **Hide** action (`HIDDEN`), per-row Official chip in the triage queue, "Hidden" status label/variant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Sep 28 | `/about` admin editor cards mirror the public display grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`), so an edit cell lines up with the card it produces                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Sep 30 | **home** quick submit box reworked into a two-mode form (URL-only **Submit Link** + **Advanced Input** opening the shared sheet with a one-shot URL prefill, `96 files / 843 tests`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Sep 30 | **home** collapsed **Last Week (N)** section below the today feed: 7 calendar days via backend `lastWeekOnly`, day-grouped, 20-link day-aligned Load More (`alignPageToDay`), `96 files / 843 tests`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Sep 30 | **ui/ad-slot** "Advertisement" caption triggers the shared `app-info-popover` with the new `AD_DISCLOSURE` copy (hover on desktop, tap on mobile); `InfoPopover` gains `align="center"` so the panel escapes the unit's `overflow-hidden` block (`96 files / 852 tests`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Sep 30 | **insiden** links carry an event time: `occurredAt` ("when it happened") alongside `created` ("when it was reported") across the whole link surface — the card displays `occurredAt ?? created` and surfaces the submission time only when the two differ; new hand-written `datetime-local` ↔ naive-local-ISO util; every day grouping/sort keyed on the display instant (`99 files / 979 tests`)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Sep 30 | **insiden/home** related links group into a **thread**: new `app-link-thread` (root rendered exactly like any other link, "N links" chevron, members revealed on expand, collapsed by default); the home feed and its Last Week section collapse server-side on every read, continuation pages included (`99 files / 979 tests`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Sep 30 | **console** `/console/insiden/links` triage: **Occurred** column beside Submitted, range filter relabelled and remapped to the renamed `occurredAfter`/`occurredBefore` args, multi-select "Group into thread" + per-row Ungroup + a `2 links` chip (coupling in its `Thread root — …` tooltip), confirm-before-Hide explaining the root→member visibility coupling, and the `occurredAt` round trip in the status-only payload (`99 files / 979 tests`)                                                                                                                                                                                                                                                                                                                                                                 |
| Sep 30 | **profile** "My Submitted Links" gains the submitter half of thread grouping, sharing `link-thread-selection.util.ts` with the console table (`99 files / 979 tests`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Sep 30 | Correction to the two rows above (added 2026-09-30, month level then year level): the four doc sites that claimed `app-link-thread` re-derived its own thread count now state the true arrangement (it calls the shared `threadLabel`; what differs between callers is the **gate**, not the string), and the authenticated **vote-overlay read** now mirrors its rendered feed on BOTH axes — it sends `currentServiceDayOnly` _and_ collapses like the resource it overlays, walking the nested children (now `sublinks`, renamed 2026-10-01) as well as the roots, because an uncollapsed top-N window does not contain every rendered member id. Pinned by a spec that compares the two requests' variables structurally; the earlier belief that the overlay "stays uncollapsed" is struck (`99 files / 982 tests`) |

### Q4: Reliability (Oct)

| Week  | Milestone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Oct 1 | **home** the 30s poll beat and the manual refresh click both refresh the WHOLE page — line statuses + Today feed + Last Week first page — through the new `HomeStore.reloadFirstPages()`, which leaves already-loaded `Load More` pages intact; `graphqlResource()` gains an additive `isFetching` (the raw in-flight flag, true across reloads and retries) and the store a matching `isRefreshing`. The refresh control is extracted to `refresh-control/home-refresh-control.component.ts` and rendered twice with CSS-only visibility: top of the links section below `lg`, top of the line-status panel from `lg` up. Its transient "Updated" confirmation is now green and actually works — the old effect keyed on `graphqlResource.isLoading` (pristine-first-fetch-only), so it never re-ran after the first load and could flash success on a failed refresh. Edges de-duplicate by `node.id` on merge, and **Last Week excludes today** via the backend's `displayTodayInLastWeek: false` default, which this side deliberately never sends (`100 files / 994 tests`)                                                                                                                                                                                                                                                                |
| Oct 1 | **insiden/home** the related-link grouping becomes a **nested, ordered, editable tree**. `app-link-thread` is **recursive** — it imports itself, so no separate branch component was needed — and renders each child as a nested conversation with its own expand state and indent; `threadId`/`threadSize`/`threadLinks` become `parentId`/`sublinkCount`/`sublinks` (recursive; `FEED_QUERY` nests four blocks) with **no server-side alias**, and `position` is added. The "N links" count and its chevron move **inside the first link's own card** (`app-link-card` gains `sublinkCount` / `sublinksExpanded` / `sublinkToggle`) — in the **right rail**, because the chip row lives inside the card's `<a>` and a button there navigates. Sublinks are **editable from the front page** at every depth, superseding the previous wave's "a collapsed group is a summary" rationale. The vote-overlay walk recurses through `sublinks` at every level. The flat hosts (`/insiden`, situasi, incident cards) stay flat and say so, pinned on **both** documents each list is assembled from (`103 files / 1115 tests`, up from `102 / 1091` on the new `data/home.queries.spec.ts` — the guard on the feed document's edit round-trip, which is what stopped a front-page link edit from wiping a row's `vehicles`/`stations`/`categories`) |
| Oct 1 | **console/profile** the sequence round-trip closes: move up/down, nest-under-a-row and a depth indent on both management surfaces. 🔴 `reorderSocialMediaLinks` is a **permutation of one sibling set**, so the payload must be the STORED order (`position` ASC, `id` tie-break) with one row moved — never the feed's `occurredAt DESC, id DESC` arrival order, which overwrites a conversation the backend assembled oldest-first and reports success. Both surfaces also refuse to reorder when any sibling's `position` is missing (a synthesised order becomes the stored truth) or when the loaded set is not provably complete, because the server _tolerates_ a partial permutation and silently pushes unseen rows to the end                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Oct 1 | **insiden/home** the conversation chip joins the **chip row** and the vote repaints from the server. The card's anchor became a **stretched overlay** (`absolute inset-0`) with the body and chip row as `pointer-events-none` layers above it, so the chip row is a SIBLING of the anchor — the rule the old right-rail placement was working around — and the toggle re-enables hit-testing with `pointer-events-auto`, leaving the chips clickable through the anchor. Documented costs: the chips' hover tooltips became `sr-only` text and the title is no longer mouse-selectable. The nine vote mutations now acknowledge with `VoteMutationPayload` and the button's display is three layers — `optimistic` → `confirmed` → `hostState` — instead of a `linkedSignal` that re-seeded from its inputs and reset to the PRE-CLICK score the instant the host echoed the vote back down; `confirmed` survives only while `voteStatsKey` (**excluding `userVote`**) matches the counters it was computed against, so the host's own echo is not new data while a real refetch is (`105 files / 1220 tests`)                                                                                                                                                                                                                                 |
| Oct 1 | **home** the refresh control's click reads as **three** states and the trigger shrink-wraps. The new **Updating** label is armed by the _click_ (not by `isRefreshing`, so an automatic poll tick never speaks to a passive reader) and is torn down on **both** exits from an armed window — the settle edge, placed before the `hasError` gate so an errored refresh still drops it, and the stale-arm expiry, the only exit for a click whose request never started — then **Updated** (~2s, green) and the countdown. `w-full` and the block host are gone (`:host { display: inline-block }`), so the tap target is the spinner + label; the host's `flex justify-end` gate is what parks it at the right edge. The Line status section gains a **mobile-only** divider (`border-t pt-6`, dropped at `lg`). 🔴 The reversed spinner had to put `reverse` **inside** the `animation` shorthand, since an inline shorthand resets every sub-property and silently beat the `[animation-direction:reverse]` class — the spinner ran clockwise, a defect jsdom cannot see at all (`105 files / 1223 tests`)                                                                                                                                                                                                                                    |
| Oct 1 | **home** the quick submit box's "Enter a URL" is **submit-gated**, so blurring an empty box stays quiet: a local `submitAttempted` signal replaces `touched()` (which `FormField` sets on blur) as the visibility gate for both the note and the input's border/`aria-invalid`, and a new **optional** `errorVisible` input on `HlmInput` carries it there without changing any other consumer. 🔴 The structural half: signal-forms' `FormField` reflects the schema's `required` onto the DOM, and a constraint-invalid `<form>` **without** `novalidate` aborts submission _before_ the `submit` event — the native bubble fired and the component's `submit()` never ran, which made the requested change unsatisfiable until the form got `novalidate`. The same short-circuit is verified present in `insiden/link-form`, `insiden/incident-form` and `console/insiden/pending`; `spotting/report-form` renders no `<form>` and is unaffected (`105 files / 1223 tests`)                                                                                                                                                                                                                                                                                                                                                                  |
| Oct 1 | **home/core-polling** returning to `/` no longer **deletes** the refresh control for the rest of the session. The router retains the `""` route injector while `HomePage` is recreated, so `HomeStore` survives a visit: `ngOnDestroy`'s `stop()` paused the 30s beat with `setIntervalMs(null)` and the recreated page's `start()` then **re-applied the paused `null`**, so nothing was ever scheduled again — and since the countdown branch is `@if (intervalMs() !== null)`, a paused beat rendered as nothing at all, with no error anywhere. `PollingSource` now keeps `lastEnabledIntervalMs` (last non-null cadence, 30s default) and exposes **`resume()`**, the only exit from the paused `null`; `HomeStore.start()` acts only on the retained-store re-entry, resuming **and** revalidating `reloadFirstPages()`, and stays a no-op on a first mount and on the server. 🔴 The durable rule: a timer that can be disarmed needs a real resume verb (never round-trip the current value through the setter — `null` means both "never" and "not me"), and a **route-scoped service does not die with the component that injects it**, so its lifecycle edges are asymmetric and the stop→start cycle must be tested on one instance (`105 files / 1229 tests`, +6)                                                                  |     |

---

## Module Evolution 2026

### insiden (Incident Platform) — **NEW PLATFORM**

| Phase      | Deliverables                                                                                                                                                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-2026   | Calendar view, timeline, event cards, long/short-term separation, markdown details                                                                                                                                                                                                                      |
| Aug 21     | Firebase Functions scaffold, Gemini extraction (Cheerio)                                                                                                                                                                                                                                                |
| Aug 22     | Report form (nested chronology), vote button (optimistic), asset tagging, AI summarize, social-media sheet, approval queue submission, `summarizeIncident` callable                                                                                                                                     |
| Aug 23     | Reference-data error surfacing, form/toast polish                                                                                                                                                                                                                                                       |
| Aug 24     | Searchable asset multi-select, form polish                                                                                                                                                                                                                                                              |
| Sep 2026   | **Link data model**: `occurredAt` ("when it happened") alongside `created`, the shared `app-link-card` two-time-axis display, the `datetime-local` form control with its omit/set/reset tri-state, and the shared pure utils (`link-occurred-at`, `link-thread-selection`) the console and profile read |
| Oct 1      | **Link conversation tree**: the shared link primitives grow a hierarchy — a recursive `app-link-thread`, the "N links" affordance inside the card, editable sublinks, and the `parentId`/`sublinkCount`/`sublinks`/`position` field set                                                                 |
| **Status** | **MVP Complete** — Full incident reporting → AI processing → admin approval workflow                                                                                                                                                                                                                    |

### console (Admin Dashboard) — **MAJOR EXPANSION**

| Phase      | Deliverables                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-2026   | Events table, pagination, mark-as-read, vehicle status tags, reporter links                                                                                                                                                                                                                                                                                          |
| Aug 22     | Incident approval queue, social media links triage, section navigation                                                                                                                                                                                                                                                                                               |
| Aug 22     | **Security**: Admin claim enforcement (Firebase custom claims)                                                                                                                                                                                                                                                                                                       |
| Sep 2026   | Social-media link triage: admin hard-delete of link entries (confirm guard + IsAdmin `deleteSocialMediaLink`)                                                                                                                                                                                                                                                        |
| Sep 26     | Link queue **Approve** action for non-`LIVE` rows (`status: "LIVE"` through `updateSocialMediaLink` + list reload)                                                                                                                                                                                                                                                   |
| Sep 28     | Link queue **Hide** action (`status: "HIDDEN"`, Approve remains the un-hide verb) + per-row **Official** chip off the new `isAutomated` field                                                                                                                                                                                                                        |
| Sep 30     | Link triage rebuilds around the event instant: **Occurred** column, range filter relabelled and remapped to `occurredAfter`/`occurredBefore` (renamed, no alias), **thread grouping** (multi-select Group, per-row Ungroup, a `2 links` chip) and a confirm that states hiding a thread root hides its members; the status-only payload now round-trips `occurredAt` |
| Oct 1      | Link triage gains the **tree**: `parentId`/`sublinkCount`/`position` columns, a depth indent, Move up/down, Nest under…, and a stored-order reorder permutation that is refused unless the queue is unfiltered and every sibling's stored order is readable; the hide confirm now states the recursive blast radius                                                  |
| **Status** | **Admin tools mature** — Approval workflows, triage, secure routes                                                                                                                                                                                                                                                                                                   |

### tracker (GTFS Real-time) — **MATURE PLATFORM**

| Phase      | Deliverables                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Pre-2026   | Multi-layer sources, status cards, path display, RT layer, panel selections, mapbox integration |
| Aug 2026   | Navigation latency reduction, auth gate sync, console dropdown fixes                            |
| **Status** | **Production-ready** — Real-time vehicle tracking with multi-source GTFS-RT                     |

### profile (User Profiles) — **ENHANCED**

| Phase      | Deliverables                                                                                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-2026   | Nickname editing, spotting stats, trends/charts, favourite trains, historical spotting                                                                                                                                                                |
| Aug 2026   | Public view feature, privacy settings modal, historical spottings on load                                                                                                                                                                             |
| Sep 2026   | "My Submitted Links" (`my-links`): the caller's own link submissions, keyset-paginated with status badges, plus submitter-side **thread grouping** (row checkboxes, discoverability hint, Group into thread, per-row Ungroup)                         |
| Oct 1      | "My Submitted Links" mirrors the tree for a submitter's own links: depth indent, Move up/down, Nest ticked here, Ungroup on sublinks only — under a tree a **root is the head of its conversation, not an ungrouped row**, so ungrouping one is inert |
| **Status** | **Feature-complete** — Public/private views, privacy controls, statistics                                                                                                                                                                             |

### spotting (Train Spotting) — **CORE FEATURE**

| Phase      | Deliverables                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-2026   | Form (line/vehicle selection, sanity tests, run number, image upload, compression, queueing), drawer UI, inline history, session history |
| Aug 2026   | Skeletons for line data, z-index fixes, GraphQL error catching                                                                           |
| Sep 2026   | Report form: combobox/station clear-to-deselect (`HlmCombobox.emptyValue`, non-disabled placeholders)                                    |
| **Status** | **Polished** — Robust form, image pipeline, history, loading states                                                                      |

### navigation / shell — **MODERNIZED**

| Phase      | Deliverables                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| Pre-2026   | Header, menu, theme picker, login dropdown, avatar                                                          |
| Aug 2026   | Progress bar for slow routes, one-shot animations, z-index management, avatar/pill polish, console sub-menu |
| **Status** | **App shell complete** — Perceived performance, animation polish, overlay management                        |

### ads (Monetization) — **NEW PLATFORM**

| Phase      | Deliverables                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Aug 26     | `app-ad-slot` component, `ADS_CONFIG`, manual AdSense units, fill-gated reveal, block capping, behavioral specs, `robots.txt` |
| **Status** | **MVP Ready** — Config-driven, tested, SEO-protected                                                                          |

### home (Community Front Page) — **NEW PLATFORM**

| Phase      | Deliverables                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sep 22     | Root `""` route becomes `HomePage`: global rolling link feed with login-gated submit + duplicate detection, per-line pulse cards (vehicle counts, passenger status, related links), mobile line-status bottom sheet, route-scoped `HomeStore` with polling and an authenticated `userVote` overlay                                                                                                                                                                                                                                                                                                |
| Sep 22     | UX round: inline submit errors + Cancel on the sheet and feed box, schemeless-URL normalization, all-24-hour chart labels with a shared reserved-height skeleton, feed Load More, per-status counts folded into the status legend                                                                                                                                                                                                                                                                                                                                                                 |
| Sep 22     | Delivery round: feed scoped to the current service day with a `Showing X of Y` footer, the shared `app-link-card` across all three link lists, report stations + hover timestamps, legend counts, e2e 9/9                                                                                                                                                                                                                                                                                                                                                                                         |
| Sep 22–23  | Approval-status-driven Pending pill, hourly bars stacked by report type, recent-reports list capped in its own scroller, two-panel desktop layout + 30s lines-only refresh beat                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Sep 23     | Round 7: URL form heads the desktop feed column, feed `feed-skeleton`/`feed-empty` states, `line-vehicle-count` badge + non-ACTIVE-only status pill, combobox Enter commit rule, station-resource dependency projection                                                                                                                                                                                                                                                                                                                                                                           |
| Sep 28     | Feed rows badge provenance: the shared card's **Official** chip off the new `isAutomated` field, so a rider can see an automatically captured operator post at a glance                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Sep 30     | Quick submit box becomes a two-mode form: URL-only **Submit Link** plus **Advanced Input**, which opens the shared link sheet with a one-shot URL prefill (`LinkSheetService.open(context?, { url })`)                                                                                                                                                                                                                                                                                                                                                                                            |
| Sep 30     | Collapsed **Last Week (N)** section below the today feed: last 7 calendar days (backend `lastWeekOnly`), day-grouped (Today / Yesterday / `EEE, d MMM`) with a 20-link day-aligned Load More (`alignPageToDay`)                                                                                                                                                                                                                                                                                                                                                                                   |
| Sep 30     | Ad disclosure tooltip: the "Advertisement" caption opens the shared `app-info-popover` with `AD_DISCLOSURE` (ads fund a free volunteer-run project) — hover on pointer devices, tap on touch; `InfoPopover` gains `align="center"` for the clipped ad block                                                                                                                                                                                                                                                                                                                                       |
| Sep 30     | **Thread grouping on the feed**: every row renders through the new shared `app-link-thread`; **all six** home reads ask the backend to collapse threads — the four list reads (today, last week, both Load More continuations) **and both authenticated vote-overlay reads** — so a group is a self-contained unit and the id-keyed overlay's read set equals the set the page renders. Corrected 2026-09-30: the overlay does **not** stay uncollapsed; that belief was backwards, since staying uncollapsed is precisely why member votes read as the anonymous `0`                             |
| Oct 1      | The feed's conversation tree: every row renders through the **recursive** `app-link-thread`, the count and chevron live in the card's own rail, sublinks are editable, and the authenticated vote-overlay read collapses like the resource it mirrors **and** recurses through `sublinks` at every depth — the reads were already correct, so a deep member's vote was reading as the anonymous `0`                                                                                                                                                                                               |
| Oct 1      | Interaction polish, both found by clicking the real thing in a browser: the refresh control says **Updating** while its own request is in flight, before the transient **Updated** and the countdown, with the trigger shrink-wrapped to the spinner + label and a mobile-only divider between the two panels; and the quick submit box's validation is **submit-gated** (blur stays quiet), which required `novalidate` on the `<form>` because signal-forms reflects the schema's `required` onto the DOM and the native validation bubble was aborting submission before the handler could run |
| Oct 1      | Lifecycle close-out: the route-scoped `HomeStore` **outlives the page component**, so `stop()` on destroy only _pauses_ the beat and `start()` on re-entry must resume it (`PollingSource.resume()`, the last non-null cadence) and revalidate the first pages. Before this, a second visit to `/` lost the refresh control permanently — `start()` re-applied the pause instead of lifting it, and a paused beat renders no countdown at all                                                                                                                                                     |
| **Status** | **Live** — The site's landing page; the `/spotting` default-route redirect is gone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

### methodology (Methodology & Inline Docs) — **NEW PLATFORM**

| Phase      | Deliverables                                                                                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sep 24     | `/methodology` "How this is counted" page over a code-first registry (`core/methodology/`: constants + 8 sections + 13 metric docs) read by both the page and every shared `app-info-popover`; shared `app-disclaimer-note`; PR-template anti-drift checklist |
| **Status** | **Structure shipped** — all 8 sections render the in-progress state naming their owning spec until those specs' code lands                                                                                                                                    |

### core (Utilities) — **EXTRACTED PATTERNS**

| Phase      | Deliverables                                                         |
| ---------- | -------------------------------------------------------------------- |
| Aug 2026   | `useBulkActions` composable, version reload prompt, commit hygiene   |
| **Status** | **Pattern library growing** — Reusable composables, error resilience |

---

## Architecture Evolution

### Before 2026 (Angular 18)

- ng-devui component library
- Apollo GraphQL client
- Client-side rendering (CSR)
- Module-based architecture (NgModules)

### After 2026 (Angular 22)

- **Tailwind v4** + **Headless UI** (hlm-* components)
- **Strawberry GraphQL** (via `graphqlResource()` / `GraphQLClient.request()`)
- **SSR** (Server-Side Rendering) via Angular Universal
- **Standalone components** (no NgModules)
- **Firebase Auth/Firestore/Storage** direct integration
- **Firebase Functions** for backend logic (AI, summarization)

### Key Technical Shifts

1. **UI Library**: ng-devui → ng-zorro-antd → Tailwind v4 + hlm (Headless UI)
2. **Data Fetching**: Apollo → TanStack Query-like `graphqlResource()` signals
3. **Rendering**: CSR → SSR (SEO, performance, social previews)
4. **Components**: NgModules → Standalone (tree-shakable, lazy-loadable)
5. **Backend**: Custom API → Firebase Functions (serverless, integrated auth)

---

## Commit Statistics (2026 YTD)

| Month     | Commits  | Major Focus                                                                     |
| --------- | -------- | ------------------------------------------------------------------------------- |
| Jan       | 0        | (no data in range)                                                              |
| Feb       | 0        | (no data in range)                                                              |
| Mar       | 1        | Verification component fix                                                      |
| Apr       | 0        | (no data in range)                                                              |
| May       | 0        | (no data in range)                                                              |
| Jun       | 0        | (no data in range)                                                              |
| Jul       | 0        | (no data in range)                                                              |
| Aug       | **41+**  | **3 feature platforms + polish**                                                |
| Sep       | **74**   | **home front page (landing + UX + shared-card rounds) + CI/deploy reliability** |
| **Total** | **116+** |                                                                                 |

> Note: Git history shows major activity in Aug 2026. Earlier 2026 commits may be in different branches or squashed.

---

## Key Commits Reference (2026)

### Angular 22 Rewrite & Migration

- `29d26cf` (2026-08-11): Replace old Angular 18 app with rewritten Angular 22 app at repo root
- `844ee9e` (2026-08-03): refactor: replace ng-devui with ng-zorro-antd (Stage 0 of Angular 19/20 upgrade)
- `3106525` (2026-08-04): fix: restore global font, nav badges, avatar/theme icons lost in ng-devui removal

### insiden Platform

- `20d7e31` (2026-08-21): feat(insiden): Add Firebase Functions structure and frontend insiden feature scaffold
- `36b4889` (2026-08-21): feat(insiden): Implement Gemini extraction function with Cheerio strategy
- `7cc48e7` (2026-08-22): feat(insiden): Add incident report form with nested chronology editor
- `eb17dc9` (2026-08-22): feat(insiden): Add vote button with net score, breakdown tooltip, optimistic updates
- `9b55adc` (2026-08-22): feat(insiden): Submit created drafts into the approval queue
- `64e28f2` (2026-08-22): feat(functions): Add summarizeIncident callable
- `2f742cd` (2026-08-22): feat(insiden): Add asset tagging and AI summarize to the report form
- `912d204` (2026-08-24): feat(insiden): Add searchable asset multi-select and form polish

### Console Platform

- `47d74b6` (2026-08-22): feat(console): Add incident approval queue page
- `d45b6f0` (2026-08-22): feat(console): Add social media links triage page
- `116a866` (2026-08-22): feat(console): Add section nav to all console pages
- `29b5d6d` (2026-08-22): fix(console): Enforce the admin claim on console routes

### Ads Platform

- `aa1d8c2` (2026-08-26): feat(ads): add shared app-ad-slot component and ADS_CONFIG
- `4ecb8cb` (2026-08-26): feat(ads): place manual AdSense units across standard pages
- `5c1c1b1` (2026-08-26): feat(ads): reveal slots only when filled and cap them to their reserved block
- `aa34d6f` (2026-08-26): test(ads): behavioral spec for app-ad-slot fill lifecycle and sizing
- `866cb37` (2026-08-26): chore(seo): add robots.txt excluding console and profile from crawling

### Profile & Spotting Polish

- `f779e7e` (2026-08-19): feat(profile): Add public view feature
- `873202f` (2026-08-24): refactor(profile): show privacy settings as a modal sourced from loaded preferences
- `bdac574` (2026-08-24): fix(profile): fetch historical spottings on own-profile load
- `85efe4b` (2026-08-24): fix(spotting): show skeletons while line data loads
- `6a33fdc` (2026-08-24): fix(spotting): fix sticky z-index overlap on line details
- `1e7aac9` (2026-08-19): fix(spotting): Add error catching on failed gql requests

### Navigation & Core

- `38bde66` (2026-08-24): feat(navigation): add thin top progress bar for slow route loads
- `4698bba` (2026-08-24): fix(app-nav): one-shot reveal animations, tracker console dropdown, nav z-index below overlays
- `fd5d274` (2026-08-24): fix(app-nav): polish avatar, update pill, console sub-menu and widen transition
- `839e64d` (2026-08-24): feat(version): prompt reload on stale lazy-chunk 404
- `0010f5d` (2026-08-24): feat(tracker): reduce perceived latency on /tracker navigation

### GDPR/About & Toast

- `ba95758` (2026-08-24): fix(gdpr, about): add Firestore error state with retry button
- `89a0f5f` (2026-08-22): feat(toast): Add pin/dismiss hover controls to notifications
- `e8a6c72` (2026-08-18): fix(ui): Toast not adhering to theme

---

## 2026 Technology Stack Summary

| Layer          | Technology                                 | Version/Notes               |
| -------------- | ------------------------------------------ | --------------------------- |
| Framework      | Angular                                    | 22 (SSR)                    |
| Styling        | Tailwind CSS                               | v4                          |
| UI Components  | Headless UI (hlm-*)                        | Radix-based                 |
| GraphQL        | Strawberry (backend) + `graphqlResource()` | Signal-based                |
| Auth           | Firebase Auth                              | Custom claims for admin     |
| Database       | Firestore                                  | Real-time listeners         |
| Storage        | Firebase Storage                           | Image uploads               |
| Functions      | Firebase Functions                         | Node.js, Gemini AI, Cheerio |
| Hosting        | Firebase App Hosting                       | SSR support                 |
| Analytics      | Google Analytics                           | App version tracking        |
| Error Tracking | Sentry                                     | Source maps, replay         |
| Testing        | Vitest + Playwright                        | Unit + E2E                  |
| Linting        | Prettier                                   | Single lint gate            |
| CI/CD          | GitHub Actions                             | Build, test, deploy         |

---

## Outlook: Q4 2026 & Beyond

### Planned / In Progress

- [ ] **Angular 22 stabilization**: Post-rewrite bug fixes, performance tuning
- [ ] **insiden v2**: AI summary quality, extraction accuracy, bulk operations
- [ ] **Console v2**: Bulk approval actions, audit logging, role-based access
- [ ] **Ads v2**: A/B testing, revenue analytics, consent management (GDPR)
- [ ] **Tracker v2**: Offline support, multi-source failover, historical replay
- [ ] **Profile v2**: Data export (GDPR), advanced analytics, social features
- [ ] **Core**: Design system documentation, component library extraction

### Technical Debt

- [ ] Complete ng-zorro-antd → Tailwind migration (remaining components)
- [ ] Standardize error handling patterns across features
- [ ] Extract shared GraphQL fragments
- [ ] Improve test coverage (target: 80%+)
- [ ] Document component APIs (Storybook or similar)

---

## Appendix: Module Map

```
src/app/
├── features/
│   ├── home/             # Community front page (NEW 2026, landing route)
│   ├── methodology/      # "How this is counted" + registry (NEW 2026)
│   ├── insiden/          # Incident reporting platform (NEW 2026)
│   ├── console/          # Admin dashboard (EXPANDED 2026)
│   ├── tracker/          # GTFS real-time tracking (MATURE)
│   ├── profile/          # User profiles (ENHANCED 2026)
│   ├── spotting/         # Train spotting (CORE)
│   ├── gallery/          # Image gallery
│   ├── about/            # About page + compliance
│   ├── gdpr/             # GDPR compliance
│   ├── ads/              # AdSense integration (NEW 2026)
│   └── not-found/        # 404 page
├── core/
│   ├── navigation/       # App nav, progress bar, animations
│   ├── auth/             # Firebase auth integration
│   ├── utils/            # useBulkActions, helpers
│   └── version/          # Stale chunk detection
├── shared/
│   ├── components/       # app-ad-slot, toast, skeletons, buttons
│   ├── ui/               # hlm-* wrappers, form controls
│   └── services/         # GraphQL, Firestore, Storage
└── shell/                # Layout, header, footer, theme
```

---

_Generated from git history analysis on 2026-08-27_
