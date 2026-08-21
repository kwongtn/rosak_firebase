import { expect, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";

/**
 * End-to-end journeys over the real Angular app (dev server, SSR included).
 * The app's BACKEND_GRAPHQL_URL points at the local mock GraphQL server
 * (e2e/mock-graphql.server.mjs); each test configures its stubs and reads
 * back the recorded calls over HTTP. Firebase Auth is seeded through
 * IndexedDB (helpers/auth.ts) so guarded console routes render.
 */

const MOCK = "http://localhost:4301";

const INCIDENT = {
  id: "101",
  startDatetime: "2026-08-01T08:00:00Z",
  endDatetime: null,
  severity: "MAJOR",
  title: "LRT line down at KL Sentral",
  brief: "Service suspended between KL Sentral and Pasar Seni.",
  details: "",
  hasDetails: false,
  impactFactor: 0,
  longTerm: false,
  inaccurate: false,
  lastUpdated: "2026-08-01T08:05:00Z",
  lines: [{ id: "1", code: "KJL", displayName: "Kelana Jaya Line" }],
  vehicles: [],
  stations: [],
  chronologies: [
    {
      order: 0,
      indicator: "RED",
      datetime: "2026-08-01T08:00:00Z",
      content: "Signal failure reported.",
      sourceUrl: null,
    },
  ],
  voteScore: 3,
  voteBreakdown: { upvotes: 5, downvotes: 2 },
  userVote: 0,
  medias: [],
};

interface RecordedCall {
  operationName: string;
  variables: Record<string, unknown>;
}

async function configureMock(stubs: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${MOCK}/__configure`, {
    method: "POST",
    body: JSON.stringify(stubs),
  });
  expect(res.ok).toBe(true);
}

async function recordedCalls(): Promise<RecordedCall[]> {
  const res = await fetch(`${MOCK}/__calls`);
  return (await res.json()) as RecordedCall[];
}

test.beforeEach(async () => {
  await fetch(`${MOCK}/__reset`, { method: "POST" });
});

test.describe("incident workflows", () => {
  test("USER: submit an incident from the report sheet", async ({ page }) => {
    await configureMock({
      CalendarIncidents: { calendarIncidents: [INCIDENT] },
      CreateCalendarIncident: { createCalendarIncident: { ok: true, id: 555 } },
      SubmitCalendarIncident: { submitCalendarIncident: { ok: true } },
    });

    await loginAs(page);
    await page.goto("/insiden");

    await expect(page.getByRole("heading", { name: "Insiden" })).toBeVisible();
    await expect(page.getByText(INCIDENT.title)).toBeVisible();

    await page.getByTestId("new-incident").click();
    await expect(page.getByRole("heading", { name: "Report an Incident" })).toBeVisible();

    await page.getByPlaceholder(/KL Sentral/).fill("Flooded platform at TBS");
    await page.getByPlaceholder(/One or two sentences/).fill("Water above ankle level.");
    await page.locator("select").first().selectOption("MAJOR");
    await page.locator('input[type="datetime-local"]').first().fill("2026-08-22T09:30");

    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(page.getByText("Incident submitted")).toBeVisible();
    await expect
      .poll(async () => (await recordedCalls()).map((c) => c.operationName))
      .toContain("CreateCalendarIncident");
    await expect
      .poll(async () => (await recordedCalls()).map((c) => c.operationName))
      .toContain("SubmitCalendarIncident");

    const calls = await recordedCalls();
    const submitCall = calls.find((c) => c.operationName === "SubmitCalendarIncident");
    expect(submitCall?.variables).toEqual({ calendarIncidentId: "555" });
  });

  test("USER: upvote an incident from its card", async ({ page }) => {
    await configureMock({
      CalendarIncidents: { calendarIncidents: [INCIDENT] },
      Upvote: { upvote: { ok: true } },
    });

    await loginAs(page);
    await page.goto("/insiden");

    const card = page.locator("app-incident-card").filter({ hasText: INCIDENT.title });
    await expect(card.getByLabel("Vote on this incident")).toBeVisible();
    await expect(card.getByText("+3")).toBeVisible();

    await card.getByLabel("Upvote").click();
    await expect(card.getByText("+4")).toBeVisible();
    await expect
      .poll(async () => (await recordedCalls()).map((c) => c.operationName))
      .toContain("Upvote");
  });

  test("ADMIN: approve a pending incident from the console queue", async ({ page }) => {
    await configureMock({
      PendingIncidents: {
        pendingCalendarIncidents: [
          {
            ...INCIDENT,
            id: "900",
            title: "Monorail door fault",
            created: "2026-08-20T02:00:00Z",
          },
        ],
      },
      ApproveIncident: { approveCalendarIncident: { ok: true } },
      ConsoleCategories: { calendarIncidentCategories: [] },
    });

    await loginAs(page, { admin: true });
    await page.goto("/console/insiden/pending");

    const row = page.locator("tr").filter({ hasText: "Monorail door fault" });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText('"Monorail door fault" is now live.')).toBeVisible();
    await expect
      .poll(async () => (await recordedCalls()).map((c) => c.operationName))
      .toContain("ApproveIncident");
  });

  test("ADMIN: mark a social media link completed from the triage page", async ({ page }) => {
    await configureMock({
      ConsoleSocialMediaLinks: {
        socialMediaLinks: [
          {
            id: "77",
            url: "https://x.com/prasarana/status/123",
            title: "Service alert",
            created: "2026-08-21T10:00:00Z",
            completed: false,
            completedAt: null,
            user: { nickname: "e2e", shortId: "e2e1" },
            categories: [],
          },
        ],
      },
      MarkLinkCompleted: { markSocialMediaLinkCompleted: { ok: true } },
    });

    await loginAs(page, { admin: true });
    await page.goto("/console/insiden/links");

    const row = page.locator("tr").filter({ hasText: "prasarana" });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "Mark completed" }).click();
    await expect(page.getByText("Link marked completed")).toBeVisible();
    await expect
      .poll(async () => (await recordedCalls()).map((c) => c.operationName))
      .toContain("MarkLinkCompleted");
  });
});
