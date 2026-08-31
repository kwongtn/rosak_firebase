import * as Sentry from "@sentry/angular";
import { TestBed } from "@angular/core/testing";
import { TrackerMapComponent } from "./tracker-map.component";
import { GeojsonStorageService } from "../data/geojson-storage.service";
import { ThemeService } from "../../../core/theme/theme.service";
import { GtfsRealtimeService } from "../data/gtfs-realtime.service";
import { GtfsStaticService } from "../data/gtfs-static.service";
import { LayerSelectionService } from "../data/layer-selection.service";

vi.mock("@sentry/angular", () => ({
  captureException: vi.fn(),
}));

describe("TrackerMapComponent", () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: GeojsonStorageService,
          useValue: { getData: vi.fn().mockRejectedValue(new Error("overlay boom")) },
        },
        { provide: ThemeService, useValue: {} },
        { provide: GtfsRealtimeService, useValue: {} },
        { provide: GtfsStaticService, useValue: {} },
        { provide: LayerSelectionService, useValue: {} },
      ],
    });
  });

  it("routes rail line overlay load failure to Sentry.captureException", async () => {
    const component = TestBed.runInInjectionContext(() => new TrackerMapComponent());
    (component as unknown as { initRailLineLayer: () => void }).initRailLineLayer();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
