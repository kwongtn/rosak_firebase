import { NzMarks } from "ng-zorro-antd/slider";
import { Subscription } from "rxjs";
import { environment } from "src/environments/environment";

import { Component, OnInit } from "@angular/core";
import {
    ILayer,
    LineLayer,
    MapTheme,
    PointLayer,
    Scale,
    Scene,
    Zoom,
} from "@antv/l7";
import { Mapbox } from "@antv/l7-maps";

import { GetLocationService } from "../services/get-location.service";
import { FAKE_DATA, FAKE_DATA2 as DATA2 } from "./data";
import { convertLocalTime, getLocaleDatetimeFormat } from "./utils";

@Component({
    selector: "jejak-main",
    templateUrl: "./main.component.html",
    styleUrls: ["./main.component.scss"],
})
export class JejakMainComponent implements OnInit {
    scene: Scene | undefined = undefined;
    locationGqlSubscription!: Subscription;
    sliderLength: number = 0;

    sliderValue = 0;

    marks: NzMarks = {};

    lineLayer: ILayer | undefined = undefined;
    pointLayer: ILayer | undefined = undefined;

    counter: number = 0;

    constructor(private getLocationService: GetLocationService) {
        return;
    }

    setSliderList(data: Array<any>): void {
        const returnObj: any = {};
        // const increment: number = Math.ceil(data.length / 10);

        // Change this to variable length in future
        returnObj[0] = {
            style: {
                "text-align": "left",
            },
            label: getLocaleDatetimeFormat(convertLocalTime(data[0].dtGps)),
        };
        returnObj[Math.ceil(data.length / 2)] = {
            style: {
                "text-align": "center",
            },
            label: getLocaleDatetimeFormat(
                convertLocalTime(data[Math.ceil(data.length / 2)].dtGps)
            ),
        };
        returnObj[data.length - 1] = {
            style: {
                "text-align": "right",
                "white-space": "nowrap",
            },
            label: getLocaleDatetimeFormat(
                convertLocalTime(data[data.length - 1].dtGps)
            ),
        };

        this.marks = returnObj;
    }

    ngOnInit(): void {
        this.scene = new Scene({
            id: "map",
            map: new Mapbox({
                style: "normal",
                center: [102.473246, 3.7310673],
                pitch: 0,
                zoom: 8.06,
                token: environment.mapbox.token,
            }),
        });

        const zoom = new Zoom();
        this.scene.addControl(zoom);
        const scale = new Scale();
        this.scene.addControl(scale);
        const mapTheme = new MapTheme();
        this.scene.addControl(mapTheme);

        // this.getLocationService
        //     .watch({
        //         filters: {
        //             busId: 33,
        //             dateReceived: "2022-05-01",
        //         },
        //         pagination: {
        //             limit: 50000,
        //         },
        //     })
        //     .valueChanges.subscribe(({ data, loading }) => {
        this.pointLayer = new PointLayer({}).size(10).color("#080298");
        this.scene.addLayer(this.pointLayer);
        this.pointLayer?.setData([FAKE_DATA.locations[0].location], {
            parser: {
                x: "0",
                y: "1",
                type: "json",
            },
        });

        this.setSliderList(FAKE_DATA.locations);

        this.sliderLength = FAKE_DATA.locations.length;

        this.lineLayer = new LineLayer({})
            .size(3)
            .shape("line")
            .texture("arrow")
            .color("rgb(22,119,255)")
            .animate({
                interval: 1, // 间隔
                duration: 30, // 持续时间，延时
                trailLength: 2, // 流线长度
                enable: true,
            })
            .style({
                opacity: 0.6,
                lineTexture: true, // 开启线的贴图功能
                iconStep: 10, // 设置贴图纹理的间距
                borderWidth: 0.4, // 默认文 0，最大有效值为 0.5
                borderColor: "#fff", // 默认为 #ccc
            });

        this.scene.addLayer(this.lineLayer);
        this.lineLayer?.setData({
            type: "FeatureCollection",
            name: "dl2",
            crs: {
                type: "name",
                properties: {
                    name: "urn:ogc:def:crs:OGC:1.3:CRS84",
                },
            },
            features: [
                {
                    type: "Feature",
                    properties: {},
                    geometry: {
                        type: "MultiLineString",
                        coordinates: [
                            DATA2.locations.map((val) => {
                                return val.location;
                            }),
                        ],
                    },
                },
            ],
        });
        // lineLayer.source();
        // });
    }

    onSliderChange($event: any) {
        this.pointLayer?.setData([FAKE_DATA.locations[$event].location], {
            parser: {
                x: "0",
                y: "1",
                type: "json",
            },
        });
    }

    sliderDataformatter(value: number): string {
        return getLocaleDatetimeFormat(
            convertLocalTime(`${FAKE_DATA.locations[value].dtGps}`)
        );
    }
}
