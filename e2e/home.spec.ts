import { loginAs } from "./helpers/auth";
import { expectNoNewAxeViolations } from "./helpers/axe";
import {
  configureMock,
  expect,
  graphqlError,
  recordedCalls,
  resetMock,
  routeGraphQLToMock,
  test,
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
 * "less than a minute ago" (`humanizeSince` is minute-granular). `status` is the approval axis
 * and is `LIVE` (the feed's own filter) so the shared card's Pending pill stays off a feed row
 * even though the separate admin `completed` flag is false; the vote fields feed the vote control.
 */
function feedNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "42",
    url: "https://www.facebook.com/mlptf/posts/123",
    normalizedUrl: "https://facebook.com/mlptf/posts/123",
    title: "Kelana Jaya Line disruption thread",
    created: new Date().toISOString(),
    status: "LIVE",
    completed: false,
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
    statusCounts: [],
  },
  {
    hourStart: "2026-09-21T20:00:00Z",
    hourEnd: "2026-09-21T21:00:00Z",
    count: 4,
    dominantStatus: "CROWDED",
    statusCounts: [
      { status: "BUSY", count: 1 },
      { status: "CROWDED", count: 3 },
    ],
  },
  {
    hourStart: "2026-09-21T21:00:00Z",
    hourEnd: "2026-09-21T22:00:00Z",
    count: 2,
    dominantStatus: "BUSY",
    statusCounts: [{ status: "BUSY", count: 2 }],
  },
];

/**
 * The typical week the backend sends for KJL: all 168 slots, Monday first and the service day's
 * hours from 03. One Thursday-afternoon slot clears the 3-report minimum and a thin Thursday-morning
 * one does not; every other slot is empty.
 */
function weekProfileSlots(): Array<Record<string, unknown>> {
  const filled: Record<string, Record<string, unknown>> = {
    "3:15": {
      count: 9,
      dominantStatus: "CROWDED",
      statusCounts: [
        { status: "NORMAL", count: 1 },
        { status: "CROWDED", count: 6 },
        { status: "DELAYED", count: 2 },
      ],
    },
    "3:8": { count: 2, dominantStatus: "BUSY", statusCounts: [{ status: "BUSY", count: 2 }] },
  };
  const slots: Array<Record<string, unknown>> = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let index = 0; index < 24; index++) {
      const hour = (3 + index) % 24;
      slots.push({
        weekday,
        hour,
        count: 0,
        dominantStatus: null,
        statusCounts: [],
        ...filled[`${weekday}:${hour}`],
      });
    }
  }
  return slots;
}

/** The same week with every slot under the 3-report minimum: reports exist, none is enough. */
function sparseWeekProfileSlots(): Array<Record<string, unknown>> {
  return weekProfileSlots().map((slot) =>
    Number(slot["count"]) >= 3
      ? { ...slot, count: 2, statusCounts: [{ status: "CROWDED", count: 2 }] }
      : slot,
  );
}

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

/** Reads the page makes in the background (history charts, incident notices, the sheet's stations):
 * empty unless a test stubs them itself, so the mock never answers them with a missing-stub error. */
const BACKGROUND_READS = {
  HomeRecentIncidents: { calendarIncidents: [] },
  NetworkStatusHistory: { networkStatusHistory: [] },
  LinesStatusHistory: { linesStatusHistory: [] },
  StationLinesByLine: { stationLines: [] },
};

const configureHome = (stubs: Record<string, unknown>): Promise<void> =>
  configureMock({ ...BACKGROUND_READS, ...stubs });

test.beforeEach(async ({ page }) => {
  await resetMock();
  await routeGraphQLToMock(page);
});

test.describe("community front page", () => {
  test("VISITOR: renders the feed and line pulse list read-only", async ({ page }) => {
    const created = new Date().toISOString();
    await configureHome({
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
      .getByTestId("feed-scroll")
      .locator("app-link-card")
      .filter({ hasText: "Kelana Jaya Line disruption thread" });
    await expect(card.getByTestId("link-url-domain")).toHaveText("facebook.com");
    await expect(card.getByTestId("link-url-path")).toHaveText("/mlptf/posts/123");
    // The visible domain is www-stripped (the raw URL survives only in the anchor's accessible name).
    await expect(card.getByTestId("link-url-domain")).not.toContainText("www.");
    await expect(card.getByTestId("link-tags")).toContainText("KJL");
    await expect(card.getByTestId("link-meta-rail")).toBeVisible();
    // The stub node is approved (status LIVE, completed false), so the Pending pill — driven by
    // the approval axis — stays off a live feed row.
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

    // The feed footer counts the rendered rows against the filtered total and keeps Load More
    // beside it while another page exists. The read is service-day scoped.
    const feedFooter = page.getByTestId("feed-footer");
    await expect(feedFooter.getByTestId("feed-count")).toHaveText(
      `Showing 1 of ${FEED_TOTAL_COUNT}`,
    );
    await expect(feedFooter.getByTestId("feed-load-more")).toBeVisible();
    const feedCall = (await recordedCalls()).find((call) => call.operationName === "Feed");
    expect(feedCall?.variables).toEqual({
      first: 8,
      status: "LIVE",
      currentServiceDayOnly: true,
      collapseThreads: true,
    });

    // The ACTIVE line renders as the compact row: vehicle ratio, passenger badge and the
    // confidence chip, with no "Active" status pill (it is the unremarkable default).
    const kjl = page.locator("app-line-pulse-row").filter({ hasText: "Kelana Jaya Line" });
    await expect(kjl.getByTestId("line-row-vehicles")).toHaveText("12/20 in service");
    await expect(kjl.getByTestId("line-row-passenger")).toHaveText("Normal");
    await expect(kjl.getByTestId("line-row-confidence")).toBeVisible();
    await expect(kjl.getByText("Active", { exact: true })).toHaveCount(0);
    await expect(kjl.getByTestId("line-row-status")).toHaveCount(0);

    // The consolidated message no longer renders anywhere — not on the chip, not in the popover.
    await expect(kjl.getByTestId("status-info-message")).toHaveCount(0);
    const kjlConfidenceChip = kjl
      .locator("app-status-info-chip")
      .filter({ has: page.getByTestId("line-row-confidence") });
    await kjlConfidenceChip.hover();
    const kjlPopover = kjlConfidenceChip.getByTestId("status-info-popover");
    await expect(kjlPopover).toBeVisible();
    await expect(kjlPopover.getByTestId("status-info-message")).toHaveCount(0);
    // The per-status severity legend rides only on a card's Active passenger chip now, so the
    // compact row's confidence popover carries none of it (nor the old pill cluster anywhere).
    await expect(kjlPopover.getByTestId("status-scale-entry")).toHaveCount(0);
    await expect(page.getByTestId("status-count-pill")).toHaveCount(0);
    await page.mouse.move(0, 0);
    await expect(kjlPopover).toHaveCount(0);

    // A non-ACTIVE line is a "Needs attention" CARD, visible with no disclosure to open.
    const attention = page.getByTestId("line-board-attention");
    await expect(attention).toBeVisible();
    await expect(attention.getByTestId("line-board-attention-heading")).toContainText(
      "Needs attention",
    );
    const mrl = attention.locator("app-line-pulse-card").filter({ hasText: "Monorail Line" });
    await expect(mrl).toBeVisible();
    await expect(mrl.getByTestId("line-vehicle-count")).toHaveText("4/12 in service");
    await expect(mrl.getByText("Partial Disruption", { exact: true })).toBeVisible();
    // A non-ACTIVE card draws no passenger chip, so there is no "No data" reading to show.
    await expect(mrl.getByTestId("passenger-status")).toHaveCount(0);

    // Its status badge chip opens the shared popover with no legend counts or consolidated message.
    const mrlStatusChip = mrl
      .locator("app-status-info-chip")
      .filter({ hasText: "Partial Disruption" });
    await mrlStatusChip.hover();
    await expect(mrlStatusChip.getByTestId("status-info-popover")).toBeVisible();
    await expect(mrlStatusChip.getByTestId("status-scale-count")).toHaveCount(0);
    await expect(page.getByTestId("status-count-pill")).toHaveCount(0);
    await expect(mrlStatusChip.getByTestId("status-info-message")).toHaveCount(0);
    await page.mouse.move(0, 0);
    await expect(mrlStatusChip.getByTestId("status-info-popover")).toHaveCount(0);

    // The line row's Report control opens the status sheet (login-gated here).
    await kjl.getByTestId("line-row-report").click();
    await expect(
      page.getByRole("heading", { level: 2, name: /KJL · Kelana Jaya Line/ }),
    ).toBeVisible();
    await expect(page.getByText(/You'll need to log in before submitting/)).toBeVisible();
    await expect(page.getByTestId("login-button")).toBeVisible();
    // Draft-first: the form and its submit control stay reachable while logged out.
    await expect(page.getByTestId("submit-line-status-report")).toBeVisible();
  });

  test("VISITOR: approved incidents show as Notice chips on the lines they are tagged with", async ({
    page,
  }) => {
    const incident = (id: string, lineId: string, code: string, overrides = {}) => ({
      id,
      startDatetime: "2026-10-20T08:30:00",
      endDatetime: null,
      severity: "MAJOR",
      title: `Incident ${id}`,
      brief: "",
      lines: [{ id: lineId, code }],
      ...overrides,
    });
    await configureHome({
      FrontPageLines: { lines: [KJL_LINE, MRL_LINE] },
      Feed: feedPage(),
      // The mock answers by operation name, so both incident reads get this one list.
      HomeRecentIncidents: {
        calendarIncidents: [
          incident("101", "1", "KJL", { title: "Signal fault at KL Sentral" }),
          incident("102", "1", "KJL", { severity: "MINOR", startDatetime: "2026-10-19T22:10:00" }),
          incident("103", "1", "KJL", { severity: "OTHERS" }),
          incident("104", "2", "MRL", { title: "Train fault" }),
        ],
      },
    });

    await page.goto("/");

    // A Normal line still gets its notice: two chips at most, the rest behind "+N".
    const kjl = page.locator("app-line-pulse-row").filter({ hasText: "Kelana Jaya Line" });
    await expect(kjl.getByTestId("line-notice")).toHaveCount(2);
    // 🔴 Label in name (WCAG 2.5.3): the link is named by the words it shows, severity included, so a
    // voice-control user can say "click Major". It carries no aria-label override.
    const first = kjl.getByRole("link", {
      name: "Notice Major Signal fault at KL Sentral",
      exact: true,
    });
    await expect(first).toHaveCount(1);
    await expect(first).not.toHaveAttribute("aria-label", /.*/);
    await expect(first).toHaveAttribute("href", "/insiden/2026-10-20");
    await expect(first.getByTestId("line-notice-severity")).toHaveText("Major");
    // The strip is named by its line.
    await expect(kjl.getByRole("list", { name: "Incidents on Kelana Jaya Line" })).toBeVisible();
    // The "+N" link's name starts with the "+1" it shows.
    const more = kjl.getByRole("link", { name: "+1 more on the incident calendar", exact: true });
    await expect(more).toHaveText("+1");
    await expect(more).toHaveAttribute("href", "/insiden");

    // A line that needs attention is a card, and the card draws its Notice too.
    const mrl = page
      .getByTestId("line-board-attention")
      .locator("app-line-pulse-card")
      .filter({ hasText: "Monorail Line" });
    await expect(mrl.getByTestId("line-notice")).toHaveCount(1);
    await expect(
      mrl.getByRole("link", { name: "Notice Major Train fault", exact: true }),
    ).toHaveCount(1);

    // Every incident read the board has sent carries the literal LIVE + activeNow variables (no clock,
    // so a server render and a hydrated page send the same object), and none is a planned-works read
    // (no line is pinned): any other read would fail the comparison. The ongoing read repeats on the
    // page's 30s beat, so this asserts on each read that went out, not on how many.
    const incidentCalls = (await recordedCalls()).filter(
      (call) => call.operationName === "HomeRecentIncidents",
    );
    expect(incidentCalls.length).toBeGreaterThan(0);
    for (const call of incidentCalls) {
      expect(call.variables).toEqual({
        filters: { status: "LIVE", activeNow: true },
        order: { startDatetime: "DESC" },
      });
    }

    // Pinning a line puts it in My lines, and only then does the planned-works read go out.
    await kjl.getByTestId("line-row-pin").click();
    await expect(page.getByTestId("line-board-mine")).toBeVisible();
    await expect
      .poll(async () =>
        (await recordedCalls())
          .filter((call) => call.operationName === "HomeRecentIncidents")
          .map((call) => call.variables),
      )
      .toContainEqual({
        filters: { status: "LIVE", upcomingWithinDays: 7 },
        order: { startDatetime: "ASC" },
      });
  });

  test("VISITOR: a Notice goes away on Refresh once its incident has ended", async ({ page }) => {
    // The chips ride the page's beat. Without it a tab left open would keep saying an incident is
    // running after it ended; the countdown button is the manual beat (the timer is 30 seconds).
    const stubs = (calendarIncidents: unknown[]) => ({
      FrontPageLines: { lines: [KJL_LINE, MRL_LINE] },
      Feed: feedPage(),
      HomeRecentIncidents: { calendarIncidents },
    });
    const running = {
      id: "201",
      startDatetime: "2026-10-20T08:30:00",
      endDatetime: null,
      severity: "MINOR",
      title: "Track inspection",
      brief: "",
      lines: [{ id: "1", code: "KJL" }],
    };
    await configureHome(stubs([running]));

    await page.goto("/");
    const kjl = page.locator("app-line-pulse-row").filter({ hasText: "Kelana Jaya Line" });
    await expect(kjl.getByTestId("line-notice")).toHaveCount(1);
    const ongoingReads = async () =>
      (await recordedCalls()).filter(
        (call) =>
          call.operationName === "HomeRecentIncidents" &&
          "activeNow" in (call.variables["filters"] as object),
      ).length;
    const readsBefore = await ongoingReads();
    expect(readsBefore).toBeGreaterThan(0);

    // The incident ends: the next answer no longer lists it.
    await configureHome(stubs([]));
    await page.getByTestId("line-refresh-countdown").click();

    await expect(kjl.getByTestId("line-notice")).toHaveCount(0);
    expect(await ongoingReads()).toBeGreaterThan(readsBefore);
  });

  test("VISITOR: pinning a line that needs attention keeps it a card and asks for its planned works", async ({
    page,
  }) => {
    await configureHome({
      FrontPageLines: { lines: [KJL_LINE, MRL_LINE] },
      Feed: feedPage(),
      HomeRecentIncidents: { calendarIncidents: [] },
    });
    const plannedReads = async () =>
      (await recordedCalls())
        .filter((call) => call.operationName === "HomeRecentIncidents")
        .map((call) => call.variables)
        .filter((variables) => "upcomingWithinDays" in (variables["filters"] as object));

    await page.goto("/");
    const mrl = page
      .getByTestId("line-board-attention")
      .locator("app-line-pulse-card")
      .filter({ hasText: "Monorail Line" });
    await expect(mrl).toBeVisible();
    // Nothing is pinned yet, so only the ongoing read has gone out.
    expect(await plannedReads()).toEqual([]);

    // Attention wins over a pin: the line stays a card (My lines stays empty), and the card carries
    // what a pinned row would, so the planned-works read goes out for it.
    await mrl.getByTestId("line-card-pin").click();
    await expect(mrl.getByTestId("line-card-pin")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("line-board-mine")).toHaveCount(0);
    await expect.poll(plannedReads).toContainEqual({
      filters: { status: "LIVE", upcomingWithinDays: 7 },
      order: { startDatetime: "ASC" },
    });
  });

  test("USER: a duplicate submission surfaces the already-submitted indicator", async ({
    page,
  }) => {
    await loginAs(page);
    await configureHome({
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

    // Logged in, the submit box is the quick URL form (the optional line-status select is gone).
    await expect(page.getByLabel("Link URL")).toBeVisible();

    await page.getByLabel("Link URL").fill("https://www.facebook.com/mlptf/posts/123");
    await page.getByRole("button", { name: "Submit Link", exact: true }).click();

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
      input: { url: "https://www.facebook.com/mlptf/posts/123" },
    });

    // The duplicate's backend upvote is mirrored into the matching feed row.
    const card = page
      .getByTestId("feed-scroll")
      .locator("app-link-card")
      .filter({ hasText: "Kelana Jaya Line disruption thread" });
    await expect(card.getByRole("button", { name: "Upvote" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("USER: submits a line status report from a line row's sheet", async ({ page }) => {
    await loginAs(page);
    await configureHome({
      FrontPageLines: { lines: [KJL_LINE] },
      Feed: feedPage(),
      StationLinesByLine: { stationLines: [] },
      SubmitLineStatusReport: { submitLineStatusReport: { ok: true, id: 777 } },
    });

    await page.goto("/");

    const kjl = page.locator("app-line-pulse-row").filter({ hasText: "Kelana Jaya Line" });
    await kjl.getByTestId("line-row-report").click();
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
    await configureHome({
      FrontPageLines: { lines: [KJL_LINE] },
      Feed: feedPage(),
      UpvoteSocialMediaLink: { upvoteSocialMediaLink: { ok: true } },
    });

    await page.goto("/");

    const card = page
      .getByTestId("feed-scroll")
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

  test("VISITOR: the front page has no automatically detectable accessibility violations", async ({
    page,
  }) => {
    await configureHome({
      FrontPageLines: { lines: [KJL_LINE, MRL_LINE] },
      Feed: feedPage(),
    });

    await page.goto("/");
    await expect(page.locator("app-line-pulse-row").first()).toBeVisible();

    // Known app defects, reported rather than fixed here: the info-popover and refresh buttons
    // whose visible text is not part of their accessible name, and the nav wordmark outside any
    // landmark.
    await expectNoNewAxeViolations(page, "/", ["label-content-name-mismatch", "region"]);
  });

  test("USER: a rejected upvote rolls the optimistic count back and says so", async ({ page }) => {
    await loginAs(page);
    await configureHome({
      FrontPageLines: { lines: [KJL_LINE] },
      Feed: feedPage(),
      UpvoteSocialMediaLink: graphqlError("Vote rejected"),
    });
    // Hold the answer so the optimistic state can be seen before the server's refusal lands.
    let refuse!: () => void;
    const held = new Promise<void>((resolve) => (refuse = resolve));
    await page.route("**/graphql/", async (route) => {
      if ((route.request().postData() ?? "").includes("UpvoteSocialMediaLink")) {
        await held;
      }
      await route.fallback();
    });

    await page.goto("/");

    const card = page
      .getByTestId("feed-scroll")
      .locator("app-link-card")
      .filter({ hasText: "Kelana Jaya Line disruption thread" });
    await expect(card.getByText("+3")).toBeVisible();
    await card.getByRole("button", { name: "Upvote" }).click();
    await expect(card.getByText("+4")).toBeVisible();
    await expect(card.getByRole("button", { name: "Upvote" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    refuse();
    await expect(page.getByText("Vote not recorded")).toBeVisible();
    await expect(card.getByText("+3")).toBeVisible();
    await expect(card.getByRole("button", { name: "Upvote" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("USER: a status report the server refuses stays in the open sheet with its error", async ({
    page,
  }) => {
    await loginAs(page);
    await configureHome({
      FrontPageLines: { lines: [KJL_LINE] },
      Feed: feedPage(),
      SubmitLineStatusReport: { submitLineStatusReport: { ok: false, id: null } },
    });

    await page.goto("/");

    const kjl = page.locator("app-line-pulse-row").filter({ hasText: "Kelana Jaya Line" });
    await kjl.getByTestId("line-row-report").click();
    await page.getByTestId("status-option-CROWDED").click();
    await page.getByTestId("submit-line-status-report").click();

    await expect(page.getByTestId("line-status-submit-error")).toHaveText(
      "Couldn't submit your report. Please try again.",
    );
    await expect(page.getByText("Line status reported")).toHaveCount(0);
    // Nothing was lost: the sheet is still open on the chosen status.
    await expect(page.getByTestId("status-option-CROWDED")).toBeVisible();
    await expect(page.getByTestId("submit-line-status-report")).toBeEnabled();
  });

  test("USER: a report filed offline is queued, then sent with the token when the network returns", async ({
    context,
    page,
  }) => {
    const token = await loginAs(page);
    await configureHome({
      FrontPageLines: { lines: [KJL_LINE] },
      Feed: feedPage(),
      SubmitLineStatusReport: { submitLineStatusReport: { ok: true, id: 778 } },
    });

    await page.goto("/");

    const kjl = page.locator("app-line-pulse-row").filter({ hasText: "Kelana Jaya Line" });
    await kjl.getByTestId("line-row-report").click();
    await page.getByTestId("status-option-CROWDED").click();

    await context.setOffline(true);
    await expect(page.getByTestId("line-status-outbox-note")).toBeVisible();
    await page.getByTestId("submit-line-status-report").click();

    await expect(page.getByText("It will send when you're back online.")).toBeVisible();
    expect((await recordedCalls()).map((c) => c.operationName)).not.toContain(
      "SubmitLineStatusReport",
    );

    await context.setOffline(false);
    await expect
      .poll(async () => (await recordedCalls()).map((c) => c.operationName))
      .toContain("SubmitLineStatusReport");
    const sent = (await recordedCalls()).find((c) => c.operationName === "SubmitLineStatusReport");
    expect(sent?.authKey).toBe(token);
    expect(sent?.variables).toEqual({
      input: { lineId: "1", status: "CROWDED", stationIds: [], delayMinutes: null, notes: null },
    });
  });

  test("VISITOR: expanding a line row lazily loads the hourly chart, the typical week and reports", async ({
    page,
  }) => {
    const reportsCreated = new Date().toISOString();
    await configureHome({
      FrontPageLines: { lines: [KJL_LINE] },
      Feed: feedPage(),
      LineStatusHistory: { lineStatusHistory: HISTORY_BUCKETS },
      LineStatusWeekProfile: { lineStatusWeekProfile: weekProfileSlots() },
      LineStatusReports: reportsPage(reportsCreated),
    });

    await page.goto("/");

    const kjl = page.locator("app-line-pulse-row").filter({ hasText: "Kelana Jaya Line" });
    const toggle = kjl.getByTestId("line-row-toggle");

    // Folded, the detail panel is absent and no lazy read has been issued at all.
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(kjl.getByTestId("line-row-expanded")).toHaveCount(0);
    expect((await recordedCalls()).map((call) => call.operationName)).not.toContain(
      "LineStatusHistory",
    );
    expect((await recordedCalls()).map((call) => call.operationName)).not.toContain(
      "LineStatusReports",
    );
    expect((await recordedCalls()).map((call) => call.operationName)).not.toContain(
      "LineStatusWeekProfile",
    );

    await toggle.click();

    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(kjl.getByTestId("line-row-expanded")).toBeVisible();

    // The hourly chart: one bar per stub bucket, scaled to the busiest hour and stacked by
    // report type — the 4-report hour splits into two segments, and the breakdown is carried by
    // the bar's own title and by the hover readout.
    const chart = kjl.getByTestId("line-status-chart");
    await expect(chart).toBeVisible();
    await expect(chart.getByTestId("line-status-bar")).toHaveCount(HISTORY_BUCKETS.length);
    await expect(chart.getByTestId("line-status-chart-readout")).toContainText("Hover a bar");

    const stackedBar = chart.getByTestId("line-status-bar").nth(1);
    await expect(stackedBar).toHaveAttribute(
      "title",
      "04:00–05:00 · 4 reports · Busy 1, Crowded 3",
    );
    await expect(stackedBar.locator(":scope > div")).toHaveCount(2);
    await stackedBar.hover();
    await expect(chart.getByTestId("line-status-chart-readout")).toContainText("Busy 1");
    await expect(chart.getByTestId("line-status-chart-readout")).toContainText("Crowded 3");
    await page.mouse.move(0, 0);

    // The typical week sits under today's chart: seven weekday rows of 24 hour cells. The slot with
    // enough reports is coloured and named, the thin one is left muted, and hovering shows its reports.
    const week = kjl.getByTestId("line-week-profile");
    await expect(week).toBeVisible();
    await expect(week.getByTestId("line-week-row")).toHaveCount(7);
    await expect(week.getByTestId("line-week-cell")).toHaveCount(168);
    const busyCell = week.locator('[data-weekday="3"] [data-hour="15"]');
    await expect(busyCell).toHaveAttribute(
      "aria-label",
      "Thursday 15:00–16:00 · 9 reports · Normal 1, Crowded 6, Delayed 2",
    );
    await expect(busyCell).not.toHaveAttribute("data-muted", "");
    // An hour after midnight belongs to the weekday before it, and its sentence says "night".
    await expect(week.locator('[data-weekday="0"] [data-hour="1"]')).toHaveAttribute(
      "aria-label",
      "Monday night 01:00–02:00 · Not enough reports (0 of 3)",
    );
    await expect(week.locator('[data-weekday="3"] [data-hour="8"]')).toHaveAttribute(
      "data-muted",
      "",
    );
    await busyCell.hover();
    await expect(week.getByTestId("line-week-profile-readout")).toContainText(
      "Thursday 15:00–16:00 · 9 reports",
    );
    await page.mouse.move(0, 0);

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
    await expect
      .poll(async () => (await recordedCalls()).map((call) => call.operationName))
      .toContain("LineStatusWeekProfile");

    const historyCall = (await recordedCalls()).find(
      (call) => call.operationName === "LineStatusHistory",
    );
    expect(historyCall?.variables).toEqual({ lineId: "1", dayStartHour: 3 });
    const reportsCall = (await recordedCalls()).find(
      (call) => call.operationName === "LineStatusReports",
    );
    expect(reportsCall?.variables).toEqual({ lineId: "1", first: 10 });
    const weekCall = (await recordedCalls()).find(
      (call) => call.operationName === "LineStatusWeekProfile",
    );
    expect(weekCall?.variables).toEqual({ lineId: "1", weeks: 6, dayStartHour: 3 });

    // Collapsing hides the panel again.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(kjl.getByTestId("line-row-expanded")).toHaveCount(0);
  });

  test("VISITOR: the typical week's cells stay put while its readout changes", async ({ page }) => {
    // Narrow on purpose, so a mixed hour's readout wraps onto a second line. Drawn above the table it
    // pushed the cells down, and a still pointer then sat over the row above: aimed at the top edge of
    // Thursday 15:00, it read Wednesday.
    await page.setViewportSize({ width: 390, height: 844 });
    await configureHome({
      FrontPageLines: { lines: [KJL_LINE] },
      Feed: feedPage(),
      LineStatusHistory: { lineStatusHistory: HISTORY_BUCKETS },
      LineStatusWeekProfile: { lineStatusWeekProfile: weekProfileSlots() },
      LineStatusReports: reportsPage(new Date().toISOString()),
    });

    await page.goto("/");
    const kjl = page.locator("app-line-pulse-row").filter({ hasText: "Kelana Jaya Line" });
    await kjl.getByTestId("line-row-toggle").click();

    const week = kjl.getByTestId("line-week-profile");
    const table = week.getByTestId("line-week-profile-table");
    const busyCell = week.locator('[data-weekday="3"] [data-hour="15"]');
    await expect(table).toBeVisible();
    await busyCell.scrollIntoViewIfNeeded();
    const tableBefore = await table.boundingBox();
    const cell = await busyCell.boundingBox();
    if (!tableBefore || !cell) {
      throw new Error("the typical week's table has no layout box");
    }

    await page.mouse.move(cell.x + cell.width / 2, cell.y + 3);
    const readout = week.getByTestId("line-week-profile-readout");
    await expect(readout).toContainText("Thursday 15:00–16:00 · 9 reports");
    // The sentence is longer than one line here, which is what moved the table before.
    const readoutBox = await readout.boundingBox();
    expect(readoutBox?.height).toBeGreaterThan(36);
    expect((await table.boundingBox())?.y).toBe(tableBefore.y);

    // Leaving the table puts the hint back, and the table is still where it was.
    await page.mouse.move(0, 0);
    await expect(readout).toContainText("Hover or tap an hour");
    expect((await table.boundingBox())?.y).toBe(tableBefore.y);
  });

  // The typical week keeps one height whatever the answer is. A line with no reports (or too
  // few) gets a one-line sentence, and when only the skeleton held the height that sentence dragged
  // the reports list up by about 200px under the finger of a rider who had just expanded the row.
  // The request is held until the skeleton has been measured, so both states are seen in one load.
  const WEEK_ANSWERS = [
    {
      name: "no reports",
      viewport: { width: 390, height: 844 },
      slots: [],
      answer: "line-week-profile-empty",
      maxGrowth: 0,
    },
    {
      name: "too few reports",
      viewport: { width: 390, height: 844 },
      slots: sparseWeekProfileSlots(),
      answer: "line-week-profile-sparse",
      maxGrowth: 0,
    },
    {
      name: "a failed read",
      viewport: { width: 390, height: 844 },
      slots: null,
      answer: null,
      maxGrowth: 0,
    },
    // The table is a little taller than the reserve where its legend wraps to three lines (390px), so
    // there it may grow by a few pixels, but never by the strip.
    {
      name: "a full week at 390px",
      viewport: { width: 390, height: 844 },
      slots: weekProfileSlots(),
      answer: "line-week-profile-table",
      maxGrowth: 16,
    },
    {
      name: "a full week at 1280px",
      viewport: { width: 1280, height: 900 },
      slots: weekProfileSlots(),
      answer: "line-week-profile-table",
      maxGrowth: 16,
    },
  ];

  for (const scenario of WEEK_ANSWERS) {
    test(`VISITOR: the typical week keeps its place in the panel from loading to ${scenario.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(scenario.viewport);
      await configureHome({
        FrontPageLines: { lines: [KJL_LINE] },
        Feed: feedPage(),
        LineStatusHistory: { lineStatusHistory: HISTORY_BUCKETS },
        LineStatusWeekProfile: { lineStatusWeekProfile: scenario.slots ?? [] },
        LineStatusReports: reportsPage(new Date().toISOString()),
      });

      let release: () => void = () => undefined;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      // Registered after the mock bridge, so it runs first: it holds the week's request, then hands
      // it on (or answers it with a GraphQL error) once the test lets it go.
      await page.route("**/graphql/", async (route) => {
        if (!route.request().postData()?.includes("LineStatusWeekProfile")) {
          await route.fallback();
          return;
        }
        await released;
        if (scenario.slots === null) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ errors: [{ message: "boom" }] }),
          });
          return;
        }
        await route.fallback();
      });

      await page.goto("/");
      const kjl = page.locator("app-line-pulse-row").filter({ hasText: "Kelana Jaya Line" });
      await kjl.getByTestId("line-row-toggle").click();

      const week = kjl.getByTestId("line-week-profile");
      const reports = kjl.getByTestId("line-status-reports");
      // The chart and the reports list have settled, so only the typical week can move them.
      await expect(kjl.getByTestId("line-status-bar")).toHaveCount(HISTORY_BUCKETS.length);
      await expect(reports.getByTestId("line-status-report")).toHaveCount(2);
      await expect(week.getByTestId("line-week-profile-skeleton")).toBeVisible();

      const loadingWeek = await week.boundingBox();
      const loadingReports = await reports.boundingBox();
      if (!loadingWeek || !loadingReports) {
        throw new Error("the typical week or the reports list has no layout box");
      }

      release();
      if (scenario.answer === null) {
        await expect(week.getByText("Couldn't load this line's typical week.")).toBeVisible();
      } else {
        await expect(week.getByTestId(scenario.answer)).toBeVisible();
      }
      await expect(week.getByTestId("line-week-profile-skeleton")).toHaveCount(0);

      const answeredWeek = await week.boundingBox();
      const answeredReports = await reports.boundingBox();
      if (!answeredWeek || !answeredReports) {
        throw new Error("the typical week or the reports list has no layout box");
      }
      const growth = answeredWeek.height - loadingWeek.height;
      expect(growth).toBeGreaterThanOrEqual(0);
      expect(growth).toBeLessThanOrEqual(scenario.maxGrowth);
      // What a rider feels: the reports list is where it was, give or take the growth above.
      expect(answeredReports.y - loadingReports.y).toBe(growth);
    });
  }

  test("VISITOR: clamps a right-edge popover into the viewport", async ({ page }) => {
    // The clamp only matters on a narrow-enough board: the two-column grid starts at lg (1024), so
    // below it the board is full-width and a row's right-aligned pin sits within 224px (the panel's
    // `min-w-56` floor) of the viewport's right edge. 1000px makes the clamp-relevance predicate
    // below hold for the rightmost trigger; the default 1280px would not.
    await page.setViewportSize({ width: 1000, height: 800 });
    await configureHome({
      FrontPageLines: { lines: [KJL_LINE, MRL_LINE] },
      Feed: feedPage(),
    });

    await page.goto("/");

    const board = page.getByTestId("network-board");
    await expect(board.getByTestId("line-row").first()).toBeVisible();

    // Pick the RIGHTMOST popover trigger the board renders: the one whose unclamped, left-anchored
    // (`left-0`) panel is the most likely to run past the viewport edge.
    const hosts = board.locator("app-info-popover");
    const count = await hosts.count();
    let rightmost = hosts.first();
    let rightmostX = -Infinity;
    for (let i = 0; i < count; i++) {
      const box = await hosts.nth(i).boundingBox();
      if (box && box.x > rightmostX) {
        rightmostX = box.x;
        rightmost = hosts.nth(i);
      }
    }

    await rightmost.hover();
    const panel = rightmost.locator('[role="tooltip"], [role="dialog"]');
    await expect(panel).toBeVisible();

    const viewport = page.viewportSize()!;
    const triggerBox = (await rightmost.boundingBox())!;

    // The clamp is genuinely being exercised: a `left-0` panel of the `min-w-56` floor (224px) from
    // this trigger would exceed the viewport's right edge minus the 8px margin — the exact condition
    // under which the pre-fix static panel overflowed (and was clipped by `overflow-x: clip`).
    expect(triggerBox.x + 224).toBeGreaterThan(viewport.width - 8);

    // The opened panel is contained: its left edge stays on screen and its right edge is inside the
    // viewport (1px slack for subpixel rounding). Polled because the correction is measured and
    // written after the panel's first paint.
    await expect.poll(async () => (await panel.boundingBox())?.x ?? NaN).toBeGreaterThanOrEqual(-1);
    await expect
      .poll(async () => {
        const box = await panel.boundingBox();
        return box ? box.x + box.width : NaN;
      })
      .toBeLessThanOrEqual(viewport.width + 1);
  });

  test("VISITOR: the hero tooltip carries the short summary, not the full definition", async ({
    page,
  }) => {
    await configureHome({
      FrontPageLines: { lines: [KJL_LINE, MRL_LINE] },
      Feed: feedPage(),
    });

    await page.goto("/");

    // The headline's `app-info-popover`: hover the h1 trigger it wraps and read the panel.
    await page.getByTestId("hero-headline").hover();
    const panel = page.getByTestId("hero-headline-popover");
    await expect(panel).toBeVisible();

    // It renders the registry `summary` ...
    await expect(panel).toContainText("runs normally when it is in service");
    // ... not the full `definition`, whose "N of M lines running normally" sentence lives only on
    // /methodology.
    await expect(panel).not.toContainText("N of M");
  });
});
