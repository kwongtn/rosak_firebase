import { Apollo, gql, MutationResult } from "apollo-angular";
import { DialogService } from "ng-devui";
import { Subscription } from "rxjs";
import { GetVehiclesReponse } from "src/app/models/query/get-vehicles";
import { SourceType } from "src/app/models/spotting-table/source-type";

import { Component, OnDestroy, OnInit } from "@angular/core";

import { ToastService } from "../../services/toast/toast.service";
import { SpottingFormComponent } from "../spotting-form/spotting-form.component";

const GET_VEHICLES = gql`
    query {
        vehicleTypes {
            id
            internalName
            displayName
            vehicles {
                id
                identificationNo
                status
                lastSpottings(count: 1) {
                    spottingDate
                }
                inServiceSince
                spottingCount
                notes
            }
        }
    }
`;

interface TableDataType {
    displayName: string;
    tableData: SourceType[];
}

@Component({
    selector: "app-spotting-main",
    templateUrl: "./spotting-main.component.html",
    styleUrls: ["./spotting-main.component.scss"],
})
export class SpottingMainComponent implements OnInit, OnDestroy {
    tableData: TableDataType[] = [];
    sampleData: SourceType[] = [];
    showLoading: boolean = true;

    private querySubscription!: Subscription;

    constructor(
        private dialogService: DialogService,
        private toastService: ToastService,
        private apollo: Apollo
    ) {}

    openStandardDialog(dialogtype?: string) {
        const results = this.dialogService.open({
            id: "dialog-service",
            width: "600px",
            maxHeight: "600px",
            title: "Add spotting entry",
            content: SpottingFormComponent,
            backdropCloseable: true,
            dialogtype: dialogtype,
            onClose: () => {
                return;
            },
            buttons: [
                {
                    cssClass: "primary",
                    text: "Submit",
                    handler: () => {
                        const submitAction =
                            results.modalContentInstance.onSubmit() as
                                | Promise<MutationResult<any>>
                                | undefined;

                        submitAction
                            ?.then((mutationResult) => {
                                if (mutationResult.data?.addEvent.id) {
                                    console.log("Mutation successful");
                                    results.modalInstance.hide();
                                }

                                this.toastService.addToast({
                                    severity: "success",
                                    summary: "Success",
                                    content:
                                        "Your spotting entry is successfully added! 🥳",
                                });
                            })
                            .catch((reason) => {
                                this.toastService.addToast({
                                    severity: "error",
                                    summary: "Error",
                                    content: reason.message,
                                });
                            });
                    },
                },
                {
                    id: "btn-cancel",
                    cssClass: "common",
                    text: "Cancel",
                    handler: () => {
                        results.modalInstance.hide();
                    },
                },
            ],
            data: {},
        });
        console.log(
            "results.modalContentInstance: ",
            results.modalContentInstance
        );
    }

    ngOnInit(): void {
        this.querySubscription = this.apollo
            .watchQuery<any>({
                query: GET_VEHICLES,
            })
            .valueChanges.subscribe(
                ({
                    data,
                    loading,
                }: {
                    data: GetVehiclesReponse;
                    loading: boolean;
                }) => {
                    this.showLoading = loading;

                    const sectionData: TableDataType[] = [];
                    for (const vehicleType of data.vehicleTypes) {
                        sectionData.push({
                            displayName: vehicleType.displayName,
                            tableData: vehicleType.vehicles.map((value) => {
                                return {
                                    identificationNo: value.identificationNo,
                                    status: value.status,
                                    lastSpotted:
                                        value.lastSpottings[0]?.spottingDate,
                                    timesSpotted: value.spottingCount,
                                    notes: value.notes,
                                };
                            }),
                        });
                    }

                    console.log("sectionData: ", sectionData);

                    this.tableData = sectionData;
                    this.sampleData = this.tableData[0].tableData;
                }
            );
    }

    ngOnDestroy() {
        this.querySubscription.unsubscribe();
    }
}
