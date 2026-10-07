import { toSignal } from "@angular/core/rxjs-interop";
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from "@angular/router";
import { filter, map } from "rxjs";
import * as Sentry from "@sentry/angular";
import { AuthService } from "../../core/auth/auth.service";
import { ImageUploadService } from "../../core/upload/image-upload.service";
import { ThemeService } from "../../core/theme/theme.service";
import { CONSOLE_LINKS } from "../nav-config";
import { HlmSheet, HlmSheetBody, HlmSheetHeader } from "../../ui/sheet/sheet";
import { ToastService } from "../../ui/toast/toast.service";
import { AccountPanelComponent } from "../account-panel/account-panel.component";
import { HoverPreloadStrategy } from "../../core/routing/hover-preload.strategy";
import { AppNavIconTrayComponent } from "./app-nav-icon-tray.component";
import { AppNavModuleMenuComponent } from "./app-nav-module-menu.component";
import { NavMenuState } from "./app-nav-menu-state";
import { GENERIC_TITLE, NAV_LINKS, moduleLabelFor, wordmarkClassFor } from "./app-nav.util";

/** Module-level, not a class field: `<app-nav>` is recreated on every top-level page navigation
 * (it's not a persistent shell — see the class doc comment), so a class field would re-arm the
 * one-shot hint on every SPA navigation. This lives at module scope instead, so it's shared
 * across every AppNavComponent instance created during one real page load and only resets on an
 * actual browser refresh (a fresh evaluation of this module) — matching "only on full page
 * refresh, not when navigating through modules". */
let hasRevealedWordmarkThisPageLoad = false;

/** Same reasoning as `hasRevealedWordmarkThisPageLoad`, for the nav-link row's reveal-in
 * animation — covers both the places `animate-nav-reveal` is used (the full inline link list
 * once `_navLinksFit()` is true, and the collapsed dropdown trigger while it's false): whichever
 * of the two is on screen the first time this module is evaluated (i.e. the first real page
 * load) plays the reveal once; neither replays it again, on a route change or on later
 * narrow/widen transitions, for the rest of that page load. */
let hasRevealedNavLinksThisPageLoad = false;

/**
 * Full-width top bar for /spotting, /profile and /about — logo, cross-feature nav, theme toggle
 * and login/out. `/tracker` deliberately keeps its own compact floating pill instead of this
 * (it's a full-bleed map; a full-width bar would eat into the viewport for no benefit there).
 *
 * The bar itself spans the viewport (its host is full-bleed via a negative-margin breakout — see
 * host binding below) with an inner `max-w-5xl` row so its content still lines up with the page
 * body underneath. "Add a Spotting Entry" used to be projected in here via <ng-content>; it now
 * lives on the /spotting pages themselves (see ReportSheetService) since it isn't a nav action.
 *
 * The module links collapse to a single "current module ▾" dropdown trigger whenever they don't
 * fit — measured, not breakpoint-guessed (same technique as `_brandFits`, below), so a merely
 * narrow desktop window gets the same fallback a phone does, rather than only reacting to a fixed
 * `md:` cutoff. That one mechanism replaces what used to be two separate ones (a `md:` breakpoint
 * hiding the link row, plus a hamburger-triggered full-screen overlay standing in for it below
 * that) — there's now exactly one "not enough room" state, not two independently-triggered ones.
 */
@Component({
  selector: "app-nav",
  imports: [
    RouterLink,
    RouterLinkActive,
    HlmSheet,
    HlmSheetHeader,
    HlmSheetBody,
    AccountPanelComponent,
    AppNavIconTrayComponent,
    AppNavModuleMenuComponent,
  ],
  // Full-bleed, but not via a percentage-math breakout trick (that was tried and genuinely
  // broke: every page renders this inside a `p-4 sm:p-6 ...` wrapper, and `left-1/2 -ml-[50vw]`
  // silently assumes the wrapper has *zero* padding — with real padding present, the two
  // percentages resolve against different effective boxes and stop canceling out, landing the
  // bar noticeably offset from the true viewport edge, which is exactly the "half the logo is
  // cut off, and the right side stops short with phantom padding" bug this replaces). The actual
  // fix is structural instead: every page places `<app-nav>` *before*, as a sibling of, that
  // padded/width-capped wrapper — see e.g. spotting-shell.page.ts — so this component is never
  // nested inside anything narrower than the real page in the first place, and `w-full` alone
  // is correct with no offset math at all. `sticky` (not `relative`) anchors it to the viewport
  // top once scrolled.
  //
  // z-[45], not the z-30 its own dropdown uses internally: `position: sticky` plus *any*
  // explicit z-index makes an element a stacking-context root, which means this bar's z-index is
  // what decides its (and everything inside it, e.g. that z-30 dropdown's) rank against *other*
  // page content's own stacking contexts — the dropdown's z-30 only ever settles ties *within*
  // this bar. Page content includes other z-20/z-40 sticky bars (e.g. line-overview's line-name
  // row, line-details' sticky header) that come later in the DOM, and same-z-index ties resolve
  // by DOM order — so without this bar outranking them outright, later-DOM same-or-higher-z
  // content would paint over this bar's dropdown regardless of the dropdown's own z-index.
  // z-[45] sits above every sticky-bar z-index used anywhere else in page content (the highest
  // today is z-40) while staying *below* the app's own overlay layer — sheet/dialog content and
  // the combobox popover are all z-50 — so this bar never paints over a sheet or dialog that's
  // open at the same time (sheets in this app render inline, not portaled, so this bar's
  // z-index has to actually lose that fight, not just avoid it by coincidence).
  host: {
    class: "sticky top-0 z-[45] block w-full border-b bg-background transition-shadow",
    "[class.shadow-lg]": "_scrolled()",
  },
  template: `
    <div
      #brandRow
      class="flex items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6 lg:px-8"
    >
      <div class="flex min-w-0 items-center gap-2 sm:gap-4">
        <a routerLink="/spotting" class="flex shrink-0 items-center gap-2">
          <svg viewBox="0 0 570.14 178.35" class="h-9 w-auto" aria-hidden="true">
            <path fill="#ee7104" d="M1.5,6.23L.29,132.87l82.39-2.27L1.5,6.23Z" />
            <path fill="#ee7104" d="M1.5,6.23l117.75,125.57,101.07-1.06L1.5,6.23Z" />
            <path fill="#ee7104" d="M1.5,6.23l275.87,125.29,247.58-2.86L1.5,6.23" />
            <path
              fill="currentColor"
              d="M0,134.4L37.77,5.22l38.17-.4,4.69,89.06L126.83,4.42l38.57-.4-19.96,127.9-27.99,.4,19.39-104.19-54.17,102.47-21.78,.38-5.87-101.33-27.57,104.15-27.46,.6Z"
            />
            <path
              fill="currentColor"
              d="M188.57,4.69l-28.33,127.05,80.12-1.14,4.36-22.25-51.61,.09L216.4,4.27l-27.82,.42Z"
            />
            <path
              fill="currentColor"
              d="M309.78,.67c-13.14,.73-22.17,2.41-33.32,4.5-1.16,7.99-27.89,126.34-27.89,126.34h28.79l9.78-46.47s16.7,1.7,38.17-2.28c14.6-7.41,19.82-7.99,29.6-22.23,3.57-5.62,11.96-20.36,2.68-41.38-7.05-12.59-25.12-17.74-47.81-18.48Zm-1.17,23.21c2.46,0,5.13,.11,7.34,.49,7.19,.31,11.83,3.31,14.87,6.03,2.05,2.05,1.87,10.45,1.87,10.45-.53,4.91-2.28,8.21-5.09,12.59-4.2,5.54-7.99,6.79-15.54,8.3-8.97,1.12-19.69,.8-19.69,.8l8.57-38.3s3.56-.35,7.66-.36h0Z"
            />
            <path
              fill="currentColor"
              d="M367.37,.94l-4.82,24.37,34.42-.13-22.1,104.46,28.39-.54,22.77-104.73h36.03l5.22-23.3-99.91-.13Z"
            />
            <path
              fill="currentColor"
              d="M476.38,.94l-28.53,128.04h28.93l11.25-52.5,46.61-.54,4.69-22.23-46.34,.27,6.96-30.67,49.96-.27,4.96-23.04-78.48,.94Z"
            />
          </svg>
          @if (showFullBrand()) {
            <span [class]="wordmarkClass()">{{ GENERIC_TITLE }}</span>
          }
        </a>

        <!-- overflow-x-clip (not overflow-hidden) deliberately, and only while the full link list is
                     what's rendered: this row collapses to just the compact trigger's content width once
                     _navLinksFit() is false, and the dropdown panel it opens is deliberately *wider* than that
                     collapsed width (right-anchored, extending left from the trigger) — clipping unconditionally
                     would chop off the left half of that panel along with it. It's only needed at all to contain
                     the full link list's own horizontal overflow during the brief "measured true, about to be
                     corrected back to false" window (see checkNav below); once collapsed, there's nothing here
                     that still needs containing. "clip" over "hidden" for the axis itself: "hidden" on one axis
                     forces the other to a non-visible value too (the same axis-forcing quirk fixed elsewhere in
                     this app) and would clip the panel vertically; "clip" clips only the axis it's given. -->
        <div
          #navLinksRow
          class="text-muted-foreground relative flex min-w-0 flex-1 items-center gap-4 text-sm"
          [class.overflow-x-clip]="_navLinksFit()"
          (mouseenter)="menu.onModuleMenuEnter()"
          (mouseleave)="menu.onModuleMenuLeave()"
        >
          @if (_navLinksFit()) {
            <div
              class="flex min-w-0 items-center gap-4"
              [class.animate-nav-reveal]="navLinksReveal()"
            >
              @for (link of navLinks; track link.path) {
                <a
                  [routerLink]="link.path"
                  routerLinkActive="text-foreground font-medium"
                  [routerLinkActiveOptions]="{ exact: link.exact }"
                  class="hover:text-foreground shrink-0 whitespace-nowrap"
                  (mouseenter)="link.path === '/tracker' && preloadTracker()"
                  (focus)="link.path === '/tracker' && preloadTracker()"
                >
                  {{ link.label }}
                </a>
              }
              @if (auth.isLoggedIn()) {
                <a
                  routerLink="/profile"
                  routerLinkActive="text-foreground font-medium"
                  class="hover:text-foreground shrink-0 whitespace-nowrap"
                >
                  Profile
                </a>
              }
              @if (auth.isAdmin()) {
                <div
                  class="relative shrink-0"
                  (mouseenter)="menu.onConsoleMenuEnter()"
                  (mouseleave)="menu.onConsoleMenuLeave()"
                >
                  <a
                    routerLink="/console/spotting"
                    routerLinkActive="font-medium"
                    [routerLinkActiveOptions]="{ exact: true }"
                    class="text-destructive hover:text-destructive/80 flex items-center gap-1 whitespace-nowrap"
                  >
                    Console
                    <svg
                      viewBox="0 0 24 24"
                      class="size-3 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      aria-hidden="true"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6" />
                    </svg>
                  </a>
                  @if (menu.hoverCapable() && menu.consoleMenuOpen()) {
                    <div
                      class="bg-popover text-popover-foreground border-border absolute top-full right-0 z-30 mt-2 flex min-w-56 flex-col rounded-lg border py-2 text-sm shadow-md"
                      (keydown.escape)="menu.consoleMenuOpen.set(false)"
                    >
                      @for (link of consoleLinks; track link.path) {
                        <a
                          [routerLink]="link.path"
                          routerLinkActive="text-foreground font-medium bg-muted"
                          [routerLinkActiveOptions]="{ exact: link.exact }"
                          class="hover:bg-muted px-5 py-3"
                          (click)="menu.consoleMenuOpen.set(false)"
                        >
                          {{ link.label }}
                        </a>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          } @else {
            <app-nav-module-menu
              [open]="menu.moduleMenuOpen()"
              (openChange)="menu.moduleMenuOpen.set($event)"
              [hoverCapable]="menu.hoverCapable()"
              [links]="navLinks"
              [consoleLinks]="consoleLinks"
              [isLoggedIn]="auth.isLoggedIn()"
              [isAdmin]="auth.isAdmin()"
              [reveal]="navLinksReveal()"
              [currentModuleLabel]="currentModuleLabel()"
              (triggerClick)="menu.onModuleMenuTriggerClick()"
              (preloadTracker)="preloadTracker()"
            />
          }
        </div>
      </div>
      <div
        app-nav-icon-tray
        class="flex shrink-0 items-center gap-2"
        (accountRequested)="accountPanelOpen.set(true)"
      ></div>
    </div>

    <hlm-sheet [open]="accountPanelOpen()" (openChange)="accountPanelOpen.set($event)" side="right">
      <div hlmSheetHeader class="flex items-center justify-between gap-2">
        <h2 class="text-base font-semibold">Account</h2>
        <button
          type="button"
          class="text-muted-foreground hover:bg-muted hover:text-foreground -mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-full outline-none"
          aria-label="Close"
          title="Close"
          (click)="accountPanelOpen.set(false)"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div hlmSheetBody>
        <app-account-panel (loggedOut)="accountPanelOpen.set(false)" />
      </div>
    </hlm-sheet>
  `,
})
export class AppNavComponent {
  protected readonly auth = inject(AuthService);
  protected readonly uploads = inject(ImageUploadService);
  private readonly toast = inject(ToastService);
  private readonly theme = inject(ThemeService);
  protected readonly GENERIC_TITLE = GENERIC_TITLE;
  protected readonly navLinks = NAV_LINKS;
  protected readonly consoleLinks = CONSOLE_LINKS;
  private readonly hoverPreload = inject(HoverPreloadStrategy);

  /** Triggers preloading of the tracker route module on hover/focus. */
  protected preloadTracker(): void {
    this.hoverPreload.preloadRoute("tracker");
  }

  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly brandRow = viewChild.required<ElementRef<HTMLElement>>("brandRow");
  private readonly navLinksRow = viewChild.required<ElementRef<HTMLElement>>("navLinksRow");

  /** Open/close state for the collapsed module menu and the Console hover dropdown. */
  protected readonly menu = new NavMenuState();

  private readonly routeSegment = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url.split("/")[1] ?? ""),
    ),
    { initialValue: this.router.url.split("/")[1] ?? "" },
  );
  /** The nav-link label for whichever module is currently active — what shows on the collapsed
   * trigger. */
  protected readonly currentModuleLabel = computed(() => moduleLabelFor(this.routeSegment()));

  /** Whether the full "Malaysia Land Public Transport Fans" wordmark fits on one line at the
   * current width — measured, not breakpoint-guessed, so it switches to the short route title
   * at exactly the point it would otherwise wrap to a second line. Defaults to `false` (short
   * title) rather than `true`: a route title expanding into the full name once JS measures
   * enough room is unremarkable, whereas the reverse — briefly rendering the long name, then
   * shrinking it away — is the exact "flash of wrong state" pattern this app avoids elsewhere. */
  protected readonly _brandFits = signal(false);

  /** Same measure-don't-guess technique as `_brandFits`, applied to the module-links row
   * instead of the wordmark — whether the full link list fits on one line without wrapping.
   * Defaults to `false` (collapsed to the dropdown trigger) for the same "expanding is fine,
   * shrinking-after-the-fact reads as a flash of wrong state" reason. */
  protected readonly _navLinksFit = signal(false);

  /** The long wordmark is only worth showing in the "everything fits" state — the moment the
   * module links fold to their compact trigger, the brand name folds to its short form too,
   * rather than the two reacting to the available width independently. Without this, there's a
   * width band where the wordmark alone has room but the wordmark *and* the full link row
   * together don't, and the two measurements — each individually correct — visibly disagree. */
  protected readonly showFullBrand = computed(() => this._brandFits() && this._navLinksFit());

  protected readonly wordmarkClass = computed(() => {
    const animate = this.showFullBrand() && !hasRevealedWordmarkThisPageLoad;
    if (animate) {
      hasRevealedWordmarkThisPageLoad = true;
    }
    return wordmarkClassFor(animate);
  });

  protected readonly navLinksReveal = computed(() => {
    if (!hasRevealedNavLinksThisPageLoad) {
      hasRevealedNavLinksThisPageLoad = true;
      return true;
    }
    return false;
  });

  protected readonly accountPanelOpen = signal(false);

  /** Anchored-shadow cue for the sticky nav — see the `[class.shadow-lg]` host binding. A small
   * threshold rather than exactly 0 avoids the shadow flickering on/off from sub-pixel scroll
   * jitter right at the very top. */
  protected readonly _scrolled = signal(false);

  constructor() {
    // Fires once, on the pending→0 edge, regardless of which page actually queued the
    // upload(s) — this is the one thing mounted everywhere an upload could plausibly still be
    // running, so it's the natural place to tell the user it's now safe to close the tab.
    let wasUploading = false;
    effect(() => {
      const pending = this.uploads.pendingCount();
      if (pending === 0 && wasUploading) {
        this.toast.success(
          "Uploads complete",
          "All your photos have been uploaded — you can close this tab now.",
        );
      }
      wasUploading = pending > 0;
    });

    afterNextRender(() => {
      const el = this.brandRow().nativeElement;
      const measure = () => el.scrollWidth <= el.clientWidth;

      // Measures against whatever title is *currently* rendered — if that's the short one,
      // "fits" only proves the short one fits, not that the long one would too. Flipping to
      // true swaps in the long title, so re-verify shortly after, once the DOM has actually
      // caught up with that swap, correcting back down if it turns out not to fit. Without
      // this second pass, a title that happens to be measured while short (e.g. the very
      // first check, since `_brandFits` starts false) can get permanently stuck showing the
      // long title even where it doesn't fit — since nothing else re-triggers a
      // ResizeObserver callback for a content-only change with no element resize.
      //
      // Uses setTimeout rather than requestAnimationFrame for that re-check: confirmed live
      // (mobile-viewport emulation, devicePixelRatio 2) that rAF can simply not fire here for
      // seconds at a time, presumably throttled as part of the emulation, which left this
      // permanently stuck on the very bug it exists to fix. A timer doesn't depend on the
      // paint pipeline at all, so it isn't subject to that throttling.
      const check = () => {
        const fits = measure();
        this._brandFits.set(fits);
        if (fits) {
          setTimeout(() => this._brandFits.set(measure()), 0);
        }
      };

      check();
      const ro = new ResizeObserver(check);
      ro.observe(el);
      this.destroyRef.onDestroy(() => ro.disconnect());

      const navEl = this.navLinksRow().nativeElement;
      const measureNav = () => navEl.scrollWidth <= navEl.clientWidth;
      const checkNav = () => {
        const fits = measureNav();
        this._navLinksFit.set(fits);
        if (fits) {
          setTimeout(() => this._navLinksFit.set(measureNav()), 0);
        }
      };

      checkNav();
      const navRo = new ResizeObserver(checkNav);
      navRo.observe(navEl);
      this.destroyRef.onDestroy(() => navRo.disconnect());

      // Belt-and-suspenders alongside the ResizeObservers above, needed specifically for the
      // brandRow-narrows-then-widens-again case: once _navLinksFit flips false, navLinksRow's
      // rendered content collapses down to just the compact trigger button, and nothing in
      // this row's ancestor chain (justify-between doesn't grow its children) forces it back
      // out to fill the available width — so navLinksRow's own box stays pinned to that small
      // trigger's size even as the window grows back to desktop width, and a ResizeObserver
      // watching *that element's own box* never fires again to re-offer the full link list.
      // A plain window resize listener re-measures unconditionally, independent of whether
      // the observed elements' own boxes happened to change.
      const onWindowResize = () => {
        check();
        checkNav();
      };
      window.addEventListener("resize", onWindowResize, { passive: true });
      this.destroyRef.onDestroy(() => window.removeEventListener("resize", onWindowResize));

      this.menu.hoverCapable.set(window.matchMedia("(hover: hover) and (pointer: fine)").matches);

      const onScroll = () => this._scrolled.set(window.scrollY > 4);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
      this.destroyRef.onDestroy(() => window.removeEventListener("scroll", onScroll));
    });

    // Keeps the feedback form's own light/dark styling in lockstep with this app's theme —
    // `resolvedTheme` (not the raw "system" mode) is what to feed it: it's already the
    // concrete light/dark this app is actually painting right now, tracking the OS
    // preference live when the user's chosen mode *is* "system" rather than needing Sentry's
    // widget to separately re-derive that from scratch.
    effect(() => {
      Sentry.getFeedback()?.setTheme(this.theme.resolvedTheme());
    });
  }
}
