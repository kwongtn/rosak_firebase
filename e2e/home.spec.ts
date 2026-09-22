import { expect, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";
import {
  configureMock,
  recordedCalls,
  resetMock,
  routeGraphQLToMock,
} from "./helpers/mock-graphql";

/**
 * Regression coverage for the community front page (the `""` route): the feed and its
 * submit box, the per-line pulse list, and the line-status sheet. Responses come from
 * the mock GraphQL server — `routeGraphQLToMock` bridges the build's dev-backend URL to
 * it (see e2e/helpers/mock-graphql.ts). Authenticated tests use the AuthService E2E
 * override (helpers/auth.ts), never a real Firebase session.
 */

const KJL_LINE = {
  id: "1",
  code: "KJL",
  displayName: "Kelana Jaya Line",
  displayColor: "#e5001c",
  status: "ACTIVE",
  inServiceVehicleCount: 12,
  totalVehicleCount: 20,
  passengerStatus: "NORMAL",
  passengerStatusMessage: "Trains are running normally.",
  statusReportCount: 3,
  pulseLinks: [],
};

const MRL_LINE = {
  id: "2",
  code: "MRL",
  displayName: "Monorail Line",
  displayColor: "#8bc34a",
  status: "PARTIAL_DISRUPTION",
  inServiceVehicleCount: 4,
  totalVehicleCount: 12,
  passengerStatus: null,
  passengerStatusMessage: null,
  statusReportCount: 0,
  pulseLinks: [],
};

/** A feed node created "now" so the card's relative time renders deterministically as "today". */
function feedNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "42",
    url: "https://www.facebook.com/mlptf/posts/123",
    normalizedUrl: "https://facebook.com/mlptf/posts/123",
    title: "Kelana Jaya Line disruption thread",
    created: new Date().toISOString(),
    voteScore: 3,
    userVote: 0,
    lines: [{ id: "1", code: "KJL", displayName: "Kelana Jaya Line" }],
    user: { shortId: "rk01", nickname: "RapidKL Watch" },
    ...overrides,
  };
}

function feedPage(node: Record<string, unknown> = feedNode()): Record<string, unknown> {
  return {
    publicSocialMediaLinks: {
      edges: [{ node, cursor: "cursor-1" }],
      pageInfo: { hasNextPage: false, endCursor: "cursor-1" },
    },
  };
}

test.beforeEach(async ({ page }) => {
  await resetMock();
  await routeGraphQLToMock(page);
});

test.describe("community front page", () => {
  test("VISITOR: renders the feed and line pulse list read-only", async ({ page }) => {
    await configureMock({
      FrontPageLines: { lines: [KJL_LINE, MRL_LINE] },
      Feed: feedPage(),
    });

    await page.goto("/");

    // Logged out the submit box is exactly the login call-to-action — no form.
    await expect(page.getByTestId("login-to-submit")).toHaveText("Log in to submit links");
    await expect(page.getByLabel("Link URL")).toHaveCount(0);

    // The feed row: www-stripped domain, title, line badge, score, submitter, relative time.
    const card = page
      .locator("app-feed-link-card")
      .filter({ hasText: "Kelana Jaya Line disruption thread" });
    await expect(card.getByText("facebook.com", { exact: true })).toBeVisible();
    await expect(card.getByText("www.facebook.com")).toHaveCount(0);
    await expect(card.getByText("KJL", { exact: true })).toBeVisible();
    await expect(card.getByTestId("feed-submitter")).toHaveText("RapidKL Watch");
    await expect(card.getByText("+3")).toBeVisible();
    await expect(card.getByText("today", { exact: true })).toBeVisible();

    // Logged out, the vote controls render but are disabled.
    await expect(card.getByRole("button", { name: "Upvote" })).toBeDisabled();
    await expect(card.getByRole("button", { name: "Downvote" })).toBeDisabled();

    // Each line card: vehicle counts, status badge and passenger status (or "No data").
    const kjl = page.locator("app-line-pulse-card").filter({ hasText: "Kelana Jaya Line" });
    await expect(kjl.getByTestId("line-vehicle-count")).toHaveText("12 of 20 vehicles in service");
    await expect(kjl.getByTestId("passenger-status")).toHaveText("Normal");
    await expect(kjl.getByText("Active", { exact: true })).toBeVisible();
    await expect(kjl.getByTestId("line-pulse-message")).toHaveText("Trains are running normally.");

    // Non-ACTIVE lines are folded behind a disclosure that starts collapsed.
    const otherLines = page.getByTestId("other-lines");
    const mrl = page.locator("app-line-pulse-card").filter({ hasText: "Monorail Line" });
    await expect(otherLines).toBeVisible();
    await expect(otherLines).toHaveJSProperty("open", false);
    await expect(page.getByTestId("other-lines-summary")).toContainText("Other lines");
    await expect(mrl).toBeHidden();

    await page.getByTestId("other-lines-summary").click();
    await expect(otherLines).toHaveJSProperty("open", true);
    await expect(mrl.getByTestId("line-vehicle-count")).toHaveText("4 of 12 vehicles in service");
    await expect(mrl.getByTestId("passenger-status")).toHaveText("No data");
    await expect(mrl.getByTestId("line-pulse-message")).toHaveCount(0);

    // The line card's submit control opens the status sheet (login-gated here).
    await kjl.getByTestId("submit-line-status").click();
    await expect(
      page.getByRole("heading", { level: 2, name: /KJL · Kelana Jaya Line/ }),
    ).toBeVisible();
    await expect(
      page.getByText(/You'll need to log in before submitting a line status report\./),
    ).toBeVisible();
    await expect(page.getByTestId("login-button")).toBeVisible();
    await expect(page.getByTestId("submit-line-status-report")).toHaveCount(0);
  });

  test("USER: a duplicate submission surfaces the already-submitted indicator", async ({
    page,
  }) => {
    await loginAs(page);
    await configureMock({
      FrontPageLines: { lines: [KJL_LINE] },
      Feed: feedPage(),
      SubmitFeedLink: {
        submitFeedLink: {
          ok: true,
          isDuplicate: true,
          duplicateOfId: "42",
          userVote: 1,
          link: feedNode(),
        },
      },
    });

    await page.goto("/");

    // Logged in, the submit box is the real form: URL input + optional line status.
    await expect(page.getByLabel("Link URL")).toBeVisible();
    const statusSelect = page.getByRole("combobox", { name: "Line status" });
    await expect(statusSelect).toBeVisible();
    await expect(statusSelect).toContainText("Line status (optional)");
    await expect(statusSelect).toContainText("Crowded");

    await page.getByLabel("Link URL").fill("https://www.facebook.com/mlptf/posts/123");
    await page.getByRole("button", { name: "Submit link", exact: true }).click();

    const duplicate = page.getByTestId("duplicate-indicator");
    await expect(duplicate).toBeVisible();
    await expect(duplicate).toContainText("Already submitted");
    await expect(duplicate).toContainText("upvote was added");
    await expect(duplicate.getByRole("link", { name: "View it in the feed" })).toHaveAttribute(
      "href",
      "#feed-link-42",
    );

    await expect
      .poll(async () => (await recordedCalls()).map((c) => c.operationName))
      .toContain("SubmitFeedLink");
    const submitCall = (await recordedCalls()).find((c) => c.operationName === "SubmitFeedLink");
    expect(submitCall?.variables).toEqual({
      input: { url: "https://www.facebook.com/mlptf/posts/123", lineIds: [] },
    });

    // The duplicate's backend upvote is mirrored into the matching feed row.
    const card = page
      .locator("app-feed-link-card")
      .filter({ hasText: "Kelana Jaya Line disruption thread" });
    await expect(card.getByRole("button", { name: "Upvote" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("USER: submits a line status report from a line card's sheet", async ({ page }) => {
    await loginAs(page);
    await configureMock({
      FrontPageLines: { lines: [KJL_LINE] },
      Feed: feedPage(),
      StationLinesByLine: { stationLines: [] },
      SubmitLineStatusReport: { submitLineStatusReport: { ok: true, id: 777 } },
    });

    await page.goto("/");

    const kjl = page.locator("app-line-pulse-card").filter({ hasText: "Kelana Jaya Line" });
    await kjl.getByTestId("submit-line-status").click();
    await expect(
      page.getByRole("heading", { level: 2, name: /KJL · Kelana Jaya Line/ }),
    ).toBeVisible();

    await page.getByTestId("status-option-CROWDED").click();
    await page.getByTestId("submit-line-status-report").click();

    await expect(page.getByText("Line status reported")).toBeVisible();
    await expect
      .poll(async () => (await recordedCalls()).map((c) => c.operationName))
      .toContain("SubmitLineStatusReport");
    const reportCall = (await recordedCalls()).find(
      (c) => c.operationName === "SubmitLineStatusReport",
    );
    expect(reportCall?.variables).toEqual({
      input: { lineId: "1", status: "CROWDED", stationIds: [], delayMinutes: null, notes: null },
    });
  });

  test("USER: upvotes a feed link", async ({ page }) => {
    await loginAs(page);
    await configureMock({
      FrontPageLines: { lines: [KJL_LINE] },
      Feed: feedPage(),
      UpvoteSocialMediaLink: { upvoteSocialMediaLink: { ok: true } },
    });

    await page.goto("/");

    const card = page
      .locator("app-feed-link-card")
      .filter({ hasText: "Kelana Jaya Line disruption thread" });
    const upvote = card.getByRole("button", { name: "Upvote" });
    await expect(upvote).toBeEnabled();
    await expect(card.getByText("+3")).toBeVisible();

    await upvote.click();

    await expect
      .poll(async () => (await recordedCalls()).map((c) => c.operationName))
      .toContain("UpvoteSocialMediaLink");
    const voteCall = (await recordedCalls()).find(
      (c) => c.operationName === "UpvoteSocialMediaLink",
    );
    expect(voteCall?.variables).toEqual({ id: "42" });
    await expect(card.getByRole("button", { name: "Upvote" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
