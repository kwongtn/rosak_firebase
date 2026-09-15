import { Environment } from "./environment.model";
import { firebaseConfig } from "./firebase-config.generated";

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
  // Same project as prod (see environment.ts's own comment on why one shared project rather
  // than a second one to provision) — *not* disabled here the way the old app's dev
  // environment disables Sentry outright. A missing dsn doesn't just silence event sending, it
  // makes `Sentry.getFeedback()` return undefined entirely (confirmed directly: the feedback
  // integration itself never registers), which would make the nav's "Report a bug" button
  // silently do nothing for anyone testing it locally. Every event still carries
  // `environment: "development"` (see sentry-options.ts), so local runs stay filterable/
  // ignorable in the Sentry dashboard without needing to be unreportable outright.
  sentry: {
    dsn: "https://239abe11366d4590a1c1ebd5260c63e2@o1331817.ingest.sentry.io/6596136",
    tunnel: "https://api-community.mlptf.org.my/sentry/",
  },
};
