import { Apollo, gql, MutationResult } from "apollo-angular";
import { LoadingType } from "ng-devui/loading";
import { AppendToBodyDirection } from "ng-devui/utils";
// import { ReCaptchaV3Service } from "ng-recaptcha";
import { NzDrawerRef } from "ng-zorro-antd/drawer";
import { NzSelectItemInterface } from "ng-zorro-antd/select";
import { firstValueFrom, lastValueFrom } from "rxjs";
import { GetLinesAndVehiclesResponse } from "src/app/models/query/get-vehicles";
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
    FormControl,
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
import { VehicleFormOptionWType } from "./spotting-form.types";
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
    appendToBodyDirections: AppendToBodyDirection[] = [
        "rightDown",
        "centerDown",
    ];
    submitButtonClicked: boolean = false;
    showedLocationPopout: boolean = false;
    showRunNumberInput: boolean = false;
    submitting: LoadingType = Promise.resolve("false");
    showLoading: boolean = false;

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

    wheelStatusOptions = [
        { name: "Fresh", value: "FRESH" },
        { name: "Near Perfect", value: "NEAR_PERFECT" },
        { name: "Flat", value: "FLAT" },
        { name: "Worn Out", value: "WORN_OUT" },
        { name: "Worrying", value: "WORRYING" },
    ];

    stationOptions: { name: any; value: any; disabled?: boolean }[] = [];
    vehicleOptions: VehicleFormOptionWType[] = [];
    lineOptions: { name: any; value: any; disabled?: boolean }[] = [];

    loading: { [key: string]: boolean } = {
        originStation: true,
        destinationStation: true,
        atStation: true,
        vehicle: true,
        line: true,
    };

    vehicleSearchFn = (
        input: string,
        option: NzSelectItemInterface
    ): boolean => {
        if (!input.length || !this.formGroup.value.line) {
            return true;
        }

        const labelUpperCase = String(option.nzLabel ?? "");
        const setNumbers = numberSeenToSetNumbers(
            input,
            this.formGroup.get("line")?.value
        );

        return (
            setNumbers.some((val) => {
                return labelUpperCase.indexOf(val) !== -1;
            }) || labelUpperCase.indexOf(input.toUpperCase()) !== -1
        );
    };

    getStatus(fieldName: string): string {
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
                    return "";
                }
            } else {
                return "success";
            }
        } else if (!this.submitButtonClicked) {
            return "";
        } else {
            return "error";
        }
    }

    hasStatus(fieldName: string): boolean {
        return Boolean(this.getStatus(fieldName));
    }

    /**
     * Form stuff
     */
    formGroup: UntypedFormGroup;
    queryResult!: GetLinesAndVehiclesResponse;
    stationResult = {};
    showVehicleWarning = false;

    isShowBetweenStationsModeSelectedBeforeLineSelectionError = false;

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
        const lineId = spottingStorageService.getLine();
        const type = spottingStorageService.getType();
        const atStationStation = spottingStorageService.getAtStationStation();

        console.debug(
            "History store: ",
            this.sessionHistoryService.historyStore.value
        );

        this.formGroup = this.fb.group(
            {
                line: new FormControl(lineId, [Validators.required]),
                vehicle: new FormControl(
                    { value: "", disabled: lineId ? false : true },
                    [Validators.required]
                ),
                spottingDate: new FormControl(new Date(), [
                    Validators.required,
                ]),
                status: new FormControl("IN_SERVICE", [Validators.required]),
                type: new FormControl(type, [Validators.required]),
                atStation: new UntypedFormControl(atStationStation, []),
                originStation: new FormControl("", []),
                wheelStatus: new FormControl(undefined, []),
                destinationStation: new FormControl("", []),
                notes: new FormControl("", []),
                runNumber: new FormControl(undefined, []),
                isAnonymous: new FormControl(false, []),
                sanityTest: new FormControl(false, []),
                location: new FormControl(false, []),
                uploads: new FormControl({}, []),
            },
            {
                validators: [
                    betweenStationTypeOriginDestinationStationValidator,
                    abnormalStatusSanityTestValidator,
                    atStationTypeStationValidator,
                ],
            }
        );

        firstValueFrom(this.getLinesVehiclesGql.fetch()).then(
            ({ data, loading }) => {
                console.log("Query loading: ", loading);
                console.log("Query data: ", data);

                this.queryResult = data;

                this.loading["line"] = loading;
                this.lineOptions = lineQueryResultToOptions(data);

                this.loading["vehicle"] = loading;
                this.vehicleOptions = lineQueryResultToVehicleCascaderOptions(
                    data,
                    lineId
                );

                if (lineId) {
                    if (type === "AT_STATION") {
                        this.onInputTypeChanged("AT_STATION");
                        this.formGroup.patchValue({
                            type: "AT_STATION",
                        });
                    } else if (type === "BETWEEN_STATIONS") {
                        this.onInputTypeChanged("BETWEEN_STATIONS");
                        this.formGroup.patchValue({
                            type: "BETWEEN_STATIONS",
                        });
                    }
                    
                    this.showRunNumberInput = allowRunNumber(lineId);
                }
            }
        );
    }

    ngOnInit(): void {
        return;
    }

    ngOnDestroy() {
        return;
    }

    onChanges(event: FormInputType): void {
        console.log("On changes: ", event);
    }

    onVehicleChanges(vehicle: VehicleFormInputType): void {
        console.debug("On vehicle changes: ", vehicle);

        // When adding vehicle status here, remember to edit validators too
        if (
            ["DECOMMISSIONED", "MARRIED", "OUT_OF_SERVICE", "UNKNOWN"].includes(
                vehicle.status
            )
        ) {
            this.showVehicleWarning = true;
        } else {
            this.showVehicleWarning = false;
        }
    }

    onInputTypeChanged(value: string) {
        if (["BETWEEN_STATIONS", "AT_STATION"].includes(value)) {
            if (!this.formGroup.value.line) {
                this.formGroup.patchValue({
                    type: "JUST_SPOTTING",
                });

                this.isShowBetweenStationsModeSelectedBeforeLineSelectionError =
                    true;

                return;
            }

            this.loading["originStation"] = true;
            this.loading["destinationStation"] = true;
            this.loading["atStation"] = true;
            firstValueFrom(
                this.getStationLinesGql.fetch({
                    stationLineFilter: {
                        lineId: this.formGroup.value.line,
                    },
                })
            ).then(({ data, loading }) => {
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
                    this.spottingStorageService.getLine() ==
                        this.formGroup.value.line
                ) {
                    this.formGroup.patchValue({
                        atStation: atStationStation,
                    });
                }
            });
        } else if (this.formGroup.value.type === "LOCATION") {
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
                    this.formGroup.patchValue({
                        type: "JUST_SPOTTING",
                    });
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

    onLineChanges(lineId: string): void {
        console.log(lineId);
        console.log(this.formGroup);

        this.isShowBetweenStationsModeSelectedBeforeLineSelectionError = false;

        this.vehicleOptions = lineQueryResultToVehicleCascaderOptions(
            this.queryResult,
            lineId
        );

        this.stationOptions = [];

        this.onInputTypeChanged("JUST_SPOTTING");
        this.showRunNumberInput = allowRunNumber(lineId);

        if (lineId) {
            this.formGroup.get("vehicle")?.enable();
        } else {
            this.formGroup.get("vehicle")?.disable();
        }

        this.formGroup.patchValue({
            vehicle: { value: "" },
            originStation: "",
            destinationStation: "",
            runNumber: undefined,
            atStation: "",
            type: "JUST_SPOTTING",
        });
    }

    toggleIsAnonymous() {
        this.formGroup.patchValue({
            isAnonymous: !this.formGroup.value.isAnonymous,
        });
    }

    toggleSanityTest() {
        this.formGroup.patchValue({
            sanityTest: !this.formGroup.value.sanityTest,
        });
    }

    onSubmit():
        | Promise<{
              spottingSubmission: Promise<MutationResult<any> | undefined>;
              uploads: ImageFile[];
              formData: any;
          }>
        | undefined {
        this.showLoading = true;
        console.log(this.formGroup.value);
        this.submitButtonClicked = true;

        if (this.formGroup.invalid) {
            this.toastService.addToast("Error", "Form is invalid.", "error");
            this.showLoading = false;

            return undefined;
        }
        if (!this.authService.isLoggedIn()) {
            this.toastService.addToast(
                "Error",
                "Please log in or wait for authentication to complete before proceeding.",
                "error"
            );
            this.showLoading = false;

            return undefined;
        }

        const formValues = { ...this.formGroup.value };

        if (formValues.type !== "LOCATION") {
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
        if (!["BETWEEN_STATIONS", "AT_STATION"].includes(formValues.type)) {
            formValues["originStation"] = undefined;
            formValues["destinationStation"] = undefined;
        } else if (formValues.type === "AT_STATION") {
            console.log(formValues["atStation"]);
            this.spottingStorageService.setAtStationStation(
                formValues["atStation"]
            );

            formValues["originStation"] = formValues["atStation"];
            formValues["destinationStation"] = undefined;
            formValues["atStation"] = undefined;
        }

        formValues["atStation"] = undefined;

        if (!allowRunNumber(formValues["line"])) {
            formValues["runNumber"] = undefined;
        }

        const spottingDate: Date = formValues["spottingDate"];
        formValues["spottingDate"] = new Date(
            spottingDate.getTime() -
                spottingDate.getTimezoneOffset() * 60 * 1000
        )
            .toISOString()
            .slice(0, 10);

        this.spottingStorageService.setType(formValues["type"]);
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

        formValues["vehicle"] = formValues["vehicle"].value;

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
                this.submitting.then(() => {
                    this.showLoading = false;
                });

                return {
                    uploads,
                    spottingSubmission: this.submitting,
                    formData: { ...this.formGroup.value },
                };
            }
        );
    }
}
