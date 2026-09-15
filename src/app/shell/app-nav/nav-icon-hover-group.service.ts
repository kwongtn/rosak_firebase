import { Injectable, computed, signal } from "@angular/core";

/** How long the group stays expanded after the pointer leaves every icon in it, before actually
 * collapsing — long enough that moving from one icon straight to an adjacent one doesn't read as
 * "left" in between, per the user's explicit ask ("do not shrink if the mouse continues hovering
 * on either one of them"). */
const GROUP_COLLAPSE_DELAY_MS = 1000;

/**
 * Coordinates the "expand on hover, shrink a beat after the pointer leaves" behavior shared by
 * every icon in the nav's right-hand icon tray (theme toggle, avatar, and whatever's added after
 * them) — a root singleton (not scoped to `<app-nav>`) specifically so a component like
 * `ThemeToggleComponent`, reused on pages with their own separate compact nav (e.g. /tracker),
 * gets the exact same grouped behavior there for free, with no per-usage wiring. In practice only
 * one icon tray is ever visible at a time, so sharing one instance app-wide is safe: hovering one
 * tray's icons never has anything else on screen for it to visibly affect.
 *

 * Deliberately a *group* concept, not N independent per-icon timers: while the pointer is
 * anywhere in the tray, every icon that's ever been entered during this hover session stays
 * expanded (not just the one currently under the pointer) — hopping from one icon straight to the
 * next must never show the first one shrink back before the second one grows, which independent
 * per-icon timers can't guarantee (the exact gap between a `mouseleave` and the next icon's
 * `mouseenter` isn't something either icon can reason about on its own). The single shared
 * "everyone collapses together, `GROUP_COLLAPSE_DELAY_MS` after the *last* icon was left" timer is
 * what makes that guarantee hold regardless of how many icons the tray ends up with.
 */
@Injectable({ providedIn: "root" })
export class NavIconHoverGroupService {
  private readonly hoveredKeys = signal<ReadonlySet<string>>(new Set());
  private readonly stickyExpandedKeys = signal<ReadonlySet<string>>(new Set());
  private collapseTimer: ReturnType<typeof setTimeout> | undefined;

  /** Whether `key`'s icon should currently render expanded. */
  isExpanded(key: string) {
    return computed(() => this.hoveredKeys().has(key) || this.stickyExpandedKeys().has(key));
  }

  onEnter(key: string): void {
    clearTimeout(this.collapseTimer);
    this.hoveredKeys.update((set) => new Set(set).add(key));
    this.stickyExpandedKeys.update((set) => new Set(set).add(key));
  }

  onLeave(key: string): void {
    this.hoveredKeys.update((set) => {
      const next = new Set(set);
      next.delete(key);
      return next;
    });
    // Only once the *whole* tray is untouched does the shrink-back countdown start — entering
    // a different icon in the meantime (onEnter, above) clears this before it can fire.
    if (this.hoveredKeys().size > 0) {
      return;
    }
    this.collapseTimer = setTimeout(() => {
      this.stickyExpandedKeys.set(new Set());
    }, GROUP_COLLAPSE_DELAY_MS);
  }
}
