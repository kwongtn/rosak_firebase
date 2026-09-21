import { expect, type Page } from "@playwright/test";

/**
 * Shared handle on e2e/mock-graphql.server.mjs — started by playwright.config.ts's
 * webServer and the single source of truth for every GraphQL response in the E2E suite.
 *
 * The CSR bundle is built with the development configuration, whose GraphQL client
 * points at the local dev backend (http://localhost:8000/graphql/), not at the mock.
 * `routeGraphQLToMock` bridges that gap: it re-issues each GraphQL request the page
 * makes against the mock, so stubs (`POST /__configure`), the call log (`GET /__calls`)
 * and `POST /__reset` work unchanged and no app source has to know about E2E.
 */
export const MOCK_GRAPHQL_URL = "http://localhost:4301";

/** Re-points every GraphQL request the page makes at the mock server. Call before `goto`. */
export async function routeGraphQLToMock(page: Page): Promise<void> {
  await page.route("**/graphql/", async (route) => {
    const response = await route.fetch({ url: `${MOCK_GRAPHQL_URL}/graphql/` });
    await route.fulfill({ response });
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

export interface RecordedCall {
  operationName: string;
  variables: Record<string, unknown>;
}

/** Every GraphQL call the mock has received this test, oldest first. */
export async function recordedCalls(): Promise<RecordedCall[]> {
  const res = await fetch(`${MOCK_GRAPHQL_URL}/__calls`);
  return (await res.json()) as RecordedCall[];
}

/** Clears stubs and recorded calls. */
export async function resetMock(): Promise<void> {
  await fetch(`${MOCK_GRAPHQL_URL}/__reset`, { method: "POST" });
}
