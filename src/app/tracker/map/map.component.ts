import { Subscription } from "rxjs";
import { environment } from "src/environments/environment";

import { Component, OnDestroy, OnInit } from "@angular/core";
import {
    ILayer,
    IMarker,
    LineLayer,
    Mapbox,
    Marker,
    MarkerLayer,
    PointLayer,
    Popup,
    Scene,
} from "@antv/l7";

import { GetGeojsonService } from "../services/get-geojson.service";
import { GtfsStateService } from "../services/gtfs-state.service";
import { IFeedEntity, IPopupWithProps } from "../types";

class RtLayer {
    scene: Scene;
    $feedEntity: Subscription;

    markerLayer = new MarkerLayer();
    markers: { [key: string]: IMarker } = {};
    popups: { [key: string]: IPopupWithProps } = {};

    constructor(
        scene: Scene,
        sceneKey: string,
        private gtfsStateService: GtfsStateService
    ) {
        this.scene = scene;
        this.scene.addMarkerLayer(this.markerLayer);
        this.$feedEntity = this.gtfsStateService.sources[
            sceneKey
        ].feedEntities.subscribe((val) => {
            this.processGtfs(val);
        });
    }

    processGtfs(gtfsData: IFeedEntity) {
        Object.entries(gtfsData).forEach(([key, value]) => {
            if (value?.position) {
                const data = {
                    lng: value.position.longitude,
                    lat: value.position.latitude,
                };
                if (!this.markers[key]) {
                    this.markers[key] = new Marker().setLnglat(data);
                    this.markerLayer.addMarker(this.markers[key]);
                    // this.scene?.addMarker(this.markers[key]);
                }
                this.markers[key].setLnglat(data);

                let currPopup = this.popups[key];
                if (!currPopup) {
                    currPopup = {
                        instance: new Popup({
                            anchor: "top",
                        }),
                        isClosed: true,
                    };
                    this.markers[key].setPopup(currPopup.instance);

                    currPopup.instance.on("hide", () => {
                        currPopup.isClosed = true;
                    });

                    currPopup.instance.on("show", () => {
                        currPopup.isClosed = false;
                    });
                }
                currPopup.instance.setOptions({
                    title: value.vehicle?.label ?? "Vehicle label not found",
                    html: `<p>Vehicle ID: ${value.vehicle?.id}</p><p>Trip ID: ${value.trip?.tripId}</p><p>Speed: ${value.position.speed}</p>`,
                });

                if (currPopup.isClosed) {
                    currPopup.instance.close();
                } else {
                    currPopup.instance.open();
                }
            }
        });
        this.scene.render();
    }

    tearDown() {
        this.$feedEntity.unsubscribe();
        this.scene.removeMarkerLayer(this.markerLayer);
    }
}

@Component({
    selector: "tracker-map",
    standalone: true,
    imports: [],
    templateUrl: "./map.component.html",
    styleUrl: "./map.component.scss",
})
export class TrackerMapComponent implements OnInit, OnDestroy {
    rtLayers: { [key: string]: RtLayer } = {};

    /**
     * Map stuff
     */
    scene: Scene | undefined = undefined;
    pointLayer: PointLayer | undefined = undefined;
    lineLayer: ILayer | undefined = undefined;

    constructor(
        private getGeojsonService: GetGeojsonService,
        private gtfsStateService: GtfsStateService
    ) {}

    async ngOnInit() {
        document.documentElement.style.overflow = "hidden";

        this.scene = new Scene({
            id: "map",
            map: new Mapbox({
                style: "normal",
                center: [101.492, 4.5],
                zoom: 6.5,
                token: environment.mapbox.token,
            }),
        });

        this.gtfsStateService.$deletedFeed.subscribe((val) => {
            console.log("Deleted: ", val);
            this.rtLayers[val].tearDown();
            delete this.rtLayers[val];
        });

        this.gtfsStateService.$addedFeed.subscribe((key) => {
            console.log("Added: ", key);
            this.rtLayers[key] = new RtLayer(
                this.scene as Scene,
                key,
                this.gtfsStateService
            );
        });

        this.scene.addImage(
            "marker",
            "https://gw.alipayobjects.com/mdn/antv_site/afts/img/A*BJ6cTpDcuLcAAAAAAAAAAABkARQnAQ"
        );
        this.scene.addImage(
            "arrow",
            "https://gw.alipayobjects.com/zos/bmw-prod/ce83fc30-701f-415b-9750-4b146f4b3dd6.svg"
        );

        this.pointLayer = new PointLayer().shape("marker").size(12);
        this.scene.addLayer(this.pointLayer);

        this.getGeojsonService
            .getData(
                "gs://rosak-7223b.appspot.com/public/malaysia_railway.geo.zip",
                "malaysia_railway.geo.json"
            )
            .then((data) => {
                this.lineLayer = new LineLayer({})
                    .source(data)
                    .size(3)
                    .shape("line")
                    .texture("arrow")
                    .color("rgb(22,119,255)")
                    .animate({
                        interval: 1, // 间隔
                        duration: 1, // 持续时间，延时
                        trailLength: 2, // 流线长度
                    })
                    .style({
                        opacity: 0.6,
                        lineTexture: true, // 开启线的贴图功能
                        iconStep: 10, // 设置贴图纹理的间距
                        borderWidth: 0.4, // 默认文 0，最大有效值为 0.5
                        borderColor: "#fff", // 默认为 #ccc
                    });
                this.scene?.addLayer(this.lineLayer);
            });
    }

    ngOnDestroy(): void {
        document.documentElement.style.overflow = "auto";
        Object.keys(this.rtLayers).forEach((key) => {
            this.rtLayers[key].tearDown();
        });
    }
}
