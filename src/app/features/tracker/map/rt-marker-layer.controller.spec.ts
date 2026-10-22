import * as Sentry from "@sentry/angular";
import { Injector, inject, runInInjectionContext } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { RtMarkerLayerController } from "./rt-marker-layer.controller";
import { RtSource } from "../data/gtfs-realtime.service";

// The unit-test builder shares one module cache across spec files (`isolate: false`), so reset it on
// both sides of this file; see "Unit-test isolation" in docs/COMPONENTS.md.
vi.hoisted(() => vi.resetModules());
vi.mock("@sentry/angular", () => ({
  captureException: vi.fn(),
}));

afterAll(() => vi.resetModules());

describe("RtMarkerLayerController", () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
  });

  it("routes teardown failure to Sentry.captureException", () => {
    const scene = {
      addMarkerLayer: vi.fn(),
      removeMarkerLayer: vi.fn().mockImplementation(() => {
        // L7 throws when the layer was never attached (e.g. WebGL failed to init).
        throw new Error("mapsService missing");
      }),
    };
    const source = { feedEntities: () => ({}) } as unknown as RtSource;
    const controller = TestBed.runInInjectionContext(() => {
      const injector = inject(Injector);
      return new RtMarkerLayerController(scene as never, source, injector, "train");
    });
    controller.tearDown();
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
