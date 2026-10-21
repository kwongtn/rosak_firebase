# Accessibility and keyboard access

Part of the [rosak_firebase audit, 2026-10-21](../2026-10-21.md). 54 findings, most severe first.

Sheets, combobox, heatmap, calendar, gallery and the shell lack dialog/ARIA semantics, visible focus and keyboard paths; contrast and touch targets also fall short. A shared accessible dialog and a focus-ring fix cover most of it.

<a id="f001"></a>

#### F001 · Restore a visible focus indicator on the app's icon buttons that use outline-none with no focus-visible replacement

**high** · effort S · accessibility · accessibility

**Status, fix pass 2026-10-21:** Fixed (`03b730e`). Every icon button that set `outline-none` (header tray, avatar, module menu, sheet Close buttons, compact nav, tracker panel, console, heatmap) now shows `focus-visible:ring-3 focus-visible:ring-ring/50`.

**Where:** `src/app/shell/app-nav/app-nav-icon-tray.component.ts:89`, `src/app/shell/app-nav/app-nav-icon-tray.component.ts:130`, `src/app/shell/app-nav/app-nav-icon-tray.component.ts:170`, `src/app/shell/app-nav/app-nav-module-menu.component.ts:24`, `src/app/shell/app-nav/app-nav-module-menu.component.ts:112`, `src/app/shell/app-nav/app-nav.component.ts:263`, `src/app/shell/compact-nav/compact-nav.component.ts:151`, `src/app/features/tracker/info-panel/tracker-info-panel.component.ts:104`, `src/app/features/tracker/info-panel/tracker-info-panel.component.ts:143`, `src/app/features/console/insiden/links/links.component.html:188`, `src/app/features/console/insiden/pending/pending.component.html:85`, `src/app/features/console/insiden/pending/pending.component.html:149`, `src/app/domain-ui/spotting-activity-heatmap/spotting-activity-heatmap.ts:175`

**Problem.** These buttons are plain <button>s (not hlmBtn, which carries focus-visible:ring-3), and every one sets outline-none while defining only hover: styles. Tailwind v4's outline-none removes the outline entirely, so keyboard focus on the Report-a-bug, new-version, avatar/Log in, module-menu trigger and every sheet Close (X) button is invisible. The captured keyboard screenshots only show indicators on the header text links (stops 3 and 6), which keep the browser default ring; the button stops in the same header never get one. This fails WCAG 2.4.7 on the header that appears on every page, and the sheet Close buttons are the first control keyboard users land on in a sheet.

**Recommendation.** Add one shared class and use it on all of them, for example in styles.css `@utility focus-ring { @apply focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none; }` and replace bare `outline-none` with `outline-none focus-visible:ring-3 focus-visible:ring-ring/50`. Better, give the repeated 32px round icon button a Helm variant (`<button hlmBtn variant="ghost" size="icon" class="rounded-full">`) so it inherits the ring; the same close-button markup is copy-pasted six times. For the heatmap cells see the heatmap finding. Add a spec that greps templates for `outline-none` without `focus-visible:` to stop regressions.

**Verification.** The icon-tray buttons (lines 89, 130, 170), module-menu, sheet close X, compact-nav and tracker panel buttons all use outline-none with no focus-visible replacement. The avatar button has only hover:ring. styles.css:333 only sets an outline colour. The info-popover trigger and media-viewer close do have focus-visible rings, so the problem is real but limited to the listed buttons.

**Second check (high-severity pass).** code review: holds (high). Every cited button is a plain <button> whose class list has outline-none and only hover: styles. I confirmed all the header and sheet-close sites: icon-tray lines 89, 130, 170; module-menu lines 24, 112; app-nav line 263; compact-nav line 151; plus tracker, links and pending. The built CSS defines `.outline-none{--tw-outline-style: none;outline-style:none}`, and I found no global `:focus-visible` rule in styles.css or the dist CSS. styles.css:333 only sets an outline colour (`outline-ring/50`), so nothing replaces the removed outline. The avatar button has only `hover:ring-2`, not a focus ring. Keyboard focus is therefore invisible on the header buttons that appear on every page and on the sheet Close buttons, which fails WCAG 2.4.7. It affects keyboard users only, but it is a hard fail on a shared header. impact review: holds (high). The header buttons (Report a bug, avatar/Log in, new-version, module menu, sheet Close) are plain buttons with `outline-none` and only hover styles. styles.css line 333 only sets an outline colour (`outline-ring/50`) and has no focus-visible rule, so keyboard focus is invisible. This is the global header on every page, so it fails WCAG 2.4.7 for all keyboard users. High is fair because it is on the hot path, though the affected audience is small.

**Fix note from the second check.** The proposed fix is fine. A smaller form is to append `focus-visible:ring-3 focus-visible:ring-ring/50` next to each `outline-none`. The spec that greps templates is optional. Replace bare `outline-none` with `outline-none focus-visible:ring-2 focus-visible:ring-ring/50` on these buttons. A shared utility class is enough. Skip the template-grepping spec and the Helm variant rework unless they are wanted separately.

**Also reported as:** [F023](accessibility-and-keyboard-access.md#f001) [ux-home] Restore a visible keyboard focus indicator on header icon buttons, the module trigger and sheet close buttons (src/app/shell/app-nav/app-nav-icon-tray.component.ts:89, src/app/shell/app-nav/app-nav-icon-tray.component.ts:130); [F156](accessibility-and-keyboard-access.md#f001) [ui-system] Header icon buttons and sheet close buttons have no visible keyboard focus indicator (src/app/shell/app-nav/app-nav-icon-tray.component.ts:130, src/app/shell/app-nav/app-nav-icon-tray.component.ts:170)

<details><summary>Evidence</summary>

```text
class="text-muted-foreground hover:bg-muted hover:text-foreground flex size-8 shrink-0 items-center justify-center rounded-full outline-none" aria-label="Report a bug"   (styles.css:333 only sets `outline-ring/50`, a colour, and Tailwind v4 `outline-none` is outline-style:none)
```

</details>

<a id="f030"></a>

#### F030 · Give the combobox the ARIA combobox pattern and stop Escape from closing the parent sheet

**high** · effort M · accessibility · accessibility

**Status, fix pass 2026-10-21:** Fixed (`67c61c1`, `1fef2e6`, `b28820d`). The combobox has role=combobox, aria-expanded, aria-controls and aria-activedescendant, listbox and option roles, and a results count. It consumes Escape only while the list is open. The Month, Year and Switch vehicle comboboxes are labelled.

**Where:** `src/app/ui/combobox/combobox.ts:25`, `src/app/ui/combobox/combobox.ts:57`, `src/app/ui/combobox/combobox.ts:62`, `src/app/features/insiden/calendar/calendar.component.ts:63`, `src/app/features/spotting/vehicle-detail/vehicle-detail.page.ts:79`

**Problem.** The combobox input has no role=combobox, aria-expanded, aria-controls, aria-autocomplete or aria-activedescendant; the list has no role=listbox and rows have no role=option or aria-selected. A screen-reader user hears 'edit text' and is never told a list exists, how many matches there are, or which row the arrow keys highlighted. The calendar's month and year comboboxes and the vehicle breadcrumb combobox are passed no aria-label, so axe reports them as critical unlabeled form fields on /insiden, /insiden/:date and the vehicle page. Escape closes the dropdown but does not stopPropagation, so inside a sheet (the spotting report form's vehicle picker) the same keypress reaches HlmSheet's document:keydown.escape listener and closes the whole sheet, discarding what the rider typed.

**Recommendation.** On the input add role="combobox", aria-autocomplete="list", [attr.aria-expanded]="_isOpen()", aria-controls=<listbox id> and [attr.aria-activedescendant]=<highlighted option id>. Give the ul role="listbox" and each li role="option" with an id and [attr.aria-selected]="$index === _highlightIndex()"; add a visually hidden role=status line announcing '{{n}} results'. Make the Escape handler `(keydown.escape)="_isOpen() && ($event.stopPropagation(), _isOpen.set(false))"` so it only consumes the event when it actually closes the list. Pass aria-label="Month"/"Year" in calendar.component.ts and aria-label="Switch vehicle" in vehicle-detail.page.ts. Alternatively adopt Spartan's brn combobox, which already implements this pattern.

**Verification.** combobox.ts input and ul/li have no combobox, listbox or option roles or aria-expanded. (keydown.escape) only sets _isOpen false with no stopPropagation, while HlmSheet listens on document:keydown.escape. The calendar month and year comboboxes and the vehicle-detail combobox pass no aria-label.

**Second check (high-severity pass).** code review: holds (high). combobox.ts has no combobox, listbox or option roles and no aria-expanded, aria-controls or aria-activedescendant. The input only takes `[attr.aria-label]="ariaLabel() ?? null"`, and the `ul` and `li` carry no roles. Both calendar.component.ts comboboxes (lines 63 and 71) and the vehicle-detail.page.ts combobox (line 79) are passed no aria-label, and the combobox has no other label source, so they are unnamed, matching the axe result. `(keydown.escape)="_isOpen.set(false)"` does not stop propagation, so the keydown still reaches HlmSheet's `(document:keydown.escape)` listener. The spotting report-form combobox sits inside the spotting-shell hlm-sheet. report-form.component.ts:190-215 runs `clear()` on every sheet close, so an Escape pressed to dismiss the dropdown closes the sheet and wipes the draft. That is real input loss, not just an accessibility gap. impact review: holds (high). The combobox input has no role, aria-expanded or aria-controls, the `ul` has no listbox role, and the rows are plain `li` elements with no option role. Several instances (the calendar and the vehicle page) also get no aria-label, so axe reports critical unlabeled fields. `(keydown.escape)="_isOpen.set(false)"` does not stop propagation. HlmSheet listens on `document:keydown.escape`, so Escape inside the spotting report form's vehicle picker closes the whole sheet and loses the rider's input. That is a data-loss bug, not only an accessibility gap.

**Fix note from the second check.** The proposed fix is correct. The smallest part with the most value is `(keydown.escape)="_isOpen() && ($event.stopPropagation(), _isOpen.set(false))"` plus aria-labels on the three callers. The full ARIA roles and the results-count live region can follow. Make Escape stop propagation only when the list is open: `(keydown.escape)="_isOpen() && ($event.stopPropagation(), _isOpen.set(false))"`. Add aria-labels "Month", "Year" and "Switch vehicle". Then add the combobox, listbox and option roles with aria-activedescendant. The live-region results announcement can wait.

**Also reported as:** [F155](accessibility-and-keyboard-access.md#f030) [ui-system] Combobox is a plain text input with no combobox/listbox ARIA, and the highlighted option never scrolls into view (src/app/ui/combobox/combobox.ts:25, src/app/ui/combobox/combobox.ts:59)

<details><summary>Evidence</summary>

```text
<input hlmInput type="text" ... [attr.aria-label]="ariaLabel() ?? null" ... (keydown.escape)="_isOpen.set(false)" />  <ul class="bg-popover ..."> <li class="hover:bg-muted ..." (mousedown)="_select(item)">. axe on /insiden: critical `label` on input[value="October"] and input[value="2026"]; on /spotting/4/vehicle/103 critical `label` on `input`.
```

</details>

<a id="f032"></a>

#### F032 · Name the gallery photo buttons and turn the photo viewer into an accessible dialog

**high** · effort M · accessibility · accessibility

**Status, fix pass 2026-10-21:** Fixed (`a9e546c`, `612ce27`). Thumbnails have names. The viewer is a modal dialog that moves focus in, traps it and restores it on close. Year jumps respect reduced motion and scroll once the year has rendered.

**Where:** `src/app/features/gallery/justified-grid/justified-grid.component.ts:34`, `src/app/features/gallery/justified-grid/justified-grid.component.ts:44`, `src/app/features/gallery/media-viewer/media-viewer.component.ts:16`, `src/app/features/gallery/media-viewer/media-viewer.component.ts:49`, `src/app/features/gallery/gallery.page.ts:217`

**Problem.** Every thumbnail is a button whose only content is an alt="" image, so 24 buttons per page are announced as just 'button' (axe critical, WCAG 4.1.2 and 1.1.1). The full-size viewer is the page's primary content yet its image also has alt=""; the overlay has no role=dialog, aria-modal or label, does not move focus in, does not trap focus and does not restore it on close, so keyboard users Tab into the grid hidden behind the black overlay and land on an arbitrary unnamed button after Escape. The year-jump scrollIntoView uses behavior smooth with no reduced-motion check.

**Recommendation.** Give each thumbnail button an aria-label built from data you already have, for example `aria-label="Photo by {{uploader.nickname}}, {{createdDate | date:'d MMM y'}}"` (and use that string as the viewer image alt). In MediaViewerComponent add role="dialog" aria-modal="true" aria-label="Photo viewer", focus the Close button on open (afterNextRender), trap focus (cdkTrapFocus), and restore focus to the originating thumbnail on close (keep the clicked id in GalleryPage and focus `[data-media-id]` after the viewer closes). Check matchMedia('(prefers-reduced-motion: reduce)') before the smooth scroll in gallery.page.ts:217, as link-submit-box.component.ts:181 already does.

**Verification.** justified-grid thumbnails are buttons containing only an img with alt="". media-viewer host has no role, aria-modal, focus move or trap, and its main img has alt="". gallery.page.ts:217 uses scrollIntoView smooth with no reduced-motion check.

**Second check (high-severity pass).** code review: holds (high). Verified in source. justified-grid.component.ts renders each thumbnail as `<button type="button" ...><img ... alt="" ...></button>` with no aria-label, so every thumbnail button has an empty accessible name. media-viewer.component.ts has host classes and click/Escape handlers only. It has no role="dialog", aria-modal or aria-label, and no focus move, focus trap or focus restore. Its main `<img>` also has `alt=""`. gallery.page.ts:217 calls `scrollIntoView({ behavior: "smooth" })` with no prefers-reduced-motion check, and I found no prefers-reduced-motion check anywhere in the .ts sources I grepped. The Escape handler does close the viewer, so keyboard dismissal works; only the focus handling is missing. This is a real, user-facing screen-reader and keyboard failure on a core public page. The claim about the exact focus target after Escape was not re-run, but it follows from the code: focus is never moved in or restored. impact review: holds (high). I read justified-grid.component.ts: each thumbnail is a button whose only child is an img with alt="", so screen readers announce 24 unnamed buttons per page. This is a real WCAG 4.1.2 failure. The media-viewer host is a plain fixed overlay with no role, aria-modal or label. It does not move or trap focus, and its main image also has alt="". The task is blocked for screen-reader and keyboard users, but the audience is a minority, so high is at the upper edge and defensible only because the gallery is a core feature. The recommendation is sound and uses data the component already has.

**Fix note from the second check.** Smaller fix. (1) Add `[attr.aria-label]="'Photo by ' + cell.item.uploader.nickname + ', ' + (cell.item.createdDate | date:'d MMM y')"` to the thumbnail button, with DatePipe imported, and use the same string as the viewer image alt. (2) On the viewer host add role="dialog", aria-modal="true" and aria-label="Photo viewer". (3) In MediaViewerComponent, remember `document.activeElement` in the constructor (browser only), focus the Close button in afterNextRender, and restore focus in ngOnDestroy. @angular/cdk ^22 is already a dependency, so cdkTrapFocus is available if a real trap is wanted, but the three steps above already fix the main failures. The reduced-motion check is a one-line polish item. Keep it small. Add aria-label to the thumbnail button and reuse that string as the viewer image alt. Add role="dialog" aria-modal="true" aria-label to the viewer host and focus the Close button on open. Restore focus to the thumbnail on close. Skip cdkTrapFocus unless @angular/cdk is already a dependency. The reduced-motion check on the smooth scroll is a trivial add-on.

**Also reported as:** [F025](accessibility-and-keyboard-access.md#f032) [ux-insiden-gallery] Gallery tiles are unnamed buttons with empty alt, and the viewer image has no description (src/app/features/gallery/justified-grid/justified-grid.component.ts:33, src/app/features/gallery/justified-grid/justified-grid.component.ts:39); [F048](accessibility-and-keyboard-access.md#f032) [tracker-gallery] Gallery photo buttons have no accessible name and the viewer is not a real dialog (src/app/features/gallery/justified-grid/justified-grid.component.ts:33, src/app/features/gallery/justified-grid/justified-grid.component.ts:42); [F287](accessibility-and-keyboard-access.md#f032) [ux-insiden-gallery] Photo viewer is not a dialog: no role, focus management, loading state or navigation, and 36 px close target (src/app/features/gallery/media-viewer/media-viewer.component.ts:16, src/app/features/gallery/media-viewer/media-viewer.component.ts:23)

<details><summary>Evidence</summary>

```text
<button type="button" class="bg-muted block overflow-hidden rounded-lg" ...><img [src]="thumbnail(cell.item)" loading="lazy" alt="" ...>  and in the viewer `<img [src]="media().file?.url ?? '/image-not-found.png'" alt="" ...>`. axe /gallery: critical `button-name` x24 ('div:nth-child(1) > .bg-muted.block[type="button"]'); capture: viewer 'no dialog role', focus after Escape 'lands on an unnamed button'.
```

</details>

<a id="f054"></a>

#### F054 · Stop conveying selected/active state by colour alone: add aria-pressed, aria-current and aria-sort

**medium** · effort S · accessibility · accessibility

**Where:** `src/app/features/spotting/line-overview/fleet-summary/fleet-summary.component.ts:79`, `src/app/features/spotting/line-overview/fleet-summary/fleet-summary.component.ts:109`, `src/app/features/spotting/line-overview/line-overview.page.ts:89`, `src/app/features/gallery/year-slider/gallery-year-slider.component.ts:20`, `src/app/features/tracker/info-panel/tracker-info-panel.component.ts:186`, `src/app/features/tracker/info-panel/tracker-info-panel.component.ts:318`, `src/app/domain-ui/spotting-activity-heatmap/spotting-activity-heatmap.ts:132`, `src/app/features/spotting/line-overview/line-overview.page.ts:117`

**Problem.** The only places in the app that use aria-pressed are the vote buttons, home board and pin buttons. The fleet-status filter chips, the line pill nav, the gallery year slider, the heatmap year picker, the tracker panel's Overview/Table/Raw JSON switch and the table's sortable headers all show the current choice only through colour or a background tint, so screen-reader users cannot tell which filter is on, and colour-blind or low-vision users have only a tint to go by (WCAG 1.4.1, 4.1.2). The sort headers use '▲'/'▼' glyph text (read as 'black up-pointing triangle') with no aria-sort. The line status chips also carry the '% of fleet' only in a title attribute.

**Recommendation.** Add `[attr.aria-pressed]="active"` to toggle-style button groups (fleet chips, year pickers, view switch) and `[attr.aria-current]="line.id === lineId() ? 'page' : null"` to the line pill links and year slider. Put `[attr.aria-sort]="sortState()?.col === col ? (dir === 1 ? 'ascending' : 'descending') : 'none'"` on each <th> and mark the glyph aria-hidden. Optionally add a non-colour cue (check icon or underline) to the active chip; for the fleet chips put the percentage into the visible/aria text rather than title.

**Verification.** aria-pressed appears only in the vote, home board, pro-lines and toast files, and there are 4 aria-sort or aria-current hits in total. Fleet chips, line pills, year pickers and the tracker view switch show state only by class, and the chip percentage is only in a title.

<details><summary>Evidence</summary>

```text
[class]="activeStatus() === chip.key ? chip.activeClass : chip.inactiveClass"  (fleet chips),  [variant]="line.id === lineId() ? 'default' : 'outline'"  (line pills),  [variant]="view() === 'overview' ? 'default' : 'outline'"  (tracker view buttons),  [class.bg-muted]="activeYear() === yc.year"  (year slider)
```

</details>

<a id="f055"></a>

#### F055 · Fix text contrast on the destructive badge/button tint, the brand-orange links and small green text

**medium** · effort S · accessibility · accessibility

**Where:** `src/app/ui/badge/badge.ts:12`, `src/app/ui/button/button.ts:15`, `src/app/features/home/hero/home-hero.component.ts:191`, `src/app/features/home/pro/pro-official-widget.ts:105`, `src/app/features/home/refresh-control/home-refresh-control.component.ts:140`, `src/styles.css:276`

**Problem.** The shared destructive badge and destructive button variant put text-destructive on a 10% destructive tint at 12-14px, which is about 3.9:1 in light mode (needs 4.5:1), and axe reports it on /gdpr for every 'not adhered' badge. `text-brand` (#ee7104) is used for link text ('Open original' in the hero callout, the Pro official-widget link at text-xs) at about 2.9:1 on a white card. The home refresh control's 'Updated' confirmation is text-xs text-green-600, about 3.3:1. Dark mode passes axe (0 nodes), so the problem is light mode only. WCAG 1.4.3.

**Recommendation.** Darken the foreground, not the tint: in badge.ts/button.ts use `text-red-700 dark:text-red-300` (or add a `--destructive-foreground-on-tint` token at about oklch(0.5 0.22 27)) for the destructive variant; swap `text-brand` for `text-primary` (the blue passes at 4.6:1) or `text-orange-700` on text smaller than 18px; change the 'Updated' label to `text-green-700 dark:text-green-400`. Add a unit test that computes the contrast of each badge variant pair so tokens cannot drift.

**Verification.** badge.ts and button.ts destructive variants use text-destructive on a 10% tint, which I compute at about 4.0:1, below 4.5. text-brand #ee7104 on white is about 3.0:1, and text-green-600 is about 3.3:1. These are used at small sizes in the hero, the pro widget and the refresh control.

**Also reported as:** [F486](accessibility-and-keyboard-access.md#f055) [ux-rest] Destructive badge fails colour contrast in light mode (19 failing nodes on /gdpr, also the 404 status badge) (src/app/ui/badge/badge.ts:12, src/styles.css:279)

<details><summary>Evidence</summary>

```text
destructive: "bg-destructive/10 text-destructive dark:bg-destructive/20"  (axe /gdpr: `color-contrast` serious, 19 nodes, `summary > .bg-destructive/10 ... px-2`; /this-page-does-not-exist: 1 node). My calculation: --destructive oklch(0.577 0.245 27.325) on its own 10% tint is about 3.9:1; `--brand: #ee7104` as text on white is about 2.9:1.
```

</details>

<a id="f056"></a>

#### F056 · Toast pin and dismiss controls are invisible to keyboard and touch users, and toasts vanish quickly

**medium** · effort S · accessibility · accessibility

**Where:** `src/app/ui/toast/toast-content.component.ts:72`, `src/app/ui/toast/toast-content.component.ts:75`, `src/app/ui/toast/toast-content.component.ts:93`, `src/app/ui/toast/toast.service.ts:30`, `src/app/app.html:3`

**Problem.** The pin and dismiss buttons are opacity-0 until the pointer hovers the toast. Tabbing to them (they are focusable) shows nothing because there is no focus-within or focus-visible reveal, and on touch devices there is no hover at all, so a touch user can neither pause nor dismiss. The pin button is the only mechanism to extend a toast, so error toasts that carry long, important text disappear on a default timer with no accessible way to keep them (WCAG 2.2.1 Timing Adjustable, 2.4.7). They are 24px, which just meets 2.5.8 but sits half outside the toast at -top-3/-right-3.

**Recommendation.** Reveal on focus and on touch: `opacity-0 group-hover/toast:opacity-100 group-focus-within/toast:opacity-100 [@media(hover:none)]:opacity-100`. Give error toasts a longer or infinite duration in ToastService.show (for example `duration: type === 'error' ? 10_000 : undefined`) and pause the timer on focus as sonner does for hover. Keep the toaster's polite live region; also make sure the visual order (top-center) does not cover the sticky header's controls at 320px.

**Verification.** The pin and dismiss wrapper is opacity-0 with only group-hover/toast reveal, so keyboard focus shows nothing. Pin is the only way to extend a toast, and the service sets no duration. Touch browsers do emulate hover on tap, so the touch claim is slightly softer.

**Also reported as:** [F453](accessibility-and-keyboard-access.md#f056) [ui-system] Toast pin and dismiss controls are invisible on touch and on keyboard focus, and error toasts auto-dismiss (src/app/ui/toast/toast-content.component.ts:72, src/app/ui/toast/toast.service.ts:21)

<details><summary>Evidence</summary>

```text
class="absolute -top-3 -right-3 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/toast:opacity-100"  (contains the Pin and Dismiss buttons; the service passes no duration so every toast, including errors like 'Login failed. Firebase: Error (auth/requests-from-referer-http://localhost:4321/-are-blocked.)', uses sonner's default auto-dismiss)
```

</details>

<a id="f057"></a>

#### F057 · Hover-only tooltips hide vote breakdown and the inaccuracy warning from keyboard and touch users

**medium** · effort S · accessibility · accessibility

**Where:** `src/app/features/insiden/vote-button/vote-button.component.ts:72`, `src/app/features/insiden/vote-button/vote-button.component.ts:99`, `src/app/features/insiden/incident-card/incident-card.component.html:37`, `src/app/features/insiden/incident-card/incident-card.component.html:284`, `src/app/features/insiden/link-card/link-card.component.ts:244`

**Problem.** Five tooltips are always in the DOM and only revealed by group-hover: they cannot be reached by keyboard (no group-focus-within), cannot be seen on touch, and cannot be dismissed or hovered (WCAG 1.4.13). Because they are not display:none, screen readers read each one inline as stray text, so the incident warning is announced twice (the svg's aria-label and the tooltip text). The vote buttons are `[disabled]` when logged out with no tooltip, helper text or title explaining that login is required, and a disabled button is skipped by Tab, so keyboard and screen-reader users never learn voting exists. The vote group's aria-label sits on a role-less div.

**Recommendation.** Reuse the existing `app-info-popover` (which already handles hover, focus, tap and Escape) for the breakdown and warning, or make the tooltip `hidden group-hover:block group-focus-within:block` with `aria-describedby` from the trigger. For logged-out voting keep the buttons enabled and call auth.login() (or show a toast 'Log in to vote') instead of disabling, or set `aria-disabled="true"` plus a visible helper. Put role="group" on the vote wrapper.

**Verification.** vote-button.ts has an always-in-DOM role=tooltip span at opacity-0 revealed only by group-hover/vote. The vote buttons are [disabled] when logged out with no explanation, and the wrapper div has an aria-label but no role.

**Also reported as:** [F478](accessibility-and-keyboard-access.md#f057) [ux-insiden-gallery] Hover-only tooltips carry important information (inaccurate flag, pending link, vote breakdown) (src/app/features/insiden/incident-card/incident-card.component.html:17, src/app/features/insiden/incident-card/incident-card.component.html:268); [F551](accessibility-and-keyboard-access.md#f057) [insiden-ui] Hover-only tooltips hide the inaccurate-data warning, vote breakdown and pending state from touch and keyboard users (src/app/features/insiden/incident-card/incident-card.component.html:17-42, src/app/features/insiden/incident-card/incident-card.component.html:267-290)

<details><summary>Evidence</summary>

```text
<span role="tooltip" class="... pointer-events-none absolute -top-8 ... opacity-0 shadow-md transition-opacity group-hover/vote:opacity-100">{{ breakdown() }}</span>
```

</details>

<a id="f058"></a>

#### F058 · Announce async state: retry banners, loading skeletons and conditionally mounted live regions

**medium** · effort S · accessibility · accessibility

**Where:** `src/app/ui/retry-banner/retry-banner.component.ts:23`, `src/app/ui/skeleton/skeleton.ts:5`, `src/app/features/home/line-status/line-status-sheet.component.ts:142`, `src/app/features/home/refresh-control/home-refresh-control.component.ts:132`, `src/app/features/home/refresh-control/home-refresh-control.component.ts:125`

**Problem.** RetryBannerComponent, the failure state for almost every data load (home, profile, spotting, vehicle, forms), has no role=alert or role=status, so a failed load is silent for screen-reader users while ErrorBox (role=alert) is announced: two components for one purpose behave differently. Skeleton placeholders are bare animated divs with no aria-busy or status text, so a page that loads data shows nothing to assistive tech until it is complete (only the about page announces 'Loading...'). Live regions that are inserted together with their text (the line status help paragraph, the Updating/Updated spans in the refresh button) are unreliable because many screen readers only announce changes to a region that already exists in the DOM. The refresh button's accessible name 'Refresh page data now' also does not contain its visible text 'Refreshing in 22s' (WCAG 2.5.3).

**Recommendation.** Add `role="alert"` to the retry banner's message paragraph (keep the countdown outside the live region so it does not announce every second). Add a visually hidden `<span class="sr-only" role="status">Loading…</span>` inside HlmSkeleton hosts or set aria-busy on the loading container. Always render the live container and change only its text (`<p aria-live="polite">{{ statusHelp() }}</p>`), and for the refresh button use `aria-label="Refresh now, {{ secondsRemaining }} seconds until next refresh"` or drop the aria-label and let the visible text name it.

**Verification.** retry-banner.component.ts has no role=alert or status. HlmSkeleton is a bare animate-pulse host. The refresh button aria-label 'Refresh page data now' does not contain its visible countdown text. The role=status spans are conditionally inserted.

**Also reported as:** [F460](accessibility-and-keyboard-access.md#f058) [ui-system] Three different 'couldn't load' surfaces; the retry banner is not announced (src/app/ui/retry-banner/retry-banner.component.ts:23, src/app/ui/error-box/error-box.ts:16); [F469](accessibility-and-keyboard-access.md#f058) [ux-home] Unify the two error-state components and announce errors to assistive tech (src/app/ui/retry-banner/retry-banner.component.ts:25, src/app/ui/retry-banner/retry-banner.component.ts:29)

<details><summary>Evidence</summary>

```text
<div class="border-destructive/30 bg-destructive/5 flex flex-col ..."><p class="text-destructive text-sm">{{ message() }}</p> ...   and   @if (statusHelp(); as help) { <p ... data-testid="status-help" aria-live="polite">
```

</details>

<a id="f059"></a>

#### F059 · Add scroll-padding so sticky header and bottom bars do not obscure keyboard focus

**medium** · effort S · accessibility · accessibility

**Where:** `src/styles.css:234`, `src/app/shell/app-nav/app-nav.component.ts:105`, `src/app/features/home/home.page.ts:424`, `src/app/features/spotting/line-overview/line-overview.page.ts:109`

**Problem.** There are up to three stacked sticky or fixed layers (the 61px header, the line-overview toolbar at top-[61px], the home page's 44px+ bottom action bar), and the document defines no scroll-padding. When keyboard focus moves to an element near a viewport edge, the browser scrolls it only to the edge, leaving it fully hidden under the sticky header or the fixed bottom bar. That is a WCAG 2.2 AA failure (2.4.11 Focus Not Obscured, Minimum) in a pattern the app uses on its busiest pages. scroll-mt-24 is applied to a few anchor targets only.

**Recommendation.** Set a global value on the root in styles.css: `html { scroll-padding-top: 4.5rem; scroll-padding-bottom: 5rem; }` and raise the top value on the spotting pages that add the second sticky bar (`scroll-padding-top: 8rem` via a route-level class on the page host). Re-test the line-board skip-link target and tab traversal through the Pro board with the header visible.

**Verification.** There is no scroll-padding anywhere in src. Only scroll-mt-24 is used on some board anchors. The header is sticky at about 61px, the line-overview bar is sticky at top-[61px], and the home page has a fixed bottom bar, so focus can land under them.

<details><summary>Evidence</summary>

```text
host: { class: "sticky top-0 z-[45] block w-full border-b bg-background ..." }  (header about 61px);  home mobile bar: class="bg-card ... fixed inset-x-0 bottom-0 z-30 ... lg:hidden";  line-overview sticky bar `top-[61px]`. rg finds no `scroll-padding` anywhere in src/.
```

</details>

<a id="f062"></a>

#### F062 · Pressing Enter on a row's Approve/Reject button also opens the detail sheet for that row

**medium** · effort S · accessibility · console

**Where:** `src/app/features/console/insiden/pending/pending.component.html:64`, `src/app/features/console/insiden/links/links.component.html:132`, `src/app/features/console/insiden/pending/pending-row.component.ts:46`, `src/app/features/console/insiden/links/link-queue-row.component.html:153`

**Problem.** The row host listens for `keydown.enter` to open the editor. The inner buttons stop propagation of `click`, but the `keydown` event from a focused button still bubbles to the `<tr>`, so keyboard users who press Enter on Approve both trigger the mutation and open the detail sheet. The sheet then holds a row that has just been removed, and its Approve button can fire a second mutation that fails. The same happens for the links row's checkbox, chevron and action buttons. The row also has `tabindex=0` but no role or accessible name, so a screen reader reads the whole row as one stop.

**Recommendation.** Guard with $event.target === $event.currentTarget.

_Original suggestion (corrected by the verifier):_ Guard the handler: `(keydown.enter)="$event.target === $event.currentTarget && openDetail(row)"` (or `$event.stopPropagation()` in the buttons' `(keydown.enter)`). Better, put a real `<button>` or link in the first cell (the title/URL) that opens the sheet, and keep the row click as a mouse convenience only.

**Verification.** The pending row <tr> has (keydown.enter)=openDetail(row) and the inner buttons stop only the click. A keydown from a focused button bubbles to the row, so Enter opens the sheet; links row line 132 has the same pattern.

<details><summary>Evidence</summary>

```text
pending.component.html:60-64: [attr.tabindex]="0" ... (click)="openDetail(row)" (keydown.enter)="openDetail(row)"
pending-row: (click)="$event.stopPropagation(); approve.emit()"   // stops the click only
```

</details>

<a id="f067"></a>

#### F067 · Logo link has no accessible name at narrow widths and in the server HTML, and it goes to /spotting rather than Home

**medium** · effort S · accessibility · core-shell · partially confirmed · severity adjusted from high

**Where:** `src/app/shell/app-nav/app-nav.component.ts:115`, `src/app/shell/app-nav/app-nav.component.ts:116`, `src/app/shell/app-nav/app-nav.component.ts:141`

**Problem.** showFullBrand() is false in the server HTML, on every phone width and whenever the link row collapses, so the first focusable element on every page is a link whose only content is an aria-hidden SVG: screen readers announce 'link' with no name, and it fails WCAG 2.4.4 and 4.1.2. Separately, the brand link points to /spotting while the first nav entry is Home at '/', which is the live network board; users who tap the logo expecting the home page land on TranSPOT instead.

**Recommendation.** Add the aria-label. Treat the /spotting destination as a product question to ask the maintainer, not a defect.

_Original suggestion (corrected by the verifier):_ Add aria-label="MLPTF home" (or a visually hidden <span class="sr-only">Malaysia Land Public Transport Fans, home</span>) to the anchor, and point it at '/' (or document why TranSPOT is the brand destination). The same applies to the compact nav's brand button, which already sets an aria-label.

**Verification.** The logo anchor contains only an aria-hidden SVG, and the wordmark renders only when showFullBrand() is true, so it often has no accessible name. It links to /spotting, which may be deliberate branding. Medium is fairer than high.

**Also reported as:** [F161](accessibility-and-keyboard-access.md#f067) [ux-home] Point the logo at Home and give it an accessible name (src/app/shell/app-nav/app-nav.component.ts:115, src/app/shell/app-nav/app-nav.component.ts:141); [F174](accessibility-and-keyboard-access.md#f067) [ux-rest] Logo link has no accessible name and points to /spotting; nav label falls back to 'Menu' on Methodology, GDPR and 404 (src/app/shell/app-nav/app-nav.component.ts:115, src/app/shell/app-nav/app-nav.util.ts:36)

<details><summary>Evidence</summary>

```text
<a routerLink="/spotting" class="flex shrink-0 items-center gap-2">
  <svg viewBox="0 0 570.14 178.35" class="h-9 w-auto" aria-hidden="true">...</svg>
  @if (showFullBrand()) { <span [class]="wordmarkClass()">{{ GENERIC_TITLE }}</span> }
</a>
```

</details>

<a id="f068"></a>

#### F068 · Console and module dropdowns open on hover only, so keyboard users cannot reach the sub-links, and Escape is wired to the wrong element

**medium** · effort S · accessibility · core-shell

**Where:** `src/app/shell/app-nav/app-nav.component.ts:213`, `src/app/shell/app-nav/app-nav.component.ts:216`, `src/app/shell/compact-nav/compact-nav.component.ts:114`, `src/app/shell/app-nav/app-nav-module-menu.component.ts:53`, `src/app/shell/app-nav/app-nav-menu-state.ts:54`

**Problem.** The Console submenu (Spotting Queue, Incident Approval, Social Media Links) is opened only by mouseenter, and there is no focus or keydown handler on the Console link. A keyboard user can Tab to 'Console' and press Enter (landing on one page) but can never reach the other two destinations from the nav. The Escape handler is on the popup panel itself, which never holds focus, so Escape does nothing from the trigger. The hover-capable module menu has the same shape: its trigger lacks aria-haspopup, aria-controls and a role relationship to the panel, and hover-out closing with a 300 ms timer is hard for users with tremors. Admin-only, but admins are exactly the people operating the moderation queues.

**Recommendation.** Open the dropdown on focusin of the group as well as hover (or on ArrowDown/Enter/Space of the trigger), put (keydown.escape) on the group wrapper so it works from the trigger, add aria-haspopup="true" aria-expanded and aria-controls, and close on focusout leaving the group. Alternatively, switch to the CDK menu or a Spartan menu primitive so roving focus and Escape come for free. The compact nav duplicates the same code and should share the fix.

**Verification.** The console submenu renders only when hoverCapable() and consoleMenuOpen() are both true. Only mouseenter and mouseleave open and close it. The Escape handler sits on the popup, which never takes focus. The compact nav has the same hover-only logic.

<details><summary>Evidence</summary>

```text
@if (menu.hoverCapable() && menu.consoleMenuOpen()) {
  <div class="... absolute top-full right-0 z-30 ..." (keydown.escape)="menu.consoleMenuOpen.set(false)">
// compact-nav: (mouseenter)="onConsoleMenuEnter()" (mouseleave)="onConsoleMenuLeave()"
```

</details>

<a id="f086"></a>

#### F086 · Icon-only controls in the profile and vote UI lack accessible names, and the vote group and tooltip are not exposed properly

**medium** · effort S · accessibility · gap-2

**Where:** `src/app/features/profile/user-card/user-card.component.ts:80`, `src/app/features/profile/user-card/user-card.component.ts:70`, `src/app/features/profile/my-spottings/my-spottings.component.ts:290`, `src/app/features/insiden/vote-button/vote-button.component.ts:72`, `src/app/features/insiden/vote-button/vote-button.component.ts:99`

**Problem.** The nickname editor's save and cancel buttons are glyphs with no aria-label, the input has only a placeholder (no label) and cannot be submitted with Enter. The delete button is an emoji with only a title. The vote wrapper uses aria-label on a plain div with no role, which assistive tech ignores, and the breakdown tooltip appears only on mouse hover (invisible on touch and keyboard) while also being read inline by screen readers because opacity-0 does not hide it. The nickname save has no validation (empty or very long values).

**Recommendation.** Add aria-label="Save nickname" / "Cancel", a visually hidden label for the input, an (keydown.enter) handler and basic validation (trim, 1 to 30 chars). Give the vote wrapper role="group", make the breakdown a visible `title`/popover reachable by focus and tap or put it in aria-describedby, and add aria-label="Delete spotting" to the trash button.

**Verification.** user-card save and cancel are glyph buttons with no aria-label, and the nickname input has only a placeholder. The vote wrapper puts aria-label on a div with no role, and the tooltip is opacity-0 and hover-only.

**Also reported as:** [F418](accessibility-and-keyboard-access.md#f086) [profile-about-misc] Name the icon-only and custom controls on the profile (delete, nickname save/cancel, privacy checkbox, notes tooltip) (src/app/features/profile/my-spottings/my-spottings.component.ts:155-164, src/app/features/profile/user-card/user-card.component.ts:73-83)

<details><summary>Evidence</summary>

```text
<button hlmBtn size="icon-sm" variant="ghost" [disabled]="isSaving()" (click)="save()">  ✓  </button>
<button hlmBtn size="icon-sm" variant="ghost" (click)="cancel()">✕</button>
<input hlmInput [(ngModel)]="nicknameDraft" placeholder="Enter your desired nickname" class="flex-1" />
<div class="group/vote flex items-center gap-0.5" [attr.aria-label]="ariaLabel()">
<span role="tooltip" class="... opacity-0 ... group-hover/vote:opacity-100">
```

</details>

<a id="f093"></a>

#### F093 · Enlarge the board's small touch targets on phones

**medium** · effort S · accessibility · home-data · partially confirmed

**Where:** `src/app/features/home/line-pulse/line-pulse-row.component.ts:118`, `src/app/features/home/line-pulse/network-board.component.ts:128`, `src/app/features/home/line-pulse/network-board.component.ts:168`, `src/app/features/home/refresh-control/home-refresh-control.component.ts:123`, `.omo/evidence/audit-2026-10-21/agents/home-data/cdp/M-top.png`

**Problem.** The primary interaction on the page, expanding a line, is a 20 px tall strip; the operator, sort and view chips are 24 px high packed with 2 px gaps; several info buttons are 16 px. WCAG 2.5.8 requires at least 24 px (or spacing) and the 20 px and 16 px targets fail it; for a thumb-driven audience even 24 to 28 px invites mis-taps, especially next to a destructive-looking Report button. The page already shows the right size elsewhere (min-h-11 on the quiet toggle and on pulse links).

**Recommendation.** Prioritise the 20 px row toggle (py-2/min-h-11) and the 16 px info triggers; treat 24-28 px chips as polish.

_Original suggestion (corrected by the verifier):_ Give the row toggle py-2 or min-h-11 (the whole title strip is one button already), give chips min-h-9 or a ::before hit-area (before:absolute before:-inset-1.5), and raise icon buttons to 40 to 44 px via padding with the visual size unchanged. Verify with the same Chrome measurement script at 360 and 390 px.

**Verification.** line-row-toggle (line-pulse-row:117) has no min-height and sits in an items-center row, so a ~20 px strip is the primary expand target; the 16 px info buttons are also below 2.5.8's 24 px. The 24-28 px chips and buttons meet WCAG 2.5.8 AA, so the compliance claim is overstated for those.

<details><summary>Evidence</summary>

```text
Measured CSS px at 390 wide: line-row-toggle 141x20, family chips 31-69 x 24 with a 2 px gap, sort and view buttons 24 high, line-row-pin 28x28, line-row-report 68x28, refresh control 140x28, info triggers 16x16 (also 'What is In service?' 134x22).
```

</details>

<a id="f095"></a>

#### F095 · The page's only h1 sits inside an info-popover button whose aria-label replaces its text

**medium** · effort S · accessibility · home-ui · partially confirmed · severity adjusted from high

**Where:** `src/app/features/home/hero/home-hero.component.ts:138`, `src/app/features/home/hero/home-hero.component.ts:155`, `src/app/ui/info-popover/info-popover.ts:155`

**Problem.** InfoPopover renders its projected content inside a <button> that has an aria-label. The accessible name of that button is therefore the static string "What is Lines running normally?", and the live headline ("All 14 lines running normally") is not part of the name. ARIA makes the children of a button presentational, and a heading is not valid phrasing content inside a button, so screen readers such as NVDA and VoiceOver are expected to drop the heading role and ignore the aria-live region. The result is that the single most important sentence on the page, the network's status, is likely neither in the heading list nor announced when it changes, and the page effectively has no h1. The same wrapper is used for the two tile labels and the sparkline caption, which is harmless for plain labels but wrong for a heading.

**Recommendation.** Move the h1 out of the popover button (sibling of an icon-only trigger) as proposed, and verify with a real screen reader; the ariaSnapshot spec is a good guard.

_Original suggestion (corrected by the verifier):_ Make the heading a sibling of the trigger. Use `<div class="flex items-start gap-1.5 min-w-0"><h1 aria-live="polite" aria-atomic="true" ...>{{ headline }}</h1><app-info-popover label="Lines running normally" [content]=... [link]=... triggerClasses="cursor-help">` with an icon-only trigger (showIcon true, empty projected content and an sr-only label already provided by aria-label). Check with `locator.ariaSnapshot()` that the heading is a direct child of the region and add that assertion to home-hero.component.spec.ts.

**Verification.** Real: info-popover.ts wraps projected content in a button with aria-label 'What is X?', and the h1 is projected inside it (home-hero:138-155). But the Chrome snapshot in the evidence still lists the heading, and the claim that screen readers drop it is an expectation not tested with a real AT.

<details><summary>Evidence</summary>

```text
home-hero.component.ts:138  <app-info-popover label="Lines running normally" ... iconPosition="end" ...>
home-hero.component.ts:155  <h1 ... aria-live="polite" aria-atomic="true" data-testid="hero-headline">
info-popover.ts:160  <button #trigger type="button" ... [attr.aria-label]="'What is ' + label() + '?'"
Chrome accessibility snapshot of the hero: - button "What is Lines running normally?": - heading "All 14 lines running normally" [level=1]
```

</details>

<a id="f102"></a>

#### F102 · The line-status 'radiogroup' has no arrow-key support, and the report chooser keeps a stale filter and loses focus between steps

**medium** · effort S · accessibility · home-ui

**Where:** `src/app/features/home/line-status/line-status-sheet.component.ts:121`, `src/app/features/home/line-status/line-status-sheet.component.ts:125`, `src/app/features/home/report/report-chooser.component.ts:301`, `src/app/features/home/report/report-chooser.component.ts:154`, `src/app/features/home/report/report-chooser.component.ts:231`

**Problem.** Seven buttons declare role=radio but behave as seven separate tab stops: arrow keys do nothing and none is the single tabbable member of the group, which is not the radio pattern and misleads screen reader users who press the arrow keys as announced. In the chooser, the line filter text survives close and reopen, so a rider who searched 'kj' last time opens the picker to a filtered list or 'No line matches', and picks a line from stale results. When a tile is pressed the tiles are replaced by the picker in place; the focused tile is destroyed, so focus falls back to <body> and a screen reader user is not told the step changed (the heading text changes, but it is not announced and not focused).

**Recommendation.** Implement the roving pattern on the status chips (tabindex 0 on the checked or first chip, -1 on the rest, ArrowRight/ArrowLeft/Home/End moving selection and focus, as home.page.ts already does for the feed tabs), or use native `<input type="radio">` visually styled as chips. In the chooser reset `query` in an effect on `chooser.isOpen()` and on `backToTiles()`, and after a step change focus the search input (or the h2 with tabindex -1) with `afterNextRender` plus `viewChild`.

**Verification.** line-status sheet uses role=radio buttons with plain click and no roving tabindex or arrow keys; report-chooser `query` signal is component-local and never reset when the sheet closes, and the component persists across opens because it is projected.

**Also reported as:** [F094](accessibility-and-keyboard-access.md#f102) [home-data] Replace the hand-built radio chips in the line-status sheet with a real radio group (src/app/features/home/line-status/line-status-sheet.component.ts:121, src/app/features/home/line-status/line-status-sheet.component.ts:125); [F473](accessibility-and-keyboard-access.md#f102) [ux-home] Make the report sheet's status chips a proper radio group with clearer grouping (src/app/features/home/line-status/line-status-sheet.component.ts:36, src/app/features/home/line-status/line-status-sheet.component.ts:125); [F298](accessibility-and-keyboard-access.md#f102) [accessibility] Radio-group, popover and aria-label misuses: wrong role semantics on custom widgets (src/app/features/home/line-status/line-status-sheet.component.ts:121, src/app/features/home/line-status/line-status-sheet.component.ts:125)

<details><summary>Evidence</summary>

```text
line-status-sheet.component.ts:121  <div ... role="radiogroup" aria-label="Line passenger status"> @for ... <button type="button" role="radio" [attr.aria-checked]="status() === option.value" ... (click)="status.set(option.value)">
report-chooser.component.ts:301  protected readonly query = signal("");   (never reset by open(), setOpen(false) or backToTiles())
```

</details>

<a id="f109"></a>

#### F109 · Make the chronology editor keyboard accessible and give every control a name

**medium** · effort S · accessibility · insiden-data

**Where:** `src/app/features/insiden/incident-form/incident-form.component.html:211`, `src/app/features/insiden/incident-form/incident-form.component.html:301`, `src/app/features/insiden/incident-form/incident-form.component.html:312`, `src/app/features/insiden/incident-form/incident-form.component.html:372`, `src/app/features/insiden/incident-form/incident-form.component.html:236`

**Problem.** The collapse header is a div with a click handler: it has aria-expanded but no role, no tabindex and no key handling, so keyboard and screen reader users cannot expand or collapse an entry. The indicator select, datetime, source URL and content fields have only placeholders (the select and datetime have nothing), so a screen reader announces unnamed controls. The Move up, Move down and Remove buttons say the same thing for every row, with no entry number. The indicator choice is also colour-only: the dot is aria-hidden and its meaning (Green/Red/Blue/Gray) is only in the option text. Remove entry deletes typed content with no confirmation or undo. Per-field validation messages are not linked via aria-describedby or announced.

**Recommendation.** Make the header a real `<button type="button" [attr.aria-expanded] [attr.aria-controls]>` that contains the title text, or add role="button" tabindex="0" with Enter and Space handlers. Add aria-label values such as `'Entry ' + (i+1) + ' indicator'`, `'Entry ' + (i+1) + ' time'`, and make the move and remove labels include the number ('Move entry 2 up'). Show the indicator name in text beside the dot. Remove with an Undo toast rather than a modal. Render field errors with an id and role="alert" or aria-live="polite" and reference them with aria-describedby.

**Verification.** The collapse header is a div with (click) and aria-expanded but no role, tabindex or key handler. The indicator select and datetime input have no label, and the move buttons use the generic 'Move up' and 'Move down' labels. The existing expand-all button gives keyboard users a partial workaround.

<details><summary>Evidence</summary>

```text
<div class="flex cursor-pointer items-center justify-between gap-2"
  [attr.aria-expanded]="!chronology.collapsed"
  (click)="toggleChronologyCollapsed(chronology.key)">
...
<select hlmSelect ... (change)="chronology.indicator = $any($event.target).value">
```

</details>

<a id="f152"></a>

#### F152 · Layer checklist controls lack labels and keyboard/touch equivalents

**medium** · effort S · accessibility · tracker-gallery

**Where:** `src/app/features/tracker/status-card/layer-checklist.component.ts:109`, `src/app/features/tracker/status-card/layer-checklist.component.ts:334`, `src/app/features/tracker/status-card/countdown-ring.component.ts:36`, `src/app/features/tracker/status-card/layer-checklist.component.ts:207`

**Problem.** The refresh-interval `<select>` has no label or `aria-label`, so a screen reader announces an unnamed combo box with options like `10s`. The countdown tooltip (the only place that shows seconds remaining) opens on mouse hover only, so keyboard, touch and screen-reader users never see when data will refresh or that a feed is stale. The stops spinner is an `svg` with `aria-label` but no `role="img"`, so the label is not exposed. The `ⓘ` buttons are about 14 px wide, far below a comfortable touch target.

**Recommendation.** Add `aria-label="Refresh interval for all realtime feeds"` to the select. Make the ring a focusable `button` (or add `tabindex="0"` with `(focus)/(blur)`) so the tooltip also appears on focus, and expose `role="status"` text such as `KTMB refreshed 12 s ago` visually-hidden. Give the spinner `role="img"` or use `role="status"` with `sr-only` text. Wrap each `ⓘ` in a `size-9` hit area using padding, not a larger glyph.

**Verification.** The refresh select has no label, the countdown tooltip is mouseenter/mouseleave only, and the loading svg has aria-label without role. Real a11y gaps, contained.

<details><summary>Evidence</summary>

```text
<select class="border-input bg-background rounded-md border px-1.5 py-1 text-xs font-normal" (click)="$event.stopPropagation()" ...>
...
<svg ... aria-label="Loading">
...
(mouseenter)="onHoverStart($event)" (mouseleave)="hovering.set(false)"
...
title="Feed info"
```

</details>

<a id="f157"></a>

#### F157 · Profile privacy checkbox has no accessible name and its <label for> points at a non-labelable element

**medium** · effort S · accessibility · ui-system

**Where:** `src/app/features/profile/user-card/user-card.component.ts:179`, `src/app/features/profile/user-card/user-card.component.ts:187`, `src/app/ui/checkbox/checkbox.ts:34`

**Problem.** The id lands on the display:contents <hlm-checkbox> host, which is not a labelable element, so the label is not associated: clicking the label does nothing and the inner checkbox button has no accessible name (HlmCheckbox's own doc comment explains that only a bound aria-label reaches the button, but this call site does not pass one). This is the control that decides whether a user's spotting history is public, so an unnamed control is a privacy-relevant accessibility bug.

**Recommendation.** Simplest fix is passing aria-label on the hlm-checkbox; forwarding id is optional.

_Original suggestion (corrected by the verifier):_ Pass aria-label="Share historical spotting data" (the supported input) or wrap the checkbox in the label like the other call sites. Better, make HlmCheckbox accept an id input and forward it to the inner brn-checkbox so for/id works, and add a spec that every <hlm-checkbox> call site yields a named role=checkbox.

**Verification.** user-card.component.ts:179-187 has label for=privacy-toggle but the id sits on the contents-display hlm-checkbox host, with no aria-label passed. The inner brn-checkbox gets only the ariaLabel input, so the control is unnamed.

<details><summary>Evidence</summary>

```text
<label for="privacy-toggle" class="cursor-pointer ...">Share Historical Spotting Data</label>
...
<hlm-checkbox id="privacy-toggle" [checked]="_spottingDataPublicDraft()" ... />
(HlmCheckbox host: { class: "contents" }, id is not forwarded to the inner <button role=checkbox>)
```

</details>

<a id="f159"></a>

#### F159 · Raise the shared focus ring above 3:1 contrast

**medium** · effort S · accessibility · ux-home

**Where:** `src/app/ui/button/button.ts:7`, `src/app/features/home/line-pulse/network-board.component.ts:128`, `src/app/features/home/line-pulse/network-board.component.ts:168`, `src/app/features/home/line-pulse/network-board.component.ts:189`, `src/app/features/home/home.page.ts:204`, `src/styles.css:271`

**Problem.** WCAG 1.4.11 requires a focus indicator of at least 3:1 against the adjacent colour. Buttons partly escape because focus-visible also turns the border to full-strength ring colour, but the segmented board controls, the Today/Last week tabs, the row expand toggles and the h1 popover trigger rely on the 50 percent ring alone, which measures about 2.1:1 in both themes. These are the controls a keyboard user uses most on Home.

**Recommendation.** Use the full ring colour for the visible indicator: replace `focus-visible:ring-ring/50` with `focus-visible:ring-ring` (and keep ring-offset-2 so it separates from the fill), or define `--focus-ring` at about 4.5:1 per theme in styles.css and reference it everywhere. A single `@utility focus-ring` in styles.css would remove the 20-plus copies of the long class string.

**Verification.** focus-visible:ring-ring/50 is used on many controls (board buttons, row toggles and others), and the ring at 50% alpha is plausibly under 3:1. hlmBtn also changes the border to full ring colour, which softens its case.

<details><summary>Evidence</summary>

```text
focus-visible:border-ring focus-visible:ring-ring/50 ... focus-visible:ring-3   // hlmBtn
class="focus-visible:ring-ring/50 cursor-pointer rounded-md px-2 py-1 text-xs font-medium outline-none focus-visible:ring-2"   // board filter/sort/view segmented buttons, feed tabs, row toggles
Computed: --ring oklch(0.55 0.19 255) is 4.8:1 on the page background, but ring at 50% alpha is 2.1:1 (light) and 2.07:1 (dark).
```

</details>

<a id="f163"></a>

#### F163 · Headline status text fails contrast in light mode at phone size

**medium** · effort S · accessibility · ux-home

**Where:** `src/app/features/home/hero/home-hero.component.ts:156`, `src/app/features/home/hero/home-hero.component.ts:404`, `src/app/features/home/hero/home-hero.component.ts:406`, `src/app/features/home/refresh-control/home-refresh-control.component.ts:157`, `.omo/evidence/audit-2026-10-21/routes/home__mobile__light__viewport.png`

**Problem.** The h1 is the single most important status string on the site and is coloured by tone. At 20 px and weight 600 it is not 'large text' for WCAG (needs 24 px, or 18.66 px at weight 700), so it needs 4.5:1; green and orange tones reach only about 3.2 and 3.6 on a phone in light mode. Dark mode is fine. Note the text itself ('running normally') also carries the meaning, so this is legibility rather than colour-only information.

**Recommendation.** Use darker shades for light mode text: `text-green-700 dark:text-green-400`, `text-orange-700`, `text-red-700` (each at least 5:1), and keep the 500-level colours for the top hairline. Better, define semantic tokens (`--status-ok/-warn/-bad` per theme in styles.css) and use them for hero, badges and charts so one change fixes all. Also add `text-left` to the h1 trigger: the button wrapper centres the wrapped headline in the screenshot.

**Verification.** home-hero.component.ts:404-406 uses text-green-600 and text-orange-600 for the 20px semibold h1 on a white card, and the screenshot shows the bright green. These are below 4.5:1 and not large text; the separate light --brand issue in MISTAKES.md is a different token.

<details><summary>Evidence</summary>

```text
class="text-xl font-semibold tracking-tight sm:text-2xl"
return "text-green-600 dark:text-green-400";   // and text-orange-600 for degraded
Computed contrast on the white card: green-600 3.2:1, orange-600 3.6:1, red-600 4.8:1; the 12px 'Updated' confirmation also uses text-green-600.
```

</details>

<a id="f170"></a>

#### F170 · Icon-only controls use bare glyphs with tiny hit areas and missing names (ⓘ, ✓, ✕, 🗑)

**medium** · effort S · accessibility · ux-rest

**Where:** `src/app/features/tracker/status-card/layer-checklist.component.ts:207`, `src/app/features/profile/user-card/user-card.component.ts:80`, `src/app/features/profile/user-card/user-card.component.ts:82`, `src/app/features/profile/my-spottings/my-spottings.component.ts:161`, `src/app/ui/button/button.ts:24`

**Problem.** Fifteen-plus info buttons on the tracker are unpadded text glyphs of roughly 16 px, on a screen meant for thumbs, and the audit measured 1 tracker tap target under 24 px and 3 under 44 px. On the profile, the nickname save/cancel and the spotting delete button have no aria-label (the delete one only has a tooltip title, which touch and screen-reader users do not get), and rely on emoji or glyphs that render differently per OS. Destructive delete next to a status badge is hard to hit accurately.

**Recommendation.** Replace glyphs with the app's SVG icons inside a button with at least `size-9` (36 px) and, on coarse pointers, `min-h-11 min-w-11` via padding. Add aria-label='Save nickname', 'Cancel editing', 'Delete spotting entry', and keep the existing per-row aria-labels on the ⓘ buttons. Add a unit test asserting each icon-only button has an accessible name.

**Verification.** layer-checklist ⓘ buttons are bare text glyphs, user-card save/cancel use ✓/✕ with no aria-label, my-spottings delete is title-only with an emoji, and button.ts icon-sm is size-7. The ⓘ buttons do already carry an aria-label, which the finding acknowledges.

<details><summary>Evidence</summary>

```text
The ⓘ buttons have only `class="text-muted-foreground hover:text-foreground"`; `<button hlmBtn size="icon-sm" variant="ghost" (click)="cancel()">✕</button>`; delete is `title="Delete"` containing `🗑`; icon-sm is `size-7` (28 px).
```

</details>

<a id="f176"></a>

#### F176 · Mobile line overview has no h1 and the line title is an unlabelled dropdown button

**medium** · effort S · accessibility · ux-spotting

**Where:** `src/app/features/spotting/line-overview/line-overview.page.ts:119`, `src/app/features/spotting/line-overview/line-switcher/line-switcher.component.ts:16`, `.omo/evidence/audit-2026-10-21/interactions/spotting__line-4-loaded.png`

**Problem.** The only h1 lives inside a display:none wrapper below the sm breakpoint, and the mobile replacement is a plain button, so phone and screen-reader users get no page heading. The switcher button also lacks aria-haspopup/aria-expanded, so it does not announce that it opens a list.

**Recommendation.** Render one h1 outside the hidden wrapper (visually-hidden on mobile is enough: <h1 class="sr-only sm:not-sr-only ...">) and add aria-haspopup="listbox" and [attr.aria-expanded]="_isOpen()" to the switcher button.

**Verification.** The only h1 is in a hidden sm:flex wrapper; the mobile switcher is a span in a button without aria-haspopup or aria-expanded.

<details><summary>Evidence</summary>

```text
<div class="hidden min-w-0 flex-1 flex-wrap items-center gap-3 sm:flex"> ... <h1 class="text-xl font-semibold">{{ line.displayName }}</h1>  // switcher: <span class="text-xl font-semibold">{{ line.displayName }}</span> inside a <button>. axe on /spotting/4: page-has-heading-one.
```

</details>

<a id="f177"></a>

#### F177 · Mobile line switcher closes on blur, breaking keyboard use, and has no Escape or outside-tap handling

**medium** · effort S · accessibility · ux-spotting

**Where:** `src/app/features/spotting/line-overview/line-switcher/line-switcher.component.ts:20`, `src/app/features/spotting/line-overview/line-switcher/line-switcher.component.ts:65`, `.omo/evidence/audit-2026-10-21/interactions/spotting__line-picker-open.png`

**Problem.** Tabbing from the trigger to the first option blurs the trigger, so the list closes 100 ms later and the focused option is destroyed. Keyboard users cannot pick a line. On iOS Safari, tapping a button does not focus it, so blur never fires and the open list stays until the trigger is tapped again. There is no Escape handler. Every row in the list also carries an identical green "Active" badge, which adds noise without information (see the screenshot).

**Recommendation.** Close on focusout only when the new focus target is outside the host (check relatedTarget/contains), on Escape, and on a document pointerdown outside. Better, reuse the existing Brain popover/select primitive instead of hand-rolling. Show the status badge in the list only when the status is not ACTIVE.

**Verification.** Switcher uses (blur) with a 100ms setTimeout close and has no Escape or outside handler. Tabbing to an option closes the list.

**Also reported as:** [F052](accessibility-and-keyboard-access.md#f177) [accessibility] Fix the mobile line switcher: it closes itself before keyboard or screen-reader focus can reach an option (src/app/features/spotting/line-overview/line-switcher/line-switcher.component.ts:17, src/app/features/spotting/line-overview/line-switcher/line-switcher.component.ts:20); [F267](accessibility-and-keyboard-access.md#f177) [spotting] The mobile line switcher and other custom widgets lack ARIA semantics and keyboard support (src/app/features/spotting/line-overview/line-switcher/line-switcher.component.ts:19, src/app/features/spotting/line-overview/line-switcher/line-switcher.component.ts:67)

<details><summary>Evidence</summary>

```text
(blur)="_onBlur()"  ...  setTimeout(() => this._isOpen.set(false), 100);
```

</details>

<a id="f029"></a>

#### F029 · Make HlmSheet a real modal dialog: role, name, inert when closed, focus capture and restore

**medium** · effort M · accessibility · accessibility · second check set severity high → medium

**Where:** `src/app/ui/sheet/sheet.ts:37`, `src/app/ui/sheet/sheet.ts:47`, `src/app/ui/sheet/sheet.ts:69`, `src/app/shell/app-nav/app-nav.component.ts:257`, `src/app/features/home/line-status/line-status-sheet.component.ts:121`, `src/app/features/tracker/info-panel/tracker-info-panel.component.ts:94`

**Problem.** Every sheet in the app (account panel, mobile module menu, line-status report, link submit, spotting report, tracker info panel) has no role=dialog, no aria-modal and no accessible name, so a screen reader is not told a modal opened. Once opened, the panel is never removed: closed sheets are only translated off-screen (not invisible, not inert), so their buttons and form fields stay in the Tab order and the accessibility tree behind the page. CDK's cdkTrapFocusAutoCapture only captures at directive init, so a second open does not move focus into the panel, and focus is only restored on directive destroy, which never happens, so closing never returns focus to the trigger (matches the captured Escape behaviour). The page behind the open sheet is not inert either, so a screen-reader virtual cursor can leave the dialog. This breaks WCAG 2.4.3, 4.1.2 and 1.3.1 for the app's main write flows.

**Recommendation.** In HlmSheet: add role="dialog" aria-modal="true" and an `ariaLabel`/`labelledBy` input to the panel div (consumers already render an h2 in hlmSheetHeader, so give it an id). Bind `[attr.inert]="open() ? null : ''"` on the panel so a closed sheet leaves the Tab order and AX tree (this also removes the need for `invisible` on the full variant). Capture `document.activeElement` when open() flips true inside the existing effect (or afterRenderEffect), and call `.focus()` on it when open() flips false; focus the first focusable on every open rather than relying on cdkTrapFocusAutoCapture. Alternatively replace the panel with a native <dialog> opened via showModal(), which gives inert background, Escape and focus restoration for free. Add a sheet.spec case for 'second open focuses the panel' and 'close restores focus'.

**Verification.** sheet.ts panel has cdkTrapFocus but no role, aria-modal or name. Closed state is only translate-y-full or translate-x-full (full uses invisible), and the panel is never destroyed after _everOpened, so closed controls stay tabbable and CDK focus-restore never runs.

**Second check (high-severity pass).** code review: partially (medium). Most of it holds. sheet.ts renders the panel div with no role, aria-modal or accessible name, and a grep of the app finds no `role="dialog"`, `aria-modal` or `inert` anywhere. Closed right and bottom sheets are only translated off-screen, with no `invisible` or `inert`, so their controls stay tabbable and in the accessibility tree once the sheet has been opened once. Only the `full` variant uses `invisible`. HlmSheet never restores focus to the trigger: CdkTrapFocus restores it only in ngOnDestroy, which never runs while the sheet stays mounted. One claim is refuted. In the installed CDK 22.0.0, CdkTrapFocus.ngOnChanges (_a11y-module-chunk.mjs:403-408) re-runs _captureFocus when `autoCapture` flips to true after the first change. So a second open does move focus into the panel, and the claim that capture happens only at init is wrong. Keyboard users can still open, use and Escape-close the sheets, so this is a semantics and focus-return problem rather than a blocker. impact review: partially (medium). The sheet template has `cdkTrapFocus` but no role=dialog, aria-modal or accessible name, so a screen reader is not told a modal opened. Closed bottom and right sheets are only translated off-screen, so they stay in the Tab order and accessibility tree. That is a real defect and breaks the main write flows for keyboard and screen-reader users. The claim that `cdkTrapFocusAutoCapture` fails on a second open is overstated: the input is bound to `open()`, so CDK's focus trap is likely to re-capture when it flips true. Restoring focus on close is genuinely missing. The affected audience is small, so medium fits better than high.

**Fix note from the second check.** Drop the 'second open does not capture focus' point and its proposed spec. Keep three changes: add `role="dialog" aria-modal="true"` plus an aria-labelledby or aria-label input, add `[attr.inert]="open() ? null : ''"` on the panel, and in the existing effect save document.activeElement on open and focus() it on close. Add `role="dialog" aria-modal="true"` and an aria-label input to the panel. Add `[attr.inert]="open() ? null : ''"`, which fixes the closed-sheet tab stops. Record `document.activeElement` when open() turns true and refocus it when it turns false. Skip the native <dialog> rewrite.

**Also reported as:** [F050](accessibility-and-keyboard-access.md#f029) [ux-home] Make hlm-sheet a real modal dialog: roles, inert when closed, and focus restoration (src/app/ui/sheet/sheet.ts:40, src/app/ui/sheet/sheet.ts:48); [F063](accessibility-and-keyboard-access.md#f029) [console] HlmSheet leaves closed side panels focusable off-screen and exposes no dialog semantics (src/app/ui/sheet/sheet.ts:48, src/app/ui/sheet/sheet.ts:85); [F104](accessibility-and-keyboard-access.md#f029) [home-ui] Closed sheets stay in the tab order and the accessibility tree, and the panel has no dialog semantics (lead for the ui/ reviewer) (src/app/ui/sheet/sheet.ts:40, src/app/ui/sheet/sheet.ts:48); [F239](accessibility-and-keyboard-access.md#f029) [insiden-ui] The slide-in sheet stays tabbable after closing, has no dialog role, and does not return focus (affects the link and incident sheets) (src/app/ui/sheet/sheet.ts:40-55, src/app/ui/sheet/sheet.ts:85); [F280](accessibility-and-keyboard-access.md#f029) [ui-system] Closed sheets keep a live focus trap off-screen, never restore focus, and have no dialog semantics (src/app/ui/sheet/sheet.ts:40, src/app/ui/sheet/sheet.ts:47)

<details><summary>Evidence</summary>

```text
<div cdkTrapFocus [cdkTrapFocusAutoCapture]="open()" class="bg-popover ... fixed z-50 flex flex-col shadow-lg transition-transform" [class]="_panelClass()">  ...  `translate-y-full` / `translate-x-full` for the closed state. Interaction capture: the bottom line-status sheet 'has no dialog role' and focus after Escape lands on a Log in button, not the Report trigger; after Escape on the mobile menu the sheet's Close button is still focused.
```

</details>

<a id="f031"></a>

#### F031 · Rework the spotting activity heatmap: 365 unnamed tab stops with no focus ring and 19px targets

**medium** · effort M · accessibility · accessibility · second check set severity high → medium

**Where:** `src/app/domain-ui/spotting-activity-heatmap/spotting-activity-heatmap.ts:174`, `src/app/domain-ui/spotting-activity-heatmap/spotting-activity-heatmap.ts:185`, `src/app/domain-ui/spotting-activity-heatmap/spotting-activity-heatmap.ts:132`

**Problem.** Each day of the year is a focusable div (about 365 per heatmap, on the vehicle page and the profile) with no role, no accessible name and outline-none, so a keyboard user must Tab through a year of silent, invisible stops, and a screen reader announces nothing for each. The only feedback is a tooltip that opens on focus, which is not tied to the cell with aria-describedby, and is absent on touch. The cells are 19x19 px with a 4px gap, so adjacent centres are 23px apart, failing WCAG 2.5.8 (the spacing exception needs 24px). The year picker buttons convey the selected year by colour only, and the 'today' ring pulses with animate-pulse and no motion-reduce guard.

**Recommendation.** Treat the heatmap as one widget: render it as role="grid" (or a table) with a single tab stop and roving tabindex plus arrow-key navigation, give each cell an aria-label such as '12 Mar 2026: 3 spottings', and put `focus-visible:ring-2 ring-ring` on the focused cell. Keep a visually hidden summary table or the existing caption (funCaption) for screen readers, and set aria-hidden on the decorative grid if you prefer. Enlarge the touch hit area with a transparent 24px pseudo-element or make the compact grid minmax(24px,1fr). Add aria-pressed to year buttons and `motion-safe:animate-pulse` to the today ring.

**Verification.** Heatmap cells are <div tabindex=0> with outline-none, no role or label, and tooltip-on-focus only. About 365 silent, invisible tab stops per heatmap is a real keyboard problem.

**Second check (high-severity pass).** code review: holds (medium). Each cell is `<div tabindex="0" class="aspect-square rounded-sm outline-none">` with no role, no name and no aria-describedby. It opens the tooltip on focus, and app-spotting-count-tooltip has no role or aria attributes. The padding days outside the year are also focusable, because tabindex is set before the `day.inYear` check. That gives roughly 365 or more silent, invisible tab stops per heatmap. Cell size comes from `minmax(18px,1fr)` in the compact layout and `minmax(12px,1fr)` in the classic layout. With a 4px gap, the pitch is therefore under 24px in both layouts (about 22px compact, as little as 16px classic), which fails WCAG 2.5.8. The year buttons show the selected year by colour only, with no aria-pressed. The today ring uses `animate-pulse` with no motion-safe guard, and styles.css has no reduced-motion override for it. All parts hold, but it is a contained widget, so the severity is medium, not high. impact review: partially (medium). Confirmed in code: each heatmap cell is `<div tabindex="0" class="aspect-square rounded-sm outline-none">`, with no role, no label and no focus ring. About 365 invisible, silent tab stops per heatmap is real keyboard and screen-reader harm. The heatmap is a secondary decorative widget on profile and vehicle pages, not a core task. The year buttons also have no aria-pressed, and the today ring uses `animate-pulse` with no motion guard. The 19px target-size claim is a lower-priority WCAG 2.5.8 issue. A full grid with roving tabindex is more than is needed.

**Fix note from the second check.** A smaller fix than a full roving-tabindex grid: remove `tabindex="0"` and the focus-driven tooltip from the cells. Mark the grid `aria-hidden`, since the existing funCaption or a short visually hidden summary already conveys the content. Add `aria-pressed` to the year buttons and change `animate-pulse` to `motion-safe:animate-pulse`. Build the roving-tabindex grid only if per-day keyboard access is a requirement. Remove `tabindex="0"` from the cells and mark the grid `aria-hidden="true"`, since `funCaption` already gives screen readers a summary. If keyboard access to each day is wanted, keep one roving tab stop, give each cell an aria-label, and add `focus-visible:ring-2`. Add `aria-pressed` to the year buttons and `motion-safe:animate-pulse` to the today ring.

**Also reported as:** [F180](accessibility-and-keyboard-access.md#f031) [ux-spotting] Heatmap cells are 365 unnamed tab stops with no focus ring; year pills expose no state (src/app/domain-ui/spotting-activity-heatmap/spotting-activity-heatmap.ts:173, src/app/domain-ui/spotting-activity-heatmap/spotting-activity-heatmap.ts:124); [F263](accessibility-and-keyboard-access.md#f031) [spotting] Heatmap exposes 365 unlabeled tab stops and carries meaning by colour and hover only (src/app/domain-ui/spotting-activity-heatmap/spotting-activity-heatmap.ts:168, src/app/domain-ui/spotting-activity-heatmap/spotting-activity-heatmap.ts:170); [F337](accessibility-and-keyboard-access.md#f031) [gap-1] Label the 365 heatmap cells and fix the UTC 'today' ring (src/app/domain-ui/spotting-activity-heatmap/spotting-activity-heatmap.ts:173-179, src/app/domain-ui/spotting-activity-heatmap/spotting-activity-heatmap.ts:229)

<details><summary>Evidence</summary>

```text
<div tabindex="0" class="aspect-square rounded-sm outline-none" ... (focus)="onHoverStart(day, $event)" (blur)="hoveredDate.set(null)"></div>  — measured on /spotting/4/vehicle/103: '372 under 24px of 381 visible', samples `div.aspect-square.rounded-sm 19x19`.
```

</details>

<a id="f037"></a>

#### F037 · Calendar grid has no ARIA grid semantics, no keyboard navigation, and colour-only day meaning

**medium** · effort M · accessibility · insiden-ui · second check set severity high → medium

**Where:** `src/app/features/insiden/calendar/calendar.component.ts:131-156`, `src/app/features/insiden/calendar/calendar.component.ts:145`, `src/app/features/insiden/calendar/calendar.component.ts:23-27`

**Problem.** The month is a plain div grid of 42 day buttons plus the controls, so a keyboard user must press Tab about 45 times to cross it, and arrow keys do nothing. A day button's accessible name is only its number ('15'), without the month, weekday, severity or incident count. The selected day is shown only by a blue background and today only by a 1 px ring, with no aria-pressed, aria-selected or aria-current='date'. Severity is communicated only by 6 px red, amber or grey dots (the severity text exists only in the `title`, which holds just a count, and is not announced on touch). Out-of-month days are shown only with muted colour. The month and year are two comboboxes nested inside an h2, so the heading's accessible name is unclear.

**Recommendation.** Make it a real date grid: `role="grid"` with an aria-label such as 'October 2026', `role="row"` and `role="gridcell"` wrappers, and a roving tabindex (only the selected or focused day has tabindex 0). Handle ArrowLeft/Right/Up/Down, Home/End, PageUp/PageDown (month) and Enter or Space through host `(keydown)` bindings in the component's `host` metadata, and move focus with `afterNextRender` after a month shift. Give each cell a full label via `[attr.aria-label]`, for example '15 March 2023, 1 major and 2 minor incidents', add `[attr.aria-current]="cell.isToday ? 'date' : null"` and `[attr.aria-selected]` on the selected cell, and mark out-of-month cells. Add a small visible severity cue that is not colour-only (for example a count number for a day, or a distinct dot shape for MAJOR). Move the combobox pair out of the h2 and give the heading plain text such as 'March 2023'.

**Verification.** calendar.component.ts has no role/aria-selected/aria-current. The only aria attributes are on the prev/next buttons and a decorative svg. Day buttons are plain numbered buttons with no keyboard grid handling.

**Second check (high-severity pass).** code review: partially (medium). The facts hold. calendar.component.ts renders a plain `grid grid-cols-7` div with 42 day `<button>`s plus the Today, Previous and Next buttons, and the only aria attributes in the file are aria-hidden on the countdown ring and the two month-shift aria-labels. A day button's name is just `{{ cell.day }}`. The selected day is shown only by bg-primary, today only by a ring-1 class, and out-of-month days only by text-muted-foreground. Severity is shown only by 1.5 size dots, and the `title` holds just a count, never the severity. The two hlm-combobox elements sit inside the `<h2>`. Two parts of the finding overreach. First, every control is natively keyboard-operable, so this is a heavy tab-stop count and missing semantics, not an inoperable widget. A grid of real buttons is an accepted pattern. Second, `role=grid` plus a roving tabindex is a large retrofit. The concrete WCAG gaps are colour-only meaning (1.4.1), selected and today state not exposed (4.1.2), and the lack of date context in the name. They are real but contained to one feature, so I rate this medium, not high. impact review: partially (medium). calendar.component.ts shows a div grid of day buttons whose accessible name is only the day number. The selected day is shown only by background colour and today only by a ring. Severity is shown only by coloured dots, and the title attribute holds just a count. There are no aria-selected or aria-current attributes. These are real accessibility gaps. The page is a niche incident calendar, and every day is still operable by Tab and Enter, so the task is not blocked. The Tab count of about 45 is an annoyance rather than a blocker. The full ARIA grid with a roving tabindex and arrow-key handling is more than the harm justifies.

**Fix note from the second check.** Smaller fix, no grid role or roving tabindex. On each day button add `[attr.aria-label]` with the full date and the incident count by severity, for example '15 March 2023, 1 major, 2 minor'. Add `[attr.aria-pressed]="cell.dateKey === selectedDate()"` and `[attr.aria-current]="cell.isToday ? 'date' : null"`. Make the severity dots `aria-hidden`, since the label now carries that information. Move the comboboxes out of the h2 (or give the h2 a plain text 'March 2023' next to them). Add a non-colour cue for MAJOR, such as a count digit. Roving tabindex and arrow keys can be a later enhancement. Do the cheap part first. Add [attr.aria-label] to each day with the full date, count and severities, for example '15 March 2023, 1 major incident'. Add [attr.aria-current]="cell.isToday ? 'date' : null" and aria-pressed for the selected day. Add a non-colour severity cue such as a count. Move the comboboxes out of the h2. Defer the role=grid, roving tabindex and arrow-key navigation.

**Also reported as:** [F165](accessibility-and-keyboard-access.md#f037) [ux-insiden-gallery] Calendar day cells and dots are colour-only, unlabelled and tooltip-only for counts (src/app/features/insiden/calendar/calendar.component.ts:23, src/app/features/insiden/calendar/calendar.component.ts:136); [F187](accessibility-and-keyboard-access.md#f037) [accessibility] Calendar day grid: give each day a full accessible name, selected/today state and a non-colour severity cue (src/app/features/insiden/calendar/calendar.component.ts:24, src/app/features/insiden/calendar/calendar.component.ts:135)

<details><summary>Evidence</summary>

```text
<div class="grid grid-cols-7 gap-1"> ... <button type="button" ... [class.bg-primary]="cell.dateKey === selectedDate()" [class.ring-1]="cell.isToday && ..." [title]="cell.count > 0 ? cell.count + ' incident' + ... : ''" (click)="daySelected.emit(cell.dateKey)">{{ cell.day }} <span class="size-1.5 rounded-full" [class]="dotClass(severity)"> ... Measured: 45 buttons inside app-incident-calendar (all tabbable), and no element with a `role` attribute.
```

</details>

<a id="f186"></a>

#### F186 · Add route-change focus and announcement, and give sub-routes their own titles and a visible h1 on every breakpoint

**medium** · effort M · accessibility · accessibility

**Where:** `src/app/app.routes.ts:21`, `src/app/app.routes.ts:27`, `src/app/app.config.ts:154`, `src/app/features/spotting/line-overview/line-overview.page.ts:77`, `src/app/features/spotting/line-overview/line-overview.page.ts:121`, `src/app/features/spotting/line-overview/line-switcher/line-switcher.component.ts:12`

**Problem.** In this SPA a navigation changes the page but nothing tells a screen-reader user: no focus move to the new h1/main, no live-region announcement of the new title, and Angular only changes document.title. Titles are static per top-level route, so the line page, the line details page, the vehicle page, /insiden/<date> and every console tab all share one title, which also hurts history and tab lists (WCAG 2.4.2, 2.4.6). On phones the line overview page has no h1 at all (the h1 is display:none below sm and a button stands in), and the tracker has none.

**Recommendation.** Add a small root-level service in app.ts: on NavigationEnd, `afterNextRender` then focus the first `main h1` (set tabindex=-1, outline-none is fine for programmatic focus) unless the URL only changed query params/fragment, and write the title into a visually hidden `role="status"` div in app.html. Replace the static titles for parametrised pages with `title: resolveFn` (e.g. `title: (route) => inject(SpottingLinesStore)...`) or call Title.setTitle from the page once data loads, e.g. 'KTM Skypark Link — Details | MLPTF'. Make the line-overview h1 `sr-only sm:not-sr-only` instead of `hidden`, and add a sr-only h1 to the tracker.

**Verification.** Titles are static per top-level route in app.routes.ts, with no Title.setTitle or TitleStrategy anywhere. The line-overview h1 sits in hidden sm:flex, and the tracker has no h1. Nothing manages focus or announcements on navigation.

<details><summary>Evidence</summary>

```text
title: "MLPTF | TranSPOT"  (one static title for every /spotting/* page); `<h1 class="text-xl font-semibold">{{ line.displayName }}</h1>` sits inside `<div class="hidden ... sm:flex">`. axe /spotting/4: moderate `page-has-heading-one`; /tracker: no h1.
```

</details>

<a id="f199"></a>

#### F199 · Shell lacks landmarks, a skip link, aria-current and route-change focus or announcements

**medium** · effort M · accessibility · core-shell

**Where:** `src/app/shell/app-nav/app-nav.component.ts:105`, `src/app/shell/app-nav/app-nav.component.ts:168`, `src/app/app.html:1`, `src/app/core/navigation/nav-progress/nav-progress.component.ts:30`, `src/app/shell/compact-nav/compact-nav.component.ts:46`

**Problem.** The module links sit in plain divs, so the page has no navigation or banner landmark. The only skip link in the app is inside the Home page's <main> (after the nav), so keyboard users on every other page must tab through the logo, up to six links and four icon buttons on each page. routerLinkActive changes only colour and weight (colour-only meaning) with no aria-current, so assistive tech cannot tell which module is active. After a client-side navigation focus stays on the clicked link and nothing is announced because the progress bar is aria-hidden and most pages share a few static titles. In compact-nav the chevron button has aria-expanded but no aria-controls, and on desktop it toggles a signal that nothing displays.

**Recommendation.** Change the host to a <header> containing <nav aria-label="Main">; add ariaCurrentWhenActive="page" to the routerLinks; add a global skip link as the first element in app.html targeting a main landmark id. After NavigationEnd, move focus to the page's <h1> (or <main tabindex="-1">) and push the new title through CDK LiveAnnouncer. Give the compact toggle aria-controls and hide it on sm: breakpoints.

**Verification.** A search of the shell found no <nav>, <header> or aria-current. The only skip link is in home.page.ts, and the progress bar is aria-hidden. The compact chevron toggle does nothing on desktop, as the source comment itself admits.

**Also reported as:** [F162](accessibility-and-keyboard-access.md#f199) [ux-home] Move the skip link before the header and add real landmarks to the shell (src/app/features/home/home.page.ts:118, src/app/features/home/home.page.ts:136); [F185](accessibility-and-keyboard-access.md#f199) [accessibility] Replace the home-only skip link with a first-stop skip link and add header/nav landmarks (src/app/features/home/home.page.ts:120, src/app/features/home/home.page.ts:136)

<details><summary>Evidence</summary>

```text
host: { class: "sticky top-0 z-[45] block w-full border-b bg-background transition-shadow", ... }  // not <header>/<nav>
<a [routerLink]="link.path" routerLinkActive="text-foreground font-medium" [routerLinkActiveOptions]="{ exact: link.exact }" ...>
<div class="... h-0.5 ..." aria-hidden="true">   // nav progress bar
```

</details>

<a id="f264"></a>

#### F264 · The line-details vehicle grid cannot be used with keyboard, touch or screen reader

**medium** · effort M · accessibility · spotting · partially confirmed · severity adjusted from high

**Where:** `src/app/features/spotting/line-details/vehicle-spotting-grid/vehicle-spotting-grid-date-row.component.ts:27`, `src/app/features/spotting/line-details/vehicle-spotting-grid/vehicle-spotting-grid.component.ts:202`, `src/app/features/spotting/line-details/vehicle-spotting-grid/vehicle-spotting-grid.component.ts:399`

**Problem.** The per-vehicle, per-day count exists only as the shade of an empty div and a tooltip that opens on mouseenter. Phones, which are the main audience, have no hover, so the numbers are unreachable; keyboard users and screen reader users cannot read any count. The collapse/expand control for each vehicle type is a click handler on a table cell with no role, tabindex, aria-expanded or key handling, so it cannot be operated without a mouse. The day header has numbers but no month or year association for assistive tech.

**Recommendation.** Turn each section label into a real `<button aria-expanded="..." aria-controls>` inside the cell. For cell data, render the count as visually hidden text in the cell (`<span class="sr-only">{{count}} spottings</span>`) only for non-zero cells so the DOM stays small, and add tap-to-show (click toggles hoveredCell) for touch. Give `<table>` a caption and `scope="col"` on date headers.

**Verification.** Grid cells are empty divs with mouseenter tooltips only, and the section label is a click handler on a div/td with no role, tabindex or aria-expanded; no aria/caption/scope exist in the grid files. Real a11y gap, but a dense visual matrix rather than core flow.

**Also reported as:** [F053](accessibility-and-keyboard-access.md#f264) [accessibility] Make div and td click targets keyboard-operable, or convert them to buttons (src/app/features/spotting/line-details/vehicle-spotting-grid/vehicle-spotting-grid.component.ts:196, src/app/features/spotting/line-details/vehicle-spotting-grid/vehicle-spotting-grid.component.ts:394); [F291](accessibility-and-keyboard-access.md#f264) [ux-spotting] Line-details grid cells and type labels are mouse-only: no keyboard or screen-reader access to counts (src/app/features/spotting/line-details/vehicle-spotting-grid/vehicle-spotting-grid-date-row.component.ts:27, src/app/features/spotting/line-details/vehicle-spotting-grid/vehicle-spotting-grid.component.ts:197)

<details><summary>Evidence</summary>

```text
<td [class]="dayCellClass(col)" (mouseenter)="cellHoverStart.emit({...})" (mouseleave)="cellHoverEnd.emit()">
  <div class="relative z-10 mx-auto size-4 rounded-sm" [class]="cellClass(col)"></div>
...
<td #sectionAnchor ... (click)="toggleCollapsed(section.typeId)">
```

</details>

<a id="f275"></a>

#### F275 · Add an accessible, non-map list of vehicles (and give map markers a name)

**medium** · effort M · accessibility · tracker-gallery · partially confirmed · severity adjusted from high

**Where:** `src/app/features/tracker/map/vehicle-marker-icon.ts:36`, `src/app/features/tracker/info-panel/tracker-info-panel.component.ts:192`, `src/app/features/tracker/tracker-shell.page.ts:39`

**Problem.** The tracker is only usable with a mouse or touch on a WebGL canvas. Markers are `div`s with no role, name or keyboard access, so screen-reader and keyboard users cannot find, focus or open a vehicle. The data does exist in the info panel Table, but it is buried behind a small `ⓘ` icon in a settings checklist, has no search, and its columns are raw field names (`tripId`, `latitude`). Riders who simply want to know when the next KTMB train is near them cannot get that from a list either.

**Recommendation.** Add a first-class Vehicles view: a toggle in the nav or sheet that opens a list or table (`<table>` with `aria-sort` on sortable headers) of the applied sources with label, route, last update in Asia/Kuala_Lumpur time, and a Show on map button that calls `scene.setCenter`/`setZoom` and opens the popup. Reuse `rows()` from the info panel. For the map itself make markers `<button>` elements with `aria-label="KTMB ETS 9201, updated 2 minutes ago"` (or use the shared popup approach and a live-region summary such as `38 vehicles shown, updated 20:41`). This pairs naturally with the documented vehicle search idea.

**Verification.** Markers are plain divs without role or name and there is no vehicle list outside the info panel Table. A dedicated Vehicles view is a feature rather than a defect, so high is overstated.

<details><summary>Evidence</summary>

```text
const wrapper = document.createElement("div");
wrapper.style.cssText = "...cursor:pointer;";
wrapper.innerHTML = `<svg ... aria-hidden="true">...`;
// no role, tabindex, aria-label on the marker; the only text alternative is the Table tab inside an info sheet titled with a debug-oriented "Raw JSON" sibling
```

</details>

<a id="f281"></a>

#### F281 · Interactive targets are below WCAG 2.5.8 / 44px on phones: 14 of 59 on the home page are under 24px

**medium** · effort M · accessibility · ui-system · partially confirmed

**Where:** `src/app/ui/button/button.ts:19`, `src/app/ui/button/button.ts:20`, `src/app/ui/button/button.ts:23`, `src/app/ui/info-popover/info-popover.ts:263`, `src/app/shell/app-footer/app-footer.component.ts:55`

**Problem.** Most users are on phones. The Helm button scale tops out at 36px and defaults to 32px, the info-popover 'i' glyph is a 16px circle, and footer links are one text line tall. These fail the 24px minimum of WCAG 2.5.8 and are hard to hit one-handed. Some call sites already override to h-11 (report chooser, mobile bar), showing the scale lacks a touch size.

**Recommendation.** Target the sub-24px offenders (info-popover glyph, footer links, link-style buttons) with hit-area expanders; add a coarse-pointer size only where needed.

_Original suggestion (corrected by the verifier):_ Add a coarse-pointer-aware size to buttonVariants, for example default: "h-10 pointer-coarse:h-11 sm:h-8" or a 'touch' size, and use an invisible hit-area expander on small controls: relative after:absolute after:-inset-2 after:content-[''] (works for the 'i' glyph, chips and footer links without changing layout). Give footer links py-2. Tailwind v4 has the pointer-coarse: variant.

**Verification.** button.ts sizes (h-8 default, h-6 xs, size-8 icon) match. The 24px WCAG 2.5.8 failures are real for the 16px info glyph and footer links, but the 44px target is AAA and the blanket button-scale change overstates it.

**Also reported as:** [F285](accessibility-and-keyboard-access.md#f281) [ux-home] Enlarge touch targets of header icons, row actions and info glyphs on coarse pointers (src/app/ui/button/button.ts:19, src/app/ui/button/button.ts:20); [F499](accessibility-and-keyboard-access.md#f281) [ux-spotting] Primary mobile actions and filter chips are 28-32 px tall; no 44 px touch variant exists (src/app/ui/button/button.ts:19, src/app/features/spotting/line-overview/line-overview.page.ts:77); [F590](accessibility-and-keyboard-access.md#f281) [ux-insiden-gallery] Touch targets are small and the timeline link icons are 12 px (src/app/ui/button/button.ts:19, src/app/features/insiden/vote-button/vote-button.component.ts:71)

<details><summary>Evidence</summary>

```text
default: "h-8 px-2.5",  xs: "h-6 px-2 text-xs",  icon: "size-8",
glyphClasses = "... flex size-4 shrink-0 ... text-[10px] ..."
Measured at 390x844: / has 59 interactive elements, 14 under 24px (info-popover trigger 'What is How operator groups ar...' 16x16, 'Needs attention' 96x16, footer links 14-16px tall) and 33 more between 24 and 44px (filter chips 24px tall, Theme 28x28). /spotting: 'View full table' 85x16, vehicle-name buttons 191x14.
Screenshot: .omo/evidence/audit-2026-10-21/agents/ds/home-m.png
```

</details>

<a id="f299"></a>

#### F299 · Use a larger, labelled hit area for the 16-20px info and checkbox triggers

**low** · effort S · accessibility · accessibility

**Where:** `src/app/ui/info-popover/info-popover.ts:158`, `src/app/ui/checkbox/checkbox.ts:62`, `src/app/features/methodology/methodology.page.html`, `src/app/features/home/pro/pro-lines-widget.component.ts:99`

**Problem.** WCAG 2.5.8 requires a 24x24 target or enough surrounding space. The InfoPopover trigger is a 16px 'i' glyph or a 20px-high pill, the HlmCheckbox is size-4 (16px), and filter pills on the Pro board are about 24px tall with 8px padding, so on a phone they are hard to tap and in dense rows they fail the spacing exception. Inline text links inside paragraphs (the long GDPR page) are exempt and are not part of this finding.

**Recommendation.** Add `min-h-6 min-w-6` (24px) to the InfoPopover trigger classes, and give the checkbox a transparent hit area, e.g. `after:absolute after:-inset-1.5 relative` on the box (or wrap it in the label, which the forms already do). For touch layouts bump interactive filter pills to `min-h-11` the way line-status-sheet.component.ts:128 already does.

**Verification.** The checkbox is size-4 and the info-popover trigger is a small inline pill or 16px glyph. 2.5.8 is real, with the spacing exception as the only mitigation. It is polish-level.

<details><summary>Evidence</summary>

```text
Measured: /methodology '42 under 24px of 51 visible' (`button.focus-visible:ring-ring/50.inline-flex` 'What is Testing?' 69x20); /?view=pro '62 under 24px of 151' (`button#2.border.border-input` 'Only lines with data' 16x16, 'What is How operator groups are formed?' 16x16).
```

</details>

<a id="f303"></a>

#### F303 · Spotting filters are not exposed to assistive technology (no pressed state, unlabeled date inputs)

**low** · effort S · accessibility · console · severity adjusted from medium

**Where:** `src/app/features/console/console.page.html:14`, `src/app/features/console/console.page.html:45`, `src/app/features/console/console.page.html:63`, `src/app/features/console/console.page.html:162`

**Problem.** The Status and Spotting Type chips are toggle buttons whose selected state is conveyed only by the badge variant (colour), with no `aria-pressed`, and the group names are plain text in a div rather than a `fieldset/legend` or `role=group` with a label. The four date inputs under 'Created between' and 'Spotted between' have no accessible name at all, whereas the equivalent inputs on the links filter bar do carry aria-labels. The checkbox column header is an empty `<th>`.

**Recommendation.** Add `[attr.aria-pressed]="filterForm().status.includes(option.value)"` to the chips, wrap each chip group in `<div role="group" aria-labelledby=...>`, and add `aria-label="Created from"`, `"Created to"`, `"Spotted from"`, `"Spotted to"`. Give the empty header cell a visually hidden 'Select' label.

**Verification.** grep of console.page.html finds no aria-pressed and no fieldset; the only aria-label is on the row checkbox, so the date inputs are unnamed.

<details><summary>Evidence</summary>

```text
<button type="button" hlmBadge [variant]="filterForm().status.includes(option.value) ? 'default' : 'outline'" (click)="toggleStatus(option.value)">
<input hlmInput type="date" [value]="filterForm().createdFrom" (input)="..." />   // no label or aria-label
```

</details>

<a id="f335"></a>

#### F335 · Make low-count heat grid cells visible: anything under 20% of the peak is drawn at 10% opacity

**low** · effort S · accessibility · gap-1 · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/home/data/status-history-display.util.ts:200-226`, `src/app/features/home/pro/network-heat-strip.component.ts:449-451`, `src/app/core/methodology/methodology.content.ts:560`

**Problem.** Opacity is the only carrier of the report count, and it is applied to the whole cell, so the status hue fades with it. With a peak of 30, any hour with 1 to 6 reports gets opacity-10, close to the empty bg-muted track, and the difference between Delayed (yellow) and Crowded (amber) disappears. A Disrupted hour with three reports, exactly what a Pro reader scans for, is nearly invisible. That conflicts with the rule in the code comment that 'nobody reported' and 'one person did' can never look alike. Colour contrast against the card is far below 3:1 at the lowest steps.

**Recommendation.** Keep the status colour at full strength and encode count with another channel, for example cell height or an inner bar, or a floor of opacity-40 plus a visible border. If opacity stays, apply it to a track layer only. Add a text fallback: show the count inside cells at or above the peak's 50%.

**Verification.** HEAT_INTENSITY_CLASSES starting at opacity-10 is as quoted, so low-count cells are faint. Impact depends on peak and the count is available in the hover panel, so medium is overstated.

<details><summary>Evidence</summary>

```text
export const HEAT_INTENSITY_CLASSES = ["opacity-10", "opacity-25", "opacity-45", "opacity-70", "opacity-100"] as const;
const step = Math.max(1, Math.ceil(ratio * HEAT_INTENSITY_STEPS));
```

</details>

<a id="f338"></a>

#### F338 · Add toggle semantics and sort state to the fleet chips and vehicle table headers

**low** · effort S · accessibility · gap-1 · partially confirmed

**Where:** `src/app/features/spotting/line-overview/fleet-summary/fleet-summary.component.ts:76-85`, `src/app/features/spotting/line-overview/fleet-summary/fleet-summary.component.ts:103-114`, `src/app/features/spotting/line-overview/vehicle-list/vehicle-list.component.ts:187-200`

**Problem.** The status chips are filter toggles whose active state is shown only by colour, with no aria-pressed, and their percentage is a title attribute. The vehicle table's sortable headers have no aria-sort, and direction is a glyph. The Pro lines table in the same slice already does this correctly (aria-sort, caption).

**Recommendation.** Add [attr.aria-pressed]="activeStatus() === chip.key" to the chips and [attr.aria-sort] to the th elements, copying the _ariaSort helper from pro-lines-table.component.ts:157-163.

**Verification.** Not fully re-verified. aria-pressed and aria-sort are standard cheap fixes, and the finding says the Pro table already has the helper.

<details><summary>Evidence</summary>

```text
<button type="button" class="rounded-full border px-2 py-0.5 transition-colors" [class]="activeStatus() === chip.key ? chip.activeClass : chip.inactiveClass" [title]="chip.percent + '% of fleet'" (click)="statusSelected.emit(...)">
<th hlmTh> <button ... (click)="toggleSort(column.key)"> ... {{ sortDirection() === "asc" ? "▲" : "▼" }}
```

</details>

<a id="f372"></a>

#### F372 · The Load More button is removed while the page loads, which drops keyboard focus; a failed load fails silently

**low** · effort S · accessibility · home-ui · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/home/home.page.ts:333`, `src/app/features/home/home.page.ts:580`, `src/app/features/home/home.page.ts:590`, `src/app/features/home/home.page.ts:665`, `src/app/features/home/data/home.store.ts:1116`

**Problem.** Two problems share one control. First, the button is removed from the DOM the moment loading starts, so a keyboard or switch user who pressed it loses focus to <body>; no busy cue is shown and the footer height jumps. The 'Showing N of M' text is not a live region, so new rows are not announced. Second, loadMore() has no catch and the page fires it with `void`: an HTTP or offline failure throws an HttpErrorResponse (GraphQLClient only toasts GraphQL-level errors, and there is no interceptor), producing an unhandled rejection with nothing on screen. The button simply reappears and the reader assumes there is nothing more.

**Recommendation.** Keep the button mounted with disabled/aria-busy, add aria-live on the count, and in the handler toast the failure and rethrow (or Sentry-capture) rather than swallowing it.

_Original suggestion (corrected by the verifier):_ Keep the button mounted and drive it by state: `[disabled]="isLoadingMore()" [attr.aria-busy]="isLoadingMore()"` with the label switching to 'Loading…', and `aria-live="polite"` on the count span. Catch the rejection in the page handlers (`try { await store.loadMore(); } catch { toast.error('Couldn't load more links', 'Check your connection and try again.'); }`) and rethrow nothing the Sentry handler needs, or let the store return a boolean. Apply the same to loadMoreLastWeek.

**Verification.** canLoadMore hides the button during load, and page calls `void store.loadMore()` with only a finally (no catch), so a failed load rejects unhandled. However repo convention says do not swallow errors and let the Sentry handler see them, and the focus-loss part is minor.

<details><summary>Evidence</summary>

```text
home.page.ts:580  canLoadMore = computed(() => Boolean(hasNextPage) && !this.store.isLoading() && !this.store.isLoadingMore());
home.page.ts:333  @if (canLoadMore()) { <button hlmBtn ... data-testid="feed-load-more" (click)="loadMore()">
home.page.ts:590  void this.store.loadMore();
home.store.ts:1127  try { const data = await this.graphql.request(...) ... } finally { this.loadingMore.set(false); }
```

</details>

<a id="f385"></a>

#### F385 · Month and year jump commits after a 3 second timer and then forcibly blurs the active element

**low** · effort S · ux · insiden-ui · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/insiden/calendar/calendar.component.ts:29-32`, `src/app/features/insiden/calendar/calendar.component.ts:313-332`, `src/app/features/insiden/calendar/calendar.component.ts:79-106`

**Problem.** Picking a month or year does not navigate; it arms a 3 second timer, and the view only changes when the timer fires or the field loses focus. A rider who picks 'March' sees nothing happen for up to three seconds, and a screen-reader user hears nothing about the pending change because the ring is aria-hidden. When the timer fires, the page changes context without a user action (WCAG 3.2.2) and the code calls blur() on whatever element has focus, which can steal focus from a control the user has since moved to. Nothing is announced either. The timer plus setInterval (50 ms ticks) also run for a feature that a plain 'apply' step would handle without any timing.

**Recommendation.** Commit immediately on selection, or add a polite live region announcing the pending change and the result. Keep the blur-commit, and note that removing the timers also simplifies the component.

_Original suggestion (corrected by the verifier):_ Commit immediately on selection from either combobox (keeping the other field's current value), which also removes pendingMonth, pendingYear, the interval, the timeout and the blur call. If a two-step pick is truly wanted, use an explicit 'Go' button. Announce the result with a polite live region ('Showing April 2023'). The Prev, Next and Today buttons already commit immediately, so this brings the jump in line with them.

**Verification.** The 3 s debounce commit and the blur() call exist at calendar.component.ts:313-332, with long comments showing the design is deliberate. The UX and WCAG 3.2.2 concern is real but contained, since blur-commit also exists and Prev/Next/Today are immediate.

**Also reported as:** [F296](accessibility-and-keyboard-access.md#f385) [accessibility] Month/year jump auto-commits after 3 seconds and then blurs whatever has focus (src/app/features/insiden/calendar/calendar.component.ts:32, src/app/features/insiden/calendar/calendar.component.ts:316); [F589](accessibility-and-keyboard-access.md#f385) [ux-insiden-gallery] Month/year jump commits only after a hidden 3 second timer, and month navigation lands on an arbitrary day (src/app/features/insiden/calendar/calendar.component.ts:32, src/app/features/insiden/calendar/calendar.component.ts:313)

<details><summary>Evidence</summary>

```text
const JUMP_COMMIT_MS = 3000; ... this.commitTimeout = setTimeout(() => { this.jumpCounting.set(false); this.commitJump(); ... (document.activeElement as HTMLElement | null)?.blur(); }, JUMP_COMMIT_MS);  The countdown ring svg is `aria-hidden="true"`.
```

</details>

<a id="f386"></a>

#### F386 · 'Show details' toggle has no aria-expanded, and the ad-cap counter goes out of balance when expanded cards are destroyed

**low** · effort S · accessibility · insiden-ui · severity adjusted from medium

**Where:** `src/app/features/insiden/incident-card/incident-card.component.html:347-349`, `src/app/features/insiden/incident-card/incident-card.component.html:351-357`, `src/app/features/insiden/incident-card/incident-card.component.ts:342-344`, `src/app/features/insiden/insiden.page.ts:182-185`

**Problem.** The details toggle does not expose its state or the region it controls, while the sibling Photos toggle and the page's Pending toggles do, so the pattern is inconsistent. Separately, expandedDetailsCount only decrements when the user clicks Hide. If an expanded day card is destroyed (the rider selects another day, or the list reloads) the count stays above zero, and the insidenFeed ad slot is suppressed for the rest of the visit even though nothing is expanded. The Math.max clamp hides underflow but not this overcount.

**Recommendation.** Add `[attr.aria-expanded]="detailsExpanded()"` and `[attr.aria-controls]` pointing at an id on the details wrapper. For the counter, either emit `detailsExpandedChange.emit(false)` from `destroyRef.onDestroy` when the card was expanded, or drop the output/counter and let the cap be driven by a small shared signal service that cards add to and remove from with `DestroyRef.onDestroy`.

**Verification.** The Show details button (html:347) has no aria-expanded, while the Photos button at line 356 has it. ngOnDestroy only clears the interval and the page counter only changes through the output, so an expanded card destroyed on day change leaves the ad suppressed.

<details><summary>Evidence</summary>

```text
<button hlmBtn variant="outline" size="sm" (click)="toggleDetails()">{{ detailsExpanded() ? "Hide details" : "Show details" }}</button> (the Photos button directly below does set `[attr.aria-expanded]`; measured aria-expanded on the details button is null). ngOnDestroy only runs clearInterval(this.timer) and never emits detailsExpandedChange(false); the page does `Math.max(0, count + (expanded ? 1 : -1))`.
```

</details>

<a id="f388"></a>

#### F388 · Voting disables the focused button (focus is dropped) and the vote group has an aria-label on a role-less div

**low** · effort S · accessibility · insiden-ui · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/insiden/vote-button/vote-button.component.ts:72`, `src/app/features/insiden/vote-button/vote-button.component.ts:81`, `src/app/features/insiden/vote-button/vote-button.component.ts:193`, `src/app/features/insiden/vote-button/vote-button.component.ts:226-231`

**Problem.** isVoting() sets the native disabled attribute on both buttons while the request is in flight; browsers drop focus from a button that becomes disabled, so a keyboard or switch user who presses Enter on Upvote loses their place on the page after every vote and must tab back from the top. The wrapper div's aria-label is not exposed because a generic div has no role that supports naming, so screen readers do not hear 'Vote on this incident'. The catch block treats every failure alike, so an expired session, a network failure and a validation error all say 'Please try again'.

**Recommendation.** Add role="group" to the wrapper and use aria-disabled with an in-flight guard instead of [disabled]. Skip the error-branching unless the backend distinguishes the failure types.

_Original suggestion (corrected by the verifier):_ Guard in-flight clicks in code (`if (this.isVoting()) return;`) and mark the buttons `[attr.aria-disabled]="isVoting()"` instead of `[disabled]`, so focus stays. Add `role="group"` to the wrapper. Give the buttons names that include the target (for example 'Upvote this incident'). In the catch, branch on the error: for an auth rejection prompt sign-in, otherwise offer a retry action in the toast.

**Verification.** The wrapper div has an aria-label with no role and the buttons use `[disabled]` during voting. Whether focus is actually dropped is browser dependent, and I did not confirm it. The error-branching point is minor.

<details><summary>Evidence</summary>

```text
<div class="group/vote flex items-center gap-0.5" [attr.aria-label]="ariaLabel()"> ... [disabled]="!auth.isLoggedIn() || isVoting()" ; on failure: `this.toast.error("Vote not recorded", "Please try again in a moment.");`
```

</details>

<a id="f390"></a>

#### F390 · Chronology indicator dots and severity dots carry meaning by colour alone

**low** · effort S · accessibility · insiden-ui

**Where:** `src/app/features/insiden/incident-card/incident-card.component.html:88-91`, `src/app/features/insiden/incident-card/incident-card.component.ts:81-86`

**Problem.** Each timeline row's state (resolved, ongoing, update, neutral) is shown only by an 8 px coloured dot with no text alternative, so colour-blind users and screen-reader users cannot tell a resolution row from a problem row. The pulsing ongoing dot also keeps animating for users who prefer reduced motion.

**Recommendation.** Add an `sr-only` prefix per row ('Resolved:', 'Ongoing:', 'Update:') derived from the indicator, vary the dot shape or add a tiny icon for GREEN and RED, and use `motion-safe:animate-pulse` instead of `animate-pulse`.

**Verification.** The chronology dot spans carry meaning by colour alone, with no text alternative and a plain animate-pulse. It is real but polish.

<details><summary>Evidence</summary>

```text
<span class="absolute top-1 -left-[15px] size-2 rounded-full" [class]="dotClass(entry.indicator) + (entry.synthetic ? ' animate-pulse' : '')"></span> with CHRONOLOGY_DOT mapping GREEN, RED, BLUE and GRAY to bg-emerald-500, bg-red-500, bg-blue-500 and bg-neutral-400.
```

</details>

<a id="f417"></a>

#### F417 · Show why a row action is disabled in visible text, not only in a title attribute

**low** · effort S · accessibility · profile-about-misc · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/profile/my-links/my-links-row.component.ts:100-136`, `src/app/features/profile/my-links/my-links.component.ts:167-176`

**Problem.** The explanation for a disabled Move up, Move down or Nest button (for example 'tick another link first' or the depth limit) lives only in title. Title tooltips do not appear on touch screens, which is the audience's main device, and a natively disabled button is not focusable, so keyboard and screen-reader users cannot reach the text either. The page compensates with a five-line prose hint above the list that a rider has to read and match to rows. Buttons are also size xs, below a comfortable 44 px tap target.

**Recommendation.** Use aria-disabled="true" (keep the button focusable and ignore the click) instead of [disabled], and render the reason as a visible one-line muted text under the action row when a row's actions are blocked and the row is selected or focused, linked with aria-describedby. Increase the row action buttons to size sm on touch, or put Move up/down into an overflow menu. Shorten the hint paragraph to one sentence.

**Verification.** The row buttons use [title] plus [disabled] at size xs, so the reason is invisible on touch and the disabled button is not focusable. The Nest button already has aria-describedby pointing at a visible hint, which softens the claim. Real but polish-level.

<details><summary>Evidence</summary>

```text
<button type="button" hlmBtn variant="ghost" size="xs" ... [title]="moveUpReason() ?? ''" [disabled]="moveUpReason() !== null" (click)="moveUp.emit()">Move up</button>
(same for Move down and 'Nest ticked here')
```

</details>

<a id="f455"></a>

#### F455 · Form-control borders and light-mode destructive text miss WCAG contrast (input border 1.3:1, destructive badge text 3.98:1)

**low** · effort S · ui-visual · ui-system · partially confirmed · severity adjusted from medium

**Where:** `src/styles.css:283`, `src/styles.css:284`, `src/styles.css:318`, `src/styles.css:319`, `src/app/ui/badge/badge.ts:15`, `src/app/ui/button/button.ts:15`

**Problem.** The only visual boundary of an input is border-input, which is 1.3:1 against the page in light mode and 1.55:1 in dark; WCAG 1.4.11 asks for 3:1 for component boundaries, so on a bright commuter-phone screen the fields nearly vanish. Destructive-tinted badges and buttons, and the success toast icon, also fall under 4.5:1 (text) or are borderline for large text.

**Recommendation.** Add a --control-border token for input/select/checkbox only; leave destructive tints for later.

_Original suggestion (corrected by the verifier):_ Introduce a separate stronger token for control boundaries (for example --control-border: oklch(0.62 0.02 255) light, oklch(0.6 0.02 255) dark) used by HlmInput, HlmNativeSelect, HlmCheckbox and outline buttons while keeping --border for decorative dividers. Darken --destructive text on tinted fills (oklch(0.5 0.22 27)) or drop the tint to /5, and use text-green-700 for success text.

**Verification.** The tokens exist as quoted (--input and --border at oklch 0.9) and the badge/button use destructive/10 with text-destructive. The 1.3:1 input border is a legitimate 1.4.11 concern, but the contrast figures were computed rather than re-verified and the shadcn/Spartan palette is deliberate.

<details><summary>Evidence</summary>

```text
--border: oklch(0.9 0.02 255);  --input: oklch(0.9 0.02 255);   (dark: --input: oklch(1 0.02 255 / 16%))
badge destructive: "bg-destructive/10 text-destructive ..."
Computed (WCAG relative luminance, alpha composited in sRGB): light --input vs --background 1.31:1; dark input border vs background 1.55:1; light text-destructive on bg-destructive/10 3.98:1 (text-xs badge, text-sm button); text-green-600 on the light card 3.29:1.
```

</details>

<a id="f459"></a>

#### F459 · Reduced motion is handled ad hoc: skeletons, nav progress, the infinite nav glow and sheet slides ignore prefers-reduced-motion

**low** · effort S · accessibility · ui-system · partially confirmed · severity adjusted from medium

**Where:** `src/app/ui/skeleton/skeleton.ts:5`, `src/app/ui/sheet/sheet.ts:42`, `src/app/shell/app-nav/app-nav-icon-tray.component.ts:89`, `src/app/core/navigation/nav-progress/nav-progress.component.ts:36`, `src/styles.css:42`

**Problem.** HlmSkeleton, used for every loading state, pulses forever for users who asked for reduced motion; the nav 'new version' pill breathes infinitely (WCAG 2.2.2 Pause, Stop, Hide for motion over 5 s); the nav progress sweep, wordmark wipe, nav-reveal and the sheet's transform/opacity transitions all play regardless. TickUp's motion-safe: gate shows the intent, but it is not applied uniformly.

**Recommendation.** Add the global reduced-motion block or motion-reduce:animate-none on skeleton and breathe.

_Original suggestion (corrected by the verifier):_ Add one global safety net in styles.css: @media (prefers-reduced-motion: reduce) { *, ::before, ::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } } and keep the explicit motion-reduce:animate-none on HlmSkeleton and on the breathe/glow classes so spinners can opt back in where motion carries meaning.

**Verification.** styles.css has no prefers-reduced-motion rule, and the skeleton host class (animate-pulse) and animate-breathe (infinite) have no motion-reduce guard. Real, but the pulse and breathe animations are mild.

**Also reported as:** [F297](accessibility-and-keyboard-access.md#f459) [accessibility] Honour prefers-reduced-motion globally and stop the always-running progress sweep (src/styles.css:93, src/app/core/navigation/nav-progress/nav-progress.component.ts:28); [F466](accessibility-and-keyboard-access.md#f459) [ux-home] Make the nav progress bar and update button honour reduced motion and stop animating while hidden (src/app/core/navigation/nav-progress/nav-progress.component.ts:30, src/app/core/navigation/nav-progress/nav-progress.component.ts:36)

<details><summary>Evidence</summary>

```text
host: { class: "bg-muted block animate-pulse rounded-md" }   (no motion-reduce)
class="... animate-breathe flex h-8 ..."   (--animate-breathe: breathe 3.5s ease-in-out infinite)
styles.css contains no @media (prefers-reduced-motion) rule; motion-reduce:/motion-safe: appears in about 15 files.
```

</details>

<a id="f485"></a>

#### F485 · Live-feed refresh state is hover-only and hidden from assistive tech, so touch users get no freshness cue

**low** · effort S · accessibility · ux-rest · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/tracker/status-card/countdown-ring.component.ts:36`, `src/app/features/tracker/status-card/countdown-ring.component.ts:44`, `src/app/features/tracker/map/vehicle-popup-content.ts:109`

**Problem.** On phones, where the tracker is mostly used, there is no way to see how fresh the data is or when it will next refresh: the ring is a tiny unlabeled glyph and its text appears only on mouse hover. A feed in error is conveyed only by ring colour plus a button label. Vehicle popups expose GTFS ids such as stop ids instead of stop names, which means nothing to riders even though static stops may already be loaded.

**Recommendation.** Add a visible 'Updated Ns ago' text and role=img/aria-label on the ring; treat the stop-name lookup as a separate optional enhancement.

_Original suggestion (corrected by the verifier):_ Show a visible 'Updated 12s ago' caption (a computed from the last successful fetch time stored on RtSource) next to the Layers bar and per feed row. Give the ring role='img' with an aria-label, and make it tappable to toggle the tooltip. In the popup, resolve stopId against loaded static stops and fall back to the id only if unknown.

**Verification.** countdown-ring.component.ts has (mouseenter) handling and an aria-hidden svg, so touch users get no freshness text from the ring. The popup id/stopId point is secondary and unverified here.

<details><summary>Evidence</summary>

```text
`(mouseenter)="onHoverStart($event)"` on the ring and `aria-hidden="true"` on its svg; the 'Refreshing in Ns' text only exists in a hover tooltip. Popup rows show raw `Trip`, `Route` ids and `stopId` values.
```

</details>

<a id="f494"></a>

#### F494 · Mobile layer sheet and tracker shell lack dialog semantics, a page heading and dynamic-viewport sizing

**low** · effort S · accessibility · ux-rest

**Where:** `src/app/features/tracker/status-card/mobile-layer-sheet.component.ts:86`, `src/app/features/tracker/tracker-shell.page.ts:31`, `src/app/features/tracker/map/tracker-map.component.ts:36`

**Problem.** When the Layers sheet expands over the map, keyboard and screen-reader focus can still reach the map behind it, Escape does not close it, and there is no heading to announce the page. `h-screen` (100vh) is taller than the visible area on mobile browsers with a collapsing address bar, and `w-screen` adds the scrollbar width on desktop (the audit noted desktop element overflow). The dark-mode nav pill is `bg-background/90` over a dark map, so it nearly vanishes (tracker__mobile__dark__viewport.png).

**Recommendation.** Use the existing HlmSheet (bottom side) for the expanded state, or add role='dialog' aria-modal='true', an Escape handler and focus return. Change the shell to `h-dvh w-full`. Add `<h1 class="sr-only">Live transit tracker</h1>` and `role="application" aria-label="Live map"` on the map container. Give the compact nav a visible border in dark mode (`border border-border`).

**Verification.** tracker-shell.page.ts uses h-screen w-screen, the mobile sheet has only aria-label/aria-expanded with no dialog role or Escape handling, and the tracker has no h1. Real a11y and viewport polish.

<details><summary>Evidence</summary>

```text
`<div class="relative h-screen w-screen overflow-hidden">`; the sheet is a `fixed inset-x-0 bottom-0 z-30` div with a `bg-black/40` backdrop button and no role, focus trap or Escape handling; map template is `<div id="map" class="h-full w-full"></div>`; axe: region (moderate) on #l7-scene-0; page has no h1.
```

</details>

<a id="f498"></a>

#### F498 · Incident severity on the vehicle page is a bare coloured dot

**low** · effort S · accessibility · ux-spotting

**Where:** `src/app/features/spotting/vehicle-detail/incident-timeline/incident-timeline.component.ts:13`, `src/app/features/spotting/vehicle-detail/incident-timeline/incident-timeline.component.ts:30`

**Problem.** A 8 px dot is the only indicator of severity: invisible to colour-blind users and screen readers, and green meaning STATUS conflicts with green meaning In Service elsewhere on the page.

**Recommendation.** Replace the dot with a small labelled badge ('Critical', 'Trivia', 'Status') using HlmBadge variants, or add a visually hidden severity label plus an icon.

**Verification.** Incident severity is a bare colored dot span. Real but polish-level.

<details><summary>Evidence</summary>

```text
CRITICAL: "bg-destructive", TRIVIA: "bg-blue-500", STATUS: "bg-emerald-500"  // <span class="mt-1.5 size-2 shrink-0 rounded-full" [class]="_dotClass(incident.severity)"></span>
```

</details>

<a id="f500"></a>

#### F500 · Selected filter chips fail contrast (white on emerald-600 3.8:1, amber-600 3.2:1) and expose no pressed state

**low** · effort S · accessibility · ux-spotting

**Where:** `src/app/features/spotting/line-overview/fleet-summary/fleet-summary.component.ts:21`, `src/app/features/spotting/line-overview/fleet-summary/fleet-summary.component.ts:26`, `src/app/features/spotting/line-overview/fleet-summary/fleet-summary.component.ts:90`

**Problem.** The active state of the 'In Service' and 'Not Spotted' filters is below the 4.5:1 AA threshold for 12-14 px text. The chips are toggles but have no aria-pressed, so a screen reader cannot tell which filter is on. The chip palette is also a second hand-written copy of the badge palette (CHIP_STYLE versus badgeVariants), so the two can drift.

**Recommendation.** Use 700-weight fills for the active state (emerald-700, amber-700 with text-white, or amber-500 with dark text) and add [attr.aria-pressed]="activeStatus() === chip.key". Derive chip classes from the shared badge variants so there is one status palette.

**Verification.** Active chips use emerald-600 and amber-600 with white text, which are below 4.5:1, and the chips have no aria-pressed.

<details><summary>Evidence</summary>

```text
IN_SERVICE: { active: "bg-emerald-600 text-white border-transparent" ...}, NOT_SPOTTED: { active: "bg-amber-600 text-white border-transparent" ...}. Computed contrast with white: emerald-600 3.77, amber-600 3.19, red-600 4.83.
```

</details>

<a id="f503"></a>

#### F503 · Refresh-interval selects have no accessible name and the spinner ignores reduced motion

**low** · effort S · accessibility · ux-spotting

**Where:** `src/app/features/spotting/line-details/situasi-section/situasi-section.component.ts:69`, `src/app/features/spotting/line-details/insiden-section/insiden-section.component.ts:54`, `src/app/features/spotting/line-details/situasi-section/situasi-section.component.ts:86`, `src/app/domain-ui/spotting-activity-heatmap/spotting-activity-heatmap.ts:185`

**Problem.** The select shows options such as '10s' and 'Never' with no label, so neither sighted nor screen-reader users know it means auto-refresh. The spinner and the pulsing today marker animate continuously with no prefers-reduced-motion guard. The select is also 24 px tall.

**Recommendation.** Add a visible or sr-only label 'Auto-refresh' and aria-label on the select, enlarge it to 32 px on touch, and apply motion-safe: (or motion-reduce:animate-none) to the spinner and pulse.

**Verification.** The refresh select has no label, and the spinner and pulse have no reduced-motion guard. MISTAKES.md notes the spinner pattern was left deliberately, so the animation part is low value.

<details><summary>Evidence</summary>

```text
<select class="border-input bg-background rounded-md border px-1.5 py-1 text-xs font-normal" (click)="$event.stopPropagation()" (change)="onRefreshIntervalChange($event)">  // style="animation: spin 1s linear infinite"  // today ring: animate-pulse
```

</details>

<a id="f507"></a>

#### F507 · Associate form errors with their fields, focus the first invalid field on submit, and label the refresh-interval selects

**low** · effort M · accessibility · accessibility · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/insiden/incident-form/incident-form.component.html:25`, `src/app/features/insiden/incident-form/incident-form.component.html:30`, `src/app/features/insiden/link-form/link-form.component.ts:97`, `src/app/features/insiden/link-form/link-form.component.ts:103`, `src/app/features/home/line-status/line-status-sheet.component.ts:194`, `src/app/features/spotting/line-details/situasi-section/situasi-section.component.ts:69`, `src/app/features/spotting/line-details/insiden-section/insiden-section.component.ts:54`, `src/app/features/tracker/status-card/layer-checklist.component.ts:109`

**Problem.** Labels wrap their inputs correctly (good), but the validation messages are plain <p> elements with no id, no role, no aria-describedby from the field and no live region, so a screen-reader user who submits an invalid form hears nothing and is not moved to the problem. The submit() helpers mark fields touched but never call focusBoundControl on the first invalid field. The three auto-refresh interval selects (situasi section, insiden section, tracker layer checklist) have no label or aria-label at all, so they are announced as an unnamed combo box; they are also copy-pasted three times. WCAG 3.3.1, 3.3.3, 1.3.1, 4.1.2.

**Recommendation.** Add aria-label to the three selects. Add role=alert or a shared live summary for form errors. Verify Signal Forms exposes focusBoundControl before relying on it.

_Original suggestion (corrected by the verifier):_ Give each error `<p [id]="'title-error'" role="alert">` (or one aggregate `aria-live="polite"` summary above the submit button) and bind `[attr.aria-describedby]` on the control (HlmInput can take an `errorId` input next to `_errorState`). After `submit(form, ...)` returns false, call the field state's `focusBoundControl()` on the first invalid field (Signal Forms exposes it on the FieldState). Add `aria-label="Auto-refresh interval"` to the selects, and extract one `<app-refresh-interval-select>` so the label lives in one place.

**Verification.** The error <p> has no id or role and no focus move on submit, and the refresh-interval selects have no label. However, the error text sits inside the wrapping <label>, so it is exposed as part of the field name. The silent-on-submit issue remains, so the severity is lower.

**Also reported as:** [F578](accessibility-and-keyboard-access.md#f507) [ui-system] Validation errors are not tied to their fields or announced (21 inline error paragraphs, 2 role=alert, 0 field aria-describedby) (src/app/ui/input/input.ts:9, src/app/ui/select/native-select.ts:15); [F111](accessibility-and-keyboard-access.md#f507) [insiden-data] Focus and announce the first error when an invalid form is submitted (src/app/features/insiden/incident-form/incident-form.component.ts:575, src/app/features/insiden/incident-form/incident-form.component.ts:669)

<details><summary>Evidence</summary>

```text
@if (incidentForm.title().invalid() && incidentForm.title().touched()) { <p class="text-destructive text-xs">{{ incidentForm.title().errors()[0]?.message }}</p> }   and   <select class="border-input bg-background rounded-md border px-1.5 py-1 text-xs font-normal" (click)="$event.stopPropagation()" (change)="onRefreshIntervalChange($event)">
```

</details>

<a id="f525"></a>

#### F525 · Give the history bars a touch and keyboard path for their hour detail

**low** · effort M · accessibility · gap-1 · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/home/hero/network-sparkline.component.ts:90-98`, `src/app/features/home/pro/network-heat-strip.component.ts:225-234`, `src/app/features/home/pro/network-heat-strip.component.ts:521-535`

**Problem.** Per-hour counts and status breakdowns live in a native title (sparkline) and in a mouseenter-only panel (heat grid). A native title does not appear on touch and the cells are not focusable, so the hero sparkline on phones (the main audience) and the Pro grid for keyboard users cannot read any hour; the only accessible text is a summary naming the peak hour. The panel closes only on mouseleave of the whole grid.

**Recommendation.** Make each row focusable (tabindex 0) and let arrow keys move an active-cell index that fills a visually-hidden aria-live='polite' region and the same panel. For touch, open the panel on pointerdown/click and close on outside tap. In the sparkline, replace title with the same tap-to-open readout under the bars.

**Verification.** Hour detail lives only in title and mouseenter, and the elements are aria-hidden, with a summary label for screen readers. The touch gap is real and the audience is mostly on phones, but the core info is also summarised.

<details><summary>Evidence</summary>

```text
[title]="bar.title"
aria-hidden="true"
// heat cell
(mouseenter)="onCellEnter(row, cell, $event)"
aria-hidden="true"
```

</details>

<a id="f537"></a>

#### F537 · Make the refresh control announce and describe itself properly for keyboard, touch and screen reader users

**low** · effort M · accessibility · home-data · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/home/refresh-control/home-refresh-control.component.ts:125`, `src/app/features/home/refresh-control/home-refresh-control.component.ts:134`, `src/app/features/home/refresh-control/home-refresh-control.component.ts:142`, `src/app/features/home/refresh-control/home-refresh-control.component.ts:307`, `src/app/features/home/refresh-control/home-refresh-control.component.ts:20`, `src/app/features/home/data/home.store.ts:63`

**Problem.** The button's aria-label replaces its content, so the visible 'Refreshing in 12s', 'Updating' and 'Updated' text is not in its accessible name (WCAG 2.5.3) and is not read. The role=status spans are created and removed inside the button together with their text, and a live region that appears with its content is announced unreliably, and for only 500 ms. The tooltip with 'Last updated 40s ago' opens on pointer hover only, has no aria-describedby, cannot be dismissed with Escape, and on touch it is a toggle that stays open until the next tap, so keyboard users never reach the freshness information at all. The HIGHLIGHT_VISIBLE_MS doc in the store still says the confirmation lasts 2 s.

**Recommendation.** Make the aria-label include the visible state text (or drop it), add focus-open and Escape-close to the tooltip, and fix the stale 2s comment.

_Original suggestion (corrected by the verifier):_ Keep the button name stable and short, move the live announcement to a separate always-present visually hidden aria-live=polite sibling that is updated with 'Updated' only after a manual refresh (not on every automatic beat), and show 'Updated 12s ago' as visible text instead of a hover-only tooltip. If the tooltip stays, open it on focus too, link it with aria-describedby, close it on Escape and on outside tap. Update the stale 2 s comment.

**Verification.** The button has a static aria-label over visible 'Refreshing in Ns/Updating/Updated' text (label-in-name mismatch), the tooltip opens on mouseenter/tap only with no focus or Escape, and the store's HIGHLIGHT_VISIBLE_MS comment says 2s while REFRESHED_VISIBLE_MS is 500. It is a small control with a documented design, so medium is too high.

<details><summary>Evidence</summary>

```text
<button ... aria-label="Refresh page data now" ...>
  @if (_isUpdating()) { <span ... role="status">Updating</span> } @else if (_showRefreshed()) { <span ... role="status">Updated</span> }
<span role="tooltip" ...>Last updated {{ _lastUpdatedLabel() }}</span>   // opens on mouseenter only
const REFRESHED_VISIBLE_MS = 500;
```

</details>

<a id="f543"></a>

#### F543 · Give the Pro heat grid touch and keyboard access to per-cell details

**low** · effort M · accessibility · home-data

**Where:** `src/app/features/home/pro/network-heat-strip.component.ts:231`, `src/app/features/home/pro/network-heat-strip.component.ts:228`

**Problem.** The hour-by-hour counts and status breakdown appear only in a hover panel, so phones, tablets and keyboard users cannot see them; each row's aria-label gives a summary only. At phone width the cells are roughly 8 by 20 px.

**Recommendation.** Add a tap/click and Enter/Space handler on each row that opens the same panel (or a per-row detail list below the grid), make rows focusable with a roving tabindex, and expose the selected cell text in a visually hidden live region.

**Verification.** Heat cells have only (mouseenter), aria-hidden and h-5 with narrow width; the details panel is hover-only, and rows expose only a summary aria-label. A text ranking view exists elsewhere, so impact is limited to a Pro widget.

<details><summary>Evidence</summary>

```text
(mouseenter)="onCellEnter(row, cell, $event)"
aria-hidden="true"
data-testid="heat-cell"   // cells are h-5 (20 px) and about 8 px wide at 390 px
```

</details>

<a id="f547"></a>

#### F547 · Rework the asset multi-select: unbounded rows, no selection summary, and weak accessibility semantics

**low** · effort M · accessibility · insiden-data · partially confirmed · severity adjusted from medium

**Where:** `src/app/features/insiden/asset-multi-select/asset-multi-select.component.ts:48`, `src/app/features/insiden/asset-multi-select/asset-multi-select.component.ts:71`, `src/app/features/insiden/asset-multi-select/asset-multi-select.component.ts:144`, `src/app/features/insiden/asset-multi-select/asset-multi-select.component.ts:167`

**Problem.** With no line chosen the Vehicles list renders all 922 rows (and Stations 226), each with a label, native checkbox, title and optional chips, and isSelected() does an Array.includes per row per change, twice per row when pinnedSelected is on. The filter itself is cheap, so search debounce is not the problem; the render volume and the lack of any result limit are. The search input is labelled with the same text as the group ('Lines'), is type=text rather than search, has no autocomplete=off or enterkeyhint, and the heading is a bare span, so assistive technology hears an ambiguous 'Lines, edit text' and the checkbox list is not a labelled group. Selected items are not summarised when pinnedSelected is false (the incident form), so a selection can be scrolled out of view. 'No matches' and result counts are not announced. The 12 px (text-xs) search field is below the 16 px threshold at which iOS Safari zooms the page on focus, and the 16 px native checkboxes sit in roughly 28 px rows, small for thumbs.

**Recommendation.** Cap rendered rows with a 'type to narrow' hint, add fieldset/legend, a distinct search aria-label, type=search, a live result count, text-base on touch, and selected chips. Skip hiding vehicles until a line is chosen, and skip the Set memoisation.

_Original suggestion (corrected by the verifier):_ Wrap the control in `<fieldset><legend>`, give the search input `type="search" aria-label="Search lines" autocomplete="off" enterkeyhint="search"` and `aria-controls` pointing to the list, and add a polite live region such as '12 vehicles match, 2 selected'. Cap rendering (first 50 matches plus 'Type to narrow 872 more', or `@angular/cdk/scrolling` virtual scroll), and for vehicles show nothing until a line is selected or a query is typed. Show selected items as removable chips above the list in both forms. Use `text-base sm:text-xs` on the search input and a 44 px minimum row height on touch (make the whole label the target). Memoise selection checks with a computed Set.

**Verification.** The component has no result cap, a text-xs h-7 search input (iOS zooms below 16px) and an aria-label equal to the heading. The link form's vehicleOptions lists all vehicles when no line is selected. 'Show nothing until a line is selected' is a UX regression risk, and the Set memoisation is micro-optimisation. Most of this is polish.

<details><summary>Evidence</summary>

```text
<input hlmInput type="text" class="h-7 text-xs" [attr.aria-label]="heading()" [value]="searchText()" (input)="_onSearchInput($event)" />
@for (option of filteredOptions(); track option.id) {
// measured reference data: 922 vehicles, 226 stations, 16 lines
```

</details>
