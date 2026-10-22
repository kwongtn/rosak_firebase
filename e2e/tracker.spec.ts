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
      { id: "1", label: "ETS 9001", latitude: 3.139, longitude: 101.687 },
      { id: "2", label: "ETS 9002", latitude: 3.15, longitude: 101.7 },
    ].map(({ id, label, latitude, longitude }) => ({
      id,
      vehicle: {
        vehicle: { id: `ktmb-ets-900${id}`, label },
        position: { latitude, longitude },
        timestamp: Math.floor(Date.now() / 1000),
      },
    })),
  });
  return Buffer.from(transit_realtime.FeedMessage.encode(message).finish());
}

test("a selected realtime feed draws its vehicles on the map", async ({ page }) => {
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

  // The vehicle marker is a plain DOM element L7 places over the map; none before Apply. It has no
  // testid, so the selector is its inline blue (#2563eb in vehicle-marker-icon.ts): restyle it and
  // this fails loudly. A data-testid on that wrapper would replace the colour.
  const markers = page.locator('#map div[style*="rgb(37, 99, 235)"]');
  await expect(markers).toHaveCount(0);
  await page
    .locator("app-status-card label")
    .filter({ hasText: /^KTMB$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Apply" }).click();

  await expect.poll(() => feedRequests).toBeGreaterThan(0);
  await expect(markers).toHaveCount(2);
  await expect(markers.first()).toBeVisible();

  // The popup is built from the feed entity, so it proves the feed's data reached the marker.
  // force: the click lands on the marker's SVG glyph, which Playwright's hit-target check rejects
  // as "intercepting" although it is the marker's own child and the click bubbles to its handler.
  await markers.first().click({ force: true });
  await expect(page.locator(".l7-popup")).toContainText(/ETS 900[12]/);
});
