import { expect, test as base, type Page } from "@playwright/test";

/**
 * Shared handle on e2e/mock-graphql.server.mjs — started by playwright.config.ts's
 * webServer and the single source of truth for every GraphQL response in the E2E suite.
 *
 * The CSR bundle is built with the development configuration, whose GraphQL client
 * points at the local dev backend (http://localhost:8000/graphql/), not at the mock.
 * `routeGraphQLToMock` bridges that gap: it re-issues each GraphQL request the page
 * makes against the mock, so stubs (`POST /__configure`), the call log (`GET /__calls`)
 * and `POST /__reset` work unchanged and no app source has to know about E2E.
 *
 * Import `test` and `expect` from this module, not from "@playwright/test": its `test` resets
 * the mock before each test and fails the test, naming them, when the page called a GraphQL
 * operation nobody stubbed (the mock would otherwise answer an error the app may render as an
 * empty state, so "row not visible" assertions could pass for the wrong reason).
 */
export const MOCK_GRAPHQL_URL = `http://localhost:${process.env["MOCK_GRAPHQL_PORT"] ?? 4301}`;

/**
 * Re-points every GraphQL request the page makes at the mock server. Call before `goto`.
 * `hold`, when given, runs for each request with its body (the query text) after the mock has
 * answered and before the page gets the response: await a promise in it to keep a request open.
 */
export async function routeGraphQLToMock(
  page: Page,
  hold?: (body: string) => Promise<void>,
): Promise<void> {
  await page.route("**/graphql/", async (route) => {
    try {
      // maxRetries: the mock may close an idle keep-alive socket just as it is reused (ECONNRESET).
      const response = await route.fetch({ url: `${MOCK_GRAPHQL_URL}/graphql/`, maxRetries: 2 });
      await hold?.(route.request().postData() ?? "");
      await route.fulfill({ response });
    } catch (err) {
      // A request still in flight when the test ends fails here because its page is gone.
      if (!page.isClosed()) {
        throw err;
      }
    }
  });
}

/** Replaces the mock's operation-name keyed stubs with `stubs`. */
export async function configureMock(stubs: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${MOCK_GRAPHQL_URL}/__configure`, {
    method: "POST",
    body: JSON.stringify(stubs),
  });
  expect(res.ok).toBe(true);
}

/** A stub that makes the operation fail with a GraphQL error (what the app treats as a rejected write). */
export const graphqlError = (message: string): { __error: string } => ({ __error: message });

export interface RecordedCall {
  operationName: string;
  variables: Record<string, unknown>;
  /** The `firebase-auth-key` header the page sent, or `null` for an anonymous request. */
  authKey: string | null;
}

/** Every GraphQL call the mock has received this test, oldest first. */
export async function recordedCalls(): Promise<RecordedCall[]> {
  const res = await fetch(`${MOCK_GRAPHQL_URL}/__calls`);
  return (await res.json()) as RecordedCall[];
}

/** Names of the operations the mock received without a stub this test, first seen first. */
export async function unstubbedOperations(): Promise<string[]> {
  const res = await fetch(`${MOCK_GRAPHQL_URL}/__unstubbed`);
  const names: unknown = res.ok ? await res.json() : null;
  if (!Array.isArray(names)) {
    // A server left running from older code (the ports are shared across checkouts) has no such route.
    throw new Error(
      `mock GraphQL server on ${MOCK_GRAPHQL_URL} predates /__unstubbed: stop it and rerun`,
    );
  }
  return names as string[];
}

/** Clears stubs, recorded calls and unstubbed names. */
export async function resetMock(): Promise<void> {
  await fetch(`${MOCK_GRAPHQL_URL}/__reset`, { method: "POST" });
}

export { expect };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * Playwright's `test` plus the mock reset and the unstubbed-operation check described above, and a
 * page that cannot reach the internet: ads, analytics, Sentry and Firebase's own hosts would
 * otherwise make runs slower, nondeterministic and noisy. A spec that needs one of those hosts
 * registers its own `page.route`, which takes precedence over this catch-all.
 */
export const test = base.extend<{ mockGuard: void }>({
  page: async ({ page }, use) => {
    await page.route(
      (url) => !LOCAL_HOSTS.has(url.hostname),
      (route) => route.abort(),
    );
    await use(page);
  },
  mockGuard: [
    async ({}, use) => {
      await resetMock();
      await use();
      const missing = await unstubbedOperations();
      expect(missing, `GraphQL operations called without a stub: ${missing.join(", ")}`).toEqual(
        [],
      );
    },
    { auto: true },
  ],
});
