import { Apollo, gql, MutationResult } from "apollo-angular";
import { DialogService } from "ng-devui";
import { firstValueFrom, Subscription } from "rxjs";
import {
    GetLinesAndVehiclesResponse,
    GetLinesResponse,
} from "src/app/models/query/get-vehicles";
import { TableDataType } from "src/app/models/spotting-table/source-type";
import {
    ImageUploadService,
} from "src/app/services/spotting/image-upload.service";

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
    tabActiveTitle: string = "";
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
        private route: ActivatedRoute,
        private imageUploadService: ImageUploadService
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
                            results.modalContentInstance.onSubmit() as
                                | Promise<{
                                      spottingSubmission: Promise<
                                          MutationResult<any> | undefined
                                      >;
                                      uploads: File[];
                                  }>
                                | undefined;

                        submitAction
                            ?.then(async ({ spottingSubmission, uploads }) => {
                                const mutationResult = await spottingSubmission;

                                if (!mutationResult) {
                                    this.toastService.addToast(
                                        "Error",
                                        "Form is invalid.",
                                        "error"
                                    );
                                    return;
                                }

                                if (mutationResult.data?.addEvent.id) {
                                    console.log(
                                        `Mutation successful, adding ${uploads.length} file to upload queue.`
                                    );
                                    uploads.forEach((file) => {
                                        this.imageUploadService.addToQueue(
                                            mutationResult.data?.addEvent.id,
                                            file
                                        );
                                    });

                                    results.modalInstance.hide();
                                }

                                this.toastService.addMessage(
                                    "Success! Your spotting entry is successfully added! 🥳",
                                    "success"
                                );

                                if (uploads.length > 0) {
                                    this.toastService.addMessage(
                                        "Image uploading, please do not close tab until further notice.",
                                        "info",
                                        {
                                            nzDuration: 10000,
                                        }
                                    );
                                }
                            })
                            .catch((reason) => {
                                console.log(reason);

                                this.toastService.addToast(
                                    "Error",
                                    reason.message,
                                    "error"
                                );
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

                this.setActiveTitle();
            });
    }

    ngOnDestroy() {
        // this.querySubscription.unsubscribe();
        this.routeSubscription.unsubscribe();
    }

    activeTabChange(event: any) {
        console.log("Active tab change: ", event);

        this.router.navigate(["spotting", event]);

        this.tabActiveId = event;
        // this.filterTabItems();
        this.setActiveTitle();
    }

    setActiveTitle() {
        this.tabActiveTitle =
            this.tabItems.find((val) => {
                return val.id === this.tabActiveId;
            })?.detail ?? "";
    }
}
