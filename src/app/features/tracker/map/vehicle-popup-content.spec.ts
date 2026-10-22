import { transit_realtime } from "gtfs-realtime-bindings";
import { buildVehiclePopupElement } from "./vehicle-popup-content";

/** The popup's label/value pairs, in render order. */
function popupRows(root: HTMLElement): Array<[string, string]> {
  return Array.from(root.querySelectorAll("dl > div")).map((row) => [
    row.querySelector("dt")?.textContent ?? "",
    row.querySelector("dd")?.textContent ?? "",
  ]);
}

describe("buildVehiclePopupElement", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("titles the popup with the label, falling back to the id and then to 'Vehicle'", () => {
    expect(
      buildVehiclePopupElement({ vehicle: { id: "v1", label: "Train 1" } }).querySelector("p")
        ?.textContent,
    ).toBe("Train 1");
    expect(
      buildVehiclePopupElement({ vehicle: { id: "v1" } }).querySelector("p")?.textContent,
    ).toBe("v1");
    expect(buildVehiclePopupElement(null).querySelector("p")?.textContent).toBe("Vehicle");
  });

  it("shows only the fields the feed carries, and a placeholder when it carries none", () => {
    const empty = buildVehiclePopupElement({});

    expect(empty.querySelector("dl")).toBeNull();
    expect(empty.textContent).toContain("No further data available.");
  });

  it("lists the id only when a label took the title, plus trip, route and stop", () => {
    const root = buildVehiclePopupElement({
      vehicle: { id: "v1", label: "Train 1" },
      trip: { tripId: "t1", routeId: "r1" },
      currentStatus: transit_realtime.VehiclePosition.VehicleStopStatus.STOPPED_AT,
      stopId: "s1",
    });

    expect(popupRows(root)).toEqual([
      ["Vehicle ID", "v1"],
      ["Trip", "t1"],
      ["Route", "r1"],
      ["Stopped at", "s1"],
    ]);
  });

  it("converts speed from m/s to km/h and rounds the bearing", () => {
    const root = buildVehiclePopupElement({
      position: { latitude: 0, longitude: 0, speed: 10, bearing: 89.6 },
    });

    expect(popupRows(root)).toEqual([
      ["Speed", "36 km/h"],
      ["Bearing", "90°"],
    ]);
  });

  it("labels occupancy and congestion, and skips values it has no label for", () => {
    const root = buildVehiclePopupElement({
      occupancyStatus: transit_realtime.VehiclePosition.OccupancyStatus.FULL,
      congestionLevel: transit_realtime.VehiclePosition.CongestionLevel.STOP_AND_GO,
    });
    const unknown = buildVehiclePopupElement({
      occupancyStatus: 99 as transit_realtime.VehiclePosition.OccupancyStatus,
      congestionLevel: 99 as transit_realtime.VehiclePosition.CongestionLevel,
    });

    expect(popupRows(root)).toEqual([
      ["Occupancy", "Full"],
      ["Traffic", "Stop-and-go"],
    ]);
    expect(popupRows(unknown)).toEqual([]);
  });

  it("shows how stale the position is", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T10:00:00Z"));
    const nowSec = Math.floor(Date.now() / 1000);

    const rowFor = (age: number) =>
      popupRows(buildVehiclePopupElement({ timestamp: nowSec - age }))[0];

    expect(rowFor(30)).toEqual(["Updated", "30s ago"]);
    expect(rowFor(180)).toEqual(["Updated", "3m ago"]);
    expect(rowFor(7200)).toEqual(["Updated", "2h ago"]);
  });

  it("renders feed strings as text, never as markup", () => {
    const hostile = `<img src=x onerror="alert(1)"><script>alert(2)</script>`;

    const root = buildVehiclePopupElement({
      vehicle: { id: hostile, label: hostile },
      trip: { tripId: hostile },
    });

    expect(root.querySelector("img, script")).toBeNull();
    expect(root.querySelector("p")?.textContent).toBe(hostile);
    expect(popupRows(root)).toContainEqual(["Trip", hostile]);
  });
});
