import * as Sentry from "@sentry/angular";
import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { TrackerMapComponent } from "./tracker-map.component";
import { GeojsonStorageService } from "../data/geojson-storage.service";
import { ThemeService } from "../../../core/theme/theme.service";
import { GtfsRealtimeService } from "../data/gtfs-realtime.service";
import { GtfsStaticService } from "../data/gtfs-static.service";
import { LayerSelectionService } from "../data/layer-selection.service";

const l7 = vi.hoisted(() => ({ sceneDestroy: vi.fn() }));

vi.mock("@sentry/angular", () => ({
  captureException: vi.fn(),
}));

// L7 needs WebGL, which jsdom lacks: the scene only has to accept the calls init() makes and
// record destroy().
vi.mock("@antv/l7", () => ({
  Mapbox: class {},
  LineLayer: class {},
  PointLayer: class {},
  Scene: class {
    destroy = l7.sceneDestroy;
    addImage() {}
    setMapStyle() {}
    addLayer() {}
    removeLayer() {}
  },
}));

describe("TrackerMapComponent", () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
    l7.sceneDestroy.mockClear();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: GeojsonStorageService,
          useValue: { getData: vi.fn().mockRejectedValue(new Error("overlay boom")) },
        },
        { provide: ThemeService, useValue: { resolvedTheme: signal("light") } },
        { provide: GtfsRealtimeService, useValue: { sources: signal({}) } },
        { provide: GtfsStaticService, useValue: { sources: signal({}) } },
        { provide: LayerSelectionService, useValue: { appliedRailway: signal(false) } },
      ],
    });
  });

  afterEach(() => {
    document.documentElement.style.overflow = "";
  });

  it("routes rail line overlay load failure to Sentry.captureException", async () => {
    const component = TestBed.runInInjectionContext(() => new TrackerMapComponent());
    (component as unknown as { initRailLineLayer: () => void }).initRailLineLayer();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it("destroys the L7 scene and restores the overflow it locked when destroyed", () => {
    document.documentElement.style.overflow = "scroll";
    const fixture = TestBed.createComponent(TrackerMapComponent);
    fixture.detectChanges();
    expect(document.documentElement.style.overflow).toBe("hidden");

    fixture.destroy();

    expect(l7.sceneDestroy).toHaveBeenCalledTimes(1);
    expect(document.documentElement.style.overflow).toBe("scroll");
  });
});
