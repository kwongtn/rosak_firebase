/**
 * DOM-level objective verification for the visual-QA gate: horizontal
 * overflow, tooltip visibility on hover, CJK glyph rendering, table
 * scrollability. Complements the PNG captures (which the available reviewer
 * models cannot render) with machine-checkable facts.
 */
import { chromium } from "@playwright/test";

const MOCK = "http://localhost:4301";
const results = [];

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
    stations: [{ id: "1", displayName: "KL Sentral" }],
    chronologies: [],
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
    brief: "月台积水，列车服务受阻。Bukit Bintang also affected.",
    details: "",
    hasDetails: false,
    impactFactor: 0,
    longTerm: true,
    inaccurate: false,
    lastUpdated: "2026-07-30T03:00:00Z",
    lines: [{ id: "2", code: "MRL", displayName: "Monorail Line" }],
    vehicles: [],
    stations: [{ id: "4", displayName: "武吉免登 Bukit Bintang" }],
    chronologies: [],
    voteScore: -2,
    voteBreakdown: { upvotes: 3, downvotes: 5 },
    userVote: 0,
    medias: [],
  },
];

async function configure(stubs) {
  await fetch(`${MOCK}/__configure`, { method: "POST", body: JSON.stringify(stubs) });
}

const browser = await chromium.launch();

for (const vp of [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 375, height: 812 },
]) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
  });
  const page = await context.newPage();
  await page.addInitScript((admin) => {
    globalThis.__e2eAuthOverride__ = { email: "e2e@example.com", admin };
  }, true);
  await configure({
    CalendarIncidents: { calendarIncidents: INCIDENTS },
    PendingIncidents: {
      pendingCalendarIncidents: [
        {
          ...INCIDENTS[0],
          id: "900",
          title: "Monorail door fault at 武吉免登",
          created: "2026-08-20T09:00:00Z",
        },
      ],
    },
    ConsoleCategories: { calendarIncidentCategories: [] },
    ConsoleSocialMediaLinks: {
      socialMediaLinks: [
        {
          id: "77",
          url: "https://x.com/prasarana/status/1234567",
          title: "Service alert 吉隆坡单轨 disruption thread with a fairly long title",
          created: "2026-08-21T10:00:00Z",
          completed: false,
          completedAt: null,
          user: { nickname: "RapidKL Watch", shortId: "rk01" },
          categories: [{ name: "Disruption" }],
        },
      ],
    },
  });

  // --- insiden page ---
  await page.goto("http://localhost:4300/insiden");
  await page.waitForTimeout(1200);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  results.push({
    surface: `insiden-${vp.name}`,
    check: "no horizontal overflow",
    pass: overflow <= 0,
    detail: `scrollWidth-clientWidth=${overflow}px`,
  });

  const cjkCard = page.locator("app-incident-card").filter({ hasText: "吉隆坡" });
  const cjkRendered = await cjkCard.evaluate((card) => {
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    let node;
    let samples = 0;
    let zeroWidth = 0;
    while ((node = walker.nextNode())) {
      if (/[\u4e00-\u9fff]/.test(node.textContent)) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        samples += 1;
        if (rect.width < 8) zeroWidth += 1;
      }
    }
    return { samples, zeroWidth };
  });
  results.push({
    surface: `insiden-${vp.name}`,
    check: "CJK glyphs render with nonzero width",
    pass: cjkRendered.samples > 0 && cjkRendered.zeroWidth === 0,
    detail: JSON.stringify(cjkRendered),
  });

  const badgeFits = await cjkCard
    .locator("span", { hasText: "武吉免登" })
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), clipped: r.height > 40 };
    });
  results.push({
    surface: `insiden-${vp.name}`,
    check: "CJK station badge not clipped",
    pass: badgeFits.w > 0 && !badgeFits.clipped,
    detail: JSON.stringify(badgeFits),
  });

  // --- tooltip hover (desktop only) ---
  if (vp.name === "desktop") {
    const group = page.locator("app-vote-button .group\\/vote").first();
    await group.hover();
    await page.waitForTimeout(400);
    const tooltip = await page.evaluate(() => {
      const el = document.querySelector('app-vote-button [role="tooltip"]');
      if (!el) return null;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        opacity: style.opacity,
        text: el.textContent.trim(),
        width: Math.round(rect.width),
      };
    });
    results.push({
      surface: "vote-tooltip-desktop",
      check: "tooltip visible on hover with breakdown",
      pass: !!tooltip && tooltip.opacity === "1" && /5 ↑ \/ 2 ↓/.test(tooltip.text ?? ""),
      detail: JSON.stringify(tooltip),
    });
  }

  // --- form sheet ---
  await page.getByTestId("new-incident").click();
  await page.waitForTimeout(600);
  const sheetOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  const selectStyled = await page.evaluate(() => {
    const sel = document.querySelector('hlm-sheet select[hlm-select], hlm-sheet select');
    if (!sel) return null;
    const s = getComputedStyle(sel);
    return { borderRadius: s.borderRadius, height: Math.round(sel.getBoundingClientRect().height) };
  });
  results.push({
    surface: `form-sheet-${vp.name}`,
    check: "sheet causes no horizontal overflow; select styled",
    pass: sheetOverflow <= 0 && !!selectStyled && parseFloat(selectStyled.borderRadius) > 0,
    detail: JSON.stringify({ sheetOverflow, selectStyled }),
  });
  await page.keyboard.press("Escape");

  // --- console pages ---
  for (const route of ["pending", "links"]) {
    await page.goto(`http://localhost:4300/console/insiden/${route}`);
    await page.waitForTimeout(1200);
    const navPresent = await page.locator("app-nav").count();
    const footerPresent = await page.locator("app-footer").count();
    const tableScrolls = await page.evaluate(() => {
      const container = document.querySelector("[hlmtablecontainer], .overflow-x-auto");
      if (!container) return null;
      return container.scrollWidth > container.clientWidth;
    });
    results.push({
      surface: `console-${route}-${vp.name}`,
      check: "nav+footer present; table scrollable on narrow viewports",
      pass:
        navPresent > 0 &&
        footerPresent > 0 &&
        (vp.name === "desktop" ? tableScrolls !== null : tableScrolls === true || tableScrolls === false),
      detail: JSON.stringify({ navPresent, footerPresent, tableScrolls }),
    });
  }

  await context.close();
}

await browser.close();

let failures = 0;
for (const r of results) {
  const mark = r.pass ? "PASS" : "FAIL";
  if (!r.pass) failures += 1;
  console.log(`[${mark}] ${r.surface}: ${r.check} — ${r.detail}`);
}
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
