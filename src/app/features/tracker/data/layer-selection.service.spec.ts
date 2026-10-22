import { LayerSelectionService } from "./layer-selection.service";

const REALTIME_CATALOG = {
  ktmb: "https://example.test/ktmb.pb",
  mrtfeeder: "https://example.test/mrt.pb",
};
const STOPS_CATALOG = {
  ktmb: "https://example.test/ktmb.zip",
  prasarana: "https://example.test/p.zip",
};

describe("LayerSelectionService", () => {
  let service: LayerSelectionService;

  beforeEach(() => {
    service = new LayerSelectionService();
  });

  describe("initial state", () => {
    it("has nothing selected except the pre-checked railway overlay", () => {
      expect(service.realtimeChecked()).toEqual({});
      expect(service.stopsChecked()).toEqual({});
      expect(service.railwayChecked()).toBe(true);
      expect(service.appliedRailway()).toBe(true);
      expect(service.hasUnsavedChanges()).toBe(false);
      expect(service.selectedCount()).toBe(1);
    });
  });

  describe("toggles", () => {
    it.each([
      ["realtime", () => service.toggleRealtime("ktmb"), () => service.realtimeChecked()],
      ["stops", () => service.toggleStops("ktmb"), () => service.stopsChecked()],
    ])("%s toggle flips one key and marks unsaved changes", (_name, toggle, read) => {
      toggle();
      expect(read()).toEqual({ ktmb: true });
      expect(service.hasUnsavedChanges()).toBe(true);

      toggle();
      expect(read()).toEqual({ ktmb: false });
    });

    it("railway toggle flips the draft only", () => {
      service.toggleRailway();

      expect(service.railwayChecked()).toBe(false);
      expect(service.appliedRailway()).toBe(true);
      expect(service.hasUnsavedChanges()).toBe(true);
    });

    it("counts only the checked draft entries per panel and in total", () => {
      service.toggleRealtime("ktmb");
      service.toggleRealtime("mrtfeeder");
      service.toggleRealtime("mrtfeeder");
      service.toggleStops("prasarana");

      expect(service.realtimeCount()).toBe(1);
      expect(service.stopsCount()).toBe(1);
      expect(service.railwayCount()).toBe(1);
      expect(service.selectedCount()).toBe(3);

      service.toggleRailway();
      expect(service.railwayCount()).toBe(0);
      expect(service.selectedCount()).toBe(2);
    });
  });

  describe("apply", () => {
    it("returns the catalog URL of every checked entry and skips unchecked ones", () => {
      service.toggleRealtime("ktmb");
      service.toggleRealtime("mrtfeeder");
      service.toggleRealtime("mrtfeeder");
      service.toggleStops("prasarana");

      const result = service.apply(REALTIME_CATALOG, STOPS_CATALOG);

      expect(result).toEqual({
        realtime: { ktmb: { sourceUrl: REALTIME_CATALOG.ktmb } },
        stops: { prasarana: { sourceUrl: STOPS_CATALOG.prasarana } },
      });
    });

    it("snapshots the drafts into the applied state and clears the unsaved flag", () => {
      service.toggleRealtime("ktmb");
      service.toggleStops("prasarana");
      service.toggleRailway();

      service.apply(REALTIME_CATALOG, STOPS_CATALOG);

      expect(service.appliedRealtimeChecked()).toEqual({ ktmb: true });
      expect(service.appliedStopsChecked()).toEqual({ prasarana: true });
      expect(service.appliedRailway()).toBe(false);
      expect(service.hasUnsavedChanges()).toBe(false);
    });

    it("returns empty maps when nothing is checked", () => {
      expect(service.apply(REALTIME_CATALOG, STOPS_CATALOG)).toEqual({ realtime: {}, stops: {} });
    });

    it("keeps the applied state when a later toggle only touches the draft", () => {
      service.toggleRealtime("ktmb");
      service.apply(REALTIME_CATALOG, STOPS_CATALOG);

      service.toggleRealtime("ktmb");

      expect(service.realtimeChecked()).toEqual({ ktmb: false });
      expect(service.appliedRealtimeChecked()).toEqual({ ktmb: true });
      expect(service.hasUnsavedChanges()).toBe(true);
    });

    it("an unchecked entry that was applied before is dropped from the next result", () => {
      service.toggleRealtime("ktmb");
      service.apply(REALTIME_CATALOG, STOPS_CATALOG);
      service.toggleRealtime("ktmb");

      expect(service.apply(REALTIME_CATALOG, STOPS_CATALOG).realtime).toEqual({});
    });
  });

  describe("undo", () => {
    it("reverts every draft to the last applied state and clears the unsaved flag", () => {
      service.toggleRealtime("ktmb");
      service.toggleStops("ktmb");
      service.apply(REALTIME_CATALOG, STOPS_CATALOG);

      service.toggleRealtime("ktmb");
      service.toggleRealtime("mrtfeeder");
      service.toggleStops("prasarana");
      service.toggleRailway();
      expect(service.hasUnsavedChanges()).toBe(true);

      service.undo();

      expect(service.realtimeChecked()).toEqual({ ktmb: true });
      expect(service.stopsChecked()).toEqual({ ktmb: true });
      expect(service.railwayChecked()).toBe(true);
      expect(service.hasUnsavedChanges()).toBe(false);
    });

    it("never touches the applied state", () => {
      service.toggleRealtime("ktmb");
      service.apply(REALTIME_CATALOG, STOPS_CATALOG);
      service.toggleRealtime("ktmb");
      service.toggleRailway();

      service.undo();

      expect(service.appliedRealtimeChecked()).toEqual({ ktmb: true });
      expect(service.appliedRailway()).toBe(true);
    });

    it("before any apply reverts to the empty defaults", () => {
      service.toggleRealtime("ktmb");
      service.toggleRailway();

      service.undo();

      expect(service.realtimeChecked()).toEqual({});
      expect(service.railwayChecked()).toBe(true);
      expect(service.hasUnsavedChanges()).toBe(false);
    });

    it("is idempotent", () => {
      service.toggleStops("prasarana");
      service.undo();
      service.undo();

      expect(service.stopsChecked()).toEqual({});
      expect(service.hasUnsavedChanges()).toBe(false);
    });

    it("restores the counts along with the drafts", () => {
      service.toggleRealtime("ktmb");
      service.apply(REALTIME_CATALOG, STOPS_CATALOG);
      service.toggleRealtime("mrtfeeder");
      expect(service.realtimeCount()).toBe(2);

      service.undo();

      expect(service.realtimeCount()).toBe(1);
    });
  });
});
