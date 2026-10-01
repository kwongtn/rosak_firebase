import { isPlatformBrowser } from "@angular/common";
import {
  Component,
  PLATFORM_ID,
  afterNextRender,
  effect,
  inject,
  signal,
  type OnDestroy,
} from "@angular/core";

import { HomeStore } from "../data/home.store";

/** How long the "Updated" confirmation stays up before the countdown takes over again. */
const REFRESHED_VISIBLE_MS = 2000;

/**
 * How long a click's arm survives without ever observing its request IN FLIGHT.
 *
 * Without this, an arm whose refresh turned out to be a no-op (nothing to fetch, a dropped click,
 * a beat already in progress) sat armed forever, and the next AUTOMATIC 30s tick — which the user
 * never asked for — would consume it and pop a "Updated". Five seconds is far longer than a local
 * round trip needs to flip `isFetching` true, and short enough that the leak is invisible in
 * practice. It only ever fires while `_refreshStarted` is still false: an arm that DID observe its
 * request in flight is a real one, and its settle decides, however slow that request is.
 */
const ARM_EXPIRY_MS = 5000;

/**
 * The home page's refresh control: the fixed-cadence countdown IS the button, and a click refreshes
 * the whole page (line statuses + the Today feed + the Last Week first page) through the store's
 * shared `PollingSource` — the same beat the countdown counts down, so the two can never disagree.
 *
 * Extracted (rather than kept inline in `HomePage`) because the page renders it in TWO places: on
 * mobile it heads the links section, on desktop it heads the line-status section. The host gates
 * each instance with a Tailwind visibility class (`lg:hidden` / `hidden lg:block`) — CSS only, no
 * `matchMedia`-driven placement, so SSR and hydration agree on the markup.
 *
 * The transient confirmation is the subtle part, and the reason this component owns real state. It
 * is armed by a CLICK only (an automatic poll tick must not pop a "Updated" at a passive reader)
 * and then requires the store's `isRefreshing` to actually go true and settle false again — plus a
 * clean `hasError` at that moment. `HomeStore.isLoading` cannot supply that transition: it is
 * pristine-first-fetch-only, so after the first load it never becomes true again and a
 * pending-flag-plus-`isLoading` effect can never re-run. `HomeStore.isRefreshing` is built on the
 * raw `isFetching` flag and is the only member that can see a reload.
 *
 * A click therefore reads as THREE states, in this order: "Updating" (from the click itself, for as
 * long as THIS click's own request is outstanding) → "Updated" (only after that request settled
 * clean) → the countdown again. `_isUpdating` is the first of them, and it is set by the CLICK
 * rather than by `isRefreshing`: the beat's own automatic refreshes must leave a passive reader's
 * countdown alone, and each of the page's two instances answers only for the click it received.
 * The countdown branch sits LAST on purpose — `refreshNow()` resets the beat, so an in-flight click
 * would otherwise flash a freshly-reset "Refreshing in 30s" that claims nothing is happening.
 *
 * Three things this component owns because the page cannot: the arm's own EXPIRY (`ARM_EXPIRY_MS`
 * — an arm whose request never started would otherwise be consumed by a later automatic tick),
 * the settle-edge's deliberately conservative `hasError` suppression, and the "Updating" label,
 * which has to be torn down on BOTH exits from an armed window (the settle edge and the stale-arm
 * expiry) or a no-op click would say "Updating" for the rest of the session.
 */
@Component({
  selector: "app-home-refresh-control",
  template: `
    <button
      type="button"
      class="relative flex cursor-pointer flex-wrap items-center justify-end gap-2"
      data-testid="line-refresh-countdown"
      aria-label="Refresh page data now"
      (mouseenter)="onRefreshHoverEnter()"
      (mouseleave)="onRefreshHoverLeave()"
      (click)="onRefreshClick()"
    >
      @if (_isUpdating()) {
        <!-- Same spinner as the countdown below (identical markup, so the row does not change
             shape or colour between the two states) but spun SLOWLY at 3s and reversed, i.e.
             counter-clockwise: the one direction nothing else on the page animates in, so "the
             page is working on it" never reads as "the countdown is running". The countdown's own
             1s spin is deliberately left alone.
             ⚠️ The direction lives INSIDE the shorthand on purpose. The animation shorthand resets
             every animation sub-property — an inline one drops animation-direction back to normal
             and beats the [animation-direction:reverse] class, making that class dead markup.
             Stating reverse in the shorthand is what actually turns it. (No backticks in this
             comment: inside an inline template literal they would close it.) -->
        <svg
          class="text-muted-foreground size-3.5 [animation-direction:reverse]"
          style="animation: spin 3s linear infinite reverse"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            stroke-width="2"
            stroke-opacity="0.25"
          />
          <path
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
        <span
          class="text-muted-foreground text-xs"
          data-testid="line-refresh-updating"
          role="status"
        >
          Updating
        </span>
      } @else if (_showRefreshed()) {
        <svg
          class="text-green-600 dark:text-green-400 size-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span
          class="text-green-600 dark:text-green-400 text-xs"
          data-testid="line-refresh-confirmation"
          role="status"
        >
          Updated
        </span>
      } @else if (store.polling.intervalMs() !== null) {
        <svg
          class="text-muted-foreground size-3.5 [animation-direction:reverse]"
          style="animation: spin 1s linear infinite"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            stroke-width="2"
            stroke-opacity="0.25"
          />
          <path
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
        <span class="text-muted-foreground text-xs">
          Refreshing in {{ store.polling.secondsRemaining() }}s
        </span>
      }
      @if (_refreshTooltipOpen()) {
        <span
          role="tooltip"
          data-testid="line-refresh-tooltip"
          class="bg-popover text-popover-foreground border-border pointer-events-none absolute top-full right-0 z-10 mt-1.5 rounded-md border px-2 py-1 text-xs font-normal whitespace-nowrap shadow-md"
        >
          Click to Refresh Now
        </span>
      }
    </button>
  `,
  /**
   * The control shrink-wraps to its VISIBLE content — the spinner and the label — so the tap target
   * is exactly what the reader can see instead of an invisible full-row strip. `:host` therefore
   * goes `inline-block` in place of the `width: 100%` block it used to claim, and the `w-full` that
   * used to sit on the button is gone with it: a full-width button inside a shrink-wrapped host
   * would only put the invisible hit area back.
   *
   * Alignment is no longer this component's business. Each page gate is a `flex justify-end` row
   * (`home.page.ts`), and a flex item's width is its CONTENT's — so the shrink-wrapped control still
   * parks itself at the right edge of its section, without the control pretending to own a layout
   * it no longer takes part in. The trigger is not a row, so it must not be styled like one.
   */
  styles: [":host { display: inline-block; }"],
})
export class HomeRefreshControlComponent implements OnDestroy {
  protected readonly store = inject(HomeStore);

  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The transient "Updated" confirmation, shown only after a CLICK-armed refresh settles clean. */
  protected readonly _showRefreshed = signal(false);

  /** The click's own "Updating" label: up from the click itself until this click's request settles
   * (or its arm expires). Armed by the CLICK, not by `isRefreshing` — an automatic beat must leave
   * a passive reader's countdown alone, and the page's two instances each speak only for their own
   * click. Cleared on both exits from an armed window; see the effect and `_startArmExpiry`. */
  protected readonly _isUpdating = signal(false);

  /** Armed by a click; cleared once the armed refresh has settled (clean or not). */
  private readonly _refreshPending = signal(false);

  /** Latch: this armed refresh was actually observed IN FLIGHT. Without it, a click whose request
   * never started (nothing to fetch, an immediate no-op) would flash "Updated" on the spot. */
  private readonly _refreshStarted = signal(false);

  private _refreshedTimer: ReturnType<typeof setTimeout> | undefined;

  /** Bounds an arm whose request never went in flight; see `ARM_EXPIRY_MS`. Cleared by
   * `_startArmExpiry` (on re-arm), by the effect on the settle edge, and by `ngOnDestroy`. */
  private _armExpiryTimer: ReturnType<typeof setTimeout> | undefined;

  /** Hover-capability for the tooltip: measured (not guessed), the same way
   * `StatusInfoChipComponent`/`InfoPopover` do — pointer devices hover, everything else taps. */
  protected readonly _hoverCapable = signal(false);
  protected readonly _refreshTooltipOpen = signal(false);

  constructor() {
    effect(() => {
      const isRefreshing = this.store.isRefreshing();
      if (!this._refreshPending()) {
        // Not armed by a click: an automatic poll tick never confirms anything.
        return;
      }
      if (isRefreshing) {
        this._refreshStarted.set(true);
        return;
      }
      if (!this._refreshStarted()) {
        // Armed but never in flight — nothing has refreshed, so nothing to confirm.
        return;
      }
      this._refreshPending.set(false);
      this._refreshStarted.set(false);
      // "Updating" ends HERE, on the settle edge, and BEFORE the `hasError` gate below: an errored
      // refresh confirms nothing, but the label still has to come down or it would stay up for
      // good. This and the stale-arm expiry are the ONLY two exits out of an armed window, so both
      // have to clear it — teardown on one edge only is how a no-op click ends up stuck saying
      // "Updating" with nothing at all in flight.
      this._isUpdating.set(false);
      // The arm is consumed HERE — on the settle edge, whether or not it confirms. The expiry
      // timer's only job is the never-started arm, so it has nothing left to guard.
      clearTimeout(this._armExpiryTimer);
      this._armExpiryTimer = undefined;
      if (this.store.hasError()) {
        // Settled on an error: the retry banner owns that story, so confirm nothing.
        //
        // DELIBERATELY CONSERVATIVE, and worth reading before "fixing": `HomeStore.hasError` is a
        // page-wide OR across all three resources (lines, Today feed, Last Week). A stale error
        // left over from an unrelated resource therefore suppresses this confirmation even when
        // the click's own request succeeded. That is the intended trade — a false "Updated" on a
        // page that is partly broken is worse than a missing one, and the banner is already telling
        // the reader something is wrong. Do NOT narrow this to "did MY request fail"; the store
        // cannot answer that, and guessing is how a real failure gets dressed up as a success.
        return;
      }
      this._showRefreshed.set(true);
      clearTimeout(this._refreshedTimer);
      this._refreshedTimer = setTimeout(() => this._showRefreshed.set(false), REFRESHED_VISIBLE_MS);
    });

    if (this._isBrowser) {
      afterNextRender(() => {
        if (typeof window.matchMedia === "function") {
          this._hoverCapable.set(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
        }
      });
    }
  }

  protected onRefreshHoverEnter(): void {
    if (this._hoverCapable()) {
      this._refreshTooltipOpen.set(true);
    }
  }

  protected onRefreshHoverLeave(): void {
    if (this._hoverCapable()) {
      this._refreshTooltipOpen.set(false);
    }
  }

  /** Refresh the whole page and show "Updating" until it settles; a touch device additionally
   * toggles the "Click to Refresh Now" tooltip, which it can never hover into view. */
  protected onRefreshClick(): void {
    this._isUpdating.set(true);
    this._refreshPending.set(true);
    this._refreshStarted.set(false);
    this._startArmExpiry();
    this.store.polling.refreshNow();
    if (!this._hoverCapable()) {
      this._refreshTooltipOpen.update((open) => !open);
    }
  }

  /**
   * Arm the stale-arm guard, restarting it on every click (a double click must leave ONE timer, and
   * it must be the NEWEST arm's — a leaked timer from a superseded arm would expire a live one).
   */
  private _startArmExpiry(): void {
    clearTimeout(this._armExpiryTimer);
    this._armExpiryTimer = setTimeout(() => {
      this._armExpiryTimer = undefined;
      if (this._refreshStarted()) {
        // In flight after all: a slow request, not a stale arm. The settle decides.
        return;
      }
      this._refreshPending.set(false);
      // Same teardown the settle edge does, minus the confirmation: nothing refreshed, so there is
      // nothing to confirm — but the click must still stop saying "Updating", or the label would
      // outlive the only window it describes.
      this._isUpdating.set(false);
    }, ARM_EXPIRY_MS);
  }

  ngOnDestroy(): void {
    clearTimeout(this._refreshedTimer);
    clearTimeout(this._armExpiryTimer);
  }
}
