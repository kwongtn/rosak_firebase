import { isPlatformBrowser, ViewportScroller } from "@angular/common";
import { DestroyRef, Injectable, PLATFORM_ID, inject } from "@angular/core";
import { NavigationEnd, NavigationStart, Router, Scroll } from "@angular/router";
import { filter } from "rxjs";
import { urlPath } from "./revalidate-on-return";

const MAX_SCROLL_POSITIONS = 50;
type ScrollPosition = [number, number];

/**
 * Remembers window scroll positions for routes visited in this app session.
 *
 * `withInMemoryScrolling({ scrollPositionRestoration: "enabled" })` restores a position on browser
 * popstate, but an in-app "← Back" link is an imperative navigation and therefore normally lands
 * at the top. A newly rebuilt page is also still skeleton-high when the built-in restoration runs,
 * so a remembered offset can be clamped to the wrong place. Keep-alive routes solve the height
 * problem; this service covers the imperative-back case by saving at NavigationStart and applying
 * the remembered position in a microtask after RouterScroller has performed its own scroll.
 */
@Injectable({ providedIn: "root" })
export class RouteScrollMemoryService {
  private readonly router = inject(Router);
  private readonly viewportScroller = inject(ViewportScroller);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly positions = new Map<string, ScrollPosition>();

  private currentUrl: string;
  private previousUrl: string;

  constructor() {
    this.currentUrl = this.router.url;
    this.previousUrl = this.currentUrl;
    if (!this.isBrowser) {
      return;
    }

    const subscription = this.router.events
      .pipe(
        filter(
          (event): event is NavigationStart | NavigationEnd | Scroll =>
            event instanceof NavigationStart ||
            event instanceof NavigationEnd ||
            event instanceof Scroll,
        ),
      )
      .subscribe((event) => {
        if (event instanceof NavigationStart) {
          this.rememberCurrentPosition();
          return;
        }

        if (event instanceof NavigationEnd) {
          this.previousUrl = this.currentUrl;
          this.currentUrl = event.urlAfterRedirects;
          return;
        }

        this.restorePosition(event);
      });

    this.destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  private rememberCurrentPosition(): void {
    const key = urlPath(this.currentUrl);
    this.positions.delete(key);
    this.positions.set(key, this.viewportScroller.getScrollPosition());

    while (this.positions.size > MAX_SCROLL_POSITIONS) {
      const oldest = this.positions.entries().next().value as [string, ScrollPosition] | undefined;
      if (oldest === undefined) {
        return;
      }
      this.positions.delete(oldest[0]);
    }
  }

  private restorePosition(event: Scroll): void {
    // A popstate restore carries the position Angular stored for that history entry, which is more
    // precise than our per-URL memory (two entries can share a URL at different offsets) — leave it.
    if (event.position !== null) {
      return;
    }

    // An explicit fragment is an instruction, not a request to restore an old page position.
    if (event.anchor) {
      return;
    }

    const routerUrl =
      event.routerEvent instanceof NavigationEnd
        ? event.routerEvent.urlAfterRedirects
        : event.routerEvent.url;
    const targetPath = urlPath(routerUrl);
    // Sort/query controls can change the URL without changing the page. Let RouterScroller keep
    // its normal top-scroll behavior for those navigations (e.g. changing the overview sort).
    if (urlPath(this.previousUrl) === targetPath) {
      return;
    }

    const position = this.positions.get(targetPath);
    if (position === undefined) {
      return;
    }

    // RouterScroller handles its Scroll event synchronously. Deferring one microtask makes this
    // restoration the final write, including for imperative in-app back links.
    queueMicrotask(() => {
      this.viewportScroller.scrollToPosition(position, { behavior: "instant" });
    });
  }
}
