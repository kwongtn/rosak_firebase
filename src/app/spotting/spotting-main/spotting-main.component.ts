import { Apollo, gql, MutationResult } from "apollo-angular";
import { DialogService } from "ng-devui";
import { firstValueFrom, Subscription } from "rxjs";
import {
    GetLinesAndVehiclesResponse,
    VehicleStatusCountType,
} from "src/app/models/query/get-vehicles";
import { SourceType } from "src/app/models/spotting-table/source-type";

import { HttpParams } from "@angular/common/http";
import { Component, OnDestroy, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";

import { ToastService } from "../../services/toast/toast.service";
import {
    SpottingFormComponent,
} from "../spotting-form/spotting-form.component";
import { lineQueryResultToTabEntries, LineTabType } from "../utils";

const GET_VEHICLES = gql`
    query GetLinesAndVehicles {
        lines {
            id
            code
            displayName
            vehicleTypes {
                id
                internalName
                displayName
                vehicleStatusDecommissionedCount
                vehicleStatusInServiceCount
                vehicleStatusNotSpottedCount
                vehicleStatusTestingCount
                vehicleStatusUnknownCount
                vehicleTotalCount
                vehicles {
                    id
                    identificationNo
                    status
                    lastSpottingDate
                    inServiceSince
                    spottingCount
                    notes
                }
            }
        }
    }
`;

interface TableDataType {
    displayName: string;
    vehicleStatusCount: VehicleStatusCountType;
    tableData: SourceType[];
}

@Component({
    selector: "app-spotting-main",
    templateUrl: "./spotting-main.component.html",
    styleUrls: ["./spotting-main.component.scss"],
})
export class SpottingMainComponent implements OnInit, OnDestroy {
    tableData: TableDataType[] = [];
    showLoading: boolean = true;

    tabActiveId: string | number = 1;
    tabItems: LineTabType[] = [];

    /**
     * TODO: Make such that the tables will load only after clicking on tab
     *
     * Steps:
     * 1. Only load lines
     * 2. Load vehicles of a line
     * 3. On change tab, load more vehicles of those lines
     */
    currentDataId: string | undefined;
    vehicleAndLineData: GetLinesAndVehiclesResponse | undefined = undefined;

    private querySubscription!: Subscription;
    private routeSubscription!: Subscription;

    constructor(
        private dialogService: DialogService,
        private toastService: ToastService,
        private apollo: Apollo,
        private router: Router,
        private route: ActivatedRoute,
    ) {}

    openStandardDialog(dialogtype?: string) {
        const results = this.dialogService.open({
            id: "dialog-service",
            width: "600px",
            maxHeight: "600px",
            title: "Add spotting entry",
            content: SpottingFormComponent,
            backdropCloseable: true,
            draggable: false,
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
                                if (mutationResult.data?.addEvent.ok) {
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

    filterTabItems(): void {
        const data = this.vehicleAndLineData;

        if (!data) {
            return;
        }

        for (const line of data.lines) {
            if (line.id != this.tabActiveId) {
                continue;
            }

            const sectionData: TableDataType[] = [];
            for (const vehicleType of line.vehicleTypes) {
                sectionData.push({
                    displayName: vehicleType.displayName,
                    vehicleStatusCount: {
                        vehicleStatusDecommissionedCount:
                            vehicleType.vehicleStatusDecommissionedCount,
                        vehicleStatusInServiceCount:
                            vehicleType.vehicleStatusInServiceCount,
                        vehicleStatusNotSpottedCount:
                            vehicleType.vehicleStatusNotSpottedCount,
                        vehicleStatusTestingCount:
                            vehicleType.vehicleStatusTestingCount,
                        vehicleStatusUnknownCount:
                            vehicleType.vehicleStatusUnknownCount,
                        vehicleTotalCount: vehicleType.vehicleTotalCount,
                    },
                    tableData: vehicleType.vehicles.map((value) => {
                        return {
                            identificationNo: value.identificationNo,
                            status: value.status,
                            lastSpotted: value.lastSpottingDate,
                            timesSpotted: value.spottingCount,
                            notes: value.notes,
                        };
                    }),
                });
            }

            console.log("sectionData: ", sectionData);

            this.tableData = sectionData;
        }
    }

    ngOnInit(): void {
        this.routeSubscription = this.route.params.subscribe((params: any) => {
            this.currentDataId = params["id"];
        });

        this.querySubscription = this.apollo
            .watchQuery<any>({
                query: GET_VEHICLES,
            })
            .valueChanges.subscribe(
                ({
                    data,
                    loading,
                }: {
                    data: GetLinesAndVehiclesResponse;
                    loading: boolean;
                }) => {
                    this.showLoading = loading;
                    this.vehicleAndLineData = data;

                    this.tabItems = lineQueryResultToTabEntries(data);

                    if (!this.currentDataId) {
                        this.tabActiveId = data.lines[0].id;
                        firstValueFrom(this.route.url).then((value) => {
                            this.router.navigate([
                                value[0].path,
                                data.lines[0].id,
                            ]);
                        });
                    } else {
                        this.tabActiveId = this.currentDataId;
                    }

                    this.filterTabItems();
                }
            );
    }

    ngOnDestroy() {
        this.querySubscription.unsubscribe();
        this.routeSubscription.unsubscribe();
    }

    activeTabChange(event: any) {
        console.log("Active tab change: ", event);

        const params = new HttpParams();
        params.append("line", event);

        this.router.navigate(["spotting", event]);

        this.tabActiveId = event;
        this.filterTabItems();
    }
}
