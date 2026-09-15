import { DestroyRef, Signal, effect, inject } from "@angular/core";

/**
 * Sets up a ResizeObserver on whatever element `ref()` currently resolves to (a `viewChild()`
 * signal reading an `ElementRef`), calling `onHeight` with its real rendered height whenever it
 * changes. Backs the "measure, don't hardcode" stacked-sticky-header pattern used across the
 * spotting feature (line-overview's line-name bar, vehicle-list's own header + column-header row,
 * line-details' title bar + activity controls + grid header) — each sticky layer needs to know
 * exactly how tall the one above it currently is, and a guessed constant silently drifts wrong the
 * moment that content wraps or grows (the original bug: vehicle-list's header clipped behind
 * line-overview's sticky row whenever the row grew past its assumed height).
 *
 * Call from a component constructor (uses `inject`); disconnects automatically on destroy.
 */
export function observeHeight(
  ref: Signal<{ nativeElement: HTMLElement } | undefined>,
  onHeight: (height: number) => void,
): void {
  const destroyRef = inject(DestroyRef);
  let observer: ResizeObserver | undefined;
  effect(() => {
    const el = ref();
    observer?.disconnect();
    observer = undefined;
    if (!el || typeof ResizeObserver === "undefined") {
      return;
    }
    const ro = new ResizeObserver(([entry]) => {
      const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      if (height > 0) {
        onHeight(height);
      }
    });
    ro.observe(el.nativeElement);
    observer = ro;
  });
  destroyRef.onDestroy(() => observer?.disconnect());
}
