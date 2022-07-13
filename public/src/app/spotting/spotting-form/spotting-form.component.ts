import { Apollo, gql } from "apollo-angular";
import { CascaderItem } from "ng-devui";
import { DFormControlStatus, FormLayout } from "ng-devui/form";
import { AppendToBodyDirection } from "ng-devui/utils";
import { Subscription } from "rxjs";

import { Component, OnDestroy, OnInit } from "@angular/core";
import {
    FormBuilder,
    FormControl,
    FormGroup,
    Validators,
} from "@angular/forms";

const GET_LINES = gql`
    query GetLinesAndVehicles {
        lines {
            id
            code
            displayName
            stationLine {
                id
                displayName
                internalRepresentation
            }
            vehicleTypes {
                id
                internalName
                displayName
                vehicles {
                    id
                    identificationNo
                    status
                }
            }
        }
    }
`;

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

    vehicleOptions: CascaderItem[] = [];

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
    ];

    // TODO: Check that origin and destination options are not the same
    stationOptions: CascaderItem[] = [];

    loading: { [key: string]: boolean } = {
        originStation: true,
        destinationStation: true,
        vehicle: true,
    };

    getStatus(fieldName: string): DFormControlStatus | null {
        if (this.loading[fieldName]) {
            return "pending";
        } else if (this.formGroup.controls[fieldName].valid) {
            return "success";
        } else if (
            !this.submitButtonClicked &&
            this.formGroup.controls[fieldName].pristine
        ) {
            return null;
        } else {
            return "error";
        }
    }

    /**
     * Form stuff
     */
    formGroup: FormGroup;
    selectedDate1 = new Date();

    private querySubscription!: Subscription;

    constructor(private fb: FormBuilder, private apollo: Apollo) {
        this.formGroup = this.fb.group({
            vehicle: new FormControl("", [Validators.required]),
            spottingDate: new FormControl(new Date(), [Validators.required]),
            status: new FormControl(
                {
                    name: "In Service",
                    value: "IN_SERVICE",
                },
                [Validators.required]
            ),
            type: new FormControl(
                {
                    name: "Between Stations",
                    value: "BETWEEN_STATIONS",
                },
                [Validators.required]
            ),
            originStation: new FormControl("", [Validators.required]),
            destinationStation: new FormControl("", [Validators.required]),
            notes: new FormControl("", []),
        });
    }

    ngOnInit(): void {
        this.querySubscription = this.apollo
            .watchQuery<any>({
                query: GET_LINES,
            })
            .valueChanges.subscribe(({ data, loading }) => {
                console.log("Query loading: ", loading);
                console.log("Query data: ", data);
                const stationOptions: CascaderItem[] = [];
                for (const line of data.lines) {
                    const lineObj: CascaderItem = {
                        label: `${line.code} - ${line.displayName}`,
                        value: line.id,
                        isLeaf: false,
                        disabled: false,
                        children: [],
                    };
                    for (const stationLine of line.stationLine) {
                        lineObj.children?.push({
                            label: `${stationLine.internalRepresentation} - ${stationLine.displayName}`,
                            value: stationLine.id,
                            isLeaf: true,
                            disabled: false,
                        });
                    }
                    stationOptions.push(lineObj);
                }
                this.loading["originStation"] = loading;
                this.loading["destinationStation"] = loading;
                this.stationOptions = stationOptions;

                const vehicleOptions: CascaderItem[] = [];
                for (const line of data.lines) {
                    const lineObj: CascaderItem = {
                        label: `${line.code} - ${line.displayName}`,
                        value: line.id,
                        isLeaf: false,
                        disabled: false,
                        children: [],
                    };
                    for (const vehicleType of line.vehicleTypes) {
                        const vehicles: CascaderItem[] = [];

                        for (const vehicle of vehicleType.vehicles) {
                            vehicles.push({
                                label: `${vehicle.identificationNo} @ ${line.code}`,
                                value: vehicle.id,
                                isLeaf: true,
                                disabled: false,
                            });
                        }

                        lineObj.children?.push({
                            label: `${vehicleType.internalName}`,
                            value: vehicleType.id,
                            isLeaf: false,
                            disabled: false,
                            children: vehicles,
                        });
                    }
                    vehicleOptions.push(lineObj);
                }
                this.loading["vehicle"] = loading;
                this.vehicleOptions = vehicleOptions;
            });
    }

    ngOnDestroy() {
        this.querySubscription.unsubscribe();
    }

    onChanges(event: Event): void {
        console.log(event);
        return;
    }

    onSubmit(): void {
        console.log(this.formGroup);
        this.submitButtonClicked = true;

        const formValues = this.formGroup.value;

        // Form Distillation
        if (formValues.type.value !== "BETWEEN_STATIONS") {
            formValues["originStation"] = null;
            formValues["destinationStation"] = null;
        }

        console.log(formValues);

        return;
    }
}
