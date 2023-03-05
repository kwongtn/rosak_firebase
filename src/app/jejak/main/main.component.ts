import { NzStatus } from "ng-zorro-antd/core/types";
import { NzMarks } from "ng-zorro-antd/slider";
import { Subscription } from "rxjs";
import { ToastService } from "src/app/services/toast/toast.service";
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
import { ApolloQueryResult } from "@apollo/client";

import { GetBusesService } from "../services/get-buses.service";
import {
    GetLocationTotalRowsService,
} from "../services/get-location-total-rows.service";
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
    busList: { [key: string]: string | number }[] = [];
    formSubmitted: boolean = false;
    estimatedCount: number = -1;
    haveEstimated: boolean = false;
    actionButtonClicked: boolean = false;

    /**
     * Slider stuff
     */
    sliderLength: number = 0;
    sliderValue: number = 0;
    sliderDataformatter: ((value: number) => string) | null | undefined =
        undefined;

    /**
     * Map stuff
     */
    scene: Scene | undefined = undefined;
    pointLayer: ILayer | undefined = undefined;
    currLocations: LocationData["locations"] = [];
    marks: NzMarks = {};

    locationGqlSubscription!: Subscription;
    locationTotalRowsGqlSubscription!: Subscription;

    loading: { [key: string]: boolean } = {
        busNo: true,
        count: false,
        results: false,
    };

    constructor(
        private getLocationService: GetLocationService,
        private getBusesService: GetBusesService,
        private getLocationTotalRowsService: GetLocationTotalRowsService,
        private toastService: ToastService,
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
                "padding-left": "65px",
            },
            label: getLocaleDatetimeFormat(
                convertLocalTime(data[0].dtGps),
                "<br>"
            ),
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
                "padding-right": "65px",
            },
            label: getLocaleDatetimeFormat(
                convertLocalTime(data[data.length - 1].dtGps),
                "<br>"
            ),
        };

        this.marks = returnObj;
    }

    onFormValueChange() {
        this.haveEstimated = false;
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

        this.pointLayer = new PointLayer({}).size(10).color("#080298");
        this.scene?.addLayer(this.pointLayer as ILayer);
    }

    processGqlLocationResult(value: ApolloQueryResult<LocationData>) {
        const data = value.data;
        const loading = value.loading;

        this.currLocations = data.locations;
        this.sliderValue = 0;
        if (loading || this.currLocations.length === 0) {
            this.sliderDataformatter = undefined;
            this.loading["results"] = loading;
            return;
        }

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

        this.loading["results"] = loading;
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

    getStatus(fieldName: string): NzStatus {
        if (this.loading[fieldName]) {
            return "";
        } else if (this.formGroup.controls[fieldName].valid) {
            const formGroupErrors = this.formGroup.errors;

            if (
                formGroupErrors &&
                Object.keys(formGroupErrors).includes(fieldName)
            ) {
                if (this.actionButtonClicked) {
                    return "error";
                } else {
                    return "";
                }
            } else {
                return "";
            }
        } else if (!this.actionButtonClicked) {
            return "";
        } else {
            return "error";
        }
    }

    onClickCount() {
        this.actionButtonClicked = true;
        if (this.formGroup.invalid) {
            this.toastService.addToast("Error", "Form is invalid.", "error");
            return;
        }

        this.loading["count"] = true;
        this.formSubmitted = true;
        const formValues = { ...this.formGroup.value };

        this.locationTotalRowsGqlSubscription = this.getLocationTotalRowsService
            .watch({
                filters: {
                    busId: formValues["busId"],
                    dtGpsRange: [
                        convertLocalTime(formValues["dateRange"][0]),
                        convertLocalTime(formValues["dateRange"][1]),
                    ],
                },
            })
            .valueChanges.subscribe(({ data, loading }) => {
                this.loading["count"] = loading;

                if (!loading) {
                    this.estimatedCount = data.locationsCount;
                }
                this.haveEstimated = true;
            });
    }

    onClickSearch() {
        this.actionButtonClicked = true;
        if (this.formGroup.invalid) {
            this.toastService.addToast("Error", "Form is invalid.", "error");
            return;
        }

        this.loading["results"] = true;
        this.formSubmitted = true;
        const formValues = { ...this.formGroup.value };

        console.log(formValues);

        this.locationGqlSubscription = this.getLocationService
            .watch({
                filters: {
                    busId: formValues["busId"],
                    dtGpsRange: [
                        convertLocalTime(formValues["dateRange"][0]),
                        convertLocalTime(formValues["dateRange"][1]),
                    ],
                },
                order: {
                    dtGps: "ASC",
                },
            })
            .valueChanges.subscribe((result) => {
                this.processGqlLocationResult(result);
            });
    }

    ngOnDestroy(): void {
        this.locationGqlSubscription?.unsubscribe();
    }
}
