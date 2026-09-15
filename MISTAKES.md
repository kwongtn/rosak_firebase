# Known Defects & Traps — rosak_firebase

> Catalog of known defects, traps, and cross-component gaps so future agents don't repeat them.
> Entries use **Date**, **Component**, **Problem**, **Root Cause**, **Fix**, **Prevention**; fixed
> items carry a fix date + commit.
> Per-feature "missing shared utility" findings were previously duplicated once per feature **and**
> again in a `Cross-Component Systemic Issues` section. They are consolidated below into
> `## Cross-Component Opportunities` — one entry per capability, with the per-feature specifics kept
> as bullets. These mirror `docs/COMPONENTS.md` § Cross-Component Feature Opportunities.

---

### [2026-09-15] deploy-functions: `npm ci` lockfile drift + Node 18 EOL + missing `functions` codebase

**Problem**: `Deploy Functions` workflow failed at `npm ci` — lockfile's `@types/express` tree did not satisfy `package.json`, and the job ran Node 18 while `cheerio`/`vite`/`vitest`/`undici` require ≥20. `firebase.json` also had no `functions` section, so `deploy --only functions` would have found no codebase even past install.
**Root Cause**: `functions/package-lock.json` was never regenerated after a dependency bump; `engines.node` stayed on EOL Node 18; the App Hosting rewrite dropped the old hosting config from `firebase.json` without adding a functions codebase.
**Fix**: Regenerated the lockfile (`npm install` in `functions/`), bumped `engines` and the workflow to Node 20, added a minimal `functions` codebase (`source: functions`) to `firebase.json`.
**Prevention**: Run `npm ci` in `functions/` locally after any dependency change; keep `engines` and the workflow's `node-version` in sync; any workflow touching `firebase deploy --only <target>` needs that target present in `firebase.json`.

## Fixed

### [2026-09-15] CI: console specs hit the real GraphQL backend (unmocked `graphqlResource` HttpClient)

**Problem**: `CI` test job failed on every run — 14/18 `links.component.spec` tests and `pending.component.spec` `savePanelEdit` failed with `Http failure response for http://localhost:8000/graphql/` (`ECONNREFUSED`), plus timeouts from the helper's backoff retry keeping `whenStable()` from settling.
**Root Cause**: Both components load dropdown reference data through `graphqlResource()` (its own `HttpClient`/`httpResource`), but the specs only mocked `GraphQLClient.request` — the pattern that works for components without `graphqlResource`. The unmocked `httpResource` hit the real backend, errored, and (a) threw during change detection wherever the template read `referenceResource.data()`, and (b) scheduled retry `setInterval`s that hung `fixture.whenStable()`. `savePanelEdit` failed the same way: `buildUpdatedRow()` reads the reference lookups, threw, and the row was never patched. Same family: `pending` spec instantiated the real `IncidentAiService` (pulls in `firebase/app+auth`, whose persistence calls `indexedDB.deleteDatabase` — absent from the shared jsdom mock), producing the `self.indexedDB.deleteDatabase is not a function` unhandled error.
**Fix**: Follow the existing `link-form`/`incident-form` spec pattern — `provideHttpClientTesting()` + flush the single reference POST with empty `{ lines, stations, calendarIncidentCategories }` + `httpMock.verify()`; stub `IncidentAiService` in the pending spec; add `deleteDatabase` to the IndexedDB mock and poll `Sentry.captureException` via `vi.waitFor` in the image-upload spec.
**Prevention**: Any spec for a component using `graphqlResource()` must include `provideHttpClientTesting()` and flush its reference query — the `GraphQLClient` mock alone is never sufficient. Never instantiate services that import `firebase/*` in specs; stub them.

### [2026-08-24] console: `adminOnlyGuard` Always Returned True (Unprotected Admin Route)

**Problem**: The `/console` admin moderation route was accessible to any visitor who knew the URL — `adminOnlyGuard` unconditionally returned `true` with a `TEMPORARY` comment.
**Root Cause**: The Firebase `admin` custom claim was not reliably granted server-side, so the real `auth.isAdmin()` check was commented out as a stopgap — the guard boundary existed at the routing layer but enforcement was disabled.
**Fix**: Enforced the admin claim check in `admin-only.guard.ts` (awaits `auth.whenReady`, then returns `auth.isAdmin() ? true : router.createUrlTree(["/spotting"])`). **Commit: 29b5d6d** (2026-08-24).
**Prevention**: Never leave a security guard in "temporary pass-through" state without a tracking issue + deadline; add a CI check that fails on `return true` with a `TEMPORARY` comment; document the server-side claim dependency in the guard's JSDoc.

### [2026-08-24] gdpr / about: Firestore Read Failure Rendered Identically to Empty Document (Silent Failure)

**Problem**: A genuine Firestore read failure (network error, permission denied, document not found) rendered identically to an empty document — no error UI, no retry option, no user-visible distinction. Both features independently hit it.
**Root Cause**: The `onSnapshot` error callback only cleared `isLoading` (`() => this.isLoading.set(false)`), leaving `_data` as `undefined`; the template's `isLoading` / `details().length === 0` branches collapsed "still loading" and "failed to load" into the same empty state. The `_data` signal + `computed()` projections + manual subscribe/unsubscribe pattern is structurally identical in `gdpr` and `about`.
**Fix**: Added an `isError`/`hasError` signal set from the error callback, plus an `@if (isError())` branch with a Retry button that re-subscribes to the Firestore document. **Commit: ba95758** (2026-08-24).
**Prevention**: Every async data subscription MUST have an explicit error signal + error UI branch; reuse the shared `RetryBannerComponent` pattern (already used by insiden); when a duplicated pattern is found, fix both features simultaneously.

### [2026-08-24] console / profile: Bulk-Action Pattern Extracted to `useBulkActions`

**Problem**: `console`'s `selectMode`+`checkedIds` bulk-action pattern was hand-rolled and independently needed by `profile`.
**Fix**: Extracted to a shared `useBulkActions` composable. **Commit: `873202f`\*** (inferred from git log).
**Prevention**: Extract a duplicated pattern to `core` on its second occurrence.

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
