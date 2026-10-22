# Feature opportunities

Part of the [rosak_firebase audit, 2026-10-21](../2026-10-21.md). 31 findings, most severe first.

Mostly frontend-ready ideas built on data and seams that already exist: rider incident notices, calendar filters and export, installability, sync of saved lines, stations, push, i18n and account export.

<a id="f077"></a>

#### F077 · Show ongoing incidents and service notices on the Rider board, not only in the Pro dashboard

**medium** · effort S · feature · features

**Status, feature pass 2026-10-22:** Fixed (`7b0357b`, `67eb378`, `48474d0`, `4339386`, `64372ec`, `21d223f`, `9518488`, `e84055f`, `67c042e`, `2473a6a`, backend `699126d`, backend `07c8289`). Both slices are done. Every compact row and every Needs attention card on the Rider board shows a Notice chip for each approved incident running on its line, with a link to that day on /insiden. A pinned line, as a My lines row or as a card, also shows the Planned works that start within seven days. At most two chips show per line, and the chips are re-read on the 30 s beat. The shared ongoing read now sends `status: LIVE` with `activeNow`. The Pro widget used to send `OR: { ongoing: true }`, which only looks at the end time, so it listed drafts and reports pending approval on a public page. That is corrected, and the widget now shares the board's read. A Notice also takes a Normal line out of the quiet fold. **Left:** an incident with no line tag has no row to sit on, and the Pro widget still hides itself while its read has failed.

**Where:** `src/app/features/home/data/home.store.ts:548`, `src/app/features/home/data/home-incidents.queries.ts:37`, `src/app/features/home/data/home-incidents.queries.ts:56`, `src/app/features/home/data/home-board.queries.ts:14`, `src/app/features/home/home.page.ts:165`

**Problem.** The default home view is the Rider view, which is what most phone commuters see. It shows the line status (from passenger reports) and pulse links, but the community-curated incident calendar (calendarIncidents, with title, brief, severity and the affected lines) is read only when the Pro dashboard widget asks for it. The result is that a commuter who opens the board and sees a line as 'Normal' gets no hint that a moderator-approved incident is open on that line. The query is already hydration-safe (compile-time constant variables), already selects lines { id code }, and the store already has a recentIncidents computed, so the data seam exists and simply is not wired into the Rider surface. Note that 'ongoing' in the backend means end_datetime IS NULL, so a planned work with a known end time is never returned by this query.

**Recommendation.** First slice: call requestIncidentsRead() from the Rider network board as well (it is one small, already-cached read), group store.recentIncidents() by lines[].id, and render a compact 'Notice' chip with the incident title and a link to /insiden/<date> on the matching line row and in the 'My lines' group. Second slice (needs a small backend change): add an 'activeNow' or 'upcoming' filter on CalendarIncidentFilter (today it supports only id, severity, ongoing and date) so that scheduled works with an end time, such as weekend maintenance, can be shown as 'Planned works this weekend' for pinned lines. Because the Pro widget and the Rider chips would share the one resource, there is no duplicate request.

**Verification.** requestIncidentsRead is only called from pro-incidents-widget; no incident surface exists in the Rider hero or home.page. Backend filter `ongoing` is end_datetime IS NULL and CalendarIncidentFilter has only id/severity/ongoing/date, as stated.

<details><summary>Evidence</summary>

```text
home.store.ts:548  /** Asks the store to read the ongoing-incidents list. Called by the Pro widget's constructor. */
  requestIncidentsRead(): void {

home-incidents.queries.ts:56  export const HOME_RECENT_INCIDENT_VARS = Object.freeze({
  filters: { OR: { ongoing: true } },
  order: { startDatetime: "DESC" },
});
```

</details>

<a id="f078"></a>

#### F078 · Add line, station and 'my lines' filters plus .ics and CSV export to the incident calendar

**medium** · effort S · feature · features · already documented

**Status, feature pass 2026-10-22:** Fixed (`6de8ffb`, `71ebf78`, `165a106`, `75f8014`, `cddd5c5`, `0957fe5`, `d376289`, `b9f8123`, `80cbea7`, `b8727a6`, `60d31ac`). /insiden has line and severity filters and a "My lines" toggle seeded from the pinned lines, all kept in the URL. Each incident has "Add to calendar" (`.ics`), and the calendar header has "Export month" (`.csv` or `.ics`, approved incidents only). **Left:** the station filter, and a subscribable `.ics` feed, which needs a backend endpoint.

**Where:** `src/app/features/insiden/insiden.page.ts:92`, `src/app/features/insiden/insiden.page.ts:124`, `docs/components/insiden.md:161`, `docs/components/insiden.md:162`, `docs/COMPONENTS.md:202`, `src/app/core/preferences/preferences.service.ts:34`

**Problem.** Every incident already carries lines, vehicles and stations (175 of the 280 local incidents are tagged with stations), but /insiden shows all of them for the selected month, so a commuter who only cares about their own line must scan every card. Pinned lines already exist in PreferencesService but are not used outside the home board. Incidents also cannot be taken out of the page: there is no calendar export or CSV, although core/export/csv.util.ts exists, and journalists and researchers have no simple way to get the data.

**Recommendation.** Add a filter-criteria signal (lineIds, severity) folded into allIncidents/dayIncidents/pinned as the docs describe, plus a 'My lines' toggle that seeds lineIds from PreferencesService.pinnedLineIds, and sync it to the URL with core/url-state/query-param.util.ts. Add a core/export/ics.util.ts (pure, with a spec; RFC 5545 escaping and CRLF folding; use floating or Asia/Kuala_Lumpur TZID times because startDatetime is offset-free) and two buttons on the card and calendar header: 'Add to calendar' and 'Export month (.csv/.ics)' via the existing toCsv. For a subscribable feed later, a backend /incidents.ics endpoint would be the follow-up. Because the filter only covers the loaded month window, label it so in the UI.

**Verification.** insiden.md lines 161-162 list filtering and .ics as ready, insiden has no filter/pinned/toCsv usage, and csv.util.ts is CSV-only with no ics util. Filter is correctly caveated as month-window only.

**Also reported as:** [F554](feature-opportunities.md#f078) [insiden-ui] Offer a downloadable .ics feed and severity or line filters for the incident list (MISTAKES.md:519, src/app/features/insiden/insiden.page.ts:124-150)

<details><summary>Evidence</summary>

```text
insiden.page.ts:92  protected readonly incidentsResource = graphqlResource<InsidenIncidentsQueryData>(() => ({
    query: INSIDEN_INCIDENTS_QUERY,
    variables: {
      filters: {
        date: { range: calendarMonthRange(this.selectedMonth()) },
        OR: { ongoing: true },

insiden.md:161  Client-side filtering by line/vehicle/station/severity: ready ...
insiden.md:162  Calendar export (iCal/.ics): ready ...
```

</details>

<a id="f209"></a>

#### F209 · Add a fleet-completion tracker for enthusiasts using the existing favouriteVehicles(count) field

**medium** · effort M · feature · features

**Status, feature pass 2026-10-22:** Fixed (`07f3977`, `0e510dc`, `468b8ad`, `5d303af`, `1038cf0`). The own profile has a Fleet progress card with one progress bar per line (distinct vehicles spotted out of the line's total) and a lazily read list of the unspotted vehicles, each linking to its vehicle page. The card reads `favouriteVehicles(count: 1000)` in its own request after the first paint, on the own profile only, so the public query is unchanged. **Left:** lines with no spotted vehicle are not listed, and the backend cuts the list at the count without saying so (the card reports a list that reaches it).

**Where:** `src/app/features/profile/data/profile.queries.ts:37`, `src/app/features/profile/user-card/user-card.component.ts:231`, `../rosak_backend/common/schema/scalars.py:85`, `src/app/features/spotting/data/spotting.queries.ts:51`

**Problem.** The strongest retention hook for train spotters is a collection ('I have seen 41 of 68 KJ trainsets, which ones am I missing?'). The backend already returns, per user, the distinct vehicles they have reported with counts, and Line.vehicles / Line.totalVehicleCount / vehicleTypes.vehicleTotalCount give the fleet denominator. The frontend asks for only the top one vehicle, so the data that would power a progress view is never requested. A related risk is worth knowing before building it: profile.md states favouriteVehicles are always public, so asking for a large count on a public profile would expose the whole set of vehicles a user has spotted even when they have opted out of spottingDataPublic.

**Recommendation.** Slice 1 (own profile only, no backend change): in the authenticated user query request favouriteVehicles(count: 1000) { vehicle { id identificationNo lines { id code } vehicleType { id } } count }, then on the profile page render a 'Fleet progress' card with one progress bar per line (spotted distinct / totalVehicleCount) and an expandable list of unspotted vehicle numbers that link to /spotting/:lineId/vehicle/:id. Keep the public query at count 1 or add a backend guard that honours spottingDataPublic for counts greater than 3. Add a pure util (fleet-progress.util.ts) with a spec. A later backend slice could expose a spottedVehicleCount aggregate to avoid shipping the whole list.

**Verification.** Backend favourite_vehicles(count=1) exists and frontend queries it with no count argument. The privacy warning is accurate: the resolver has no spottingDataPublic check, so own-profile-only slice is the correct scoping.

<details><summary>Evidence</summary>

```text
scalars.py:85  def favourite_vehicles(
        self, count: Optional[int] = 1
    ) -> List[FavouriteVehicleData]:
(grouped by vehicle, ordered by -vehicle__count, sliced [0:count])

user-card.component.ts:231  protected readonly _favouriteVehicle = computed(() => this.user().favouriteVehicles?.[0]);

profile.queries.ts:37  favouriteVehicles {  (no count argument, so only the top 1 is ever fetched)
```

</details>

<a id="f210"></a>

#### F210 · Make the app installable (web manifest, icons, theme colour) and add a minimal service worker

**medium** · effort M · feature · features

**Status, feature pass 2026-10-22:** Fixed (`507886e`, `9214c3f`, `3add1d8`, `2dd0c2a`, `95f970e`). `public/manifest.webmanifest`, install icons and theme colours make the app installable, and a service worker precaches the hashed JS and CSS and the CSR shell in production builds. No GraphQL data group was added, because ngsw caches only GET and HEAD and every app read is a POST. **Left:** last-known data offline (see F295).

**Where:** `src/index.html:2`, `public/`, `angular.json:22`, `package.json`, `src/app/core/version/new-version.service.ts:14`

**Problem.** The audience is mostly on phones, and a status board is something people open several times a day on the platform. Without a manifest there is no 'Add to Home Screen' install prompt, no standalone window, and no splash screen; iOS and Android both treat it as an ordinary browser tab. It is also the prerequisite for web push on iOS (Safari only delivers web push to installed apps) and for any offline behaviour in tunnels and underground stations, where signal is poor.

**Recommendation.** Slice 1 (about 2 hours, no code risk): add public/manifest.webmanifest (name 'MLPTF', short_name, start_url '/', display 'standalone', theme_color and background_color matching the brand tokens) with 192 and 512 PNG icons including a maskable one, link it from index.html together with <meta name="theme-color"> for light and dark and an apple-touch-icon. Slice 2: add @angular/service-worker with provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' }) and an ngsw-config.json that precaches only the hashed assets and uses a 'freshness' dataGroup (networkFirst with a short timeout) for the GraphQL endpoint so the board shows the last-known status clearly labelled as stale instead of a blank error. Do not cache the HTML for '/' (the server sets s-maxage=20) and make sure the existing version.json NewVersionService poll bypasses the worker.

**Verification.** public/ has no manifest, and grep finds no serviceWorker/ngsw or manifest/theme-color in src or angular.json. Product is phone-first so installability fits.

**Also reported as:** [F132](feature-opportunities.md#f210) [seo-pwa-i18n] No web app manifest, theme-color or apple-touch-icon, and no service worker (src/index.html:4-13, public/favicon.svg)

<details><summary>Evidence</summary>

```text
public/ contains only: ads.txt favicon.ico favicon.svg image-not-found.png robots.txt version.json. rg for serviceWorker|ngsw|beforeinstallprompt|PushManager|firebase/messaging over src/ and angular.json finds nothing; src/index.html has no <link rel="manifest">, no theme-color and no apple-touch-icon. @angular/service-worker and @angular/pwa are not in package.json.
```

</details>

<a id="f211"></a>

#### F211 · Persist report drafts and queue status reports while offline

**medium** · effort M · feature · features · already documented

**Status, feature pass 2026-10-22:** Fixed (`f86a497`, `a4dec01`, `35551c2`, `273855a`, `34b8079`, `7a2fe2b`, `6f8e348`, `4381e63`, `0888e3e`, `d92d17f`, `f18b649`, `8a50b1c`, `7c06cfd`, `7d2ca7f`). Both slices are done. The line-status sheet keeps its draft per line and the spotting report form keeps its draft in one slot, both in `sessionStorage` and tied to the signed-in account. Each is restored on the next open with a Discard button. A line status report that the server could not take is saved in an outbox in `localStorage`, shown as "Saved / It will send when you're back online.", and sent on reconnect, when the home route starts and on every board refresh. A queued report is dropped once it is older than its line's own reporting window (15 minutes where the window is not known), and a published methodology metric explains the rule. **Left:** no client `occurredAt`, because the backend stamps a report on arrival, so a report that waited still counts as fresh and the expiry only bounds how stale it can be. The flush runs on the home route only, not app-wide. The backend has no idempotency key, so a report whose reply was lost can be sent twice.

**Where:** `docs/components/spotting.md:99`, `src/app/features/home/line-status/line-status-sheet.component.ts:395`, `src/app/features/spotting/report-form/report-form.component.ts:223`, `src/app/core/preferences/preferences.service.ts:52`

**Problem.** Contributors report from platforms and trains, exactly where connectivity drops (underground LRT/MRT sections, tunnels, crowded cells). A failed line-status submit leaves the user with an error and a sheet to keep open; if the sheet is closed or the tab is killed by the OS, the report is lost, and the spotting report form clears itself on close. For a crowd-sourced status board, losing reports at the moment of disruption is the worst time to lose them. The photo upload queue already uses IndexedDB, so the pattern exists, but status reports and drafts have none.

**Recommendation.** Slice 1: persist the spotting report-form model (without File blobs) and the line-status sheet draft to sessionStorage in an effect() behind injectIsBrowser(), restoring on open and clearing on successful submit; keep the existing try/catch storage wrappers from PreferencesService as the pattern. Slice 2: for submitLineStatusReport, when the failure is a transport error (not a GraphQLRequestError), put the payload plus a client timestamp into a small outbox (IndexedDB, reusing core/upload helpers), show 'Saved, will send when you are online', and flush on the window 'online' event. Mark queued reports with their original time in the notes or confine the queue to reports under about 15 minutes old, because the board's methodology window (statusWindowMinutes) would otherwise be polluted by stale reports; this needs a backend decision on accepting a client-supplied occurredAt.

**Verification.** spotting.md:99 confirms the draft is not persisted, and the line-status sheet has no localStorage/sessionStorage use. The offline-queue slice correctly flags that stale reports need a backend decision.

<details><summary>Evidence</summary>

```text
line-status-sheet.component.ts:395  this.submitError.set("Couldn't reach the server. Check your connection and try again.");

spotting.md:99  Nothing under `report-form/` persists the draft (no localStorage, sessionStorage or IndexedDB), so closing the sheet by accident loses the whole in-progress report.
```

</details>

<a id="f212"></a>

#### F212 · Sync saved (pinned) lines and preferences to the account so they follow the user across devices

**medium** · effort M · feature · features

**Where:** `src/app/core/preferences/preferences.service.ts:34`, `src/app/core/preferences/preferences.service.ts:52`, `src/app/features/profile/data/profile.queries.ts`

**Problem.** The 'My lines' board, recent lines and the last reported line are the product's personalisation and its main retention hook, but they live only in one browser's localStorage. A user who logs in on a second phone, clears site data, or opens the site in an in-app browser (WhatsApp, Instagram, which use isolated storage) starts from zero. It also blocks any server-driven feature (push alerts, digests), because the server does not know which lines a person cares about.

**Recommendation.** Backend first: add pinnedLineIds (list of Line ids) to the user model and to UserInput/updateUser, and expose it on the user query. Frontend: in PreferencesService, when AuthService.isLoggedIn() flips to true, read the server value, merge it with the local list (union, local wins on first sync), and write changes back through a debounced updateUser call; keep localStorage as the logged-out store and as the SSR-safe default. Keep the versioned key and parser, adding the server list as another source in parseStoredPreferences. Add a spec for the merge.

**Verification.** UserInput exposes only nickname and spottingDataPublic, and pinnedLineIds lives only in PreferencesService localStorage. The finding explicitly says a backend change is needed first.

<details><summary>Evidence</summary>

```text
preferences.service.ts:52  const STORAGE_KEY = "rosak:preferences:v1";
preferences.service.ts:193  Reader-owned board display preferences, persisted in `localStorage`.
Live schema: Mutation.updateUser exists (profile nickname and privacy only); no query or mutation carries line preferences.
```

</details>

<a id="f213"></a>

#### F213 · Turn the unused incident aggregates into a reliability history, and add a date to the status-history queries

**medium** · effort M · feature · features

**Status, feature pass 2026-10-22:** Partly fixed (`dca6a37`, `9ba407d`, `6cc2843`, `ee468be`, `5ae999d`). Slice 1 is done: /insiden has a "Last 12 months" section, collapsed until it is opened, with Major and Minor bars per month and a table fallback. It counts approved incidents on the client from `calendarIncidents`, because `calendarIncidentsBySeverityCount(groupBy: MONTH)` was a running total that reset each January. The backend has since fixed it (backend `9832a3d`), and the page does not use the fixed aggregate yet. The backend inputs of slice 2 have landed: `daysAgo` on the status-history queries (backend `19db35f`) and `lineStatusWeekProfile` (backend `0755450`). **Left:** slice 2, the "Typical week" strip per line, which is in progress.

**Where:** `src/app/features/home/data/home-history.queries.ts:15`, `src/app/features/home/data/home-history.queries.ts:48`, `src/app/features/insiden/data/insiden.queries.ts:27`, `docs/components/home.md:1551`

**Problem.** The product has one question it cannot answer: 'is this line usually bad, and when?'. A backend aggregate for incident counts per month and severity is already built and tested but never called, and the hourly report history has no date argument, so even the board's own heat grid cannot look past today. Without a longer horizon commuters cannot judge which line or time of day to trust, and the methodology page has nothing to show for reliability over time.

**Recommendation.** Slice 1 (no backend change): add a 'Last 12 months' chart on /insiden using calendarIncidentsBySeverityCount with groupBy MONTH (stacked MAJOR/MINOR bars, lazy-loaded, drawn with the existing chart approach used by the line status chart), and register its definition in src/app/core/methodology with a bumped lastReviewed. Slice 2 (small backend change): add an optional serviceDay: Date (or days: Int) argument to lineStatusHistory and linesStatusHistory, then build a 'Typical week' hour-of-week heat strip per line from four to eight weeks of buckets, with a minimum-report threshold so sparse hours read 'not enough reports'. Because variables must stay hydration-safe, pass the date as a backend-computed enum (for example 'PREVIOUS_WEEKS') rather than a client Date.

**Verification.** calendarIncidentsBySeverityCount works live and returns MAJOR/MINOR/OTHERS monthly rows but is unused in src. lineStatusHistory requires lineId and has no date argument per introspection and queries file.

<details><summary>Evidence</summary>

```text
Live schema: calendarIncidentsBySeverityCount(startDate, endDate, groupBy) is used nowhere in src/. Run against the backend for 2023-01-01..2026-12-31 with groupBy MONTH it returns rows such as {severity: MAJOR, date: 2023-01-01, count: 9} and {severity: MINOR, date: 2023-01-01, count: 18}. lineStatusHistory takes only (lineId, dayStartHour) and networkStatusHistory only (dayStartHour): the current service day is the only history that can be read.
```

</details>

<a id="f292"></a>

#### F292 · Spotting history never shows photos, run number or wheel condition although the query fetches them

**medium** · effort M · feature · ux-spotting

**Status, feature pass 2026-10-22:** Fixed (`2344494`, `52d0568`, `68f0869`, `925f83e`). Each row of the vehicle history has a second line with a "Yours" tag, "Run 12", the wheel condition (labelled "Wheels") and a camera chip ("3 photos"), and the month headings are `h3`. The "Yours" tag needs `isMine`, which the backend answers only for a request that carries `firebase-auth-key`, so the history sends a signed-in viewer's token and asks again when the viewer signs in or out. `GraphQLClient.request` keeps such requests out of the SSR transfer cache. **Left:** the camera chip is not a link, because `medias` has no filter by spotting. A signed-in hard load shows the list without tags until the session is restored.

**Where:** `src/app/features/spotting/data/spotting.queries.ts:195`, `src/app/features/spotting/vehicle-detail/spotting-history/spotting-history.component.ts:51`, `src/app/features/spotting/vehicle-detail/spotting-history/spotting-history.component.ts:46`

**Problem.** The report form invites photos, wheel condition and run numbers, but contributors never see that data on the vehicle page, which weakens the reward loop for spotters. The month headings jump from h2 to h4 (axe heading-order on /spotting/4/vehicle/103).

**Recommendation.** Render mediaCount as a camera chip (linking to the gallery filtered to that spotting when the API supports it), show wheelStatus with the existing wheel-status-badge and runNumber as 'Run 12', and mark isMine rows with a 'Yours' tag. Change the month headings to h3.

**Verification.** The history template renders date, type, stations, status and notes only. Photos, run number and wheel status are never shown, and the heading goes from h2 to h4.

**Also reported as:** [F572](feature-opportunities.md#f292) [spotting] Feature opportunity: show the spotting data the history query already fetches (photos, wheel condition, run number, own entries) (src/app/features/spotting/data/spotting.queries.ts:195, src/app/features/spotting/vehicle-detail/spotting-history/spotting-history.component.ts:51)

<details><summary>Evidence</summary>

```text
VEHICLE_EVENTS_QUERY selects runNumber, mediaCount, isMine, wheelStatus  // template renders only spottingDate, type, originStation/destinationStation, status, notes. Heading levels: card h2 then <h4 class="text-muted-foreground mb-1 text-xs ...">.
```

</details>

<a id="f293"></a>

#### F293 · Introduce station pages (/station/:id) and link every station chip to them

**medium** · effort L · feature · features

**Where:** `src/app/features/insiden/incident-card/incident-card.component.html:65`, `src/app/features/home/line-pulse/line-status-reports.component.ts:23`, `src/app/features/spotting/data/spotting.queries.ts:407`, `src/app/app.routes.ts:26`

**Problem.** Stations are the unit commuters think in ('Is KL Sentral OK?'), yet the app is organised only by line and vehicle. Station data appears in four places (incident badges, status report station lists with a tally strip, spotting origin and destination, and the asset list) but each is a dead-end label with no destination page, and there is no /station route. The data to build one is mostly available: lines served, tagged incidents, per-station report counts and assets. Two caveats from the live data: only 35 of 226 stations have a location, and the stationIncidents list is empty locally.

**Recommendation.** Slice 1: add a lazy /station/:id route (server-rendered, so it can carry the share tags from the share-preview finding) showing the station name, the lines that serve it with their current status badges (Station.lines already returns Line), and station-tagged reports from the existing line report lists; make the station chips in incident-card.component.html, the report station strip and the spotting origin/destination fields RouterLinks to it. Slice 2 needs a small backend change: add a station (and line) filter to CalendarIncidentFilter, or a Station.calendarIncidents field, because the filter today supports only id, severity, ongoing and date, so a station's incident history cannot be fetched without downloading everything. Slice 3: show assets and (when the backend exposes it) their status. Fill the 191 missing station coordinates before adding any 'nearest station' feature.

**Verification.** app.routes.ts has no station route; stationIncidents exists in the live schema but is unused in src. CalendarIncidentFilter has no station/line filter, so the stated backend change is right.

<details><summary>Evidence</summary>

```text
incident-card.component.html:65-66  @for (station of incident().stations; track station.id) {
        <span hlmBadge variant="outline">{{ station.displayName }}</span>

Live schema: Station { id displayName location lines assets }; stations query returns 226 stations, 54 served by more than one line; calendarIncidents tag stations on 175 of 280 incidents; LineStatusReportScalar.stations is selected by the report list; the Query field stationIncidents exists but is used nowhere in src/.
```

</details>

<a id="f294"></a>

#### F294 · Web push alerts for disruptions on saved lines

**medium** · effort L · feature · features · already documented

**Where:** `docs/components/insiden.md:163`, `src/app/core/preferences/preferences.service.ts:34`, `../rosak_backend/rosak/celery.py:23`, `functions/src/index.ts:39`

**Problem.** A commuter's strongest need is 'tell me when my line breaks', which is the opposite of opening a page every few minutes. Today the product is pull only, so it only helps people who already think to check it, and it has no re-engagement channel at all (no email, no push, no digest). The ingredients exist: the backend knows when an incident is approved or an official post is ingested for a line, and Firebase Cloud Messaging is already part of the stack through the Firebase SDK.

**Recommendation.** Depends on the installable-app finding and on account-synced saved lines. Backend: a PushSubscription model (user, FCM token, line ids, quiet hours) with registerPushToken/unregisterPushToken mutations, and a Celery task (or signal on approveCalendarIncident and on official-post ingestion) that sends through firebase_admin.messaging to subscribers of the affected lines, rate limited (at most one per line per 30 minutes) and deduplicated. Frontend: add firebase/messaging and a public/firebase-messaging-sw.js (or fold it into the Angular service worker), a bell toggle on pinned line rows that calls Notification.requestPermission() only after a user tap and shows a soft pre-prompt, and a tiny 'alerts' section in the profile. First shippable slice: notify only on newly approved MAJOR incidents for pinned lines. Tell iOS users that push needs the installed app.

**Verification.** insiden.md:163 states no push or subscription exists; no firebase/messaging in src, and no messaging usage in functions or backend. The finding states the backend and installability dependencies.

<details><summary>Evidence</summary>

```text
insiden.md:163  Ongoing-incident subscriptions/notifications: good idea, not ready ... there is no push-notification service or per-user subscription record anywhere in the app or backend.
rg for firebase/messaging, getMessaging and PushManager in src/ finds nothing; rg for fcm/webpush in rosak_backend and functions/src finds nothing. The backend already runs Celery beat tasks and an official-post ingestion task (celery.py:62-84).
```

</details>

<a id="f295"></a>

#### F295 · Offline and slow-network handling: detect offline, stop mislabelling it, and consider a PWA shell with last-known status

**medium** · effort L · feature · ux-home

**Status, feature pass 2026-10-22:** Partly fixed (`9b06ad2`, `d40f3b7`, `5738111`, `7d6ad87`, `3add1d8`). Step 1 is done: an `OnlineService` and a "You're offline" strip, polling that pauses offline and refreshes on reconnect, and a failed chunk that says "You're offline" instead of blaming a deploy (it asks `/version.json` first, so only a different build lights the update button). The manifest and service worker from F210 cover the install part of step 2, and an offline navigation opens the cached app shell. **Left:** the last-known data cache of step 2, so the board still has nothing to show offline, because ngsw cannot cache the POST reads.

**Where:** `src/app/core/version/new-version.service.ts:131`, `src/app/core/polling/polling-source.ts`, `src/index.html:4`, `.omo/evidence/audit-2026-10-21/interactions/offline__insiden-offline-3s.png`

**Problem.** The audience rides trains with patchy signal (tunnels, underground stations). Today a failed lazy route silently stays on the old page, blames a deployment, and offers a reload that will fail offline too. There is no offline indicator, no retry-on-reconnect and nothing cached to show. Chunk and data failures are not distinguishable to the user from real outages.

**Recommendation.** Step 1 (S): add an `OnlineService` signal (navigator.onLine plus online/offline events), show a slim non-blocking 'Offline' strip, pause polling while offline and refresh immediately on reconnect, and make a failed navigation offline say 'You're offline - this page needs a connection' instead of the update toast. Step 2 (L, optional): add a web manifest, `<meta name="theme-color">` and a service worker (Angular provideServiceWorker) that caches the app shell and the last Home GraphQL response so Home opens instantly with a 'Last updated' stamp. Keep the SSR and App Hosting caching rules in mind.

**Verification.** public/ has no manifest or service worker and index.html has no theme-color. Offline lazy-chunk failures go through the same chunk-error path as finding 0 and give the update toast. The staged suggestion is reasonable.

<details><summary>Evidence</summary>

```text
Capture: offline, tap Insiden: URL stays on /, body shows 'Update available - A new version was deployed and part of this page couldn't load. Reload to continue.'
No manifest, no service worker, no theme-color in public/ or index.html; reloadForNewVersion() also deletes all caches then reloads.
```

</details>

<a id="f326"></a>

#### F326 · Add 'near me' and saved layer presets to the live tracker

**low** · effort S · feature · features · already documented

**Where:** `docs/components/tracker.md:57`, `docs/components/tracker.md:58`, `src/app/features/tracker/data/layer-selection.service.ts:21`, `src/app/features/tracker/data/layer-config.ts:23`, `src/app/features/spotting/report-form/report-form.component.ts:228`

**Problem.** Every visit to /tracker starts from the config defaults, and a rider who just wants to see trains near them has to pan and zoom a national map by hand. A phone visitor expects a 'locate me' control, and the one geolocation code path in the app sits in the report form, not the map. Layer choices are not remembered, so a user who only follows KTMB re-ticks the same boxes each time.

**Recommendation.** Add a 'Locate me' control that calls navigator.geolocation behind injectIsBrowser() inside afterNextRender, then flies the L7 scene to the point and highlights the nearest stops from the already-loaded GTFS stops GeoJSON (compute the haversine distance in a pure util with a spec). Persist appliedRealtimeChecked/appliedStopsChecked/appliedRailway in PreferencesService (new additive fields with defaults) and seed the draft on load, and read them from query params so a map view can be shared, as the docs suggest. No backend change.

**Verification.** tracker.md:57-58 says no geolocation or preset persistence, and the only geolocation use is in report-form.component.ts. Tracker has no query-param sync.

<details><summary>Evidence</summary>

```text
layer-selection.service.ts:21  readonly appliedRealtimeChecked = signal<Record<string, boolean>>({});
tracker.md:57  There is no geolocation code today.
report-form.component.ts:228  navigator.geolocation.getCurrentPosition(  (the only geolocation use in the app)
```

</details>

<a id="f327"></a>

#### F327 · Let users export their own spotting history as CSV or JSON

**low** · effort S · feature · features · already documented

**Status, feature pass 2026-10-22:** Fixed (`2defcf9`, `6ed1ff3`, `27c55b4`). The owner has "Export CSV" and "Export JSON" on the spotting history. The export pages past the loaded rows in 200-row pages, shows "Preparing N rows…" and downloads nothing if a page fails, and delete and export cannot run at the same time. **Left:** an abort button for a very long export, and a delete made in another tab in the middle of an export can still skip a row (offset paging).

**Where:** `docs/components/profile.md:276`, `src/app/features/profile/my-spottings/my-spottings.component.ts:230`, `src/app/features/profile/data/profile.queries.ts:196`, `docs/COMPONENTS.md:202`

**Problem.** Enthusiasts keep spotting logs for years and will not trust a community site with them unless they can take the data out; this is also a GDPR data-portability expectation for a site that has a /gdpr page. The CSV helper and the owner-only event list already exist, but nothing connects them. Note that _ownEvents is paged (PAGE_SIZE with Load more), so a naive export would silently cover only the pages already loaded.

**Recommendation.** Add an 'Export' button (owner view only) to MySpottings that pages through GET_MY_EVENTS_QUERY until a short page is returned (reusing the existing offset loop, with a progress state), then calls the existing toCsv/downloadCsv with columns date, vehicle, line, type, status, notes, run number, origin, destination and media count, and offers a JSON variant. Add a spec for the row builder. No backend change.

**Verification.** profile.md:276 lists export as unwired. my-spottings.component.ts keeps _ownEvents paged with PAGE_SIZE 30 and appends per load, so the paging caveat is accurate. toCsv/downloadCsv exist in core/export.

<details><summary>Evidence</summary>

```text
my-spottings.component.ts:230  private readonly _ownEvents = signal<MyEvent[]>([]);
profile.md:276  Export historical spottings (CSV or JSON): `_ownEvents` already holds the caller's full history client-side, so a download action can serialize it with no backend change.
```

</details>

<a id="f348"></a>

#### F348 · Telegram bot linking: add copy and open-in-Telegram actions, a live region for the code, and a per-request cooldown

**low** · effort S · feature · gap-2 · partially confirmed

**Status, feature pass 2026-10-22:** Fixed (`efd8c12`, `9f83fff`, `52b7a0f`, `8afa4ed`, `f0c562c`) in the scope the verifier narrowed it to. The Telegram link code has a Copy button and sits in a `role="status"` region that announces it digit by digit. Request code is disabled while a request is in flight and while a code is live, and focus moves to Copy when the code arrives. **Left:** the "Open in Telegram" deep link and the "Linked as" status, which are outside the narrowed scope. The disabled button is a UI guard only.

**Where:** `src/app/shell/account-panel/account-panel.component.ts:92`, `src/app/shell/account-panel/account-panel.component.ts:98`, `src/app/shell/account-panel/account-panel.component.ts:164`

**Problem.** The rider has to read a 6-digit code and retype it into the Telegram bot within 60 seconds on a phone, switching apps. The code appears without a live-region announcement, the countdown is purely cosmetic (the backend does not enforce it), and clicking Request code repeatedly mints more codes. The account panel itself was never rendered with a real signed-in user in this audit, so its layout under a long display name is unverified.

**Recommendation.** Limit to a copy button, role=status on the code, and disabling the request button while a code is active.

_Original suggestion (corrected by the verifier):_ Add a 'Copy' button (navigator.clipboard with a toast) and an 'Open in Telegram' link using the bot's t.me deep link with the code as the start parameter, put role="status" aria-live="polite" around the code block, and disable Request code until the previous code expires. If the backend offers a status field, show 'Linked as @name' so users know the link succeeded.

**Verification.** The code and countdown display exist in account-panel. The backend-does-not-enforce-expiry claim, the t.me start-parameter deep link and the bot flow are unverified, and the finding admits the panel was never rendered signed in. Copy and live-region additions are fine polish, not a defect.

**Also reported as:** [F314](feature-opportunities.md#f348) [core-shell] Account panel: code is not copyable, hides while still valid, and the Telegram step needs a deep link (src/app/shell/account-panel/account-panel.component.ts:164, src/app/shell/account-panel/account-panel.component.ts:170); [F474](feature-opportunities.md#f348) [ux-home] Clarify the Account panel's Telegram linking copy and add code copy (src/app/shell/account-panel/account-panel.component.ts:69, src/app/shell/account-panel/account-panel.component.ts:99)

<details><summary>Evidence</summary>

```text
<span class="text-3xl font-bold tracking-widest tabular-nums">{{ code() }}</span>
<span class="text-muted-foreground text-xs">Expires in {{ countdown() }}s</span>
```

</details>

<a id="f510"></a>

#### F510 · Add bulk Approve / Hide / Mark completed on the links queue (the checkboxes only support grouping)

**low** · effort M · feature · console · severity adjusted from medium

**Where:** `src/app/features/console/insiden/links/links-selection-toolbar.component.html:20`, `src/app/features/console/insiden/links/link-queue-row.component.html:148`, `src/app/features/console/insiden/links/links.component.ts:1153`

**Problem.** The links triage queue has a full multi-select, a select-all checkbox and shift-free ticking, but the only bulk verb is 'Group into thread'. Clearing a backlog of community links (the main moderator job) means one click per row, each of which runs one to two mutations and a full refetch. The spotting queue has real bulk actions with shift-range selection, so the two queues are inconsistent.

**Recommendation.** Add 'Approve selected', 'Hide selected' and 'Complete selected' to the toolbar. The mutations are single-id, so loop sequentially over `scopedSelection()` using the existing private `sendLinkStatus` and `sendMarkCompleted`, collect per-row failures, call `fetchLinks()` once at the end, and report 'Approved 7 of 8; 1 failed: <url>'. Gate Hide behind the same `confirmThreadCoupling` check (summed over the selection). Reuse `useBulkActions` for shift-range selection so both queues behave alike.

**Verification.** The links-selection-toolbar's only action is 'Group into thread', and the selection checkboxes exist. Bulk status verbs are a legitimate feature suggestion.

<details><summary>Evidence</summary>

```text
links-selection-toolbar.component.html:21-29: <button hlmBtn size="sm" data-testid="group-selected" ...> Group into thread </button>
// the only action in the toolbar; Approve/Hide/Mark completed exist only per row
```

</details>

<a id="f512"></a>

#### F512 · Show the evidence a moderator needs in spotting rows: photos, stations and location

**low** · effort M · feature · console · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/console/data/console.queries.ts:13`, `src/app/features/console/console.page.html:255`

**Problem.** Each row can only say 'there are N photos'. The only way to inspect a photo or confirm a report is to open the Django admin through the event-id link in a new tab, one event at a time. The query also omits `originStation`, `destinationStation` and `location`, even though the free-search label says it searches 'notes, station, vehicle ID/nickname', so a moderator can match a row on a station they cannot see.

**Recommendation.** Select `originStation { displayName } destinationStation { displayName } location { id }` for the table and add a row expander or right-hand preview sheet (reuse HlmSheet) that lazily loads `medias` for the clicked event and shows thumbnails via the existing gallery MediaViewerComponent. Add j/k row navigation in the preview so a moderator can review a backlog without leaving the page.

**Verification.** The row only shows the media count, so photo preview is a plausible feature. The introspection claim about origin/destination fields was not rechecked, and it is a feature request rather than a defect.

<details><summary>Evidence</summary>

```text
console.page.html:256-258: @if (event.mediaCount > 0) { <span class="text-muted-foreground text-xs">📷 {{ event.mediaCount }}</span> }
EventScalar fields (introspection): ..., originStation, destinationStation, location, isRead, mediaCount, medias, isMine
```

</details>

<a id="f517"></a>

#### F517 · Add a keyboard-driven review flow with next/previous item in the detail sheets

**low** · effort M · feature · console

**Where:** `src/app/features/console/insiden/pending/pending.component.ts:421`, `src/app/features/console/insiden/links/links.component.ts:1498`

**Problem.** After approving from a sheet the sheet closes and the moderator must find and click the next row with the mouse. There are no keyboard shortcuts anywhere in the console (the only keyboard handling is Enter on a row), and rejection reasons must be typed from scratch each time.

**Recommendation.** Make the sheet navigate through the current rendered rows: after Approve or Reject advance to `rows()[index]` instead of closing, add `host` key bindings (`j`/`k` next/previous, `a` approve, `r` reject, `Esc` close; ignore when focus is in an input) and canned reject reasons (Duplicate, Not rail related, Insufficient detail) as chips above the reason textarea. Declare the shortcuts via the component `host` metadata and show a '?' help hint.

**Verification.** approveFromPanel closes the panel after success and no keyboard shortcuts exist. This is a feature suggestion, not a defect.

<details><summary>Evidence</summary>

```text
approveFromPanel(): const ok = await this.approve(row); if (ok) { this.closePanel(); }
```

</details>

<a id="f521"></a>

#### F521 · Offer 'lines that connect' alternatives when a saved line is disrupted, using Station.lines interchanges

**low** · effort M · feature · features · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/home/data/home-board.queries.ts:14`, `src/app/features/home/line-pulse/line-pulse-row.component.ts`, `src/app/core/preferences/preferences.service.ts:34`, `src/app/features/home/line-status/line-status-sheet.component.ts:262`

**Problem.** The board answers 'is my line OK and for how long' but stops there. The commuter's next question, 'what else can I take', is answered by nothing, even though the schema already encodes interchanges: Station.lines lists every line serving a station. When a pinned line is disrupted, the rider must work out the alternative by memory.

**Recommendation.** Defer behind the station page: reuse that page's stations store, and show interchange hints there first rather than on every pinned row.

_Original suggestion (corrected by the verifier):_ Add one lazy read (stations { id displayName lines { id } }, about 226 rows, cache it in a root store like SpottingLinesStore) and a pure util interchangeLines(lineId, stations) that returns, for a given line, the other lines it shares stations with, with the shared station names. On a Pinned line whose status is degraded, show an expandable 'Connects to' list under the row: 'KJL shares Ampang Park with MRT Putrajaya (Normal)', reusing the existing status badge. Be honest in the copy: the schema has no stop order or direction, so this is a connection hint and not route planning; a second step could let the user save a home and work station and show the direct or single-change lines between them (intersection of Station.lines), still without a backend change. Methodology registry entry required if the 'connects' rule is shown as a metric.

**Verification.** Station.lines exists in the schema, but the board queries select no stations and the idea is a connection hint without stop order. Real but speculative and low-value versus other items, and an extra 226-row read for a degraded-only hint is marginal.

<details><summary>Evidence</summary>

```text
Live data: 54 of 226 stations list two or more lines, for example Bandar Tasik Selatan -> ['ERL', 'KTM ETS', 'KTMK-SRL', 'LRT SPL'], Ampang Park -> ['LRT KJL', 'MRT PYL'], Abdullah Hukum -> ['KTMK-PKL', 'LRT KJL']. FRONT_PAGE_LINES_QUERY selects no stations at all.
```

</details>

<a id="f522"></a>

#### F522 · Add a global jump search for lines, vehicles by number and stations

**low** · effort M · feature · features

**Where:** `src/app/shell/app-nav`, `src/app/features/spotting/line-overview/vehicle-list/vehicle-list.component.ts:234`, `src/app/features/spotting/data/spotting-lines.store.ts`

**Problem.** An enthusiast who hears 'SCS 12' or 'train 148' on a group chat has to know the line, open the line, open the vehicle list, and find the unit. Commuters likewise cannot jump straight to a station or line by typing. The vehicle permalink was built to be shareable, but there is no quick way to reach one.

**Recommendation.** Add a command-style search (Spartan combobox is already in src/app/ui/combobox) in the nav, opened by '/' or Ctrl+K, backed by a root-provided SearchIndexStore that lazily loads lines (already cached in SpottingLinesStore), vehicles (612 rows, id, identificationNo, nickname, lines { id }) and stations on first open, and does case-insensitive prefix matching client-side. Navigate to /spotting/:lineId/vehicle/:vehicleId or /station/:id. A backend identificationNo filter on VehicleFilter would be needed only if the fleet grows beyond a few thousand rows.

**Verification.** No global search or Ctrl+K handler in shell (only a metaKey guard in pro-dashboard). VehicleFilter has only id/status/AND/OR/NOT/DISTINCT, so client-side index is the correct approach.

<details><summary>Evidence</summary>

```text
Live check: vehicles { id identificationNo nickname status lines { id } } returns 612 vehicles in about 73 KB uncompressed (1.2 s locally). VehicleFilter exposes only id, status, AND, OR, NOT and DISTINCT (no identificationNo), and rg -i search src/app/shell finds no search UI. Vehicle permalinks exist at /spotting/:lineId/vehicle/:vehicleId, but the only way in is through the line's vehicle list.
```

</details>

<a id="f523"></a>

#### F523 · Recognise contributors: a monthly top-contributors board and visible impact on reports

**low** · effort M · feature · features · partially confirmed · already documented

**Where:** `src/app/features/profile/data/profile.queries.ts:50`, `src/app/features/home/line-pulse/line-status-reports.component.ts`, `docs/components/home.md:1551`, `docs/components/profile.md:287`

**Problem.** The board is only as good as the volume of rider reports, and the only reward for a contributor today is a personal heatmap on their own profile. There is no public acknowledgement (no top contributors, no 'thanks to 14 riders'), and nobody learns whether a report helped. Recognition and feedback are the cheapest retention loop for volunteers.

**Recommendation.** Make the leaderboard opt-in and start with the 'thank you' state after submit; defer a public board until privacy rules are set.

_Original suggestion (corrected by the verifier):_ Backend: add a topContributors(period: MONTH|YEAR, limit) query that returns nickname, shortId and counts of spottings, line status reports and approved links, restricted to users whose nickname is already public (profile contract), plus a statusReportCount-style 'confirmations' count on a report. Frontend: a small 'Top contributors this month' card on /about or the profile page that links to the public profile, and a 'Your report was confirmed by N riders' toast or profile line. First slice without a backend change: show 'N reports in the last hour' attribution on the board that already exists (statusReportCount), and a 'Thank you' state after submit that links to the user's own profile stats.

**Verification.** Schema has no ranking query and only publicUser/user, so the backend change is correctly stated. But a public leaderboard raises privacy and gaming concerns and the no-backend slice is thin.

<details><summary>Evidence</summary>

```text
Live schema: only publicUser(id) and user exist for people, with no list or ranking query; UserScalar has spottingsCount, mediaCount, withMostEntries and spottingTrends, which the profile already charts. home.md:1551 records 'a verification count (sightings confirmed by a second report — no such relation exists on the sighting yet)' as roadmap, needing an additive backend aggregate.
```

</details>

<a id="f532"></a>

#### F532 · Backend operations the app does not use yet: severity counts per day and per month for an incident overview

**low** · effort M · feature · gap-3

**Where:** `src/app/features/insiden/insiden.page.ts:92`, `src/app/features/insiden/calendar/calendar.component.ts:244`

**Problem.** The incident calendar only ever shows a one-month list, so a rider cannot see how a line has fared over a year without paging month by month, and each month navigation pays for the complete incident records.

**Recommendation.** Use calendarIncidentsBySeverityCount(groupBy: MONTH, startDate, endDate) for a compact 'last 12 months at a glance' strip above the calendar (severity-coloured bars per month, tap to jump to that month), and groupBy: DAY to prefetch the dot indicators for adjacent months without loading incident bodies. It is one tiny query and gives the methodology page a natural source for 'incidents per month' trends. stationIncidents would similarly feed an incident history section on a station page.

**Verification.** A grep finds no document selecting calendarIncidentsBySeverityCount. The calendar groups severities client-side from the month list (calendar.component.ts:249). It is a reasonable low-priority feature suggestion.

<details><summary>Evidence</summary>

```text
schema: calendarIncidentsBySeverityCount(startDate: Date, endDate: Date, groupBy: GroupByEnum! = DAY): [CalendarIncidentGroupByDateSeverityScalar!]!  (selected by no document; calling it without dates returns 'start_date and end_date required').
Other schema roots no document selects: stationIncidents, assets, locations, buses, locationsCount, deleteCalendarIncident. insiden.page.ts loads a full month of incidents (21.7 KB for Feb 2023, up to 37.8 KB for a wider window) every time the month changes.
```

</details>

<a id="f546"></a>

#### F546 · Offer a line filter on the Rider feed; the store already supports it

**low** · effort M · feature · home-ui

**Where:** `src/app/features/home/data/home.store.ts:151`, `src/app/features/home/pro/pro-feed-widget.component.ts:227`, `src/app/features/home/home.page.ts:222`

**Problem.** A commuter on one line has to scan every link for the network, and the board's own per-line view does not link to a filtered feed. The plumbing (backend lineId variable, cursor reset, the URL ?line= helper) is built and tested for Pro, so Rider readers are the audience that lacks it.

**Recommendation.** Add a horizontally scrolling chip row above the tabs (All plus the reader's pinned lines from PreferencesService), bound to `store.setLineFilter()` and `?line=`, and make the board row's 'Details' or a 'Links for this line' action set the same filter. Hide it when the reader has no pinned lines to avoid a 14-chip row.

**Verification.** setLineFilter is only called from pro widgets, so the Rider feed has no line filter. It is a reasonable feature suggestion that reuses existing store plumbing.

<details><summary>Evidence</summary>

```text
rg setLineFilter: only pro/pro-feed-widget.component.ts:227 and pro/pro-dashboard.component.ts:230 call it; the Rider tab set has no filter control.
```

</details>

<a id="f549"></a>

#### F549 · Use the extraction result: it requests title, severity, lines and stations but only datetime and content are applied

**low** · effort M · feature · insiden-data

**Status, feature pass 2026-10-22:** Fixed (`2f075fa`, `8759fb1`, `8bc1d00`, `95fbc33`, `de86c4d`, `fe8db5e`, `19b1ac5`). The incident form's button is now "Fill from link": it fills the title, severity, lines and stations where they are empty and shows matched lines and stations as dismissible chips. The Gemini prompt carries the Kuala Lumpur date and time, the title is cut to the 64-character column, and an extracted time is refused when it is more than a day ahead or earlier than the Start date (or, with Start empty, 31 days ago). **Left:** Start is not filled from the extracted time, and the console review panel still applies only the datetime and content.

**Where:** `src/app/features/insiden/incident-form/extract-data.util.ts:24`, `src/app/features/insiden/data/incident-ai.service.ts:25`, `functions/src/api.ts:105`

**Problem.** The model is paid to produce title, indicator, severity, affected_lines and affected_stations, and the response is parsed and validated, but applyExtractionToChronology discards everything except datetime and content. Riders still have to choose severity, the lines and the stations by hand on a phone. The prompt also gives Gemini neither today's date nor the Malaysia time zone, so relative phrases ('yesterday 3pm') or year-less dates can be guessed wrongly, and the client does not sanity-check the returned datetime.

**Recommendation.** Add 'Fill from link' behaviour that (when the corresponding form fields are still empty) proposes title, severity, indicator and matches affected_lines and affected_stations to option ids via the reference data (case-insensitive label or code match), shown as accepted chips the user can dismiss. Pass the current Kuala Lumpur date and time zone in the prompt, and reject extracted datetimes more than a day in the future or older than the page date.

**Verification.** applyExtractionToChronology applies only datetime and content, and the docstring says so on purpose. buildPrompt requests title, severity, lines and stations but gives no current date or time zone. Its indicator and severity vocabularies (delay|disruption, minor|moderate) do not match the form enums (GREEN/RED, MAJOR/MINOR). This is a feature idea and needs a mapping layer.

<details><summary>Evidence</summary>

```text
return {
  ...draft,
  datetime: isoToDateTimeLocal(data.datetime) || draft.datetime,
  content: data.content ?? draft.content,
};
// ExtractedIncidentData also carries title, indicator, severity, affected_lines, affected_stations
```

</details>

<a id="f553"></a>

#### F553 · Add a permalink and share action per incident

**low** · effort M · feature · insiden-ui

**Where:** `src/app/features/insiden/incident-card/incident-card.component.html:1-3`, `src/app/features/insiden/insiden.page.ts:178-180`

**Problem.** Riders share disruptions in WhatsApp and Telegram groups, but there is no way to link to one incident or copy its text; the date URL lands on a day that can contain many incidents plus the pinned list.

**Recommendation.** Give each card `[id]="'incident-' + incident().id"`, scroll to and focus it when the URL fragment matches (`afterNextRender` plus `ViewportScroller`), and add a 'Share' button that calls `navigator.share` with the title, brief and URL when available, falling back to copying the link with a toast. Pair it with an Open Graph description per date for link previews.

**Verification.** This is a feature suggestion. The card root has no id and the only deep link is by date. It is valid and low priority.

<details><summary>Evidence</summary>

```text
The card root is `<div hlmCard class="gap-3 p-4">` with no id, and the only deep link is /insiden/:date.
```

</details>

<a id="f563"></a>

#### F563 · Feature: make the favourite train and history rows link to the vehicle page, and let visitors share a profile

**low** · effort M · feature · profile-about-misc · partially confirmed

**Status, feature pass 2026-10-22:** Fixed (`1b31f81`, `1960685`, `54e74b6`, `1ac5d01`). The favourite train and every history row link to the vehicle page, the owner has a "Copy profile link" button, and the tab is titled "<nickname> | MLPTF" once a profile loads. **Left:** a visitor has no copy-link action, because the recommendation scopes the button to the owner.

**Where:** `src/app/features/profile/user-card/user-card.component.ts:134-144`, `src/app/features/profile/my-spottings/my-spottings.component.ts:107-115`, `src/app/features/spotting/spotting.routes.ts:41`

**Problem.** Spotters care about the specific unit. Today a rider cannot jump from their favourite train or a history row to that vehicle's history, and a public profile cannot be shared meaningfully (the same static title, client-only render, no copy-link action).

**Recommendation.** Select `lines { id code }` and `vehicle { id }` in the profile queries and render the identification number as a routerLink to /spotting/<lineId>/vehicle/<vehicleId>. Add a 'Copy profile link' button (Clipboard API, toast on success) for the owner, and set the document title to '<nickname> | MLPTF' once the profile loads.

**Verification.** Vehicle identificationNo is rendered as plain text in the history rows, and the vehicle route exists. A reasonable low-value feature idea.

<details><summary>Evidence</summary>

```text
The favourite train card renders `{{ fav.vehicle.identificationNo }}` as plain text, and history rows render `{{ event.vehicle.identificationNo }} ({{ ... internalName }})` as text, while the app has a route `:lineId/vehicle/:vehicleId` under /spotting. Titles are static: `title: "MLPTF | Profile"`.
```

</details>

<a id="f575"></a>

#### F575 · Add previous/next, swipe, and a copy/share link to the photo viewer

**low** · effort M · feature · tracker-gallery · severity adjusted from medium · already documented

**Status, feature pass 2026-10-22:** Fixed (`280e620`, `907501c`, `26dcb5c`, `326c7d4`, `dee273d`, `562785f`). The photo viewer steps between photos with the arrow keys, a touch swipe and Previous and Next buttons (the URL is replaced, so Back returns to the grid), and a Share button uses the system share sheet on touch devices and copies the link elsewhere. **Left:** announcing a photo change to screen readers and preloading the neighbours. The feed drops repeated photos on the client. The backend has since added the primary key as the final sort key of the `medias` order (backend `7a02ef4`).

**Where:** `src/app/features/gallery/media-viewer/media-viewer.component.ts:62`, `src/app/features/gallery/gallery.page.ts:148`, `src/app/features/gallery/gallery.page.html:85`

**Problem.** The viewer is a single-photo dead end: to see the next picture the user has to close it and tap another tile. On a phone, swiping between photos is the expected behaviour. Sharing is the stated purpose of the `/gallery/:mediaId` URL, but there is no copy-link or system share button, so users copy the address bar manually. The docs already list both ideas; they matter because the page is public and meant to be shared.

**Recommendation.** Pass `prev`/`next` `MediaNode | null` inputs derived from the flat `edges()` list (and trigger `loadMore()` when `next` is null and `hasMore()`). Handle `ArrowLeft`/`ArrowRight` through host key bindings and a small pointer-event swipe (`pointerdown`/`pointerup`, threshold 50 px). Use `replaceUrl: true` when moving between photos so Back returns to the grid. Add a `Share` button: `navigator.share?.({ url, title })` on touch devices and `navigator.clipboard.writeText(url)` plus a toast otherwise.

**Verification.** Viewer takes a single media input and handles only Escape; docs/components/gallery.md already lists prev/next as a gap. It is a feature request.

<details><summary>Evidence</summary>

```text
readonly media = input.required<MediaNode>();
readonly close = output<void>();
// No neighbour input, no ArrowLeft/ArrowRight, no pointer handling, no share action
```

</details>

<a id="f576"></a>

#### F576 · Offer shareable tracker URLs and a geolocation shortcut for riders

**low** · effort M · feature · tracker-gallery · already documented

**Where:** `src/app/features/tracker/data/layer-selection.service.ts:21`, `src/app/features/tracker/map/tracker-map.component.ts:67`

**Problem.** The map always opens at the whole of Peninsular Malaysia (zoom 6.5) with nothing selected, so a Klang Valley commuter has to zoom, find the right feed and press Apply on every visit, and a link to a particular view cannot be sent to a friend or posted in a chat. This is the single biggest friction for the product's core audience.

**Recommendation.** Serialise applied layers and the camera into query params (`?rt=ktmb,prasarana-rapid-bus-kl&c=101.69,3.14&z=11`) through `withComponentInputBinding` inputs on `TrackerShellPage`, with `replaceUrl` updates on `moveend`. Persist the last choice in `localStorage` (try/catch guarded) as the default, and add a `Near me` button that calls `navigator.geolocation.getCurrentPosition` behind a user gesture and `scene.setCenter`. Default the first-time view to the Klang Valley bounds rather than the whole peninsula.

**Verification.** Map center and zoom are hardcoded to peninsula view and applied layers are not persisted or URL-encoded. Feature suggestion, low severity.

<details><summary>Evidence</summary>

```text
readonly appliedRealtimeChecked = signal<Record<string, boolean>>({});
readonly appliedStopsChecked = signal<Record<string, boolean>>({});
readonly appliedRailway = signal(true);
// center: [101.492, 4.5], zoom: 6.5  hard-coded in the Scene options
```

</details>

<a id="f584"></a>

#### F584 · Add a 'my line' glance and first-visit line picker to the hero

**low** · effort M · feature · ux-home · severity adjusted from medium

**Where:** `src/app/features/home/line-pulse/network-board.component.ts:375`, `src/app/features/home/hero/home-hero.component.ts:297`, `src/app/core/preferences/preferences.service.ts`

**Problem.** Pinned lines already exist and sort first, but a new visitor discovers them only through a 12px hint buried at the bottom of the viewport and under the sticky bar (and, at 390 px, overlapping other text). The product's core job for rail commuters is a personal, three-second yes or no on their usual line or two, and that path is currently hidden.

**Recommendation.** On first visit show a one-time 'Which lines do you ride?' chip picker (multi-select of the lines already in HomeStore.lines()) directly under the hero headline, writing to the same PreferencesService pinned set. Once set, render a 'My lines' summary inside the hero: 'KJL - running normally, updated 40 s ago' with a text status plus icon, and replace the bottom hint. Keep Dismiss for people who do not want it.

**Verification.** The pin hint is a small text hint inside the collapsed quiet row, and the screenshot shows it overlapping. Pinning exists but a first-visit picker or 'My lines' glance does not, so this is a valid feature suggestion.

<details><summary>Evidence</summary>

```text
<span>Pin your lines to see them first</span>   // tiny hint inside the collapsed 'All lines' row, shown only after the board has loaded and only while that row is collapsed
_showPinHint() && !_quietExpanded()
```

</details>

<a id="f597"></a>

#### F597 · Show lift and escalator status per station and let riders report breakages

**low** · effort L · feature · features · partially confirmed · severity adjusted from medium · already documented

**Status, feature pass 2026-10-22:** Partly fixed (`8516719`, `fc4b084`, `e9997c2`, backend `7e9fc20`). Phase 1 is done: the backend exposes `Asset.status` as an enum with a filter, and Station Assets reads it and shows an "In service" or "Out of service" badge per asset, with a note that the MLPTF team sets the status and riders do not report it live. **Left:** rider reporting of breakages, which needs a backend mutation and a rule for turning reports into a status, and asset seeding. The local database holds no assets, so the badge is proven by spec fixtures and not by live data.

**Where:** `docs/components/spotting.md:100`, `src/app/features/spotting/data/spotting.queries.ts:400`, `src/app/features/spotting/line-details/station-assets-section/station-assets-section.component.ts:100`

**Problem.** Lift and escalator outages are a high-impact, low-visibility problem for wheelchair users, parents with prams and older riders, and the Station Assets tab is the right place for it. Today it can only list which assets exist; without a status or a way to report one, it is empty chrome. The local database has zero assets, so even the listing is unproven.

**Recommendation.** Phase it: first expose Asset.status read-only and seed data; add rider reporting only once assets are populated.

_Original suggestion (corrected by the verifier):_ Backend: expose Asset.status (and a lastStatusChange timestamp) on the Strawberry Asset type, add a reportAssetStatus mutation shaped like submitLineStatusReport (login required, one report per user per asset per few hours, assetId, status, notes) and an aggregate 'currently reported out of service' state with a confidence rule similar to the line board. Seed assets from the operators' published station facility lists. Frontend: show an 'Out of service' badge in station-assets-section, a 'Report a problem' button on each row (reusing the line report sheet pattern), and later a 'Step-free route may be affected' note on the station page. Register the rule in the methodology registry.

**Verification.** Asset type in live schema has no status and spotting.md says the backend model has one, so the gap is real. But local DB has zero assets and it needs a new mutation, moderation and data seeding, so it is a large speculative effort.

<details><summary>Evidence</summary>

```text
spotting.queries.ts:400  * Line.stations[].assets — station-level infrastructure (lifts, escalators…) ... Read-only today: the backend model has a
 * `status` field (under/in maintenance) but doesn't expose it over GraphQL yet

Live schema: Asset { id assetType officialid shortDescription longDescription stations }; assets query returns 0 rows locally; Mutation list has no asset mutation.
```

</details>

<a id="f598"></a>

#### F598 · Localise the UI into Bahasa Malaysia (then Chinese), starting with the rider board and report flow

**low** · effort L · feature · features · partially confirmed · severity adjusted from medium

**Where:** `src/index.html:2`, `package.json`, `src/app/features/home/data/network-summary.util.ts`, `src/app/features/home/line-status/line-status-sheet.component.ts:395`

**Problem.** The audience is Klang Valley commuters, and a large share read Bahasa Malaysia, Chinese or mixed Manglish first. Only the English UI exists, so status wording ('Crowded', 'Backlogged', 'Delayed'), the report chooser, and the safety-relevant notices are less usable by exactly the people the board is for, and there is no hreflang or lang signal for search engines either. Doing this late is expensive because copy is spread across templates and utility files.

**Recommendation.** Ask the maintainer about demand first; a cheaper start is externalizing board and report-flow strings and using LOCALE_ID instead of hard-coded en-GB.

_Original suggestion (corrected by the verifier):_ Use Angular's build-time i18n (@angular/localize with the application builder, which supports SSR with a per-locale server build and path prefixes /ms/ and /zh/), so there is no runtime cost and no translation service to maintain. Order of work: (1) extract the strings of the network board, status labels (passengerMetric/lineStatus labels), report chooser and line-status sheet with i18n attributes and $localize in the pure utils; (2) ship ms first, with a language switcher in the nav stored in PreferencesService and a Vary: Accept-Language redirect on first visit only; (3) replace the hard-coded 'en-GB'/'en-US' Intl locales with LOCALE_ID; (4) set <html lang> per locale and add hreflang links. Measure the build-time impact first, since each locale adds a full build and the largest lazy chunk is already 3.7 MB. Keep user-generated incident text untranslated.

**Verification.** No @localize or transloco exists and html lang is en, so the gap is real. The effort is very large (per-locale SSR builds on App Hosting) and the finding offers no evidence of demand; it is a product decision, not an optimization.

<details><summary>Evidence</summary>

```text
src/index.html:2  <html lang="en">
rg for @angular/localize, $localize, i18n attributes, transloco and ngx-translate across package.json, angular.json and src/app finds nothing. All user-facing copy is hard-coded English in templates and in pure utils (for example the toast text 'Couldn't reach the server. Check your connection and try again.'). Dates use fixed locales: new Intl.DateTimeFormat("en-GB", ...) in home/line-pulse/line-status-chart.component.ts:23.
```

</details>

<a id="f599"></a>

#### F599 · Feature: self-service account data export and deletion from the profile

**low** · effort L · feature · profile-about-misc · partially confirmed · severity adjusted from medium · already documented

**Where:** `src/app/features/profile/user-card/user-card.component.ts:147-161`, `src/app/features/profile/data/profile.queries.ts:172-179`

**Problem.** The site collects identity, spotting history, photos and votes, yet the profile gives no way to download or erase them, and the privacy page lists those rights as unmet. This is what a privacy notice would have to promise, and it is a common support request for community apps.

**Recommendation.** Add a 'Your data' section to the privacy sheet. Phase 1 (frontend only): a 'Download my data' button that serialises the already-loaded history using core/export/csv.util.ts plus a JSON of profile and links. Phase 2 (backend first): a `deleteMyAccount` mutation that anonymises the user, removes media and deletes the Firebase Auth account, with a typed-confirmation sheet in the profile.

**Verification.** The profile has only the privacy checkbox, so no export or delete exists, but the backend mutation absence is unconfirmed here. A reasonable feature suggestion rather than a defect.

<details><summary>Evidence</summary>

```text
Introspection of Mutation lists updateUser, deleteEvent, addEvent, ... but no deleteUser, deleteAccount or exportMyData; the only privacy control on the profile is the single 'Share Historical Spotting Data' checkbox.
```

</details>
