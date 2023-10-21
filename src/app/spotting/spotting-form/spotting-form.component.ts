import { Apollo, gql, MutationResult } from "apollo-angular";
import { DFormControlStatus, FormLayout } from "ng-devui/form";
import { LoadingType } from "ng-devui/loading";
import { AppendToBodyDirection } from "ng-devui/utils";
// import { ReCaptchaV3Service } from "ng-recaptcha";
import { NzDrawerRef } from "ng-zorro-antd/drawer";
import { lastValueFrom, Observable, of, Subscription } from "rxjs";
import {
    VehicleStatus,
} from "src/app/pipes/vehicle-status/vehicle-status-pipe.pipe";
import { AuthService } from "src/app/services/auth/auth.service";
import {
    SessionHistoryService,
} from "src/app/services/session-history/session-history.service";
import {
    SpottingStorageService,
} from "src/app/services/spotting/storage.service";
import { ToastService } from "src/app/services/toast/toast.service";

import { Component, OnDestroy, OnInit } from "@angular/core";
import {
    UntypedFormBuilder,
    UntypedFormControl,
    UntypedFormGroup,
    Validators,
} from "@angular/forms";

import {
    ImageFile,
} from "../../@ui/spotting/form-upload/form-upload.component";
import {
    GetLinesAndVehiclesGqlService,
} from "../services/get-lines-vehicles-gql.service";
import {
    GetStationLinesGqlService,
} from "../services/get-station-lines-gql.service";
import {
    lineQueryResultToOptions,
    lineQueryResultToStationCascaderOptions,
    lineQueryResultToVehicleCascaderOptions,
} from "../utils";
import { VehicleFormOption } from "./spotting-form.types";
import {
    abnormalStatusSanityTestValidator,
    allowRunNumber,
    atStationTypeStationValidator,
    betweenStationTypeOriginDestinationStationValidator,
    numberSeenToSetNumbers,
} from "./spotting-form.utils";

const ADD_ENTRY = gql`
    mutation AddSpottingEntry($data: EventInput!) {
        addEvent(input: $data) {
            id
        }
    }
`;

interface FormInputType {
    name: string;
    value: string;
}

interface VehicleFormInputType extends FormInputType {
    name: string;
    value: string;
    status: VehicleStatus;
}

export interface SpottingFormReturnType {
    uploads: ImageFile[];
    spottingSubmission: Promise<MutationResult<any> | undefined>;
}

@Component({
    selector: "app-spotting-form",
    templateUrl: "./spotting-form.component.html",
    styleUrls: ["./spotting-form.component.scss"],
})
export class SpottingFormComponent implements OnInit, OnDestroy {
    layoutDirection: FormLayout = FormLayout.Horizontal;
    appendToBodyDirections: AppendToBodyDirection[] = [
        "rightDown",
        "centerDown",
    ];
    submitButtonClicked: boolean = false;
    showedLocationPopout: boolean = false;
    showRunNumberInput: boolean = false;
    submitting: LoadingType = Promise.resolve("false");

    statusOptions = [
        { name: "In Service", value: "IN_SERVICE" },
        { name: "Not in Service", value: "NOT_IN_SERVICE" },
        { name: "Decommissioned", value: "DECOMMISSIONED" },
        { name: "Testing", value: "TESTING" },
    ];

    typeOptions = [
        {
            name: "Depot",
            value: "DEPOT",
        },
        {
            name: "Location",
            value: "LOCATION",
        },
        {
            name: "Between Stations",
            value: "BETWEEN_STATIONS",
        },
        {
            name: "Just Spotting",
            value: "JUST_SPOTTING",
        },
        {
            name: "At Station",
            value: "AT_STATION",
        },
    ];

    stationOptions: { name: any; value: any; disabled?: boolean }[] = [];
    vehicleOptions: VehicleFormOption[] = [];
    lineOptions: { name: any; value: any; disabled?: boolean }[] = [];

    loading: { [key: string]: boolean } = {
        originStation: true,
        destinationStation: true,
        atStation: true,
        vehicle: true,
        line: true,
    };

    vehicleSearchFn = (
        term: string
    ): Observable<{ id: string | number; option: any }[]> => {
        const setNumber = numberSeenToSetNumbers(
            term,
            this.formGroup.value.line?.value
        );

        return of(
            (this.vehicleOptions ?? [])
                .map((option, index) => ({ id: index, option: option }))
                .filter((item) => {
                    if (!term.length || !this.formGroup.value.line) {
                        return true;
                    }

                    return (
                        setNumber.some((val) => {
                            return (
                                item.option.name.toUpperCase().indexOf(val) !==
                                -1
                            );
                        }) ||
                        item.option.name
                            .toUpperCase()
                            .indexOf(term.toUpperCase()) !== -1
                    );
                })
        );
    };

    getStatus(fieldName: string): DFormControlStatus | null {
        if (this.loading[fieldName]) {
            return "pending";
        } else if (this.formGroup.controls[fieldName].valid) {
            const formGroupErrors = this.formGroup.errors;

            if (
                formGroupErrors &&
                Object.keys(formGroupErrors).includes(fieldName)
            ) {
                if (this.submitButtonClicked) {
                    return "error";
                } else {
                    return null;
                }
            } else {
                return "success";
            }
        } else if (!this.submitButtonClicked) {
            return null;
        } else {
            return "error";
        }
    }

    /**
     * Form stuff
     */
    formGroup: UntypedFormGroup;
    selectedDate1 = new Date();
    queryResult = {};
    stationResult = {};
    showVehicleWarning = false;

    isShowBetweenStationsModeSelectedBeforeLineSelectionError = false;

    private mainQuerySubscription!: Subscription;
    private stationQuerySubscription!: Subscription;

    constructor(
        private fb: UntypedFormBuilder,
        private apollo: Apollo,
        private getLinesVehiclesGql: GetLinesAndVehiclesGqlService,
        private getStationLinesGql: GetStationLinesGqlService,
        public authService: AuthService,
        // private recaptchaV3Service: ReCaptchaV3Service,
        private toastService: ToastService,
        private drawerRef: NzDrawerRef<SpottingFormReturnType>,
        public sessionHistoryService: SessionHistoryService,
        private spottingStorageService: SpottingStorageService
    ) {
        const line = spottingStorageService.getLine();
        const type = spottingStorageService.getType();
        const atStationStation = spottingStorageService.getAtStationStation();

        console.log(this.sessionHistoryService.historyStore.value);

        this.formGroup = this.fb.group(
            {
                line: new UntypedFormControl(line, [Validators.required]),
                vehicle: new UntypedFormControl("", [Validators.required]),
                spottingDate: new UntypedFormControl(new Date(), [
                    Validators.required,
                ]),
                status: new UntypedFormControl(
                    {
                        name: "In Service",
                        value: "IN_SERVICE",
                    },
                    [Validators.required]
                ),
                type: new UntypedFormControl(type, [Validators.required]),
                atStation: new UntypedFormControl(atStationStation, []),
                originStation: new UntypedFormControl("", []),
                destinationStation: new UntypedFormControl("", []),
                notes: new UntypedFormControl("", []),
                runNumber: new UntypedFormControl(undefined, []),
                isAnonymous: new UntypedFormControl(false, []),
                sanityTest: new UntypedFormControl(false, []),
                location: new UntypedFormControl(false, []),
                uploads: new UntypedFormControl({}, []),
            },
            {
                validators: [
                    betweenStationTypeOriginDestinationStationValidator,
                    abnormalStatusSanityTestValidator,
                    atStationTypeStationValidator,
                ],
            }
        );

        this.mainQuerySubscription = this.getLinesVehiclesGql
            .watch()
            .valueChanges.subscribe(({ data, loading }) => {
                console.log("Query loading: ", loading);
                console.log("Query data: ", data);

                this.queryResult = data;

                this.loading["line"] = loading;
                this.lineOptions = lineQueryResultToOptions(data);

                this.loading["vehicle"] = loading;
                this.vehicleOptions =
                    lineQueryResultToVehicleCascaderOptions(data);

                if (line) {
                    this.onLineChanges(line);
                }
            });
    }

    ngOnInit(): void {
        return;
    }

    ngOnDestroy() {
        this.mainQuerySubscription.unsubscribe();
        this.stationQuerySubscription?.unsubscribe();
    }

    onChanges(event: FormInputType): void {
        console.log("On changes: ", event);
    }

    onVehicleChanges(event: VehicleFormInputType): void {
        // When adding vehicle status here, remember to edit validators too
        if (
            ["DECOMMISSIONED", "MARRIED", "OUT_OF_SERVICE", "UNKNOWN"].includes(
                event.status
            )
        ) {
            this.showVehicleWarning = true;
        } else {
            this.showVehicleWarning = false;
        }
    }

    onInputTypeChanges() {
        if (
            ["BETWEEN_STATIONS", "AT_STATION"].includes(
                this.formGroup.value.type.value
            )
        ) {
            if (!this.formGroup.value.line) {
                this.formGroup.patchValue({
                    type: {
                        name: "Just Spotting",
                        value: "JUST_SPOTTING",
                    },
                });

                this.isShowBetweenStationsModeSelectedBeforeLineSelectionError =
                    true;

                return;
            }

            this.loading["originStation"] = true;
            this.loading["destinationStation"] = true;
            this.loading["atStation"] = true;

            this.stationQuerySubscription = this.getStationLinesGql
                .watch({
                    stationLineFilter: {
                        lineId: this.formGroup.value.line.value,
                    },
                })
                .valueChanges.subscribe(({ data, loading }) => {
                    console.log("Query loading: ", loading);
                    console.log("Query data: ", data);

                    this.stationResult = data;

                    this.loading["originStation"] = loading;
                    this.loading["destinationStation"] = loading;
                    this.loading["atStation"] = loading;

                    this.stationOptions =
                        lineQueryResultToStationCascaderOptions(data);

                    const atStationStation =
                        this.spottingStorageService.getAtStationStation();
                    if (
                        atStationStation &&
                        this.spottingStorageService.getLine()?.value ==
                            this.formGroup.value.line.value
                    ) {
                        this.formGroup.patchValue({
                            atStation: atStationStation,
                        });
                    }
                });
        } else if (this.formGroup.value.type.value === "LOCATION") {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    if (!this.showedLocationPopout) {
                        this.toastService.addMessage(
                            "Location accessed. Take note that we will not know your location until you submit the form.",
                            "info"
                        );
                        this.showedLocationPopout = true;
                    }
                    console.log(position);

                    this.formGroup.patchValue({
                        location: {
                            accuracy: position.coords.accuracy,
                            altitude: position.coords.altitude,
                            altitudeAccuracy: position.coords.altitudeAccuracy,
                            heading: position.coords.heading,
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            speed: position.coords.speed,
                        },
                    });
                    console.log(this.formGroup.value);
                },
                (positionError) => {
                    this.toastService.addToast(
                        "Location access failed",
                        positionError.message,
                        "error"
                    );
                },
                { maximumAge: 0, timeout: Infinity, enableHighAccuracy: true }
            );
            return;
        }
        this.showedLocationPopout = false;
    }

    onNewImage(images: { [key: string]: ImageFile }) {
        this.formGroup.patchValue({
            uploads: images,
        });
    }

    onLineChanges(event: FormInputType): void {
        console.log(event);

        this.isShowBetweenStationsModeSelectedBeforeLineSelectionError = false;

        this.vehicleOptions = lineQueryResultToVehicleCascaderOptions(
            this.queryResult,
            (event as any).value
        );

        this.stationOptions = [];

        this.onInputTypeChanges();
        this.showRunNumberInput = allowRunNumber(event.value);

        this.formGroup.patchValue({
            vehicle: "",
            originStation: "",
            destinationStation: "",
            runNumber: undefined,
            atStation: "",
        });

        return;
    }

    onSubmit():
        | Promise<{
              spottingSubmission: Promise<MutationResult<any> | undefined>;
              uploads: ImageFile[];
              formData: any;
          }>
        | undefined {
        console.log(this.formGroup.value);
        this.submitButtonClicked = true;

        if (this.formGroup.invalid) {
            this.toastService.addToast("Error", "Form is invalid.", "error");

            return undefined;
        }
        if (!this.authService.isLoggedIn()) {
            this.toastService.addToast(
                "Error",
                "Please log in or wait for authentication to complete before proceeding.",
                "error"
            );

            return undefined;
        }

        const formValues = { ...this.formGroup.value };

        if (formValues.type.value !== "LOCATION") {
            formValues["location"] = undefined;
        } else {
            if (!formValues["location"]) {
                this.toastService.addMessage(
                    "Error: Location has not been loaded.",
                    "error"
                );

                return undefined;
            }
        }

        // Form Distillation
        if (formValues.type.value === "BETWEEN_STATIONS") {
            formValues["originStation"] = formValues["originStation"].value;
            formValues["destinationStation"] =
                formValues["destinationStation"].value;
        } else if (formValues.type.value === "AT_STATION") {
            this.spottingStorageService.setAtStationStation({
                ...formValues["atStation"],
            });

            formValues["originStation"] = formValues["atStation"].value;
            formValues["destinationStation"] = undefined;
            formValues["atStation"] = undefined;
        } else {
            formValues["originStation"] = undefined;
            formValues["destinationStation"] = undefined;
        }

        formValues["atStation"] = undefined;

        if (!allowRunNumber(formValues["line"].value)) {
            formValues["runNumber"] = undefined;
        }

        const spottingDate: Date = formValues["spottingDate"];
        formValues["spottingDate"] = new Date(
            spottingDate.getTime() -
                spottingDate.getTimezoneOffset() * 60 * 1000
        )
            .toISOString()
            .slice(0, 10);

        formValues["vehicle"] = formValues["vehicle"].value;
        formValues["status"] = formValues["status"].value;

        this.spottingStorageService.setType(formValues["type"]);
        formValues["type"] = formValues["type"].value;

        this.spottingStorageService.setLine(formValues["line"]);

        const uploads: ImageFile[] = Object.values<ImageFile>(
            formValues["uploads"]
        ).filter((val) => {
            return val != null;
        });

        // Removing fields not required by GQL
        formValues["line"] = undefined;
        formValues["sanityTest"] = undefined;
        formValues["uploads"] = undefined;

        console.log(formValues);

        // TODO: If captchaResponse and/or firebaseAuthKey cannot be determined, show an error message
        return Promise.all([
            // firstValueFrom(this.recaptchaV3Service.execute("spottingEntry")),
            this.authService.getIdToken(),
        ]).then(
            ([
                // captchaResponse,
                firebaseAuthKey,
            ]) => {
                const mutationObservable = this.apollo.mutate({
                    mutation: ADD_ENTRY,
                    variables: {
                        data: formValues,
                    },
                    context: {
                        headers: {
                            // "g-recaptcha-response": captchaResponse,
                            "firebase-auth-key": firebaseAuthKey,
                        },
                    },
                });

                this.submitting = lastValueFrom(mutationObservable);

                return {
                    uploads,
                    spottingSubmission: this.submitting,
                    formData: { ...this.formGroup.value },
                };
            }
        );
    }
}
