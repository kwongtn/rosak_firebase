import { defineConfig, devices } from "@playwright/test";

/**
 * E2E specs run against a CSR-only static build of the app (development
 * configuration, which targets http://localhost:8000/graphql/) served by
 * e2e/static-server.mjs, plus the local mock GraphQL server answering on
 * that URL. Deterministic: no live backend, no SSR transfer-cache coupling.
 * Firebase Auth is seeded through IndexedDB — see e2e/helpers/auth.ts.
 *
 * Rebuild the bundle before running if app source changed:
 *   npx ng build --configuration development
 *
 * Two projects: `desktop` runs everything; `mobile` (Pixel 7: touch, small viewport, mobile UA)
 * runs the specs that do not pin their own viewport or rely on hover. The servers' ports can be
 * moved with STATIC_PORT and MOCK_GRAPHQL_PORT (both read by the servers and the helpers too).
 */
const STATIC_PORT = Number(process.env["STATIC_PORT"] ?? 4300);
const MOCK_PORT = Number(process.env["MOCK_GRAPHQL_PORT"] ?? 4301);

/**
 * Specs that set their own viewports or exercise hover, which a touch phone profile cannot do.
 * home.spec.ts is not here: it skips its few hover and viewport tests itself (`isMobile`).
 */
const DESKTOP_ONLY = [
  "**/spotting-details.spec.ts",
  "**/spotting-keep-alive.spec.ts",
  "**/tracker.spec.ts",
];

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  // The first render after a goto loads a 4 MB development bundle: 10 s was not enough on a busy
  // machine (a test failed at its first assertion, a different one on each run).
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["list"], ["github"]] : [["list"]],
  projects: [
    { name: "desktop" },
    { name: "mobile", use: devices["Pixel 7"], testIgnore: DESKTOP_ONLY },
  ],
  use: {
    baseURL: `http://localhost:${STATIC_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node e2e/mock-graphql.server.mjs",
      url: `http://localhost:${MOCK_PORT}`,
      reuseExistingServer: !process.env["CI"],
      timeout: 30_000,
    },
    {
      command: "node e2e/static-server.mjs",
      url: `http://localhost:${STATIC_PORT}`,
      reuseExistingServer: !process.env["CI"],
      timeout: 30_000,
    },
  ],
});
