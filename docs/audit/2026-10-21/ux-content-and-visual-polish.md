# UX, content and visual polish

Part of the [rosak_firebase audit, 2026-10-21](../2026-10-21.md). 97 findings, most severe first.

Misleading copy, missing error and empty states, layout collisions on phones, unexplained labels, unstyled markdown and vote buttons, and weak console ergonomics.

<a id="f011"></a>

#### F011 · Vote buttons render as unstyled 16x16 px controls because HlmButton is never imported

**high** · effort S · ui-visual · insiden-ui

**Where:** `src/app/features/insiden/vote-button/vote-button.component.ts:70`, `src/app/features/insiden/vote-button/vote-button.component.ts:73-83`, `.omo/evidence/audit-2026-10-21/agents/insiden/s1.png`

**Problem.** The template uses the hlmBtn directive and its variant and size inputs, but the component's imports array is empty, so the directive never attaches. The buttons therefore have none of the Helm styling: no padding, no 28 px height, no hover background, no focus ring (focus-visible styles come from buttonVariants) and no disabled opacity. The vote control is used on every incident card, every chronology row and every link card, which makes it the most repeated tap target in the feature, and at 16 px it is far below the 24 px WCAG 2.5.8 minimum and the 44 px mobile guideline. Phone users are the main audience, and keyboard users get no visible focus indicator on the control.

**Recommendation.** Add HlmButton to the component's imports (`imports: [HlmButton]`). Then check that `size="sm"` (h-7) is acceptable at 390 px, or use a custom class such as `min-h-11 min-w-11` on touch viewports so the up and down buttons are at least 44 px apart. Add a spec assertion on `data-slot="button"` so the regression cannot return silently.

**Verification.** vote-button.component.ts has `imports: []` yet uses `hlmBtn variant size` at lines 74 and 107, and nothing global attaches the directive. Buttons are unstyled on every card, row and link card.

**Second check (high-severity pass).** code review: holds (high). vote-button.component.ts has `imports: []` yet its template uses `<button hlmBtn variant="ghost" size="sm" ...>` twice. The HlmButton directive (src/app/ui/button/button.ts:34, selector `button[hlmBtn], a[hlmBtn]`) is standalone and only attaches when imported, which is why other components such as the nav and calendar do render with its classes in the live SSR HTML. Neither vote-button spec file asserts on hlmBtn, so nothing guards it. The vote buttons render client-side after data loads, so I could not see them in curl output, but the code path is unambiguous: no focus ring, no padding and a 16 px svg-sized hit target on the most repeated control. impact review: holds (high). vote-button.component.ts declares imports: [] while its template uses hlmBtn with variant and size, and other insiden components import HlmButton from ui/button/button. Without the import the directive never attaches, so the buttons get no padding, no focus ring and no hover state. The finding's measured 16x16 px size is consistent with this. The control appears on every incident, chronology row and link card, and phone users and keyboard users are both affected, so this is a clear user-facing defect. The fix is a one-line import.

**Fix note from the second check.** Add `import { HlmButton } from "../../../ui/button/button"` and set `imports: [HlmButton]`. Then eyeball size=sm (h-7) on a phone; only add a touch-size override if that is judged too small. Add HlmButton to imports (import from ../../../ui/button/button) and add a spec assertion on data-slot=button. The 44 px touch-target suggestion is optional polish: size=sm at h-7 is the house style, so do not add a custom size unless the maintainer wants it.

**Also reported as:** [F004](ux-content-and-visual-polish.md#f011) [gap-2] Vote buttons are unstyled (hlmBtn is never imported): 16 px touch targets, no focus ring, and the logged-out disabled state is invisible (src/app/features/insiden/vote-button/vote-button.component.ts:70, src/app/features/insiden/vote-button/vote-button.component.ts:73)

<details><summary>Evidence</summary>

```text
@Component({ selector: "app-vote-button", imports: [], template: `... <button hlmBtn variant="ghost" size="sm" type="button" aria-label="Upvote" ...>`. Measured in the running SSR build at 390 px: the rendered DOM is `<button hlmbtn="" variant="ghost" size="sm" ... disabled="">` with no `data-slot` and no `class`; getBoundingClientRect() of the upvote button is 16 x 16.
```

</details>

<a id="f016"></a>

#### F016 · No Open Graph or Twitter card tags and no default share image on any page

**medium** · effort S · seo-meta · seo-pwa-i18n · already documented · second check set severity high → medium

**Where:** `src/index.html:4-13`, `docs/components/home.md:1535`

**Problem.** WhatsApp, Telegram and X build link cards from og:title, og:description, og:image and twitter:card. None of these exist in any server-rendered HTML, so every shared link appears as a bare text link with no image. For a community app whose growth depends on people sharing links in group chats, this is the most visible share-quality gap. The repo already records the missing share metadata as a TODO in home.md.

**Recommendation.** Add site-wide defaults to index.html: <meta property="og:site_name" content="MLPTF">, <meta property="og:type" content="website">, <meta property="og:image" content="https://<host>/share-card.png">, <meta name="twitter:card" content="summary_large_image">. Create a 1200x630 PNG in public/ for the default card. Route-specific og:title and og:description come from the SeoService described in the per-entity finding. Keep the image absolute, because crawlers do not resolve relative URLs against the base href.

**Verification.** src/index.html has only title, description, viewport and icon, with no og:* or twitter:* tags. The only og tags are in about.page.ts, which is client-only, and home.md:1535 already records share metadata as an open TODO.

**Second check (high-severity pass).** code review: holds (medium). src/index.html has only title, description, viewport and icon tags. curl of http://localhost:4321/ returned zero og: or twitter: matches. The only og tags in src are in about.page.ts:155-157, and /about is RenderMode.Client in app.routes.server.ts, so crawlers never see them. docs/components/home.md already lists share metadata as missing. The wording 'bare text link' is slightly strong, since WhatsApp and Telegram still show title and description text, but they get no image and no per-page title, which is a real share-quality gap. It is a growth polish item, not a breakage, so medium. impact review: partially (medium). The claim is correct: src/index.html has only title, description, viewport and icons, and the only og tags are set client-side in about.page.ts. Shared links in WhatsApp and Telegram therefore show no card or image. However, this is growth polish rather than harm to people using the app, so high is overstated. The recommendation is also incomplete: site-wide static og:image and twitter:card help, but the og:title and og:description tags are still missing or generic on every route until a per-route SEO service sets them during SSR. A new 1200x630 image asset also has to be designed and an absolute host chosen.

**Fix note from the second check.** Add the static defaults (og:site_name, og:type, og:image with an absolute URL, twitter:card summary_large_image) to index.html plus one 1200x630 PNG in public/. Per-route og:title and og:description can wait for a later change. Add static og:site_name, og:type, og:image (absolute URL) and twitter:card to index.html, with a share-card.png in public/. Set og:title and og:description server-side for the main routes in a follow-up. Note the page title is TranSPOT while tags elsewhere say MLPTF, so settle on one brand name first.

**Also reported as:** [F458](ux-content-and-visual-polish.md#f016) [ui-system] index.html has no Open Graph, Twitter, canonical, theme-color or manifest metadata, and its fallback title says TranSPOT (src/index.html:5, src/index.html:6)

<details><summary>Evidence</summary>

```text
src/index.html:5-13 contains only <title>TranSPOT</title>, meta description, viewport and icon links.
Live: grep of curl output for / , /insiden, /spotting/L1, /gallery and /methodology finds zero og:* or twitter:* tags.
The only og tags in the codebase are in about.page.ts:155-157, which run client-side on a client-rendered page that crawlers do not execute.
```

</details>

<a id="f092"></a>

#### F092 · Fix the collapsed quiet-lines row on phones: the toggle is squeezed and its label overlaps the pin hint

**medium** · effort S · ui-visual · home-data

**Where:** `src/app/features/home/line-pulse/network-board.component.ts:348`, `src/app/features/home/line-pulse/network-board.component.ts:375`, `.omo/evidence/audit-2026-10-21/agents/home-data/cdp/O-390.png`

**Problem.** Both children of the summary row are flex items with min-w-0, and the hint is wider, so the toggle that expands the other 12 to 14 lines collapses to a sliver and its label spills over the hint text. Every first-time phone visitor sees this until they pin a line or press Dismiss, and the control they need to reveal most of the network is the garbled one.

**Recommendation.** Put the hint on its own line below the toggle (flex-col, or flex-wrap with basis-full on the hint) and give the toggle shrink-0 with its natural width, or move the hint into a separate dismissible row above the group. Add a 360 px and 390 px layout assertion to the e2e home spec.

**Verification.** network-board.component.ts:348-375 puts a flex-1 min-w-0 button and a min-w-0 hint in a flex-wrap row, so the basis-0 toggle never wraps. The O-390.png screenshot shows '14 lines running normally' overprinting 'Pin your lines to see them first'.

**Also reported as:** [F103](ux-content-and-visual-polish.md#f092) [home-ui] The quiet-lines summary row overlaps the 'Pin your lines' hint at 390 px (lead for the network-board reviewer) (src/app/features/home/line-pulse/network-board.component.ts:339, src/app/features/home/line-pulse/network-board.component.ts:348); [F160](ux-content-and-visual-polish.md#f092) [ux-home] Fix the pin hint colliding with the 'N lines running normally' label at 390 px (src/app/features/home/line-pulse/network-board.component.ts:348, src/app/features/home/line-pulse/network-board.component.ts:375)

<details><summary>Evidence</summary>

```text
class="min-h-11 min-w-0 flex-1 justify-start gap-2 text-left text-sm font-normal" data-testid="line-board-quiet-toggle"
class="text-muted-foreground flex min-w-0 items-center gap-1 text-xs" data-testid="line-board-pin-hint"
Measured at 390 px: toggle box 72 px wide but its text needs 213 px; at 360 px the box is 42 px wide. The text '14 lines running normally' visibly overprints 'Pin your lines to see them first'.
```

</details>

<a id="f099"></a>

#### F099 · 'View it in the feed' on the duplicate notice is often a silent no-op

**medium** · effort S · ux · home-ui

**Where:** `src/app/features/home/feed/link-submit-box.component.ts:123`, `src/app/features/home/feed/link-submit-box.component.ts:174`, `src/app/features/home/feed/link-submit-box.component.ts:235`, `src/app/features/home/home.page.ts:574`

**Problem.** The notice says 'Already submitted — your upvote was added' and offers a link, but that link only works if the original is among the 8 Today rows that are loaded, on the active tab, and not inside a collapsed conversation. A link first shared yesterday or last week, the most likely duplicate, is not on the Today feed at all, and if the reader is on the Last Week tab the Today panel is hidden. Clicking does nothing, with no message, no focus change, and no highlight even when it does scroll. Because the vote was also applied without the row being visible, the reader cannot confirm what they upvoted.

**Recommendation.** Return the original link's title and date from the payload (already selected: payload.link) and render 'Already shared on 18 Oct: <title>' with the action chosen by what exists: if the row is in the DOM, switch to the Today tab when needed, scroll, move focus to the row and ring it for a couple of seconds (same highlight pattern as store.highlightLine); otherwise omit the link and open the existing Last Week tab or the link's own URL. Clear `duplicateOfId` when the input value changes so a stale notice does not sit under the next paste.

**Verification.** viewDuplicate only does getElementById(...)?.scrollIntoView, and its own doc comment admits it is a no-op when the row is not visible or loaded; the backend dedupes by canonical URL across all time. The reader gets no feedback in those cases.

<details><summary>Evidence</summary>

```text
link-submit-box.component.ts:179  this.document.getElementById(feedLinkDomId(linkId))?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
The doc comment above it says a duplicate with no visible row is "a no-op". The backend dedupes on the canonical URL over all time (incident/services/feed_links.py), not only today.
```

</details>

<a id="f117"></a>

#### F117 · Markdown details are unstyled because the `prose` classes have no Tailwind typography plugin behind them

**medium** · effort S · ui-visual · insiden-ui

**Where:** `src/app/features/insiden/incident-card/incident-card.component.html:379-382`, `src/styles.css`

**Problem.** The class names are a no-op, so headings, lists and links in incident details fall back to Tailwind preflight: headings are body-sized, bullets and numbers are removed from lists, and links look exactly like plain text. Press release links, which are the main content of the details field, cannot be recognised as links, and long unbroken URLs have no break rule.

**Recommendation.** Either add `@plugin "@tailwindcss/typography";` to styles.css (and the dev dependency), or write a small scoped Tailwind v4 rule set for `markdown` content (for example arbitrary-variant classes such as `[&_a]:text-primary [&_a]:underline [&_a]:break-words [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:text-base [&_h1]:font-semibold`). Also add `target="_blank" rel="noopener noreferrer"` handling by overriding the renderer's link rule if opening in a new tab is wanted, because sanitised markdown links currently navigate in the same tab.

**Verification.** incident-card.component.html:381 uses `prose prose-sm dark:prose-invert`, but package.json has no @tailwindcss/typography and styles.css has no @plugin. The classes do nothing.

**Also reported as:** [F167](ux-content-and-visual-polish.md#f117) [ux-insiden-gallery] Details markdown is unstyled because the Tailwind typography plugin is not installed (src/app/features/insiden/incident-card/incident-card.component.html:379, src/styles.css)

<details><summary>Evidence</summary>

```text
<markdown [data]="incident().details" class="prose prose-sm dark:prose-invert max-w-none text-sm" /> . package.json has no @tailwindcss/typography, styles.css has no @plugin line, and the built stylesheet contains 0 occurrences of `.prose`. Measured on incident 1 at /insiden/2023-05-19: the rendered `<a>` inside markdown has textDecorationLine 'none' and the same colour as body text.
```

</details>

<a id="f118"></a>

#### F118 · Each chronology row renders the same 'View source' link twice

**medium** · effort S · ui-visual · insiden-ui

**Where:** `src/app/features/insiden/incident-card/incident-card.component.html:99-123`, `src/app/features/insiden/incident-card/incident-card.component.html:129-153`, `.omo/evidence/audit-2026-10-21/agents/insiden/s1.png`

**Problem.** This looks like a merge or copy-paste leftover. Sighted users see a duplicated icon, keyboard users tab through two identical stops, and screen readers announce 'View source, link' twice for the same destination. The icon is also only 12 px (`size-3`), so it is a very small tap target, and the accessible name does not say which row it belongs to.

**Recommendation.** Delete one of the two blocks (the second, at lines 129-153, follows the status badge). Enlarge the hit area (`p-2 -m-2` or `min-h-6 min-w-6`) and make the name specific, for example `[attr.aria-label]="'View source for ' + (entry.datetime | date: 'MMM d, HH:mm')"`.

**Verification.** Lines 99 and 129 of incident-card.component.html render the identical `View source` anchor with the same svg inside one chronology row, separated only by the status badge. The duplicate is real.

**Also reported as:** [F166](ux-content-and-visual-polish.md#f118) [ux-insiden-gallery] Each source link is rendered twice in the chronology timeline (src/app/features/insiden/incident-card/incident-card.component.html:99, src/app/features/insiden/incident-card/incident-card.component.html:129)

<details><summary>Evidence</summary>

```text
Lines 99 and 129 both start `@if (entry.sourceUrl) { <a [href]="entry.sourceUrl" target="_blank" rel="noopener noreferrer" ... aria-label="View source" title="View source">` with the same external-link svg. The screenshot at 390 px shows two identical icons side by side on every row that has a source.
```

</details>

<a id="f150"></a>

#### F150 · Mobile layer sheet stays open after Apply and hides the unsaved-changes bar when collapsed

**medium** · effort S · ux · tracker-gallery

**Where:** `src/app/features/tracker/status-card/mobile-layer-sheet.component.ts:85`, `src/app/features/tracker/status-card/mobile-layer-sheet.component.ts:89`, `src/app/features/tracker/status-card/layer-apply-bar.component.ts:32`, `src/app/features/tracker/data/layer-selection.service.ts:14`

**Problem.** On a phone the flow is: open the sheet, tick a feed, tap Apply, and then the sheet stays at 60 vh with a 40 percent black backdrop, so the user still sees a dimmed map and has to discover that tapping the backdrop closes it. If they collapse the sheet before applying, the Apply/Undo bar disappears with it and nothing indicates that the ticks are unsaved. A first visit shows only the rail line because no realtime feed is selected by default, so the page looks empty. The sheet also has no dialog semantics, no Escape handling and no focus management.

**Recommendation.** Emit an `applied` output from `LayerApplyBarComponent` (or call a shared method) and collapse the sheet on Apply. Show a small dot or `Apply` pill on the collapsed bar while `hasUnsavedChanges()` is true. Seed the draft and applied state with KTMB (and, for Klang Valley users, the RapidBus KL feed) so the first visit shows vehicles, and consider an auto-apply for single toggles on mobile. Give the expanded sheet `role="dialog"` `aria-modal="true"`, Escape to close, and move focus to the first control; the app already has `HlmSheet` with `cdkTrapFocus` that can be reused with `side="bottom"`.

**Verification.** Mobile sheet expanded state is not collapsed after apply, the apply bar renders only inside the expanded branch, and no dialog semantics exist. Defaults seed no realtime feed.

<details><summary>Evidence</summary>

```text
<div class="flex max-h-[60vh] flex-col border-t">
...
@if (layerSelection.hasUnsavedChanges()) { <div ...><app-layer-apply-bar /></div> }

readonly realtimeChecked = signal<Record<string, boolean>>({});   // nothing applied or ticked by default
```

</details>

<a id="f151"></a>

#### F151 · Desktop layer card is a fixed 576 px by 60 vh and covers most of the map on tablets and small laptops

**medium** · effort S · ui-visual · tracker-gallery

**Where:** `src/app/features/tracker/status-card/status-card.component.ts:32`, `src/app/features/tracker/tracker-shell.page.ts:31`

**Problem.** The card appears at the `sm` breakpoint (640 px), where a 576 px card plus the 12 px offset leaves about 50 px of map visible. It cannot be collapsed on desktop either, so it permanently covers a large part of the viewport. `h-screen` equals 100vh, which on mobile Safari and Chrome is taller than the visible area when the URL bar is showing, so the map attribution and the collapsed sheet's bottom edge can sit under browser chrome. `w-screen` includes the scrollbar width on desktop.

**Recommendation.** Use `w-[min(36rem,calc(100vw-1.5rem))]` and switch to the card at `md:` or `lg:`; add a collapse chevron that leaves a compact header (layer counts plus an Apply dot). Replace `h-screen w-screen` with `h-dvh w-full` and add `pb-[env(safe-area-inset-bottom)]` where the sheet meets the edge.

**Verification.** Card is 'hidden h-[60vh] w-[576px] sm:flex' at 640px, leaving little map, and the shell uses h-screen w-screen.

<details><summary>Evidence</summary>

```text
<div hlmCard class="hidden h-[60vh] w-[576px] flex-col sm:flex">
...
<div class="relative h-screen w-screen overflow-hidden">
```

</details>

<a id="f153"></a>

#### F153 · Opening or closing a photo probably scrolls the feed back to the top

**medium** · effort S · ux · tracker-gallery · partially confirmed · severity adjusted from high

**Where:** `src/app/app.config.ts:156`, `src/app/features/gallery/gallery.page.ts:150`, `src/app/features/gallery/gallery.page.ts:155`

**Problem.** With `scrollPositionRestoration: "enabled"` the Angular router scrolls to the top after any non-popstate navigation, and clicking a tile or the close button is a normal (forward) navigation. The component instance is reused, so the data stays, but I expect the window to jump to the top of the page while the viewer opens, and again when the viewer closes, so a user who scrolled through several pages of photos loses their position every time they look at one. I could not run a browser in this audit, so please confirm in one session: scroll down in /gallery, open a photo, press Escape.

**Recommendation.** Verify in a browser first. Simplest fix is Location.go()/replaceState for the open/close URL change instead of a router navigation.

_Original suggestion (corrected by the verifier):_ Navigate with a state that the router can ignore, or avoid routing for the transition: use `this.router.navigate([...], { replaceUrl: false, state: { keepScroll: true } })` plus a `Scroll` event listener (`router.events` filtered by `Scroll`) that restores `window.scrollY` captured before navigation when `history.state.keepScroll` is set, or use `Location.go()` / `window.history.pushState` to change the URL without a router navigation and keep the existing Back/Forward handling through the `mediaId` input. Add a spec that scrolls, opens, closes and asserts `scrollY`.

**Verification.** withInMemoryScrolling scrollPositionRestoration 'enabled' scrolls to top on non-popstate navigations, and onOpenMedia/onCloseMedia use router.navigate. This is likely but I could not confirm in a browser.

<details><summary>Evidence</summary>

```text
withInMemoryScrolling({ scrollPositionRestoration: "enabled", anchorScrolling: "enabled" }),
...
this.router.navigate(["/gallery", media.id]);
...
this.router.navigate(["/gallery"]);
```

</details>

<a id="f154"></a>

#### F154 · Year navigation sits below the feed on phones, is not sticky on desktop, and never tracks scroll

**medium** · effort S · ux · tracker-gallery

**Where:** `src/app/features/gallery/gallery.page.html:6`, `src/app/features/gallery/gallery.page.html:54`, `src/app/features/gallery/year-slider/gallery-year-slider.component.ts:13`

**Problem.** Below 640 px the flex column places the `aside` after the entire feed and the Load more button, so the main jump-to-year control is effectively undiscoverable on phones, which is most of the audience. On desktop the nav is not `sticky`, so it scrolls out of view as soon as the user scrolls the first screen. The highlighted year only reflects the last jump target, not the year currently on screen, and a jump that needs many pages gives no progress feedback beyond disabled buttons.

**Recommendation.** Add `order-first` on the aside for mobile and make the nav a sticky chip bar (`sticky top-14 z-10 bg-background/90 backdrop-blur`) with horizontal scroll; on `sm:` use `sm:sticky sm:top-20 sm:self-start`. Track the visible year with one `IntersectionObserver` over the `gallery-year-*` sections and pass it as `activeYear`. Show `Loading 2023… (page 4 of ~17)` while `isJumping()`.

**Verification.** The aside follows the feed in a flex-col below sm, and the year nav is not sticky. activeYear is bound only to jumpTargetYear.

**Also reported as:** [F479](ux-content-and-visual-polish.md#f154) [ux-insiden-gallery] Year jump chips sit below the whole grid on phones and give no progress while paging up to 100 requests (src/app/features/gallery/gallery.page.html:6, src/app/features/gallery/gallery.page.html:54)

<details><summary>Evidence</summary>

```text
<div class="flex flex-col gap-6 sm:flex-row">
  <div class="flex flex-1 flex-col gap-8"> ... grid ... Load more </div>
  <aside> <app-gallery-year-slider .../>

nav class="flex flex-row gap-1 overflow-x-auto pb-2 sm:w-24 sm:flex-col sm:overflow-visible sm:pb-0"
```

</details>

<a id="f158"></a>

#### F158 · Inputs, selects and the combobox use 14px text, so iPhones zoom the page on focus

**medium** · effort S · ux · ui-system

**Where:** `src/app/ui/input/input.ts:33`, `src/app/ui/select/native-select.ts:34`, `src/app/features/home/report/report-chooser.component.ts:155`, `src/app/features/insiden/incident-form/incident-form.component.html:26`

**Problem.** iOS Safari zooms the viewport when a field with a computed font-size under 16px is focused and does not always zoom back out. HlmInput, HlmNativeSelect and (through hlmInput) the combobox default to text-sm (14px) and h-8 (32px). The report chooser already works around this with text-base, but the incident form, link form, line-status sheet and spotting report form, the main submission flows on phones, inherit the default.

**Recommendation.** Change the defaults to text-base md:text-sm and h-10 md:h-8 in HlmInput, HlmNativeSelect and the combobox input class, and delete the per-call-site overrides. Do not add maximum-scale to the viewport meta.

**Verification.** input.ts:33 and native-select.ts:34 use text-sm (14px), and the report chooser already overrides to text-base to avoid iOS focus zoom. The fix is standard and correct.

<details><summary>Evidence</summary>

```text
w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1 text-sm outline-none ... h-8 (input.ts); the report chooser overrides it with class="h-11 text-base"
```

</details>

<a id="f168"></a>

#### F168 · Tabs are styled badges without tab semantics or URL state, and the Submitted Links tab is unexplained

**medium** · effort S · ux · ux-insiden-gallery · already documented

**Where:** `src/app/features/insiden/insiden.page.html:30`, `src/app/features/insiden/insiden.page.ts:62`, `src/app/features/insiden/insiden.page.html:184`

**Problem.** The two views are buttons inside a nav with no role=tablist/tab, aria-selected or aria-controls, so assistive tech cannot tell which view is active. The selected tab is not in the URL, so "Submitted Links" cannot be shared or restored after Back, and every switch destroys and refetches the other view. Header buttons ("Submit link" / "Report an incident") stay visible on both tabs while the terms "Insiden", "Incidents" and "Submitted Links" are used for overlapping concepts without a one-line explanation of what a submitted link is.

**Recommendation.** Use the project's Spartan tabs primitive (or add role=tablist/tab/tabpanel with aria-selected) and sync the tab to ?tab=links via the shared core/url-state helper that MISTAKES.md already recommends for insiden. Add a one-line description under the Links tab ("Community-shared news and social posts about disruptions") and pick one term ("Incidents") for headings, with "Insiden" kept only as the module name.

**Verification.** insiden.page.html uses badge buttons inside a nav with no tab roles. insiden.page.ts:62 comments that the tab state is client-only with no URL sync.

**Also reported as:** [F389](ux-content-and-visual-polish.md#f168) [insiden-ui] Incident and Links tabs are non-semantic badges, and the selected tab is not in the URL (src/app/features/insiden/insiden.page.html:30-47, src/app/features/insiden/insiden.page.ts:61-62)

<details><summary>Evidence</summary>

```text
insiden.page.html:30  <nav class="flex flex-wrap gap-2.5"> <button hlmBadge [variant]="activeTab() === 'incidents' ? 'default' : 'outline'" ... (click)="activeTab.set('incidents')">
insiden.page.ts:62  /** Client-side tab state only - no URL/query-param sync, no tab library. */
```

</details>

<a id="f169"></a>

#### F169 · Tracker initial camera shows the whole peninsula, not the Klang Valley

**medium** · effort S · ux · ux-rest · already documented

**Where:** `src/app/features/tracker/map/tracker-map.component.ts:71`, `.omo/evidence/audit-2026-10-21/routes/tracker__mobile__light__viewport.png`

**Problem.** The audience is mostly Klang Valley commuters, yet the map opens at zoom 6.5 centred on Perak/Pahang, so the area they care about is a few pixels wide. Every rail line is also drawn in one blue (`.color("rgb(22,119,255)")`) with animated arrow textures, so lines cannot be told apart and stations are unlabelled. Stops are amber 4 px dots.

**Recommendation.** Open on Kuala Lumpur (about [101.69, 3.14], zoom 10.5) unless a saved viewport exists, and add a locate-me button using navigator.geolocation. Colour route features by line using the existing line colours (read from the GeoJSON properties) and add station name labels from zoom 12. Persisting centre and zoom is already listed in MISTAKES.md as a gap.

**Verification.** tracker-map.component.ts sets center [101.492, 4.5], zoom 6.5, and the screenshot shows unlabelled single-colour lines; tracker.md/MISTAKES already treat viewport persistence as a gap. Polish-level UX but real for a Klang Valley audience.

<details><summary>Evidence</summary>

```text
center: [101.492, 4.5], zoom: 6.5. In the 390 px screenshot the rail network is two thin, jittery polylines with no labels, and there is no geolocation or 'zoom to Klang Valley' control.
```

</details>

<a id="f178"></a>

#### F178 · Vehicle heatmap defaults to the current year, so most vehicles open on an empty grid and '0 spottings today'

**medium** · effort S · ux · ux-spotting

**Where:** `src/app/domain-ui/spotting-activity-heatmap/spotting-activity-heatmap.ts:214`, `src/app/features/spotting/vehicle-detail/vehicle-detail.page.ts:114`, `.omo/evidence/audit-2026-10-21/routes/vehicle__mobile__light__full.png`

**Problem.** For any vehicle not spotted this year (decommissioned or married units, a large share of this fleet), the page's main visual is blank and the caption says 0%. The user must discover the other year pill. The heading 'Spotting Activity - 0 spottings today' adds a negative statement above it.

**Recommendation.** Initialise selectedYear to the year of the most recent data point when the current year has none (computed fallback or linkedSignal over years()). Only show 'N spottings today' when N>0, and replace the 0% caption with 'Last spotted Feb 24, 2003'.

**Verification.** selectedYear starts as the current year and years() always adds the current year. A vehicle not spotted this year opens on an empty grid.

<details><summary>Evidence</summary>

```text
protected readonly selectedYear = signal(new Date().getFullYear());  // caption: "0 spottings in 2026 — that's 0% of the all-time total." Screenshot: vehicle 01 (Old), last spotted 2003, shows an empty 2026 grid; the 2003 pill must be tapped to see its single spotting.
```

</details>

<a id="f181"></a>

#### F181 · Report button never pre-selects the line you are viewing, so reporters retype it on every visit

**medium** · effort S · ux · ux-spotting

**Where:** `src/app/features/spotting/report-spotting-button/report-spotting-button.component.ts:15`, `src/app/features/spotting/data/report-sheet.service.ts:20`, `src/app/features/spotting/report-form/report-form.component.ts:196`, `.omo/evidence/audit-2026-10-21/interactions/pass1-superseded/spotting__report-entry-logged-out.png`

**Problem.** The form opened from /spotting/4 (screenshot) shows an empty Line combobox even though the page is entirely about that line. The code comment justifies a blank vehicle, but that rationale does not apply to the line, which is almost always correct and cheap to change. On a phone, picking a line from a searchable combobox is the most expensive step of the form.

**Recommendation.** Give ReportSpottingButtonComponent an optional lineId input and call reportSheet.openFor(lineId) from line-overview and vehicle-detail (pass the page's lineId). Keep the vehicle blank on the line page; on the vehicle page, offer it pre-filled but clearly editable, or show a 'Report 01 (Old)' secondary action.

**Verification.** The button calls reportSheet.open(), although openFor(lineId) exists. The vehicle-blank rationale does not cover the line.

**Also reported as:** [F437](ux-content-and-visual-polish.md#f181) [spotting] Report CTA ignores the page context, forcing users to re-pick line and vehicle from long lists (src/app/features/spotting/report-spotting-button/report-spotting-button.component.ts:15, src/app/features/spotting/vehicle-detail/vehicle-detail.page.ts:101)

<details><summary>Evidence</summary>

```text
<button hlmBtn [class]="userClass()" (click)="reportSheet.open()">  // service already has openFor(lineId); form comment: "the line and vehicle fields start blank, even when opened from a vehicle-detail page's own button — the vehicle you were just looking at isn't necessarily the one you're reporting on."
```

</details>

<a id="f183"></a>

#### F183 · Adblock users get permanent invisible 250 px holes, and pages carry 3 ad units, not the documented 2

**medium** · effort S · ux · ux-spotting

**Where:** `src/app/ui/ad-slot/ad-slot.component.ts:111`, `src/app/features/spotting/spotting-shell/spotting-shell.page.ts:39`, `src/app/features/spotting/vehicle-detail/vehicle-detail.page.ts:136`, `src/app/features/spotting/line-overview/line-overview.page.ts:176`, `src/app/core/ads/ads.config.ts:23`, `.omo/evidence/audit-2026-10-21/interactions/spotting__vehicle-lower.png`

**Problem.** The doc comment collapses the slot only when AdSense reports 'unfilled'. When the script is blocked (common among ad-blocker users) the status never arrives, the block stays 'pending' and invisible, and reserves 250 px of blank space mid-content (the audit screenshot shows exactly this gap, although blocked ads are a test setup, the same state occurs for real blocker users). On phones the shell's two footer slots stack, so each spotting page can show three 250 px units, contradicting the stated 'max 2' cap.

**Recommendation.** Add a timeout (e.g. 3 s after the IntersectionObserver fires) after which a still-pending slot is treated as unfilled and gets hidden. Reconcile the density cap: render footerEndRight only at sm+ (hidden on mobile) or drop the in-content slot on the vehicle page, and correct the comment.

**Verification.** The shell renders two ad slots and vehicle-detail adds a third, contradicting the 'max 2' comments. A pending slot stays invisible but keeps its reserved height, with no timeout fallback.

<details><summary>Evidence</summary>

```text
[class.invisible]="fillState() === 'pending' && !isPlaceholder()" [class.hidden]="fillState() === 'unfilled' && !isPlaceholder()"  // vehicle-detail: "Density cap: ... footerEnd + this = 2 (max)." but the shell renders <app-ad-slot footerEnd> AND <app-ad-slot footerEndRight>, both with minHeightPx 250. Screenshot spotting__vehicle-lower: a roughly 300 px empty band between Notable Incidents and Spotting History.
```

</details>

<a id="f184"></a>

#### F184 · Vehicle page omits vehicle type and line name, and its vehicle switcher combobox is unlabelled

**medium** · effort S · ux · ux-spotting

**Where:** `src/app/features/spotting/vehicle-detail/vehicle-detail.page.ts:69`, `src/app/features/spotting/vehicle-detail/vehicle-detail.page.ts:79`, `src/app/features/spotting/vehicle-detail/vehicle-detail.page.ts:97`, `.omo/evidence/audit-2026-10-21/routes/vehicle__mobile__light__viewport.png`

**Problem.** The h1 is just '01 (Old)': the page never says which vehicle type (e.g. Bombardier Innovia 414) or which line in the heading, and the breadcrumb's middle crumb 'Vehicle' is a dead, non-link word. The breadcrumb doubles as a vehicle switcher, but the borderless combobox has no aria-label (axe critical 'Form elements must have labels'), and its only affordance is a tiny chevron.

**Recommendation.** Show the vehicle type name under the h1 (it is already in VEHICLE_TYPES_QUERY) and make the breadcrumb 'LRT KJL / Bombardier Innovia 414 / 01 (Old)', with the type linking to the line page. Pass aria-label="Switch vehicle" to hlm-combobox (the component already supports it, as the report form does) and give it a visible border or label.

**Verification.** The hlm-combobox in the breadcrumb has no aria-label, although the component supports one. The h1 is only the identification number, and 'Vehicle' is a plain span.

<details><summary>Evidence</summary>

```text
<span class="text-muted-foreground">Vehicle</span> ... <hlm-combobox class="field-sizing-content !border-none !bg-transparent ..." [value]="vehicleId()" ... emptyMessage="No matching vehicles" />  <h1 class="text-xl font-semibold">{{ vehicle.identificationNo }}</h1>. axe: label (critical) on the combobox input.
```

</details>

<a id="f202"></a>

#### F202 · Give every route a meaningful title and share-ready metadata (Open Graph) via a TitleStrategy

**medium** · effort M · seo-meta · core-shell

**Where:** `src/app/app.routes.ts:27`, `src/app/app.routes.ts:35`, `src/index.html:4`, `src/app/features/spotting/spotting.routes.ts:19`

**Problem.** Every line page, vehicle page, incident day and gallery photo shares the same static tab title ('MLPTF | TranSPOT', 'MLPTF | Insiden', 'MLPTF | Gallery'), which hurts search results, browser history and bookmarks, screen-reader page-change cues and the GA page_title. Since this community shares links in WhatsApp and Telegram groups, there are no Open Graph or Twitter card tags on any server-rendered page, so link previews show a bare URL.

**Recommendation.** Add a custom TitleStrategy (extends TitleStrategy) that builds 'LRT Kelana Jaya | TranSPOT | MLPTF' from route data or resolver results, and let pages set data via a small SeoService (Title plus Meta description, og:title, og:description, og:image, canonical) called from their data effects so SSR emits them. Put default og:* tags and a share image in index.html. Add titles to the matcher routes via a resolve function (for example insiden date).

**Verification.** Routes carry only static title strings and there is no TitleStrategy. og tags are set only in about.page.ts, which is client-rendered. Per-entity titles and share previews are missing.

**Also reported as:** [F042](ux-content-and-visual-polish.md#f202) [seo-pwa-i18n] Shareable entity URLs have no per-entity title or description (src/app/app.routes.ts:27, src/app/features/spotting/spotting.routes.ts:41); [F141](ux-content-and-visual-polish.md#f202) [spotting] Every spotting page shares one title and description, so a vehicle permalink looks identical in tabs, history and shares (src/app/app.routes.ts:27, src/app/features/spotting/vehicle-detail/vehicle-detail.page.ts:153); [F131](ux-content-and-visual-polish.md#f202) [seo-pwa-i18n] Client-rendered public pages ship the shell title and generic description (src/index.html:5, src/app/app.routes.ts:38); [F208](ux-content-and-visual-polish.md#f202) [features] Add per-page Open Graph and Twitter share tags (and a sitemap) on the SSR vehicle, line, incident and photo routes (src/app/features/spotting/vehicle-detail/vehicle-detail.page.ts:153, src/app/features/about/about.page.ts:151)

<details><summary>Evidence</summary>

```text
path: "spotting", title: "MLPTF | TranSPOT", loadChildren: ...
// no inject(Title) or TitleStrategy anywhere in src/app; og:title only set in about.page.ts (a client-rendered route)
// index.html has a <title> and description but no og:* or twitter:* tags
```

</details>

<a id="f215"></a>

#### F215 · Rewrite the 'running normally' and 'needs attention' rules: the status is a vote-weighted plurality, not 'any rider reported'

**medium** · effort M · code-quality · gap-1 · severity adjusted from high

**Where:** `src/app/core/methodology/methodology.content.ts:424`, `src/app/core/methodology/methodology.content.ts:436`, `src/app/core/methodology/methodology.content.ts:576`, `src/app/features/home/data/status-confidence.util.ts:186-189`, `rosak_backend/incident/services/line_status.py:consolidate (lines ~95-135)`

**Problem.** The frontend rules key off line.passengerStatus, which the backend computes as ONE winning status per line: a weighted majority over the last 15 minutes, where a report attached to a community link counts 1 + its upvote score. So one Delayed report among four Normal ones does not make a line 'need attention', and an upvoted Delayed link can outweigh several Normal reports. The published sentences ('no rider has reported it...', 'a rider reported a passenger status above Normal') describe a different rule. The vote weighting that decides the headline status is not documented anywhere. Also, the backend returns null, not NORMAL, when nothing was filed; the has-data rationale and the util comment are factually wrong about that (the code happens to work because null ranks as 0).

**Recommendation.** Reword the three metrics to say what is computed: 'the line's reported status is the most common recent rider report on that line (reports linked to upvoted links count for more); a line needs attention when that consensus is Delayed or Disrupted'. Add a sightings-section MetricDoc for the consolidation rule (window from statusWindowMinutes, vote weighting, tie-break by recency then severity). Fix the has-data text to 'no recent reports gives no passenger status at all', and correct the comment at status-confidence.util.ts:186-189. Bump lastReviewed on every touched entry.

**Verification.** backend consolidate() is a weighted majority (1 + max(score,0) for linked reports) over the window, and load_line_pulses returns status=None with no reports. The util comment claiming passengerStatus is never null is therefore wrong, and the registry wording does not describe the plurality rule.

<details><summary>Evidence</summary>

```text
Registry: "no rider has reported it Delayed or Disrupted in the current window"
Registry (has-data): "A passenger status of Normal ... is the reading the backend returns when nothing notable was filed"
Code comment: "`passengerStatus` is never null on a line that has been read"
Backend: contribution = 1 + max(score, 0) if entry.link_id is not None else 1 ; best = max(weight, key=(weight, latest, SEVERITY_RANK))
Live API (16 lines): passengerStatus = None for every line with 0 reports
```

</details>

<a id="f231"></a>

#### F231 · Pro feed search silently covers only the 8 loaded rows and says 'No links match'

**medium** · effort M · ux · home-data

**Where:** `src/app/features/home/pro/pro-feed-widget.component.ts:200`, `src/app/features/home/data/home-feed.util.ts:6`, `src/app/features/home/data/feed-filter.util.ts:156`

**Problem.** The search box and the Source filter run over store.feedLinks(), which is the first page of 8 roots plus whatever Load More appended. A Pro reader who searches for a station name and has a match on row 12 is told 'No links match these filters.' with nothing saying that the search only saw 8 of, say, 30 rows. The window label says 'Today only' but not 'loaded rows only'. It also writes a router navigation on every keystroke (the dashboard effect mirrors the query into ?q= with no debounce).

**Recommendation.** Show Load More (and a 'searched N of M loaded' note) in the empty state while hasNextPage is true.

_Original suggestion (corrected by the verifier):_ While a query or provenance filter is active and hasNextPage is true, show 'Searched 8 of 30 loaded links. Load more to search further' beside the count (or auto-load pages until a few matches are found). Debounce the ?q= URL write by about 300 ms. Longer term ask the backend for a search argument.

**Verification.** visible() filters only store.feedLinks() (loaded rows), the empty copy is 'No links match these filters.', and the footer with Load More is wrapped in @if (visible().length > 0), so a search with zero loaded matches hides the very button needed to load more. Window label says only 'Today only'.

<details><summary>Evidence</summary>

```text
protected readonly visible = computed(() => filterFeedLinks(this.store.feedLinks(), { lineId: ..., status: ..., query: this.store.feedSearchQuery() }));
export const FEED_PAGE_SIZE = 8;
const PRO_FEED_EMPTY_COPY = "No links match these filters.";
```

</details>

<a id="f251"></a>

#### F251 · Make /methodology actually publish the methodology: render metric definitions in the page and retire the 'still in progress' placeholders

**medium** · effort M · ux · profile-about-misc · partially confirmed · severity adjusted from high

**Where:** `src/app/features/methodology/methodology-section.component.ts:94-122`, `src/app/core/methodology/methodology.content.ts:154-170`, `src/app/core/methodology/methodology.content.spec.ts:109-122`, `src/app/ui/info-popover/info-popover.ts:176`, `src/app/features/methodology/methodology.page.ts:13-16`

**Problem.** The product promise is a page that documents every metric, but the public page contains placeholder prose that leaks internal spec file names (DATA_PROVENANCE.md, MONTHLY_REVIEW.md, LINE_STATUS_DERIVE.md) and no actual rule. About 35 metric definitions already exist in the registry (line status, confidence chip, needs-attention, service-day charts, passenger statuses) but they are only reachable by clicking a hover/tap popover, so they are absent from the server-rendered HTML that the route was deliberately given RenderMode.Server to expose, and they are invisible to crawlers and to anyone reading on a phone without discovering the popovers. The meta description promises 'how reliability, line status, disruption episodes ... are derived', which the page does not deliver. Each popover also shows a 'How this is counted' link that points back to /methodology#section, the page the reader is already on. A spec (methodology.content.spec.ts:109) pins every section as inProgress, so the state is locked in.

**Recommendation.** In MethodologySectionComponent render each metric as visible content: a <dl> (or <details> for long ones) with the title as <dt> and the full renderMethodologyCopy(definition) as <dd>, with the popover trigger optional. Set inProgress to false on sections that now own metrics (line-status, sightings) and, for the rest, replace the 'owned by X.md' sentence with a plain 'Coming soon: how reliability is calculated' that does not name internal files. Pass showMethodologyLink=false (or omit the link) when the popover is rendered on /methodology itself. Update the spec at line 109 to assert the real invariant (every metric definition appears in the page text) instead of the all-in-progress state.

**Verification.** All eight sections are inProgress: true, and the spec at line 109 pins it. Metrics render only as popovers via app-info-popover, with a link back to /methodology. This is a documented work-in-progress state though, not a defect; the incompleteness and popover-only visibility are real but contained.

**Also reported as:** [F171](ux-content-and-visual-polish.md#f251) [ux-rest] Methodology page is eight 'in progress' placeholders that print internal spec file names (src/app/features/methodology/methodology-section.component.ts:39, src/app/core/methodology/methodology.content.ts:168); [F172](ux-content-and-visual-polish.md#f251) [ux-rest] Methodology metric definitions are hidden behind popovers and absent from the server-rendered page (src/app/features/methodology/methodology-section.component.ts:53, src/app/features/methodology/methodology-section.component.ts:58); [F214](ux-content-and-visual-polish.md#f251) [gap-1] Publish the line-status section: the live /methodology page says it is unfinished and hides every definition (src/app/core/methodology/methodology.content.ts:188-202, src/app/features/methodology/methodology-section.component.ts:33-43)

<details><summary>Evidence</summary>

```text
Measured: curl localhost:4321/methodology returns 200 with 3,963 characters of body text. All 8 sections read, e.g. 'How line status is derived ... is owned by LINE_STATUS_DERIVE.md; this section renders once that rule ships. This section is still in progress — its rule is owned by LINE_STATUS_DERIVE.md'. The metric definitions appear only as titles ('i Testing i Defunct i In Service share i Active ...'). Template: <app-info-popover [label]="metric.title" [content]="metric.content" [link]="_link()"> and the panel is rendered inside @if (_open()).
```

</details>

<a id="f253"></a>

#### F253 · Reordering or grouping links resets 'My Submitted Links' to page one, which then disables reordering again

**medium** · effort M · ux · profile-about-misc

**Where:** `src/app/features/profile/my-links/my-links.component.ts:585-594`, `src/app/features/profile/my-links/my-links.component.ts:308-312`, `src/app/features/profile/my-links/my-links.component.ts:107-111`

**Problem.** Every structural write (move up, move down, nest, group, ungroup) empties the list and refetches only the first 20 rows. The template then shows the skeleton in place of the list (scroll position lost), and when the user has more than 20 links hasMore becomes true again, which makes _moveReason refuse every reorder ('Still loading more of your links') until they scroll to the bottom and load every page. A user rearranging a 60-link conversation must scroll to the end after each single click. The 'whole sibling set' rule is real, but the reload design turns it into a recurring tax.

**Recommendation.** Do not clear the list before the response arrives; keep rendering the old rows (dimmed by _isThreading) and replace them atomically. Reload with `first: max(PAGE_SIZE, currentLinks.length)` (capped, for example at 100) so the user keeps the pages they already loaded and hasMore stays accurate, or patch parentId and position locally from the payload you just sent. Preserve scroll by not unmounting the container.

**Verification.** _reloadList clears _links and the cursor then reloads page one. _sequenceNotice and the move reasons disable reordering while _hasMore() is true, so with more than 20 links each edit forces scrolling again. The code comment explains why a reload is needed but not why it must reset to page one.

**Also reported as:** [F528](ux-content-and-visual-polish.md#f253) [gap-2] Every My Links reorder, nest or ungroup resets the list to page 1 and re-disables reordering (src/app/features/profile/my-links/my-links.component.ts:585, src/app/features/profile/my-links/my-links.component.ts:589)

<details><summary>Evidence</summary>

```text
private async _reloadList(): Promise<void> {
  await this._loadInFlight;
  this._links.set([]);
  this._nextCursor.set(null);
  this._hasMore.set(false);
  this._loadError.set(null);
  await this.loadMore();
}
```

</details>

<a id="f259"></a>

#### F259 · No sitemap.xml and no Sitemap line in robots.txt

**medium** · effort M · seo-meta · seo-pwa-i18n · already documented

**Where:** `public/robots.txt:12-13`, `src/server.ts:94`, `docs/components/about.md:195`

**Problem.** Search engines discover the public, unbounded routes (incident days, vehicles, gallery photos) only through links. Without a sitemap, newer or less linked pages are indexed slowly or not at all. The repo already notes the missing sitemap as a task.

**Recommendation.** Add an Express handler in server.ts before the Angular middleware at line 94, for example app.get("/sitemap.xml", ...), that builds the XML from the same GraphQL lists the pages use: lines, vehicles, incident days and recent media. Cache the response with s-maxage. Add Sitemap: https://<production host>/sitemap.xml to robots.txt. Cap incident days to a rolling window or emit a sitemap index, so the file stays small.

**Verification.** public/robots.txt has only Disallow lines and no Sitemap directive, and no sitemap.xml exists in public/ or src/. about.md:195 already records the sitemap as 'not started', so the gap is real and documented.

<details><summary>Evidence</summary>

```text
Live: curl -o /dev/null -w '%{http_code}' http://localhost:4321/sitemap.xml returns 404.
public/robots.txt:12-13 → Disallow: /console / Disallow: /profile (no Sitemap: directive)
```

</details>

<a id="f262"></a>

#### F262 · After a successful report nothing on the page behind the sheet refreshes

**medium** · effort M · ux · spotting

**Where:** `src/app/features/spotting/spotting-shell/spotting-shell.page.ts:60`, `src/app/features/spotting/report-form/report-form.component.ts:319`, `src/app/features/spotting/vehicle-detail/spotting-history/spotting-history.component.ts:122`

**Problem.** The only reaction to `submitted` is closing the sheet. A user who reports vehicle 26 while looking at vehicle 26's page sees the same 'Times Spotted', 'Last Spotted', activity heatmap and history until they leave and return (and the history component is deliberately excluded from revalidation). Kept-alive pages behind it are equally stale. The success toast is the only evidence the report worked, which feels broken to people who just did the main action of the feature.

**Recommendation.** Add a `reportSheet.submittedVersion` signal (incremented in the form's success path, carrying lineId and vehicleId). Pages read it in an effect or a linkedSignal-based trigger and call `resource.reload()` for the fleet, heatmap and incident resources; SpottingHistoryComponent resets its first page when the version changes for its vehicle. Optionally prepend an optimistic row marked 'Just now'.

**Verification.** spotting-shell only wires (submitted)="reportSheet.setOpen(false)", and the form emits submitted only after clear(). Nothing else triggers a reload of the fleet, heatmap or history.

<details><summary>Evidence</summary>

```text
<app-report-form #reportFormRef (submitted)="reportSheet.setOpen(false)" />
...
if (ok) { this.toast.success("Spotting entry recorded! 🥳", ...); const reportedLineId = this.model().lineId || null; this.clear(); this.submitted.emit(reportedLineId); }
```

</details>

<a id="f282"></a>

#### F282 · Make the phone's first screen answer 'is my line OK?' and stop duplicating actions that the sticky bar already carries

**medium** · effort M · ux · ux-home · partially confirmed · severity adjusted from high

**Where:** `src/app/features/home/hero/home-hero.component.ts:214`, `src/app/features/home/hero/home-hero.component.ts:295`, `src/app/features/home/hero/home-hero.component.ts:297`, `src/app/features/home/home.page.ts:151`, `src/app/features/home/home.page.ts:426`, `src/app/features/home/line-pulse/network-board.component.ts:348`, `.omo/evidence/audit-2026-10-21/routes/home__mobile__dark__viewport.png`, `.omo/evidence/audit-2026-10-21/routes/home__mobile__light__full.png`

**Problem.** A commuter can read the network headline in the first second, but not whether their own line is fine: with no pinned lines, all normal lines are folded into one summary row that sits under the fold and under the sticky bar. The four tiles mostly restate the headline ('14 Lines normal' under 'All 14 lines running normally', '0 Needs attention'), 'Links today' is not network status, and the hero's CTA row duplicates the fixed bottom bar that carries the same intents. Together they push the useful content down by roughly 400 px on a phone.

**Recommendation.** Do the low-risk part first: hide the hero Report, Spot and Live map CTAs below sm (the fixed bar has them; keep Share a link) and compact or hide the stat tiles. Treat the line strip and toolbar as an optional follow-up.

_Original suggestion (corrected by the verifier):_ Below sm: hide the hero CTA row (`hidden sm:flex`) because home-mobile-bar already carries Report, Spot and Live map, and collapse the tiles into one row of two compact inline chips (or hide them while tone is 'normal'). Put a horizontally scrolling 'line strip' right under the headline: one chip per line with colour roundel, code and a text/icon status mark, each tapping through to its row (`#line-<id>` anchors already exist). Move the operator filter, sort and Rider/Pro controls into a single compact toolbar (or a disclosure) so the board starts above about y=600. Re-measure with the 390x844 capture.

**Verification.** The mobile screenshot shows the hero is tall, the stat tiles restate the headline, the hero CTAs repeat the fixed bar, and the first line row sits near y=765. The layout is a design opinion, and the proposed line strip and toolbar redesign is large for a high rating.

**Also reported as:** [F097](ux-content-and-visual-polish.md#f282) [home-ui] On a 390x844 phone the hero fills the first screen and no line row is visible; its CTA row duplicates the sticky action bar (src/app/features/home/hero/home-hero.component.ts:214, src/app/features/home/hero/home-hero.component.ts:295)

<details><summary>Evidence</summary>

```text
Measured on the 390x844 screenshot (CSS px): the hero card ends at about y=540; the headline wraps to 3 lines; four stat tiles take two rows; an empty sparkline strip and four CTAs (Report a delay, Spot a train, Share a link, Live map) follow; operator filter, sort and Rider/Pro rows then take about 125 px; the first line row ('14 lines running normally') starts at about y=765 and is partly under the 52+ px fixed bar.
<div class="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="hero-stats">
The fixed bar repeats Report, Spot a train and Live map.
```

</details>

<a id="f284"></a>

#### F284 · Show data freshness as visible text and degrade honestly when stale or offline

**medium** · effort M · ux · ux-home

**Where:** `src/app/features/home/refresh-control/home-refresh-control.component.ts:148`, `src/app/features/home/refresh-control/home-refresh-control.component.ts:315`, `src/app/features/home/refresh-control/home-refresh-control.component.ts:537`, `src/app/features/home/hero/home-hero.component.ts:156`, `src/app/features/home/home.page.ts:125`

**Problem.** The one fact a rider needs to trust a status board, how old this answer is, only exists in a tooltip that opens on mouse hover or on a refresh tap (which also fires a refresh). Phones and keyboard users never see it unprompted, and the visible text is a countdown to the next request instead. If a poll fails the hero keeps its green 'All 14 lines running normally' with no 'as of' marker, only a retry banner at the very top. A user in a tunnel with stale data cannot tell.

**Recommendation.** Replace 'Refreshing in 29s' with 'Updated 12 s ago' (reuse _lastUpdatedLabel, tick it with the existing beat) and keep the countdown ring as the visual cue. When last update is older than two intervals or fetch has failed, switch to an amber 'Last updated 4 min ago - retrying' state and desaturate the headline tone. Listen to `online`/`offline` (a small root service exposing a signal) and show 'You're offline - showing data from HH:MM'. Also open the details on focus for keyboard users.

**Verification.** The only always-visible text is 'Refreshing in Ns', and 'Last updated' lives inside the @if (_refreshTooltipOpen()) tooltip. A search found no navigator.onLine or offline listener in src/app.

**Also reported as:** [F544](ux-content-and-visual-polish.md#f284) [home-data] Add a visible data-age ribbon and an offline state to the board (src/app/features/home/refresh-control/home-refresh-control.component.ts:307, src/app/features/home/line-pulse/network-board.component.ts:109)

<details><summary>Evidence</summary>

```text
Refreshing in {{ store.polling.secondsRemaining() }}s     // the only always-visible text
<span class="block">Last updated {{ _lastUpdatedLabel() }}</span>   // lives inside @if (_refreshTooltipOpen())
onRefreshHoverEnter(): if (this._hoverCapable()) ...   // no focus trigger either
rg navigator.onLine / 'offline' event across src/app: no matches.
```

</details>

<a id="f286"></a>

#### F286 · Make the incident page answer "is anything wrong now?" above the fold on phones

**medium** · effort M · ux · ux-insiden-gallery · partially confirmed · severity adjusted from high

**Where:** `src/app/features/insiden/insiden.page.html:4`, `src/app/features/insiden/insiden.page.html:30`, `src/app/features/insiden/insiden.page.html:71`, `src/app/features/insiden/insiden.page.html:80`, `.omo/evidence/audit-2026-10-21/interactions/insiden__root-calendar.png`

**Problem.** A rider opening /insiden sees a title, a two-line marketing blurb, a login button, tabs and a full month calendar before any incident content. The "Ongoing & Long-Running" section and the selected day's incidents sit below the calendar, so an active disruption is not visible without scrolling, and on a quiet day the user is told only "No incidents on this day." with no reassurance, no last-updated time and no link to the live status board on Home. The page is organised around browsing history, not around current status.

**Recommendation.** Smaller step: on mobile show an ongoing-incidents summary above the calendar and trim the blurb. Treat the one-week strip and FAB as optional.

_Original suggestion (corrected by the verifier):_ On <lg, put a compact status block first: "Ongoing now" cards (the pinned list), or an explicit "No active disruptions - checked HH:mm" card using incident lastUpdated or the fetch time, with a link to the Home status board. Move the calendar under it, optionally collapsed to a one-week strip with a "Month" toggle. Drop or shrink the description on mobile and put the report/login button in a sticky FAB or the header row. Keep the desktop two-column layout.

**Verification.** Screenshot shows h1, blurb, login button, tabs and the full calendar ahead of any incident content, so the layout observation holds. The status-first redesign is a product opinion rather than a defect.

<details><summary>Evidence</summary>

```text
Measured in insiden__root-calendar.png (390 px viewport, 2x): the h1, description paragraph, "Log in to report" button and tab pills end at about y=520 CSS px of 844; the 6-row month grid runs to about y=655; the day heading and "No incidents on this day." start at y=694. Ongoing incidents (insiden.page.html:80) come after the calendar.
```

</details>

<a id="f289"></a>

#### F289 · Tracker opens with zero live vehicles and no guidance; the user must find, tick and Apply feeds

**medium** · effort M · ux · ux-rest · partially confirmed · severity adjusted from high · already documented

**Where:** `src/app/features/tracker/data/layer-selection.service.ts:14`, `src/app/features/tracker/status-card/mobile-layer-sheet.component.ts:96`, `src/app/features/tracker/data/layer-config.ts:14`, `.omo/evidence/audit-2026-10-21/interactions/tracker__map-loaded.png`

**Problem.** A commuter who opens the 'live vehicle tracker' sees a static map with no vehicles. Nothing says that live feeds are off or how to turn them on; the only hint is a collapsed bar whose chip says 'Route: 1'. To see a single bus they must open the sheet, scan a 15-row alphabetical list, tick a feed, and press an Apply button that only appears after a change (draft/apply gate). The selection is not remembered across visits, so this repeats every time. The feature appears broken at first glance. docs/components/tracker.md already lists 'Smart default layer selection' and MISTAKES.md lists saving presets as ideas.

**Recommendation.** Add a persisted applied selection (via PreferencesService-style afterNextRender hydration, not constructor localStorage reads, per MISTAKES 2026-10-03) and an empty-state hint; the default-feed choice is a product call.

_Original suggestion (corrected by the verifier):_ 1) Pre-check a sensible default such as 'RapidBus KL' and apply it on first load. 2) Persist the applied selection in localStorage (guarded by isBrowser) and restore it in LayerSelectionService. 3) When appliedRealtimeChecked is empty, show a small dismissible hint above the bottom bar: 'No live vehicles shown. Choose a feed'. 4) Consider applying checkbox changes immediately on touch viewports and dropping the Apply step for single toggles.

**Verification.** realtimeChecked starts as {} with no persistence, and the screenshot shows only route lines and a 'Layers Route: 1' bar; tracker.md lists persistence and smart defaults as unbuilt. Opt-in feeds are a deliberate design, so this is a discoverability gap rather than a broken feature.

<details><summary>Evidence</summary>

```text
`readonly realtimeChecked = signal<Record<string, boolean>>({});` and `railwayChecked = signal(true)`. The mobile screenshot shows only the blue route lines and a bottom bar reading 'Layers  Route: 1'; capture notes say 0 DOM .mapboxgl-marker elements.
```

</details>

<a id="f302"></a>

#### F302 · Spotting queue lacks loading, empty and result-count feedback, and Enter does not search

**low** · effort S · ux · console · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/console/console.page.html:141`, `src/app/features/console/console.page.html:173`, `src/app/features/console/console.page.html:279`, `src/app/features/console/console.page.ts:287`

**Problem.** Unlike the pending and links pages, the spotting table has no skeleton, no empty message and no error state, so the first paint and an empty result are the same bare header row. The only number shown is `eventsCount`, which the schema defines with no filter arguments (I checked by introspection: `eventsCount` has no args), so the page reports the global total (80,862 on the dev data) and the moderator cannot see how many unread events match the filters. The filter card is not a form, so Enter in the free-search box does nothing and the user must click Search. There is also no select-all for the loaded page.

**Recommendation.** Add skeleton/@empty/error and a form submit; the backend count filter is a separate ask.

_Original suggestion (corrected by the verifier):_ Copy the skeleton/`@empty` pattern from pending.component.html, add an error branch (see the error-state finding), and wrap the filter card in a `<form (submit)="search()" novalidate>`. Ask the backend to add `filters` to `eventsCount` (backend change first) and show 'N unread match / M total'. Add a header checkbox that selects all loaded rows via `useBulkActions`.

**Verification.** console.page.html has no @empty or skeleton for the spotting table, and the footer shows 'Total events (excluding filters)'. The Enter-to-search claim and eventsCount lacking args were not verified here; loading and empty feedback gaps are real.

<details><summary>Evidence</summary>

```text
console.page.html:279-281: Total events (excluding filters): {{ totalCount() }}
console.page.html:174: @for (event of events(); track event.id) { ... }   // no @empty, no skeleton
```

</details>

<a id="f304"></a>

#### F304 · Links selection count and Group/Nest enablement include ids that are no longer loaded, so the click silently does nothing

**low** · effort S · ux · console

**Where:** `src/app/features/console/insiden/links/links.component.ts:388`, `src/app/features/console/insiden/links/links.component.ts:393`, `src/app/features/console/insiden/links/links.component.ts:848`, `src/app/features/console/insiden/links/links.component.ts:884`

**Problem.** The selection deliberately survives refetches, but the count and the enabled state of 'Group into thread' and 'Nest under' are computed from the unscoped list while the mutation is scoped to loaded rows. Tick two Pending links, Approve one (it leaves the Pending view), and the toolbar still says '2 selected' with Group enabled; clicking it scopes down to one id, `canGroup` fails and the handler returns false with no toast or message.

**Recommendation.** Compute `selectedCount` and the `canGroup`/`canNest` gates from `scopedSelection()` (a computed over `selectedIds` and `visibleLinkIds`), and prune ids that are absent from the loaded set after each fetch, or show 'N selected (M not shown)' so the hidden ticks are visible. Toast when a handler returns early.

**Verification.** selectedCount and canGroupSelection use selectedIds, while groupSelected uses scopedSelection and returns false silently. This mismatch is real but a narrow edge.

<details><summary>Evidence</summary>

```text
selectedCount = computed(() => this.selectedIds().length);
canGroupSelection = computed(() => canGroup(this.selectedIds()));
groupSelected(): const linkIds = this.scopedSelection(); if (!canGroup(linkIds)) { return false; }
```

</details>

<a id="f316"></a>

#### F316 · Guards redirect silently to /spotting with no sign-in prompt or return URL

**low** · effort S · ux · core-shell

**Where:** `src/app/core/auth/admin-only.guard.ts:10`, `src/app/core/auth/redirect-to-own-profile.guard.ts:11`

**Problem.** A logged-out visitor who opens a bookmarked /profile (or an admin whose session expired and who opens /console/links) is bounced to /spotting with no message and no way back, so they cannot tell whether the page is gone, forbidden, or just needs sign-in. The deep link is lost after login because no returnUrl is carried.

**Recommendation.** Redirect with state or a query param (createUrlTree(['/'], { queryParams: { login: '1', next: state.url } })) so the shell can open the sign-in flow, toast 'Sign in to view your profile' or 'Admin access required', and navigate to next after auth.login() resolves.

**Verification.** Both guards return createUrlTree(['/spotting']) with no message or return URL.

**Also reported as:** [F493](ux-content-and-visual-polish.md#f316) [ux-rest] Logged-out visit to /profile redirects silently to /spotting with no sign-in prompt; public-profile errors use a different pattern (src/app/core/auth/redirect-to-own-profile.guard.ts:16, src/app/features/profile/profile.page.ts:126)

<details><summary>Evidence</summary>

```text
return auth.isAdmin() ? true : router.createUrlTree(["/spotting"]);
...
return router.createUrlTree(uid ? ["/profile", uid] : ["/spotting"]);
```

</details>

<a id="f325"></a>

#### F325 · A stylesheet rule with an unquoted attribute selector is emitted and silently dropped

**low** · effort S · ui-visual · deps-tooling · partially confirmed · already documented

**Where:** `.omo/evidence/audit-2026-10-21/build/build.log:77-80 (src/styles.css:3143:59 warning)`, `src/app/features/spotting/line-details/vehicle-spotting-grid/vehicle-spotting-grid.component.ts:133-135`

**Problem.** A Tailwind arbitrary variant generates a selector that wraps an attribute in :is() without brackets, so the browser drops the whole rule. Whatever visual state the rule was meant to set (the visible state on the spotting grid) does not apply. I could not locate the class string in src/ that produces this selector, so the origin is inferred from the escaped form in the build output.

**Recommendation.** Locate the generated selector first, for example by inspecting the built styles or the Tailwind @source inputs or a dependency, then rewrite the arbitrary variant with brackets or a plain class. Check the spotting grid on a phone and a desktop before treating the rule as a lost visual state.

_Original suggestion (corrected by the verifier):_ Search the templates and TypeScript sources for Tailwind arbitrary variants that contain data-testid, and rewrite the selector with brackets, for example [&:is([data-testid="spotting-grid"])], or use a plain CSS class. Re-run the build and confirm the warning is gone. Then check the spotting grid on a phone and a desktop, since the dropped rule may have been the intended visual state.

**Verification.** build.log lines 77 to 80 do show the css-syntax-error at src/styles.css:3143 with the escaped data-testid selector. Searching src for visible: variants and arbitrary data-testid selectors found no source, so the claim that this rule is the spotting grid's visible state is an inference, and the fix cannot be applied until the origin is found.

<details><summary>Evidence</summary>

```text
build.log: "WARNING Unexpected \"=\" [css-syntax-error]" with the excerpt "...\\=\\\"spotting-grid\\\"\\]\\:visible:is(data-testid=\"spotting-grid\") {". The grid container carries data-testid="spotting-grid" at vehicle-spotting-grid.component.ts:135.
```

</details>

<a id="f328"></a>

#### F328 · Make the 'Confirmed' chip count agreeing reports, and fix the Unconfirmed definition and the '1 reports' grammar

**low** · effort S · code-quality · gap-1 · severity adjusted from medium

**Where:** `src/app/features/home/data/status-confidence.util.ts:144-161`, `src/app/core/methodology/methodology.content.ts:493`, `src/app/core/methodology/methodology.content.ts:503`, `src/app/features/home/data/home-board.queries.ts:30-34`, `src/app/features/home/data/status-confidence.util.spec.ts:114`

**Problem.** reportCount is statusReportCount, which counts every report on the line whatever status it gave and whatever user filed it. Three reports saying Busy, Delayed and Crowded read 'Confirmed' (green), and three reports from the same rider do too, so 'several people independently' and 'riders' are not what is measured (the registry's own reports-now entry admits the same rider can file twice). The wire already carries passengerStatusCount (reports behind the winning status) but the chip ignores it. The Unconfirmed definition also omits the common case where an Active line has one or two reports that are all Normal: the code treats any report as evidence, so it shows an amber 'Unconfirmed (2 reports)' beside a Normal reading. The label prints '1 reports', and the specs pin that wording.

**Recommendation.** Feed statusConfidence the count behind the winning status (line.passengerStatusCount) and keep the total for the label, or reword the definition to 'at least 3 reports were filed about this line' (reports, not riders). Update the Unconfirmed text to include 'or at least one report was filed'. Use reportsPhrase() for the label and fix the six spec expectations that assert '1 reports'.

**Verification.** statusConfidence uses the raw reportCount, so Confirmed counts all reports regardless of status. The label hard-codes 'reports', so a count of 1 reads '1 reports'.

<details><summary>Evidence</summary>

```text
if (reportCount >= CONFIRMED_MIN_REPORTS) { return { ...CONFIRMED, reportCount }; }
...
return { ...UNCONFIRMED, label: `Unconfirmed (${reportCount} reports)`, reportCount };
// registry: "At least {{CONFIRMED_MIN_REPORTS}} riders reported this line ... corroborated by several people independently"
// backend: count = all reports in the window; status_count = reports behind the winning status. No per-user uniqueness constraint on LineStatusReport.
```

</details>

<a id="f330"></a>

#### F330 · Reword the headline: with zero reports the page says 'All 14 lines running normally' while the registry says silence is not confirmation

**low** · effort S · ux · gap-1 · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/home/data/network-summary.util.ts:221-236`, `src/app/features/home/line-pulse/network-board.component.ts:565-571`, `src/app/features/home/data/board-lines.util.ts:110-112`, `src/app/core/methodology/methodology.content.ts:513`

**Problem.** A line is 'normal' when its admin-set status is Active and nobody reported Delayed or Disrupted. With no riders on the site that is the default, so the hero turns green and claims positive knowledge. The quiet-lines fold, defined by statusReportCount === 0, adds '12 lines running normally' for lines the confidence chip itself labels 'No recent reports'. The registry says the opposite about silence. For a service-status product that is an overclaim, especially at night or when the community is small.

**Recommendation.** Change the wording to what is known, for example '14 lines with no problems reported' (or 'No problems reported on 14 lines'), and the quiet row to '12 lines with no reports'. When reportsNow is 0, add a muted 'No rider reports in the last 15 minutes' line under the headline. Update network.lines-normal and its summary to match.

**Verification.** networkHeadline does return 'All N lines running normally' when attentionCount is 0, independent of report volume, which conflicts with the registry's silence caveat. It is a wording tradeoff, not a defect, so severity is low.

<details><summary>Evidence</summary>

```text
return `All ${total} lines running normally`;
...
return `${count} ${hasLinesAbove ? "other " : ""}${noun} running normally`;
// registry, status-confidence.none: "Absence of reports is not confirmation that service is good"
Measured SSR of / with zero reports: "All 14 lines running normally ... 14 Lines normal 0 Needs attention 0 Reports now"
```

</details>

<a id="f331"></a>

#### F331 · Define or rename the line stat cards: 'Never Spotted' (88) and the 'Not Spotted' status chip (37) mean different things

**low** · effort S · ux · gap-1 · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/spotting/line-overview/line-status-board/line-status-board.component.ts:86-98`, `src/app/features/spotting/data/fleet-counts.util.ts:21-25`, `src/app/features/spotting/line-overview/fleet-summary/fleet-summary.component.ts:80`

**Problem.** The stat cards 'Vehicle Types', 'Avg Spottings / Vehicle', 'Never Spotted' and 'Most Recently Spotted' are user-facing metrics with no MetricDoc and no popover, which the repo rule requires. 'Never Spotted' (zero spottings, all-time, including decommissioned vehicles) sits directly above a 'Not Spotted' status chip with a different meaning, and only 2 vehicles are in both sets. 'Avg Spottings / Vehicle' also averages over decommissioned vehicles. The '% of fleet' hint on the chips is a title attribute, so it never shows on touch.

**Recommendation.** Add MetricDocs (all-time spotting count per vehicle, which vehicles are included, how Not Spotted differs) and put an InfoPopover on each card. Consider excluding decommissioned vehicles from the average and the never-spotted share, or rename the card 'No spottings yet'. Show the percentage as visible text in the chip popover.

**Verification.** The stat cards ('Never Spotted' via spottingCount===0, Avg Spottings) exist as quoted and show no popover in the component. The 'different meaning' claim is plausible, but the rest is naming and polish.

**Also reported as:** [F496](ux-content-and-visual-polish.md#f331) [ux-spotting] Stat cards before the roster use unclear labels and contradict the chips (Never Spotted 0 vs Not Spotted 2) (src/app/features/spotting/line-overview/line-status-board/line-status-board.component.ts:89, src/app/features/spotting/line-overview/line-status-board/line-status-board.component.ts:51)

<details><summary>Evidence</summary>

```text
const neverSpotted = vehicles.filter((v) => v.spottingCount === 0).length;
{ label: "Never Spotted", value: String(neverSpotted), hint: `${((neverSpotted / total) * 100).toFixed(0)}% of fleet` }
// Live data, 612 vehicles: status NOT_SPOTTED = 37, spottingCount == 0 = 88, both = 2 (60 of the 88 are DECOMMISSIONED)
```

</details>

<a id="f332"></a>

#### F332 · Label the Pro table's Reports column with its window, and give it a definition

**low** · effort S · ux · gap-1 · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/home/pro/pro-lines-table.component.ts:25`, `src/app/features/home/pro/pro-lines-table.component.ts:97`, `src/app/features/home/line-pulse/line-pulse-row.component.ts:299-304`, `src/app/core/methodology/methodology.content.ts:547`

**Problem.** In the Table layout, Reports is the rolling-window count (15 minutes per line). In the Board layout the same word, on the same line, is the service-day total with a 'this hour' bracket. The row component's own comment explains why a bare count misleads, yet the table shows exactly that and its header has no popover (only Last report does). Switching layout changes a line's 'reports' from, say, 2 to 40 with no explanation.

**Recommendation.** Rename the column 'Reports (15 min)' using line.statusWindowMinutes, add a 'Today' column using historyTotal(linesHistoryFor(id)), and attach metricTooltip popovers for both. Register a MetricDoc for the rolling-window count (network.reports-now only covers the hero tile).

**Verification.** Reports column label and statusReportCount cell were not fully re-verified against the board layout. The window-ambiguity concern is plausible and cheap to fix.

<details><summary>Evidence</summary>

```text
{ key: "reports", label: "Reports" },
<td class="px-2 py-2 tabular-nums">{{ row.line.statusReportCount }}</td>
// row component: "A bare count is the thing a pro reader is most likely to over-read, and the window is what makes it interpretable"
// board row (Board layout): "N reports (X this hour)" = service-day total
```

</details>

<a id="f333"></a>

#### F333 · Correct the 'Last report' column: it shows a minute-precision age for an hour-precision value and only searches today

**low** · effort S · ux · gap-1 · partially confirmed

**Where:** `src/app/features/home/pro/pro-lines-table.component.ts:154-156`, `src/app/features/home/pro/pro-lines-table.util.ts:16-27`, `src/app/core/methodology/methodology.content.ts:344`, `src/app/features/spotting/data/humanize-since.util.ts:14-21`

**Problem.** humanizeSince(hourStart) prints '37 minutes ago' for a report that could have been filed two minutes ago in the current hour, so minute precision is shown for a value known only to the hour; the registry then says 'to the hour', which the cell contradicts. The history read covers only the current service day, so a line last reported yesterday shows the same '—' as one never reported, and '—' also covers 'still loading', although the doc says 'blank'. The age is also computed inside a template method with no clock, so it does not tick.

**Recommendation.** Render the hour itself ('10:00–11:00, today', via serviceHourRangeLabel) or 'in the last hour' for the current bucket, and use 'None today' for lines with no reports. Reword the registry text to name the service-day limit and the dash.

**Verification.** humanizeSince on an hour-start string yields minute-precision text; this is real but minor polish.

<details><summary>Evidence</summary>

```text
protected _age(hourStart: string | null): string {
  return hourStart === null ? "—" : humanizeSince(hourStart);
}
// registry: "the time is to the hour, not the minute. Blank until the service-day history has loaded."
```

</details>

<a id="f334"></a>

#### F334 · Fix the operator-group copy: real line codes split KTM into KTM, KTMB and KTMK and the examples are not real

**low** · effort S · ux · gap-1 · partially confirmed

**Where:** `src/app/core/methodology/methodology.content.ts:333`, `src/app/features/home/data/line-family.util.ts:272-275`, `src/app/features/home/line-pulse/network-board.component.ts:123`

**Problem.** The examples (KTM1, bare KJL) match no real code. The actual chips are code prefixes that split KTM Komuter (KTMK) from KTM ETS (KTM) and KTMB locomotives, and LRT KJL, AGL, SPL and SAL collapse into one LRT chip. The control is labelled 'operator', so a reader choosing 'KTM' misses the Komuter lines. The registry does admit it is a prefix, which is honest, but the control and examples still imply operators.

**Recommendation.** Rename the control to 'Line group', use real examples ('LRT KJL falls in LRT, KTMK-PBL in KTMK'), and ideally add an operator or mode field on Line in the backend so groups are real. Update the aria-label and the popover title together.

**Verification.** Not verified against live codes. The registry already admits the grouping is by code prefix, so this is copy polish.

<details><summary>Evidence</summary>

```text
"Lines are grouped by the letters at the start of their line code, so KTM1 falls in KTM and KJL in KJL."
aria-label="Filter lines by operator"
Live codes: "KTM ETS", "KTMB Loco", "KTMK-PBL", "LRT KJL", "MRT KGL", "Skypark" -> chips KTM, KTMB, KTMK, LRT, MRT, SKYPARK
```

</details>

<a id="f336"></a>

#### F336 · Correct the sparkline definition: bar height is relative to the day's busiest hour, not a report count

**low** · effort S · ux · gap-1 · partially confirmed

**Where:** `src/app/core/methodology/methodology.content.ts:531-533`, `src/app/features/home/data/status-history-display.util.ts:63-73`, `src/app/features/home/hero/network-sparkline.component.ts:129-137`

**Problem.** Height is scaled to the busiest hour of the same day with a 6% floor, so a quiet day with 3 reports at peak draws the same tall bar as a day with 300. 'Tall bar means the network was busy' is therefore false across days; the heat-strip entry states its scale ('relative to the busiest cell') but this one does not.

**Recommendation.** Say 'bar height is relative to the busiest hour shown; the number above is the day's total', and show the peak count next to the figure (as the heat grid does with '{{ _maxCount() }} peak').

**Verification.** historyBarHeightPct scales to the max count with a floor as quoted, so 'tall bar means busy' holds only within a day. This is a wording fix.

<details><summary>Evidence</summary>

```text
"A bar's height is how many rider status reports EVERY line on the network received in that hour" ... "a tall bar means the network was busy"
export function historyBarHeightPct(count, max) { ... return Math.max((count / max) * 100, MIN_HISTORY_BAR_PERCENT); }
```

</details>

<a id="f339"></a>

#### F339 · Say that family and Pro filters also narrow the heat grid and ranking, or stop narrowing them

**low** · effort S · ux · gap-1 · partially confirmed

**Where:** `src/app/features/home/pro/network-heat-strip.component.ts:365-373`, `src/app/features/home/pro/pro-report-ranking.component.ts:130-136`, `src/app/features/home/data/home.store.ts:469-475`, `src/app/core/methodology/methodology.content.ts:560`

**Problem.** The public ?op= family chip and the three Pro filters change which lines the heat grid and the 'Worst lines by reports' ranking cover, and the grid's peak and intensity scale are recomputed over that subset. Neither widget says so, and their methodology text claims every line, so 'Worst lines' under ?op=LRT is the worst of the LRT group and the same hour looks darker than on the unfiltered grid.

**Recommendation.** Show a muted 'Showing LRT, 6 of 16 lines' caption in both widgets when the visible set is smaller than lines(), and add 'for the lines currently shown' to the two registry entries.

**Verification.** Not verified in depth. visibleLines feeding the widgets is plausible; it is a caption/copy tweak.

<details><summary>Evidence</summary>

```text
for (const line of this.store.visibleLines()) { ... max = Math.max(max, bucket.count)
// registry: "One row per line ... for every line at once"; ranking: "The busiest 5 lines of the current service day"
readonly visibleLines = computed(() => filterProLines(filterByLineFamily(this.lines(), this._lineFamily()), {...}))
```

</details>

<a id="f341"></a>

#### F341 · Present the passenger ladder as a rider scale, not as measured definitions

**low** · effort S · ux · gap-1 · partially confirmed

**Where:** `src/app/core/methodology/methodology.content.ts:368-403`, `src/app/features/home/data/status-info.util.ts:105-114`

**Problem.** These bands were authored by the maintainer (the original build notes call the ladder 'novel-but-defensible') and are shown as the definition of each status. The backend stores delay_minutes separately and does not enforce any band, so a report with 30 minutes delay is still 'Delayed: 10–15 min late', and nothing says the crowding wording is a community convention rather than a standard.

**Recommendation.** Add one sentence to the sightings section ('This scale is the community's own guide, not an operator standard') and word Delayed as 'noticeably late (riders usually mean 10 minutes or more)'. Optionally show delay_minutes in the report list.

**Verification.** Not verified; the ladder wording is an editorial choice and one disclaimer sentence is a reasonable but optional tweak.

<details><summary>Evidence</summary>

```text
definition: "Trains running 10–15 min late."
definition: "Standing room only — board after 1–2 trains."
// backend: LineStatusReport.delay_minutes is a separate optional field; PassengerStatus is a plain enum
```

</details>

<a id="f344"></a>

#### F344 · No 'auth ready' signal: signed-in users briefly see logged-out UI, can tap Log in, and the submit box jumps from 44 to 96 px

**low** · effort S · ux · gap-2 · partially confirmed · severity adjusted from medium

**Where:** `src/app/core/auth/auth.service.ts:49`, `src/app/features/home/feed/link-submit-box.component.ts:61`, `src/app/shell/app-nav/app-nav-icon-tray.component.ts:317`, `src/app/features/insiden/vote-button/vote-button.component.ts:81`

**Problem.** Because SSR and the first client render are always logged out and isLoggedIn starts false, a returning signed-in rider sees 'Log in to submit links', a 'Log in' avatar label and disabled vote arrows until Firebase restores the session. About 20 templates read isLoggedIn() directly and none can tell 'not signed in' from 'not known yet'. A tap in that window opens a Google popup for someone who is already signed in (the avatar button and the submit box both call auth.login() directly). On phones the box then grows by 52 px and pushes the feed down. It is below the fold on a 844 px screen so the measured CLS was small (0.005), but it grows with slower auth restores. (I could only measure the two end states using the e2e override, not the live transition.)

**Recommendation.** Add an authResolved signal and make login() await whenReady. Reserving height is optional.

_Original suggestion (corrected by the verifier):_ Expose `readonly authResolved = signal(false)` on AuthService (set where resolveReady runs) and use three states in the templates: unknown (reserve the same height with a skeleton or a disabled-looking shell), logged out, logged in. Make login() a no-op or await whenReady when called before the session is restored. Reserve min-height on the submit box container so both end states occupy the same space on mobile.

**Verification.** isLoggedIn starts false, and link-submit-box and the avatar call auth.login() directly with no ready check, so a tap before the session restores is possible. The window is a few hundred ms and the finding itself measured CLS at 0.005.

<details><summary>Evidence</summary>

```text
readonly isLoggedIn = signal(false);
...
@if (!auth.isLoggedIn()) {
  <button hlmBtn ... data-testid="login-to-submit" class="... h-11 w-full ..." (click)="auth.login()">
    Log in to submit links
// measured at 390px: app-link-submit-box is 44 px tall logged out and 96 px tall logged in, at y=1151
```

</details>

<a id="f346"></a>

#### F346 · Signing out leaves guarded pages on screen, guards bounce silently, and logout is fire-and-forget

**low** · effort S · ux · gap-2 · partially confirmed · severity adjusted from medium

**Where:** `src/app/shell/account-panel/account-panel.component.ts:187`, `src/app/shell/app-nav/app-nav.component.ts:282`, `src/app/core/auth/admin-only.guard.ts:13`, `src/app/core/auth/redirect-to-own-profile.guard.ts:16`, `src/app/core/auth/auth.service.ts:123`

**Problem.** After logout the only reaction is closing the sheet. An admin who logs out on /console/* keeps seeing the moderation tables (and subsequent actions fail with 'You are not logged in'), and someone on their own /profile/:id stays on a page that was built from their private data until the next effect run. The two route guards redirect to /spotting with no message and no login prompt, so a logged-out visitor opening a shared /profile link (or a non-admin opening /console) just lands somewhere unrelated. logout() is not awaited and has no catch, so a failed signOut produces an unhandled rejection while the sheet has already closed. The 'Click again to confirm Log Out' label change is not announced to screen readers and the 3-second window is short. The cached given name stays in localStorage after sign-out (shared-device privacy).

**Recommendation.** Await logout() and only emit loggedOut on success (toast on failure). After sign-out, if the current URL is under /console or /profile, navigate to '/'. Have the guards redirect with `?login=1` (or open the login prompt) and a short explanation. Mark the confirm button with aria-live or use a small confirm sheet, and remove the firstName key on logout.

**Verification.** onLogoutClick calls auth.logout() un-awaited and only emits loggedOut. Guards run only on navigation, and logout() never removes the cached firstName key. Backend still rejects admin actions after sign-out, so the impact is UX polish plus minor shared-device privacy.

<details><summary>Evidence</summary>

```text
this.auth.logout();
this.loggedOut.emit();
// app-nav: <app-account-panel (loggedOut)="accountPanelOpen.set(false)" />
// guards: return auth.isAdmin() ? true : router.createUrlTree(["/spotting"]);
```

</details>

<a id="f366"></a>

#### F366 · Validate the delay minutes and notes length in the status sheet before posting

**low** · effort S · ux · home-data

**Where:** `src/app/features/home/line-status/line-status-sheet.component.ts:149`, `src/app/features/home/line-status/line-status-sheet.component.ts:360`, `src/app/features/home/line-status/line-status-sheet.component.ts:366`

**Problem.** The input only has min="0" as a hint; a typed -5 or 99999 is posted as is, and the backend's PositiveSmallIntegerField will reject it with a database-level error that surfaces as a generic 'GraphQL Error' toast, after the reader has filled in the whole form. The notes textarea has no maxlength either.

**Recommendation.** Validate delay to 0..1440 with an inline message; skip the notes maxlength.

_Original suggestion (corrected by the verifier):_ Clamp or reject values outside 0 to 1440 with inline text ('Enter minutes between 0 and 1440'), add maxlength to the notes field, and show the error under the field. Add a spec for both bounds.

**Verification.** The delay input has only min="0", _onDelayInput stores the raw string, and submit posts parseInt output unchecked to a backend PositiveSmallIntegerField, so -5 or 99999 would fail server-side. The notes field is a backend TextField with no length limit, so a maxlength is optional.

**Also reported as:** [F379](ux-content-and-visual-polish.md#f366) [home-ui] Delay minutes in the line-status sheet are not validated; 'min=0' is never enforced (src/app/features/home/line-status/line-status-sheet.component.ts:150, src/app/features/home/line-status/line-status-sheet.component.ts:219)

<details><summary>Evidence</summary>

```text
const parsedDelay = Number.parseInt(this.delayMinutes(), 10);
delayMinutes: Number.isFinite(parsedDelay) ? parsedDelay : null,
// backend: delay_minutes = models.PositiveSmallIntegerField(...)
```

</details>

<a id="f367"></a>

#### F367 · Make Retry and link-sheet close refetch only what failed and keep the Load More place

**low** · effort S · ux · home-data

**Where:** `src/app/features/home/home.page.ts:557`, `src/app/features/home/home.page.ts:679`, `src/app/features/home/home.page.ts:681`, `src/app/features/home/data/home.store.ts:1057`

**Problem.** reloadAll() drops the reader's Load More progress and refetches every read, including the two history requests. It is used for the banner's Try Now when only one resource failed, and the effect runs it every time the shared link sheet closes, including when the reader pressed Cancel without submitting anything.

**Recommendation.** Reload only the failing resources from Try Now (a store.retryFailed() that calls reload on those with hasError()), and reload on sheet close only when the sheet reports a successful submit or edit (an output or a saved flag on LinkSheetService).

**Verification.** home.page.ts:679-681 calls store.reloadAll() on every open-to-closed edge of the link sheet including Cancel, and Try Now maps to reloadAll(), which drops Load More progress and refetches history.

**Also reported as:** [F376](ux-content-and-visual-polish.md#f367) [home-ui] Closing the shared link sheet always triggers reloadAll(), even after Cancel, which throws away Load More progress (src/app/features/home/home.page.ts:668, src/app/features/home/home.page.ts:678)

<details><summary>Evidence</summary>

```text
retryNow: () => this.store.reloadAll(),
if (!isOpen && this._wasLinkSheetOpen) {
  this.store.reloadAll();
}
```

</details>

<a id="f369"></a>

#### F369 · Do not write the recipient's stored view preference from a shared ?view= link

**low** · effort S · ux · home-data · partially confirmed

**Where:** `src/app/features/home/data/home-view-mode.service.ts:146`, `src/app/features/home/data/home-view-mode.service.ts:151`

**Problem.** Opening a friend's /?view=pro link permanently flips the recipient's saved preference to the dense Pro bento, so their next plain visit to / is Pro, with no consent or undo hint. It is also an effect whose only job is to write a signal from a derived one.

**Recommendation.** Maintainer decision; if changed, persist only from setView.

_Original suggestion (corrected by the verifier):_ Treat the URL as a session override: leave the stored preference alone and write it only from the toggle (setView). If the reader later presses Rider, persist then.

**Verification.** The effect at home-view-mode.service.ts:149 does persist a URL-supplied view to preferences, but the comment says this is deliberate so a shared link is 'a state, not a one-frame suggestion'. It is a product trade-off, and the recipient can toggle back.

<details><summary>Evidence</summary>

```text
effect(() => {
  const view = this.view();
  if (view !== this.preferences.viewMode()) {
    this.preferences.setViewMode(view);
  }
});
```

</details>

<a id="f373"></a>

#### F373 · The sticky bar's Refresh button has no visible feedback, because the only 'Updating/Updated' state is in the hero

**low** · effort S · ux · home-ui

**Where:** `src/app/features/home/home.page.ts:450`, `src/app/features/home/home.page.ts:455`, `src/app/features/home/home.page.ts:701`, `src/app/features/home/hero/home-hero.component.ts:171`

**Problem.** The comment is out of date: the screenshot shows the hero's 'Refreshing in 26s' control on a 390 px viewport. A rider scrolled into the feed who taps the bar's refresh icon gets no response at all, since the control that shows spinner and confirmation is off-screen and the bar's icon never changes. Nothing tells them that the data did or did not update, and the bar cannot be double-tapped safely.

**Recommendation.** Bind the bar button to the store: `[disabled]="store.isRefreshing()" [attr.aria-busy]="store.isRefreshing()"` and spin the icon (`[class.animate-spin]="store.isRefreshing()"` with `motion-reduce:animate-none`), and surface completion through the existing ToastService or a polite live region ('Updated'). Then correct the comments in home.page.ts.

**Verification.** home.page.ts ~696 comment says the hero control is not rendered at mobile widths, but the hero refresh slot is explicitly un-gated; the bar's refresh button has no busy state, so taps scrolled away from the hero give no feedback.

<details><summary>Evidence</summary>

```text
home.page.ts:455  aria-label="Refresh page data now"  ... (click)="refreshNow()"
home.page.ts:696  "...the hero's control still owns the 'Updating' / 'Updated' state, because at mobile widths it is not rendered."
home-hero.component.ts:171  <div class="shrink-0 pt-0.5" data-testid="hero-refresh-slot"> <app-home-refresh-control />
```

</details>

<a id="f375"></a>

#### F375 · The Last Week tab cannot show its count until it is opened; both tabs are about 30 px tall and the selection is not in the URL

**low** · effort S · ux · home-ui

**Where:** `src/app/features/home/home.page.ts:243`, `src/app/features/home/home.page.ts:279`, `src/app/features/home/home.page.ts:283`, `src/app/features/home/home.page.ts:599`, `src/app/features/home/data/home.store.ts:206`

**Problem.** The comment promises a count to help the reader decide, but the Last Week resource is lazy until the tab is first selected, so a first-time visitor always sees an en dash and has to commit to the switch to learn anything. The tab buttons use px-1 pb-2 text-sm, which gives a touch target of about 30 px against the 44 px the rest of the page uses. The tab state is a local signal only, so the back button, a shared link and a reload cannot return to Last Week, even though sort, view and line are all URL-backed through the query-param helpers.

**Recommendation.** Call `store.requestLastWeek()` from `afterNextRender` with `requestIdleCallback` (or on `pointerenter`/`focus` of the tab) so the count is usually ready, or request a cheap `first: 1` totalCount query. Give the tabs `min-h-11` (keep the underline on an inner span). Mirror `feedTab` into `?tab=lastweek` using writeQueryParams/readEnumQueryParam as network-board does.

**Verification.** Last Week is lazy by design via requestLastWeek on tab selection (store comment), so the count shows an en dash; feedTab is a plain local signal not mirrored to the URL. Screenshot shows 'LAST WEEK (–)'.

<details><summary>Evidence</summary>

```text
home.page.ts:283  Last Week ({{ store.lastWeekCount() ?? "–" }})
home.page.ts:279  comment: "a reader deciding whether to switch should see what they would switch TO"
Measured: #feed-tab-today is 30 px high at 390x844; screenshot shows 'LAST WEEK (–)'. home.page.ts:599  protected readonly feedTab = signal<FeedTab>("today");
```

</details>

<a id="f381"></a>

#### F381 · Explain Kuala Lumpur time and make date entry faster on phones

**low** · effort S · ux · insiden-data

**Where:** `src/app/features/insiden/incident-form/incident-form.component.html:81`, `src/app/features/insiden/incident-form/incident-form.component.html:93`, `src/app/features/insiden/link-form/link-form.component.ts:142`, `src/app/features/insiden/incident-form/incident-form.schema.ts:35`

**Problem.** Start is empty by default and the label says only 'Start', so a rider must open two pickers (date, time) on a phone to report something that happened minutes ago. Nothing says the time is Malaysia time. Future start times and an absurdly old year are accepted. The end-before-start error uses the kind 'required', which misrepresents it to any code that inspects kinds. The two-column grid squeezes datetime-local inputs on narrow phones.

**Recommendation.** Add a 'Now' quick-fill button (and 'Ongoing' = leave End empty with helper text) next to Start, a caption 'Malaysia time (UTC+8)', and a `max` of the current time plus a small tolerance for start. Use a dedicated kind such as 'endBeforeStart'. Stack the two inputs in a single column below the sm breakpoint.

**Verification.** Start defaults to empty, there is no 'Now' shortcut or Malaysia-time caption, and the end-before-start error uses kind 'required' in incident-form.schema.ts. The two inputs sit in a grid-cols-2 with no single-column breakpoint. All of these are polish items.

<details><summary>Evidence</summary>

```text
<input hlmInput type="datetime-local" [formField]="incidentForm.startDatetime" />
// schema: only required + end-before-start; error kind is "required" for the ordering error
```

</details>

<a id="f382"></a>

#### F382 · Add novalidate or FormRoot to the incident and link forms so Enter and the footer button behave the same

**low** · effort S · ux · insiden-data · already documented

**Where:** `src/app/features/insiden/link-form/link-form.component.ts:75`, `src/app/features/insiden/incident-form/incident-form.component.html:8`

**Problem.** MISTAKES.md already records that signal-forms mirrors required() as the native required attribute, so pressing Enter inside a field triggers the browser's own validation bubble (and type=url rejects schemeless values) instead of the form's inline messages and the submit handler, while the footer button, which is outside the form, bypasses native validation. The two submit paths therefore show different messages. The entry lists both forms as still unfixed.

**Recommendation.** Add `novalidate` to both forms (the link form should also switch the URL input to type=text with inputmode=url once normalization exists). Pair with a submit-gated message and a focus move to the first invalid field.

**Verification.** Neither the incident form nor the link form has novalidate. MISTAKES.md (2026-09-22, ui/forms) lists both as still missing on purpose, and its prescribed fix is novalidate or FormRoot. It is real but already known and deferred, and impact is small.

<details><summary>Evidence</summary>

```text
<form class="flex flex-col gap-4" (submit)="$event.preventDefault(); submit()">  <!-- no novalidate -->
```

</details>

<a id="f384"></a>

#### F384 · Consider showing a clear message that edits by non-owners become drafts, since canEditIncident shows Edit to everyone for LIVE incidents

**low** · effort S · ux · insiden-data

**Where:** `src/app/features/insiden/data/can-edit.incident.util.ts:36`, `src/app/features/insiden/data/can-edit.link.util.ts:27`, `src/app/features/insiden/incident-form/incident-form.component.ts:670`

**Problem.** The client-side permission logic is safe: rosak_backend/incident/services/incidents.py and social_links.py enforce admin-or-author for links and revision-draft semantics for incidents, so a mismatched button is cosmetic. The remaining issue is expectation setting. Any logged-in user sees Edit on every LIVE incident, but their change does not go live; it creates a DRAFT revision that is chained to approval, and a second editor gets the raw 'An unapproved edit draft already exists...' error. The header says only 'Edit Incident'.

**Recommendation.** For non-admin, non-author users show 'Suggest an edit' as the header and button text with a line explaining that changes are reviewed before they replace the live report. Translate the 'draft already exists' backend error into 'Someone else has already suggested an edit. It is waiting for review.'

**Verification.** canEditIncident returns true for LIVE incidents, and the header always reads 'Edit Incident'. The finding itself concedes the backend enforces draft semantics, so this is purely expectation setting and copy.

<details><summary>Evidence</summary>

```text
if (status === "LIVE") {
  return true;
}
```

</details>

<a id="f387"></a>

#### F387 · Logged-out visitors get permanently disabled vote buttons with no explanation or sign-in path

**low** · effort S · ux · insiden-ui · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/insiden/vote-button/vote-button.component.ts:81`, `src/app/features/insiden/vote-button/vote-button.component.ts:114`, `src/app/features/insiden/insiden.page.html:22`

**Problem.** Disabled buttons cannot receive focus or click events, show no tooltip, and look merely greyed out, so a visitor does not learn that voting needs an account and has no one-tap way to sign in. Voting is the main engagement action on the page, and the vote buttons are repeated on every card and chronology row.

**Recommendation.** Keep the buttons enabled for logged-out users and call auth.login() from onVoteClick, or add an explanatory title or hint.

_Original suggestion (corrected by the verifier):_ Leave the buttons enabled for logged-out viewers. In onVoteClick, when `!auth.isLoggedIn()`, call `auth.login()` (or show a toast with a 'Log in' action) and return before any optimistic change. Use `aria-disabled` only for the in-flight state. Keep a short accessible description such as 'Log in to vote'.

**Verification.** Disabled vote buttons for logged-out users are real (vote-button.component.ts:81). The class docs describe this as intended behaviour, and the page already offers a 'Log in to report' CTA. It is a UX improvement, not a defect.

**Also reported as:** [F380](ux-content-and-visual-polish.md#f387) [home-ui] Logged-out riders get disabled vote arrows with no explanation or sign-in path (lead for the insiden reviewer) (src/app/features/insiden/vote-button/vote-button.component.ts:81, src/app/features/insiden/vote-button/vote-button.component.ts:114); [F483](ux-content-and-visual-polish.md#f387) [ux-insiden-gallery] Logged-out users see disabled vote arrows with a bare "0" and no hint that login is needed (src/app/features/insiden/vote-button/vote-button.component.ts:81, src/app/features/insiden/vote-button/vote-button.component.ts:114)

<details><summary>Evidence</summary>

```text
[disabled]="!auth.isLoggedIn() || isVoting()"  Measured as a logged-out visitor: every vote button is `disabled=""` with no tooltip, no name beyond 'Upvote'/'Downvote'.
```

</details>

<a id="f419"></a>

#### F419 · Validate the nickname before saving and support Enter and Escape

**low** · effort S · ux · profile-about-misc · already documented

**Where:** `src/app/features/profile/user-card/user-card.component.ts:73-82`, `src/app/features/profile/user-card/user-card.component.ts:285-302`

**Problem.** Whatever is typed, including an empty string or 500 characters or only whitespace, is sent to the server; the nickname is the only name other users see on a public profile. There is no maxlength, no trim, no inline error text, Enter does not submit, Escape does not cancel, and a failed save leaves only a generic 'Save failed' toast.

**Recommendation.** Trim the draft, require 1 to 30 characters (match the backend limit), show an inline error under the input, add (keydown.enter) and (keydown.escape) handlers and maxlength. Add the validator as a pure function with a spec.

**Verification.** save() sends nicknameDraft untrimmed and unvalidated, with no maxlength or Enter/Escape handlers. The backend limit was not checked, so '30 characters' should be taken from the backend.

<details><summary>Evidence</summary>

```text
<input hlmInput [(ngModel)]="nicknameDraft" placeholder="Enter your desired nickname" class="flex-1" />
...
UPDATE_USER_MUTATION, { data: { nickname: this.nicknameDraft } },
```

</details>

<a id="f433"></a>

#### F433 · Page-specific meta from one route leaks into later client navigations

**low** · effort S · seo-meta · seo-pwa-i18n

**Where:** `src/app/features/home/home.page.ts:675`, `src/app/features/about/about.page.ts:154-157`, `src/app/features/methodology/methodology.page.ts:38`

**Problem.** Meta.updateTag only adds or updates tags and never removes them. Each page writes its tags in its constructor, and no page resets them on leave. An in-app navigation from /about to /spotting therefore keeps og:title "MLPTF | About". Full loads are unaffected because SSR starts from a fresh head, so the harm is limited to client-side navigation and to any JavaScript-executing crawler that follows in-app links.

**Recommendation.** Centralise the tags in the same SeoService. It should reset every managed tag to a site default on each NavigationEnd and then apply the page's values. The page constructors then stop writing tags directly. A short unit test that navigates from /about to /spotting and asserts og:title is back to the default would lock this in.

**Verification.** Meta.updateTag only adds or updates, and about.page.ts:155-157 sets og:title and og:type in its constructor with no reset on leave. Nothing in home.page.ts or methodology.page.ts clears them, so client navigation keeps the stale value. Full loads start from the SSR head and are unaffected.

<details><summary>Evidence</summary>

```text
about.page.ts:155-157 → meta.updateTag({ property: "og:title", content: "MLPTF | About" });
meta.updateTag({ property: "og:type", content: "website" });
home.page.ts:675 → inject(Meta).updateTag({ name: "description", content: META_DESCRIPTION });
```

</details>

<a id="f434"></a>

#### F434 · No canonical links, and several URLs serve duplicate content

**low** · effort S · seo-meta · seo-pwa-i18n · partially confirmed

**Where:** `src/app/features/insiden/insiden.page.ts:87`, `src/app/app.routes.ts:64`, `src/app/app.routes.ts:72`

**Problem.** /insiden and /insiden/<today> render the same content at two URLs. /gallery and /gallery/<mediaId> also share a route, and /spotting/:lineId has tabbed variants under /details. Search engines split signals across these, and a shared link could land on either. The app has no canonical tag to say which one is authoritative.

**Recommendation.** Add a canonical link through a shared SEO helper, but only canonicalise /insiden/<today> to /insiden. Make every tab URL and every /gallery/<id> self-canonical rather than pointing tabs at the tab-less URL.

_Original suggestion (corrected by the verifier):_ Add a canonical link through the SeoService. For /insiden/<date> where the date is today, canonicalise to /insiden. For tabbed spotting views, canonicalise the tab-less URL. For /gallery/<id>, canonicalise to the photo URL itself. Keep the canonical link in the same tag set as og:url so the two stay consistent.

**Verification.** No rel=canonical exists in src or index.html, and insiden.page.ts:87 does map an undated URL to today. But line-details.page.ts:557 and :366 show that spotting tabs (details/situasi, assets, insiden) are distinct content, so canonicalising them to the tab-less URL would hide real pages from search. The /gallery/<id> self-canonical is also a no-op.

<details><summary>Evidence</summary>

```text
insiden.page.ts:87 → protected readonly selectedDate = computed(() => this.dateParam() ?? dateKeyOf(new Date()));
No <link rel="canonical"> appears in src/index.html or any page.
```

</details>

<a id="f450"></a>

#### F450 · Set the tracker's skeleton to hide when the map has actually loaded

**low** · effort S · ux · tracker-gallery · partially confirmed

**Where:** `src/app/features/tracker/map/tracker-map.component.ts:78`, `src/app/features/tracker/tracker-shell.page.ts:39`

**Problem.** `mapReady` fires one microtask after constructing the `Scene`, not when Mapbox has styles and tiles, so the skeleton disappears immediately and users see a blank grey canvas for the one to three seconds it takes tiles and the rail GeoJSON to arrive. The rail layer fetch itself (`getDownloadURL` round trip, zip, JSON parse) starts only after the scene exists, so it is serialised behind map creation, and it runs even if the Railway checkbox is off.

**Recommendation.** Emit on scene 'loaded'; keep a timeout fallback.

_Original suggestion (corrected by the verifier):_ Emit `mapReady` from `this.scene.on("loaded", ...)` (L7 fires it when the base map is ready). Start `geojsonStorage.getData` in the component constructor (in parallel with the scene) and skip it until `appliedRailway()` is true. Add a visible `Map data unavailable` fallback if `loaded` does not fire within about 10 s (for example WebGL failure, which the controller already anticipates).

**Verification.** mapReady is emitted via queueMicrotask right after constructing Scene, before tiles load, so the skeleton goes early. Real but cosmetic.

<details><summary>Evidence</summary>

```text
// Scene created - map is now interactive, emit ready event so shell can swap skeleton
queueMicrotask(() => this.mapReady.emit());
```

</details>

<a id="f451"></a>

#### F451 · Replace the Load more button with the shared infinite-scroll sentinel, with a visible end-of-feed state

**low** · effort S · ux · tracker-gallery · already documented

**Where:** `src/app/features/gallery/gallery.page.html:42`, `src/app/features/gallery/gallery.page.ts:167`

**Problem.** Browsing is a scroll-and-look activity, but each 24-photo page needs a tap, and there is no `You've reached the first photo` message at the end of the feed. The repo already has `appInfiniteScroll` (tested directive) used by Insiden. A load error only shows a toast, so the sentinel would need an inline retry to avoid a silent stall.

**Recommendation.** Place `<div appInfiniteScroll [appInfiniteScrollLoading]="isLoading()" (loadMore)="loadMore()"></div>` below the last year section with a `rootMargin` of about 600 px, keep a Load more button as the keyboard and no-IntersectionObserver fallback, add an inline `Retry` when the last call failed, and an end message when `!hasMore()`. Raise `PAGE_SIZE` to 36 to 48 once images are served responsively.

**Verification.** Load more is a button, and docs already note appInfiniteScroll is ready to use. Polish only.

<details><summary>Evidence</summary>

```text
@if (hasMore()) {
  <button hlmBtn variant="outline" class="self-start" [disabled]="isLoading()" (click)="loadMore()">
    {{ isLoading() ? "Loading…" : "Load more" }}
```

</details>

<a id="f457"></a>

#### F457 · font-mono resolves to the sans stack (self-referencing --font-mono) and Inter is declared but never loaded

**low** · effort S · ui-visual · ui-system

**Where:** `src/styles.css:20`, `src/app/shell/app-footer/app-footer.component.ts:55`, `src/app/features/home/pro/pro-dashboard.component.ts:122`, `src/index.html:4`

**Problem.** A custom property that references itself is invalid at computed-value time, so every font-mono element (the footer build hashes, the pro-dashboard keyboard-shortcut chips) renders in the proportional font instead of monospace. Separately, 'Inter' is first in the font stack but no font file or @font-face is shipped, so only visitors who happen to have Inter installed get it; everyone else gets system-ui, so the typography the design names is not what ships and varies by platform.

**Recommendation.** Define --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; in the @theme block of styles.css (after the Spartan preset import). Either drop "Inter" from the stack and accept system-ui, or self-host a latin-subset variable Inter (@fontsource-variable/inter, about 25 KB woff2) with font-display: swap, size-adjust-matched fallback metrics to avoid layout shift, and a preload link in index.html.

**Verification.** The Spartan preset (hlm-tailwind-preset.css:86) declares --font-mono: var(--font-mono), a self-reference, and styles.css defines no mono override. Inter is in --font-sans but nothing loads it.

<details><summary>Evidence</summary>

```text
Built CSS: --font-mono: var(--font-mono);  .font-mono{font-family:var(--font-mono)}
Measured in Chrome: getComputedStyle(document.querySelector('.font-mono')).fontFamily = "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
src/styles.css:20: --font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif;  (no @font-face, no font link anywhere in src/ or index.html)
```

</details>

<a id="f465"></a>

#### F465 · Stop the auto-expanding Log in pill from shrinking the page title at 390 px

**low** · effort S · ux · ux-home

**Where:** `src/app/shell/app-nav/app-nav-icon-tray.component.ts:27`, `src/app/shell/app-nav/app-nav-icon-tray.component.ts:296`, `src/app/shell/app-nav/app-nav-icon-tray.component.ts:211`, `src/app/shell/app-nav/app-nav-module-menu.component.ts:34`, `.omo/evidence/audit-2026-10-21/interactions/nav__mobile-menu-open.png`

**Problem.** On every real page load, 2.5 seconds in, the avatar grows into 'Log In' (or 'Welcome back, NAME') for four seconds. In a one-row 390 px header this truncates the current-section label to one or two letters and shifts the whole icon cluster left under the thumb, so it can move a tap target between touchdown and release. The nudge is a fine idea on desktop but costs wayfinding on phones.

**Recommendation.** Run the hint only where `(hover: hover) and (pointer: fine)` matches, or on phones show it without growing (a small pulsing dot, or just rely on the visible 'Log In' text always shown below sm). Keep the module label `shrink-0 max-w-[40%]` so it never truncates below three letters.

**Verification.** AVATAR_HINT_DELAY_MS 2500 and DURATION 4000 expand the pill once per page load. The mobile screenshot shows the module label truncated to 'H...' beside 'Log In'. This is real but brief polish.

<details><summary>Evidence</summary>

```text
const AVATAR_HINT_DELAY_MS = 2500; ... AVATAR_HINT_DURATION_MS = 4000;
[style.grid-template-columns]="expanded() ? '1fr' : '0fr'"
Screenshot: with the pill open the header reads 'H...' (Home) and 'TranS...' (TranSPOT) on the details page.
```

</details>

<a id="f467"></a>

#### F467 · Move toasts away from the header and keep their controls reachable on touch and keyboard

**low** · effort S · ux · ux-home

**Where:** `src/app/app.html:4`, `src/app/ui/toast/toast-content.component.ts:72`, `.omo/evidence/audit-2026-10-21/interactions/account__mobile-panel-open.png`, `.omo/evidence/audit-2026-10-21/routes/home__desktop__light__viewport.png`

**Problem.** Top-centre toasts cover the sticky header (logo, module label, Log in) and the hero headline while they are up, which is where mobile users look. The pin and dismiss buttons are invisible until mouse hover, so touch users cannot see how to close a toast and keyboard users can focus invisible controls. They are also 24 px.

**Recommendation.** Position toasts at `bottom-center` with an offset above the Home bar (e.g. `offset="calc(72px + env(safe-area-inset-bottom))"` below lg), or top with an offset equal to the header height. Make the controls visible by default on `(hover: none)` and on focus: `opacity-0 group-hover/toast:opacity-100 group-focus-within/toast:opacity-100 [@media(hover:none)]:opacity-100`, and enlarge to `size-8`.

**Verification.** app.html places the toaster at top-center, and the toast controls are opacity-0 until group-hover with size-6 buttons. There is no focus-within or touch visibility.

<details><summary>Evidence</summary>

```text
<brn-sonner-toaster position="top-center" ...>
class="absolute -top-3 -right-3 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/toast:opacity-100"   // pin and dismiss, size-6
Screenshots: the toast sits over the logo and nav links on both desktop and mobile.
```

</details>

<a id="f468"></a>

#### F468 · Use accurate empty-state copy in the Pro feed widget when no filter is set

**low** · effort S · ux · ux-home

**Where:** `src/app/features/home/pro/pro-feed-widget.component.ts:26`, `src/app/features/home/pro/pro-feed-widget.component.ts:185`, `.omo/evidence/audit-2026-10-21/routes/home-pro__desktop__light__viewport.png`

**Problem.** The comment explains the sentence is meant to name a narrowing the reader chose. That holds only when a filter is active. With nothing selected the message blames filters the user never set and hides the real reason, that nothing has been shared today.

**Recommendation.** Branch on whether search, line or source filters are non-default: no filter gives 'No links shared today yet - be the first' with the same Share a link button as the rider feed; with filters give the current copy plus a 'Clear filters' button.

**Verification.** PRO_FEED_EMPTY_COPY is a single fixed string, 'No links match these filters.', with no branch for unfiltered state. The message is misleading when no filter is set.

<details><summary>Evidence</summary>

```text
const PRO_FEED_EMPTY_COPY = "No links match these filters.";
Screenshot: filters read 'All lines' and 'All sources' with an empty search, and the card still says 'No links match these filters.'
```

</details>

<a id="f470"></a>

#### F470 · Cap the Home content width and balance the desktop columns

**low** · effort S · ui-visual · ux-home

**Where:** `src/app/features/home/home.page.ts:121`, `src/app/shell/app-nav/app-nav.component.ts:110`, `.omo/evidence/audit-2026-10-21/routes/home__desktop__light__full.png`

**Problem.** The main column is 90 percent of any width with no maximum, so on a 1920 or 2560 monitor the hero tiles and rows stretch to well over 1500 px, while the header uses its own padding and the two do not align. On a quiet day the right column is mostly empty beside the long board, so desktop is a widened phone layout rather than a use of the space.

**Recommendation.** Use `lg:max-w-7xl lg:w-full` (and give the nav's inner row the same `mx-auto max-w-7xl` wrapper). Make the feed column `lg:sticky lg:top-20 lg:self-start` so it stays visible beside the long board, and on desktop show the 'Needs attention' and My lines groups first in the left column with the folded quiet group below.

**Verification.** home.page.ts main uses lg:w-[90%] with no max-w, matching the evidence. The cap and sticky feed suggestion are sensible polish.

<details><summary>Evidence</summary>

```text
class="mx-auto flex min-h-screen w-full flex-col gap-6 p-4 pb-24 sm:p-6 lg:w-[90%] lg:pb-6"   // no max-w
Screenshot at 1440: the logo sits at x=32 while the content starts at x=96; the right column holds only 'Log in to submit links' and an empty Today tab beside a tall left column.
```

</details>

<a id="f471"></a>

#### F471 · Standardise terminology: Insiden vs incident, report vs spot, and the jargon labels on Home

**low** · effort S · ux · ux-home · partially confirmed

**Where:** `src/app/shell/app-nav/app-nav.util.ts:16`, `src/app/shell/nav-config.ts:19`, `src/app/features/home/report/report-chooser.component.ts:84`, `src/app/features/home/pro/pro-incidents-widget.component.ts:57`, `src/app/features/home/hero/network-sparkline.component.ts:76`, `src/app/features/home/line-status/line-status-sheet.component.ts:36`, `src/app/features/home/line-pulse/network-board.component.ts:128`

**Problem.** The same destination is called Insiden in the nav and incident everywhere else, and a first-time or English-reading rider cannot tell what Insiden holds. 'Report a delay' leads to a form that starts with Normal and Busy, so the button promise and the form disagree; the same action is also named Report, Report delay on X, Submit line status and Spot a train. Unexplained codes (KTMK, MRL, SKYPARK), 'service day 03:00 to 02:00' and the 'Rider/Pro' labels, plus 10 px sparkline text, assume insider knowledge.

**Recommendation.** Keep the terminology and plain-language suggestions and drop the claim that the CTA opens a Normal/Busy form.

_Original suggestion (corrected by the verifier):_ Pick one public term per concept: either 'Incidents (Insiden)' in the nav or consistently Insiden with a subtitle. Rename the hero CTA to 'Report line status' (or add 'delay' as one of the chips and rename Normal/Busy under a 'Crowding' heading). Expand operator chips to short names with the code as secondary text (KTM Komuter, Monorail), phrase the sparkline caption as 'Reports per hour, since 3 am', and call the toggle 'Simple | Detailed' (keep Pro in the URL). Raise sparkline axis text from 10 px to 12 px.

**Verification.** The Insiden vs incident naming and jargon codes are real inconsistencies. The 'Report a delay' claim is wrong: the hero button opens the report chooser, not a form starting with Normal/Busy, and a comment documents this intent.

<details><summary>Evidence</summary>

```text
nav: label "Insiden"; console: "Incident Approval"; chooser: "Report an incident"; Pro widget: "Recent incidents" / "All incidents"
"Network activity · service day 03:00 to 02:00"   // sparkline caption
Hero button 'Report a delay' opens a form whose first choices are Normal, Busy, Crowded
Board filter chips: All BRT ERL KTM KTMB KTMK LRT MRL MRT SKYPARK; segmented 'Rider | Pro'
```

</details>

<a id="f475"></a>

#### F475 · Trim build identifiers in the footer and surface Methodology as a trust link

**low** · effort S · ux · ux-home

**Where:** `src/app/shell/app-footer/app-footer.component.ts:62`, `src/app/shell/app-footer/app-footer.component.ts:93`, `src/app/shell/app-footer/app-footer.component.ts:112`, `.omo/evidence/audit-2026-10-21/routes/home__mobile__light__full.png`

**Problem.** Every visitor sees two lines of commit hashes, a raw placeholder string and a dangling '@' when the backend returns no date, while the one trust-building link (Methodology, which documents every metric and source) is a 12 px link at the very bottom and is not in the main nav. The page's metric popovers link to it but a rider who wants 'where does this data come from?' has no prominent route.

**Recommendation.** Hide build and backend hashes behind a single collapsed 'Version' details element (or only show them when `?debug` or for admins), and skip the backend line when hash or datetime is missing. Add 'How this works' next to the hero freshness text or in the nav's About group, and give footer links `py-2` tap padding.

**Verification.** The footer always shows the frontend hash and timestamp, and the backend line renders raw hash and a date pipe even when the value is a placeholder, which gives a dangling '@'. Methodology is only a small footer link.

<details><summary>Evidence</summary>

```text
Footer text in the screenshot: 'Frontend build cb70022 @ Oct 21, 2026, 11:07:15 AM'  'Backend build <<No hash data>> @'  'GNU AGPLv3 by KwongTN & contributors · Methodology · GDPR (beta)'
@if (backendVersion.value(); as backend) { ... &#64; {{ backend.datetime | date: "medium" }}
```

</details>

<a id="f476"></a>

#### F476 · Unverified (pending/draft) incidents drive public calendar dots but hide behind a low-contrast collapsed toggle

**low** · effort S · ux · ux-insiden-gallery · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/insiden/calendar/calendar.component.ts:234`, `src/app/features/insiden/insiden.page.html:148`, `src/app/features/insiden/insiden.page.html:91`, `.omo/evidence/audit-2026-10-21/interactions/insiden__day-loaded.png`

**Problem.** The calendar counts every incident in the payload including DRAFT and PENDING_APPROVAL ones and paints a severity dot indistinguishable from a verified one. Tapping that day shows no incident cards at all, only a grey 14 px caps toggle that looks like a section heading rather than a control (same styling as the date heading above it). Anonymous users get a red "Major" signal they cannot read without discovering the toggle, and, conversely, unverified reports are presented with full-severity colour.

**Recommendation.** Distinguish pending-only dots, or exclude pending dots for anonymous users. Restyle the toggle more clearly.

_Original suggestion (corrected by the verifier):_ Give pending-only days a visually different dot (hollow ring, border-dashed) and say so in a legend, or exclude pending incidents from dots for logged-out users. Style the toggle as an outline button (hlmBtn variant="ghost"/"outline", min-h-10) with text "Show 3 pending reports" and the warning badge colour. If a day has only pending items, auto-expand the group.

**Verification.** The calendar counts every incident without a status filter, and the screenshot shows a major dot on 19 May with only a grey pending toggle. The toggle does render with a chevron and the group can be expanded, so 'hidden' is overstated.

<details><summary>Evidence</summary>

```text
calendar.component.ts:239  for (const incident of this.incidents()) { if (!incidentCoversDate(incident, key)) ... } (no status filter, so DRAFT rows count)
insiden.page.html:151  class="flex cursor-pointer items-center gap-1.5 self-start text-muted-foreground text-sm font-semibold tracking-wide uppercase"
API: all three 19 May 2023 incidents have status DRAFT; screenshot shows a red Major dot on the 19th and only a grey "PENDING APPROVAL (3)" line beneath.
```

</details>

<a id="f477"></a>

#### F477 · Pending status and Minor severity share the same amber badge, and timeline dot colours have no text or legend

**low** · effort S · ui-visual · ux-insiden-gallery · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/insiden/incident-card/incident-card.component.ts:69`, `src/app/features/insiden/incident-card/incident-card.component.ts:81`, `src/app/features/insiden/incident-card/incident-card.component.html:5`, `src/app/features/insiden/incident-card/incident-card.component.html:88`, `src/app/ui/badge/badge.ts:15`

**Problem.** The same amber badge variant means two unrelated things ("Minor" severity, and "Pending approval" verification state), and in the calendar the same amber dot means Minor. Chronology dots are 8 px coloured circles with no label, no legend and no accessible text, so users and screen readers cannot learn what blue or green means (screenshot shows blue, green and grey dots on one incident).

**Recommendation.** Reserve amber for severity only and use a distinct treatment for verification state, for example an outline badge with a clock icon and dashed border. Give each timeline dot a tiny icon or sr-only text ("Update", "Resolved", "Problem", "Note") and add the same label to a visible legend or tooltip-free caption.

**Verification.** Minor severity and PENDING_APPROVAL both use the warning variant, and the screenshot shows the amber pending badge. The timeline dots are unlabelled. Overlap is real but low impact, since the badges carry text.

<details><summary>Evidence</summary>

```text
incident-card.component.ts:69-73  MINOR: "warning"  and CHRONOLOGY_STATUS_VARIANT PENDING_APPROVAL: "warning"; badge.ts:15 warning: bg-amber-100 text-amber-800
card html:88  <span class="absolute top-1 -left-[15px] size-2 rounded-full" [class]="dotClass(entry.indicator)"> (no text, no aria)
CHRONOLOGY_DOT: GREEN emerald-500, RED red-500, BLUE blue-500, GRAY neutral-400
```

</details>

<a id="f480"></a>

#### F480 · Gallery lacks status feedback: skeleton without aria-busy, no end-of-list or count, ad between grid and Load more

**low** · effort S · ux · ux-insiden-gallery

**Where:** `src/app/features/gallery/gallery.page.html:8`, `src/app/features/gallery/gallery.page.html:26`, `src/app/features/gallery/gallery.page.html:40`, `src/app/features/insiden/insiden.page.html:50`

**Problem.** Skeleton loading on both pages is silent for assistive tech (no role=status, aria-busy or text). In the gallery the first-year ad slot always lands between the 24 tiles and the Load more button, which in the mobile full-page capture produces a gap of roughly 330 px before the button, so users may think the list ended and risk mis-tapping an ad. The page never says how many photos exist and the button is manual with the same label throughout.

**Recommendation.** Wrap skeleton blocks in <div role="status" aria-busy="true"><span class="sr-only">Loading incidents...</span>. Move the between-years ad after the Load more button (or after the second year group) and add "Showing 24 of 2,439 photos" using totalCount. Consider infinite scroll with the existing appInfiniteScroll directive used in insiden.

**Verification.** The gallery skeleton has no aria-busy or status text, and the between-years ad slot sits right before the Load more button. The totalCount is not shown. Low-impact polish.

<details><summary>Evidence</summary>

```text
gallery.page.html:26-36  @if ($index === 0) { <div class="lg:hidden"><app-ad-slot [minHeightPx]="250" ...> } directly before the Load more button
Slow-network capture: 9 skeleton placeholders, aria-busy count 0, no loading text. gallery.queries.ts requests totalCount but it is never shown.
```

</details>

<a id="f482"></a>

#### F482 · Page and module titles disagree, and the nav label truncates to "I..." on the pages in this slice

**low** · effort S · ux · ux-insiden-gallery

**Where:** `src/app/shell/app-nav/app-nav-module-menu.component.ts:34`, `src/app/features/insiden/insiden.page.html:7`, `src/app/features/insiden/insiden.page.html:37`, `src/app/features/insiden/insiden.page.html:19`, `.omo/evidence/audit-2026-10-21/interactions/insiden__pending-group-expanded.png`

**Problem.** On a phone the current-section label is squeezed to one letter when the Log In text label shows, so the main wayfinding cue disappears exactly when a user is logged out, and the width of that label changes between screenshots of the same page. Terminology also mixes Malay "Insiden" in the h1/menu with English "Incidents" in tabs, buttons and empty states, and the description is English-only.

**Recommendation.** Hide the "Log In" text below sm (icon only with aria-label) or let the label keep min-w-[6ch]. Choose one user-facing name (for example "Incidents (Insiden)" in the h1 and menu) and use it consistently in tabs, buttons and empty states. This sits in the shell component, so coordinate with the shell auditor.

**Verification.** The screenshot shows the module label truncated to 'I...' next to Log In. The truncate class is in app-nav-module-menu.component.ts. The nav is shell code, outside this slice.

**Also reported as:** [F504](ux-content-and-visual-polish.md#f482) [ux-spotting] Mobile header truncates the section name to 'TranS...' and the logo link has no accessible name (src/app/shell/app-nav/app-nav-module-menu.component.ts:34, src/app/shell/app-nav/app-nav.component.ts:115)

<details><summary>Evidence</summary>

```text
app-nav-module-menu.component.ts:34  <span class="min-w-0 truncate">{{ currentModuleLabel() }}</span>
Screenshots insiden__pending-group-expanded.png and gallery__grid.png: the module menu reads "I..." and "G..." once the text "Log In" appears, while the logged-out insiden-today screenshot reads "Insiden". Page h1 "Insiden", tab "Incidents", button "Report an incident", empty state "No incidents".
```

</details>

<a id="f487"></a>

#### F487 · GDPR page opens every checklist item expanded, producing a 7,400 px wall of text with red 'Not adhered' labels

**low** · effort S · ux · ux-rest

**Where:** `src/app/features/gdpr/gdpr.page.html:29`, `src/app/features/gdpr/gdpr.page.html:36`, `.omo/evidence/audit-2026-10-21/routes/gdpr__mobile__light__full.png`

**Problem.** The accordion pattern is defeated because every item starts open, so a visitor cannot scan the checklist and must scroll past long boilerplate to see the status of each item. The first screen is a long generic GDPR explainer before any project-specific information, and each item's own status is a red 'Not adhered' pill, which reads as an alarm rather than a roadmap. Desktop also runs the explainer paragraphs at roughly 1,200 px line length.

**Recommendation.** Remove `open` so items start collapsed and the summary row (title plus status) is the scannable list; add a one-line count above ('3 of 12 adhered'). Use a neutral or amber 'Planned' variant for non-adhered items if the copy allows, and cap prose with `max-w-prose`. Keep the first paragraph shorter or move it into a collapsed 'What is GDPR?' block.

**Verification.** gdpr.page.html line 29 uses <details open> on every child with a red 'Not adhered' badge. Pure UX polish, and the open default may be deliberate for a compliance page.

<details><summary>Evidence</summary>

```text
`<details open class="rounded-lg border p-3">` for every child; the mobile page is about 12.1k characters over 7.4k px, and the first three items all show a red 'Not adhered' badge.
```

</details>

<a id="f488"></a>

#### F488 · About and Profile pages stack up to three 250 px ad slots, including one splitting Projects from Team

**low** · effort S · ux · ux-rest · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/about/about.page.html:166`, `src/app/features/about/about.page.html:342`, `src/app/features/profile/profile.page.ts:131`, `.omo/evidence/audit-2026-10-21/routes/about__mobile__light__full.png`

**Problem.** On a phone the about page can show 750 px of reserved ad space (the two footer slots stack to 500 px), which is nearly two screens of ads on a page whose content is four cards and a short team list, and the mid-page slot interrupts the project-to-team reading flow. With no fill the reserved area is an unexplained empty band; with fill it is intrusive. The 'Advertisement' label is not visible when empty, so the gap looks like a layout bug.

**Recommendation.** Render only one footer slot below sm and collapse reserved height on unfilled state; do not treat the blocked-ad gap as a bug.

_Original suggestion (corrected by the verifier):_ Keep the footer pair to one slot on screens narrower than `sm` (render the second only at `sm:`), drop the between-sections slot on About (low-intent page), and collapse the reserved height when the slot reports unfilled (AdSense `data-ad-status`). Keep the density cap comments in sync.

**Verification.** about.page.html has a mid-page 250px slot and two footer slots in a grid that stacks below sm, matching the finding. The empty gap in the screenshot is largely an artefact of deliberately blocked ads, and the density cap comment shows the count of two was a conscious choice.

<details><summary>Evidence</summary>

```text
`<app-ad-slot [slotId]="aboutBetweenSectionsSlotId" [minHeightPx]="250" ...>` mid-page, then `<div class="grid gap-3 sm:grid-cols-2">` with two more `[minHeightPx]="250"` slots. The full-page mobile screenshot shows a blank gap of roughly 600 px between the project cards and 'About the team'.
```

</details>

<a id="f489"></a>

#### F489 · About project cards are not links and describe features in developer language

**low** · effort S · ux · ux-rest · partially confirmed

**Where:** `src/app/features/about/about.page.html:124`, `src/app/features/about/about.page.html:132`, `.omo/evidence/audit-2026-10-21/routes/about__desktop__light__viewport.png`

**Problem.** Cards for Insiden, Tracker, Gallery and TranSPOT look like the primary navigation of the product but cannot be tapped. The Firestore copy describes implementation ('draft/apply flow', 'GTFS-realtime', 'approval lifecycle') rather than rider benefits. For a four-card page, a search box plus section chips pushes the first card to about 650 px down on a phone.

**Recommendation.** Add a name-to-route mapping for the card title; handle description wording as content in Firestore.

_Original suggestion (corrected by the verifier):_ Map project names to routes (a small `PROJECT_ROUTES` record keyed by name) and wrap the card title in a routerLink 'Open'. Rewrite the Firestore descriptions in plain language ('See where buses and trains are right now'). Hide search and chips unless the document has more than about eight items, and fold 'How this is counted' into the intro paragraph.

**Verification.** Project cards are plain <div hlmCard> with no link and copy comes from Firestore. Making them links and rewriting copy is reasonable, but the copy is an admin content edit, not code.

<details><summary>Evidence</summary>

```text
`<div hlmCard>` for each project with `<p class="text-muted-foreground text-sm">{{ project.description }}</p>`; live copy reads 'Full-bleed live map of GTFS-realtime transit vehicles with static stops and railway overlays, and opt-in data layers through a draft/apply flow.' Chrome above the first card is a GitHub button, a search box, three jump chips and a loose 'How this is counted' text link.
```

</details>

<a id="f490"></a>

#### F490 · 404 recovery sends people to TranSPOT, pins a footer over the viewport, and calls a third-party image API without width, height or consent

**low** · effort S · ux · ux-rest · partially confirmed

**Where:** `src/app/features/not-found/not-found.page.ts:116`, `src/app/features/not-found/not-found.page.ts:159`, `src/app/features/not-found/not-found.page.ts:22`, `src/app/features/not-found/not-found.page.ts:140`

**Problem.** The primary recovery action targets the spotting module, not the home status board that most visitors expect, and the label uses a product name that first-time visitors do not know. A fixed, multi-line build-info footer permanently covers about 100 px of a 390 px-wide screen. Each 404 visit sends the visitor's IP to thecatapi.com or dog.ceo, which sits oddly beside a GDPR page and is unrequested network on mobile data; the image has no reserved size so it shifts layout (and the audit flags it as below the fold without lazy loading). Using the real 'Total Disruption' status badge on a missing page dilutes the colour that signals genuine service problems, and a screen reader hears only '404' as the page heading.

**Recommendation.** Change primary CTA to home and add width/height or aspect-ratio and loading=lazy on the img; leave footer/pet layout unless maintainer wants a redesign.

_Original suggestion (corrected by the verifier):_ Make the primary button 'Go to live status' linking to '/', keep 'Go back' secondary. Use a normal in-flow footer and drop the second 100dvh pet screen (render the pet inline, 16:9 with a fixed aspect-ratio box and loading='lazy'). Either bundle a few static pet images or gate the fetch behind a click ('Show me a cat'). Change the h1 to the message heading with the 404 as visible supporting text.

**Verification.** not-found.page.ts does link to /spotting, fetches thecatapi/dog.ceo, and pins the footer, but the fixed footer and pet screen are documented deliberate design with a short-viewport escape. The home link, third-party request and missing img dimensions are legitimate small points.

**Also reported as:** [F422](ux-content-and-visual-polish.md#f490) [profile-about-misc] Make the 404 page actually helpful: wrong primary action, 'Go back' that can leave the site, and a third-party image fetch (src/app/features/not-found/not-found.page.ts:115-118, src/app/features/not-found/not-found.page.ts:235-237)

<details><summary>Evidence</summary>

```text
`<a routerLink="/spotting" hlmBtn>Back to TranSPOT</a>`; footer is `class="bg-background fixed inset-x-0 bottom-0 z-40"`; `fetch("https://api.thecatapi.com/v1/images/search")` and an `<img [src]="pet.url" ... class="max-h-72 ...">` with no dimensions. The 404 uses `LineStatusBadge` with a real 'Total Disruption' status; h1 is only '404'.
```

</details>

<a id="f491"></a>

#### F491 · On a 390 px admin view the 'new version' pill overlaps the wordmark and the welcome label is clipped

**low** · effort S · ui-visual · ux-rest

**Where:** `src/app/shell/app-nav/app-nav-icon-tray.component.ts:255`, `src/app/shell/app-nav/app-nav.util.ts:56`, `.omo/evidence/audit-2026-10-21/interactions/console__spotting-mobile.png`

**Problem.** The header's flex row has no room for logo, module trigger, update button, debug, theme and the welcome pill at phone width, so items collide. A collision on the primary navigation bar looks broken to the admins who use it most, and the greeting text carries no information once truncated. I could not confirm whether the update button is shown only during the audit session; the overlap is visible in the screenshot regardless.

**Recommendation.** At widths below `sm`, show only the avatar icon (no 'Welcome back' text), give the update button its own flex slot (`shrink-0`) so it cannot paint over the logo, and test the nav at 360 and 390 px with all optional controls visible.

**Verification.** console__spotting-mobile.png clearly shows the refresh pill overlapping the MLPTF wordmark and 'Welcome back,' clipped. The update button appears for real users when a new version exists.

<details><summary>Evidence</summary>

```text
In console__spotting-mobile.png the circular refresh button sits over the 'F' of the MLPTF logo, the module chevron is squeezed to its right, and the account pill reads 'Welcome back,' with the name cut off.
```

</details>

<a id="f492"></a>

#### F492 · Content pages stretch to 90 percent of the window with no measure limit, producing 150 to 190 character lines on desktop

**low** · effort S · ui-visual · ux-rest

**Where:** `src/app/features/methodology/methodology.page.html:2`, `src/app/features/gdpr/gdpr.page.html:2`, `src/app/features/about/about.page.html:2`, `.omo/evidence/audit-2026-10-21/routes/methodology__desktop__light__viewport.png`

**Problem.** Reading pages (Methodology, GDPR, About intro) use a phone layout stretched across the width. Lines far beyond 75 characters are slow to read, and the disclaimer note becomes a thin full-width strip. Only the About intro paragraph has `max-w-prose`.

**Recommendation.** For text pages wrap the readable content in `max-w-3xl` (or `max-w-prose` per block) and, for Methodology, use a two-column layout at `lg:` with a sticky section table of contents on the left (the sections already have anchor ids). Keep the wide wrapper for grids and tables.

**Verification.** The lg:w-[90%] wrapper occurs 12 times across feature pages, including methodology, gdpr and about, with no measure limit on prose. Low-severity readability polish.

<details><summary>Evidence</summary>

```text
`<div class="mx-auto flex min-h-screen w-full flex-col gap-6 p-4 sm:p-6 lg:w-[90%]">` (the same wrapper appears 12 times); the 1440 px methodology screenshot shows the disclaimer and section body running about 1,250 px wide.
```

</details>

<a id="f495"></a>

#### F495 · Realtime layer list is alphabetical across the whole country, burying the Klang Valley feeds and the dense 576 px desktop card

**low** · effort S · ux · ux-rest

**Where:** `src/app/features/tracker/status-card/layer-checklist.component.ts:63`, `src/app/features/tracker/data/layer-config.ts:14`, `src/app/features/tracker/status-card/status-card.component.ts:32`

**Problem.** A Klang Valley commuter must scroll past Kuching, Kangar and Alor Setar to reach RapidBus KL, which is the feed most of the audience wants. A 576 px wide card covering the right 40 percent of a laptop map holds only a one-column checklist. 'RT', 'Route' and 'Stops' chips are jargon that does not tell a rider what each layer is.

**Recommendation.** Group feeds under region headings ('Klang Valley', 'Other regions') and put Klang Valley first, collapsing the rest. Narrow the desktop card to about 320 px (`w-80`). Rename chips to 'Live: 1', 'Rail lines', 'Stops: 2' and give the sheet header the full words.

**Verification.** layer-checklist sorts realtime checkboxes by localeCompare on label (RapidBus KL lands after the myBAS and KTMB feeds), and status-card uses w-[576px] with h-[60vh]. Cosmetic ordering/size issue.

<details><summary>Evidence</summary>

```text
`function sortedByLabel(...) { return [...checkboxes].sort((a, b) => a.label.localeCompare(b.label)); }`; the 1440 px screenshot lists KTMB, myBAS Alor Setar, Ipoh, Johor Bahru, Kangar, Kota Bharu ... before 'RapidBus KL', and the card is `h-[60vh] w-[576px]` for a single column of checkboxes; mobile chips read 'RT: 1', 'Route: 1', 'Stops: 2'.
```

</details>

<a id="f497"></a>

#### F497 · Green 'Active' line badge reads as live service health but is a registry status that disagrees with the home page

**low** · effort S · ux · ux-spotting · partially confirmed · severity adjusted from medium

**Where:** `src/app/domain-ui/line-status-badge/line-status-badge.ts:61`, `src/app/features/spotting/line-overview/line-switcher/line-switcher.component.ts:25`, `src/app/features/home/data/passenger-status.util.ts:6`, `.omo/evidence/audit-2026-10-21/routes/spotting-line__mobile__light__viewport.png`

**Problem.** A rider asking 'is my line OK right now?' lands on /spotting/4 and sees a green 'Active' pill next to the line name, which looks like a live all-clear. The home page uses 'Normal' with a confidence level and report evidence for the same underlying status. The spotting pages show no timestamp and no link to live status, so the two screens can disagree without explanation.

**Recommendation.** Relabel the pill or add a tooltip saying it is the registry status. Do not add freshness cues.

_Original suggestion (corrected by the verifier):_ Either reuse the home page's passenger-status wording and confidence chip next to the title, or add a small 'Live status' link to the home line card and relabel the pill 'Line status (registry)'. At minimum, add a freshness cue ('Updated 5 min ago').

**Verification.** The badge labels come from the registry status (ACTIVE) and differ from the home 'Normal' wording. The spotting pages are a registry view, so it is a wording nuance, not a real contradiction.

<details><summary>Evidence</summary>

```text
export const LINE_STATUS_LABEL ... ACTIVE: "Active", ... PARTIAL_DISRUPTION: "Partial Disruption"  // home: NORMAL: "Normal"
```

</details>

<a id="f501"></a>

#### F501 · Details tabs are buttons although every tab has a URL; unexplained Malay labels 'Situasi' and 'Insiden'

**low** · effort S · ux · ux-spotting · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/spotting/line-details/line-details.page.ts:173`, `src/app/features/spotting/line-details/line-details.page.ts:58`, `src/app/features/spotting/line-details/situasi-section/situasi-section.component.ts:65`, `.omo/evidence/audit-2026-10-21/routes/spotting-details__mobile__light__viewport.png`

**Problem.** Tabs map to real routes (/details/situasi) but are rendered as buttons with no role=tab, aria-selected or aria-current, so they cannot be opened in a new tab, copied as links or crawled, and assistive tech cannot announce the current tab. The labels 'Situasi' (situation reports) and 'Insiden' (incidents) are jargon for English-reading users, 'Assets' is empty for the whole network, and the tab bar scrolls away, so the user loses their place on a long grid.

**Recommendation.** Render tabs as routerLink anchors with aria-current and add a one-line description per tab. Keep the Insiden and Situasi names.

_Original suggestion (corrected by the verifier):_ Render tabs as <a [routerLink] routerLinkActive aria-current="page"> inside a role="tablist"-free nav (or use Brain tabs with routerLink). Give each tab a one-line description under the h2 ('Situasi: community-submitted reports about this line'). Rename to 'Reports' and 'Incidents' with the Malay term in the subtitle, consistent with the site's own navigation decision.

**Verification.** Tabs are buttons driving routes with no tab or current semantics. Insiden is the site's own established term, so renaming it to Incidents is not justified.

<details><summary>Evidence</summary>

```text
<button type="button" hlmBadge [variant]="activeTab() === tab.id ? 'default' : 'outline'" ... (click)="onTabSelected(tab.id)">  with tabs { id: "situasi", label: "Situasi" }, { id: "insiden", label: "Insiden" }. Capture notes: no role=tab elements.
```

</details>

<a id="f502"></a>

#### F502 · Assets tab is empty for the whole network and ships as a top-level tab

**low** · effort S · ux · ux-spotting

**Where:** `src/app/features/spotting/line-details/station-assets-section/station-assets-section.component.ts:90`, `src/app/features/spotting/line-details/line-details.page.ts:59`

**Problem.** Every station card on the Assets tab says 'No assets recorded yet.' (37 empty cards for LRT KJL), so one of four tabs is a dead end that adds visual weight and a wasted tap.

**Recommendation.** Hide the tab until the API returns at least one asset, or collapse the empty list into a single 'No assets recorded yet for this line' message with a contribution call to action.

**Verification.** The assets section shows 'coming soon' and 'No assets recorded yet.' per station. A dead tab, low impact.

<details><summary>Evidence</summary>

```text
<p class="text-muted-foreground text-xs">Lifts &amp; escalators — status tracking coming soon</p> ... "No assets recorded yet.". Live query for line 4: 37 stations, 0 assets.
```

</details>

<a id="f505"></a>

#### F505 · Spotting-type badges borrow status colours (Location is red, Just Spotting is green)

**low** · effort S · ui-visual · ux-spotting · partially confirmed

**Where:** `src/app/domain-ui/spotting-type-badge/spotting-type-badge.ts:5`, `src/app/domain-ui/wheel-status-badge/wheel-status-badge.ts:5`, `src/app/domain-ui/vehicle-status-badge/vehicle-status-badge.ts:12`

**Problem.** The same green/amber/red scale means fleet health in the vehicle and wheel badges and a mere category in the spotting-type badge, so 'Location' reads as an alarm and 'Just Spotting' as healthy. In the history list the type badge and status badge sit side by side with competing semantics. FRESH/NEAR_PERFECT and WORN_OUT/WORRYING are indistinguishable by colour (the text does differ).

**Recommendation.** Use neutral or accent variants for spotting types.

_Original suggestion (corrected by the verifier):_ Reserve success/warning/destructive for health. Use neutral/outline/accent variants for the five spotting types (e.g. outline for Just Spotting, accent for At Station, info for Depot, secondary for Location) and give the wheel scale distinct shades or a small icon per level.

**Verification.** Spotting-type badges do reuse success, warning and destructive variants as quoted. The category-versus-health semantics point is polish.

<details><summary>Evidence</summary>

```text
JUST_SPOTTING: "success", BETWEEN_STATIONS: "success", DEPOT: "warning", LOCATION: "destructive", AT_STATION: "accent"  // wheel: FRESH and NEAR_PERFECT both success; WORN_OUT and WORRYING both destructive
```

</details>

<a id="f506"></a>

#### F506 · Dates lack relative time and freshness cues, and the age text is over-precise

**low** · effort S · ux · ux-spotting · partially confirmed

**Where:** `src/app/features/spotting/data/humanize-since.util.ts:36`, `src/app/features/spotting/vehicle-detail/vehicle-status-board/vehicle-status-board.component.ts:26`, `src/app/features/spotting/line-overview/line-status-board/line-status-board.component.ts:53`

**Problem.** '26 Years 9 Months 20 Days ago' is hard to scan and Title-Cased mid-sentence, and day precision is meaningless for decade-old dates. The line page shows 'Aug 22, 2026' for the most recent sighting with no relative age (two months old at audit time), and no page tells the user when the data was last refreshed.

**Recommendation.** Cap at two units and use lower-case. Skip the 'Updated' caption.

_Original suggestion (corrected by the verifier):_ Cap precision at two units ('26 years 9 months ago', lower-case), show 'about 2 months ago' next to the line page's Most Recently Spotted date, and add a small 'Updated HH:MM' caption near the roster fed by the resource's last-load time.

**Verification.** humanizeSince does emit Title-Case 'Years Months Days' as quoted. Two-unit precision is a nice polish, but the freshness-caption part is speculative.

<details><summary>Evidence</summary>

```text
parts.push(`${years} Year${years === 1 ? "" : "s"}`); ... months ... days; return `${parts.join(" ")} ago`; Screenshot: '23 Years 7 Months 27 Days ago', 'Aug 22, 2026' with no age on the line page.
```

</details>

<a id="f509"></a>

#### F509 · Publishing and bulk-read actions have no confirmation or undo, and the mark-read result is partly ignored

**low** · effort M · ux · console · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/console/insiden/pending/pending-row.component.ts:46`, `src/app/features/console/insiden/pending/pending.component.ts:330`, `src/app/features/console/insiden/links/links.component.ts:1153`, `src/app/features/console/console.page.ts:248`, `src/app/features/console/insiden/links/links.component.ts:1551`

**Problem.** Approve sits beside Reject in every row and publishes to the public site on a single click, with no confirmation and no undo; the backend schema has no unapprove or mark-unread mutation, so a misclick on a bulk 'Mark N as read' (up to 100 rows) is permanent. When markAsRead returns ok:false nothing happens at all: no toast, rows stay checked. runIncidentMutation never reads `ok`, so an ok:false is reported as success and the row is removed. The delete confirm is a generic native dialog that does not name the link and does not say that its direct sublinks are promoted to roots (backend parent FK is SET_NULL), whereas Hide does warn about its subtree. The console shows no record of who approved, rejected or marked something read, apart from `completedBy` on links.

**Recommendation.** Treat ok===false as an error and improve the delete confirm text; skip delayed-commit undo unless wanted.

_Original suggestion (corrected by the verifier):_ Use a delayed-commit pattern for the reversible-looking actions: remove the row optimistically, show a 5 s 'Approved "title" - Undo' toast, and send the mutation only when the timer elapses (or on navigation via DestroyRef). Treat `ok === false` as an error in all three handlers. Replace confirm() for delete with a sheet/dialog that names the URL and the sublink count. If an audit trail is wanted, surface the existing calendarIncidentHistory data in the pending panel and ask the backend to expose a reader/approver on spotting events and incidents.

**Verification.** Confirmed: markAsRead has no else branch, runIncidentMutation never reads ok, delete uses a generic native confirm, and no undo exists. But the backend most likely raises GraphQL errors for failures, so ok:false is rare, and the delayed-commit undo is heavy for an admin tool.

<details><summary>Evidence</summary>

```text
console.page.ts:248: if (data.markAsRead.ok) { this.events.update(... filter ...); this.clearSelection(); this.toast.success(...) }   // no else branch
links.component.ts:1551: if (!confirm("Delete this link entry? This can't be undone.")) {
runIncidentMutation: await this.graphql.request(...); return true;   // data.approveCalendarIncident.ok never read
```

</details>

<a id="f514"></a>

#### F514 · Console queues never refresh and give no freshness cue or pending counts

**low** · effort M · ux · console · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/console/insiden/pending/pending.component.ts:312`, `src/app/features/console/console.page.ts:149`, `src/app/features/console/console-nav.component.ts:30`

**Problem.** Each queue is fetched once when the page is created. Moderators typically leave a console tab open, and a new urgent incident submission will not appear until they navigate away and back or retype a search. There is no Refresh button, no 'Updated HH:mm' label, and the section nav shows no counts, so nothing tells an admin that Incident Approval has waiting items while they are on another tab.

**Recommendation.** Add a Refresh button and updated-time label first; skip polling.

_Original suggestion (corrected by the verifier):_ Add a Refresh button with an 'Updated 14:32' label to each page header, refetch on `document.visibilitychange` when hidden for more than a minute, and add pending counts to ConsoleNavComponent (a tiny `ConsoleCountsService` polling a count-only query every 60 s while visible, using `DestroyRef` cleanup). Optionally mirror the count in the app-nav Console link for admins.

**Verification.** Both pages call load() once in the constructor with no refresh button or timer. That is a reasonable UX gap, but not a defect, and a polling count service is extra scope.

<details><summary>Evidence</summary>

```text
constructor() { this.load(); }   // pending.component.ts:312-314 and console.page.ts:149-151; no refresh button, timer, or visibilitychange refetch
```

</details>

<a id="f515"></a>

#### F515 · Console state is lost on Back or any navigation; filters, paging and selection are not in the URL

**low** · effort M · ux · console · partially confirmed · severity adjusted from medium · already documented

**Where:** `src/app/features/console/console.page.ts:130`, `src/app/features/console/console.page.html:241`, `src/app/features/console/console.routes.ts:19`, `src/app/core/routing/reusable-route.strategy.ts:38`

**Problem.** Each spotting row links to the vehicle page. After checking a vehicle and pressing Back, ConsolePage is recreated with default filters, the first 100 rows, an empty selection and a reset scroll position. The same applies to the links and pending pages (search, filters, expanded conversations). Moderators also cannot bookmark or share a view such as 'unread depot sightings with notes'. The query-param helpers in core/url-state/query-param.util.ts already exist and the app has a route-reuse strategy.

**Recommendation.** Sync filters to query params; if using reuse, pair it with a refetch on activation.

_Original suggestion (corrected by the verifier):_ Quick win: set `data: { reuse: true }` on the three console leaf routes so Back restores the live component (add a refresh cue per the freshness finding). Then sync the applied filters through `readEnumQueryParam`/`writeQueryParams` so a view is bookmarkable. Reapply them in the constructor before the first `load()`.

**Verification.** No console route sets data.reuse (reuse is used only in spotting routes) and MISTAKES.md already lists saved filter views as a known gap. Adding reuse to a moderation page with a live queue risks showing stale rows, so it is not a free quick win.

<details><summary>Evidence</summary>

```text
console.page.html:241: <a [routerLink]="['/spotting', firstLine.id, 'vehicle', event.vehicle.id]" ...>
reusable-route.strategy.ts:39: return route.data["reuse"] === true;   // console routes set no data.reuse
MISTAKES.md:503: console - shareable/saved moderation filter views ... filter state lives only in local signals.
```

</details>

<a id="f516"></a>

#### F516 · Console tables need 900 to 1,280 px and keep their actions in the last column, which is poor on phones

**low** · effort M · ux · console · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/console/insiden/links/links.component.html:48`, `src/app/features/console/insiden/pending/pending.component.html:22`, `src/app/features/console/console.page.html:159`

**Problem.** The audience is mostly on phones, and moderators triaging from a phone must scroll a 1,280 px table sideways to reach Approve/Hide, then back to read the URL. Icon-only row buttons are size-7 (28 px), well under a 44 px touch target, and the row-click detail sheet is the only usable path. Spotting rows have no visible primary action at all (just a checkbox plus a sticky bulk button).

**Recommendation.** Below `md`, render each row as a card (`@if` on a `BreakpointObserver`-driven signal, or `hidden md:table-row` plus a stacked block) with title/URL, status, time and the primary actions on one line. Keep the bulk bar `sticky bottom-0` on mobile. Raise icon-button hit areas with `min-h-11 min-w-11` on touch.

**Verification.** Tables have min-w-[900px]/[1280px] and rely on horizontal scroll. This is an admin tool where phone triage is not the stated main use, and the row-click detail sheet is a usable path.

**Also reported as:** [F592](ux-content-and-visual-polish.md#f516) [ux-rest] Console is table-first: 900 to 1,280 px minimum widths and a filter form that pushes results about two screens down on phones (src/app/features/console/console.page.html:159, src/app/features/console/insiden/pending/pending.component.html:22)

<details><summary>Evidence</summary>

```text
<table hlmTable class="min-w-[1280px]">   (links)
<table hlmTable class="min-w-[900px]">    (pending, spotting)
```

</details>

<a id="f524"></a>

#### F524 · Register the undocumented user-visible rules, and surface the ones nobody can reach

**low** · effort M · ux · gap-1 · partially confirmed · severity adjusted from medium

**Where:** `src/app/core/methodology/methodology.content.ts:464-473`, `src/app/features/home/data/board-lines.util.ts:104-112`, `src/app/features/home/pro/pro-official-widget.ts:58-70`, `src/app/core/methodology/methodology.content.ts:80-89`

**Problem.** AGENTS.md says every user-visible rule needs a MetricDoc surfaced by an InfoPopover. network.severity-order ('Worst line first') has no popover anywhere, so the board ordering is published only on a page that hides its definitions. The quiet-lines fold, the Others group, the Pro Official notices archive (isAutomated filter, newest public links, no window) and the 'peak' number on the heat grid are rules without a MetricDoc. The registry carries a review constant for the archive, but no entry exists for it. The severity-order text also lists Defunct, Testing and Active as 'lines needing attention', although those never need attention.

**Recommendation.** Add MetricDocs: network.quiet-lines, network.others-group, network.official-notices (what counts as official, newest first, no time window), and attach popovers to the group headings and widget titles. Fix network.severity-order to describe the order of all in-service lines, and give it an info popover on the sort control. Add a spec that fails when a MetricDoc id is referenced by no component.

**Verification.** I could not confirm each undocumented rule individually. The orphan network.severity-order MetricDoc is plausible and fits the repo rule, but the finding bundles many items.

<details><summary>Evidence</summary>

```text
id: "network.severity-order", ... // referenced by no component (0 non-spec uses)
/** A "quiet" line: in service, running normally, and with no reports in its rolling window. */
export function isQuietLine(...)
<h2 ...>Official notices</h2> <span>Newest first · showing {{ _notices().length }}</span>
// registry comment: "Bumped when the Pro dashboard's OFFICIAL-NOTICES ARCHIVE ... landed" (no matching MetricDoc)
```

</details>

<a id="f542"></a>

#### F542 · Reduce the phone's three rows of board controls and the operator chips derived from code prefixes

**low** · effort M · ux · home-data · partially confirmed · already documented

**Where:** `src/app/features/home/line-pulse/network-board.component.ts:120`, `src/app/features/home/data/line-family.util.ts:346`, `.omo/evidence/audit-2026-10-21/agents/home-data/cdp/M-top.png`

**Problem.** Because the schema has no operator field, the 'operator' filter is the code's leading letters: KTM, KTMB and KTMK are three chips, and BRT, ERL, MRL and SKYPARK each select one line, so most chips filter nothing meaningful while still being labelled as operators. With the sort and view groups they consume about 250 px, which together with the hero pushes the first actual line card below the fold on a phone.

**Recommendation.** Until the backend exposes an operator or mode, hide singleton families (show chips only for families with 2 or more lines) or group by the first token before a space or hyphen; fold sort and view into a single compact control row or a bottom-sheet 'Filter' button on narrow screens.

**Verification.** Chips are derived from code prefixes (line-family.util.ts, a deliberate documented choice since the schema has no operator field) and the screenshot shows singleton chips plus three control rows on 390 px. The cited line 346 is wrong (file has 62 lines); the UX concern is subjective polish.

<details><summary>Evidence</summary>

```text
Live chips at 390 px: All BRT ERL KTM KTMB KTMK LRT MRL MRT SKYPARK (two rows), then Severity/Name, then Rider/Pro; the 'ALL LINES' heading sits at about y=715 of an 844 px viewport.
const leading = /^[A-Za-z]+/.exec(code.trim());
```

</details>

<a id="f552"></a>

#### F552 · Every incident card shows its whole timeline, so one card is 1,835 px tall at 390 px

**low** · effort M · ux · insiden-ui · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/insiden/incident-card/incident-card.component.html:73-184`, `.omo/evidence/audit-2026-10-21/agents/insiden/s1.png`

**Problem.** The most important facts for a rider are what is affected, whether it is still happening, and the latest update. On a phone the card puts a long brief, then a 12-row timeline with a vote control per row, before the links and the card-level actions, so one incident can occupy several screens and the next incidents (and the Pending section) are far below. The page's ad slot logic and the day's list also assume a handful of short cards.

**Recommendation.** Collapse older updates behind an aria-expanded toggle that shows the latest few entries.

_Original suggestion (corrected by the verifier):_ Collapse the timeline by default to the latest two or three entries plus a 'Show all N updates' toggle (with aria-expanded), placing the newest update first when the incident is ongoing. Move the per-row vote controls inside the expanded view, and keep the card-level vote and actions in a compact header row. Consider a `@defer (on viewport)` for the below-the-fold part of tall cards.

**Verification.** The chronology loop renders every row at html:73-184 with no collapse. The 1,835 px height is a measurement I did not reproduce. It is a UX judgement, not a bug.

<details><summary>Evidence</summary>

```text
@for (entry of chronology(); track entry.order; ...) renders every chronology row with its own vote buttons; measured card height at 390 px viewport for the 2023-03-15 incident (12 chronology rows): 1835 px.
```

</details>

<a id="f566"></a>

#### F566 · No structured data (JSON-LD) on any page

**low** · effort M · seo-meta · seo-pwa-i18n · partially confirmed

**Where:** `src/index.html:4-13`, `src/app/features/insiden/incident-card/incident-card.component.html:44`

**Problem.** Incidents are real, dated events with a title, a start and an end. None of that is machine-readable, so search engines cannot show it as an event, and the site has no WebSite or Organization entity for the sitelinks and brand panel.

**Recommendation.** Add WebSite and Organization JSON-LD to index.html first. Only add Event markup if incidents are verified dated events. Serialise with JSON.stringify and replace '<' with < before inserting it into the script tag.

_Original suggestion (corrected by the verifier):_ Add a WebSite and Organization JSON-LD block to index.html for the brand. On server-rendered incident-day pages, emit an Event object (name, startDate, endDate, description) per incident using the fields the GraphQL response already provides. Build the JSON with JSON.stringify inside a script tag with type application/ld+json, and never interpolate raw text into it.

**Verification.** A grep across src and public finds no application/ld+json, so the absence is real. Incidents are community-submitted links on a calendar, not curated real-world events, so an Event schema may be misapplied. The recommendation also omits escaping of '<', so a title containing '</script>' could break out of the JSON-LD block even with JSON.stringify.

<details><summary>Evidence</summary>

```text
grep across src and public for application/ld+json returns no matches.
incident-card.component.html:44 → <h3 hlmCardTitle>{{ incident().title }}</h3>
```

</details>

<a id="f570"></a>

#### F570 · Heatmap switches layout after first paint (compact on the server, classic after measuring) and opens on an empty current year

**low** · effort M · ui-visual · spotting · partially confirmed

**Where:** `src/app/domain-ui/spotting-activity-heatmap/spotting-activity-heatmap.ts:214`, `src/app/domain-ui/spotting-activity-heatmap/spotting-activity-heatmap.ts:239`, `src/app/domain-ui/spotting-activity-heatmap/spotting-activity-heatmap.ts:332`, `src/app/features/spotting/line-overview/vehicle-list/vehicle-heatmap-preview/vehicle-heatmap-preview.component.ts:37`

**Problem.** SSR and the first client frame always render the tall compact grid (the HTML contains one `repeat(auto-fill, minmax(18px` grid), then a ResizeObserver swaps to the short weeks-as-columns layout, rebuilding about 370 cells and shifting everything below it on desktop. A vehicle whose spottings are all in 2018 opens on a blank 2026 grid with the caption 'No spottings recorded yet'; the user must find the year pill. The vehicle-list hover preview is a fixed 960 px wide, so it overflows the viewport between 768 and 959 px, and it can only be reached with a mouse after a 2 second delay.

**Recommendation.** Default selectedYear to latest year with data and clamp the preview width; keep the existing measurement approach unless profiling shows jank.

_Original suggestion (corrected by the verifier):_ Default `selectedYear` to the latest year present in data() (a linkedSignal over years()). For layout, use one flat list of days with CSS only (container query: `@container` with `grid-auto-flow: column` and `grid-template-rows: repeat(7, ...)` when wide), which removes the JS measurement and the second render. Give the preview `w-[min(960px,calc(100vw-2rem))]` and also open it on focus.

**Verification.** containerWidth starts at 0 (compact first), selectedYear defaults to the current year, and the preview is a fixed w-[960px]. The compact-first order is a deliberate, documented trade-off, so the layout shift is minor; the empty-year default and the 960px overflow are valid polish.

<details><summary>Evidence</summary>

```text
protected readonly selectedYear = signal(new Date().getFullYear());
protected readonly containerWidth = signal(0);   // 0 -> compact layout first
protected readonly useClassicLayout = computed(() => this.containerWidth() >= this.classicLayoutMinWidth());
class="... max-h-96 w-[960px] overflow-y-auto ..."   // hover preview
```

</details>

<a id="f571"></a>

#### F571 · Retained pages and polled tabs give no freshness cue, and Situasi and Insiden duplicate the same 60-line refresh control

**low** · effort M · ux · spotting

**Where:** `src/app/features/spotting/line-details/situasi-section/situasi-section.component.ts:68`, `src/app/features/spotting/line-details/insiden-section/insiden-section.component.ts:53`, `src/app/features/home/refresh-control/home-refresh-control.component.ts:1`

**Problem.** Line overview, details and vehicle pages come back from keep-alive with old numbers and silently reload, but nothing says how old the data is or that a refresh happened; only the two polled tabs have any control. The two tabs copy the interval select, spinner and countdown, with an unlabeled <select> and a spinner that ignores prefers-reduced-motion. A better shared control already exists for the home page.

**Recommendation.** Extract the control into one `app-refresh-control` (input: PollingSource) with `aria-label="Refresh interval"`, `motion-reduce:animate-none` and a live 'Updated 2 min ago' text; reuse it on overview and vehicle pages with a manual refresh button wired to the same resources. Base the age on a timestamp set when the resource value changes.

**Verification.** Situasi and insiden sections carry the same inline <select> with no aria-label and an inline spin animation; home-refresh-control already exists as a shared control. The freshness-cue point is a design opinion but harmless.

<details><summary>Evidence</summary>

```text
<select class="border-input bg-background rounded-md border px-1.5 py-1 text-xs font-normal" (click)="$event.stopPropagation()" (change)="onRefreshIntervalChange($event)">   // same markup, same REFRESH_INTERVAL_OPTIONS, in both files; no aria-label
<svg ... style="animation: spin 1s linear infinite" aria-hidden="true">
```

</details>

<a id="f585"></a>

#### F585 · Show the line name and use 44 px actions on compact line rows at phone width

**low** · effort M · ux · ux-home · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/home/line-pulse/line-pulse-row.component.ts:121`, `src/app/features/home/line-pulse/line-pulse-row.component.ts:129`, `src/app/features/home/line-pulse/line-pulse-row.component.ts:162`, `src/app/features/home/line-pulse/line-pulse-row.component.ts:186`, `src/app/features/home/line-pulse/line-pulse-row.component.ts:196`, `src/app/ui/button/button.ts:19`, `.omo/evidence/audit-2026-10-21/interactions/home-feed__line-row-expanded.png`

**Problem.** At 390 px the pin, Details and Report buttons take most of the first line, so the title truncates to the code plus one letter and the line's real name is never readable without expanding the row. The three actions are 28 px tall with 6 px gaps, which makes mis-taps between Details (navigates away) and Report (opens a sheet) likely. The toggle's aria-label ('Show detail for KJL') replaces the visible text, so the accessible name no longer contains the visible name (WCAG 2.5.3) and it does not change between expanded and collapsed.

**Recommendation.** Move the actions to a second row on phones or let the title wrap, and enlarge touch heights. Make the aria-label include the displayName or drop it, but this is not a hard 2.5.3 failure.

_Original suggestion (corrected by the verifier):_ Below sm, move the actions to the second row (or into the expanded panel) and let the title wrap with `line-clamp-2`. Give the actions `pointer-coarse:h-11 pointer-coarse:min-w-11` (see the touch-target finding). Drop the aria-label (the visible text plus aria-expanded is enough) or make it `Show detail for ${displayName}` and rely on aria-expanded for state.

**Verification.** Row code confirms the title truncates beside the pin, Details and Report buttons (h-7) and the screenshot shows 'Skypark · K...'. The WCAG 2.5.3 claim is overstated, since the aria-label 'Show detail for KJL' still contains the visible code.

<details><summary>Evidence</summary>

```text
[attr.aria-label]="'Show detail for ' + line().code"
<span class="min-w-0 flex-1 truncate text-sm">...{{ line().code }} ... · {{ line().displayName }}
size="icon-sm" (pin)  /  size="sm" Details  /  size="sm" Report   // h-7 = 28 px, gap-1.5
Screenshot: 'Skypark · K...' and 'LRT SAL · L...'; 'H...' header label above.
```

</details>

<a id="f586"></a>

#### F586 · Stop line identity colours from reading as status colours, and tokenise the status palette

**low** · effort M · ui-visual · ux-home · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/home/line-pulse/line-pulse-row.component.ts:109`, `src/app/features/home/line-pulse/line-pulse-row.component.ts:123`, `src/app/features/home/line-pulse/line-pulse-card.component.ts:56`, `src/app/ui/badge/badge.ts:15`, `src/app/features/home/data/passenger-status.util.ts:85`, `src/app/features/home/hero/home-hero.component.ts:463`, `.omo/evidence/audit-2026-10-21/routes/home-pro__desktop__light__full.png`

**Problem.** Every row has a thick left rail and a dot in the line's own brand colour, and many lines are red, orange, green or yellow (KTMK-PKL red, LRT AGL orange, Skypark orange, MRT PYL yellow). The same hues mean 'critical', 'degraded' and 'normal' in the hero and badges, so on the Pro board a healthy red-railed line looks alarming, and a Defunct line with an orange dot sits under an orange rail. Separately the status palette is defined five different ways (emerald badges, green-600 hero text, emerald/yellow/orange bars, amber warning badges), so Delayed is amber in one place and yellow in another.

**Recommendation.** Consider neutral or roundel line identity, and share status tokens across badges and hero text. Do not force bars and badges into one mapping, since they need different contrast.

_Original suggestion (corrected by the verifier):_ Render line identity as a filled roundel containing the line code (white or black text chosen by contrast) as transit maps do, and keep the left rail neutral or reserve it for status. Add semantic CSS variables for ok, info, warn, bad and neutral (light and dark) in styles.css, and have HlmBadge, the hero tone classes, PASSENGER_BAR classes and charts read them so each severity has exactly one colour and one icon.

**Verification.** Line rails use backend hex colours while status uses green/amber/orange/red, so the clash is real. The palette split (emerald badge, green-600 hero, yellow DELAYED bar) exists, but PASSENGER_BAR_CLASS has a documented rationale for being separate from the badges.

<details><summary>Evidence</summary>

```text
<span class="absolute inset-y-0 left-0 w-1 rounded-l-lg" [style.background-color]="line().displayColor">   // coloured rail + 10px dot per row
badge success: bg-emerald-100 text-emerald-800 ; hero tone: text-green-600 / bg-green-500 ; bars: NORMAL bg-emerald-500, DELAYED bg-yellow-500, BACKLOGGED bg-orange-500 while badge warning is amber for both
```

</details>

<a id="f587"></a>

#### F587 · Simplify the Pro dashboard's duplicated view controls and touch-irrelevant shortcut hints

**low** · effort M · ux · ux-home · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/home/pro/pro-dashboard.component.ts:118`, `src/app/features/home/pro/pro-dashboard.component.ts:145`, `src/app/features/home/line-pulse/network-board.component.ts:184`, `src/app/features/home/line-pulse/line-pulse-row.component.ts:288`, `src/app/features/home/line-pulse/line-pulse-row.component.ts:302`, `.omo/evidence/audit-2026-10-21/routes/home-pro__mobile__light__full.png`, `.omo/evidence/audit-2026-10-21/routes/home-pro__desktop__light__viewport.png`

**Problem.** On Pro the page shows three overlapping ways to change views (a 'Back to rider view' button, a Rider/Pro segmented control inside the embedded board, and Board/Table), plus keyboard-shortcut chips that are meaningless on a phone. At 390 px the Pro lines widget also stacks its own filters above the rider board's operator, sort and view controls. Each quiet row repeats the same report count twice and shows 'No recent reports' and 'No data' badges, which makes 14 identical rows. Pro looks like the rider board with extra rows rather than a denser tool.

**Recommendation.** Hide the kbd hints below lg and omit the Rider/Pro group when embedded. The duplicate count only appears at sm and above in pro mode.

_Original suggestion (corrected by the verifier):_ Hide the shortcut hints below lg (`hidden lg:flex`) and show only the 'Rider view' button. Pass an input to NetworkBoardComponent to omit the Rider/Pro group when hosted by the Pro widget (like embedHeatStrip/foldQuiet). In pro mode drop the plain 'N reports' span when the 'N reports - 15 min window' line is shown. For rows with no data replace the two neutral badges with one muted 'Quiet' label.

**Verification.** The shortcut kbd hints render at all widths, and the Rider/Pro group is rendered inside the embedded board. The doubled report count is overstated, because the plain 'N reports' span is hidden below sm.

<details><summary>Evidence</summary>

```text
data-testid="pro-shortcuts" ... <kbd>/</kbd> Search links  <kbd>r</kbd> Refresh now  ... <kbd>p</kbd> Back to rider view   // rendered at 390 px too
<div ... role="group" aria-label="Board view">  Rider | Pro   // still rendered inside the Pro board
{{ line().statusReportCount }} reports   +   {{ line().statusReportCount }} reports · {{ line().statusWindowMinutes }} min window
Screenshot: each of 14 rows repeats 'No recent reports', 'No data', 'N/M in service', '0 reports' and '0 reports · 15 min window'.
```

</details>

<a id="f588"></a>

#### F588 · Timeline entries cram text, source links, status badge, votes and delete button into one wrapping row

**low** · effort M · ui-visual · ux-insiden-gallery · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/insiden/incident-card/incident-card.component.html:95`, `src/app/features/insiden/incident-card/incident-card.component.html:154`, `.omo/evidence/audit-2026-10-21/interactions/insiden__incident-details-open.png`

**Problem.** At 390 px every timeline row becomes two or three lines: timestamp + dash, wrapped text, orphan icons, then a right-aligned vote control. The 12 px text (text-xs) is the main content a rider reads, and the em dash after the timestamp visually dangles at line end. Every row also gets its own up/down vote arrows showing "0", repeating the card-level vote control; it is not obvious what a vote on one timeline line means.

**Recommendation.** Fix #5 first, then reassess. Dropping the dangling dash and relocating per-row votes is enough.

_Original suggestion (corrected by the verifier):_ Use a two-column row: a fixed timestamp column (HH:mm bold, date only when it changes) and a content column with the text first at text-sm, then a small metadata line (status badge, source link, votes). Hide per-entry vote controls behind the details expansion or show them only to logged-in users. Drop the aria-hidden em dash.

**Verification.** The screenshot shows rows wrapping into text, orphan icons and a right-aligned vote control, and the em dash dangles at line end. Part of the mess comes from the duplicate link (#5), and the two-column redesign is a taste call.

<details><summary>Evidence</summary>

```text
incident-card.component.html:95  <div class="flex flex-wrap items-start gap-x-1.5 gap-y-1"> ... timestamp, em dash, content, 2x link, badge, <app-vote-button class="ml-auto"> ... Request deletion button
Screenshot: "May 19, 19:16 - Faulty train announced to be removed from service" wraps, then icons, then a separate right-aligned row "^ 0 v".
```

</details>

<a id="f591"></a>

#### F591 · Desktop incident layout leaves the right column mostly empty and the page stays a stretched phone stack

**low** · effort M · ui-visual · ux-insiden-gallery · partially confirmed

**Where:** `src/app/features/insiden/insiden.page.html:71`, `src/app/features/insiden/insiden.page.html:4`, `.omo/evidence/audit-2026-10-21/routes/insiden-dated__desktop__light__full.png`

**Problem.** The two-column layout is sound, but the calendar is not sticky, so once cards are expanded the calendar scrolls away, and when the day list is short the right column is blank. There is no month summary (counts by severity) to use the width, and the heading stack (h1, blurb, tabs) pushes everything down 160 px before the first useful element.

**Recommendation.** Sticky calendar only if desired. A month summary is a nice-to-have.

_Original suggestion (corrected by the verifier):_ Make the calendar sticky (lg:sticky lg:top-20 self-start), add a month summary line under it ("12 incidents: 3 major, 8 minor") using the already loaded data, and place the report/login button in the right column header next to the day title.

**Verification.** A non-sticky calendar and an empty right column on desktop are plausible. Evidence is a screenshot-level layout opinion with no functional defect.

<details><summary>Evidence</summary>

```text
insiden.page.html:71  <div class="flex flex-col gap-6 lg:flex-row"> with the calendar fixed at lg:w-96 and the list taking flex-1. Screenshot (1440x900): the calendar occupies the left 385 px, the right column shows only "MAY 19, 2023 / PENDING APPROVAL (3)" and about 600 px of white space, and the page height is held by min-h-screen with a footer 400 px below.
```

</details>

<a id="f593"></a>

#### F593 · Profile confirmations use blocking native confirm() dialogs while the app has sheets for everything else

**low** · effort M · ux · ux-rest · partially confirmed

**Where:** `src/app/features/profile/user-card/user-card.component.ts:311`, `src/app/features/profile/my-spottings/my-spottings.component.ts:141`, `src/app/features/profile/user-card/user-card.component.ts:211`

**Problem.** A native confirm box cannot be themed (it is a light island in dark mode), cannot hold the longer privacy explanation, is suppressed by some in-app browsers, and breaks the visual language of the surrounding Helm sheets. On desktop, a single checkbox takes over the whole screen as a full-size sheet.

**Recommendation.** Optional: introduce a shared confirm dialog and migrate all call sites (including console links) together rather than only profile.

_Original suggestion (corrected by the verifier):_ Add a small `ConfirmDialog` built on the existing HlmSheet (or a centred dialog) with title, body, and destructive confirm button, and use it in both places. Use a bottom or right sheet on desktop for the privacy toggle instead of 'full'.

**Verification.** window.confirm is used in user-card and my-spottings, but links.component.ts documents native confirm as a deliberate existing house guard for delete, so it is consistent with other code. Theme and in-app-browser limits are real but minor.

<details><summary>Evidence</summary>

```text
`const confirmed = window.confirm("Make Spotting History Public?\n\nThis will allow anyone to view ...")` and `if (!confirm("Delete this spotting entry? This can't be undone."))`; the privacy sheet opens `[side]="_hoverCapable() ? 'full' : 'bottom'"`.
```

</details>

<a id="f594"></a>

#### F594 · Mobile roster stacks three sticky layers (about 300 px) and gives no sort, search or visible collapse

**low** · effort M · ux · ux-spotting · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/spotting/line-overview/line-overview.page.ts:104`, `src/app/features/spotting/line-overview/vehicle-list/vehicle-list.component.ts:113`, `src/app/features/spotting/line-overview/vehicle-list/vehicle-list.component.ts:121`, `src/app/features/spotting/line-overview/vehicle-list/vehicle-list.component.ts:144`, `.omo/evidence/audit-2026-10-21/routes/spotting-line__mobile__light__full.png`

**Problem.** While scrolling a 35-vehicle card list, roughly a third of the 844 px viewport is permanently covered by headers. All five vehicle types are expanded by default, so reaching the 5th type means scrolling thousands of pixels. The hover-only collapse affordance is undiscoverable on touch, where the comment's rationale (hover state) does not exist; the h3 sits inside a button with no aria-expanded. Sorting, which is URL-synced, can only be changed from the table layout, so card users have no sort and no vehicle-number search even though vehicle-search.util exists.

**Recommendation.** Drop the sticky chip row on mobile, add aria-expanded and a visible chevron, and enlarge the 'View full table' link. Treat sort and search as optional features.

_Original suggestion (corrected by the verifier):_ On mobile, do not make the per-type chip row sticky (stick only the title row, or only the nav). Add a chevron and aria-expanded to the collapse button, and default all but the first type to collapsed below md. Add a small sort/filter row (or a vehicle-number search input reusing vehicle-search.util) above the cards, and make 'View full table' a 36 px+ button.

**Verification.** Sticky headers and the missing aria-expanded are real, but the stated sticky stack height and sort/search additions are subjective. Defaulting types to collapsed is a product choice.

<details><summary>Evidence</summary>

```text
sticky top-[61px] ... (app-nav 61 px) + line switcher bar (min-h-14) + vehicle-type header with title and wrapped chip rows (about 180 px at 390 px per the screenshot). Page is about 18.5k px tall on mobile. Collapse: "There's deliberately no chevron/arrow hinting that the title is clickable"; the card view hides sort entirely and 'View full table' is a text-xs underlined link.
```

</details>
