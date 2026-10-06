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

## [2026-10-07] features/home: wrapping a control or chip in an `InfoPopover` / `StatusInfoChip` host relocates it in the DOM — re-scope ancestor queries and cluster-order assertions

**Problem**: Wrapping `line-card-pin` / `line-row-pin` in `app-info-popover`, and `line-row-vehicles` in
`app-status-info-chip`, inserted a host element between each node and its former parent. Specs that had
asserted the action cluster via `pin.parentElement`, or counted `[data-testid]` under that parent, now
targeted the wrong node; and the row's `root.querySelector('[data-testid="line-row-meta"]
app-info-popover')` — written when the report tally was the strip's only popover — silently started
matching the **vehicle chip's** injected host instead.
**Root Cause**: Both wrappers project (or stamp, via `triggerTpl`) their content inside a component host
(`<app-info-popover>` is `class="relative inline-flex"`) and inject their own trigger markup into the
subtree — a `<button>` in the default/projected mode and for the chip, an `inline-flex` `<span>`
wrapper in the pin's `triggerTpl` mode. So a wrapped element's `parentElement` / `closest(...)` graph
changes, and any ancestor-scoped `querySelector` can now match the wrapper's host rather than the
consumer's element.
**Fix**: Re-scoped the assertions in `line-pulse-card.component.spec.ts` and
`line-pulse-row.component.spec.ts` — cluster order/parent checks go through
`pin.closest("app-info-popover")`, and the meta strip's report popover is reached from
`line-row-reports`' own `closest("app-info-popover")` instead of `line-row-meta app-info-popover`. No
template or logic change; the runtime behavior was always correct.
**Prevention**: before wrapping an existing `data-testid` element in a host component, grep the specs
for that testid's `.parentElement`, `closest(...)` and ancestor-scoped `querySelector`. A wrapper
relocates the node AND adds its host plus injected children to every ancestor query that spans it.
Prefer querying from the target's own `closest(...)` chain over a shared ancestor, and assert "no
popover here" against the specific element rather than the whole strip once a sibling may carry one.

## [2026-10-07] ui/info-popover: `ng-content` inside an `ng-template` stamped by `ngTemplateOutlet` silently renders EMPTY in the real app (and passes the whole unit suite) inside an `ngSkipHydration` component

**Problem**: The intermediate `bareTrigger` implementation — an `ng-template` wrapping `<ng-content/>`
stamped by `ngTemplateOutlet` — passed the entire unit suite, including dedicated bare-mode specs, but
the live DOM showed `<span class="inline-flex"></span>` with zero pins. The server HTML was correct and
the default-branch projections rendered fine in the same client runtime, yet the failure reproduced on
both hydration re-render and client-side navigation.
**Root Cause**: Projection inside an embedded view stamped under an `ngSkipHydration` component is not
reliable at runtime: the construct re-renders without materialising the projected nodes. Unit tests and
SSR never exercise that path, so nothing failed until a browser did it.
**Fix**: replaced with the `triggerTpl` input — a plain `ngTemplateOutlet` stamping consumer markup that
contains no projection (one raw `ng-content` remains only in the default button branch).
**Prevention**: for an opt-in alternate trigger shape, pass a `TemplateRef` input rather than moving
`ng-content` into an `ng-template`. And for this repo: unit tests alone did not catch it — any
`InfoPopover` structural change must be confirmed against the running dev server.

## [2026-10-06] spotting: the month label's right-edge clamp had no month floor — it pinned and got "covered" instead of being pushed away

**Problem**: In the line-details vehicle-spotting grid header, the month label behaved asymmetrically
while scrolling horizontally. At the left boundary it pinned to the viewport edge, then was pushed away
by the month's trailing edge (correct). At the right boundary — entering from the right while scrolling
forward, or exiting through it while scrolling back — it pinned to the viewport edge and was
progressively clipped by its own `<th>` (read as "covered"), and entering from the right only got
revealed instead of sliding in.
**Root Cause**: `VehicleSpottingGridComponent.monthLabelShift` hand-rolls `position: sticky; left;
right` (the header table is translated, not scrolled). Its lower clamp was month-bounded
(`Math.max(monthStartPx, viewLeft)`) but its upper clamp was not
(`Math.min(monthEndPx, viewRight) - labelSpace`). Within one label-width of the month's leading edge,
the final `Math.min` won over the lower clamp, positioning the label LEFT of its own month box — where
`<th class="overflow-hidden">` ate it mid-slide.
**Fix**: floor the upper clamp at `monthStartPx` (`Math.max(min(monthEndPx, viewRight) - labelSpace,
monthStartPx)`), so both clamps are month-bounded and the viewport only moves the label within its own
month; the label now rides the leading edge in and out, mirroring the trailing edge on the left.
Geometry specs pin both directions, the two viewport pins, centered rest, and a full-range sweep.
**Prevention**: when one clamp is bounded by a containing box, bound the opposite clamp by the same
box's other edge — an over-constrained `min(max(...))` silently prefers the LAST clamp applied (the
`min`), so a missing floor shows up as "pinned then clipped", not as an error. If the element is
clipped by anything (`overflow-hidden`), assert the box invariant across the whole input range in
tests rather than eyeballing two example scroll positions.

## [2026-10-06] ui/info-popover: a consumer-side `hidden sm:inline` on an `<app-info-popover>` cannot hide it — the host's OWN display utility wins the tie

**Problem**: the compact row's new `N reports (X this hour)` label had to disappear below `sm`, so it
was given `class="hidden sm:inline"` on the `<app-info-popover>` element itself. It did not hide. The
label stayed on screen at 390px, and the spec that asserted `hidden` on the host element passed anyway —
jsdom computes no styles.
**Root Cause**: `InfoPopover`'s host binding is `class="relative inline-flex"`, and Tailwind emits
`.inline-flex{display:inline-flex}` **after** `.hidden{display:none}` in the compiled stylesheet
(verified in `dist/web/browser/styles-*.css`: offsets 12217 vs 12138). Both are single-class utilities, so
they have equal specificity and the LATER one wins — there is no consumer-side display utility that can
beat a component host's own display utility, however specific the responsive variant looks.
**Fix**: `e92016c` — the popover is wrapped in a plain `<span class="hidden sm:inline"
data-testid="line-row-reports-wrap">`. A wrapper carries no competing display utility, so `hidden` is the
only rule that touches its `display`. The spec asserts the wrapper holds both tokens AND that neither the
projected span nor the popover host carries `hidden`.
**Prevention**: never put a `display` utility (`hidden`, `block`, `flex`, `inline*`) on a component host
to gate that component responsively — check the host's own class first (`grep -rn "class=\"" <ui
component>`), and wrap the component in a plain element to gate it. This is the sibling of the
`"never override a directive host class from the template"` entry below: in both cases the component
owns its display and the consumer must wrap rather than compete. Confirm in a real browser, since
jsdom will never resolve the tie.
**Same-day sibling (spotting)**: the line-details activity-bar back chevron carried a static
`inline-flex` NEXT TO a bound `[class.hidden]` gate on the SAME element — same tie, same winner
(`.inline-flex` after `.hidden`), so the chevron rendered before its handoff. First fixed by binding the
display class as a pair (`[class.hidden]` + `[class.inline-flex]`, never both); the final polish removed
the display toggle entirely — the chevron's footprint collapses (`w-0`/`w-7` bound pair + `-mr-2`) and
animates open on the handoff (`opacity`/`translate`/width via `transition-all`), staying `inert` +
`aria-hidden` while hidden — which removes both the early render and the layout bump, while leaving
flush-left headings untouched. E2e pins `opacity: 0`/`width: 0px`/`inert` pre-handoff and
`opacity: 1`/`width: 28px`/no-`inert` after. Rule of thumb: when one class of a pair must beat another,
bind BOTH — or better, don't let the two coexist at all — never rely on a static utility losing a
cascade tie.

## [2026-10-06] testing: `ng test --filter` matches TEST NAMES, not paths — a typo is a SILENTLY GREEN zero-test run

**Problem**: while verifying the round-3 board change, `npm test -- --no-watch --filter "network-board"`
matched **0 tests**, reported every file as skipped, and **exited 0**. It read as a passing run of the
suite under change when it had in fact executed nothing. The correct pattern (`--filter
"NetworkBoardComponent"`, the spec's `describe` name) ran 32 tests.
**Root Cause**: the filter is a regex against the test NAME, not a file path — and the runner does not
treat an empty match as an error, so the exit code cannot distinguish "everything passed" from "nothing
was selected". Every other agent in this repo's history hit the same thing (the `line-pulse-card` case
had the identical symptom one commit earlier).
**Fix**: filter on the describe/test name (`--filter "NetworkHeatStrip"`, `--filter "LinePulseRow"`,
`--filter "PreferencesService"`) and confirm the run count is non-zero; a scoped run was always followed
by the full `npm test -- --no-watch` before the change was called done.
**Prevention**: **treat a 0-test filtered run as a failure**, not as a green one — check the reported
test count before reading anything else in the output, and grep the spec's `describe(...)` for the string
instead of guessing from the filename (`line-pulse-card.component.spec.ts` describes
`LinePulseCardComponent`, `network-board.component.spec.ts` describes `NetworkBoardComponent`). The full
suite's file/test count is also the only reliable regression signal.

## Traps

### [2026-10-03] core/preferences: a storage-backed signal service has TWO races with hydration — one throws NG0500, the other silently destroys the stored state

**Problem**: `PreferencesService` was built on the `ThemeService` pattern — signals plus a
`localStorage` read in the constructor. Two separate failures follow from that shape in an SSR app:
(1) reading storage in the constructor means the client's first paint already has the rider's
pinned lines while the server HTML never could, so hydration throws `NG0500` for any rider who had
ever pinned anything (and not at all for a fresh rider, which is the worst kind of bug); (2) the
persist `effect` fires on its FIRST run, which happens _before_ the read has landed, so the service
writes the empty defaults over the real stored payload — silent, no error, and it looked like the
storage layer was simply not working.
**Root Cause**: two different orderings, one trap. The constructor read is synchronous and
unconditional, so it necessarily runs on the server; and an `effect`'s first run is not a
"change", it is the initial scheduling — gating only on a signal _change_ (rather than on having
hydrated at all) does not stop it. Neither `ThemeService` nor any other existing service in the repo
hits this because none of them is written defensively: `ThemeService` reads storage in its
constructor too, so it has the same first exposure and simply has not been caught yet (its stored
value is a single enum, so a mismatch degrades to a wrong theme for one frame instead of throwing).
**Fix**: the service constructs on the **defaults** and hydrates inside `afterNextRender`, which
does not run on the server at all; the persist effect is gated on a private `_hydrated()` flag set at
the end of that same pass. Stored fields are validated **independently** (corrupt JSON, a non-object
payload, an unknown enum value and a wrong-typed id each fall back on their own) because a
half-recognisable payload is the common case when a shape changes, not an edge case.
**Prevention**: in an SSR app, a storage-backed service must treat the constructor as
**server**-capable and the first effect run as **pre-hydration**. Read in `afterNextRender`
(or `afterRenderEffect`), gate every write on "have I read yet", and **spec it with
`{ provide: PLATFORM_ID, useValue: "server" }` plus `vi.spyOn(Storage.prototype, "getItem"/"setItem")`
asserting NEITHER is ever called** — a jsdom TestBed runs as a browser by default and will never
catch either failure. See also the sibling rule for anything a _reactive_ `router.navigate()` does
during SSR: it hangs the render, so the browser guard belongs at the call site too.

### [2026-10-02] build: a Tailwind arbitrary variant starting with `@` does not compile in an Angular template — and the dev server will serve you a STALE bundle while you chase it

**Problem**: a short-viewport rule on the 404 page was written as the obvious utility,
`[@media(max-height:640px)]:static` on the footer wrapper. The build failed with
`TS1005: ',' expected` / `TS1135: Argument expression expected` and **no** line pointing at the class.
Worse, the dev server did **not** reload — it kept serving the previous bundle with no HMR update
logged, so two rounds of browser measurements confidently "verified" a class that was never in the
DOM (`document.querySelector(...).className` came back without it, which was the only real clue).
**Root Cause**: inside a template **Angular** parses the attribute, and `@media(...)` reads as an
`@` control-flow block (`@if`/`@for`/`@switch`), not as text. The natural escape — writing `&#64;`
so Angular decodes an entity instead of a block — then defeats **Tailwind**, whose scanner sees the
entity rather than the variant and generates no rule. There is no spelling that satisfies both
tools. (The same class of bug as the sibling entry below: a template is not a string.)
**Fix**: the rule moved to the component's own `styles` array, scoped by emulated encapsulation —
whose attribute selector is precisely what lets it beat the `fixed`/`pb-28` utilities it overrides
(specificity 0-2-0 vs 0-1-0, not source order). Tailwind utilities stay the primary styling; the
one case a utility cannot express is the one case that gets hand-written CSS.
**Prevention**: never put `@`-leading syntax in a template attribute. For a **height**-based media
query, reach for a component `styles` block (or `src/styles.css`) from the start — Tailwind has no
built-in height variant, and `max-[600px]:`-style shorthands are **width**. When a dev server
appears not to pick up a template edit, verify the class is actually on the element before drawing
conclusions from what you measure; if it is missing, restart and clear `.angular/cache` rather than
interpreting stale measurements.

### [2026-10-02] ui/ad-slot: `InfoPopover` tracks hover on its HOST, so a stretched flex child makes the WHOLE ROW a hover hotspot

**Problem**: on every ad unit, hovering anywhere across the "Advertisement" caption row popped the
disclosure panel open — not just the caption — and the "i" glyph sat to the LEFT of the wording with
no padding, so the real trigger was a ~90px sliver of 10px uppercase text.
**Root Cause**: `InfoPopover` binds `(mouseenter)`/`(mouseleave)` on the **host** element, by design:
the panel is an absolutely-positioned DOM descendant, so host-level tracking keeps it open while the
cursor crosses onto it. The ad slot placed that host as a child of its unit's `flex flex-col`
wrapper with only `justify-center`, and a flex item's default `align-self: stretch` made the host
**full width** — so the hover area silently became the entire row, hundreds of pixels wider than the
trigger the reader sees. Nothing was broken; the hotspot was simply the box, not the pill.
**Fix**: the host is now `self-center`, which is what makes a flex item fit its content (the caption
stays row-centered, so the `align="center"` panel lands exactly where it did). The glyph side and the
pill's padding became shared, documented `InfoPopover` extension points — `iconPosition:
"start" | "end"` (default `"start"`, so every other consumer is unchanged; `"end"` moves the node in
real DOM order, not just painted order) and `triggerClasses` (merged _after_ the trigger button's
base classes, so `cursor-help`/the focus ring/`rounded-full` can never be lost) — and the ad slot
passes `px-2 py-0.5 transition-colors hover:bg-muted/60`.
**Prevention**: whenever a component tracks hover on its HOST, audit the host's **box**, not just
the visible trigger: if the host is a flex/grid child, check `align-self` (a stretched child swallows
the whole row) and the panel's own padding (`mt-1.5`, which needs the host to overlap the gap).
Prefer extending the shared primitive with a documented input over hand-rolling a second glyph or a
second pill of CSS in the consumer. jsdom cannot see any of this — it asserted the layout as
"correct" for weeks — so hover-area changes must be checked with real pointer moves against the dev
server.

### [2026-10-02] console/insiden: `[title]="… ?? null"` is not an absent title — a property binding coerces the null to the literal string `"null"`

**Problem**: every **enabled** Move up / Move down button on `/console/links` showed a tooltip reading
literally `null` on hover. The buttons were not meant to have a title at all when they work — "no reason
is known" is the whole point of the `null` — so the defect appeared only on the controls that were
behaving correctly, which is why it survived a spec suite that asserted the _disabled_ copy.
**Root Cause**: `[title]` is a **property** binding. Angular writes the expression's result onto
`element.title`, and the DOM `title` IDL attribute is a `DOMString`: `null` is coerced to the four
characters `"null"` rather than removing anything. There is no spelling of a property binding that
expresses "no value" — only `[attr.title]`, which maps to `setAttribute`/`removeAttribute`, and whose
`null` **removes** the attribute. The pattern is a trap because the code reads as correct and the
template compiles cleanly; `strictNullChecks` is off in this repo, so nothing in the type system objects
either, and the failure mode is a cosmetic string in a tooltip rather than an error.
**Fix**: `dcde12a` — both move buttons now bind `[attr.title]="moveBlockedReason(link, 'up') ?? null"`.
`moveBlockedReason` still returns `string | null` (the `null` is the honest "this works" answer and the
template must not restate the conditions), so the only change is which half of the API carries it. The
sibling `[attr.title]` on `nest-under` deliberately keeps a non-null fallback string, because that button
is drawn only when its precondition holds and a target-less row still deserves an explanation.
**Prevention**: any DOM attribute whose value is genuinely optional — `title`, `aria-label`, `alt`,
`data-*` — binds as `[attr.*]`, never as `[prop]`. Reserve the property binding for properties where
`null` has meaning (an actual `@Input()`, a `disabled` state). When a "reason" function returns
`string | null`, the null branch is a **rendering** decision, and `attr.` is the spelling that can make
it. Worth a look whenever a tooltip reads as a word rather than a sentence: a stray `null`/`undefined`
in user-visible text almost always means a property binding where an attribute binding was needed.
**Follow-up (2f5bd09)**: the move/nest verbs are **icon-only** buttons now, and each `title` binds
`reason ?? help` — so both branches are non-null strings and the bug above can no longer show through
them. `attr.title` is **retained anyway**, because `moveBlockedReason` still returns `string | null`
and the guard has to survive whoever widens it next; that is the durable form of the rule, since a
binding is only as safe as the type it is handed.

### [2026-10-02] console/profile links: a targeted nest was gated on the UNTARGETED verb's minimum, so the basic tree operation was impossible

**Problem**: "Nest under…" was disabled for a one-link selection, so an admin could not nest a single
link under another — the way a conversation gains its first child — and the whole feature read as
"never clickable" in the browser. The same report covered Move up/down, which were disabled because the
queue defaults to Status **Pending** and `queueIsComplete` refuses any filtered queue by design.
**Root Cause**: `groupSocialMediaLinks` is ONE mutation with TWO modes, and the frontend inferred one
shared precondition from that: `canGroup` (>= 2 distinct ids) was reused for `canNestUnder` /
`_nestReason`. The two-tick minimum is only true of the **no-target** mode, where a single link has
nothing to hang off, is elected as its own root, and renders as no conversation. WITH a `parentId`, one
id is a real re-parent — the backend `_normalize_ids` refuses only the empty list, and its own tests
nest single ids (`group_social_media_links(link_ids=[c.id], parent_id=b.id)`). The console's second half
was reachability rather than correctness: the gate is a signal written from the applied filter snapshot,
and the "clear the filters" copy described an action the UI did not offer — `Reset` restores the queue
default, which IS Pending, so the enabled state was one dropdown change away and not discoverable.
**Fix**: `84b9202` — `canNest` (>= 1 distinct id) added to `link-thread-selection.util.ts` and used by
both surfaces; the console toolbar hint split into its zero-tick and one-tick spellings; the reorder
hint gained `reorder-show-all` (`showAllLinks()`), which clears every filter, Status included, and
reloads through the same `applyQueueFilters(completed)` writer `resetFilters()` uses.
**Prevention**: When one mutation or method has modes, derive each mode's precondition from **that
mode's** server contract rather than reusing the other mode's helper — a targeted write is usually
satisfied by fewer inputs than an untargeted election. And when a precondition is a state the UI cannot
reach from a default view, the gate needs a named ACTION, not prose: a disabled button with a reason is
only honest if the reason describes something the admin can actually do.
**Follow-up (`dcde12a`)**: the greyed-out-control half is now gone rather than explained. Move up / Move
down are **not drawn** until `queueIsComplete()` and Nest under… not drawn until the first tick (the
underlying gates are unchanged, so a programmatic caller still gets refused), and "Show all links" is
**never disabled** — so the complaint that produced this entry can no longer be reported as a dead
button, only as a missing one, which is honest.

### [2026-10-01] core/polling: re-applying the CURRENT `intervalMs()` restarts a paused beat by re-applying the pause — a disarmed timer needs a real `resume()`

**Problem**: leaving the home page (`/` → about) and coming back **permanently deleted the refresh
control** — no spinner, no "Refreshing in Xs", for the rest of the session. Only a manual click still
worked. Landing on `/` from somewhere else for the FIRST time was fine, which is what made it read as
a rendering bug rather than a lifecycle one.
**Root Cause**: a route-scoped provider does **not** die with the component that injects it. The
router retains the `""` route's injector while `HomePage` is recreated on every visit, so the SAME
`HomeStore` survived the visit: `HomePage.ngOnDestroy` → `store.stop()` → `polling.setIntervalMs(null)`
paused the 30s beat, and the next `HomePage` constructor → `store.start()` re-applied the pause itself
via `setIntervalMs(this.intervalMs())`. From then on nothing was ever scheduled, and because
the countdown branch is `@if (store.polling.intervalMs() !== null)`, the paused state renders as
_nothing at all_ — the control did not go stale, it was deleted, with no error and no failed request
anywhere. The obvious spelling reads as "make sure it is running"; on a paused source it is exactly
the statement that keeps it paused. `null` is overloaded in this API: "never" and "right now, not
me" are the same value, so the round trip is indistinguishable from an intentional never.
**Fix**: `7221ff6` — `PollingSource` tracks `lastEnabledIntervalMs` (the last non-null cadence,
defaulting to 30s) in `setIntervalMs()` and gains **`resume()`**, documented as the only exit from the
paused `null`: it re-arms at the last named cadence (the 30s default if none was named) and is safe on
an already-running beat (it restarts the countdown, no duplicate timers). `HomeStore.start()` returns
early on the server and, when `polling.intervalMs() === null` (i.e. the retained-store re-entry), calls
`resume()` **and** `reloadFirstPages()` — so the returning reader gets a live countdown AND fresh
first pages rather than the previous visit's rows. On a first mount it is deliberately a no-op:
`PollingSource` schedules itself in its constructor and the resources' constructor reads are the
initial fetch. `stop()` is unchanged. Pinned by `polling-source.spec.ts` (resume at the last named
cadence, at the 30s default when none was named, and no duplicate timer on a running beat),
`home.store.spec.ts` (start-after-stop resumes at 30s, re-reads page one of all three resources, and a
first `start()` issues no second batch), and `home-refresh-control.component.spec.ts` (the countdown
text returns against a real `HomeStore` after a stop→start).
**Prevention**: a timer that can be disarmed must expose a **real resume** — a separate verb, with
the paused value never round-tripped through the setter, because `null` means both "never" and "not
me" and only one of those is a value you can pass back in. Corollary, and the half that was believed:
**never assume a route-scoped service dies with the component that injects it.** The router keeps the
route injector alive across visits of the same route, so `constructor`-time setup / `ngOnDestroy`-
time teardown pairs are asymmetric — anything a `destroy` disarms, the next `create`-side call must
re-arm, and it must also re-validate whatever it took for granted about the reader being new. Test the
cycle, not the entry: `stop()` then `start()` on ONE instance is the only shape that exercises this
(at least two specs here now do), and a "restart" spec that builds a fresh component each time passes
against the broken code.

### [2026-10-01] ui/forms: signal-forms' `required` is a NATIVE `required` — a `<form>` without `novalidate` never fires `submit`

**Problem**: clicking "Submit Link" on an empty URL field in the home feed's quick submit box showed
the browser's own validation bubble, and the component's `submit()` **never ran**. The change that
had been asked for — reveal the "Enter a URL" note on submit, not on blur — was impossible to
satisfy as specified until this was found, because the path to the handler was being cut off one
layer below Angular.
**Root Cause**: the signal-forms `FormField` directive mirrors the schema's `required(...)` onto the
DOM, so the rendered input's `outerHTML` carries `name="…url"` **and** `required=""`. HTML
constraint validation runs BEFORE the form's `submit` event: a form containing a constraint-invalid
control does not dispatch `submit` at all — it fires an `invalid` event on the control and shows
the bubble. The abort is therefore invisible from the component: no error, no rejected promise, no
console message, and the handler's own error UI is simply unreachable. Verified empirically
(throwaway spec + node/jsdom script): `input.checkValidity() === false`,
`form.checkValidity() === false`, and `submit` events fired by a submit-button `.click()`: **0**;
clear `required` first and it is 1. jsdom behaves the same way, so this one _does_ reproduce in a
unit test — only the bubble itself is browser-only.
**Fix**: `403bd1e` — `novalidate` on the `<form>`, so the submit-gated inline note owns the message
and there is exactly one error surface. It went with submit-gating the message (a local
`submitAttempted` signal in place of `touched()`, which `FormField` sets on blur) and with a new
optional `errorVisible` input on `HlmInput` to carry that gate to the border/`aria-invalid`.
**Prevention**: every signal-forms `<form>` with a manual `(submit)` handler needs `novalidate` (or
the `FormRoot` directive, where that is the pattern). **Verified still missing** — same latent
short-circuit, one word each, left alone on purpose:
`insiden/link-form/link-form.component.ts:75`,
`insiden/incident-form/incident-form.component.html:8`, and
`console/insiden/pending/pending.component.html:258` (its panel edit binds the same
`incidentFormSchema`, so `title`/`brief`/`startDatetime`/`severity` are all natively `required`).
**Verified NOT affected**, so nobody has to re-derive it: `spotting/report-form` renders no `<form>`
element at all — its host sheet's footer calls `reportFormRef.submit()` directly, which never goes
through the browser's submit path — and both `console/insiden/links/links.component.html:666` and
`home/line-status/line-status-sheet.component.ts:105` are plain `[value]`/`(input)` forms with their
own state, not `FormField` ones, so nothing is reflected onto the DOM. ⚠️ Signature worth
recognising: a form can work from the keyboard and be broken from the button, because Enter-in-a-field
calls the handler directly and bypasses native validation entirely. If one entry point works and the
other does nothing at all, suspect the form, not the handler.

### [2026-10-01] ui/animation: an inline `animation` SHORTHAND resets `animation-direction` — the class beside it is dead markup

**Problem**: the home refresh control's new "Updating" spinner rendered CLOCKWISE. The intent was a
slow 3s counter-clockwise spin — the one direction nothing else on the page animates in, so "the page
is working on it" never reads as "the countdown is running".
**Root Cause**: `style="animation: spin 3s linear infinite"` is the **shorthand**, so it resets every
animation sub-property it does not name — `animation-direction` included, back to `normal`. Being
inline, it also outranks a class, so the `[animation-direction:reverse]` utility on the same element
lost twice over and the computed value was `"3s normal spin"`. Nothing in the class list or the
attribute was wrong; the class was never reached. ⚠️ **jsdom computes no styles**, so no spec, no
snapshot and no class assertion can catch this class of defect — it was found by reading
`getComputedStyle` in a real browser, and a green suite is not evidence either way.
**Fix**: `86cae7e` states the direction **inside** the shorthand —
`style="animation: spin 3s linear infinite reverse"` (computed `"3s reverse spin"`) — keeping the
class for markup parity. The spec pins `reverse` inside the inline style string for exactly this
reason: a class-only assertion would pass against the broken version.
**Prevention**: never split one animation's direction (or fill mode, iteration, timing function)
between an inline shorthand and a class — put everything in the shorthand, or use longhands **after**
it. A shorthand plus a "just in case" class is two sources of truth for a single computed value and
the inline one always wins. Still carrying the class-only pattern, all **deliberately unchanged** —
check what each is meant to do before touching it: the countdown's own 1s spinner
(`home/refresh-control/home-refresh-control.component.ts:133-134`, whose clockwise 1s IS the intended
behaviour), `spotting/line-details/insiden-section/insiden-section.component.ts:70-71`,
`spotting/line-details/situasi-section/situasi-section.component.ts:85-86`, and both spinners in
`tracker/status-card/layer-checklist.component.ts:157-158,330-331`. (`tracker/map/tracker-map-skeleton.component.ts`
uses `animation-delay` longhands and is not in this class at all.)

### [2026-10-01] insiden/vote-button: a `linkedSignal` display re-seeds from EVERY input, including the host's echo of your own value

**Problem**: clicking upvote made the arrow light up and the score + breakdown **snap back** to
their pre-click numbers ("the indicator updates weirdly"). Reproduced on the home feed, /insiden
and the situasi tab, on all three vote targets.
**Root Cause**: two causes compounding. (1) Every vote mutation returned `{ ok }`, so the client
had to _project_ the new score — which races its own echo and every other voter. (2) The display was
a `linkedSignal` seeded from the inputs, and `linkedSignal` re-seeds whenever **any** dependency
changes. The hosts mirror the value they were just told back down as their `userVote` overlay, which
changed an input whose siblings (`netScore`/`upvotes`/`downvotes`) still carried the pre-vote
numbers — so the control threw away its own projection and re-read the stale half. A `linkedSignal`
is the right tool for "the server refetched, re-seed from it" and the wrong tool for "I optimistically
updated this and the host will echo the value back".
**Fix**: the backend's nine vote mutations acknowledge with `VoteMutationPayload` (`ok` retained plus
`userVote`/`voteScore`/`upvotes`/`downvotes`) and the display is three layers — `optimistic` →
`confirmed` → `hostState` — a `computed` rather than a `linkedSignal`. `confirmed` is honoured only
while `voteStatsKey(hostState())` matches the counters it was computed against, and that key
**excludes `userVote`**. Backend: `rosak_backend` 2026-10-01, the same date.
**Prevention**: when a control is fed BOTH a value it just emitted and the statistics that value
implied, its staleness test must key on the statistics and must exclude the echoed value. Also: a
mutation that changes a displayed aggregate should return the new value rather than `ok` — `ok`
forces every client into the same race. `home.queries.spec.ts` now parses all nine documents'
selection sets for the same reason: a document narrowed back to `{ ok }` compiles fine and every
fixture mocks the response rather than reading it.

## [2026-10-01] insiden/link-card: a chip row inside the `<a>` is why the conversation chip could not join it

**Problem**: the "N links" conversation indicator sat alone in the right-hand rail, visually
disconnected from the Official / line-code chips it belongs beside, even though the chip row was
always the better slot.
**Root Cause**: the chip row was a descendant of the card's `<a>`, and a `<button>` inside an anchor
is invalid HTML whose click also navigates. The previous wave resolved this by moving the indicator
to the rail and documenting the placement as deliberate — correct, and it hid the real cost: the
whole link body had to be inside the anchor for the chips to be clickable at all, which is what
forced the compromise.
**Fix**: a **stretched link** — the anchor became an `absolute inset-0 z-0` overlay across the left
column, the body and chip row became `pointer-events-none relative z-10` layers above it, and the
toggle re-enabled hit-testing with `pointer-events-auto`. The chip row is now a sibling of the
anchor, which is what the card's own "controls are siblings, never children" rule actually asks
for, and the chips stay clickable because clicks fall through to the anchor. Two costs are
documented in the component header and are not free: an element under an overlay cannot have a
hover tooltip (the chips' `title` explanations became `sr-only` text) and the title is no longer
mouse-selectable.
**Prevention**: when a rule reads "X must be outside Y", check whether restructuring Y is cheaper
than relocating X — the constraint usually names a symptom. And when a click-through overlay is
introduced, audit the descendants for `title` tooltips and text selection: both are casualties, and
the fix is to move the information into the accessibility tree rather than leave a dead attribute.

## [2026-10-01] insiden/link-thread: a PERMUTATION API needs the STORED order, not the order the rows happen to arrive in

**Problem**: `reorderSocialMediaLinks(linkIds, parentId)` is a **permutation of one existing sibling
set**, not a move: backend `social_link_threads.py::_reorder_sync` renumbers the ids it is _sent_ to
`10, 20, 30, …` in the order they arrive and leaves every sibling it was not told about after them.
A payload built from the row array's own order is therefore a completely different request — and
because the server writes the list verbatim, it **succeeds and reports OK**. The concrete failure
shipped in both sequence surfaces (`/console/links` and My Submitted Links): the list arrives
`occurredAt DESC, id DESC`, the backend assembles a conversation **oldest-first**, so the first
"Move up" on a conversation reversed it and the round-trip changed nothing the user could see.
**Root Cause**: Nothing marks the field that defines the permutation's domain order, so the nearest
thing to hand is the array in front of you, and it happens to be a _different_ order than the stored
one. A one-line `sort()` on whatever key the list arrived by is also not a fix: it makes the
comparator total but still leaves it answering the wrong question. The same hazard as the renamed
`occurredAfter`/`occurredBefore` filter, one layer up — a client using the wrong column is "working",
and the damage is permanent because there is no server-side record of the order it should have had.
**Fix**: both components sort each sibling run by the **stored** order before computing the payload
_and_ the move-button state, from one shared array: `compareStoredSequence` = `position` ASC, then
`id` ASC, mirroring the backend's own `(position, pk)` in `schema/loaders.py::batch_load_sublink_subtrees`
so a tie resolves the way the nested list is _drawn_ (`"10"` must not sort before `"9"`). The console
gates on `queueIsComplete` and the profile on `!_hasMore`; both also refuse while any sibling's
`position` is missing (see the two entries below).
**Prevention**: When a mutation is a permutation, identify the field that defines the permutation's
**domain order** and sort by it explicitly, with an explicit tie-break. A stable sort is not a
substitute — it is the arrival order wearing a determinism costume, and it is exactly the order you
were trying not to send. State the rule where the run is built, and derive the payload, the move
index and the "already first / already last" reason from that one array so they cannot disagree.

### [2026-10-01] insiden/link-thread: a PARTIAL permutation is not rejected server-side — both clients must prove the sibling set is complete

**Problem**: The same mutation tolerates a partial list instead of validating it. `_reorder_sync`
renumbers the ids it was sent and **appends the siblings it was not told about**, so sending 3 of a
run's 7 rows is accepted, pushes the 4 unseen rows to the end of the conversation, and reports
success. On the console that is a filtered page; on My Links it is a cursor page boundary. The
failure is silent and permanent — the stored order now disagrees with what the admin arranged.
**Root Cause**: "Send the whole set" reads like a precondition, and the server's _tolerant_ handling
of a short list looks like success. There is no error to notice and no id in the `ok`-only response
to notice it with. Nothing type-checks completeness either: `linkIds: string[]` accepts any length.
⚠️ Mark the boundary precisely, or you will over-generalise into "the server validates nothing": it
**does** reject an id that is not already a child of the named parent ("permutes one set of
siblings"), so **membership is validated and only absence is tolerated**. That asymmetry is exactly
why a short list is the dangerous case — every id you send really is a sibling, the call is well
formed, and the omission is the only thing wrong with it.
**Fix**: both surfaces refuse to reorder until they can prove the set is complete. The console uses
`queueIsComplete` — a **signal**, not a `computed` over the filter dials, because a dial changes up to
a trailing debounce before any refetch, so a `computed` would re-enable the action while a filtered
page was still on screen; `fetchLinks` writes it from the same applied-filter snapshot that built the
query. "Complete" is strict: no search, no category, no line/vehicle/station, no date window, **and**
Status on All (the queue defaults to Pending, which already hides rows). My Links uses `!_hasMore` and
says so in one page-level sentence (`data-testid="thread-sequence-notice"`). Both also state the
reason on the disabled button rather than showing a dead control.
**Prevention**: For any "send the whole set" API, check whether the server **validates** completeness
or merely **tolerates** absence. Toleration is silent data loss, so completeness is the client's
problem and has to be a _provable_ precondition, not an assumption. Where the loaded set is a
function of filters or pagination, make the gate derive from the applied snapshot that produced the
rows, and give it a human-readable reason — "clear the filters" is a task the admin can do; a
disabled button with no reason is a bug report.

### [2026-10-01] insiden/link-thread: a MISSING `position` is not zero, and a synthesised order becomes the stored truth

**Problem**: A row whose `position` did not arrive has an **unknown** stored order, and a permutation
of an unknown order is indistinguishable from a permutation of a wrong one. The obvious `?? 0`
fallback is actively harmful: positions are gap-spaced (`10, 20, 30, …`), so `0` is not "before 10" —
it is only the model's own default for a row written outside `save()` — and the sort floats that row
to the head of the conversation, where the next reorder **writes the guess as the sequence**. The
same reasoning retires an ungrouped root's "position", which can _tie_ with a root that already holds
that number.
**Root Cause**: `position` is a required `number` on the console row type and an OPTIONAL one on
`PublicSocialMediaLink`, and `strict`/`strictNullChecks` are OFF, so no compiler anywhere reports that
it can be missing. A comparator must stay total over data that can be missing the key, and the
tempting place to make it total is also the place a decision gets quietly taken.
**Fix**: both surfaces have a `runOrderIsKnown`/`_runOrderIsKnown` guard — `every(row => typeof
row.position === "number")` — and both refuse the whole run, with a **direction-agnostic** message
("…the sequence they are in is unknown and reordering it would write a guess"), because "already
first" would itself be a claim about an order the list cannot read. The comparators keep a `typeof`
coercion purely to stay antisymmetric so a sort can never produce `NaN` from a dropped key; no
decision is ever taken on that result. The runtime guard is a `typeof` check rather than a
type-driven one on purpose: it guards a payload that omitted the key anyway (stale cache, a host that
stopped selecting it).
**Prevention**: Never coalesce a rank to `0` in a comparator whose output is sent to a server. A
synthesised order is not a degraded answer, it is a **write**. Keep the sort total and the decision
separate, and when the run is unreadable, say so in a sentence that names the consequence.

### [2026-10-01] testing: a spec factory that spreads `Partial<T>` cannot produce a row satisfying a fully-required `T`

**Problem**: `position` could not be promoted to a required `number` on `SocialMediaLinkRow` while
the spec factories went on omitting it. The factories are the idiomatic shape —
`function makeLink(overrides: Partial<SocialMediaLinkRow> = {}): SocialMediaLinkRow { return { …,
...overrides }; }` — and TypeScript widens **every** property of an object literal through a
`Partial<T>` spread to `T[k] | undefined`, so each one is a type error against the fully-required
return type. The tempting fix is to make the field optional on the row type, which is a lie the
production compiler cannot catch: the console document really does select it.
**Root Cause**: A `Partial<T>` spread is a _widening_ operation dressed as a narrowing one — the
overrides are optional but the result must not be. The result type has to be a **required** `T`, so
every required key must be named in the literal before the spread, and a field the factory forgets
becomes a compile error rather than a silently-optional one. The trap only surfaces when the
production type tightens, so a factory written while everything was optional looks permanently fine.
**Fix**: `makeLink` names `position` (and the other hierarchy fields) explicitly, which is what let
the field be required. For the opposite case — a row that genuinely arrived **without** `position` —
both `links.component.spec.ts` and `my-links.component.spec.ts` build it with a `withoutStoredOrder`
helper that **deletes the key** from a real row and casts, with a comment saying why: loosening the
factory would put the hole back into every other spec.
**Prevention**: A factory taking `Partial<T>` cannot produce a row satisfying a fully-required `T`
unless it names every required key — so write it that way from the start, and if a field is about to
be promoted to required, the compile error you get is the reminder, not an obstacle. To construct a
deliberately malformed row, delete the key; never widen the shared factory.

### [2026-10-01] ui/checkbox: a row-level click handler plus a checkbox in that row needs `stopPropagation`, and the checkbox must be driven by `(click)` — not `(checkedChange)`

**Problem**: Two console tables make a whole row the hit target for something and also put a real
checkbox in it (`/console/spotting` selects rows, `/console/links` opens the detail sheet).
Two failure modes: (1) the checkbox's toggle **silently undoes itself** — the checkbox handler writes
the signal synchronously, the click keeps bubbling to the row, the row recomputes
`targetState = !checkedIds().has(id)` against the just-updated signal and flips it back, so ticking
appears to do nothing; (2) once a row wants a Shift-click **range**, `(checkedChange)` is unusable —
only a native `click` carries `event.shiftKey`, and `checkedChange` carries only the new boolean, so
a shift-click on the box would have to be reconstructed from stashed state.
**Root Cause**: Angular event bindings are synchronous and `stopPropagation()` is not automatic; the
trap is invisible because the _single-row_ case still works when both handlers compute the state
differently (the checkbox from its own value, the row from the signal), so the bug only appears as
"a row click right after a checkbox click cancels out".
**Fix**: In `console.page.html` the checkbox binds `(click)="onRowCheckboxClick(event.id, $event)"`
— which calls `event.stopPropagation()` first, then routes into the **same** private
`applyRowToggle(id, shiftKey)` the row's `(click)` uses, computing the target state from the row
(never from the box's emitted value). Verified: Spartan does not stop propagation, so a host-level
`(click)` really does receive the click from the inner `<button role="checkbox" tabindex="0">`, and
the keyboard-generated Space/Enter click carries the same modifiers — which is what makes
Shift+Space range-select for free. Pinned by `console.page.spec.ts` (3 tests fail if the
`stopPropagation()` is deleted).
**Prevention**: Any "click the row" + control-in-the-row table: give the control a `(click)` handler
that stops propagation FIRST, route both paths through one state-computing method, and never let two
handlers derive the new state from different sources. Drive `(click)`, not `(checkedChange)`, as soon
as modifiers (Shift/Ctrl/Meta) matter. Sibling pattern already in `links.component.html:220-234`,
where the same trap is described inline for the sheet.

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

### [2026-10-01] home/feed: a document that OMITS a replace-not-patch input is silent data loss, and an optional key is not a contract

**Problem**: Saving the shared edit sheet on a front-page link silently deleted that link's
`vehicles`, `stations` and `categories` — no error, no failed request, and nothing visibly different
on the feed afterwards, because the feed had never been asked for the tags, so the card drew the same
untagged row before and after. `FEED_QUERY` did not select the three relations, so the sheet hydrated
them from a link carrying no tag data at all, and the save path sends the **complete** editable set
with `[]` for each. The comment that licensed the line read that a missing list hydrates as `?? []`,
_"which is exactly what a link with no tags looks like"_ — true of the **render**, misleading about
the **write**: under replace-not-patch an absent relation and an empty one are different requests.
What made it live rather than latent is the same wave's change making conversation **sublinks**
editable from the front page; previously only a conversation's ROOT was reachable that way. A sublink
is exactly the row most likely to carry a vehicle tag, and every descendant in a conversation became
one click from being wiped.
**Root Cause**: two holes stacked, each invisible on its own. (1) A query document is a hand-written
string no compiler ever checks against the type it populates, and that type describes a **response**,
so "the row type has `vehicles`" and "the server was asked for `vehicles`" are unrelated claims.
(2) The three relations were OPTIONAL on the feed row type, which with `strict`/`strictNullChecks`
**OFF** is not a contract at all: nothing reports the omission, `?? []` compiles, and the sheet's
`string[]` payload accepts `[]` happily. A third layer hid it — a hand-written fixture can invent any
field it likes, so every spec passed while the server was sending no tags. This is the 2026-09-26
`incident/schema` entry seen from the client side: there the mistake was sending a partial payload,
here it was reading from a document that could not supply one.
**Fix**: select the three relations at the root node **and at every nested `sublinks` level**, and in
`SUBMIT_FEED_LINK_MUTATION`'s mirrored `link` selection, whose declared payload type IS `FeedLink`.
Each carries the **minimal identifying pair** (`vehicles { id identificationNo }`,
`stations { id displayName }`, `categories { id name }`) — `Vehicle` also exposes `vehicleType`,
`incidents`, `spottings` and `spottingTrends(...)`, and the whole scalar on every row of every feed
page is a real fan-out cost — matching what the flat hosts already select. All three are now
**required** on `FeedLink` rather than optional: the document selects them at every level, so an
optional key would be a hole the compiler cannot report and the wrapper would have to `?? []` its way
past. None of the three is rendered by the card or read by the vote overlay; they exist so a row can
hand its own tags back to the sheet.
**Prevention**: Ask which layer is _stating_ that a field is there, because a type is a claim about a
response, never about a request. **A document that omits a replace-not-patch input is silent data
loss**, and an **optional** key on a response type is not a contract: with `strict` off nothing reports
the omission, and no fixture can invent data the query never asked for. If an editor round-trips a
row, every relation the input `.set()`s must be selected at every level that can be edited. Then make
the document's own field selection the thing under test: `home.queries.spec.ts` strips `#` comments,
brace-matches the selection set, and asserts each relation is present with **exactly** its identifying
pair at **every** level. Substring matching would have been useless here — the document explains itself
in `#` prose that NAMES the fields, so `toContain("vehicles")` passes on a comment alone — and the
level count is written as a number (`EXPECTED_LINK_LEVELS`) rather than counted off the document, so
shortening the chain is red instead of quiet. That second half is not hypothetical: before this spec,
deleting `sublinkCount` from one nesting level compiled, passed the whole suite, and silently rendered
a 3-level conversation as 2 levels. A test standing in front of a contract only counts if you delete
the contract and watch it go red.

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
pass fixed the read's SHAPE (it collapses, and the loop walks the nested children) but left the
WINDOW different, and each half looks like a self-contained decision in isolation. Nothing
type-checks the agreement: `FeedQueryVars` is a bag of optional flags, so omitting one compiles and
passes every existing test.
**Fix**: `currentServiceDayOnly: true` added to the today overlay read; the last-week overlay read
was verified (not assumed) to already match `lastWeekResource` on `lastWeekOnly`, `alignPageToDay`
and the same `first`. The invariant is now written on `loadVoteOverlay()`: same query, same
variables (window, collapse, page size), auth header the only addition, and the loop walks the
nested children as well as the roots. `home.store.spec.ts` captures both resource requests' variable
objects and compares them structurally to the two overlay reads' variables, so any added or removed
key is red.
**Sharpened 2026-10-01 (the tree)**: the field the walk descends is now `sublinks` (was `threadLinks`)
and it is **recursive** — the read collapses, so `edges` alone holds only the ROOTS, and a walk that
stopped at the roots plus one level shipped as a live bug: every node below that level read as the
anonymous `0`. The full invariant now has three parts — same query, same variables, **and** walk
every level of the nesting. A client that mirrors `MAX_THREAD_DEPTH` to "stay in step with the
server" is the mistake: the write-side cap is not the client's business, and mirroring it silently
loses a level the day the cap moves.
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
**Recurrences** (same root cause, same misattribution — the named file is a symptom):

- 2026-09-30 (2nd): a `#` comment inside `INSIDEN_INCIDENTS_QUERY` (`features/insiden/data/insiden.queries.ts`)
  wrote `` `created` `` and `` `occurredAt ?? created` ``.
- 2026-10-01, link-thread tree wave (further instances of the same class): `#` comments in three
  `/* GraphQL */` documents — the conversation-hierarchy block in the console queue's
  `SOCIAL_MEDIA_LINKS_QUERY` (`features/console/insiden/data/insiden-console.queries.ts`), and the
  "Conversation tree" blocks in `PUBLIC_SOCIAL_MEDIA_LINKS_QUERY` / `FEED_QUERY`
  (`features/insiden/data/social-links.queries.ts`, `features/home/data/home.queries.ts`) — now spell
  every quoted identifier in **double** quotes. The four are `"N links"`, `"does this row expand"`,
  `"Unknown field"` and `"part of a 3-link report"`, which is the fix and doubles as the proof it
  happened; all four live in those three documents and nowhere else — the first two in the console
  queue, the third in the public one, the last in `FEED_QUERY`. `npx prettier --check .` caught it
  immediately, again as a misleading `SyntaxError` pointing at an unrelated line.
- The tell for a `#`-comment backtick: the comment reads as if it were documenting an identifier and
  then the following **selection line** is what the parser complains about, several lines below the
  real mistake.
- Corollary worth knowing before you grep: a `templateUrl` component (e.g.
  `links.component.html`) has **no literal to terminate**, so its HTML comments may use backticks
  freely. The same comment text that is fatal inline is legal in a separate file — which is why the
  console's large HTML comments and the card's inline `template:` comments are written differently and
  both are correct.

**Prevention**: Never put a backtick inside a comment that lives inside a template literal. When a
repo-wide parse error names a file you have not touched, look at the files whose mtime changed most
recently **first** — the named file is a symptom. Cheap guard: run `npx prettier --check .`
immediately after adding a comment to a template literal or a GraphQL document; it catches this in
seconds, and a full suite run tells you nothing more.

### [2026-09-30 → 2026-10-01] insiden/link-thread: two counts, one question — `isThreadRoot` is `parentId == null`, and `threadLabel` takes a conversation SIZE

**Problem**: Gating the thread affordance on the backend's `isThreadRoot` boolean sprouts a
"N links" badge on **every single row in the app** — every ordinary unthreaded link is a degenerate
one-member thread and therefore already a "root". Under the tree the flag's definition moved from
`thread == null` to `parentId == null` and the trap is unchanged: the _structural_ marker and the
_feature_ question are still different questions. Its second half is the same confusion one layer
down: `link-thread-selection.util.ts::threadLabel` takes a **CONVERSATION SIZE** (the node plus its
publicly-visible descendants, i.e. `sublinkCount + 1`) and answers `""` for anything `<= 1`, so
passing a raw descendant count **silently deletes the chip on a root with exactly ONE sublink**
(`1` → `""`) while every leaf stays correctly chip-less (`0` → `""`) — which is precisely why the bug
hides. Three call sites each rediscovered this independently: `app-link-card`'s
`conversationLabel`, the console's Thread cell + `confirmThreadCoupling`, and My Links'
`_conversationLabel`.
**Root Cause**: The backend defines a root as "nothing points at this link", so the flag is a
_structural_ property ("this row is not a member of anything"), not a _feature_ property ("this link
has links below it"). Its default and its interesting case are the same value, so it cannot be used
as a feature predicate. The `threadLabel` half is the identical mistake in the string layer: a
pluralisation helper whose EMPTY branch means "nothing to show" is a gate as much as a formatter, and
a caller's unit is not the helper's unit unless the helper says so at every call site.
**Fix**: the ONLY correct affordance gate is **`sublinkCount > 0`** (`app-link-card`'s own
`hasSublinks` computed; the console cell and `confirmThreadCoupling`; My Links' badge). The card
deliberately gates on its `sublinkCount` **input** rather than on `link.sublinkCount`, so a flat host
that never binds the input cannot draw a chip even when its nodes carry a real count. Every caller of
`threadLabel` passes `sublinkCount + 1`, and the rule is stated in `threadLabel`'s own docstring,
whose consumer list is re-derived from the code rather than extended from memory. Under the tree the
count is a node's OWN descendants **at any depth**, so a conversation is sized from the ROOT's count
and the column is never summed (that double-counts by exactly the depth — a shape the old depth-1
model could not produce, which is why nobody summed it then).
**Prevention**: When a backend boolean is a _structural_ flag, check whether it can also be the
null/default state of an unrelated case before trusting it as a feature predicate. Ask "what does this
return for the most common row in the app?" — if the answer is `true`, it is not a gate; the honest
predicate is "does this node have children?", which the backend already answers. And when a shared
helper's empty branch means "render nothing", its **unit** belongs in its name, its docstring and its
parameter type — a caller who has to remember `+ 1` will eventually forget it, and the failure is a
missing chip rather than an error, so nothing catches it. Do not "tighten" the `""` branch either
(`1` → `"1 link"`): a chip would sprout on every ordinary row in the app.

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
id-keyed and `loadVoteOverlay()`'s loop walks each root's nested `sublinks` as well as `edges`. An
earlier version of this entry argued the opposite — "send it on the list reads, not on the overlay" —
on the reasoning that a collapsed read hides the member votes. It does not; the walk finds them.
**Root Cause**: `collapseThreads` changes the _shape_ of the connection, not just its content, and the
old entry reasoned about which shape an id-keyed consumer "wants" instead of which shape it actually
reads. The invariant is not "the overlay prefers flat rows"; it is **the overlay's id set must equal
the RENDERED id set**, and the render is roots-with-whole-trees-nested. An uncollapsed read returns
the `first` newest FLAT rows (`r1, c1, g1, r2, c2, g2, …`) — a top-N window over rows the collapsed
render never shows, which drops exactly the descendants a rider voted on and adds roots that are not
rendered. So the flattening "fix" lost the ids it was meant to recover. Client-side grouping of a flat
page is unsound in the first place — under `-occurredAt, -id` a conversation's members are not
adjacent (an admin can nest a 09:00 post under an 11:00 one, possibly onto different pages) — so
collapsing has to be the backend's decision, and the consumer's job is to walk the shape it asked for.
**Fix**: `home.store.ts` folds `HOME_FEED_COLLAPSE_VARS = { collapseThreads: true }` into **all six**
home reads — `feedResource`, `lastWeekResource`, `loadMore()`, `loadMoreLastWeek()` and both
authenticated reads inside `loadVoteOverlay()` — and the overlay's loop recurses through `sublinks`
at every depth (`recordSubtreeVotes`), not just the roots. `home.store.spec.ts` pins both halves
("the overlay reads MUST collapse"; the same-variables comparison). Every other surface (`/insiden`,
situasi, per-incident cards, My Links) omits the key entirely, which is how it says "use the schema
default (`false`)" — an explicit `null` is fatal on a `Boolean!` argument.
**Sharpened 2026-10-01 (the tree)**: "walk the members" is no longer enough. The render nests an
arbitrary-depth tree, so the walk has to recurse; a version that recursed one level shipped and left
everything below it reading as the anonymous `0`. Enumerate the reads, then enumerate the DEPTHS.
**Prevention**: For any new read of a connection whose arguments can change its SHAPE, enumerate
**every** read of that connection — first page, every continuation, and every auxiliary read (overlays,
exports, counts) — and answer two questions per read: (1) does it need the flag, and (2) does its key
set match the set that surface **renders**, at every level it renders them? The test is the rendered
set, not the read set and not the consumer's convenience: a read is wrong whenever an id the page draws
can be missing from it, and absent ids are indistinguishable from a genuine zero on the card. (2) is
the trap that bit the overlay again for the window axis; that half has its own entry above — do not
answer a shape mismatch by changing the window, or a window mismatch by uncollapsing.

**Sharpened 2026-10-01 (the null-semantics split — a THREE-way, and all three differ).** The
difference is a property of the **SDL**, not of "optional arguments" in general:

| argument                                 | SDL                | omitting the key                           | explicit `null`                |
| ---------------------------------------- | ------------------ | ------------------------------------------ | ------------------------------ |
| `reorderSocialMediaLinks.parentId`       | `ID`               | legal; the **resolver's guard** refuses it | **MEANINGFUL** — reorder roots |
| `groupSocialMediaLinks.parentId`         | `ID = null`        | legal; "start a new conversation"          | same as omitting               |
| `publicSocialMediaLinks.collapseThreads` | `Boolean! = false` | legal; means `false`                       | **HARD ERROR** — non-null      |

🔴 **An earlier version of this passage called `reorderSocialMediaLinks.parentId` "required" and
said the omission is rejected by validation before the resolver. That is wrong, and the way it is
wrong is the whole point: in GraphQL **"required" IS "non-null"**, so "required, nullable, no
default" is not a state the SDL can express at all. `parentId: ID` is nullable and defaultless,
which makes it plain **OPTIONAL**. `is_required_argument` in graphql-core's
`validation/rules/provided_required_arguments.py` is
`is_non_null_type(arg.type) and arg.default_value is Undefined`, so `ProvidedRequiredArgumentsRule`
never fires for it. Verified against the emitted schema
(`rosak_backend/rosak/tests/snapshots/schema.graphql:678` → `parentId: ID`, with
`groupSocialMediaLinks … parentId: ID = null` at `:676` and `collapseThreads: Boolean! = false` at
`:777`) on graphql-core 3.2.6: the argument evaluates `is_required_argument=False`, and **all
three** client spellings — key omitted from the selection, key omitted from a declared nullable
variable, explicit `null` — come back **VALID** from `validate()` and **enter the resolver**, where
`strawberry.Maybe` supplies `UNSET` and the deliberate guard at
`incident/schema/mutations/interactions.py:287` raises the `GraphQLError`. The one spelling stopped
earlier declares `$parentId: ID!` and omits it, and that is a **client-chosen type** caught by
variable coercion (`Variable '$parentId' of required type 'ID!' was not provided`) — not a property
of the field. `collapseThreads` is the clean contrast, refused by the type system itself:
`Expected value of type 'Boolean!', found null.`

So the omission is refused because a resolver **chose** to refuse it, and that is the design rather
than a workaround: tightening `parentId` to `ID!` would turn the meaningful `null` ("reorder the
ROOTS") into a hard error, so the schema cannot express the omitted/null distinction and the guard
does it instead. The backend docstring (`interactions.py:271-286`) says exactly that, and the test
that pins it (`tests/incident/test_social_link_threads.py:1250`) sends the argument **absent from
the selection entirely** and asserts the tree is unchanged — a test that only passes because the
guard sits in the resolver, and only for that reason. Both clients keep their types
(`boolean | undefined`, `string | null | undefined`, and `parentId: string | null` with **no**
`| undefined`) so a payload that omits the key is a compile error rather than a runtime
`GraphQLError`: the types buy a louder failure than the server would have given you anyway. The
generalisable half, and the cheapest guard in this file: **a test standing in front of a resolver
guard proves the guard is on the path only if you DELETE the guard and watch it go red** — a test
that stays green is passing on some _other_ layer's error, and here that other layer would be
`is_required_argument`, whose `False` is precisely the mistake this entry exists to correct. A
deliberate guard that a test appears to cover but does not is worse than no guard, because the next
agent reads the test as permission to delete the code.

### [2026-09-30] insiden/link-thread: `GenericMutationReturn.id` is an `Int`, not an `ID`

**Problem**: `groupSocialMediaLinks` returns the new thread root's `id` as a GraphQL **`Int`**
(`common.schema.scalars.GenericMutationReturn.id: int | None`) while every other id on
`SocialMediaLinkScalar` is an `ID` (a string). `String(result.id)` happens to round-trip fine, so the
mismatch is invisible until the value is fed back into an `ID`-typed field (a `linkIds` array, a
cursor, a `parentId` argument).
**Root Cause**: `strict` and `strictNullChecks` are **OFF** in this repo, so the compiler will happily
accept a number where a string is declared, and a string where a number is declared.
**Fix**: `GroupSocialMediaLinksData.id` is typed `number | null` with the reason inline, and all three
call sites (the console triage table, "My Submitted Links" and — since 2026-10-01 — the two nesting
paths) deliberately **do not use** the returned value: they reload the flat list, because
`parentId`/`sublinkCount`/`position` are server-computed and a mutation returns only `ok` and that
one id, so nothing on the page can patch them. `reorderSocialMediaLinks` returns no id at all, for
the same reason.
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
- Bare `npx vitest run <file>` does **not** init the TestBed (`Need to call TestBed.initTestEnvironment()`) and has no globals (`describe is not defined`); only `ng test` does. It is still the fast path for a spec with **no** TestBed (a pure function/util) — but note it skips the unit-test build's spec type-check, so run the real gate before trusting it.
- A spec that CLICKS a real `routerLink` must give the router a matching route (`provideRouter([{ path: "spotting/:lineId/vehicle/:vehicleId", children: [] }])`): an unmatched one rejects the navigation and Vitest reports it as an **unhandled rejection** that fails the whole run, even though the assertions passed. Clicking a plain `<a href>` only logs "navigation not implemented" in jsdom — suppress it with a `preventDefault()` listener on that anchor (which does not affect the propagation a `stopPropagation` assertion depends on).

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

### [2026-09-22 → 2026-10-01] insiden/link-card: interactive controls must stay outside the navigational `<a>` — including the one that moved INTO the card

**Problem**: The shared `app-link-card` row is one large external-link anchor carrying a vote control
and an edit pencil; inside the `<a>`, clicks would navigate instead of activating the control (and
interactives nested in an anchor are invalid HTML). The same trap fired again this wave with a
different symptom: the conversation affordance ("N links" + chevron) was asked to move **into the
first link's card**, and its obvious home — the tag row beside the Pending/Official chips — sits
**inside** that `<a>`. A `<button>` there is a control that navigates on every click, i.e. the expand
control that opens a conversation would instead send the rider to the link.
**Root Cause**: When the whole row is the tap target, it is natural to drop controls into the body
content. "Inside the card" and "inside the anchor" are two different regions that happen to share a
boundary, and only one of them is a legal home for a control; the boundary is not visible in a
thumbnail of the design.
**Fix**: The anchor wraps only the non-interactive body (favicon, URL, title, tags, Pending/Official
chips); the vote button, edit pencil and the conversation toggle are siblings in `link-meta-rail`
(`46b0319`; the new toggle pinned by `link-thread.component.spec.ts`, which asserts both
`closest("a") === null` and `closest('[data-testid="link-meta-rail"]') !== null`). The rail is the one
place in the card that is both the card's own chrome and free of the anchor, and it already hosts the
row's other controls — so the chip reads as one more piece of this card's metadata rather than as a
wrapper around it.
**Prevention**: On any card whose row is a link, keep interactive children as siblings of the anchor
and assert it in the spec — never nest a control in the anchor to widen its tap target, and never
assume "inside the card" means "anywhere in the card". **Read the component's own stated constraints
before choosing a slot**; this card's header comment already said "interactive controls as siblings,
never children", and the constraint outranked the nicer-looking placement. Corollary for the reverse
case: a `templateUrl` component file has no literal to break, so backticks are fine in its HTML
comments — see the backtick entry above.

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

## [2026-10-03] ui/sheet: a sheet that OPENS another sheet must be MOUNTED FIRST, or the page scrolls behind it

**Problem**: the home page's new report chooser opens the line-status / spotting / link / incident
sheets, so two `HlmSheet`s changed `open()` in the same tick. After choosing a line, the line-status
sheet came up correctly but the page behind it still scrolled — the modal lock was already gone.
**Root Cause**: `HlmSheet` locks scroll from an `effect` keyed on its own `open()`, writing
`document.body.style.overflow` / `documentElement.style.overflow` directly. Angular flushes effects in
**creation order**, not in the order their signals were written, and both sheets' signals are written
synchronously inside one click handler. So the UNLOCK (the chooser closing) must belong to the
component created **before** the one that LOCKS. Mounted after it, the lock runs first and the unlock
runs second — the exact opposite of what the click did.
**Fix**: `<app-report-chooser />` is the first sheet in `home.page.ts`'s template, with the invariant
written into the template comment, the chooser's own class doc, and a spec that asserts the markup
order (`home.page.spec.ts` → "hosts the report chooser BEFORE every other sheet").
**Prevention**: any two components that share one global side effect driven by a signal need an
explicit order, and it has to be pinned by a spec — the failure is invisible in a unit test that only
looks at one sheet, and in jsdom `document.body.style.overflow` is never asserted. When a new sheet is
added to a page that already opens sheets, ask which of them is created first.

## [2026-10-03] testing: one unflushed HttpTestingController request fails 84 tests in 8 unrelated files

**Problem**: after adding specs for the home report chooser, the suite went from 114 files / 1455 tests
green to **8 files / 84 tests failing** — including four spec files the change never touched
(`line-pulse-card`, `status-info-chip`, `insiden/link-form`, `spotting/report-form`), most of them with
`Cannot configure the test module when the test module has already been instantiated`.
**Root Cause**: one new spec opened the line-status sheet while signed out on a known line, which fires
its lazy `STATION_LINES_QUERY`; the request was never flushed, so `httpMock.verify()` threw in that
file's `afterEach`. A throwing `afterEach` runs before Angular's TestBed reset, so the module stayed
instantiated and every later file's `beforeEach` (`configureTestingModule`) refused. The cascade made
the real failure — one line in one spec — completely invisible in the summary.
**Fix**: the spec flushes the request (a helper `openSheetLoggedOut()` does it for every logged-out
case, and the close-then-reopen spec was changed not to reopen, since reopening re-issues the read).
**Prevention**: `httpMock.verify()` is a **cross-file** assertion in this runner, not a per-spec
cleanup. Any spec that makes a lazy resource go live (opening a sheet with a known line/id) must flush
it, even when the request is irrelevant to what it asserts. When a suite suddenly fails in files the
change did not touch, read the FIRST failure in file order, not the last — and remember that a
`TestBed.inject()` placed before `configureTestingModule()` throws the same misleading message.

## [2026-10-03] core/graphql: a `graphqlResource` is NOT lazy until first read — it evaluates its request immediately

**Problem**: the network board's two service-day history reads were added to `HomeStore` behind the
documented lazy-resource precedent (`graphqlResource(() => { if (!gate()) return undefined; … })`, plus
"the resource is lazy until first read — read it in the constructor"). Both reads still fired as soon as
the **lines** read landed, in every store instance and in every store spec, whether or not a widget that
renders them was mounted.
**Root Cause**: `graphqlResource()` installs `effect(() => { raw.isLoading(); rawHasError(); data(); … })`
at CALL time (`core/graphql/graphql-client.ts`). That effect subscribes to the underlying `httpResource`
immediately, so the request function is being evaluated — and re-evaluated whenever its signals change —
from the moment `graphqlResource()` is called. "Lazy until first read" is therefore only true for a
resource whose signals nobody ever reads _and whose request function depends on nothing that changes_; a
`lines()`-style gate still fires as soon as its own dependency resolves. A gate that only the exported
projections satisfied defers nothing at all.
**Fix**: an explicit opt-in from the surface that renders the data —
`HomeStore.requestHistoryReads()`, called from each history widget's constructor. The store then holds two
gates: the opt-in AND the data it needs (`lines().length > 0`). Side benefit: every store spec that is
about the feed is untouched by the two extra queries, and a board in Rider view (no heat grid) never asks
for them.
**Prevention**: "lazy resource" in this codebase means _gated on a signal the DISPLAY sets_, not _read by
nobody until a projection is read_. When adding a store-owned read, decide which component's lifetime
should own it and put the gate on that component's existence; then check whether a store spec that
constructs the store now needs to flush a request it does not care about. Related: `httpMock.match()`
DEQUEUES, so it cannot be used to ask "is this request pending?" — `expectOne` and keep the object.

## [2026-10-03] testing: `httpMock.match()` dequeues, so a "is it pending?" probe eats the request

**Problem**: several new store specs asserted `expect(httpMock.match(() => true)).toHaveLength(1)` and
then, on the next line, `expectOne(...)` the same request — which threw "Expected one matching request
… found none". Several more failed in `afterEach` with "Expected no open requests", because the probe had
already consumed them.
**Root Cause**: `HttpClientTestingBackend.match()` REMOVES what it matches, exactly like `expectOne`. It is
not a read-only probe, and its name suggests it is.
**Prevention**: assert existence with `expectOne` and keep the returned request; use `match()` only when
the test genuinely intends to consume everything still open (e.g. a final "nothing is pending" check).
And when a variables change re-issues a request, capture BOTH resources' requests before flushing either
— `expectOne` twice for the same predicate fails on the second call.

## [2026-10-03] ui/theme: LIGHT `--brand` fails AA as text and as a fill — found by the Phase-5B contrast audit, NOT fixed (design decision, above this phase)

**Problem**: the dark-mode contrast audit for the network board came back clean on every dark surface
(`--brand` on card **7.56:1**, `--brand-foreground` on brand **8.23:1**, the post-submit highlight ring
**8.48:1**, the feed tabs **6.98:1** — all unchanged). The same measurement on the **light** theme shows
the accent itself is not AA: `--brand: #ee7104` (`oklch(0.68 0.17 46)`) against `--card`
(`oklch(1 0 0)`) is **3.0:1**. That colour is used three ways on `/`:
`text-brand` on the hero's "Live map" CTA and on the row "Open original" link — **2.66:1 at the
mobile text size** — and as a **fill** behind `--primary-foreground` white text on "Report status" and
"Refresh" (the brand chips and `app-info-popover` triggers), also **3.0:1**. It fails WCAG 2.1 AA
(4.5:1 for normal text, 3:1 for large text ≥ 24px or ≥ 18.66px bold) as body text and as a white-on-fill
button label.
**Root Cause**: the accent was picked for hue/vibe and never measured; `--brand` is `lightness 0.68`,
which is comfortably readable as a large accent but not at body-text contrast, and a saturated orange at
that lightness has no headroom left for white text on top of it. The dark theme does not have this
problem because it swaps `--brand` for a much lighter orange (`#f79331`, 0.77 lightness), which is the
correct move for an accent on a dark surface.
**Fix**: **not fixed here.** Darkening `--brand` for light mode would change every existing brand
surface app-wide (buttons, chips, links, the console) and is a design call, not a Phase-5B polish item;
this entry exists so the number is on record and nobody re-runs the audit believing it passed.
**Prevention**: when an accent colour becomes a **text** colour or a **button fill**, measure it, and
prefer the two-token pattern the light theme now needs — a text-safe accent for small text and a fill
that carries a dark-enough foreground — over one `--brand` doing all three jobs. Cheap check: relative
luminance contrast per theme, per role, not per colour.

## [2026-10-03] ui/directive: a bare attribute matching a directive input binds the EMPTY STRING — the selector and the input cannot share a name

**Problem**: the new tick-up directive is `selector: "[hlmTickUp]"` with input `hlmTickUp: number`.
Writing the attribute **and** the binding — `<span hlmTickUp [hlmTickUp]="value()">` — fails to
compile: `Type 'string' is not assignable to type 'number'`. `[hlmTickUp]="value()"` alone works, and so
does the "hover plus a string input" spelling that `HlmButton` uses everywhere.
**Root Cause**: a **bare** attribute is a static attribute; Angular hands the directive its value as a
string (`""`), and `""` is not a `number`. The static attribute is also redundant — the bound
`[hlmTickUp]` already satisfies the `[hlmTickUp]` selector — so it only adds a second, conflicting
binding. `HlmButton` never hit this because its `selector: "button[hlmBtn], a[hlmBtn]"` matches an
attribute **not declared as an input**, so the bare form has nothing to bind to and is inert.
**Fix**: the templates use `[hlmTickUp]="…"` alone.
**Prevention**: when a directive selector and an input share a name, write the binding once
(`[x]="v"`), never the bare attribute plus the binding. A numeric/boolean input with a name equal to
its selector part is the case that breaks; a selector prefix like `hlm` (`hlmBtn`) is what keeps the
other directives safe.

## [2026-10-03] ui/shell: the sheet SCRIM does not dim the sticky nav — z-[45] vs a z-40 backdrop. Known, app-wide, NOT a home-feature bug

**Problem**: open any sheet (line-status, link, spotting, the report chooser) and the shared
`HlmSheet` backdrop paints `bg-black/50` behind the panel — but the sticky `AppNav` bar stays at full
brightness ABOVE the scrim, so the page behind reads as "dimmed" while the nav reads as "still live" and
paints over the scrim edge. A QA pass on `/` in the Pro view flagged it as a home-feature visual defect.

**Root Cause**: the app's z-index ladder puts the nav at `z-[45]` and `HlmSheet`'s backdrop at `z-40`.
That ladder is **correct and deliberate** — `app-nav.component.ts`'s own comment block explains that
`z-[45]` sits above every sticky bar used in page content (the highest today is `z-40`) while staying
below the overlay layer at `z-50`. The consequence nobody drew explicitly is that it also sits above the
_backdrop_, because the backdrop is a page-level scrim at `z-40`, not part of the `z-50` overlay layer.
🔴 This is pre-existing SHARED-COMPONENT behaviour: it reproduces on every sheet in the app, on every
page, and it has nothing to do with the Pro dashboard, the board, or the home feature's own markup.

**Fix**: **not fixed here.** The home-feature polish pass that found it deliberately left it alone: any
real fix is a change to the shared nav/sheet z-index (raise the backdrop above `z-[45]`, or portal the
sheet out of the page stacking context), which changes layering for every consumer of `HlmSheet`
app-wide — out of scope for a visual-polish pass, and the wrong thing to do unannounced. Recorded here
so it is not rediscovered as a home bug and "fixed" in the wrong layer.

**Prevention**: when a QA finding is _"something on screen looks wrong"_, check whether it reproduces
outside the feature that surfaced it before editing anything. Anything that reproduces on another page
belongs to `ui/` or `shell/` and needs its own change with its own blast radius. The fast check here is
one grep: the z-index is in `app-nav.component.ts` and `ui/sheet/sheet.ts`, neither of which is
`features/home/`.

## [2026-10-05] ui/info-popover: a panel is clipped by an ancestor's `overflow-hidden` AND painted under the chrome by a stale z-index — two independent bugs that look like one

**Problem**: every `InfoPopover` on `/` — the hero headline, the two stat tiles, the sparkline caption,
the row's history strip, the heat grid, the card's status chips — opened **cut off** at the edge of its
card, and the refresh control's tooltip painted **underneath the sticky nav**. A tooltip that is both
truncated and behind the chrome reads as "this app's tooltips are broken", when neither of those two
things is a bug in the popover component at all.

**Root Cause**: two independent causes that no single assertion could see.
(1) **Clipping**: `InfoPopover`'s panel is `position: absolute`, so it is a child of whatever container
projects the trigger — and the hero card, `LinePulseCardComponent` and `LinePulseRowComponent` all
carried `overflow-hidden` (for their rounded corners). An `overflow-hidden` ancestor is a hard clip on
an absolutely-positioned descendant: the panel was never moved out of the box, it was **cut** at it. No
`z-index` can fix that, and a spec that asserts the panel's classes cannot see it either, because the
clipping lives on a parent.
(2) **Stacking**: the panel was `absolute … z-20`, while `app-nav.component.ts` puts the page nav at
`z-[45]` and the home page's sticky mobile action bar at `z-30`. A tooltip opening near the top of the
screen was therefore a valid `z-20` element painting under two siblings. The nav's own comment already
documented the ladder — `z-[45]` "sits below the overlay layer at `z-50`" — and the panel was the one
thing in that overlay layer that had never been moved up to meet it.

**Fix**: (1) removed `overflow-hidden` from the three containers that host popovers and **compensated
the decoration**: the hero's countdown track took `rounded-t-2xl` and the colour ribbon `rounded-b-2xl`
(each keeping its own `overflow-hidden`, which is correct — it clips only its own fill/segments), and
the line cards' leading colour rails took `rounded-l-xl` / `rounded-l-lg`. (2) `InfoPopover`'s panel
went `z-20` → **`z-50`**, and the refresh control's own tooltip `z-10` → `z-50`. The two together are
what "a tooltip is on top of everything" means. `pro-report-ranking`'s progress track and the lanes'
`overflow-x-auto` were left clipping on purpose: neither hosts a popover.

**Prevention**: 🔴 **before adding `overflow-hidden` to a container, ask whether anything inside it is
absolutely positioned for a reason** — a popover panel, a dropdown, a menu, a tooltip. If yes, either
drop the clip or move the panel out (`<dialog>`, a portal, or a body-level host). Rounding corners is
never worth a clipped tooltip: give the decorative child its own `rounded-l-*` / `rounded-t-*` instead.
The app's z ladder is **`nav z-[45]` < `overlay z-50`** (mobile bar `z-30` sits below the nav), so
anything that must float above page chrome — every popover panel, every sheet — belongs at `z-50`, and
a new one should be pinned with a spec that asserts the class. 🔴 And neither class of this bug is
assertable from the component under test: the panel's own spec cannot see its ancestor's clip, and
jsdom has no layout, so **a clipped panel needs a browser pass** — read it as "the panel is shorter than
its text should need", not as a z-index failure.

## [2026-10-05] core/styles: component `@keyframes` are RENAMED by emulated encapsulation — an animation referenced by a CLASS must be a global `@theme` token

**Problem**: the home refresh control's "Updating" spinner gained a draw-in entrance — both strokes
draw themselves from nothing to the full ring over 500ms — and it rendered as a **finished circle from
the first frame**, with no entrance at all. Nothing failed: the spec was green, the class strings were
exactly right, the build was clean. In the browser `animation-name` resolved to a name **no `@keyframes`
rule exists for**, so the strokes simply sat at the default `stroke-dashoffset: 0`.

**Root Cause**: 🔴 **Angular's emulated view encapsulation rewrites `@keyframes` declared inside a
component's `styles`.** `@keyframes home-refresh-spinner-draw-ring` in the component's own stylesheet
came out of the build as `@keyframes _ngcontent-ng-cXXXX_home-refresh-spinner-draw-ring`, while the
Tailwind utility emitted `animation-name: home-refresh-spinner-draw-ring` from the **global** sheet
(arbitrary `[animation:…]` and generated `animate-*` alike). The two names can never match, and an
unmatched `animation-name` is not an error in any tool — it is a declaration that quietly does nothing.
Only a name referenced from **within that same component's own `styles` string** would survive, since
the rewrite is applied consistently inside one sheet.

**Fix**: the keyframes are now **global `@theme` tokens** in `src/styles.css` —
`--animate-spinner-draw-ring: spinner-draw-ring 500ms ease-out both` and `--animate-spinner-draw-arc`,
each with its `@keyframes` nested in the same `@theme` block — applied as the generated
`animate-spinner-draw-ring` / `animate-spinner-draw-arc` utilities. This is the same pattern as
`--animate-icon-glow`, `--animate-breathe`, `--animate-nav-reveal`, `--animate-wordmark-wipe`,
`--animate-nav-progress-sweep` and `--animate-tick-up`: every `animate-*` token in this repo is global
for this reason, not by taste. The component's `styles` array went back to `[":host { display: inline-block; }"]`.
Live evidence in the browser after the move: track `stroke-dashoffset` **56.55 → 50.40 → 47.46 → 41.83
→ 33.89 → 31.37** and arc **14.14 → 7.84** over the first ~180ms, with a computed
`animation-delay: 0.5s` on the spin.

**Prevention**: 🔴 **any `@keyframes` referenced by a class — whether arbitrary `[animation:…]` or a
generated `animate-*` — must be declared in the GLOBAL `@theme` in `src/styles.css`, never in a
component's `styles`.** Put the `@keyframes` and its `--animate-<name>` token in the same `@theme`
block and apply the `animate-<name>` utility. 🔴 And a jsdom spec **cannot** catch the broken version:
it computes no styles, so the only thing it can assert is the class name — which was correct while the
animation silently was not. That gap is exactly what let this ship green. Verify a new keyframe-driven
animation by reading the **computed** `animation-name` in a real browser, or by grepping the built CSS
for the un-prefixed name; a spec pinning the class is necessary but not sufficient.
