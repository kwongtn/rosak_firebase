import type { Page } from "@playwright/test";

/**
 * Installs the E2E auth override (see AuthService.E2EAuthOverride) before the
 * app boots, so specs run guarded routes and logged-in mutations without a
 * live Firebase project. GraphQL responses come from the local mock server,
 * so no real token is ever needed.
 */
export async function loginAs(page: Page, user: { admin?: boolean } = {}): Promise<void> {
  await page.addInitScript((admin: boolean) => {
    (globalThis as { __e2eAuthOverride__?: unknown }).__e2eAuthOverride__ = {
      email: "e2e@example.com",
      admin,
    };
  }, user.admin === true);
}
