/**
 * Visual-QA evidence capture for the calendar-incident surfaces.
 * Run: node e2e/capture-visual-evidence.mjs   (servers must be up on 4300/4301)
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const OUT = ".omo/evidence/visual-qa";
mkdirSync(OUT, { recursive: true });

const MOCK = "http://localhost:4301";

const INCIDENTS = [
  {
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
    stations: [
      { id: "1", displayName: "KL Sentral" },
      { id: "2", displayName: "Pasar Seni" },
      { id: "3", displayName: "Masjid Jamek" },
    ],
    chronologies: [
      {
        order: 0,
        indicator: "RED",
        datetime: "2026-08-01T08:00:00Z",
        content: "Signal failure reported at KL Sentral interlocking.",
        sourceUrl: null,
      },
    ],
    voteScore: 3,
    voteBreakdown: { upvotes: 5, downvotes: 2 },
    userVote: 0,
    medias: [],
  },
  {
    id: "102",
    startDatetime: "2026-07-30T02:00:00Z",
    endDatetime: null,
    severity: "MINOR",
    title: "吉隆坡中央车站 月台 淹水 —— 乘客改用接驳巴士",
    brief: "月台积水，列车服务受阻。Monorail line also affected near Bukit Bintang.",
    details: "",
    hasDetails: false,
    impactFactor: 0,
    longTerm: true,
    inaccurate: false,
    lastUpdated: "2026-07-30T03:00:00Z",
    lines: [{ id: "2", code: "MRL", displayName: "Monorail Line" }],
    vehicles: [{ id: "9", identificationNo: "TS-1274" }],
    stations: [{ id: "4", displayName: "武吉免登 Bukit Bintang" }],
    chronologies: [],
    voteScore: -2,
    voteBreakdown: { upvotes: 3, downvotes: 5 },
    userVote: 0,
    medias: [],
  },
];

const PENDING = [
  {
    id: "900",
    startDatetime: "2026-08-20T08:00:00Z",
    endDatetime: null,
    severity: "MINOR",
    title: "Monorail door fault at 武吉免登",
    brief: "Doors failing to close at Bukit Bintang platform.",
    details: "",
    hasDetails: false,
    impactFactor: 0,
    longTerm: false,
    inaccurate: false,
    created: "2026-08-20T09:00:00Z",
    lastUpdated: "2026-08-20T09:00:00Z",
    lines: [{ id: "2", code: "MRL", displayName: "Monorail Line" }],
    vehicles: [],
    stations: [{ id: "4", displayName: "Bukit Bintang" }],
    chronologies: [],
    voteScore: 0,
    voteBreakdown: { upvotes: 0, downvotes: 0 },
    userVote: 0,
    medias: [],
  },
];

const LINKS = [
  {
    id: "77",
    url: "https://x.com/prasarana/status/1234567",
    title: "Service alert thread — KL Monorail disruption 吉隆坡单轨",
    created: "2026-08-21T10:00:00Z",
    completed: false,
    completedAt: null,
    user: { nickname: "RapidKL Watch", shortId: "rk01" },
    categories: [{ name: "Disruption" }],
  },
];

async function configure(stubs) {
  await fetch(`${MOCK}/__configure`, {
    method: "POST",
    body: JSON.stringify(stubs),
  });
}

const browser = await chromium.launch();

for (const viewport of [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 375, height: 812 },
]) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.addInitScript((admin) => {
    (globalThis).__e2eAuthOverride__ = {
      email: "e2e@example.com",
      admin,
    };
  }, true);

  await configure({
    CalendarIncidents: { calendarIncidents: INCIDENTS },
    PendingIncidents: { pendingCalendarIncidents: PENDING },
    ConsoleCategories: { calendarIncidentCategories: [] },
    ConsoleSocialMediaLinks: { socialMediaLinks: LINKS },
  });

  // 1. Insiden list page
  await page.goto("http://localhost:4300/insiden");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/insiden-${viewport.name}.png`, fullPage: true });

  // 2. Report sheet open
  await page.getByTestId("new-incident").click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/form-sheet-${viewport.name}.png` });

  // 3. Vote tooltip hover (desktop only — no hover on touch)
  if (viewport.name === "desktop") {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    const score = page.locator("app-vote-button .group\\/vote").first();
    await score.hover();
    await page.waitForTimeout(500);
    await page
      .locator("app-incident-card")
      .first()
      .screenshot({ path: `${OUT}/vote-tooltip-desktop.png` });
  }

  // 4/5. Console pages
  await configure({
    CalendarIncidents: { calendarIncidents: INCIDENTS },
    PendingIncidents: { pendingCalendarIncidents: PENDING },
    ConsoleCategories: { calendarIncidentCategories: [] },
    ConsoleSocialMediaLinks: { socialMediaLinks: LINKS },
  });
  await page.goto("http://localhost:4300/console/insiden/pending");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/console-pending-${viewport.name}.png`, fullPage: true });

  await page.goto("http://localhost:4300/console/insiden/links");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/console-links-${viewport.name}.png`, fullPage: true });

  await context.close();
}

await browser.close();
console.log("captures written to", OUT);
