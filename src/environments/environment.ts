import { Environment } from "./environment.model";
import { firebaseConfig } from "./firebase-config.generated";
import { runtimeConfig } from "./runtime-config.generated";

// This is the CLI's default ("production") build — the same build artifact is deployed to both
// the staging and production App Hosting backends. The values that need to differ between them
// come from runtimeConfig (see generate-runtime-config.mjs and apphosting.staging.yaml) rather
// than a second fileReplacement, so no source change is needed per environment.
export const environment: Environment = {
  production: true,
  environmentName: runtimeConfig.environmentName,
  backendUrl: runtimeConfig.backendUrl,
  backendGraphqlUrl: runtimeConfig.backendGraphqlUrl,
  firebase: firebaseConfig,
  upload: {
    concurrency: runtimeConfig.uploadConcurrency,
  },
  captcha: {
    siteKey: runtimeConfig.captchaSiteKey,
  },
  mapbox: {
    token: runtimeConfig.mapboxToken,
  },
  sentry: {
    // Same project the old app reports to (see the repo root's own environment.prod.ts) —
    // errors from both apps land in one place during the side-by-side rewrite period,
    // distinguished by the `app` tag set at init (see main.ts) rather than by a separate
    // project, which would otherwise need a brand new DSN provisioned before this could ship.
    // Shared by staging and production alike (same DSN in both the old app's staging/prod
    // environment files) — the `environment` tag (see sentry-options.ts) is what separates them
    // in the Sentry dashboard, not a separate project.
    dsn: "https://239abe11366d4590a1c1ebd5260c63e2@o1331817.ingest.sentry.io/6596136",
    // Derived from backendUrl rather than its own env var: this always needs to point at the
    // same backend's /sentry/ proxy route, so keeping it a separate value could let it drift out
    // of sync with backendUrl.
    tunnel: `${runtimeConfig.backendUrl}sentry/`,
  },
};
