import { UrlMatchResult, UrlSegment } from "@angular/router";

/**
 * Matches `prefix` alone, or `prefix` plus exactly one further segment bound to `paramName` —
 * e.g. `/gallery` and `/gallery/:mediaId` as ONE route rather than two sibling `Route` entries
 * (an empty-path child plus a `:param` child) that happen to load the same component.
 *
 * That two-entry shape looks equivalent but isn't: they're genuinely different `Route` objects,
 * so Angular's default `RouteReuseStrategy` does not reuse the component instance when
 * navigating between them — it destroys the old one and constructs a fresh one, discarding
 * everything in it (loaded data, anything set eagerly for instant UI feedback, in-flight
 * requests) purely because the param went from absent to present. A single route via a custom
 * matcher is recognized as "the same route, a different param," which the default strategy does
 * reuse — the component instance survives, and its param input just updates like any other.
 */
export function pathWithOptionalParamMatcher(prefix: string, paramName: string) {
    return (segments: UrlSegment[]): UrlMatchResult | null => {
        if (segments.length === 0 || segments[0].path !== prefix) {
            return null;
        }
        if (segments.length === 1) {
            return { consumed: segments, posParams: {} };
        }
        if (segments.length === 2) {
            return { consumed: segments, posParams: { [paramName]: segments[1] } };
        }
        return null;
    };
}
