import { Component, DestroyRef, inject, signal } from "@angular/core";
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from "@angular/router";

/** How long a navigation has to be "slow" before the bar appears at all — anything faster than
 * this (most in-app SPA navigations) shows nothing, which is the whole point: a flash of a
 * progress bar on every click would be more distracting than helpful. */
const SHOW_DELAY_MS = 200;

/**
 * A thin, YouTube-style progress bar pinned to the very top of the viewport — the deliberately
 * subtle alternative to a full-page loading overlay for slow route navigations (e.g. into
 * /tracker's heavier bundle). Mounted once in the root shell (see app.ts/app.html) so it spans
 * every route, including /tracker's own compact pill nav which never renders `<app-nav>`.
 *
 * Delay-then-show, not show-then-hide: `NavigationStart` only *arms* a timer, and the bar only
 * actually appears once that timer fires without having been cancelled by an end/cancel/error
 * event first. That's what keeps fast navigations silent — this is the first `NavigationStart`
 * consumer in the app; everything else (app-nav's module label, analytics page_view) only ever
 * cared about `NavigationEnd`.
 */
@Component({
  selector: "app-nav-progress",
  template: `
    <div
      class="pointer-events-none fixed top-0 right-0 left-0 z-[200] h-0.5 overflow-hidden transition-opacity duration-300"
      [class.opacity-100]="visible()"
      [class.opacity-0]="!visible()"
      aria-hidden="true"
    >
      <div class="h-full w-1/3 animate-nav-progress-sweep bg-primary"></div>
    </div>
  `,
})
export class NavProgressComponent {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly visible = signal(false);

  private showTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const subscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        clearTimeout(this.showTimer);
        this.showTimer = setTimeout(() => this.visible.set(true), SHOW_DELAY_MS);
        return;
      }
      if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        clearTimeout(this.showTimer);
        this.visible.set(false);
      }
    });

    this.destroyRef.onDestroy(() => {
      clearTimeout(this.showTimer);
      subscription.unsubscribe();
    });
  }
}
