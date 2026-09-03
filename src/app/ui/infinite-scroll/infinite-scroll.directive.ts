import { isPlatformBrowser } from "@angular/common";
import {
  Directive,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  effect,
  inject,
  input,
  output,
  type AfterViewInit,
} from "@angular/core";

/**
 * Sentinel-based infinite scroll (Task 16). Apply to a marker element placed
 * below a paginated list; `(loadMore)` fires whenever the sentinel enters the
 * viewport (with a 120px rootMargin so the next page loads slightly before the
 * user reaches the very bottom).
 *
 * Overlapping loads are coalesced: while `appInfiniteScrollLoading` is `true`
 * no events emit; when it flips back to `false` while the sentinel is STILL
 * visible, one event re-fires, so a list that reaches the bottom fast (a page
 * shorter than the viewport) keeps auto-advancing without extra scrolling.
 * Leaving the viewport clears the coalescing state, so re-entering always
 * emits again.
 *
 * SSR-safe: IntersectionObserver exists only in the browser (and not in the
 * jsdom test environment) — nothing is created on the server, and `ngOnDestroy`
 * always disconnects an observer created on the client.
 */
@Directive({
  selector: "[appInfiniteScroll]",
})
export class InfiniteScrollDirective implements AfterViewInit, OnDestroy {
  /** Set by the host while a page load is in flight — suppresses (and on
   * completion, re-arms) emissions. */
  readonly loading = input(false, { alias: "appInfiniteScrollLoading" });

  readonly loadMore = output<void>();

  private readonly elementRef = inject(ElementRef);
  private readonly platformId = inject(PLATFORM_ID);

  private observer?: IntersectionObserver;
  private sentinelVisible = false;
  /** An emission already happened for the current visibility period — guards
   * against repeated callbacks while the sentinel stays put. */
  private emitted = false;
  /** The sentinel became visible while a load was in flight — that load's
   * completion must re-fire. */
  private pending = false;

  constructor() {
    effect(() => {
      if (this.loading()) {
        return;
      }
      if (!this.sentinelVisible) {
        this.emitted = false;
        this.pending = false;
        return;
      }
      if (this.pending || this.emitted) {
        this.pending = false;
        this.emitted = false;
        queueMicrotask(() => this.tryEmit());
      }
    });
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        this.sentinelVisible = entries.some((entry) => entry.isIntersecting);
        if (!this.sentinelVisible) {
          this.emitted = false;
          this.pending = false;
          return;
        }
        if (this.loading()) {
          this.pending = true;
          return;
        }
        if (!this.emitted) {
          this.emitted = true;
          this.pending = false;
          this.loadMore.emit();
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(this.elementRef.nativeElement);
    this.observer = observer;
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = undefined;
  }

  private tryEmit(): void {
    if (!this.sentinelVisible || this.emitted || this.loading()) {
      return;
    }
    this.emitted = true;
    this.pending = false;
    this.loadMore.emit();
  }
}
