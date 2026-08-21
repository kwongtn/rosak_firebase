import { defineConfig } from "@playwright/test";

/**
 * E2E specs run against a CSR-only static build of the app (development
 * configuration, which targets http://localhost:8000/graphql/) served by
 * e2e/static-server.mjs, plus the local mock GraphQL server answering on
 * that URL. Deterministic: no live backend, no SSR transfer-cache coupling.
 * Firebase Auth is seeded through IndexedDB — see e2e/helpers/auth.ts.
 *
 * Rebuild the bundle before running if app source changed:
 *   npx ng build --configuration development
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4300",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node e2e/mock-graphql.server.mjs",
      url: "http://localhost:4301",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "node e2e/static-server.mjs",
      url: "http://localhost:4300",
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
