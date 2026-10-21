# Performance, bundle and SSR hydration

Part of the [rosak_firebase audit, 2026-10-21](../2026-10-21.md). 64 findings, most severe first.

Closed sheets, zero-filled grids and eager SDKs inflate SSR HTML, TransferState and the initial bundle, while several routes are slow or blank on first render. Most fixes are lazy-loading or query changes.

<a id="f012"></a>

#### F012 · Make /gallery server rendering stop waiting on the year-count aggregate (25-35 s vs 0.7 s for the photos)

**high** · effort S · data-fetching · performance · partially confirmed

**Where:** `src/app/features/gallery/gallery.page.ts:104`, `src/app/features/gallery/data/gallery.queries.ts:3`, `src/app/features/gallery/data/gallery.queries.ts:55`, `docs/components/gallery.md:29`, `src/app/app.routes.server.ts:49`

**Problem.** The 6.8 s you measured is almost entirely one query. The year slider's mediasGroupByPeriod call is documented as cheap, but its own comment in gallery.queries.ts says the backend loads every media row, and timing shows it is 30-100 times slower than the actual 24-photo page. graphqlResource goes through httpResource, so Angular SSR holds the response until it settles, and the whole page waits on a decorative slider. The wait buys nothing visible, because the server HTML contains no photos at all (raw img count 0 of 24; the justified grid only lays out after afterNextRender). Slow SSR renders also tie up App Hosting's concurrency of 20 per instance. My timings ran while the machine's load average was 2.6 to 10.8, so absolute seconds are inflated, but the ranking is stable.

**Recommendation.** Short term: make the year-count read browser-only, using the isBrowser field that already exists on line 78: graphqlResource(() => this.isBrowser ? { query: MEDIA_YEAR_COUNTS_QUERY } : undefined), and reserve the aside's height so the slider appearing does not shift layout. Then the server only waits on the 0.2-0.7 s photo page, and if you also skip that call on the server until photos can be server-rendered (see the grid finding), SSR becomes near-instant. Backend follow-up: compute year counts with a SQL GROUP BY and cache it for minutes. Update docs/components/gallery.md, which calls the query cheap.

**Verification.** Ranking reproduced but not the magnitude: mediasGroupByPeriod(type: YEAR) took 6.9 s and 9.4 s vs medias(first:24) 0.07 s, and /gallery SSR took 7.5 s at load average 0.8 (not 25-35 s). Server HTML has 0 img tags, and the stale 'cheap' comment in gallery.queries.ts and gallery.md is real.

**Second check (high-severity pass).** code review: holds (high). Reproduced. A direct POST of `mediasGroupByPeriod(type: YEAR){year count}` to localhost:8000/graphql/ took 26.5 s, while `medias(first:24)` took 0.63 s. `curl localhost:4321/gallery` returned 200 after 27.3 s and the HTML contained 0 `<img>` tags. The ng-state script holds the transferred year-count response. gallery.page.ts:104 creates `graphqlResource(() => ({ query: MEDIA_YEAR_COUNTS_QUERY }))` unconditionally. graphqlResource is built on httpResource, which holds the SSR render until it settles. The photo list uses `graphql.request` and is quick. The year slider is the only consumer of the year counts, so the server really waits 25+ s on a slider that renders empty in the HTML. graphqlResource accepts a requestFn returning undefined, so `this.isBrowser ? {...} : undefined` works. The `isBrowser` field is declared at line 78, before line 104, so field order is fine. gallery.queries.ts:3 does say the resolver loads every media row, which contradicts the 'cheap' wording in docs/components/gallery.md and in the comment above the query. Caveat: the 26 s was measured on a loaded local dev backend, so production numbers may differ, but the ranking (about 40 times slower than the photo page) is clear. Skipping the call on the server also means the client has to fetch it after hydration, since there is no transferred state. The slider then appears about as late as before, but the HTML no longer blocks on it. impact review: holds (high). gallery.page.ts line 104 creates graphqlResource(() => ({ query: MEDIA_YEAR_COUNTS_QUERY })) with no browser guard, and graphqlResource is built on httpResource, so SSR holds the response until the request settles. The comment in gallery.queries.ts confirms that mediasGroupByPeriod loads every media row, so a very slow aggregate (13-35 s in the local measurements) blocks the whole server-rendered response for a decorative slider. The timings were taken on a loaded machine against a local backend, so the absolute seconds are inflated, but the ranking (aggregate far slower than the 24-photo page) is credible from the code comment alone. Slow SSR on a public, indexable route is a real hot-path cost for every visitor and for crawlers. The fix is minimal, uses the existing isBrowser field, and fits the repo conventions.

**Fix note from the second check.** The short-term fix is correct and small, and no change to its size is needed. Add `min-height` to the aside so the slider appearing does not shift layout. The real cure is backend-side: compute year counts with a SQL GROUP BY and cache them. Correct the 'cheap' wording in docs/components/gallery.md and in the gallery.queries.ts comment. Apply the one-line guard: graphqlResource(() => this.isBrowser ? { query: MEDIA_YEAR_COUNTS_QUERY } : undefined). Reserve the aside height so the slider does not shift the layout, and update docs/components/gallery.md, which calls the query cheap. A backend GROUP BY plus cache is a good follow-up but not required for this fix.

**Also reported as:** [F006](performance-bundle-and-ssr-hydration.md#f012) [gap-3] Keep the decorative year-count query out of /gallery server rendering (SSR measured 18 to 24 s) (src/app/features/gallery/gallery.page.ts:104, src/app/features/gallery/data/gallery.queries.ts:65); [F021](performance-bundle-and-ssr-hydration.md#f012) [tracker-gallery] Gallery server render blocks on a year-count query that takes 15 to 39 seconds (src/app/features/gallery/gallery.page.ts:104, src/app/features/gallery/data/gallery.queries.ts:65); [F288](performance-bundle-and-ssr-hydration.md#f012) [ux-insiden-gallery] Year counts query blocks gallery server rendering for 20+ seconds and the year navigation stays empty (src/app/features/gallery/gallery.page.ts:104, src/app/features/gallery/gallery.page.html:54)

<details><summary>Evidence</summary>

```text
gallery.page.ts:104  private readonly yearCountsResource = graphqlResource<MediaYearCountsQueryData>(() => ({ query: MEDIA_YEAR_COUNTS_QUERY }));
gallery.queries.ts:3  "the resolver loads and returns every media row that has ever existed on every call"
Measured against localhost:8000: mediasGroupByPeriod(type: YEAR) 13.3, 27.6, 34.7, 25.1 and 29.0 s; medias(first:24) 0.22-0.98 s; { __typename } 0.07-0.24 s. GET /gallery on :4321 took 14.8-29.6 s wall time.
```

</details>

<a id="f035"></a>

#### F035 · Stop mounting the spotting and link forms on every home load; they put 137 KB of unused reference data into the SSR HTML

**high** · effort M · performance · home-ui

**Where:** `src/app/features/home/home.page.ts:484`, `src/app/features/home/home.page.ts:486`, `src/app/features/home/home.page.ts:496`, `src/app/features/spotting/report-form/report-form.component.ts:92`, `src/app/features/insiden/link-form/link-form.component.ts:249`, `src/app/ui/sheet/sheet.ts:40`

**Problem.** HlmSheet only draws its panel after the first open, but its projected children are created by the host page anyway. So HomePage instantiates ReportFormComponent and LinkFormComponent (through app-link-sheet) at construction. Both declare unconditional graphqlResource() reads, so the server renders them, waits for them before the page is stable, and serialises the answers into TransferState. Two reference queries, which list every vehicle in the fleet, account for about 137 KB of the 141 KB state blob and about 58 percent of the HTML bytes. Most visitors never open either sheet. The same code also ships in the home chunk (report-form is 17 KB and link-form 13 to 21 KB of output, plus the shared forms chunk) and creates two extra effects-heavy components per visit.

**Recommendation.** Create the forms only once their sheet has been opened. Cheapest form: wrap each form in `@defer (when reportSheet.isOpen())` (and `linkSheet.isOpen()` inside app-link-sheet), and replace the `#reportFormRef` template reference with `viewChild(ReportFormComponent)` the way LinkSheetComponent already does with `linkFormRef`, so the footer buttons keep working after the block resolves. A defer block never renders on the server, so the SSR HTML and TransferState shrink by about 137 KB, the SSR stability wait stops depending on two fleet-wide queries, and the code leaves the home chunk. If the missing slide-in animation on first open matters, add `prefetch on idle` so the chunk is warm but the queries still wait for the open. Add a server-render spec asserting that the ng-state contains no LinesAndVehicles or InsidenReferenceData entry for `/`.

**Verification.** Re-measured live: HTML 236,066 B, ng-state 141,200 B with two entries of 69,603 and 67,626 B (lines/vehicles lists). HlmSheet only draws its panel after _everOpened, but projected children (report-form, link-form) are still instantiated by the host, and both declare unconditional graphqlResource reads.

**Second check (high-severity pass).** code review: holds (high). home.page.ts mounts `<app-link-sheet />` and `<app-report-form #reportFormRef>` inside `<hlm-sheet>` unconditionally. HlmSheet only gates its panel on `_everOpened`, and projected content is still instantiated. LinkSheetComponent embeds `<app-link-form>` the same way. Both forms call `graphqlResource` unconditionally (report-form.component.ts:92 and link-form.component.ts:250, INSIDEN_REFERENCE_QUERY). I curled the SSR build at `/`. The HTML is 236,081 B and the ng-state is 141,215 B. It contains entries of 69,606 B (LinesAndVehicles) and 67,629 B (the insiden reference data), about 137 KB combined, as claimed. Every home visit pays this, and SSR waits for both fleet-wide queries (about 1.8 s each when measured directly). The recommended `@defer (when ...isOpen())` is sound: defer blocks do not render on the server, and `viewChild` already works in LinkSheetComponent. The same unconditional link-sheet also appears in insiden.page.html and situasi-section, so the fix should cover those hosts too. impact review: holds (high). HomePage mounts <app-report-form> inside <hlm-sheet> and also mounts <app-link-sheet>. Projected content is instantiated regardless of the sheet's @if, so both fleet-wide reference queries run on SSR and are serialised into TransferState. The home page is the landing page and the hottest path, and the measured cost is about 137 KB of the 141 KB state blob, which is large for mostly mobile commuters. The @defer(when isOpen) fix is sound and the #reportFormRef to viewChild change is needed. One risk is that the first open may lack its slide-in animation and may show a brief empty body, so the suggested prefetch on idle is worthwhile.

**Fix note from the second check.** The recommended fix is fine. Apply it inside LinkSheetComponent itself, wrapping `<app-link-form>` in `@defer (when linkSheet.isOpen())`, so all three hosts (home, insiden, situasi) benefit from one change. For the report form, use `@defer (when reportSheet.isOpen())` plus `viewChild`, or the lazy `requestFn` variant. Skip `prefetch on idle` unless the missing first-open animation is noticed. Same latch or @defer approach as F017. Make sure home.page.spec.ts, which pins the sheet creation order, still passes, and keep the chooser mounted first.

**Also reported as:** [F005](performance-bundle-and-ssr-hydration.md#f035) [gap-3] Do not fetch reference data for closed sheets: 125 KB of JSON is serialised into the home page HTML (src/app/features/home/home.page.ts:484, src/app/features/home/home.page.ts:496); [F008](performance-bundle-and-ssr-hydration.md#f035) [home-data] Stop two closed sheets from fetching 136 KB of reference data during SSR of the home page (src/app/features/home/home.page.ts:484, src/app/features/home/home.page.ts:496); [F036](performance-bundle-and-ssr-hydration.md#f035) [insiden-data] Stop fetching and serialising the 61 KB reference dataset for closed sheets on Home and Insiden (src/app/features/insiden/incident-form/incident-form.component.ts:149, src/app/features/insiden/link-form/link-form.component.ts:249); [F039](performance-bundle-and-ssr-hydration.md#f035) [performance] Stop mounting the three report/link forms (and their fleet-wide reference queries) on first render (src/app/features/home/home.page.ts:484, src/app/features/home/home.page.ts:496)

<details><summary>Evidence</summary>

```text
home.page.ts:496  <app-report-form #reportFormRef (submitted)="onSpottingSubmitted($event)" />
home.page.ts:484  <app-link-sheet />
report-form.component.ts:92  private readonly linesAndVehiclesResource = graphqlResource<LinesAndVehiclesQueryData>(() => ({ query: LINES_AND_VEHICLES_QUERY }));
Measured on curl http://localhost:4321/ : HTML 236,080 B; ng-state script 141,214 B; two GraphQL entries of 69,606 B (LinesAndVehicles) and 67,629 B (InsidenReferenceData); each query takes 0.54 to 0.88 s warm against the local API.
```

</details>

<a id="f046"></a>

#### F046 · Vehicle detail downloads the whole line fleet to show one vehicle and starts its history and incident queries only after that finishes

**high** · effort M · data-fetching · spotting

**Where:** `src/app/features/spotting/vehicle-detail/vehicle-detail.page.ts:170`, `src/app/features/spotting/vehicle-detail/vehicle-detail.page.ts:67`, `src/app/features/spotting/vehicle-detail/vehicle-detail.page.ts:132`, `src/app/features/spotting/vehicle-detail/vehicle-detail.page.ts:146`

**Problem.** The page needs one vehicle but fetches the roster of up to 116 vehicles with notes and counts, a payload about 40 times larger. The incident timeline and spotting-history components sit inside the `@else if (_vehicle())` block, so their queries are created only after the large query resolves. That serialises three round trips on the slowest request and delays the first useful paint on a deep link. The same path also sends the big payload to the browser inside TransferState.

**Recommendation.** Add a small VEHICLE_QUERY (`vehicles(filters:{id:$id}){ ...header fields }`) for the header and status board and keep the line roster only for the vehicle-switcher combobox (load it after the header, or reuse the shared per-line store from the next finding). Move `<app-incident-timeline>` and `<app-spotting-history>` out of the `@if` so they request in parallel; they only need `vehicleId()`. Show their skeletons immediately.

**Verification.** vehicle-detail.page.ts fetches VEHICLE_TYPES_QUERY for the whole line, and incident-timeline and spotting-history are nested inside `@else if (_vehicle(); as vehicle)`, so their queries start only after it resolves.

**Second check (high-severity pass).** code review: holds (medium). vehicle-detail.page.ts builds its only header query from VEHICLE_TYPES_QUERY with variables { lineId } and then runs .find((v) => v.id === this.vehicleId()) on the whole line roster. The templates for <app-incident-timeline> and <app-spotting-history> sit inside the @else if (_vehicle(); as vehicle) branch, so they are only created, and their queries only sent, after the roster resolves. Both components take only vehicleId(). The backend does accept vehicles(filters:{id}); I ran it for the header fields and got 1,087 bytes in about 1.2 s, and the page already uses that filter for VEHICLE_SPOTTING_HISTORY_QUERY. One detail is overstated: the page's own spottingHistoryResource is a class field and starts immediately, so the chain is two stages (roster, then timeline and history), not three round trips. Severity is medium rather than high because the cost is one extra round trip plus a 37 KB payload (the finding's own measurement, taken against a debug backend), not a broken page. impact review: holds (high). VehicleDetailPage runs VEHICLE_TYPES_QUERY for the whole line (variables { lineId }) and then picks one vehicle. The incident timeline and spotting history sit inside the `@else if (_vehicle(); as vehicle)` block, so their queries only start after that large query resolves. That serialises the requests on every deep link to a vehicle, which is the usual way commuters arrive. The measured numbers (37 KB in 4.6 s versus 961 B in 0.74 s) are plausible, and a single-vehicle query with `vehicles(filters:{id})` already exists at spotting.queries.ts:268.

**Fix note from the second check.** Smaller fix, in two steps. First, move <app-incident-timeline> and <app-spotting-history> out of the @if so they request in parallel. Second, add a one-vehicle query (vehicles(filters:{id:$id}) with the header fields) for the header and status board, and load the line roster only for the vehicle-switcher combobox. Smaller fix: move `<app-incident-timeline>` and `<app-spotting-history>` out of the @if so they load in parallel, since they only need vehicleId(). Then use the existing single-vehicle query for the header and load the line roster only for the switcher combobox. Do the parallel-load change first because it is a few lines and needs no new query.

**Also reported as:** [F595](performance-bundle-and-ssr-hydration.md#f046) [ux-spotting] Vehicle page downloads and SSR-renders the whole line fleet to show one vehicle (about 6 s response) (src/app/features/spotting/vehicle-detail/vehicle-detail.page.ts:170, src/app/features/spotting/vehicle-detail/vehicle-detail.page.ts:188)

<details><summary>Evidence</summary>

```text
query: VEHICLE_TYPES_QUERY, variables: { lineId: this.lineId() }   // whole line, then .find((v) => v.id === this.vehicleId())
} @else if (_vehicle(); as vehicle) {
  ...<app-incident-timeline [vehicleId]="vehicleId()" />   ...<app-spotting-history [vehicleId]="vehicleId()" />
Measured: VehicleTypesByLine for line 4 = 37,198 bytes in 4.6 s; vehicles(filters:{id}) with the same header fields = 961 bytes in 0.74 s.
```

</details>

<a id="f047"></a>

#### F047 · Gallery HTML contains no images: the grid lays out in JavaScript after hydration, which causes layout shift and slow LCP

**high** · effort M · ssr-hydration · tracker-gallery

**Where:** `src/app/features/gallery/justified-grid/justified-grid.component.ts:73`, `src/app/features/gallery/justified-grid/justified-grid.component.ts:30`, `src/app/features/gallery/data/justified-layout.util.ts:1`

**Problem.** On the server `containerWidth` is 0, so `computeJustifiedRows` returns no rows and each year section renders a heading above an empty div. After hydration the `ResizeObserver`/`afterNextRender` code sets the width, and the whole grid appears at once, pushing the Load more button, the in-feed ad and the footer down (large cumulative layout shift). Image downloads cannot start until JS has loaded, hydrated and run layout, so LCP is delayed and no-JS crawlers or link previews see an empty gallery even though the route is SSR for exactly that purpose.

**Recommendation.** Use a CSS-only justified layout that needs no measured width: render each row container as `flex flex-wrap` and each item as `<div [style.flex-grow]="aspect*100" [style.flex-basis.px]="aspect*220"><i class="block" [style.padding-bottom.%]="100/aspect"></i><img class="absolute inset-0 size-full object-cover"></div>`, with a trailing `<div class="grow-[1000]">` spacer so the last row is not stretched. This renders identically on server and client, removes the `ResizeObserver`, `containerWidth` and `computeJustifiedRows`, and gives every tile an aspect-ratio box. Keep the util only if you want pixel-exact rows.

**Verification.** containerWidth starts at 0 and is set only in afterNextRender, so computeJustifiedRows yields no rows on the server; SSR HTML has empty grids and causes layout shift.

**Second check (high-severity pass).** code review: holds (high). I curled http://localhost:4321/gallery. The response was 61 KB with 0 occurrences of <img, and the justified grid was server-rendered as <app-justified-grid ngh="6"><div class="flex flex-col" style="gap: 6px;"><!----></div></app-justified-grid> under the <h2>2024</h2> heading. That matches the code. containerWidth is signal(0), it is only set inside afterNextRender, and computeJustifiedRows returns [] when containerWidth <= 0. gallery.page.html puts the Load more button, the in-feed ad slot and the footer after the grid, and the empty grid has no reserved height. So the layout shifts when the grid appears after hydration, and crawlers or link previews see no photos. The images also carry loading="lazy". The only part I did not reproduce is the LCP impact, but it follows from the images not existing until after JS runs. impact review: holds (high). On the server containerWidth is signal(0), so computeJustifiedRows returns no rows and the SSR HTML has no img tags. After hydration the grid pops in and pushes content down, which causes layout shift, and image fetches start late. This hits every gallery visitor, mostly on phones, and crawlers and link previews see an empty gallery. The code confirms the width is only set inside afterNextRender.

**Fix note from the second check.** The proposed flex-grow and flex-basis CSS layout, with a padding-bottom aspect box per tile and a trailing grow spacer, is the right small fix and needs no new dependency. If pixel-exact rows matter, the cheaper alternative is to keep the util and reserve space (an aspect-ratio box or min-height) in the SSR output. The CSS flex-grow justified layout is sound and consistent with Tailwind-only and removing the ResizeObserver. A cheaper first step is to keep the current layout but give the empty container a min-height and render a skeleton, which cuts the layout shift but not the late LCP. Check that MediaNode carries width and height (aspect), otherwise the CSS approach needs a backend field or a fallback ratio.

**Also reported as:** [F246](performance-bundle-and-ssr-hydration.md#f047) [performance] Gallery thumbnails are invisible to the server and lazy-loaded, so the LCP photo is discovered only after hydration (src/app/features/gallery/justified-grid/justified-grid.component.ts:41, src/app/features/gallery/justified-grid/justified-grid.component.ts:67)

<details><summary>Evidence</summary>

```text
curl http://localhost:4321/gallery: 59,888 B of HTML, 0 occurrences of `<img`, 24 `i.imgur.com` URLs only inside the ng-state JSON.

this.containerWidth.set(element.clientWidth);   // inside afterNextRender; signal(0) on server
return []  // computeJustifiedRows when containerWidth <= 0
```

</details>

<a id="f049"></a>

#### F049 · Deep links to a photo page through the whole feed one request at a time, including during SSR

**high** · effort M · data-fetching · tracker-gallery

**Where:** `src/app/features/gallery/gallery.page.ts:136`, `src/app/features/gallery/gallery.page.ts:225`, `src/app/features/gallery/gallery.page.ts:258`, `src/app/features/gallery/gallery.page.ts:233`

**Problem.** A shared photo link must walk the connection in 100-item pages (about 1.2 s each plus a 200 ms delay) until it finds the id. A photo from the older of the two years in the data (2,856 photos, roughly 29 pages) would take around 40 seconds, with no loading indicator for the viewer (only the year slider reacts to `isJumping`), and users see only a gallery behind it. The effect runs on the server too, because `RenderMode.Server` runs component effects, so the SSR response for such a link makes up to 100 sequential backend calls, which can exceed proxy timeouts and means link-preview bots never get a result. If the photo has been removed, the user waits the full walk before seeing the not-found toast. No per-photo title or `og:image` can be set either, so shared links preview as a generic page.

**Recommendation.** Backend: add `media(id: ID!)` (or support Relay `node(id:)`) and a `createdYear`/date filter on `medias`. Frontend: when `mediaIdParam` is set, fetch that one record first, open it immediately, and load the feed independently; set `Title`/`Meta` (`og:image` using the `h` imgur size) from it for SSR. Until the backend exists, skip the walk on the server (`if (!this.isBrowser) return` inside the effect body) and show a spinner overlay in the browser while `isJumping()`; as a stop-gap `medias` cursors are `arrayconnection:<offset>`, so a known offset could be requested directly, but that depends on an implementation detail and on counts matching, so prefer the backend fix.

**Verification.** openMediaById pages through the connection via loadUntil with 200 ms delays, and no single-media query exists on the backend. The constructor effect also runs during SSR.

**Second check (high-severity pass).** code review: holds (high). The introspected Query type has only medias(order, before, after, first, last), with no media(id) or node(id). openMediaById calls loadUntil, which pages 100 items at a time with a 200 ms setTimeout between pages, until the id is found. The only loading indicator is isJumping, and it is passed only to the year slider. I reproduced the SSR behaviour against the production build. A photo at offset 250 returned 200 with <app-media-viewer> in 13.7 s, so the server does walk several pages. The oldest photo (id of offset 2855, a valid id) returned 302 with location: /gallery after 29 s, so the shared link was lost entirely on the server. A deep link therefore costs seconds of sequential calls on the server and again in the browser, and no per-photo title or og:image exists (the response has 0 og:image). Timings are inflated by the machine being loaded, but the sequential walk and the lack of a by-id query are confirmed. impact review: holds (high). openMediaById walks the Relay connection through loadUntil, one page at a time with a delay between pages, because the backend has no media(id) query. The effect runs on the server too, so an SSR render of /gallery/:id for an old photo can chain many sequential backend calls. Shared photo links are the main reason people land on this route, and the viewer sees no spinner (only the year slider reacts to isJumping) and gets no per-photo meta tags. The not-found case also waits for the whole walk.

**Fix note from the second check.** The backend fix (media(id) or node(id)) is the right one; the frontend then opens that one record immediately and loads the feed independently. As a cheap stop-gap, skip the walk when !this.isBrowser and show a spinner while isJumping(). Do not rely on arrayconnection offsets. The real fix is a backend media(id) query, then open that photo first and load the feed independently. As an immediate cheap step, skip the walk on the server (`if (!this.isBrowser) return` in the effect) and show a spinner while isJumping() is true in the browser. Do not use the arrayconnection offset trick, as it depends on an implementation detail.

<details><summary>Evidence</summary>

```text
while (!isFound() && this.hasMore() && pagesLoaded < MAX_JUMP_PAGES) {
  if (!(await this.loadMore(JUMP_PAGE_SIZE))) { ... }
  ...
  await new Promise((resolve) => setTimeout(resolve, JUMP_REQUEST_DELAY_MS));
}
...
this.selectedMedia.set(this.edges().find((e) => e.node.id === id)!.node);

Introspection of Query: only `medias(order,before,after,first,last)`; there is no media(id) or node(id).
```

</details>

<a id="f002"></a>

#### F002 · Sentry Session Replay and feedback code is downloaded on every first load

**medium** · effort S · performance · deps-tooling · partially confirmed · second check set severity high → medium

**Where:** `src/main.ts:43-52`, `.omo/evidence/audit-2026-10-21/build/stats.json (outputs browser/main-PHLJPND6.js imports browser/chunk-A8PJBogX.js with kind import-statement)`

**Problem.** The comment's rationale does not hold. Calling addIntegration after bootstrap defers only the start of recording, not the download. main-PHLJPND6.js statically imports chunk-A8PJBogX.js, so the replay and feedback code is fetched and parsed before the first paint on every route. That is roughly 216 KB raw and about 97 KB of brotli transfer for code that most sessions never run, since only 10% of sessions are replay-sampled (replaysSessionSampleRate: 0.1) and the feedback widget is opened on demand.

**Recommendation.** Move replayIntegration and feedbackIntegration into a small module loaded with dynamic import() after bootstrap (or on first Report a bug click for feedback), and keep Sentry.getFeedback() calls after that load resolves. Do not use lazyLoadIntegration, which fetches integration bundles from the Sentry CDN and is meant for CDN installs. Then confirm chunk-A8PJBogX.js is no longer an import-statement of main.

_Original suggestion (corrected by the verifier):_ Load the replay and feedback integrations lazily after bootstrap with Sentry's lazyLoadIntegration helper (exported by @sentry/angular 10; confirm the exact signature in the SDK typings), then pass the returned integration to Sentry.addIntegration. For the feedback widget, load it when the user first opens the Report a bug action, but make sure Sentry.getFeedback() is only called after that load completes. Then re-run npm run build and confirm chunk-A8PJBogX.js is no longer an import-statement of main.

**Verification.** Confirmed in the scratch metafile: main-PHLJPND6.js statically imports chunk-A8PJBogX.js, which holds @sentry/replay (155,773 B) and @sentry/feedback (60,605 B), and main.ts line 30 still registers feedbackIntegration statically. The fix is wrong for an npm-installed SDK: lazyLoadIntegration is the CDN script loader, so it should be replaced by a dynamic import() of the replay and feedback integrations behind a module that main does not reference statically.

**Second check (high-severity pass).** code review: partially (medium). The mechanism holds. stats.json shows main-PHLJPND6.js importing chunk-A8PJBogX.js with kind import-statement. The served SSR HTML at localhost:4321 has `<link rel="modulepreload" href="chunk-A8PJBogX.js">`. The chunk is 334,729 bytes and I measured 97,341 bytes brotli. Its contents are @sentry/replay 155,773 B, @sentry/core 111,399 B, @sentry/feedback 60,605 B, @sentry/browser 41,384 B and @sentry/browser-utils 37,401 B. In main.ts, `addIntegration(replayIntegration())` after bootstrap defers only the start of recording, not the download, so the code comment is wrong. The size claim is overstated. About half of that chunk (@sentry/core, browser and browser-utils, roughly 190 KB raw) is needed by Sentry.init in main anyway and would stay in the initial path. Only the replay and feedback code, about 216 KB raw (my rough guess is 60 to 65 KB brotli, not re-measured), is genuinely avoidable, not the quoted 97 KB. The feedback half is also not a simple move. feedbackIntegration is in Sentry.init, and app-nav.component.ts:457, compact-nav.component.ts:262, app-nav-icon-tray.component.ts:330 and compact-nav.component.ts:268 call `Sentry.getFeedback()?.…`. Until feedback has loaded these silently do nothing: setTheme is skipped, and the Report a bug click opens no form. Whether a dynamic import of the same Sentry package actually splits into its own chunk could not be checked without a build, which was out of bounds. Overall this is a real but moderate cost, a tens-of-KB brotli saving across all routes, so medium rather than high. impact review: partially (medium). The core claim holds. main.ts calls Sentry.replayIntegration() inside .then() after bootstrap, but it is a static import from @sentry/angular. The bundler therefore puts replay, feedback and part of core into a chunk that main imports statically. Deferring the call defers recording only, not the download. That is about 97 KB of brotli transfer on every first load, which matters on mobile. The stated effort of S is understated. feedbackIntegration is also created eagerly inside Sentry.init, and Sentry.getFeedback() is called in app-nav, compact-nav and app-nav-icon-tray. Moving feedback behind a dynamic import means reworking those three call sites and the Report a bug flow. @sentry/core is shared (about 111 KB of the chunk), so the real saving is nearer 215 KB raw than the full chunk size.

**Fix note from the second check.** Start with replay only. Replace `.then(() => Sentry.addIntegration(Sentry.replayIntegration()))` with a dynamic `import("@sentry/browser").then(m => Sentry.addIntegration(m.replayIntegration()))`, ideally behind requestIdleCallback. Rebuild and check stats.json that replay code is no longer in an import-statement chunk of main. Leave feedback alone unless every getFeedback() caller is made to await the lazy load first. Do not use lazyLoadIntegration, which pulls from the Sentry CDN. Do replay first, since it is the easy part. Wrap it in const { replayIntegration } = await import('@sentry/browser') or the equivalent dynamic import after bootstrap, then call Sentry.addIntegration. Treat feedback as a separate step. Load it on first click of Report a bug and guard every getFeedback() call. Then check the stats.json output to confirm the chunk is no longer an import-statement of main. Do not use lazyLoadIntegration, which pulls bundles from the Sentry CDN.

**Also reported as:** [F242](performance-bundle-and-ssr-hydration.md#f002) [performance] Load Sentry Replay and Feedback after first paint: they are 52% of the 335 KB Sentry chunk that every page downloads eagerly (src/main.ts:18, src/main.ts:30)

<details><summary>Evidence</summary>

```text
main.ts:47-51: "Deferred until after bootstrap via addIntegration() so the replay bundle (and its Sentry-internal dependencies) stay out of the critical initial-load path" ... ".then(() => Sentry.addIntegration(Sentry.replayIntegration()))". Metafile: chunk-A8PJBogX.js is 334,729 bytes raw and holds @sentry/replay 155,773 B, @sentry/core 111,399 B and @sentry/feedback 60,605 B. build.log estimated transfer for that chunk: 97.25 kB.
```

</details>

<a id="f017"></a>

#### F017 · The report form's 69 KB LinesAndVehicles query fires on every /spotting page, rides in SSR TransferState and slows server rendering

**medium** · effort S · data-fetching · spotting · second check set severity high → medium

**Where:** `src/app/features/spotting/spotting-shell/spotting-shell.page.ts:60`, `src/app/features/spotting/report-form/report-form.component.ts:92`, `src/app/features/spotting/data/spotting.queries.ts:119`, `src/app/ui/sheet/sheet.ts:42`

**Problem.** HlmSheet only renders its panel after the first open, but projected content is still instantiated, so the form (and its resource) is created as soon as the shell mounts. Every visitor, including the majority who never open the form and every crawler, downloads every vehicle of every line, and the server waits for it before sending HTML because requests contribute to stability. It is 83 percent of the page's transferred state on /spotting/3.

**Recommendation.** Mount the form only when needed. Simplest: in the shell wrap the sheet content in `@if (reportSheet.hasEverOpened()) { ... }` (add a latch signal to ReportSheetService), moving the footer buttons inside that block so #reportFormRef is in scope. Or issue the query lazily from the form (`requestFn` returns undefined until `reportSheet.isOpen()` has been true once). Longer term, fetch only the chosen line's vehicles with `vehicles(filters:{lineId})` when the line is picked, which cuts the payload to under 5 KB.

**Verification.** spotting-shell puts <app-report-form> inside hlm-sheet content; HlmSheet's @if(_everOpened) only gates ng-content rendering, but projected components are still instantiated, so the form's graphqlResource LINES_AND_VEHICLES fires on mount. The recommended latch or lazy requestFn fits the stack.

**Second check (high-severity pass).** code review: holds (medium). The shell template at spotting-shell.page.ts puts `<app-report-form #reportFormRef .../>` inside `<hlm-sheet>`. HlmSheet only wraps its `<ng-content/>` in `@if (_everOpened())`, but projected content is instantiated by the parent regardless, so ReportFormComponent is created on mount and its `graphqlResource(LINES_AND_VEHICLES_QUERY)` fires (report-form.component.ts:92). I curled the production SSR build at /spotting/3. The 285 KB HTML carries an 83,037 B ng-state, of which 69,605 B is the LinesAndVehicles entry, matching the finding. Hitting the API directly returns 69,515 B in about 1.8 s, and the entry is serialised into TransferState, so SSR waited for it. The query has no other consumer. Severity is medium rather than high because the cost is a 70 KB payload plus roughly 1 to 2 s of SSR wait on /spotting pages only. The home page has the same problem, which is F035. impact review: holds (medium). The shell puts <app-report-form> inside <hlm-sheet>. The sheet only wraps <ng-content> in @if (_everOpened()), but Angular still creates projected children, so the form's graphqlResource(LINES_AND_VEHICLES_QUERY) runs on every /spotting page, including on the server. Every visitor and crawler pays for about 69 KB and 2.5 s that most never use. The harm is slower SSR and larger HTML on one feature area, not wrong data, so I rate it medium rather than high.

**Fix note from the second check.** Smallest fix: make the form's request lazy. Have `requestFn` return `undefined` until the sheet has been opened once. Alternatively wrap the form in `@if (reportSheet.hasEverOpened())` and move the footer buttons into that block. The `@defer (when reportSheet.isOpen())` plus `viewChild` approach from F035 is equivalent. Skip the long-term per-line vehicles refactor for now. Smallest fix: add a latch signal to ReportSheetService and wrap the form in @if or @defer so it is created on first open. Keep the footer buttons working by moving them inside the block or by using viewChild instead of #reportFormRef. Ideally share one component with F035, because the same form is mounted on home.

<details><summary>Evidence</summary>

```text
<app-report-form #reportFormRef (submitted)="reportSheet.setOpen(false)" />
...
private readonly linesAndVehiclesResource = graphqlResource<LinesAndVehiclesQueryData>(() => ({ query: LINES_AND_VEHICLES_QUERY }));
Measured: POST LinesAndVehicles = 69,513 bytes in 2.47 s; SSR /spotting/3 ng-state is 83,038 bytes of which 69,606 are this query; total 285 KB HTML in 3.6 to 9.7 s.
```

</details>

<a id="f018"></a>

#### F018 · Line details grid asks the backend to zero-fill its data: 10,672 rows (694 KB) where only 232 are non-zero

**medium** · effort S · performance · spotting · second check set severity high → medium

**Where:** `src/app/features/spotting/data/spotting.queries.ts:341`, `src/app/features/spotting/line-details/vehicle-spotting-grid/vehicle-spotting-grid.data.util.ts:127`

**Problem.** The grid already treats a missing key as zero (`?? 0`), so `addZero: true` buys nothing but payload: about 98 percent of the rows are zeros. The data is sent over the wire, parsed, deep-compared by retainDataIfEqual on every revalidation, copied into a Map of 10k entries, and embedded in the SSR HTML. It repeats for every month-window change.

**Recommendation.** Set `addZero: false` in LINE_SPOTTING_GRID_QUERY. Nothing else changes because spottingCountFor defaults to 0 and _maxCount takes Math.max(1, ...). Update the spec fixtures in vehicle-spotting-grid.data.util.spec.ts if they assume zero rows. Also replace `Math.max(1, ...this._countsByKey().values())` (vehicle-spotting-grid.component.ts:685) with a reduce so a very large window cannot exceed the argument limit.

**Verification.** LINE_SPOTTING_GRID_QUERY sets addZero: true, and spottingCountFor already does `?? 0` while _maxCount uses Math.max(1, ...). The only cited rationale is a doc comment about 'no holes', which the lookup default already covers.

**Second check (high-severity pass).** code review: holds (high). LINE_SPOTTING_GRID_QUERY passes `addZero: true`. The only consumer of the rows is `buildCountsByKey` into a Map, read through `spottingCountFor(...) ?? 0` and `aggregateSpottingsFor`. Nothing uses `.has` or `.size` on that map, so a missing key already means zero and zero rows are pure payload. I fetched the production SSR page /spotting/4/details. Its ng-state holds the grid entry at 694,605 B with 10,672 rows, and only 232 have count>0, exactly as claimed. The whole ng-state is 857 KB in a 2.5 MB HTML that took about 13 s. Against the local API for a line-4 window, `addZero:true` returned 460,773 B in 2.4 s (7,076 zero rows) while `addZero:false` returned 833 B in 1.1 s. The code comment saying zero-fill avoids holes is outdated, because the grid fills holes itself. No spec fixture uses `count: 0`, so no tests need changing. Only the Math.max spread note is overblown: about 10k arguments is far below V8's limit, so that part is optional polish. impact review: holds (medium). LINE_SPOTTING_GRID_QUERY sends addZero: true, but spottingCountFor already returns `?? 0`. The grid's vehicle rows come from vehicleTypes, not from the trend rows, so dropping the zero rows cannot remove a vehicle row. The payload is 694 KB against 15 KB, and the grid is rebuilt per month window, so the cost is real. Only the line-details page is affected, and it sits behind a click, so medium is the fairer severity. The query at line 381 already uses addZero: false, so the change is consistent with the repo.

**Fix note from the second check.** Set `addZero: false` in LINE_SPOTTING_GRID_QUERY and update the doc comment above it. Treat the Math.max-to-reduce change as optional. Set addZero: false and update the comment at spotting.queries.ts:327. Check that the spec fixtures do not assume zero rows. The Math.max spread change is optional polish, not needed for this finding.

**Also reported as:** [F013](performance-bundle-and-ssr-hydration.md#f018) [performance] Drop addZero:true from the spotting grid query: 694 KB of zero rows to show 232 real counts (src/app/features/spotting/data/spotting.queries.ts:341, src/app/features/spotting/line-details/vehicle-spotting-grid/vehicle-spotting-grid.data.util.ts:159)

<details><summary>Evidence</summary>

```text
vehicleSpottingTrends(start: $start, end: $end, dateGroup: DAY, typeGroup: false, freeRange: false, addZero: true)
...
return countsByKey.get(`${vehicleId}|${dateKey}`) ?? 0;
Measured on /spotting/4/details SSR: the grid state entry holds 10,672 rows (693,680 bytes as JSON); filtering count>0 leaves 232 rows (15,080 bytes).
```

</details>

<a id="f065"></a>

#### F065 · HoverPreloadStrategy never preloads on hover and never targets the 3.7 MB tracker chunk

**medium** · effort S · performance · core-shell

**Where:** `src/app/core/routing/hover-preload.strategy.ts:33`, `src/app/core/routing/hover-preload.strategy.ts:45`, `src/app/features/tracker/tracker.routes.ts:6`, `src/app/app.routes.ts:40`, `src/app/shell/app-nav/app-nav.component.ts:298`

**Problem.** Angular's RouterPreloader only calls strategy.preload() after a NavigationEnd event, so hovering or focusing the Tracker link merely adds a string to a Set and nothing is fetched until the next navigation completes, at which point an unrelated click can trigger a background download of the tracker route. Even when it does run, only the parent route's loadChildren (the tiny tracker.routes.ts file) is loaded; the child route that imports tracker-shell.page (the 3.71 MB raw / 678 KB transferred chunk) carries no data.preload, so the strategy returns of(null) for it. The result is that clicking Tracker on a phone still waits for the full chunk, and preloadSubjects and isPreloaded are dead code.

**Recommendation.** Drop the custom strategy and call the dynamic import directly from the link handlers: preloadTracker() { void import('../../features/tracker/tracker-shell.page'); } on pointerenter, focus and (for touch) pointerdown/touchstart, guarded by navigator.connection?.saveData and an 'already requested' flag. Remove withPreloading(HoverPreloadStrategy) and the unused data: { preload: 'hover' }. If the strategy is kept, set data.preload on the child route and have preloadRoute() trigger the load itself.

**Verification.** preloadRoute only adds a string to a Set. preload() runs only after a NavigationEnd and only the parent route has data.preload, so it loads tracker.routes and not the child tracker-shell.page chunk. Hovering therefore does not fetch the heavy chunk.

**Also reported as:** [F397](performance-bundle-and-ssr-hydration.md#f065) [performance] The hover preload strategy never preloads the 3.7 MB tracker chunk (src/app/core/routing/hover-preload.strategy.ts:43, src/app/app.routes.ts:37); [F443](performance-bundle-and-ssr-hydration.md#f065) [test-gaps] Hover preloading of the tracker route does not fetch the chunk on hover (src/app/shell/app-nav/app-nav.component.ts:174, src/app/shell/app-nav/app-nav.component.ts:298-300)

<details><summary>Evidence</summary>

```text
preloadRoute(routePath: string): void { ... this.preloadedRoutes.add(routePath); }   // only records a string
...
if (route.data?.["preload"] === "hover" && this.preloadedRoutes.has(route.path ?? "")) { return timer(50).pipe(mergeMap(() => load())); }
// tracker.routes.ts: { path: "", loadComponent: () => import("./tracker-shell.page")... }  (no data.preload)
```

</details>

<a id="f096"></a>

#### F096 · After hydration the hero headline and two tile labels vanish for a moment and the page shifts (CLS about 0.12 on a phone)

**medium** · effort S · ssr-hydration · home-ui

**Where:** `src/app/ui/info-popover/info-popover.ts:136`, `src/app/features/home/hero/home-hero.component.ts:138`, `src/app/features/home/hero/home-hero.component.ts:246`, `src/app/features/home/hero/home-hero.component.ts:267`

**Problem.** InfoPopover opts out of hydration, so Angular discards the server markup inside every app-info-popover and rebuilds it on the client. The headline h1 and the two tile labels are projected content of exactly those hosts, so they disappear and come back. Everything below the hero, which is the board and the report CTAs, moves up by 54 to 70 px and then back, which is over the 0.1 CLS threshold, and a polite live region that is destroyed and recreated can also be announced again on every load.

**Recommendation.** Keep projected text out of skip-hydration hosts: render the h1 and the tile labels as normal hero template nodes and let only the small (i) trigger and its panel live inside InfoPopover (same restructure as the h1 finding). If the popover must keep projecting, reserve the space with a fixed min-height on the headline row so the rebuild cannot change layout. Re-run the layout-shift observer above as the acceptance check.

**Verification.** info-popover host has ngSkipHydration with a comment stating its server markup is discarded and re-rendered, and the h1 and tile labels are projected into those hosts. Layout-shift numbers are plausible and consistent with that mechanism.

<details><summary>Evidence</summary>

```text
Playwright at 390x844 against http://localhost:4321/, two runs, identical: layout-shift entries of 0.0606 at hydration (hero-stats y 194 to 140, hero-actions 427 to 357) and 0.0617 about 240 to 450 ms later (back to 194 and 427). A DOM sample at the dip shows the hero at 393 px instead of 463 px with innerText "Refreshing in 0s 14 Lines normal 0 0 0 Links today ...", so the h1 text and the labels "Needs attention" and "Reports now" are missing. info-popover.ts:136  ngSkipHydration: "",
```

</details>

<a id="f120"></a>

#### F120 · Move root-level provideMarkdown, ng-recaptcha-2 and the Home store classes out of main.js (about a third of the initial bundle)

**medium** · effort S · performance · performance

**Where:** `src/app/app.config.ts:17`, `src/app/app.config.ts:18`, `src/app/app.config.ts:177`, `src/app/app.routes.ts:4`, `src/app/app.routes.ts:24`, `src/app/features/insiden/incident-card/incident-card.component.ts:15`

**Problem.** Three static imports in always-loaded files drag feature code into main.js. provideMarkdown() in app.config.ts imports ngx-markdown and marked (69 KB attributed) although only IncidentCardComponent renders markdown. The ng-recaptcha-2 import in the same file (used only by the admin console) brings 4 KB plus the 47.5 KB @angular/forms runtime into main. app.routes.ts imports HomeStore and its dependencies (home queries, methodology.content.ts) just to list them in the home route's providers, so about 46 KB of home-only code is in the entry bundle for every route. Together that is about 115 KB attributed, roughly a third of main.js, parsed on every page including /methodology and the 404 page.

**Recommendation.** 1) Delete provideMarkdown() from app.config.ts and add it to IncidentCardComponent's providers array (or to the routes that render the card). 2) Provide RECAPTCHA_V3_SITE_KEY, ReCaptchaV3Service and RecaptchaLoaderService in the console route's providers instead of the root config. 3) Replace the home route's eager providers with loadChildren: () => import('./features/home/home.routes') whose route object carries the providers, so HomeStore and its queries land in the lazy home chunk. Re-run the build and compare main.js, which should drop from 290 KB to roughly 175 KB.

**Verification.** main-PHLJPND6.js really contains marked 53 KB, ngx-markdown 16 KB, @angular/forms 47 KB (imported by ng-recaptcha-2), methodology.content.ts 18 KB and home.store/home-feed.queries from app.routes.ts. ng-recaptcha-2 is used only by console.page; markdown only by incident-card. Forms would still ship in a shared lazy chunk (ui/checkbox), just not in main.

**Also reported as:** [F066](performance-bundle-and-ssr-hydration.md#f120) [core-shell] Move ngx-markdown and the Home store out of the initial bundle (about 107 KB raw) (src/app/app.config.ts:18, src/app/app.config.ts:177); [F074](performance-bundle-and-ssr-hydration.md#f120) [deps-tooling] Eager markdown provider pulls marked and ngx-markdown into the main bundle for every route (src/app/app.config.ts:173-177, src/app/features/insiden/incident-card/incident-card.component.ts:15); [F116](performance-bundle-and-ssr-hydration.md#f120) [insiden-ui] provideMarkdown() at the application root puts marked and ngx-markdown in the initial bundle (about 69 KB raw) (src/app/app.config.ts:177, src/app/features/insiden/incident-card/incident-card.component.ts:15); [F430](performance-bundle-and-ssr-hydration.md#f120) [security] Move provideMarkdown() out of the root config: marked and ngx-markdown add about 69 KB raw to the initial bundle (src/app/app.config.ts:177, src/app/features/insiden/incident-card/incident-card.component.ts:15); [F484](performance-bundle-and-ssr-hydration.md#f120) [ux-insiden-gallery] Move ngx-markdown and marked out of the initial bundle (src/app/app.config.ts:177, src/app/features/insiden/incident-card/incident-card.component.html:379)

<details><summary>Evidence</summary>

```text
app.config.ts:18  import { provideMarkdown } from "ngx-markdown";
app.config.ts:177  provideMarkdown(),
app.routes.ts:24  providers: [HomeStore, HomeViewModeService, LineStatusSheetService],
main-PHLJPND6.js (289,986 B) attributed bytes: marked 53,194; @angular/forms 47,564 (imported by ng-recaptcha-2 and ui/checkbox); ngx-markdown 15,821; methodology.content.ts 18,007; home-feed.queries.ts 12,938; home.store.ts 11,161; ng-recaptcha-2 4,060.
```

</details>

<a id="f121"></a>

#### F121 · Realtime tracker polls and ticks while the tab is hidden: 23 feeds at 30 s each plus a 100 ms timer per feed

**medium** · effort S · performance · performance

**Where:** `src/app/features/tracker/data/gtfs-realtime.service.ts:15`, `src/app/features/tracker/data/gtfs-realtime.service.ts:71`, `src/app/features/tracker/data/gtfs-realtime.service.ts:109`, `src/app/features/tracker/data/layer-config.ts:28`, `src/app/core/polling/polling-source.ts:140`

**Problem.** PollingSource (home, line pages) pauses on document.hidden, but RtSource, used by the tracker, only stops on route leave. A rider who opens the map and then switches apps keeps downloading and protobuf-decoding every enabled feed (up to 23 are selectable) every 30 s on the main thread. Each source also runs a 10 Hz setInterval that writes two signals, which keeps the main thread and battery busy even when the countdown ring is not visible or refresh is set to never. Separately, the layer-config endpoints for the data.gov.my API omit the trailing slash, which makes every poll take a 301 redirect marked cache-control: private before the real request.

**Recommendation.** Copy the PollingSource approach: on visibilitychange hidden call pause(), and on visible resume() with a catch-up fetch only if the deadline passed. Drop the ticker to 1 Hz (or drive the ring with a CSS animation using the scheduled duration) and stop it when interval is null. Change each endpoint in layer-config.ts to the canonical trailing-slash form (for example .../vehicle-position/ktmb/ and .../prasarana/?category=rapid-bus-kl) to remove the redirect hop. I did not decode a feed in this audit; the Rapid Bus KL feed was 10,343 B and KTMB 428 B at midday, so decode cost is small at this size and the saving is mainly idle network, wakeups and battery.

**Verification.** No visibilitychange or document.hidden handling exists under features/tracker, and RtSource runs a 100 ms setInterval plus 30 s fetch per feed. curl to api.data.gov.my/gtfs-realtime/vehicle-position/ktmb returned HTTP 301 with location .../ktmb/, and layer-config.ts uses the slashless URLs.

**Also reported as:** [F149](performance-bundle-and-ssr-hydration.md#f121) [tracker-gallery] Pause polling when the tab is hidden and reconsider the 10 second option (src/app/features/tracker/data/gtfs-realtime.service.ts:15, src/app/features/tracker/data/gtfs-realtime.service.ts:71)

<details><summary>Evidence</summary>

```text
gtfs-realtime.service.ts:15  const TICK_MS = 100;
gtfs-realtime.service.ts:71  this.tickInterval = setInterval(() => this.tick(), TICK_MS);
layer-config.ts:31  "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-kl"
No visibilitychange or document.hidden anywhere under src/app/features/tracker. curl of the KTMB endpoint without the trailing slash: HTTP 301, cache-control: private, then 200.
```

</details>

<a id="f122"></a>

#### F122 · Verify and add response compression: the Express server sends identity-encoded HTML and JavaScript

**medium** · effort S · performance · performance · already documented

**Where:** `src/server.ts:83`, `src/server.ts:94`, `MISTAKES.md:35`

**Problem.** server.ts has no compression middleware, express.static serves files as stored, and Angular's SSR response is written as-is. If the App Hosting front end does not compress for you, every first visit transfers about 1.1 MB of identity-encoded JS and CSS plus up to 236 KB of HTML instead of about 330 KB total, which matters for the mostly-mobile audience. The earlier MISTAKES note recorded the missing header on staging but no fix was made. I could not test the real App Hosting edge from this sandbox, so this needs one production check.

**Recommendation.** Run curl -sI -H 'Accept-Encoding: br, gzip' against production for / and a hashed chunk. If there is no content-encoding, add the compression middleware before express.static and the SSR handler (gzip is fine; skip already-compressed images), or precompress build output to .br at deploy time and serve it with a static-compression middleware. Record the result in MISTAKES.md.

**Verification.** Local curl with Accept-Encoding gzip returned no content-encoding for / and server.ts has no compression middleware; MISTAKES.md line 35 records the staging App Hosting response had no content-encoding. Production remains unchecked, as the finding itself says.

**Also reported as:** [F403](performance-bundle-and-ssr-hydration.md#f122) [platform] Verify and, if needed, add response compression for HTML and JS (src/server.ts:28, src/server.ts:94)

<details><summary>Evidence</summary>

```text
curl -H 'Accept-Encoding: gzip, br' localhost:4321/ -> no content-encoding header, 236,072 B. Same for main-PHLJPND6.js (290,036 B) and chunk-CcIT6ec22.js (3,714,954 B).
Measured gzip -9: / HTML 34,513 B, main.js 84,766 B, tracker chunk 955,592 B, styles 17,280 B.
MISTAKES.md:35  "The staging response had no `content-encoding` and no `cache-control` before the change."
```

</details>

<a id="f123"></a>

#### F123 · Extend the edge cache policy beyond `/`: /methodology renders in 0.28 s of pure markup yet is never cached

**medium** · effort S · performance · performance · already documented

**Where:** `src/server-cache-control.ts:22`, `src/server.ts:101`, `MISTAKES.md:39`

**Problem.** Only the home page gets s-maxage. Every other SSR route re-renders on every request, including pages that are identical for all visitors because auth.service.ts renders the server as logged-out. With concurrency 20, one vCPU and minInstances 0 (documented as an open cold-start problem), a crawler or a link posted in a chat group can pin an instance on a multi-second gallery or details render. The documented rule protects authenticated routes, but those are already RenderMode.Client, so the remaining Server routes carry no per-user data.

**Recommendation.** Turn homeCacheControl into a small path-to-policy table with the same spec coverage: /methodology public, s-maxage=600, stale-while-revalidate=3600; /gallery and /insiden/** and /spotting/** public, s-maxage=30, stale-while-revalidate=300; never cache non-200 responses or any response that sets a cookie. Add cases to server-cache-control.spec.ts. This also shields the backend from repeated slow aggregate queries.

**Verification.** server-cache-control.ts returns a policy only for path '/', and curl /methodology shows no Cache-Control. The MISTAKES rule exists to protect authenticated routes, which are all RenderMode.Client, so public Server routes could safely be cached. Individual TTLs should be chosen per route freshness needs (votes on insiden).

**Also reported as:** [F130](performance-bundle-and-ssr-hydration.md#f123) [seo-pwa-i18n] Shareable SSR routes are slow to render and never cached at the edge (src/server-cache-control.ts:22, src/app/app.routes.server.ts:50); [F414](performance-bundle-and-ssr-hydration.md#f123) [platform] Mark staging responses noindex and extend the edge cache policy beyond the home page (public/robots.txt:3, src/server-cache-control.ts:22)

<details><summary>Evidence</summary>

```text
server-cache-control.ts:22  if (method !== "GET" || path !== "/" || status !== 200 || existingCacheControl !== null) { return null; }
Measured: curl /methodology -> 77,235 B, no Cache-Control header, 0.28-0.45 s. /gallery 14.8-29.6 s, /insiden 4.8 s, /spotting/4/details 6.1 s, /spotting/4 9 s under load.
MISTAKES.md:39  "Keep the cache header on `GET /` only so authenticated and other routes never inherit it."
```

</details>

<a id="f124"></a>

#### F124 · The photo viewer downloads the original full-size Imgur file (about 0.9 MB) with no size hint

**medium** · effort S · performance · performance

**Where:** `src/app/features/gallery/media-viewer/media-viewer.component.ts:47`, `src/app/features/gallery/data/imgur.util.ts:9`, `src/app/features/gallery/data/gallery.queries.ts:21`

**Problem.** The grid correctly uses the pre-sized m thumbnail, but the viewer (also the page behind every shared /gallery/:id deep link) loads the uploader's original, which can be 3000 px wide, into an element that is at most 70vh tall. The query already returns width and height, so the browser could reserve the box, and imgur.util.ts already knows the l (640 px) and h (1024 px) suffixes.

**Recommendation.** Use getImgurThumbnail(url, 'h') as the default source (and 'l' on small screens through srcset/sizes), add width and height attributes from media().width and media().height, show the already cached m thumbnail as a blurred placeholder while it loads, and offer an Open original link for people who want full resolution. Mark this image fetchpriority=high on a deep link.

**Verification.** media-viewer.component.ts line ~47 binds media().file?.url directly with no size hint or width/height, while imgur.util.ts already supports l and h suffixes. Exact 938 KB figure not re-measured but the mechanism is plain.

**Also reported as:** [F481](performance-bundle-and-ssr-hydration.md#f124) [ux-insiden-gallery] Gallery thumbnails are capped at 320 px and the viewer loads the original file (src/app/features/gallery/justified-grid/justified-grid.component.ts:86, src/app/features/gallery/data/imgur.util.ts:9)

<details><summary>Evidence</summary>

```text
media-viewer.component.ts:47-51  <img [src]="media().file?.url ?? '/image-not-found.png'" alt="" class="max-h-[70vh] max-w-full rounded-lg object-contain lg:max-h-full" />
Measured /gallery/:id: 25 images, 1,428 KB total; the 24 grid thumbnails were 490 KB on /gallery, so the single opened photo is about 938 KB. LCP element is that i.imgur.com image.
```

</details>

<a id="f136"></a>

#### F136 · Return-to-page revalidation fires for every retained page of the same kind, not only the one being shown

**medium** · effort S · performance · spotting

**Where:** `src/app/core/routing/revalidate-on-return.ts:40`, `src/app/features/spotting/line-overview/line-overview.page.ts:267`, `src/app/features/spotting/vehicle-detail/vehicle-detail.page.ts:228`, `src/app/features/spotting/line-details/situasi-section/situasi-section.component.ts:161`

**Problem.** The predicates are path patterns that know nothing about the component's own lineId or vehicleId. ReusableRouteStrategy keeps up to 10 detached pages alive, and every one of them still has its router subscription. When the user re-enters any line page, all retained line pages reload their data; entering a vehicle page reloads every retained vehicle page (two queries each). The situasi and insiden pollers use the same pattern test, so a detached details page for another line keeps polling while any details URL is open. After browsing a few lines this is a burst of 2 to 5 second queries on every back navigation.

**Recommendation.** Make the predicate instance-aware: pass a function that also compares the path to this instance's inputs, e.g. `revalidateOnReturn((p) => p === `/spotting/${this.lineId()}`, ...)` and for details `p.startsWith(`/spotting/${this.lineId()}/details`)`; the same check belongs in the polling guards. Add a spec in revalidate-on-return.spec.ts with two instances showing only the matching one reloads.

**Verification.** revalidateOnReturn takes only a path predicate with no instance knowledge, and detached retained components keep their router subscription; the situasi/insiden polling guards use the same isSpottingDetailsRoute test. So retained pages for other lines reload or poll.

<details><summary>Evidence</summary>

```text
const wasMine = isMyRoute(previousPath);
previousPath = path;
if (!wasMine && isMyRoute(path)) { reload(); }
...
revalidateOnReturn(isSpottingLineRoute, () => this.vehicleTypesResource.reload());
...
if (isSpottingDetailsRoute(urlPath(this.router.url))) { this.resource.reload(); }
```

</details>

<a id="f140"></a>

#### F140 · Low-value data is fetched eagerly: the month-bounds query returns 3,512 rows and the collapsed status-trend chart loads on mount

**medium** · effort S · performance · spotting

**Where:** `src/app/features/spotting/line-details/line-details.page.ts:473`, `src/app/features/spotting/line-details/line-details.page.ts:488`, `src/app/features/spotting/line-details/vehicle-status-trend/vehicle-status-trend.component.ts:134`, `src/app/features/spotting/line-details/vehicle-status-trend/vehicle-status-trend.component.ts:294`

**Problem.** The comment on the bounds query says it is cheap (about 180 rows), but it returns one row per vehicle per month, 3,512 for line 4, only to find one date. The 180-day status trend is requested, and embedded in SSR HTML, even though it sits in a closed <details> that most visitors never open. Both add to the cost of the details route.

**Recommendation.** Ask the backend for a single first-spotting-date value (or request `dateGroup: YEAR` and take the minimum) and drop the sort for a reduce. For the trend, create the resource only after the first `(toggle)` event of the <details> (`requestFn` returns undefined until `opened()` is true) so neither the request nor its SSR state is paid by default.

**Verification.** boundsResource maps all rows and sorts just to take the earliest month, and the trend component's httpResource is created in a field initializer with the <details> closed by default. Both requests ride the details route.

<details><summary>Evidence</summary>

```text
return rows.map((r) => r.dateKey.slice(0, 7)).sort()[0];   // only the earliest month is used
...
<details class="rounded-lg border">   // closed by default, but httpResource<StatusTrendRow[]> starts in the field initializer
Measured in SSR state: LineSpottingBounds = 3,512 rows (84,339 bytes); status trend REST = 62,393 bytes.
```

</details>

<a id="f038"></a>

#### F038 · The month query ships full details, chronologies, links and photos for every card, costing 48 KB and about 5 s per month

**medium** · effort M · data-fetching · insiden-ui · second check set severity high → medium

**Where:** `src/app/features/insiden/data/insiden.queries.ts:34-43`, `src/app/features/insiden/data/insiden.queries.ts:89`, `src/app/features/insiden/data/insiden.queries.ts:116`, `src/app/features/insiden/data/insiden.queries.ts:157`, `src/app/features/insiden/insiden.page.ts:92-100`

**Problem.** The calendar dots and the day list need only a handful of fields. Chronologies (about a third of the payload), the nested links and the photo list are needed only for a card that is visible, and details only when 'Show details' is opened. Because the query runs on the server render path, its latency becomes the page's time to first byte (measured 3.6-7.5 s for /insiden routes) and its JSON is serialised into TransferState, so most of the HTML is data, not markup. Each month change repeats the full cost, and the 28-day padding on both sides fetches roughly two months for every view.

**Recommendation.** Split the read in two. A lean list document (id, start and end datetime, severity, title, brief, longTerm, status, lines, vote counts) drives the calendar and the day list; the heavy fields (details, chronologies, links, medias) are fetched per incident through `calendarIncidents(filters: { id })` when the card is expanded, or when it first enters the viewport (`@defer (on viewport)` around the chronology block). Keep the padding only for the dot grid or fetch it with the lean document. Cache by month key so Prev and Next do not refetch. Update the stale comment at insiden.queries.ts:20-26 which still describes a single full fetch.

**Verification.** insiden.page.ts queries a ±14 day window with the full INSIDEN_INCIDENTS_QUERY (chronologies, links, medias, details) on the SSR path. The over-fetch is evident in the code, and the measured sizes and timings are plausible.

**Second check (high-severity pass).** code review: partially (medium). The query does select chronologies, links(first:10), medias and details for every incident in the month plus or minus 14 days, plus all ongoing incidents (calendarMonthRange and the `OR:{ongoing:true}` filter). The full query is far slower than a lean one. For the 2023-03 window (46 incidents) the full query returned 46,581 B in 2.8 s, against 17,607 B in 0.29 s for a lean field set (it still included lines and voteScore). The 2023-02 window gave 37,782 B in 2.9 s versus 16,051 B in 0.29 s. Chronologies are the largest part of the payload. SSR of /insiden/2023-05-19 embeds a 112,545 B ng-state in a 185 KB HTML (the finding says 134 KB). The finding overstates the impact in two ways. First, the incident-card template renders chronology entries unconditionally (incident-card.component.html:74), and the page renders cards for the whole day list and for the pinned ongoing list. Those cards genuinely need chronologies, so only the other window incidents (calendar dots) are wasted, and a per-card fetch would add N requests. Second, today's default route (/insiden, 2026-10) returns zero incidents locally, and plain /insiden ng-state (64 KB) contains no incident data. The slowdown shows only for months with many incidents, which production may or may not have. impact review: holds (high). INSIDEN_INCIDENTS_QUERY fetches details, chronologies, links and medias for every incident in a month plus 28 days of padding, and it runs on the SSR path. The measured 48 KB and about 5 s against 10 KB and 0.45 s for a lean query is a large, credible cost on a core page, and it repeats on every month change. High is deserved because it directly drives time to first byte. The stale comment at insiden.queries.ts:20-26 also says that fetching everything once is intended, which no longer matches reality. The fix is correct but effort M, and the lazy per-card fetch changes SSR and SEO content for expanded cards.

**Fix note from the second check.** Smaller fix than the finding's per-card fetch. Keep one full query, but restrict it to the selected day plus ongoing incidents, using a one-day `date.range` with `OR:{ongoing:true}`. Add a second lean query (id, dates, severity, title, status) for the calendar dots over the month window, and cache it by month. Drop the lazy per-card `@defer` and `calendarIncidents(filters:{id})` design. A cheaper first step is to drop only the heavy fields from the list query and fetch them on card expand through calendarIncidents(filters:{id}). Defer caching by month key and the padding change to a second step.

<details><summary>Evidence</summary>

```text
INSIDEN_INCIDENTS_QUERY selects `details`, `chronologies { ... voteBreakdown ... }`, `links(first: 10) { ... }` and `medias { ... }` for every incident in a window of month minus 14 days to month plus 14 days. Measured against localhost:8000: the 2023-02/03 window returns 48 incidents, 48,005 bytes in 4.7-5.7 s; the same filter with only id, dates, severity, title, longTerm and status returns 10,112 bytes in 0.45 s. SSR of /insiden/2023-05-19 embeds a 112,545-byte ng-state script inside a 134 KB HTML document.
```

</details>

<a id="f051"></a>

#### F051 · Details page SSR renders a throwaway 10k-cell desktop grid: 2.5 MB HTML, 8 s TTFB

**medium** · effort M · performance · ux-spotting · second check set severity high → medium

**Where:** `src/app/features/spotting/line-details/vehicle-spotting-grid/vehicle-spotting-grid.component.ts:108`, `src/app/features/spotting/data/spotting.queries.ts:337`, `.omo/evidence/audit-2026-10-21/routes/spotting-details__mobile__light__viewport.png`

**Problem.** The grid opts out of hydration and the server always renders the desktop branch, because the viewport is unknown. A phone therefore downloads about 2.5 MB of HTML containing every vehicle x day cell, and then throws it away and re-renders the mobile layout. Separately, addZero:true makes the API send a zero row for every vehicle and day, even though spottingCountFor() already treats a missing key as 0. The code comment justifies ngSkipHydration only in terms of avoiding NG0500 mismatches and does not account for this payload. On a slow mobile connection the commuter sees nothing useful for many seconds.

**Recommendation.** Do not server-render the grid body. Wrap the grid in a browser-only block (for example @defer (on immediate) or an afterNextRender-driven flag) and SSR only a skeleton, so ngSkipHydration and the 2.5 MB markup disappear. Drop addZero:true from LINE_SPOTTING_GRID_QUERY, since the client already defaults missing cells to 0; that should cut ng-state by roughly 98%. Optionally limit the first paint to the vehicle types that are expanded.

**Verification.** Grid host has ngSkipHydration, query has addZero:true, and spottingCountFor defaults missing keys to 0 with the grid reading only the trends array. Server renders the desktop branch, so the payload claim is plausible.

**Second check (high-severity pass).** code review: partially (medium). The facts hold. Curling /spotting/4/details returned 2,526,807 bytes of HTML, with a 857,604-byte ng-state and about 11,300 <td> elements, and the component has host: { ngSkipHydration: "" }, so a phone discards and re-renders the whole table. LINE_SPOTTING_GRID_QUERY does send addZero: true. For line 4 over 2026-08-01 to 2026-10-31 it returned 10,672 rows, of which 10,440 are zero (694 KB, 0.96 s). With addZero:false it returned 232 rows (16 KB, 0.17 s). Missing keys already default to 0 in spottingCountFor, so dropping addZero is safe. Two parts are overstated. The 2.5 MB is the uncompressed size from the bare Node server, which does not compress, and the same HTML gzips to about 77 KB, so the wire cost on a real CDN is small. The 8 to 15 s TTFB I saw varied from 15 s down to 4 s between runs because the machine is loaded, so the real cost is server render CPU plus client DOM rebuild. Dropping addZero shrinks only ng-state (about a third of the HTML), not the 11k server-rendered cells. impact review: holds (high). The grid host has ngSkipHydration and SSR always renders the desktop branch, so a phone downloads and then discards roughly 2.5 MB of HTML. The query uses addZero:true, which mostly returns zero-count rows (the report measured 97.8%). I checked that grid rows come from vehicleTypes via buildGridSections, and that spottingCountFor treats a missing key as 0, so dropping addZero is safe and the main data-size fix. Since the commuters on this page are mostly on phones, the harm is real.

**Fix note from the second check.** Do the cheap part first: remove addZero: true from LINE_SPOTTING_GRID_QUERY (the backend then returns about 98% fewer rows, 16 KB instead of 694 KB, and ng-state shrinks). Then render the grid body browser-only (@defer (on immediate) or a flag set in afterNextRender) with a skeleton on the server, which also lets ngSkipHydration go. Do not describe the problem as a 2.5 MB download. Do both steps: set addZero:false in LINE_SPOTTING_GRID_QUERY and update the comment at spotting.queries.ts:327, which says addZero fills holes. Render the grid body only in the browser, for example with @defer (on immediate) and a skeleton placeholder, and then ngSkipHydration may no longer be needed. Add or adjust a spec to confirm missing cells render as 0.

**Also reported as:** [F019](performance-bundle-and-ssr-hydration.md#f051) [spotting] The details grid is server-rendered (1.67 MB of table markup) and then thrown away by ngSkipHydration (src/app/features/spotting/line-details/vehicle-spotting-grid/vehicle-spotting-grid.component.ts:108, src/app/features/spotting/line-details/line-details.page.ts:333)

<details><summary>Evidence</summary>

```text
host: { ngSkipHydration: "" },  ...  vehicleSpottingTrends(start: $start end: $end dateGroup: DAY typeGroup: false freeRange: false addZero: true). Measured on /spotting/4/details: SSR HTML 2,526,809 B, ng-state 857,615 B, DOM 24,482 nodes, TTFB 7,943 ms, LCP 12,956 ms. Live query for Aug-Oct 2026 returned 10,672 rows of which 10,440 (97.8%) have count 0 (416 KB JSON).
```

</details>

<a id="f198"></a>

#### F198 · App nav is JS-measured, so SSR and every cross-module navigation render the collapsed menu first, and crawlers see no module links

**medium** · effort M · ssr-hydration · core-shell

**Where:** `src/app/shell/app-nav/app-nav.component.ts:327`, `src/app/shell/app-nav/app-nav.component.ts:333`, `src/app/shell/app-nav/app-nav.component.ts:383`, `src/app/shell/app-nav/app-nav.component.ts:408`, `src/app/shell/app-nav/app-nav.component.ts:440`

**Problem.** The server HTML for every page contains only a collapsed 'Home' dropdown trigger and a closed sheet, so the Tracker, Gallery, Insiden and About links do not exist in the markup that crawlers, link-preview bots and no-JS readers receive (the main sitewide internal links). On desktop, hydration then measures and swaps in the full link row, shifting the header. Because each of the 11 pages renders its own <app-nav /> instead of the nav living in app.html, the component is destroyed and recreated on every module navigation, so the collapsed-then-expanded flash repeats on every click. Each recreation also adds two ResizeObservers, a window resize listener and four layout-forcing scrollWidth reads per resize, plus setTimeout re-checks.

**Recommendation.** Render both variants and choose with CSS: keep the full inline link row in the DOM (so it is crawlable and has no layout shift) and hide it below a container-query breakpoint (@container with a named container on the bar, or Tailwind's @min-* variants) while showing the trigger there. If the measurement is kept, seed it from a module-level 'lastFits' value (the file already uses module-level flags for the reveal animations) and move <app-nav> into app.html behind a route-data flag so it is created once. That also deletes the resize listener and the observer pair.

**Verification.** _navLinksFit starts false and is only set from a ResizeObserver measurement after render. 12 files render <app-nav> themselves and app.html holds only the nav-progress bar. The crawler and layout-shift effects follow from that.

**Also reported as:** [F283](performance-bundle-and-ssr-hydration.md#f198) [ux-home] Server-render the module links so the nav is crawlable and does not flash on desktop (src/app/shell/app-nav/app-nav.component.ts:163, src/app/shell/app-nav/app-nav.component.ts:333)

<details><summary>Evidence</summary>

```text
protected readonly _navLinksFit = signal(false);   // starts collapsed
...
afterNextRender(() => { ... const measure = () => el.scrollWidth <= el.clientWidth; ... new ResizeObserver(check) ... window.addEventListener("resize", onWindowResize, { passive: true });
// curl http://localhost:4321/ : the SSR <app-nav> contains only <button aria-expanded="false"><span>Home</span> and no <a href="/tracker"> / /gallery / /insiden / /about
```

</details>

<a id="f201"></a>

#### F201 · Enable incremental hydration and stop fetching closed-sheet data during SSR (about 137 KB of fleet payloads in TransferState)

**medium** · effort M · performance · core-shell · partially confirmed

**Where:** `src/app/app.config.ts:161`, `src/app/features/home/home.page.ts:496`, `src/app/features/spotting/report-form/report-form.component.ts:92`, `src/app/features/insiden/link-form/link-form.component.ts:249`

**Problem.** No @defer is used outside the about editor and withIncrementalHydration() is not enabled, so everything on the landing page hydrates at load. The report form and link form sit inside sheets that are closed when the page loads, yet their graphqlResources run on the server and in the browser, and each fleet-wide response (about 68 KB) is inlined into the HTML as TransferState. The same lines->vehicles payload is fetched twice with slightly different field sets (report form vs insiden reference query), and the insiden page embeds a third copy (67.6 KB). ng-state is roughly 60 percent of the home document, which delays parsing and wastes mobile data for data most visitors never use.

**Recommendation.** First stop the report and link forms from fetching until their sheet opens, then measure TransferState size before adding incremental hydration.

_Original suggestion (corrected by the verifier):_ Add withIncrementalHydration() (and keep event replay, which is already active since the SSR markup carries jsaction attributes), then wrap below-the-fold or interaction-gated blocks in @defer (hydrate on viewport / on interaction), and render the sheet contents behind @if (sheet.isOpen()) or @defer (when sheet.isOpen()). Add withHttpTransferCacheOptions({ includePostRequests: true, filter: (req) => !isFleetQuery(req) }) so large non-critical responses are not inlined, and share one cached lines/vehicles query between the two forms (see the graphqlResource dedupe note).

**Verification.** @defer is used only in about, withIncrementalHydration is not enabled, and the sheet forms run graphqlResource on the server. The payload sizes were not verified. The idea is sound but the gain needs measuring.

<details><summary>Evidence</summary>

```text
provideClientHydration(withHttpTransferCacheOptions({ includePostRequests: true })),
// measured: GET / is 236,080 B of which ng-state is 141,213 B; two queries lines -> vehicleTypes -> vehicles inline 67,538 B and 69,515 B
// home.page.ts:496: <hlm-sheet ...closed...> <app-report-form #reportFormRef /> ; report-form.ts:92 graphqlResource(LINES_AND_VEHICLES_QUERY)
```

</details>

<a id="f205"></a>

#### F205 · CommonJS dependencies block tree-shaking and make the build emit non-ESM warnings

**medium** · effort M · performance · deps-tooling · already documented

**Where:** `src/app/features/tracker/data/gtfs-realtime.service.ts:2`, `src/app/features/tracker/data/geojson-storage.service.ts:6`, `src/app/features/tracker/data/gtfs-static.service.ts:5-6`, `src/app/core/upload/image-upload.service.ts:4`, `.omo/evidence/audit-2026-10-21/build/build.log (WARNING lines for gtfs-realtime-bindings, jszip, papaparse, @supercharge/promise-pool)`

**Problem.** Angular warns that these four packages are CommonJS. Bundlers then include the whole module and cannot drop unused exports. gtfs-realtime-bindings alone brings a full protobuf runtime (237 KB raw) into the tracker chunk to read a feed that uses a handful of message types. The same warnings are recorded in the progress docs as accepted, which means they are known but never scheduled for work.

**Recommendation.** Replace jszip with fflate, which is ESM and tree-shakes unzipSync, for the two GTFS and geojson archive reads. Replace gtfs-realtime-bindings with a static decoder generated from the GTFS-realtime .proto file, or confirm the protobufjs minimal runtime is ESM and use it. Replace PromisePool in image-upload.service.ts:141 with a 15-line bounded-concurrency helper, since the pool is used at one call site. Keep papaparse unless its CSV handling is a bottleneck. Measure the tracker chunk before and after.

**Verification.** build.log shows the not-ESM warnings for gtfs-realtime-bindings, jszip, papaparse and @supercharge/promise-pool, and the metafile shows gtfs-realtime-bindings at about 197 KB and jszip at 131 KB inside the tracker chunk. The import lines cited match the source files. The claim that the progress docs record these warnings as accepted was not verified.

<details><summary>Evidence</summary>

```text
build.log: "Module 'gtfs-realtime-bindings' used by 'src/app/features/tracker/data/gtfs-realtime.service.ts' is not ESM"; the same warning for 'jszip', 'papaparse' and '@supercharge/promise-pool'. Metafile sizes inside chunk-CcIT6ec22.js: gtfs-realtime-bindings 237,120 B; jszip 131,003 B.
```

</details>

<a id="f218"></a>

#### F218 · Render either the table or the cards in the vehicle list, not both

**medium** · effort M · performance · gap-1

**Where:** `src/app/features/spotting/line-overview/vehicle-list/vehicle-list.component.ts:277`, `src/app/features/spotting/line-overview/vehicle-list/vehicle-list.component.ts:353-354`

**Problem.** Both layouts are always in the DOM and CSS hides one. A type such as KTMB Loco (108 vehicles in local data) renders 108 table rows of seven cells, each with a hover-card trigger, plus 108 cards, in server HTML and on the client, on a phone where the table is never visible. The SSR payload and hydration work are roughly doubled for the audience that sees only cards.

**Recommendation.** Drive one branch from a matchMedia signal (line-details.page.ts already has isNarrow) or restructure to one list template, with @if (isNarrow()) around the cards and the table in @else. For long fleets add @defer (on viewport) per vehicle type below the first.

**Verification.** The vehicle-list template renders the md table (hidden md:block) and the card list (md:hidden) both in the DOM from the same sorted list at lines 277 and 353. SSR and hydration cost is roughly doubled for large fleets.

**Also reported as:** [F265](performance-bundle-and-ssr-hydration.md#f218) [spotting] The vehicle roster renders every vehicle twice, once as a table and once as cards, hiding one with CSS (src/app/features/spotting/line-overview/vehicle-list/vehicle-list.component.ts:277, src/app/features/spotting/line-overview/vehicle-list/vehicle-list.component.ts:353)

<details><summary>Evidence</summary>

```text
<div class="relative w-full hidden md:block"> ... @for (vehicle of _sortedVehicles(); track vehicle.id) { <tr hlmTr> ...
<div [class]="showFullTable() ? 'hidden' : 'flex flex-col gap-3 md:hidden'"> @for (vehicle of _sortedVehicles(); track vehicle.id) {
```

</details>

<a id="f241"></a>

#### F241 · Details grid renders 11,345 table cells (2.5 MB of HTML, 24,482 DOM nodes) with two listeners per cell, and up to ten such pages are kept alive

**medium** · effort M · performance · performance · partially confirmed

**Where:** `src/app/features/spotting/line-details/vehicle-spotting-grid/vehicle-spotting-grid-date-row.component.ts:24`, `src/app/features/spotting/line-details/vehicle-spotting-grid/vehicle-spotting-grid.component.ts:223`, `src/app/core/routing/reusable-route.strategy.ts:17`, `src/app/app.routes.server.ts:13`

**Problem.** Every vehicle-by-day cell is a real td with a nested div, a class binding and mouseenter/mouseleave listeners, so there are roughly 22,000 listeners, and the whole table is also server-rendered and then hydrated. The grid is horizontally scrolled to today on the client (an effect sets scrollLeft), is not indexable text, and 98% of the cells are the same empty swatch, so server-rendering it costs seconds of SSR CPU on a 1 vCPU, 512 MiB instance and ships 1.5 MB of markup for no first-paint benefit. The router also keeps up to 10 detached route trees alive, so a rider who browses several line detail pages can retain over 100,000 DOM nodes on a phone.

**Recommendation.** Gate the grid body on an afterNextRender signal (skeleton in SSR) and use one delegated pointer listener on tbody. Do not credit addZero:false for the HTML size drop; it only fixes the ng-state payload.

_Original suggestion (corrected by the verifier):_ 1) Do not render the grid body on the server: gate it on a signal set in afterNextRender and show the existing skeleton in SSR; both sides agree so hydration is safe. 2) Replace per-cell handlers with one pointermove/pointerleave listener on the tbody that reads data-vehicle and data-date from event.target.closest('td'). 3) Keep the grid out of the keep-alive cache or lower MAX_REUSABLE_ROUTE_HANDLES for details routes. 4) Optionally add content-visibility:auto on long sections or render only the visible month window. Combined with the addZero fix this should take the HTML from 2.5 MB to well under 300 KB.

**Verification.** Reproduced: /spotting/4/details is 2.53 MB with 11,345 td and 5.4 s SSR, and each td has mouseenter/mouseleave; details routes use reuse:true with a 10-handle cap. But cells are vehicle x day, so they exist regardless of data and the addZero fix does not shrink the table HTML as claimed; only gating the body to the browser does.

**Also reported as:** [F568](performance-bundle-and-ssr-hydration.md#f241) [spotting] The grid attaches two listeners to each of about 10,700 cells and runs the page scroll handler unthrottled (src/app/features/spotting/line-details/vehicle-spotting-grid/vehicle-spotting-grid-date-row.component.ts:25, src/app/features/spotting/line-details/vehicle-spotting-grid/vehicle-spotting-grid.component.ts:823)

<details><summary>Evidence</summary>

```text
date-row.component.ts:27  (mouseenter)="cellHoverStart.emit({ vehicleId: vehicleId(), label: label(), dateKey: col.dateKey, event: $event })"
date-row.component.ts:35  (mouseleave)="cellHoverEnd.emit()"
reusable-route.strategy.ts:17  export const MAX_REUSABLE_ROUTE_HANDLES = 10;
Measured: /spotting/4/details = 2,525,685 B HTML (79 KB gzip), 11,345 <td>, table markup 1,506,769 B (60%), DOM 24,482, SSR 6.1-6.5 s versus about 1 s for the grid query.
```

</details>

<a id="f244"></a>

#### F244 · Server-render /about and /gdpr (with edge caching) instead of shipping an empty shell: LCP 4.7-5.6 s, CLS 0.665, no content for crawlers

**medium** · effort M · ssr-hydration · performance · partially confirmed

**Where:** `src/app/app.routes.server.ts:29`, `src/app/app.routes.server.ts:35`, `src/app/features/about/about.page.ts:150`, `src/app/features/about/about.page.html:25`, `src/app/features/about/about.page.html:342`

**Problem.** The comment gives the reason as no request-driven content, but the case for SSR here is not personalization, it is that the content is public and identical for every visitor. As client-only routes they return an 18 KB empty shell, load about 1.5 MB of scripts including the Firestore chunk before anything paints, and show two 96 px skeletons that are far shorter than the real page, which is where the 0.665 CLS comes from (the footer ad grid is the shifted element). Search crawlers that do not run JS and link-preview scrapers see no body text or per-page meta tags. /gdpr is the page a privacy reviewer will open first.

**Recommendation.** Switch to RenderMode.Server only with a server-side lite getDoc plus TransferState, and size the loading skeleton to the real page height to fix the CLS.

_Original suggestion (corrected by the verifier):_ Switch both routes to RenderMode.Server, read the document on the server with the lite SDK or a small HTTP read, put it in TransferState via the existing resource pattern, and add an edge cache policy such as public, s-maxage=300, stale-while-revalidate=3600 (see the cache finding) so admin edits show within minutes. Size the loading skeleton to the typical page height, or reserve min-height, to remove the layout shift. If you want to keep live updates for admins, subscribe with onSnapshot only after hydration and only when isAdmin() is true.

**Verification.** app.routes.server.ts does set about and gdpr to RenderMode.Client with the quoted rationale, so the shell is empty and the content is public and identical per visitor. The 0.665 CLS and LCP numbers are not reproduced here, and the CLS is on a client-rendered page where ad-slot SSR reservation cannot help; SSR also needs a server-side Firestore read that has to be built.

**Also reported as:** [F565](performance-bundle-and-ssr-hydration.md#f244) [seo-pwa-i18n] The /gdpr and /about pages are client-only, so the privacy text is invisible to non-JS readers (src/app/app.routes.server.ts:32, src/app/app.routes.server.ts:38); [F518](performance-bundle-and-ssr-hydration.md#f244) [core-shell] Choose render modes deliberately: prerender /methodology, make /about and /gdpr crawlable, and cache more than '/' (src/app/app.routes.server.ts:32, src/app/app.routes.server.ts:38)

<details><summary>Evidence</summary>

```text
app.routes.server.ts:32  path: "about", renderMode: RenderMode.Client,
about.page.ts:150 comment: "Client-rendered ... link-preview scrapers (WhatsApp/Telegram) still see only the static index.html tags."
Measured: /about raw SSR 18,360 B with h1 0 (hydrated h1 1, h2 4), LCP 5,624 ms, CLS 0.665 (div.grid.gap-3); /gdpr LCP 4,732 ms, 19 colour-contrast nodes.
```

</details>

<a id="f245"></a>

#### F245 · Server-render the tracker page chrome and defer the map: today /tracker is a blank shell until 4.7 MB of scripts arrive

**medium** · effort M · ssr-hydration · performance

**Where:** `src/app/app.routes.server.ts:26`, `src/app/features/tracker/tracker-shell.page.ts:39`, `src/app/features/tracker/map/tracker-map.component.ts:61`

**Problem.** The comment says the page cannot run during SSR because of WebGL. That is true of the map but not of the page: TrackerMapComponent already initializes only inside afterNextRender, and the rest (compact nav, status card, layer sheet, skeleton) is ordinary HTML. Making the whole route client-only means the status card and nav are not drawn until the 3.7 MB L7/Mapbox chunk has downloaded and parsed, which puts a button at 6.3 s LCP even on a fast local network. The map skeleton the app already has cannot help because it is also created in the browser.

**Recommendation.** Render the route on the server and wrap the map in a defer block: @defer (on immediate) { <app-tracker-map (mapReady)="mapReady.set(true)"/> } @placeholder { <app-tracker-map-skeleton/> }. Angular renders only the placeholder during SSR and fetches the heavy chunk afterwards, so the nav, status card and skeleton paint immediately and the L7 and Mapbox code is also split out of the shell chunk. Keep an eye on the NG0500 hydration notes in MISTAKES.md for any component that reads window in its constructor.

**Verification.** tracker/** is RenderMode.Client and TrackerMapComponent already initializes in afterNextRender, so the chrome could be server-rendered with the map in @defer, which also splits the heavy chunk out of the shell. The 6.3 s LCP was not re-measured. Note a CSR-only @defer split already gets most of the benefit.

<details><summary>Evidence</summary>

```text
app.routes.server.ts:26  path: "tracker/**", renderMode: RenderMode.Client,
tracker-shell.page.ts:39  <app-tracker-map class="absolute inset-0" (mapReady)="mapReady.set(true)" />
Measured /tracker: SSR HTML 18,361 B (empty), TTFB 48 ms, LCP 6,336 ms (BUTTON), 21 scripts / 4,713 KB.
```

</details>

<a id="f252"></a>

#### F252 · Public profiles fetch and render the entire spotting history with no pagination

**medium** · effort M · data-fetching · profile-about-misc

**Where:** `src/app/features/profile/data/profile.queries.ts:88-109`, `src/app/features/profile/my-spottings/my-spottings.component.ts:174-185`, `/home/kwongtn/rosak/rosak_backend/common/schema/scalars.py:139-158`

**Problem.** For a public profile with public history, the backend resolves the whole list through a dataloader and the client renders every row, grouped by day, inside one card. A prolific spotter (hundreds or thousands of entries) makes the response large, the first render slow on a phone, and the 'Load more' control exists only for the owner. The owner view paginates 30 at a time, so the two paths have very different cost profiles for the same data.

**Recommendation.** Add pagination to the public path. Backend first: give UserScalar.spottings limit and offset arguments (or expose the existing events(filters:{userId}) for public users). Frontend: drop `spottings` from GET_PUBLIC_USER_QUERY, have MySpottingsComponent page it with the same PAGE_SIZE and Load more button for both owners and visitors, and keep the `null` check for private history through a lightweight `spottingDataPublic` flag, which the query already returns.

**Verification.** GET_PUBLIC_USER_QUERY selects spottings with no arguments, and the 'Load more' button is gated on isOwnProfile() && _hasMore(). Visitors get the whole history rendered. Backend argument absence was not re-verified but the frontend side is as stated.

**Also reported as:** [F226](performance-bundle-and-ssr-hydration.md#f252) [gap-3] Public profiles load a user's entire spotting history in one unpaginated field (src/app/features/profile/data/profile.queries.ts:88, src/app/features/profile/profile.page.ts:212)

<details><summary>Evidence</summary>

```text
GET_PUBLIC_USER_QUERY selects `spottings { id spottingDate notes created status type runNumber mediaCount isMine vehicle { ... } }` with no arguments; introspection of UserScalar.spottings shows no args. Template: @if (isOwnProfile() && _hasMore()) { <button ... (click)="loadMore()">Load more</button> }
```

</details>

<a id="f260"></a>

#### F260 · Photo compression only kicks in above 9 MB, decodes the whole file repeatedly on the main thread, and can double-rotate images

**medium** · effort M · performance · spotting · partially confirmed

**Where:** `src/app/features/spotting/report-form/photo-picker/photo-picker.component.ts:6`, `src/app/core/upload/image-compression.service.ts:67`, `src/app/core/upload/image-compression.service.ts:99`, `src/app/core/upload/image-compression.service.ts:105`

**Problem.** A typical 12 MP phone photo is 3 to 8 MB, so most photos are uploaded untouched at full size over mobile data, with progress hidden. When a photo is over the limit, resizeToSize reads the file as a base64 data URL and decodes it again on every binary-search iteration (about 7 to 8 rounds), each a multi-megabyte string plus full decode; on a mid-range Android this can freeze the UI or kill the tab. Canvas drawImage already applies EXIF orientation in current browsers, and then the original APP1 segment (which includes the Orientation tag) is pasted back, so viewers that honour EXIF may rotate the image a second time.

**Recommendation.** Decode once with createImageBitmap, cap longest edge, single toBlob; if EXIF is kept for timestamps, reset Orientation to 1.

_Original suggestion (corrected by the verifier):_ Always downscale by dimensions, not by file-size search: decode once with createImageBitmap(file, { imageOrientation: 'from-image' }), cap the longest edge at 2048 px, and call canvas.toBlob('image/jpeg', 0.8) once (fall back to quality 0.7 only if still above the limit). That is one decode, no EXIF copy, and normally under 1 MB. Run it for every photo and show a 'Preparing photo' state on the thumbnail. Use OffscreenCanvas in a worker if jank remains.

**Verification.** Threshold 9e6, repeated fileToDataUrl/loadImage per binary-search turn, and re-pasting the original APP1 (with Orientation) onto a canvas-drawn image are all in the code, so a double rotation on over-9MB photos is plausible. Leaving sub-9MB photos untouched is a deliberate size cap, and the perf impact is unmeasured.

**Also reported as:** [F197](performance-bundle-and-ssr-hydration.md#f260) [core-shell] Image compression re-decodes the full-resolution photo on every binary-search step on the main thread (src/app/core/upload/image-compression.service.ts:74, src/app/core/upload/image-compression.service.ts:105)

<details><summary>Evidence</summary>

```text
const MAX_BYTES = 9e6;
...
const img = await this.loadImage(await this.fileToDataUrl(file));   // inside resizeImage, called on every loop turn
...
while (true) { const pct = (top + bottom) / 2; output = await this.resizeImage(file, ...); ... if (Math.ceil(top) === Math.ceil(bottom)) { return this.copyExif(file, output); } }
```

</details>

<a id="f261"></a>

#### F261 · The same VehicleTypesByLine query is fetched separately by the overview, details and vehicle pages

**medium** · effort M · data-fetching · spotting · partially confirmed

**Where:** `src/app/features/spotting/line-overview/line-overview.page.ts:218`, `src/app/features/spotting/line-details/line-details.page.ts:379`, `src/app/features/spotting/vehicle-detail/vehicle-detail.page.ts:170`

**Problem.** Moving overview to details to a vehicle and back issues the same multi-second query up to three times for the same line, each with its own skeleton, plus a silent reload on every return. Pages cannot share results, so the vehicle page cannot paint the header from data the overview already has. The docs record 'no app-wide normalized cache' as a choice, but the cost is repeated blank states on the slowest endpoint in the feature.

**Recommendation.** Share via a small per-line store, or at minimum fix the vehicle page with a single-vehicle query (finding 9) before introducing a store.

_Original suggestion (corrected by the verifier):_ Add a root-provided `SpottingFleetStore` keyed by lineId that owns one graphqlResource per line (a Map of resources created on first use), exposes data() plus reload(), and reloads only when older than about 60 seconds when a page activates. Pages read from it instead of declaring their own resource, and revalidateOnReturn calls store.reload(lineId). With stale data shown instantly, the keep-alive 'return' becomes seamless on every route.

**Verification.** Three pages each declare an identical VEHICLE_TYPES_QUERY resource, so duplication is real. The no-normalized-cache choice is documented and keep-alive pages retain their data, so repeated blank states are overstated, though a per-line store is a valid option.

<details><summary>Evidence</summary>

```text
protected readonly vehicleTypesResource = graphqlResource<VehicleTypesQueryData, VehicleTypesQueryVars>(() => ({ query: VEHICLE_TYPES_QUERY, variables: { lineId: this.lineId() } }));   // identical in three pages
Measured sizes and times: line 4 = 37,198 bytes in 4.6 s; line 6 = 28,676 bytes in 2.0 s.
```

</details>

<a id="f266"></a>

#### F266 · The Insiden tab downloads every incident (395 KB) and re-downloads it on each poll, then renders all cards for the line

**medium** · effort M · data-fetching · spotting

**Where:** `src/app/features/spotting/line-details/insiden-section/insiden-section.component.ts:126`, `src/app/features/spotting/line-details/insiden-section/insiden-section.util.ts:10`, `src/app/features/spotting/line-details/insiden-section/insiden-section.component.ts:134`

**Problem.** Opening Insiden on a quiet line still downloads chronologies, details and links for all incidents, and the default 30 second poll (10 seconds selectable) repeats it. The component then instantiates a full incident card for every match, unpaginated (up to 104 for line 4). On a phone this is a large, slow request for a handful of visible cards.

**Recommendation.** Ask the backend for a `lines: { id }` filter (or a `lineId` argument) on calendarIncidents and a paginated connection; until then, shorten the selection for this tab (drop chronologies, links and details, fetch them on card expand) and raise the default poll interval to 2 minutes. Render the first 10 cards with a 'Show more' button or `appInfiniteScroll`. Pause the refresh when the tab is not visible (PollingSource already pauses when the document is hidden).

**Verification.** insiden-section fetches INSIDEN_INCIDENTS_QUERY with no filter, filters client-side via incidentsForLine, polls at the 30s PollingSource default, and renders all matches. The section only mounts when the insiden tab is active, as the finding says.

<details><summary>Evidence</summary>

```text
protected readonly resource = graphqlResource<InsidenIncidentsQueryData>(() => ({ query: INSIDEN_INCIDENTS_QUERY }));
...
.filter((incident) => incident.lines.some((line) => line.id === lineId))
Measured: CalendarIncidents (no filter) = 394,617 bytes, 280 incidents, 24.6 s on the local API; line 4 owns 104 of them. CalendarIncidentFilter has only id, severity, ongoing and date.
```

</details>

<a id="f272"></a>

#### F272 · Stop bundling two full map engines: the tracker chunk contains both mapbox-gl and maplibre-gl

**medium** · effort M · performance · tracker-gallery · partially confirmed · severity adjusted from high

**Where:** `src/app/features/tracker/map/tracker-map.component.ts:10`, `src/app/features/tracker/map/tracker-map.component.ts:67`, `package.json:42`

**Problem.** The tracker only ever constructs `new Mapbox(...)`, but the barrel import from `@antv/l7` re-exports every map adapter in `@antv/l7-maps`, so the bundler keeps the MapLibre engine as well. That is roughly 967 KB of raw JavaScript (about 26 percent of the lazy chunk) that the page can never execute. The chunk is 678 KB over the wire and sits on the critical path of a client-rendered route, so phone users on mobile data pay for it before the map appears.

**Recommendation.** Re-measure first; try deep imports from @antv/l7-scene/layers/maps. Choosing a single engine (MapLibre vs Mapbox token) is a product decision, not a bundle fix.

_Original suggestion (corrected by the verifier):_ First, re-measure with narrower imports: take `Scene` from `@antv/l7-scene`, the layers from `@antv/l7-layers`, `Marker`/`MarkerLayer`/`Popup` from `@antv/l7-component`, and `Mapbox` from `@antv/l7-maps` (already a direct dependency), then diff `dist/web/stats.json` for `maplibre-gl`. If `@antv/l7-maps` still pulls MapLibre through its own index, deep-import the single adapter module or add a small esbuild alias in the Angular build that stubs `maplibre-gl`. The larger decision is to pick one engine: MapLibre GL has no Mapbox access-token or per-map-load billing, and L7 supports it through `Map`/`Maplibre` with free vector tiles. Either way the target is one engine, saving about 0.95 MB raw. Keep the map code in its current lazy route; the hover preloader already hides the cost for desktop users.

**Verification.** @antv/l7 barrel import and l7-maps index importing MapLibre exist, so a second engine is plausible, but I could not verify the metafile numbers (no stats.json in dist). Chunk is lazy and already hover-preloaded, so harm is contained.

**Also reported as:** [F027](performance-bundle-and-ssr-hydration.md#f272) [ux-rest] Tracker chunk bundles both mapbox-gl and maplibre-gl (3.71 MB) because it imports the @antv/l7 barrel (src/app/features/tracker/map/tracker-map.component.ts:10, src/app/features/tracker/map/rt-marker-layer.controller.ts:2); [F204](performance-bundle-and-ssr-hydration.md#f272) [deps-tooling] MapLibre GL (about 990 KB raw) ships in the tracker chunk although the app only uses Mapbox (src/app/features/tracker/map/tracker-map.component.ts:10, node_modules/@antv/l7/es/index.js imports node_modules/@antv/l7-maps/es/index.js (metafile importer list)); [F243](performance-bundle-and-ssr-hydration.md#f272) [performance] Remove maplibre-gl (about 1 MB) from the tracker chunk: only the Mapbox adapter is used but the L7 barrel imports every adapter (src/app/features/tracker/map/tracker-map.component.ts:10, src/app/features/tracker/map/tracker-map.component.ts:69)

<details><summary>Evidence</summary>

```text
import { ILayer, LineLayer, Mapbox, PointLayer, Scene } from "@antv/l7";

esbuild metafile, chunk-CcIT6ec22.js (tracker-shell-page, 3,714,904 B raw), bytesInOutput per package:
mapbox-gl 982 KB | maplibre-gl 967 KB | @antv/l7-component 710 KB | @antv/l7-layers 448 KB | gtfs-realtime-bindings 232 KB | @antv/l7-maps 216 KB | @antv/g-device-api 212 KB
```

</details>

<a id="f273"></a>

#### F273 · Stop the 100 ms countdown ticker from driving change detection for invisible UI

**medium** · effort M · performance · tracker-gallery · partially confirmed

**Where:** `src/app/features/tracker/data/gtfs-realtime.service.ts:15`, `src/app/features/tracker/status-card/status-card.component.ts:32`, `src/app/features/tracker/status-card/countdown-ring.component.ts:36`, `src/app/features/tracker/status-card/mobile-layer-sheet.component.ts:19`

**Problem.** Every active RtSource writes two signals ten times a second. In a zoneless app each write that is read by a template schedules a change detection pass. `StatusCardComponent` is rendered unconditionally and merely hidden by CSS below the `sm` breakpoint, so on a phone the full desktop `LayerChecklistComponent` (and its countdown rings and a second `TrackerInfoPanelComponent`) stays mounted and keeps re-rendering ten times per second per source for UI nobody can see, in parallel with the mobile sheet. With six feeds that is 60 ticks per second of avoidable work on exactly the devices with the least headroom.

**Recommendation.** Instantiate only the active layer UI via a browser-guarded breakpoint signal and @if; lower the tick rate (e.g. 250-1000 ms) or tick only while visible, rather than rewriting the ring.

_Original suggestion (corrected by the verifier):_ Render only one layer UI: expose a `isDesktop = toSignal(breakpointObserver)`-style signal (browser-guarded; default to mobile on the server) and use `@if` so the inactive host is not instantiated. Replace the JS-driven ring with a CSS animation: set `style="animation: ring-drain {{ intervalMs }}ms linear forwards"` and restart it with an `@for`-style key on each successful fetch; keep a 1 Hz timer only while a tooltip or the info panel needs a number. Respect `prefers-reduced-motion` by showing a static ring.

**Verification.** 100 ms tick writing two signals per source is real, and StatusCardComponent is always mounted with 'hidden sm:flex', so both UIs live on phones. Replacing the ring with a CSS animation is a bigger redesign than needed.

<details><summary>Evidence</summary>

```text
const TICK_MS = 100;  // two signals written per source every tick (secondsRemaining, percentRemaining)

<div hlmCard class="hidden h-[60vh] w-[576px] flex-col sm:flex">  // always instantiated, CSS-hidden below sm
```

</details>

<a id="f276"></a>

#### F276 · The info panel renders unbounded tables and highlights megabyte JSON for large stop lists

**medium** · effort M · performance · tracker-gallery · partially confirmed

**Where:** `src/app/features/tracker/info-panel/tracker-info-panel.component.ts:332`, `src/app/features/tracker/info-panel/tracker-info-panel.component.ts:512`, `src/app/features/tracker/info-panel/tracker-info-panel.component.ts:517`, `src/app/features/tracker/info-panel/tracker-info-panel.component.ts:351`

**Problem.** For a Stops layer such as RapidBus KL (the downloaded GTFS zip is 1.68 MB and its stops.txt holds thousands of stops) the Table view renders every row and column as DOM with no virtualisation, and the Raw JSON view pretty-prints every GeoJSON feature then runs a global regex that wraps each token in a `<span>`, producing hundreds of thousands of nodes assigned through `innerHTML` on the main thread. Opening that tab freezes a mid-range phone for seconds. Sorting re-sorts and re-renders the entire list. The copy button also awaits `navigator.clipboard.writeText` with no `try/catch`, so a permissions failure is an unhandled rejection with no user feedback, and the exported CSV does not neutralise cells that begin with `=`, `+`, `-` or `@` (feed text such as vehicle labels reaches it).

**Recommendation.** Cap the Table with a page size of 100 plus Show more (or `@defer`/CDK virtual scroll), and a text filter. Truncate the JSON preview to the first 200 entries with a `Download full JSON` action, and skip syntax highlighting above a size threshold (render plain `textContent`). Wrap the clipboard call in try/catch with a toast fallback. When the shared export helper (`core/export`) is extended as MISTAKES.md already plans, move `toCsv` there and prefix risky cells with `'`.

**Verification.** Table @for is unbounded, JSON is pretty-printed and highlighted into innerHTML, and clipboard.writeText has no try/catch. This is only on opening the info panel for large Stops layers, so contained; the CSV formula-injection point is minor.

<details><summary>Evidence</summary>

```text
@for (row of sortedRows(); track row["id"]) {
...
return JSON.stringify(this._stops(), null, 2);
...
protected readonly highlightedJson = computed(() => highlightJson(this.jsonText()));
...
[innerHTML]="highlightedJson()"
```

</details>

<a id="f278"></a>

#### F278 · Deliver gallery images responsively: srcset by tile width, eager first row, and a mid-size image in the viewer

**medium** · effort M · performance · tracker-gallery · partially confirmed

**Where:** `src/app/features/gallery/justified-grid/justified-grid.component.ts:41`, `src/app/features/gallery/justified-grid/justified-grid.component.ts:86`, `src/app/features/gallery/media-viewer/media-viewer.component.ts:48`, `src/app/features/gallery/data/imgur.util.ts:9`

**Problem.** Every grid tile uses the one 320 px `m` thumbnail, which looks soft on desktop tiles (often 300 to 500 CSS px) and on 2x or 3x phone screens, while there is no `srcset` or `sizes`. All images, including those in the first visible row, are `loading="lazy"` with no priority hint, which delays the largest contentful paint. `<img>` has no width/height attributes (the surrounding button supplies the box only after JS layout). The viewer loads the original file, about 0.96 MB for a typical 3000x4000 photo, even on a phone where a 1024 px version would be sufficient, and shows no loading state or error fallback. `getImgurThumbnail` blindly inserts a letter into any URL, so a non-imgur URL would break (the `onerror` fallback hides it).

**Recommendation.** Add srcset using imgur suffixes manually, eager/fetchpriority on the first row, and the 'h' size in the viewer; skip NgOptimizedImage unless wanted.

_Original suggestion (corrected by the verifier):_ Provide a custom `IMAGE_LOADER` that maps a requested width to the imgur suffix (<=160 `t`, <=320 `m`, <=640 `l`, else `h`), then use `NgOptimizedImage` with `[ngSrc]`, `ngSrcset="320w, 640w, 1024w"`, `sizes` derived from the tile width, and explicit `width`/`height` from the `MediaNode`; add `priority` to the first 4 tiles. In the viewer use the `h` (1024) size with the original available through an `Open original` link. Guard `getImgurThumbnail` with a host check (`i.imgur.com`) and fall back to the plain URL. Add a placeholder (`bg-muted`) and `(error)` fallback to the viewer image.

**Verification.** Grid uses the single 'm' thumbnail, lazy for all, viewer loads the original url; all confirmed. The scope is broad and a custom IMAGE_LOADER with NgOptimizedImage is heavy for imgur URLs.

<details><summary>Evidence</summary>

```text
<img [src]="thumbnail(cell.item)" loading="lazy" alt="" class="size-full object-cover" .../>
...
getImgurThumbnail(item.file.url, "m")
...
<img [src]="media().file?.url ?? '/image-not-found.png'" .../>

i.imgur.com/gi8QmSx.jpeg = 959,381 B; ...gi8QmSxm.jpeg = 23,460 B (320 px); ...gi8QmSxl.jpeg = 81,432 B (640 px)
```

</details>

<a id="f290"></a>

#### F290 · About page jumps by 0.67 CLS because a 2 x 96 px skeleton is replaced by a client-rendered page of roughly 2,000 px

**medium** · effort M · performance · ux-rest · partially confirmed

**Where:** `src/app/features/about/about.page.html:25`, `src/app/features/about/about.page.ts:166`, `src/app/app.routes.server.ts:32`

**Problem.** The page is RenderMode.Client and fetches `public/about` through the Firestore SDK after hydration, so the h1 appears alone on first paint, two small skeleton bars show, and then search, chips, cards and ads push everything down. Combined with three ad slots of 250 px minimum, shifts are large and readers lose their place. Search engines and link previews see an empty shell.

**Recommendation.** Make the skeleton mimic the final layout with min-heights; leave the client render mode unless the maintainer wants SEO for About.

_Original suggestion (corrected by the verifier):_ Short term: make the skeleton mimic the final layout (search bar, chip row, three card-height blocks, `min-h` on the main). Better: read the about document on the server through the Admin SDK or the existing GraphQL/REST layer into TransferState and render the page with RenderMode.Server (content only changes by hand, so a short revalidate is fine). That also removes Firestore from the critical path of an informational page.

**Verification.** about route is RenderMode.Client with Firestore read after hydration and two h-24 skeletons (about.page.html lines 28-29), so a large layout shift is plausible. The Admin SDK/TransferState server-render suggestion contradicts the documented client-only decision in app.routes.server.ts and is heavy.

<details><summary>Evidence</summary>

```text
Measured CLS 0.665 on /about (div.grid.gap-3, the worst in the audit set); LCP 5,624 ms; SSR html is the 18 KB client shell. The loading branch is `<div hlmSkeleton class="h-24 w-full"></div>` twice.
```

</details>

<a id="f300"></a>

#### F300 · Sequence-button state is recomputed with O(N) scans per row on every change-detection pass

**low** · effort S · performance · console · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/console/insiden/links/links.component.html:142`, `src/app/features/console/insiden/links/links.component.html:148`, `src/app/features/console/insiden/links/link-tree.util.ts:239`, `src/app/features/console/insiden/links/link-tree.util.ts:255`

**Problem.** Once the queue is complete (Show all links, the state needed to reorder), the four per-row bindings each scan the whole sibling run, and every ungrouped link is in the single root run. Template method calls are not memoised, so ticking one checkbox (which changes `selectedIds`) re-runs them for all rows: O(N^2). I replicated the util functions in Node: 2,000 ungrouped links took about 0.55 s per full pass and 5,000 took about 1.6 to 2.0 s. The table is also rendered unbounded with ~20 inputs per row and no virtualisation.

**Recommendation.** Optional: precompute one Map in a computed if the queue ever grows large.

_Original suggestion (corrected by the verifier):_ Add one `computed` that walks `_runsByParentId()` once and builds `Map<id, { index, runLength, orderKnown }>`, then have canMoveUp/canMoveDown/moveBlockedReason read from that map in O(1). Compute `nestBlockedReason` from a `Set` of selected ids instead of `Array.includes`. Consider `@defer`-style windowing or CDK virtual scroll if the table passes a few thousand rows.

**Verification.** The template does call canMoveUp/canMoveDown/moveBlockedReason per row, and runOrderIsKnown/siblingIndexOf scan the sibling run. But canMoveUp short-circuits on queueIsComplete, which is only true after 'Show all links', and thousands of ungrouped links is unrealistic for a moderation queue.

<details><summary>Evidence</summary>

```text
[canMoveUp]="canMoveUp(link)"  [canMoveDown]="canMoveDown(link)"
[moveUpBlocked]="moveBlockedReason(link, 'up')"  [moveDownBlocked]="moveBlockedReason(link, 'down')"
// each calls runOrderIsKnown (.every over the sibling run) and siblingIndexOf (.findIndex over the run)
```

</details>

<a id="f309"></a>

#### F309 · The 67 KB reference-data query is fetched eagerly by each console page and again in the public forms

**low** · effort S · data-fetching · console · partially confirmed

**Where:** `src/app/features/console/insiden/pending/pending.component.ts:201`, `src/app/features/console/insiden/links/links.component.ts:610`, `src/app/features/insiden/incident-form/incident-form.component.ts:149`, `src/app/features/insiden/link-form/link-form.component.ts:250`

**Problem.** Four components create their own resource for the same all-lines/vehicles/stations/categories payload. On the pending page it is only needed after a row is opened, yet it is requested at page load; switching between console tabs refetches it each time, and each component rebuilds its own lookup maps.

**Recommendation.** Create a root `InsidenReferenceStore` that owns a single `graphqlResource` and the derived Maps, and inject it in all four places. On the pending page start it lazily, for example `graphqlResource(() => this.selectedRow() ? { query } : undefined)` or trigger on first `openDetail`.

**Verification.** pending.component.ts creates its own graphqlResource for INSIDEN_REFERENCE_QUERY at page load. The 67 KB figure was not remeasured, and gzip would make it about 8 KB, so the cost is small.

<details><summary>Evidence</summary>

```text
protected readonly referenceResource = graphqlResource<InsidenReferenceQueryData>(() => ({ query: INSIDEN_REFERENCE_QUERY }));
measured response for the query on localhost: 67,536 bytes raw, 8,205 bytes gzip
```

</details>

<a id="f315"></a>

#### F315 · Footer fetches /version/ during every SSR render and formats build times in the viewer's/server's time zone

**low** · effort S · performance · core-shell

**Where:** `src/app/shell/app-footer/app-footer.component.ts:117`, `src/app/shell/app-footer/app-footer.component.ts:62`, `src/app/shell/app-footer/app-footer.component.ts:93`

**Problem.** The footer (decorative build info) issues a backend request on the server for every page that renders it, so SSR stability waits on an extra round trip (and renders a literal '<<No hash data>>' when the backend answers that). DatePipe formats in the process time zone: the server (UTC on App Hosting) and the browser differ, so the build timestamp changes text after hydration, and it is never shown in Asia/Kuala_Lumpur, the zone the rest of the product should use.

**Recommendation.** Fetch the backend version only in the browser (create the httpResource behind an afterNextRender-set signal, or wrap the backend line in @defer (on idle)) so SSR does not wait on it. Pass an explicit zone to the pipe, for example date: 'medium' : '+0800' : 'en-MY', for both lines.

**Verification.** The footer creates an httpResource for backend version/ with no browser guard, and date:'medium' has no time zone argument. This is minor, decorative-only polish.

**Also reported as:** [F355](performance-bundle-and-ssr-hydration.md#f315) [gap-4] Render the footer build timestamps in a fixed zone so SSR and browser agree (src/app/shell/app-footer/app-footer.component.ts:62, src/app/shell/app-footer/app-footer.component.ts:93)

<details><summary>Evidence</summary>

```text
protected readonly backendVersion = httpResource<BackendVersion>(() => `${environment.backendUrl}version/`);
&#64; {{ buildInfo.timestamp | date: "medium" }}
// SSR TransferState on / includes an entry for http://localhost:8000/version/
```

</details>

<a id="f349"></a>

#### F349 · GraphQL documents ship their # comments and indentation: 49 KB of query text, 11 KB for the feed alone, sent on every request

**low** · effort S · performance · gap-3 · severity adjusted from medium

**Where:** `src/app/features/home/data/home-feed.queries.ts:15`, `src/app/features/home/data/home-feed-mutations.queries.ts:12`, `src/app/features/insiden/data/insiden.queries.ts:34`, `src/app/features/insiden/data/social-links.queries.ts:146`

**Problem.** Documents are plain template literals, so the long GraphQL # comments survive minification into the initial main chunk, and they are posted verbatim as the request body (requests are not compressed). The home page sends the 11 KB Feed document for the first page, the last-week page, every Load More, every 30-second poll beat, and the two vote-overlay reads for logged-in users. That is real upload cost on mobile connections for no information, and it grows every time someone documents a document.

**Recommendation.** Strip comments with the helper, but only at line starts or outside quotes, or keep comments out of the literal. Treat as polish.

_Original suggestion (corrected by the verifier):_ Keep the rationale as TypeScript // comments outside the template literal and keep the literal clean, and add a tiny module-load helper so nothing slips through: export const gql = (s: string) => s.replace(/#[^\n]*/g, '').replace(/\s+/g, ' ').trim(); then export const FEED_QUERY = gql(`...`). The helper runs once per document at import. Combine with the fragment change in the next finding to bring FEED_QUERY from 11 KB to about 1.5 KB on the wire. Add a spec asserting no exported document contains '#' or a double space so the regression is caught.

**Verification.** The documents are plain template literals with # comments (for example home-feed-mutations.queries.ts:12 and the long comment inside it), and they are sent verbatim as the POST body. The saving is real but limited to upload bytes. The regex helper would also strip a '#' inside a string literal, which matters only if a document ever contains one.

**Also reported as:** [F361](performance-bundle-and-ssr-hydration.md#f349) [home-data] Strip the long # comments from FEED_QUERY before it is bundled and posted (src/app/features/home/data/home-feed.queries.ts:15, src/app/features/home/data/home-feed.queries.ts:40); [F374](performance-bundle-and-ssr-hydration.md#f349) [home-ui] Every home GraphQL request carries its design comments: the feed query is 11.3 KB on the wire for 2 KB of query (src/app/features/home/data/home-feed.queries.ts:15, src/app/features/home/data/home-feed-mutations.queries.ts:13)

<details><summary>Evidence</summary>

```text
62 documents extracted with the TypeScript AST: 49,261 bytes as authored, 16,165 bytes with # comment lines and whitespace stripped. Largest: FEED_QUERY 11,256 B (2,017 B stripped), SUBMIT_FEED_LINK_MUTATION 9,216 B (1,653 B), INSIDEN_INCIDENTS_QUERY 5,074 B, PUBLIC_SOCIAL_MEDIA_LINKS_QUERY 4,831 B.
main-PHLJPND6.js in the production build contains "query Feed(\n    $first: Int!\n ... # Narrow the connection to links tagged with one line ..." and the Feed document is 11,323 bytes in the initial chunk.
```

</details>

<a id="f350"></a>

#### F350 · SUBMIT_FEED_LINK_MUTATION asks for a 5-level link tree of which only the id is read; use a GraphQL fragment for the repeated selection

**low** · effort S · data-fetching · gap-3 · partially confirmed · severity adjusted from medium · already documented

**Where:** `src/app/features/home/data/home-feed-mutations.queries.ts:12`, `src/app/features/home/data/home-feed-mutations.queries.ts:19`, `src/app/features/home/feed/link-submit-box.component.ts:233`, `src/app/features/home/data/home-feed.queries.ts:88`, `src/app/features/home/data/home-feed.queries.ts:226`, `src/app/features/home/data/home-feed.queries.ts:44`

**Problem.** After a submit, the component reads three scalars and link.id, then reloads the feed; the returned link tree is never used. MISTAKES.md justifies the full mirror by saying the payload type is FeedLink, but that type is hand-written, so the document, not the schema, decides the shape and the rationale does not hold. Separately, the identical selection pasted at four depths (and again in the mutation) is a maintenance trap: the spec has to pin 'every level has the relations' because nothing structural guarantees it.

**Recommendation.** Slim the mutation to link { id } and retype the payload. Update the MISTAKES.md:310 rationale and the home.queries.spec mirror assertions in the same change. Fragments are optional.

_Original suggestion (corrected by the verifier):_ (1) Change the mutation to submitFeedLink(input: $input) { ok isDuplicate duplicateOfId userVote link { id } } and type it Pick<FeedLink, 'id'>. (2) Define the selection once as a fragment string and interpolate it: const FEED_LINK_FIELDS = `fragment FeedLinkFields on SocialMediaLinkScalar { id url title created occurredAt ... }`; FEED_QUERY = gql(`query Feed(...) { publicSocialMediaLinks(...) { edges { node { ...FeedLinkFields sublinks { ...FeedLinkFields sublinks { ...FeedLinkFields sublinks { ...FeedLinkFields } } } } } } } ${FEED_LINK_FIELDS}`). The depth is still explicit, but the fields exist once; point the EXPECTED_LINK_LEVELS spec at the fragment text plus the nesting count. (3) Drop normalizedUrl from the feed root, for the same reason the author already dropped it from the nested levels.

**Verification.** The mutation does select a 5-level link tree, and link-submit-box.component.ts:233-239 reads only link.id and the scalars. MISTAKES.md:310 makes the mirror deliberate, with a spec pinning every level, so the finding is right that the tree is waste. A fragment rewrite would change that spec. The root normalizedUrl is documented as selected by both documents, and nothing renders it. The mutation runs only on submit, so the cost is small.

<details><summary>Evidence</summary>

```text
link-submit-box.component.ts:233-239 reads only: payload.isDuplicate, payload.duplicateOfId ?? payload.link.id, payload.store.setUserVote(payload.link.id, payload.userVote)
home-feed-mutations.queries.ts:19:      link {
        id url normalizedUrl title created occurredAt parentId isThreadRoot sublinkCount
        sublinks { ... sublinks { ... sublinks { ... sublinks { ...
The 17-field link block is written out 5 times in FEED_QUERY (sublinks at lines 88, 134, 180, 226) and 5 times in the mutation (9,216 bytes of source).
normalizedUrl is selected at the FEED_QUERY root (line 44) but nothing renders it.
```

</details>

<a id="f351"></a>

#### F351 · VEHICLE_EVENTS_QUERY selects ten fields the history list never reads (30% of the payload, 2.4x slower)

**low** · effort S · data-fetching · gap-3 · severity adjusted from medium

**Where:** `src/app/features/spotting/data/spotting.queries.ts:185`, `src/app/features/spotting/data/spotting.queries.ts:197`, `src/app/features/spotting/data/spotting.queries.ts:201`, `src/app/features/spotting/vehicle-detail/spotting-history/spotting-history.component.ts:50`

**Problem.** The vehicle detail page loads 20 events per page and renders only seven fields. The unread selection includes the nested LocationEvent join (six floats) which costs a database join per row, so slimming it reduces both bytes (-30%) and backend time (-59%). It repeats on every Load more.

**Recommendation.** Reduce the document to: events(...) { id spottingDate status type notes originStation { id displayName } destinationStation { id displayName } } and narrow the SpottingEvent type to those fields. If runNumber or wheel condition are wanted later for the card, add them with the feature, not before. Do the same audit for CONSOLE_EVENTS_QUERY and GET_MY_EVENTS_QUERY (check whether runNumber, mediaCount and wheelStatus are rendered).

**Verification.** VEHICLE_EVENTS_QUERY (spotting.queries.ts:185-215) selects runNumber, mediaCount, isMine, wheelStatus and the location block. The history template reads only id, spottingDate, type, stations, status and notes. The latency and byte figures were not re-measured.

<details><summary>Evidence</summary>

```text
spotting.queries.ts:197-209: runNumber mediaCount isMine wheelStatus location { accuracy altitudeAccuracy heading speed location altitude }
spotting-history.component.ts reads only event.id, spottingDate, type, originStation, destinationStation, status, notes.
Measured against the live backend for the busiest vehicle (id 58), limit 20: current document 6,090 B in 356 ms; slimmed document 4,244 B in 146 ms.
```

</details>

<a id="f353"></a>

#### F353 · Smaller unread selections: lastUpdated, flat-link tree fields, normalizedUrl, StationLine.internalRepresentation, gallery totalCount

**low** · effort S · data-fetching · gap-3 · partially confirmed

**Where:** `src/app/features/insiden/data/insiden.queries.ts:61`, `src/app/features/console/insiden/data/insiden-console.queries.ts:38`, `src/app/features/insiden/data/social-links.queries.ts:201`, `src/app/features/insiden/data/social-links.queries.ts:226`, `src/app/features/spotting/data/spotting.queries.ts:162`, `src/app/features/gallery/data/gallery.queries.ts:12`

**Problem.** Each of these is small alone, but they are on hot paths (the /insiden month load, the situasi 30 s poll, the submitted-links tab pages) and nothing reads them.

**Recommendation.** Delete lastUpdated, normalizedUrl (feed root), internalRepresentation and totalCount from the documents and types. For the flat link hosts, put the four tree fields behind a variable: add $withTree: Boolean = false to PUBLIC_SOCIAL_MEDIA_LINKS_QUERY and mark them with @include(if: $withTree) (My Links passes true), which keeps one shared document and its pinned field-parity invariant for the card list while dropping the dead bytes. Also lazy-load incident details (the card already lazily fetches history on expand) once real details text proves large.

**Verification.** The totalCount in gallery.queries.ts:12 and internalRepresentation (spotting.queries.ts:162) are unread, and normalizedUrl is selected but not rendered. lastUpdated is also copied in pending-incident.util.ts:51, so removal must touch the type and util too, though nothing displays it. The savings are small, as the finding says.

<details><summary>Evidence</summary>

```text
lastUpdated is selected in INSIDEN_INCIDENTS_QUERY and PENDING_INCIDENTS_QUERY and is read nowhere (grep of src/app finds only the documents and types). Measured on a 2-month window: 37,781 B full, 35,843 B without lastUpdated (-5.1%).
PUBLIC_SOCIAL_MEDIA_LINKS_QUERY: parentId / isThreadRoot / sublinkCount / position are read only by My Links; for 20 rows the response is 15,420 B with them and 13,898 B without (-9.9%), and the document's own comment concedes 'NO HOST DOES' read sublinkCount on the flat surfaces.
spotting.queries.ts:162 internalRepresentation is selected but never read; gallery totalCount is selected but never read.
```

</details>

<a id="f363"></a>

#### F363 · Do not claim 'Refreshing in 0s' in the server HTML, and fix the freshness stamp that says 'just now' on cached data

**low** · effort S · ssr-hydration · home-data · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/home/refresh-control/home-refresh-control.component.ts:148`, `src/app/features/home/refresh-control/home-refresh-control.component.ts:457`, `src/app/core/polling/polling-source.ts:30`, `src/server-cache-control.ts:7`

**Problem.** Two linked freshness problems. The server never starts a timer, so the SSR HTML shows a countdown of 0 seconds with an empty ring until hydration, which reads as a broken or stalled refresh for anyone on a slow phone, and the ring then sweeps in over one second. Separately, the CDN may serve this HTML up to 20 s fresh plus 60 s stale, TransferState suppresses the first fetch, and the first beat only fires 30 s after hydration, so data can be roughly 80 to 110 s old when the reader first looks, while the control stamps 'Last updated just now' at its first effect run. On a live disruption board the stamp is the one number readers trust.

**Recommendation.** Hide the countdown text/ring in SSR until the browser seeds the timer, and stamp 'last updated' from a server timestamp in TransferState rather than adding an extra post-hydration reload.

_Original suggestion (corrected by the verifier):_ Render the countdown text and ring only when secondsRemaining() > 0 (or show a neutral 'Live' label until the browser seeds the timer). Revalidate once after hydration when the page came from TransferState (afterNextRender(() => store.reloadFirstPages()) is two requests) and stamp 'last updated' from a server timestamp written into TransferState rather than Date.now() at hydrate.

**Verification.** Curl of / does return 'Refreshing in 0s' in SSR HTML, and HOME_CACHE_CONTROL (s-maxage=20, swr=60) plus a first beat 30s after hydrate means data can be about 80-110s old while the control stamps 'just now'. The stamp is a deliberate documented choice and the proposed revalidate-on-hydrate doubles requests, so the severity is overstated.

<details><summary>Evidence</summary>

```text
curl of / returns: Refreshing in 0s< and stroke-dashoffset="56.55" (empty ring); cache-control: public, s-maxage=20, stale-while-revalidate=60
if (firstRun) { firstRun = false; if (!isRefreshing && !pristineInitialLoad && !this.store.hasError()) { this._lastUpdatedAt.set(Date.now()); } }
```

</details>

<a id="f393"></a>

#### F393 · Reserve ad-slot space in the server HTML: boxes mounted after hydration shift the footer (CLS 0.03-0.66 on pages with ads)

**low** · effort S · ux · performance · partially confirmed · severity adjusted from medium

**Where:** `src/app/ui/ad-slot/ad-slot.component.ts:195`, `src/app/ui/ad-slot/ad-slot.component.ts:211`, `src/app/ui/ad-slot/ad-slot.component.ts:215`, `src/app/features/gallery/gallery.page.html:76`, `src/app/features/about/about.page.html:342`

**Problem.** The class comment explains that the SSR HTML contains zero ad DOM and the unit mounts only after afterNextRender. But the wrapper that reserves the fixed 250 px or 600 px height is part of that deferred DOM, so the space is only reserved after hydration, which pushes everything below (the footer, and on the gallery the Load more button) down by 250 px. The CLS measurements above show app-footer and the ad grid as the shifted nodes on every page that has a slot. The build I tested was the production build, where slots are enabled. The reservation logic inside the component is sound; it just starts too late.

**Recommendation.** Render the wrapper in SSR on server-rendered routes only, and fix the /about skeleton height separately; avoid collapsing visible slots after fill failure.

_Original suggestion (corrected by the verifier):_ Since ADS_CONFIG.enabled and the slot id are known on the server, render the outer wrapper (fixed height, invisible, overflow-hidden) in SSR whenever shouldRender would be true on the client, and keep only the <ins> element and the IntersectionObserver for the browser. Hydration stays consistent because both sides emit the same wrapper. For the unfilled case, collapse the box only when it is below the viewport so a late collapse cannot shift visible content.

**Verification.** ad-slot.component.ts puts the fixed-height wrapper inside @if (shouldRender()) which turns true only in afterNextRender, so space is reserved late. But the highest CLS (/about 0.66) is on a client-rendered route where SSR reservation cannot help, and the unfilled state also collapses the box (hidden), causing its own shift.

<details><summary>Evidence</summary>

```text
ad-slot.component.ts:195  () => this.render() && (this.isPlaceholder() || !!this.slotId()),
ad-slot.component.ts:215  this.render.set(true);
Measured CLS: /insiden app-footer 0.041; /insiden/2023-05-19 app-footer 0.032; /gallery/:id nav, app-footer, div.grid.gap-3 0.129; /about div.grid.gap-3 0.66; /gdpr app-footer 0.049.
```

</details>

<a id="f399"></a>

#### F399 · Load third-party origins deliberately: AdSense loads on every route and no preconnect hints exist

**low** · effort S · performance · performance · partially confirmed

**Where:** `src/index.html:92`, `src/app/core/ads/ads.config.ts:73`

**Problem.** The AdSense loader is in the static head, so it is requested on every route, including /tracker, /console and /profile where no slot is placed, and it starts competing with the app bundle for bandwidth and main-thread time on first load. Because the sandbox blocks ad hosts I could not measure its real TBT or request cost, so this is a risk to verify with a real-device trace rather than a measured defect. Separately there are no preconnect hints for origins the page will certainly hit: the GraphQL API host (a different origin from the page), i.imgur.com on /gallery, and firestore.googleapis.com on /about.

**Recommendation.** Add preconnect hints for the API, imgur and firestore origins; treat delaying the AdSense loader as an experiment after confirming Auto ads and site verification still work.

_Original suggestion (corrected by the verifier):_ Inject the AdSense script from a small service the first time an ad slot actually mounts (after the load event or on idle), and skip it on tracker, console and profile. Add per-route preconnect links (for example from a route resolver or a Meta/Renderer helper) for the API origin on routes that fetch it on the client, i.imgur.com on gallery pages and firestore.googleapis.com on about/gdpr. Measure with a throttled mobile trace before and after.

**Verification.** The AdSense script is in static index.html (line ~42, not 92) and no preconnect hints exist. But index.html documents this as Auto ads, which relies on the script being present on pages, and head presence is also commonly used for AdSense site verification, so deferring or skipping it by route can cost revenue or verification.

<details><summary>Evidence</summary>

```text
index.html:92-96  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3632544969292535" crossorigin="anonymous"></script>
rg for preconnect|dns-prefetch|rel="preload" under src: no matches. Console errors on every route: ERR_FAILED from blocked hosts.
```

</details>

<a id="f405"></a>

#### F405 · Tune App Hosting runConfig for SSR: measured cold start, memory headroom and CPU-bound concurrency

**low** · effort S · performance · platform · partially confirmed · severity adjusted from medium

**Where:** `apphosting.yaml:11`, `apphosting.yaml:13`, `apphosting.yaml:15`, `src/server.ts:125`

**Problem.** With minInstances 0 every visitor after an idle period pays about 3 s of process start plus about 3 s for the first render of each route (lazy route chunk load and JIT), so the first TTFB is 6 s or more. Twenty concurrent renders share one CPU, so queueing makes every request slower rather than faster, and the 512 MiB limit is already approached by a soaked process, which risks an out-of-memory restart that drops all in-flight requests. The server bundle is also large (202 files, about 34 MB in dist/web/server).

**Recommendation.** Check Cloud Run latency and memory metrics before changing runConfig. Consider minInstances: 1 for production only if cold starts are visible to users.

_Original suggestion (corrected by the verifier):_ Set `minInstances: 1` for production only (keep 0 in apphosting.staging.yaml), `memoryMiB: 1024`, and lower `concurrency` to about 8 to 10 for a 1 vCPU SSR workload, then let maxInstances absorb bursts. Add a warm-up in server.ts after listen: fire `angularApp.handle(new Request('http://localhost/'))` plus the two or three busiest routes once at boot so JIT and chunk loading are done before real traffic. Measure with Cloud Run request latency before and after.

**Verification.** The apphosting.yaml values match the quote. The cold-start measurements come from a loaded local machine, so they are not representative. minInstances: 1 has a real recurring cost, and the memory and concurrency advice is speculative without Cloud Run metrics.

<details><summary>Evidence</summary>

```text
runConfig: minInstances: 0, maxInstances: 4, concurrency: 20, cpu: 1, memoryMiB: 512. Measured on a fresh local process (machine load average about 10 on 12 cores): server listening after 3.05 s, idle RSS 98 MB, then first GET /methodology 3.43 s (a static page that takes 0.26 to 0.37 s warm) and RSS 155 MB. The long-lived local server on :4321 sat at 530 MB RSS (ps rss=534536) after 31 minutes of audit traffic.
```

</details>

<a id="f407"></a>

#### F407 · Reduce Sentry volume and cost: 10% session replay, no error filters, and failed-request capture on every 5xx

**low** · effort S · performance · platform · partially confirmed

**Where:** `src/main.ts:23`, `src/main.ts:39`, `src/main.ts:40`, `src/environments/environment.ts:34`

**Problem.** Recording 10% of all sessions as replays is expensive for a mostly-mobile audience and burns replay quota fast; the on-error 100% rule already covers the useful cases. httpClientIntegration reports every 5xx as an event, so a backend outage turns each visitor's polling GraphQL calls into a burst of identical events. Errors from the AdSense script and browser extensions are not filtered. And because the tunnel goes through the Django backend, the very events that would tell you the backend is down are routed through it and lost.

**Recommendation.** Add denyUrls and ignoreErrors filters. Tune the replay rate against the actual Sentry quota.

_Original suggestion (corrected by the verifier):_ Lower replaysSessionSampleRate to 0.01 to 0.02. Add `denyUrls: [/googlesyndication\.com/, /^chrome-extension:/]`, an `ignoreErrors` list for ResizeObserver loop messages, a `beforeSend` that drops repeated identical failed-request events, and a `tracesSampler` that returns 0 for the /version.json poll. Consider a separate small tunnel route on the SSR server (a `/monitoring` Express route that forwards the envelope) so Sentry does not depend on the backend being healthy.

**Verification.** replaysSessionSampleRate is 0.1, and there is no ignoreErrors or denyUrls anywhere in src. The 10% rate was a deliberate choice to match the old app, and the claim that failed-request events flood Sentry is speculative. Noise filtering is still reasonable polish.

<details><summary>Evidence</summary>

```text
Sentry.httpClientIntegration(), ... replaysSessionSampleRate: 0.1, replaysOnErrorSampleRate: 1.0, tracesSampleRate: environment.production ? 0.2 : 1.0, and `tunnel: `${runtimeConfig.backendUrl}sentry/``. There is no ignoreErrors, denyUrls, beforeSend or tracesSampler anywhere in main.ts or sentry-options.ts.
```

</details>

<a id="f416"></a>

#### F416 · Self-host and resize the About page's hot-linked avatars and tech icons (2.4 MB and 2.5 MB images for 32 to 40 px slots)

**low** · effort S · performance · profile-about-misc · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/about/about.page.html:180`, `src/app/features/about/about.page.html:273-283`, `src/app/features/about/about.page.html:316-326`, `src/app/features/about/editor/about-editor.component.html:117-123`

**Problem.** The CMS stores arbitrary third-party URLs and the page renders them as is. On a phone this means up to roughly 5 MB of images for decorative 32 px icons, some hosts may be dead or slow (a broken icon shows as an empty gap since alt is ""), nine third-party origins receive the visitor's IP and referrer, and the images cannot be sized or cached by the app. The plain <img> has no srcset or optimisation.

**Recommendation.** Have the editor upload images to Firebase Storage (the project already uses it for photos) and store only the Storage path, or mirror the current ones once into public/ assets resized to 64x64 WebP. Render them with NgOptimizedImage and fixed width/height, add referrerpolicy="no-referrer" for any remaining external URL, and add an (error) fallback like AvatarComponent already has to the tech and community icons.

**Verification.** about.page.html does render plain <img> with alt="" and external iconUrl values, lazy loaded at 32px. The image sizes come from CMS data I could not independently confirm. Real but contained to one admin-curated page.

<details><summary>Evidence</summary>

```text
Measured with curl against the live public/about document: https://i.imgur.com/raZ6gkm.jpg = 2,415,880 bytes (an avatar shown in a size-8/10 circle); the Firebase tech icon https://firebasestorage.googleapis.com/v0/b/first-class-blog.appspot.com/o/gifs%2Fnew-logo.gif?... = 2,530,664 bytes (shown at width="32" height="32"); https://vectorlogoseek.com/... and https://angular.io/assets/... did not respond within 15 s from the audit machine. Icons come from imgur, pbs.twimg.com, vectorlogoseek.com, wikimedia, postgresql.org, github.com, angular.io and djangoproject.com.
```

</details>

<a id="f420"></a>

#### F420 · Stop serialising the profile load and fold votes-cast into the main query

**low** · effort S · data-fetching · profile-about-misc

**Where:** `src/app/features/profile/profile.page.ts:73-98`, `src/app/features/profile/user-card/user-card.component.ts:251-274`, `src/app/features/profile/data/profile.queries.ts:8-112`

**Problem.** The own-profile page runs four network round trips in a waterfall: GetUserData first, and only after it resolves do the three children mount and fire their own requests (my events, my links, votes cast), each of which also awaits a fresh auth.idToken(). The links and events lists do not depend on the user query. A retry unmounts all children again (the @if swaps them for skeletons) and refetches everything. The votes-cast request is a tiny extra round trip for a secondary stat, and when it fails it raises an error toast ('Couldn't load votes cast') on page load, which reads as a page failure. GET_USER_DATA_QUERY and GET_PUBLIC_USER_QUERY also duplicate about 40 lines of selection.

**Recommendation.** Add `myVotesCast` to GET_USER_DATA_QUERY (it is a root field and can sit beside `user`) and pass it down as an input, deleting loadVotesCast and its toast. Mount app-my-spottings and app-my-links outside the `_user()` gate for the owner so they load in parallel, and keep a stable child tree on retry. Extract the shared selection into a GraphQL fragment (`fragment ProfileCore on UserScalar`).

**Verification.** Children are mounted only inside @else if (_user(); as user), so the events, links and votes requests run after the user query. myVotesCast is a separate root query. Real but a small latency cost.

<details><summary>Evidence</summary>

```text
@else if (isOwnProfile()) { @if (_isLoading()) { skeleton } @else if (_user(); as user) { <app-profile-user-card .../> ... <app-my-spottings [user]="user" .../> <app-my-links [isOwnProfile]="true" /> }
// user-card
effect(() => { if (this.isOwnProfile()) { untracked(() => void this.loadVotesCast()); } });
```

</details>

<a id="f425"></a>

#### F425 · Keep the 18 KB methodology registry out of the initial bundle

**low** · effort S · performance · profile-about-misc · partially confirmed

**Where:** `src/app/app.routes.ts:20-23`, `src/app/features/home/data/status-info.util.ts`, `src/app/core/methodology/methodology.content.ts`

**Problem.** app.routes.ts imports HomeStore eagerly to list it in the home route's `providers`, which drags the home data layer and the whole methodology prose registry into main, so /tracker, /gallery, /about and /profile visitors download it for nothing. About 6% of the initial JS is copy that only the home page and /methodology read.

**Recommendation.** Move the home providers into a lazy child route (`loadChildren: () => import('./features/home/home.routes')` exporting a route with `providers: [HomeStore, ...]`), or load the registry content through a dynamic import inside metricTooltip callers behind @defer. Re-run the build and confirm the 18 KB leaves main.

**Verification.** app.routes.ts imports HomeStore eagerly for the home route's providers, and status-info.util imports methodology-render. The bundle sizes were not re-measured. A real but small gain.

<details><summary>Evidence</summary>

```text
Measured from stats.json: main-PHLJPND6.js (289,986 bytes) contains 18,007 bytes of core/methodology/methodology.content.ts plus 945 bytes of constants and renderer. Import chain found in the metafile: app.config.ts -> app.routes.ts -> features/home/data/home.store.ts -> network-summary.util.ts -> status-info.util.ts -> core/methodology/methodology-render.util.ts -> methodology.content.ts.
```

</details>

<a id="f448"></a>

#### F448 · Remove the L7 map CSS from the global stylesheet so every route stops paying for it

**low** · effort S · performance · tracker-gallery

**Where:** `src/styles.css:16`, `src/styles.css:17`

**Problem.** Map-only styles are render-blocking on every page, including the home page and the incident calendar that never show a map. Since the global CSS is the largest single blocking resource, this directly delays first paint for the audience that mostly never visits /tracker.

**Recommendation.** Move the two imports (and the `.l7-popup-*` / `.l7-control-logo` overrides from styles.css lines ~185-235) into the tracker feature: set `styles: ["@import '@antv/l7-map/es/map/css/l7.css'; ..."]` with `encapsulation: ViewEncapsulation.None` on `TrackerMapComponent`, or add a lazy stylesheet loaded by the tracker route. The CSS then ships inside the lazy chunk.

**Verification.** styles.css lines 16-17 import the l7 CSS globally, so every route pays for it. Moving it into the lazy tracker component is valid.

**Also reported as:** [F464](performance-bundle-and-ssr-hydration.md#f448) [ui-system] @antv/l7 CSS (about 15 KB raw) is imported into the global stylesheet for every route (src/styles.css:16, src/styles.css:17)

<details><summary>Evidence</summary>

```text
@import "@antv/l7-map/es/map/css/l7.css";
@import "@antv/l7-component/es/css/index.css";

Built styles-2PWCLWTU.css = 94,752 B; the 160 rules containing `.l7-` total about 14,944 B (roughly 16 percent).
```

</details>

<a id="f449"></a>

#### F449 · Self-host the rail arrow texture, drop the unused marker image, and stop the always-on line animation

**low** · effort S · performance · tracker-gallery

**Where:** `src/app/features/tracker/map/tracker-map.component.ts:80`, `src/app/features/tracker/map/tracker-map.component.ts:86`, `src/app/features/tracker/map/tracker-map.component.ts:120`

**Problem.** The `"marker"` image is registered but nothing uses it (the only other occurrence of the string is a comment saying the marker shape was dropped), yet every visitor downloads it from an Alipay CDN in China. The arrow texture also depends on that third-party host, which is a reliability and privacy risk for a Malaysian audience and sits oddly with the GDPR page. The `animate` option on the rail LineLayer keeps a continuous WebGL render loop running even when the map is idle, which drains battery on phones, and it ignores `prefers-reduced-motion`.

**Recommendation.** Delete the `marker` `addImage` call. Copy the arrow SVG into `public/` and reference `/assets/rail-arrow.svg`. Make the animation conditional: `matchMedia("(prefers-reduced-motion: reduce)").matches ? no animate : animate(...)`, and consider dropping it entirely or running it only while the user is interacting.

**Verification.** Both images load from gw.alipayobjects.com, and the .animate() on the rail layer is present. The unused marker image claim is plausible and consistent with the code.

<details><summary>Evidence</summary>

```text
this.scene.addImage("marker", "https://gw.alipayobjects.com/mdn/antv_site/afts/img/A*BJ6cTpDcuLcAAAAAAAAAAABkARQnAQ");
this.scene.addImage("arrow", "https://gw.alipayobjects.com/zos/bmw-prod/ce83fc30-701f-415b-9750-4b146f4b3dd6.svg");
...
.animate({ interval: 1, duration: 1, trailLength: 2 })
```

</details>

<a id="f511"></a>

#### F511 · Every links action refetches the whole queue and locks all row buttons while it runs

**low** · effort M · data-fetching · console · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/console/insiden/links/links.component.ts:1153`, `src/app/features/console/insiden/links/links.component.ts:1176`, `src/app/features/console/insiden/links/links.component.ts:1318`, `src/app/features/console/insiden/links/link-queue-row.component.html:152`

**Problem.** The backend resolver returns the entire table with no pagination, and Approve, Hide, Unhide and Mark completed each end with `fetchLinks()` of that whole list while `isLoading` disables every action button on every row. Triage therefore runs serially at the speed of two mutations plus a full unbounded query per link, and the cost grows with the table. Approve, Hide and Mark completed do not change `parentId`, `sublinkCount` or `position`, so the refetch is not needed for correctness; only group, ungroup and reorder change server-computed structure.

**Recommendation.** Prefer removing or patching the row locally and a per-row busy set; keep the refetch for structural changes.

_Original suggestion (corrected by the verifier):_ For approve, hide, unhide and mark-completed, patch the row locally (`status`, `completed`, `completedAt`, `completedBy` from the logged-in admin's nickname) and keep the reload only for group/ungroup/reorder. Use a per-row `busyIds` set instead of the global `isLoading` so other rows remain clickable. Longer term, ask the backend for cursor pagination (the public feed already has `first/after`) so 'All' stops loading everything.

**Verification.** approveLink, setLinkStatus and friends do call fetchLinks() after the write and disable all row buttons via isLoading. The no-pagination claim was not checked on the backend. The local patch needs care with queue filters, since approved rows leave the Pending view.

<details><summary>Evidence</summary>

```text
links.component.ts:1176: await this.fetchLinks();   // after approve
link-queue-row.component.html:152: [disabled]="isLoading()"   // Approve, Hide, Unhide, Mark completed, Ungroup, nest, move
backend get_social_media_links: no pagination, no row cap
```

</details>

<a id="f519"></a>

#### F519 · Add a shared, keyed query cache so identical graphqlResource() queries are fetched once

**low** · effort M · data-fetching · core-shell · partially confirmed · severity adjusted from medium

**Where:** `src/app/core/graphql/graphql-client.ts:91`, `src/app/features/insiden/incident-form/incident-form.component.ts:149`, `src/app/features/insiden/link-form/link-form.component.ts:249`, `src/app/features/console/insiden/pending/pending.component.ts:201`, `src/app/features/console/insiden/links/links.component.ts:610`

**Problem.** Each call to graphqlResource() creates its own httpResource, so identical (query, variables) pairs are re-fetched by every component and again on every navigation back to a page that is not in the keep-alive set. The insiden reference data (lines to vehicles, 67 KB) is requested separately by the incident form, the link form, and two console pages, and the vehicle-type query by three spotting pages. There is no stale-while-revalidate layer, so a revisit shows skeletons instead of the last data.

**Recommendation.** Move the shared reference data into a root-provided store like SpottingLinesStore instead of building a generic cache.

_Original suggestion (corrected by the verifier):_ Introduce a root-provided QueryCache keyed by JSON of (query, variables) holding the last response with a fetchedAt timestamp, and let graphqlResource({ cache: { staleMs: 60_000 } }) seed its initial value from it and refresh in the background (stale-while-revalidate). Refer shared reference data (lines, vehicles, stations) through root stores like SpottingLinesStore already does, and migrate the four referenceResource sites to one store.

**Verification.** The same InsidenReferenceQueryData graphqlResource is created in 4 components, so duplicate fetches are real. A generic QueryCache is a heavy fix, and the repo already has root stores such as SpottingLinesStore.

**Also reported as:** [F531](performance-bundle-and-ssr-hydration.md#f519) [gap-3] Reference data is refetched by every consumer and the form pickers download the whole network's fleet (src/app/features/insiden/link-form/link-form.component.ts:250, src/app/features/insiden/incident-form/incident-form.component.ts:150)

<details><summary>Evidence</summary>

```text
const raw = httpResource<GraphQLResponse<TData>>(() => { ... body: { query: req.query, variables: req.variables ?? {} } }, resourceOptions);
// graphqlResource<InsidenReferenceQueryData> created independently in 4 components; vehicleTypesResource in 3 spotting pages
```

</details>

<a id="f533"></a>

#### F533 · Gallery year jumps walk up to 10,000 rows because medias has no year or date filter

**low** · effort M · data-fetching · gap-3 · already documented

**Where:** `src/app/features/gallery/gallery.page.ts:43`, `src/app/features/gallery/gallery.page.ts:45`, `src/app/features/gallery/gallery.page.ts:258`, `src/app/features/gallery/data/gallery.queries.ts:9`

**Problem.** Selecting an older year on the slider downloads every newer photo's metadata first, serially, up to 100 pages of 100 (about 2.7 MB), and the user waits on the 'Still loading' toast. The comment in the file already records the cause, so this is the same limitation, but it is worth backend work because mediasGroupByPeriod already knows the per-year counts.

**Recommendation.** Ask the backend to add a filter, medias(filters: { createdYear: Int }) or a createdAfter/createdBefore cursor seed, and jump directly with one request per year. Until then, lower the visible cost by sizing the jump pages from the year counts already loaded (skip count = sum of newer years) so the loop terminates after the exact number of pages instead of discovering it.

**Verification.** gallery.page.ts:43-45 has JUMP_PAGE_SIZE 100 and MAX_JUMP_PAGES 100, and the jump loop at line 258 pages serially. A real cost, but it applies only to deep year jumps and needs backend support for a proper fix.

<details><summary>Evidence</summary>

```text
gallery.page.ts:43: const JUMP_PAGE_SIZE = 100;
gallery.page.ts:45: const MAX_JUMP_PAGES = 100;
Measured: first:100 page = 27,601 B; the data holds 1,626 photos for 2023 and 813 for 2024. The schema's medias field accepts only order/before/after/first/last, no filter.
```

</details>

<a id="f539"></a>

#### F539 · Fetch official notices with a backend filter instead of the newest 50 full conversation trees

**low** · effort M · data-fetching · home-data · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/home/data/home-feed.util.ts:26`, `src/app/features/home/data/home-feed.util.ts:81`, `src/app/features/home/data/home.store.ts:643`, `src/app/features/home/pro/pro-official-widget.ts:67`

**Problem.** The widget wants a short list of operator posts, but it requests the newest 50 public links of all time with the full FEED_QUERY selection (five nested sublinks levels plus edit tags) and throws away the community ones in the browser. Locally 91% of the payload is discarded and the 41 KB sits in TransferState; in production, where community links outnumber official ones, a busy week can push every official post out of the newest 50 so the widget honestly says 'No official post in the newest public links' while official posts exist. The store comment says to add a backend isAutomated argument only if client filtering proves insufficient; both costs show it does.

**Recommendation.** Backend first: add an isAutomated/officialOnly argument, then a slim document; do not change the frontend until it lands.

_Original suggestion (corrected by the verifier):_ Add an isAutomated (or officialOnly) argument to publicSocialMediaLinks in the Strawberry schema, and give the widget its own slim document selecting id, url, title, occurredAt and lines only, with first: 20. Keep the variables a compile-time constant for TransferState reuse.

**Verification.** OFFICIAL_NOTICES_PAGE_SIZE=50 with a client-side isAutomated filter is real, but the store comment deliberately defers a backend arg 'only if client filtering proves insufficient'. It is Pro-only, lazy, and needs a backend change; the waste is real but the 'widget hides official posts' scenario is hypothetical.

<details><summary>Evidence</summary>

```text
export const OFFICIAL_NOTICES_PAGE_SIZE = 50;
.map((edge) => edge.node).filter((node) => node.isAutomated === true);
Measured on /?view=pro: the archive entry is 41,449 bytes for 44 links, of which 4 are official (9%).
```

</details>

<a id="f540"></a>

#### F540 · Lazy-load and @defer the Pro dashboard so rider-mode visitors do not pay for it

**low** · effort M · performance · home-data · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/home/home.page.ts:166`, `src/app/features/home/pro/pro-dashboard.component.ts:176`, `src/app/features/home/pro/pro-dashboard.component.ts:187`, `src/app/features/home/pro/pro-dashboard.component.ts:195`

**Problem.** HomePage imports ProDashboardComponent statically, so the default rider view downloads and parses the whole Pro bento (about a quarter of the home chunk). Inside Pro all six cells mount at once: the heat grid, incidents, ranking and the 41 KB official-notices read are below the fold but fire immediately and are serialised into the SSR page.

**Recommendation.** Use a route-level or @defer (when viewMode.view()==='pro') lazy load for the Pro branch only, accept a placeholder in SSR, and do not rely on hydrate triggers unless withIncrementalHydration() is added.

_Original suggestion (corrected by the verifier):_ In home.page.ts wrap the Pro branch in @defer (when viewMode.view() === 'pro') so the Pro chunk loads only on demand, and inside the dashboard wrap rows B and C in @defer (on viewport) with skeleton placeholders plus (hydrate on viewport) for SSR. Keep requestHistoryReads()/requestIncidentsRead() calls inside the deferred components so the reads follow them.

**Verification.** home.page.ts:44/105 statically imports ProDashboardComponent, so Pro code ships in the home chunk. But @defer renders only placeholders on the server, and withIncrementalHydration is not enabled in app.config.ts, so the suggested 'hydrate on viewport' would not work and ?view=pro SSR content would be lost without extra setup.

**Also reported as:** [F371](performance-bundle-and-ssr-hydration.md#f540) [home-ui] Defer the Pro dashboard and the sheet code; none of it is needed for the default Rider first paint (src/app/features/home/home.page.ts:94, src/app/features/home/home.page.ts:165)

<details><summary>Evidence</summary>

```text
Build metafile: the home page chunk contains 47,491 of its 179,284 source bytes from features/home/pro/ (network-heat-strip alone 12 KB), shipped to every visitor. Pro SSR is 385 KB HTML with 186 KB ng-state versus 236 KB and 141 KB for rider.
<app-pro-lines-widget /> ... <app-network-heat-strip /> ... <app-pro-incidents-widget /> <app-pro-report-ranking /> <app-pro-official-widget />
```

</details>

<a id="f545"></a>

#### F545 · A reader who prefers the Pro view gets the Rider layout in the SSR HTML and then a full layout swap after hydration

**low** · effort M · ssr-hydration · home-ui · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/home/data/home-view-mode.service.ts:96`, `src/app/features/home/home.page.ts:165`, `src/app/core/preferences/preferences.service.ts:259`

**Problem.** The stored preference is deliberately read in afterNextRender to avoid NG0500, so the server and the first client render always use the Rider default. Any returning Pro reader without ?view=pro in the URL therefore sees the Rider board and feed painted, hydrated, then destroyed and replaced by the Pro dashboard on every visit, with a large shift and wasted work (the rider board, feed and all their effects are built and thrown away).

**Recommendation.** Cookie-based SSR would clash with the public s-maxage cache; keep the deliberate trade-off or accept it, and only pursue the cookie with Vary handling if Pro usage is significant.

_Original suggestion (corrected by the verifier):_ Make the choice known on the server for those readers: write a small `rosak_view` cookie when the preference changes, read it in src/server.ts and provide it through an injection token so HomeViewModeService.view() returns it during SSR, and send `Vary: Cookie` or skip the s-maxage header in src/server-cache-control.ts when that cookie is present so the public cache is not polluted. A cheaper partial fix is for the toggle to also write ?view=pro into the URL and for bookmarks and shared links to carry it; and `@defer` the Pro dashboard so Rider readers do not download it (see the bundle finding).

**Verification.** view() falls back to preferences.viewMode() which is read after hydration by design (MISTAKES.md NG0500 entry at line 105), so Pro readers get Rider first then a swap. Impact is limited to returning Pro users without ?view=, and setView already writes ?view= to the URL, so the 'cheaper fix' is already done.

<details><summary>Evidence</summary>

```text
home-view-mode.service.ts:96  return this.preferences.viewMode();
home.page.ts:165  @if (viewMode.view() === "pro") { <app-pro-dashboard .../> } @else { <div ... data-testid="home-panels"> ... }
Playwright with localStorage rosak:preferences:v1 = {"viewMode":"pro"}, no ?view=: views seen in order ['none','rider','pro'], CLS 0.094.
```

</details>

<a id="f555"></a>

#### F555 · Defer Firebase Analytics and Auth initialization out of the startup path

**low** · effort M · performance · performance · partially confirmed · severity adjusted from medium

**Where:** `src/app/core/analytics/analytics.service.ts:44`, `src/app/core/analytics/analytics.service.ts:50`, `src/app/app.config.ts:130`, `src/app/core/auth/auth.service.ts:2`, `src/app/core/auth/auth.service.ts:89`

**Problem.** AnalyticsService is an app initializer, so before the first route renders on every page the browser creates the Firebase app, calls the Firebase config API for the measurement ID (the failed fetch in the console proves a network call at startup), loads gtag.js, and runs installations. Firebase Auth (85 KB attributed, the biggest single input in main.js) is also initialized eagerly in the AuthService constructor, although SSR always renders logged-out and the UI only needs the signed-in state a moment after hydration. Together these account for about 110 KB attributed (roughly 90 KB real, a third of main.js) plus a third-party script and two cross-origin round trips on the critical path.

**Recommendation.** Defer analytics init to idle after first render with a queued page_view; treat lazy firebase/auth as optional and only do it if whenReady remains the single awaited gate.

_Original suggestion (corrected by the verifier):_ Analytics: instead of the initializer, start it from afterNextRender plus requestIdleCallback with a dynamic import('firebase/analytics'); queue page_view events that arrive before it is ready. Auth: dynamic-import 'firebase/auth' inside the AuthService browser branch (keep whenReady as the single readiness promise, which adminOnlyGuard already awaits, and keep the e2e override path synchronous). Expect main.js to lose about 90 KB raw and the first paint to stop competing with gtag.js and the config fetch.

**Verification.** AnalyticsService is an app initializer calling getAnalytics at startup and @firebase/auth is 85 KB in main, as stated. But the initializer is synchronous and does not block first render, so 'critical path' is overstated; deferring Auth is riskier (login state flash, async login paths) than deferring Analytics.

**Also reported as:** [F529](performance-bundle-and-ssr-hydration.md#f555) [gap-2] Firebase Auth is 85 KB of the 290 KB initial bundle and loads for visitors who never sign in (src/app/core/auth/auth.service.ts:3, src/app/core/auth/auth.service.ts:79)

<details><summary>Evidence</summary>

```text
analytics.service.ts:44  this.analytics = getAnalytics(firebaseApp());
app.config.ts:130  provideAppInitializer(() => { inject(AnalyticsService); });
home.metrics.json console warning: "@firebase/analytics: Failed to fetch this Firebase app's measurement ID from the server."
main.js attributed bytes: @firebase/auth 85,475; @firebase/analytics 12,159; @firebase/installations 9,375; idb 3,729.
```

</details>

<a id="f561"></a>

#### F561 · Stop shipping the 432 KB Firestore SDK to read two static documents; read them over REST and server-render About and GDPR

**low** · effort M · performance · profile-about-misc · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/about/about.page.ts:6-12`, `src/app/features/about/about.page.ts:164-177`, `src/app/features/gdpr/gdpr.page.ts:3`, `src/app/features/gdpr/gdpr.page.ts:52-65`, `src/app/app.routes.server.ts:28-35`

**Problem.** Two pages that show a document edited by hand every few months pay about 128 KB gzipped (432 KB parsed) of Firestore SDK and keep a live listener (WebChannel connection) open for the whole visit, only to read one public document. Because the SDK is browser-only, the routes are RenderMode.Client, so /about and /gdpr return an 18 KB empty shell: crawlers that do not run JavaScript, link-preview scrapers and AdSense reviewers see no content, and the visitor sees a skeleton until the SDK has downloaded, initialised and connected. The code comment justifies Client mode by 'no SSR benefit', which misses the SEO and perceived-load cost; the rules (allow read on public/**) already permit unauthenticated REST reads.

**Recommendation.** Lower-effort first step: use a one-shot getDoc instead of a live onSnapshot. Move to REST plus server render only if SEO for these pages matters.

_Original suggestion (corrected by the verifier):_ Fetch the document from the Firestore REST endpoint, e.g. GET https://firestore.googleapis.com/v1/projects/${environment.firebase.projectId}/databases/(default)/documents/public/about, using a graphqlResource-style resource() over HttpClient (so TransferState carries it from server to browser), plus a ~40-line decoder for Firestore's typed JSON (stringValue, booleanValue, integerValue, arrayValue, mapValue). Then switch both routes to RenderMode.Server (or Prerender with a short revalidate) and delete the onSnapshot code. Keep the admin write path behind a dynamic import('firebase/firestore') inside the @defer'd editor so only admins load the SDK. A manual 'refresh' or one fetch per visit is enough for content that changes by hand.

**Verification.** about.page.ts and gdpr.page.ts are the only app importers of firebase/firestore besides specs, and both routes are RenderMode.Client with an onSnapshot listener. The cost and SEO claims are plausible, but the code comment gives a deliberate rationale and the bundle numbers were not rechecked. The fix is a large change for two rarely visited pages.

**Also reported as:** [F556](performance-bundle-and-ssr-hydration.md#f561) [performance] The full Firestore SDK (432 KB chunk, a third of it re2js) is shipped only to read two public documents (src/app/features/about/about.page.ts:165, src/app/features/gdpr/gdpr.page.ts:53)

<details><summary>Evidence</summary>

```text
Measured from stats.json: chunk-BPTWCUQR.js is 431,918 bytes raw (127,946 bytes gzip) and holds 292,190 bytes of @firebase/firestore; the only importers in src/app are about.page.ts and gdpr.page.ts. Code: this.unsubscribe = onSnapshot(firestoreDoc(firestore, "public", "about"), (snap) => { this._data.set(snap.data() as PublicAboutDocument | undefined);
Server routes: { path: "about", renderMode: RenderMode.Client }, { path: "gdpr", renderMode: RenderMode.Client }
```

</details>

<a id="f574"></a>

#### F574 · Do not move protobuf decoding to a Worker; shrink the decoder and lazy-load jszip/papaparse instead

**low** · effort M · performance · tracker-gallery · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/tracker/data/gtfs-realtime.service.ts:120`, `src/app/features/tracker/data/gtfs-static.service.ts:1`, `src/app/features/tracker/data/geojson-storage.service.ts:5`

**Problem.** The lead question was whether decoding should move to a Web Worker. The measured payloads are 0.4 to 10 KB per poll, so decode takes well under a millisecond and a Worker would add structured-clone and bundling complexity for nothing. The real cost is the library itself: a 232 KB non-ESM, fully generated protobufjs module (plus `long`), and jszip and papaparse (154 KB together) that are needed only after the user ticks a Stops or Railway layer, yet all of it loads up front with the map.

**Recommendation.** Only dynamic-import jszip and papaparse on first Stops/Railway use; keep gtfs-realtime-bindings.

_Original suggestion (corrected by the verifier):_ Keep decoding on the main thread. Replace `gtfs-realtime-bindings` with a hand-sized decoder built on `pbf` (already in the chunk via mapbox-gl, 13 KB) and the small `gtfs-realtime-pbf-js-module`-style schema for just VehiclePosition fields, or at least import only the needed generated message types. Convert `JSZip` and `Papa` to `await import("jszip")` / `await import("papaparse")` inside `GtfsStaticService.fetchAndLoad` and `GeojsonStorageService.getData`, so they become separate chunks fetched on first use. Add a Worker only if a future feed exceeds roughly 1 MB.

**Verification.** Static imports of JSZip/Papa in the services are real and lazy-loading them is cheap. Not moving decode to a Worker is right, but a hand-rolled pbf decoder replacing gtfs-realtime-bindings is high-maintenance for ~230 KB in a lazy chunk.

<details><summary>Evidence</summary>

```text
const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

Live feeds measured with curl on 2026-10-21: ktmb = 428 B, prasarana rapid-bus-kl = 9,786 B per poll.
Tracker chunk: gtfs-realtime-bindings 232 KB, jszip 128 KB, papaparse 26 KB (build log also warns: Module 'gtfs-realtime-bindings' used by 'gtfs-realtime.service.ts' is not ESM)
```

</details>

<a id="f580"></a>

#### F580 · InfoPopover skips hydration on every instance because of a conditional content-projection slot

**low** · effort M · ssr-hydration · ui-system · partially confirmed · severity adjusted from medium · already documented

**Where:** `src/app/ui/info-popover/info-popover.ts:136`, `src/app/ui/info-popover/info-popover.ts:190`, `src/app/features/home/line-pulse/status-info-chip.component.ts:33`, `src/app/features/spotting/line-details/line-details.page.ts:269`

**Problem.** Only two consumers use the [popoverExtra] slot, but the NG0502 workaround is applied to the shared component, so all 11 popovers on the home page (hero stats, status chips, network board) and their projected triggers are discarded and re-rendered on hydration rather than hydrated, which costs DOM work and risks a repaint of the most visible content. MISTAKES.md records the trade-off (2026-10-07 / the 22-byte 500 entry); the cost is not exempted by it, since the cause is fixable.

**Recommendation.** Replace the projected popoverExtra slot with a TemplateRef input, but keep the server-render spec and re-verify NG0502 on / before removing the skip.

_Original suggestion (corrected by the verifier):_ Replace the projected slot with a template input, as triggerTpl already does: extraTpl = input<TemplateRef<unknown> | null>(null) rendered with ngTemplateOutlet inside the @if panel. Consumers pass <ng-template #extra>...</ng-template>. Then drop ngSkipHydration, keep the renderApplication server spec that reproduced NG0502, and re-check that hydration still succeeds on / and /spotting/:id.

**Verification.** info-popover.ts:136 has ngSkipHydration on the host, so every popover re-renders on hydration. MISTAKES.md (line 349-356) documents it as a deliberate fix for a 500 on /; the template-input replacement is valid but is a riskier refactor than the finding admits.

<details><summary>Evidence</summary>

```text
ngSkipHydration: "",   (host metadata)
@if (_open()) { <div #panel ...> ... <ng-content select="[popoverExtra]" /> ...
SSR output of / contains 11 <app-info-popover> elements, each with ngskiphydration.
```

</details>

<a id="f583"></a>

#### F583 · HlmSheet instantiates all projected content (forms, nested sheets) even when it has never been opened

**low** · effort M · performance · ui-system · partially confirmed

**Where:** `src/app/ui/sheet/sheet.ts:40`, `src/app/ui/sheet/sheet.ts:53`, `src/app/features/home/home.page.ts:491`, `src/app/features/spotting/spotting-shell/spotting-shell.page.ts:56`

**Problem.** The class comment says the panel is 'not rendered-but-hidden' until first open, but content projected through ng-content is created and change-detected by its declaring view whether or not the slot renders. So the report form (about 17 KB of JS, signal forms, combobox, photo picker) and other sheet bodies are constructed on home and spotting pages for users who never open them, and a template reference such as #reportFormRef is what forces it for the footer.

**Recommendation.** Wrap heavy sheet bodies in @defer or @if bound to the sheet's opened state at the call site.

_Original suggestion (corrected by the verifier):_ Let sheets take lazy content: a contentChild(HlmSheetContent TemplateRef) rendered with ngTemplateOutlet inside the @if (_everOpened()) block, or have consumers wrap bodies in @if (sheet.isOpen() || ...) with a ref held by a small store. Measure sheet-body instantiation in a profile before and after.

**Verification.** sheet.ts gates its own panel with @if (_everOpened()), but projected ng-content is still created by the declaring view, so report-form is instantiated on the home page. The 17 KB and signal-forms numbers were not verified.

<details><summary>Evidence</summary>

```text
@if (_everOpened()) { <div ...> <ng-content /> </div> }
<div hlmSheetBody> <app-report-form #reportFormRef ... /> </div>   (home.page.ts:491, instantiated at page load)
```

</details>

<a id="f600"></a>

#### F600 · Use a WebGL point layer or clustering instead of one DOM Marker and Popup per vehicle

**low** · effort L · performance · tracker-gallery · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/tracker/map/rt-marker-layer.controller.ts:58`, `src/app/features/tracker/map/vehicle-marker-icon.ts:38`, `src/app/features/tracker/map/vehicle-marker-icon.ts:39`

**Problem.** Each vehicle creates an element, an SVG via `innerHTML`, a Marker and a Popup instance, and all are repositioned on every pan and zoom. Today's feeds are small (about 100 buses in the KL feed), but nine of the fifteen sources can be combined, and RapidBus feeds at rush hour are much larger. The 22 px circle is below the 44 px touch target guidance, and overlapping buses at city zoom levels are untappable. Colours are hard-coded (`#2563eb`) and ignore the dark theme.

**Recommendation.** Defer until feed sizes justify it; fix ghost vehicles and lazy popup HTML (finding 7) first.

_Original suggestion (corrected by the verifier):_ Draw vehicles with a single L7 `PointLayer` (shape from an icon sprite or `circle`, colour by staleness), update it with `layer.setData(...)` on each poll (the stops layer already does this), and open one shared `Popup` on `layer.on("click", ...)`. Enable `cluster: true` in the layer source for dense feeds. This also removes the need for the per-vehicle bookkeeping maps.

**Verification.** One DOM Marker+Popup per vehicle is real, but feeds are about 100 vehicles today and the issue is speculative scaling; contained.

<details><summary>Evidence</summary>

```text
marker = new Marker({ element: createVehicleMarkerElement(this.iconMode), anchor: anchorType.CENTER })
...
"display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;" +
```

</details>
