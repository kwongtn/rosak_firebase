# Known Defects & Traps — rosak_firebase

> Catalog of known defects, traps, and cross-component gaps so future agents don't repeat them.
> Entries use **Date**, **Component**, **Problem**, **Root Cause**, **Fix**, **Prevention**; fixed
> items carry a fix date + commit.
> Per-feature "missing shared utility" findings were previously duplicated once per feature **and**
> again in a `Cross-Component Systemic Issues` section. They are consolidated below into
> `## Cross-Component Opportunities` — one entry per capability, with the per-feature specifics kept
> as bullets. These mirror `docs/COMPONENTS.md` § Cross-Component Feature Opportunities.
> Squashed **2026-09-28** (previous squash: `e3f16cd`): entries sharing a root cause are merged into
> one entry with a bullet per case, narratives are cut to the actionable rule, and fully historical
> fixes are one-liners under `## Fixed`. Earlier detail lives in `git log -p -- MISTAKES.md`.

---

## Traps

### [2026-09-26] incident/schema: `SocialMediaLinkInput` is not a patch — a status-only update blanks the row

**Problem**: The console links queue's **Approve** needs to flip a row to `LIVE` and nothing else, but sending `{ status: "LIVE" }` is destructive — it blanks the title and strips every category, line, vehicle and station tag.
**Root Cause**: `update_social_media_link` assigns `title = write.title or ""` and `.set()`s the four id lists to whatever arrives (empty when omitted), so only `status`/`description`/`incidentId` are genuinely `strawberry.Maybe` omit-means-unchanged; the `?:` type mirror made the rest look like patches.
**Fix**: `approveLink()` re-sends the row's current `url`, `title` and all four id lists next to `status: "LIVE"`, the `UpdateSocialMediaLinkVars.input` doc comment states the full-replace semantics, and a spec pins the full approve payload.
**Prevention**: Before sending a partial update through any `*Input`, read the **service** — not just the GraphQL input — to see which fields it assigns unconditionally or `.set()`s; only fields the service treats as optional are omit-means-unchanged. Same trap applies to `CalendarIncidentInput`'s chronology/asset lists.

### [2026-09-25] spotting/route-persistence: default route reuse destroyed retained page state

**Problem**: Navigating `/spotting/:lineId` → `…/details` or `…/vehicle/:vehicleId` and back re-showed skeletons, refetched everything and lost window scroll; `scrollPositionRestoration` alone could not restore a page that no longer existed (and in-app "← Back" links don't fire `popstate`).
**Root Cause**: The three spotting page routes used Angular's default `RouteReuseStrategy`, so cross-page navigation destroyed the component, its resources and its DOM.
**Fix**: Opt-in `ReusableRouteStrategy` via `data: { reuse: true }` on the three routes, a browser-only `RouteScrollMemoryService`, and `revalidateOnReturn(<route pattern>, () => resource.reload())` hooks backed by the shared spotting route predicates; retained resources refresh silently.
**Prevention**: Keep `data: { reuse: true }` on the three routes and register a `revalidateOnReturn` hook for every new data section; verify the keep-alive flow including an in-app back while a refresh is pending.

### [2026-09-25] spotting/vehicle-spotting-grid: a pinned overlay is a second copy — derive both from one class source

**Problem**: The mobile current-type label renders twice (in-flow TYPE row + pinned overlay `grid-mobile-pinned-label`); their hand-maintained class lists had drifted, so the label visibly jumped when it pinned (font, colour, borders; pinned totals even used `border-t` vs the in-flow `border-b`).
**Root Cause**: Two template copies each carried their own duplicated class list.
**Fix**: Both read one class-producing method (`mobileTypeLabelClass()`), the pinned totals use `border-b`, and a spec asserts class parity between the copies.
**Prevention**: When one visual element exists as an in-flow row **and** a pinned/mirrored copy, both must read one shared class method or constant — never paste a second class list — and a spec must assert parity so drift fails loudly.

### [2026-09-24] spotting/vehicle-spotting-grid: mobile stacked layout — axis-relative classes, sticky mechanics, scroll-fitted e2e

**Problem**: The mobile (`<768px`) stacked grid hit four traps: the horizontal date scroller collapsed instead of scrolling; the sticky-left name cell didn't pin; the pinned overlay was inert; and the mobile e2e pin assertion could never engage.
**Root Cause**:

- `items-start` is axis-relative — harmless in the desktop `flex-row`, but under `flex-col` it sizes the `overflow-x-auto` body to content width.
- `position: sticky; left: 0` on a `colspan` `<td>` is not honoured reliably across browsers.
- A sticky element sticks to its nearest scrolling ancestor; the `overflow-x-auto` body is one (CSS promotes the other axis too) and never scrolls vertically, so a sticky descendant never engages.
- The e2e stub fleet (3 vehicles) made the page barely taller than the 844px viewport, so `scrollBy` clamped and the grid never reached the sticky boundary.

**Fix**: Bound the alignment (`[class.items-start]="!isNarrow()"`); pinned an inner `<div class="sticky left-0 w-fit">` inside the `<td>`; rendered the overlay as a page-sticky **sibling** of the scroller (`height: 0`); enlarged the stub to 2 types × 8 vehicles (~1150px).
**Prevention**: When a flex container flips direction, bind alignment utilities, don't leave them static. Never put `position: sticky` on a spanning cell or inside any `overflow` ancestor. For sticky e2e, size stub data taller than the viewport and assert `window.scrollY > 0` before asserting the pin.

### [2026-09-24] spotting/line-overview: the roster's table↔cards switch must clear the table's min-content width

**Problem**: At ~626–742px the fleet roster stayed a squeezed, overflowing desktop table; cards only engaged below ~640px.
**Root Cause**: The 7-column roster table cannot shrink below ~654px, but the switch sat at `sm` (640px), so "desktop" guaranteed less width than the table needs.
**Fix**: Raised the `vehicle-list` switch to `md` (768px) — toggle, table wrapper and card list all keyed to `md:`; cards render below 768px and the 654px table fits the card at 768px.
**Prevention**: Pin a data-dense table's mobile-switch breakpoint at or above its measured min-content width; probe `getBoundingClientRect().width` just **above** the chosen breakpoint, where the worst overflow lives — not at deep desktop widths.

### [2026-09-15 → 2026-09-24] testing: Angular unit-test builder & Vitest traps

**Problem**: Five ways a test run lied: selection flags that ran nothing, `isolate: false` cross-file leaks, module-mock identity that never matched, strict-null spec errors, and specs hitting the real GraphQL backend.
**Root Cause & Fix**:

- `ng test`'s first positional arg is the **project**, not a file — scope one spec with `--include <path>`; `--filter` is a case-sensitive **test-name** regex, so "file loaded but 0 tests ran" means a filter mismatch, not a pass.
- `@angular/build:unit-test` defaults to `isolate: false`: files in a worker share jsdom globals **and** the module cache. Cross-file leaks made specs pass alone and fail in the suite — use `vi.stubGlobal` + `vi.unstubAllGlobals()` for globals and restore mutated module/registry state in `finally` (`vi.resetModules()`); verify with `--isolate` when chasing order-dependence.
- With `isolate: false`, never assert on a `vi.mock` module binding: an earlier file can bind the real module into the cached service. Own the seam through TestBed DI (`UPLOAD_ERROR_REPORTER` is the reference fix); `gtfs-static.service.spec.ts` is a known instance.
- The unit-test build type-checks specs with **strict null checks on** regardless of the workspace tsconfig, so a typed `querySelector<T>(…)` deref fails (`TS18047`). Keep the `nativeElement.querySelector(…) as HTMLElement` idiom or null-guard.
- A spec for a component using `graphqlResource()` must provide `provideHttpClientTesting()` and flush its reference POST — mocking `GraphQLClient.request` alone leaves the real `httpResource` hitting `localhost:8000` (CI `ECONNREFUSED`, hung `whenStable()`). Never instantiate services that import `firebase/*` in specs; stub them.

**Prevention**: Use `--include` for files and a correctly-cased anchored regex for `--filter`, and re-run unfiltered before trusting a green result; treat "passes alone, fails in suite" as module-cache contamination, not a flake; write specs hermetic.

### [2026-09-24] SSR/hydration: two ways a server render breaks the client's first render

**Problem**: (a) `GET /` returned HTTP 200 with a 22-byte `Internal server error.` body while `/methodology` was fine, nothing logged; (b) the spotting details grid threw NG0500/NG0502.
**Root Cause**:

- (a) `StatusInfoChipComponent` projected `<div popoverExtra>` into `InfoPopover`'s `<ng-content select="[popoverExtra]" />` inside `@if (_open())`; the slot never exists on the server, so hydration annotation threw `NG0502` mid-stream, and `@angular/ssr`'s bare stream catch wrote a 22-byte fallback after the status line was already sent.
- (b) `REQUESTS_CONTRIBUTE_TO_STABILITY` defaults `true`, so the server awaited the grid's `httpResource`/`graphqlResource` POST and rendered the **desktop** branch with real data; the client's viewport-conditional `@if` wanted the mobile branch → mismatch.

**Fix**: `ngSkipHydration: ""` on the `InfoPopover` host (covers every `[popoverExtra]` consumer, commit `f0954ac`) and on `VehicleSpottingGridComponent`; a `renderApplication` server spec reproduces (a) without the fix.
**Prevention**: Never project content into a conditionally rendered slot; if you must, skip hydration and cover it with a server-render spec — a jsdom `TestBed` spec cannot catch it. Any first render depending on a browser-only signal while reading a resource needs `ngSkipHydration` with a comment naming the reason. Debug tip: a 22-byte 200 means the `@angular/ssr` stream catch fired — instrument the stream, nothing reaches the console.

### [2026-09-23] ui/combobox: text and value are two states — clear must clear, Enter must commit only a deliberate choice

**Problem**: Emptying a `HlmCombobox` appeared to do nothing (old label snapped back on blur, model kept the old id), and after the first fix clearing then pressing **Enter** still committed the previously highlighted item.
**Root Cause**:

- Typed text and committed value were decoupled: `_onInput` set only `search`, and the blur/`effect` resync re-derived the text from `value` + `items()`, resurrecting the label while `value` (and the `[formField]` model) kept the old selection.
- Clearing left the panel OPEN over the unfiltered list with `_highlightIndex` still pointing at the last item, so `_selectHighlighted()` committed a real (wrong) row on Enter.

**Fix**: `_onInput` clears `value` to the `emptyValue` input (default `undefined`; string-typed Signal Forms fields pass `""`), `_syncSearchToValue` short-circuits on `undefined` (`1f37d7d`), `_selectHighlighted()` returns early unless `_hasMovedHighlight()` or the query is non-empty (`22add7c`), and the three station placeholders lost `disabled`.
**Prevention**: In a text/value control, clearing the text must clear the value, and blur-time resync must treat "nothing selected" as a distinct state. Test the **commit gesture that follows the clear** (Enter), not just clear+blur — a fix is not verified until the failing gesture is reproduced in a spec.

### [2026-09-23] spotting/report-form: a reactive resource's requestFn must read projected primitives, not the whole model

**Problem**: Every write to the report model re-issued the station lookup — one Notes keystroke sent one `StationLinesByLine` POST (10 characters → 10 identical queries).
**Root Cause**: `stationLinesResource`'s requestFn read `this.model()` (the whole form signal) and `graphqlResource` tracks every signal read inside its requestFn, so any model write re-ran the fetch — although only `lineId`/`type` feed the request.
**Fix**: The requestFn reads two `computed`s of primitives, `_stationLineId` and `_stationType`, so only a line/type change re-runs it (`6bbb2a0`); a spec asserts an unrelated `notes` write triggers no station POST.
**Prevention**: A reactive resource's requestFn reads only the primitive fields its request depends on, projected through `computed`s. Mind the blind spot: jsdom/vitest flush resources synchronously and can't show the refetch-storm window — assert the projection, then reproduce in a browser.

### [2026-09-22] insiden/link-card: interactive controls must stay outside the navigational `<a>`

**Problem**: The shared `app-link-card` row is one large external-link anchor carrying a vote control and an edit pencil; inside the `<a>`, clicks would navigate instead of activating the control (and interactives nested in an anchor are invalid HTML).
**Root Cause**: When the whole row is the tap target, it is natural to drop controls into the body content.
**Fix**: The anchor wraps only the non-interactive body (favicon, URL, title, tags, Pending pill); vote button and edit pencil are siblings in `link-meta-rail`; the spec asserts `closest("a") === null` for both (`46b0319`).
**Prevention**: On any card whose row is a link, keep interactive children as siblings of the anchor and assert it in the spec — never nest a control in the anchor to widen its tap target.

### [2026-09-22] graphql: `graphqlResource()` is anonymous-only — per-user fields need an authenticated read

**Problem**: The home feed showed `userVote: 0` on SSR and first paint even for logged-in voters, so the vote control rendered "no vote".
**Root Cause**: `graphqlResource()` builds its own `httpResource` POST and sends no auth header, so the backend resolves an anonymous caller and every per-user field (`userVote`, `myVote`, …) returns the anonymous default.
**Fix**: `HomeStore` reads the feed anonymously, then — after `auth.whenReady`, when logged in — issues one authenticated `GraphQLClient.request(FEED_QUERY, vars, { "firebase-auth-key": idToken })` and overlays non-zero `userVote` values via a signal; `setUserVote()` keeps the overlay in sync.
**Prevention**: Treat `graphqlResource()` as anonymous-only. Any per-user field needs a separate authenticated read after `auth.whenReady`, overlaid onto the resource data, with the overlay documented at the call site so nobody "fixes" it by trusting the resource.

### [2026-09-22] home: the 30s poll beat reloads lines only, never `reloadAll()`

**Problem**: Pointing the front page's `PollingSource` at `reloadAll()` silently discarded the user's "Load More" feed pages every 30 seconds.
**Root Cause**: One method served two intents — `reloadAll()` is the submit/edit refresh (drops `appendedEdges`); the poll beat is a passive lines refresh.
**Fix**: The beat calls `reloadLines()` (`linesResource.reload()` + a `linesRefreshTick` bump) and leaves the feed untouched; the tick travels page → list → card → the open accordion's chart/reports, each reloading its own resource while expanded (`ae667fb`; `home.store.spec.ts` pins both paths).
**Prevention**: Give a periodic refresh its own method; never point a timer at the broad reset used by explicit user actions — split a call that serves two intents before attaching a beat.

### [2026-09-22] home: `status` (approval) and `completed` (admin handled) are independent axes

**Problem**: Approved links rendered the "Pending" pill — every seeded card plus four approved links under the situasi tab's "Pending (4)".
**Root Cause**: The pill rendered on `!completed` and the list split on `completed`, but `SocialMediaLink.status` (`LIVE`/`PENDING_APPROVAL`) is the approval axis while `completed` is the console's separate "mark handled" flag (`seed_demo_data.py` writes `status=LIVE`, never `completed`); `FEED_QUERY` didn't even select `status`.
**Fix**: The pill renders only for `status === "PENDING_APPROVAL"`, the list partitions approved = `status !== "PENDING_APPROVAL"`, and `FEED_QUERY`/`FeedLink`/`LinkCardItem` carry `status` (`fb136df`); specs pin the independence.
**Prevention**: When two fields describe different lifecycle axes, name which axis drives which UI at the field declaration and assert the independence in the spec — a "pending" affordance belongs to the approval enum, never to an admin's handled flag.

### [2026-09-22] home/line-status-chart: `line-status-bar` stays on the hour container, never on a segment

**Problem**: After each hour's bar split into per-status segments, moving or duplicating `data-testid="line-status-bar"` onto segments would make specs/e2e count one bar per segment and silently break every hour-count assertion.
**Root Cause**: The test id names the **hour**, but the DOM became a container plus N visual segments — the semantic unit and the visual pieces diverged.
**Fix**: The id stays on the hour container only; segments carry no test id (the spec selects `:scope > div`) (`476683d`).
**Prevention**: Keep a test hook on the semantic unit, not the visual pieces; when a component's DOM is subdivided, re-confirm each `data-testid` still resolves to the node specs/e2e assume.

### [2026-09-22] home/feed: capture URLs as `type="text"` and normalize in a pure util

**Problem**: Pasting a schemeless link (`example.com/story`) into the submit box did nothing — no request, no error, no toast.
**Root Cause**: `type="url"` made the browser's constraint validation reject the value before the submit handler ran (no app feedback), and the raw value was never an absolute URL anyway.
**Fix**: The input is `type="text"` + `inputmode="url"`; pure `feed-url.util.ts::normalizeFeedUrl()` scheme-qualifies at submit time (`https://` when none, `//host` handled, `http(s)://` untouched, other schemes left alone) (`dcf9885`).
**Prevention**: Don't rely on native `type="url"` for capture — it is browser/locale-dependent, fails silently, and rejects input the app can fix up; capture as text and normalize in a tested pure util.

### [2026-09-22] mutations: check the payload's `ok` before any success side effect

**Problem**: A line-status report the backend rejected (`submitLineStatusReport.ok: false`, no top-level GraphQL error) still toasted success and closed the sheet.
**Root Cause**: Business-level rejections are a normal GraphQL response, not a thrown error, so `catch` never saw them and any returned payload was treated as success.
**Fix**: The handler branches on `payload.ok` before toast/close/emit; a false `ok` sets the inline error (`[data-testid="line-status-submit-error"]`) and returns, mirroring the `GraphQLRequestError` path (`9c1acf8`).
**Prevention**: For any mutation whose payload carries an `ok` flag, check it before success side effects — a returned payload is not evidence of success, only `ok: true` is.

### [2026-09-22] repo/prettier: `.gitignore` is the ignore list, and `@for` blocks cannot hold comments

**Problem**: (a) Playwright artifacts (`test-results/`, `playwright-report/`, `blob-report/`) broke `npx prettier --check .`; (b) an HTML comment inside an `@for` block made `prettier --write` fail with `SyntaxError: ',' expected.` and drop the whole file from the formatting gate.
**Root Cause**: (a) Prettier's `--ignore-path` defaults to `[.gitignore, .prettierignore]` (verified against Prettier 3.9.6) — it _does_ read `.gitignore`; the artifacts simply weren't listed. (b) Prettier's Angular-HTML parser rejects comments inside control-flow block content (Angular's compiler is more permissive).
**Fix**: Added the artifact dirs to `.gitignore` (`6157823`); moved the comment's rationale into the owning function's TS docstring.
**Prevention**: Keep generated tool output gitignored — that one file is also Prettier's default ignore list, so no `.prettierignore` entry is needed; keep template comments outside `@if`/`@for`/`@switch` (a syntax error on a template line usually means one is inside a block).

### [2026-09-22] build: serialize builds and tests — they write the one repo-root `dist/`

**Problem**: Two concurrent `npm run build` runs produced a broken/partial build instead of two complete ones.
**Root Cause**: Angular writes browser + server bundles and the SSR entry to one `dist/`; there is no per-invocation output directory, so simultaneous runs race on the same files.
**Fix**: Serialize invocations — one at a time, or `flock dist/.build.lock npm run build` so a second run waits.
**Prevention**: Never run `npm run build` (or the suite) concurrently in the same checkout; when agents share a workspace, use the `flock` lock or separate git worktrees.

### [2026-09-16] ui/card: never override a directive host class from the template

**Problem**: `LinkCardComponent`'s `hlmCard class="gap-3 p-4"` always rendered `gap-4 p-5` — the element classes were dead code.
**Root Cause**: Both class sets land on the same element; the `[hlmCard]` host-class rules in `ui/card/card.ts` win on cascade order, regardless of specificity or source-of-binding (`hlm()` cannot merge host-class rules).
**Fix**: The compact link card dropped `hlmCard` and carries explicit classes (hlmCard's tokens minus its spacing) with a comment explaining why.
**Prevention**: Never override a directive host class from the template. If a card needs different padding/gap, parameterize the directive or use plain element classes for that instance; grep for other `hlmCard class="gap-` / `class="p-` instances before "tightening" a layout the same way.

### [2026-09-15] CI/deploy: keep installs hermetic and workflows validator-safe

**Problem**: The `Deploy Functions` job died at `npm ci` (lockfile drift, Node 18 EOL) and `firebase deploy --only functions` would have found no codebase; separately, adding a job-level `if:` on `secrets` made GitHub fail the run at startup (0s, no jobs).
**Root Cause**: `functions/package-lock.json` was never regenerated after a dependency bump (`@types/express` tree unsatisfied), `engines.node` stayed on EOL 18, and the App Hosting rewrite dropped the old hosting config without adding a `functions` codebase. GitHub's validator rejects `secrets` in job-level `if:`.
**Fix**: Regenerated the lockfile, bumped `engines` + workflow to Node 20, added `functions: { source: functions }` to `firebase.json`; exposed secret presence as job `env` (`HAS_WIF_SECRETS`) and gated only auth/deploy steps on it.
**Prevention**: Run `npm ci` in `functions/` after any dependency change; keep `engines` and the workflow's `node-version` in sync; any `firebase deploy --only <target>` needs that target in `firebase.json`. Never use `secrets` in job-level `if:` — use the env + step gate and run `actionlint .github/workflows/`.

---

## Fixed

Historical fixes with no live action; kept so the ground isn't re-covered. Full detail in git.

- **2026-08-24** — `console`: `adminOnlyGuard` was a `return true` stub; now awaits `auth.whenReady` and redirects non-admins (`29b5d6d`; `AGENTS.md` warns not to re-fix).
- **2026-08-24** — `gdpr`/`about`: Firestore read failures rendered identically to an empty document; added `isError`/`hasError` + a retry action (`ba95758`).
- **2026-08-24** — `console`/`profile`: the duplicated bulk-action pattern was extracted to `useBulkActions` (`873202f`, inferred).
- **2026-09-22** — `AGENTS.md`: it documented a `postGraphQL()` helper that never existed; it now names `inject(GraphQLClient).request(query, variables, headers)` for writes.

---

## Cross-Component Opportunities

> Five shared capabilities are repeatedly needed but do not exist. Build the utility **once**, then
> apply it to every listed feature. Numbering follows `docs/COMPONENTS.md` (non-AI opportunities
> 1–3; AI opportunity 4).

### 1. Shared URL / query-param sync — `syncSignalWithQueryParam` (`core/composables/`) — 7 features

The app has **zero** existing query-param-binding pattern; only path params are wired (Angular component-input-route-binding). A working URL-sync example exists in `line-overview` (`sort`/`dir` params).

- **console** — shareable/saved moderation filter views (e.g. "unread depot spottings with notes"); `ConsolePage` does not inject `ActivatedRoute`; filter state lives only in local signals.
- **gdpr** — deep-link to an individual checklist item; `group.title`/`child.title` are used as `@for` track keys but not rendered as element `id`s.
- **about** — anchors for the three content sections (projects, personnel, tech stack); `AboutPage` takes no route params.
- **spotting** — `VehicleSpottingGridComponent`'s `statusFilter`/`months` (owned by `line-details.page.ts`) are plain local signals; `months` is a computed date range, not a flat enum, so it needs custom encoding (e.g. ISO month key).
- **insiden** — `detailsExpanded`/`photosExpanded` in `IncidentCardComponent` are local signals; day selection already round-trips (`/insiden/:dateKey`).
- **tracker** — shareable map view: `LayerSelectionService`'s applied (layer) signals plus viewport (center, zoom) are not synced.
- **gallery** — the route already syncs `selectedMedia` to `/gallery/:mediaId`; only a copy-link button is missing in `MediaViewerComponent`.

**Prevention**: handle encoding/decoding, default omission, browser-only writes, SSR safety; make query-param sync a required acceptance criterion for any new filterable view.

### 2. Shared client-side export utility — `core/export` — 4 features

Data is already resident client-side in every case — no backend/query changes needed.

- **console** — export the filtered moderation queue (`events: Signal<ConsoleEvent[]>`).
- **profile** — export spotting history (`_eventsSignal`).
- **insiden** — `.ics` calendar feed; `CalendarIncident` already carries start/end datetime, title, brief.
- **gallery** — bulk download of a year's photos as a zip; evaluate client-side fetch-and-zip vs. a backend batch-export endpoint by expected volume.

**Prevention**: build `toCSV<T>()`, `toJSON<T>()`, `toICS(events)`, `downloadBlob(blob, filename)` once; add export as a standard capability for any data-table / media-grid; add "Add to calendar" for date-based lists.

### 3. Shared persistence — `UserPreferenceService` (`core/services/`) — 3 features

The only persistence today is the upload queue's upload-specific IndexedDB; there is no localStorage wrapper or per-user Firestore-doc pattern.

- **tracker** — save/favorite layer presets; the `LayerSelectionService` draft/applied/undo signal triplet is the seam (otherwise state resets to `layer-config.ts` defaults on reload).
- **spotting** — persist report-form drafts (sessionStorage) so closing the sheet doesn't lose the in-progress report (an `effect()` currently calls `clear()` on close).
- **profile** — store settings for the proposed settings sub-page.

**Prevention**: generic key-value API (`get`/`set`/`watch`, localStorage-first, optional Firestore sync); design state services with persistence as a pluggable concern.

### 4. Shared AI / LLM gateway — `AiGatewayService` (`core/ai`) — 9 features

Every feature doc independently proposes an LLM-/embedding-based feature (captioning, summarization, anomaly detection, NL query parsing, conversational form-fill), but there is no AI infrastructure — no `core/ai` service, no LLM API client, no embeddings store.
**Prevention**: establish a provider-agnostic gateway (auth, rate-limiting, caching, streaming) before any AI feature; all features inject the same gateway — no bespoke integrations.

---

## Prevention Checklist for Future Work

- [ ] **Security** — never leave guards in pass-through state; track as a blocking issue.
- [ ] **Error handling** — every async subscription needs an error signal + error UI + retry.
- [ ] **Code review** — check for duplicate patterns across features; extract to `core` on the second occurrence.
- [ ] **Documentation** — update component docs when fixing systemic issues so future audits don't re-discover.

---

\*Entry dates are catalogue dates (2026-08-13 Phase 1 per-feature audits; 2026-08-24 fixes) unless a fix commit is shown. Compiled from `docs/COMPONENTS.md` and `docs/components/*.md`.
