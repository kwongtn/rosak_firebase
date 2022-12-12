import { Apollo, gql, MutationResult } from "apollo-angular";
import { DialogService } from "ng-devui";
import { NzTabChangeEvent } from "ng-zorro-antd/tabs/interfaces";
import { firstValueFrom, Subscription } from "rxjs";
import {
    GetLinesAndVehiclesResponse,
    GetLinesResponse,
} from "src/app/models/query/get-vehicles";
import { TableDataType } from "src/app/models/spotting-table/source-type";

import { Component, OnDestroy, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";

import { ToastService } from "../../services/toast/toast.service";
import {
    SpottingFormComponent,
} from "../spotting-form/spotting-form.component";
import { lineQueryResultToTabEntries, LineTabType } from "../utils";

const GET_LINES = gql`
    query GetLinesAndVehicles {
        lines {
            id
            code
            displayName
        }
    }
`;

@Component({
    selector: "app-spotting-main",
    templateUrl: "./spotting-main.component.html",
    styleUrls: ["./spotting-main.component.scss"],
})
export class SpottingMainComponent implements OnInit, OnDestroy {
    tableData: TableDataType[] = [];
    showLoading: boolean = true;

    tabActiveId: string | number | undefined = undefined;
    selectedTabIndex: number  | undefined =  undefined;
    tabItems: LineTabType[] = [];

    currentDataId: string | undefined;
    vehicleAndLineData: GetLinesAndVehiclesResponse | undefined = undefined;

    private querySubscription!: Subscription;
    private routeSubscription!: Subscription;

    constructor(
        private dialogService: DialogService,
        private toastService: ToastService,
        private apollo: Apollo,
        private router: Router,
        private route: ActivatedRoute
    ) {}

    openStandardDialog(dialogtype?: string) {
        const results = this.dialogService.open({
            id: "dialog-service",
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
                            results.modalContentInstance.onSubmit() as Promise<
                                MutationResult<any> | undefined
                            >;

                        submitAction
                            ?.then((mutationResult) => {
                                if (!mutationResult) {
                                    this.toastService.addToast({
                                        severity: "error",
                                        summary: "Error",
                                        content: "Form is invalid.",
                                    });

                                    return;
                                }

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
                                console.log(reason);
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
        this.routeSubscription = this.route.params.subscribe((params: any) => {
            this.currentDataId = params["id"];
        });

        this.apollo
            .query<GetLinesResponse>({
                query: GET_LINES,
            })
            .subscribe(({ data, loading }) => {
                this.showLoading = loading;

                this.tabItems = lineQueryResultToTabEntries(data);

                if (!this.currentDataId) {
                    this.tabActiveId = data.lines[0].id;
                    firstValueFrom(this.route.url).then((value) => {
                        this.router.navigate([value[0].path, data.lines[0].id]);
                    });
                } else {
                    this.tabActiveId = this.currentDataId;
                }
            });
    }

    ngOnDestroy() {
        // this.querySubscription.unsubscribe();
        this.routeSubscription.unsubscribe();
    }

    activeTabChange(event: NzTabChangeEvent) {
        console.log("Active tab change: ", event);
        console.log(this.tabItems);

        if(event.index){
            this.router.navigate(["spotting", this.tabItems[event.index].id]);
    
            this.selectedTabIndex = event.index;
            // this.filterTabItems();

        }

    }
}
