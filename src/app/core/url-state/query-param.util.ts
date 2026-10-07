import type { ActivatedRoute, Router } from "@angular/router";

/**
 * Query-parameter helpers for view state that belongs in the URL (`?view=`, `?sort=`, `?line=`,
 * `?q=`).
 *
 * The split mirrors `features/spotting/line-overview/line-overview.page.ts`: the READ half is a
 * pure function over a `ParamMap`, so it is SSR-safe and unit-testable with no Router at all; the
 * WRITE half is a single browser-gated `navigate()` so no caller has to re-derive the merge/replace
 * rules or remember the platform guard.
 *
 * The two rules that actually matter, both of which the spoting page encodes inline today:
 *  1. **A default value never appears in the URL.** Omitting it (`null`) is what makes "no query
 *     params" and "the default view" the same state — otherwise every page load of a default view
 *     carries a parameter it did not choose.
 *  2. **Writes merge and replace, never push.** A view toggle is not a navigation the reader wants
 *     to walk back through one step at a time, and `merge` keeps an unrelated param (a sibling
 *     surface's `?line=`) intact.
 */

/** A value narrowable to a fixed set, which is every query param this app has today. */
export type QueryParamValue = string;

/** The write patch: `null` REMOVES a param under the Angular router's own contract. */
export type QueryParamPatch = Record<string, string | number | boolean | null>;

/**
 * The stored value when it is exactly one of `allowed` (after trimming), else `fallback`.
 *
 * Exact match on purpose: a URL is user input, so `?view=PRO`, `?view=rider ` or `?view=` must all
 * degrade to the fallback rather than being coerced into something the UI never offered.
 */
export function parseEnumQueryParam<T extends string>(
  raw: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof raw !== "string") {
    return fallback;
  }
  const trimmed = raw.trim();
  return (allowed as readonly string[]).includes(trimmed) ? (trimmed as T) : fallback;
}

/**
 * A free-text param as a trimmed string, or `null` when absent/blank — so an emptied search box
 * and a missing `?q=` are one state rather than two, which is what lets the write side drop the key.
 */
export function parseTextQueryParam(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * What to WRITE for one param: `null` (i.e. remove it) when the value is the default. Returns the
 * value itself otherwise, so a caller can build a whole patch with one call per param.
 */
export function queryParamForWrite<T extends string>(value: T, fallback: T): T | null {
  return value === fallback ? null : value;
}

/** The read half — one param against a `ParamMap`-shaped record. */
export function readEnumQueryParam<T extends string>(
  params: { get(name: string): string | null } | null | undefined,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  return parseEnumQueryParam(params?.get(name) ?? null, allowed, fallback);
}

/** The read half for a free-text param (`?q=`). */
export function readTextQueryParam(
  params: { get(name: string): string | null } | null | undefined,
  name: string,
): string | null {
  return parseTextQueryParam(params?.get(name) ?? null);
}

/**
 * The write half: merge `patch` into the current route's query params, replacing the history entry.
 *
 * `isBrowser` is a parameter rather than an internal `isPlatformBrowser` check because this is a
 * plain function, and reading `PLATFORM_ID` would need an injection context it has no business
 * having. Callers pass the flag they already hold — every route page computes
 * `injectIsBrowser()` once.
 *
 * 🔴 The guard is load-bearing, not a nicety: a *reactive* `router.navigate()` during SSR hangs
 * the render (the server waits on a navigation the client will never answer), which is why
 * line-overview's write-back effect bails the same way. A no-op on the server also keeps the
 * server HTML and the hydrated client's URL identical.
 */
export function writeQueryParams(
  router: Router,
  route: ActivatedRoute,
  patch: QueryParamPatch,
  isBrowser: boolean,
): void {
  if (!isBrowser) {
    return;
  }
  void router.navigate([], {
    relativeTo: route,
    queryParams: patch,
    queryParamsHandling: "merge",
    replaceUrl: true,
  });
}
