import { Environment } from "./environment.model";
import { firebaseConfig } from "./firebase-config.generated";
import { runtimeConfig } from "./runtime-config.generated";

export const environment: Environment = {
  production: false,
  environmentName: "development",
  backendUrl: "http://localhost:8000/",
  backendGraphqlUrl: "http://localhost:8000/graphql/",
  firebase: firebaseConfig,
  upload: {
    concurrency: 10,
  },
  captcha: {
    siteKey: "6LdKj0QhAAAAAOEKyuxa6X2kIhVhgfinAorgxc4r",
  },
  mapbox: {
    token:
      "pk.eyJ1Ijoia3dvbmd0biIsImEiOiJjbHd3d241ZWExMGhyMmpzN3hzcTh1bXU5In0.eQt0fqq-1aRq023MLG7VPg",
  },
  // Empty unless FCM_VAPID_KEY is set for `npm start`, so local alerts stay off by default.
  fcm: {
    vapidKey: runtimeConfig.fcmVapidKey,
  },
  // Same project as prod (see environment.ts's own comment on why one shared project rather
  // than a second one to provision) — *not* disabled here the way the old app's dev
  // environment disables Sentry outright. A missing dsn would leave "Report a bug"
  // (the lazy FeedbackService widget) with nothing to send through for anyone testing it locally.
  // Every event still carries `environment: "development"` (see sentry-options.ts), so local runs
  // stay filterable/ignorable in the Sentry dashboard without needing to be unreportable outright.
  sentry: {
    dsn: "https://239abe11366d4590a1c1ebd5260c63e2@o1331817.ingest.sentry.io/6596136",
    tunnel: "https://api-community.mlptf.org.my/sentry/",
  },
};
