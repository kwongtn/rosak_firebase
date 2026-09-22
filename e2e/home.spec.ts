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
 *
 * Round 3 moved a lot of copy behind hover/tap popovers (the feed's exact timestamp and
 * submitter, the line card's consolidated message) and behind the line card's expand
 * toggle (the hourly chart and the recent-reports list, both lazy reads) — the assertions
 * live in the popovers/disclosure accordingly, and the two lazy reads are stubbed below.
 *
 * Round 4 reshaped the feed: its row is now the shared `app-link-card` (`link-*` testids),
 * the per-status counts are folded into the severity legend (`status-scale-entry` /
 * `status-scale-count`, no more `status-count-pill`), the read is scoped to the current
 * service day and reports `totalCount`, and a bottom-right `feed-footer` shows
 * "Showing X of Y" plus Load More while another page exists.
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
  passengerStatusCount: 5,
  passengerStatusCounts: [
    { status: "NORMAL", count: 3 },
    { status: "BUSY", count: 2 },
  ],
  statusWindowMinutes: 30,
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

/**
 * A feed node created "now" so the card's relative time renders deterministically as
 * "less than a minute ago" (`humanizeSince` is minute-granular). `completed` is true so the
 * shared card's Pending pill stays off a feed row; the vote fields feed the vote control.
 */
function feedNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "42",
    url: "https://www.facebook.com/mlptf/posts/123",
    normalizedUrl: "https://facebook.com/mlptf/posts/123",
    title: "Kelana Jaya Line disruption thread",
    created: new Date().toISOString(),
    completed: true,
    voteScore: 3,
    userVote: 0,
    voteBreakdown: { upvotes: 3, downvotes: 0 },
    lines: [{ id: "1", code: "KJL", displayName: "Kelana Jaya Line" }],
    user: { shortId: "rk01", nickname: "RapidKL Watch" },
    ...overrides,
  };
}

/** The filtered total behind the one stubbed page — deliberately larger than the visible
 * page (one node), so the footer reads "Showing 1 of 9" and Load More stays exercisable. */
const FEED_TOTAL_COUNT = 9;

function feedPage(node: Record<string, unknown> = feedNode()): Record<string, unknown> {
  return {
    publicSocialMediaLinks: {
      edges: [{ node, cursor: "cursor-1" }],
      pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
      totalCount: FEED_TOTAL_COUNT,
    },
  };
}

/**
 * The feed tooltip renders Angular's `date: "MMM d, y HH:mm"` (en-US, browser timezone) —
 * reproduce it here so the assertion pins the exact timestamp, not just a fragment.
 */
function exactTimestamp(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (type: string): string => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("month")} ${part("day")}, ${part("year")} ${part("hour")}:${part("minute")}`;
}

/** Hourly buckets for the KJL chart — 19:00Z is 03:00 MYT, the community service day's start. */
const HISTORY_BUCKETS = [
  {
    hourStart: "2026-09-21T19:00:00Z",
    hourEnd: "2026-09-21T20:00:00Z",
    count: 0,
    dominantStatus: null,
  },
  {
    hourStart: "2026-09-21T20:00:00Z",
    hourEnd: "2026-09-21T21:00:00Z",
    count: 4,
    dominantStatus: "CROWDED",
  },
  {
    hourStart: "2026-09-21T21:00:00Z",
    hourEnd: "2026-09-21T22:00:00Z",
    count: 2,
    dominantStatus: "BUSY",
  },
];

/** One page of KJL community reports: the first carries a delay, a station and notes, the
 * second only a badge. Both are created at `created` so the row's right-aligned relative time
 * (and the exact timestamp on its `title`) is deterministic. */
function reportsPage(created: string): Record<string, unknown> {
  return {
    lineStatusReports: {
      edges: [
        {
          node: {
            id: "501",
            status: "CROWDED",
            delayMinutes: 5,
            notes: "Very packed at KLCC.",
            created,
            stations: [{ id: "10", displayName: "KLCC" }],
            user: { shortId: "rk01", nickname: "RapidKL Watch" },
          },
          cursor: "cursor-501",
        },
        {
          node: {
            id: "502",
            status: "BUSY",
            delayMinutes: null,
            notes: "",
            created,
            stations: [],
            user: null,
          },
          cursor: "cursor-502",
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: "cursor-502" },
    },
  };
}

test.beforeEach(async ({ page }) => {
  await resetMock();
  await routeGraphQLToMock(page);
});

test.describe("community front page", () => {
  test("VISITOR: renders the feed and line pulse list read-only", async ({ page }) => {
    const created = new Date().toISOString();
    await configureMock({
      FrontPageLines: { lines: [KJL_LINE, MRL_LINE] },
      Feed: feedPage(feedNode({ created })),
    });

    await page.goto("/");

    // Logged out the submit box is exactly the login call-to-action — no form.
    await expect(page.getByTestId("login-to-submit")).toHaveText("Log in to submit links");
    await expect(page.getByLabel("Link URL")).toHaveCount(0);

    // The feed row is now the shared link card: www-stripped domain + muted path, title, line
    // badge, score, and the footer's minute-granular relative time — the exact timestamp and
    // the submitter hide in its tooltip.
    const card = page
      .locator("app-link-card")
      .filter({ hasText: "Kelana Jaya Line disruption thread" });
    await expect(card.getByTestId("link-url-domain")).toHaveText("facebook.com");
    await expect(card.getByTestId("link-url-path")).toHaveText("/mlptf/posts/123");
    await expect(card.getByText("www.facebook.com")).toHaveCount(0);
    await expect(card.getByTestId("link-tags")).toContainText("KJL");
    await expect(card.getByTestId("link-meta-rail")).toBeVisible();
    // The stub node is completed, so the approval pill stays off a live feed row.
    await expect(card.getByTestId("link-pending")).toHaveCount(0);
    await expect(card.getByText("+3")).toBeVisible();
    await expect(card.getByTestId("link-created")).toHaveText("less than a minute ago");

    const feedTime = card.getByTestId("link-time");
    const feedTooltip = feedTime.locator('[role="tooltip"]');
    await expect(feedTooltip).toHaveCSS("opacity", "0");
    await feedTime.hover();
    await expect(feedTooltip).toHaveCSS("opacity", "1");
    await expect(feedTooltip).toContainText(exactTimestamp(created));
    await expect(feedTooltip.getByTestId("link-submitter")).toHaveText("RapidKL Watch");

    // Keyboard users get the same tooltip on focus, and it closes once focus/mouse leaves.
    await page.mouse.move(0, 0);
    await expect(feedTooltip).toHaveCSS("opacity", "0");
    await feedTime.focus();
    await expect(feedTooltip).toHaveCSS("opacity", "1");
    await feedTime.blur();
    await expect(feedTooltip).toHaveCSS("opacity", "0");

    // Logged out, the vote controls render but are disabled.
    await expect(card.getByRole("button", { name: "Upvote" })).toBeDisabled();
    await expect(card.getByRole("button", { name: "Downvote" })).toBeDisabled();

    // Under the scroller, the feed footer counts the visible rows against the filtered total
    // and keeps Load More inside it while another page exists. The read is service-day scoped.
    const feedFooter = page.getByTestId("feed-footer");
    await expect(feedFooter.getByTestId("feed-count")).toHaveText(
      `Showing 1 of ${FEED_TOTAL_COUNT}`,
    );
    await expect(feedFooter.getByTestId("feed-load-more")).toBeVisible();
    const feedCall = (await recordedCalls()).find((call) => call.operationName === "Feed");
    expect(feedCall?.variables).toEqual({ first: 8, status: "LIVE", currentServiceDayOnly: true });

    // Each line card: vehicle counts, status badge and passenger status (or "No data").
    const kjl = page.locator("app-line-pulse-card").filter({ hasText: "Kelana Jaya Line" });
    await expect(kjl.getByTestId("line-vehicle-count")).toHaveText("12 of 20 vehicles in service");
    await expect(kjl.getByTestId("passenger-status")).toHaveText("Normal");
    await expect(kjl.getByText("Active", { exact: true })).toBeVisible();
    await expect(kjl.getByTestId("passenger-status-count")).toHaveCount(0);

    // The consolidated message moved off the card body into the passenger chip's popover.
    await expect(kjl.getByTestId("status-info-message")).toHaveCount(0);
    const kjlPassengerChip = kjl
      .locator("app-status-info-chip")
      .filter({ has: page.getByTestId("passenger-status") });
    await kjlPassengerChip.hover();
    const kjlPopover = kjlPassengerChip.getByTestId("status-info-popover");
    await expect(kjlPopover).toBeVisible();
    await expect(kjlPopover.getByTestId("status-window")).toHaveText("Last 30 minutes");
    await expect(kjlPopover.getByTestId("status-info-message")).toHaveText(
      "Trains are running normally.",
    );
    // The per-status counts are folded into the 7-level severity legend: the active level is
    // flagged and each reported level carries its own count. The old pill cluster is gone.
    const kjlLegend = kjlPopover.getByTestId("status-scale-entry");
    await expect(kjlLegend).toHaveCount(7);
    await expect(page.getByTestId("status-count-pill")).toHaveCount(0);
    const kjlNormalRow = kjlLegend.filter({ hasText: "Normal" });
    await expect(kjlNormalRow).toHaveAttribute("data-active", "true");
    await expect(kjlNormalRow.getByTestId("status-scale-count")).toHaveText("(3)");
    await expect(
      kjlLegend.filter({ hasText: "Busy" }).getByTestId("status-scale-count"),
    ).toHaveText("(2)");
    await expect(kjlLegend.getByTestId("status-scale-count")).toHaveCount(2);
    await page.mouse.move(0, 0);
    await expect(kjlPopover).toHaveCount(0);

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

    // "No data" means no legend counts and no consolidated message to show.
    const mrlPassengerChip = mrl
      .locator("app-status-info-chip")
      .filter({ has: page.getByTestId("passenger-status") });
    await mrlPassengerChip.hover();
    await expect(mrlPassengerChip.getByTestId("status-info-popover")).toBeVisible();
    await expect(mrlPassengerChip.getByTestId("status-scale-count")).toHaveCount(0);
    await expect(page.getByTestId("status-count-pill")).toHaveCount(0);
    await expect(mrlPassengerChip.getByTestId("status-info-message")).toHaveCount(0);
    await page.mouse.move(0, 0);
    await expect(mrlPassengerChip.getByTestId("status-info-popover")).toHaveCount(0);

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
      .locator("app-link-card")
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
      .locator("app-link-card")
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

  test("VISITOR: expanding a line card lazily loads the hourly chart and reports", async ({
    page,
  }) => {
    const reportsCreated = new Date().toISOString();
    await configureMock({
      FrontPageLines: { lines: [KJL_LINE] },
      Feed: feedPage(),
      LineStatusHistory: { lineStatusHistory: HISTORY_BUCKETS },
      LineStatusReports: reportsPage(reportsCreated),
    });

    await page.goto("/");

    const kjl = page.locator("app-line-pulse-card").filter({ hasText: "Kelana Jaya Line" });
    const toggle = kjl.getByTestId("line-card-toggle");

    // Folded, the detail panel is absent and neither lazy read has been issued at all.
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(kjl.getByTestId("line-card-expanded")).toHaveCount(0);
    expect((await recordedCalls()).map((call) => call.operationName)).not.toContain(
      "LineStatusHistory",
    );
    expect((await recordedCalls()).map((call) => call.operationName)).not.toContain(
      "LineStatusReports",
    );

    await toggle.click();

    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(kjl.getByTestId("line-card-expanded")).toBeVisible();

    // The hourly chart: one bar per stub bucket, scaled to the busiest hour.
    const chart = kjl.getByTestId("line-status-chart");
    await expect(chart).toBeVisible();
    await expect(chart.getByTestId("line-status-bar")).toHaveCount(HISTORY_BUCKETS.length);
    await expect(chart.getByTestId("line-status-chart-readout")).toContainText("Hover a bar");

    // The reports list: the stubbed page renders a badge, a delay, the station and notes per
    // row, with the relative time pinned right and the exact timestamp on its `title`.
    const reports = kjl.getByTestId("line-status-reports");
    await expect(reports).toBeVisible();
    await expect(reports.getByTestId("line-status-report")).toHaveCount(2);
    await expect(reports.getByTestId("line-status-report").first()).toContainText("Crowded");
    await expect(reports.getByTestId("report-delay").first()).toHaveText("5 min delay");
    await expect(reports.getByTestId("report-station")).toHaveCount(1);
    await expect(reports.getByTestId("report-station").first()).toHaveText("KLCC");
    await expect(reports.getByTestId("report-notes").first()).toHaveText("Very packed at KLCC.");
    await expect(reports.getByTestId("report-time").first()).toHaveText("less than a minute ago");
    await expect(reports.getByTestId("report-time").first()).toHaveAttribute(
      "title",
      `Reported ${exactTimestamp(reportsCreated)}`,
    );

    // Both reads fire only now, over the exact documents the expanded card owns.
    await expect
      .poll(async () => (await recordedCalls()).map((call) => call.operationName))
      .toContain("LineStatusHistory");
    await expect
      .poll(async () => (await recordedCalls()).map((call) => call.operationName))
      .toContain("LineStatusReports");

    const historyCall = (await recordedCalls()).find(
      (call) => call.operationName === "LineStatusHistory",
    );
    expect(historyCall?.variables).toEqual({ lineId: "1", dayStartHour: 3 });
    const reportsCall = (await recordedCalls()).find(
      (call) => call.operationName === "LineStatusReports",
    );
    expect(reportsCall?.variables).toEqual({ lineId: "1", first: 10 });

    // Collapsing hides the panel again.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(kjl.getByTestId("line-card-expanded")).toHaveCount(0);
  });
});
