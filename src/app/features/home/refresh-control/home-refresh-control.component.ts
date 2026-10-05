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

/**
 * How long the "Updated" confirmation stays up before the countdown takes over again. Short enough
 * to read as a flash of acknowledgement rather than a state: the beat fires every 30s, and a 2s
 * flash meant the row was showing "Updated" one time in fifteen — long enough to feel like a
 * lingering status, short enough that a reader who looked away missed it.
 */
const REFRESHED_VISIBLE_MS = 500;

/**
 * How long a click's own "Updating" survives WITHOUT ever observing a request IN FLIGHT.
 *
 * The click raises the label synchronously, because `refreshNow()` only flips `isRefreshing` once
 * the request is actually on the wire — a round trip after the click the reader is watching for an
 * answer to. If that request never appears (nothing to fetch, a dropped click, a beat already
 * running), nothing would ever take the label back down and the row would claim "Updating" for the
 * rest of the session. Five seconds is far longer than a local round trip needs to flip
 * `isFetching` true, and short enough that the leak is invisible in practice. It only ever clears
 * the LABEL: it must never clear a live refresh (a slow request that started late), which the
 * `_sawRefresh` guard below is what makes safe.
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
 * CountdownRingComponent geometry, copied here exactly. The spinner and the check render at that
 * same 22×22 so all three glyphs occupy one identical size inside the slot.
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
 * requires the store's `isRefreshing` to actually go true and settle false again — plus a clean
 * `hasError` at that moment — and that is deliberately NOT click-armed: ANY refresh the page visibly
 * completes confirms, the beat's own included, because a reader who watched the row change is owed
 * the same "Updated" a reader who clicked gets. The confirmation is a 500ms flash, not a state, so
 * it cannot become the noise that a 30s-cadence "Updated" would be. `HomeStore.isLoading` cannot
 * supply the transition at all: it is pristine-first-fetch-only, so after the first load it never
 * becomes true again and a pending-flag-plus-`isLoading` effect can never re-run.
 * `HomeStore.isRefreshing` is built on the raw `isFetching` flag and is the only member that can see
 * a reload.
 *
 * So a refresh reads as THREE states, in this order: "Updating" (while the refresh runs) → "Updated"
 * (after it settles clean) → the countdown again. `_isUpdating` tracks `isRefreshing` rather than
 * the click: any refresh the page is visibly doing says so — the beat's, a click's, a reload the
 * edit sheet triggers — with the PRISTINE initial load as the only exclusion, since that is a first
 * paint and not a refresh. What the exclusion buys is both states: the first paint neither says
 * "Updating" nor pops "Updated" for data that was never on screen to be stale. The countdown branch
 * sits LAST on purpose — `refreshNow()` resets the beat, so an in-flight click would otherwise flash
 * a freshly-reset "Refreshing in 30s" that claims nothing is happening.
 *
 * Three things this component owns because the page cannot: the click's "Updating" EXPIRY
 * (`ARM_EXPIRY_MS` — a label raised for a request that never started would outlive the only window
 * it describes), the settle-edge's deliberately conservative `hasError` suppression, and the
 * `_lastUpdatedAt` stamp the tooltip reports.
 *
 * **The countdown DRAWS itself** — an SVG ring whose arc drains as the beat runs down, rather than
 * a spinner. Nothing here polls: `_ringOffset` is a pure `computed` over the store's own
 * `secondsRemaining()` / `intervalMs()`, so the arc and the "Refreshing in Ns" text are two readings
 * of the same two numbers and cannot drift. The "Updating" branch is the one state a ring cannot
 * express (there is no fraction — a refresh is in flight, not pending), so it keeps an
 * indeterminate counter-clockwise spinner at the ring's own 22×22; the green check confirms a clean
 * settle. Both the arc's transition and the spinner go inert under `prefers-reduced-motion: reduce`.
 *
 * All three glyphs render 22×22 inside ONE always-present fixed slot (`size-7`, glyph only) copied
 * from the tracker side panel — `CountdownRingComponent`'s ring slot and `LayerChecklistComponent`'s
 * "contents vary" one — for two reasons: the button shrink-wraps to its visible content, so without
 * a constant slot every state change would re-flow the row; and the slot sits AFTER the label, so
 * the circle is pinned to the button's right edge and stays put when the label's own width changes
 * ("30s" → "9s") under it. The ring itself is the tracker's geometry too, explicit width/height
 * included.
 *
 * It also owns the "Click to Refresh Now" tooltip: hover-open on pointer devices, tap-toggle on
 * everything else (a touch reader can never hover it into view), a 300ms deferred close
 * (`TOOLTIP_CLOSE_DELAY_MS`, the app-wide hover default) cancelled by re-entry, and a `z-50` panel
 * so it floats above the page instead of under the hero's status line. The tooltip's second line
 * answers the question a countdown cannot ("how stale is this RIGHT NOW?") with a relative stamp
 * taken from `_lastUpdatedAt`.
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
      <!-- ONE fixed glyph slot shared by ALL THREE states, and it comes AFTER the label chain on
           purpose. The tracker rows' own pattern (CountdownRingComponent's size-7 ring slot;
           LayerChecklistComponent's "fixed-size slot — always rendered, contents vary") keeps the
           button from re-flowing when a 22px ring swaps for a spinner, and putting it LAST keeps
           the circle pinned to the row's right edge: the label's own width changes under it
           ("30s" → "9s"), and a LEADING glyph would travel sideways with every one of those
           changes. The slot holds ONLY the glyph — every label stays a direct child of the button,
           immediately before it. -->
      <span class="inline-flex size-7 shrink-0 items-center justify-center">
        @if (_isUpdating()) {
          <!-- The tracker checklist's spinner glyph at the tracker's own 1s speed, but in REVERSE —
               the one direction nothing else on the page animates in, so "the page is working on
               it" can never read as "the countdown is running", which is a draining ring rather
               than a spin at all. It is rebuilt on the RING's 22-unit geometry (r=9 at cx/cy 11,
               stroke 2.5) instead of the checklist's 24-unit one, so all three glyphs are the same
               22×22 in the same slot and swapping between them cannot shift the row by a pixel.
               ⚠️ The direction lives INSIDE the shorthand on purpose. The animation shorthand resets
               every animation sub-property, so a separate [animation-direction:reverse] would be
               dropped back to normal by it and be dead markup.
               It is an arbitrary-property UTILITY rather than an inline style because reduced motion
               has to be able to switch it off, and an inline animation outranks every class in the
               cascade — including the motion-reduce one that would. (No backticks in this comment:
               inside an inline template literal they would close it.) -->
          <svg
            class="text-muted-foreground [animation:spin_1s_linear_infinite_reverse] motion-reduce:[animation:none]"
            width="22"
            height="22"
            viewBox="0 0 22 22"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="11"
              cy="11"
              r="9"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-opacity="0.25"
            />
            <path
              d="M20 11a9 9 0 0 0-9-9"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
            />
          </svg>
        } @else if (_showRefreshed()) {
          <!-- The check keeps the 24-unit viewBox every other icon in the app draws on, scaled DOWN
               to the ring's 22×22 (an svg preserves its aspect ratio, so the geometry is untouched
               and only the box changes). A 14px check beside a 22px ring read as a different
               control answering the same button. -->
          <svg
            class="text-green-600 dark:text-green-400"
            width="22"
            height="22"
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
      @if (_refreshTooltipOpen()) {
        <span
          role="tooltip"
          data-testid="line-refresh-tooltip"
          class="bg-popover text-popover-foreground border-border pointer-events-none absolute top-full right-0 z-50 mt-1.5 rounded-md border px-2 py-1 text-xs font-normal whitespace-nowrap shadow-md"
        >
          <span class="block">Click to Refresh Now</span>
          <!-- The countdown says when the NEXT refresh is; this says how stale the numbers on
               screen already are — the one question a countdown cannot answer. Stamped on every
               clean settle, the pristine first load included, so it is never blank. -->
          <span class="block">Last updated {{ _lastUpdatedLabel() }}</span>
        </span>
      }
    </button>
  `,
  /**
   * The control shrink-wraps to its VISIBLE content — the label and its ring, the spinner and
   * "Updating", or the check and "Updated" — so the tap target is exactly what the reader can see
   * instead of an invisible full-row strip. `:host` therefore goes `inline-block` in place of the `width: 100%`
   * block it used to claim, and the `w-full` that used to sit on the button is gone with it: a
   * full-width button inside a shrink-wrapped host would only put the invisible hit area back.
   *
   * Alignment is no longer this component's business. The hero's headline row is a
   * `flex items-start justify-between gap-3` line and this control sits in a `shrink-0` slot at its
   * end, so the shrink-wrapped control parks itself at the right edge of the sentence without the
   * control pretending to own a layout it no longer takes part in. `justify-end` on the trigger
   * then keeps the (label, glyph) pair flush right even when the button wraps to two lines. The
   * trigger is not a row, so it must not be styled like one.
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

  /** The transient "Updated" confirmation, shown after ANY refresh settles clean. */
  protected readonly _showRefreshed = signal(false);

  /** "Updating" — up while ANY refresh the page is doing is in flight (a click, the beat, any
   * other reload), and down on that refresh's settle edge or on a click arm's expiry. The PRISTINE
   * initial load is the one exclusion: it is not a refresh, and the page's first paint stays on its
   * countdown. See the effect for how the exclusion is derived. */
  protected readonly _isUpdating = signal(false);

  /** Epoch ms of the last clean settle, or null while the page has never completed a fetch. Backs
   * the tooltip's relative stamp. */
  private readonly _lastUpdatedAt = signal<number | null>(null);

  /**
   * That stamp as an age: unknown, "just now" under 5s, then seconds → minutes → hours.
   *
   * A plain method rather than a `computed`, so it is evaluated on every render of the tooltip
   * instead of only when the stamp changes: the age has to keep counting while a reader holds the
   * tooltip open, and that costs nothing here (a `Date.now()` per view refresh) — the alternative,
   * a `computed`, would freeze the string at "just now" and need a ticking timer to be honest.
   * ponytail: a tooltip left open across a whole 30s beat does not re-render on its own (nothing
   * marks the view dirty); add the age's own timer if a reader holding it open for half a minute
   * ever needs to see the number tick.
   */
  protected _lastUpdatedLabel(): string {
    const updatedAt = this._lastUpdatedAt();
    if (updatedAt === null) {
      return "—";
    }
    // A clock that jumped backwards lands in the "just now" branch rather than a negative age.
    const seconds = Math.floor((Date.now() - updatedAt) / 1000);
    if (seconds < 5) {
      return "just now";
    }
    if (seconds < 60) {
      return `${seconds}s ago`;
    }
    const minutes = Math.floor(seconds / 60);
    return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
  }

  /** Latch: a refresh was actually observed IN FLIGHT, so the settle edge below has something to
   * confirm. Without it, a click whose request never started (nothing to fetch, an immediate no-op)
   * would flash "Updated" on the spot. Set by the effect, consumed on the settle edge, and read by
   * the stale-arm expiry so a slow request is never mistaken for a no-op click. */
  private readonly _sawRefresh = signal(false);

  /** The pristine first load was seen in flight, so its settle is the one that can open the
   * "Last updated" clock. It never confirms (the effect's exclusion), so it cannot ride the latch. */
  private _sawPristineLoad = false;

  private _refreshedTimer: ReturnType<typeof setTimeout> | undefined;

  /** Bounds the "Updating" a click raised for a request that never started; see `ARM_EXPIRY_MS`.
   * Armed on every click, cleared by the settle edge (a request did start), by the expiry itself
   * and by `ngOnDestroy`. Its own presence is what tells the effect a click is still waiting — the
   * only way it knows not to tear that label down. */
  private _armExpiryTimer: ReturnType<typeof setTimeout> | undefined;

  /** Hover-capability for the tooltip: measured (not guessed), the same way
   * `StatusInfoChipComponent`/`InfoPopover` do — pointer devices hover, everything else taps. */
  protected readonly _hoverCapable = signal(false);
  protected readonly _refreshTooltipOpen = signal(false);

  /** Pending deferred tooltip close; see `TOOLTIP_CLOSE_DELAY_MS`. Cleared on re-entry, on the tap
   * toggle and on destroy. */
  private _tooltipCloseTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    let firstRun = true;

    effect(() => {
      const isRefreshing = this.store.isRefreshing();

      // The pristine initial load is not a refresh: the stores' loading flags are
      // pristine-first-fetch-only across all three resources, so they are true exactly while the
      // page's first fetch is in flight and never again. Excluding that window keeps the very first
      // paint on its countdown and off "Updated" — data that was never on screen cannot be stale,
      // and "just refreshed" for a first paint is a lie about a refresh that never happened.
      const pristineInitialLoad = this.store.isLoading() || this.store.isLoadingLastWeek();

      // 🔴 THE MISSED SETTLE, closed on the FIRST run. A fast first fetch — a warm cache, a local
      // API, or a hydration that mounts this control late — can finish BEFORE this effect has ever
      // run, and then the pristine branch below never observes the load in flight, so nothing ever
      // stamps and the tooltip sits on "Last updated —" until the first 30s beat on a page whose
      // data is seconds old. The only evidence this component can have is "I am here, the store is
      // idle, and not mid-initial-load": that is the pristine load already over, and its data IS
      // this page's, so "just now" is honest rather than a guess. Guarded on idle precisely so the
      // loading-at-mount case keeps flowing through the branch below, and skipped on `hasError` so a
      // first paint that FAILED never stamps itself as an update.
      if (firstRun) {
        firstRun = false;
        if (!isRefreshing && !pristineInitialLoad && !this.store.hasError()) {
          this._lastUpdatedAt.set(Date.now());
        }
      }

      if (isRefreshing) {
        if (pristineInitialLoad) {
          this._sawPristineLoad = true;
          return;
        }
        // In flight: latch it, so the settle edge knows this is a real refresh, and say so — a
        // refresh the page is visibly doing is worth naming whoever asked for it.
        this._sawRefresh.set(true);
        this._isUpdating.set(true);
        // A refresh starting is what makes a visible confirmation stale: "Updated" would otherwise
        // outlive the state it describes and sit there through the whole new flight.
        this._hideRefreshed();
        return;
      }

      // ── The settle edge ──────────────────────────────────────────────────
      if (this._sawRefresh()) {
        this._sawRefresh.set(false);
        // The click's guard has nothing left to protect: its request was seen in flight, so the
        // settle is what decides.
        clearTimeout(this._armExpiryTimer);
        this._armExpiryTimer = undefined;
        // "Updating" ends HERE, on the settle edge, and BEFORE the `hasError` gate below: an errored
        // refresh confirms nothing, but the label still has to come down or it would stay up for
        // good.
        this._isUpdating.set(false);
        if (this.store.hasError()) {
          // Settled on an error: the retry banner owns that story, so confirm nothing and stamp
          // nothing — a failed fetch is not a refresh of the data.
          //
          // DELIBERATELY CONSERVATIVE, and worth reading before "fixing": `HomeStore.hasError` is a
          // page-wide OR across all three resources (lines, Today feed, Last Week). A stale error
          // left over from an unrelated resource therefore suppresses this confirmation even when
          // the refresh's own requests succeeded. That is the intended trade — a false "Updated" on
          // a page that is partly broken is worse than a missing one, and the banner is already
          // telling the reader something is wrong. Do NOT narrow this to "did MY request fail"; the
          // store cannot answer that, and guessing is how a real failure gets dressed up as a
          // success.
          return;
        }
        this._lastUpdatedAt.set(Date.now());
        this._flashRefreshed();
        return;
      }

      if (this._armExpiryTimer !== undefined) {
        // A click whose request never appeared: leave the label it raised alone. The expiry
        // (`ARM_EXPIRY_MS`) is the only thing that may take it down, and it will — the point of
        // this guard is that a re-run of this effect for any other reason must not end a window
        // that still has a live timer watching it.
        return;
      }

      if (this._sawPristineLoad) {
        // The pristine first load is the only settle that never latches, and it is a clean settle
        // like any other — it is simply where the "Last updated" clock starts. One-shot: consumed
        // here, so a later idle re-run of this effect cannot re-date it.
        this._sawPristineLoad = false;
        if (!this.store.hasError()) {
          this._lastUpdatedAt.set(Date.now());
        }
      }
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
   *  reader is watching for an answer to. The arm's expiry is armed here too, and it is the ONLY
   *  exit for a click whose request never shows up. */
  protected onRefreshClick(): void {
    this._isUpdating.set(true);
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
   * Arm the stale-label guard, restarting it on every click (a double click must leave ONE timer,
   * and it must be the NEWEST click's — a leaked timer from a superseded one would take the label
   * down under a request that is still in flight).
   */
  private _startArmExpiry(): void {
    clearTimeout(this._armExpiryTimer);
    this._armExpiryTimer = setTimeout(() => {
      this._armExpiryTimer = undefined;
      if (this._sawRefresh()) {
        // In flight after all: a slow request, not a dropped click. The settle decides — and the
        // settle clears the label itself.
        return;
      }
      // Nothing refreshed, so there is nothing to confirm; the click just has to stop claiming it
      // is working, or the label outlives the only window it describes.
      this._isUpdating.set(false);
    }, ARM_EXPIRY_MS);
  }

  /** Show the confirmation and (re)arm its own 500ms teardown. */
  private _flashRefreshed(): void {
    this._showRefreshed.set(true);
    clearTimeout(this._refreshedTimer);
    this._refreshedTimer = setTimeout(() => this._showRefreshed.set(false), REFRESHED_VISIBLE_MS);
  }

  /** Take a visible confirmation (and the timer behind it) down at once — the pairing matters: a
   * bare `set(false)` would leave a pending timer that could hide the NEXT confirmation early. */
  private _hideRefreshed(): void {
    clearTimeout(this._refreshedTimer);
    this._refreshedTimer = undefined;
    this._showRefreshed.set(false);
  }

  ngOnDestroy(): void {
    clearTimeout(this._refreshedTimer);
    clearTimeout(this._armExpiryTimer);
    clearTimeout(this._tooltipCloseTimer);
  }
}
