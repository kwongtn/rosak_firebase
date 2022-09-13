import { Apollo, gql, MutationResult } from "apollo-angular";
import { CascaderItem } from "ng-devui";
import { DFormControlStatus, FormLayout } from "ng-devui/form";
import { LoadingType } from "ng-devui/loading";
import { AppendToBodyDirection } from "ng-devui/utils";
import { ReCaptchaV3Service } from "ng-recaptcha";
import { firstValueFrom, lastValueFrom, Subscription } from "rxjs";
import { AuthService } from "src/app/services/auth/auth.service";
import {
    SpottingStorageService,
} from "src/app/services/spotting/storage.service";

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
import {
    betweenStationTypeOriginDestinationStationValidator,
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
    submitting: LoadingType = undefined;

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
            disabled: true,
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

    // TODO: Check that origin and destination options are not the same
    stationOptions: CascaderItem[] = [];
    vehicleOptions: CascaderItem[] = [];
    lineOptions: { name: any; value: any; disabled?: boolean }[] = [];

    loading: { [key: string]: boolean } = {
        originStation: true,
        destinationStation: true,
        vehicle: true,
        line: true,
    };

    getStatus(fieldName: string): DFormControlStatus | null {
        if (this.loading[fieldName]) {
            return "pending";
        } else if (this.formGroup.controls[fieldName].valid) {
            if (
                this.formGroup.errors &&
                Object.keys(this.formGroup.errors).includes(fieldName)
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

    private mainQuerySubscription!: Subscription;
    private stationQuerySubscription!: Subscription;

    constructor(
        private fb: UntypedFormBuilder,
        private apollo: Apollo,
        private getLinesVehiclesGql: GetLinesAndVehiclesGqlService,
        private getStationLinesGql: GetStationLinesGqlService,
        public authService: AuthService,
        private recaptchaV3Service: ReCaptchaV3Service,
        private spottingStorageService: SpottingStorageService
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
            },
            {
                validators: [
                    betweenStationTypeOriginDestinationStationValidator,
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

    onChanges(event: any): void {
        console.log("On changes: ", event);
        return;
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
                return;
            }

            this.stationQuerySubscription = this.getStationLinesGql
                .watch({
                    stationLineFilter: {
                        lineId: this.formGroup.value.line.value,
                    },
                })
                .valueChanges.subscribe(({ data, loading }) => {
                    console.log("Query loading: ", loading);
                    console.log("Query data: ", data);

                    this.queryResult = data;

                    this.loading["originStation"] = loading;
                    this.loading["destinationStation"] = loading;

                    // TODO: Change to searchable type
                    this.stationOptions =
                        lineQueryResultToStationCascaderOptions(data);
                });
        }
    }

    onLineChanges(event: Event): void {
        console.log(event);

        this.vehicleOptions = lineQueryResultToVehicleCascaderOptions(
            this.queryResult,
            (event as any).value
        );

        this.stationOptions = [];

        this.loading["originStation"] = true;
        this.loading["destinationStation"] = true;

        this.onInputTypeChanges();

        this.formGroup.patchValue({
            vehicle: "",
            originStation: "",
            destinationStation: "",
        });

        return;
    }

    async onSubmit(): Promise<MutationResult<any> | undefined> {
        console.log(this.formGroup);
        this.submitButtonClicked = true;

        if (this.formGroup.invalid) {
            return;
        }

        const formValues = { ...this.formGroup.value };

        // Form Distillation
        if (formValues.type.value !== "BETWEEN_STATIONS") {
            formValues["originStation"] = undefined;
            formValues["destinationStation"] = undefined;
        } else {
            formValues["originStation"] = formValues["originStation"][0];
            formValues["destinationStation"] =
                formValues["destinationStation"][0];
        }

        const date: Date = formValues["spottingDate"];
        date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
        formValues["spottingDate"] = formValues["spottingDate"]
            .toISOString()
            .slice(0, 10);

        formValues["vehicle"] = formValues["vehicle"].slice(-1)[0];
        formValues["status"] = formValues["status"]["value"];
        formValues["type"] = formValues["type"]["value"];

        this.spottingStorageService.setLine(formValues["line"]);

        // Removing line option here as it is not required by GQL
        formValues["line"] = undefined;

        const mutationObservable = this.apollo.mutate({
            mutation: ADD_ENTRY,
            variables: {
                data: formValues,
            },
            context: {
                headers: {
                    "g-recaptcha-response": await firstValueFrom(
                        this.recaptchaV3Service.execute("spottingEntry")
                    ),
                    "firebase-auth-key": await this.authService.userData
                        .getValue()
                        ?.getIdToken(),
                },
            },
        });

        this.submitting = lastValueFrom(mutationObservable);

        return this.submitting;
    }
}
