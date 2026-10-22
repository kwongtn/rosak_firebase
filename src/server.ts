import * as Sentry from "@sentry/node";
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from "@angular/ssr/node";
import express from "express";
import { join, relative } from "node:path";
import { environment } from "./environments/environment";
import { sentrySharedOptions } from "./sentry-options";
import { homeCacheControl, staticCacheControl } from "./server-cache-control";
import { createGtfsProxyHandler } from "./server-gtfs-proxy";

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

app.get(
  "/api/gtfs-proxy",
  createGtfsProxyHandler({ fetch, captureException: Sentry.captureException }),
);

/**
 * Serve static files from /browser with a one-year max-age (the chunks are content-hashed), except
 * the files `staticCacheControl` lists, such as the service worker and the web app manifest: their
 * names survive a deploy, so they are revalidated instead.
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: "1y",
    index: false,
    redirect: false,
    setHeaders: (res, filePath) => {
      const cacheControl = staticCacheControl(relative(browserDistFolder, filePath));
      if (cacheControl) {
        res.setHeader("Cache-Control", cacheControl);
      }
    },
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => {
      if (!response) {
        return next();
      }
      const cacheControl = homeCacheControl(
        req.method,
        req.path,
        response.status,
        response.headers.get("cache-control"),
      );
      if (cacheControl) {
        response.headers.set("Cache-Control", cacheControl);
      }
      return writeResponseToNodeResponse(response, res);
    })
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
