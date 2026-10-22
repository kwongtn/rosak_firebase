import type { Page } from "@playwright/test";

import { loginAs } from "./helpers/auth";
import {
  configureMock,
  expect,
  recordedCalls,
  routeGraphQLToMock,
  test,
} from "./helpers/mock-graphql";
import { dayKey, LINE, vehicle, vehicleType } from "./helpers/spotting-fixtures";

/**
 * The main contribution journey: report a spotting from the vehicle page's sheet, photo included.
 * The mutation goes through the mock GraphQL server (and must carry the viewer's token, see
 * helpers/auth.ts); the photo is queued and POSTed to the REST upload endpoint, which the spec
 * routes itself so it can read the multipart body.
 */

const NEW_EVENT_ID = 4242;
const VEHICLE = vehicle("1", "101");

const STUBS = {
  Lines: { lines: [LINE] },
  VehicleTypesByLine: { vehicleTypes: [vehicleType("t1", "T1", "Type One", [VEHICLE])] },
  VehicleHeader: { vehicles: [VEHICLE] },
  VehicleSpottingHistory: { vehicles: [{ spottings: [] }] },
  VehicleIncidentsByVehicle: { vehicleIncidents: [] },
  VehicleEvents: { events: [] },
  LinesAndVehicles: {
    lines: [
      {
        ...LINE,
        vehicleTypes: [
          {
            id: "t1",
            internalName: "T1",
            displayName: "Type One",
            vehicles: [{ id: "1", identificationNo: "101", status: "IN_SERVICE" }],
          },
        ],
      },
    ],
  },
  AddSpottingEntry: { addEvent: { id: String(NEW_EVENT_ID) } },
  // The line overview page's own reads.
  LineSpottingGrid: {
    lines: [
      { id: "1", vehicleSpottingTrends: [{ dateKey: dayKey(10), count: 1, vehicle: { id: "1" } }] },
    ],
  },
  LineSpottingBounds: { lines: [{ id: "1", vehicleSpottingTrends: [{ dateKey: dayKey(1) }] }] },
};

/** A real, tiny JPEG made by the browser itself, so the test carries no fixture file. */
async function makeJpeg(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 8;
    canvas.getContext("2d")!.fillRect(0, 0, 8, 8);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg"));
    const bytes = new Uint8Array(await blob!.arrayBuffer());
    return btoa(String.fromCharCode(...bytes));
  });
  return Buffer.from(base64, "base64");
}

/** The text value of one multipart form field (the JPEG field is binary and is not read this way). */
function multipartField(body: Buffer, name: string): string | undefined {
  return new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)\\r\\n`).exec(body.toString("latin1"))?.[1];
}

interface UploadRequest {
  relatedId: string | undefined;
  uploadType: string | undefined;
  authKey: string | undefined;
  hasImage: boolean;
}

test("USER: reports a spotting with a photo from the vehicle page", async ({ page }) => {
  const token = await loginAs(page);
  await routeGraphQLToMock(page);
  const uploads: UploadRequest[] = [];
  await page.route("**/upload/", async (route) => {
    const request = route.request();
    const body = request.postDataBuffer() ?? Buffer.alloc(0);
    uploads.push({
      relatedId: multipartField(body, "related_id"),
      uploadType: multipartField(body, "upload_type"),
      authKey: request.headers()["firebase-auth-key"],
      hasImage: /name="image"; filename="spot\.jpg"/.test(body.toString("latin1")),
    });
    await route.fulfill({ json: {} });
  });
  await configureMock(STUBS);

  await page.goto("/spotting/1/vehicle/1");
  await expect(page.getByRole("heading", { name: "101", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add a Spotting Entry" }).first().click();

  await page.getByRole("combobox", { name: "Line", exact: true }).click();
  await page.getByRole("option", { name: /L1/ }).click();
  await page.getByRole("combobox", { name: "Vehicle", exact: true }).click();
  await page.getByRole("option", { name: /101/ }).click();
  await page.getByLabel("Notes (optional)").fill("Cab end, platform 2");
  await page.locator('app-photo-picker input[type="file"]').setInputFiles({
    name: "spot.jpg",
    mimeType: "image/jpeg",
    buffer: await makeJpeg(page),
  });
  await expect(page.locator("app-photo-picker img")).toHaveCount(1);

  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("Spotting entry recorded!")).toBeVisible();

  const call = (await recordedCalls()).find((c) => c.operationName === "AddSpottingEntry");
  expect(call?.authKey).toBe(token);
  expect(call?.variables).toMatchObject({
    data: { vehicle: "1", notes: "Cab end, platform 2", type: "JUST_SPOTTING", isAnonymous: false },
  });

  // The queue sends every second; the photo is filed against the event the mutation returned.
  await expect.poll(() => uploads.length).toBe(1);
  expect(uploads[0]).toEqual({
    relatedId: String(NEW_EVENT_ID),
    uploadType: "SPOTTING_EVENT",
    authKey: token,
    hasImage: true,
  });
});
