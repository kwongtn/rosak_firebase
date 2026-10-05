import { isPlatformBrowser } from "@angular/common";
import {
  Component,
  PLATFORM_ID,
  afterNextRender,
  computed,
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
 * Grace window between the pointer leaving the trigger and the tooltip closing. Matches
 * InfoPopover's central 300ms hover-close default (and the nav's): one value for "hover away and it
 * goes", so a tooltip never vanishes under a cursor that is merely crossing past it.
 */
const TOOLTIP_CLOSE_DELAY_MS = 300;

/**
 * The countdown ring's radius, in the ring's OWN 22-unit viewBox — the tracker side panel's
 * CountdownRingComponent geometry, copied here exactly. The spinner and the check keep the
 * 24-unit viewBox every other icon in the app uses; only the ring moved off it.
 */
const RING_RADIUS = 9;

/**
 * Circumference of that ring: the `stroke-dasharray` that draws one full turn, so `stroke-dashoffset`
 * can be read as "how much of the turn is left". Rounded to 2dp because the value is also an
 * attribute a spec asserts on, and `2 * PI * 9` in full binary floating point is not a thing anyone
 * should have to type.
 */
const RING_CIRCUMFERENCE = Math.round(2 * Math.PI * RING_RADIUS * 100) / 100;

/**
 * The home page's refresh control: the fixed-cadence countdown IS the button, and a click refreshes
 * the whole page (line statuses + the Today feed + the Last Week first page) through the store's
 * shared `PollingSource` — the same beat this row counts down, so the two can never disagree.
 *
 * Rendered ONCE, by `HomeHeroComponent`, in the hero's headline row — the same row as the "All N
 * lines running normally" sentence, so the freshness it states sits beside the claim it qualifies.
 * There is no second instance and no visibility gate: the page's old mobile copy is gone, because the
 * sticky mobile action bar carries its own Refresh button on the very same store beat, and one beat
 * needs one countdown on the page. It shows at every width, SSR and hydration alike — the markup is
 * width-agnostic, so nothing here is `matchMedia`-driven.
 *
 * The transient confirmation is the subtle part, and the reason this component owns real state. It
 * is armed by a CLICK only (an automatic poll tick must not pop a "Updated" at a passive reader)
 * and then requires the store's `isRefreshing` to actually go true and settle false again — plus a
 * clean `hasError` at that moment. `HomeStore.isLoading` cannot supply that transition: it is
 * pristine-first-fetch-only, so after the first load it never becomes true again and a
 * pending-flag-plus-`isLoading` effect can never re-run. `HomeStore.isRefreshing` is built on the
 * raw `isFetching` flag and is the only member that can see a reload.
 *
 * A click therefore reads as THREE states, in this order: "Updating" (while the refresh runs) →
 * "Updated" (only after a CLICK-armed refresh settled clean) → the countdown again. `_isUpdating`
 * is the first of them, and it tracks `isRefreshing` rather than the click: any refresh the page is
 * visibly doing says so — the beat's, a click's, a reload the edit sheet triggers — with the
 * PRISTINE initial load as the only exclusion, since that is a first paint and not a refresh. What stays
 * click-only is the CONFIRMATION: `_showRefreshed` is armed by a click alone, so a reader watching
 * the 30s beat is never told "just refreshed" on a timer they did not set. The countdown branch sits
 * LAST on purpose — `refreshNow()` resets the beat, so an in-flight click would otherwise flash a
 * freshly-reset "Refreshing in 30s" that claims nothing is happening.
 *
 * Three things this component owns because the page cannot: the arm's own EXPIRY (`ARM_EXPIRY_MS`
 * — an arm whose request never started would otherwise be consumed by a later automatic tick),
 * the settle-edge's deliberately conservative `hasError` suppression, and the "Updating" label,
 * which has to be torn down on BOTH exits out of an armed window (the settle edge and the stale-arm
 * expiry) or a no-op click would say "Updating" for the rest of the session.
 *
 * **The countdown DRAWS itself** — an SVG ring whose arc drains as the beat runs down, rather than
 * a spinner. Nothing here polls: `_ringOffset` is a pure `computed` over the store's own
 * `secondsRemaining()` / `intervalMs()`, so the arc and the "Refreshing in Ns" text are two readings
 * of the same two numbers and cannot drift. The "Updating" branch is the one state a ring cannot
 * express (there is no fraction — a refresh is in flight, not pending), so it keeps an
 * indeterminate counter-clockwise spinner; the green check confirms a click-armed settle. Both the
 * arc's transition and the spinner go inert under `prefers-reduced-motion: reduce`.
 *
 * All three glyphs render inside ONE always-present fixed slot (`size-7`, glyph only) copied from
 * the tracker side panel — `CountdownRingComponent`'s ring slot and `LayerChecklistComponent`'s
 * "contents vary" one — because the button shrink-wraps to its visible content: without a constant
 * slot, swapping a 22px ring for a 14px spinner would re-flow the row (and its label) on every
 * state change. The ring itself is the tracker's geometry too, explicit width/height included.
 *
 * It also owns the "Click to Refresh Now" tooltip: hover-open on pointer devices, tap-toggle on
 * everything else (a touch reader can never hover it into view), a 300ms deferred close
 * (`TOOLTIP_CLOSE_DELAY_MS`, the app-wide hover default) cancelled by re-entry, and a `z-50` panel
 * so it floats above the page instead of under the hero's status line.
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
      <!-- ONE fixed glyph slot shared by ALL THREE states — the tracker rows' own pattern
           (CountdownRingComponent's size-7 ring slot; LayerChecklistComponent's "fixed-size slot —
           always rendered, contents vary"): this button shrink-wraps to its visible content, so a
           22px ring, a 14px spinner and a 14px check would each re-flow the row as the state
           changes. One always-rendered slot of constant size is what keeps the label beside it from
           shifting. The slot holds ONLY the glyph — every label stays a direct child of the button,
           right after the slot. -->
      <span class="inline-flex size-7 shrink-0 items-center justify-center">
        @if (_isUpdating()) {
          <!-- The tracker checklist's spinner glyph (size-3.5 over a 24-unit viewBox) at the
               tracker's own 1s speed, but in REVERSE — the one direction nothing else on the page
               animates in, so "the page is working on it" can never read as "the countdown is
               running", which is a draining ring rather than a spin at all.
               ⚠️ The direction lives INSIDE the shorthand on purpose. The animation shorthand resets
               every animation sub-property, so a separate [animation-direction:reverse] would be
               dropped back to normal by it and be dead markup.
               It is an arbitrary-property UTILITY rather than an inline style because reduced motion
               has to be able to switch it off, and an inline animation outranks every class in the
               cascade — including the motion-reduce one that would. (No backticks in this comment:
               inside an inline template literal they would close it.) -->
          <svg
            class="text-muted-foreground size-3.5 [animation:spin_1s_linear_infinite_reverse] motion-reduce:[animation:none]"
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
        } @else if (store.polling.intervalMs() !== null) {
          <!-- 🔴 The countdown DRAWS ITSELF instead of spinning — the tracker side panel's ring
               (CountdownRingComponent) at its exact geometry: an EXPLICITLY 22px svg — this one
               used to carry no width/height at all, so its viewBox rendered at the CSS initial size
               and the "ring" came out a 112px blob — centered by the fixed size-7 slot, with r=9
               circles at cx/cy 11, a 20%-muted track and a round-capped primary arc. A spinning
               spinner says "something is happening"; a ring whose arc shrinks says "and here is how
               long until the next refresh", which is the one fact this button exists to state. It
               reads the store's own secondsRemaining()/intervalMs() pair, so it cannot disagree
               with the text beside it or with the beat.

               The dash-array is one full turn and the dash-offset is how much of it is left,
               which makes the fraction a pure function of the two signals — no second timer and no
               per-frame JS anywhere. The transition stays 1s/linear because THIS control's width
               updates once per second, while the tracker's ring retimes to its 100ms source tick
               (hence its own shorter duration); motion-reduce:transition-none drops it so a reader
               who asked for reduced motion sees the arc jump straight to its new length instead:
               same information, no tween. -->
          <svg
            width="22"
            height="22"
            viewBox="0 0 22 22"
            class="-rotate-90"
            fill="none"
            aria-hidden="true"
            data-testid="line-refresh-ring"
          >
            <circle
              cx="11"
              cy="11"
              [attr.r]="RING_RADIUS"
              stroke="currentColor"
              stroke-width="2.5"
              class="text-muted-foreground/20"
            />
            <circle
              cx="11"
              cy="11"
              [attr.r]="RING_RADIUS"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              class="text-primary transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none"
              data-testid="line-refresh-ring-arc"
              [attr.stroke-dasharray]="_ringCircumference"
              [attr.stroke-dashoffset]="_ringOffset()"
            />
          </svg>
        }
      </span>
      @if (_isUpdating()) {
        <span
          class="text-muted-foreground text-xs"
          data-testid="line-refresh-updating"
          role="status"
        >
          Updating
        </span>
      } @else if (_showRefreshed()) {
        <span
          class="text-green-600 dark:text-green-400 text-xs"
          data-testid="line-refresh-confirmation"
          role="status"
        >
          Updated
        </span>
      } @else if (store.polling.intervalMs() !== null) {
        <span class="text-muted-foreground text-xs">
          Refreshing in {{ store.polling.secondsRemaining() }}s
        </span>
      }
      @if (_refreshTooltipOpen()) {
        <span
          role="tooltip"
          data-testid="line-refresh-tooltip"
          class="bg-popover text-popover-foreground border-border pointer-events-none absolute top-full right-0 z-50 mt-1.5 rounded-md border px-2 py-1 text-xs font-normal whitespace-nowrap shadow-md"
        >
          Click to Refresh Now
        </span>
      }
    </button>
  `,
  /**
   * The control shrink-wraps to its VISIBLE content — the ring and its label, the spinner and
   * "Updating", or the check and "Updated" — so the tap target is exactly what the reader can see
   * instead of an invisible full-row strip. `:host` therefore goes `inline-block` in place of the `width: 100%`
   * block it used to claim, and the `w-full` that used to sit on the button is gone with it: a
   * full-width button inside a shrink-wrapped host would only put the invisible hit area back.
   *
   * Alignment is no longer this component's business. The hero's headline row is a
   * `flex items-start justify-between gap-3` line and this control sits in a `shrink-0` slot at its
   * end, so the shrink-wrapped control parks itself at the right edge of the sentence without the
   * control pretending to own a layout it no longer takes part in. The trigger is not a row, so it
   * must not be styled like one.
   */
  styles: [":host { display: inline-block; }"],
})
export class HomeRefreshControlComponent implements OnDestroy {
  protected readonly store = inject(HomeStore);

  protected readonly RING_RADIUS = RING_RADIUS;
  protected readonly _ringCircumference = RING_CIRCUMFERENCE;

  /**
   * How much of the ring is EMPTY, as a `stroke-dashoffset` — 0 is a full turn, the whole
   * circumference is none of it.
   *
   * 🔴 Computed from `secondsRemaining() / intervalMs()`, deliberately NOT from
   * `PollingSource.percentRemaining`. The two are not interchangeable: `scheduleNext()` resets
   * `secondsRemaining` on the same edge but leaves `percentRemaining` to the next 1s tick, so
   * immediately after a refresh the published percentage still describes the beat that just ended —
   * the ring would visibly refuse to refill for up to a second while claiming to be full. Deriving
   * the fraction from the pair the button already prints removes the window entirely.
   *
   * Both signals are guarded rather than trusted: a null interval and a countdown that overshot its
   * own length both clamp to the ends of the range instead of inverting the ring.
   */
  protected readonly _ringOffset = computed(() => {
    const totalSeconds = (this.store.polling.intervalMs() ?? 0) / 1000;
    if (totalSeconds <= 0) {
      return RING_CIRCUMFERENCE;
    }
    const fraction = Math.min(1, Math.max(0, this.store.polling.secondsRemaining() / totalSeconds));
    return Math.round(RING_CIRCUMFERENCE * (1 - fraction) * 100) / 100;
  });

  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The transient "Updated" confirmation, shown only after a CLICK-armed refresh settles clean. */
  protected readonly _showRefreshed = signal(false);

  /** "Updating" — up while ANY refresh the page is doing is in flight (a click, the beat, any
   * other reload), and down on that refresh's settle edge or on a click arm's expiry. The PRISTINE
   * initial load is the one exclusion: it is not a refresh, and the page's first paint stays on its
   * countdown. See the effect for how the exclusion is derived.
   *
   *  ⚠️ Not the same signal as the confirmation, and deliberately not click-armed: telling a passive
   * reader that a refresh they did not ask for is running is honest, while telling them "Updated"
   * every 30 seconds is noise — `_showRefreshed` keeps the click-only rule. Both instances of this
   * control show the label (they share the store's one beat; only one is visible per breakpoint),
   * and each still arms the CONFIRMATION off its own click alone. */
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

  /** Pending deferred tooltip close; see `TOOLTIP_CLOSE_DELAY_MS`. Cleared on re-entry, on the tap
   * toggle and on destroy. */
  private _tooltipCloseTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const isRefreshing = this.store.isRefreshing();

      // The pristine initial load is not a refresh: the stores' loading flags are
      // pristine-first-fetch-only across all three resources, so they are true exactly while the
      // page's first fetch is in flight and never again. Excluding that window keeps the very first
      // paint on its countdown; every LATER refresh — the beat, a click, any reload — is work the
      // reader can see, so every one of them says "Updating" while it runs.
      const pristineInitialLoad = this.store.isLoading() || this.store.isLoadingLastWeek();
      if (isRefreshing && (this._refreshPending() || !pristineInitialLoad)) {
        this._isUpdating.set(true);
      }

      if (!this._refreshPending()) {
        // Not armed by a click. The beat's own refresh says "Updating" too now, but it must NEVER
        // confirm: "Updated" stays click-armed so a passive reader is not told "just refreshed"
        // every 30 seconds. This branch only has to end the label on its settle edge — clearing it
        // while `isRefreshing` is still true would flicker the label off mid-flight.
        if (!isRefreshing) {
          this._isUpdating.set(false);
        }
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
      clearTimeout(this._tooltipCloseTimer);
      this._tooltipCloseTimer = undefined;
      this._refreshTooltipOpen.set(true);
    }
  }

  /** Deferred, so a pointer merely crossing off the trigger (or back onto it) does not blink the
   * tooltip away; see `TOOLTIP_CLOSE_DELAY_MS`. Same shape as `InfoPopover`'s host leave. */
  protected onRefreshHoverLeave(): void {
    if (this._hoverCapable()) {
      clearTimeout(this._tooltipCloseTimer);
      this._tooltipCloseTimer = setTimeout(() => {
        this._tooltipCloseTimer = undefined;
        this._refreshTooltipOpen.set(false);
      }, TOOLTIP_CLOSE_DELAY_MS);
    }
  }

  /** Refresh the whole page and show "Updating" until it settles; a touch device additionally
   * toggles the "Click to Refresh Now" tooltip, which it can never hover into view.
   *
   *  The label is raised HERE rather than waiting for the effect to notice `isRefreshing`: the beat
   *  only flips once the request is actually on the wire, which is a round trip after the click the
   *  reader is watching for an answer to. This write is the one that is gated on being a click at
   *  all — everything after it is driven by `isRefreshing`, beat refreshes included. */
  protected onRefreshClick(): void {
    this._isUpdating.set(true);
    this._refreshPending.set(true);
    this._refreshStarted.set(false);
    this._startArmExpiry();
    this.store.polling.refreshNow();
    if (!this._hoverCapable()) {
      // Touch toggle: the deferred close belongs to the hover path, so it must not survive into a tap.
      clearTimeout(this._tooltipCloseTimer);
      this._tooltipCloseTimer = undefined;
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
    clearTimeout(this._tooltipCloseTimer);
  }
}
