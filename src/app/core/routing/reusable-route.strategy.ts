import { Injectable } from "@angular/core";
import {
  ActivatedRouteSnapshot,
  BaseRouteReuseStrategy,
  DetachedRouteHandle,
  Route,
  destroyDetachedRouteHandle,
} from "@angular/router";

/**
 * Maximum number of detached page trees kept alive at once.
 *
 * A handle is deliberately bounded rather than allowed to grow with every route visited. The
 * oldest detached tree is destroyed when this limit is crossed, which also tears down its
 * component-local resources instead of leaving an invisible page alive forever.
 */
export const MAX_REUSABLE_ROUTE_HANDLES = 10;

/**
 * Keeps explicitly marked routes mounted across navigation.
 *
 * Angular's default route reuse strategy reuses a component only while the same `Route` config
 * remains active. Moving between the spotting line, details, and vehicle pages therefore destroys
 * the old page, discards its DOM and loaded resources, and creates a fresh skeleton on return.
 * The page routes opt into this strategy with `data: { reuse: true }` (see
 * `.omo/plans/spotting-route-persistence.md`); unmarked routes keep the normal Angular behavior.
 *
 * The key is built from the route-config chain and only the path parameters declared by each
 * config. That deliberately ignores the optional details `tab` matcher parameter, so all tab
 * variants share one mounted page, while a different line or vehicle gets a different handle.
 */
@Injectable()
export class ReusableRouteStrategy extends BaseRouteReuseStrategy {
  private readonly handles = new Map<string, DetachedRouteHandle>();
  private readonly routeIds = new WeakMap<Route, number>();
  private nextRouteId = 0;

  override shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return route.data["reuse"] === true;
  }

  override shouldAttach(route: ActivatedRouteSnapshot): boolean {
    return this.handles.has(this.key(route));
  }

  override retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    // RouterOutlet consumes the handle with store(snapshot, null) immediately after retrieve().
    // Keep it here until that explicit store call so the outlet remains the owner of the lifecycle.
    return this.handles.get(this.key(route)) ?? null;
  }

  override store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    const key = this.key(route);
    if (handle === null) {
      // This is not just a no-op: RouterOutlet calls store(snapshot, null) after every retrieve().
      this.handles.delete(key);
      return;
    }

    const previous = this.handles.get(key);
    if (previous) {
      destroyDetachedRouteHandle(previous);
      this.handles.delete(key);
    }

    // Re-inserting an existing key makes the most recently stored handle the newest entry.
    this.handles.set(key, handle);
    this.evictOldestHandles();
  }

  /**
   * Produces a stable identity for a route instance and its declared path parameters.
   *
   * `Route` objects are compared by identity rather than by their path text. The optional details
   * matcher has no `path`, so its matcher-produced `tab` parameter is intentionally absent from
   * the key; the parent `:lineId` snapshot still contributes the line identity.
   */
  key(snapshot: ActivatedRouteSnapshot): string {
    const entries: Array<{ id: number; params: string[] }> = [];

    for (const routeSnapshot of snapshot.pathFromRoot) {
      const routeConfig = routeSnapshot.routeConfig;
      if (!routeConfig) {
        continue;
      }

      const pathParams: string[] = [];
      for (const segment of (routeConfig.path ?? "").split("/")) {
        if (!segment.startsWith(":")) {
          continue;
        }

        const paramName = segment.slice(1);
        const value = String(routeSnapshot.params[paramName] ?? "");
        pathParams.push(`${paramName}=${value}`);
      }

      entries.push({ id: this.idFor(routeConfig), params: pathParams });
    }

    return JSON.stringify(entries);
  }

  private idFor(route: Route): number {
    const existingId = this.routeIds.get(route);
    if (existingId !== undefined) {
      return existingId;
    }

    const id = this.nextRouteId++;
    this.routeIds.set(route, id);
    return id;
  }

  private evictOldestHandles(): void {
    while (this.handles.size > MAX_REUSABLE_ROUTE_HANDLES) {
      const oldest = this.handles.entries().next().value as
        [string, DetachedRouteHandle] | undefined;
      if (oldest === undefined) {
        return;
      }

      this.handles.delete(oldest[0]);
      destroyDetachedRouteHandle(oldest[1]);
    }
  }
}
