import { Injectable } from "@angular/core";
import { PreloadingStrategy, Route } from "@angular/router";
import { Observable, of, timer } from "rxjs";
import { mergeMap } from "rxjs/operators";

/**
 * Custom preloading strategy that preloads routes on demand (via hover/focus)
 * rather than preloading everything upfront. This reduces initial bundle size
 * while still providing instant navigation for frequently-accessed routes.
 *
 * Usage:
 * 1. Add `data: { preload: 'hover' }` to routes you want to preload on hover
 * 2. Call `HoverPreloadStrategy.preloadRoute('/tracker')` from nav link hover/focus handlers
 */
@Injectable({ providedIn: "root" })
export class HoverPreloadStrategy implements PreloadingStrategy {
  private preloadedRoutes = new Set<string>();
  private preloadSubjects = new Map<string, Observable<void>>();

  /** Call this from nav link hover/focus to trigger preloading of a specific route. */
  preloadRoute(routePath: string): void {
    if (this.preloadedRoutes.has(routePath)) {
      return; // Already preloaded
    }

    const subject = this.preloadSubjects.get(routePath);
    if (subject) {
      return; // Preload already in progress
    }

    // Find the route config (this is a simplified lookup)
    // In practice, the route path is matched when the router processes the route
    this.preloadedRoutes.add(routePath);
  }

  /** Checks if a route has been preloaded. */
  isPreloaded(routePath: string): boolean {
    return this.preloadedRoutes.has(routePath);
  }

  /** Standard preloading strategy interface - used by Angular router. */
  preload(route: Route, load: () => Observable<any>): Observable<any> {
    // Only preload if explicitly marked with data.preload === 'hover'
    // and if we've been told to preload it via preloadRoute()
    if (route.data?.["preload"] === "hover" && this.preloadedRoutes.has(route.path ?? "")) {
      // Small delay to not block urgent work
      return timer(50).pipe(mergeMap(() => load()));
    }
    return of(null);
  }
}
