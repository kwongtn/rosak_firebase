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

### [2026-09-16] ui/card: `hlmCard` host classes win over element-class overrides — `class="gap-3 p-4"` was dead code

**Problem**: `LinkCardComponent` wrapped its card in `hlmCard class="gap-3 p-4"` expecting the
element classes to tighten the layout — but the card always rendered `gap-4 p-5`. Empirically
verified against the compiled `dist/web/browser/styles-*.css`: Tailwind v4 emits spacing
utilities in ascending order (`p-4` rules come after `p-5`), so the `[hlmCard]` host-class rules
in `ui/card/card.ts` (`gap-4 p-5`) always beat any element-class override regardless of the
`class` attribute value.
**Root Cause**: The `hlm()` class-merge helper can't help either — both class sets end up on the
same element, and cascade order (not specificity or source-of-binding) decides. Custom
directives with host-class styling are not overridable from the template.
**Fix**: The compact link card dropped `hlmCard` entirely and carries explicit classes
(`bg-card text-card-foreground border-border flex flex-col gap-1.5 rounded-xl border p-2.5
shadow-sm` — hlmCard's own tokens minus its spacing) with a comment explaining why.
**Prevention**: Never override a helmet/directive host class from the template. If a card needs
different padding/gap, either parameterize the directive or use plain element classes for that
instance. Grep for other `hlmCard class="gap-` / `class="p-` instances before "tightening" a
layout the same way.

### [2026-09-22] graphql: `graphqlResource()` sends no auth token — per-user fields read as anonymous

**Problem**: The front page's feed showed `userVote: 0` for every link on SSR and first paint even when the visitor was logged in and had voted, so the vote control rendered "no vote" until the user voted again.
**Root Cause**: `graphqlResource()` builds its own `httpResource` POST and sends no auth header, so the backend resolves an anonymous caller; any per-user field read through it (`userVote`, `myVote`, …) comes back as the anonymous default. The only place a token can ride is `GraphQLClient.request`'s optional third `extraHeaders` argument, and the resource wrapper has no auth-token binding.
**Fix**: `HomeStore` reads the feed anonymously as before, then — after `auth.whenReady`, when logged in — issues one authenticated `GraphQLClient.request(FEED_QUERY, vars, { "firebase-auth-key": idToken })` and records every non-zero `userVote` into a `signal<Record<string, number>>` overlay. `userVoteFor(linkId)` prefers the overlay over the anonymous feed value; `setUserVote()` keeps it in sync after a successful vote.
**Prevention**: Treat `graphqlResource()` as anonymous-only. Any per-user field needs a separate authenticated read (`GraphQLClient.request` + `idToken`) after `auth.whenReady`, overlaid onto the resource data. Document the overlay at the call site so the next reader doesn't "fix" `userVote` by trusting the resource.

### [2026-09-22] build: two concurrent `npm run build` runs corrupt the shared `dist/` output

**Problem**: Running two `npm run build` invocations at once (two agents or terminals in the same checkout) produced a broken/partial build instead of two complete ones.
**Root Cause**: Angular writes its browser + server bundles and the SSR server entry to a single repo-root `dist/`; there is no per-invocation output directory, so simultaneous runs race on the same files.
**Fix**: Serialize builds and tests — one invocation at a time, or guard with a lockfile (e.g. `flock dist/.build.lock npm run build`) so a second run waits instead of clobbering the first.
**Prevention**: Never run `npm run build` (or the test suite) concurrently in the same checkout. When agents share a workspace, wrap the command in a `flock`-based lock or work in separate git worktrees.

### [2026-09-22] home/feed: native `type="url"` silently blocked schemeless input

**Problem**: Pasting a schemeless link (`example.com/story`) into the feed submit box did nothing — no request, no inline error, no toast — so the UI looked broken for a URL every other tool accepts.
**Root Cause**: The input was `type="url"`, so the browser's own constraint validation rejected `example.com/story` **before** the submit handler ran. Because the block happens outside app code, it produced no feedback, and the raw value would never have been an absolute URL anyway.
**Fix**: The input is now `type="text"` + `inputmode="url"` (the mobile keyboard stays URL-shaped) and the new pure `feed-url.util.ts::normalizeFeedUrl()` scheme-qualifies the value at submit time — `https://` prefixed when no scheme is present, protocol-relative `//host` handled, an existing `http(s)://` left untouched, other schemes (`mailto:`, `ftp://`) left alone. Commit `dcf9885`.
**Prevention**: Don't rely on native `type="url"` for URL capture — its validation is browser/locale-dependent, fails silently with no message, and rejects input the app can fix up. Capture as `type="text"` and normalize in a tested pure util before sending.

### [2026-09-22] home/line-status: ignored `ok: false` payload showed a false success toast

**Problem**: Submitting a line-status report the backend rejected (`submitLineStatusReport.ok: false`, no top-level GraphQL error) still toasted "Line status reported" and closed the sheet, so the user believed a report was saved when nothing was.
**Root Cause**: Business-level rejections are a normal GraphQL response, not a thrown error, so the handler's `catch` never saw them and the code treated any returned payload as success. Only thrown errors (transport, `GraphQLRequestError`) were handled.
**Fix**: The handler branches on `payload.ok` **before** any success side effect; a false `ok` sets the inline error (`[data-testid="line-status-submit-error"]`) and returns, mirroring the `GraphQLRequestError` path. Only a truthy `ok` closes the sheet and emits. Commit `9c1acf8`.
**Prevention**: For any mutation whose payload carries an `ok` flag, check it before toast/close/emit. A returned payload is not evidence of success — only `ok: true` is.

### [2026-09-22] insiden/link-card: interactive controls must stay outside the navigational `<a>`

**Problem**: The shared link card (`app-link-card`) carries a vote control and an edit pencil inside a row whose body is an external link. If either control were rendered inside the `<a>` (the natural place when the whole row is the tap target), clicking it would follow the link instead of triggering the control, and nested interactive elements inside an anchor are invalid HTML.
**Root Cause**: The row is one large anchor, so it is easy to drop the controls in with the rest of the body content; a click anywhere inside an anchor navigates, regardless of the control under the pointer.
**Fix**: The anchor wraps only the non-interactive body (favicon, URL, title, tags, Pending pill); the vote button and edit pencil live in `link-meta-rail` as siblings of the `<a>`. `link-card.component.spec.ts` asserts `closest("a") === null` for both. Commit `46b0319`.
**Prevention**: On any card whose row is a link, keep interactive children (buttons, toggles, menus) as siblings of the anchor and assert it in the spec. Never nest a control inside the anchor just to widen its tap target.

### [2026-09-22] build/test: scope one spec with `--include`, never a positional path

**Problem**: Running one spec by appending its path (`npm test -- --no-watch src/app/features/home/data/home.store.spec.ts`) did not run that spec; the Angular CLI parsed the path as the _project name_ and failed (`Argument: project, Given: "…", Choices: "web"`), so nothing ran.
**Root Cause**: `npm test` is `ng test`, whose first positional argument is the project, not a file glob. Spec selection is the unit-test builder's `include` option.
**Fix**: Use `npm test -- --no-watch --include <path>`; verified with `--include src/app/features/home/data/home.store.spec.ts` (1 file / 8 tests). `--filter <regex>` narrows by suite/test name, not by file.
**Prevention**: For a single file use `--include`; for a single suite or test use `--filter`. Never pass a bare path positionally to `ng test`.

### [2026-09-22] repo/prettier: Playwright artifacts broke `prettier --check .` (and Prettier _does_ read `.gitignore`)

**Problem**: After an e2e run, Playwright wrote `test-results/`, `playwright-report/` and `blob-report/` into the repo root; `npx prettier --check .` then failed on the unformatted report files (e.g. `test-results/.last-run.json`). It is tempting to blame "Prettier does not read `.gitignore`", but that is backwards.
**Root Cause**: Prettier's CLI `--ignore-path` defaults to `[.gitignore, .prettierignore]` (verified against Prettier 3.9.6 in this repo via `npx prettier --help`). Prettier therefore _does_ honour `.gitignore`; the artifacts broke the check only because they were not yet listed there. Confirmed with a throwaway probe: a badly-formatted file under a gitignored directory is skipped, while the same file under a tracked directory is flagged.
**Fix**: Added `/test-results`, `/playwright-report` and `/blob-report` to `.gitignore` (commit `6157823`). Because Prettier reads `.gitignore`, that alone is sufficient; no `.prettierignore` entry is needed.
**Prevention**: Keep generated tool output (Playwright reports, coverage, build output) in `.gitignore`; that one file is also Prettier's default ignore list. Do not add a separate `.prettierignore` before checking whether `.gitignore` already covers the path.

## Fixed

### [2026-09-22] AGENTS.md: `postGraphQL()` referenced a non-existent API

**Problem**: The "Data access" convention told agents to call `postGraphQL()` for mutations. No such function exists anywhere in the repo — the only hits are the AGENTS.md line and a stale docstring in `graphql-client.ts` — so anyone following it had to guess the real write API.
**Root Cause**: The convention named a helper that was never shipped; the real surface is `graphqlResource()` for reads and `GraphQLClient.request(query, variables?, extraHeaders?)` for writes, but the doc wasn't kept in step with the implementation.
**Fix**: AGENTS.md now names `inject(GraphQLClient).request(query, variables, headers)` for mutations (same commit as this entry).
**Prevention**: Every API name in AGENTS.md should be greppable in `src/`; when the doc and the code disagree, the code is the contract. A fixed doc claim gets a progress entry plus a MISTAKES entry like this one.

### [2026-09-15] CI: `vi.mock` identity diverges across specs (`isolate: false` shared registry)

**Problem**: `image-upload.service.spec` failed only in CI (`expected "vi.fn()" to be called at least once`) while passing locally — repeatedly, across unrelated fixes (polling, awaiting). The service genuinely called `captureException`, but on the REAL `@sentry/angular` module, not the spec's mock.
**Root Cause**: The Angular unit-test builder runs Vitest with `isolate: false`, so spec files in a worker share one module registry and execute in timing-dependent order. If any earlier file (e.g. `incident-card.component.spec`, which imports the service without a Sentry mock) evaluates `image-upload.service` first, the service binds the real Sentry while the spec's own import resolves to its mock — the assertion can never pass. Which files share a worker depends on CPU count, so it passes on some machines and fails on others.
**Fix**: Report through an injectable `UPLOAD_ERROR_REPORTER` token (root factory defaults to `Sentry.captureException`); specs provide a spy via TestBed DI, which is per-test and immune to registry sharing. Test and service import the token from the same (cached) module instance, so identity always matches.
**Prevention**: Never assert on a module-mock (`vi.mock`) binding for code under test in this repo — any spec asserting a mock must own the seam through TestBed DI. Suspect order-dependent flakes first when CI fails but local passes: check `isolate` in the builder executor. Cross-reference (2026-09-22): `features/tracker/data/gtfs-static.service.spec.ts` is another known instance of this class (module-level mock + `isolate: false`), still a pre-existing order-dependent flake; treat it the same way (own the seam through DI) before chasing it as a regression.

### [2026-09-15] deploy-functions: job-level `if:` on `secrets` rejected by GitHub validator

**Problem**: Adding `if: ${{ secrets.WIF_PROVIDER != '' ... }}` to gate the deploy job produced a 0s startup failure ("This run likely failed because of a workflow file issue", run named by file path, no jobs).
**Root Cause**: GitHub's workflow validator rejects `secrets` in a job-level `if:` condition.
**Fix**: Expose presence as job `env` (`HAS_WIF_SECRETS`) and gate only the auth/deploy steps with `if: env.HAS_WIF_SECRETS == 'true'` — install/build/test still validate on every push; run `actionlint` (installed) on workflow edits before pushing.
**Prevention**: Never use `secrets` in job-level `if:`; use the env+step-gate pattern. Run `actionlint .github/workflows/` locally for every workflow change.

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
