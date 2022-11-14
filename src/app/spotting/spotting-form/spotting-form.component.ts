import { Apollo, gql, MutationResult } from "apollo-angular";
import { DFormControlStatus, FormLayout } from "ng-devui/form";
import { LoadingType } from "ng-devui/loading";
import { AppendToBodyDirection } from "ng-devui/utils";
import { ReCaptchaV3Service } from "ng-recaptcha";
import {
    firstValueFrom,
    lastValueFrom,
    Observable,
    of,
    Subscription,
} from "rxjs";
import { VehicleStatus } from "src/app/models/query/get-vehicles";
import { AuthService } from "src/app/services/auth/auth.service";
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
    betweenStationTypeOriginDestinationStationValidator,
    numberSeenToSetNumber,
} from "./spotting-form.utils";

const ADD_ENTRY = gql`
    mutation AddSpottingEntry($data: EventInput!) {
        addEvent(input: $data) {
            ok
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
    submitting: LoadingType = Promise.resolve("false");

    statusOptions = [
        { name: "In Service", value: "IN_SERVICE" },
        { name: "Not Spotted", value: "NOT_SPOTTED" },
        { name: "Decommissioned", value: "DECOMMISSIONED" },
        { name: "Testing", value: "TESTING" },
        { name: "Unknown", value: "UNKNOWN", disabled: true },
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
    ];

    stationOptions: { name: any; value: any; disabled?: boolean }[] = [];
    vehicleOptions: VehicleFormOption[] = [];
    lineOptions: { name: any; value: any; disabled?: boolean }[] = [];

    loading: { [key: string]: boolean } = {
        originStation: true,
        destinationStation: true,
        vehicle: true,
        line: true,
    };

    vehicleSearchFn = (
        term: string
    ): Observable<{ id: string | number; option: any }[]> => {
        const setNumber = numberSeenToSetNumber(
            term,
            this.formGroup.value.line?.value
        );

        return of(
            (this.vehicleOptions ?? [])
                .map((option, index) => ({ id: index, option: option }))
                .filter((item) => {
                    if (!this.formGroup.value.line) {
                        return true;
                    }

                    if (
                        !isNaN(Number(term)) ||
                        ["C", "T", "M"].includes(term[0].toUpperCase())
                    ) {
                        return (
                            item.option.name
                                .toLowerCase()
                                .split(" (")[0]
                                .indexOf(term.toLowerCase()) !== -1 ||
                            item.option.name
                                .toLowerCase()
                                .indexOf(setNumber?.toLowerCase()) !== -1
                        );
                    } else {
                        return (
                            item.option.name
                                .toLowerCase()
                                .indexOf(term.toLowerCase()) !== -1
                        );
                    }
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
        private recaptchaV3Service: ReCaptchaV3Service,
        private spottingStorageService: SpottingStorageService,
        private toastService: ToastService
    ) {
        const line = spottingStorageService.getLine();

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
                type: new UntypedFormControl(
                    {
                        name: "Just Spotting",
                        value: "JUST_SPOTTING",
                    },
                    [Validators.required]
                ),
                originStation: new UntypedFormControl("", []),
                destinationStation: new UntypedFormControl("", []),
                notes: new UntypedFormControl("", []),
                isAnonymous: new UntypedFormControl(false, []),
                sanityTest: new UntypedFormControl(false, []),
                location: new UntypedFormControl(false, []),
            },
            {
                validators: [
                    betweenStationTypeOriginDestinationStationValidator,
                    abnormalStatusSanityTestValidator,
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
        if (["DECOMMISSIONED", "MARRIED", "UNKNOWN"].includes(event.status)) {
            this.showVehicleWarning = true;
        } else {
            this.showVehicleWarning = false;
        }
    }

    onInputTypeChanges() {
        if (this.formGroup.value.type.value === "BETWEEN_STATIONS") {
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

                    this.stationOptions =
                        lineQueryResultToStationCascaderOptions(data);
                });
        } else if (this.formGroup.value.type.value === "LOCATION") {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    if (!this.showedLocationPopout) {
                        this.toastService.addToast({
                            severity: "info",
                            summary: "Location accessed",
                            content:
                                "Take note that we will not know your location until you submit the form.",
                        });
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
                    this.toastService.addToast({
                        severity: "error",
                        summary: "Location access failed",
                        content: positionError.message,
                    });
                },
                { maximumAge: 0, timeout: Infinity, enableHighAccuracy: true }
            );
            return;
        }
        this.showedLocationPopout = false;
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

        this.formGroup.patchValue({
            vehicle: "",
            originStation: "",
            destinationStation: "",
        });

        return;
    }

    onSubmit(): Promise<MutationResult<any> | undefined> {
        console.log(this.formGroup);
        this.submitButtonClicked = true;

        if (this.formGroup.invalid) {
            return Promise.resolve(undefined);
        }

        const formValues = { ...this.formGroup.value };

        // Form Distillation
        if (formValues.type.value !== "BETWEEN_STATIONS") {
            formValues["originStation"] = undefined;
            formValues["destinationStation"] = undefined;
        } else {
            formValues["originStation"] = formValues["originStation"].value;
            formValues["destinationStation"] =
                formValues["destinationStation"].value;
        }
        if (formValues.type.value !== "LOCATION") {
            formValues["location"] = undefined;
        }

        const date: Date = formValues["spottingDate"];
        date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
        formValues["spottingDate"] = formValues["spottingDate"]
            .toISOString()
            .slice(0, 10);

        formValues["vehicle"] = formValues["vehicle"].value;
        formValues["status"] = formValues["status"].value;
        formValues["type"] = formValues["type"].value;

        this.spottingStorageService.setLine(formValues["line"]);

        // Removing fields not required by GQL
        formValues["line"] = undefined;
        formValues["sanityTest"] = undefined;

        // TODO: If captchaResponse and/or firebaseAuthKey cannot be determined, show an error message
        return Promise.all([
            firstValueFrom(this.recaptchaV3Service.execute("spottingEntry")),
            this.authService.getIdToken(),
        ]).then(([captchaResponse, firebaseAuthKey]) => {
            const mutationObservable = this.apollo.mutate({
                mutation: ADD_ENTRY,
                variables: {
                    data: formValues,
                },
                context: {
                    headers: {
                        "g-recaptcha-response": captchaResponse,
                        "firebase-auth-key": firebaseAuthKey,
                    },
                },
            });

            this.submitting = lastValueFrom(mutationObservable);

            return this.submitting;
        });
    }
}
