import { expect, test, type Page } from "@playwright/test";

import { loginAs } from "./helpers/auth";
import { configureMock, resetMock, routeGraphQLToMock } from "./helpers/mock-graphql";

/**
 * E2E coverage for the /spotting/:lineId/details "Spotting Activity" vehicle × date grid.
 *
 * The grid gained a mobile (<768px) stacked layout: each vehicle's full-width NAME row sits
 * directly above its own horizontally-scrolling date row, each vehicle type's full-width TYPE
 * LABEL row sits directly above its per-date totals row, names stay pinned left while the date
 * rows scroll, and the current type label + totals stay pinned under the month/day header while
 * the page scrolls. Desktop (>=768px) keeps the original two-table split — the fixed names table
 * beside the scrolling day body, with its mirrored sticky day header — and must render none of
 * the mobile rows.
 *
 * Responses come from the local mock GraphQL server (e2e/mock-graphql.server.mjs) via
 * `routeGraphQLToMock`; Firebase Auth is bypassed with the AuthService E2E override
 * (helpers/auth.ts). The grid's visible window is the current UTC month plus the two before it,
 * so the stubbed spotting dates are computed from `new Date()` to always land inside it.
 */

const LINE = { id: "1", code: "L1", displayName: "Line 1", status: "ACTIVE" };

/** The visible window is the current UTC month plus the two before it, so a day in the current
 * UTC month always lands inside it — regardless of when the suite runs. */
const NOW = new Date();
const YEAR = NOW.getUTCFullYear();
const MONTH = String(NOW.getUTCMonth() + 1).padStart(2, "0");
const dayKey = (day: number): string => `${YEAR}-${MONTH}-${String(day).padStart(2, "0")}`;

function vehicle(id: string, identificationNo: string): Record<string, unknown> {
  return {
    id,
    identificationNo,
    status: "IN_SERVICE",
    nickname: null,
    lastSpottingDate: null,
    inServiceSince: null,
    spottingCount: 0,
    notes: null,
    incidentCount: 0,
    wheelStatus: null,
  };
}

function vehicleRange(
  startIndex: number,
  count: number,
  firstNumber: number,
): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, i) =>
    vehicle(`v${startIndex + i}`, String(firstNumber + i)),
  );
}

function vehicleType(
  id: string,
  internalName: string,
  displayName: string,
  vehicles: Array<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    id,
    internalName,
    displayName,
    vehicleStatusInServiceCount: vehicles.length,
    vehicleStatusNotSpottedCount: 0,
    vehicleStatusOutOfServiceCount: 0,
    vehicleStatusDecommissionedCount: 0,
    vehicleStatusMarriedCount: 0,
    vehicleStatusTestingCount: 0,
    vehicleStatusUnknownCount: 0,
    vehicleTotalCount: vehicles.length,
    vehicles,
  };
}

const STUBS: Record<string, unknown> = {
  Lines: { lines: [LINE] },
  VehicleTypesByLine: {
    vehicleTypes: [
      vehicleType("t1", "T1", "Type One", vehicleRange(1, 8, 101)),
      vehicleType("t2", "T2", "Type Two", vehicleRange(9, 8, 201)),
    ],
  },
  LineSpottingBounds: {
    lines: [{ id: "1", vehicleSpottingTrends: [{ dateKey: "2026-07" }, { dateKey: "2026-09" }] }],
  },
  LineSpottingGrid: {
    lines: [
      {
        id: "1",
        vehicleSpottingTrends: [
          { dateKey: dayKey(10), count: 2, vehicle: { id: "v1" } },
          { dateKey: dayKey(15), count: 1, vehicle: { id: "v2" } },
        ],
      },
    ],
  },
};

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const DESKTOP_VIEWPORT = { width: 1280, height: 900 };

/** Every testid the mobile stacked layout owns — none of them may render on desktop. */
const MOBILE_TEST_IDS = [
  "grid-mobile-type-row",
  "grid-mobile-type-label",
  "grid-mobile-vehicle-row",
  "grid-mobile-name-pin",
  "grid-mobile-pinned",
  "grid-mobile-pinned-label",
] as const;

test.beforeEach(async ({ page }) => {
  await resetMock();
  await routeGraphQLToMock(page);
  await loginAs(page);
  await configureMock(STUBS);
});

test.describe("spotting details grid", () => {
  test("MOBILE: stacks each vehicle's name above its date row with sticky pins", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/spotting/1/details");

    await expect(page.getByTestId("spotting-grid")).toBeVisible();
    await expect(page.getByTestId("grid-body-scroll")).toBeVisible();

    // The desktop two-table split is gone; the stacked mobile rows take over.
    await expect(page.getByTestId("grid-names-table")).toHaveCount(0);
    await expect(page.getByTestId("grid-mobile-type-row").first()).toBeVisible();
    await expect(page.getByTestId("grid-mobile-vehicle-row").first()).toBeVisible();
    expect(await page.getByTestId("grid-mobile-type-row").count()).toBeGreaterThanOrEqual(1);
    expect(await page.getByTestId("grid-mobile-vehicle-row").count()).toBeGreaterThanOrEqual(1);

    // Every name pin lives in a vehicle row whose very next sibling is that vehicle's date
    // row; every type label row is likewise followed directly by its per-date totals row.
    const stacking = await page.evaluate(() => {
      const pins = Array.from(document.querySelectorAll('[data-testid="grid-mobile-name-pin"]'));
      const namesOk = pins.every((pin) => {
        const nameRow = pin.closest('[data-testid="grid-mobile-vehicle-row"]');
        if (!nameRow) {
          return false;
        }
        const dateRow = nameRow.nextElementSibling;
        return (
          dateRow !== null &&
          dateRow.tagName === "TR" &&
          dateRow.getAttribute("data-testid") === null &&
          dateRow.querySelectorAll("td").length > 1
        );
      });
      const typeRows = Array.from(
        document.querySelectorAll('[data-testid="grid-mobile-type-row"]'),
      );
      const typesOk = typeRows.every((typeRow) => {
        const totalsRow = typeRow.nextElementSibling;
        return (
          totalsRow !== null &&
          totalsRow.tagName === "TR" &&
          totalsRow.getAttribute("data-testid") === null &&
          totalsRow.querySelectorAll("td").length > 1
        );
      });
      return { namesOk, typesOk };
    });
    expect(stacking.namesOk).toBe(true);
    expect(stacking.typesOk).toBe(true);

    // Sticky-left: scrolling the date rows horizontally must not carry the name pin away — it
    // stays flush with the scroll container's own left edge.
    const bodyScroll = page.getByTestId("grid-body-scroll");
    await bodyScroll.evaluate((el) => {
      el.scrollLeft = 150;
      el.dispatchEvent(new Event("scroll"));
    });
    expect(await bodyScroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);

    const firstPin = page.getByTestId("grid-mobile-name-pin").first();
    await expect(firstPin).toBeVisible();
    const pinBox = await firstPin.boundingBox();
    const scrollBox = await bodyScroll.boundingBox();
    if (!pinBox || !scrollBox) {
      throw new Error("Expected the mobile name pin and the body scroll to have bounding boxes.");
    }
    expect(Math.abs(pinBox.x - scrollBox.x)).toBeLessThanOrEqual(3);

    // Vertical pin: park the first type row just above the sticky header stack so its label
    // engages the pinned overlay. The header stack is at least nav(61) + day header(64) = 125px,
    // so a row at 100px is always above the boundary; the grid is now ~1150px tall, so it is
    // nowhere near scrolled past at that point.
    await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>('[data-testid="grid-mobile-type-row"]');
      if (row) {
        window.scrollBy(0, row.getBoundingClientRect().top - 100);
      }
    });
    await expect(page.getByTestId("grid-mobile-pinned")).toBeVisible();
    await expect(page.getByTestId("grid-mobile-pinned-label")).toContainText("Type One");
    await page.screenshot({ path: ".omo/evidence/spotting-details-mobile-pinned.png" });

    // Collapse: clicking a type's label hides that type's vehicle rows but keeps its own label
    // row (and the other type's rows) in place.
    await page.evaluate(() => {
      document
        .querySelector('[data-testid="grid-mobile-type-row"]')
        ?.scrollIntoView({ block: "center" });
    });
    await page.getByTestId("grid-mobile-type-label").first().click();
    await expect(page.getByTestId("grid-mobile-vehicle-row")).toHaveCount(8);
    await expect(page.getByTestId("grid-mobile-type-row")).toHaveCount(2);
    expect(await firstSectionVehicleRowCount(page)).toBe(0);

    await page.screenshot({ path: ".omo/evidence/spotting-details-mobile.png", fullPage: true });
  });

  test("DESKTOP: keeps the two-table grid and renders no mobile rows", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/spotting/1/details");

    await expect(page.getByTestId("spotting-grid")).toBeVisible();
    await expect(page.getByTestId("grid-body-scroll")).toBeVisible();

    const namesTable = page.getByTestId("grid-names-table");
    await expect(namesTable).toBeVisible();
    await expect(namesTable.getByRole("columnheader", { name: "Vehicle" })).toBeVisible();
    await expect(namesTable).toContainText("Type One");
    await expect(namesTable).toContainText("101");
    await expect(namesTable).toContainText("201");
    await expect(page.getByTestId("grid-day-mirror")).toBeAttached();

    for (const testId of MOBILE_TEST_IDS) {
      await expect(page.getByTestId(testId)).toHaveCount(0);
    }

    await page.screenshot({ path: ".omo/evidence/spotting-details-desktop.png", fullPage: true });
  });
});

/** How many mobile vehicle rows sit between the first and second type-label rows — i.e. the
 * first type's own vehicles, whether the rows share one parent or each type owns its own. */
async function firstSectionVehicleRowCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const typeRows = Array.from(document.querySelectorAll('[data-testid="grid-mobile-type-row"]'));
    const first = typeRows[0];
    if (!first) {
      return -1;
    }
    let count = 0;
    let node = first.nextElementSibling;
    while (node && node !== typeRows[1]) {
      if (node.matches('[data-testid="grid-mobile-vehicle-row"]')) {
        count += 1;
      }
      node = node.nextElementSibling;
    }
    return count;
  });
}
