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
      @if (_showRefreshed()) {
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
})
export class HomeRefreshControlComponent implements OnDestroy {
  protected readonly store = inject(HomeStore);

  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The transient "Updated" confirmation, shown only after a CLICK-armed refresh settles clean. */
  protected readonly _showRefreshed = signal(false);

  /** Armed by a click; cleared once the armed refresh has settled (clean or not). */
  private readonly _refreshPending = signal(false);

  /** Latch: this armed refresh was actually observed IN FLIGHT. Without it, a click whose request
   * never started (nothing to fetch, an immediate no-op) would flash "Updated" on the spot. */
  private readonly _refreshStarted = signal(false);

  private _refreshedTimer: ReturnType<typeof setTimeout> | undefined;

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
      if (this.store.hasError()) {
        // Settled on an error: the retry banner owns that story, so confirm nothing.
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

  /** Refresh the whole page and arm the "Updated" confirmation; a touch device additionally
   * toggles the "Click to Refresh Now" tooltip, which it can never hover into view. */
  protected onRefreshClick(): void {
    this._refreshPending.set(true);
    this._refreshStarted.set(false);
    this.store.polling.refreshNow();
    if (!this._hoverCapable()) {
      this._refreshTooltipOpen.update((open) => !open);
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this._refreshedTimer);
  }
}
