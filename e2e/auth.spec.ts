import { E2E_DISPLAY_NAME, E2E_EMAIL, loginAs } from "./helpers/auth";
import {
  configureMock,
  expect,
  recordedCalls,
  routeGraphQLToMock,
  test,
} from "./helpers/mock-graphql";

/**
 * Sign-in as the app sees it: a persisted Firebase session restored on boot (helpers/auth.ts),
 * so the account panel, the route guards and every token-bearing request run for real. Nothing
 * here can pass through an override that skips the token path: the mock rejects a mutation that
 * arrives without `firebase-auth-key`.
 */

test.beforeEach(async ({ page }) => {
  await routeGraphQLToMock(page);
});

test.describe("sign-in", () => {
  test("a restored session turns the nav's Log in into the account, which can ask for a code", async ({
    page,
  }) => {
    await configureMock({
      Lines: { lines: [] },
      RequestVerificationCode: { requestVerificationCode: { code: 123456 } },
    });

    // A visitor: the nav offers Log in, and the guarded /profile sends them to /spotting.
    await page.goto("/about");
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/spotting$/);

    // The session appears (as after a completed sign-in): the next load restores it.
    const token = await loginAs(page);
    await page.goto("/about");
    await expect(page.getByRole("button", { name: "Account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log in" })).toHaveCount(0);

    await page.getByRole("button", { name: "Account" }).click();
    const panel = page.locator("app-account-panel");
    await expect(panel.getByText(E2E_DISPLAY_NAME, { exact: true })).toBeVisible();
    await expect(panel.getByText(E2E_EMAIL, { exact: true })).toBeVisible();

    await page.getByTestId("account-request-code").click();
    await expect(page.getByTestId("account-code-spoken")).toHaveText("1 2 3 4 5 6");
    const call = (await recordedCalls()).find((c) => c.operationName === "RequestVerificationCode");
    expect(call?.authKey).toBe(token);
  });

  test("logging out from a guarded page ends the session and the guards close again", async ({
    page,
  }) => {
    await configureMock({
      Lines: { lines: [] },
      ConsoleSocialMediaLinks: { socialMediaLinks: [] },
      ConsoleCategories: { calendarIncidentCategories: [] },
      InsidenReferenceData: { lines: [], stations: [], calendarIncidentCategories: [] },
    });

    await loginAs(page, { admin: true });
    await page.goto("/console/links");
    await expect(page.getByRole("button", { name: "Account" })).toBeVisible();

    await page.getByRole("button", { name: "Account" }).click();
    // Logout needs a confirming second click.
    await page.getByRole("button", { name: "Log out" }).click();
    await page.getByRole("button", { name: "Click again to confirm Log Out" }).click();
    await expect(page.getByText("Logged out")).toBeVisible();
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();

    // The session is gone from storage, not just from the page: a fresh load is a visitor's.
    await page.goto("/console/links");
    await expect(page).toHaveURL(/\/spotting$/);
  });
});
