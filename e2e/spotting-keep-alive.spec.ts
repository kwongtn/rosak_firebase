import type { Page } from "@playwright/test";

import { loginAs } from "./helpers/auth";
import {
  configureMock,
  expect,
  recordedCalls,
  routeGraphQLToMock,
  test,
} from "./helpers/mock-graphql";
import { dayKey, LINE, vehicle, vehicleRange, vehicleType } from "./helpers/spotting-fixtures";

/**
 * Regression coverage for spotting's keep-alive route persistence.
 *
 * The first test passes `routeGraphQLToMock` a `hold` hook that keeps the return revalidation
 * response open, behind a gate the test releases, to prove that retained data stays mounted while
 * a background request is in flight.
 */

const DESKTOP_VIEWPORT = { width: 1280, height: 900 };
const SCROLL_TOLERANCE = 5;
const OVERVIEW_URL = /\/spotting\/1(?:\?.*)?$/;
const DETAILS_URL = /\/spotting\/1\/details(?:\?.*)?$/;
const VEHICLE_URL = /\/spotting\/1\/vehicle\/1(?:\?.*)?$/;

const STUBS: Record<string, unknown> = {
  Lines: { lines: [LINE] },
  VehicleTypesByLine: {
    vehicleTypes: [
      vehicleType("t1", "T1", "Type One", vehicleRange(1, 20, 101)),
      vehicleType("t2", "T2", "Type Two", vehicleRange(21, 20, 121)),
    ],
  },
  LineSpottingGrid: {
    lines: [
      {
        id: "1",
        vehicleSpottingTrends: [
          { dateKey: dayKey(10), count: 2, vehicle: { id: "1" } },
          { dateKey: dayKey(15), count: 1, vehicle: { id: "2" } },
        ],
      },
    ],
  },
  LineSpottingBounds: {
    lines: [{ id: "1", vehicleSpottingTrends: [{ dateKey: dayKey(1) }] }],
  },
  // The vehicle page's header and status board come from this single-vehicle query; the
  // VehicleTypesByLine roster above only feeds its vehicle-switcher combobox.
  VehicleHeader: { vehicles: [vehicle("1", "101")] },
  VehicleSpottingHistory: { vehicles: [{ spottings: [] }] },
  VehicleIncidentsByVehicle: { vehicleIncidents: [] },
  // The vehicle page's imperative history list owns this separate query. It is deliberately
  // stubbed empty so the vehicle route has no unrelated GraphQL error while the navigation test
  // focuses on the details page's retained DOM and scroll position.
  VehicleEvents: { events: [] },
};

async function markVisibleElement(page: Page, selector: string, marker: string): Promise<void> {
  const marked = await page.evaluate(
    ({ selector: elementSelector, marker: elementMarker }) => {
      const element = Array.from(document.querySelectorAll<HTMLElement>(elementSelector)).find(
        (candidate) => candidate.getClientRects().length > 0,
      );
      if (!element) {
        return false;
      }
      element.setAttribute("data-e2e-instance", elementMarker);
      return true;
    },
    { selector, marker },
  );
  expect(marked).toBe(true);
}

async function clickVisibleLink(page: Page, selector: string): Promise<void> {
  const clicked = await page.evaluate((elementSelector) => {
    const element = Array.from(document.querySelectorAll<HTMLElement>(elementSelector)).find(
      (candidate) => candidate.getClientRects().length > 0,
    );
    if (!element) {
      return false;
    }
    (element as HTMLAnchorElement).click();
    return true;
  }, selector);
  expect(clicked).toBe(true);
}

async function setWindowScroll(page: Page, position: number): Promise<void> {
  await page.evaluate((top) => window.scrollTo(0, top), position);
  await expect
    .poll(async () => page.evaluate(() => window.scrollY))
    .toBeGreaterThanOrEqual(position - SCROLL_TOLERANCE);
}

async function expectWindowScrollNear(
  page: Page,
  position: number,
  tolerance = SCROLL_TOLERANCE,
): Promise<void> {
  await expect
    .poll(async () => page.evaluate((top) => Math.abs(window.scrollY - top), position))
    .toBeLessThanOrEqual(tolerance);
}

async function waitForVehicleTypesCalls(minimum: number): Promise<void> {
  await expect
    .poll(
      async () =>
        (await recordedCalls()).filter((call) => call.operationName === "VehicleTypesByLine")
          .length,
    )
    .toBeGreaterThanOrEqual(minimum);
}

test.beforeEach(async ({ page }) => {
  await loginAs(page);
  await configureMock(STUBS);
  await page.setViewportSize(DESKTOP_VIEWPORT);
});

test.describe("spotting keep-alive navigation", () => {
  test("returns to the overview through the in-app back link without replacing its DOM", async ({
    page,
  }) => {
    // Hold the return revalidation (the third VehicleTypesByLine call) until the test lets it go.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    // A test that fails while a response is held must not leave its handler waiting forever.
    page.once("close", release);
    let vehicleTypesCalls = 0;
    let holdStarted = false;
    await routeGraphQLToMock(page, async (body) => {
      if (/VehicleTypesByLine/.test(body) && ++vehicleTypesCalls >= 3) {
        holdStarted = true;
        await gate;
      }
    });

    await page.goto("/spotting/1");
    const overviewLink = page.locator('a[href="/spotting/1/vehicle/1"]:visible').first();
    await expect(overviewLink).toBeVisible();
    await markVisibleElement(page, 'a[href="/spotting/1/vehicle/1"]', "overview-v1");
    await waitForVehicleTypesCalls(1);

    await setWindowScroll(page, 600);
    await expectWindowScrollNear(page, 600);

    await clickVisibleLink(page, 'a[href="/spotting/1/details"]');
    await expect(page).toHaveURL(DETAILS_URL);
    await expect(page.locator('[data-testid="spotting-grid"]:visible')).toBeVisible();
    await waitForVehicleTypesCalls(2);

    const callsBeforeReturn = (await recordedCalls()).length;
    await clickVisibleLink(page, 'a[href="/spotting/1"]');
    await expect(page).toHaveURL(OVERVIEW_URL);

    const retainedOverview = page.locator('[data-e2e-instance="overview-v1"]');
    await expect(retainedOverview).toBeAttached();
    await expect(retainedOverview).toBeVisible();
    await expect(retainedOverview).toHaveText("101");

    await expect
      .poll(async () => {
        const calls = await recordedCalls();
        return calls
          .slice(callsBeforeReturn)
          .some((call) => call.operationName === "VehicleTypesByLine");
      })
      .toBe(true);
    await expect.poll(() => holdStarted).toBe(true);
    await expect.poll(async () => page.locator("[hlmSkeleton]").count()).toBe(0);
    await expectWindowScrollNear(page, 600);

    const delivered = page.waitForResponse((response) =>
      (response.request().postData() ?? "").includes("VehicleTypesByLine"),
    );
    release();
    await delivered;
    await expect(retainedOverview).toBeAttached();
    await expectWindowScrollNear(page, 600);
  });

  test("preserves both overview and details DOM and scroll through browser back and forward", async ({
    page,
  }) => {
    await routeGraphQLToMock(page);

    await page.goto("/spotting/1");
    const overviewLink = page.locator('a[href="/spotting/1/vehicle/1"]:visible').first();
    await expect(overviewLink).toBeVisible();
    await markVisibleElement(page, 'a[href="/spotting/1/vehicle/1"]', "overview-back-forward");
    await waitForVehicleTypesCalls(1);
    await setWindowScroll(page, 600);
    await expectWindowScrollNear(page, 600);

    await clickVisibleLink(page, 'a[href="/spotting/1/details"]');
    await expect(page).toHaveURL(DETAILS_URL);
    const detailsGrid = page.locator('[data-testid="spotting-grid"]:visible').first();
    await expect(detailsGrid).toBeVisible();
    await markVisibleElement(page, '[data-testid="spotting-grid"]', "details-back-forward");
    await waitForVehicleTypesCalls(2);
    await setWindowScroll(page, 400);
    await expectWindowScrollNear(page, 400);

    await page.goBack();
    await expect(page).toHaveURL(OVERVIEW_URL);
    await expect(page.locator('[data-e2e-instance="overview-back-forward"]')).toBeAttached();
    await expectWindowScrollNear(page, 600);

    await page.goForward();
    await expect(page).toHaveURL(DETAILS_URL);
    await expect(page.locator('[data-e2e-instance="details-back-forward"]')).toBeAttached();
    await expectWindowScrollNear(page, 400);
  });

  test("keeps the details grid and its window scroll when browser back returns from a vehicle", async ({
    page,
  }) => {
    await routeGraphQLToMock(page);

    await page.goto("/spotting/1/details");
    const detailsGrid = page.locator('[data-testid="spotting-grid"]:visible').first();
    await expect(detailsGrid).toBeVisible();
    await markVisibleElement(page, '[data-testid="spotting-grid"]', "details-vehicle-back");
    await waitForVehicleTypesCalls(1);
    await setWindowScroll(page, 400);
    await expectWindowScrollNear(page, 400);

    await clickVisibleLink(page, 'a[href="/spotting/1/vehicle/1"]');
    await expect(page).toHaveURL(VEHICLE_URL);
    await expect(page.getByRole("heading", { name: "101", exact: true })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(DETAILS_URL);
    await expect(page.locator('[data-e2e-instance="details-vehicle-back"]')).toBeAttached();
    await expectWindowScrollNear(page, 400);
  });
});
