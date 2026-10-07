import { Directive, ElementRef, effect, inject, input } from "@angular/core";

/**
 * The single utility this directive owns. `motion-safe:` is the whole reduced-motion story: the
 * variant is gated on `prefers-reduced-motion: no-preference`, so a reader who asked for reduced
 * motion never gets the class to apply in the first place and the element simply stays put. No
 * `matchMedia` probe, no second code path, no teardown.
 */
const TICK_CLASS = "motion-safe:animate-tick-up";

/**
 * Replays a one-shot count-up reveal whenever the bound number changes.
 *
 * Three rules, each load-bearing:
 *
 *  - **Never on the first run.** A number that animates itself into place on a page's first paint is
 *    motion nobody asked for, and it fights the font swap on a cold cache. The first effect run
 *    therefore does nothing at all — the class is never added — and only a LATER value adds it.
 *  - **Remove, reflow, re-add.** CSS replays an animation only when the element's `animation-name`
 *    actually changes, so re-setting the same class is a no-op. Forcing a reflow between the remove
 *    and the add is what makes the browser see the change.
 *  - **The class stays.** It is not removed afterwards, and nothing needs to clean it up: the
 *    animation is not `infinite` and has no fill mode, so once it has finished it is inert and the
 *    element sits at its own styles. A teardown timer would be a second thing to leak on destroy.
 *
 * A slide rather than a rolling digit — see `--animate-tick-up` in `styles.css` for why.
 *
 * Usage: `<span [hlmTickUp]="count">12</span>`. The bound attribute IS the marker — do not also write
 * a bare `hlmTickUp` beside it: Angular passes a bare attribute's value through as an empty STRING,
 * and the required `number` input below rejects that with "Type 'string' is not assignable to type
 * 'number'".
 */
@Directive({ selector: "[hlmTickUp]" })
export class HlmTickUp {
  /** The value whose CHANGE triggers the reveal. Read, never rendered — the text stays in the template. */
  readonly hlmTickUp = input.required<number>();

  private readonly _el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** False from the second run on. See "Never on the first run" above. */
  private _seenFirst = false;

  constructor() {
    effect(() => {
      this.hlmTickUp();
      if (!this._seenFirst) {
        this._seenFirst = true;
        return;
      }
      const el = this._el;
      el.classList.remove(TICK_CLASS);
      // Reading the box is what forces the style/layout recalculation between the two class writes;
      // assigning it to nothing is deliberate (there is nothing to do with the value).
      void el.offsetWidth;
      el.classList.add(TICK_CLASS);
    });
  }
}
