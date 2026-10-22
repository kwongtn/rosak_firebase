import type { Request, Response as ExpressResponse } from "express";

/**
 * /tracker's "Stops" layer (see gtfs-static.service.ts) fetches GTFS-static zips from
 * api.data.gov.my, which 302-redirects to an S3 bucket that sends no
 * Access-Control-Allow-Origin header at all — the browser blocks reading the response body
 * outright, no matter what's sent from the client side. A server *can* read it fine (CORS is a
 * browser-enforced restriction, not a server-to-server one), so this just re-fetches it here and
 * streams the bytes back same-origin. Allow-listed to the one real domain this ever needs to hit,
 * rather than a truly open proxy — this only exists to route around one specific host's missing
 * CORS headers, not to fetch arbitrary URLs on a client's behalf.
 */
const GTFS_PROXY_ALLOWED_HOST = "api.data.gov.my";

/** Bounds a slow upstream so one stalled download cannot hold a request open indefinitely. */
export const GTFS_UPSTREAM_TIMEOUT_MS = 15_000;

/** Each StaticSource loads once per tab, and the static feed changes slowly, so an hour is safe. */
export const GTFS_PROXY_CACHE_CONTROL = "public, max-age=3600";

export type FetchLike = (url: URL, init: { signal: AbortSignal }) => Promise<Response>;

export interface GtfsProxyDeps {
  fetch: FetchLike;
  captureException: (err: unknown) => void;
}

export function createGtfsProxyHandler(deps: GtfsProxyDeps) {
  return async (req: Request, res: ExpressResponse): Promise<void> => {
    const target = req.query["url"];
    if (typeof target !== "string") {
      res.status(400).send("Missing url query parameter");
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      res.status(400).send("Invalid url");
      return;
    }
    if (parsed.hostname !== GTFS_PROXY_ALLOWED_HOST) {
      res.status(400).send("URL host not allowed");
      return;
    }

    try {
      const upstream = await deps.fetch(parsed, {
        signal: AbortSignal.timeout(GTFS_UPSTREAM_TIMEOUT_MS),
      });
      if (!upstream.ok) {
        res
          .status(upstream.status)
          .send(`Upstream error: ${upstream.status} ${upstream.statusText}`);
        return;
      }
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.setHeader(
        "Content-Type",
        upstream.headers.get("content-type") ?? "application/octet-stream",
      );
      res.setHeader("Cache-Control", GTFS_PROXY_CACHE_CONTROL);
      res.send(buffer);
    } catch (err) {
      deps.captureException(err);
      res
        .status(502)
        .send(`Proxy fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
}
