import { bootstrapApplication } from "@angular/platform-browser";
import * as Sentry from "@sentry/angular";
import { appConfig } from "./app/app.config";
import { App } from "./app/app";
import { environment } from "./environments/environment";
import { sentrySharedOptions } from "./sentry-options";

// Initialized here, before bootstrap, rather than inside app.config.ts's providers: this file is
// the *client-only* entry point (main.server.ts is the separate SSR one — see app.config.server.ts),
// so nothing here needs an isPlatformBrowser guard, and Sentry's own docs are explicit that init()
// should run as early as possible, ahead of anything it needs to instrument.
Sentry.init({
  ...sentrySharedOptions,
  tunnel: environment.sentry.tunnel,
  integrations: [
    // Pairs with TraceService (see app.config.ts) — that service is what actually feeds this
    // integration real Angular Router navigation events instead of only capturing pageloads.
    Sentry.browserTracingIntegration(),
    // Captures failed HTTP requests (GraphQL POSTs included) as their own breadcrumbs/events
    // — this app leans on `httpResource`/`graphqlResource` everywhere, so a plain uncaught-
    // exception view alone would miss most real "why did this page show an error state"
    // reports.
    Sentry.httpClientIntegration(),
    // Adds surrounding source lines to stack traces once source maps are uploaded at build
    // time — a no-op cost otherwise, so there's no reason to leave it out ahead of that.
    Sentry.contextLinesIntegration(),
    // User Feedback widget. autoInject:false — this app supplies its own trigger (app-nav's
    // "Report a bug" button, wired via `Sentry.getFeedback()?.attachTo(...)`) instead of
    // Sentry's own floating default button, so the app controls where/how it's surfaced.
    Sentry.feedbackIntegration({ autoInject: false, colorScheme: "system" }),
  ],
  // A lower rate in production than in dev (where full visibility while testing costs nothing)
  // — 20% is enough to spot real regressions in aggregate without paying for a full-volume
  // trace on every single request this app makes.
  tracesSampleRate: environment.production ? 0.2 : 1.0,
  // Same split as the old app: sample 10% of ordinary sessions, but always keep a replay for
  // any session that actually hits an error, since that's precisely the case a replay is
  // useful for and the extra volume is bounded by how often errors actually happen.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

// Session Replay — recorded video-like reconstructions of real sessions. Deliberately
// left at Sentry's own default privacy settings (maskAllText / blockAllMedia both true):
// this app's own pages carry a live GraphQL search combobox, a photo upload flow, and
// profile-editing text, none of which should ever be legible in a replay by default.
//
// Every session needs the integration (replaysOnErrorSampleRate buffers a replay for error
// sessions), but nothing needs it for first paint. Calling addIntegration() after bootstrap would
// only delay when recording *starts*: any static reference to replayIntegration still makes the
// bundler ship its ~155 KB with the first-load bundle. So it is reached only through a dynamic
// import() of replay-integration.ts (which explains why that file is not a plain re-export) and
// fetched once the browser is idle.
const REPLAY_LOAD_DELAY_MS = 3000;

async function addReplayIntegration(): Promise<void> {
  const { replayIntegration } = await import("./app/core/sentry/replay-integration");
  Sentry.addIntegration(replayIntegration());
}

bootstrapApplication(App, appConfig)
  .then(() => {
    // Not awaited or returned, so a failed chunk load stays an unhandled rejection that Sentry
    // reports, rather than being logged and dropped by the catch below. The delay is
    // requestIdleCallback's `timeout` (the longest a permanently busy page may postpone replay);
    // the setTimeout branch is for Safari, which has no requestIdleCallback.
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(addReplayIntegration, { timeout: REPLAY_LOAD_DELAY_MS });
    } else {
      setTimeout(addReplayIntegration, REPLAY_LOAD_DELAY_MS);
    }
  })
  .catch((err) => console.error(err));
