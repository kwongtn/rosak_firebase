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

### [2026-10-01] core/graphql: `isLoading` is PRISTINE-ONLY — a refresh that completes can never be observed through it (FIXED)

**Problem**: The home page's refresh confirmation ("Updated", transient) never appeared in practice,
and could have appeared on a FAILED refresh. Its effect was armed by a click through a plain
`_refreshPending` boolean and settled on `HomeStore.isLoading()` going false — but
`graphqlResource.isLoading` is deliberately `raw.isLoading() && !hasEverLoaded() && !hasError()`, so
it is `true` only for the very first fetch and is `false` for every `reload()` afterwards. A boolean
is not a signal, so arming the flag re-ran nothing; and even if the effect had re-run, `isLoading`
had nothing left to report. The same effect never read `hasError`, so a refresh that settled on an
error was indistinguishable from a successful one. The button's `aria-label` also still said
"Refresh line statuses now" when the beat had been scoped to the whole page.
**Root Cause**: The narrowing that makes `isLoading` right for a skeleton gate
(`@if (isLoading) {skeleton} @else if (hasError) {...}` must not re-flash on every retry) silently
removed the only observable in-flight signal, and nothing in the code said so at the call site. A
`httpResource`'s real in-flight flag was reachable — it is what `isLoading` is derived from — it just
had not been exposed, so the natural spelling for "is a refresh happening?" was the one flag that
cannot answer it.
**Fix**: `graphqlResource()` gained an ADDITIVE `isFetching: computed(() => raw.isLoading())` — the
raw in-flight flag, true for the pristine fetch, a `reload()` and an automatic retry alike, with
`isLoading` untouched as the skeleton gate. `HomeStore.isRefreshing` ORs it across the three page
resources, and `HomeRefreshControlComponent` arms `_refreshPending` on a **click** (a signal, so the
effect re-runs), latches `_refreshStarted` when `isRefreshing` goes true, and confirms only when it
settles false with `!store.hasError()` — an automatic poll tick can never confirm anything, and
neither can a click whose request never went out. Pinned by
`graphql-client.spec.ts` (`isFetching` true across a reload where `isLoading` is false) and
`home-refresh-control.component.spec.ts` (green check only on a click-armed clean settle; nothing on
an error, on an automatic transition, or on a no-op click).
**Prevention**: When a UI must react to a REFRESH **completing** — "no changes", "Updated", a
spinner during a manual reload, an idle-vs-busy badge — never key it on `graphqlResource.isLoading`
or on a plain boolean. Use `isFetching` (or a store projection of it), and make the trigger a signal
so the effect actually re-runs. If the two flags are ever tempted back into one name, remember the
skeleton gate and the in-flight state are different questions: `isLoading` answers "has this ever
loaded?", `isFetching` answers "is a request on the wire right now?".

### [2026-09-30] home/store: the authenticated vote overlay read must be the SAME READ as the feed it mirrors — window included

**Problem**: `loadVoteOverlay()` re-reads the feed to fill the id-keyed vote overlay, because
`graphqlResource()` sends no auth token so the rendered `userVote` is always `0`. Its today read
omitted `currentServiceDayOnly: true`: it asked for the newest 8 rows OVERALL while the page
renders the newest 8 rows WITHIN THE CURRENT SERVICE DAY. Once the newest rows overall are all older
than the service-day cut, the read set and the rendered set diverge and a rendered id has no
overlay entry. `LinkThreadComponent.voteFor` then answers `link.userVote ?? 0` — the anonymous
zero — so a rider's own upvote renders un-pressed, with no error and no failed request anywhere.
**Root Cause**: The overlay read was written as a _separate_ query instead of a copy of the
resource's, and a copy of the resource is the only thing that keeps the two in step. An earlier
pass fixed the read's SHAPE (it collapses, and the loop walks `threadLinks`) but left the WINDOW
different, and each half looks like a self-contained decision in isolation. Nothing type-checks the
agreement: `FeedQueryVars` is a bag of optional flags, so omitting one compiles and passes every
existing test.
**Fix**: `currentServiceDayOnly: true` added to the today overlay read; the last-week overlay read
was verified (not assumed) to already match `lastWeekResource` on `lastWeekOnly`, `alignPageToDay`
and the same `first`. The invariant is now written on `loadVoteOverlay()`: same query, same
variables (window, collapse, page size), auth header the only addition, and the loop walks
`threadLinks` as well as the roots. `home.store.spec.ts` captures both resource requests' variable
objects and compares them structurally to the two overlay reads' variables, so any added or removed
key is red.
**Prevention**: When a read exists only to fill a cache/overlay keyed by what another read RENDERS,
copy the rendered read's variables verbatim instead of assembling them from the arguments at hand.
Assert the equality structurally (`expect(overlayVars).toEqual(resourceVars)`) rather than
restating the expected object — restating it is what let the window drift. Remember the asymmetry
that makes it safe: a _wider_ read is harmless (an extra id costs nothing), a _different_ read is
not. The other half of this trap — the overlay read's **shape** — is a separate failure with its own
entry below (`collapseThreads` goes on **all six** home reads); the two are independent, and
matching the window does not fix a shape mismatch or vice versa.

### [2026-09-30] docs: a parallel docs task can assert the opposite of a component fix that lands mid-wave

**Problem**: A docs task and a component task ran concurrently on the `app-link-thread` wrapper. The
docs task read the component before the component's `threadLabel` fix landed, concluded the wrapper
did not use the shared pluralisation helper, and rewrote four documentation sites to say so. The
component fix then landed, so the docs described a duplication that no longer existed — and did it
in the worst possible register: as deliberate design, with reasoning ("each site keeps counting
what it is about") that would have convinced the next agent to preserve the bug. A stale docstring
(`threadLabel`'s own "the console chip and the card badge must not…") went the other way, still
denying a consumer that existed.
**Root Cause**: A docs task reasons about code it read at a point in time and writes the conclusion
down in the imperative register ("X is deliberately not Y"), which is indistinguishable from an
architectural decision and gets defended rather than re-checked. Nothing in the pipeline compares
prose claims against the code they describe, and the render is unaffected either way, so a doc-only
change passes every gate while being wrong.
**Fix**: Restored the true claim at all four sites and the docstring, keeping the part of the wrong
version that was right — the two kinds of caller differ in their GATE (a table row must be able to
render `""`; the wrapper's minimum is 2), not in the string — and stated the invariant each site now
protects so the next surface cannot silently re-fork the count. Where a docstring enumerates its
consumers, the list now says to re-derive it from the code instead of extending it from memory.
**Prevention**: Do not run a docs task concurrently with a task that changes the code the docs
describe — sequence them, or re-read the file immediately before writing. When a doc states that
something is deliberately NOT shared or NOT reused, treat that as a claim to verify against the
source before repeating it: a duplicated `${n} links` template is a defect, never a design. Cheapest
guard: `grep -rn "<helperName>" src` and count the call sites yourself.

### [2026-09-30] repo/ts: a backtick inside a comment inside a template literal breaks the whole program

**Problem**: A markdown backtick placed inside an `<!-- … -->` comment inside a component's
`template:` string literal terminated the literal. The failure is catastrophic and badly
misattributed: `npx prettier --check .` reported a `SyntaxError: ',' expected` at a column _inside
the comment_, and vitest failed **repo-wide** with a parse error pointing at an unrelated spec file —
a parallel task running at the same time concluded "someone else broke the build". The same bug class
recurred the same day in a GraphQL document string: a `#` comment inside `INSIDEN_INCIDENTS_QUERY`
(`src/app/features/insiden/data/insiden.queries.ts`) wrote "submission time (`created`)" and "the
display path is `occurredAt ?? created`", which ended the template literal mid-query.
**Root Cause**: A backtick is the terminator of a template literal _wherever_ it appears — it is not
a comment delimiter, and neither an HTML comment nor a GraphQL `#` comment escapes it. The literal
simply ended, and the following identifier became a syntax error. The reported file and column are
where the parser gave up, not where the mistake is.
**Fix**: Use single/double quotes inside any comment that lives inside a template literal (component
`template:` strings, `styles:`, and every hand-written GraphQL document in `*.queries.ts`).
**Prevention**: Never put a backtick inside a comment that lives inside a template literal. When a
repo-wide parse error names a file you have not touched, look at the files whose mtime changed most
recently **first** — the named file is a symptom. Cheap guard: run `npx prettier --check .`
immediately after adding a comment to a template literal or a GraphQL document; it catches this in
seconds, and a full suite run tells you nothing more.

### [2026-09-30] insiden/link-thread: `isThreadRoot` is `threadId == null`, which is ALSO true for every unthreaded link

**Problem**: Gating the thread affordance on the backend's `isThreadRoot` boolean sprouts a
"N links" badge on **every single row in the app** — every ordinary unthreaded link is a degenerate
one-member thread and therefore already a "root".
**Root Cause**: The backend defines a root as `thread == null`, so the flag is a _structural_
property ("this row is not a member of anything"), not a _feature_ property ("this link has a
thread"). Its default and its interesting case are the same value, so it cannot be used as a feature
predicate.
**Fix**: `app-link-thread` gates the affordance on `threadLinks.length > 0` — the list actually
revealed. `threadSize` alone is not enough either (a host may select the count without the members),
and `link-thread-selection.util.ts::threadLabel` returns `""` for a size `<= 1` for the same reason.
**Prevention**: When a backend boolean is a _structural_ flag, check whether it can also be the
null/default state of an unrelated case before trusting it as a feature predicate. Ask "what does this
return for the most common row in the app?" — if the answer is `true`, it is not a gate.

### [2026-09-30] console/insiden: the queue's date args were renamed `createdAfter`/`createdBefore` → `occurredAfter`/`occurredBefore`, with NO alias

**Problem**: A compatibility alias was considered and deliberately rejected: the queue now orders
`-occurredAt, -id`, so an alias would have kept the date filter answering "was this _reported_ in
this range?" while the rows above it answer "did this _happen_ in this range" — a filter that looks
like it works and is quietly wrong for every back-dated report.
**Root Cause**: Nothing — this is a scope decision, recorded so it is not later "helpfully" reversed.
The reasoning generalises to any renamed filter arg here: a stale client should fail loudly, not
filter the wrong column.
**Fix**: `SocialMediaLinksQueryVars` and the console document use only the new names
(`insiden-console.queries.ts`; `links.component.ts::fetchLinks`), and the filter is relabelled
"Occurred between" so the UI stops describing a window the server does not apply. A stale
`createdAfter` fails GraphQL validation ("Unknown argument") — the intended, loud failure mode.
**Prevention**: Do not reintroduce the old argument names as a compatibility shim. If a
temporarily-broken client is ever genuinely required, prefer a versioned endpoint or an explicit
deprecation window over a silent alias on a filter whose sort column is also changing.

### [2026-09-30] home: `collapseThreads` goes on ALL SIX home reads — the vote overlay included

**Problem**: Two halves of one rule, and getting either backwards breaks the feed silently, with no
error and no failed request. (a) A collapsed page 1 followed by an **uncollapsed** page 2 re-lists
every root AND renders the members as loose rows. (b) The other half is the trap this entry got wrong
the first time: the **authenticated vote-overlay** read must collapse too, because the overlay is
id-keyed and `loadVoteOverlay()`'s loop walks `root.threadLinks` as well as `edges`. An earlier
version of this entry argued the opposite — "send it on the list reads, not on the overlay" — on the
reasoning that a collapsed read hides the member votes. It does not; the walk finds them.
**Root Cause**: `collapseThreads` changes the _shape_ of the connection, not just its content, and the
old entry reasoned about which shape an id-keyed consumer "wants" instead of which shape it actually
reads. The invariant is not "the overlay prefers flat rows"; it is **the overlay's id set must equal
the RENDERED id set**, and the render is roots-with-members-nested. An uncollapsed read returns the
`first` newest FLAT rows (`r1, m1, r2, m2, …`) — a top-N window over rows the collapsed render never
shows, which drops exactly the members a rider voted on and adds roots that are not rendered. So the
flattening "fix" lost the ids it was meant to recover. Client-side grouping of a flat page is unsound
in the first place — under `-occurredAt, -id` a thread's members are not adjacent (an admin can group a
09:00 post with an 11:00 one, possibly onto different pages) — so collapsing has to be the backend's
decision, and the consumer's job is to walk the shape it asked for.
**Fix**: `home.store.ts` folds `HOME_FEED_COLLAPSE_VARS = { collapseThreads: true }` into **all six**
home reads — `feedResource`, `lastWeekResource`, `loadMore()`, `loadMoreLastWeek()` and both
authenticated reads inside `loadVoteOverlay()` — and the overlay's loop iterates
`root.threadLinks ?? []` as well as `edges`. `home.store.spec.ts` pins both halves ("the overlay reads
MUST collapse"; the same-variables comparison). Every other surface (`/insiden`, situasi,
per-incident cards, My Links) omits the key entirely, which is how it says "use the schema default
(`false`)" — an explicit `null` is fatal on a `Boolean!` argument.
**Prevention**: For any new read of a connection whose arguments can change its SHAPE, enumerate
**every** read of that connection — first page, every continuation, and every auxiliary read (overlays,
exports, counts) — and answer two questions per read: (1) does it need the flag, and (2) does its key
set match the set that surface **renders**? The test is the rendered set, not the read set and not the
consumer's convenience: a read is wrong whenever an id the page draws can be missing from it, and
absent ids are indistinguishable from a genuine zero on the card. (2) is the trap that bit the overlay
again for the window axis; that half has its own entry above — do not answer a shape mismatch by
changing the window, or a window mismatch by uncollapsing. Mind the neighbouring null-semantics
split: `collapseThreads: Boolean!` rejects `null`, while `groupSocialMediaLinks(threadId: ID = null)`
treats `null` as "start a new thread"; the two Vars types (`boolean | undefined` vs
`string | null | undefined`) exist precisely to keep the fatal spellings unrepresentable.

### [2026-09-30] insiden/link-thread: `GenericMutationReturn.id` is an `Int`, not an `ID`

**Problem**: `groupSocialMediaLinks` returns the new thread root's `id` as a GraphQL **`Int`**
(`common.schema.scalars.GenericMutationReturn.id: int | None`) while every other id on
`SocialMediaLinkScalar` is an `ID` (a string). `String(result.id)` happens to round-trip fine, so the
mismatch is invisible until the value is fed back into an `ID`-typed field (a `linkIds` array, a
cursor, a `threadId` argument).
**Root Cause**: `strict` and `strictNullChecks` are **OFF** in this repo, so the compiler will happily
accept a number where a string is declared, and a string where a number is declared.
**Fix**: `GroupSocialMediaLinksData.id` is typed `number | null` with the reason inline, and both
call sites (the console triage table and "My Submitted Links") deliberately **do not use** the
returned value — they reload the flat list, because `threadId`/`threadSize` are server-computed and
nothing on the page can patch them.
**Prevention**: When reading a mutation's return payload, check the **backend scalar's** GraphQL
type, not the feature's own convention. Any id-typed value in this app is a string unless a shared
`GenericMutationReturn`-style scalar says otherwise.

### [2026-09-30] insiden/link-occurred-at: a naive wall-time datetime must never round-trip through `toISOString()`

**Problem**: A link's `occurredAt` is naive local wall time, so `new Date(iso).toISOString()` — or
`.getTime()` arithmetic, or `Date.parse` plus a UTC formatter — shifts it by **8 hours**
(`Asia/Kuala_Lumpur` is UTC+8, no DST). The console's date-RANGE filter legitimately uses
`.toISOString()` on the very same column, which is what makes the rule confusing rather than obvious.
**Root Cause**: The backend runs `USE_TZ = False` with `TIME_ZONE = Asia/Kuala_Lumpur`, so every
`DateTimeField` is a naive local value and Strawberry serialises it with **no offset** (often with
microseconds). The two `.toISOString()` calls differ in what they are _given_: the range filter
starts from an aware `new Date("<date>T00:00:00")` the browser resolved in the viewer's zone and the
server converts back; the link form has only a wall-time string to preserve.
**Fix**: `features/insiden/data/link-occurred-at.util.ts` formats **by hand**. `isoToOccurredAtInput`
parses with `new Date(iso)` and reads the **local** getters (an offset-free ISO parses as local time,
so the wall time passes through unchanged; a genuine offset is real information and is rendered in
the viewer's zone), and `occurredAtInputToIso` emits the typed wall time verbatim, normalised to
`YYYY-MM-DDTHH:mm:ss` with no offset and no `Z`. `console/insiden/data/date-range.util.ts` carries
the contrasting note for its own `.toISOString()`.
**Prevention**: The rule is **not** "never use `toISOString`" — it is "never use it on a naive
wall-time field". Before reformatting a backend timestamp, ask whether the string carries an offset.
If it does not, `Date` is only for _reading_ the viewer's own clock, never for writing an instant;
preserve the string.

### [2026-09-26] incident/schema: `SocialMediaLinkInput` is not a patch — a status-only update blanks the row

**Problem**: The console links queue's **Approve** needs to flip a row to `LIVE` and nothing else, but sending `{ status: "LIVE" }` is destructive — it blanks the title and strips every category, line, vehicle and station tag.
**Root Cause**: `update_social_media_link` assigns `title = write.title or ""` and `.set()`s the four id lists to whatever arrives (empty when omitted), so only `status`/`description`/`incidentId` are genuinely `strawberry.Maybe` omit-means-unchanged; the `?:` type mirror made the rest look like patches.
**Fix**: `approveLink()` re-sends the row's current `url`, `title` and all four id lists next to `status: "LIVE"`, the `UpdateSocialMediaLinkVars.input` doc comment states the full-replace semantics, and a spec pins the full approve payload.
**Prevention**: Before sending a partial update through any `*Input`, read the **service** — not just the GraphQL input — to see which fields it assigns unconditionally or `.set()`s; only fields the service treats as optional are omit-means-unchanged. Same trap applies to `CalendarIncidentInput`'s chronology/asset lists.
**Sharpened 2026-09-30 (`occurredAt`):** the same trap with a _destructive third state_. `SocialMediaLinkInput.occurredAt` is `Maybe[datetime | None]`, so it has THREE outcomes: key omitted → untouched; a datetime → set; explicit `null` → **reset the row to `link.created`**. Any editor that round-trips the row must therefore re-send it **verbatim** — one `?? null` in `linkStatusInput` (the shared builder behind the console's Approve/Hide verbs) would have made every click rewrite the row's event time, and re-sorted the public feed with it, because every ordering keys on `occurredAt`. The rule generalises: for a tri-state input, "absent" is never a safe substitute for "unknown", and the editor that owns a visible control must send the key even when the control is empty.

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
