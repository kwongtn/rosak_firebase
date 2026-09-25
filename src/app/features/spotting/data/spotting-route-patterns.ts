/**
 * URL predicates for the three page routes declared in `spotting.routes.ts`.
 *
 * The details matcher represents both `/details` and `/details/:tab` as one page route, so its
 * predicate accepts either shape. Keep these patterns path-only; callers that receive a complete
 * router URL should strip query parameters and fragments first.
 */

export function isSpottingLineRoute(path: string): boolean {
  return /^\/spotting\/[^/]+$/.test(path);
}

export function isSpottingDetailsRoute(path: string): boolean {
  return /^\/spotting\/[^/]+\/details(?:\/[^/]+)?$/.test(path);
}

export function isSpottingVehicleRoute(path: string): boolean {
  return /^\/spotting\/[^/]+\/vehicle\/[^/]+$/.test(path);
}
