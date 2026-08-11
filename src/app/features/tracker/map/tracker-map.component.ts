import { Component, Injector, OnDestroy, afterNextRender, effect, inject } from "@angular/core";
import { ILayer, LineLayer, Mapbox, PointLayer, Scene } from "@antv/l7";
import { environment } from "../../../../environments/environment";
import { ThemeService } from "../../../core/theme/theme.service";
import { GeojsonStorageService } from "../data/geojson-storage.service";
import { GtfsRealtimeService } from "../data/gtfs-realtime.service";
import { GtfsStaticService, StaticSource } from "../data/gtfs-static.service";
import { LayerSelectionService } from "../data/layer-selection.service";
import { RtMarkerLayerController } from "./rt-marker-layer.controller";
import { iconModeForSourceKey } from "./vehicle-marker-icon";

/** L7's built-in Mapbox style presets (see @antv/l7-maps' MapTheme) — "normal" for light rather
 * than its own "light" preset, to keep the base map's look unchanged from before dark-mode
 * support was added. */
const MAP_STYLE_FOR_THEME: Record<"light" | "dark", string> = { light: "normal", dark: "dark" };

const RAIL_LINE_GS_URL = "gs://rosak-7223b.appspot.com/public/malaysia_railway.geo.zip";
const RAIL_LINE_FILE = "malaysia_railway.geo.json";

/**
 * Owns the @antv/l7 Scene: the always-fetched rail-line overlay (now actually gated by its
 * checkbox — see LayerSelectionService), realtime vehicle markers per active feed, and GTFS
 * stop markers per active static source (the old app parsed stops but never rendered them —
 * see Known Quirks in tracker.md; this fixes that dead end). Ported from map.component.ts.
 * The unused `PointLayer().shape("marker")` the old app declared but never fed data into has
 * been dropped rather than ported.
 */
@Component({
  selector: "app-tracker-map",
  template: '<div id="map" class="h-full w-full"></div>',
})
export class TrackerMapComponent implements OnDestroy {
  private readonly injector = inject(Injector);
  private readonly geojsonStorage = inject(GeojsonStorageService);
  private readonly gtfsRealtime = inject(GtfsRealtimeService);
  private readonly gtfsStatic = inject(GtfsStaticService);
  private readonly layerSelection = inject(LayerSelectionService);
  private readonly theme = inject(ThemeService);

  private scene: Scene | undefined;
  private lineLayer: ILayer | undefined;

  private readonly rtControllers = new Map<string, RtMarkerLayerController>();
  private seenRtKeys = new Set<string>();

  private readonly stopsLayers = new Map<string, { layer: ILayer; stopEffect: () => void }>();
  private seenStopsKeys = new Set<string>();

  constructor() {
    afterNextRender(() => this.init());
  }

  private init(): void {
    document.documentElement.style.overflow = "hidden";

    this.scene = new Scene({
      id: "map",
      map: new Mapbox({
        style: MAP_STYLE_FOR_THEME[this.theme.resolvedTheme()],
        center: [101.492, 4.5],
        zoom: 6.5,
        token: environment.mapbox.token,
      }),
    });

    this.scene.addImage(
      "marker",
      "https://gw.alipayobjects.com/mdn/antv_site/afts/img/A*BJ6cTpDcuLcAAAAAAAAAAABkARQnAQ",
    );
    this.scene.addImage(
      "arrow",
      "https://gw.alipayobjects.com/zos/bmw-prod/ce83fc30-701f-415b-9750-4b146f4b3dd6.svg",
    );

    // Skips the redundant first call (the constructor above already set the initial style) —
    // `effect()` always fires once immediately on creation, so without this the map would
    // briefly re-apply the style it was just constructed with.
    let isFirstStyleRun = true;
    effect(
      () => {
        const style = MAP_STYLE_FOR_THEME[this.theme.resolvedTheme()];
        if (isFirstStyleRun) {
          isFirstStyleRun = false;
          return;
        }
        this.scene?.setMapStyle(style);
      },
      { injector: this.injector },
    );

    this.initRailLineLayer();
    this.watchRealtimeSources();
    this.watchStopsSources();
  }

  private initRailLineLayer(): void {
    this.geojsonStorage
      .getData(RAIL_LINE_GS_URL, RAIL_LINE_FILE)
      .then((data) => {
        this.lineLayer = new LineLayer({})
          .source(data)
          .size(3)
          .shape("line")
          .texture("arrow")
          .color("rgb(22,119,255)")
          .animate({ interval: 1, duration: 1, trailLength: 2 })
          .style({
            opacity: 0.6,
            lineTexture: true,
            iconStep: 10,
            borderWidth: 0.4,
            borderColor: "#fff",
          });

        effect(
          () => {
            if (!this.scene || !this.lineLayer) {
              return;
            }
            if (this.layerSelection.appliedRailway()) {
              this.scene.addLayer(this.lineLayer);
            } else {
              this.scene.removeLayer(this.lineLayer);
            }
          },
          { injector: this.injector },
        );
      })
      .catch((err) => console.error("[tracker] failed to load rail line overlay", err));
  }

  private watchRealtimeSources(): void {
    effect(
      () => {
        const sources = this.gtfsRealtime.sources();
        const currentKeys = new Set(Object.keys(sources));

        for (const key of currentKeys) {
          if (!this.seenRtKeys.has(key) && this.scene) {
            const scene = this.scene;
            const source = sources[key];
            // RtMarkerLayerController's constructor creates its own effect() —
            // Angular disallows creating an effect synchronously from inside another
            // effect's run (NG0602), so this defers to a microtask, just outside the
            // current reactive frame, before wiring it up.
            queueMicrotask(() => {
              if (this.seenRtKeys.has(key)) {
                this.rtControllers.set(
                  key,
                  new RtMarkerLayerController(
                    scene,
                    source,
                    this.injector,
                    iconModeForSourceKey(key),
                  ),
                );
              }
            });
          }
        }
        for (const key of this.seenRtKeys) {
          if (!currentKeys.has(key)) {
            this.rtControllers.get(key)?.tearDown();
            this.rtControllers.delete(key);
          }
        }
        this.seenRtKeys = currentKeys;
      },
      { injector: this.injector },
    );
  }

  private watchStopsSources(): void {
    effect(
      () => {
        const sources = this.gtfsStatic.sources();
        const currentKeys = new Set(Object.keys(sources));

        for (const key of currentKeys) {
          if (!this.seenStopsKeys.has(key) && this.scene) {
            // Same NG0602 deferral as watchRealtimeSources() above: addStopsLayer()
            // creates its own effect() to react to this source's stops() signal, and
            // Angular disallows creating an effect synchronously from inside another
            // effect's run. Without this, every stops source silently failed to ever
            // apply its data — the effect's own creation threw before `layer.source(...)`
            // ever ran once, leaving the PointLayer permanently empty.
            const key_ = key;
            const source = sources[key];
            queueMicrotask(() => {
              if (this.seenStopsKeys.has(key_)) {
                this.addStopsLayer(key_, source);
              }
            });
          }
        }
        for (const key of this.seenStopsKeys) {
          if (!currentKeys.has(key)) {
            const entry = this.stopsLayers.get(key);
            if (entry) {
              entry.stopEffect();
              this.scene?.removeLayer(entry.layer);
            }
            this.stopsLayers.delete(key);
          }
        }
        this.seenStopsKeys = currentKeys;
      },
      { injector: this.injector },
    );
  }

  private addStopsLayer(key: string, source: StaticSource): void {
    // `.source(...)` here is load-bearing, not just initial data: BaseLayer#setData() always
    // calls straight through to `this.layerSource.setData(...)`, and `layerSource` is *only*
    // ever assigned by `.source(...)` — a layer that skips it and goes straight to `setData()`
    // (as this one previously did) throws reading `.setData` off an undefined `layerSource`
    // the moment the effect below first runs, which is why stops silently never rendered even
    // once the underlying fetch succeeded. Seeding with whatever `source.stops()` holds right
    // now (the empty FeatureCollection before the fetch resolves, same as every other case)
    // gives the layer a real source to update via `setData` once real data arrives.
    const layer = new PointLayer({})
      .source(source.stops())
      .shape("circle")
      .size(4)
      .color("#f59e0b")
      .style({ opacity: 0.8 });
    this.scene?.addLayer(layer);

    const ref = effect(
      () => {
        layer.setData(source.stops());
      },
      { injector: this.injector },
    );
    this.stopsLayers.set(key, { layer, stopEffect: () => ref.destroy() });
  }

  ngOnDestroy(): void {
    document.documentElement.style.overflow = "auto";
    for (const controller of this.rtControllers.values()) {
      controller.tearDown();
    }
    for (const entry of this.stopsLayers.values()) {
      entry.stopEffect();
    }
  }
}
