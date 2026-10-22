# Time zone and date correctness

Part of the [rosak_firebase audit, 2026-10-21](../2026-10-21.md). 17 findings, most severe first.

Day buckets, defaults and labels mix UTC, viewer and server zones against naive Kuala Lumpur timestamps. One shared MYT module with a TZ test matrix would end the whole class.

<a id="f007"></a>

#### F007 · Fix day headers in the links list: they are a full day early in every Malaysian browser

**high** · effort S · code-quality · gap-4

**Status, fix pass 2026-10-21:** Fixed (`e8a89df`, `11fc8d6`, `6a2ed7b`, `159da4a`). Day keys take the date of naive Kuala Lumpur wall times as-is, shift offset strings by +8 h, and headers render without a second zone shift. Today and Yesterday come from `klDateKey()`. The specs run in both UTC and Asia/Kuala_Lumpur.

**Where:** `src/app/features/insiden/data/link-day-group.util.ts:34-41`, `src/app/features/insiden/link-list/link-list.component.ts:38`, `src/app/features/insiden/link-list/link-list.component.ts:132`, `src/app/features/insiden/data/link-day-group.util.ts:77`

**Problem.** The backend sends naive Asia/Kuala_Lumpur wall time (for example 2026-09-28T15:46:46). linkDateKey parses it with new Date(), which reads it in the viewer's zone, and then formats it with the UTC getters. In a UTC+8 browser, anything between 00:00 and 07:59 MYT therefore lands on the previous day. The header template then passes the date-only key to DatePipe with timezone UTC. Angular parses a date-only string as local midnight, and the UTC formatter shifts it back another 8 hours, so every header is one day early. On the UTC server (SSR, for example the situasi tab on spotting line pages) the result is correct, so the page renders right and then flips to wrong labels on hydration. The comments and docs justify the UTC frame as hydration-safe, but for naive strings it causes the divergence. The 'Today' and 'Yesterday' labels are also derived from the UTC clock, so they are wrong between 00:00 and 08:00 MYT.

**Recommendation.** Treat the backend string as a wall-clock string and never run it through UTC getters. Use `instant.slice(0, 10)` as the day key when the string has no offset (the shape the backend always sends for occurredAt and created). Render the header from the key without a second zone conversion, for example `formatDate(new Date(`${key}T00:00:00Z`), 'MMMM d, y', 'en-US', 'UTC')`, or format it with Intl.DateTimeFormat using timeZone 'UTC' on a UTC-midnight Date. Compute todayKey from the Asia/Kuala_Lumpur clock (see the central helper finding). Update the docs/components/insiden.md claim that UTC grouping keeps SSR and browser in agreement.

**Verification.** link-day-group.util.ts parses naive MYT strings with new Date() then uses UTC getters, and link-list.component.ts renders the date-only key with DatePipe zone "UTC". Angular parses a date-only string as local midnight, so every header shifts back a day in a UTC+8 browser. The docs (insiden.md, link-occurred-at MISTAKES entry) confirm the wire format is naive MYT. The 'Today'/'Yesterday' labels also use UTC now.

**Second check (high-severity pass).** code review: holds (high). I reproduced it with the real Angular formatDate under TZ=Asia/Kuala_Lumpur. linkDateKey('2026-09-28T15:46:46') returns '2026-09-28'. The template's `date: "MMMM d, y" : "UTC"` then prints 'September 27, 2026'. For '2026-09-24T07:56:00' the key is '2026-09-23' and the header is 'September 22, 2026' (two days early). With TZ=UTC the same inputs print the correct September 28 and September 24. The cause is that a date-only string is parsed by Angular as local midnight, and the UTC formatter then shifts it back 8 hours. These outputs match the Playwright evidence. In link-list.component.ts, line 38 uses the pipe with 'UTC' and line 132 builds todayKey from the UTC clock. SSR runs on a UTC server and renders correctly, so the flip happens after hydration in a Malaysian browser. Slight overstatement: the 'Today' and 'Yesterday' headers use the label branch and skip DatePipe, so only older day headers are shifted by the pipe. Those two labels are wrong only through the key bucketing and the UTC todayKey, in the 00:00 to 08:00 MYT window. The audience is Malaysian, so older headers are wrong for nearly every viewer. impact review: holds (high). linkDateKey runs new Date() on a naive MYT string and formats with UTC getters. The template then passes the date-only key to DatePipe with timezone UTC, and Angular parses a date-only string as local midnight, so a UTC+8 browser shifts it back a day. The finding includes Playwright evidence of September 27 over a Sep 28 card, and the correct output in UTC, which explains the hydration flip. Every Malaysian viewer sees wrong day headers on the links list, which is wrong data on a core view. Today and Yesterday are also wrong between 00:00 and 08:00 MYT.

**Fix note from the second check.** Smaller fix: (1) in the template, drop `: "UTC"` so a date-only key is both parsed and formatted in the same local zone, which is also hydration-safe and needs no new formatter. (2) In linkDateKey, if the string has no offset (no Z or +hh:mm), return `instantIso.slice(0,10)` and skip the Date parse. (3) Build todayKey with `new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur'}).format(new Date())`. Update the util doc comment and docs/components/insiden.md, and add a spec that runs under a non-UTC TZ. For strings with no offset, use instant.slice(0,10) as the key. Render the header with new Date(`${key}T00:00:00Z`) through the date pipe with timezone UTC. Compute todayKey from Asia/Kuala_Lumpur, for example Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur'}).format(new Date()). Update the docs claim.

**Also reported as:** [F115](time-zone-and-date-correctness.md#f007) [insiden-ui] Link day grouping buckets naive Malaysian times by UTC, so day headers disagree with the cards and between SSR and the browser (src/app/features/insiden/data/link-day-group.util.ts:133-140, src/app/features/insiden/link-list/link-list.component.ts:131-133)

<details><summary>Evidence</summary>

```text
linkDateKey: `const date = new Date(instantIso); ... return `${date.getUTCFullYear()}-...${date.getUTCDate()}`` fed with naive MYT strings; template: `{{ group.key | date: "MMMM d, y" : "UTC" }}`. Playwright with timezoneId=Asia/Kuala_Lumpur on /insiden Links tab printed `## September 27, 2026` above cards stamped `Sep 28, 2026 15:46`, and `## September 22, 2026` above `Sep 24, 2026 07:56`. The same page with timezoneId=UTC printed `## September 28, 2026` over the same cards.
```

</details>

<a id="f010"></a>

#### F010 · Compute 'today' and day buckets in Asia/Kuala_Lumpur instead of UTC

**high** · effort S · ux · insiden-data

**Status, fix pass 2026-10-21:** Fixed (`e8a89df`). A new `core/time` `klDateKey()` (fixed +8 h) sets the default day on /insiden, the calendar's today ring and the Today button.

**Where:** `src/app/features/insiden/data/calendar-date.util.ts:13`, `src/app/features/insiden/insiden.page.ts:87`, `src/app/features/insiden/calendar/calendar.component.ts:264`, `src/app/features/insiden/calendar/calendar.component.ts:354`, `src/app/features/insiden/data/link-day-group.util.ts:34`, `src/app/features/insiden/link-list/link-list.component.ts:131`

**Problem.** dateKeyOf(new Date()) returns the UTC date. Between 00:00 and 07:59 Malaysia time, which includes the first trains and the early commute, /insiden opens on yesterday, the calendar highlights yesterday as 'today', and the Today button navigates to yesterday. The incident filter itself compares against naive Kuala Lumpur wall dates (incidentCoversDate slices startDatetime), so the two frames disagree for eight hours every day. linkDateKey has the same UTC frame but is applied to naive Kuala Lumpur strings: I verified that new Date('2026-10-21T03:00:00') yields the key 2026-10-21 on a UTC server and 2026-10-20 in a Kuala Lumpur browser, so link day headers differ between SSR and the browser for those hours and flip after hydration. The comment justifies UTC as hydration-safe, but a fixed zone is equally hydration-safe.

**Recommendation.** Add one helper, for example `klDateKey(now = Date.now())`, that shifts by the fixed +8 hour offset (Malaysia has no DST) and then reads UTC getters: `new Date(now + 8*3600_000).toISOString().slice(0,10)`. Or hold a single module-level `new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' })` instance (never construct one per call). Use it for selectedDate, the calendar's todayKey and goToday. For links, bucket naive strings by `iso.slice(0,10)` and compare against klDateKey. Add specs that freeze time at 2026-10-20T19:30:00Z and expect 2026-10-21.

**Verification.** dateKeyOf uses UTC getters and is used for selectedDate, the calendar todayKey and goToday, while incidentCoversDate compares naive KL date strings. From 00:00 to 08:00 MYT, which includes the morning peak, the default day is yesterday. linkDateKey is also UTC, deliberately kept for hydration safety, but a fixed +8 offset is equally hydration-safe.

**Second check (high-severity pass).** code review: holds (medium). dateKeyOf in calendar-date.util.ts reads getUTCFullYear/Month/Date, and insiden.page.ts:87, calendar.component.ts:264 and :355 all call dateKeyOf(new Date()), so 'today' is the UTC date. Backend settings have TIME_ZONE=Asia/Kuala_Lumpur and USE_TZ=False, so incident and link datetimes are naive KL strings, and incidentCoversDate slices those strings directly, so the frames really do disagree. I reproduced the link part: new Date('2026-10-21T03:00:00').getUTCDate() is 20 under TZ=Asia/Kuala_Lumpur and 21 under TZ=UTC, so SSR and browser bucket the same link differently. Impact is limited to 00:00-08:00 MYT (low traffic hours) and only date defaults and headers, not data loss, so medium rather than high. impact review: holds (high). dateKeyOf reads UTC getters, and insiden.page.ts computes selectedDate as dateParam() ?? dateKeyOf(new Date()). Between 00:00 and 08:00 Malaysia time every day, /insiden therefore opens on yesterday, which is exactly when early commuters check disruptions. incidentCoversDate slices naive startDatetime strings, so the filter uses Kuala Lumpur wall dates and the two frames disagree. The linkDateKey comment justifies UTC as hydration-safe, but a fixed +8 offset is equally deterministic on server and browser. Only the /insiden page is affected, so this could arguably be medium, but wrong default data every morning earns high.

**Fix note from the second check.** Keep the fix small: one helper klDateKey(now = Date.now()) returning new Date(now + 8*3600_000).toISOString().slice(0,10), used for selectedDate, calendar todayKey/goToday and link-list todayKey. Make linkDateKey return iso.slice(0,10) for naive KL strings. Leave calendarMonthRange alone, since it only does UTC arithmetic on date-only values. Add one klDateKey(now = Date.now()) helper that returns new Date(now + 8*3600_000).toISOString().slice(0,10) and use it for selectedDate, the calendar's todayKey and goToday, and the link 'today' comparison. For link day headers, bucket by iso.slice(0,10) only if the strings are naive Kuala Lumpur times. Offset-bearing ISO instants should be shifted by +8h instead. Check the actual format of the link created/occurredAt fields before choosing, and add a frozen-time spec.

**Also reported as:** [F024](time-zone-and-date-correctness.md#f010) [ux-insiden-gallery] Compute "today" in Asia/Kuala_Lumpur, not UTC, so the 00:00-08:00 MYT default day is not yesterday (src/app/features/insiden/insiden.page.ts:87, src/app/features/insiden/calendar/calendar.component.ts:264); [F088](time-zone-and-date-correctness.md#f010) [gap-4] Make the Insiden calendar's default 'today', Today button and today ring follow Kuala Lumpur, not UTC (src/app/features/insiden/insiden.page.ts:87, src/app/features/insiden/calendar/calendar.component.ts:264); [F114](time-zone-and-date-correctness.md#f010) [insiden-ui] 'Today' on the calendar is computed in UTC, so it is yesterday between 00:00 and 08:00 Malaysia time (src/app/features/insiden/data/calendar-date.util.ts:13-18, src/app/features/insiden/insiden.page.ts:87)

<details><summary>Evidence</summary>

```text
export function dateKeyOf(date: Date): string {
  const y = date.getUTCFullYear(); const m = String(date.getUTCMonth() + 1)...; const d = String(date.getUTCDate())...
}
protected readonly selectedDate = computed(() => this.dateParam() ?? dateKeyOf(new Date()));
// node: new Date('2026-10-21T03:00:00+08:00') -> dateKeyOf = 2026-10-20
```

</details>

<a id="f081"></a>

#### F081 · Spotting date defaults to the UTC calendar day, so from midnight to 08:00 Malaysia time it is yesterday (and future dates are allowed)

**medium** · effort S · ux · gap-2

**Where:** `src/app/features/spotting/report-form/report-form.schema.ts:29`, `src/app/features/spotting/report-form/report-form.component.html:84`

**Problem.** toISOString() is UTC, and Kuala Lumpur is UTC+8, so between 00:00 and 08:00 MYT the pre-filled date is the previous day. Rail service starts around 06:00, so early-morning spotters (a core user) get a wrong default that they must notice and fix; many will not, and the spotting lands on the wrong day in stats and the heatmap. The date input also has no max, so a future date can be submitted. The rest of the app already uses Asia/Kuala_Lumpur formatters.

**Recommendation.** Use `new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date())` (yields YYYY-MM-DD) in emptyReportFormModel, set `max` to the same value on the input, and add a schema rule rejecting future dates. Add a spec with a faked clock at 2026-10-20T17:00:00Z expecting 2026-10-21.

**Verification.** report-form.schema.ts uses new Date().toISOString().slice(0,10), which is UTC, and the date input in the html has no max. Between 00:00 and 08:00 MYT the default is yesterday, which covers the early-morning rail start.

**Also reported as:** [F089](time-zone-and-date-correctness.md#f081) [gap-4] Default the spotting report date to the Malaysian day and stop future dates (src/app/features/spotting/report-form/report-form.schema.ts:29, src/app/features/spotting/report-form/report-form.component.html:84); [F137](time-zone-and-date-correctness.md#f081) [spotting] Early-morning reports get yesterday's date by default: 'today' is computed in UTC, not Malaysian time (src/app/features/spotting/report-form/report-form.schema.ts:29, src/app/features/spotting/report-form/report-form.component.html:84); [F144](time-zone-and-date-correctness.md#f081) [test-gaps] Report form defaults the spotting date to the UTC calendar day, which is yesterday in Malaysia before 08:00 (src/app/features/spotting/report-form/report-form.schema.ts:29, rosak_backend/incident/schema/resolvers.py:320)

<details><summary>Evidence</summary>

```text
spottingDate: new Date().toISOString().slice(0, 10),
...
<input hlmInput type="date" [formField]="reportForm.spottingDate" aria-label="Date" />
```

</details>

<a id="f090"></a>

#### F090 · Stop humanizeSince from treating naive Malaysian time as UTC on the server (and as the viewer's zone elsewhere)

**medium** · effort S · ssr-hydration · gap-4 · partially confirmed · severity adjusted from high

**Note, quality pass 2026-10-22:** pinned by three `it.fails` cases in `src/app/features/spotting/data/humanize-since.util.spec.ts`; still open.

**Where:** `src/app/features/spotting/data/humanize-since.util.ts:10-16`, `src/app/features/insiden/link-card/link-card.component.ts:405`, `src/app/features/home/pro/pro-official-widget.ts:135`, `src/app/features/spotting/vehicle-detail/vehicle-status-board/vehicle-status-board.component.ts:27`

**Problem.** occurredAt and created are naive MYT strings, parsed in the host's zone. On the production SSR server (container TZ is not set in apphosting.yaml, so presumably UTC) a link up to 8 hours old yields a negative elapsed time and renders 'less than a minute ago'. Home is SSR-rendered with a 20 s s-maxage cache and the feed is in the transfer state, so the first paint and the cached HTML show wrong text until hydration rewrites it. Viewers outside UTC+8 keep an 8-hour error. For date-only fields (lastSpottingDate, inServiceSince) the helper parses UTC midnight and invents a precise '4 hours ago' that means nothing for a date. I did not see a live SSR render with a fresh link (local data is from 1 Oct), so the SSR symptom is from simulation plus the code path. The label is also a one-shot computed that never ticks.

**Recommendation.** Parse naive strings as +08:00 in a shared helper. Day granularity for date-only inputs is fine. A live tick is optional polish; do not bundle it.

_Original suggestion (corrected by the verifier):_ Introduce `parseBackendDateTime(s)` that returns a Date for the correct instant: if the string has no offset, append '+08:00' (V8 truncates 6-digit fractions); if it has one, trust it. Use it in humanizeSince and compute 'now' as a real instant. For a date-only string, stop at day granularity ('today', 'yesterday', '3 days ago') instead of hours. Render the relative text inside `<time [attr.datetime]>` and optionally refresh it from the existing poll beat or a one-minute tick started in afterNextRender.

**Verification.** humanizeSince does new Date(naive) and subtracts it from the real clock, and its callers include link-card and pro-official-widget. On a UTC SSR host a naive MYT time up to 8 hours old is in the future and renders 'less than a minute ago'; the browser corrects it after hydration. The effect is a transient text flash plus a persistent error for non-UTC+8 viewers, so high is overstated. I did not run SSR to see the output.

<details><summary>Evidence</summary>

```text
`const past = new Date(iso); const now = new Date(); const elapsedMs = now.getTime() - past.getTime(); if (!Number.isFinite(elapsedMs) || elapsedMs < 60_000) return "less than a minute ago"`. Node simulation with now = 12:24 MYT: TZ=Asia/Kuala_Lumpur gives `2026-10-21T09:00:00 -> 3 hours ago`; TZ=UTC gives `less than a minute ago` for 11:00, 09:00 and 04:30 alike. A date-only value `2026-10-21` gives `4 hours ago` in both.
```

</details>

<a id="f107"></a>

#### F107 · Send incident times as Kuala Lumpur wall time, as the link form already does, instead of browser-zone UTC instants

**medium** · effort S · reliability · insiden-data

**Where:** `src/app/features/insiden/incident-form/incident-form.component.ts:591`, `src/app/features/insiden/incident-form/incident-form.component.ts:639`, `src/app/features/insiden/incident-form/extract-data.util.ts:9`, `src/app/features/insiden/data/link-occurred-at.util.ts:69`

**Problem.** The read path treats the backend's naive Kuala Lumpur strings as wall time (local getters, passthrough), but the write path interprets the datetime-local value in the browser's zone and converts it to a UTC instant; the backend then converts that to Kuala Lumpur. The round trip is only correct when the browser is on UTC+8. For anyone with a different device zone (travelling, VPN-less tourists, a wrongly configured phone) opening an incident for edit shows the right time but saving shifts start, end and every chronology time by the zone difference, silently. The link form avoids this with occurredAtInputToIso, and MISTAKES.md documents the principle, so the two forms are inconsistent. isoToDateTimeLocal in extract-data.util.ts is also a byte-for-byte duplicate of isoToOccurredAtInput.

**Recommendation.** Reuse occurredAtInputToIso for startDatetime, endDatetime and chronology datetimes so the typed wall time is sent verbatim (naive, no Z), and delete the duplicate isoToDateTimeLocal in favour of isoToOccurredAtInput. Add a spec run with a non-+8 TZ environment variable that edits an incident without touching the times and asserts the payload equals the hydrated values.

**Verification.** The incident form sends new Date(datetime-local).toISOString() while hydration reads backend naive strings with local getters. The backend has USE_TZ=False with TIME_ZONE=Asia/Kuala_Lumpur, and MISTAKES documents that a naive wall time must not round-trip through toISOString. The round trip is only correct in a UTC+8 browser, which is most of the audience, so impact is contained.

<details><summary>Evidence</summary>

```text
startDatetime: new Date(m.startDatetime).toISOString(),
endDatetime: m.endDatetime ? new Date(m.endDatetime).toISOString() : null,
// hydrate: isoToDateTimeLocal() reads the naive backend string back with LOCAL getters
```

</details>

<a id="f133"></a>

#### F133 · Day labels in SSR and in a long-lived tab use the server clock and a frozen now

**medium** · effort S · reliability · seo-pwa-i18n · partially confirmed

**Where:** `src/app/features/home/data/home.store.ts:812-813`, `src/app/features/home/data/feed-day-groups.util.ts:56`

**Problem.** The day grouping uses the runtime's local clock. On the server that is UTC unless the container sets a TZ, and nothing in this repo sets one. Between 00:00 and 08:00 Malaysia time, the server-rendered Last Week headers therefore label today's links as "Yesterday". Hydration then has to correct the text on the client. The computed also captures `now` at the moment it last ran, so a tab left open past midnight keeps the old "Today" label until the next data change. The utility's own comment says the caller supplies `now` for SSR, but the store never does.

**Recommendation.** Derive both the link's day key and the reference day key in Asia/Kuala_Lumpur (for example via Intl.DateTimeFormat with timeZone and the en-CA locale), format the label in MYT too, and drive now from a clock signal refreshed on the existing poll beat. Add a spec that pins the instant at 01:00 MYT on a day boundary.

_Original suggestion (corrected by the verifier):_ Pass an explicit clock. Read a signal such as now = signal(new Date()) that the store refreshes on its existing poll beat, and compute the reference day in Asia/Kuala_Lumpur with Intl.DateTimeFormat (timeZone: "Asia/Kuala_Lumpur"), the same way status-history-display.util.ts does. Add a spec that pins now at 01:00 MYT on a day boundary to prove the label. This is a shortcut only if you accept UTC on the server, so the fix should not depend on the container TZ.

**Verification.** home.store.ts:812-813 does call groupFeedLinksByDay with no explicit now, and feed-day-groups.util.ts:21-36 computes calendar days with local getFullYear/getMonth/getDate on both the link date and now. The stale-midnight claim is correct because the computed does not read a clock signal. The fix is incomplete, though, because it changes only the reference day and not the link's own calendar day, and the formatDate label is also local-time.

<details><summary>Evidence</summary>

```text
home.store.ts:812-813 → readonly lastWeekDayGroups = computed<FeedDayGroup[]>(() =>
    groupFeedLinksByDay(this.lastWeekLinks()),
feed-day-groups.util.ts:56 → export function groupFeedLinksByDay(links: FeedLink[], now: Date = new Date()): FeedDayGroup[] {
```

</details>

<a id="f227"></a>

#### F227 · Home 'Today' (03:00 service day) and 'Last Week' (midnight cut) windows leave a gap: links from 00:00 to 03:00 vanish from the page

**medium** · effort M · data-fetching · gap-4

**Where:** `src/app/features/home/data/home.store.ts:216-231`, `src/app/features/home/data/home-feed.queries.ts:331-338`, `src/app/features/home/home.page.ts:568-575`, `/home/kwongtn/rosak/rosak_backend/incident/schema/resolvers.py:825-860`

**Problem.** Today shows [03:00 today, now]. Last Week shows [00:00 six days ago, 00:00 today). A link whose occurredAt is, say, 01:30 today is in neither window from 03:00 until midnight, then reappears as 'Yesterday'. Between 00:00 and 03:00 the opposite happens: yesterday's 03:00-24:00 links appear in both sections (the page works around the duplicate DOM id but the reader still sees the same conversation twice). Late-night disruption reports (engineering hours, last-train incidents) are exactly what falls into the hole. The backend docstring says the midnight cut was chosen so the first three hours of the morning are not hidden, but the Today section hides them.

**Recommendation.** Make the two windows meet. Cleanest is backend-side: add a `currentCalendarDayOnly` window (midnight to now) or let the Today section start at min(service day start, calendar midnight) and have Last Week end at that same boundary, with the same boundary variable used by both so they cannot overlap or gap. If that cannot ship soon, send displayTodayInLastWeek on the Last Week query and dedupe by id across the two sections in HomeStore. Add a backend test with a link at 01:30 and now = 10:00 asserting it is in exactly one section.

**Verification.** service_day_start returns today 03:00 once now >= 03:00, so Today covers [03:00, now]. Last Week is closed at calendar midnight via _event_window_before in resolvers.py, and the frontend does not send displayTodayInLastWeek. A link at 01:30 today is in neither section until it becomes 'Yesterday'. home.md only documents the 00:00-03:00 overlap, not this gap.

<details><summary>Evidence</summary>

```text
Backend: `if current_service_day_only: queryset.filter(_event_window(service_day_start(now)...))` and, for last week, `_event_window_before(datetime.combine(now.date(), time.min) ...)` unless display_today_in_last_week. service_day_start returns today 03:00 once now >= 03:00. The frontend sends lastWeekOnly: true without displayTodayInLastWeek and documents only the 'overlap between 00:00 and 03:00'.
```

</details>

<a id="f357"></a>

#### F357 · Send incident and console datetimes with an explicit +08:00 (or naive) instead of toISOString() on viewer-zone input

**low** · effort S · data-fetching · gap-4 · partially confirmed

**Where:** `src/app/features/insiden/incident-form/incident-form.component.ts:591-592`, `src/app/features/insiden/incident-form/incident-form.component.ts:605`, `src/app/features/insiden/incident-form/incident-form.component.ts:639-640`, `src/app/features/console/insiden/pending/pending-incident.util.ts:117-118`, `src/app/features/console/insiden/data/date-range.util.ts:30-34`, `src/app/features/console/insiden/data/date-range.util.ts:42-46`, `src/app/features/insiden/incident-form/extract-data.util.ts:11-18`

**Problem.** The incident form, the console pending editor and the console date-range filter convert a typed wall time to UTC using the browser's zone. The backend (USE_TZ=False, Asia/Kuala_Lumpur) interprets an aware value by shifting it into MYT, so the result is correct only when the browser zone is UTC+8. An editor or admin using a laptop set to another zone (travel, VPN, a UTC dev machine) silently stores times shifted by the offset, and the date-range filter uses the viewer's midnight instead of the Malaysian day. The same product therefore has two opposite conventions (link form: naive pass-through; incident form: instant). The read side already passes naive strings through unchanged, so a round trip of an edit is only stable in a UTC+8 browser.

**Recommendation.** Fix the incident form and pending-incident util to send the typed wall time naive or with +08:00. Leave date-range.util as is unless you decide the filter must mean a Malaysian day.

_Original suggestion (corrected by the verifier):_ Pick the link form's rule for everything: send `${value}:00` (no offset) or `${value}:00+08:00` and read back with the same pass-through. In date-range.util append '+08:00' (`new Date(`${value}T00:00:00+08:00`)`) so the filter means a Malaysian day for every viewer. Cover with specs that run under TZ=UTC and TZ=Asia/Kuala_Lumpur.

**Verification.** incident-form.component.ts (new Date(local string).toISOString()) is wrong only when the editor's browser is not UTC+8. The console date-range.util.ts deliberately uses the viewer's local day and has a documented rationale, so changing it is a policy choice rather than a bug. Editors and admins are Malaysian, so this is low.

<details><summary>Evidence</summary>

```text
`startDatetime: new Date(m.startDatetime).toISOString(),` where m.startDatetime is a datetime-local string; `const date = new Date(`${value}T00:00:00`); return date.toISOString();`. The link form instead sends the typed wall time verbatim (`occurredAtInputToIso`).
```

</details>

<a id="f358"></a>

#### F358 · Compare backend wall time to the MYT clock when computing elapsed times and day offsets

**low** · effort S · code-quality · gap-4 · partially confirmed

**Where:** `src/app/features/insiden/incident-card/incident-card.component.ts:332-336`, `src/app/features/insiden/data/elapsed-time.util.ts:5-6`, `src/app/features/profile/my-spottings/my-spottings.component.ts:322`, `src/app/features/home/data/feed-day-groups.util.ts:21-35`, `src/app/features/home/data/feed-day-groups.util.ts:56-60`

**Problem.** These subtract a naive MYT wall time (parsed in the viewer's zone) from the real clock. For a viewer in UTC+8 the result is right; for anyone else it is off by the zone difference, and Math.abs hides the sign, so a UTC viewer sees a 10-minute-old ongoing incident as 'Ongoing for 7 hours, 50 minutes'. The delete-window check in My Spottings shows the delete button for up to 8 extra hours for a UTC viewer, and groupFeedLinksByDay labels 'Today' / 'Yesterday' by the viewer's own date rather than the Malaysian one.

**Recommendation.** Parse with the shared parseBackendDateTime (naive -> +08:00) and compute 'today' for day labels with the MYT day key. Drop Math.abs in the live counter (clamp to 0 instead) so a clock-skew negative cannot show as a large positive.

**Verification.** incident-card.component.ts builds a Date from a naive string and subtracts it from now, and Math.abs in elapsed-time.util.ts hides the sign. my-spottings._canDelete and feed-day-groups behave the same way. All of these are correct for UTC+8 viewers and wrong only for others, who are not the audience, so this is polish.

<details><summary>Evidence</summary>

```text
`const start = new Date(this.incident().startDatetime); const tick = () => this.elapsedTime.set(getReadableTimeDifference(start, new Date()));` and `const timeDiff = Math.abs(date1.getTime() - date2.getTime());`; `return Date.now() - new Date(event.created).getTime() <= DELETE_WINDOW_MS;`
```

</details>

<a id="f359"></a>

#### F359 · Group gallery photos by the year in the date string, not by new Date(dateString).getFullYear()

**low** · effort S · code-quality · gap-4

**Where:** `src/app/features/gallery/gallery.page.ts:116`

**Problem.** A date-only ISO string is parsed as UTC midnight but getFullYear reads the viewer's zone, so on 1 January a viewer west of UTC sees the photo in the previous year's group, and SSR (UTC) and that browser disagree. It is harmless for Malaysian viewers (positive offset) but is a hydration mismatch and wrong grouping for any other zone, and it breaks the year slider's jump target.

**Recommendation.** Use `Number(edge.node.createdDate.slice(0, 4))`, or the shared day-key helper.

**Verification.** gallery.page.ts:116 does new Date(createdDate).getFullYear() on date-only strings, which parse as UTC and are read in local time. West-of-UTC viewers get the wrong year on 1 January, but Malaysian viewers are unaffected.

**Also reported as:** [F452](time-zone-and-date-correctness.md#f359) [tracker-gallery] Group photos by their calendar date string instead of local-time Date parsing (src/app/features/gallery/gallery.page.ts:116, src/app/features/gallery/media-viewer/media-viewer.component.ts:64)

<details><summary>Evidence</summary>

```text
`const year = new Date(edge.node.createdDate).getFullYear();` with createdDate values like `2024-05-03` (API sample).
```

</details>

<a id="f360"></a>

#### F360 · State and test the server time-zone assumption: apphosting.yaml sets no TZ and the code relies on one in three different ways

**low** · effort S · dx-tooling · gap-4 · partially confirmed · severity adjusted from medium

**Where:** `apphosting.yaml:12-40`, `src/server.ts:1-160`, `src/server-cache-control.ts`

**Problem.** Hydration-sensitive behavior (footer timestamps, humanizeSince on naive strings, local-getter helpers in feed-day-groups, incident-link-line and link-occurred-at) depends on the server's zone, but nothing in config or docs pins it. A local SSR run in MYT hides every issue in this audit, which is why they were not seen during development. I could not confirm the production container zone; Cloud Run defaults to UTC.

**Recommendation.** Prefer the explicit +08:00 parsing helper. Treat a TZ env var as an optional safety net and document the server-zone assumption.

_Original suggestion (corrected by the verifier):_ Short term, add `- variable: TZ`, `value: Asia/Kuala_Lumpur`, `availability: [RUNTIME]` to apphosting.yaml and apphosting.staging.yaml so SSR parses naive wall time the same way a Malaysian browser does (verify the variable is accepted by App Hosting; if not, set it at the top of src/server.ts before any Date use: `process.env.TZ ??= 'Asia/Kuala_Lumpur'`). Treat it as a safety net only; the real fix is the explicit-zone helper. For local checks run `TZ=UTC node dist/web/server/server.mjs` and diff `/` and `/insiden` HTML against a MYT browser.

**Verification.** apphosting.yaml and src/server.ts have no TZ setting, so the SSR zone is an unstated assumption. Setting TZ=Asia/Kuala_Lumpur does make naive parsing consistent for Malaysian viewers. It only masks the bugs, and it makes the 'UTC on the server' comments in the code wrong. I did not confirm App Hosting accepts TZ. Fixing the code is the primary route.

<details><summary>Evidence</summary>

```text
`grep -in 'TZ\|timezone' apphosting.yaml src/server.ts` returns nothing. The only runtime values are BACKEND_URL, BACKEND_GRAPHQL_URL and build-time tokens; the maintainer's local box (where the supplied :4321 build runs) is UTC+8 while the code comments assume a UTC container.
```

</details>

<a id="f377"></a>

#### F377 · Last Week day labels and 'Today'/'Yesterday' use the viewer's own clock and time zone against naive Kuala Lumpur timestamps

**low** · effort S · code-quality · home-ui · partially confirmed

**Where:** `src/app/features/home/data/feed-day-groups.util.ts:15`, `src/app/features/home/data/feed-day-groups.util.ts:21`, `src/app/features/home/data/feed-day-groups.util.ts:56`, `src/app/features/home/data/feed-day-groups.util.ts:60`

**Problem.** The backend sends wall-clock Asia/Kuala_Lumpur strings with no offset. new Date() parses them as the viewer's local time, and `now` is the viewer's clock, so the day buckets are only right when the browser's zone is Malaysia. A reader abroad, on a laptop set to UTC, or a server render in UTC sees 'Today' and 'Yesterday' shifted by up to a day for several hours (UTC 16:00 to 24:00 is already tomorrow in KL). The Last Week section is client-only today so SSR is not affected, but the rule is only a comment away from breaking when it is rendered on the server.

**Recommendation.** Compute 'today' in Asia/Kuala_Lumpur and compare day keys as strings; no need to rework the grouping.

_Original suggestion (corrected by the verifier):_ Compute the reference day in the service zone: `const todayKl = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(now)` and compare to the date part of the naive string (`link.occurredAt.slice(0, 10)`) instead of building Date objects from it; derive the weekday label with `Date.UTC(y, m-1, d)` formatted in UTC. Add a spec that runs with `TZ=UTC` fixtures.

**Verification.** feed-day-groups.util compares viewer-local `now` against naive KL strings, so Today/Yesterday labels are wrong outside the Malaysia zone. But the grouping itself uses the date's own local fields, so bucket boundaries are correct; only the relative labels are affected, and Last Week is client-only.

<details><summary>Evidence</summary>

```text
feed-day-groups.util.ts:60  const date = new Date(link.occurredAt ?? link.created);
API sample: "created": "2026-09-28T15:46:51.905112", "occurredAt": "2026-09-28T15:46:46"  (no offset)
feed-day-groups.util.ts:56  groupFeedLinksByDay(links: FeedLink[], now: Date = new Date())
```

</details>

<a id="f436"></a>

#### F436 · 'Today' in grid, heatmap and vehicle page also uses UTC, and the grid freezes it at module load

**low** · effort S · ssr-hydration · spotting · partially confirmed · severity adjusted from medium

**Note, quality pass 2026-10-22:** pinned by `it.fails` cases in `src/app/domain-ui/spotting-activity-heatmap/spotting-activity-heatmap.spec.ts` (two timestamps in each of the two zone runs); still open.

**Where:** `src/app/features/spotting/line-details/vehicle-spotting-grid/vehicle-spotting-grid.data.util.ts:47`, `src/app/domain-ui/spotting-activity-heatmap/spotting-activity-heatmap.ts:229`, `src/app/features/spotting/vehicle-detail/vehicle-detail.page.ts:222`, `src/app/features/spotting/line-details/line-details.page.ts:461`

**Problem.** dateKeyOf is correct for calendar math on backend dates, but it is also applied to the current instant, so 'today' is the UTC date. From 00:00 to 08:00 MYT the highlighted column, the pulsing ring and the heading 'N spottings today' refer to yesterday, and at the start of a month the default window ends one month early. TODAY_KEY is a module constant: in the long-lived SSR process it is fixed at server start, so after midnight the server HTML marks a different 'today' than the browser, which is a hydration text mismatch. selectedYear and years() use the server's local clock for the same reason.

**Recommendation.** Add a shared KL-today helper and use it for the current-instant call sites; drop the hydration argument.

_Original suggestion (corrected by the verifier):_ Reuse the Kuala Lumpur helper from the form finding. Make `todayKey` a computed or a method evaluated per render (or injected through a small `Clock` token that tests can fake) instead of a module-level constant. Keep dateKeyOf for pure calendar arithmetic only.

**Verification.** TODAY_KEY, the heatmap todayKey, vehicle-detail today and line-details _today all derive from dateKeyOf (UTC getters) of the current instant, so 'today' is wrong 00:00 to 08:00 MYT. The hydration-mismatch claim is overstated: the grid skips hydration and the heatmap's todayKey is per instance, not a module constant.

**Also reported as:** [F356](time-zone-and-date-correctness.md#f436) [gap-4] Compute 'today' per call, not at module load: the spotting grid freezes it on the long-lived SSR server (src/app/features/spotting/line-details/vehicle-spotting-grid/vehicle-spotting-grid.data.util.ts:47, src/app/features/spotting/line-details/vehicle-spotting-grid/vehicle-spotting-grid.data.util.ts:113)

<details><summary>Evidence</summary>

```text
export const TODAY_KEY = dateKeyOf(new Date());   // dateKeyOf reads getUTCFullYear/Month/Date
protected readonly todayKey = dateKeyOf(new Date());
const today = dateKeyOf(new Date());   // vehicle-detail _todaySpottingsCount
private readonly _today = firstOfMonth(new Date());
```

</details>

<a id="f438"></a>

#### F438 · The last-spotted age text invents a time of day from a date-only value

**low** · effort S · code-quality · spotting

**Note, quality pass 2026-10-22:** pinned by an `it.fails` case in `src/app/features/spotting/data/humanize-since.util.spec.ts`; still open.

**Where:** `src/app/features/spotting/data/humanize-since.util.ts:9`, `src/app/features/spotting/vehicle-detail/vehicle-status-board/vehicle-status-board.component.ts:27`

**Problem.** A date-only string is parsed as midnight UTC, which is 08:00 in Malaysia. A vehicle spotted today at 02:00 therefore shows 'less than a minute ago', and one spotted this morning shows '3 hours ago' for a precision the data does not have. The unit tests do not cover date-only input.

**Recommendation.** Branch on `/^\d{4}-\d{2}-\d{2}$/` in humanizeSince and measure calendar days from the Kuala Lumpur 'today' ('Today', 'Yesterday', '3 days ago'), or feed it `lastSpottedAt` (already fetched) when a precise instant exists. Add specs for date-only input around midnight.

**Verification.** humanizeSince does new Date(iso) on a 'YYYY-MM-DD' string, parsed as UTC midnight, and the status board feeds it lastSpottingDate; lastSpottedAt exists in the query. Spec has no date-only case.

<details><summary>Evidence</summary>

```text
const past = new Date(iso);
const elapsedMs = now.getTime() - past.getTime();
...
<p class="text-muted-foreground text-xs">{{ _humanizeSince(date) }}</p>   // date = vehicle.lastSpottingDate ('YYYY-MM-DD')
Node check: new Date('2026-10-22') = 2026-10-22T00:00:00Z = 08:00 in Kuala Lumpur.
```

</details>

<a id="f534"></a>

#### F534 · Create one Asia/Kuala_Lumpur time module in core/util and stop each feature re-deriving the policy

**low** · effort M · architecture · gap-4 · partially confirmed · severity adjusted from medium

**Where:** `src/app/core/util`, `src/app/features/home/data/feed-day-groups.util.ts:15-35`, `src/app/features/insiden/data/link-day-group.util.ts:34`, `src/app/features/insiden/data/calendar-date.util.ts:13`, `src/app/domain-ui/spotting-activity-heatmap/spotting-activity-heatmap.ts:41`, `src/app/features/home/data/status-history-display.util.ts:38-43`, `src/app/features/insiden/data/link-occurred-at.util.ts:62-78`

**Problem.** The backend mixes two shapes: naive MYT wall-clock strings (occurredAt, created, incident datetimes) and aware instants (+00:00 history buckets, build timestamp). Each feature picked its own rule and justified it locally with an 'SSR vs browser' comment. The three UTC-based variants are the ones that are wrong for Malaysia (findings above), the local-getter variants are right only when host zone equals MYT, and only the Intl-with-timeZone variants are actually zone-proof. With nothing shared, the same bug reappeared in insiden, spotting, gallery and the footer.

**Recommendation.** Fold into the fixes for 0-3: add one small myt-time util (mytDayKey, parseBackendDateTime) and use it at the call sites. Skip the broader formatMyt and addDaysToKey API unless needed.

_Original suggestion (corrected by the verifier):_ Add src/app/core/util/myt-time.ts with: `parseBackendDateTime(s): Date` (naive -> append +08:00; aware -> as is; invalid -> null), `mytDayKey(d = new Date())` via Intl en-CA with timeZone Asia/Kuala_Lumpur, `wallDayKey(s)` (= s.slice(0,10) for naive strings), `formatMyt(d, preset)` using hoisted Intl.DateTimeFormat instances with timeZone set, and a tiny `addDaysToKey(key, n)` done in UTC on key strings. Make all call sites above import it and delete the duplicate dateKeyOf. Keep DatePipe only for naive wall-time strings with no timezone argument (that combination is zone-independent) and for aware instants pass the '+0800' timezone argument. Document the two-shape rule once in docs/COMPONENTS.md.

**Verification.** The inconsistency is real: UTC getters in link-day-group, calendar-date and the heatmap, local getters in feed-day-groups, and Intl with an explicit zone elsewhere. core/util holds only a couple of small files. This is a refactor that supports findings 0-3 and 10, not a separate defect, and its recommended DatePipe guidance is partly speculative.

<details><summary>Evidence</summary>

```text
core/util contains only deep-equal.util.ts and lines-label.util.ts. Day keys are built three ways: UTC getters (link-day-group, calendar-date, heatmap), local getters (feed-day-groups `localDayKey`, incident-link-line, humanize-since) and explicit `timeZone: "Asia/Kuala_Lumpur"` (status-history-display, line-status-chart). Two files define a different `dateKeyOf` (calendar-date.util.ts:13 and spotting-activity-heatmap.ts:41), and the spotting grid imports the heatmap's.
```

</details>

<a id="f535"></a>

#### F535 · Set a deliberate locale and one set of date formats; the app mixes five date styles and 12/24-hour clocks

**low** · effort M · ux · gap-4 · partially confirmed

**Where:** `src/app/app.config.ts:161`, `src/index.html:2`, `src/app/features/home/data/feed-day-groups.util.ts:35`, `src/app/shell/app-footer/app-footer.component.ts:62`, `src/app/features/tracker/info-panel/tracker-info-panel.component.ts:550`, `src/app/features/insiden/data/incident-link-line.util.ts:62-76`, `src/app/features/spotting/vehicle-detail/spotting-history/spotting-history.component.ts:54`

**Problem.** The UI is English with Malay proper nouns (Insiden, Situasi, TranSPOT) for Malaysian riders, but the date copy is month-first en-US with a mix of 24-hour and 12-hour clocks, one day-first style in the home feed, and a locale-dependent toLocaleString in the tracker that will print differently per device. The same moment can read 'Sep 28, 2026 15:46', 'Mon, 28 Sep', '28/9/2026, 3:46:00 pm' depending on screen. There is no stated locale policy, and BM terms are not marked with lang for screen readers.

**Recommendation.** Pick one set of named date formats and replace the tracker's bare toLocaleString. Treat the en-MY locale and lang=ms as optional.

_Original suggestion (corrected by the verifier):_ Decide the policy once: either keep English-only copy and register `en-MY` (day-first, `registerLocaleData` plus `{ provide: LOCALE_ID, useValue: 'en-MY' }`) or stay en-US deliberately. Define a handful of named format constants in the new time module (`DATE`, `DATE_TIME` = 'd MMM y, HH:mm', `DAY_HEADER`, `SHORT_TIME`), use them in every template via `DATE_PIPE_DEFAULT_OPTIONS` where possible, replace the tracker's toLocaleString with the same helper, and mark Malay phrases with `lang="ms"` where a whole phrase is BM.

**Verification.** No LOCALE_ID or DATE_PIPE_DEFAULT_OPTIONS provider exists, formats are mixed, and the tracker calls toLocaleString() with no arguments. This is a style consistency issue and a product decision, not a defect. The lang="ms" suggestion is speculative.

**Also reported as:** [F567](time-zone-and-date-correctness.md#f535) [seo-pwa-i18n] Date and number formatting is hard-coded to en-US and en-GB with no locale token (src/index.html:2, src/app/features/home/data/feed-day-groups.util.ts:31)

<details><summary>Evidence</summary>

```text
Formats found: `"MMM d, y HH:mm"` (cards), `"MMM d HH:mm"`, `"MMMM d, y"`, `"EEE, d MMM"` (home Last Week headers, day-first), `"medium"` (footer, 12-hour with seconds), bare `| date` (mediumDate, spotting rows), `"mediumDate"`, custom `yyyy-mm-dd hh:mm` (incident-link-line), and `date.toLocaleString()` with no arguments in the tracker. No LOCALE_ID or DATE_PIPE_DEFAULT_OPTIONS provider exists; `<html lang="en">`.
```

</details>

<a id="f538"></a>

#### F538 · Parse the backend's naive Kuala Lumpur datetimes explicitly so labels do not depend on the browser time zone

**low** · effort M · code-quality · home-data · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/home/data/status-history-display.util.ts:38`, `src/app/features/home/data/status-history-display.util.ts:152`, `src/app/features/home/line-pulse/line-status-chart.component.ts:250`, `src/app/features/home/data/feed-day-groups.util.ts:22`, `src/app/features/home/data/feed-day-groups.util.ts:60`, `src/app/features/home/data/home.store.ts:812`

**Problem.** The history buckets are the same naive scalar as other datetimes. new Date() reads a string with no offset as browser-local time, and the code then formats it in Asia/Kuala_Lumpur, which is only the identity for browsers already in +08:00; the comment claims the opposite ('a rider from another timezone must still line the bars up'). Visitors in other zones (travellers, VPN, Indonesia) see shifted hour labels, and currentServiceBucketIndex compares the real instant to a locally-parsed naive start, so the 'current hour' glow and 'X this hour' are wrong for them. The CSV export, by contrast, deliberately treats the same strings as naive. Separately, feed-day-groups compares a naive MY date with the browser's local 'now', and lastWeekDayGroups is a computed that never re-reads the clock, so 'Yesterday' stays wrong after midnight in a long-lived tab.

**Recommendation.** Add one tested helper parseMyNaive(s) that appends +08:00 (and myNow() that returns Kuala Lumpur wall time) in core, use it in status-history-display, the chart, feed-day-groups and humanizeSince's callers, and recompute day groups from a per-beat clock signal. Keep the Intl formatter's timeZone option once the input is a real instant.

**Verification.** Backend runs USE_TZ=False so hourStart is naive, and status-history-display formats new Date(naive) with timeZone Asia/Kuala_Lumpur, which is only correct in a +08:00 browser; MISTAKES.md already documents the naive-datetime trap. Real but only affects the few non-Malaysia viewers of a Klang Valley app.

**Also reported as:** [F329](time-zone-and-date-correctness.md#f538) [gap-1] Parse naive Malaysian bucket hours as Malaysian time, not as the viewer's local zone (src/app/features/home/data/status-history-display.util.ts:33-47, src/app/features/home/data/status-history-display.util.ts:149-162)

<details><summary>Evidence</summary>

```text
const HOUR_LABEL = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Kuala_Lumpur" });
return HOUR_LABEL.format(new Date(instant));
Measured with node: new Date('2026-10-21T03:00:00') formatted in Asia/Kuala_Lumpur prints 03 under TZ=Asia/Kuala_Lumpur, 11 under TZ=UTC and 04 under TZ=Asia/Jakarta. Backend sample: startDatetime '2023-05-19T17:24:00' (no offset, USE_TZ=False).
```

</details>
