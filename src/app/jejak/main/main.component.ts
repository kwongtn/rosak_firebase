import { NzMarks } from "ng-zorro-antd/slider";
import { Subscription } from "rxjs";
import { environment } from "src/environments/environment";

import { ChangeDetectorRef, Component, OnDestroy, OnInit } from "@angular/core";
import {
    UntypedFormBuilder,
    UntypedFormControl,
    UntypedFormGroup,
    Validators,
} from "@angular/forms";
import { ILayer, MapTheme, PointLayer, Scale, Scene, Zoom } from "@antv/l7";
import { Mapbox } from "@antv/l7-maps";

import { GetBusesService } from "../services/get-buses.service";
import {
    GetLocationService,
    LocationData,
} from "../services/get-location.service";
import { convertLocalTime, getLocaleDatetimeFormat } from "./utils";

@Component({
    selector: "jejak-main",
    templateUrl: "./main.component.html",
    styleUrls: ["./main.component.scss"],
})
export class JejakMainComponent implements OnInit, OnDestroy {
    /**
     * Form stuff
     */
    formGroup: UntypedFormGroup;

    scene: Scene | undefined = undefined;
    locationGqlSubscription!: Subscription;
    sliderLength: number = 0;

    sliderValue = 1;
    showLoading = true;

    loading: { [key: string]: boolean } = {
        busNo: true,
    };

    busList: { [key: string]: string | number }[] = [];

    marks: NzMarks = {};
    currLocations: LocationData["locations"] = [];

    sliderDataformatter: ((value: number) => string) | null | undefined =
        undefined;

    lineLayer: ILayer | undefined = undefined;
    pointLayer: ILayer | undefined = undefined;

    constructor(
        private getLocationService: GetLocationService,
        private getBusesService: GetBusesService,
        private fb: UntypedFormBuilder,
        public cd: ChangeDetectorRef
    ) {
        this.formGroup = this.fb.group(
            {
                busId: new UntypedFormControl("", [Validators.required]),
                dateRange: new UntypedFormControl([], [Validators.required]),
            },
            {}
        );
        this.getBusesService
            .watch()
            .valueChanges.subscribe(({ data, loading }) => {
                this.loading["busNo"] = loading;

                this.busList = data.buses.map((bus) => {
                    return {
                        value: bus.id,
                        label: bus.identifier,
                    };
                });
            });
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

        this.locationGqlSubscription = this.getLocationService
            .watch({
                filters: {
                    busId: 33,
                    dtReceivedRange: [
                        "2022-05-01 00:00:00",
                        "2022-05-02 00:00:00",
                    ],
                },
                order: {
                    dtGps: "ASC",
                },
                pagination: {
                    limit: 50000,
                },
            })
            .valueChanges.subscribe(({ data, loading }) => {
                this.currLocations = [...data.locations];
                if (loading) {
                    this.sliderDataformatter = undefined;
                    this.showLoading = loading;
                    return;
                }

                this.pointLayer = new PointLayer({}).size(10).color("#080298");
                this.scene?.addLayer(this.pointLayer);
                this.pointLayer?.setData([this.currLocations[0].location], {
                    parser: {
                        x: "0",
                        y: "1",
                        type: "json",
                    },
                });

                this.setSliderList(this.currLocations);
                this.sliderLength = this.currLocations.length;

                this.sliderDataformatter = (value: number): string => {
                    return getLocaleDatetimeFormat(
                        convertLocalTime(`${data.locations[value].dtGps}`)
                    );
                };

                this.showLoading = loading;
            });
    }

    onSliderChange($event: any) {
        this.pointLayer?.setData([this.currLocations[$event].location], {
            parser: {
                x: "0",
                y: "1",
                type: "json",
            },
        });
    }

    onClickSearch() {
        console.log(this.formGroup.value);
    }

    ngOnDestroy(): void {
        this.locationGqlSubscription?.unsubscribe();
    }
}
