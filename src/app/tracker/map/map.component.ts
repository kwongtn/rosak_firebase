import {
    Component,
    Input,
    OnChanges,
    OnInit,
    SimpleChanges,
} from "@angular/core";
import {
    ILayer,
    IMarker,
    IPopup,
    Marker,
    MarkerLayer,
    PointLayer,
    Popup,
    Scene,
} from "@antv/l7";
import { Mapbox } from "@antv/l7-maps";

import { IFeedEntity } from "../types";

@Component({
    selector: "tracker-map",
    standalone: true,
    imports: [],
    templateUrl: "./map.component.html",
    styleUrl: "./map.component.scss",
})
export class TrackerMapComponent implements OnInit, OnChanges {
    @Input() feedEntities!: IFeedEntity;

    /**
     * Map stuff
     */
    scene: Scene | undefined = undefined;
    pointLayer: PointLayer | undefined = undefined;

    markerLayer: MarkerLayer | undefined = undefined;
    markers: { [key: string]: IMarker } = {};
    popups: { [key: string]: IPopup } = {};

    constructor() {}

    ngOnInit() {
        this.scene = new Scene({
            id: "map",
            map: new Mapbox({
                style: "normal",
                center: [101.492, 4.5],
                zoom: 6.5,
                token: "pk.eyJ1Ijoia3dvbmd0biIsImEiOiJjbGU1cnJvd3UwZnp3M3Ftc2FvdWZlNGg4In0.rGGyBGsaSvW4Q6C8B0oh8Q",
            }),
        });
        this.scene.addImage(
            "marker",
            "https://gw.alipayobjects.com/mdn/antv_site/afts/img/A*BJ6cTpDcuLcAAAAAAAAAAABkARQnAQ"
        );

        this.pointLayer = new PointLayer().shape("marker").size(12);
        this.scene?.addLayer(this.pointLayer as ILayer);
    }

    ngOnChanges(changes: SimpleChanges): void {
        const currVal: IFeedEntity = changes["feedEntities"].currentValue;

        // this.points = [];
        // Object.keys(currVal).forEach((key) => {
        //     console.log(key, currVal[key]);
        //     // TODO: Try making type checking less troublesome
        //     if (currVal[key]?.position) {
        //         this.points.push({
        //             type: "Feature",
        //             properties: {},
        //             geometry: {
        //                 type: "Point",
        //                 coordinates: [
        //                     (
        //                         currVal[key]
        //                             ?.position as transit_realtime.IPosition
        //                     ).longitude,
        //                     (
        //                         currVal[key]
        //                             ?.position as transit_realtime.IPosition
        //                     ).latitude,
        //                 ],
        //             },
        //         });
        //     }
        // });
        // this.pointLayer?.setData(
        //     {
        //         type: "FeatureCollection",
        //         features: this.points,
        //     },
        //     {
        //         parser: {
        //             type: "geojson",
        //         },
        //     }
        // );
        // this.pointLayer?.render();
        // this.scene?.render();

        Object.entries(currVal).forEach(([key, value]) => {
            if (value?.position) {
                const data = {
                    lng: value.position.longitude,
                    lat: value.position.latitude,
                };
                if (!this.markers[key]) {
                    this.markers[key] = new Marker().setLnglat(data);
                    this.scene?.addMarker(this.markers[key]);
                }
                this.markers[key].setLnglat(data);

                if (!this.popups[key]) {
                    this.popups[key] = new Popup();
                    this.scene?.addMarker(this.markers[key]);
                }
                this.popups[key].setOptions({
                    title: value.vehicle?.label ?? "Vehicle label not found",
                    html: `<p>Vehicle ID: ${value.vehicle?.id}</p><p>Trip ID: ${value.trip?.tripId}</p><p>Speed: ${value.position.speed}</p>`,
                });
                this.markers[key].setPopup(this.popups[key]);
            }
        });
    }
}
