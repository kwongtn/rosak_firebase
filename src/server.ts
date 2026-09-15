import * as Sentry from "@sentry/node";
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from "@angular/ssr/node";
import express from "express";
import { join } from "node:path";
import { environment } from "./environments/environment";
import { sentrySharedOptions } from "./sentry-options";

// As early as possible, before anything below it that could throw — this is the SSR-side
// counterpart to main.ts's browser Sentry.init(), sharing the same dsn/release/environment
// (see sentry-options.ts) so a server-rendering failure and a client-side error from the exact
// same deploy show up under the same release in Sentry. No `tunnel` here: that option exists to
// route around browser-side ad-blockers, which was never a concern for a server-to-server
// request in the first place.
Sentry.init({
  ...sentrySharedOptions,
  integrations: [Sentry.httpIntegration()],
  tracesSampleRate: environment.production ? 0.2 : 1.0,
});

const browserDistFolder = join(import.meta.dirname, "../browser");

const app = express();
const angularApp = new AngularNodeAppEngine();

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

app.get("/api/gtfs-proxy", async (req, res) => {
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
    const upstream = await fetch(parsed);
    if (!upstream.ok) {
      res.status(upstream.status).send(`Upstream error: ${upstream.status} ${upstream.statusText}`);
      return;
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") ?? "application/octet-stream",
    );
    res.send(buffer);
  } catch (err) {
    Sentry.captureException(err);
    res.status(502).send(`Proxy fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: "1y",
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

// After every route/middleware, before app.listen — per Sentry's own documented Express
// integration order. Catches anything passed to `next(err)` above (a render failure) that
// wasn't already captured closer to where it happened, and re-throws so Express's own default
// error response still runs afterward.
Sentry.setupExpressErrorHandler(app);

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env["pm_id"]) {
  const port = process.env["PORT"] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
