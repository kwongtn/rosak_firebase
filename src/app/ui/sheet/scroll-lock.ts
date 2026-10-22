import { Injectable } from "@angular/core";
import { injectIsBrowser } from "../../core/composables/is-browser";

/**
 * Locks page scroll while at least one `HlmSheet` is open. Every open sheet holds the lock once,
 * and the page unlocks only when the last holder lets go, so sheets that open and close in the
 * same tick (the report chooser handing over to a line-status sheet) can run in any order.
 *
 * `overflow-x: clip` on html/body (styles.css) keeps a classic 15px viewport scrollbar alive even
 * with body overflow hidden, so the root element is locked too, or the page scrollbar stays
 * visible behind the sheet.
 */
@Injectable({ providedIn: "root" })
export class ScrollLock {
  private readonly isBrowser = injectIsBrowser();
  private holders = 0;

  acquire(): void {
    this.holders += 1;
    if (this.holders === 1) this.apply("hidden");
  }

  release(): void {
    // A stray release must not drive the count negative, or the next acquire would not lock.
    if (this.holders === 0) return;
    this.holders -= 1;
    if (this.holders === 0) this.apply("");
  }

  private apply(overflow: "hidden" | ""): void {
    if (!this.isBrowser) return;
    document.body.style.overflow = overflow;
    document.documentElement.style.overflow = overflow;
  }
}
