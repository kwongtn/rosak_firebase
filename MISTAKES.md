# Known Defects & Traps — rosak_firebase

> Catalog of known defects, traps, and cross-component gaps so future agents don't repeat them.
> Entries use **Date**, **Component**, **Problem**, **Root Cause**, **Fix**, **Prevention**; fixed
> items carry a fix date + commit.
> Per-feature "missing shared utility" findings were previously duplicated once per feature **and**
> again in a `Cross-Component Systemic Issues` section. They are consolidated below into
> `## Cross-Component Opportunities` — one entry per capability, with the per-feature specifics kept
> as bullets. These mirror `docs/COMPONENTS.md` § Cross-Component Feature Opportunities.

---

### [2026-09-24] spotting/line-overview: `vehicle-list` roster — cards only engaged below `sm` while the table needs ~654px (overflow band 640–~706px)

**Problem**: On `/spotting`, at ~626–742px viewport the fleet roster stayed a squeezed, overflowing
desktop table ("smallest size") instead of switching to the mobile cards layout — the cards only
engaged below ~640px.
**Root Cause**: Not a breakpoint-definition inconsistency (spotting uniformly uses `sm`; the project
uses Tailwind defaults throughout). The 7-column roster table's min-content width is ~654px and it
cannot shrink further, while the table↔cards switch sat at `sm` (640px) — so "desktop table" mode
guaranteed less width than the table needs and the table overflowed its card in the 640–~706px band.
**Fix**: Raised the `vehicle-list` switch `sm` → `md` (768px) in `vehicle-list.component.ts`: the
"View as cards / View full table" toggle (`md:hidden`, line 146), the desktop table wrapper
(`hidden md:block`, line 277), and the card list (`flex flex-col gap-3 md:hidden`, line 353). Cards
now render below 768px (covers the reported 626–742px band); desktop starts only where the 654px
table fits (at 768px: 654px table inside ~720px card). Verified in-browser at 500/700/767 → cards,
768 → table fits; full suite **86 files / 755 tests** green.
**Prevention**: When a data-dense table is the widest element, pin its mobile-switch breakpoint at or
above its measured min-content width — probe the table's `getBoundingClientRect().width` right above
the chosen breakpoint, because the worst overflow is just above it, not at deep desktop widths.

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

### [2026-09-23] test/unit-test builder: spec type check enforces strict null checks — typed `querySelector<T>` derefs fail

**Problem**: A new assertion using a typed DOM query (`const countdown = root.querySelector<HTMLElement>(…); countdown.compareDocumentPosition(list)`) failed the unit-test build with `TS18047: 'countdown' is possibly 'null'` and `TS2345: 'HTMLElement | null' is not assignable to 'Node'` — even though `AGENTS.md` documents `strict`/`strictNullChecks` as off and no `tsconfig*.json` sets them.
**Root Cause**: the `@angular/build:unit-test` type check compiles specs with strict null checks regardless of the workspace tsconfig's (absent) strict flags. Existing specs dodge it because `fixture.nativeElement` is `any`: the `nativeElement.querySelector(…) as HTMLElement` idiom yields `any` (the cast erases the null), while the typed generic `querySelector<HTMLElement>(…)` keeps `HTMLElement | null`.
**Fix**: Null-guard typed DOM queries in new specs (optional chaining, an explicit guard, or compare raw `innerHTML` offsets) — `feat(home): split the front page into two panels with a line-refresh countdown`.
**Prevention**: In specs, either keep the `as HTMLElement` idiom or handle the `| null` that a typed `querySelector<T>` returns. Don't assume `AGENTS.md`'s "strict is off" applies to the unit-test build's type check.

### [2026-09-22] repo/prettier: Playwright artifacts broke `prettier --check .` (and Prettier _does_ read `.gitignore`)

**Problem**: After an e2e run, Playwright wrote `test-results/`, `playwright-report/` and `blob-report/` into the repo root; `npx prettier --check .` then failed on the unformatted report files (e.g. `test-results/.last-run.json`). It is tempting to blame "Prettier does not read `.gitignore`", but that is backwards.
**Root Cause**: Prettier's CLI `--ignore-path` defaults to `[.gitignore, .prettierignore]` (verified against Prettier 3.9.6 in this repo via `npx prettier --help`). Prettier therefore _does_ honour `.gitignore`; the artifacts broke the check only because they were not yet listed there. Confirmed with a throwaway probe: a badly-formatted file under a gitignored directory is skipped, while the same file under a tracked directory is flagged.
**Fix**: Added `/test-results`, `/playwright-report` and `/blob-report` to `.gitignore` (commit `6157823`). Because Prettier reads `.gitignore`, that alone is sufficient; no `.prettierignore` entry is needed.
**Prevention**: Keep generated tool output (Playwright reports, coverage, build output) in `.gitignore`; that one file is also Prettier's default ignore list. Do not add a separate `.prettierignore` before checking whether `.gitignore` already covers the path.

### [2026-09-23] ui/combobox: clearing the input left the old selection (and its label) in place

**Problem**: Emptying a shared `HlmCombobox` (report-form line/vehicle pickers, calendar year picker) appeared to do nothing — on blur the old label snapped back and the form model still held the old id, so a "cleared" field kept submitting the previous selection. The three station `<select>`s had the same class of bug: their placeholder `<option value="">` was `disabled`, so choosing it could not clear the station.
**Root Cause**: `HlmCombobox` decoupled typed text from the selected value. `_onInput` set only `search`, and `_syncSearchToValue` (the constructor `effect` + `_onBlur`) re-derived the input text from `value` + `items()`, so a cleared field was refilled with the old item's label while `value` (and the `[formField]` model bound to it) kept the old selection.
**Fix**: `_onInput` now clears `value` to a new `emptyValue` input when the text is emptied (default `undefined`; string-typed Signal Forms fields pass `""` because Signal Forms drops a node whose model becomes `undefined`), and `_syncSearchToValue` short-circuits on `undefined` so it can never resurrect a cleared field. The three station placeholders lost `disabled`. Commit `1f37d7d`; all three combobox consumers (report-form, vehicle-detail, calendar) guard falsy values.
**Prevention**: In a text/value control, typed text and committed value are two states — clearing the text must clear the value, and any blur-time resync must treat "nothing selected" as a distinct state, not a failed lookup. Never make a placeholder option `disabled` when selecting it is meant to clear the field.

### [2026-09-22] home: the 30s poll beat must reload the lines only, never `reloadAll()`

**Problem**: Pointing the front page's `PollingSource` at `reloadAll()` silently discarded the user's appended feed pages every 30 seconds — `reloadAll()` drops `appendedEdges` (they belong to the stale dataset), so "Load More" progress vanished on a timer with no user action.
**Root Cause**: `reloadAll()` is the submit/edit refresh (both resources, appended pages dropped); the poll beat is a passive lines refresh and needs different semantics. One call, two intents.
**Fix**: The beat now calls `reloadLines()` (`linesResource.reload()` plus a `linesRefreshTick` bump) and leaves the feed untouched; the tick travels page → list → card → the open accordion's chart/reports, each reloading its own resource while expanded. `reloadAll()` is unchanged for submit/edit. Commit `ae667fb`; `home.store.spec.ts` pins both paths.
**Prevention**: Give a periodic refresh its own method; never point a timer at the broad reset used by explicit user actions. If one call serves two intents, split it before attaching a beat.

### [2026-09-22] home/line-status-chart: `line-status-bar` stays on the hour container, never on a segment

**Problem**: After each hour's bar was split into per-status segments, putting `data-testid="line-status-bar"` on (or duplicating it onto) the segments would have made the chart spec and the e2e stub count one bar per segment, silently breaking every hour-count assertion.
**Root Cause**: The test id names the hour, but the DOM changed from one element per hour to a container plus N segment children — the stable conceptual unit and the visual pieces diverged.
**Fix**: `data-testid="line-status-bar"` remains on the hour container only; segments carry no test id (the spec selects `:scope > div` to count them). Commit `476683d`.
**Prevention**: Keep a test hook on the semantic unit (the hour), not the visual pieces. When a component's DOM is subdivided, re-confirm each `data-testid` still resolves to the same node a spec or e2e assumes.

### [2026-09-23] ui/combobox: the deselect fix was tested with a blur, not the Enter that follows the clear

**Problem**: After commit `1f37d7d` made emptying the combobox clear its `value`, the field could still "reselect itself": clearing the input and pressing Enter committed the previously highlighted item again (or a different one), so the form re-sent an id the user had just removed. The bug was reported twice because the first fix looked complete.
**Root Cause**: Clearing the text clears `value` but leaves the panel OPEN over `_filtered()`, and an empty query makes `_filtered()` return the entire unfiltered list. `_highlightIndex` still pointed at whatever was highlighted before the clear, so `_selectHighlighted()`'s `_filtered()[_highlightIndex()]` committed a real (wrong) item. The first fix's spec cleared the field and then BLURRED — the one gesture that closes the panel and resyncs the display — so it never touched the Enter path where the stale commit happened.
**Fix**: `_selectHighlighted()` now returns early unless `_hasMovedHighlight()` (true only after ArrowUp/ArrowDown since open, reset on open/input) or the query is non-empty; Enter therefore commits only a deliberate choice, and the panel stays open on a no-op. Specs pin Enter-after-clear and Enter-on-a-click-opened-panel as no-ops while Enter-after-ArrowDown still commits (22add7c).
**Prevention**: When a control has separate "clear" and "commit" gestures, test the commit gesture that follows the clear, not just the clear itself. Closing/blurring the panel is not the user's commit path — model the exact keystroke sequence from the report. A fix is not verified until the failing gesture is reproduced in a spec.

### [2026-09-23] spotting/report-form: a reactive resource's requestFn read the whole model signal

**Problem**: Every write to the spotting report model re-issued the station lookup. Typing one character in Notes sent one `StationLinesByLine` POST, so a 10-character note fired 10 identical station queries; the same held for any unrelated field (status, wheel condition, run number).
**Root Cause**: `stationLinesResource`'s requestFn read `this.model()`, the single signal holding the entire form. A `graphqlResource` tracks every signal read inside its requestFn, so the resource's dependency was the whole model object and each model write re-ran the fetch. Only `lineId`/`type` participate in the request (`variables: { lineId }` plus the type gate).
**Fix**: The requestFn now reads two `computed`s of primitive values — `_stationLineId` (`model().lineId`) and `_stationType` (`model().type`) — so only a line/type change re-runs it. `report-form.component.spec.ts` asserts an unrelated `notes` write triggers no station POST and a `type` change does (6bbb2a0).
**Prevention**: A reactive resource's requestFn must read only the primitive fields its request depends on; project them into `computed`s and read those, never the whole model signal. Mind the unit-test blind spot: jsdom/vitest flush resources synchronously, so specs cannot observe the refetch-storm timing window a real browser with real latency exposes — assert the projection in the spec, and reproduce the storm in a browser.

### [2026-09-24] Testing: `vitest --filter` matches test NAMES with a case-sensitive regex, not file paths

**Problem**: Two agents scoped the methodology specs with `npm test -- --no-watch --filter "methodology"` and each saw the spec file loaded but **0 tests ran** — a suite that looked like it passed while executing nothing.
**Root Cause**: `--filter` narrows by suite/test **name** using a **case-sensitive regular expression**; it is not a path or filename filter (that is `--include`). A spec whose `describe(...)` names are capitalized (e.g. `MethodologyPage`, `InfoPopover`) never matches a lowercase `methodology` filter, and the builder reports the file as loaded with zero matching tests rather than erroring.
**Fix**: Filter with the real-cased name regex, or use `--include <path>` for a single file. `AGENTS.md`'s own example is `npm test -- --no-watch --filter "^App"` for exactly this reason.
**Prevention**: Read "file loaded but 0 tests ran" as a filter mismatch, not a pass. Use `--include <path>` for one file and `--filter` only with a regex that matches the suite/test name's actual casing (anchor it, e.g. `"^Methodology"`); re-run without a filter before trusting a green result.

## [2026-09-24] SSR/graphql: `REQUESTS_CONTRIBUTE_TO_STABILITY` renders resource data, so a viewport-conditional `@if` mismatches hydration

**Problem**: The spotting details grid's template branches on viewport (`isNarrow()`): below 768px it renders a stacked mobile layout, at/above it the desktop table. The server has no viewport, so it always rendered the desktop branch, and because Angular's `REQUESTS_CONTRIBUTE_TO_STABILITY` defaults `true` the server awaited the grid's GraphQL POST and rendered the desktop grid with real data. On a phone the client's first render wanted the mobile branch, so hydration could not match the server markup (NG0500/NG0502).
**Root Cause**: `httpResource`/`graphqlResource` requests contribute to Angular's stability by default; a server render therefore resolves them and emits fully-populated desktop markup. Any `@if` keyed on a client-only signal (viewport, media query) then disagrees with that markup on first client render, which is exactly what hydration mismatch detection reports.
**Fix**: `host: { ngSkipHydration: "" }` on `VehicleSpottingGridComponent` — Angular's documented remedy for content that is not hydration-compatible. The component re-renders on hydration instead of hydrating, and the client's own synchronous `isNarrow()` picks the correct branch immediately. Same remedy already used by `src/app/ui/info-popover/info-popover.ts`.
**Prevention**: Any component whose first-render markup depends on a browser-only signal (viewport, `matchMedia`, `localStorage`) while also reading a `graphqlResource`/`httpResource` cannot be safely hydrated; skip hydration on that host and leave a comment naming the reason. Do not assume "SSR renders the skeleton and hydration fills it in" — stability defaults make the resource resolve before the server flushes.

## [2026-09-24] spotting/vehicle-spotting-grid: `flex-col` with a retained `items-start` collapses the horizontal scroll container

**Problem**: On mobile the grid switched to `flex-col`, but the names/scroll split still carried `items-start` (added for the desktop layout, where it stops the taller horizontal-scroll sibling from stretching the names table). Under `flex-col`, `align-items: start` sizes each child to its content width on the cross (horizontal) axis instead of stretching to full width, so the `overflow-x-auto` date body collapsed to its content and the dates no longer scrolled within the viewport.
**Root Cause**: `items-start` is axis-relative: in a `flex-row` container it controls the vertical cross axis and is harmless, but in a `flex-col` container it controls the horizontal cross axis, where "start" means content width, not full width.
**Fix**: Bind the class rather than leaving it static: `[class.items-start]="!isNarrow()"` (with `[class.flex-col]="isNarrow()"`), so `items-start` applies only in the desktop row layout and the column layout gets the default `stretch`.
**Prevention**: When a flex container flips direction responsively, audit every alignment utility for axis-dependence; `items-start`/`items-end`/`items-center` mean a different axis under `flex-col`. Make such utilities signal-bound, never a static class that outlives the direction it was chosen for.

## [2026-09-24] spotting/vehicle-spotting-grid: `position: sticky; left: 0` on a `colspan` `<td>` is unreliable, pin an inner `<div>`

**Problem**: On mobile the per-vehicle name and per-type label needed to stay pinned to the left while the date row scrolled horizontally. Putting `position: sticky; left: 0` on the full-width `colspan` `<td>` did not pin reliably across browsers, and a pinned cell can also overlap cells in adjacent rows.
**Root Cause**: Sticky positioning on table cells, and especially on a cell spanning a `colspan`, is not honoured consistently; a cell's own box and the table's layout algorithm interact badly with the sticky containing block.
**Fix**: Keep the `<td>` as a plain full-width `colspan` cell and put the sticky pin on an inner `<div class="sticky left-0 w-fit">` inside it. The `<div>` is the sticky element; the `<td>` stays an ordinary cell.
**Prevention**: Never put `position: sticky` on a `<td>` (or `<th>`) that spans columns. Wrap the pinned content in an inner element and pin that. Test the pin against horizontal scroll rather than trusting the CSS on inspection.

## [2026-09-24] spotting/vehicle-spotting-grid: a pinned overlay must be a sibling of the `overflow-x-auto` body

**Problem**: The mobile pinned overlay (current type label + totals) has to stay under the month/day header while scrolling vertically, but placing it inside the horizontal-scroll body left it inert: it never engaged.
**Root Cause**: `position: sticky` sticks against its nearest scrolling ancestor. The body owns `overflow-x-auto`, and the CSS overflow spec promotes the other axis too, so that element is the sticky containing block on both axes; it never scrolls vertically (it flows with the page), so a sticky descendant inside it has nothing to stick against and sits at its natural position forever.
**Fix**: Render the overlay as a page-sticky sibling of the `overflow-x-auto` body, not a descendant, with `height: 0` so it contributes no flow height and its visible content overflows downward only while a section is pinned. The component's existing desktop mirror already followed this rule; the mobile overlay follows it too.
**Prevention**: A sticky element that must stick to the page can never live inside an `overflow` ancestor, even one that only overflows on the other axis. Place it as a sibling of the scroll container. This is the same trap the component's class doc comment documents for its header/mirror split.

## [2026-09-24] e2e/spotting-details: a too-short stub fleet clamps `window.scrollBy` so the pinned overlay never engages

**Problem**: The new mobile e2e asserted the pinned overlay engaged after `window.scrollBy`, but with a 3-vehicle stub fleet the page was barely taller than the 844px viewport, so `scrollBy` clamped to the tiny maximum and the grid never scrolled the sticky boundary into range; the overlay stayed unpinned and the assertion was meaningless.
**Root Cause**: Sticky engagement depends on real scroll distance. The test data has to make the page tall enough that the sticky boundary can actually be scrolled past; a stub smaller than the viewport gives no scroll room, and the browser silently clamps the requested scroll.
**Fix**: Enlarged the stub fleet to 2 types × 8 vehicles so the grid is ~1150px tall, giving the page real scroll distance for the pinned overlay to engage. The e2e then passes at 390×844 (stacked rows, sticky-left pins, pinned overlay, collapse) alongside the desktop 1280×900 regression check.
**Prevention**: For any e2e that exercises sticky/pinned behaviour, size the stub data so the scrollable content is comfortably taller than the viewport; a `scrollBy` against a non-scrolling page clamps silently and the pin assertion passes or fails for the wrong reason. Assert the page actually scrolled (e.g. `window.scrollY > 0`) before asserting the pin.

## [2026-09-25] spotting/vehicle-spotting-grid: a duplicated pinned overlay drifts from its in-flow twin, so pinning jumps the type label

**Problem**: On mobile (<768px) the current type label renders twice — the in-flow full-width TYPE row and the pinned overlay copy (`data-testid="grid-mobile-pinned-label"`). Their class lists had drifted, so when a type anchored (pinned) under the header, its font size, colour and borders visibly jumped from the in-flow styles — exactly the moment both copies are on screen together.
**Root Cause**: Two markup copies of the same visual element each carried their own hand-maintained class list, duplicated in the template rather than derived from one source; styling passes on the in-flow copy (font/border/colour changes) were never mirrored to the pinned snapshot, and the pinned totals cells even used a different border side (`border-t`) than the in-flow totals row (`border-b`).
**Fix**: Both copies now read one class-producing method (`mobileTypeLabelClass()`) as the single source for the label's look classes; the pinned overlay's per-date totals cells use `border-b` to match the in-flow totals row, and the in-flow label's inner `<span>` wrapper was removed (the label is itself the flex row now). Desktop markup is untouched. New unit test `"renders the pinned type label with the same look classes as the in-flow type label"` was RED 1 failed / 10 passed → GREEN 11 passed / 11; full suite **87 files / 766 tests**, `npx prettier --check .` clean, `npm run build` exit 0, Playwright spotting-details 2/2 with the pinned label matching the in-flow label (`.omo/evidence/spotting-details-mobile-pinned.png`).
**Prevention**: When the same visual element exists in two templates (an in-flow row and a pinned/mirrored copy), both must read one shared class-producing method or class constant — never paste a second copy of the class list. Assert the class parity in a spec so drift surfaces as a failed test, not a visible pinning jump.

## Fixed

### [2026-09-24] SSR: NG0502 from content projected into a conditional slot

**Problem**: `GET /` returned HTTP 200 with a 22-byte body (`Internal server error.`) on both the dev server (`:4200`) and the production SSR build, while `/methodology` rendered fine. Nothing was logged anywhere, so the route looked healthy to every client and monitor.
**Root Cause**: `StatusInfoChipComponent` projects `<div popoverExtra>` into the shared `InfoPopover`'s `<ng-content select="[popoverExtra]" />`, which lives inside `@if (_open())`. `_open()` is false on the server, so the slot never exists and the projected node has no DOM counterpart; Angular's hydration serializer (`calcPathForNode` → `appendSerializedNodePath` → `annotateForHydration`) throws `NG0502` mid-stream. `@angular/ssr`'s `writeResponseToNodeResponse` wraps the stream in a bare catch (`node_modules/@angular/ssr/fesm2022/node.mjs:401-404`) that writes the 22-byte fallback after the status line is already sent, swallowing the real error. Bisect: `977e10f` rendered `/` at 229,700 bytes; `5c53c4c` (the chip composing the shared popover) dropped it to 22 bytes.
**Fix**: `ngSkipHydration: ""` on the `InfoPopover` host (`src/app/ui/info-popover/info-popover.ts:45`) — Angular's documented remedy for content that is not hydration-compatible — which also covers every future consumer that projects `[popoverExtra]` (e.g. the planned provenance chip). Consequence: because Angular's `clearElementContents` discards the host's children and re-renders the component, `app-info-popover` instances re-render on hydration instead of hydrating, so the server markup inside `app-info-popover` is newly created client-side (functionally identical; a11y and the public API are unchanged). New `src/app/features/home/line-pulse/status-info-chip.server.spec.ts` renders the real chip through the actual server path (`renderApplication` + `provideClientHydration`) and fails with the same `NG0502` without the fix. Commit `f0954ac`.
**Prevention**: Never project content into a slot that is conditionally rendered; if you must, skip hydration on that component and cover it with a server-render spec (`renderApplication`), because a jsdom `TestBed` spec cannot catch this class of failure. Debugging tip: a 22-byte `Internal server error.` with HTTP 200 means the `@angular/ssr` stream catch fired — instrument the response stream to see the real error, since nothing reaches the console.

### [2026-09-24] Testing: non-isolated Vitest shares globals and the module cache across spec files

**Problem**: Growing four spec files reshuffled Vitest's size/duration ordering and exposed three cross-file leaks that made `npm test -- --no-watch` intermittently red: `status-info.util.spec.ts` read `"sentinel: registry-sourced"`, `info-popover.spec.ts`'s "missing matchMedia" case behaved as hover-capable, and `gtfs-static.service.spec.ts`'s `Sentry.captureException` assertions saw zero calls.
**Root Cause**: `@angular/build:unit-test` defaults to `isolate: false` (Karma/Jasmine parity), so every file in a worker shares the jsdom global object **and** the module cache. `line-status-metrics.util.spec.ts` / `status-info.util.spec.ts` mutated `METRIC_DOCS` after `vi.resetModules()` and left the sentinel-sourced registry and metric modules cached for later files; `line-status-sheet.component.spec.ts` assigned `window.matchMedia` (returning `matches: true`) in `beforeEach` and never restored it; and the tracker specs that `vi.mock("@sentry/angular")` can run after another spec already cached `gtfs-static.service` bound to a different mock.
**Fix**: The mutating specs now restore the registry and `vi.resetModules()` in a `finally`; `line-status-sheet.component.spec.ts` stubs `matchMedia` via `vi.stubGlobal` and calls `vi.unstubAllGlobals()` in `afterEach`. The remaining `gtfs-static.service.spec.ts` hazard is untouched (tracker file, separately owned); `npm test -- --no-watch --isolate` runs the whole suite deterministically (86 files / 753 tests, 3/3 green) at ~4× the duration.
**Prevention**: With `isolate: false`, never mutate a shared module export or assign a browser global without restoring it; use `vi.stubGlobal` + `vi.unstubAllGlobals()` for globals, and leave the module cache clean (`vi.resetModules()` in `finally`) after any spec that mutates registry/module state. A spec that passes alone but fails in the full suite is this class of bug — read the file ordering, not a timing flake.

### [2026-09-22] insiden/home: the Pending pill and the pending group keyed off `completed`, not the approval `status`

**Problem**: Approved links rendered the "Pending" pill (`title="Awaiting admin approval"`) — every seeded card on the home feed, and four approved links under the situasi tab's "Pending (4)" — so approved content looked unapproved.
**Root Cause**: The link row conflated the two independent axes. `SocialMediaLink.status` (`LIVE`/`PENDING_APPROVAL`) is the approval state, while `completed` is the admin console's separate "mark handled" boolean (`incident/models.py`; `seed_demo_data.py` writes `status=LIVE` and never sets `completed`). The card rendered the pill on `!completed` and `LinkListComponent` split rows on `completed`, and `FEED_QUERY` didn't even select `status`, so the home card couldn't see the approval axis at all.
**Fix**: `LinkCardComponent` renders `link-pending` only for `status === "PENDING_APPROVAL"`; `LinkListComponent` partitions approved = `status !== "PENDING_APPROVAL"` / pending = `status === "PENDING_APPROVAL"`; `FEED_QUERY` selects `status` and `FeedLink`/`LinkCardItem` carry it. `completed` stays the console's own axis. Specs pin the independence (LIVE + `completed: false` → no pill; `PENDING_APPROVAL` + `completed: true` → pill). Commit `fb136df`.
**Prevention**: When two fields describe different lifecycle axes, name which axis drives which UI at the field declaration and assert the independence in the spec. A "pending" affordance belongs to the approval enum, never to an admin's handled flag.

### [2026-09-22] AGENTS.md: `postGraphQL()` referenced a non-existent API

**Problem**: The "Data access" convention told agents to call `postGraphQL()` for mutations. No such function exists anywhere in the repo — the only hits are the AGENTS.md line and a stale docstring in `graphql-client.ts` — so anyone following it had to guess the real write API.
**Root Cause**: The convention named a helper that was never shipped; the real surface is `graphqlResource()` for reads and `GraphQLClient.request(query, variables?, extraHeaders?)` for writes, but the doc wasn't kept in step with the implementation.
**Fix**: AGENTS.md now names `inject(GraphQLClient).request(query, variables, headers)` for mutations (same commit as this entry).
**Prevention**: Every API name in AGENTS.md should be greppable in `src/`; when the doc and the code disagree, the code is the contract. A fixed doc claim gets a progress entry plus a MISTAKES entry like this one.

### [2026-09-22] templates/prettier: an HTML comment inside an `@for` block breaks Prettier's Angular parser

**Problem**: a `<!-- … -->` comment placed inside an `@for (…) { … }` block of an inline component template made `npx prettier --write` fail with `SyntaxError: ',' expected.` at the comment's line — Prettier could not parse the whole `.ts` file, so it dropped out of the formatting gate.
**Root Cause**: Prettier parses inline templates with its Angular-HTML parser, which does not accept HTML comments inside control-flow block content (Angular's own compiler is more permissive).
**Fix**: Moved the rationale into the TypeScript docstring of the function that owns the behaviour (the `@for` block itself stays comment-free).
**Prevention**: Keep template comments outside `@if`/`@for`/`@switch` blocks — put them in the TS doc comments instead. If `prettier --write` reports a syntax error on a template line, look for a comment inside a control-flow block first.

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
