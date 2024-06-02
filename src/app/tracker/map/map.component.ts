import { environment } from "src/environments/environment";

import {
    Component,
    Input,
    OnChanges,
    OnDestroy,
    OnInit,
    SimpleChanges,
} from "@angular/core";
import {
    ILayer,
    IMarker,
    IPopup,
    LineLayer,
    Marker,
    MarkerLayer,
    PointLayer,
    Popup,
    Scene,
} from "@antv/l7";
import { Mapbox } from "@antv/l7-maps";

import { GetGeojsonService } from "../services/get-geojson.service";
import { IFeedEntity } from "../types";

@Component({
    selector: "tracker-map",
    standalone: true,
    imports: [],
    templateUrl: "./map.component.html",
    styleUrl: "./map.component.scss",
})
export class TrackerMapComponent implements OnInit, OnChanges, OnDestroy {
    @Input() feedEntities!: IFeedEntity;

    /**
     * Map stuff
     */
    scene: Scene | undefined = undefined;
    pointLayer: PointLayer | undefined = undefined;
    lineLayer: ILayer | undefined = undefined;

    markerLayer: MarkerLayer | undefined = undefined;
    markers: { [key: string]: IMarker } = {};
    popups: { [key: string]: IPopup } = {};

    constructor(private getGeojsonService: GetGeojsonService) {}

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

    ngOnChanges(changes: SimpleChanges): void {
        const currVal: IFeedEntity = changes["feedEntities"].currentValue;

        Object.entries(currVal).forEach(([key, value]) => {
            if (value?.position) {
                const data = {
                    lng: value.position.longitude,
                    lat: value.position.latitude,
                };
                if (!this.markers[key]) {
                    this.markers[key] = new Marker().setLnglat(data);
                    this.scene?.addMarker(this.markers[key]);
                    // this.markerLayer.addMarker(this.markers[key]);
                }
                this.markers[key].setLnglat(data);

                if (!this.popups[key]) {
                    this.popups[key] = new Popup({
                        anchor: "top",
                    });
                    this.markers[key].setPopup(this.popups[key]);
                    // this.scene?.addPopup(this.popups[key]);
                }
                this.popups[key].setOptions({
                    title: value.vehicle?.label ?? "Vehicle label not found",
                    html: `<p>Vehicle ID: ${value.vehicle?.id}</p><p>Trip ID: ${value.trip?.tripId}</p><p>Speed: ${value.position.speed}</p>`,
                });
                this.popups[key].on("close", (val) => {
                    console.log(val);
                });
                this.markers[key].setPopup(this.popups[key]);
            }
        });
    }

    ngOnDestroy(): void {
        document.documentElement.style.overflow = "auto";
    }
}
