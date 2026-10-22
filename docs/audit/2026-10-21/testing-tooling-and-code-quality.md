# Testing, tooling and code quality

Part of the [rosak_firebase audit, 2026-10-21](../2026-10-21.md). 59 findings, most severe first.

Strict mode, ESLint, coverage, CI hygiene and dependency automation are missing, and risky auth, upload, tracker and date logic lacks specs. Several duplicated implementations should be consolidated.

<a id="f069"></a>

#### F069 · Analytics: first page_view is double-counted, page_title is stale, and page_path leaks queries and profile ids

**medium** · effort S · code-quality · core-shell

**Status, quality pass 2026-10-22:** Fixed (`d62db3f`, `02dcc46`, `df2ca27`, `c720d37`). `AnalyticsService` creates analytics with `send_page_view: false` behind `isSupported()` and starts from `afterNextRender`, injected by `App` (no app initializer). It logs one `page_view` a microtask after `NavigationEnd`, with the current title and with `page_path` and `page_location` set to the route pattern, so a query string, fragment, profile id or `utm_*` value is never sent. The analytics spec runs on the real route tree and fails if a marker placed in any route parameter reaches `page_path`; `app.spec.ts` checks that `App` creates the service.

**Where:** `src/app/core/analytics/analytics.service.ts:44`, `src/app/core/analytics/analytics.service.ts:64`, `src/app/core/analytics/analytics.service.ts:67`, `src/app/app.routes.ts:33`

**Problem.** getAnalytics() leaves GA4's automatic page_view enabled, and the service also logs a manual page_view on the first NavigationEnd, so every landing is counted twice (the code comment claims the SDK's own event fires 'only once', which is exactly the duplicate). The router's TitleStrategy updates document.title after it emits NavigationEnd, so page_title carries the previous page's title (and all lazy routes share only a handful of static titles anyway). page_path is urlAfterRedirects, so it includes query strings and fragments and, for /profile/<firebase uid>, a per-user identifier, producing high-cardinality paths in reports. getAnalytics is also called without isSupported(), and it runs inside an app initializer, so the gtag script starts loading during bootstrap.

**Recommendation.** Create analytics with initializeAnalytics(app, { config: { send_page_view: false } }) so only the manual event fires, and gate on await isSupported(). Log page_view from a small router subscription that waits one microtask (or reads router.routerState.snapshot.title via the TitleStrategy) so the title is current, strips the query and fragment, and normalises /profile/:id and /gallery/:id to their route pattern. Start it from afterNextRender or an idle callback instead of an app initializer.

**Verification.** The service calls getAnalytics, which keeps the default auto page_view, and also logs a manual page_view on every NavigationEnd including the first. Angular updates the title after emitting NavigationEnd, so document.title is stale. page_path uses urlAfterRedirects, which keeps query strings and profile ids.

<details><summary>Evidence</summary>

```text
this.analytics = getAnalytics(firebaseApp());
...
router.events.pipe(filter(NavigationEnd)).subscribe((event) => this.trackPageView(event.urlAfterRedirects));
...
logEvent(this.analytics, "page_view", { page_path: path, page_location: window.location.origin + path, page_title: document.title });
```

</details>

<a id="f072"></a>

#### F072 · Angular budgets and the build summary do not count eager shared chunks, so the real initial JS is about 3.5 times the reported size

**medium** · effort S · performance · deps-tooling · partially confirmed · severity adjusted from high

**Status, fix pass 2026-10-21:** Fixed (`698b61a`). Fixed as a side effect of F015. `@angular/build` 22.2 counts eager shared chunks as initial: the total is now 984.97 kB (257 kB transfer) against the 1 MB error budget, and the 500 kB warning fires on every build until its threshold is revisited.

**Where:** `angular.json:42-44`, `.omo/evidence/audit-2026-10-21/build/build.log (Initial chunk files table)`, `.omo/evidence/audit-2026-10-21/build/stats.json`

**Problem.** main-PHLJPND6.js statically imports four other chunks, all of which the browser must load before the app starts. Those chunks hold Angular core and common, the router and Spartan sonner, Sentry, and the insiden-page shared code. Together the eager JavaScript is about 1,087 KB raw and roughly 296 KB of brotli transfer. The build summary and the 500 kB initial budget see only the 290 KB main file, so no budget warning fires and regressions in shared code go unnoticed. The Initial total line understates real start-up JS by about 2.8 times.

**Recommendation.** Add a small post-build check that walks dist/web/stats.json from the entry point over import-statement edges, sums raw and gzip sizes, and fails above an agreed threshold. Run it from the postbuild step next to the Sentry script and record the baseline in the progress docs. Also check whether the initial-set classification in @angular/build can be corrected by the shared-chunk configuration, and file an upstream issue if it cannot.

**Verification.** The metafile confirms main-PHLJPND6.js imports four chunks via import-statement, and build.log lists them only in the lazy table with no budget warning, so the tooling gap is real. The cost itself is a measurement and budget gap rather than a user-facing defect, which makes high severity overstated, and the 3.5x versus 2.8x ratios in the text are inconsistent.

**Also reported as:** [F395](testing-tooling-and-code-quality.md#f072) [performance] The initial-bundle budget reports 385 KB while the real eager JavaScript is 1.03 MB, so the 1 MB budget cannot catch regressions (angular.json:40, AGENTS.md:75); [F411](testing-tooling-and-code-quality.md#f072) [platform] Loosen no more: tighten performance budgets and add one for lazy chunks (angular.json:40, angular.json:43)

<details><summary>Evidence</summary>

```text
build.log: "main-PHLJPND6.js | main | 290.04 kB | 73.54 kB" ... "Initial total | 384.79 kB | 88.11 kB". Lazy list then shows chunk-DzGSJuSF.js 273.61 kB, chunk-B4nR8PUe.js 131.30 kB, chunk-A8PJBogX.js 334.73 kB, chunk--iiApWbu.js 57.21 kB. angular.json:43: "maximumWarning": "500kB".
```

</details>

<a id="f073"></a>

#### F073 · TypeScript strict mode is off although the whole app and spec suite already type-check strictly

**medium** · effort S · code-quality · deps-tooling · already documented

**Status, quality pass 2026-10-22:** Fixed (`a541d97`). `tsconfig.json` sets `strict` and `angularCompilerOptions` sets `strictTemplates`, both explicitly. The app and the specs already satisfied both: the production build reports zero template errors. The dead `?? 0` after `link.userVote` is removed from both bindings in `link-list.component.ts`, which clears two NG8102 warnings, and `AGENTS.md`, which said `strictTemplates` was not set, is corrected. Narrowing `types` in `tsconfig.app.json` is F324.

**Where:** `tsconfig.json:4-20`, `tsconfig.app.json:1-9`, `src/app/features/insiden/link-list/link-list.component.ts:45`, `src/app/features/insiden/link-list/link-list.component.ts:82`

**Problem.** The repo guidance treats strict as deliberately off and asks developers to guard by hand. The measurements show that the code already satisfies strict null checks and strict template checks, so the guard-by-hand policy is only a rule, not a need. Leaving strict off means future regressions (for example a missing null guard) reach production silently. Strict mode also has no price today. The four NG8102 warnings are the only findings, and they point at dead nullish fallbacks that can be removed.

**Recommendation.** Set "strict": true in tsconfig.json and add "strictTemplates": true to angularCompilerOptions. Remove the redundant ?? operators at link-list.component.ts:45 and :82, or keep them with a comment if the type is genuinely wider at runtime. Then run npm run build and npm run test:ci. Also consider narrowing "types": ["node"] in tsconfig.app.json so browser code cannot silently use Node globals.

**Verification.** tsconfig.json has no strict key while the spec build already runs strict null checks, and the colleague's strict measurements are plausible given the code guards. The compiler-side change is small, but AGENTS.md, MISTAKES.md and several component docs describe strictNullChecks as deliberately off, so those docs must change in the same commit.

**Also reported as:** [F408](testing-tooling-and-code-quality.md#f073) [platform] Turn on strict, strictTemplates and noUnusedLocals: the code already compiles under them (tsconfig.json:4, tsconfig.json:17)

<details><summary>Evidence</summary>

```text
tsconfig.json has no "strict" key; it sets only "noImplicitOverride", "noPropertyAccessFromIndexSignature", "noImplicitReturns" and "noFallthroughCasesInSwitch". Measured: npx tsc -p tsconfig.app.json --noEmit --strict reports 0 errors across 283 app files; tsc -p tsconfig.spec.json --noEmit --strict reports 0 errors across 158 spec files. An ngc run with strict and strictTemplates set (noEmit, probe config outside the repo) reports 0 errors and 4 NG8102 warnings, all from link-list.component.ts:45 and :82: "[userVote]=\"voteValues()[link.id] ?? link.userVote ?? 0\"".
```

</details>

<a id="f075"></a>

#### F075 · Several packages are imported without being declared in package.json

**medium** · effort S · code-quality · deps-tooling

**Status, quality pass 2026-10-22:** Fixed (`c75d799`). `@antv/l7-map`, `@antv/l7-component` and `@antv/l7-utils` are declared at 2.29.1, the version `@antv/l7` resolves, and `@types/geojson` is a devDependency. The lockfile diff is four added lines. **Left:** `@antv/l7-maps` stays a direct dependency. The recommendation removes it only once the MapLibre finding is resolved.

**Where:** `src/styles.css:16-17`, `src/app/features/tracker/map/rt-marker-layer.controller.ts:3`, `src/app/features/tracker/data/geojson-storage.service.ts:7`, `src/app/features/tracker/data/gtfs-static.service.ts:7`, `package.json:43`

**Problem.** These imports resolve only because npm hoists transitive dependencies into node_modules. A future @antv/l7 upgrade, an npm dedupe, or a lockfile regeneration can move or drop these packages and break the build or the tracker styling without any change in this repo. The declared @antv/l7-maps entry is the reverse problem: it is a direct dependency that nothing imports directly, and it is the package whose barrel pulls in MapLibre (see the MapLibre finding).

**Recommendation.** Declare @antv/l7-map, @antv/l7-component and @antv/l7-utils at the exact versions @antv/l7 2.29.1 resolves, and add @types/geojson as a devDependency. Remove @antv/l7-maps from the direct dependencies once the MapLibre finding is resolved, unless a direct import is needed. Run npm ci afterwards and check that the lockfile diff is minimal.

**Verification.** package.json has no entries for @antv/l7-map, @antv/l7-component, @antv/l7-utils or @types/geojson, while styles.css and rt-marker-layer.controller.ts import from them. A grep of src shows no direct import of @antv/l7-maps, so that dependency is declared but unused directly.

<details><summary>Evidence</summary>

```text
styles.css:16: "@import \"@antv/l7-map/es/map/css/l7.css\";" and styles.css:17: "@import \"@antv/l7-component/es/css/index.css\";". rt-marker-layer.controller.ts:3: "import { anchorType } from \"@antv/l7-utils\";". Both @antv/l7-map, @antv/l7-component and @antv/l7-utils are absent from package.json. geojson types come from "import type { FeatureCollection } from \"geojson\";" with no @types/geojson entry. package.json:43 declares "@antv/l7-maps" but no source file imports it.
```

</details>

<a id="f076"></a>

#### F076 · Functions tests and deploy do not run on pull requests

**medium** · effort S · testing · deps-tooling

**Status, quality pass 2026-10-22:** Fixed (`c78e67b`, `8769abc`, `544cc3f`). `ci.yml` has a `functions` job (Node 20, `working-directory: functions`, `npm ci`, `npm run build`, `npm test`, plus a report-only `npm audit`). `deploy-functions.yml` runs `npm test` as a required step, without `--if-present`.

**Where:** `.github/workflows/deploy-functions.yml:13-18`, `.github/workflows/deploy-functions.yml:63`, `.github/workflows/ci.yml:4-9`

**Problem.** functions/ contains four spec files (extractionParser, geminiSchemas, hourKey, pageContentFetcher), but a pull request that changes functions/ never runs them. The tests only run after a merge to main or staging, so a broken parser reaches the default branch before anyone sees the failure. The functions deploy also runs only on push, so a broken deploy is discovered only after merge.

**Recommendation.** Add a functions job to ci.yml that runs on pull_request with working-directory functions, using node-version 20 to match functions/package.json, and runs npm ci, npm run build and npm test. Keep the deploy job on push as it is. Make the functions test step required rather than --if-present, since the spec files exist.

**Verification.** functions/ has four spec files and ci.yml triggers only on pull_request without any functions job, while deploy-functions.yml runs npm test --if-present only on push to main or staging with a functions/** path filter. A broken parser can therefore merge without a failing check.

<details><summary>Evidence</summary>

```text
deploy-functions.yml: "on:\n  push:\n    branches:\n      - main\n      - staging\n    paths:\n      - \"functions/**\"" and step "run: npm test --if-present" (line 63). ci.yml has jobs lint, test, build and e2e, all scoped to the root package.json; none runs in functions/.
```

</details>

<a id="f191"></a>

#### F191 · Centralise the firebase-auth-key header instead of hand-attaching it at 43 call sites, and give graphqlResource an authenticated mode

**medium** · effort M · architecture · core-shell

**Where:** `src/app/core/graphql/graphql-client.ts:91`, `src/app/core/graphql/graphql-client.ts:212`, `src/app/features/insiden/incident-card/incident-card.component.ts:393`, `src/app/features/home/data/home.store.ts:1232`, `src/app/features/console/insiden/links/links.component.ts:962`

**Problem.** Because graphqlResource() has no header channel, every authenticated read must be a hand-written imperative GraphQLClient.request() with its own token fetch, try/catch and loading flags, which loses TransferState, request cancellation on destroy, deepEqual retention, isFetching and the retry banner. The same two lines are copied about 40 times, so a change in the header name, a token-refresh policy, or a logged-out short-circuit has to be applied everywhere. One call site that forgets the header silently sends an anonymous request (the home vote overlay in MISTAKES.md:394 is a symptom).

**Recommendation.** Add a functional HttpInterceptorFn registered with provideHttpClient(withInterceptors([...])) that, for requests whose URL starts with environment.backendGraphqlUrl or backendUrl and when the browser has a signed-in user, awaits AuthService.idToken() and clones the request with 'firebase-auth-key'. Keep an opt-out header or context token (HttpContextToken ANONYMOUS) for the public cacheable reads. Then add an options flag to graphqlResource({ authenticated: true }) that waits for auth.whenReady before issuing the first request. Callers drop their idToken boilerplate and authenticated reads can become real resources.

**Verification.** No interceptor exists in app.config or core. firebase-auth-key appears about 57 times in 19 non-spec files, hand-attached, so the duplication and drift risk is real. The count is slightly overstated (some are comments).

**Also reported as:** [F526](testing-tooling-and-code-quality.md#f191) [gap-2] The Firebase token header is hand-attached at about 45 call sites, with no central expired-token handling and double error toasts (src/app/core/graphql/graphql-client.ts:212, src/app/core/graphql/graphql-client.ts:229); [F564](testing-tooling-and-code-quality.md#f191) [security] Auth token header is hand-attached at 43 call sites; a forgotten header silently makes writes anonymous (src/app/core/graphql/graphql-client.ts:63, src/app/features/insiden/link-form/link-form.component.ts:455)

<details><summary>Evidence</summary>

```text
const idToken = await this.auth.idToken();
const data = await this.graphql.request<...>(QUERY, vars, idToken ? { "firebase-auth-key": idToken } : {});
// 43 occurrences of "firebase-auth-key" in 19 non-spec files; ~40 callers of auth.idToken()
```

</details>

<a id="f203"></a>

#### F203 · Add specs for the untested risky logic in this slice

**medium** · effort M · testing · core-shell

**Status, quality pass 2026-10-22:** Partly fixed (`31bd096`, `63ba5a7`, `ee42649`, `3cc94bb`, `0b08dbf`, `7b5e081`, `850c3a6`). Specs now cover `AuthService` (override branch, session restore, admin claim and login errors, in the new `auth.service.firebase.spec.ts`), `ImageCompressionService`, `NewVersionService` (the version poll and rejected chunk imports), `ThemeService`, `AnalyticsService`, `graphqlResource` (retry schedule, countdown, reset, GraphQL-errors answer, destroy, and on the server: no timer, nothing re-sent, `hasError` stays false) and the upload queue with `upload-queue-db`. The retry-schedule spec found a real bug: the first retry waited 10 s instead of 5 s, because `scheduleRetry` read the attempt counter after the effect had incremented it. It is fixed with `2 ** (attempt() - 1)` (`3cc94bbe`), and the schedule is 5, 10, 20, 40, 80, 160, 180, 180 s. **Left:** Two scenarios are not written because the code has no such behaviour: `graphqlResource` '4xx terminal' (every error retries on the same schedule) and the upload queue '4xx dropped, backoff, uid mismatch' (it retries forever every second; F045, F194 and F219 are open and no package owns them). `RecaptchaService`, the redirect-to-own-profile guard and the `AppNav` component still have no specs.

**Where:** `src/app/core/auth/auth.service.ts:66`, `src/app/core/upload/image-compression.service.ts:45`, `src/app/core/analytics/analytics.service.ts:41`, `src/app/core/version/new-version.service.ts:37`, `src/app/core/theme/theme.service.ts:27`

**Problem.** The riskiest code (token and claim handling, EXIF and canvas compression, the version poller and chunk-error listeners, analytics page_view wiring, the retry schedule in graphqlResource) is the code without specs, and several of the defects listed in this report live exactly there. The graphql-client spec confirms a countdown exists but not its values, non-transient handling or SSR behaviour.

**Recommendation.** Start with fast pure-ish tests: AuthService (override branch, rejecting getIdTokenResult resolves whenReady, popup error mapping), compression (PNG input, truncated JPEG, null toBlob, EXIF orientation reset), NewVersionService (cross-origin script error ignored, hash mismatch, offline poll), AnalyticsService (page_view count, title, stripped path), graphqlResource (delay schedule, 4xx terminal, server hasError), and the upload queue (4xx dropped, backoff, uid mismatch).

**Verification.** The listing of src/app/core/auth, upload, theme, analytics and version shows only admin-only.guard, image-upload.service, chunk-load-error.util and version.util specs. AuthService, compression, analytics and theme have none.

<details><summary>Evidence</summary>

```text
Existing specs in scope: admin-only.guard, graphql-client, image-upload.service, polling-source, preferences, route-scroll-memory, reusable-route, revalidate-on-return, shell utils. No spec files exist for: AuthService, redirect-to-own-profile.guard, ImageCompressionService, upload-queue-db, AnalyticsService, NewVersionService, ThemeService, RecaptchaService, HoverPreloadStrategy, NavProgressComponent, AccountPanelComponent, AppNavComponent.
```

</details>

<a id="f206"></a>

#### F206 · No ESLint or angular-eslint, so template accessibility and typed-linting checks never run

**medium** · effort M · dx-tooling · deps-tooling

**Status, quality pass 2026-10-22:** Fixed (`08751c6`, `819eae7`, `7555c10`, `8769abc`, `e76d1ce`). `eslint.config.mjs` (flat config, typed linting through `projectService`, inline templates linted) and an `npm run lint` script are added, and lint-staged runs ESLint after Prettier on staged `.ts` and `.html` files. `alt-text` is an error (0 findings); `click-events-have-key-events`, `interactive-supports-focus`, `label-has-associated-control`, `no-explicit-any` and `no-floating-promises` are warnings, and the merged tree reports 81 warnings and 0 errors. The CI lint job runs `npm run lint --if-present`, so only errors fail it, and the `ci.yml` comment above that step, which still said 'Skipped until a `lint` script exists', now says that it runs the `lint` script (ESLint) and that only error-level findings fail the job (`e76d1ce`). **Left:** The warning rules are not promoted to errors until their 81 warnings are fixed. ESLint covers `src/**` only, because `e2e/` and `functions/` have no tsconfig for typed linting.

**Where:** `package.json:61-82`, `.github/workflows/ci.yml:11-24`, `.husky/pre-commit:2`

**Problem.** Prettier checks only formatting, so nothing in CI or in pre-commit catches template accessibility problems (for example a clickable element without a key handler), a bound value that is never read, or explicit any. The repo bans any and has many hand-written accessibility rules in MISTAKES.md, so these checks would automate guidance that is currently enforced only by review and by e2e tests. Because the codebase has the strict-check baseline described above, a lint pass would start from a clean state.

**Recommendation.** Add eslint, typescript-eslint and angular-eslint at versions that match Angular 22. Start with a small config: @angular-eslint/template/accessibility rules (alt-text, click-events-have-key-events, interactive-supports-focus, label-has-associated-control), @typescript-eslint/no-explicit-any, and @typescript-eslint/no-floating-promises. Add an npm run lint script, run it in the ci.yml lint job next to prettier, and add it to lint-staged for staged .ts and .html files. Keep the first config to warnings and promote to errors file by file.

**Verification.** package.json devDependencies contain no eslint, typescript-eslint or @angular-eslint packages, no ESLint config file exists at the root, and ci.yml runs only prettier in its lint job. Prettier does not check template accessibility or any-usage, so the gap is real.

**Also reported as:** [F559](testing-tooling-and-code-quality.md#f206) [platform] Add ESLint (angular-eslint) so the repo's bans and template accessibility rules are enforced, not just written down (README.md:18, package.json:72)

<details><summary>Evidence</summary>

```text
package.json devDependencies contain no eslint, typescript-eslint or @angular-eslint packages. ci.yml lint job: "- run: npx prettier --check ." is the only lint gate. .husky/pre-commit runs "npx lint-staged", which only runs prettier --write.
```

</details>

<a id="f223"></a>

#### F223 · Auth and write journeys have almost no unit or e2e coverage, and the e2e login helper never exercises the token path

**medium** · effort M · testing · gap-2

**Status, quality pass 2026-10-22:** Fixed (`a1e329b`, `ae35e46`, `d7850f3`). `loginAs()` seeds a persisted Firebase session in the SDK's own IndexedDB store (an unexpired fake JWT with the admin claim, `accounts:lookup` routed), so the real `User`, `idToken()` and `firebase-auth-key` header path run, and it returns the token. The mock server answers any mutation without that header with `UNAUTHENTICATED`. `e2e/auth.spec.ts` covers the visitor to session transition, the account panel, the token on `RequestVerificationCode`, and logout from `/console/links` with the guards sending the user back to `/spotting`. `home.spec` covers the offline outbox (queued offline, sent with the token on reconnect). The unit specs the finding lists are under F203 and F271. **Left:** The `__e2eAuthOverride__` branch in `auth.service.ts` stays: `e2e/dom-visual-checks.mjs`, `e2e/capture-visual-evidence.mjs` and two unit specs still set it.

**Where:** `e2e/helpers/auth.ts:10`, `src/app/core/auth/auth.service.ts:72`, `e2e/mock-graphql.server.mjs:91`

**Problem.** The override path leaves the Firebase user null, so in e2e every mutation is sent with no auth header and the mock accepts it; the vote overlay returns early on a null token (I confirmed the home page issued no authenticated feed reads under the override); the account panel renders 'Anonymous'. Nothing in e2e covers the spotting submit with a photo, profile and My Links, the account panel, logout, token failure or offline. The most failure-prone code in this slice (AuthService, upload queue edge cases, compression, reCAPTCHA, delete flows) has no unit spec for the cases that matter.

**Recommendation.** Extend the override to install a fake User object ({ uid, displayName, getIdToken: async () => 'e2e-token' }) so the real header path runs, and make the mock server assert `firebase-auth-key` on mutations (and return an auth error without it). Add Playwright specs for: login state transition, spotting submit with a photo (route the REST upload), logout from a guarded page, and an offline submit. Add unit specs for the files listed.

**Verification.** There is no auth.service.spec, recaptcha spec, redirect guard spec, account-panel spec or my-spottings spec. The e2e override sets flags but not userSignal, so idToken() returns null. The mock server only references firebase-auth-key in CORS headers.

<details><summary>Evidence</summary>

```text
(globalThis as { __e2eAuthOverride__?: unknown }).__e2eAuthOverride__ = { email: "e2e@example.com", admin };
// auth.service.ts override branch: sets isLoggedIn/isAdmin but never sets userSignal, so auth.idToken() returns null
// mock-graphql.server.mjs: answers any operation that has a stub, never inspects firebase-auth-key
// NO SPEC: auth.service.ts, redirect-to-own-profile.guard.ts, recaptcha.service.ts, account-panel.component.ts, image-compression.service.ts, photo-picker.component.ts, my-spottings.component.ts
```

</details>

<a id="f228"></a>

#### F228 · Cover the real naive-datetime payload and a TZ matrix in the date specs

**medium** · effort M · testing · gap-4

**Status, quality pass 2026-10-22:** Partly fixed (`1d65fc7`, `796f2f5`, `3325a61`, `883e87c`, `265e458`, `1dbdea2`). Spotting part, partly fixed: `humanize-since.util.spec.ts` and `spotting-activity-heatmap.spec.ts` run on the API's real shapes (date-only days and naive Kuala Lumpur wall times) with a fixed clock, under `TZ=UTC` and `TZ=Asia/Kuala_Lumpur`. The 8 cases that are wrong today assert the right answer as `it.fails` and name their open finding (F090, F438, F436). Insiden part, fixed: the shared fixture `src/testing/naive-myt.ts` holds `naiveMyt`, `mytInstant` (which cuts microseconds to milliseconds explicitly) and `SPEC_ZONES`, and the link-day-group and calendar-date specs run in both zones with a fixed system time, asserting day keys, Today and Yesterday, the 00:00 MYT turnover and the month window. The fixture began as `features/insiden/data/naive-myt.testing.ts` and moved to `src/testing/` because `domain-ui` must not import from `features/insiden` (`883e87c`); the heatmap and humanize-since specs import it, their own `mytInstant` copies are gone, and both use `SPEC_ZONES` (`883e87c`, `265e458`, `1dbdea2`). **Left:** F090, F438 and F436 are not fixed. `link-list.component.spec.ts` still hard-codes its zone list and does not import the fixture. The insiden card's 'Ongoing for' and duration still parse naive times in the viewer's zone (F358).

**Where:** `src/app/features/insiden/data/link-day-group.util.spec.ts:30-80`, `src/app/features/spotting/data/humanize-since.util.spec.ts`, `src/test-setup.ts`, `package.json`

**Problem.** Because every fixture carries a Z, the defects above are invisible: with Z strings the UTC getters are correct, so the specs pass on both machines while production data is wrong. The suite also silently exercises different code paths on CI and on the developer machine, which is why the 8-hour bugs survived despite many specs and long comments.

**Recommendation.** Add a `naiveMyt` fixture builder mirroring the API (`2026-10-01T05:23:15.833490`, `2026-09-30T23:59:59`, `2026-10-01T00:00:00`) and assert day key, header label, 'Today' and relative text for 00:00-08:00 boundaries. Run the date-related specs in two zones (e.g. a CI matrix with `TZ=UTC` and `TZ=Asia/Kuala_Lumpur`, or `process.env.TZ` set in a dedicated setup file before Date is first used). Use a fixed clock (`vi.setSystemTime`) rather than the real one.

**Verification.** link-day-group.util.spec.ts fixtures all use Z-suffixed strings (16 hits), but the API sends naive strings. No TZ is pinned in package.json or test-setup.ts, so the specs pass on both UTC CI and a UTC+8 machine while the bugs remain.

<details><summary>Evidence</summary>

```text
link-day-group.util.spec.ts fixtures all use Z-suffixed strings, e.g. `created: "2026-08-01T10:00:00Z"` (16 occurrences), while the API sends `2026-10-01T05:23:15.833490`. The only linkDateKey assertion is `toMatch(/^\d{4}-\d{2}-\d{2}$/)`. No TZ is pinned in test-setup.ts, package.json or angular.json; CI runs on ubuntu-latest (UTC) and the maintainer's machine is UTC+8.
```

</details>

<a id="f235"></a>

#### F235 · Port the vehicle-parent fix to the link form so an edit-hydrated vehicle is never hidden but still submitted

**medium** · effort M · code-quality · insiden-data

**Status, quality pass 2026-10-22:** Fixed (`ca106a8`, `c888a65`, `097abe2`). `injectInsidenReferenceOptions(selectedLineIds, selectedVehicleIds)` in `insiden/data/insiden-reference-options.ts` returns the line, vehicle, station and category options, the parent-union rule is the pure `vehicleOptionsFor()`, and `injectDefaultCategory()` holds the default category as a `linkedSignal`. Both forms use them, so the link form gets the vehicle-parent rule the incident form had. A direct spec flushes one reference read and checks the line labels, the station `parentCode`s, the category options and the vehicle list following both selection signals.

**Where:** `src/app/features/insiden/link-form/link-form.component.ts:284`, `src/app/features/insiden/incident-form/incident-form.component.ts:210`, `src/app/features/insiden/incident-form/incident-form.component.ts:153`, `src/app/features/insiden/link-form/link-form.component.ts:253`

**Problem.** The two forms duplicate about 120 lines (reference resource, line, vehicle, station and category option computeds, the Just Reporting prefill effect, the edit/clear effects) and have already drifted. The incident form unions the parents of selected vehicles into the line filter, but the link form does not. In the link form, selecting a vehicle and then deselecting its line (or editing a link whose vehicle belongs to a line that is not tagged) removes that vehicle from the visible list while it stays in selectedVehicleIds and is still sent to the backend. The user cannot see or remove it. Because SocialMediaLinkInput is replace-not-patch, this also affects what the server stores.

**Recommendation.** Extract an `injectInsidenReferenceOptions(selectedLineIds, selectedVehicleIds)` composable (or the root InsidenReferenceStore suggested elsewhere) that returns lineOptions, vehicleOptions (with the parent-union rule), stationOptions and categoryOptions, and a `injectDefaultCategory()` linkedSignal. Replace both copies and add a spec for 'selected vehicle whose line is not selected stays listed'.

**Verification.** The incident form's vehicleOptions unions the parent lines of selected vehicles, but link-form vehicleOptions at ~284 does not. A selected vehicle whose line is not selected disappears from the list while staying in selectedVehicleIds and being sent, and the input is replace-not-patch.

<details><summary>Evidence</summary>

```text
// link-form vehicleOptions:
const lines = selected.length > 0 ? selected.map((id) => this._linesById().get(id)) : [...this._linesById().values()];
// incident-form additionally unions the parent lines of selectedVehicleIds ('so their checkboxes stay visible/removable')
```

</details>

<a id="f237"></a>

#### F237 · Validate chronology rows and stop mutating them in place through $any event handlers

**medium** · effort M · code-quality · insiden-data · partially confirmed

**Status, quality pass 2026-10-22:** Fixed (`15adfb9`, `709d530`, `cbc62e6`, `34f2af8`). `updateChronology`, `isBlankChronology`, `chronologyErrors` and `chronologyInputs` in `incident-form/chronology-list.util.ts` replace the four `$any` handlers in the incident form, and rows are edited without mutating the draft in place. Blank rows are dropped, and a row without a description blocks Submit and marks every field touched on that press, so the other errors show too. `chronologyInputs` trims `sourceUrl` and `content`, so a whitespace-only URL is sent as null. Both behaviour fixes have specs that failed without them, and the indicator `<select>` handler has a component spec.

**Where:** `src/app/features/insiden/incident-form/incident-form.component.html:306`, `src/app/features/insiden/incident-form/incident-form.component.html:318`, `src/app/features/insiden/incident-form/incident-form.component.html:329`, `src/app/features/insiden/incident-form/incident-form.component.html:379`, `src/app/features/insiden/incident-form/incident-form.component.ts:603`, `src/app/features/insiden/incident-form/chronology-list.util.ts:9`

**Problem.** Chronology fields are written by assigning to properties of plain objects held in a signal array, using $any (a type hole) and the (change) event, which on desktop fires only on blur. The signal never notices the edit, so nothing that derives from it (for example an 'incomplete entry' hint) can react, and a stale-binding bug appears whenever the object is later replaced. There is no validation at all: 'Add entry' followed by Submit sends rows with null content and null datetime, which become blank timeline entries on the public card; times are not checked against the incident start and end, and the list is never sorted by time. Chronology edits also do not mark the Signal Forms form dirty.

**Recommendation.** Add an updateChronology(key, patch) immutable helper with typed input handlers. Drop empty rows or block submit with a per-entry message, and optionally add a Sort by time action. Skip per-row signal forms.

_Original suggestion (corrected by the verifier):_ Model each row as its own small signal form (or at least update immutably via an `updateChronology(key, patch)` helper using (input) events with a typed handler). Add validation: content required, datetime required, source URL valid, and a warning if a time falls outside start..end. Drop empty rows at submit or block with 'Entry 3 is empty. Fill it in or remove it.' Add a 'Sort by time' action next to the move arrows.

**Verification.** The in-place $any assignments via (change) are real, and Add entry plus Submit sends rows with null content and datetime. The mutated objects are still carried forward by the spread copies in collapse and move, so the 'stale binding' claim is speculative. Rewriting each row as its own signal form is overkill.

<details><summary>Evidence</summary>

```text
(change)="chronology.datetime = $any($event.target).value"
...
chronologies: this.chronologies().map((c) => ({
  indicator: c.indicator,
  datetime: c.datetime ? new Date(c.datetime).toISOString() : null,
  sourceUrl: c.sourceUrl || null,
  content: c.content || null,
})),
```

</details>

<a id="f238"></a>

#### F238 · Add specs for the untested risky logic: AI flows, asset filtering and toggling, double submit, and the KL day key

**medium** · effort M · testing · insiden-data

**Status, quality pass 2026-10-22:** Fixed (`204edf9`, `4940e32`). The incident-form spec stubs `IncidentAiService` through providers and covers the late-result Replace button, summarize success and summarize failure, and `AssetMultiSelect` has behaviour specs. The double-submit guard is in its own `fix(insiden)` commit with two specs (F106). The date utilities run under both zones with the 00:00 to 08:00 cases in `3325a617` (F228).

**Where:** `src/app/features/insiden/data/incident-ai.service.ts:1`, `src/app/features/insiden/incident-form/incident-form.component.ts:380`, `src/app/features/insiden/asset-multi-select/asset-multi-select.component.spec.ts:1`, `src/app/features/insiden/data/calendar-date.util.spec.ts:1`

**Problem.** The riskiest code in the slice is untested: the extract state machine (the stuck-disabled bug above would have been caught by a single test), the late-result and undo flow, the AI service's error mapping, search filtering, parentCodes matching, pinnedSelected ordering and toggle behaviour in asset-multi-select, double submit, and time-zone behaviour of the date keys (specs pass whatever the machine's TZ is).

**Recommendation.** Provide IncidentAiService as a Vitest stub in the form spec (the comment about firebase imports is solved by injecting a fake via TestBed.overrideProvider). Test: success clears extracting, timeout then late success shows Replace, Undo restores, summarize failure keeps fields. Add behaviour tests for AssetMultiSelect (query by parent code, selection order, toggle emits). Run the date utility specs under TZ=UTC and TZ=Asia/Kuala_Lumpur (set process.env.TZ in a vitest setup file or per-test with vi.setSystemTime) and add the 00:00-08:00 cases.

**Verification.** asset-multi-select.component.spec.ts covers only parentCodeChipText and the fillHeight classes. There is no incident-ai.service spec, and incident-form.component.spec.ts has no extract or summarize test (the console spec says so explicitly). The date util specs have no TZ cases. The extract flow is exactly where the stuck-flag bug in finding 0 hides.

<details><summary>Evidence</summary>

```text
// asset-multi-select.component.spec.ts covers only parentCodeChipText and the fillHeight classes.
// No incident-ai.service.spec.ts; incident-form.component.spec.ts has no extract or summarize test.
// console pending spec: "No extract/summarize test here — the real service pulls in firebase/app+auth."
```

</details>

<a id="f240"></a>

#### F240 · Calendar, link list and link sheet have no component specs although they hold the riskiest logic

**medium** · effort M · testing · insiden-ui

**Status, quality pass 2026-10-22:** Partly fixed (`fa4dc0b`, `198db7f`, `2a04bf1`, `4c738a5`, `673aff1`). Specs now cover the calendar (`shiftMonth` from Jan 31 and the backward clamp from Mar 31 to Feb 28, Today at 18:30Z, prev and next labels, the day-dot rules, and the 3 s month and year jump: commit at 3000 ms, restart on a second pick, commit on focusout, timers cancelled on destroy), the link list (pending split, collapsed toggle, `sheetClosed` firing once per open-to-closed edge and never on mount) and the link sheet (the Submit a link heading and the in-flight footer). No component code changed. **Left:** Arrow-key month movement has no spec, because the calendar has no keydown handling; it needs a component change first (F037).

**Where:** `src/app/features/insiden/calendar/calendar.component.ts`, `src/app/features/insiden/link-list/link-list.component.ts`, `src/app/features/insiden/link-sheet/link-sheet.component.ts`

**Problem.** The timer-driven month jump, the clamp-to-last-day logic when moving from the 31st, the single-dot rule for open-ended incidents, the pending/approved split in the link list and the sheet's edit-versus-create headings are all behaviour that regressions would silently break, and several of the findings above (time zone, keyboard navigation) need a spec to be fixed safely.

**Recommendation.** Add a calendar spec using fake timers and a faked system time (including 2026-10-20T18:30Z), covering shiftMonth from Jan 31, goToday, the dot rules and, after the accessibility work, arrow-key movement and aria labels. Add a link-list spec for pending/approved grouping and the sheetClosed edge, and a link-sheet spec for the Edit/Submit headings and disabled-while-submitting states.

**Verification.** The calendar, link-list and link-sheet folders hold only their component .ts files, with no specs. The calendar holds timer and month logic.

<details><summary>Evidence</summary>

```text
find of *.spec.ts under src/app/features/insiden lists specs for the page, incident-card, link-card, link-thread, links-section, vote-button and the data utils, but none for calendar.component, link-list.component or link-sheet.component; the calendar holds the 3 s timer jump, month clamping, 42-cell grid and the longTerm single-dot rule.
```

</details>

<a id="f248"></a>

#### F248 · Fix the Sentry release and source-map pipeline so production errors can actually be symbolicated

**medium** · effort M · dx-tooling · platform · partially confirmed

**Status, quality pass 2026-10-22:** Partly fixed (`a1a48dd`, `9eb8daa`, `4b776cd`, `21c7163`). The Sentry release name is now the full 40-character hash from `public/version.json` (`readRelease(root)` in `scripts/sentry-sourcemaps.mjs`), the same value the runtime reports as `buildInfo.hash`. With no token, or a token but no usable hash, the script logs one line and exits 0, and a malformed `version.json` counts as no release. CI uploads sourcemaps on push events only, and the stale 'short git hash' comment in `src/sentry-options.ts` is corrected. **Left:** `apphosting.yaml` and `apphosting.staging.yaml` declare no `SENTRY_AUTH_TOKEN`, so the owner must say whether App Hosting builds get one. A CI push build cannot match a deployed bundle byte for byte, and a `sentry-cli` failure with a token present still fails the build.

**Where:** `scripts/sentry-sourcemaps.mjs:25`, `scripts/sentry-sourcemaps.mjs:46`, `scripts/generate-build-info.mjs:19`, `apphosting.yaml:17`, `.github/workflows/ci.yml:84`

**Problem.** Four things disagree. (1) The runtime release is the 40-character hash but the uploaded release name is the 7-character hash, so Sentry's Release page never lines up with what events report (debug IDs still match, but release health, regressions and commit linking do not). (2) The App Hosting build declares no auth token, so the postbuild step silently skips the upload and deployed builds probably have no maps in Sentry; only a developer's local build (with .sentryclirc) uploads. (3) Meanwhile every CI build, including every pull request, uploads maps and creates a release for a commit hash that will never be deployed. (4) If Sentry is unreachable while a token is present, execFileSync throws and fails the whole build and deploy, contradicting the 'soft-fails' comment. If App Hosting builds have no .git directory, the hash would also become 'unknown', which would make the new-version detection and Sentry releases useless; please confirm.

**Recommendation.** Use the same hash in the script as in build-info. Confirm whether App Hosting has the token as a secret before adding one.

_Original suggestion (corrected by the verifier):_ Use one identifier everywhere (full hash from build-info, or read it from src/build-info.ts in the script). Add SENTRY_AUTH_TOKEN as an App Hosting secret (`variable: SENTRY_AUTH_TOKEN, secret: sentry-auth-token, availability: [BUILD]`) and drop the token from the pull_request build job, or run it only on push to main and staging. Wrap the upload in try/catch that logs and exits 0 unless an env flag says the upload is required. Consider a deployed-commit fallback such as the COMMIT_SHA environment variable if .git is absent in App Hosting builds.

**Verification.** The release mismatch is real: sentry-options uses buildInfo.hash, the full 40-character hash, while sentry-sourcemaps.mjs releases the --short hash. Skipping the upload with no token is by design, and apphosting.yaml indeed declares no SENTRY_AUTH_TOKEN. The claim that production has no maps is unverified. A throwing sentry-cli does fail the build, as the finding says.

**Also reported as:** [F145](testing-tooling-and-code-quality.md#f248) [test-gaps] Sentry release tag uses a short hash while runtime events use the full hash, so source maps never match (scripts/sentry-sourcemaps.mjs:46, scripts/generate-build-info.mjs:19)

<details><summary>Evidence</summary>

```text
generate-build-info.mjs: const hash = git("git rev-parse HEAD", "unknown");  sentry-sourcemaps.mjs: execFileSync("git", ["rev-parse", "--short", "HEAD"], ...) and `if (!hasAuthToken()) { ... process.exit(0); }`. apphosting.yaml declares no SENTRY_AUTH_TOKEN. ci.yml build job: `env: SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}`. Server stack traces seen in the local log are minified: 'at On (file:///.../chunk-YRLZRRPD.mjs:4:28439)'.
```

</details>

<a id="f254"></a>

#### F254 · Add tests for the profile mutations and the GDPR page, which currently have none

**medium** · effort M · testing · profile-about-misc

**Status, quality pass 2026-10-22:** Fixed (`42ea584`, `2daf051`, `c3a33be`, `dc422cf`). New and extended specs for `my-spottings`, `user-card` and the GDPR page (`gdpr.page.spec.ts`) cover the cases the finding lists. They found real bugs, now fixed: `deleteEvent` toasted success but never removed the row; `_canDelete` ignored `isOwnProfile()`, so a visitor saw Delete on another user's recent entry; a failed first page showed 'No spottings logged yet.' with no retry, and now shows 'Couldn't load your spottings.' with a Retry button (`retry-spottings`); and deleting every loaded row while more pages exist now fetches the next page.

**Where:** `src/app/features/profile/my-spottings/my-spottings.component.ts`, `src/app/features/profile/user-card/user-card.component.ts:285-343`, `src/app/features/gdpr/gdpr.page.ts`, `src/app/features/profile/user-card/user-card.component.spec.ts:24-93`

**Problem.** The destructive and privacy-sensitive logic has no coverage: the 3-day delete window (_canDelete), delete success and failure, the 'private history' branch, pagination, the confirm-then-save privacy toggle with rollback (savePrivacySetting), nickname save, and the non-owner header (which is where the identity bug above hides). The GDPR page, which renders admin HTML through [innerHTML], has no spec for loading, error and retry. AGENTS.md requires a test for every feature and fix.

**Recommendation.** Add my-spottings.component.spec.ts (delete removes the row, ok:false toast, cancelled confirm does nothing, canDelete at 2d23h vs 3d1h with fake timers, retry after failed load), extend user-card.component.spec.ts (owner vs non-owner header, privacy toggle rollback on error, nickname save emits and updates), and add gdpr.page.spec.ts mirroring about.page.spec.ts's error/retry and empty-document cases.

**Verification.** features/profile/my-spottings and features/gdpr contain no spec files. user-card spec only covers favourite train with isOwnProfile=false.

<details><summary>Evidence</summary>

```text
find shows no spec for my-spottings or gdpr; user-card.component.spec.ts contains one describe, 'UserCardComponent favourite train', and only renders with isOwnProfile=false. Search for `MySpottingsComponent` in *.spec.ts returns only profile.page.spec.ts, which stubs it.
```

</details>

<a id="f269"></a>

#### F269 · Risky logic in the photo, history and heatmap paths has no tests

**medium** · effort M · testing · spotting

**Status, quality pass 2026-10-22:** Fixed (`63ba5a7`, `462699c`, `68dc654`, `1d65fc7`, `49d1f07`, `de14fb2`). Item 1 (core): the image-compression spec uses a crafted Exif JPEG in both byte orders, a PNG, five truncations, an empty file, a null `toBlob` and a multi-step limit, and one test runs the compressor output through `stripGps` and asserts no GPS bytes while Make survives. Item 2 (spotting): photo-picker specs cover the deferred compression gate and the preview-URL revoke, and the shell spec covers the Submit gate and the revoke on sheet close. Item 3 was already on staging (`spotting-history.component.spec.ts`: two vehicles, out-of-order answers). Item 4: pure-function specs for `toSpottingActivityPoints`, `dateKeyOf`, `spottingIntensityClass` and `humanizeSince`. Item 5: the line-overview sort query-param round trip. **Left:** Item 2's 'rejected compression removes the entry and toasts' variant is not written, because the owner chose to upload the original instead (`c955733`). The item 4 cases that are wrong today are pinned as `it.fails` (F090, F438, F436).

**Where:** `src/app/core/upload/image-compression.service.ts:1`, `src/app/features/spotting/report-form/photo-picker/photo-picker.component.ts:1`, `src/app/features/spotting/vehicle-detail/spotting-history/spotting-history.component.ts:1`, `src/app/domain-ui/spotting-activity-heatmap/spotting-activity-heatmap.spec.ts:1`

**Problem.** The riskiest code in the slice is also unprotected: EXIF parsing and re-attachment, the picker's compression race, offset pagination that shares loading state across vehicles, the URL-synced sort on line overview, and pure helpers such as toSpottingActivityPoints, dateKeyOf and spottingIntensityClass. Several findings above (stuck compression, wrong 'today', pagination race) would have been caught by small specs.

**Recommendation.** Add focused specs: (1) image-compression with a crafted JPEG buffer containing a GPS APP1 segment and a PNG (expect no EXIF and no hang); (2) photo-picker with a rejected compression (entry removed, toast shown, isCompressing false); (3) spotting-history with two vehicles and out-of-order responses; (4) pure-function specs for toSpottingActivityPoints, dateKeyOf and humanizeSince with date-only strings; (5) line-overview sort query-param round trip.

**Verification.** find shows no specs for photo-picker, image-compression, spotting-history, incident-timeline, vehicle-detail or line-overview pages. The heatmap spec has a single smoke test and humanize-since has no date-only case.

<details><summary>Evidence</summary>

```text
The only heatmap spec is a smoke test: it('creates and renders without throwing'). No spec files exist next to photo-picker, image-compression.service, spotting-history, incident-timeline, vehicle-detail.page or line-overview.page; humanize-since.util.spec.ts has no date-only case.
```

</details>

<a id="f270"></a>

#### F270 · The end-to-end suite has no coverage of spotting reports, photo upload, admin reject, profile or tracker

**medium** · effort M · testing · test-gaps · partially confirmed · severity adjusted from high

**Status, quality pass 2026-10-22:** Partly fixed (`bf4f98b`, `f0923ef`, `31422ba`, `125d8a0`, `7603787`, `fee7337`, `68c329f`). Scenarios 1 to 5 are covered by new e2e specs: a spotting report with a generated JPEG (the `AddSpottingEntry` variables, the token, and the routed REST upload with `related_id` and `upload_type`), an admin reject with a reason (`RejectIncident`), the `/profile` redirect and the owner read, a protobuf GTFS-RT tracker feed with two vehicles (two markers, one popup label read), and the upvote and status-report failure paths. The failure stub is `graphqlError()`, because the vote control rolls back only on a thrown GraphQL error and never on `ok:false`. The line history expectation drops `dayStartHour` after F424. **Left:** Not done: the Firebase-emulator sign-in smoke (no emulator in CI), my-spottings deletion (reCAPTCHA), gallery, about and gdpr. The tracker spec finds markers by their inline colour (`#map div[style*="rgb(37, 99, 235)"]`) until `createVehicleMarkerElement` carries a `data-testid`.

**Where:** `e2e/home.spec.ts`, `e2e/incident-workflows.spec.ts`, `e2e/spotting-details.spec.ts`, `e2e/spotting-keep-alive.spec.ts`, `src/app/features/console/insiden/pending/pending-row.component.ts:60`

**Problem.** The spotting report with photos is the main contribution journey, and it has no end-to-end test, although the failure in the first finding would have been caught by one. The admin Reject action (pending-row.component.ts:60) and the deletion-request decisions are not exercised. Profile, my-spottings deletion (which needs reCAPTCHA), the gallery, the tracker map and layer toggles, and the about and gdpr pages have no e2e coverage. Sign-in is always bypassed through the E2E override, so the real Firebase session restore path is never tested in CI.

**Recommendation.** Add these scenarios in priority order. (1) Spotting report: open the report sheet from the vehicle page, pick a small JPEG, submit, and assert the AddSpottingEvent call plus the UploadPhoto request (recordedCalls with the expected related_id). (2) Admin reject: reject a pending incident with a reason and assert the RejectCalendarIncident variables. (3) Profile: visit /profile, which redirects to /profile/:uid for a logged-in user, and assert the owner query. (4) Tracker: stub the GTFS feed and assert that a vehicle marker renders. (5) Failure paths for upvote and submit: make the mock return ok false and assert that the optimistic count rolls back and a toast appears. Add a single sign-in smoke test that does not use the override, if a Firebase emulator is available in CI.

**Verification.** Verified the e2e inventory: 17 tests across four files, with no references to photo, upload, reject, profile or tracker, and the admin Reject button exists in pending-row.component.ts. The gap is real, but it is a coverage gap rather than a product defect, so high severity is overstated. The suggested scenarios are reasonable.

<details><summary>Evidence</summary>

```text
17 tests in total: home.spec.ts (7), incident-workflows.spec.ts (4: submit incident, upvote incident, approve pending, mark link completed), spotting-details.spec.ts (3, layout only), spotting-keep-alive.spec.ts (3, navigation only).
No e2e file mentions photo, upload, reject, profile or tracker.
```

</details>

<a id="f271"></a>

#### F271 · Largest unit-test gaps are in the data-path services, compression, auth and form validators

**medium** · effort M · testing · test-gaps

**Status, quality pass 2026-10-22:** Fixed (`ab86eaf`, `31bd096`, `63ba5a7`, `0b08dbf`, `462699c`, `a8a04a2`, `49b52c7`, `2bd45f1`, `f1b7876`, `5f448ea`, `11e100b`). All eight files the finding lists have specs. Spotting: `report-form.schema.spec.ts` covers the required fields, the station rules and the sanity gate for DECOMMISSIONED, MARRIED, OUT_OF_SERVICE and UNKNOWN. Core: `AuthService` (admin claim, cached given name, popup-closed branch), `image-compression.service.ts` (JPEG with and without a GPS APP1 segment, PNG, truncated JPEGs, a limit that needs several steps) and `upload-queue-db.ts`. Tracker: `gtfs-realtime.service.spec.ts` (28 cases: success, HTTP and network errors, backoff from 5 s doubling to the 300 s cap and its reset, pause, resume, `retryNow`, countdown ticks, `setRefreshInterval(null)`) and `layer-selection.service.spec.ts` (toggles, counts, apply, undo). Insiden: `incident-form.schema.spec.ts` and `incident-ai.service.spec.ts` (F383). The schema specs found a real bug: `validateTree` errors carried a `field:` key, which Signal Forms ignores, so the report form's station and sanity-gate errors and the incident form's end-before-start error landed on the form root and never showed under their controls. They now use `fieldTree: fieldTreeOf(f.<field>)` in the report form and `validate(f.endDatetime, ...)` in the incident form. The CI coverage report the finding suggests is F320. **Left:** No spec counts the decodes of the compression search, which still re-reads and re-decodes the file at every step (F197, F260).

**Where:** `src/app/features/tracker/data/gtfs-realtime.service.ts:200`, `src/app/core/upload/image-compression.service.ts:136`, `src/app/core/auth/auth.service.ts:134`, `src/app/features/insiden/data/incident-ai.service.ts:152`, `src/app/core/upload/upload-queue-db.ts:73`, `src/app/features/tracker/data/layer-selection.service.ts:91`, `src/app/features/spotting/report-form/report-form.schema.ts:95`, `src/app/features/insiden/incident-form/incident-form.schema.ts:49`

**Problem.** The ranked list above is the untested logic that most deserves a spec. Concrete scenarios: RtSource backoff doubles 5s, 10s, 20s and caps at 5 minutes; apply() then undo() restores drafts and clears hasUnsavedChanges; BETWEEN_STATIONS and AT_STATION require stations; the sanity gate blocks DECOMMISSIONED, MARRIED, OUT_OF_SERVICE and UNKNOWN until confirmed; incidentFormSchema rejects end before start by comparing datetime-local strings lexicographically, which is only valid while both use the same format; AuthService maps auth/popup-closed-by-user to undefined and other errors to a toast; resizeToSize re-reads and re-decodes the full file on every binary-search step (image-compression.service.ts:74 inside resizeImage, called from line 117), so a test should count decodes as well as output sizes.

**Recommendation.** Start with the three highest-risk files: gtfs-realtime.service.ts (fake timers, deferred fetch, backoff sequence, pause and resume), image-compression.service.ts (a generated JPEG with and without an APP1 Exif segment, a PNG input, and a limit that needs several steps), and auth.service.ts (mock firebase/auth to check the admin claim, the cached given name and the popup-closed branch). Then add pure-function specs for layer-selection.service.ts and the two schemas. Consider enabling `ng test --coverage` in CI as a report, not a gate, so the gaps stay visible.

**Verification.** Checked sibling spec files for the listed files: gtfs-realtime.service.ts, image-compression.service.ts, auth.service.ts, incident-ai.service.ts, upload-queue-db.ts, layer-selection.service.ts, and both schemas have no *.spec.ts. Line counts match. The ranked-risk summary is accurate, though the sanity-gate and date-comparison details were only partly rechecked.

<details><summary>Evidence</summary>

```text
Non-component logic files with no sibling *.spec.ts, ranked by risk (size, auth, writes, time zones):
  gtfs-realtime.service.ts 200 lines (RtSource backoff, pause/resume)
  incident-ai.service.ts 152 lines (ID-token fetch)
  image-compression.service.ts 136 lines (EXIF splice, binary search)
  auth.service.ts 134 lines (admin claim, login branches)
  upload-queue-db.ts 73 lines (IndexedDB durability)
  layer-selection.service.ts 91 lines (apply/undo)
  report-form.schema.ts 95 lines (cross-field validators)
```

</details>

<a id="f279"></a>

#### F279 · Add specs for the risky stateful logic: RtSource timers and backoff, LayerSelectionService, the gallery paging loop and the viewer

**medium** · effort M · testing · tracker-gallery

**Status, quality pass 2026-10-22:** Fixed (`a8a04a2`, `49b52c7`, `e8ef8fe`, `3c73cba`, `de5795b`). Tracker part: `gtfs-realtime.service.spec.ts` and `layer-selection.service.spec.ts` (see F271) found two real bugs. `RtSource` read its interval with `config.intervalMs ?? DEFAULT`, so null ('Do not refresh') became 30 s; it is now `=== undefined ? DEFAULT : value`. That exposed a second bug: `tick()` wrote `Infinity` into `secondsRemaining` and `NaN` into `percentRemaining` (and into the info panel ring's `stroke-dashoffset`) for any source on a null interval, and it now reads 0 remaining when nothing is scheduled. Gallery part: the `GalleryPage` and media-viewer specs cover concurrent `loadMore` sharing one request, a failed page (false, toast, retry), a year jump that stops on error and one that runs out of feed, the 100-page cap with the 200 ms throttle, and the viewer's body scroll lock on open, release in `ngOnDestroy` and no lock on the server. The 'deep link on page 3' case is obsolete, because a deep link now fetches by id and never pages. **Left:** The 'pause during fetch' scenario is pinned as an `it.fails` case for F148, which is open.

**Where:** `src/app/features/tracker/data/gtfs-realtime.service.ts:1`, `src/app/features/tracker/data/layer-selection.service.ts:1`, `src/app/features/gallery/gallery.page.ts:158`, `src/app/features/gallery/media-viewer/media-viewer.component.ts:1`

**Problem.** The most failure-prone code in the slice has no tests: exponential backoff and the 5 minute cap, pause/resume semantics (where the background-polling bug above lives), the draft/apply/undo state machine, the `inFlightLoad` dedupe that the comments say was fixed after a real race, the `loadUntil` cap and delay loop, and the viewer's body scroll lock.

**Recommendation.** Add Vitest specs with fake timers and a stubbed `fetch` for `RtSource` (success, error, backoff doubling, pause during fetch, `setRefreshInterval(null)`), a state-table test for `LayerSelectionService.apply/undo`, a `GalleryPage` spec with a mocked `GraphQLClient` covering concurrent `loadMore`, a deep link that is found on page 3, one that is missing (expect the toast and `replaceUrl` redirect), and the failure case, plus a viewer spec for Escape, the scroll lock cleanup in `ngOnDestroy`, and (after the accessibility fix) focus restoration.

**Verification.** No spec exists for gtfs-realtime.service, layer-selection.service, gallery.page or media-viewer, and AGENTS.md requires tests for stateful logic.

<details><summary>Evidence</summary>

```text
Spec files present: gtfs-static.service.spec.ts, tracker-map.component.spec.ts (1 test, mocks Sentry), rt-marker-layer.controller.spec.ts (1 test), tracker-info-panel.component.spec.ts (2 tests), justified-grid.component.spec.ts (1 test), plus the two gallery utils.
No spec for: gtfs-realtime.service, layer-selection.service, gallery.page, media-viewer.component, gallery-year-slider.
```

</details>

<a id="f307"></a>

#### F307 · Use typed event helpers and signal updates in console templates instead of $any and in-place draft mutation

**low** · effort S · code-quality · console

**Status, quality pass 2026-10-22:** Fixed (`15453cc`, `2613639`, `e2d18e3`, `4f4a2f8`). `eventValue()` in `core/util/dom-event.util.ts` replaces all 16 `$any($event.target).value` bindings in the console templates, and `console.page.ts` uses it instead of its own copy. The chronology editor emits `(patch)` and the parent's `patchChronology` does `chronologies.update(list.map(...))`, so no signal state is mutated in place; the textarea uses `(input)`. Specs cover a two-entry edit routed by key (the other draft keeps its object) and the links edit panel's url, title and occurred-at inputs. The incident form's four `$any` bindings and its in-place chronology edits, which this change did not reach, were removed by `15adfb91` (F237), and its `editChronology` and `setChronologyIndicator` now read their values through `eventValue(event)` (`4f4a2f8`); `setChronologyIndicator` keeps its `ChronologyIndicator` assertion.

**Where:** `src/app/features/console/insiden/links/links-filter-bar.component.html:9`, `src/app/features/console/insiden/links/links.component.html:279`, `src/app/features/console/insiden/pending/pending-chronology-editor.component.html:109`, `src/app/features/console/insiden/pending/pending-chronology-editor.component.html:181`

**Problem.** The repo bans `any`, and console.page.ts even documents a typed `eventValue()` helper to avoid `$any()`, but 16 other bindings in the console templates use it. The chronology editor also assigns `chronology.content = ...` directly on objects held in the parent's `chronologies` signal. That mutates signal state in place, bypassing `chronologies.update`, so any computed that depends on it (none today) would not notify, and it edits parent-owned data from a supposedly presentational child.

**Recommendation.** Share the typed `eventValue(event)` helper (for example in `core/util/dom-event.util.ts`) and use it everywhere. In the chronology editor emit `(patch)="{ key, field, value }"` and let the parent do `chronologies.update(list => list.map(...))`. Use `(input)` rather than `(change)` for the textarea so a hardware Enter-submit or Ctrl+S path cannot read a stale value.

**Verification.** 17 $any( uses exist in non-spec console files, against a repo rule banning any.

<details><summary>Evidence</summary>

```text
(change)="chronology.content = $any($event.target).value"
(change)="categoryChange.emit($any($event.target).value)"   // 17 `$any(` uses in console templates
```

</details>

<a id="f308"></a>

#### F308 · Console nav duplicates CONSOLE_LINKS and does not mark the current page for assistive technology

**low** · effort S · code-quality · console · already documented

**Status, quality pass 2026-10-22:** Fixed (`c85a614`). `ITEMS` is deleted from `console-nav.component.ts`, which now renders `CONSOLE_LINKS` from `shell/nav-config.ts` with `ariaCurrentWhenActive="page"` on every anchor. The spec asserts that the rendered links equal `CONSOLE_LINKS` and that only the active pill has `aria-current="page"`.

**Where:** `src/app/features/console/console-nav.component.ts:12`, `src/app/shell/nav-config.ts:17`, `src/app/features/console/console-nav.component.ts:30`

**Problem.** A new console section must be added in two places and a doc note is the only guard. The active page is shown by background colour only, with no `aria-current`.

**Recommendation.** Delete `ITEMS` and import `CONSOLE_LINKS` from `shell/nav-config.ts`. Add `ariaCurrentWhenActive="page"` to the `routerLinkActive` anchors.

**Verification.** console-nav.component.ts ITEMS duplicates CONSOLE_LINKS, and docs/components/console.md literally says 'Keep both in sync'. The nav uses routerLinkActive with no ariaCurrentWhenActive.

<details><summary>Evidence</summary>

```text
console-nav.component.ts:12-16 ITEMS and nav-config.ts:17-21 CONSOLE_LINKS are the same three entries; docs/components/console.md says: 'Keep both in sync.'
routerLinkActive="bg-primary text-primary-foreground border-primary"   // colour only
```

</details>

<a id="f319"></a>

#### F319 · Consolidate duplicated nav code and the two module link lists

**low** · effort S · code-quality · core-shell

**Status, quality pass 2026-10-22:** Partly fixed (`8b4a33e`, `1105084`). `shell/nav-config.ts` holds one `NAV_LINKS` list (`MODULE_NAV_LINKS` is gone) and the compact nav filters it. `svg[app-brand-logo]`, `button[app-report-bug-button]` and `div[app-console-menu]` are shared by both navs, each with a spec, and the console menu owns its open state and hover timer. `HoverPreloadStrategy` lost its dead members and has a spec. **Left:** The update, upload and login indicators are not added to the compact nav, a deliberate deferral because the change kept the compact nav's DOM as it was.

**Where:** `src/app/shell/nav-config.ts:37`, `src/app/shell/app-nav/app-nav.util.ts:11`, `src/app/shell/compact-nav/compact-nav.component.ts:266`, `src/app/shell/app-nav/app-nav-icon-tray.component.ts:328`, `src/app/core/routing/hover-preload.strategy.ts:18`

**Problem.** The same six module links are defined twice (nav-config.ts and app-nav.util.ts), so adding a module requires two edits and the compact nav and main nav can drift. The Sentry feedback handler, the bug SVG, the brand SVG and the console dropdown are duplicated between app-nav and compact-nav, and the compact nav also lacks login, update and upload indicators that the main tray has. HoverPreloadStrategy carries unused members (preloadSubjects, isPreloaded).

**Recommendation.** Keep one NAV_LINKS source (nav-config.ts) and derive the compact list with a filter; extract <app-brand-logo>, <app-report-bug-button> and <app-console-menu> small components and reuse them in both navs; consider including the update and account affordances in the compact nav.

**Verification.** HoverPreloadStrategy has unused members (isPreloaded, and preloadSubjects is only read). Duplicated nav link and brand code between the app and compact navs is plausible from what I read. This is a low-value cleanup.

<details><summary>Evidence</summary>

```text
export const MODULE_NAV_LINKS: ModuleNavLink[] = [{ path: "/", label: "Home" }, { path: "/spotting", label: "TranSPOT" }, ...];
export const NAV_LINKS: NavLink[] = [{ path: "/", label: "Home", exact: true }, { path: "/spotting", label: "TranSPOT", exact: false }, ...];
// onReportBug() and the 11-path bug icon and logo SVG are copy-pasted in app-nav-icon-tray and compact-nav
```

</details>

<a id="f320"></a>

#### F320 · No code coverage is collected or enforced

**low** · effort S · testing · deps-tooling · severity adjusted from medium

**Status, quality pass 2026-10-22:** Fixed (`65b00e1`, `8769abc`). `npm run test:coverage` runs the unit tests with `@vitest/coverage-v8` pinned to vitest's version (4.1.10), prints a text summary and writes lcov. The first run reported Statements 74.5%, Branches 76.81%, Functions 73.46% and Lines 77.08%. The CI test job runs it with a junit reporter and uploads `coverage/` as the `coverage` artifact, report-only. **Left:** No floor is set for the pure util and service folders.

**Where:** `angular.json:96-103`, `package-lock.json (no @vitest/coverage-* package present)`

**Problem.** The suite has 158 spec files and a large set of pure utilities, yet nobody can see which modules are untested. Coverage would also show the gaps that MISTAKES.md describes as real traps, such as the unit-test builder isolation issue. Without a number, coverage cannot be used as a gate.

**Recommendation.** Add @vitest/coverage-v8 at the version that matches the vitest version the unit-test builder uses. Configure coverage in the test target (verify the exact option key in the @angular/build unit-test schema before writing it). Start with a report only, then set a floor for the pure util and service folders. Add a coverage output directory to .gitignore if it is not already excluded.

**Verification.** Checked that package-lock.json has no @vitest/coverage-* entry and that the angular.json test target has no coverage configuration. The absence is real, but it is a visibility gap rather than a defect, so low severity fits better.

<details><summary>Evidence</summary>

```text
angular.json test target: "builder": "@angular/build:unit-test", "options": { "setupFiles": ["src/test-setup.ts"] }. package-lock.json contains no @vitest/coverage-v8 or @vitest/coverage-istanbul entry. Spec file count: 158 under src/.
```

</details>

<a id="f321"></a>

#### F321 · Unit-test isolation is not pinned in angular.json, so the documented leak trap depends on memory

**low** · effort S · testing · deps-tooling · partially confirmed · already documented

**Status, quality pass 2026-10-22:** Fixed (`65b00e1`). `angular.json` pins `"isolate": false` in the unit-test options, so the setting that the documented leak trap depends on is in the repository and no longer in memory.

**Where:** `angular.json:98-103`, `MISTAKES.md:452`

**Problem.** The default leaks state between spec files in the same worker. The repo has recorded this trap, but the configuration does not guard against it, so a new contributor can reintroduce it without knowing. Setting isolate explicitly makes the choice visible and prevents a silent change if the builder default changes in a future major.

**Recommendation.** Before editing, confirm the isolation option key in the @angular/build unit-test schema; if no such key exists, pin isolation through the Vitest configuration the builder reads instead, and document the choice next to the MISTAKES entry.

_Original suggestion (corrected by the verifier):_ Set the isolation option explicitly in the test target's options, using the key the unit-test schema defines (MISTAKES.md names it isolate). Measure the run time before and after, and accept a slower run if the leaks disappear. Keep the existing trap entry, and mention the setting in the same note.

**Verification.** MISTAKES.md line 452 does document that @angular/build:unit-test defaults to isolate false, so the trap is real. The recommended option key isolate was not verified against the builder schema, which is in node_modules and was off limits, so it may not be a valid angular.json option.

<details><summary>Evidence</summary>

```text
angular.json: "test": { "builder": "@angular/build:unit-test", "options": { "setupFiles": ["src/test-setup.ts"] } }. MISTAKES.md:452: "@angular/build:unit-test defaults to isolate: false: files in a worker share jsdom globals AND the module cache".
```

</details>

<a id="f323"></a>

#### F323 · Dependency updates are not automated and no audit runs in CI

**low** · effort S · dx-tooling · deps-tooling

**Status, quality pass 2026-10-22:** Fixed (`c78e67b`, `8769abc`, `544cc3f`, `4b4a379`). `.github/dependabot.yml` covers npm at `/` and `/functions` and github-actions, weekly, grouped by Angular and Firebase. A non-blocking `npm audit --omit=dev` runs in the root lint job and in the functions job. `deploy-functions.yml` pins `npx firebase-tools@15.34.0`. **Left:** Dependabot cannot bump an `npx` pin, so that pin is raised by hand (a comment in the workflow says so).

**Where:** `.github/workflows/ci.yml:26-36`, `/home/kwongtn/rosak/rosak_firebase (no .github/dependabot.yml or renovate.json present)`, `.github/workflows/deploy-functions.yml:77`

**Problem.** Nothing opens update pull requests, and nothing reports known vulnerabilities for the root package or for functions/. The deploy job also runs npx firebase-tools without a pinned version, so the CLI that performs production deploys can change between runs.

**Recommendation.** Add a dependabot.yml (or renovate.json) covering the root npm project, functions/ and the github-actions ecosystem, grouped by Angular and Firebase. Add npm audit --omit=dev as a non-blocking CI step at first. Pin firebase-tools to an exact version in the deploy job, or install it as a functions devDependency and call its local binary.

**Verification.** No dependabot.yml or renovate.json exists under .github or the repo root, neither workflow runs npm audit, and deploy-functions.yml line 77 calls npx firebase-tools without a pinned version. All three claims check out.

<details><summary>Evidence</summary>

```text
deploy-functions.yml line 77: "run: npx firebase-tools deploy --only functions --project rosak-7223b --force --non-interactive". No npm audit step appears in either workflow.
```

</details>

<a id="f324"></a>

#### F324 · Types for Node are pinned to version 20 while the runtime and CI use Node 24

**low** · effort S · code-quality · deps-tooling · partially confirmed

**Status, quality pass 2026-10-22:** Partly fixed (`c09f650`). `@types/node` is `^24`, matching `engines` and CI, and `tsconfig.server.json` (`src/server*.ts`, types `node`) is a new project reference. `node` is gone from the explicit `types` of `tsconfig.app.json`. **Left:** `tsconfig.app.json` still includes the server files, because excluding them stopped `ng build` from type-checking them. jszip's typings reference the Node types, so browser code still sees Node globals through that import.

**Where:** `package.json:72`, `package.json:17`, `tsconfig.app.json:6`

**Problem.** The server entry (src/server.ts) runs on Node 24, but its types come from Node 20. Node 22 and 24 APIs can be missing or differently typed, so the compiler may accept calls that break at runtime or reject valid ones. The same mismatch means browser code type-checks with Node globals visible.

**Recommendation.** Bump @types/node to ^24, then add a tsconfig.server.json that includes src/server.ts with types node. Only then remove node from tsconfig.app.json, and confirm both builds pass.

_Original suggestion (corrected by the verifier):_ Align @types/node with the runtime major by moving it to ^24, then rebuild. Keep "types": ["node"] only in a tsconfig for the server entry, and drop it from the browser tsconfig.app.json if the build still passes.

**Verification.** The @types/node ^20 pin against engines >=24 and CI on Node 24 is real. The fix is incomplete: tsconfig.app.json includes all of src/**/*.ts, including the server entry, and no tsconfig.server.json exists, so dropping node types from it would break the server build unless the server gets its own tsconfig first.

<details><summary>Evidence</summary>

```text
package.json: "@types/node": "^20.17.19" with "engines": { "node": ">=24" } and CI node-version 24. tsconfig.app.json: "types": ["node"].
```

</details>

<a id="f340"></a>

#### F340 · Remove dead registry constants, enforce staleness, and fix the claim that backend changes fail a test

**low** · effort S · dx-tooling · gap-1

**Status, quality pass 2026-10-22:** Partly fixed (`8e3d653`, `7197a87`, `cafcfce`, `a4ef653`, `db80ba6`). Five unused `REVIEWED_AT_*` constants are deleted. /methodology shows each metric's own `lastReviewed`, and `isReviewStale()` with `STALE_REVIEW_MONTHS` drives a Needs review pill, shown to admins only (`AuthService.isAdmin()`; the dates stay public). `SERVICE_DAY_LABEL` is derived from `SERVICE_DAY_START_HOUR` and `HISTORY_BUCKETS_PER_DAY`, `historySummaryLabel` names its window from the first and last bucket and says 'of N hours' from `buckets.length`, and the comment in `methodology.constants.ts` is corrected. No section `lastReviewed` was bumped, because no documented rule changed. **Left:** Four static captions (`network-sparkline`, `network-heat-strip`, `pro-report-ranking`, `line-week-profile`) still use `SERVICE_DAY_LABEL`, because they render before any bucket exists. The mirrored backend values (3 and 24) remain frontend literals pinned only against the registry, so no test fails when the backend changes them.

**Where:** `src/app/core/methodology/methodology.content.ts:65-102`, `src/app/core/methodology/methodology.constants.ts:40-41`, `src/app/core/methodology/methodology.constants.ts:50`, `src/app/features/methodology/methodology-section.component.ts:75-77`

**Problem.** Five REVIEWED_AT_* constants are declared and never used, each with a long justification for why it must stay separate. STALE_REVIEW_MONTHS (6) is never applied, so nothing marks a section needing review. Per-metric lastReviewed values are never displayed, and the one visible date is per section (line-status shows 2026-10-19 although most of its entries were last reviewed on 2026-10-03 or 2026-10-07). The status-history spec compares frontend constants with other frontend constants, so a backend change to DAY_START_HOUR does not fail any test, contrary to the comment; AGENTS.md also says backend values must not be mirrored as literals.

**Recommendation.** Delete the unused constants, render each metric's own lastReviewed on /methodology, add a spec (or a 'needs review' pill) using STALE_REVIEW_MONTHS, and derive the service-day label from the first and last bucket instead of SERVICE_DAY_LABEL = "03:00 to 02:00". Correct the comment in methodology.constants.ts.

**Verification.** The REVIEWED_AT_HISTORY_WIDGETS, PRO_DASHBOARD, PRO_OFFICIAL_WIDGETS, POLISH and OTHERS_BUCKET constants have only their declaration; STALE_REVIEW_MONTHS is read only in specs. This is dead code and a purely cosmetic cleanup.

<details><summary>Evidence</summary>

```text
const REVIEWED_AT_HISTORY_WIDGETS = "2026-10-06";   // referenced once (its own declaration)
(also REVIEWED_AT_PRO_DASHBOARD, REVIEWED_AT_PRO_OFFICIAL_WIDGETS, REVIEWED_AT_POLISH, REVIEWED_AT_OTHERS_BUCKET)
STALE_REVIEW_MONTHS: { value: 6, source: "METHODOLOGY_DOCS.md" },   // never read outside specs
"so a backend change that is not mirrored here fails a test"
```

</details>

<a id="f342"></a>

#### F342 · Derive the line page's status filter and sort state with linkedSignal or from the URL instead of effects

**low** · effort S · angular-modernization · gap-1 · partially confirmed

**Status, quality pass 2026-10-22:** Fixed (`49d1f07`, `4e9a7b9`). The filter-reset effect and both sort-sync effects in `line-overview.page.ts` are gone: `statusFilter` is a `linkedSignal` over `lineId`, and the sort is derived from the URL and written through `writeQueryParams`. Specs cover the sort read from the URL with a fallback for unknown values, a write and read round trip with defaults left out, an unrelated param kept on merge, no navigation on mount or on the server, and the status filter resetting when `lineId` changes but not when the same `lineId` is set again.

**Where:** `src/app/features/spotting/line-overview/line-overview.page.ts:271-274`, `src/app/features/spotting/line-overview/line-overview.page.ts:282-303`

**Problem.** Three effects write signals to mirror one source of truth: one resets the filter on line change, and two keep sortColumn/sortDirection and the query string in step in both directions. Effects that only derive state add a render pass with stale values and a router.navigate on every first load; the pair has to be kept in an order that avoids a loop.

**Recommendation.** Use linkedSignal for statusFilter reset only; keep the SSR-guarded navigate or move it into onSortChanged.

_Original suggestion (corrected by the verifier):_ Use statusFilter = linkedSignal<VehicleStatus | null>({ source: this.lineId, computation: () => null }). Make sortColumn and sortDirection computed from queryParamMap and have onSortChanged call router.navigate with replaceUrl, which removes both sync effects.

**Verification.** The three effects exist as quoted, but the write-back effect has a documented rationale (SSR navigate hang, browser-only guard). linkedSignal for the filter reset is valid, while deriving sort from the URL needs care for the navigation-based write path.

<details><summary>Evidence</summary>

```text
effect(() => {
  this.lineId();
  this.statusFilter.set(null);
});
...
effect(() => { const params = this.queryParamMap(); ... this.sortColumn.set(...) });
effect(() => { ... this.router.navigate([], {...}) });
```

</details>

<a id="f347"></a>

#### F347 · Effects are used to synchronise derived form state in the report and link forms

**low** · effort S · angular-modernization · gap-2 · partially confirmed

**Status, quality pass 2026-10-22:** Fixed (`e1ad59e`, `ca106a8`). Report-form part: `selectedVehicleStatus` is removed from `ReportFormModel`, and `reportFormSchema` is a factory, `reportFormSchema(selectedVehicleStatus: () => string)`, so the sanity gate reads the derived computed. The stale-station bug the finding names is fixed in the same commit: a line change also clears `atStation`, `originStation` and `destinationStation` (F080). Link-form part: invalid as written. The link form has no line-change handler and never narrows `stationOptions` by line; the real hidden-but-still-sent case was a vehicle tagged without its line, which `vehicleOptionsFor` fixes (`ca106a83`) and the link form's 'tags' spec covers. **Left:** The report form's line-change effect stays on purpose (see F569).

**Where:** `src/app/features/spotting/report-form/report-form.component.ts:172`, `src/app/features/spotting/report-form/report-form.component.ts:182`, `src/app/features/insiden/link-form/link-form.component.ts:313`, `src/app/features/insiden/link-form/link-form.component.ts:374`

**Problem.** selectedVehicleStatus is pure derived state kept in the form model by an effect that writes the same model it reads, so validation sees one extra pass of stale data and the schema depends on a field no user edits. Line-change reset, sheet open/close edge handling, hydration and default-line seeding in link-form are all separate effects that write signals, which is how the stale-station bug above slipped in (the reset covers one field list by hand). This is the pattern linkedSignal and computed are meant to replace.

**Recommendation.** Fix the stale-station bug directly in the line-change handler. Refactor the derived state only if convenient.

_Original suggestion (corrected by the verifier):_ Compute the selected vehicle status as a `computed` from the model plus the vehicle list and have the schema validator read it through a small context (or pass it via validateTree arguments) instead of storing it in the model. Express 'reset dependent fields when line changes' as one pure function applied in the line field's change handler (or a linkedSignal), and keep effects only for sheet open/close side effects.

**Verification.** The effects exist as quoted, including the one that writes selectedVehicleStatus back into the model. The stale-station bug is fixable with a one-line change to the line-change effect. The suggested computed plus validateTree context refactor is vague and larger than needed.

<details><summary>Evidence</summary>

```text
effect(() => {
  const vehicleId = this.model().vehicleId;
  const status = this._vehiclesForLine().find((v) => v.id === vehicleId)?.status ?? "";
  if (status !== this.model().selectedVehicleStatus) {
    this.model.update((m) => ({ ...m, selectedVehicleStatus: status }));
  }
});
```

</details>

<a id="f352"></a>

#### F352 · No mechanical check ties the 62 GraphQL documents to the schema: add a graphql-js validation spec against a committed schema snapshot

**low** · effort S · testing · gap-3 · severity adjusted from medium

**Status, quality pass 2026-10-22:** Fixed (`a67e132`, `e1723b5`, `e39d5c8`, `7555c10`, `e988315`, `1291ce4`, `a280984`). `scripts/export-graphql-schema.mjs` (`npm run schema:refresh`) writes the committed `schema.graphql` snapshot (1235 lines), and `documents.spec.ts` validates all 74 operation documents and the runtime-built station document against it. It also compares each union in `core/graphql/types.ts` with its schema enum, including the aliases `SpottingType` to `SpottingEventType` and `WheelStatus` to `SpottingWheelStatus`. `assertSchemaSdl` in `scripts/graphql-schema-guard.mjs` refuses to write a file that does not parse or has no `Query` type, with a 5-case spec. The `SpottingVehicleStatus` drift was fixed by F354, so the `KNOWN_DRIFT` map is empty and the `it.fails` mechanism stays. The union check first read `core/graphql/types.ts` only, so it missed `CalendarIncidentStatus` in `insiden.queries.ts`, which lacked the schema's `PENDING_DELETION`. The union now has `PENDING_DELETION` and the stored `pending_deletion` (`1291ce4`; no switch or `Record` is keyed on it), and `documents.spec.ts` also checks the string-literal unions in feature `*.queries.ts` files that are named after a schema enum, ignoring the lowercase stored spellings on purpose (`a280984`). The wider check found no other drift. **Left:** No CI step warns when the snapshot is older than the backend (it needs `.github`). The Docker call in `export-graphql-schema.mjs` is untested.

**Where:** `package.json`, `src/app/features/home/data/home.queries.ts:1`, `src/app/core/graphql/types.ts:1`

**Problem.** Today every document is correct, but only because the maintainers copied names carefully (the contract rule 'schema is the single source of truth' has no automated enforcement). A backend rename or removal (the backend deploys first) will first show up as a runtime 'Cannot query field' error that, as shown above, is retried silently for ever and never reaches Sentry. Hand-written response interfaces can also drift unnoticed (see the type-drift finding).

**Recommendation.** Add graphql as a devDependency, commit schema.graphql (generated by 'strawberry export-schema' in rosak_backend, or by an introspection script in scripts/) and add src/app/core/graphql/documents.spec.ts that imports every *.queries.ts module, collects exported strings that parse as query/mutation, and asserts validate(buildSchema(sdl), parse(doc)) is empty for each. That one Vitest file would have caught every historic 'Unknown argument' regression listed in MISTAKES.md. Add an npm script to refresh the snapshot, and have CI warn when the snapshot is older than the backend's schema. For a full fix later, graphql-codegen could emit the response types, but the validation spec alone closes the gap this audit found.

**Verification.** package.json has no graphql dependency, and I found no schema snapshot or codegen. A graphql-js validation spec against a committed SDL is sound for Vitest. I did not re-run the 62-document validation, and the snapshot needs a refresh process.

<details><summary>Evidence</summary>

```text
I extracted every query, mutation and fragment-free document with the TypeScript AST (62 documents in 14 files, including social-links.queries.ts in full) and validated each with graphql-js 16 (parse + validate with all specified rules, plus a TypeInfo pass for deprecation) against the live introspection of http://localhost:8000/graphql/. Result: 0 validation errors, 0 deprecated fields or arguments, 0 unused variables, 0 variable-type mismatches. package.json has no graphql dependency, no schema snapshot and no codegen.
```

</details>

<a id="f354"></a>

#### F354 · Hand-written response types have drifted from the live schema in a few places

**low** · effort S · code-quality · gap-3

**Status, quality pass 2026-10-22:** Fixed (`6d58a17`, `666528d`, `f1fef18`). `SpottingEvent.status` is `SpottingVehicleStatus`, widened to the schema's 7 values (checked against the live SDL), and `StationLine.internalRepresentation`, `VehicleIncident.brief` and `MediaTypeConnection.totalCount` are nullable. `PassengerStatus` and `SocialMediaLinkStatus` moved into `core/graphql/types.ts`, and `home.queries.ts` re-exports the enums from there, so each union has one copy. `incident-timeline.component.spec.ts` checks that an incident with a null brief renders its title and no brief paragraph. `MyEvent.status` in `profile.queries.ts` is `SpottingVehicleStatus` as well (`f1fef18`), and the build passes with no consumer change. **Left:** `CalendarIncidentSeverity` is declared three times (two insiden query files, plus `HomeIncidentSeverity` in `home-incidents.queries.ts`).

**Where:** `src/app/features/spotting/data/spotting.queries.ts:234`, `src/app/core/graphql/types.ts:21`, `src/app/features/spotting/data/spotting.queries.ts:178`, `src/app/features/spotting/data/spotting.queries.ts:315`, `src/app/features/gallery/data/gallery.queries.ts:52`

**Problem.** With strictNullChecks and strict off, these mismatches cannot be caught by the compiler. The status one is already visible: a real event status (NOT_IN_SERVICE) is typed as a value outside the declared union, so exhaustive handling written against VehicleStatus would silently skip it (the badge only works because it happens to map both unions). LineStatus, VehicleStatus and the SocialMediaLinkStatus unions are also declared twice (core/graphql/types.ts and features/home/data/home.queries.ts).

**Recommendation.** Fix the specific types (use SpottingVehicleStatus for event status, widen it to the schema's 7 values, make the three nullable fields nullable) and keep a single copy of each enum union in core/graphql/types.ts, re-exported where needed. The validation spec from the contract-testing finding can also assert that every string-literal union named after a schema enum equals the enum's values, which would have caught the SpottingVehicleStatus drift mechanically.

**Verification.** spotting.queries.ts:234 types event status as VehicleStatus, while core/graphql/types.ts:21 defines a narrower SpottingVehicleStatus whose own comment gives it as the user-reportable set. The nullability mismatches are plausible. With strict off the compiler cannot catch them.

<details><summary>Evidence</summary>

```text
spotting.queries.ts:234: status: VehicleStatus;   // SpottingEvent.status; schema EventScalar.status is SpottingVehicleStatus
Live data: events.status = { IN_SERVICE: 1936, NOT_IN_SERVICE: 23, TESTING: 41 }; NOT_IN_SERVICE is not in VehicleStatus. The schema's SpottingVehicleStatus now has 7 values (adds NOT_SPOTTED, MARRIED, UNKNOWN) but core/graphql/types.ts:21 declares 4.
spotting.queries.ts:178: internalRepresentation: string;  (schema StationLine.internalRepresentation: String, nullable)
spotting.queries.ts:315: brief: string;  (schema VehicleIncident.brief: String, nullable)
gallery.queries.ts:52: totalCount: number;  (schema MediaTypeConnection.totalCount: Int, nullable)
```

</details>

<a id="f383"></a>

#### F383 · Reuse AuthService for the AI token and share one AI request helper instead of a second Firebase auth bootstrap

**low** · effort S · code-quality · insiden-data · partially confirmed

**Status, quality pass 2026-10-22:** Fixed (`5f448ea`). `IncidentAiService` takes its token from `AuthService.idToken()` and no longer bootstraps Firebase itself, and one private `post<T>()` helper serves both calls. `incident-ai.service.spec.ts` stubs `fetch` and covers both endpoints, 401, 429 and 502, a network error, no user and the server platform.

**Where:** `src/app/features/insiden/data/incident-ai.service.ts:43`, `src/app/features/insiden/data/incident-ai.service.ts:64`, `src/app/features/insiden/incident-form/incident-form.component.ts:578`

**Problem.** The AI service re-implements Firebase app lookup and token retrieval that AuthService.idToken() already provides (the forms use it for the GraphQL header), and its summarize and extract methods duplicate the whole fetch, toast and rethrow block. Because it reads getAuth().currentUser directly, right after page load it can report 'Please log in' while the AuthService has not yet restored the session, and the component and the service both toast the same 'Please log in' message. The service also has no spec (no incident-ai.service.spec.ts exists).

**Recommendation.** Inject AuthService for the token and share one private post helper. Add a service spec with a stubbed fetch. Do not frame it as a login race fix.

_Original suggestion (corrected by the verifier):_ Inject AuthService, call `await auth.idToken()`, and collapse the two methods into a private `post<T>(path, body, signal)` that returns a typed result. Add a service spec that stubs fetch and covers 401, 429, network error, abort and success.

**Verification.** The AI service does re-implement Firebase app and token lookup rather than using AuthService.idToken(), duplicates the fetch/toast block, and has no spec. The 'Please log in' race is overstated because the component already gates on auth.isLoggedIn() before calling, and AuthService.idToken() reads the same Firebase user. This is a cleanup.

<details><summary>Evidence</summary>

```text
function firebaseApp() {
  return getApps().length ? getApps()[0] : initializeApp(environment.firebase);
}
async function currentIdToken() { const user = getAuth(firebaseApp()).currentUser; ... return user.getIdToken(); }
```

</details>

<a id="f391"></a>

#### F391 · Cancelling the incident sheet reloads the whole month payload, and the page reload relies on an effect that writes a signal

**low** · effort S · angular-modernization · insiden-ui · partially confirmed

**Status, quality pass 2026-10-22:** Fixed (`160d6c9`, `34f2af8`, `11e100b`). The /insiden page reloads the month only on the form's new `saved` output, so Cancel no longer reloads it. The card's continuation state and viewer are `linkedSignal`s keyed on the incident payload. The form spec asserts that `saved` emits once after a create (chained and admin) and after an edit, and not after a failed create, a GraphQL rejection, a chronology block, Cancel or Escape. **Left:** A `loadMoreLinks` still in flight across a payload refresh appends its stale page; this predates the change.

**Where:** `src/app/features/insiden/insiden.page.ts:102-119`, `src/app/features/insiden/incident-card/incident-card.component.ts:308-328`

**Problem.** The comment concedes that success and cancel both trigger a reload, so a rider who opens the form and cancels pays for another 48 KB, five-second fetch. The edge detector is an effect that reads and writes its own signal; the card's effect is a derive-state-by-writing-signals pattern that also wipes loaded link pages on any payload change. These are the effect-for-derived-state patterns Angular recommends replacing.

**Recommendation.** Reload only on a save signal from the form, and consider a linkedSignal in the card. Skip the 'afterRenderEffect-free' remark.

_Original suggestion (corrected by the verifier):_ Have the incident sheet service expose a `saved` event or a `lastSavedAt` signal that the form sets only on success, and reload on that. In the card, hold the appended link pages and cursor in a `linkedSignal` keyed on `incident().id` (so a same-id refresh keeps them and a different id resets), and drop viewerMedia reset or key it the same way. Use a plain non-signal field or `afterRenderEffect`-free approach for the previous-open flag.

**Verification.** The reload on sheet close, including cancel, is real and acknowledged in the code comment. The effect that writes its own signal is a legitimate but minor pattern concern.

<details><summary>Evidence</summary>

```text
effect(() => { const open = this.incidentSheet.isOpen(); const wasOpen = this.sheetWasOpen(); this.sheetWasOpen.set(open); if (wasOpen && !open) { this.incidentsResource.reload(); } }); and the card's effect resets appendedEdges, appendedHasNext, nextCursor, linkLoadError, linksLoading and viewerMedia with six `.set()` calls.
```

</details>

<a id="f404"></a>

#### F404 · Stop Tailwind auto-scanning docs, e2e specs and graph output (invalid CSS rule and wasted global CSS)

**low** · effort S · performance · platform · severity adjusted from medium

**Status, quality pass 2026-10-22:** Fixed (`b5a1b36`, `9eb8daa`). `src/styles.css` limits Tailwind source detection to `src/`, so docs, `MISTAKES.md`, e2e specs and `graphify-out` no longer produce utility rules. Global styles fell from 101.54 kB to 96.26 kB raw (15.40 to 14.65 kB gzip), the initial total from 843.67 kB to 838.39 kB, and the `css-syntax-error` warning is gone. The CI build job tees its output to `build.log` and fails with an error annotation if it contains `css-syntax-error`.

**Where:** `src/styles.css:1`, `src/styles.css:4`, `e2e/spotting-keep-alive.spec.ts:232`, `.omo/evidence/audit-2026-10-21/build/build.log:77`

**Problem.** Tailwind v4 scans the whole project directory, not just src. It is reading markdown docs, MISTAKES.md, e2e Playwright selectors such as page.locator('[data-testid="spotting-grid"]:visible'), and the untracked graphify-out data, and generating utilities from prose. That ships an invalid CSS rule in the render-blocking global stylesheet (the cause of the build warning), adds dead rules every time a doc quotes a class-like string, and slows the build. The global CSS is 94.75 kB raw on the hot path of every page.

**Recommendation.** Restrict detection: `@import "tailwindcss/utilities.css" source(none);` followed by `@source "../src";` (or `@import "tailwindcss" source("../src");`). Rebuild and compare styles-*.css size; the css-syntax-error warning should disappear. Add a CI step that fails on any build warning containing css-syntax-error.

**Verification.** styles.css imports tailwindcss/utilities.css with no source() or @source, so Tailwind v4 auto-detects across the project, including md files and e2e specs. The reported css-syntax-error warning and junk selectors are consistent with that.

**Also reported as:** [F318](testing-tooling-and-code-quality.md#f404) [core-shell] Tailwind scans e2e specs, producing the build's css-syntax-error warning and extra CSS (src/styles.css:1, e2e/spotting-keep-alive.spec.ts:232); [F456](testing-tooling-and-code-quality.md#f404) [ui-system] Tailwind auto-scans e2e specs, MISTAKES.md and docs, which causes the 'Unexpected "="' build warning and ships dead CSS (src/styles.css:4, e2e/spotting-keep-alive.spec.ts:232); [F472](testing-tooling-and-code-quality.md#f404) [ux-home] Exclude e2e and docs from Tailwind source scanning to remove the CSS syntax warning (src/styles.css:3, e2e/spotting-keep-alive.spec.ts:232); [F396](testing-tooling-and-code-quality.md#f404) [performance] Stop Tailwind scanning the e2e folder (the CSS build warning) and keep the L7 map CSS out of the global stylesheet (src/styles.css:3, src/styles.css:16)

<details><summary>Evidence</summary>

```text
@import "tailwindcss/utilities.css";  (no source(...) or @source). Build warning: Unexpected "=" [css-syntax-error] src/styles.css:3143:59: ...\[data-testid\=\"spotting-grid\"\]\:visible:is(data-testid="spotting-grid"){. Junk selectors in the emitted CSS include .\[animation\:spin_1s_linear_500ms_infinite_reverse\] and .\[animation\:\2026\], whose only sources are docs/progress/2026/10/05.md and MISTAKES.md.
```

</details>

<a id="f409"></a>

#### F409 · Remove the unused Gen1 callables and stop staging pushes from overwriting the production function

**low** · effort S · architecture · platform · partially confirmed · severity adjusted from medium

**Where:** `functions/src/index.ts:39`, `functions/src/index.ts:56`, `functions/src/api.ts:17`, `.github/workflows/deploy-functions.yml:77`, `.github/workflows/deploy-functions.yml:1`

**Problem.** Two deployed callables are dead code and, because they have no secret binding, can only ever answer 'GEMINI_API_KEY is not configured' while still being callable by any signed-in user and still costing cold starts and attack surface. Separately, the staging and main branches deploy the same function names to the same project, so any push to staging replaces the live production `api` function with staging code; the header comment accepts this as 'logical, not deploy-isolated' but it means an unreviewed staging change can break production, and `--force` also deletes any function missing from the branch's source. Pull requests never run the functions tests or build, because the workflow only triggers on push.

**Recommendation.** Delete the unused callables. Treat the staging versus production deploy isolation as a maintainer decision.

_Original suggestion (corrected by the verifier):_ Delete the two callables and their mapCallableError/parsePayload helpers. Deploy only from main (or split staging into its own Firebase project, or give the staging build a differently named function such as apiStaging). Drop `--force` unless intentionally pruning, pin firebase-tools (`npx firebase-tools@14`), and add a `pull_request` trigger on `functions/**` that runs only build and test.

**Verification.** The Gen1 callables in index.ts exist, and the frontend has no httpsCallable usage. The deploy workflow does run on both main and staging with --force, and the header comment admits this. Removing the dead callables is valid cleanup, and the staging overwrite is a documented, accepted trade-off.

<details><summary>Evidence</summary>

```text
index.ts exports extractIncidentData and summarizeIncident via `functions.region(...).runWith({ timeoutSeconds: 20, memory: "256MB" }).https.onCall(...)` with no `secrets`, while api.ts binds `secrets: ["GEMINI_API_KEY"]`. The frontend only calls `https://asia-southeast1-<project>.cloudfunctions.net/api/<env>/v1/...` (src/app/features/insiden/data/incident-ai.service.ts:50) and nothing in src uses httpsCallable. Deploy: `npx firebase-tools deploy --only functions --project rosak-7223b --force --non-interactive` on pushes to both main and staging.
```

</details>

<a id="f410"></a>

#### F410 · Tighten CI hygiene: least-privilege permissions, timeouts, cancel-in-progress and automated dependency updates

**low** · effort S · dx-tooling · platform

**Status, quality pass 2026-10-22:** Fixed (`8769abc`, `497c4e5`). `ci.yml` has top-level `permissions: contents: read`, a `ci-${{ github.ref }}` concurrency group, `timeout-minutes: 20` on all six jobs, and a Playwright browser cache keyed on the installed `@playwright/test` version. `cancel-in-progress` is true for pull requests only, so a newer push to main or staging does not cancel the previous push build, which is the only Sentry release path. The dependabot file the recommendation names is under F323.

**Where:** `.github/workflows/ci.yml:1`, `.github/workflows/ci.yml:10`, `.github/workflows/ci.yml:22`, `.github/pull_request_template.md:1`

**Problem.** The default GITHUB_TOKEN may have write scope for the whole workflow, superseded pushes to a PR keep running full test, build and e2e jobs, and a hung browser test can run for six hours. For a production app on Express, Firebase, Sentry, Angular 22 and a Node functions project, there is no automated notice of security updates for either package.json.

**Recommendation.** Add `permissions: { contents: read }` at the top of ci.yml, `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`, `timeout-minutes: 20` per job, and a `.github/dependabot.yml` with npm entries for `/` and `/functions` plus github-actions, grouped weekly. Cache the Playwright browser directory keyed on the installed version.

**Verification.** ci.yml has no top-level permissions, concurrency or timeout, and .github contains no dependabot config. These are standard low-severity hygiene items.

<details><summary>Evidence</summary>

```text
ci.yml has no top-level `permissions:`, no `timeout-minutes`, no `concurrency:` block, and each of the three jobs repeats checkout, setup-node and `npm ci`. `ls .github` shows only pull_request_template.md and workflows; there is no dependabot.yml or renovate config.
```

</details>

<a id="f421"></a>

#### F421 · Correct the stale comments that say the backend cannot fetch another user's profile

**low** · effort S · code-quality · profile-about-misc

**Status, quality pass 2026-10-22:** Fixed (`ce8a14a`, `f1fc46c`). The stale comment blocks in `profile.page.ts` and `profile.routes.ts` are replaced with short accurate ones, and the last two `archive/frontend-map` pointers in `profile.queries.ts` are removed. **Left:** Other `archive/frontend-map` pointers remain in `gallery.page.ts`, `imgur.util.ts`, `gallery.queries.ts`, the spotting feature, `core/graphql/types.ts` and `domain-ui`; they are outside this finding.

**Where:** `src/app/features/profile/profile.page.ts:37-48`, `src/app/features/profile/profile.routes.ts:11-13`

**Problem.** The code below the comment calls GET_PUBLIC_USER_QUERY(publicUser(id)), and the backend schema (Query.publicUser(id: ID!) in common/schema/schema.py) exists. The comment tells the next maintainer, and any AI agent reading it, that non-owner profiles cannot work and must show 'not found'. That is false and contradicts the component's own behaviour, and it is the kind of comment that gets 'fixed' by deleting the working public path.

**Recommendation.** Replace both blocks with two sentences describing what happens now: owners use `user`, visitors use `publicUser(id)`, history is null unless the owner opted in. Delete the pointer to archive/frontend-map.

**Verification.** The doc comment in profile.page.ts says the backend cannot fetch another user's data, yet the page calls GET_PUBLIC_USER_QUERY with publicUser. profile.routes.ts has the same stale claim.

<details><summary>Evidence</summary>

```text
"...it only ever renders real data when `:id` is the signed-in caller's own uid. ... the backend has no query that can fetch another user's data by id at all today: `CommonScalars.user` always resolves `info.context.user`"
```

</details>

<a id="f424"></a>

#### F424 · Keep the methodology constants truly single-sourced: an unpinned duplicate of the service-day hour is sent to the backend

**low** · effort S · code-quality · profile-about-misc · partially confirmed

**Status, quality pass 2026-10-22:** Fixed (`e3c6242`, `68c329f`). `line-status-chart.component.ts` no longer sends `dayStartHour`: its variables are `{ lineId }` and the backend default of 3 applies. Bar labels come from each bucket's `hourStart`, and only the typical week still sends `dayStartHour`. The chart and line-pulse-card specs and the util header comment are updated, and the e2e line-history expectation drops the variable.

**Where:** `src/app/features/home/line-pulse/line-status-chart.component.ts:20`, `src/app/features/home/line-pulse/line-status-chart.component.ts:213`, `src/app/features/home/data/status-history-display.util.ts:25`, `src/app/core/methodology/methodology.constants.ts:268-276`

**Problem.** The registry says its constants cannot drift from the widgets because each is pinned by a spec, but the line chart keeps a third private copy of the service-day start hour, which is also the value it sends to the API, and no spec compares it with METHODOLOGY_CONSTANTS. The util file comment says this value is 'a DISPLAY fact here, not a variable to send', yet this component sends it. A change to the service day would update the methodology text and the heat grid and leave this chart's bucket labels and query on 03:00.

**Recommendation.** Stop sending dayStartHour from the line chart (rely on the backend default, as home-history.queries.ts documents) and import the pinned constant from status-history-display.util.ts for labels only.

_Original suggestion (corrected by the verifier):_ Delete the private constant and import SERVICE_DAY_START_HOUR from data/status-history-display.util.ts (the one the spec pins), or add an expect(...).toBe(METHODOLOGY_CONSTANTS["SERVICE_DAY_START_HOUR"].value) for this component's export. Same idea for CONFIRMED_MIN_REPORTS and REPORT_RANKING_TOP_LINES, which are pinned today but exported from feature files into core's spec.

**Verification.** line-status-chart.component.ts has a private SERVICE_DAY_START_HOUR=3 that it sends as dayStartHour, and no spec pins it. However home-history.queries.ts documents deliberately omitting dayStartHour so the backend default applies.

<details><summary>Evidence</summary>

```text
line-status-chart.component.ts:20  const SERVICE_DAY_START_HOUR = 3;
line-status-chart.component.ts:213  variables: { lineId: this.lineId(), dayStartHour: SERVICE_DAY_START_HOUR },
status-history-display.util.ts:25  export const SERVICE_DAY_START_HOUR = 3;
methodology.constants.ts:  SERVICE_DAY_START_HOUR: { value: 3, source: "LINE_STATUS_DERIVE.md" },
```

</details>

<a id="f432"></a>

#### F432 · Two diverging escapeHtml helpers plus hand-built innerHTML in tracker; share one safe implementation

**low** · effort S · code-quality · security · partially confirmed

**Status, quality pass 2026-10-22:** Fixed (`928799e`). `core/util/escape-html.util.ts` is the single `escapeHtml` (the popup version, escaping `&`, `<`, `>` and both quote kinds), with a spec. The info panel's JSON highlighter matches on the raw JSON and escapes each piece. The vehicle popup is built with `createElement` and `textContent` (`buildVehiclePopupHtml` is now `buildVehiclePopupElement`, passed to the L7 popup as an `HTMLElement`) and the marker glyph with `createElementNS`, so no `innerHTML` is left in `vehicle-popup-content.ts` or `vehicle-marker-icon.ts`. New specs drive the popup, the marker, `escapeHtml` and the highlighter with a hostile label. **Left:** `escapeHtml` is used in the info panel only, because the popup and the marker build no markup string. Not checked in a running browser: that a repeated `setOptions({ html: HTMLElement })` on an already open popup replaces its content (L7's `setDOMContent` clears first, but nothing ran the app).

**Where:** `src/app/features/tracker/info-panel/tracker-info-panel.component.ts:53`, `src/app/features/tracker/map/vehicle-popup-content.ts:29`, `src/app/features/tracker/map/vehicle-marker-icon.ts:41`

**Problem.** I traced each use and found no exploitable injection today: the info-panel output goes through [innerHTML] (Angular sanitises it again) and only the text content of GTFS-realtime feed strings is interpolated; the popup helper escapes quotes; the marker SVG interpolates compile-time constants. But the two escapers have different coverage (the info-panel one does not escape quotes), the popup one uses a non-null assertion, and feed strings come from a third-party GTFS feed, so a future change that places a value in an attribute would be unsafe in one copy and safe in the other.

**Recommendation.** Create one escapeHtml in src/app/core/util (the popup version) with a small spec, import it in both files, and prefer building the popup with createElement/textContent over template strings so escaping is structural rather than remembered.

**Verification.** Both escapeHtml copies exist, in tracker-info-panel and vehicle-popup-content, with different coverage. No exploit is shown, so this is dedup polish only.

<details><summary>Evidence</summary>

```text
// info-panel: return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// popup: value.replace(/[&<>"']/g, (c) => ({ ... })[c]!)
wrapper.innerHTML = `<svg ...>${mode === "train" ? TRAIN_PATH : BUS_PATH}</svg>`;
```

</details>

<a id="f440"></a>

#### F440 · Tracker CSV export duplicates the shared helper, skips CR quoting and revokes the object URL synchronously

**low** · effort S · testing · test-gaps · partially confirmed · severity adjusted from medium

**Status, quality pass 2026-10-22:** Fixed (`2781cf2`, `6957fc1`, `b12fbb6`). The info panel's private `toCsv` and its inline Blob and anchor code are gone. `onExportCsv` now calls the shared `downloadCsv` with `toCsv(tableColumns(), sortedRows())` and a `<sourceKey or kind>.csv` file name, with the same columns (id first) and the displayed row order, and lines now end in CRLF instead of LF. `core/export` already quoted CR and revoked on the next tick; a bare-CR case is added to `csv.util.spec.ts`, and the info panel spec checks the exact bytes, the sort order, the deferred revoke and the SSR no-op. **Left:** Tracker rows carry third-party feed text (label, vehicle id, trip id, stop id, stop name) and are not passed through `neutralizeSpreadsheetFormula`. That predates this change and is outside the recommendation.

**Where:** `src/app/features/tracker/info-panel/tracker-info-panel.component.ts:33-46`, `src/app/features/tracker/info-panel/tracker-info-panel.component.ts:572-584`, `src/app/core/export/csv.util.ts:92-106`

**Problem.** The info panel has its own toCsv that does not quote carriage returns (the regex is /[",\n]/), and it revokes the blob URL in the same turn as the click. The core downloadCsv helper documents that synchronous revocation cancels the download in Firefox, and it defers revocation for that reason. The info-panel spec does not test export at all, so this regression is invisible to the suite.

**Recommendation.** Reuse the shared helpers, but note the signatures differ: toCsv(columns, rows) emits CRLF and a header row even for zero rows, and downloadCsv(filename, csv, isBrowser) is the download call. The export code then needs the column list passed in, not inferred from rows[0]. The spec for revocation timing can target downloadCsv's existing tests.

_Original suggestion (corrected by the verifier):_ Replace the local toCsv and the inline download code with toCsv and downloadCsv from core/export/csv.util.ts, then delete the duplicate. Add a spec that spies on URL.revokeObjectURL and asserts it is not called synchronously after onExportCsv, plus a case with a value containing a bare carriage return that must come out quoted.

**Verification.** The inline toCsv in tracker-info-panel.component.ts uses /[",\n]/ without \r, and onExportCsv calls revokeObjectURL synchronously after a.click(), while csv.util.ts defers revocation for Firefox. The info-panel spec has no export test. Impact is low: the cell values are mostly numbers and names, and bare carriage returns are rare.

<details><summary>Evidence</summary>

```text
const escape = (value: string | number) => {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

// onExportCsv
    a.click();
    URL.revokeObjectURL(url);

// csv.util.ts
  setTimeout(() => URL.revokeObjectURL(url), 0);  // "Revoking synchronously cancels the download in Firefox."
```

</details>

<a id="f444"></a>

#### F444 · Photo picker has no spec for its compression gate or its preview URL lifecycle

**low** · effort S · testing · test-gaps

**Status, quality pass 2026-10-22:** Fixed (`68dc654`, `de14fb2`, `c00b223`). The picker revokes the preview object URL of every photo that leaves `files()`: removed with its button, or dropped by the host's reset on sheet close, Clear form or submit. A compressed entry keeps its URL. Picker specs cover the deferred compression gate and the revoke on remove and on emptying the list, and the shell spec drives the real close path (`sheet.setOpen(false)` resets the form and the picker revokes `blob:preview`). **Left:** 'A rejected compression removes the entry and shows a toast' is not done: the owner chose to upload the original (`c955733`), and an existing spec covers that path. A photo still listed when the picker is destroyed keeps its URL (a recorded shortcut), because `incident-card` re-creates the picker over the same list.

**Where:** `src/app/features/spotting/report-form/photo-picker/photo-picker.component.ts:64`, `src/app/features/spotting/report-form/photo-picker/photo-picker.component.ts:77`, `src/app/features/spotting/report-form/photo-picker/photo-picker.component.ts:97-99`

**Problem.** The component's isCompressing signal is the only thing that stops a report from being submitted before its photo is ready, and a long comment explains why it matters, yet no test covers it. Each picked photo creates an object URL that is never revoked, not even when the photo is removed or the sheet closes, so the original full-size File stays in memory for the rest of the session.

**Recommendation.** Add a component spec with a stubbed ImageCompressionService whose resizeToSize returns a deferred promise. Assert that isCompressing() is true until it resolves, that removing a picked photo calls URL.revokeObjectURL with its previewUrl, and that the report form's Submit is disabled while compressing. Fix the leak with `URL.revokeObjectURL(image.previewUrl!)` in _remove and in a cleanup when the sheet closes.

**Verification.** Verified photo-picker.component.ts: URL.createObjectURL is called per picked file, _remove only filters the list, and no revokeObjectURL exists anywhere in the spotting feature. No photo-picker spec exists. Line 64 cited is the isCompressing signal, not the createObjectURL call (line 77), a minor drift.

<details><summary>Evidence</summary>

```text
previewUrl: URL.createObjectURL(file),
...
protected _remove(image: ImageFile): void {
  this.files.update((list) => list.filter((f) => f !== image));
}
```

</details>

<a id="f445"></a>

#### F445 · Mock GraphQL server returns errors for unstubbed operations, so missing stubs can pass silently

**low** · effort S · testing · test-gaps

**Status, quality pass 2026-10-22:** Fixed (`a1e329b`, `3be7b5f`, `d7850f3`). The mock records unstubbed operation names (`GET /__unstubbed`, cleared by `/__reset`). The shared `test` in `e2e/helpers/mock-graphql.ts` resets the mock before each test and fails it afterwards, naming the operations that had no stub, and the specs received the stubs they lacked. `unstubbedOperations()` throws a clear error when a stale shared mock server predates `/__unstubbed`.

**Where:** `e2e/mock-graphql.server.mjs:91-94`, `e2e/helpers/mock-graphql.ts:21-45`

**Problem.** An unstubbed operation returns a GraphQL error with HTTP 200. The app may render that as an empty state, and an assertion that a row or card is not visible will then pass for the wrong reason. Nothing checks for unstubbed calls after a test, and the configuration is not re-verified between tests.

**Recommendation.** Record unstubbed names in the mock (for example in an unstubbed array exposed at GET /__unstubbed) and add an afterEach hook in the shared helper that fails the test if the list is not empty. Add the same check to the spec helpers so each suite reports a missing stub by name.

**Verification.** Read e2e/mock-graphql.server.mjs lines 91-94: an unstubbed operation returns 200 with an errors array, and e2e/helpers/mock-graphql.ts has no check for unstubbed calls. The helper already exposes recordedCalls(), so an afterEach check is a small addition.

<details><summary>Evidence</summary>

```text
if (!(name in stubs)) {
        json(res, 200, { errors: [{ message: `No stub configured for ${name}` }] });
        return;
      }
```

</details>

<a id="f446"></a>

#### F446 · Timing-based waits in unit and e2e specs make them slow or flaky under load

**low** · effort S · testing · test-gaps · partially confirmed

**Status, quality pass 2026-10-22:** Fixed (`56fba92`, `d7850f3`). The 1200 ms hold in `spotting-keep-alive.spec` is a gate promise that the test releases after it has seen the held request (and on page close). `routeGraphQLToMock` takes an optional `hold(body)` hook, so the spec no longer carries its own copy of the GraphQL bridge.

**Where:** `src/app/ui/combobox/combobox.spec.ts:62-65`, `e2e/spotting-keep-alive.spec.ts:131-138`, `src/app/features/tracker/data/gtfs-static.service.spec.ts:45`, `src/app/features/tracker/map/tracker-map.component.spec.ts:34`

**Problem.** The combobox spec waits 150 ms of real time for a 100 ms deferral, which is a tight margin on a loaded CI runner. The e2e keep-alive spec holds a route response for a fixed 1200 ms, which slows the run and can still race. Several unit specs flush with setTimeout 0 rather than a deterministic scheduler.

**Recommendation.** Change only the e2e hold to a test-controlled gate promise that the spec resolves after observing the request. Leave the combobox and setTimeout(0) flushes as they are, or move them to fake timers only when touched.

_Original suggestion (corrected by the verifier):_ In Vitest, use vi.useFakeTimers() around the blur and call vi.advanceTimersByTime(100) to make the deferral exact. In the e2e spec, replace the timed delay with a promise the test resolves explicitly (a gate), so the test waits for the request to be observed rather than for a duration.

**Verification.** Node and jsdom timers fire in due-time order, so a 100 ms timer always runs before a 150 ms wait finishes, and this is not a real flake risk; the repo already uses fake timers in about 42 spec files. The setTimeout(0) flushes are conventional for promise chains. Only the e2e spotting-keep-alive.spec.ts fixed 1200 ms hold is worth replacing with a gate.

<details><summary>Evidence</summary>

```text
/** `_onBlur` defers its sync by 100ms so a (mousedown) selection lands first. */
  async function blurAndSettle(): Promise<void> {
    input().dispatchEvent(new FocusEvent("blur"));
    await new Promise((resolve) => setTimeout(resolve, 150));
```

</details>

<a id="f447"></a>

#### F447 · Build scripts have no tests, and env parsing accepts empty or non-numeric values silently

**low** · effort S · testing · test-gaps

**Status, quality pass 2026-10-22:** Fixed (`fa85f64`, `a1a48dd`, `540a6b2`, `8769abc`). `resolveRuntimeConfig(env)`, `resolveFirebaseConfig(env)` and `readRelease(root)` are exported pure functions, and the scripts write files only when run directly. Three `node:test` files (24 tests) cover empty strings, a non-numeric `UPLOAD_CONCURRENCY` (falls back to 5 with a warning), a missing, empty or wrongly typed Firebase config field and the valid path. `npm run test:scripts` (`node --test "scripts/*.test.mjs"`) is part of `npm run verify` and the CI test job.

**Where:** `scripts/generate-runtime-config.mjs:26`, `scripts/generate-runtime-config.mjs:31`, `scripts/generate-firebase-config.mjs:32`, `../AGENTS.md:131`

**Problem.** The repo rule requires tests for build-script logic, and none of the six scripts in scripts/ has one. The ?? operator does not fall back on an empty string, so an empty BACKEND_URL ships as an empty base URL and every request becomes relative to the site origin. Number('abc') is NaN, which JSON.stringify writes as null, so uploadConcurrency becomes null. generate-firebase-config spreads whatever JSON.parse returns, so a partial or wrongly typed config is accepted without a check.

**Recommendation.** Move each script's resolution logic into an exported pure function, for example resolveRuntimeConfig(env), and add a node:test file (no new dependency) that covers empty strings, a non-numeric UPLOAD_CONCURRENCY, a missing field in FIREBASE_WEBAPP_CONFIG and the valid happy path. Use `||` for strings and an integer check for concurrency, falling back to 5 with a warning.

**Verification.** Read generate-runtime-config.mjs lines 26-31 and generate-firebase-config.mjs lines 23-39: the ?? fallback does not catch empty strings, Number() turns non-numeric input into NaN (which JSON writes as null), and Number('') is 0. The parsed Firebase config is spread without validation. The root AGENTS.md line 131 does require tests for build-script logic, and none of the six scripts has one.

<details><summary>Evidence</summary>

```text
backendUrl: process.env["BACKEND_URL"] ?? FALLBACK.backendUrl,
  ...
  uploadConcurrency: Number(process.env["UPLOAD_CONCURRENCY"] ?? FALLBACK.uploadConcurrency),

// AGENTS.md: "at minimum any new pure utility, service, store, or build-script logic must have a test."
```

</details>

<a id="f454"></a>

#### F454 · HlmCheckbox keeps state in plain mutable fields mirrored by two effects, and has no spec

**low** · effort S · angular-modernization · ui-system · partially confirmed

**Status, quality pass 2026-10-22:** Fixed (`2bef145`, `0980238`). In `ui/checkbox/checkbox.ts`, `checked` and `disabled` are `linkedSignal`s over the inputs; `writeValue`, `setDisabledState` and a click set them, and both effects are deleted. `checkbox.spec.ts` (9 tests) covers the plain `[checked]` and `(checkedChange)` path, `[formControl]` write, reset, disable and enable, and `[formField]` model writes and clicks, with no manual `detectChanges`.

**Where:** `src/app/ui/checkbox/checkbox.ts:67`, `src/app/ui/checkbox/checkbox.ts:74`, `src/app/ui/checkbox/checkbox.ts:90`

**Problem.** In a zoneless app a plain field written from writeValue/setDisabledState does not mark the view dirty, so a programmatic write from the signal-forms [formField] path (form reset, draft clear when the report sheet closes) can leave the visual state stale until some unrelated change detection runs. The two effects that only copy an input into a field are the 'effect that derives state' anti-pattern; a local toggle that the parent rejects also leaves the box visually flipped while the model is not. There is no checkbox.spec.ts, although it is both a CVA and a standalone control.

**Recommendation.** Make the state signals: checked = linkedSignal(() => this.checkedInput()), disabled = linkedSignal(() => this.disabledInput()); writeValue/setDisabledState call .set(). Read them as checked()/disabled() in the template, and delete both effects. Add a spec covering [formField] reset, setDisabledState and the plain [checked]/(checkedChange) path.

**Verification.** checkbox.ts uses plain fields synced by two effects and has no spec (only checkbox.ts in the dir). The template reads the fields but the zoneless staleness claim is plausible and unproven; the CVA writeValue path is the real risk, and linkedSignal is the right fix.

<details><summary>Evidence</summary>

```text
checked = false;
disabled = false;
constructor() {
  effect(() => { this.checked = this.checkedInput(); });
  effect(() => { this.disabled = this.disabledInput(); });
}
writeValue(value: boolean): void { this.checked = value; }
```

</details>

<a id="f461"></a>

#### F461 · HlmButton does not default type and the Card/Table/Skeleton directives cannot merge consumer classes

**low** · effort S · angular-modernization · ui-system · partially confirmed · already documented

**Status, quality pass 2026-10-22:** Fixed (`4c4296a`, `9168ca7`, `a4cf2bc`). `HlmButton` defaults a `<button>` to `type="button"` (anchors get none). Auditing all six forms found three untyped `hlmBtn` buttons that were double-firing submit handlers (the link-form and incident-form sign-in buttons and the line-status retry banner). `HlmCard`, `HlmCardContent`, `HlmSkeleton` and `HlmTr` now merge a consumer class through `hlm()`, because concrete conflicts existed (dead `gap`, `p`, `rounded` and `hover:bg` overrides), and `button`, `card`, `skeleton` and `table` have specs. **Left:** Two known conflicts stay unmerged: `hlmTh` with `!text-end` in `incident-history` and `hlmCardHeader` with `flex-row` on the about page. The now-live overrides (for example cards moving from `p-5` and `gap-4` to the authored `p-4` and `gap-3`) were not checked in a browser.

**Where:** `src/app/ui/button/button.ts:33`, `src/app/ui/card/card.ts:4`, `src/app/ui/table/table.ts:2`, `src/app/ui/skeleton/skeleton.ts:5`

**Problem.** A <button hlmBtn> placed inside a <form> and not marked type="button" submits it, a known footgun (MISTAKES.md already records forms with manual submit handlers). Card, table parts and skeleton use static host classes, so a consumer's class competes by stylesheet order instead of twMerge; MISTAKES.md (2026-10 entry about hlmCard host-class rules) already records the resulting workarounds.

**Recommendation.** Audit forms before defaulting type to button; make Card userClass-mergeable only if a concrete conflict appears.

_Original suggestion (corrected by the verifier):_ Add "[attr.type]": "_type()" to HlmButton's host defaulting to 'button' for button elements (with an explicit type input for submit buttons) and audit the forms that rely on implicit submit. Move HlmCard, HlmSkeleton and the table parts to the userClass + hlm() pattern used by HlmButton/HlmBadge.

**Verification.** button.ts sets no default type, and card.ts/skeleton.ts use static host classes with no hlm() merge. Hosts that set type=button explicitly are fine, so submit surprises are rare; defaulting type globally could silently break forms relying on implicit submit.

<details><summary>Evidence</summary>

```text
Measured on /: 11 of 15 button[hlmbtn] elements have no type attribute (default submit).
HlmCard: host: { class: "bg-card text-card-foreground border-border flex flex-col gap-4 rounded-xl border p-5 shadow-sm" }  (no userClass / hlm() merge, unlike HlmButton and HlmBadge)
```

</details>

<a id="f508"></a>

#### F508 · Run axe in the test pipeline so these regressions are caught

**low** · effort M · testing · accessibility · partially confirmed

**Status, quality pass 2026-10-22:** Fixed (`9c5e2be`, `68f6449`, `819eae7`). `src/testing/axe.ts` exports `expectNoAxeViolations(fixture)`, which runs axe-core with structural tags only (aria, name-role-value, text-alternatives, forms, structure) and prints readable violation text. Its own spec proves that axe flags an unnamed button in jsdom, and `sheet.spec.ts` and `combobox.spec.ts` each run it and are clean. Importing axe sets `window.axe` and adds one inert window message listener per worker, which nothing reads, so `isolate: false` stays safe. **Left:** Contrast and target-size checks, which the recommendation leaves to a browser-based pass, are not added; the e2e axe scans (F560) also run with `color-contrast` off.

**Where:** `src/test-setup.ts`, `src/app/ui/sheet/sheet.spec.ts`, `src/app/ui/combobox`

**Problem.** Nearly every finding above is something axe or a simple template lint finds mechanically (unlabeled buttons, unlabeled inputs, aria on role-less spans, ol/li structure, contrast of the Helm variants), yet nothing automated guards them and Lighthouse produced no result here. The repo's own lint gate is Prettier only, so each new icon button or tooltip can reintroduce `outline-none` with no ring or an unnamed button.

**Recommendation.** Add axe-core in Vitest for structural rules only (names, roles, aria attributes) with color-contrast disabled. Do contrast and target-size checks in a browser-based CI pass.

_Original suggestion (corrected by the verifier):_ Add `axe-core` as a devDependency and a small helper `expectNoA11yViolations(fixture.nativeElement)` that runs axe in the Vitest jsdom environment for the shared primitives (HlmSheet, HlmCombobox, InfoPopover, the toast content, the nav, the calendar). Add a template-level script check (in the same spirit as other build-script tests) that fails on `outline-none` without `focus-visible:`, `<button>` with only an `<img alt="">`, and `(click)` on non-button elements. Run a Playwright or Lighthouse axe pass against the SSR build for the top routes in CI.

**Verification.** No axe dependency exists in package.json or src, so the gap is real. But axe color-contrast and layout rules do not work in jsdom, so a Vitest axe helper would catch only the structural issues, not the contrast and target-size ones.

<details><summary>Evidence</summary>

```text
`rg "axe|jest-axe|toHaveNoViolations" src` returns nothing; the only a11y assertions are hand-written attribute checks (tick-up motion-safe class, tab handlers). Lighthouse did not produce results in this audit run.
```

</details>

<a id="f513"></a>

#### F513 · Pending incident editor re-implements about a third of IncidentFormComponent

**low** · effort M · code-quality · console · severity adjusted from medium

**Status, quality pass 2026-10-22:** Partly fixed (`d533324`, `3705dc1`, `a0aac10`, `93b8601`, `a137bed`, `52dcdfb`, `e6424be`). The pending editor now uses the public form's shared helpers instead of its own copies: `injectInsidenReferenceOptions` builds its tag options (the links edit sheet uses it too, and `link-reference.util.ts` lost its four option builders), `incidentToForm` prefills it, `updateChronology` edits its chronology rows and `chronologyInputs` builds the payload rows. The pending save therefore drops blank rows and trims URLs and text, as F237 does on the public form, and `chronologyErrors` refuses a row with a date or URL but no description, with the public form's toast, and sends nothing. The editor's 15 s extract caps are kept in a set and cleared on `closePanel()` and on `DestroyRef.onDestroy`, so a cap can no longer toast 'Data extraction failed' after the panel closed or the page was left. Both console editors also keep a vehicle that is tagged without its line in the vehicle list. `pending.component.spec.ts` covers each change, and the cap spec fails without the fix. **Left:** The rest is still copied from `IncidentFormComponent`, which this change could not edit: the extract, replace and undo state machine (`EXTRACT_TIMEOUT_MS`, `ChronologyExtractState`), `summarize()`, and the scalar half of the update payload (three copies, one in pending and two in the form). The two `ChronologyExtractState` types also differ, because the public snapshot holds `indicator`, so sharing them is not a plain import. The public form's extract cap still leaks on destroy. `pending.component.ts` is 788 lines, and the implementer estimates that a shared composable with an apply hook would remove about 150 of them.

**Where:** `src/app/features/console/insiden/pending/pending.component.ts:184`, `src/app/features/console/insiden/pending/pending.component.ts:541`, `src/app/features/console/insiden/pending/pending.component.ts:675`, `src/app/features/insiden/incident-form/incident-form.component.ts:380`, `src/app/features/insiden/incident-form/incident-form.component.ts:167`

**Problem.** The doc comment says the panel 'mirrors' the public form, and it does so by copy: reference lookups, vehicle/station option derivation, the AI extract state machine with timeout/late-result/undo, summarize, and model reset. A bug fix in one copy (for example the extract timer, which is never cleared on destroy) must be repeated by hand. The pending panel also repeats the 67 KB reference query and its derivations that link-reference.util.ts already centralises for the links page.

**Recommendation.** Extract shared helpers incrementally rather than a big store.

_Original suggestion (corrected by the verifier):_ Extract a component-scoped `IncidentDraftStore` (provided in `providers` of both hosts) owning the form model, chronologies, extract states, extract/summarize/undo and the reference-derived options, plus a shared `useInsidenReference()` composable built on link-reference.util.ts. Both components then shrink to wiring and their own submit/approve handlers. Keep the existing specs by exposing the same methods through the host.

**Verification.** EXTRACT_TIMEOUT_MS is declared in both pending.component.ts and incident-form.component.ts, with a mirrored extract state machine. The duplication is real but works today.

<details><summary>Evidence</summary>

```text
Of 411 non-trivial lines (>25 chars) in pending.component.ts, 154 are byte-identical to lines in incident-form.component.ts (measured).
Both declare: const EXTRACT_TIMEOUT_MS = 15_000; extractChronology, replaceWithExtraction, undoExtraction, setExtractState, summarize, _vehicleParentCodes, vehicleOptions
```

</details>

<a id="f520"></a>

#### F520 · Angular packages are misaligned and several direct dependencies are one or more majors behind

**low** · effort M · dx-tooling · deps-tooling · partially confirmed · severity adjusted from medium

**Where:** `package.json:33`, `package.json:36`, `package.json:46`, `package.json:48`, `package.json:53`

**Problem.** Angular's own guidance is to keep the @angular/* family on the same version, and the cdk is one minor behind the framework. Each Angular minor carries fixes for the signals and router code this app depends on heavily. Spartan brain at 1.3.1 is seven minor releases behind, which matters because the local ui/ layer sits on top of it. Sentry at 10 and firebase at 12 are also drifting, so each future upgrade grows.

**Recommendation.** Bump the @angular/* family including cdk to the same version in one lockfile commit, and treat the Spartan brain and Sentry upgrades as separate commits with their own changelog review.

_Original suggestion (corrected by the verifier):_ Bump all @angular/* packages, including the cdk, to 22.2.3 in one commit with the lockfile. Read the Spartan brain changelog for 1.4 through 1.8 and upgrade it in its own commit, since it touches the primitives in src/app/ui. Upgrade @sentry/angular and @sentry/node to the latest 10.x first, then plan the 11 migration separately. Plan firebase 13 after reading its breaking changes.

**Verification.** The lockfile pins @angular/cdk 22.0.0 while core, common and router are 22.1.0, and the registry does have 22.2.3, so the misalignment is real. Calling it a violation of Angular's own guidance and rating it medium overstates a one-minor-version gap in a peer package with no observed bug.

<details><summary>Evidence</summary>

```text
package-lock.json pins @angular/cdk 22.0.0 while @angular/core, @angular/common and @angular/router are 22.1.0. npm outdated --json reports: @angular/core 22.1.0 wanted 22.2.3; @sentry/angular 10.69.0 latest 11.8.0; firebase 12.17.1 latest 13.0.0; @spartan-ng/brain 1.3.1 wanted 1.8.0; @ng-icons/core 34.0.0 latest 36.1.0; typescript 6.0.3 latest 7.0.2; vitest 4.1.10 latest 5.0.5.
```

</details>

<a id="f541"></a>

#### F541 · Remove the duplicated pagination and view-model code in HomeStore, the card and the row

**low** · effort M · architecture · home-data · partially confirmed · severity adjusted from medium

**Status, quality pass 2026-10-22:** Partly fixed (`0786811`, `434e3aa`, `6430c5e`, `b598258`, `a325c21`, `d8b06cf`, `d5c64e3`). `HomeStore` has one `PagedFeed` class (`data/paged-feed.ts`), built twice for today and last week. The card and the row share one `injectLinePulseView` (`data/line-pulse-view.ts`), and the network board stamps one `ng-template #boardRow` five times, with a type-only `BoardRowTemplate` guard directive keeping the `LinePulse` typing. The write-up's ten appended signals, two `loadMore` copies, twelve shared card and row members and five wrapper copies are now one each, and `home.store.ts` lost 193 lines against 93 added. Specs pin `PagedFeed` (9 tests) and the view (5 tests). **Left:** The store-level shared `now` signal for the 16 rows' `_now` and effect (it changes row timing and the row spec's `HomeStore` stub shape), and moving the Pro filter signals into a route service.

**Where:** `src/app/features/home/data/home.store.ts:740`, `src/app/features/home/data/home.store.ts:1116`, `src/app/features/home/data/home.store.ts:1148`, `src/app/features/home/line-pulse/line-pulse-card.component.ts:338`, `src/app/features/home/line-pulse/line-pulse-row.component.ts:419`, `src/app/features/home/line-pulse/network-board.component.ts:230`

**Problem.** The store's invariants (cursor reset on filter, overlap dedupe, overlay coverage, variables parity) are written twice and must be kept in sync by hand, which is exactly how the overlay and Load More gap arose. Card and row copy the same derived state, and each beat 16 rows each hold their own _now signal and effect for the same clock.

**Recommendation.** Optional refactor; do not bundle with the behavioural fixes.

_Original suggestion (corrected by the verifier):_ Extract a small PagedFeed helper (variables factory in, edges/pageInfo/totalCount/loadMore out) used for both windows so the cursor-reset and overlay-merge logic exist once, move the Pro filter signals into their own route service, create an injectLinePulseView(line) composable for the shared card/row state, and replace the five wrapper copies with one ng-template or a tiny board-row-shell component. Share one store-level now signal updated on the beat.

**Verification.** home.store.ts is 1,280 lines with duplicated loadMore/loadMoreLastWeek and appended signals, and row/card each keep a _now signal. It is a maintainability refactor, and the claim that duplication caused the overlay gaps is not true (those are omissions).

<details><summary>Evidence</summary>

```text
HomeStore is 1,280 lines with ten near-identical appended/lastWeekAppended signals and two near-identical loadMore methods; the card and the row share 12 of their 16 protected derived members (_confidence, _confidenceInfo, _vehicleBreakdown, _pinHint...); the board repeats the same 9-class row wrapper five times.
```

</details>

<a id="f550"></a>

#### F550 · Replace the state-propagating effects in both forms with derived signals and explicit close handlers

**low** · effort M · angular-modernization · insiden-data · partially confirmed

**Status, quality pass 2026-10-22:** Partly fixed (`4d8f24f`, `ca106a8`, `11e100b`). The default category is the `injectDefaultCategory()` `linkedSignal` in both forms. In the incident form, Cancel, the sheet's `openChange` and a successful submit all call `close()`, and `IncidentSheetService.close()` nulls `editTarget`, so the reset effect is gone. `docs/components/insiden.md` records that the link form still resets from its `_wasSheetOpen` effect. **Left:** The link form's `_wasSheetOpen` close-reset effect remains. Removing it needs `link-sheet/` to call a form close path from Cancel and `(openChange)`.

**Where:** `src/app/features/insiden/incident-form/incident-form.component.ts:276`, `src/app/features/insiden/incident-form/incident-form.component.ts:287`, `src/app/features/insiden/incident-form/incident-form.component.ts:302`, `src/app/features/insiden/link-form/link-form.component.ts:347`, `src/app/features/insiden/link-form/link-form.component.ts:391`

**Problem.** Each form uses three or four effects that write signals: reset on close using a _wasSheetOpen latch, hydrate-once using a _hydratedIncidentId guard, default category prefill, default line prefill. These are the effect-to-propagate-state pattern that Angular steers away from; they rely on private flags to avoid re-running, they run in creation order (the repository already hit a scroll-lock bug from that, per MISTAKES.md), and the hydrate effect reads signals inside incidentForm().reset() that may re-trigger it.

**Recommendation.** Optional. Make the default category a linkedSignal and move the reset into the sheet service close path. Only touch the hydrate effect if a bug appears.

_Original suggestion (corrected by the verifier):_ Make `selectedCategoryId` a linkedSignal that defaults to the Just Reporting id when no edit target is set and the user has not chosen. Put the reset in the sheet service's close/setOpen (or in the host's (openChange) handler) rather than observing isOpen. Hydrate from an explicit `sheet.open(incident)` call or `afterRenderEffect` rather than an effect with a guard flag.

**Verification.** The close-reset, hydrate-once and default-category effects exist as described, using _wasSheetOpen and _hydratedIncidentId guards. They work, and the guard flags are deliberate. Replacing them with linkedSignal and explicit close handlers is a reasonable modernization but speculative and low value on its own.

<details><summary>Evidence</summary>

```text
effect(() => {
  if (!this.sheet.isOpen() || this.sheet.editTarget() || this.selectedCategoryId()) { return; }
  const justReporting = (this.referenceResource.data()?.calendarIncidentCategories ?? []).find(...);
  if (justReporting) { this.selectedCategoryId.set(justReporting.id); }
});
```

</details>

<a id="f560"></a>

#### F560 · Add an SSR smoke test and a mobile project to the e2e/CI pipeline

**low** · effort M · testing · platform · partially confirmed · severity adjusted from medium

**Status, quality pass 2026-10-22:** Partly fixed (`9eb8daa`, `56a11e7`, `44ef9c6`, `d5e0b04`, `c449af1`). CI part: the build job uploads `dist/web` minus `*.map` as the `dist` artifact, and a new `ssr-smoke` job runs the mock GraphQL server and the SSR server and checks `/` for 200 and `Cache-Control`, `/about` for 200, `/nope` for 404 and no `Error:` in any body. The smoke server runs as `NODE_ENV=production` with `ENVIRONMENT_NAME=ci` and the Sentry ingest host blackholed, so it files no events in production Sentry, and the job fails if the mock on :4301 does not start. Playwright part: `playwright.config.ts` has desktop and mobile (Pixel 7) projects, `forbidOnly` and one retry on CI, a github reporter beside list on CI and `reuseExistingServer` off CI, and `@axe-core/playwright` scans home, `/spotting/1` and `/spotting/1/vehicle/1` against a per-spec baseline with `color-contrast` off. **Left:** `/%E0%A4%A` answers 500 and not 400, because the 400 handler in `server.ts` is F401, so that check is a `::warning::`. The axe scans report app defects that are baselined and not fixed: `region`, `label-content-name-mismatch`, `heading-order` (an h3 on `/spotting/1`) and, on mobile, `link-name` and `page-has-heading-one`. The build job points `BACKEND_URL` at the mock, because the production build bakes the live API URL.

**Where:** `playwright.config.ts:4`, `playwright.config.ts:17`, `playwright.config.ts:19`, `playwright.config.ts:26`, `e2e/static-server.mjs:1`, `package.json:13`, `.github/workflows/ci.yml:84`

**Problem.** Everything that makes this app special in production, server.ts, host validation, the cache header, the gtfs proxy, render modes, hydration and SSR error handling, is never exercised before a deploy. The three problems above (empty allowedHosts, 500 on a bad URL, no deadline) could all have been caught by a 20-line smoke test. Tests also run only at desktop size although the audience is mostly on phones, there is no coverage for gallery, tracker, profile, methodology or photo upload, and no automated accessibility assertion. retries: 0 and no forbidOnly make CI flaky-prone for browser tests.

**Recommendation.** Add a CI step after the build job: start `NG_ALLOWED_HOSTS=localhost PORT=4000 node dist/web/server/server.mjs` against the mock GraphQL server and assert with curl or a Playwright request fixture that / returns 200 with the Cache-Control header, /about returns the CSR shell, /nope returns 404, /%E0%A4%A returns 400, and that no response contains 'Error:'. In playwright.config.ts add `projects: [{ name: 'desktop' }, { name: 'mobile', use: devices['Pixel 7'] }]`, `forbidOnly: !!process.env.CI`, `retries: process.env.CI ? 1 : 0`, reporter ['github'] on CI, and `reuseExistingServer: !process.env.CI`. Add @axe-core/playwright checks on the home and spotting pages.

**Verification.** playwright.config.ts runs only a CSR static build, with workers 1, retries 0 and one desktop project, as quoted. An SSR smoke test is a sensible addition, but several of its claimed catches rely on other unverified findings.

<details><summary>Evidence</summary>

```text
playwright.config.ts: 'E2E specs run against a CSR-only static build of the app (development configuration ...)', `workers: 1, retries: 0`, one default desktop Chromium project, webServer reuseExistingServer: true. e2e/ contains specs for home, incident workflows, spotting details and spotting keep-alive only; the ci.yml build job runs `npm run build` and never starts the server.
```

</details>

<a id="f569"></a>

#### F569 · Several effects copy or derive state that should be computed or linked signals, including a URL to signal to URL sort loop

**low** · effort M · angular-modernization · spotting · partially confirmed

**Status, quality pass 2026-10-22:** Fixed (`49d1f07`, `e1ad59e`, `b5d505a`, `f619152`). In `line-overview.page.ts`, `sortColumn` and `sortDirection` are computeds over `queryParamMap`, and `onSortChanged` writes through the core `writeQueryParams` helper (browser-only, merging, `replaceUrl`, defaults left out), so mounting the page no longer navigates. `statusFilter` is `linkedSignal({ source: lineId, computation: () => null })`. In the report form the vehicle status is a computed (`selectedVehicleStatusValue`) and its mirror effect is deleted. The doc comment in `core/url-state/query-param.util.ts` still described line-overview's removed write-back effect and said the helper's split mirrored that page; it now names the current writers, and says that line-overview writes through the helper but keeps its own `sort` and `dir` read guard while `home-view-mode.service.ts` and `incident-filter.util.ts` read through it (`b5d505a`, `f619152`). **Left:** The report form's line-change effect stays on purpose: it must react to every `lineId` write (seed, draft restore, model writes), which an event handler would miss.

**Where:** `src/app/features/spotting/line-overview/line-overview.page.ts:271`, `src/app/features/spotting/line-overview/line-overview.page.ts:282`, `src/app/features/spotting/line-overview/line-overview.page.ts:295`, `src/app/features/spotting/report-form/report-form.component.ts:172`, `src/app/features/spotting/report-form/report-form.component.ts:182`

**Problem.** Sort state is mirrored from the URL into two signals, then back into a navigation by a third effect that also runs once on every mount with default values, so a click goes signal, URL, queryParamMap, signal again with an extra router navigation each time. `statusFilter` is reset by an effect rather than tied to lineId, and the form copies a derived value (selectedVehicleStatus) into the model to feed the schema. These are the effect-writes-signal patterns that linkedSignal and computed are meant to replace.

**Recommendation.** Make sortColumn and sortDirection computeds over queryParamMap and have onSortChanged call router.navigate directly (then delete both effects). Declare `statusFilter = linkedSignal({ source: this.lineId, computation: () => null })`. In the form, derive selectedVehicleStatus as a computed and give the schema's validator access via a `validate` that reads it, or keep it in the model through a single linkedSignal tied to vehicleId. Existing specs for sort sync should still pass.

**Verification.** The URL to signals to URL effects and the effect-copied selectedVehicleStatus and statusFilter reset exist and could be computed/linkedSignal. The 'extra navigation on every mount' is overstated, since navigating to an identical URL is ignored by default, and the browser-only guard is deliberate for SSR.

<details><summary>Evidence</summary>

```text
effect(() => { this.lineId(); this.statusFilter.set(null); });
effect(() => { const params = this.queryParamMap(); ... this.sortColumn.set(...); this.sortDirection.set(...); });
effect(() => { const column = this.sortColumn(); ... this.router.navigate([], { queryParams: {...}, queryParamsHandling: "merge", replaceUrl: true }); });
...
effect(() => { const status = this._vehiclesForLine().find((v) => v.id === vehicleId)?.status ?? ""; if (status !== this.model().selectedVehicleStatus) { this.model.update(...) } });
```

</details>

<a id="f573"></a>

#### F573 · The GTFS proxy route in server.ts has no tests, no upstream timeout and no cache headers

**low** · effort M · testing · test-gaps · partially confirmed · severity adjusted from medium

**Status, quality pass 2026-10-22:** Fixed (`5292361`, `9c3fe1a`, `4c38d1f`). The proxy handler moved from `src/server.ts` into `src/server-gtfs-proxy.ts` (`createGtfsProxyHandler`, taking `fetch` and `captureException`). The upstream fetch is bounded by `AbortSignal.timeout(15000)`, and a stalled upstream answers 502 and reports to Sentry. A 2xx answer sends `Cache-Control: public, max-age=3600` and other statuses send none. `server-gtfs-proxy.spec.ts` covers success, the content-type fallback, non-2xx, a fetch throw, the timeout (including that fetch received the 15 s signal), a missing or unparseable url and three disallowed hosts. The finding's unknown-feed-id case does not apply, because the endpoint takes a `url`, so the host-allowlist cases replace it. **Left:** Redirects are followed without re-checking the host, and only the first URL is checked against the allowlist.

**Where:** `src/server.ts:43-78`, `src/server-cache-control.spec.ts:1-20`

**Problem.** The host allowlist is the only guard on an unauthenticated, unrate-limited route that makes the server download a full GTFS zip. The only spec in src/ that touches server.ts covers cache-control for /, so none of the proxy's branches run in CI. Each request re-fetches the upstream file because no Cache-Control header is set, and fetch has no timeout, so a slow upstream holds a request open indefinitely. The allowlist also checks only the first URL, and fetch follows redirects by default.

**Recommendation.** Extract the proxy handler into its own module (for example server-gtfs-proxy.ts) that takes fetch and Sentry as parameters, then unit-test the branches listed. Add AbortSignal.timeout(15000) and a Cache-Control header as proposed. Describe the timeout as bounding a slow upstream, not an indefinite hang.

_Original suggestion (corrected by the verifier):_ Add a server spec that uses supertest or a direct handler call with fetch stubbed, covering these cases: missing url returns 400; https://api.data.gov.my.evil.example returns 400; a userinfo trick such as https://api.data.gov.my@evil.example returns 400; a valid URL streams the upstream content type; an upstream 503 returns 503; a thrown fetch returns 502 and calls Sentry. Then add `AbortSignal.timeout(15000)` to the fetch call and a `Cache-Control: public, max-age=3600` header on successful responses, since the static GTFS file changes slowly.

**Verification.** Confirmed server.ts proxy has no Cache-Control header, no fetch timeout, and an unthrottled public route, and that fetch follows redirects. The 'hang indefinitely' claim is overstated, since undici's default headers timeout is about five minutes. Testing is harder than suggested because server.ts calls Sentry.init and builds AngularNodeAppEngine at import time, so the handler must be extracted before a spec can call it.

<details><summary>Evidence</summary>

```text
app.get("/api/gtfs-proxy", async (req, res) => {
  const target = req.query["url"];
  ...
  if (parsed.hostname !== GTFS_PROXY_ALLOWED_HOST) {
    res.status(400).send("URL host not allowed");
  ...
    const upstream = await fetch(parsed);
```

</details>

<a id="f577"></a>

#### F577 · Sheet scroll lock is an order-dependent global effect, and the nav paints above the scrim

**low** · effort M · architecture · ui-system · partially confirmed · already documented

**Status, quality pass 2026-10-22:** Fixed (`08be18e`, `12ad80f`). A new root `ScrollLock` service (`ui/sheet/scroll-lock.ts`) ref-counts holders and writes body and html overflow only on the 0 to 1 and 1 to 0 transitions (SSR-guarded), and `HlmSheet` holds it at most once per open. The sheet scrim moved from `z-40` to `z-[48]`, above the nav (`z-[45]`); the panel stays `z-50`. Specs cover two sheets in both handover orders, destroy, the scrim layering, and the service's counts, including a stray release and the server no-op. **Left:** The `home.page.spec.ts` assertion that the report chooser is hosted before every other sheet, and two comments in `home.page.ts` and `report-chooser.component.ts`, now document an invariant that no longer exists.

**Where:** `src/app/ui/sheet/sheet.ts:92`, `src/app/ui/sheet/sheet.ts:103`, `src/app/ui/sheet/sheet.ts:42`

**Problem.** Each of the 9 HlmSheet instances writes the same two global inline styles from its own effect, so one sheet closing or mounting can unlock another that is open. This is already recorded in MISTAKES.md (2026-10-03) and papered over with a template-order invariant pinned by a spec, plus the open z-40 scrim versus z-[45] nav issue. The harm is that every new page that hosts two sheets must know the invariant.

**Recommendation.** Optional: ref-counted scroll lock, or fold into the native dialog rebuild if finding 0 is done.

_Original suggestion (corrected by the verifier):_ Remove the per-instance writes. Either use a native dialog (see the focus finding), or lock scrolling from CSS that depends on DOM state rather than effect order, for example html:has([data-sheet-open="true"]) { overflow: hidden } with a host attribute bound to open(), or a small root-provided ref-counted ScrollLockService. Portal or top-layer the scrim so it covers the sticky nav.

**Verification.** Per-instance body/html overflow writes exist at sheet.ts:92-103 and match the evidence. It is a known, documented and spec-pinned invariant, so it is a design smell with no user harm today.

<details><summary>Evidence</summary>

```text
document.body.style.overflow = isOpen ? "hidden" : "";
document.documentElement.style.overflow = isOpen ? "hidden" : "";
backdrop: class="bg-black/50 fixed inset-0 z-40 transition-opacity"
```

</details>

<a id="f581"></a>

#### F581 · No Helm primitives for menus, icon buttons, tabs/segmented controls or empty states, so features copy long class strings

**low** · effort M · code-quality · ui-system · partially confirmed

**Status, quality pass 2026-10-22:** Partly fixed (`ad244ea`, `1279875`, `606126b`, `8fbd11f`). The icon-button directive that the recommendation asks for first is in. `hlmIconBtn` (`button[hlmIconBtn]`, `HlmIconButton`, `src/app/ui/icon-button/icon-button.ts`) is a size-8 round ghost button with a hover tint and a focus ring, and it is always `type="button"`. A consumer `class` overrides the defaults through `hlm()`. In dev mode it logs a `console.warn` when the button has neither `aria-label` nor `aria-labelledby`, and a spec asserts the warning. The check runs in `ngOnInit`, so it counts a static attribute or a template `[attr.aria-label]` but not a host binding on a wrapper component, which Angular applies later; no adopter does that. The directive replaces the hand-written Close buttons in the app nav account panel, the module menu and `button[app-report-bug-button]` (which applies it as a host directive that exposes `class`), and after review the three console incident Close buttons (one in `links.component.html`, two in `pending.component.html`). `icon-button.spec.ts` has 4 tests and `report-bug-button.component.spec.ts` has one more for the class override. The rendered `flex` became `inline-flex`, and every adopter sits in a flex container, so the computed display is unchanged. **Left:** The menu panel, segmented chip and empty-state primitives are deferred, as the recommendation allows. Two copies of the old string remain in `features/tracker/info-panel/tracker-info-panel.component.ts` (the Full screen toggle and Close), which belong to the tracker package. `media-viewer` (size-9, rounded-lg, white on dark), `link-card` and `toast-content` (size-6, rounded-md) have a different shape and keep their own strings. The compact-nav, network-board, pro-lines-widget and home.page lines that the finding cites are not icon buttons, so nothing there was swapped. Checked with the unit suite and the production build only, not in a browser.

**Where:** `src/app/shell/app-nav/app-nav.component.ts:215`, `src/app/shell/app-nav/app-nav-module-menu.component.ts:52`, `src/app/shell/compact-nav/compact-nav.component.ts:126`, `src/app/features/home/line-pulse/network-board.component.ts:128`, `src/app/features/home/pro/pro-lines-widget.component.ts:99`, `src/app/features/home/home.page.ts:301`

**Problem.** Repeated hand-written markup is exactly where the missing focus rings (see the focus finding) and inconsistent hit sizes spread. The dropdown menu panels have no shared keyboard behaviour (arrow keys, Escape, focus return) and use z-30 against sheets at z-50 and nav at z-[45]. Segmented filter chips are hand-built five times, and only one place uses role="tablist".

**Recommendation.** Do an icon-button directive first (it also fixes finding 4); defer the menu and toggle-group work.

_Original suggestion (corrected by the verifier):_ Add four small Helm pieces: HlmIconButton (or button size="icon" with a close icon), an HlmMenu built on @spartan-ng/brain/menu (or CDK menu) for the three dropdowns, an HlmToggleGroup/HlmSegmented for the chips (aria-pressed or radiogroup semantics), and an HlmEmptyState. Migrate call sites incrementally.

**Verification.** The repeated menu panel, close-button and chip class strings exist across the cited files. It is a maintainability observation, not a defect, and a large refactor for modest value.

<details><summary>Evidence</summary>

```text
class="bg-popover text-popover-foreground border-border absolute top-full right-0 z-30 mt-2 flex min-w-56 flex-col rounded-lg border py-2 text-sm shadow-md"   (3 files)
class="focus-visible:ring-ring/50 cursor-pointer rounded-md px-2 py-1 text-xs font-medium outline-none focus-visible:ring-2"   (5 times in 2 files)
"-mr-1.5 flex size-8 ... rounded-full outline-none" close button (7 files); border-dashed p-6 text-center empty boxes (3 places)
```

</details>

<a id="f582"></a>

#### F582 · Status colours are raw palette utilities (153 uses in 18 files) instead of semantic success/warning/info tokens

**low** · effort M · ui-visual · ui-system · partially confirmed

**Status, quality pass 2026-10-22:** Fixed (`a2e7610`, `0980238`). `styles.css` defines `--success`, `--warning` and `--info` with `-foreground` pairs for light and dark, exposed through `@theme inline` as `bg-success`, `text-info-foreground` and so on. `badge.ts`, `toast-content`, `home-hero` and `vote-button` use them instead of raw palette utilities. Badges move to token tints (green, not emerald), toast and vote icons gain dark-mode pairs, and `badge.spec.ts` pins the three status variants to token tints. **Left:** About 150 raw status palette utilities in other files (`home-refresh-control`, `domain-ui` badges, `fleet-summary`, `network-heat-strip` and others) are not migrated, and the hero's degraded orange has no token. The token variables are not tested (the test builder cannot read `styles.css`), and the dark-mode look of the new tints was not checked in a browser.

**Where:** `src/styles.css:261`, `src/app/ui/badge/badge.ts:21`, `src/app/ui/toast/toast-content.component.ts:7`, `src/app/features/home/hero/home-hero.component.ts:465`, `src/app/features/insiden/vote-button/vote-button.component.ts:80`

**Problem.** The token block defines only neutral/primary/destructive/brand tokens, so every green, amber and blue is chosen per call site, and many have no dark pair. Light green-600 text on the light card measures 3.29:1, and red-600 on the dark card 3.58:1. The same semantic (for example 'normal service') is therefore drawn with slightly different greens across hero, badges, toasts and vote buttons.

**Recommendation.** Introduce success/warning tokens opportunistically when touching those components.

_Original suggestion (corrected by the verifier):_ Add --success/--warning/--info (and -foreground and -subtle) variables with light and dark values in :root / :root.dark, expose them with @theme inline like --color-brand, and migrate badge variants, toasts, hero and vote button to bg-success/10 text-success etc. Then the .dark override covers all of them automatically.

**Verification.** Raw palette utilities (emerald, green, amber) are used in badge.ts and the toast content, and dark pairs are inconsistent. Real design-system debt, but a broad migration with cosmetic payoff.

<details><summary>Evidence</summary>

```text
success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
success: "text-green-600"   (toast icon, no dark variant)
rg count outside specs: 153 palette colour utilities versus 50 dark:-prefixed utilities.
```

</details>

<a id="f596"></a>

#### F596 · Replace the hand-rolled load/isLoading/reload-queue machinery with resource() and split the 1,722-line links component

**low** · effort L · architecture · console · partially confirmed · severity adjusted from medium

**Status, quality pass 2026-10-22:** Partly fixed (`bbad748`, `4ae3ebb`, `6f873c1`, `f566b2c`, `9b9da54`, `ce79b8a`, `d3d9ddf`, `b7b46c6`, `da7c721`, `92077ea`). The pending queue read is now a `resource()` keyed on an `appliedSearch` signal, with the rows as a `linkedSignal` over its answer, so a search typed during a read supersedes that read (this fixes F061). Applying the same term again over a failed read reloads the resource, which is the only retry the page has; a good read is not refetched for the same term. The loader takes the resource's `abortSignal`, so a superseded read that fails no longer toasts over a good list. On the links page the `ConsoleCategories` read is gone and the Category filter takes its options from the reference read, the nine `applied*` fields are one snapshot, and the 1,726-line component is split into `links-queue.ts`, `links-tree.ts`, `links-actions.ts` and `link-edit-panel.ts`; `links.component.ts` is now 414 lines. If the reference read fails on the links page, nothing is toasted: the Category filter goes empty, as the Line, Vehicle and Station filters already did, and only the edit sheet shows its retry box. `links.component.spec.ts` passed unchanged after each split commit, and `pending.component.spec.ts` grew from 28 to 32 tests. **Left:** The links queue read is still hand-rolled: `reloadQueued`, park-and-replay in `load()`, and `finishLoading()` drained from seven `finally` blocks. Two things block the conversion: the spec that pins park-and-replay (a click during a read is held and replayed, while `resource()` would supersede the read) and the `isLoading` flag that the six mutations share. An earlier report also named `graphqlResource`'s missing auth header as a blocker; that was wrong, because a plain `resource()` can send the ID token from its loader, as the pending page does, and `docs/components/console.md` now says so. `links-actions.ts` is 542 lines, a little over the roughly 500 target. The four composables have no specs of their own and are covered through `links.component.spec.ts`.

**Where:** `src/app/features/console/insiden/links/links.component.ts:1622`, `src/app/features/console/insiden/links/links.component.ts:1661`, `src/app/features/console/insiden/links/links.component.ts:679`, `src/app/features/console/insiden/pending/pending.component.ts:815`

**Problem.** The queue's correctness depends on nine mutable `applied*` fields, an `isLoading` flag shared by seven mutation verbs and a manual parked-reload replay, which the file's own comments describe as easy to break by adding an eighth verb. The pending and spotting pages each reimplement a weaker version (see the dropped-search finding). The components also own selection, tree derivation, mutations and sheet form state in one class, so the spec has to drive handlers directly off the instance.

**Recommendation.** Treat as optional refactor; do not prioritise.

_Original suggestion (corrected by the verifier):_ Make the applied filters a single `signal<AppliedQueueFilters>` and load with `resource({ params: () => this.applied(), loader: ({ params }) => this.fetch(params) })`, calling `.reload()` after structural mutations; stale responses are dropped by the resource itself. Move the group/reorder/status mutations and selection into a `LinksQueueStore` (component-scoped service) and leave the component as template wiring. GraphQLClient.request does not take an AbortSignal today, but resource discards superseded results, which is the property needed here.

**Verification.** links.component.ts is 1722 lines with manual isLoading/reloadQueued machinery, as described. The file documents these as deliberate, and the rewrite to resource() is a large refactor with no concrete bug behind it.

<details><summary>Evidence</summary>

```text
links.component.ts is 1,722 lines (about 300 of them class-level doc comment) with 21 async handlers.
private reloadQueued = false;  private finishLoading(): void { this.isLoading.set(false); if (this.reloadQueued) { ... void this.load(); } }
```

</details>
