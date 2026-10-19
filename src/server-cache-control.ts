/**
 * Edge-cache policy for the community front page's SSR response (see `server.ts`).
 *
 * `s-maxage` lets the CDN hold the rendered `/` for 20 seconds, and `stale-while-revalidate` lets
 * it serve a stale copy for up to 60 more while it refetches, so a traffic spike re-renders the
 * page at most once per window instead of once per request.
 */
export const HOME_CACHE_CONTROL = "public, s-maxage=20, stale-while-revalidate=60";

/**
 * The `Cache-Control` value to stamp on an SSR response, or `null` to leave the response alone.
 *
 * Only a 200 GET of the exact path `/` is cacheable. A response that already names its own policy
 * is never overridden.
 */
export function homeCacheControl(
  method: string,
  path: string,
  status: number,
  existingCacheControl: string | null,
): string | null {
  if (method !== "GET" || path !== "/" || status !== 200 || existingCacheControl !== null) {
    return null;
  }
  return HOME_CACHE_CONTROL;
}
