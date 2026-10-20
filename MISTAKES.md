# Known Defects & Traps — rosak_firebase

> Catalog of known defects, traps, and cross-component gaps so future agents don't repeat them.
> Entries are newest-first by heading date: `## [YYYY-MM-DD] Component: Title` with **Problem**,
> **Root Cause**, **Fix** (commit ref where there is one), **Prevention**. Entries sharing a root
> cause are merged (heading date = earliest; later recurrences are noted inline). Fully historical
> fixes are one-liners under `## Fixed`; per-feature "missing shared utility" findings are under
> `## Cross-Component Opportunities` (mirrors `docs/COMPONENTS.md` § Cross-Component Feature
> Opportunities). Last squashed 2026-10-21 (previous: 2026-09-28, `e3f16cd`); earlier detail:
> `git log -p -- MISTAKES.md`.

---

## [2026-10-20] spotting: Most Recently Spotted ties broken arbitrarily

**Problem**: The "Most Recently Spotted" card on the line overview showed vehicle 110 on MRT Kajang Line though vehicle 151 was spotted later. Seven vehicles tied on 2026-10-18 and the card kept whichever came first in the list.
**Root Cause**: `Vehicle.lastSpottingDate` is date-only (`Event.spotting_date` is a `DateField`), so same-day sightings are indistinguishable. The comparator `a > b ? -1 : 1` never returned `0`, so ties fell to list position.
**Fix**: `9d853b0`. The sort uses `lastSpottingDate`, then the new `lastSpottedAt` (backend `Vehicle.lastSpottedAt`, queried as `VehicleRow.lastSpottedAt`); the comparator returns `0` only when both keys are equal. Covered by `line-status-board.component.spec.ts`.
**Prevention**: A sort comparator must return `0` on ties, not `±1`. When the display key is date-only, add a finer secondary key such as a timestamp, and test with several rows sharing the primary key.

## [2026-10-20] about/editor: a nested `@for` reuses the INNER `$index`, so an edit lands on the wrong person

**Problem**: In the admin editor, editing or removing one person's social changed a different person's social, or was lost. The nested socials `@for` passed its own `$index` (the social's position) to `updateSocial` / `removeSocial` as the person index.
**Root Cause**: Inside the inner `@for`, `$index` is the nearest loop's index; the outer personnel index was never captured. Invisible for the first person (both are `0`).
**Fix**: `8269470`. The outer loop aliases `let personIndex = $index`; social handlers take `personIndex` plus the social's own index. Two specs (a second person's social edited and removed) failed before the fix.
**Prevention**: When a nested `@for` body needs the outer index, alias it on the outer loop (`let personIndex = $index`). Test an item that is not first; index `0` hides a swapped index.

## [2026-10-20] about: legacy Firestore rows broke the admin save, and a stale comment named the wrong sort order

**Problem**: Two save bugs on legacy `public/about` rows. A personnel social without `name` made `sanitizeDraft` throw on `.trim()` of undefined (a "Save failed" toast). A personnel row without `display` was hidden on the public page, but the first admin save made it visible. Separately, the `filterAndSortProjects` comment said newest-first while code and spec sorted oldest-first.
**Root Cause**: `draftFromDoc` copied legacy rows without defaulting fields the editor now requires. `sanitizeDraft` defaulted a missing `display` to `true`, the opposite of the public read (hidden). The comment was not updated when the sort changed.
**Fix**: `e8075ac`. `draftFromDoc` defaults `name` and social `name`/`link` and keeps a missing `display` as hidden; the stale sort comment and a dangling comment reference in `about.page.ts` are corrected.
**Prevention**: Normalize legacy rows once, in `draftFromDoc`; the save path trusts the draft. A default must match the public read's default. When a comment states an order, check it against the comparator and spec whenever you touch that code.

## [2026-10-19] home/SSR: staging `/` cold start takes ~17s TTFB — partly fixed, still open

**Problem**: The first staging response after an idle period takes ~17s to first byte; server-timing shows ~7s in the SSR render. The staging response had no `content-encoding` and no `cache-control` before the change.
**Root Cause**: Not fully confirmed. Observed: `apphosting.yaml` ran `runConfig.concurrency: 80` with `minInstances: 0`, so one instance queued requests behind a slow render and cold starts paid the whole boot.
**Fix**: _Partial._ `concurrency` 80→20 in `apphosting.yaml`; `src/server-cache-control.ts` sets `public, s-maxage=20, stale-while-revalidate=60` on `GET /` 200 responses only (wired in `src/server.ts`). `minInstances` is still 0, so cold starts remain.
**Prevention**: Read server-timing per phase before changing concurrency. Keep the cache header on `GET /` only so authenticated and other routes never inherit it. Treat `minInstances` as a cost trade-off, not a code change.

## [2026-10-08] app-nav: `router.url.split("/")[1]` keeps the query string

**Problem**: The collapsed module-menu trigger showed "Menu" instead of "Home" on `/?view=pro` (and on any route opened with a query, e.g. `?sort=name`).
**Root Cause**: `AppNavComponent` took the active segment from `router.url.split("/")[1]`, which returns `"?view=pro"` on `/?view=pro`; `moduleLabelFor` matches no `NAV_LINKS` path and falls through to the generic "Menu".
**Fix**: Pure `routeSegmentOf(url)` in `app-nav.util.ts` strips query and fragment first (`url.split(/[?#]/)[0].split("/")[1] ?? ""`) and feeds both the `toSignal` `initialValue` and its `NavigationEnd` projection. Pinned in `app-nav.util.spec.ts`.
**Prevention**: Never take a route segment straight off `router.url`; use `routeSegmentOf()` (or `router.parseUrl` / `route.firstChild.snapshot.paramMap`). When a label silently becomes the generic fallback, suspect a segment that never matched, not a missing nav link.

## [2026-10-08] app-nav-icon-tray: NG0911 on teardown during auth init

**Problem**: Navigating away before Firebase auth finished initialising threw `RuntimeError: NG0911: View has already been destroyed.` from `app-nav-icon-tray.component.ts`'s `this.destroyRef.onDestroy(...)` (Sentry-captured; reachable on slow auth, e.g. mobile).
**Root Cause**: `<app-nav>` and the tray are recreated on every top-level navigation while `auth.whenReady` resolves asynchronously. If the user left first, the view was already destroyed when the `whenReady.then` callback ran, and `DestroyRef.onDestroy` on a destroyed view throws.
**Fix**: The `whenReady.then` early return also checks `this.destroyRef.destroyed` (`if (hasShownAvatarHintThisPageLoad || this.destroyRef.destroyed) return;`). The module-level one-shot flag is deliberately NOT consumed (a destroyed tray never showed the hint), so the next page's tray may show it once. Pinned by `app-nav-icon-tray.component.spec.ts` (red: NG0911 unhandled rejection + the 2500ms hint timer armed).
**Prevention**: Any async callback that registers `DestroyRef.onDestroy` after an `await`/`.then` must check `destroyRef.destroyed` first. Guard before consuming one-shot module/global state so a cancelled run does not burn the "already shown" flag.

## [2026-10-07] features/home: wrapping a control in an `InfoPopover` / `StatusInfoChip` host relocates it in the DOM — re-scope ancestor queries

**Problem**: Wrapping `line-card-pin` / `line-row-pin` in `app-info-popover`, and `line-row-vehicles` in `app-status-info-chip`, inserted a host element between each node and its former parent. Specs asserting the action cluster via `pin.parentElement`, or counting `[data-testid]` under that parent, hit the wrong node; and `root.querySelector('[data-testid="line-row-meta"] app-info-popover')` (written when the report tally was the strip's only popover) silently matched the vehicle chip's host instead.
**Root Cause**: Both wrappers project (or stamp via `triggerTpl`) content inside a component host (`<app-info-popover>` is `relative inline-flex`) and inject their own trigger markup (a `<button>` in default/projected mode and for the chip; an `inline-flex` `<span>` in the pin's `triggerTpl` mode). A wrapped element's `parentElement` / `closest(...)` graph changes, and ancestor-scoped queries can match the wrapper's host instead of the consumer's element.
**Fix**: Specs re-scoped in `line-pulse-card.component.spec.ts` and `line-pulse-row.component.spec.ts`: cluster order/parent checks use `pin.closest("app-info-popover")`; the report popover is reached from `line-row-reports`' own `closest("app-info-popover")`. No template or logic change; runtime behavior was always correct.
**Prevention**: Before wrapping a `data-testid` element in a host component, grep specs for that testid's `.parentElement`, `closest(...)` and ancestor-scoped `querySelector`. Query from the target's own `closest(...)` chain, not a shared ancestor, and assert "no popover here" against the specific element, not the whole strip.

## [2026-10-07] ui/info-popover: `ng-content` inside an `ng-template` stamped by `ngTemplateOutlet` renders EMPTY under `ngSkipHydration`, and the unit suite stays green

**Problem**: The intermediate `bareTrigger` implementation (an `ng-template` wrapping `<ng-content/>`, stamped by `ngTemplateOutlet`) passed the whole unit suite, including bare-mode specs, but the live DOM showed `<span class="inline-flex"></span>` with zero pins, on both hydration re-render and client navigation. Server HTML was correct and default-branch projections rendered fine.
**Root Cause**: Projection inside an embedded view stamped under an `ngSkipHydration` component is unreliable at runtime: it re-renders without materialising the projected nodes. Unit tests and SSR never exercise that path.
**Fix**: Replaced with the `triggerTpl` input, a plain `ngTemplateOutlet` stamping consumer markup with no projection (one raw `ng-content` remains only in the default button branch).
**Prevention**: For an opt-in alternate trigger shape, pass a `TemplateRef` input rather than moving `ng-content` into an `ng-template`. Confirm any `InfoPopover` structural change against the running dev server; unit tests did not catch this.

## [2026-10-07] ui/info-popover: a panel on a right-edge trigger overflowed the viewport, invisibly

**Problem**: A left-anchored (`align="start"`) panel opened from a trigger near the right of a full-width surface (compact board rows' pins and status chips, Pro header chips) extended past the viewport's right edge. `html, body` carry `overflow-x: clip`, so the overhang was silently cut and the reader saw a panel missing its right-hand words. Different from the 2026-10-05 entry (an ancestor's `overflow-hidden` cutting a descendant): here the viewport edge cuts a panel that legitimately lives outside it, and no ancestor fix can reach it.
**Root Cause**: `InfoPopover` positioned its panel with a static anchor only (`left-0`, `right-0`, or `left-1/2 -translate-x-1/2` from `align`) and never measured the viewport. `min-w-56` (224px) made it worst where wide chips sit nearest the edge; `max-w-[calc(100vw-2rem)]` caps size, never position.
**Fix**: The panel is measured once per open (a `viewChild` panel + browser-only `effect`, no scroll/resize listeners) and nudged back inside an 8px margin. `_shiftStyles()` writes the correction as a margin on the side the alignment owns (`margin-right` for `align="end"`, else `margin-left`) so it composes with `-translate-x-1/2`; both edges are clamped together. When the panel would overhang the bottom and a flipped copy fits above, `_flipAbove()` renders `bottom-full mb-1.5` instead of `top-full mt-1.5`. The effect deliberately does not read `_shiftPx` / `_flipAbove` back (it would re-measure the corrected rect, compute zero and ping-pong).
**Prevention**: The clamp lives in `InfoPopover`, so every consumer gets it; do not hand-roll per-feature positioning. jsdom has no layout; the regression net is e2e `VISITOR: clamps a right-edge popover into the viewport` (`e2e/home.spec.ts`): assert the clamp-relevance predicate first (the trigger is close enough that an unclamped panel would overflow), then that the opened panel's box is inside. Without the predicate a green test may measure a trigger that never needed the clamp.

## [2026-10-07] Angular templates: `[class.mt-1.5]` silently binds class "mt-1"; `[style]` map keys ignore a ".px" suffix

**Problem**: Two binding spellings compile, type-check and render but apply the wrong thing, with no error: (1) `[class.mt-1.5]="x"` produced class `mt-1` (fractional part dropped); (2) a style-map key `"margin-left.px"` left the `style` attribute `null`.
**Root Cause**: Angular's class-binding name grammar stops at the first dot, so `[class.mt-1.5]` is class `mt-1`. Map-form `[style]` keys are CSS property names verbatim, with no unit inference, so `"margin-left.px"` names no property; only the single-property `[style.margin-left.px]="n"` form honours the suffix as the unit.
**Fix**: The panel's classes are one computed `[class]` string (`_panelClasses()` = align classes + `top-full mt-1.5` / `bottom-full mb-1.5`), where `mt-1.5` survives as a value token; the correction is a style map with the unit in the value, `{ "margin-left": "-184px" }`.
**Prevention**: Never put a fractional or unit suffix in a binding name; compute one `[class]` / `[style]` string in TS for spacing/geometry that must survive verbatim, with units in style-map values. Both fail silently, so a unit test must read the rendered `classList` / `style` attribute, not the component's inputs (`info-popover.spec.ts` does).

## [2026-10-06] spotting: the month label's right-edge clamp had no month floor, so it pinned and was clipped instead of pushed away

**Problem**: In the line-details vehicle-spotting grid header, the sticky month label was asymmetric while scrolling horizontally. At the left boundary it pinned, then was pushed away by the month's trailing edge (correct). At the right boundary (entering from the right while scrolling forward, or exiting back through it) it pinned to the viewport edge and was progressively clipped by its own `<th>`; entering from the right was revealed rather than sliding in.
**Root Cause**: `VehicleSpottingGridComponent.monthLabelShift` hand-rolls `position: sticky; left; right` (the header table is translated, not scrolled). The lower clamp was month-bounded (`Math.max(monthStartPx, viewLeft)`) but the upper (`Math.min(monthEndPx, viewRight) - labelSpace`) was not; within one label-width of the month's leading edge the final `Math.min` won, placing the label left of its own month box, where `<th class="overflow-hidden">` ate it.
**Fix**: Floor the upper clamp at `monthStartPx` (`Math.max(min(monthEndPx, viewRight) - labelSpace, monthStartPx)`) so both clamps are month-bounded. Geometry specs pin both directions, both viewport pins, centered rest and a full-range sweep.
**Prevention**: When one clamp is bounded by a containing box, bound the opposite clamp by the same box's other edge: an over-constrained `min(max(...))` silently prefers the last clamp applied, so a missing floor shows as "pinned then clipped", not an error. If anything clips the element (`overflow-hidden`), assert the box invariant across the whole input range, not two example scroll positions.

## [2026-10-05] ui/info-popover: a panel is clipped by an ancestor's `overflow-hidden` AND painted under the chrome by a stale z-index — two independent bugs

**Problem**: Every `InfoPopover` on `/` (hero headline, stat tiles, sparkline caption, row history strip, heat grid, card status chips) opened cut off at its card's edge, and the refresh control's tooltip painted under the sticky nav. Neither is a bug in the popover's own markup.
**Root Cause**: (1) Clipping: the panel is `position: absolute`, a child of whatever projects the trigger; the hero card, `LinePulseCardComponent` and `LinePulseRowComponent` carried `overflow-hidden` (for rounded corners), a hard clip on an absolutely-positioned descendant. No `z-index` fixes it, and the panel's own spec cannot see a parent's clip. (2) Stacking: the panel was `z-20` while `app-nav.component.ts` puts the nav at `z-[45]` and the home sticky mobile action bar at `z-30`; the nav's own comment already documented the ladder (`z-[45]` below the overlay layer `z-50`).
**Fix**: (1) Removed `overflow-hidden` from the three containers and compensated the decoration: hero countdown track `rounded-t-2xl`, colour ribbon `rounded-b-2xl` (each keeps its own `overflow-hidden`, which clips only its own fill), line cards' leading colour rails `rounded-l-xl` / `rounded-l-lg`. (2) Panel `z-20` → `z-50`; refresh control's tooltip `z-10` → `z-50`. `pro-report-ranking`'s progress track and the lanes' `overflow-x-auto` still clip on purpose (no popover inside).
**Prevention**: Before adding `overflow-hidden` to a container, ask whether anything inside is absolutely positioned for a reason (popover, dropdown, menu, tooltip); if so drop the clip or move the panel out (`<dialog>`, portal, body-level host). Never trade a clipped tooltip for rounded corners: give the decorative child its own `rounded-*`. z ladder: mobile bar `z-30` < nav `z-[45]` < overlay `z-50`; anything that must float above page chrome (every popover panel, every sheet) belongs at `z-50`, pinned by a spec asserting the class. Neither failure is assertable from the component under test and jsdom has no layout: read a clipped panel as "shorter than its text should need", not a z-index failure, and do a browser pass.

## [2026-10-05] core/styles: component `@keyframes` are RENAMED by emulated encapsulation — a class-referenced animation must be a global `@theme` token

**Problem**: The home refresh control's "Updating" spinner gained a 500ms draw-in entrance and rendered as a finished circle from the first frame. The spec was green, class strings correct, build clean; in the browser `animation-name` resolved to a name no `@keyframes` rule exists for, so strokes sat at the default `stroke-dashoffset: 0`.
**Root Cause**: Angular's emulated view encapsulation rewrites `@keyframes` declared in a component's `styles`: `@keyframes home-refresh-spinner-draw-ring` became `@keyframes _ngcontent-ng-cXXXX_home-refresh-spinner-draw-ring`, while the Tailwind utility (arbitrary `[animation:…]` or generated `animate-*`) emits `animation-name: home-refresh-spinner-draw-ring` from the global sheet. An unmatched `animation-name` is not an error in any tool. Only a name referenced inside the same component's `styles` string survives.
**Fix**: Global `@theme` tokens in `src/styles.css`: `--animate-spinner-draw-ring: spinner-draw-ring 500ms ease-out both` and `--animate-spinner-draw-arc`, each with its `@keyframes` nested in the same `@theme` block, applied as `animate-spinner-draw-ring` / `animate-spinner-draw-arc` (same pattern as `--animate-icon-glow`, `--animate-breathe`, `--animate-nav-reveal`, `--animate-wordmark-wipe`, `--animate-nav-progress-sweep`, `--animate-tick-up`). The component's `styles` went back to `[":host { display: inline-block; }"]`.
**Prevention**: Any `@keyframes` referenced by a class (arbitrary `[animation:…]` or `animate-*`) must be declared in the global `@theme` in `src/styles.css` with its `--animate-<name>` token, never in a component's `styles`. jsdom computes no styles, so a spec can only assert the class name, which was correct while the animation silently was not: verify a new keyframe animation by reading the computed `animation-name` in a real browser, or by grepping the built CSS for the un-prefixed name.

## [2026-10-03] core/preferences: a storage-backed signal service has TWO races with hydration — one throws NG0500, the other silently destroys the stored state

**Problem**: `PreferencesService` copied the `ThemeService` shape (signals + a `localStorage` read in the constructor). In an SSR app that fails two ways: (1) the client's first paint already had the rider's pinned lines while the server HTML could not, so hydration threw `NG0500` for any rider who had ever pinned something (never for a fresh rider); (2) the persist `effect` ran before the read landed and wrote the empty defaults over the stored payload, silently.
**Root Cause**: The constructor read is synchronous and unconditional, so it runs on the server; an `effect`'s first run is initial scheduling, not a "change", so gating on a signal change does not stop it. `ThemeService` reads storage in its constructor too and has the same exposure, but its stored value is one enum, so a mismatch is a wrong theme for one frame rather than a throw.
**Fix**: The service constructs on the defaults and hydrates in `afterNextRender` (never runs on the server); the persist effect is gated on a private `_hydrated()` flag set at the end of that pass. Stored fields are validated independently (corrupt JSON, non-object payload, unknown enum, wrong-typed id each fall back alone), since a half-recognisable payload is the common case after a shape change.
**Prevention**: In an SSR app treat a service constructor as server-capable and the first effect run as pre-hydration: read in `afterNextRender` / `afterRenderEffect` and gate every write on "have I read yet". Spec it with `{ provide: PLATFORM_ID, useValue: "server" }` plus `vi.spyOn(Storage.prototype, "getItem"/"setItem")` asserting NEITHER is called; a jsdom TestBed runs as a browser and catches neither failure. Same family: a reactive `router.navigate()` during SSR hangs the render, so guard that call site with the browser check too.

## [2026-10-03] ui/sheet: a sheet that OPENS another sheet must be MOUNTED FIRST, or the page scrolls behind it

**Problem**: The home report chooser opens the line-status / spotting / link / incident sheets, so two `HlmSheet`s change `open()` in one tick. After choosing a line the line-status sheet appeared but the page behind still scrolled: the modal lock was already gone.
**Root Cause**: `HlmSheet` locks scroll from an `effect` keyed on its own `open()`, writing `document.body.style.overflow` / `documentElement.style.overflow`. Angular flushes effects in creation order, not signal-write order, and both signals are written in one click handler. So the unlock (chooser closing) must belong to the component created before the one that locks; mounted after it, the lock runs first and the unlock second.
**Fix**: `<app-report-chooser />` is the first sheet in `home.page.ts`'s template, with the invariant in the template comment and the chooser's class doc; `home.page.spec.ts` ("hosts the report chooser BEFORE every other sheet") asserts the markup order.
**Prevention**: Two components sharing one global side effect driven by a signal need an explicit order pinned by a spec; it is invisible in a one-sheet unit test and jsdom never asserts `document.body.style.overflow`. When adding a sheet to a page that already opens sheets, ask which is created first.

## [2026-10-03] testing: one unflushed HttpTestingController request fails 84 tests in 8 unrelated files

**Problem**: After adding specs for the home report chooser the suite went from 114 files / 1455 tests green to 8 files / 84 failing, including four files the change never touched (`line-pulse-card`, `status-info-chip`, `insiden/link-form`, `spotting/report-form`), most with `Cannot configure the test module when the test module has already been instantiated`.
**Root Cause**: One new spec opened the line-status sheet signed out on a known line, firing its lazy `STATION_LINES_QUERY`; the request was never flushed, so `httpMock.verify()` threw in `afterEach`. A throwing `afterEach` runs before TestBed's reset, leaving the module instantiated, so every later file's `configureTestingModule` refused and the real one-line failure was hidden.
**Fix**: The spec flushes the request (helper `openSheetLoggedOut()` for every logged-out case; the close-then-reopen spec no longer reopens, since reopening re-issues the read).
**Prevention**: `httpMock.verify()` is a cross-file assertion in this runner. Any spec that makes a lazy resource go live (opening a sheet with a known line/id) must flush it, even if irrelevant to its assertions. When a suite fails in files the change did not touch, read the FIRST failure in file order, not the last; a `TestBed.inject()` before `configureTestingModule()` throws the same misleading message.

## [2026-10-03] core/graphql: a `graphqlResource` is NOT lazy until first read — it evaluates its request immediately

**Problem**: The network board's two service-day history reads were added to `HomeStore` behind the documented lazy-resource precedent (`graphqlResource(() => { if (!gate()) return undefined; … })`, "lazy until first read, read it in the constructor"). Both still fired as soon as the lines read landed, in every store instance and every store spec, whether or not a widget that renders them was mounted.
**Root Cause**: `graphqlResource()` installs `effect(() => { raw.isLoading(); rawHasError(); data(); … })` at call time (`core/graphql/graphql-client.ts`), subscribing to the underlying `httpResource` immediately, so the request function is evaluated (and re-evaluated when its signals change) from the call. "Lazy until first read" holds only for a resource whose request function depends on nothing that changes; a `lines()`-style gate still fires when its dependency resolves.
**Fix**: Explicit opt-in from the rendering surface: `HomeStore.requestHistoryReads()`, called from each history widget's constructor. The store holds two gates, the opt-in AND the data it needs (`lines().length > 0`); feed store specs are untouched by the extra queries and Rider view (no heat grid) never asks.
**Prevention**: "Lazy resource" here means gated on a signal the DISPLAY sets, not read by nobody until a projection is read. When adding a store-owned read, decide which component's lifetime owns it and gate on that component's existence; then check whether any store spec that constructs the store must now flush a request it does not care about.

## [2026-10-03] testing: `httpMock.match()` dequeues, so an "is it pending?" probe eats the request

**Problem**: Store specs asserted `expect(httpMock.match(() => true)).toHaveLength(1)` then `expectOne(...)` on the same request, which threw "Expected one matching request … found none"; others failed in `afterEach` with "Expected no open requests".
**Root Cause**: `HttpClientTestingBackend.match()` REMOVES what it matches, exactly like `expectOne`; it is not a read-only probe despite its name.
**Fix**: Specs assert existence with `expectOne` and keep the returned request.
**Prevention**: Use `match()` only to consume everything still open (e.g. a final "nothing is pending" check). When a variables change re-issues a request, capture BOTH resources' requests before flushing either: `expectOne` twice for the same predicate fails on the second call.

## [2026-10-03] ui/theme: LIGHT `--brand` fails WCAG AA as text and as a fill — open (design decision)

**Problem**: The Phase-5B contrast audit was clean on every dark surface (`--brand` on card 7.56:1, `--brand-foreground` on brand 8.23:1, post-submit highlight ring 8.48:1, feed tabs 6.98:1), but on the light theme `--brand: #ee7104` (`oklch(0.68 0.17 46)`) on `--card` (`oklch(1 0 0)`) is 3.0:1. It is used as `text-brand` (hero "Live map" CTA, row "Open original" link: 2.66:1 at mobile text size) and as a fill behind white `--primary-foreground` text ("Report status", "Refresh", brand chips, `app-info-popover` triggers: 3.0:1). AA needs 4.5:1 for normal text, 3:1 for large text (>= 24px, or >= 18.66px bold).
**Root Cause**: The accent was picked for hue and never measured; lightness 0.68 reads as a large accent but has no headroom for body text or white-on-fill. Dark theme swaps `--brand` for a lighter orange (`#f79331`, 0.77), the correct move on a dark surface.
**Fix**: _Not fixed._ Darkening `--brand` for light mode changes every brand surface app-wide (buttons, chips, links, console): a design call, not Phase-5B polish. Recorded so nobody re-runs the audit believing it passed. Still open 2026-10-21 (`src/styles.css` light `--brand: #ee7104`).
**Prevention**: When an accent becomes a text colour or button fill, measure contrast per theme and per role. Prefer a two-token pattern (a text-safe accent for small text, a fill with a dark-enough foreground) over one `--brand` doing all three jobs.

## [2026-10-03] ui/directive: a bare attribute matching a directive input binds the EMPTY STRING — selector and input cannot share a name

**Problem**: The tick-up directive is `selector: "[hlmTickUp]"` with input `hlmTickUp: number`. `<span hlmTickUp [hlmTickUp]="value()">` fails to compile: `Type 'string' is not assignable to type 'number'`. `[hlmTickUp]="value()"` alone works.
**Root Cause**: A bare attribute is static; Angular hands the directive `""`, not a `number`. It is also redundant (the bound `[hlmTickUp]` already satisfies the selector). `HlmButton` never hit this because its `selector: "button[hlmBtn], a[hlmBtn]"` matches an attribute that is not a declared input, so the bare form is inert.
**Fix**: Templates use `[hlmTickUp]="…"` alone.
**Prevention**: When a directive selector and an input share a name, write the binding once (`[x]="v"`), never the bare attribute plus the binding. Numeric/boolean inputs named like their selector are the case that breaks; a selector prefix (`hlmBtn`) keeps the others safe.

## [2026-10-03] ui/shell: the sheet SCRIM does not dim the sticky nav — `z-[45]` nav vs `z-40` backdrop (open; app-wide, not a home-feature bug)

**Problem**: On any sheet (line-status, link, spotting, report chooser) the shared `HlmSheet` backdrop paints `bg-black/50`, but the sticky `AppNav` stays at full brightness above the scrim and paints over its edge. A QA pass on `/` flagged it as a home-feature defect.
**Root Cause**: The ladder is deliberate: `app-nav.component.ts` documents `z-[45]` as above every sticky bar in page content (highest `z-40`) and below the `z-50` overlay layer. The backdrop is a page-level `z-40` scrim outside that layer, so the nav also sits above it. Pre-existing shared-component behaviour, on every sheet and page.
**Fix**: _Not fixed._ A real fix changes layering for every `HlmSheet` consumer app-wide (raise the backdrop above `z-[45]`, or portal the sheet out of the page stacking context). Still open 2026-10-21 (`ui/sheet/sheet.ts` backdrop `z-40`).
**Prevention**: When a QA finding is "something on screen looks wrong", check whether it reproduces outside the feature that surfaced it before editing. Anything reproducing on another page belongs to `ui/` or `shell/` with its own blast radius; grep `app-nav.component.ts` and `ui/sheet/sheet.ts`, not `features/home/`.

## [2026-10-02] build: a Tailwind arbitrary variant starting with `@` cannot compile in an Angular template — and the dev server serves a STALE bundle meanwhile

**Problem**: `[@media(max-height:640px)]:static` on the 404 footer wrapper failed the build with `TS1005: ',' expected` / `TS1135: Argument expression expected` and no line pointing at the class. The dev server did not reload or log an HMR update, so two rounds of browser measurements "verified" a class that was never in the DOM (`document.querySelector(...).className` lacked it, the only real clue).
**Root Cause**: Angular parses the attribute and reads `@media(...)` as a control-flow block (`@if`/`@for`/`@switch`). Escaping it as `&#64;` makes Angular decode an entity, but Tailwind's scanner then sees the entity, not the variant, and emits no rule. No spelling satisfies both tools.
**Fix**: The rule moved to the component's `styles` array; emulated encapsulation's attribute selector (specificity 0-2-0 vs 0-1-0, not source order) is what lets it beat the `fixed`/`pb-28` utilities it overrides.
**Prevention**: Never put `@`-leading syntax in a template attribute. For a height-based media query use a component `styles` block or `src/styles.css` (Tailwind has no height variant; `max-[600px]:` is width). When the dev server seems to ignore a template edit, check the class is actually on the element; if missing, restart and clear `.angular/cache` before trusting measurements.

## [2026-10-02] ui/ad-slot: `InfoPopover` tracks hover on its HOST, so a stretched flex child makes the WHOLE ROW a hover hotspot

**Problem**: On every ad unit, hovering anywhere across the "Advertisement" caption row opened the disclosure panel, not just the caption, and the "i" glyph sat left of the wording with no padding, so the real trigger was a ~90px sliver of 10px uppercase text.
**Root Cause**: `InfoPopover` binds `(mouseenter)`/`(mouseleave)` on the host by design (the panel is an absolutely-positioned descendant, so host tracking keeps it open while the cursor crosses onto it). The ad slot put the host in a `flex flex-col` wrapper with only `justify-center`; a flex item defaults to `align-self: stretch`, so the host went full width.
**Fix**: The host is `self-center`. Added shared `InfoPopover` inputs: `iconPosition: "start" | "end"` (default `"start"`; `"end"` moves the node in real DOM order) and `triggerClasses` (merged after the trigger button's base classes so `cursor-help` / focus ring / `rounded-full` survive). The ad slot passes `px-2 py-0.5 transition-colors hover:bg-muted/60`.
**Prevention**: When a component tracks hover on its host, audit the host's BOX, not just the visible trigger: as a flex/grid child check `align-self`, and check the panel's own gap (`mt-1.5` needs the host to overlap it). Extend the shared primitive with a documented input rather than hand-rolling a second glyph/pill in the consumer. jsdom cannot see this; check hover-area changes with real pointer moves on the dev server.

## [2026-10-02] console/insiden: `[title]="… ?? null"` renders the literal string "null"

**Problem**: Every enabled Move up / Move down button on `/console/links` showed a tooltip reading `null`. The title should be absent when the button works, so only correctly working controls were affected, and the spec suite asserted only the disabled copy.
**Root Cause**: `[title]` is a property binding and the DOM `title` is a `DOMString`, so `null` becomes `"null"`. Only `[attr.title]` (`setAttribute`/`removeAttribute`) removes the attribute on `null`. It compiles cleanly, and `strictNullChecks` is off.
**Fix**: `dcde12a`. Both move buttons bind `[attr.title]="moveBlockedReason(link, 'up') ?? null"`; `moveBlockedReason` still returns `string | null` (the null is the honest "this works"). The sibling `[attr.title]` on `nest-under` keeps a non-null fallback string because that button is drawn only when its precondition holds. Follow-up `2f5bd09`: the verbs are icon-only and bind `reason ?? help` (both non-null), but `attr.title` is kept because `moveBlockedReason` may be widened.
**Prevention**: Any optional DOM attribute (`title`, `aria-label`, `alt`, `data-*`) binds as `[attr.*]`, never `[prop]`; reserve property binding for properties where `null` has meaning (an `@Input()`, `disabled`). A tooltip reading as a word ("null"/"undefined") almost always means a property binding where an attribute binding was needed.

## [2026-10-02] console/profile links: a targeted nest was gated on the UNTARGETED verb's minimum

**Problem**: "Nest under…" was disabled for a one-link selection, so an admin could not nest a single link under another (how a conversation gains its first child). Move up/down were also disabled because the queue defaults to Status Pending and `queueIsComplete` refuses any filtered queue by design.
**Root Cause**: `groupSocialMediaLinks` is one mutation with two modes, and the frontend reused `canGroup` (>= 2 distinct ids) for `canNestUnder` / `_nestReason`. The 2-id minimum is true only of the no-target mode (a lone link elects itself root). With a `parentId`, one id is a real re-parent: backend `_normalize_ids` refuses only the empty list and its own tests nest single ids. The reorder gate is a signal written from the applied filter snapshot, and the "clear the filters" copy described an action the UI did not offer (`Reset` restores the Pending default).
**Fix**: `84b9202`. `canNest` (>= 1 distinct id) in `link-thread-selection.util.ts`, used by both surfaces; toolbar hint split into zero-tick and one-tick copy; the reorder hint gained `reorder-show-all` (`showAllLinks()`), which clears every filter including Status and reloads via the same `applyQueueFilters(completed)` writer `resetFilters()` uses. Follow-up `dcde12a`: Move up/down are not drawn until `queueIsComplete()` and Nest under… not until the first tick (gates unchanged, so a programmatic caller is still refused); "Show all links" is never disabled.
**Prevention**: When one mutation has modes, derive each mode's precondition from THAT mode's server contract, not another mode's helper. When a precondition is a state the UI cannot reach from the default view, give the gate a named action, not prose: a disabled button's reason must describe something the admin can do.

## [2026-10-01] graphql: omitted vs explicit `null` differ per SDL — and a test in front of a resolver guard proves nothing until you delete the guard

**Problem**: Three arguments behave three different ways when omitted or `null`. An earlier version of this note wrongly called `reorderSocialMediaLinks.parentId` "required" and said omission is rejected by validation before the resolver.

| argument                                 | SDL                | omitting the key                           | explicit `null`                |
| ---------------------------------------- | ------------------ | ------------------------------------------ | ------------------------------ |
| `reorderSocialMediaLinks.parentId`       | `ID`               | legal; the **resolver's guard** refuses it | **MEANINGFUL** — reorder roots |
| `groupSocialMediaLinks.parentId`         | `ID = null`        | legal; "start a new conversation"          | same as omitting               |
| `publicSocialMediaLinks.collapseThreads` | `Boolean! = false` | legal; means `false`                       | **HARD ERROR** — non-null      |

**Root Cause**: In GraphQL "required" IS "non-null"; "required, nullable, no default" is not expressible. `parentId: ID` is nullable and defaultless, so plain OPTIONAL: graphql-core's `is_required_argument` is `is_non_null_type(arg.type) and arg.default_value is Undefined`, so `ProvidedRequiredArgumentsRule` never fires. Verified on graphql-core 3.2.6 against the emitted schema (`rosak_backend/rosak/tests/snapshots/schema.graphql`): key omitted, key omitted from a declared nullable variable, and explicit `null` all pass `validate()` and enter the resolver, where `strawberry.Maybe` supplies `UNSET` and the deliberate guard in `incident/schema/mutations/interactions.py` raises the `GraphQLError`. Only a client-declared `$parentId: ID!` left unprovided stops earlier (variable coercion: `Variable '$parentId' of required type 'ID!' was not provided`). `collapseThreads` is refused by the type system itself: `Expected value of type 'Boolean!', found null.`
**Fix**: None needed; this is the design. Tightening `parentId` to `ID!` would turn the meaningful `null` ("reorder the ROOTS") into a hard error, so the resolver guard distinguishes omitted from null (docstring in `interactions.py`; pinned by `rosak_backend/tests/incident/test_social_link_threads.py`, which sends the argument absent from the selection). Both clients keep their types (`boolean | undefined`, `string | null | undefined`, `parentId: string | null` with no `| undefined`), so an omitted key is a compile error rather than a runtime `GraphQLError`.
**Prevention**: Read null semantics from the SDL, not from "optional" intuition. To mean the default, omit `collapseThreads` entirely (never send `null`). A test in front of a resolver guard proves the guard is on the path only if you DELETE the guard and watch it go red; a test that stays green is passing on another layer's error. A guard that a test appears to cover but does not is worse than none: the next agent reads the test as permission to delete it.

## [2026-10-01] core/polling: re-applying the CURRENT `intervalMs()` re-applies a pause — a disarmed timer needs a real `resume()`

**Problem**: Leaving the home page (`/` → about) and returning permanently deleted the refresh control (no spinner, no "Refreshing in Xs") for the session; only a manual click worked. A first landing on `/` was fine, so it read as a rendering bug.
**Root Cause**: A route-scoped provider does NOT die with the component that injects it: the router retains the `""` route's injector while `HomePage` is recreated, so the same `HomeStore` survived. `HomePage.ngOnDestroy` → `store.stop()` → `polling.setIntervalMs(null)` paused the 30s beat; the next constructor's `store.start()` re-applied the pause via `setIntervalMs(this.intervalMs())`. The countdown branch is `@if (store.polling.intervalMs() !== null)`, so paused renders as nothing, with no error. `null` is overloaded ("never" and "not me, right now"), so the round trip is indistinguishable from an intentional never.
**Fix**: `7221ff6`. `PollingSource` tracks `lastEnabledIntervalMs` (last non-null cadence, default 30s) and gains `resume()`, the only exit from the paused `null`; it re-arms at the last cadence and is safe on a running beat (restarts the countdown, no duplicate timers). `HomeStore.start()` returns early on the server and, when `polling.intervalMs() === null` (retained-store re-entry), calls `resume()` and `reloadFirstPages()`; on first mount it is a no-op (`PollingSource` schedules itself in its constructor). `stop()` is unchanged. Pinned by `polling-source.spec.ts`, `home.store.spec.ts`, `home-refresh-control.component.spec.ts`.
**Prevention**: A timer that can be disarmed needs a real resume verb; never round-trip the paused value through the setter. Never assume a route-scoped service dies with the component that injects it: the router keeps the route injector across visits, so constructor-setup / `ngOnDestroy`-teardown pairs are asymmetric. What destroy disarms, the next create-side call must re-arm (and re-validate what it assumed about a new reader). Test the cycle: `stop()` then `start()` on ONE instance; a "restart" spec that builds a fresh component each time passes against the broken code.

## [2026-10-01] insiden/vote-button: a `linkedSignal` display re-seeds from EVERY input, including the host's echo of your own value

**Problem**: Clicking upvote lit the arrow, then the score and breakdown snapped back to their pre-click numbers (home feed, /insiden, situasi tab; all three vote targets).
**Root Cause**: Two causes compounding. (1) Every vote mutation returned `{ ok }`, so the client had to project the new score, racing its own echo and other voters. (2) The display was a `linkedSignal`, which re-seeds when ANY dependency changes; hosts mirror the just-told value back as their `userVote` overlay, changing an input whose siblings (`netScore`/`upvotes`/`downvotes`) still carried pre-vote numbers, so the control discarded its projection. `linkedSignal` suits "server refetched, re-seed", not "I optimistically updated and the host will echo the value".
**Fix**: The backend's nine vote mutations return `VoteMutationPayload` (`ok` kept, plus `userVote`/`voteScore`/`upvotes`/`downvotes`; `rosak_backend` 2026-10-01). The display is three layers `optimistic` → `confirmed` → `hostState`, a `computed`; `confirmed` is honoured only while `voteStatsKey(hostState())` matches the counters it was computed against, and that key excludes `userVote`.
**Prevention**: When a control is fed BOTH a value it just emitted and the statistics that value implied, key its staleness test on the statistics and exclude the echoed value. A mutation that changes a displayed aggregate should return the new value, not `ok`. `home.queries.spec.ts` parses all nine documents' selection sets: a document narrowed back to `{ ok }` compiles, and every fixture mocks the response rather than reading it.

## [2026-10-01] insiden/link-thread: `reorderSocialMediaLinks` is a permutation write — send the stored order, the complete set, and never a guessed position

**Problem**: Backend `incident/services/social_link_threads.py::_reorder_sync` renumbers the ids it is sent to `10, 20, 30, …` in arrival order, appends siblings it was not told about, rejects an id that is not a child of the named parent (membership validated, absence tolerated), writes verbatim and reports OK. Three client failures share that root (the server cannot notice a wrong or short list):

- Wrong order: payloads built from the row array's order (`occurredAt DESC, id DESC`) while the backend assembles a conversation oldest-first, so the first "Move up" reversed it and the round trip changed nothing visible (`/console/links` and My Submitted Links).
- Partial set: sending 3 of a run's 7 rows (console: a filtered page; My Links: a cursor page boundary) pushes the 4 unseen rows to the end and reports success; the stored order now silently and permanently disagrees with the admin's.
- Missing `position`: `?? 0` floats the row to the head (positions are gap-spaced `10, 20, …`; `0` is only the model default for a row written outside `save()`), and the next reorder writes the guess as the sequence. An ungrouped root's "position" can also tie with a real one.

**Root Cause**: Nothing marks the field that defines the permutation's domain order, so the nearest array is the wrong order; "send the whole set" reads like a precondition while the server's tolerance looks like success; `position` is a required `number` on the console row type but optional on `PublicSocialMediaLink`, and `strict`/`strictNullChecks` are off, so no compiler reports it can be missing.
**Fix**: Both surfaces sort each sibling run by the stored order (`compareStoredSequence`: `position` ASC then `id` ASC, mirroring backend `(position, pk)` in `incident/schema/loaders.py::batch_load_sublink_subtrees` so `"10"` does not sort before `"9"`) before computing both the payload and the move-button state, from one array. They refuse to reorder until the set is provably complete: console via `queueIsComplete`, a signal (not a `computed` over the filter dials, which would re-enable the action while a filtered page is still on screen) written by `fetchLinks` from the applied-filter snapshot, where complete means no search/category/line/vehicle/station/date window AND Status on All (the queue defaults to Pending, which already hides rows); My Links via `!_hasMore` plus a page-level sentence (`data-testid="thread-sequence-notice"`). Both refuse when any sibling's `position` is not a number (`runOrderIsKnown` / `_runOrderIsKnown`, a `typeof` check since a stale cache can omit the key) with a direction-agnostic message ("…the sequence they are in is unknown and reordering it would write a guess"). Comparators keep a `typeof` coercion only to stay antisymmetric (no `NaN`); no decision is taken on that result. Disabled buttons state their reason.
**Prevention**: For a permutation / "send the whole set" API, identify the field that defines domain order, sort by it with an explicit tie-break (a stable sort is just arrival order), and derive payload, move index and "already first/last" from one array. Check whether the server validates completeness or merely tolerates absence; toleration is silent data loss, so completeness must be a provable client precondition derived from the applied snapshot that produced the rows, with a human-readable reason ("clear the filters" is something the admin can do; a reasonless disabled button is a bug report). Never coalesce a rank to `0` in a comparator whose output goes to a server: a synthesised order is a write.

## [2026-10-01] testing: a spec factory that spreads `Partial<T>` cannot produce a row satisfying a fully-required `T`

**Problem**: `position` could not be promoted to a required `number` on `SocialMediaLinkRow` while spec factories omitted it. The idiomatic `function makeLink(overrides: Partial<SocialMediaLinkRow> = {}): SocialMediaLinkRow { return { …, ...overrides }; }` widens every property through the `Partial<T>` spread to `T[k] | undefined`, a type error against the required return type. The tempting fix (make the field optional on the row type) lies to the production compiler: the console document really selects it.
**Root Cause**: A `Partial<T>` spread is a widening operation dressed as narrowing; every required key must be named in the literal before the spread. The trap surfaces only when the production type tightens, so a factory written while everything was optional looks permanently fine.
**Fix**: `makeLink` names `position` (and the other hierarchy fields) explicitly. For a row that genuinely arrived without `position`, `links.component.spec.ts` and `my-links.component.spec.ts` use a `withoutStoredOrder` helper that deletes the key from a real row and casts, with a comment saying why.
**Prevention**: Name every required key in the factory literal from the start; the compile error when a field is promoted is the reminder, not an obstacle. To build a deliberately malformed row, delete the key; never widen the shared factory.

## [2026-10-01] ui/checkbox: a row click handler plus a checkbox in that row needs `stopPropagation`, and the checkbox must be driven by `(click)`, not `(checkedChange)`

**Problem**: Two console tables make the whole row a hit target and also hold a real checkbox (`/console/spotting` selects rows, `/console/links` opens the detail sheet). (1) The toggle silently undoes itself: the checkbox handler writes the signal synchronously, the click bubbles to the row, which recomputes `targetState = !checkedIds().has(id)` against the updated signal and flips it back. (2) Shift-click range select is impossible with `(checkedChange)`, which carries only the new boolean; only a native `click` carries `event.shiftKey`.
**Root Cause**: Angular event bindings are synchronous and `stopPropagation()` is not automatic. The single-row case still works when the two handlers compute state from different sources, so the bug shows only as "a row click right after a checkbox click cancels out".
**Fix**: In `console.page.html` the checkbox binds `(click)="onRowCheckboxClick(event.id, $event)"`, which calls `event.stopPropagation()` first, then the same private `applyRowToggle(id, shiftKey)` the row's `(click)` uses, computing target state from the row, never from the box's emitted value. Spartan does not stop propagation, and the keyboard Space/Enter click carries the same modifiers, so Shift+Space range-selects. Pinned by `console.page.spec.ts` (3 tests fail without `stopPropagation()`).
**Prevention**: For a click-the-row table with a control in the row: the control's `(click)` stops propagation first, both paths go through one state-computing method, and never derive new state from different sources. Drive `(click)`, not `(checkedChange)`, once modifiers matter. Sibling pattern: `console/insiden/links/links.component.html`, which describes the same trap inline for the sheet.

## [2026-10-01] core/graphql: `isLoading` is PRISTINE-ONLY — a refresh that completes cannot be observed through it

**Problem**: The home page's transient "Updated" confirmation never appeared, and could have appeared on a FAILED refresh. It was armed by a click through a plain `_refreshPending` boolean and settled on `HomeStore.isLoading()` going false, but `graphqlResource.isLoading` is `raw.isLoading() && !hasEverLoaded() && !hasError()`, true only for the first fetch. A boolean is not a signal (arming re-ran nothing), the effect never read `hasError`, and the button's `aria-label` still said "Refresh line statuses now" after the beat was scoped to the whole page.
**Root Cause**: The narrowing that makes `isLoading` right for a skeleton gate (no re-flash on retry) removed the only observable in-flight signal, with nothing at the call site saying so; the underlying `httpResource` flag was reachable but not exposed.
**Fix**: `graphqlResource()` gained an additive `isFetching: computed(() => raw.isLoading())` (true for the pristine fetch, `reload()` and automatic retry; `isLoading` untouched as the skeleton gate). `HomeStore.isRefreshing` ORs it across the three page resources; `HomeRefreshControlComponent` arms `_refreshPending` on a click (a signal), latches `_refreshStarted` when `isRefreshing` goes true, and confirms only on settle with `!store.hasError()`, so an automatic poll tick or a click whose request never went out cannot confirm. Pinned by `graphql-client.spec.ts` and `home-refresh-control.component.spec.ts`.
**Prevention**: To react to a refresh COMPLETING ("Updated", a manual-reload spinner, an idle-vs-busy badge), key on `isFetching` (or a store projection), never `isLoading` or a plain boolean, and make the trigger a signal so the effect re-runs. `isLoading` answers "has this ever loaded?", `isFetching` "is a request on the wire right now?".

## [2026-10-01] ui/animation: an inline `animation` SHORTHAND resets `animation-direction` — the class beside it is dead markup

**Problem**: The home refresh control's "Updating" spinner rendered clockwise; the intent was a slow 3s counter-clockwise spin.
**Root Cause**: `style="animation: spin 3s linear infinite"` is the shorthand, so it resets every sub-property it does not name (direction back to `normal`); being inline it also outranks the `[animation-direction:reverse]` utility, so the computed value was `"3s normal spin"`. jsdom computes no styles, so no spec, snapshot or class assertion can catch it; it was found by reading `getComputedStyle` in a real browser.
**Fix**: `86cae7e`. Direction goes inside the shorthand: `style="animation: spin 3s linear infinite reverse"` (computed `"3s reverse spin"`). The spec pins `reverse` inside the inline style string (a class-only assertion passes against the broken version).
**Prevention**: Never split one animation's direction/fill/iteration/timing between an inline shorthand and a class; put everything in the shorthand, or use longhands after it. Still carrying the class-only pattern, deliberately unchanged (check what each is meant to do before touching): `spotting/line-details/insiden-section/insiden-section.component.ts`, `spotting/line-details/situasi-section/situasi-section.component.ts`, and both spinners in `tracker/status-card/layer-checklist.component.ts`. `home/refresh-control/home-refresh-control.component.ts` no longer uses it (direction is inside the `[animation:…_reverse]` shorthand); `tracker/map/tracker-map-skeleton.component.ts` uses `animation-delay` longhands and is not affected.

## [2026-09-30] repo/ts: a backtick inside a comment inside a template literal breaks the whole program

**Problem**: A backtick in an `<!-- … -->` comment inside a component's `template:` literal terminated the literal. `npx prettier --check .` reported `SyntaxError: ',' expected` at a column inside the comment, and vitest failed repo-wide with a parse error on an unrelated spec file (a parallel task concluded "someone else broke the build"). Recurrences, same misattribution: 2026-09-30, a `#` comment in `INSIDEN_INCIDENTS_QUERY` (`features/insiden/data/insiden.queries.ts`) wrote `` `created` `` and `` `occurredAt ?? created` ``; 2026-10-01, `#` comments in `SOCIAL_MEDIA_LINKS_QUERY` (`features/console/insiden/data/insiden-console.queries.ts`), `PUBLIC_SOCIAL_MEDIA_LINKS_QUERY` (`features/insiden/data/social-links.queries.ts`) and `FEED_QUERY` (`features/home/data/home.queries.ts`); quoted identifiers there now use double quotes.
**Root Cause**: A backtick terminates a template literal wherever it appears; neither an HTML comment nor a GraphQL `#` comment escapes it. The reported file/column is where the parser gave up, not where the mistake is; for a `#` comment the parser complains about the following selection line, several lines below.
**Fix**: Use single/double quotes inside any comment that lives in a template literal (component `template:` / `styles:` strings and every hand-written GraphQL document in `*.queries.ts`).
**Prevention**: Never put a backtick in a comment inside a template literal. When a repo-wide parse error names a file you have not touched, check the most recently modified files first. Run `npx prettier --check .` right after adding a comment to a template literal or GraphQL document; it catches this in seconds. A `templateUrl` component (e.g. `links.component.html`) has no literal to terminate, so backticks are fine in its HTML comments.

## [2026-09-30] docs: a parallel docs task can assert the opposite of a component fix that lands mid-wave

**Problem**: A docs task and a component task ran concurrently on the `app-link-thread` wrapper. The docs task read the component before the `threadLabel` fix landed, concluded the wrapper did not use the shared pluralisation helper, and rewrote four documentation sites to say so as deliberate design, with reasoning ("each site keeps counting what it is about") that would have convinced the next agent to preserve the bug. A stale `threadLabel` docstring ("the console chip and the card badge must not…") denied a consumer that existed.
**Root Cause**: A docs task writes a point-in-time conclusion in the imperative register ("X is deliberately not Y"), indistinguishable from an architectural decision, so it is defended rather than re-checked. No gate compares prose to code, and the render is unaffected.
**Fix**: Restored the true claim at all four sites and the docstring, keeping the part that was right (callers differ in their gate: a table row can render `""`, the wrapper's minimum is 2; not in the string). A docstring that enumerates consumers now says to re-derive the list from the code.
**Prevention**: Do not run a docs task concurrently with a task changing the code it describes; sequence them, or re-read the file just before writing. Treat "deliberately NOT shared/reused" as a claim to verify: a duplicated `${n} links` template is a defect, never a design. Guard: `grep -rn "<helperName>" src` and count the call sites.

## [2026-09-30] insiden/link-thread: `isThreadRoot` is structural (`parentId == null`) and `threadLabel` takes a conversation SIZE — two counts, one question

**Problem**: Gating the thread affordance on backend `isThreadRoot` sprouts an "N links" badge on every row in the app (every unthreaded link is a one-member thread, hence already a root; under the tree the definition moved from `thread == null` to `parentId == null`, the trap unchanged). Second half: `link-thread-selection.util.ts::threadLabel` takes a conversation SIZE (the node plus its publicly visible descendants, `sublinkCount + 1`) and returns `""` for `<= 1`, so passing a raw descendant count silently deletes the chip on a root with exactly ONE sublink (`1` → `""`) while leaves (`0` → `""`) stay correct, which hides the bug. Three call sites each rediscovered it: `app-link-card`'s `conversationLabel`, the console Thread cell + `confirmThreadCoupling`, My Links' `_conversationLabel`.
**Root Cause**: A root is "nothing points at this link", a structural property, not the feature question "this link has links below it"; its default and its interesting case are the same value. `threadLabel`'s empty branch means "nothing to show", so it is a gate as much as a formatter, and a caller's unit is not the helper's unit unless stated.
**Fix**: The only correct gate is `sublinkCount > 0` (`app-link-card`'s `hasSublinks` computed, which gates on its `sublinkCount` INPUT, not `link.sublinkCount`, so a flat host that never binds the input cannot draw a chip; the console cell and `confirmThreadCoupling`; My Links' badge). Every `threadLabel` caller passes `sublinkCount + 1`, stated in its docstring. Under the tree a node's count covers its own descendants at any depth, so size a conversation from the ROOT's count and never sum the column (it double-counts by the depth).
**Prevention**: Before trusting a backend boolean as a feature predicate, ask what it returns for the most common row; if `true`, it is not a gate. Put a helper's unit in its name, docstring and parameter type (a caller who must remember `+ 1` will forget, and the failure is a missing chip, not an error). Do not tighten the `""` branch (`1` → `"1 link"`): a chip would sprout on every ordinary row.

## [2026-09-30] console/insiden: queue date args renamed `createdAfter`/`createdBefore` → `occurredAfter`/`occurredBefore` with NO alias

**Problem**: A compatibility alias was considered and rejected: the queue orders `-occurredAt, -id`, so an alias would keep the filter answering "was this reported in this range?" while the rows answer "did this happen in this range", quietly wrong for every back-dated report.
**Root Cause**: None; a recorded scope decision so it is not later "helpfully" reversed. It generalises: a stale client should fail loudly, not filter the wrong column.
**Fix**: `SocialMediaLinksQueryVars` and the console document (`insiden-console.queries.ts`; `links.component.ts::fetchLinks`) use only the new names; the filter is relabelled "Occurred between". A stale `createdAfter` fails GraphQL validation ("Unknown argument"), the intended loud failure.
**Prevention**: Do not reintroduce the old names as a shim. If a temporarily broken client is genuinely required, use a versioned endpoint or an explicit deprecation window, not a silent alias on a filter whose sort column is also changing.

## [2026-09-30] insiden/link-thread: `GenericMutationReturn.id` is an `Int`, not an `ID`

**Problem**: `groupSocialMediaLinks` returns the new thread root's `id` as GraphQL `Int` (`common.schema.scalars.GenericMutationReturn.id: int | None`) while every other id on `SocialMediaLinkScalar` is an `ID` string. `String(result.id)` round-trips, so the mismatch shows only when the value is fed into an `ID`-typed field (a `linkIds` array, a cursor, a `parentId`).
**Root Cause**: `strict`/`strictNullChecks` are OFF, so the compiler accepts a number where a string is declared and vice versa.
**Fix**: `GroupSocialMediaLinksData.id` is typed `number | null` with the reason inline. All call sites (console triage table, My Submitted Links, both nesting paths) deliberately ignore the returned value and reload the flat list, because `parentId` / `sublinkCount` / `position` are server-computed and the mutation returns only `ok` and that id. `reorderSocialMediaLinks` returns no id for the same reason.
**Prevention**: When reading a mutation's return payload, check the BACKEND scalar's GraphQL type, not the feature's convention. Any id in this app is a string unless a shared `GenericMutationReturn`-style scalar says otherwise.

## [2026-09-30] insiden/link-occurred-at: a naive wall-time datetime must never round-trip through `toISOString()`

**Problem**: A link's `occurredAt` is naive local wall time, so `new Date(iso).toISOString()`, `.getTime()` arithmetic, or `Date.parse` plus a UTC formatter shifts it by 8 hours (`Asia/Kuala_Lumpur`, UTC+8, no DST). The console date-RANGE filter legitimately uses `.toISOString()` on the same column, which makes the rule confusing.
**Root Cause**: The backend runs `USE_TZ = False` with `TIME_ZONE = Asia/Kuala_Lumpur`, so every `DateTimeField` is naive and Strawberry serialises it with no offset (often with microseconds). The range filter starts from an aware `new Date("<date>T00:00:00")` resolved in the viewer's zone and converted back by the server; the link form has only a wall-time string to preserve.
**Fix**: `features/insiden/data/link-occurred-at.util.ts` formats by hand: `isoToOccurredAtInput` parses with `new Date(iso)` and reads the local getters (an offset-free ISO parses as local, so wall time passes through; a real offset is rendered in the viewer's zone); `occurredAtInputToIso` emits the typed wall time as `YYYY-MM-DDTHH:mm:ss` with no offset or `Z`. `console/insiden/data/date-range.util.ts` carries the contrasting note.
**Prevention**: The rule is not "never `toISOString`" but "never on a naive wall-time field". Before reformatting a backend timestamp, check whether the string carries an offset; if not, use `Date` only to read the viewer's own clock, never to write an instant; preserve the string.

## [2026-09-30] home/store: the authenticated vote-overlay read must be the SAME read as the feed it mirrors (window, collapse, depth)

**Problem**: `loadVoteOverlay()` re-reads the feed to fill the id-keyed vote overlay (`graphqlResource()` sends no auth token, so the rendered `userVote` is always `0`). If that read differs from what the page renders, a rendered id has no overlay entry, `LinkThreadComponent.voteFor` answers the anonymous `link.userVote ?? 0`, and a rider's own upvote renders un-pressed with no error and no failed request. Three drifts shipped: (1) window: the today read omitted `currentServiceDayOnly: true`, so it fetched the newest 8 rows overall while the page renders the newest 8 within the current service day; (2) shape: `collapseThreads` changes the connection's shape, not just its content. An uncollapsed read returns the newest `first` FLAT rows (`r1, c1, g1, r2, …`), a top-N window over rows the collapsed render never shows, dropping exactly the descendants a rider voted on; an uncollapsed page 2 after a collapsed page 1 also re-lists every root and renders members as loose rows; (3) depth: a walk that stopped at the roots plus one level (the read collapses, so `edges` holds only roots) left every deeper node reading `0`.
**Root Cause**: The overlay read was written as a separate query instead of a copy of the resource's; each axis looks like a self-contained decision, and nothing type-checks the agreement (`FeedQueryVars` is a bag of optional flags). An earlier note argued the overlay should NOT collapse "because it hides member votes"; wrong, since the walk finds them. The invariant is that the overlay's id set equals the RENDERED id set, and the render is roots with whole trees nested. Client-side grouping of a flat page is unsound (under `-occurredAt, -id` an admin can nest a 09:00 post under an 11:00 one, possibly across pages), so collapsing is the backend's decision.
**Fix**: `home.store.ts` folds `HOME_FEED_COLLAPSE_VARS = { collapseThreads: true }` into all SIX home reads (`feedResource`, `lastWeekResource`, `loadMore()`, `loadMoreLastWeek()`, and both authenticated reads in `loadVoteOverlay()`); `currentServiceDayOnly: true` was added to the today overlay read, and the last-week overlay read was verified to match `lastWeekResource` on `lastWeekOnly`, `alignPageToDay` and `first`. The overlay loop recurses through `sublinks` at every depth (`recordSubtreeVotes`; the field was `threadLinks` before the tree). The invariant is written on `loadVoteOverlay()`: same query, same variables, the auth header the only addition, walk every level. `home.store.spec.ts` captures both resource requests' variables and compares them structurally to the overlay reads' (any added/removed key is red) and pins "the overlay reads MUST collapse". Every other surface (`/insiden`, situasi, per-incident cards, My Links) omits the key entirely (an explicit `null` is fatal on a `Boolean!` argument; see the 2026-10-01 null-semantics entry).
**Prevention**: When a read exists only to fill a cache/overlay keyed by what another read renders, copy the rendered read's variables verbatim and assert equality structurally (`expect(overlayVars).toEqual(resourceVars)`), not by restating the expected object (restating let the window drift). For any new read of a connection whose arguments can change its shape, enumerate EVERY read (first page, every continuation, every auxiliary read) and every depth, and test the rendered set: a read is wrong whenever an id the page draws can be missing from it, because an absent id looks like a genuine zero. A wider read is harmless; a different one is not. Do not fix a shape mismatch by changing the window, or a window mismatch by uncollapsing. Do not mirror the server's `MAX_THREAD_DEPTH` on the client; it silently loses a level when the cap moves.

## [2026-09-26] incident/schema: `SocialMediaLinkInput` is replace-not-patch — omitting a field in the write OR in the read document is silent data loss

**Problem**: (a) The console links queue's **Approve** must flip a row to `LIVE` and nothing else, but sending `{ status: "LIVE" }` blanks the title and strips every category, line, vehicle and station tag. (b) 2026-10-01: saving the shared edit sheet on a front-page link silently deleted its `vehicles`, `stations` and `categories`, with nothing visibly different on the feed (it never rendered the tags). `FEED_QUERY` did not select the three relations, so the sheet hydrated from a link carrying no tag data and the save path sent the complete set with `[]` for each. It went live when the same wave made conversation sublinks editable from the front page (a sublink is the row most likely to carry a vehicle tag).
**Root Cause**: `update_social_media_link` assigns `title = write.title or ""` and `.set()`s the four id lists to whatever arrives (empty when omitted); only `status` / `description` / `incidentId` are genuinely `strawberry.Maybe` omit-means-unchanged, but the `?:` type mirror made the rest look like patches. For (b): a query document is a hand-written string no compiler checks against the type it populates, and that type describes a RESPONSE, so "the row type has `vehicles`" and "the server was asked for `vehicles`" are unrelated claims; the relations were optional on the feed row type, which with `strictNullChecks` off is no contract (`?? []` compiled); a comment saying a missing list hydrates as `?? []` ("exactly what a link with no tags looks like") was true of the render and misleading about the write; a hand-written fixture can invent any field, so every spec passed.
**Fix**: (a) `approveLink()` re-sends the row's current `url`, `title` and all four id lists next to `status: "LIVE"`; the `UpdateSocialMediaLinkVars.input` doc comment states full-replace semantics; a spec pins the full approve payload. (b) The three relations are selected at the root node and at every nested `sublinks` level, and in `SUBMIT_FEED_LINK_MUTATION`'s mirrored `link` selection (its payload type IS `FeedLink`), each with the minimal identifying pair (`vehicles { id identificationNo }`, `stations { id displayName }`, `categories { id name }`; the whole `Vehicle` scalar on every row of every page is a real fan-out cost) and now REQUIRED on `FeedLink`. `home.queries.spec.ts` strips `#` comments, brace-matches the selection set and asserts each relation is present with exactly its identifying pair at every level; the level count is the literal `EXPECTED_LINK_LEVELS`, not counted off the document, so shortening the chain is red (before this, deleting `sublinkCount` from one level compiled, passed the suite and rendered a 3-level conversation as 2).
**Prevention**: Before sending a partial update through any `*Input`, read the SERVICE, not just the GraphQL input, to see which fields it assigns unconditionally or `.set()`s; only fields it treats as optional are omit-means-unchanged. Same for `CalendarIncidentInput`'s chronology/asset lists. If an editor round-trips a row, every relation the input `.set()`s must be selected at every editable level; a type is a claim about a response, never a request, and an optional response key is not a contract. Substring tests are useless here (the document explains itself in `#` prose naming the fields); a test in front of a contract counts only if you delete the contract and watch it go red. **Tri-state (2026-09-30, `occurredAt`)**: `SocialMediaLinkInput.occurredAt` is `Maybe[datetime | None]`: key omitted → untouched; datetime → set; explicit `null` → reset the row to `link.created`. An editor that round-trips the row must re-send it verbatim: one `?? null` in `linkStatusInput` (the builder behind the console's Approve/Hide) would rewrite every clicked row's event time and re-sort the public feed, since every ordering keys on `occurredAt`. For a tri-state input "absent" is never a safe substitute for "unknown"; an editor that owns a visible control must send the key even when the control is empty.

## [2026-09-25] spotting/route-persistence: default route reuse destroyed retained page state

**Problem**: Navigating `/spotting/:lineId` → `…/details` or `…/vehicle/:vehicleId` and back re-showed skeletons, refetched everything and lost window scroll; `scrollPositionRestoration` alone could not restore a page that no longer existed (in-app "← Back" links don't fire `popstate`).
**Root Cause**: The three spotting page routes used Angular's default `RouteReuseStrategy`, so cross-page navigation destroyed the component, its resources and its DOM.
**Fix**: Opt-in `ReusableRouteStrategy` (`core/routing/reusable-route.strategy.ts`) via `data: { reuse: true }` on the three routes, a browser-only `RouteScrollMemoryService`, and `revalidateOnReturn(<route pattern>, () => resource.reload())` hooks backed by shared spotting route predicates; retained resources refresh silently.
**Prevention**: Keep `data: { reuse: true }` on the three routes and register a `revalidateOnReturn` hook for every new data section; verify the keep-alive flow including an in-app back while a refresh is pending.

## [2026-09-25] spotting/vehicle-spotting-grid: a pinned overlay is a second copy — derive both from one class source

**Problem**: The mobile current-type label renders twice (in-flow TYPE row + pinned overlay `grid-mobile-pinned-label`); their hand-maintained class lists drifted, so the label visibly jumped when it pinned (font, colour, borders; pinned totals used `border-t` vs the in-flow `border-b`).
**Root Cause**: Two template copies each carried their own duplicated class list.
**Fix**: Both read one class-producing method (`mobileTypeLabelClass()`), pinned totals use `border-b`, and a spec asserts class parity between the copies.
**Prevention**: When one visual element exists as an in-flow row AND a pinned/mirrored copy, both must read one shared class method or constant, never a pasted second class list, and a spec must assert parity so drift fails loudly.

## [2026-09-24] spotting/vehicle-spotting-grid: mobile stacked layout — axis-relative classes, sticky mechanics, scroll-fitted e2e

**Problem**: The mobile (`<768px`) stacked grid hit four traps: the horizontal date scroller collapsed instead of scrolling; the sticky-left name cell didn't pin; the pinned overlay was inert; the mobile e2e pin assertion could never engage.
**Root Cause**:

- `items-start` is axis-relative: harmless in the desktop `flex-row`, but under `flex-col` it sizes the `overflow-x-auto` body to content width.
- `position: sticky; left: 0` on a `colspan` `<td>` is not honoured reliably across browsers.
- A sticky element sticks to its nearest scrolling ancestor; the `overflow-x-auto` body is one (CSS promotes the other axis too) and never scrolls vertically, so a sticky descendant never engages.
- The e2e stub fleet (3 vehicles) made the page barely taller than the 844px viewport, so `scrollBy` clamped and the grid never reached the sticky boundary.

**Fix**: Bound the alignment (`[class.items-start]="!isNarrow()"`); pinned an inner `<div class="sticky left-0 w-fit">` inside the `<td>`; rendered the overlay as a page-sticky sibling of the scroller (`height: 0`); enlarged the stub to 2 types × 8 vehicles (~1150px).
**Prevention**: When a flex container flips direction, bind alignment utilities, never leave them static. Never put `position: sticky` on a spanning cell or inside any `overflow` ancestor. For sticky e2e, size stub data taller than the viewport and assert `window.scrollY > 0` before asserting the pin.

## [2026-09-24] spotting/line-overview: the roster's table↔cards switch must clear the table's min-content width

**Problem**: At ~626–742px the fleet roster stayed a squeezed, overflowing desktop table; cards only engaged below ~640px.
**Root Cause**: The 7-column roster table cannot shrink below ~654px, but the switch sat at `sm` (640px), so "desktop" guaranteed less width than the table needs.
**Fix**: Raised the `vehicle-list` switch to `md` (768px): toggle, table wrapper and card list are all keyed to `md:`; cards render below 768px and the 654px table fits at 768px.
**Prevention**: Pin a data-dense table's mobile-switch breakpoint at or above its measured min-content width; probe `getBoundingClientRect().width` just ABOVE the chosen breakpoint, where the worst overflow lives, not at deep desktop widths.

## [2026-09-24] SSR/hydration: two ways a server render breaks the client's first render

**Problem**: (a) `GET /` returned HTTP 200 with a 22-byte `Internal server error.` body while `/methodology` was fine, nothing logged; (b) the spotting details grid threw NG0500/NG0502.
**Root Cause**:

- (a) `StatusInfoChipComponent` projected `<div popoverExtra>` into `InfoPopover`'s `<ng-content select="[popoverExtra]" />` inside `@if (_open())`; the slot never exists on the server, so hydration annotation threw `NG0502` mid-stream, and `@angular/ssr`'s bare stream catch wrote a 22-byte fallback after the status line was already sent.
- (b) `REQUESTS_CONTRIBUTE_TO_STABILITY` defaults `true`, so the server awaited the grid's `httpResource`/`graphqlResource` POST and rendered the desktop branch with real data; the client's viewport-conditional `@if` wanted the mobile branch.

**Fix**: `ngSkipHydration: ""` on the `InfoPopover` host (covers every `[popoverExtra]` consumer, `f0954ac`) and on `VehicleSpottingGridComponent`; a `renderApplication` server spec reproduces (a) without the fix.
**Prevention**: Never project content into a conditionally rendered slot; if you must, skip hydration and cover it with a server-render spec (a jsdom `TestBed` spec cannot catch it). Any first render depending on a browser-only signal while reading a resource needs `ngSkipHydration` with a comment naming the reason. A 22-byte 200 means the `@angular/ssr` stream catch fired; instrument the stream, nothing reaches the console.

## [2026-09-23] ui/combobox: text and value are two states — clear must clear, Enter must commit only a deliberate choice

**Problem**: Emptying a `HlmCombobox` appeared to do nothing (old label snapped back on blur, model kept the old id), and after the first fix, clearing then pressing Enter still committed the previously highlighted item.
**Root Cause**:

- Typed text and committed value were decoupled: `_onInput` set only `search`, and the blur/`effect` resync re-derived the text from `value` + `items()`, resurrecting the label while `value` (and the `[formField]` model) kept the old selection.
- Clearing left the panel OPEN over the unfiltered list with `_highlightIndex` still on the last item, so `_selectHighlighted()` committed a real (wrong) row on Enter.

**Fix**: `_onInput` clears `value` to the `emptyValue` input (default `undefined`; string-typed Signal Forms fields pass `""`); `_syncSearchToValue` short-circuits on `undefined` (`1f37d7d`); `_selectHighlighted()` returns early unless `_hasMovedHighlight()` or the query is non-empty (`22add7c`); the three station placeholders lost `disabled`.
**Prevention**: In a text/value control, clearing the text must clear the value, and blur-time resync must treat "nothing selected" as a distinct state. Test the commit gesture that follows the clear (Enter), not just clear+blur; a fix is not verified until the failing gesture is reproduced in a spec.

## [2026-09-23] spotting/report-form: a reactive resource's requestFn must read projected primitives, not the whole model

**Problem**: Every write to the report model re-issued the station lookup: one Notes keystroke sent one `StationLinesByLine` POST (10 characters → 10 identical queries).
**Root Cause**: `stationLinesResource`'s requestFn read `this.model()` (the whole form signal) and `graphqlResource` tracks every signal read inside its requestFn, so any model write re-ran the fetch though only `lineId`/`type` feed the request.
**Fix**: `6bbb2a0`. The requestFn reads two `computed`s of primitives, `_stationLineId` and `_stationType`, so only a line/type change re-runs it; a spec asserts an unrelated `notes` write triggers no station POST.
**Prevention**: A reactive resource's requestFn reads only the primitive fields its request depends on, projected through `computed`s. jsdom/vitest flush resources synchronously and cannot show the refetch-storm window: assert the projection, then reproduce in a browser.

## [2026-09-22] insiden/link-card: interactive controls must stay outside the navigational `<a>` — use a stretched link

**Problem**: The shared `app-link-card` row is one large external-link anchor carrying a vote control and an edit pencil; controls inside the `<a>` navigate on click (and interactives nested in an anchor are invalid HTML). It recurred (to 2026-10-01): the conversation affordance ("N links" + chevron) was asked to move into the first link's card, and its obvious home, the chip row beside the Pending/Official chips, sits inside the anchor, so the expand control would send the rider to the link. The first fix put the toggle in the rail and called that deliberate, which hid the real cost: the whole body had to be inside the anchor for the chips to be clickable, which forced the compromise.
**Root Cause**: When the whole row is the tap target it is natural to drop controls into the body. "Inside the card" and "inside the anchor" are different regions that share a boundary; only the latter is illegal for controls, and a design thumbnail does not show it.
**Fix**: Controls are siblings of the anchor. `46b0319`: the anchor wrapped only the non-interactive body; the vote button, edit pencil and conversation toggle lived in `link-meta-rail` (pinned by `link-thread.component.spec.ts`: `closest("a") === null` and `closest('[data-testid="link-meta-rail"]') !== null`). Later (2026-10-01), a stretched link: the anchor is an `absolute inset-0 z-0` overlay across the left column, the body and chip row are `pointer-events-none relative z-10` layers above it, and toggles re-enable hit-testing with `pointer-events-auto`, so the chip row is a sibling and the "N links" chip sits beside the Official / line-code chips. Costs, documented in the component header: an element under the overlay cannot have a hover tooltip (chip `title` explanations became `sr-only` text) and the title is no longer mouse-selectable.
**Prevention**: On a card whose row is a link, keep interactive children as siblings of the anchor and assert it in the spec; never nest a control in the anchor to widen its tap target. Read the component's own header constraints before choosing a slot (this card's already said "interactive controls as siblings, never children"). When a rule says "X must be outside Y", check whether restructuring Y is cheaper than relocating X. When introducing a click-through overlay, audit descendants for `title` tooltips and text selection and move the information into the accessibility tree.

## [2026-09-22] ui/forms: native HTML constraint validation silently cancels `submit` (`type="url"`, signal-forms `required`)

**Problem**: Two forms whose handler never ran, with no error, rejected promise or console message. (a) Pasting a schemeless link (`example.com/story`) into the home feed submit box did nothing (`type="url"`). (b) 2026-10-01: clicking "Submit Link" on an empty URL field showed the browser's validation bubble and `submit()` never ran, which made "reveal the 'Enter a URL' note on submit" impossible as specified.
**Root Cause**: Constraint validation runs before the `submit` event; a form with an invalid control fires `invalid` on it and dispatches no `submit`. (a) `type="url"` rejects the schemeless value (and is browser/locale-dependent). (b) The signal-forms `FormField` directive mirrors the schema's `required(...)` onto the DOM as native `required=""`. Verified (jsdom too, so it reproduces in a unit test; only the bubble is browser-only): `form.checkValidity() === false`, 0 `submit` events from a submit-button `.click()`, 1 once `required` is cleared.
**Fix**: (a) `dcf9885`: the input is `type="text"` + `inputmode="url"`; pure `feed-url.util.ts::normalizeFeedUrl()` scheme-qualifies at submit (`https://` when none, `//host` handled, `http(s)://` untouched, other schemes left alone). (b) `403bd1e`: `novalidate` on the `<form>`, so the submit-gated inline note owns the message (a local `submitAttempted` signal instead of `touched()`, which `FormField` sets on blur), plus an optional `errorVisible` input on `HlmInput` for the border/`aria-invalid`.
**Prevention**: Capture URLs as text and normalize in a tested pure util. Every signal-forms `<form>` with a manual `(submit)` handler needs `novalidate` (or the `FormRoot` directive). Still missing (same latent short-circuit, left alone on purpose): `insiden/link-form/link-form.component.ts`, `insiden/incident-form/incident-form.component.html`, `console/insiden/pending/pending.component.html` (its panel edit binds `incidentFormSchema`, so `title`/`brief`/`startDatetime`/`severity` are natively `required`). Verified NOT affected: `spotting/report-form` renders no `<form>` (its host sheet footer calls `reportFormRef.submit()`), and `console/insiden/links/links.component.html` and `home/line-status/line-status-sheet.component.ts` use plain `[value]`/`(input)` forms, not `FormField`. Signature: a form works from the keyboard (Enter calls the handler directly) but not from the button; suspect the form, not the handler.

## [2026-09-22] graphql: `graphqlResource()` is anonymous-only — per-user fields need an authenticated read

**Problem**: The home feed showed `userVote: 0` on SSR and first paint even for logged-in voters, so the vote control rendered "no vote".
**Root Cause**: `graphqlResource()` builds its own `httpResource` POST and sends no auth header, so the backend resolves an anonymous caller and every per-user field (`userVote`, `myVote`, …) returns the anonymous default.
**Fix**: `HomeStore` reads the feed anonymously, then, after `auth.whenReady` and when logged in, issues one authenticated `GraphQLClient.request(FEED_QUERY, vars, { "firebase-auth-key": idToken })` and overlays non-zero `userVote` values via a signal; `setUserVote()` keeps the overlay in sync.
**Prevention**: Treat `graphqlResource()` as anonymous-only. Any per-user field needs a separate authenticated read after `auth.whenReady`, overlaid on the resource data, with the overlay documented at the call site so nobody "fixes" it by trusting the resource. The overlay read must match the rendered read (see 2026-09-30 `home/store`).

## [2026-09-22] home: the 30s poll beat must never call `reloadAll()`

**Problem**: Pointing the front page's `PollingSource` at `reloadAll()` silently discarded the user's "Load More" feed pages every 30 seconds.
**Root Cause**: One method served two intents: `reloadAll()` is the submit/edit refresh (drops `appendedEdges`); the poll beat is a passive refresh.
**Fix**: `ae667fb`. The beat has its own method (originally a lines-only `reloadLines()`; now `reloadFirstPages()`: re-reads page one of all three resources, leaves every appended-page signal alone, bumps `linesRefreshTick`). The tick travels page → list → card → the open accordion's chart/reports, each reloading its own resource while expanded. The overlap is absorbed by the `dedupeEdges` merge, but a row deleted server-side lingers in an appended page until `reloadAll()`. `home.store.spec.ts` pins both paths.
**Prevention**: Give a periodic refresh its own method; never point a timer at the broad reset used by explicit user actions. Use `reloadAll()` only when the whole dataset is invalid (submit / edit / report / retry).

## [2026-09-22] home: `status` (approval) and `completed` (admin handled) are independent axes

**Problem**: Approved links rendered the "Pending" pill: every seeded card, plus four approved links under the situasi tab's "Pending (4)".
**Root Cause**: The pill rendered on `!completed` and the list split on `completed`, but `SocialMediaLink.status` (`LIVE`/`PENDING_APPROVAL`) is the approval axis while `completed` is the console's separate "mark handled" flag (`seed_demo_data.py` writes `status=LIVE`, never `completed`); `FEED_QUERY` did not even select `status`.
**Fix**: `fb136df`. The pill renders only for `status === "PENDING_APPROVAL"`, the list partitions approved = `status !== "PENDING_APPROVAL"`, and `FEED_QUERY` / `FeedLink` / `LinkCardItem` carry `status`; specs pin the independence.
**Prevention**: When two fields describe different lifecycle axes, name at the field declaration which axis drives which UI, and assert the independence in the spec: a "pending" affordance belongs to the approval enum, never to an admin's handled flag.

## [2026-09-22] home/line-status-chart: `line-status-bar` stays on the hour container, never on a segment

**Problem**: After each hour's bar split into per-status segments, moving or duplicating `data-testid="line-status-bar"` onto segments would make specs/e2e count one bar per segment and silently break every hour-count assertion.
**Root Cause**: The test id names the HOUR, but the DOM became a container plus N visual segments: the semantic unit and the visual pieces diverged.
**Fix**: `476683d`. The id stays on the hour container only; segments carry no test id (the spec selects `:scope > div`).
**Prevention**: Keep a test hook on the semantic unit, not the visual pieces; when a component's DOM is subdivided, re-confirm each `data-testid` still resolves to the node specs/e2e assume.

## [2026-09-22] mutations: check the payload's `ok` before any success side effect

**Problem**: A line-status report the backend rejected (`submitLineStatusReport.ok: false`, no top-level GraphQL error) still toasted success and closed the sheet.
**Root Cause**: Business-level rejections are a normal GraphQL response, not a thrown error, so `catch` never saw them and any returned payload was treated as success.
**Fix**: `9c1acf8`. The handler branches on `payload.ok` before toast/close/emit; a false `ok` sets the inline error (`[data-testid="line-status-submit-error"]`) and returns, mirroring the `GraphQLRequestError` path.
**Prevention**: For any mutation whose payload carries an `ok` flag, check it before success side effects: a returned payload is not evidence of success, only `ok: true` is.

## [2026-09-22] repo/prettier: `.gitignore` is the ignore list, and `@for` blocks cannot hold comments

**Problem**: (a) Playwright artifacts (`test-results/`, `playwright-report/`, `blob-report/`) broke `npx prettier --check .`; (b) an HTML comment inside an `@for` block made `prettier --write` fail with `SyntaxError: ',' expected.` and drop the whole file from the formatting gate.
**Root Cause**: (a) Prettier's `--ignore-path` defaults to `[.gitignore, .prettierignore]` (verified against Prettier 3.9.6), so it does read `.gitignore`; the artifacts simply weren't listed. (b) Prettier's Angular-HTML parser rejects comments inside control-flow block content (Angular's compiler is more permissive).
**Fix**: `6157823`. Artifact dirs added to `.gitignore`; the comment's rationale moved into the owning function's TS docstring.
**Prevention**: Keep generated tool output gitignored (that one file is also Prettier's default ignore list, so no `.prettierignore` entry is needed). Keep template comments outside `@if`/`@for`/`@switch`: a syntax error on a template line usually means one is inside a block.

## [2026-09-22] build: serialize builds and tests — they write the one repo-root `dist/`

**Problem**: Two concurrent `npm run build` runs produced a broken/partial build instead of two complete ones.
**Root Cause**: Angular writes browser + server bundles and the SSR entry to one `dist/`; there is no per-invocation output directory, so simultaneous runs race on the same files.
**Fix**: Serialize invocations: one at a time, or `flock dist/.build.lock npm run build` so a second run waits.
**Prevention**: Never run `npm run build` (or the suite) concurrently in the same checkout; when agents share a workspace, use the `flock` lock or separate git worktrees.

## [2026-09-16] ui/card + ui/info-popover: never put a competing utility on a component/directive HOST — wrap it

**Problem**: Consumer classes on a component/directive host were dead code. (a) `LinkCardComponent`'s `hlmCard class="gap-3 p-4"` always rendered `gap-4 p-5`. (b) 2026-10-06: `class="hidden sm:inline"` on `<app-info-popover>` did not hide it at 390px, and the spec asserting `hidden` on the host passed anyway (jsdom computes no styles). (c) 2026-10-06, spotting: the line-details activity-bar back chevron carried a static `inline-flex` next to a bound `[class.hidden]` on the same element, so it rendered before its handoff.
**Root Cause**: Host-own and consumer classes land on one element, and equal-specificity utilities resolve by stylesheet order, not by how specific the variant looks. (a) The `[hlmCard]` host-class rules in `ui/card/card.ts` win (`hlm()` cannot merge host-class rules). (b) `InfoPopover`'s host class `relative inline-flex` emits `.inline-flex` AFTER `.hidden` in the compiled CSS. (c) Same tie, same winner (`.inline-flex` after `.hidden`).
**Fix**: (a) The compact link card dropped `hlmCard` and carries explicit classes (hlmCard's tokens minus its spacing) with a comment. (b) `e92016c`: the popover is wrapped in a plain `<span class="hidden sm:inline" data-testid="line-row-reports-wrap">`; the spec asserts the wrapper holds both tokens AND that neither the projected span nor the popover host carries `hidden`. (c) First bound the display class as a pair (`[class.hidden]` + `[class.inline-flex]`, never both); the final polish removed the display toggle: a bound `w-0`/`w-7` pair + `-mr-2` collapses the footprint and animates open on the handoff (`opacity`/`translate`/width via `transition-all`), `inert` + `aria-hidden` while hidden; e2e pins `opacity: 0`/`width: 0px`/`inert` pre-handoff and `opacity: 1`/`width: 28px`/no-`inert` after.
**Prevention**: Never put a `display` utility (`hidden`, `block`, `flex`, `inline*`) or a spacing override on a component/directive host to gate or tune it; check the host's own classes first (`grep -rn "class=\"" <ui component>`), then wrap it in a plain element or parameterize the directive. Never let a static display utility and a bound one coexist on one element: bind both as a pair, or remove the toggle. Grep for other `hlmCard class="gap-` / `class="p-` before "tightening" a layout the same way. Confirm responsive hiding in a real browser; jsdom never resolves the tie.

## [2026-09-15] testing: Angular unit-test builder & Vitest traps

**Problem**: Several ways a test run lied: selection flags that ran nothing (a typo is a silently green zero-test run), `isolate: false` cross-file leaks, module-mock identity that never matched, strict-null spec errors, specs hitting the real GraphQL backend, bare `vitest`, and unmatched `routerLink`s.
**Root Cause**:

- `ng test`'s first positional arg is the project, not a file. `--filter` is a case-sensitive regex against the TEST NAME (the `describe`/`it` string), not a path, and the runner does not treat an empty match as an error: `--filter "network-board"` (2026-10-06; the `line-pulse-card` case hit the same one commit earlier) matched 0 tests, skipped every file and exited 0.
- `@angular/build:unit-test` defaults to `isolate: false`: files in a worker share jsdom globals AND the module cache, so leaks made specs pass alone and fail in the suite. An earlier file can also bind the real module into a cached service, so a `vi.mock` module binding is never reliable.
- The unit-test build type-checks specs with strict null checks ON regardless of the workspace tsconfig, so a typed `querySelector<T>(…)` deref fails (`TS18047`).
- A component using `graphqlResource()` leaves the real `httpResource` POSTing to `localhost:8000` unless the spec provides `provideHttpClientTesting()` and flushes the request (CI `ECONNREFUSED`, hung `whenStable()`).
- Bare `npx vitest run <file>` does not init the TestBed (`Need to call TestBed.initTestEnvironment()`) and has no globals (`describe is not defined`); only `ng test` does.
- A spec that CLICKS a real `routerLink` with no matching route rejects the navigation, and Vitest reports an unhandled rejection that fails the whole run even though the assertions passed. A plain `<a href>` only logs "navigation not implemented" in jsdom.

**Fix**:

- Scope one spec with `--include <path>`; filter on the describe/test name (`--filter "NetworkBoardComponent"` ran 32 tests) and grep the spec's `describe(...)` for the string instead of guessing from the filename (`line-pulse-card.component.spec.ts` describes `LinePulseCardComponent`).
- Use `vi.stubGlobal` + `vi.unstubAllGlobals()` for globals and restore mutated module/registry state in `finally` (`vi.resetModules()`); verify with `--isolate` when chasing order-dependence. Own the seam through TestBed DI instead of `vi.mock` (`UPLOAD_ERROR_REPORTER` is the reference fix; `gtfs-static.service.spec.ts` is a known instance).
- Keep the `nativeElement.querySelector(…) as HTMLElement` idiom, or null-guard.
- Provide `provideHttpClientTesting()` and flush the reference POST; never instantiate services that import `firebase/*` in specs, stub them.
- Bare `vitest run` is still the fast path for a spec with no TestBed (a pure function/util), but it skips the unit-test build's spec type-check, so run the real gate before trusting it.
- Give the router a matching route (`provideRouter([{ path: "spotting/:lineId/vehicle/:vehicleId", children: [] }])`); for a plain anchor, suppress the log with a `preventDefault()` listener on it (this does not affect the propagation a `stopPropagation` assertion depends on).

**Prevention**: Use `--include` for files and a correctly-cased anchored regex for `--filter`; treat a 0-test filtered run as a FAILURE (check the reported test count before reading anything else) and re-run unfiltered (`npm test -- --no-watch`) before trusting a green result; the full suite's file/test count is the only reliable regression signal. Treat "passes alone, fails in suite" as module-cache contamination, not a flake; write specs hermetic.

## [2026-09-15] CI/deploy: keep installs hermetic and workflows validator-safe

**Problem**: The `Deploy Functions` job died at `npm ci` (lockfile drift, Node 18 EOL) and `firebase deploy --only functions` would have found no codebase; separately, a job-level `if:` on `secrets` made GitHub fail the run at startup (0s, no jobs).
**Root Cause**: `functions/package-lock.json` was never regenerated after a dependency bump (`@types/express` tree unsatisfied), `engines.node` stayed on EOL 18, and the App Hosting rewrite dropped the old hosting config without adding a `functions` codebase. GitHub's validator rejects `secrets` in job-level `if:`.
**Fix**: Regenerated the lockfile, bumped `engines` + workflow to Node 20, added `functions: { source: functions }` to `firebase.json`; exposed secret presence as job `env` (`HAS_WIF_SECRETS`) and gated only the auth/deploy steps on it.
**Prevention**: Run `npm ci` in `functions/` after any dependency change; keep `engines` and the workflow's `node-version` in sync; any `firebase deploy --only <target>` needs that target in `firebase.json`. Never use `secrets` in job-level `if:`: use the env + step gate and run `actionlint .github/workflows/`.

---

## Fixed

Historical fixes with no live action; kept so the ground isn't re-covered. Full detail in git.

- **2026-08-24** — `console`: `adminOnlyGuard` was a `return true` stub; now awaits `auth.whenReady` and redirects non-admins (`29b5d6d`; `AGENTS.md` warns not to re-fix).
- **2026-08-24** — `gdpr`/`about`: Firestore read failures rendered identically to an empty document; added `isError`/`hasError` + a retry action (`ba95758`).
- **2026-08-24** — `console`/`profile`: the duplicated bulk-action pattern was extracted to `useBulkActions` (`873202f`, inferred).
- **2026-09-22** — `AGENTS.md`: it documented a `postGraphQL()` helper that never existed; it now names `inject(GraphQLClient).request(query, variables, headers)` for writes.
- **2026-10-20** — `about`: after the accessibility pass turned section titles into `h2`s they kept the `h1`'s `text-2xl font-bold`, so `/about` had no visible hierarchy (`e235183`: section `h2` `text-lg font-semibold`, page `h1` `text-2xl font-bold`, intro `text-base max-w-prose`). Rule: when you change a heading's tag, re-size it to the app convention (`h1` `text-2xl font-bold`, section `h2` `text-lg font-semibold`, `text-base` inside a card) and compare with other pages.

---

## Cross-Component Opportunities

> Four shared capabilities are repeatedly needed (non-AI 1–3; AI 4). Build each utility **once**,
> then apply it to every listed feature. Numbering follows `docs/COMPONENTS.md` (non-AI items 1–3;
> item 4 here is the AI-gateway item of its AI list; its non-AI bulk-actions item 4 is tracked there
> only). Dates are catalogue dates (2026-08-13 per-feature audits; 2026-08-24 fixes), compiled from
> `docs/COMPONENTS.md` and `docs/components/*.md`. The helpers for 1–3 now exist (status as of
> 2026-10-21); the per-feature bullets list only the features that have not adopted them.

### 1. Shared URL / query-param sync — `core/url-state/query-param.util.ts` — 7 features not yet adopted

The helper exists (`readEnumQueryParam`, `readTextQueryParam`, `queryParamForWrite`, `writeQueryParams`: pure read helpers, one browser-gated merge/replace write; a default is never written to the URL). It is adopted only by `home` (`?view=`/`?sort=`/`?line=`/`?q=`: `home-view-mode.service.ts`, `pro-dashboard.component.ts`, `network-board.component.ts`). Spotting's `line-overview.page.ts` still encodes `sort`/`dir` inline (and `line-details.page.ts` reads query params directly) rather than via the helper. There is no signal-binding wrapper (`syncSignalWithQueryParam` does not exist). Elsewhere only path params are bound.

- **console** — shareable/saved moderation filter views (e.g. "unread depot spottings with notes"); `ConsolePage` does not inject `ActivatedRoute`; filter state lives only in local signals.
- **gdpr** — deep-link to an individual checklist item; `group.title`/`child.title` are used as `@for` track keys but not rendered as element `id`s.
- **about** — anchors for the three content sections (projects, personnel, tech stack); `AboutPage` takes no route params.
- **spotting** — `VehicleSpottingGridComponent`'s `statusFilter`/`months` (owned by `line-details.page.ts`) are plain local signals; `months` is a computed date range, not a flat enum, so it needs custom encoding (e.g. ISO month key).
- **insiden** — `detailsExpanded`/`photosExpanded` in `IncidentCardComponent` are local signals; day selection already round-trips (`/insiden/:dateKey`).
- **tracker** — shareable map view: `LayerSelectionService`'s applied (layer) signals plus viewport (center, zoom) are not synced.
- **gallery** — the route already syncs `selectedMedia` to `/gallery/:mediaId`; only a copy-link button is missing in `MediaViewerComponent`.

**Prevention**: handle encoding/decoding, default omission, browser-only writes, SSR safety; make query-param sync a required acceptance criterion for any new filterable view.

### 2. Shared client-side export utility — `core/export/csv.util.ts` — 4 features not yet adopted

`toCsv` (pure; always emits a header row, even for zero rows) and `downloadCsv` (browser-gated) exist. Their only consumer is home's Pro lines widget (`home/pro/pro-lines-widget.component.ts`); the tracker info panel still keeps a private `toCsv` (`tracker/info-panel/tracker-info-panel.component.ts`). No JSON, `.ics` or zip helper exists. Data is already resident client-side in every case — no backend/query changes needed.

- **console** — export the filtered moderation queue (`events: Signal<ConsoleEvent[]>`).
- **profile** — export spotting history (`_eventsSignal`).
- **insiden** — `.ics` calendar feed; `CalendarIncident` already carries start/end datetime, title, brief.
- **gallery** — bulk download of a year's photos as a zip; evaluate client-side fetch-and-zip vs. a backend batch-export endpoint by expected volume.

**Prevention**: extend `core/export` (add `toJSON<T>()`, `toICS(events)`, a generic blob download) instead of a private per-feature helper, and move the tracker's `toCsv` onto it; add export as a standard capability for any data-table / media-grid; add "Add to calendar" for date-based lists.

### 3. Shared persistence — `core/preferences/preferences.service.ts` — 3 features not yet adopted

`PreferencesService` exists (localStorage key `rosak:preferences:v1`; typed fields: pinned lines, view mode, recent/last-reported lines, Pro table layout/sort; hydrated in `afterNextRender`, see the 2026-10-03 entry). Home is its only consumer, and it is a typed home-shaped payload, not a generic `get`/`set`/`watch` API (`UserPreferenceService` does not exist). The only other persistence is the upload queue's upload-specific IndexedDB.

- **tracker** — save/favorite layer presets; the `LayerSelectionService` draft/applied/undo signal triplet is the seam (otherwise state resets to `layer-config.ts` defaults on reload).
- **spotting** — persist report-form drafts (sessionStorage) so closing the sheet doesn't lose the in-progress report (an `effect()` currently calls `clear()` on close).
- **profile** — store settings for the proposed settings sub-page.

**Prevention**: extend `PreferencesService` (validate each stored field independently) rather than adding another storage wrapper, and keep its SSR rules (read in `afterNextRender`, gate writes on hydration); optional Firestore sync is still unbuilt.

### 4. Shared AI / LLM gateway — `AiGatewayService` (`core/ai`) — 9 features

Every feature doc independently proposes an LLM-/embedding-based feature (captioning, summarization, anomaly detection, NL query parsing, conversational form-fill), but there is no AI infrastructure — no `core/ai` service, no LLM API client, no embeddings store (still true 2026-10-21).
**Prevention**: establish a provider-agnostic gateway (auth, rate-limiting, caching, streaming) before any AI feature; all features inject the same gateway — no bespoke integrations.

---

## Prevention Checklist for Future Work

- [ ] **Security** — never leave guards in pass-through state; track as a blocking issue.
- [ ] **Error handling** — every async subscription needs an error signal + error UI + retry.
- [ ] **Code review** — check for duplicate patterns across features; extract to `core` on the second occurrence.
- [ ] **Documentation** — update component docs when fixing systemic issues so future audits don't re-discover.
