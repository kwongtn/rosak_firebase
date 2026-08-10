import { Injector, effect } from "@angular/core";
import { IMarker, IPopup, Marker, MarkerLayer, Popup, Scene } from "@antv/l7";
import { anchorType } from "@antv/l7-utils";
import { RtSource } from "../data/gtfs-realtime.service";
import { IFeedEntity } from "../data/types";
import { buildVehiclePopupHtml } from "./vehicle-popup-content";
import { VehicleIconMode, createVehicleMarkerElement } from "./vehicle-marker-icon";

interface PopupState {
    instance: IPopup;
    isClosed: boolean;
}

/**
 * Renders one realtime feed's vehicles as markers with popups, redrawing on every feed refresh.
 * Ported from the `RtLayer` class in the old map.component.ts, reactive to a signal instead of
 * an RxJS BehaviorSubject.
 */
export class RtMarkerLayerController {
    private readonly markerLayer = new MarkerLayer();
    private readonly markers = new Map<string, IMarker>();
    private readonly popups = new Map<string, PopupState>();
    private readonly stopEffect: () => void;

    constructor(
        private readonly scene: Scene,
        source: RtSource,
        injector: Injector,
        private readonly iconMode: VehicleIconMode
    ) {
        this.scene.addMarkerLayer(this.markerLayer);
        const ref = effect(
            () => {
                this.redraw(source.feedEntities());
            },
            { injector }
        );
        this.stopEffect = () => ref.destroy();
    }

    private redraw(entities: IFeedEntity): void {
        // `clear()` (not remove/re-add of the whole layer): `MarkerLayer.addMarker` has no
        // de-dup check, so without clearing first, every poll re-pushed every already-seen
        // vehicle's Marker onto the layer's internal array again — duplicates piling up forever
        // since `feedEntities` itself only ever grows (RtSource merges into its existing map).
        this.markerLayer.clear();

        for (const [vehicleId, vehicle] of Object.entries(entities)) {
            const position = vehicle?.position;
            if (!position) {
                continue;
            }
            const lngLat = { lng: position.longitude!, lat: position.latitude! };

            let marker = this.markers.get(vehicleId);
            if (!marker) {
                marker = new Marker({ element: createVehicleMarkerElement(this.iconMode), anchor: anchorType.CENTER }).setLnglat(lngLat);
                this.markers.set(vehicleId, marker);
            }
            marker.setLnglat(lngLat);

            let popup = this.popups.get(vehicleId);
            if (!popup) {
                const instance: IPopup = new Popup({ anchor: "top" });
                popup = { instance, isClosed: true };
                marker.setPopup(popup.instance);
                popup.instance.on("hide", () => (popup!.isClosed = true));
                popup.instance.on("show", () => (popup!.isClosed = false));
                this.popups.set(vehicleId, popup);
            }
            // No separate `title` option — folding everything into `html` gives full control
            // over the layout instead of fighting L7's own bolded-title default styling for
            // just the one line.
            popup.instance.setOptions({ html: buildVehiclePopupHtml(vehicle) });
            if (popup.isClosed) {
                popup.instance.close();
            } else {
                popup.instance.open();
            }

            this.markerLayer.addMarker(marker);
        }
    }

    tearDown(): void {
        this.stopEffect();
        try {
            this.scene.removeMarkerLayer(this.markerLayer);
        } catch (err) {
            // L7's MarkerLayer.destroy() unconditionally calls `mapsService.off(...)` — if the
            // layer was never actually attached (e.g. WebGL failed to initialize, which happens
            // for real users on old devices/browsers, not just in this dev sandbox), mapsService
            // was never set and that throws. Not fatal to us either way: the layer never had
            // markers rendered in that case, so there's nothing left to clean up.
            console.error("[tracker] failed to tear down realtime marker layer", err);
        }
    }
}
