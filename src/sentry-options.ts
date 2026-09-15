import { buildInfo } from "./build-info";
import { environment } from "./environments/environment";

/**
 * The handful of Sentry init options shared between the browser SDK (main.ts) and the SSR
 * server's own Node SDK (server.ts) — release/environment/dsn need to agree between the two so
 * a single deploy's client- and server-side errors land under the same release in Sentry, rather
 * than each entry point computing its own slightly-different version of the same three values.
 * Everything integration- or sampling-related stays local to each entry point instead: browser
 * tracing/replay and Node's own instrumentation are genuinely different SDKs with different
 * concerns, and forcing them through one shared options object would just obscure that.
 */
export const sentrySharedOptions = {
  dsn: environment.sentry.dsn,
  environment: environment.environmentName,
  /** The current deploy's short git hash (see scripts/generate-build-info.mjs) — ties every
   * error report to exactly the build that produced it, the same identifier already shown in
   * the page footer. */
  release: buildInfo.hash,
  /** Distinguishes this rewrite's reports from the old app's, which reports to the same Sentry
   * project (see environment.ts's own comment) — filterable in Sentry without needing a second
   * project provisioned before this could ship. */
  initialScope: { tags: { app: "web-next" } },
};
