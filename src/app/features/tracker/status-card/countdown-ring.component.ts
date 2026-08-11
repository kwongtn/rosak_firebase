import { Component, computed, input, signal } from "@angular/core";
import { RtSource } from "../data/gtfs-realtime.service";

const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** The ring is drawn smaller than its own `size-7` (28px) reserved slot — at 28px it touched the
 * slot's edges exactly (12.5 radius + 1.5 half-stroke = 14, precisely half of 28), reading as
 * though it filled the whole row with no breathing room at all. Centered via the slot's own
 * `items-center justify-center` rather than repositioned by hand. */
const SVG_SIZE = 22;

/**
 * A depleting ring — full right after a realtime feed refreshes, empty right as the next poll
 * fires — replacing the old plain "Xs" text countdown per "should be a circle... substracting as
 * it goes". No numeral inside any more (moved to a hover tooltip): the ring itself is the primary
 * signal, and a lone still-changing number ticking every 100ms next to a dozen other rows read as
 * busier than the countdown actually needed to convey.
 *
 * The tooltip is a custom hover-shown element, not the native `title` attribute: a browser's own
 * title tooltip renders a one-time snapshot of the attribute's value when the hover starts and
 * never re-reads it while still showing, so it silently went stale (still showing the second at
 * which the pointer arrived) for as long as the pointer stayed put — exactly wrong for a number
 * that's ticking every 100ms. A plain template-bound `{{ }}` inside a signal-gated `@if`
 * re-renders on every tick like everything else in this app.
 *
 * `error` swaps the ring to a destructive color — used for a source that's currently failing and
 * counting down to a retry rather than a normal refresh. This component stays purely
 * presentational either way (no click handling of its own); the host decides what a click does
 * with the ring (see layer-checklist.component.ts's error-detail panel).
 */
@Component({
  selector: "app-countdown-ring",
  template: `
    <span
      class="relative inline-flex size-7 shrink-0 items-center justify-center"
      (mouseenter)="onHoverStart($event)"
      (mouseleave)="hovering.set(false)"
    >
      <svg
        [attr.width]="SVG_SIZE"
        [attr.height]="SVG_SIZE"
        viewBox="0 0 22 22"
        class="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="11"
          cy="11"
          r="9"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          class="text-muted-foreground/20"
        />
        <circle
          cx="11"
          cy="11"
          r="9"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          class="transition-[stroke-dashoffset] duration-150 ease-linear"
          [class.text-primary]="!error()"
          [class.text-destructive]="error()"
          [attr.stroke-dasharray]="CIRCUMFERENCE"
          [attr.stroke-dashoffset]="dashOffset()"
        />
      </svg>
    </span>
    <!-- position: fixed (viewport-relative), not absolute against the ring's own span: every
             host this component renders inside (the desktop card, the mobile sheet) scrolls via a
             plain overflow-y-auto div, and that div's own computed overflow-x — per the same "auto
             on one axis promotes the other to auto too" CSS Overflow-spec quirk documented on
             vehicle-spotting-grid — silently became auto as well the moment this tooltip's
             whitespace-nowrap width pushed past the panel's edge, surfacing a horizontal scrollbar
             purely from hovering a ring near that edge. Fixed positioning escapes that ancestor's
             overflow clipping/scroll-width calculation entirely (none of these hosts have a
             transform/filter/will-change that would turn them into a containing block for it), so
             the tooltip can render without ever affecting the panel's own scrollable width.
             Position is measured at hover time (see onHoverStart) rather than tracked live — the
             ring the pointer is over doesn't move while hovered. -->
    @if (hovering()) {
      @if (tooltipPos(); as pos) {
        <div
          class="bg-popover text-popover-foreground border-border pointer-events-none fixed z-30 -translate-x-1/2 -translate-y-full rounded-md border px-2 py-1 text-xs whitespace-nowrap shadow-md"
          [style.top.px]="pos.top"
          [style.left.px]="pos.left"
        >
          {{ tooltip() }}
        </div>
      }
    }
  `,
})
export class CountdownRingComponent {
  /** Takes the whole source, not its `percentRemaining()`/`secondsRemaining()` values directly
   * — those tick every 100ms (see RtSource's own TICK_MS), and a *host* template that reads them
   * itself (the old API here: `[percentRemaining]="source.percentRemaining()"`) gets marked
   * dirty and fully re-evaluated on every one of those ticks, for every active source at once.
   * Confirmed directly as the reason the layer panel's realtime section — dropdown included —
   * felt sluggish: LayerChecklistComponent's *entire* template (checkbox list, refresh-interval
   * select, everything) was re-running 10 times a second per live feed. Reading the ticking
   * signals in here instead scopes that reactivity to just this small ring, where it belongs. */
  readonly source = input.required<RtSource>();
  readonly error = input(false);

  protected readonly hovering = signal(false);
  protected readonly tooltipPos = signal<{ top: number; left: number } | null>(null);
  protected readonly SVG_SIZE = SVG_SIZE;
  protected readonly CIRCUMFERENCE = CIRCUMFERENCE;
  protected readonly dashOffset = computed(
    () => CIRCUMFERENCE * (1 - Math.max(0, Math.min(100, this.source().percentRemaining())) / 100),
  );
  protected readonly tooltip = computed(() => {
    const seconds = Math.round(this.source().secondsRemaining());
    return this.error() ? `Retrying in ${seconds}s` : `Refreshing in ${seconds}s`;
  });

  protected onHoverStart(event: Event): void {
    this.hovering.set(true);
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.tooltipPos.set({ top: rect.top - 4, left: rect.left + rect.width / 2 });
  }
}
