/**
 * Global setup for the Vitest suite — wired through `angular.json` →
 * `projects.web.architect.test.options.setupFiles`.
 *
 * jsdom ships no `ResizeObserver`, and several components construct one unconditionally in
 * `afterNextRender` (`justified-grid.component.ts`, `spotting-activity-heatmap.ts`). Every spec that
 * renders those otherwise repeats the same no-op stub, so one guarded no-op here replaces those
 * four duplicates.
 *
 * A plain assignment on purpose — NOT `vi.stubGlobal` — so a spec's own `vi.unstubAllGlobals()`
 * in `afterEach` cannot tear the polyfill back out from under the rest of its file.
 *
 * Deliberately NOT installed:
 * - `matchMedia` — `info-popover.spec.ts` asserts the ABSENT-`matchMedia` path ("treats a missing
 *   matchMedia as no hover"), and half a dozen specs drive `matches` per test through their own
 *   `vi.stubGlobal`; a global default would silently change the branch under test.
 * - `IntersectionObserver` — the two specs that stub it (`line-details.page.spec.ts`,
 *   `infinite-scroll.directive.spec.ts`) capture and assert against the observer instances, so
 *   their stubs are not duplicates (and `ad-slot.component.spec.ts` alone does not meet the
 *   ≥2-spec threshold).
 */
class NoopResizeObserver implements ResizeObserver {
  constructor(_callback: ResizeObserverCallback) {}
  observe(_target: Element, _options?: ResizeObserverOptions): void {}
  unobserve(_target: Element): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = NoopResizeObserver;
}
