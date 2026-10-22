/**
 * Global setup for the Vitest suite — wired through `angular.json` →
 * `projects.web.architect.test.options.setupFiles`.
 *
 * jsdom ships no `ResizeObserver`, and several components construct one unconditionally in
 * `afterNextRender` (`app-nav.component.ts`, `spotting-activity-heatmap.ts`). Every spec that
 * renders those otherwise repeats the same no-op stub, so one guarded no-op here replaces those
 * four duplicates.
 *
 * A plain assignment on purpose — NOT `vi.stubGlobal` — so a spec's own `vi.unstubAllGlobals()`
 * in `afterEach` cannot tear the polyfill back out from under the rest of its file.
 *
 * Reset before every test: the toast list (`toastState` of `@spartan-ng/brain/sonner`). It is a
 * process-wide store in `node_modules`, so toasts one spec file raises (`app.spec.ts` raises three)
 * outlive it and reach the next file in the worker, where `line-overview.page.spec.ts` counts them.
 * Raising a toast is ordinary app behaviour, so specs are not asked to clean up after it.
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
import { toastState } from "@spartan-ng/brain/sonner";
import { beforeEach, vi } from "vitest";

// One worker per core, next to whatever else runs on the box: a component's first render takes 0.4 to
// 1.5 s alone and up to 8 s when the machine is busy, so Vitest's defaults of 5 s a test and 10 s a
// hook fail a correct test at random. Set before the hook below is registered, so that hook gets the
// raised limit too. `vi.setConfig` has no option for `vi.waitFor`, which keeps its own default of 1 s:
// pass `{ timeout }` to a call that waits for a slow first render.
vi.setConfig({ testTimeout: 15_000, hookTimeout: 30_000 });

class NoopResizeObserver implements ResizeObserver {
  constructor(_callback: ResizeObserverCallback) {}
  observe(_target: Element, _options?: ResizeObserverOptions): void {}
  unobserve(_target: Element): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = NoopResizeObserver;
}

beforeEach(() => {
  toastState.reset();
});
