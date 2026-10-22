import { transit_realtime } from "gtfs-realtime-bindings";

import { expect, test } from "./helpers/mock-graphql";

/**
 * The tracker's data path end to end: pick the KTMB realtime layer, Apply, and the feed's vehicle
 * appears on the map as a marker. The GTFS-realtime feed is a protobuf this spec encodes itself
 * and serves from a route; the map runs for real (headless Chromium's software WebGL) on a blank
 * Mapbox style, so no external map service is reached. Desktop only: below `sm` the layer card is
 * replaced by a bottom sheet with its own controls.
 */

const KTMB_FEED = "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb";
const CORS = { "access-control-allow-origin": "*" };

function vehicleFeed(): Buffer {
  const message = transit_realtime.FeedMessage.create({
    header: { gtfsRealtimeVersion: "2.0" },
    entity: [
      {
        id: "1",
        vehicle: {
          vehicle: { id: "ktmb-ets-9001", label: "ETS 9001" },
          position: { latitude: 3.139, longitude: 101.687 },
          timestamp: Math.floor(Date.now() / 1000),
        },
      },
    ],
  });
  return Buffer.from(transit_realtime.FeedMessage.encode(message).finish());
}

test("a selected realtime feed draws its vehicle on the map", async ({ page }) => {
  let feedRequests = 0;
  await page.route(KTMB_FEED, (route) => {
    feedRequests += 1;
    return route.fulfill({
      contentType: "application/x-protobuf",
      headers: CORS,
      body: vehicleFeed(),
    });
  });
  await page.route("https://api.mapbox.com/**", (route) =>
    route.fulfill({ json: { version: 8, sources: {}, layers: [] }, headers: CORS }),
  );

  await page.goto("/tracker");

  // The vehicle marker is a plain DOM element L7 places over the map; none before Apply.
  const markers = page.locator('#map div[style*="rgb(37, 99, 235)"]');
  await expect(markers).toHaveCount(0);
  await page
    .locator("app-status-card label")
    .filter({ hasText: /^KTMB$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Apply" }).click();

  await expect.poll(() => feedRequests).toBeGreaterThan(0);
  await expect(markers).toHaveCount(1);
  await expect(markers.first()).toBeVisible();
});
