import { expect, test, type Page } from "@playwright/test";

import { loginAs } from "./helpers/auth";
import { configureMock, MOCK_GRAPHQL_URL, recordedCalls, resetMock } from "./helpers/mock-graphql";

/**
 * Regression coverage for spotting's keep-alive route persistence.
 *
 * The development bundle points at the backend URL in the environment, so this spec installs
 * its own GraphQL route instead of using the shared pass-through helper. That lets the return
 * revalidation response be held open long enough to prove that retained data stays mounted while
 * a background request is in flight.
 */

const LINE = { id: "1", code: "L1", displayName: "Line 1", status: "ACTIVE" };
const DESKTOP_VIEWPORT = { width: 1280, height: 900 };
const SCROLL_TOLERANCE = 5;
const OVERVIEW_URL = /\/spotting\/1(?:\?.*)?$/;
const DETAILS_URL = /\/spotting\/1\/details(?:\?.*)?$/;
const VEHICLE_URL = /\/spotting\/1\/vehicle\/v1(?:\?.*)?$/;

/** The grid's visible window is the current UTC month plus the two before it. */
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
      vehicleType("t1", "T1", "Type One", vehicleRange(1, 20, 101)),
      vehicleType("t2", "T2", "Type Two", vehicleRange(21, 20, 121)),
    ],
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
  LineSpottingBounds: {
    lines: [{ id: "1", vehicleSpottingTrends: [{ dateKey: dayKey(1) }] }],
  },
  VehicleSpottingHistory: { vehicles: [{ spottings: [] }] },
  VehicleIncidentsByVehicle: { vehicleIncidents: [] },
  // The vehicle page's imperative history list owns this separate query. It is deliberately
  // stubbed empty so the vehicle route has no unrelated GraphQL error while the navigation test
  // focuses on the details page's retained DOM and scroll position.
  VehicleEvents: { events: [] },
};

interface MockRouteState {
  vehicleTypesCalls: number;
  delayedResponseStarted: boolean;
  delayedResponseResolved: boolean;
}

/**
 * Routes GraphQL traffic to the mock and optionally holds VehicleTypesByLine responses from a
 * call number onward. The state flags let the test observe that the delayed request is genuinely
 * open before asserting the no-skeleton state.
 */
async function routeGraphQLToMockWithDelay(
  page: Page,
  delayVehicleTypesFrom?: number,
): Promise<MockRouteState> {
  const state: MockRouteState = {
    vehicleTypesCalls: 0,
    delayedResponseStarted: false,
    delayedResponseResolved: false,
  };

  await page.route("**/graphql/", async (route) => {
    const body = route.request().postDataJSON() as { query?: string } | undefined;
    const isVehicleTypes = /VehicleTypesByLine/.test(body?.query ?? "");
    const response = await route.fetch({ url: `${MOCK_GRAPHQL_URL}/graphql/` });
    const shouldDelay =
      isVehicleTypes &&
      delayVehicleTypesFrom !== undefined &&
      ++state.vehicleTypesCalls >= delayVehicleTypesFrom;

    if (shouldDelay) {
      state.delayedResponseStarted = true;
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    await route.fulfill({ response });
    if (shouldDelay) {
      state.delayedResponseResolved = true;
    }
  });

  return state;
}

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
  await resetMock();
  await loginAs(page);
  await configureMock(STUBS);
  await page.setViewportSize(DESKTOP_VIEWPORT);
});

test.describe("spotting keep-alive navigation", () => {
  test("returns to the overview through the in-app back link without replacing its DOM", async ({
    page,
  }) => {
    const routeState = await routeGraphQLToMockWithDelay(page, 3);

    await page.goto("/spotting/1");
    const overviewLink = page.locator('a[href="/spotting/1/vehicle/v1"]:visible').first();
    await expect(overviewLink).toBeVisible();
    await markVisibleElement(page, 'a[href="/spotting/1/vehicle/v1"]', "overview-v1");
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
    expect(routeState.delayedResponseStarted).toBe(true);
    expect(routeState.delayedResponseResolved).toBe(false);
    await expect.poll(async () => page.locator("[hlmSkeleton]").count()).toBe(0);
    await expectWindowScrollNear(page, 600);
    expect(routeState.delayedResponseResolved).toBe(false);

    await expect.poll(() => routeState.delayedResponseResolved).toBe(true);
    await expect(retainedOverview).toBeAttached();
    await expectWindowScrollNear(page, 600);
  });

  test("preserves both overview and details DOM and scroll through browser back and forward", async ({
    page,
  }) => {
    await routeGraphQLToMockWithDelay(page);

    await page.goto("/spotting/1");
    const overviewLink = page.locator('a[href="/spotting/1/vehicle/v1"]:visible').first();
    await expect(overviewLink).toBeVisible();
    await markVisibleElement(page, 'a[href="/spotting/1/vehicle/v1"]', "overview-back-forward");
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
    await routeGraphQLToMockWithDelay(page);

    await page.goto("/spotting/1/details");
    const detailsGrid = page.locator('[data-testid="spotting-grid"]:visible').first();
    await expect(detailsGrid).toBeVisible();
    await markVisibleElement(page, '[data-testid="spotting-grid"]', "details-vehicle-back");
    await waitForVehicleTypesCalls(1);
    await setWindowScroll(page, 400);
    await expectWindowScrollNear(page, 400);

    await clickVisibleLink(page, 'a[href="/spotting/1/vehicle/v1"]');
    await expect(page).toHaveURL(VEHICLE_URL);
    await expect(page.getByRole("heading", { name: "101", exact: true })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(DETAILS_URL);
    await expect(page.locator('[data-e2e-instance="details-vehicle-back"]')).toBeAttached();
    await expectWindowScrollNear(page, 400);
  });
});
